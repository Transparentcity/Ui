#!/usr/bin/env node
/**
 * LLM judge: rendered headlines that don't make sense.
 *
 * The platform's voice/relevance judges run against the story CSV (source
 * data). This judges what is actually RENDERED on the public site — which
 * can differ (truncation, template assembly, a prefix/suffix added by the
 * card component) and which includes headlines the CSV doesn't export.
 *
 * Collects every headline (h1-h4 + story card titles) from the public
 * pages, dedupes, and asks Claude to flag only CLEAR problems:
 *   - grammatically broken / sentence fragments that read as errors
 *   - truncated mid-word or mid-number
 *   - placeholder / leaked template text ("undefined", "{{city}}", "Lorem")
 *   - internally contradictory or impossible data ("up 0%", "increased by
 *     -5%", "fell to 12 from 12")
 *   - nonsense / word salad
 * Marketing section headers ("See Cincinnati clearly, every week.") and
 * normal data headlines are NOT flagged.
 *
 * Needs an API key: QA_ANTHROPIC_API_KEY or ANTHROPIC_API_KEY. Skips
 * cleanly (exit 0) if neither is set, so it never blocks a sweep.
 *
 * Usage:
 *   node scripts/qa/headline-sense.mjs
 *   node scripts/qa/headline-sense.mjs --paths /get/cincinnati,/get/detroit
 *
 * Exits 1 if the judge flags any headline, 0 otherwise.
 */
import { chromium } from "playwright";

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    if (!key?.startsWith("--")) continue;
    out[key.slice(2)] = argv[i + 1];
    i += 1;
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));
const SITE = args.site ?? "https://transparent.city";
const MODEL = args.model ?? "claude-sonnet-4-6";
const LAUNCHED = [
  "san-francisco", "oakland", "cincinnati", "chicago", "detroit",
  "austin", "new-york-city", "seattle", "denver",
];
const DEFAULT_PATHS = LAUNCHED.map((s) => `/get/${s}`);
const PATHS = args.paths ? args.paths.split(",").map((s) => s.trim()).filter(Boolean) : DEFAULT_PATHS;

const DRY_RUN = "dry-run" in args;
const API_KEY = process.env.QA_ANTHROPIC_API_KEY ?? process.env.ANTHROPIC_API_KEY;
if (!API_KEY && !DRY_RUN) {
  console.log("SKIP headline-sense — no QA_ANTHROPIC_API_KEY / ANTHROPIC_API_KEY set");
  process.exit(0);
}

// --- collect rendered headlines ---
const browser = await chromium.launch({ headless: true });
const seen = new Map(); // headline -> Set(paths)
try {
  for (const path of PATHS) {
    const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
    try {
      await page.goto(`${SITE}${path}`, { waitUntil: "domcontentloaded", timeout: 35000 });
      await page.waitForTimeout(3000);
      const heads = await page.locator("h1,h2,h3,h4,[data-story-headline]").allInnerTexts();
      for (const raw of heads) {
        const h = raw.replace(/\s+/g, " ").trim();
        if (h.length < 6 || h.length > 200) continue;
        if (!seen.has(h)) seen.set(h, new Set());
        seen.get(h).add(path);
      }
    } catch (e) {
      console.error(`  (could not load ${path}: ${e.message})`);
    } finally {
      await page.context().close();
    }
  }
} finally {
  await browser.close();
}

const headlines = [...seen.keys()];
console.log(`Collected ${headlines.length} distinct headlines across ${PATHS.length} pages\n`);
if (headlines.length === 0) {
  console.log("OK   HS-no-headlines — nothing to judge");
  process.exit(0);
}

if (DRY_RUN) {
  console.log("--- dry run: headlines that would be judged ---");
  headlines.forEach((h, i) => console.log(`${i + 1}. ${JSON.stringify(h)}`));
  console.log(`\n(no model call; set QA_ANTHROPIC_API_KEY and drop --dry-run to judge)`);
  process.exit(0);
}

// --- judge ---
const { createAnthropic } = await import("@ai-sdk/anthropic");
const { generateObject } = await import("ai");
const { z } = await import("zod");

const anthropic = createAnthropic({ apiKey: API_KEY });

const schema = z.object({
  flagged: z
    .array(
      z.object({
        headline: z.string().describe("the exact headline text, copied verbatim"),
        problem: z
          .enum(["broken_grammar", "truncated", "placeholder", "contradictory_data", "nonsense"])
          .describe("the single best-fitting problem category"),
        why: z.string().describe("one concise sentence explaining the problem"),
      }),
    )
    .describe("only headlines with a CLEAR problem; empty array if all are fine"),
});

const system = [
  "You are a QA reviewer for a civic-data newsletter product.",
  "You are given a list of headlines rendered on the live website.",
  "Flag ONLY headlines with a clear, objective problem a reader would notice:",
  "- broken_grammar: reads as a grammatical error or a broken sentence fragment (not just terse).",
  "- truncated: cut off mid-word or mid-number, or ends abruptly like it lost its tail.",
  "- placeholder: leaked template/placeholder text (undefined, null, NaN, {{...}}, Lorem ipsum, [object Object], a bare variable name).",
  "- contradictory_data: states something impossible or self-contradictory (e.g. 'up 0%', 'increased by -5%', 'fell to 12 from 12', 'down 100% to 4,500').",
  "- nonsense: word salad, or words that don't form a coherent claim.",
  "Do NOT flag: marketing section headers, terse-but-valid headlines, stylistic choices, capitalization, or anything you merely dislike.",
  "Be conservative. When in doubt, do not flag. A normal data headline like 'Noise Complaints (311) up 217% year-to-date' is FINE.",
].join("\n");

const prompt =
  "Headlines (one per line):\n" +
  headlines.map((h, i) => `${i + 1}. ${h}`).join("\n");

let result;
try {
  result = await generateObject({
    model: anthropic(MODEL),
    schema,
    system,
    prompt,
    maxRetries: 2,
  });
} catch (e) {
  console.error(`ERROR headline-sense — model call failed: ${e.message}`);
  process.exit(2);
}

const flagged = result.object.flagged ?? [];
if (flagged.length === 0) {
  console.log(`OK   HS-headlines-sane — judged ${headlines.length} headlines, none flagged`);
  process.exit(0);
}

for (const f of flagged) {
  const where = seen.get(f.headline) ? [...seen.get(f.headline)].join(",") : "?";
  console.log(`FAIL HS-${f.problem}[${where}] — ${JSON.stringify(f.headline)} :: ${f.why}`);
}
console.error(`\n${flagged.length} findings`);
process.exit(1);

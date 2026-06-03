#!/usr/bin/env node
/**
 * Web-search fact-check pass for the weekly QA.
 *
 * Reads the fact-check queue produced by index.mjs (3 healthy metrics per city),
 * and for each candidate asks Claude — with its built-in web_search server tool —
 * whether the dashboard's current-year YTD value is plausible given recent public
 * reporting. Claude runs the searches autonomously; we capture a structured verdict.
 *
 * Verdicts are written back into factcheck-queue.json and patched into the HTML
 * report (report-latest.html + the dated archive copy) between the FACTCHECK
 * markers that index.mjs emits.
 *
 * Auth: reads ANTHROPIC_API_KEY from the environment (the repo secret of the same
 * name). If it's absent, the script logs a notice and exits 0, leaving verdicts
 * "pending" — a missing key must not fail the weekly run.
 *
 * Run order in CI: `node index.mjs` first (audit + queue + report), then this.
 */

import { readFileSync, writeFileSync, existsSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import {
  buildFactCheckSection,
  FACTCHECK_MARKER_START,
  FACTCHECK_MARKER_END,
} from "./index.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FACTCHECK_FILE = join(__dirname, "factcheck-queue.json");
const REPORT_FILE    = join(__dirname, "report-latest.html");
const REPORTS_DIR    = join(__dirname, "reports");

const API_URL  = "https://api.anthropic.com/v1/messages";
const MODEL     = "claude-opus-4-8";
const API_KEY   = process.env.ANTHROPIC_API_KEY;

// Cap concurrent API calls (each fans out into several web searches server-side).
const CONCURRENCY      = 3;
// Cap server-tool continuation rounds per candidate (pause_turn loop).
const MAX_PAUSE_ROUNDS = 6;

const SYSTEM_PROMPT = `You are a data-quality fact-checker for the Transparent City civic dashboards.
You will be given one city metric with its current year-to-date (YTD) value and date window.
Your job: use web search to find recent, credible public reporting (city open-data portals,
local news, official agency statements) and judge whether the dashboard's current-year YTD
value is PLAUSIBLE for that city and metric over that window. You are sanity-checking order of
magnitude and direction, not demanding an exact match — public sources rarely report the same
YTD window. Prefer official/government and established local-news sources.

Return your answer as a SINGLE JSON object on the final line, with no surrounding prose or code
fences, exactly in this shape:
{"verdict":"consistent"|"discrepancy"|"inconclusive","notes":"<=200 chars, one sentence","sources":["url",...]}

- "consistent": the value is plausible / corroborated by what you found.
- "discrepancy": the value clearly conflicts with credible reporting (wrong order of magnitude,
  opposite direction, implausible for the city).
- "inconclusive": you could not find enough to judge.
Include 1-3 source URLs you actually relied on. Keep notes to one sentence.`;

// ---------------------------------------------------------------------------
// Anthropic Messages API (raw HTTP — Node 22 global fetch, no SDK dependency)
// ---------------------------------------------------------------------------

async function callClaude(body, attempt = 0) {
  const res = await fetch(API_URL, {
    method: "POST",
    headers: {
      "x-api-key": API_KEY,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (res.status === 429 || res.status >= 500) {
    if (attempt >= 4) throw new Error(`Claude API ${res.status} after ${attempt} retries`);
    const wait = (Number(res.headers.get("retry-after")) || 2 ** attempt) * 1000;
    await new Promise((r) => setTimeout(r, wait));
    return callClaude(body, attempt + 1);
  }
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Claude API ${res.status}: ${text.slice(0, 300)}`);
  }
  return res.json();
}

// Run the web-search-enabled request, following pause_turn until the model
// produces its final answer. Returns the concatenated final-message text.
async function factCheckOne(candidate) {
  const prompt =
    `City: ${candidate.city}\n` +
    `Metric: ${candidate.metricName}\n` +
    `Current-year YTD value: ${candidate.currentValue}\n` +
    `Window: ${candidate.currentWindow}\n` +
    `Prior-year YTD value (context): ${candidate.priorValue}\n` +
    `Dashboard card: ${candidate.cardUrl}\n\n` +
    `Search the web and judge whether the current-year YTD value is plausible. ` +
    `Respond with the JSON object described in the system prompt.`;

  const messages = [{ role: "user", content: prompt }];

  for (let round = 0; round <= MAX_PAUSE_ROUNDS; round++) {
    const resp = await callClaude({
      model: MODEL,
      max_tokens: 2048,
      thinking: { type: "adaptive" },
      output_config: { effort: "medium" },
      // Stable system prompt first, with a cache breakpoint so the 27 per-week
      // calls can share the cached prefix (no effect below the model's minimum).
      system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
      tools: [{ type: "web_search_20260209", name: "web_search", max_uses: 4 }],
      messages,
    });

    if (resp.stop_reason === "pause_turn") {
      // Server tool hit its per-turn iteration limit; append and resume.
      messages.push({ role: "assistant", content: resp.content });
      continue;
    }

    const text = (resp.content || [])
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .trim();
    return text;
  }
  throw new Error("Exceeded max pause_turn rounds without a final answer");
}

// Pull the JSON verdict out of the model's final text (tolerant of stray prose).
function parseVerdict(text) {
  const cleaned = text.replace(/```json\s*|\s*```/g, "");
  const tryParse = (s) => {
    try { return JSON.parse(s); } catch { return null; }
  };
  let obj = tryParse(cleaned.trim());
  if (!obj) {
    const start = cleaned.indexOf("{");
    const end   = cleaned.lastIndexOf("}");
    if (start >= 0 && end > start) obj = tryParse(cleaned.slice(start, end + 1));
  }
  if (!obj || typeof obj !== "object") {
    return { verdict: "inconclusive", notes: "Could not parse model output", sources: [] };
  }
  const verdict = ["consistent", "discrepancy", "inconclusive"].includes(obj.verdict)
    ? obj.verdict
    : "inconclusive";
  return {
    verdict,
    notes: typeof obj.notes === "string" ? obj.notes.slice(0, 240) : "",
    sources: Array.isArray(obj.sources) ? obj.sources.filter((s) => typeof s === "string").slice(0, 3) : [],
  };
}

// ---------------------------------------------------------------------------
// Concurrency helper
// ---------------------------------------------------------------------------

async function runPool(items, limit, worker) {
  const queue = items.map((item, i) => ({ item, i }));
  let next = 0;
  async function pull() {
    while (next < queue.length) {
      const { item, i } = queue[next++];
      await worker(item, i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, queue.length) }, pull));
}

// ---------------------------------------------------------------------------
// Report patching
// ---------------------------------------------------------------------------

function patchReport(file, candidates) {
  if (!existsSync(file)) return;
  const html  = readFileSync(file, "utf8");
  const start = html.indexOf(FACTCHECK_MARKER_START);
  const end   = html.indexOf(FACTCHECK_MARKER_END);
  if (start === -1 || end === -1) return;
  const before  = html.slice(0, start + FACTCHECK_MARKER_START.length);
  const after   = html.slice(end);
  writeFileSync(file, before + buildFactCheckSection(candidates) + after, "utf8");
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  if (!existsSync(FACTCHECK_FILE)) {
    console.log("No factcheck-queue.json found — run index.mjs first. Skipping.");
    return;
  }
  const queue = JSON.parse(readFileSync(FACTCHECK_FILE, "utf8"));
  const candidates = queue.candidates || [];
  const pending = candidates.filter((c) => c.status === "pending");

  if (pending.length === 0) {
    console.log("No pending fact-check candidates. Nothing to do.");
    return;
  }
  if (!API_KEY) {
    console.log(`ANTHROPIC_API_KEY not set — leaving ${pending.length} candidate(s) pending. Skipping fact-check.`);
    return;
  }

  console.log(`Fact-checking ${pending.length} candidate(s) with web search…`);

  await runPool(pending, CONCURRENCY, async (c) => {
    try {
      const text = await factCheckOne(c);
      const v = parseVerdict(text);
      c.verdict = v.verdict;
      c.notes   = v.notes;
      c.sources = v.sources;
      c.status  = "checked";
      console.log(`  ${c.city} / ${c.metricName}: ${c.verdict}`);
    } catch (err) {
      c.verdict = "inconclusive";
      c.notes   = `Fact-check error: ${err.message}`.slice(0, 240);
      c.sources = [];
      c.status  = "error";
      console.log(`  ${c.city} / ${c.metricName}: ERROR — ${err.message}`);
    }
  });

  // Persist verdicts back to the queue.
  queue.factCheckedAt = new Date().toISOString();
  writeFileSync(FACTCHECK_FILE, JSON.stringify(queue, null, 2) + "\n", "utf8");

  // Patch the report(s) in place.
  patchReport(REPORT_FILE, candidates);
  if (queue.runDate) patchReport(join(REPORTS_DIR, `qa-${queue.runDate}.html`), candidates);

  const discrepancies = candidates.filter((c) => c.verdict === "discrepancy");
  console.log(`\nFact-check complete. Discrepancies: ${discrepancies.length}`);
  for (const d of discrepancies) {
    console.log(`  ⚠ ${d.city} / ${d.metricName} — ${d.notes}`);
  }
}

main().catch((err) => {
  console.error("Fact-check script failed:", err);
  process.exit(1);
});

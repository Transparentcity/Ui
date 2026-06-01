#!/usr/bin/env node
/**
 * Internal-link crawl with client-render verification.
 *
 * The platform suite HTTP-crawls links statically (status codes). This
 * navigates to each link in a real browser and additionally checks the
 * CLIENT render — a 200 that boots into an error boundary, a blank page,
 * or a "page could not be found" client view is a UI bug the status-code
 * crawl misses.
 *
 * Collects internal links from seed pages, dedupes, caps the count, then
 * for each:
 *   LC1  navigation status is not 4xx/5xx
 *   LC2  no client error-boundary / not-found text after render
 *   LC3  page is not blank (has a meaningful amount of body text)
 *
 * Usage:
 *   node scripts/qa/link-crawl.mjs
 *   node scripts/qa/link-crawl.mjs --seeds /,/get/cincinnati --max 40
 *
 * Exits 1 on any finding, 0 on a clean run.
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
const SEEDS = (args.seeds ? args.seeds.split(",") : ["/", "/get/cincinnati", "/c/cincinnati"])
  .map((s) => s.trim())
  .filter(Boolean);
const MAX = Number.parseInt(args.max ?? "40", 10);

// Specific framework/Next.js error + not-found strings only. Do NOT
// include a bare "404" — it false-matches numbers like "1,404,519".
// Genuine 404 responses are already caught by LC1 via the status code.
const ERR_RE = /application error|something went wrong|client-side exception|unhandled runtime error|this page could not be found/i;

const findings = [];
function record(rule, where, ok, detail = "") {
  const status = ok ? "OK  " : "FAIL";
  console.log(`${status} ${rule}[${where}]${detail ? ` — ${detail}` : ""}`);
  if (!ok) findings.push(`${rule}[${where}]: ${detail}`);
}

const browser = await chromium.launch({ headless: true });

// --- 1. collect internal links from seeds ---
const links = new Set();
try {
  for (const seed of SEEDS) {
    const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
    try {
      await page.goto(`${SITE}${seed}`, { waitUntil: "domcontentloaded", timeout: 35000 });
      await page.waitForTimeout(2500);
      const hrefs = await page.evaluate(() =>
        [...document.querySelectorAll("a[href]")].map((a) => a.getAttribute("href")),
      );
      for (const h of hrefs) {
        if (!h) continue;
        // Internal paths only; skip anchors, mailto, tel, external.
        if (h.startsWith("/") && !h.startsWith("//")) links.add(h.split("#")[0]);
      }
    } catch (e) {
      console.error(`  (seed ${seed} failed: ${e.message})`);
    } finally {
      await page.context().close();
    }
  }
} finally {
  /* keep browser for crawl phase */
}

let targets = [...links].filter(Boolean);
const totalFound = targets.length;
if (targets.length > MAX) {
  console.log(`Found ${totalFound} internal links; capping at ${MAX} (raise with --max).`);
  targets = targets.slice(0, MAX);
}
console.log(`Crawling ${targets.length} internal links from ${SEEDS.length} seeds\n`);

// --- 2. visit each, verify status + client render ---
try {
  for (const path of targets) {
    const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
    try {
      let resp;
      try {
        resp = await page.goto(`${SITE}${path}`, { waitUntil: "domcontentloaded", timeout: 30000 });
      } catch (e) {
        record("LC1-status", path, false, `navigation failed: ${e.message}`);
        continue;
      }
      const status = resp?.status() ?? 0;
      if (status >= 400) {
        record("LC1-status", path, false, `HTTP ${status}`);
        continue;
      }
      record("LC1-status", path, true, `${status}`);

      await page.waitForTimeout(1800);
      const text = (await page.evaluate(() => document.body.innerText)) ?? "";

      // LC2 — client error boundary / not-found view despite a 200 shell
      if (ERR_RE.test(text)) {
        record("LC2-client-error", path, false, "error-boundary / not-found text rendered after a non-4xx status");
      } else {
        record("LC2-client-error", path, true);
      }

      // LC3 — not blank
      if (text.replace(/\s+/g, " ").trim().length < 40) {
        record("LC3-blank", path, false, `near-empty body (${text.trim().length} chars)`);
      } else {
        record("LC3-blank", path, true);
      }
    } finally {
      await page.context().close();
    }
  }
} finally {
  await browser.close();
}

console.error(`\n${findings.length} findings (crawled ${targets.length}/${totalFound} links)`);
process.exit(findings.length > 0 ? 1 : 0);

#!/usr/bin/env node
/**
 * Rendered-content + render-health scan.
 *
 * Catches the class of bugs the platform content suite cannot see: it
 * reads the story CSV (source data from the DB), this reads the rendered
 * DOM and runtime behavior. Anything the rendering layer introduces,
 * transforms, or fails to load shows up here and nowhere else.
 *
 * Per public page:
 *   CR1  no em/en dashes in visible text (Charter hard rule T1, but on
 *        RENDERED copy — incl. marketing/component text not in the CSV)
 *   CR2  no " - " hyphen-as-punctuation in visible text (T2)
 *   CR3  no leaked tokens: undefined / null / NaN / [object Object] /
 *        {{ }} / raw HTML entities / literal markdown (** ##)
 *   CR4  no failed network requests for first-party assets (broken
 *        chart/map/visualization images, missing JSON, etc.)
 *   CR5  no broken <img> (complete but naturalWidth 0)
 *   CR6  no uncaught console errors on load
 *   CR7  no error-boundary text ("Application error", "something went
 *        wrong", Next.js error overlay)
 *
 * Usage:
 *   node scripts/qa/content-render.mjs
 *   node scripts/qa/content-render.mjs --site https://staging.example
 *   node scripts/qa/content-render.mjs --paths /,/get/cincinnati
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
const LAUNCHED = [
  "san-francisco", "oakland", "cincinnati", "chicago", "detroit",
  "austin", "new-york-city", "seattle", "denver",
];
const DEFAULT_PATHS = ["/", ...LAUNCHED.map((s) => `/get/${s}`)];
const PATHS = args.paths ? args.paths.split(",").map((s) => s.trim()).filter(Boolean) : DEFAULT_PATHS;

const findings = [];
function record(rule, path, ok, detail = "") {
  const status = ok ? "OK  " : "FAIL";
  console.log(`${status} ${rule}[${path}]${detail ? ` — ${detail}` : ""}`);
  if (!ok) findings.push(`${rule}[${path}]: ${detail}`);
}

// Leaked-token patterns. Word-boundary the bare words so we don't match
// "nullable" or "undefinedwhatever".
const TOKEN_CHECKS = [
  { label: "undefined", re: /\bundefined\b/g },
  { label: "null", re: /(?<![\w-])null(?![\w-])/g },
  { label: "NaN", re: /\bNaN\b/g },
  { label: "[object Object]", re: /\[object Object\]/g },
  { label: "{{ template }}", re: /\{\{[^}]*\}\}/g },
  { label: "raw &amp;/&#39; entity", re: /&(amp|lt|gt|quot|#\d+);/g },
  { label: "literal markdown **bold**", re: /\*\*[^*\n]+\*\*/g },
  { label: "literal markdown ## heading", re: /(^|\n)#{2,}\s/g },
];

function snippet(text, idx, len = 70) {
  const start = Math.max(0, idx - 25);
  return text.slice(start, start + len).replace(/\s+/g, " ").trim();
}

async function checkPath(browser, path) {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    userAgent: "TransparentCity-QA/1.0 (+content-render)",
  });
  const page = await context.newPage();

  const consoleErrors = [];
  const hydrationMsgs = [];
  const HYDRATION_RE =
    /hydrat|did not match|text content does not match|server.rendered HTML|418|423|425/i;
  page.on("console", (m) => {
    const t = m.text();
    if (m.type() === "error") consoleErrors.push(t.slice(0, 120));
    // Hydration mismatches surface as console errors OR warnings; capture
    // both. SSR/client divergence is invisible to a source-data check.
    if (HYDRATION_RE.test(t)) hydrationMsgs.push(t.slice(0, 160));
  });

  // Real request failures only. Two traps to avoid:
  //  1. Match on hostname, not substring — the GA collect URL carries the
  //     page URL url-encoded in its query string, so url.includes()
  //     false-matches every analytics beacon.
  //  2. net::ERR_ABORTED / canceled requests are the browser deduping
  //     prefetched or re-requested assets (e.g. visualization images that
  //     also return 200). Those are NOT failures.
  const isFirstParty = (u) => {
    try {
      return new URL(u).hostname.endsWith("transparent.city");
    } catch {
      return false;
    }
  };
  const ABORT_RE = /ERR_ABORTED|ERR_CANCELED|net::ERR_BLOCKED_BY_CLIENT/i;
  const failedRequests = [];
  page.on("response", (r) => {
    if (isFirstParty(r.url()) && r.status() >= 400) {
      failedRequests.push(`${r.status()} ${r.url()}`);
    }
  });
  page.on("requestfailed", (r) => {
    const err = r.failure()?.errorText ?? "";
    if (isFirstParty(r.url()) && !ABORT_RE.test(err)) {
      failedRequests.push(`${err} ${r.url()}`);
    }
  });

  const url = `${SITE}${path}`;
  try {
    let resp;
    try {
      // domcontentloaded + a settle window, not networkidle — these pages
      // embed a live newsletter iframe + analytics beacons that keep
      // connections open, so networkidle frequently times out (flaky).
      resp = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 35000 });
    } catch (e) {
      record("CR0-page-load", path, false, `navigation failed: ${e.message}`);
      return;
    }
    const status = resp?.status() ?? 0;
    if (status >= 400) {
      record("CR0-page-load", path, false, `HTTP ${status}`);
      return;
    }
    // Settle window for client render + first-party requests to fire so
    // CR4/CR5/CR6 see real load behavior.
    await page.waitForTimeout(4000);

    const text = await page.evaluate(() => document.body.innerText);

    // CR1 — em/en dashes
    const dashMatches = [...text.matchAll(/[—–]/g)];
    if (dashMatches.length === 0) {
      record("CR1-rendered-dashes", path, true);
    } else {
      const samples = dashMatches.slice(0, 3).map((m) => `…${snippet(text, m.index)}…`);
      record(
        "CR1-rendered-dashes",
        path,
        false,
        `${dashMatches.length} em/en dash(es); e.g. ${samples.map((s) => JSON.stringify(s)).join(" | ")}`,
      );
    }

    // CR2 — hyphen as punctuation (space-hyphen-space between words)
    const hyphenMatches = [...text.matchAll(/\S\s-\s\S/g)];
    if (hyphenMatches.length === 0) {
      record("CR2-hyphen-punct", path, true);
    } else {
      const samples = hyphenMatches.slice(0, 2).map((m) => `…${snippet(text, m.index)}…`);
      record(
        "CR2-hyphen-punct",
        path,
        false,
        `${hyphenMatches.length} ' - ' punctuation; e.g. ${samples.map((s) => JSON.stringify(s)).join(" | ")}`,
      );
    }

    // CR3 — leaked tokens
    const tokenHits = [];
    for (const { label, re } of TOKEN_CHECKS) {
      const ms = [...text.matchAll(re)];
      if (ms.length) tokenHits.push(`${label} x${ms.length}`);
    }
    if (tokenHits.length === 0) {
      record("CR3-leaked-tokens", path, true);
    } else {
      record("CR3-leaked-tokens", path, false, tokenHits.join(", "));
    }

    // CR4 — genuinely failed first-party requests (4xx/5xx or non-abort
    // network errors)
    if (failedRequests.length === 0) {
      record("CR4-failed-requests", path, true);
    } else {
      const uniq = [...new Set(failedRequests.map((u) => u.replace(SITE, "").slice(0, 80)))];
      record(
        "CR4-failed-requests",
        path,
        false,
        `${failedRequests.length} failed first-party request(s); e.g. ${uniq.slice(0, 4).join(" | ")}`,
      );
    }

    // CR5 — broken images
    const broken = await page.evaluate(() =>
      [...document.images].filter((i) => i.complete && i.naturalWidth === 0).map((i) => i.src.slice(0, 80)),
    );
    if (broken.length === 0) {
      record("CR5-broken-images", path, true);
    } else {
      record("CR5-broken-images", path, false, `${broken.length} broken <img>; e.g. ${broken.slice(0, 3).join(", ")}`);
    }

    // CR6 — console errors
    if (consoleErrors.length === 0) {
      record("CR6-console-errors", path, true);
    } else {
      record("CR6-console-errors", path, false, `${consoleErrors.length}; e.g. ${JSON.stringify(consoleErrors.slice(0, 2))}`);
    }

    // CR7 — error-boundary text
    const errBoundary = /application error|something went wrong|client-side exception|unhandled runtime error|this page could not be found/i.test(
      text,
    );
    if (!errBoundary) {
      record("CR7-error-boundary", path, true);
    } else {
      record("CR7-error-boundary", path, false, "error-boundary / crash text visible on page");
    }

    // CR8 — React hydration mismatch (SSR vs client divergence)
    if (hydrationMsgs.length === 0) {
      record("CR8-hydration", path, true);
    } else {
      record("CR8-hydration", path, false, `${hydrationMsgs.length} hydration message(s); e.g. ${JSON.stringify(hydrationMsgs[0])}`);
    }
  } finally {
    await context.close();
  }
}

console.log(`Scanning ${PATHS.length} pages on ${SITE}\n`);
const browser = await chromium.launch({ headless: true });
try {
  for (const p of PATHS) {
    await checkPath(browser, p);
  }
} finally {
  await browser.close();
}
console.error(`\n${findings.length} findings`);
process.exit(findings.length > 0 ? 1 : 0);

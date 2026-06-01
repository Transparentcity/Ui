#!/usr/bin/env node
/**
 * /get/{slug} landing-page smoke for launched cities.
 *
 * For every launched city slug, validate the get-the-newsletter landing
 * page:
 *   GLP1  page responds 200
 *   GLP2  most recent Sunday's newsletter date is visible somewhere on
 *         the page (e.g. "May 31, 2026" for a Monday 2026-06-01 run)
 *   GLP3  Sign in button exists and clicking it reaches the Auth0
 *         custom-domain login
 *
 * Usage:
 *   node scripts/qa/get-landing-pages.mjs
 *   node scripts/qa/get-landing-pages.mjs --site https://staging.example
 *   node scripts/qa/get-landing-pages.mjs --slugs cincinnati,detroit
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
const DEFAULT_SLUGS = [
  "san-francisco",
  "oakland",
  "cincinnati",
  "chicago",
  "detroit",
  "austin",
  "new-york-city",
  "seattle",
  "denver",
];
const SLUGS = (args.slugs ? args.slugs.split(",") : DEFAULT_SLUGS).map((s) => s.trim()).filter(Boolean);

// Most recent Sunday on or before today. If today is Sunday, return today.
function mostRecentSunday(now = new Date()) {
  const d = new Date(now);
  d.setUTCHours(0, 0, 0, 0);
  const dow = d.getUTCDay(); // 0=Sun, 6=Sat
  d.setUTCDate(d.getUTCDate() - dow);
  return d;
}

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function formatLong(d) {
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`;
}
function formatShort(d) {
  return `${MONTHS[d.getUTCMonth()].slice(0, 3)} ${d.getUTCDate()}, ${d.getUTCFullYear()}`;
}
function formatIso(d) {
  return d.toISOString().slice(0, 10);
}

const SUNDAY = mostRecentSunday();
const SUNDAY_LONG = formatLong(SUNDAY);
const SUNDAY_SHORT = formatShort(SUNDAY);
const SUNDAY_ISO = formatIso(SUNDAY);

console.log(`Target newsletter date: ${SUNDAY_LONG} (${SUNDAY_ISO})`);
console.log(`Checking ${SLUGS.length} city slugs against ${SITE}\n`);

const findings = [];

function record(rule, slug, ok, detail = "") {
  const status = ok ? "OK  " : "FAIL";
  const line = `${status} ${rule}[${slug}]${detail ? ` — ${detail}` : ""}`;
  console.log(line);
  if (!ok) findings.push(`${rule}[${slug}]: ${detail}`);
}

async function checkSlug(browser, slug) {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    userAgent: "TransparentCity-QA/1.0 (+get-landing-pages)",
  });
  const page = await context.newPage();
  const url = `${SITE}/get/${slug}`;
  try {
    let response;
    try {
      // domcontentloaded, not networkidle — the embedded newsletter iframe
      // + analytics keep connections open and make networkidle flaky
      // (NYC in particular times out intermittently).
      response = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 35000 });
    } catch (e) {
      record("GLP1-page-load", slug, false, `navigation failed: ${e.message}`);
      return;
    }
    const status = response?.status() ?? 0;
    if (status >= 200 && status < 400) {
      record("GLP1-page-load", slug, true, `${status} ${url}`);
    } else {
      record("GLP1-page-load", slug, false, `got HTTP ${status} for ${url}`);
      return;
    }

    await page.waitForTimeout(3000);
    const body = await page.content();

    // GLP2 — the previous Sunday's date should appear in the body, in any
    // common format. We tolerate "May 31, 2026" / "May 31 2026" / "May 31"
    // / "2026-05-31" because we don't know how the page renders it.
    const dateBare = `${MONTHS[SUNDAY.getUTCMonth()]} ${SUNDAY.getUTCDate()}`;
    const hasDate =
      body.includes(SUNDAY_LONG) ||
      body.includes(SUNDAY_SHORT) ||
      body.includes(SUNDAY_ISO) ||
      body.includes(dateBare);
    if (hasDate) {
      record("GLP2-newsletter-date", slug, true, `found "${SUNDAY_LONG}" or equivalent`);
    } else {
      record(
        "GLP2-newsletter-date",
        slug,
        false,
        `no reference to most recent Sunday (${SUNDAY_LONG} / ${SUNDAY_ISO}) on the page`,
      );
    }

    // GLP3 — Sign in button click reaches Auth0.
    const signinLoc = page.locator("button:has-text('Sign in'), a:has-text('Sign in')").first();
    const signinCount = await page
      .locator("button:has-text('Sign in'), a:has-text('Sign in')")
      .count();
    if (signinCount === 0) {
      record("GLP3-signin-button", slug, false, "no 'Sign in' button found on page");
    } else {
      try {
        await signinLoc.click();
        try {
          await page.waitForURL(/auth0|auth\.|\/login|authorize|\/u\/login/, { timeout: 15000 });
        } catch {
          await page.waitForTimeout(2000);
        }
        const finalUrl = page.url();
        if (/auth0|auth\.|\/login|authorize|\/u\/login/.test(finalUrl)) {
          record("GLP3-signin-button", slug, true, `reached ${finalUrl.slice(0, 80)}`);
        } else {
          record("GLP3-signin-button", slug, false, `Sign in click landed on ${finalUrl.slice(0, 120)}`);
        }
      } catch (e) {
        record("GLP3-signin-button", slug, false, `Sign in click failed: ${e.message}`);
      }
    }
  } finally {
    await context.close();
  }
}

const browser = await chromium.launch({ headless: true });
try {
  for (const slug of SLUGS) {
    await checkSlug(browser, slug);
  }
} finally {
  await browser.close();
}

console.error(`\n${findings.length} findings`);
process.exit(findings.length > 0 ? 1 : 0);

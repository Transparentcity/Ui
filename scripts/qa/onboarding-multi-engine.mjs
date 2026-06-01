#!/usr/bin/env node
/**
 * Onboarding smoke across Chromium, Firefox, and WebKit.
 *
 * Validates that the signup entry points (citizen CTA, Auth0 reachability,
 * government interstitial) work on every Playwright engine and across
 * desktop/tablet/mobile viewports. Catches Gecko-only and Safari-only
 * signup regressions that a Chromium-only sweep misses.
 *
 * Usage:
 *   node scripts/qa/onboarding-multi-engine.mjs                    # all 3 engines
 *   node scripts/qa/onboarding-multi-engine.mjs --engines chromium # opt out
 *   node scripts/qa/onboarding-multi-engine.mjs --site https://staging.example
 *
 * Exits 1 on any finding, 0 on a clean run.
 *
 * One-time setup: `npx playwright install chromium firefox webkit`.
 */
import { chromium, firefox, webkit } from "playwright";

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
const CITY = args.city ?? "san-francisco";
const ENGINES = (args.engines ?? "chromium,firefox,webkit")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
const VIEWPORTS = (args.viewports ?? "1280,768,375")
  .split(",")
  .map((w) => Number.parseInt(w, 10))
  .filter((n) => Number.isFinite(n));

const ENGINE_MAP = { chromium, firefox, webkit };
const USER_AGENT = "TransparentCity-QA/1.0 (+onboarding-multi-engine)";
const findings = [];

function record(rule, tag, ok, detail = "") {
  const status = ok ? "OK  " : "FAIL";
  const line = `${status} ${rule}[${tag}]${detail ? ` — ${detail}` : ""}`;
  console.log(line);
  if (!ok) findings.push(`${rule}[${tag}]: ${detail}`);
}

function viewportFor(width) {
  if (width >= 1200) return { width, height: 900 };
  if (width >= 900) return { width, height: 1366 };
  return { width, height: 812 };
}

function viewportTag(width) {
  if (width >= 1200) return "desktop";
  if (width >= 900) return "tablet";
  return "mobile";
}

async function openSignupDropdown(page) {
  await page.waitForTimeout(2500);
  await page.locator("button:has-text('Sign up')").first().click();
  await page.waitForTimeout(800);
}

async function checkSignupCta(page, tag) {
  // Landing page
  await page.goto(`${SITE}/`, { waitUntil: "networkidle", timeout: 30000 });
  try {
    await openSignupDropdown(page);
    const citizen = await page.locator("text=/Sign up as citizen/i").count();
    const staff = await page.locator("text=/I'm city staff/i").count();
    if (citizen >= 1 && staff >= 1) {
      record("C30-signup-cta-landing", tag, true);
    } else {
      record(
        "C30-signup-cta-landing",
        tag,
        false,
        `landing dropdown: citizen=${citizen}, staff=${staff} (expected both >= 1)`,
      );
    }
  } catch (e) {
    record("C30-signup-cta-landing", tag, false, `on landing: ${e.message}`);
  }

  // City dashboard
  await page.goto(`${SITE}/c/${CITY}`, { waitUntil: "networkidle", timeout: 30000 });
  try {
    await openSignupDropdown(page);
    const citizen = await page.locator("text=/Sign up as citizen/i").count();
    const staff = await page.locator("text=/I'm city staff/i").count();
    if (citizen >= 1 && staff >= 1) {
      record("C30b-signup-cta-city", tag, true);
    } else {
      record(
        "C30b-signup-cta-city",
        tag,
        false,
        `city /c/${CITY}: citizen=${citizen}, staff=${staff}; residents can't self-register from city pages`,
      );
    }
  } catch (e) {
    record("C30b-signup-cta-city", tag, false, `on /c/${CITY}: ${e.message}`);
  }
}

async function checkAuth0Reachable(page, tag) {
  await page.goto(`${SITE}/`, { waitUntil: "networkidle", timeout: 30000 });
  try {
    await openSignupDropdown(page);
    const cit = page.locator("text=/Sign up as citizen/i").first();
    if ((await cit.count()) === 0) {
      record("C31-auth0", tag, false, "no 'Sign up as citizen' option in dropdown");
      return;
    }
    await Promise.all([page.waitForNavigation({ timeout: 20000 }), cit.click()]);
    const url = page.url();
    if (url.includes("auth0") || url.includes("/login") || url.includes("authorize")) {
      record("C31-auth0", tag, true, `reached ${url.slice(0, 80)}`);
    } else {
      record("C31-auth0", tag, false, `after click, landed on ${url.slice(0, 120)}`);
    }
  } catch (e) {
    record("C31-auth0", tag, false, `navigation failed: ${e.message}`);
  }
}

async function checkGovInterstitial(page, tag) {
  await page.goto(`${SITE}/?signup=public-servant`, {
    waitUntil: "domcontentloaded",
    timeout: 30000,
  });
  await page.waitForTimeout(2000);
  const body = (await page.content()).toLowerCase();
  if (body.includes("government") && body.includes("email")) {
    record("C37-gov-interstitial", tag, true);
  } else {
    record("C37-gov-interstitial", tag, false, "no government signup interstitial copy found");
  }
}

for (const engineName of ENGINES) {
  const launcher = ENGINE_MAP[engineName];
  if (!launcher) {
    record("C30-engine-unknown", engineName, false, `unknown engine: ${engineName}`);
    continue;
  }
  let browser;
  try {
    browser = await launcher.launch({ headless: true });
  } catch (e) {
    record(
      "C30-engine-launch",
      engineName,
      false,
      `could not launch ${engineName}: ${e.message}. Try \`npx playwright install ${engineName}\`.`,
    );
    continue;
  }
  try {
    for (const width of VIEWPORTS) {
      const tag = `${engineName}-${viewportTag(width)}`;
      const context = await browser.newContext({
        userAgent: USER_AGENT,
        viewport: viewportFor(width),
        isMobile: engineName === "chromium" && width < 900,
      });
      const page = await context.newPage();
      try {
        await checkSignupCta(page, tag);
        await checkAuth0Reachable(page, tag);
        await checkGovInterstitial(page, tag);
      } finally {
        await context.close();
      }
    }
  } finally {
    await browser.close();
  }
}

console.error(`\n${findings.length} findings`);
process.exit(findings.length > 0 ? 1 : 0);

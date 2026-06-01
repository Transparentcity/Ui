#!/usr/bin/env node
/**
 * Edge user-state smoke tests.
 *
 * US1  D1 — user signs up with location in an unlaunched area
 * US2  D2 — visitor in a launched city without a district set
 * US3  D6 — returning user whose home city was delaunched (manual stub;
 *       requires DB mutation, recorded here as a structured P2 so the
 *       report surfaces it as a known coverage gap until a test-DB
 *       harness exists)
 *
 * US1 needs QA_AUTH0_EMAIL / QA_AUTH0_PASSWORD because the post-signup
 * WelcomeModal is where the location picker lives. Without creds the
 * check skips US1 and only emits US2 + the US3 stub.
 *
 * Usage:
 *   node scripts/qa/user-states.mjs
 *   node scripts/qa/user-states.mjs --unlaunched-location "Sacramento, CA"
 *
 * Exits 1 on any finding, 0 on clean run.
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
const LAUNCHED_SLUG = args["launched-slug"] ?? "san-francisco";
const UNLAUNCHED_LOCATION = args["unlaunched-location"] ?? "Sacramento, CA";
const EMAIL = args["test-email"] ?? process.env.QA_AUTH0_EMAIL;
const PASSWORD = args["test-password"] ?? process.env.QA_AUTH0_PASSWORD;
const USER_AGENT = "TransparentCity-QA/1.0 (+user-states)";

const findings = [];

function record(rule, ok, detail = "") {
  const status = ok ? "OK  " : "FAIL";
  console.log(`${status} ${rule}${detail ? ` — ${detail}` : ""}`);
  if (!ok) findings.push(`${rule}: ${detail}`);
}

async function login(page) {
  await page.goto(`${SITE}/`, { waitUntil: "networkidle", timeout: 30000 });
  await page.waitForTimeout(1500);
  await page.locator("button:has-text('Sign up')").first().click();
  await page.waitForTimeout(800);
  await Promise.all([
    page.waitForNavigation({ timeout: 20000 }),
    page.locator("text=/Sign up as citizen/i").first().click(),
  ]);
  await page.waitForSelector(
    'input[name="email"], input[name="username"], input[type="email"]',
    { timeout: 20000 },
  );
  for (const sel of ['input[name="email"]', 'input[name="username"]', 'input[type="email"]']) {
    if ((await page.locator(sel).count()) > 0) {
      await page.fill(sel, EMAIL, { timeout: 10000 });
      break;
    }
  }
  if ((await page.locator('input[type="password"]').count()) > 0) {
    await page.fill('input[type="password"]', PASSWORD, { timeout: 10000 });
  } else {
    await page.locator('button[type="submit"]').first().click();
    await page.waitForSelector('input[type="password"]', { timeout: 15000 });
    await page.fill('input[type="password"]', PASSWORD, { timeout: 10000 });
  }
  await page.locator('button[type="submit"]').first().click();
  await page.waitForURL("**/home*", { timeout: 30000 });
  await page.waitForTimeout(1500);
}

async function checkUnlaunchedArea(page) {
  try {
    if ((await page.locator("[role=dialog]").count()) === 0) {
      record("US1-unlaunched-modal", false, "no WelcomeModal on /home after signup");
      return;
    }
    await page
      .locator("input[type=search], input[placeholder*='city' i]")
      .first()
      .fill(UNLAUNCHED_LOCATION);
    await page.waitForTimeout(1500);
    await page.keyboard.press("Enter");
    if ((await page.locator("text=/let's go/i").count()) > 0) {
      await page.locator("text=/let's go/i").click({ timeout: 10000 });
    }
    await page.waitForTimeout(8000);

    const body = (await page.content()).toLowerCase();
    const coveragePhrases = [
      "not in your area",
      "not yet covered",
      "we don't cover",
      "not available in",
      "notify me",
      "let us know when",
    ];
    const hasCoverageMsg = coveragePhrases.some((p) => body.includes(p));
    const stillSpinning = body.includes("looking for stories") && !body.includes("feed is ready");

    if (hasCoverageMsg) {
      record("US1-unlaunched-clear-msg", true, `saw out-of-coverage copy for '${UNLAUNCHED_LOCATION}'`);
    } else if (stillSpinning) {
      record(
        "US1-unlaunched-spinner",
        false,
        `feed still 'looking for stories' 8s after picking unlaunched '${UNLAUNCHED_LOCATION}' — should fail fast`,
      );
    } else {
      record(
        "US1-unlaunched-silent",
        false,
        `no out-of-coverage message after picking unlaunched '${UNLAUNCHED_LOCATION}'; user dropped into undefined state`,
      );
    }
  } catch (e) {
    record("US1-unlaunched-area", false, `flow crashed: ${e.message}`);
  }
}

async function checkNoDistrictState(page) {
  try {
    await page.goto(`${SITE}/c/${LAUNCHED_SLUG}`, { waitUntil: "networkidle", timeout: 30000 });
    await page.waitForTimeout(3000);
    const body = await page.content();
    const bodyL = body.toLowerCase();

    const promptPhrases = [
      "set your district",
      "choose your district",
      "pick your district",
      "add your district",
    ];
    const hasPrompt = promptPhrases.some((p) => bodyL.includes(p));
    const leaksDistrict =
      /district\s+\d+/.test(bodyL) && !bodyL.includes("all districts");

    if (hasPrompt) {
      record("US2-no-district-prompt", true, "saw explicit district-selection prompt");
    } else if (!leaksDistrict) {
      record(
        "US2-no-district-citywide",
        true,
        "no district pill shown for citywide visitor; acceptable",
      );
    } else {
      record(
        "US2-no-district-leak",
        false,
        "district pill shows specific 'District N' for visitor with no district set",
      );
    }

    if (bodyL.includes("your district") && !hasPrompt) {
      record(
        "US2-your-district-copy",
        false,
        "copy says 'your district' but visitor has no district set",
      );
    }
  } catch (e) {
    record("US2-no-district-state", false, `flow crashed: ${e.message}`);
  }
}

function emitManualFollowup() {
  record(
    "US3-delaunched-returning-user-MANUAL",
    false,
    "no automated coverage. Manual repro: flip is_launched=false on a test account's home city, then sign in and verify the 'city no longer published' screen. Replace this stub when a test-DB harness exists.",
  );
}

// US2 is no-auth. Run it first.
let browser = await chromium.launch({ headless: true });
let context = await browser.newContext({ userAgent: USER_AGENT, viewport: { width: 1280, height: 900 } });
let page = await context.newPage();
try {
  await checkNoDistrictState(page);
} finally {
  await context.close();
  await browser.close();
}

// US1 needs auth.
if (EMAIL && PASSWORD) {
  browser = await chromium.launch({ headless: true });
  context = await browser.newContext({ userAgent: USER_AGENT, viewport: { width: 1280, height: 900 } });
  page = await context.newPage();
  try {
    await login(page);
    await checkUnlaunchedArea(page);
  } catch (e) {
    record("US1-login", false, `could not log in test account: ${e.message}`);
  } finally {
    await context.close();
    await browser.close();
  }
} else {
  record("US1-skipped", true, "no QA_AUTH0_EMAIL/PASSWORD set; US1 skipped");
}

emitManualFollowup();

console.error(`\n${findings.length} findings`);
process.exit(findings.length > 0 ? 1 : 0);

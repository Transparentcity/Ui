#!/usr/bin/env node
/**
 * Slow-3G banner contract.
 *
 * The post-signup "Looking for stories" banner has a 30s success contract.
 * Under slow networks it may never reach the "feed is ready" state. The
 * contract: succeed in 30s, OR show an explicit failure message by 60s.
 * Spinner-forever at 60s is a P0.
 *
 * Requires the QA Auth0 sandbox account (env QA_AUTH0_EMAIL / QA_AUTH0_PASSWORD).
 * Skips cleanly if credentials are missing.
 *
 * Usage:
 *   node scripts/qa/slow-3g-banner.mjs
 *
 * Exits 1 on contract violation, 0 on success or skip-no-creds.
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
const CITY = args.city ?? "san-francisco";
const EMAIL = args["test-email"] ?? process.env.QA_AUTH0_EMAIL;
const PASSWORD = args["test-password"] ?? process.env.QA_AUTH0_PASSWORD;

if (!EMAIL || !PASSWORD) {
  console.log("SKIP slow-3g-banner — no QA_AUTH0_EMAIL/PASSWORD set");
  process.exit(0);
}

// Slow-3G profile, matching Chrome devtools.
const SLOW_3G = {
  offline: false,
  downloadThroughput: (500 * 1024) / 8,
  uploadThroughput: (500 * 1024) / 8,
  latency: 400,
};

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
}

const findings = [];

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  userAgent: "TransparentCity-QA/1.0 (+slow3g)",
  viewport: { width: 1280, height: 900 },
});
const page = await context.newPage();

try {
  // Log in BEFORE throttling — running the auth flow itself over Slow-3G
  // is flaky for unrelated reasons.
  await login(page);

  const cdp = await context.newCDPSession(page);
  await cdp.send("Network.enable");
  await cdp.send("Network.emulateNetworkConditions", SLOW_3G);

  try {
    await page
      .locator("input[type=search], input[placeholder*='city' i]")
      .first()
      .fill(CITY.replace(/-/g, " "));
    await page.waitForTimeout(1500);
    await page.keyboard.press("Enter");
    if ((await page.locator("text=/let's go/i").count()) > 0) {
      await page.locator("text=/let's go/i").click({ timeout: 10000 });
    }
  } catch (e) {
    console.log(`FAIL S3G-banner-trigger — could not start banner: ${e.message}`);
    process.exit(1);
  }

  // Success-in-30s, or examine state at 60s.
  try {
    await page.waitForSelector("text=/your.*feed is ready/i", { timeout: 30000 });
    console.log("OK   S3G1-banner-success-30s — banner reached success state within 30s under Slow-3G");
    process.exit(0);
  } catch {
    /* fall through */
  }

  await page.waitForTimeout(30000);
  const body = (await page.content()).toLowerCase();
  const failureMsgs = [
    "taking longer than expected",
    "still working",
    "try refreshing",
    "couldn't load",
    "could not load",
    "something went wrong",
    "trouble loading",
  ];
  const hasFailureMsg = failureMsgs.some((m) => body.includes(m));
  const stillSpinning = body.includes("looking for stories") && !body.includes("feed is ready");

  if (hasFailureMsg) {
    console.log(
      "OK   S3G2-banner-failure-message — banner did not succeed in 60s, but page shows explicit failure message; contract honored",
    );
  } else if (stillSpinning) {
    findings.push(
      "S3G2-banner-spinner-forever — banner still spinning at 60s under Slow-3G with no failure message; contract violated",
    );
  } else {
    findings.push(
      "S3G2-banner-silent-fail — banner gone at 60s but no success state and no failure message; undefined UI",
    );
  }
} finally {
  await context.close();
  await browser.close();
}

for (const f of findings) console.log(`FAIL ${f}`);
console.error(`\n${findings.length} findings`);
process.exit(findings.length > 0 ? 1 : 0);

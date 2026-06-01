/**
 * Shared login helper. Drives the current production Sign in flow:
 *
 *   transparent.city/ → click Sign in → auth.transparent.city/u/login →
 *   fill username + password → Continue → redirect back to transparent.city.
 *
 * The prior dropdown-based flow (Sign up → Sign up as citizen) is gone
 * as of May 2026. See onboarding-multi-engine.mjs for the matching no-auth
 * version of this navigation.
 */
const AUTH0_HOST_RE = /auth\.|auth0|\/login|\/u\/login|\/u\/signup|authorize/;
const POST_LOGIN_RE = /transparent\.city\/(home|c\/|$)|transparent\.city\/?$/;

export async function login(page, { site, email, password }) {
  if (!email || !password) {
    throw new Error("login: email and password are required");
  }

  await page.goto(`${site}/`, { waitUntil: "networkidle", timeout: 30000 });
  await page.waitForTimeout(1200);

  // Click Sign in (the live UI no longer has a citizen/staff dropdown).
  const signin = page.locator("button:has-text('Sign in'), a:has-text('Sign in')").first();
  if ((await signin.count()) === 0) {
    throw new Error("login: no 'Sign in' button found on landing page");
  }
  await signin.click();

  // Wait for Auth0 universal login.
  await page.waitForURL(AUTH0_HOST_RE, { timeout: 20000 });
  await page.waitForSelector('input[name="username"], input[name="email"], input[type="email"]', {
    timeout: 15000,
  });

  // Fill username/email.
  for (const sel of ['input[name="username"]', 'input[name="email"]', 'input[type="email"]']) {
    if ((await page.locator(sel).count()) > 0) {
      await page.fill(sel, email, { timeout: 10000 });
      break;
    }
  }

  // Password may be on the same screen (current universal login) or a
  // second screen (older flows). Handle both.
  if ((await page.locator('input[type="password"]').count()) > 0) {
    await page.fill('input[type="password"]', password, { timeout: 10000 });
  } else {
    await page.locator("button:has-text('Continue'), button[type=submit]").first().click();
    await page.waitForSelector('input[type="password"]', { timeout: 15000 });
    await page.fill('input[type="password"]', password, { timeout: 10000 });
  }

  await page.locator("button:has-text('Continue'), button[type=submit]").first().click();

  // Land back on transparent.city. Tolerate either /home or any
  // post-login page on the apex domain.
  await page.waitForURL(POST_LOGIN_RE, { timeout: 30000 });
  await page.waitForTimeout(1500);
}

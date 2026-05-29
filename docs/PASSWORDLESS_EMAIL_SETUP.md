# Passwordless Email Sign-Up (Auth0) – No Email Received

If users don’t receive the one-time link email when signing up from the city or district page, work through this checklist in the Auth0 Dashboard.

## 1. Enable Passwordless Email

- Go to **Authentication** → **Passwordless**.
- Ensure **Email** is **Enabled**.
- If you use a custom email provider, configure it and test (e.g. **SendGrid**, **SES**). Check **Monitoring** → **Logs** for “Failed Sending Notification” if emails still don’t arrive.

## 2. Connect the Application to the Email Connection

- Go to **Applications** → **Applications** → select your app (the one whose Client ID matches `NEXT_PUBLIC_AUTH0_CLIENT_ID` in `.env.local`).
- Open the **Connections** tab (or **Settings** → **Connections**).
- Under **Passwordless**, turn **Email** **ON** for this application.

If Email is missing from the list, the tenant passwordless connection may not be named `email` (Auth0 expects that exact name for the default passwordless email connection).

### Error: “the connection is not enabled”

Auth0 returns this when the app requests `connection=email` but that connection is not enabled for your SPA client. You are redirected to the homepage with a toast.

Fix (both steps):

1. **Authentication** → **Passwordless** → **Email** → enabled (green).
2. **Applications** → [your SPA] → **Connections** → **Passwordless** → **Email** toggle ON.

Use the same application as your local build (`NEXT_PUBLIC_AUTH0_CLIENT_ID`). Enabling Email on production’s app only does not fix localhost.

## 3. Allowed Callback URLs

- In the same Application → **Settings** → **Application URIs**.
- **Allowed Callback URLs** must include the exact URL your app uses as the redirect target after login. The app uses the **current origin** as `redirect_uri`, e.g.:
  - Local: `http://localhost:3000` or `http://localhost:3001` (match the port you use).
  - Production: `https://your-domain.com`
- Add one line per origin (e.g. `http://localhost:3001` and your production URL). No path is required for the SPA; the SDK uses the origin only.

## 4. Local development (localhost)

Inline “check your inbox” magic links **do not work on `http://localhost:3001`**. The browser treats `localhost` and `auth.transparent.city` as different sites, so Auth0 cannot store the passwordless session cookie when `/passwordless/start` runs from your dev server. You will still receive the email, but clicking the link shows *“The link must be opened on the same device and browser…”*.

**What to do locally:** submitting email on a get/signup form redirects you through Auth0’s hosted passwordless screen (briefly). Complete the flow there, then open the magic link in the **same browser**. Ensure Auth0 **Allowed Callback URLs** includes `http://localhost:3001` (and your dev port).

Test inline magic links on **`https://transparent.city`** (or deploy a preview on `*.transparent.city`) after completing step 5 below.

## 5. Allowed Web Origins (required for inline magic-link signup on transparent.city)

- In the same **Application URIs** section, set **Allowed Web Origins** to the same origins as above (e.g. `http://localhost:3001`, `https://transparent.city`, `https://app.transparent.city`).
- City/get landing pages call Auth0 `/passwordless/start` from the browser with `credentials: include`. Auth0 must allow your origin in **Allowed Web Origins** or the passwordless session cookie is not stored and users see *“The link must be opened on the same device and browser…”* when they click the email link.

## 5b. Magic links and browser/device

Auth0 ties each magic link to the browser that requested it. The link must be opened in the **same browser** (not only the same device). Common failures:

- Requesting the link in Chrome but the mail app opens it in Safari (common on iOS).
- Requesting on a laptop but opening the email on a phone.
- Private/incognito windows that block cross-site cookies.

The SPA enables `useCookiesForTransactions` and sends `/passwordless/start` with credentials so PKCE state survives when the email opens a new tab on the same browser.

## 6. Authentication Profile (Universal Login)

- Go to **Authentication** → **Authentication Profile** (or **Branding** → **Universal Login** in older tenants).
- Ensure the login flow supports Passwordless. Often this means choosing **Identifier First** (or **Identifier First + Biometrics**) so the Passwordless email screen can be shown when we pass `connection=email`.

## 7. Check Auth0 Logs

- Go to **Monitoring** → **Logs**.
- Filter by **Type**: e.g. “Failed Sent Email”, “Failed Sending Notification”, or “Error”.
- Reproduce the sign-up (enter email, click Sign up) and see if a log entry appears. That will show whether the failure is in Auth0 (e.g. wrong callback, connection disabled, or email provider error).

## 8. What the App Sends

The city/district sign-up form triggers Auth0 with:

- `connection: "email"`
- `login_hint: <user's email>`
- `redirect_uri: window.location.origin` (e.g. `http://localhost:3001`)
- `scope: "openid profile email offline_access"`

So the Auth0 application must have the **email** Passwordless connection enabled and the **Allowed Callback URLs** must include that origin. If the email still doesn’t send after these checks, the Logs in step 6 are the next place to look (e.g. provider or DNS/DMARC issues).

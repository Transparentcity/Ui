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

## 4. Allowed Web Origins (optional but recommended)

- In the same **Application URIs** section, set **Allowed Web Origins** to the same origins as above (e.g. `http://localhost:3001`, `https://your-domain.com`). This avoids CORS issues when Auth0 talks to your app.

## 5. Authentication Profile (Universal Login)

- Go to **Authentication** → **Authentication Profile** (or **Branding** → **Universal Login** in older tenants).
- Ensure the login flow supports Passwordless. Often this means choosing **Identifier First** (or **Identifier First + Biometrics**) so the Passwordless email screen can be shown when we pass `connection=email`.

## 6. Check Auth0 Logs

- Go to **Monitoring** → **Logs**.
- Filter by **Type**: e.g. “Failed Sent Email”, “Failed Sending Notification”, or “Error”.
- Reproduce the sign-up (enter email, click Sign up) and see if a log entry appears. That will show whether the failure is in Auth0 (e.g. wrong callback, connection disabled, or email provider error).

## 7. Inline OTP code flow (gift activation, etc.)

Some flows send a **6-digit code** instead of a magic link. Verifying that code
uses Auth0 grant type `http://auth0.com/oauth/grant-type/passwordless/otp`, which
**is not allowed on SPA applications** — only on **Regular Web Application** or
**Native** app types.

### Error: Grant type `…/passwordless/otp` not allowed for the client

This means OTP verify is still using the SPA client. Fix:

1. **Create a Regular Web Application** in Auth0 (e.g. “TransparentCity Passwordless OTP”).
2. **Settings → Application URIs** — add the same callback / web origins as the SPA:
   - `https://app.transparent.city`, `http://localhost:3000`, `http://localhost:3001`, etc.
3. **Settings → Advanced → Grant Types** — enable **Passwordless OTP** (and **Authorization Code** if listed).
4. **Connections** tab — enable **Email** under Passwordless (same as step 2 above).
5. Copy **Client ID** and **Client Secret** into server-only env vars (never `NEXT_PUBLIC_*`):
   ```
   AUTH0_PASSWORDLESS_CLIENT_ID=<regular-web-app-client-id>
   AUTH0_PASSWORDLESS_CLIENT_SECRET=<regular-web-app-client-secret>
   ```
   Add these in **both** places:
   - **Local dev:** `.env.local` or `.env` in `transparentcity-ui` (same values as production).
   - **Vercel:** Project → Settings → Environment Variables (Production + Preview if you test OTP on preview deploys).

   Restart `npm run dev` after adding them locally — Next.js only reads env vars at startup.

   The Regular Web Application must also list your **local origin** in Allowed Callback URLs
   (e.g. `http://localhost:3001`) or OTP verify will fail with a redirect_uri mismatch.
6. Redeploy / restart the Next.js server so the API routes pick up the new vars.

The SPA client (`NEXT_PUBLIC_AUTH0_CLIENT_ID`) stays unchanged for normal login.
Only `/api/auth/passwordless-start` (when `send=code`) and `/api/auth/passwordless-verify`
use the Regular Web Application credentials.

## 8. Gift activation (trusted welcome-link click)

Gift recipients who click the welcome email within **5 minutes** of send can skip OTP
when the **platform** has `AUTH0_GIFT_ROPG_CONNECTION` set to an Auth0 Database
connection (e.g. `Username-Password-Authentication`) plus passwordless/ROPG credentials
(`AUTH0_PASSWORDLESS_CLIENT_ID` / `AUTH0_PASSWORDLESS_CLIENT_SECRET` on the API server).

Without that, trusted clicks still record email verification but the UI falls back to
auto-sent OTP when the user opens the link after the trust window, or when instant
sign-in is not configured.

## 9. What the App Sends

The city/district sign-up form triggers Auth0 with:

- `connection: "email"`
- `login_hint: <user's email>`
- `redirect_uri: window.location.origin` (e.g. `http://localhost:3001`)
- `scope: "openid profile email offline_access"`

So the Auth0 application must have the **email** Passwordless connection enabled and the **Allowed Callback URLs** must include that origin. If the email still doesn’t send after these checks, the Logs in step 6 are the next place to look (e.g. provider or DNS/DMARC issues).

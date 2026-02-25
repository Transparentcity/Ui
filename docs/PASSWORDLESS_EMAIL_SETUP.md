# Passwordless Email Sign-Up (Auth0) – No Email Received

If users don’t receive the one-time link email when signing up from the city or district page, work through this checklist in the Auth0 Dashboard.

## 1. Enable Passwordless Email

- Go to **Authentication** → **Passwordless**.
- Ensure **Email** is **Enabled**.
- If you use a custom email provider, configure it and test (e.g. **SendGrid**, **SES**). Check **Monitoring** → **Logs** for “Failed Sending Notification” if emails still don’t arrive.

## 2. Connect the Application to the Email Connection

- Go to **Applications** → **Applications** → select your app (the one whose Client ID is in `NEXT_PUBLIC_AUTH0_CLIENT_ID`).
- Open the **Connections** tab (or **Settings** → **Connections**).
- Ensure the **Passwordless** / **Email** connection is **enabled** for this application.

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

## 7. What the App Sends

The city/district sign-up form triggers Auth0 with:

- `connection: "email"`
- `login_hint: <user's email>`
- `redirect_uri: window.location.origin` (e.g. `http://localhost:3001`)
- `scope: "openid profile email offline_access"`

So the Auth0 application must have the **email** Passwordless connection enabled and the **Allowed Callback URLs** must include that origin. If the email still doesn’t send after these checks, the Logs in step 6 are the next place to look (e.g. provider or DNS/DMARC issues).

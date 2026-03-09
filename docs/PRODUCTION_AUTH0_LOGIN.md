# Production Login Hung at Auth0 (app.transparent.city)

Production Auth uses the custom domain **auth.transparent.city** (Auth0 Custom Domains). Set `NEXT_PUBLIC_AUTH0_DOMAIN=auth.transparent.city` in the UI and `AUTH0_DOMAIN=auth.transparent.city` in the API.

If login gets stuck at Auth0 (redirects to Auth0 then never returns, or shows an error about redirect/callback), the cause is almost always **Allowed Callback URLs** or **Allowed Web Origins** in the Auth0 application not including the production origin.

## What the app sends

The UI uses `redirect_uri: window.location.origin` (see `src/app/providers.tsx`). So:

- **Production**: `https://app.transparent.city` (no path)
- **Local**: e.g. `http://localhost:3000` or `http://localhost:3001`

Auth0 must allow that **exact** callback URL. If it’s missing or different, Auth0 may redirect to an error page or the browser may hang.

---

## 1. Fix in Auth0 Dashboard (fastest)

1. Go to [Auth0 Dashboard](https://manage.auth0.com/) → **Applications** → **Applications**.
2. Open the application whose **Client ID** matches `NEXT_PUBLIC_AUTH0_CLIENT_ID` (used by app.transparent.city).
3. In **Settings** → **Application URIs** set:

   **Allowed Callback URLs** (one per line; include production and any dev URLs you use):

   ```
   https://app.transparent.city
   http://localhost:3000
   http://localhost:3001
   ```

   **Allowed Logout URLs** (optional but recommended):

   ```
   https://app.transparent.city
   http://localhost:3000
   http://localhost:3001
   ```

   **Allowed Web Origins** (same origins; avoids CORS issues with silent auth/refresh):

   ```
   https://app.transparent.city
   http://localhost:3000
   http://localhost:3001
   ```

4. **Save Changes**.

Then try logging in again from https://app.transparent.city (clear cache or use incognito if needed).

---

## 2. Read / adjust Auth0 from the command line (Auth0 CLI)

You can install the Auth0 CLI and read or update application settings without the dashboard.

### Install Auth0 CLI

```bash
# macOS (Homebrew)
brew install auth0-cli

# Or npm (global)
npm install -g auth0-cli
```

Then log in (opens browser):

```bash
auth0 login
```

### List applications

```bash
auth0 apps list
```

Use the **ID** (or **name**) of the app that matches your production Client ID.

### Read current application settings

```bash
# Replace <APP_ID> with the application ID from auth0 apps list
auth0 apps show <APP_ID> --json
```

To see callback URLs and related fields in a compact way:

```bash
auth0 apps show <APP_ID> --json | jq '{
  name,
  callbacks,
  web_origins,
  logout_uris
}'
```

(If `jq` isn’t installed, run `auth0 apps show <APP_ID> --json` and look for `callbacks`, `web_origins`, `logout_uris`.)

### Update Allowed Callback URLs

If production is missing, add it (comma-separated list; keep existing URLs if you want):

```bash
auth0 apps update <APP_ID> --callbacks "https://app.transparent.city,http://localhost:3000,http://localhost:3001"
```

### Update Allowed Web Origins

```bash
auth0 apps update <APP_ID> --web-origins "https://app.transparent.city,http://localhost:3000,http://localhost:3001"
```

### Open the app in the dashboard

```bash
auth0 apps open <APP_ID>
```

---

## 3. Verify env and callback URL (no secrets)

From the UI repo you can confirm which URLs to add in Auth0 (no secrets printed):

```bash
# Print production callback URL and web origins (safe to copy into Auth0)
npm run auth0-callback-url
```

Or verify env vars (domain/client id/audience) without revealing full secrets:

```bash
npm run verify-auth0
```

---

## 4. Checklist summary

- [ ] **Allowed Callback URLs** in Auth0 includes `https://app.transparent.city`.
- [ ] **Allowed Web Origins** includes `https://app.transparent.city`.
- [ ] **Allowed Logout URLs** includes `https://app.transparent.city` (optional).
- [ ] Auth0 **Application** matches `NEXT_PUBLIC_AUTH0_CLIENT_ID` used in production build.
- [ ] Production build has `NEXT_PUBLIC_AUTH0_DOMAIN`, `NEXT_PUBLIC_AUTH0_CLIENT_ID`, `NEXT_PUBLIC_AUTH0_AUDIENCE` set (e.g. in Vercel/hosting env).
- [ ] After changing Auth0, retry in incognito or after clearing site data for app.transparent.city.

---

## 5. If it still hangs

1. **Auth0 Logs**  
   Dashboard → **Monitoring** → **Logs**. Look for failed logins or “invalid redirect_uri” (or similar). That confirms whether the callback URL was rejected.

2. **Browser**  
   Open DevTools → Network. Trigger login and see the redirect to Auth0 and back; if the return redirect fails or goes to the wrong URL, that matches a callback/origin mismatch.

3. **Backend**  
   Ensure the API’s `ALLOWED_ORIGINS` (or equivalent) includes `https://app.transparent.city` so API calls after login aren’t blocked by CORS. See `docs/TESTING_PRODUCTION_API.md` and `docs/TROUBLESHOOTING_SITEMAP.md`.

4. **Stale Auth0 state**  
   The app clears old Auth0 transaction state; if the problem persists, try a different browser or clear all site data for app.transparent.city and try again.

# Public Routes (/c, /m) and Direct Load

## The problem

`/c/[slug]` (city pages) and `/m/[hash]` (public maps) can work when you navigate **within the app** (e.g. from the sitemap or dashboard) but return **404 when you open the URL directly** (new tab, paste, refresh, or from an external link).

## Why in‑app works but direct load can fail

- **In‑app**: Next.js does client-side navigation. The browser does not request `GET /c/phoenix` or `GET /m/abc` as a full document; it fetches RSC/data. The initial load was for another URL (e.g. `/` or `/sitemap`), which already succeeded.
- **Direct load**: The browser does `GET /c/phoenix` or `GET /m/abc`. The **host** (Vercel, your Node server, or the thing in front of it) must hand that path to the Next.js app. If it does not, you get 404.

## Requirements for /c and /m to work on direct load

1. **All app routes must be handled by Next.js**  
   The process that serves the app must be the Next.js server (e.g. `next start`, or the `server.js` from `output: "standalone"`). Paths like `/`, `/c/...`, `/m/...`, `/sitemap`, `/dashboard`, etc. must **not** be served by a static file server or a proxy that only forwards `/` and `/_next/static`.

2. **Proxy / CDN in front**  
   If you put nginx, Cloud Run, or a CDN in front of Next:
   - Send **all** non‑static requests (or everything except `/_next/static`, `/_next/image`, favicon, etc.) to the Next.js server.
   - Do **not** only proxy `location = /` or a small set of paths.

3. **Vercel**  
   Vercel runs Next and routes all paths to it. No extra config is needed for `/c` and `/m` **as long as** you’re using the default Next.js setup (no `output: 'export'`). With `output: "standalone"` you would deploy differently (e.g. Docker/Cloud Run), not typical Vercel.

4. **Standalone / Node (Docker, Cloud Run, etc.)**  
   Run the built app with:
   ```bash
   node .next/standalone/server.js
   # or
   node server.js   # in the standalone output directory
   ```
   Point the upstream/proxy at this Node process for the whole app; do not serve only static assets.

## API rewrites and /m, /c

- **`/m/[hash]`**  
  The page loads map data via `GET /api/maps/public/:hash`. In both dev and prod, that is **rewritten** to the backend (`NEXT_PUBLIC_API_BASE_URL`) so the browser always calls the app origin; the app proxies to the API. This avoids CORS and keeps behavior the same on direct load and in‑app nav.

- **`/c/[slug]`**  
  The page uses `listPublicCitiesForSitemap()` and other public API calls with the **full** `NEXT_PUBLIC_API_BASE_URL`. Those run **server‑side**; the rewrite is only for incoming `/api/...` requests to the app, so `/c` does not rely on it. Ensure the Next.js server can reach `NEXT_PUBLIC_API_BASE_URL` (and that it’s set in the deployment env).

## Quick checks

From a machine that can reach your app:

```bash
# Should return 200 and HTML (not 404)
curl -s -o /dev/null -w "%{http_code}" "https://app.transparent.city/c/phoenix"
curl -s -o /dev/null -w "%{http_code}" "https://app.transparent.city/m/abc123"
```

If you get 404:

- Confirm the app is really being served by the Next.js process (or Vercel’s Next runtime), not a static host or a proxy that only forwards `/`.
- Confirm `NEXT_PUBLIC_API_BASE_URL` is set in the deployment so server-side fetches for `/c` can reach the API.

## Relevant config

- **`next.config`**  
  - `output: "standalone"` → use the generated Node server; do not serve only the static folder.
  - `rewrites`: `/api/maps/:path*` and `/api/public/:path*` are proxied to the backend. `/api/geocode`, `/api/research`, etc. remain Next.js Route Handlers.

- **`/m`**  
  Uses `/api/maps/public/:hash` (then rewritten to the backend) in dev and prod.

- **`/c`**  
  Uses `API_BASE` (full backend URL) for server-side calls; no change to rewrites needed for `/c` itself.

# SEO and Indexing for /c/ Pages

## How SEO Is Supposed to Work

### 1. **robots.txt and sitemap**

- **`/robots.txt`** (from `app/robots.ts`): Allows all crawlers on `/`, disallows `/dashboard`, `/api`, `/debug`, and points to `{origin}/sitemap.xml`.
- **`/sitemap.xml`** (from `app/sitemap.xml/route.ts`): Emits XML with:
  - `/` (priority 1.0)
  - `/sitemap` (priority 0.8)
  - `/landing` (priority 0.4)
  - **City landings**: `/c/{slug}?id={id}` for each city from `listPublicCitiesForSitemap()` (priority 0.6, changefreq weekly)
  - **Public maps**: `/m/{short_hash}` for each map from `listPublicMapsForSitemap()` (priority 0.5, changefreq monthly)

Crawlers read `robots.txt`, follow the sitemap URL, and request the listed URLs. Each request is handled by the Next.js server (see [PUBLIC_ROUTES_AND_DIRECT_LOAD.md](./PUBLIC_ROUTES_AND_DIRECT_LOAD.md)); `generateMetadata` and the page run server-side, so the HTML includes the correct `<title>` and `<meta name="description">`.

### 2. **How /c/ pages get their city name for SEO**

For **`/c/[slug]`** and **`/c/[slug]/methodology`** and **`/c/[slug]/district/[districtId]`**:

- `generateMetadata` calls `listPublicCitiesForSitemap()` and finds the city by `slug` or by `id` (from `?id=` when present).
- The API returns `{ id, name, state, country, slug, ... }`. The **display** is built as:
  - `"Name, State, Country"` when `country` is set and not `"United States"`.
  - `"Name, State"` when `state` is set (e.g. `"Phoenix, AZ"`).
  - `"Name, Country"` when only `country` is set and not US.
  - `"Name"` otherwise.
- That **display** is used in:
  - `metadata.title` (e.g. `Phoenix, AZ – Transparent.city`)
  - `metadata.description`

If the API fails or no city matches, the code falls back to the **slug** (e.g. `phoenix`). So you can see a raw slug in the title when:

- The backend is down or unreachable from the Next.js server.
- The slug does not match any city (e.g. typo or old URL).
- `?id=` is wrong or missing when slugs collide (e.g. two “Kansas City” with the same slug).

### 3. **URLs and the “city name” in the path**

- **Path**: `/c/[slug]` uses the **slug** (e.g. `phoenix`, `san-francisco`), not the full display name. That is intentional: slugs are short and URL‑safe.
- **City name in SEO**: The **document** (title and meta) should show the real name (e.g. “Phoenix, AZ”). That comes from `generateMetadata` and the API, not from the URL.

So: the **URL** will not literally say “Phoenix” or “Phoenix-AZ”; the **browser tab and search snippets** should.

### 4. **What is in the sitemap today**

| In sitemap | Not in sitemap |
|------------|----------------|
| `/` | `/c/[slug]/methodology` |
| `/sitemap` | `/c/[slug]/district/[districtId]` |
| `/landing` | `/c/[slug]/metrics/[metricKey]` |
| `/c/[slug]?id=[id]` (city landing only) | |

Methodology, district, and metric pages are **not** in the sitemap. They can still be indexed if:

- Crawlers follow links from the city page, the sitemap HTML page, or elsewhere.
- You add them to the sitemap later (see “Improvements” below).

### 5. **Metric pages: city name in metadata**

For **`/c/[slug]/metrics/[metricKey]`**:

- `generateMetadata` does **not** call `listPublicCitiesForSitemap()`.
- The “city name” is derived only from the **slug**:
  - `slug.split("-").map(w => w[0].toUpperCase() + w.slice(1)).join(" ")`
  - e.g. `phoenix` → `"Phoenix"`, `san-francisco` → `"San Francisco"`.
- So you never get `"Phoenix, AZ"` or `"San Francisco, CA"` on metric pages; you get the title‑cased slug.

The public metric API (`getPublicMetricByKey` → `PublicMetricDetail`) can include `city_name`. The metric page does not use it today. Using `metric.city_name` when available would make the metric metadata more accurate.

---

## Why /c/ pages might “not reflect the city name”

1. **API unavailable at request time**  
   `listPublicCitiesForSitemap()` fails → fallback to `slug` → e.g. `"phoenix – Transparent.city"` (lowercase, no state). Fix: ensure `NEXT_PUBLIC_API_BASE_URL` is set and the Next.js server can reach the backend (see [PUBLIC_ROUTES_AND_DIRECT_LOAD.md](./PUBLIC_ROUTES_AND_DIRECT_LOAD.md) and [TROUBLESHOOTING_SITEMAP.md](./TROUBLESHOOTING_SITEMAP.md)).

2. **Metric (and previously methodology) pages never used the real city**  
   - Metric: only slug‑to‑title; no `name`/`state`/`country`.  
   - Methodology: previously could include `"United States"` in the title (e.g. `"Phoenix, AZ, United States"`). It can be aligned with the main city page’s display logic.

3. **Root layout `title.template`**  
   Root has `template: "%s – Transparent.city"`. If a page sets `title: "Phoenix, AZ – Transparent.city"`, the final title can become `"Phoenix, AZ – Transparent.city – Transparent.city"`. Pages should set only the variable part (e.g. `"Phoenix, AZ"`) and let the template add `" – Transparent.city"`.

4. **Direct load / 404**  
   If `/c/phoenix` is 404 on direct load, crawlers will not index it. The app must be served by the Next.js process for `/c/...` (see [PUBLIC_ROUTES_AND_DIRECT_LOAD.md](./PUBLIC_ROUTES_AND_DIRECT_LOAD.md)).

---

## Root layout and title template

The root `app/layout.tsx` sets `metadata.title.template: "%s – Transparent.city"`. For any page that exports `metadata.title` as a string, that string replaces `%s`, so the final `<title>` is `"{page title} – Transparent.city"`. Pages under `/c/` should therefore set only the variable part (e.g. `"Phoenix, AZ"` or `"Methodology | Phoenix, AZ"`) and not append `" – Transparent.city"` themselves.

---

## Implemented improvements

- **City landing**: `title` is `display` only; the template adds `" – Transparent.city"`.
- **Methodology**: Same display logic as the city page (exclude `"United States"`); `title` is `"Methodology | {cityName}"`.
- **District**: `title` is `"District {d} – {cityName}"`.
- **Metric**: City display is resolved from `listPublicCitiesForSitemap` by `slug`; fallback to `metric.city_name` or title-cased slug. `title` is `"{metric_name} | {locationLabel} | {cityName}"`.

---

## Possible follow-ups

- **Sitemap**: Add `/c/[slug]/methodology` and, if manageable, a subset of metric or district URLs (or a sitemap index) so those pages are explicitly submitted.

---

## Quick checks

```bash
# Sitemap
curl -s "https://app.transparent.city/sitemap.xml" | head -80

# City HTML and title (should include city name, e.g. Phoenix, AZ)
curl -s "https://app.transparent.city/c/phoenix?id=5" | grep -o '<title>[^<]*</title>'

# Direct load (must be 200)
curl -s -o /dev/null -w "%{http_code}" "https://app.transparent.city/c/phoenix"
```

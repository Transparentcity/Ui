# Anomaly and Metric Error States

## Overview

Custom error pages handle cases where anomalies or metrics are not found, providing helpful navigation back to the relevant city page.

## Anomaly Not-Found (`src/app/a/[id]/page.tsx`)

The public anomaly page (`/a/{id}`) fetches anomaly data from the API. When the anomaly doesn't exist or fails to load, the page renders an error state with:

- A clear "not found" heading
- An explanation that the metric may have been removed
- A link back to the city dashboard (when city context is available)
- The `CitySignupButton` for conversion

The page supports two viewing modes:
- **Embedded** (`?embed=true`): Minimal chrome for iframe embedding
- **Full-page**: Full navigation with logo, back button, and signup CTA

## Metric Not-Found (`src/app/c/[slug]/metrics/[metricKey]/not-found.tsx`)

A client-side 404 page for missing metrics. Since Next.js `not-found.tsx` files don't receive params, this component:

1. Parses the city slug from `window.location.pathname` using a regex
2. Converts the slug to a display name (e.g., "san-francisco" -> "San Francisco")
3. Builds navigation links back to the city page

### Helper Functions

- `parseCitySlugFromPath(pathname)` - Extracts city slug from `/c/{slug}/metrics/...` paths
- `slugToName(slug)` - Converts URL slugs to title case display names

## Breadcrumb Navigation (City Pages)

Recent changes replaced the "Dashboard" button on public city pages with a breadcrumb-style home link. This affects:

- `src/app/c/[slug]/page.tsx` - Main city page
- `src/app/c/[slug]/district/[districtId]/DistrictPageContent.tsx` - District pages

The breadcrumb provides a lighter navigation pattern and reduces visual weight on the page header.

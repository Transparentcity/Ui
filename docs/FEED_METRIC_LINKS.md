# Feed Metric Hotlinks

## Overview

Metric names displayed in feed cards and story detail views are interactive links that navigate to the corresponding metric detail page (`/c/{citySlug}/metrics/{metricKey}`). This provides a discovery path from feed content to deeper analytical views.

## Components

### MetricLink (`src/components/feed/MetricLink.tsx`)

Inline link component used inside feed cards and story detail views. Renders a styled link when both `metricKey` and `citySlug` are available, otherwise falls back to plain styled text.

**Props:**
- `label` (string) - Display text
- `direction` ("up" | "down" | null) - Optional arrow indicator
- `metricKey` (string | null) - URL slug for the metric
- `citySlug` (string | null) - City URL slug
- `district` (number | null) - Optional district number, appended as `?district=N`

Click events are stopped from propagating so they don't trigger parent card click handlers.

### MetricKeyContext (`src/components/feed/MetricKeyContext.tsx`)

React context that provides a `resolveMetricKey(displayName)` function. Given a human-readable metric name (e.g., "Crime Rate"), returns the URL-safe metric key (e.g., "crime-rate") via a case-insensitive lookup.

**Usage:**
```tsx
const { resolveMetricKey } = useMetricKey();
const metricKey = resolveMetricKey("Crime Rate"); // "crime-rate"
```

The `MetricKeyProvider` wraps the feed and accepts a `metrics` array from the API containing `{ metric_name, metric_key }` pairs.

## Where MetricLink is used

| Component | Context |
|---|---|
| `MultiMetricCard` | Metric tile labels and comparison grid metric names |
| `TextOnlyCard` | Trend metric strip (`trend_metric_name`) |
| `FeedStoryDetailView` | Metric grid cells in story detail modal |

## Period Labels (MultiMetricCard)

Multi-metric cards display a period context label resolved from metadata:
1. `metadata.period_label` (explicit string) takes priority
2. Falls back to `metadata.period_type` mapped via `PERIOD_TYPE_LABELS`:
   - `yoy` -> "Year-over-Year"
   - `mom` -> "vs. Last Month"
   - `wow` -> "vs. Last Week"
   - `ytd` -> "Year-to-Date"
   - `qtd` -> "Quarter-to-Date"
   - `mtd` -> "Month-to-Date"

## Favorability Logic (MultiMetricCard)

The `isFavorable()` function determines whether a metric change is good news:
- For crime, complaints, incidents, response times: **down is good**
- For employment, jobs, housing, funding, programs, services, budget, revenue: **up is good**

This drives green/red coloring in the metric tiles.

/**
 * Resolves the canonical page URL for a feed story based on its type and data.
 *
 * Routing priority:
 * 1. Feed-producer stories with short_hash → canonical story page (/s/{hash})
 * 2. multi_metric / comparison (legacy, no short_hash) → city dashboard or district page
 * 3. Single-metric stories with metric_key → metric detail page
 * 4. Single metric in metrics array → metric detail page
 * 5. Anomaly viz (no metric_key) → anomaly page
 * 6. Map viz → map page
 * 7. Research with /r/ detail_url → research page
 * 8. Default → feed story page (/feed/{id})
 */

import { slugify } from "@/lib/utils";
import type { EnrichedFeedStory } from "./mockFeedData";

const METRIC_DETAIL_CARD_TYPES = new Set([
  "alert",
  "trend",
  "safety",
  "off_the_charts",
  "milestone",
]);

export function resolveCanonicalUrl(story: EnrichedFeedStory): string {
  const slug = story.city_name ? slugify(story.city_name) : null;
  const district = story.district;
  const metricKey = story.metadata?.metric_key as string | undefined;
  const metrics = story.metadata?.metrics as
    | Array<{ metric_key?: string }>
    | undefined;

  // Feed-producer stories always have a short_hash → use canonical story page.
  // This takes priority over all other routing so multi_metric/alert/etc. stories
  // created by the feed producer land on their own page, not the city or metric page.
  if (story.short_hash) {
    return `/s/${story.short_hash}`;
  }

  // Multi-metric "This Week" / comparison (legacy, no short_hash) → city or district page
  if (story.card_type === "multi_metric" || story.card_type === "comparison") {
    if (slug && district > 0) return `/c/${slug}/district/${district}`;
    if (slug) return `/c/${slug}`;
    return `/feed/${story.id}`;
  }

  // Single metric stories → metric detail page (metric page wins over anomaly)
  if (metricKey && slug && METRIC_DETAIL_CARD_TYPES.has(story.card_type)) {
    return `/c/${slug}/metrics/${metricKey}${district > 0 ? `?district=${district}` : ""}`;
  }

  // Single metric in metrics array → metric detail
  if (metrics?.length === 1 && metrics[0].metric_key && slug) {
    return `/c/${slug}/metrics/${metrics[0].metric_key}`;
  }

  // Anomaly viz without metric_key → anomaly page
  if (story.visualization_type === "anomaly" && story.visualization_ref_id) {
    return `/a/${story.visualization_ref_id}`;
  }

  // Map viz → map page
  if (story.visualization_type === "map") {
    const hash = story.primary_visualization?.short_hash;
    const id = story.primary_visualization?.id ?? story.visualization_ref_id;
    if (hash) return `/m/${hash}`;
    if (id) return `/m/${id}`;
  }

  // Research with report link → research page
  if (story.story_type === "research" && story.detail_url?.startsWith("/r/")) {
    return story.detail_url;
  }

  // Default: feed story page (spending, justice, narrative, context, 311_images, etc.)
  return `/feed/${story.id}`;
}

/**
 * URL to share or link as the public canonical story page.
 * Prefers `/c/{city}/stories/{hash}` when both city slug and short_hash exist
 * (matches SEO canonical on the city story page); otherwise same rules as
 * {@link resolveCanonicalUrl} with `/s/{hash}` when city slug is missing.
 */
export function resolveOutboundCanonicalPath(story: EnrichedFeedStory): string {
  const slug = story.city_name ? slugify(story.city_name) : null;
  if (story.short_hash && slug) {
    return `/c/${slug}/stories/${story.short_hash}`;
  }
  if (story.short_hash) {
    return `/s/${story.short_hash}`;
  }
  return resolveCanonicalUrl(story);
}

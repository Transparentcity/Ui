/**
 * Resolves the canonical page URL for a feed story based on its type and data.
 *
 * Routing priority:
 * 1. multi_metric / comparison → city dashboard or district page
 * 2. Single-metric stories with metric_key → metric detail page
 * 3. Single metric in metrics array → metric detail page
 * 4. Anomaly viz (no metric_key) → anomaly page
 * 5. Map viz → map page
 * 6. Research with /r/ detail_url → research page
 * 7. Default → feed story page (/feed/{id})
 */

import { slugify } from "@/lib/utils";
import type { EnrichedFeedStory } from "./mockFeedData";

const METRIC_DETAIL_CARD_TYPES = new Set([
  "alert",
  "trend",
  "safety",
  "off_the_charts",
  "milestone",
  "traction",
]);

export function resolveCanonicalUrl(story: EnrichedFeedStory): string {
  const slug = story.city_name ? slugify(story.city_name) : null;
  const district = story.district;
  const metricKey = story.metadata?.metric_key as string | undefined;
  const metrics = story.metadata?.metrics as
    | Array<{ metric_key?: string }>
    | undefined;

  // Multi-metric "This Week" / comparison → city or district page
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

/**
 * Resolves the canonical page URL for a feed story.
 *
 * All stories that the backend assigns a short_hash to land on their own
 * dedicated story page (/c/{slug}/stories/{hash}).  The legacy ladder below
 * is retained only for the handful of very old rows that lack a hash (all DB
 * stories have been backfilled, but future edge cases may still occur if a
 * story is created without the backend generating a hash).
 *
 * Routing priority:
 * 1. short_hash present → /c/{slug}/stories/{hash} (canonical); /s/{hash} fallback when slug unknown.
 * 2. Legacy no-hash: multi_metric / comparison → city or district dashboard page.
 * 3. Legacy no-hash: fall back to /feed/{id} for all other story types.
 *
 * NOTE: personal/saved-place stories are excluded server-side before they
 * reach the UI, so no client-side privacy gate is needed here.
 */

import { slugify } from "@/lib/utils";
import type { EnrichedFeedStory } from "./mockFeedData";

export function resolveCanonicalUrl(story: EnrichedFeedStory): string {
  // Prefer server-computed canonical_path when available — it is always in sync
  // with the backend routing logic and avoids any client-side slugify drift.
  if (story.canonical_path) {
    return story.canonical_path;
  }

  const slug = story.city_name ? slugify(story.city_name) : null;

  // Primary path: every story with a hash gets its own canonical page.
  if (story.short_hash) {
    if (slug) return `/c/${slug}/stories/${story.short_hash}`;
    return `/s/${story.short_hash}`;
  }

  // Legacy no-hash: multi_metric / comparison → city or district dashboard.
  const district = story.district;
  if (story.card_type === "multi_metric" || story.card_type === "comparison") {
    if (slug && district > 0) return `/c/${slug}/district/${district}`;
    if (slug) return `/c/${slug}`;
  }

  // Legacy no-hash fallback.
  return `/feed/${story.id}`;
}

/**
 * URL to share or link as the public canonical story page.
 * Identical to {@link resolveCanonicalUrl}.
 */
export function resolveOutboundCanonicalPath(story: EnrichedFeedStory): string {
  return resolveCanonicalUrl(story);
}

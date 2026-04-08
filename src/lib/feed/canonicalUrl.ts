/**
 * Resolves the canonical page URL for a feed story.
 *
 * Routing priority:
 * 1. canonical_path (server override) when available.
 * 2. multi_metric / comparison → city or district dashboard page (never story detail).
 * 3. short_hash present → /c/{slug}/stories/{hash} (canonical); /s/{hash} fallback when slug unknown.
 * 4. Legacy no-hash: fall back to /feed/{id} for all other story types.
 *
 * Multi-metric and comparison cards always route to the dashboard because
 * their story detail pages may render as unrelated content (e.g. Off the
 * Charts) which is confusing when clicking a summary card.
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
  const district = story.district;

  // Multi-metric / comparison cards always link to a dashboard page,
  // never to a story detail page (which may render as Off the Charts, etc.).
  if (story.card_type === "multi_metric" || story.card_type === "comparison") {
    if (slug && district > 0) return `/c/${slug}/district/${district}`;
    if (slug) return `/c/${slug}`;
  }

  // Primary path: every story with a hash gets its own canonical page.
  if (story.short_hash) {
    if (slug) return `/c/${slug}/stories/${story.short_hash}`;
    return `/s/${story.short_hash}`;
  }

  // Legacy no-hash fallback: city dashboard rather than auth-gated feed.
  if (slug) return `/c/${slug}`;
  return "/";
}

/**
 * URL to share or link as the public canonical story page.
 * Identical to {@link resolveCanonicalUrl}.
 */
export function resolveOutboundCanonicalPath(story: EnrichedFeedStory): string {
  return resolveCanonicalUrl(story);
}

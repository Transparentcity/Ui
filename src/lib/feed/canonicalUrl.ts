/**
 * Resolves the canonical page URL for a feed story.
 *
 * Routing priority:
 * 1. Saved-place / personal stories → authenticated `/feed/{id}` detail page.
 * 2. canonical_path (server override) when available.
 * 3. multi_metric / comparison → city or district dashboard page (never story detail).
 * 4. short_hash present → /c/{slug}/stories/{hash} (canonical); /s/{hash} fallback when slug unknown.
 * 5. Legacy no-hash: fall back to city dashboard when possible.
 *
 * Multi-metric and comparison cards always route to the dashboard because
 * their story detail pages may render as unrelated content (e.g. Off the
 * Charts) which is confusing when clicking a summary card.
 *
 * Saved-place stories are visible in authenticated feed surfaces but must not
 * resolve to public canonical story pages, which intentionally 404 for anyone
 * who does not own the saved place.
 */

import { slugify } from "@/lib/utils";
import type { EnrichedFeedStory } from "./mockFeedData";

function isPrivateFeedStory(story: EnrichedFeedStory): boolean {
  if (story.user_place_id != null) return true;

  const meta = story.metadata;
  if (!meta || typeof meta !== "object") return false;

  if (meta.category === "personal_newsletter") return true;

  const rawPlaceIds = meta.user_place_ids;
  return (
    Array.isArray(rawPlaceIds) &&
    rawPlaceIds.some((value) => Number.isFinite(Number(value)))
  );
}

export function resolveCanonicalUrl(story: EnrichedFeedStory): string {
  if (isPrivateFeedStory(story)) {
    return `/feed/${story.id}`;
  }

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

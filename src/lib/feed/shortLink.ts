/**
 * /s/{hash} short-link resolution.
 *
 * A short link must answer crawlers with a real HTTP redirect. X, Slack,
 * iMessage and Facebook never run the client-side redirect payload that a
 * streamed React page falls back to, so a 200 shell makes every shared
 * story unfurl with the site-wide default card. Keeping resolution here —
 * pure, no React — lets the route handler stay a plain 307.
 */

import { slugify } from "@/lib/utils";

/** Story fields the short link needs to build a redirect target. */
export type ShortLinkStory = {
  id: number;
  city_id?: number | null;
};

/** Sitemap city rows used to turn a story's city_id into a URL slug. */
export type ShortLinkCity = {
  id: number;
  name?: string | null;
};

/** Canonical public story page for a city slug and short hash. */
export function canonicalStoryPath(slug: string, hash: string): string {
  return `/c/${encodeURIComponent(slug)}/stories/${encodeURIComponent(hash)}`;
}

/**
 * City slug for a story, or null when the sitemap carries no matching city.
 * A story without a slug falls back to the legacy /feed/{id} page.
 */
export function resolveCitySlug(
  story: ShortLinkStory,
  cities: ShortLinkCity[] | null | undefined,
): string | null {
  if (!story.city_id || !cities) return null;
  const match = cities.find((city) => city.id === story.city_id);
  return match?.name ? slugify(match.name) : null;
}

/**
 * Normalize a query string to "?a=b" or "". Forwarded verbatim rather than
 * rebuilt: repeated keys, ordering and valueless flags all matter, and the
 * newsletter landing banner activates on a bare `?nl`.
 */
export function normalizeSearch(search: string | null | undefined): string {
  if (!search) return "";
  const query = search.startsWith("?") ? search.slice(1) : search;
  return query ? `?${query}` : "";
}

/**
 * Path a short link redirects to, query string included.
 * Query params (utm_*, nl) must survive the hop or newsletter click
 * tracking and the landing banner never see the visit.
 */
export function shortLinkRedirectPath(
  hash: string,
  story: ShortLinkStory,
  cities: ShortLinkCity[] | null | undefined,
  search?: string | null,
): string {
  const query = normalizeSearch(search);
  const slug = resolveCitySlug(story, cities);
  if (slug && hash) return `${canonicalStoryPath(slug, hash)}${query}`;
  return `/feed/${story.id}${query}`;
}

import { getApiBaseUrl, getUpstreamApiBaseUrl } from "./apiBase";

function resolveNewsletterApiBaseUrl(): string {
  if (typeof window === "undefined") {
    return getUpstreamApiBaseUrl();
  }
  return getApiBaseUrl();
}

export type NewsletterEditionData = {
  id: number;
  city_id: number;
  district: number;
  edition_date: string;
  short_hash: string;
  city_name: string | null;
  city_slug: string | null;
  subject: string;
  summary_headline: string | null;
  intro_html: string | null;
  body_html: string;
  story_ids: number[] | null;
  llm_model: string | null;
  created_at: string | null;
};

export type NewsletterEditionSitemapItem = {
  city_slug: string;
  short_hash: string;
  edition_date: string;
  district: number;
};

export async function getNewsletterEdition(
  slug: string,
  shortHash: string
): Promise<NewsletterEditionData> {
  const url = `${resolveNewsletterApiBaseUrl()}/api/newsletter/editions/by-hash/${encodeURIComponent(shortHash)}`;

  const res = await fetch(url, {
    method: "GET",
    credentials: "omit",
    headers: { Accept: "application/json" },
    next: { revalidate: 3600 },
  });

  if (!res.ok) {
    throw new Error(`Newsletter edition not found: ${res.status}`);
  }

  const edition = (await res.json()) as NewsletterEditionData;
  if (edition.city_slug && edition.city_slug !== slug) {
    throw new Error(`Newsletter edition slug mismatch: expected ${slug}, got ${edition.city_slug}`);
  }
  return edition;
}

export type NewsletterEditionPickResult = {
  shortHash: string;
  district: number;
  editionDate: string;
  citySlug: string;
};

/**
 * Pick the best newsletter edition to feature for a given city slug.
 *
 * Selection order:
 * 1. If `preferredDistrict` is provided, the most recent edition for that district.
 * 2. The most recent citywide edition (district === 0 or null treated as 0).
 * 3. The most recent edition at any district level.
 *
 * Returns null when the city has no editions at all.
 */
export function pickLatestNewsletterEdition(
  editions: NewsletterEditionSitemapItem[],
  slug: string,
  preferredDistrict?: number
): NewsletterEditionPickResult | null {
  const cityEditions = editions
    .filter((e) => e.city_slug === slug)
    .sort((a, b) => b.edition_date.localeCompare(a.edition_date));

  if (cityEditions.length === 0) return null;

  const toResult = (e: NewsletterEditionSitemapItem): NewsletterEditionPickResult => ({
    shortHash: e.short_hash,
    district: e.district ?? 0,
    editionDate: e.edition_date,
    citySlug: e.city_slug,
  });

  if (preferredDistrict !== undefined) {
    const match = cityEditions.find((e) => (e.district ?? 0) === preferredDistrict);
    if (match) return toResult(match);
  }

  const citywide = cityEditions.find((e) => (e.district ?? 0) === 0);
  if (citywide) return toResult(citywide);

  return toResult(cityEditions[0]);
}

export type FeaturedPendingNewsletterData = {
  id: number;
  subject: string;
  city_id: number | null;
  city_name: string | null;
  city_slug: string | null;
  district: number;
  draft_type: string | null;
  created_at: string | null;
  display_html: string;
};

export async function getFeaturedPendingNewsletter(
  pendingId: number
): Promise<FeaturedPendingNewsletterData> {
  const url = `${resolveNewsletterApiBaseUrl()}/api/newsletter/featured-pending/${pendingId}`;

  const res = await fetch(url, {
    method: "GET",
    credentials: "omit",
    headers: { Accept: "application/json" },
    next: { revalidate: 3600 },
  });

  if (!res.ok) {
    throw new Error(`Featured newsletter not found: ${res.status}`);
  }

  return res.json() as Promise<FeaturedPendingNewsletterData>;
}

export async function listNewsletterEditionsForSitemap(): Promise<NewsletterEditionSitemapItem[]> {
  const url = `${resolveNewsletterApiBaseUrl()}/api/newsletter/editions/sitemap`;

  try {
    const res = await fetch(url, {
      method: "GET",
      credentials: "omit",
      headers: { Accept: "application/json" },
      next: { revalidate: 3600 },
    });
    if (!res.ok) return [];
    return res.json() as Promise<NewsletterEditionSitemapItem[]>;
  } catch {
    return [];
  }
}

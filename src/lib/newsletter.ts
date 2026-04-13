import { API_BASE } from "./apiBase";

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
  const url = `${API_BASE}/api/newsletter/editions/by-hash/${encodeURIComponent(shortHash)}`;

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

export async function listNewsletterEditionsForSitemap(): Promise<NewsletterEditionSitemapItem[]> {
  const url = `${API_BASE}/api/newsletter/editions/sitemap`;

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

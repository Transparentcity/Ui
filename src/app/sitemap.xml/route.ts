import type { MetadataRoute } from "next";

import {
  listPublicCitiesForSitemap,
  listPublicFeedStories,
  listPublicMapsForSitemap,
  listPublicMetricsForSitemap,
  listPublicCityDistrictsForSitemap,
  type PublicCitySitemapItem,
  type PublicFeedStory,
} from "@/lib/publicApiClient";
import { listNewsletterEditionsForSitemap } from "@/lib/newsletter";
import { getSiteOrigin } from "@/lib/siteUrl";
import { slugify } from "@/lib/utils";

export const revalidate = 3600;

type SitemapEntry = {
  loc: string;
  changefreq?: MetadataRoute.Sitemap[number]["changeFrequency"];
  priority?: number;
};

function hasText(value: string | null | undefined): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

/** Public city path segment: API `slug` when set, else slugified display name. */
/**
 * Metrics and districts public sitemaps return `city_slug` aligned with each
 * city's `slug` from `/api/public/cities/sitemap`. Use this to gate URLs on
 * launched cities only.
 */
function launchedCitySlugFromApiCitySlug(
  cities: PublicCitySitemapItem[],
  apiCitySlug: string | null | undefined
): string | null {
  if (!hasText(apiCitySlug)) return null;
  const seg = apiCitySlug.trim();
  const match = cities.find(
    (c) =>
      c.is_launched &&
      (hasText(c.slug) ? c.slug.trim() : slugify(c.name)) === seg
  );
  return match ? seg : null;
}

function launchedCitySlug(
  cities: PublicCitySitemapItem[],
  opts: { cityId?: number | null; cityName?: string | null }
): string | null {
  let city: PublicCitySitemapItem | undefined;
  if (opts.cityId != null && Number.isFinite(Number(opts.cityId))) {
    city = cities.find((c) => c.id === opts.cityId);
  }
  if (!city && opts.cityName) {
    const target = slugify(opts.cityName);
    city = cities.find((c) => slugify(c.name) === target);
  }
  if (!city?.is_launched) return null;
  const fromApi = city.slug?.trim();
  const s = fromApi && fromApi.length > 0 ? fromApi : slugify(city.name);
  return hasText(s) ? s : null;
}

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function toSitemapXml(entries: SitemapEntry[]): string {
  const urls = entries
    .map((entry) => {
      const loc = `<loc>${escapeXml(entry.loc)}</loc>`;
      const changefreq = entry.changefreq
        ? `<changefreq>${entry.changefreq}</changefreq>`
        : "";
      const priority =
        entry.priority !== undefined
          ? `<priority>${entry.priority.toFixed(1)}</priority>`
          : "";

      return `<url>${loc}${changefreq}${priority}</url>`;
    })
    .join("");

  return (
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">` +
    urls +
    `</urlset>`
  );
}

/** Paginate public feed until exhausted (cap pages for safety). */
async function fetchAllPublicStoriesForSitemap(): Promise<PublicFeedStory[]> {
  const pageSize = 200;
  const acc: PublicFeedStory[] = [];
  const maxOffset = 50_000;

  for (let offset = 0; offset <= maxOffset; offset += pageSize) {
    let page: PublicFeedStory[] = [];
    try {
      const res = await listPublicFeedStories({
        limit: pageSize,
        offset,
        order_by: "published_at",
      });
      page = res.stories ?? [];
    } catch {
      break;
    }
    acc.push(...page);
    if (page.length < pageSize) break;
  }
  return acc;
}

function dedupeByLoc(entries: SitemapEntry[]): SitemapEntry[] {
  const seen = new Set<string>();
  const out: SitemapEntry[] = [];
  for (const e of entries) {
    if (seen.has(e.loc)) continue;
    seen.add(e.loc);
    out.push(e);
  }
  return out;
}

export async function GET(): Promise<Response> {
  const origin = getSiteOrigin();

  const [cities, maps, metrics, districts, feedStories] = await Promise.all([
    listPublicCitiesForSitemap().catch(() => []),
    listPublicMapsForSitemap().catch(() => []),
    listPublicMetricsForSitemap().catch(() => []),
    listPublicCityDistrictsForSitemap().catch(() => []),
    fetchAllPublicStoriesForSitemap().catch(() => []),
  ]);

  let newsletterEditions: Awaited<ReturnType<typeof listNewsletterEditionsForSitemap>> = [];
  try {
    newsletterEditions = await listNewsletterEditionsForSitemap();
  } catch {
    // Non-critical, continue without newsletter entries
  }

  const cityEntries: SitemapEntry[] = cities.flatMap((city) => {
    const citySlug = launchedCitySlug(cities, { cityId: city.id, cityName: city.name });
    if (!citySlug) return [];

    return [
      {
        loc: `${origin}/c/${citySlug}`,
        changefreq: "weekly",
        priority: 0.7,
      },
    ];
  });

  const getPageEntries: SitemapEntry[] = cities.flatMap((city) => {
    const citySlug = launchedCitySlug(cities, { cityId: city.id, cityName: city.name });
    if (!citySlug) return [];
    return [
      {
        loc: `${origin}/get/${citySlug}`,
        changefreq: "weekly",
        priority: 0.8,
      },
    ];
  });

  const methodologyEntries: SitemapEntry[] = cities.flatMap((city) => {
    const citySlug = launchedCitySlug(cities, { cityId: city.id, cityName: city.name });
    if (!citySlug) return [];
    return [
      {
        loc: `${origin}/c/${citySlug}/methodology`,
        changefreq: "monthly",
        priority: 0.55,
      },
    ];
  });

  const categorySeen = new Set<string>();
  const categoryEntries: SitemapEntry[] = [];
  for (const metric of metrics) {
    if (!hasText(metric.category)) continue;
    const citySlug = launchedCitySlugFromApiCitySlug(cities, metric.city_slug);
    if (!citySlug) continue;
    const key = `${citySlug}::${metric.category}`;
    if (categorySeen.has(key)) continue;
    categorySeen.add(key);
    categoryEntries.push({
      loc: `${origin}/c/${citySlug}/category/${encodeURIComponent(metric.category)}`,
      changefreq: "weekly",
      priority: 0.65,
    });
  }

  const metricEntries: SitemapEntry[] = metrics.flatMap((metric) => {
    const citySlug = launchedCitySlugFromApiCitySlug(cities, metric.city_slug);
    if (!citySlug || !hasText(metric.metric_key)) return [];

    return [
      {
        loc: `${origin}/c/${citySlug}/metrics/${metric.metric_key}`,
        changefreq: "daily",
        priority: 0.8,
      },
    ];
  });

  const districtEntries: SitemapEntry[] = districts.flatMap((district) => {
    const citySlug = launchedCitySlugFromApiCitySlug(cities, district.city_slug);
    if (!citySlug || !hasText(district.representative_slug)) return [];

    return [
      {
        loc: `${origin}/c/${citySlug}/district/${district.district}/${district.representative_slug}`,
        changefreq: "weekly",
        priority: 0.7,
      },
    ];
  });

  const mapEntries: SitemapEntry[] = maps.flatMap((map) => {
    if (!hasText(map.short_hash)) return [];

    return [
      {
        loc: `${origin}/m/${map.short_hash}`,
        changefreq: "monthly",
        priority: 0.5,
      },
    ];
  });

  const newsletterEntries: SitemapEntry[] = newsletterEditions.flatMap((edition) => {
    if (!hasText(edition.city_slug) || !hasText(edition.short_hash)) return [];

    return [
      {
        loc: `${origin}/c/${edition.city_slug}/newsletter/${edition.short_hash}`,
        changefreq: "never",
        priority: 0.5,
      },
    ];
  });

  const storyEntries: SitemapEntry[] = feedStories.flatMap((story) => {
    if (!hasText(story.short_hash)) return [];
    const citySlug = launchedCitySlug(cities, {
      cityId: story.city_id,
      cityName: story.city_name,
    });
    if (!citySlug) return [];
    return [
      {
        loc: `${origin}/c/${citySlug}/stories/${story.short_hash}`,
        changefreq: "weekly",
        priority: 0.75,
      },
    ];
  });

  const entries = dedupeByLoc([
    { loc: `${origin}/`, changefreq: "weekly", priority: 1.0 },
    { loc: `${origin}/sitemap`, changefreq: "daily", priority: 0.8 },
    ...cityEntries,
    ...getPageEntries,
    ...methodologyEntries,
    ...categoryEntries,
    ...metricEntries,
    ...districtEntries,
    ...storyEntries,
    ...mapEntries,
    ...newsletterEntries,
  ]);

  const xml = toSitemapXml(entries);

  return new Response(xml, {
    headers: {
      "content-type": "application/xml; charset=utf-8",
    },
  });
}

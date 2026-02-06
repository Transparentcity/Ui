import type { MetadataRoute } from "next";

import {
  listPublicCitiesForSitemap,
  listPublicMapsForSitemap,
  getPublicCityDetail,
} from "@/lib/publicApiClient";
import { getSiteOrigin } from "@/lib/siteUrl";

export const revalidate = 3600;

type SitemapEntry = {
  loc: string;
  changefreq?: MetadataRoute.Sitemap[number]["changeFrequency"];
  priority?: number;
};

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

  return `<?xml version="1.0" encoding="UTF-8"?>` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">` +
    urls +
    `</urlset>`;
}

export async function GET(): Promise<Response> {
  const origin = getSiteOrigin();

  // Fetch cities
  let cities: Awaited<ReturnType<typeof listPublicCitiesForSitemap>> = [];
  try {
    cities = await listPublicCitiesForSitemap();
  } catch {
    // If the backend is temporarily unavailable, still emit a valid sitemap
    // containing the marketing pages. Search engines will retry.
  }

  // Fetch public maps
  let maps: Awaited<ReturnType<typeof listPublicMapsForSitemap>> = [];
  try {
    maps = await listPublicMapsForSitemap();
  } catch {
    // If the backend is temporarily unavailable, continue without maps
  }

  const cityEntries: SitemapEntry[] = cities.map((city) => ({
    // Slugs can collide (e.g. multiple "Kansas City"). Include stable id to disambiguate.
    loc: `${origin}/c/${city.slug}?id=${city.id}`,
    changefreq: "weekly",
    priority: 0.6,
  }));

  const mapEntries: SitemapEntry[] = maps.map((map) => ({
    loc: `${origin}/m/${map.short_hash}`,
    changefreq: "monthly",
    priority: 0.5,
  }));

  const categoryEntries: SitemapEntry[] = [];
  for (const city of cities) {
    try {
      const cityDetail = await getPublicCityDetail(city.id);
      if (cityDetail?.metrics?.length) {
        const categories = [
          ...new Set(
            cityDetail.metrics
              .map((m) => m.category)
              .filter((c): c is string => Boolean(c))
          ),
        ];
        for (const cat of categories) {
          categoryEntries.push({
            loc: `${origin}/c/${city.slug}/category/${encodeURIComponent(cat)}?id=${city.id}`,
            changefreq: "weekly",
            priority: 0.5,
          });
        }
      }
    } catch {
      // Skip this city's categories if detail fetch fails
    }
  }

  const entries: SitemapEntry[] = [
    { loc: `${origin}/`, changefreq: "weekly", priority: 1.0 },
    { loc: `${origin}/sitemap`, changefreq: "daily", priority: 0.8 },
    { loc: `${origin}/landing`, changefreq: "monthly", priority: 0.4 },
    ...cityEntries,
    ...categoryEntries,
    ...mapEntries,
  ];

  const xml = toSitemapXml(entries);

  return new Response(xml, {
    headers: {
      "content-type": "application/xml; charset=utf-8",
    },
  });
}













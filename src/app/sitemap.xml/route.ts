import type { MetadataRoute } from "next";

import { listPublicCitiesForSitemap } from "@/lib/publicApiClient";
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

  let cities: Awaited<ReturnType<typeof listPublicCitiesForSitemap>> = [];
  try {
    cities = await listPublicCitiesForSitemap();
  } catch {
    // If the backend is temporarily unavailable, still emit a valid sitemap
    // containing the marketing pages. Search engines will retry.
  }

  const cityEntries: SitemapEntry[] = cities.map((city) => ({
    // Slugs can collide (e.g. multiple "Kansas City"). Include stable id to disambiguate.
    loc: `${origin}/c/${city.slug}?id=${city.id}`,
    changefreq: "weekly",
    priority: 0.6,
  }));

  const entries: SitemapEntry[] = [
    { loc: `${origin}/`, changefreq: "weekly", priority: 1.0 },
    { loc: `${origin}/sitemap`, changefreq: "daily", priority: 0.8 },
    { loc: `${origin}/landing`, changefreq: "monthly", priority: 0.4 },
    ...cityEntries,
  ];

  const xml = toSitemapXml(entries);

  return new Response(xml, {
    headers: {
      "content-type": "application/xml; charset=utf-8",
    },
  });
}



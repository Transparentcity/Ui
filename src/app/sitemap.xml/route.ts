import type { MetadataRoute } from "next";

import {
  listPublicCitiesForSitemap,
  listPublicMapsForSitemap,
  listPublicMetricsForSitemap,
  listPublicCityDistrictsForSitemap,
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

export async function GET(): Promise<Response> {
  const origin = getSiteOrigin();

  // Fetch all public data in parallel; fall back gracefully if backend is down.
  const [cities, maps, metrics, districts] = await Promise.all([
    listPublicCitiesForSitemap().catch(() => []),
    listPublicMapsForSitemap().catch(() => []),
    listPublicMetricsForSitemap().catch(() => []),
    listPublicCityDistrictsForSitemap().catch(() => []),
  ]);

  // Fetch newsletter editions for sitemap
  let newsletterEditions: Awaited<ReturnType<typeof listNewsletterEditionsForSitemap>> = [];
  try {
    newsletterEditions = await listNewsletterEditionsForSitemap();
  } catch {
    // Non-critical, continue without newsletter entries
  }

  const cityEntries: SitemapEntry[] = cities.map((city) => ({
    // Clean slug URL — no ?id= query param.
    loc: `${origin}/c/${slugify(city.name)}`,
    changefreq: "weekly",
    priority: 0.7,
  }));

  const metricEntries: SitemapEntry[] = metrics.map((m) => ({
    loc: `${origin}/c/${slugify(m.city_name)}/metrics/${m.metric_key}`,
    changefreq: "daily",
    priority: 0.8,
  }));

  const districtEntries: SitemapEntry[] = districts.map((d) => ({
    loc: `${origin}/c/${slugify(d.city_name)}/district/${d.district}`,
    changefreq: "weekly",
    priority: 0.7,
  }));

  const mapEntries: SitemapEntry[] = maps.map((map) => ({
    loc: `${origin}/m/${map.short_hash}`,
    changefreq: "monthly",
    priority: 0.5,
  }));

  const newsletterEntries: SitemapEntry[] = newsletterEditions.map((e) => ({
    loc: `${origin}/c/${e.city_slug}/newsletter/${e.short_hash}`,
    changefreq: "never",
    priority: 0.5,
  }));

  // NOTE: Avoid per-city detail fetches here. During `next build`, this route
  // can be invoked for static generation and backend calls can easily exceed
  // the 60s route build timeout (N+1 calls). We keep the sitemap useful
  // without category pages; search engines can still discover them via links.

  const entries: SitemapEntry[] = [
    { loc: `${origin}/`, changefreq: "weekly", priority: 1.0 },
    { loc: `${origin}/sitemap`, changefreq: "daily", priority: 0.8 },
    ...metricEntries,
    ...cityEntries,
    ...districtEntries,
    ...mapEntries,
    ...newsletterEntries,
  ];

  const xml = toSitemapXml(entries);

  return new Response(xml, {
    headers: {
      "content-type": "application/xml; charset=utf-8",
    },
  });
}

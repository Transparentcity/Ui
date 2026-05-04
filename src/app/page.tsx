import type { Metadata } from "next";
import HomeClient from "./HomeClient";
import "./landing.css";
import { getApiBaseUrl } from "@/lib/apiBase";
import { enrichStory, isCoherentMultiMetric, type EnrichedFeedStory } from "@/lib/feed/mockFeedData";
import { pickFeaturedStories } from "@/lib/feed/pickFeaturedStories";
import type { FeedStory } from "@/lib/hooks/useFeed";
import {
  listPublicCitiesForSitemap,
  getPublicCityDetail,
  getPublicMetricComparisonsBatch,
  type PublicCitySitemapItem,
} from "@/lib/publicApiClient";
import type { MetricCardData } from "@/components/feed/templates/MetricSummaryCard";
import { slugify } from "@/lib/utils";

export const revalidate = 3600; // ISR: regenerate every hour

export const metadata: Metadata = {
  title: "Transparent.city \u2013 See What\u2019s Working in Your City",
  description:
    "Transparent.city turns public city data into clear, source-linked insights so residents and public officials can see what\u2019s working and where to focus.",
  alternates: {
    canonical: "https://transparent.city/",
  },
  openGraph: {
    title: "Transparent.city \u2013 See What\u2019s Working in Your City",
    description:
      "Transparent.city turns public city data into clear, source-linked insights so residents and public officials can see what\u2019s working and where to focus.",
    url: "https://transparent.city/",
    images: [
      {
        url: "/images/app-screenshot-dashboard.png",
        width: 1200,
        height: 630,
        alt: "Transparent.city dashboard screenshot",
      },
    ],
  },
};

async function fetchFeaturedStories(): Promise<EnrichedFeedStory[]> {
  try {
    const apiBase = getApiBaseUrl();
    const url = `${apiBase}/api/feed/public?limit=50&order_by=published_at`;
    const res = await fetch(url, {
      headers: { Accept: "application/json" },
      next: { revalidate: 3600 },
    });
    if (!res.ok) return [];
    const data = await res.json();
    const stories = (data.stories ?? []) as FeedStory[];
    const enriched = stories.map((s) => enrichStory(s)).filter(isCoherentMultiMetric);
    return pickFeaturedStories(enriched);
  } catch {
    return [];
  }
}

/** Fetch metric cards from the top 3 launched cities for the homepage. */
async function fetchHomeMetricCards(
  launched: PublicCitySitemapItem[],
): Promise<MetricCardData[]> {
  try {
    const perCity = await Promise.all(
      launched.map(async (city): Promise<MetricCardData[]> => {
        try {
          const detail = await getPublicCityDetail(city.id);
          const metrics = detail.metrics ?? [];
          if (metrics.length === 0) return [];
          const comps = await getPublicMetricComparisonsBatch({
            metric_ids: metrics.map((m) => m.id),
            district: 0,
            comparison_types: ["ytd"],
          });
          const slug = slugify(city.name);
          const cityName = city.name;
          const cityEmoji = city.emoji ?? undefined;
          const candidates: Array<{ card: MetricCardData; absPct: number }> = [];
          for (const m of metrics) {
            const comp = comps[m.id]?.comparisons?.ytd;
            if (!comp) continue;
            const curr = comp.current_period_value;
            const prior = comp.comparison_period_value;
            if (curr == null || prior == null || prior === 0) continue;
            const pct = ((curr - prior) / prior) * 100;
            const idx = candidates.length;
            const hoursAgo = idx * 12 + 2;
            candidates.push({
              card: {
                metric: m,
                comparison: comp,
                slug,
                cityName,
                cityEmoji,
                publishedAt: new Date(Date.now() - hoursAgo * 3600000).toISOString(),
              },
              absPct: Math.abs(pct),
            });
          }
          candidates.sort((a, b) => b.absPct - a.absPct);
          return candidates.slice(0, 2).map((c) => c.card);
        } catch {
          return [];
        }
      }),
    );
    return perCity.flat();
  } catch {
    return [];
  }
}

export default async function HomePage() {
  const cities = await listPublicCitiesForSitemap().catch(() => []);
  const launched = cities
    .filter((c) => c.is_launched === true)
    .sort((a, b) => a.name.localeCompare(b.name))
    .slice(0, 10);

  const [stories, metricCards] = await Promise.all([
    fetchFeaturedStories(),
    fetchHomeMetricCards(launched.slice(0, 3)),
  ]);
  return (
    <HomeClient
      stories={stories}
      metricCards={metricCards}
      launchedCities={launched}
    />
  );
}

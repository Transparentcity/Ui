import type { Metadata } from "next";
import HomeClient from "./HomeClient";
import "./landing.css";
import { getApiBaseUrl } from "@/lib/apiBase";
import { enrichStory, isCoherentMultiMetric, type EnrichedFeedStory } from "@/lib/feed/mockFeedData";
import { pickFeaturedStories } from "@/lib/feed/pickFeaturedStories";
import type { FeedStory } from "@/lib/hooks/useFeed";

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
    const url = `${apiBase}/api/feed/public?limit=200&order_by=published_at`;
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

export default async function HomePage() {
  const stories = await fetchFeaturedStories();
  return <HomeClient stories={stories} />;
}

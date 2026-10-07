import { ImageResponse } from "next/og";

import { getUpstreamApiBaseUrl } from "@/lib/apiBase";
import { getPublicFeedStoryByHash, getPublicTimeSeriesChart } from "@/lib/publicApiClient";
import { improveGenericHeadline } from "@/lib/feed/headlineCleanup";
import {
  STORY_CARD_HEIGHT,
  STORY_CARD_WIDTH,
  formatCardDate,
  headlineFontSize,
  truncateHeadline,
  upstreamStoryImageUrl,
} from "@/lib/feed/storyCardImage";
import { loadStoryChartCard, storyChartTarget } from "@/lib/feed/storyChartCard";

import { StoryChartCardImage } from "./chartCard";

export const runtime = "edge";

/**
 * Social-card image for a story. In order of preference:
 *
 * 1. Chart stories: the chart redrawn over the story's own window (this year
 *    vs last year for YTD stories, the last two years of months otherwise),
 *    not the backend image's full history. See src/lib/feed/storyChartCard.ts.
 * 2. The backend's chart or map image.
 * 3. A generated headline card.
 *
 * Every story's og:image / twitter:image points here rather than at the
 * backend image URL, which sits under the /api prefix that robots.txt
 * disallows (see src/lib/feed/storyCardImage.ts). Upstream trouble falls back
 * to the headline card, so a preview never lands on a broken image.
 *
 * Deliberately a plain route handler rather than the opengraph-image file
 * convention: that convention overrides config metadata for every story.
 */

type RouteContext = { params: Promise<{ slug: string; hash: string }> };

const HASH_RE = /^[A-Za-z0-9_-]{1,64}$/;

/**
 * Card images are versioned by the story's last update (?v=...), so they can
 * sit in caches for a while; the CDN keeps serving one while it revalidates.
 */
const CARD_CACHE_CONTROL = "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800";

/**
 * Stream the backend's story image through this route. Returns null on any
 * doubt (upstream error, non-image body, network failure) so the caller draws
 * the headline card instead.
 */
async function proxyStoryImage(url: string): Promise<Response | null> {
  let upstream: Response;
  try {
    upstream = await fetch(url, { headers: { Accept: "image/*" }, cache: "no-store" });
  } catch {
    return null;
  }
  const contentType = upstream.headers.get("content-type") ?? "";
  if (!upstream.ok || !contentType.startsWith("image/") || !upstream.body) return null;
  return new Response(upstream.body, {
    status: 200,
    headers: { "content-type": contentType, "cache-control": CARD_CACHE_CONTROL },
  });
}

type PublicStory = Awaited<ReturnType<typeof getPublicFeedStoryByHash>>["story"];

/**
 * The story's chart cut to its window, or null on any doubt (not a chart
 * story, unsupported series, upstream error, render failure) so the caller
 * falls back to the backend image.
 */
async function renderWindowedChartCard(story: PublicStory, cityName: string): Promise<Response | null> {
  const target = storyChartTarget(story);
  if (!target) return null;
  try {
    const loaded = await loadStoryChartCard(target, getPublicTimeSeriesChart);
    if (!loaded) return null;
    const image = new ImageResponse(
      <StoryChartCardImage card={loaded.card} metricName={loaded.metricName} cityName={cityName} />,
      { width: STORY_CARD_WIDTH, height: STORY_CARD_HEIGHT },
    );
    // ImageResponse renders lazily; buffer it so a satori error falls back
    // instead of sending a 200 with an empty body.
    const body = await image.arrayBuffer();
    if (body.byteLength === 0) return null;
    return new Response(body, {
      status: 200,
      headers: { "content-type": "image/png", "cache-control": CARD_CACHE_CONTROL },
    });
  } catch {
    return null;
  }
}

function titleCaseSlug(slug: string): string {
  return slug
    .split("-")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export async function GET(_request: Request, context: RouteContext): Promise<Response> {
  const { slug, hash } = await context.params;
  if (!HASH_RE.test(hash)) return new Response("Invalid story hash", { status: 400 });

  let story: PublicStory | null = null;
  try {
    story = (await getPublicFeedStoryByHash(hash)).story;
  } catch {
    story = null;
  }

  if (!story) return new Response("Story not found", { status: 404 });

  const cityName = story.city_name || titleCaseSlug(slug);

  const chartCard = await renderWindowedChartCard(story, cityName);
  if (chartCard) return chartCard;

  // Stories with a chart or map show it; the rest get the headline card.
  const imageUrl = upstreamStoryImageUrl(story.image_url, getUpstreamApiBaseUrl());
  if (imageUrl) {
    const proxied = await proxyStoryImage(imageUrl);
    if (proxied) return proxied;
  }

  const headline = improveGenericHeadline(story.headline ?? "", {
    summary: story.summary,
    description: story.description,
    cityName: story.city_name,
  });
  const dateLabel = formatCardDate(story.published_at ?? story.story_date);

  const text = truncateHeadline(headline || `City data from ${cityName}`);
  const fontSize = headlineFontSize(text);

  return new ImageResponse(
    (
      <div
        style={{
          width: STORY_CARD_WIDTH,
          height: STORY_CARD_HEIGHT,
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          backgroundColor: "#0f1117",
          padding: "56px 72px",
          fontFamily: "system-ui, sans-serif",
        }}
      >
        {/* Top bar */}
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div
            style={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              backgroundColor: "#3b82f6",
            }}
          />
          <span style={{ color: "#6b7280", fontSize: 18, letterSpacing: "0.05em" }}>
            transparent.city
          </span>
          <span style={{ color: "#374151", fontSize: 18 }}>/</span>
          <span
            style={{
              color: "#3b82f6",
              fontSize: 16,
              backgroundColor: "#1e3a5f",
              padding: "4px 12px",
              borderRadius: 6,
              textTransform: "uppercase",
              letterSpacing: "0.08em",
            }}
          >
            {cityName}
          </span>
        </div>

        {/* Headline */}
        <div
          style={{
            display: "flex",
            fontSize,
            fontWeight: 700,
            color: "#f9fafb",
            lineHeight: 1.12,
            maxWidth: 1050,
          }}
        >
          {text}
        </div>

        {/* Bottom bar */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <span style={{ color: "#4b5563", fontSize: 18 }}>
            {dateLabel ? `${dateLabel} · Public data, source-linked` : "Public data, source-linked"}
          </span>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              color: "#f9fafb",
              fontSize: 18,
              fontWeight: 600,
            }}
          >
            <div
              style={{
                width: 28,
                height: 28,
                borderRadius: 6,
                backgroundColor: "#3b82f6",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 14,
                color: "#fff",
              }}
            >
              T
            </div>
            Transparent.city
          </div>
        </div>
      </div>
    ),
    {
      width: STORY_CARD_WIDTH,
      height: STORY_CARD_HEIGHT,
      headers: { "Cache-Control": CARD_CACHE_CONTROL },
    },
  );
}

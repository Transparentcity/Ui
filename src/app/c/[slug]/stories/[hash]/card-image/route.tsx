import { ImageResponse } from "next/og";

import { getPublicFeedStoryByHash } from "@/lib/publicApiClient";
import { improveGenericHeadline } from "@/lib/feed/headlineCleanup";
import {
  STORY_CARD_HEIGHT,
  STORY_CARD_WIDTH,
  formatCardDate,
  headlineFontSize,
  truncateHeadline,
} from "@/lib/feed/storyCardImage";

export const runtime = "edge";

/**
 * Generated social-card image for stories that have no chart or map.
 *
 * Referenced from the story page's og:image / twitter:image only when the
 * backend supplied no image_url (see resolveStorySocialImage). Deliberately a
 * plain route handler rather than the opengraph-image file convention: that
 * convention overrides config metadata for every story, including the ones
 * that have a real image.
 */

type RouteContext = { params: Promise<{ slug: string; hash: string }> };

const HASH_RE = /^[A-Za-z0-9_-]{1,64}$/;

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

  let headline = "";
  let cityName = titleCaseSlug(slug);
  let dateLabel = "";
  let found = false;

  try {
    const { story } = await getPublicFeedStoryByHash(hash);
    found = true;
    headline = improveGenericHeadline(story.headline ?? "", {
      summary: story.summary,
      description: story.description,
      cityName: story.city_name,
    });
    if (story.city_name) cityName = story.city_name;
    dateLabel = formatCardDate(story.published_at ?? story.story_date);
  } catch {
    // Unknown or unreachable story: still return a branded card so the
    // preview never falls back to a broken image.
  }

  if (!found) return new Response("Story not found", { status: 404 });

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
      headers: {
        "Cache-Control": "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800",
      },
    },
  );
}

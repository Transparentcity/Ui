/**
 * Social-card image selection for story pages.
 *
 * Every story's og:image / twitter:image points at
 * `/c/{slug}/stories/{hash}/card-image`. That route serves the backend's
 * chart or map when the story has one, and a generated headline card when it
 * does not, so a link preview always carries a large image.
 *
 * Why the meta tags never point at the backend image directly: those images
 * live under `/api/...`, and robots.txt disallows `/api`. The narrower
 * `Allow: /api/feed/public/story-image/` only helps crawlers that resolve
 * robots rules longest-match-wins, and X's Twitterbot kept serving image-less
 * cards with that Allow in place. Serving the image from the story's own path
 * takes robots.txt out of the picture. It also gives X a URL it has never
 * cached a failure against, and covers story images on other backend paths
 * (e.g. /api/time-series/...) that the Allow line never matched.
 */

export const STORY_CARD_WIDTH = 1200;
export const STORY_CARD_HEIGHT = 630;

/** Longest headline the card will show; longer text is cut with an ellipsis. */
export const STORY_CARD_HEADLINE_MAX = 160;

export type StoryCardSource = {
  image_url?: string | null;
  updated_at?: string | null;
  published_at?: string | null;
};

export type StorySocialImage = {
  /** Path for og:image / twitter:image (resolved against metadataBase). */
  url: string;
  /** Twitter card type. Always large: either the story image or the generated card. */
  card: "summary_large_image";
  /** True when the route will draw a headline card rather than a story image. */
  generated: boolean;
};

export function storyCardImagePath(slug: string, hash: string): string {
  return `/c/${slug}/stories/${hash}/card-image`;
}

/**
 * Version token for a story's card image, derived from the story's last
 * update. Returns "" when no usable timestamp exists.
 */
export function storyImageVersion(story: StoryCardSource): string {
  const raw = story.updated_at || story.published_at || "";
  const ms = raw ? Date.parse(raw) : NaN;
  if (Number.isNaN(ms)) return "";
  return Math.floor(ms / 1000).toString(36);
}

/**
 * Social image for a story: always the card-image route, versioned by the
 * story's last update so crawlers refetch after an edit. X caches a card's
 * image by URL, including failures, so a stale token would keep an old
 * image-less card alive.
 */
export function resolveStorySocialImage(
  story: StoryCardSource,
  slug: string,
  hash: string,
): StorySocialImage {
  const path = storyCardImagePath(slug, hash);
  const version = storyImageVersion(story);
  return {
    url: version ? `${path}?v=${version}` : path,
    card: "summary_large_image",
    generated: (story.image_url ?? "").trim() === "",
  };
}

/**
 * Absolute URL of the backend image behind a story's `image_url`, for the
 * card-image route to fetch. Backend-relative paths (`/api/feed/public/...`,
 * `/api/time-series/...`) hang off the API origin; absolute http(s) URLs are
 * used as-is. Anything else returns "" and the caller draws a headline card.
 */
export function upstreamStoryImageUrl(
  imageUrl: string | null | undefined,
  apiOrigin: string,
): string {
  const raw = (imageUrl ?? "").trim();
  if (!raw) return "";
  if (/^https?:\/\//i.test(raw)) return raw;
  // "//host/path" is protocol-relative, not a backend path: don't guess.
  if (!raw.startsWith("/") || raw.startsWith("//")) return "";
  return `${apiOrigin.replace(/\/+$/, "")}${raw}`;
}

/** Trim to the card's length budget on a word boundary where possible. */
export function truncateHeadline(headline: string, max = STORY_CARD_HEADLINE_MAX): string {
  const text = headline.replace(/\s+/g, " ").trim();
  if (text.length <= max) return text;
  const cut = text.slice(0, max - 1);
  const lastSpace = cut.lastIndexOf(" ");
  const base = lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut;
  return `${base.replace(/[\s,;:.-]+$/, "")}…`;
}

/**
 * Font size that keeps the headline to roughly three lines at 1050px wide.
 * Steps down as the text gets longer rather than overflowing the card.
 */
export function headlineFontSize(headline: string): number {
  const len = headline.length;
  if (len <= 50) return 64;
  if (len <= 80) return 56;
  if (len <= 115) return 48;
  return 40;
}

/** "Sep 5, 2026" style date for the card footer; empty when unparseable. */
export function formatCardDate(value: string | null | undefined): string {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

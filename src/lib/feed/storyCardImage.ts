/**
 * Social-card image selection for story pages.
 *
 * Stories with a backend-rendered chart or map use that image. Stories
 * without one fall back to a generated headline card served from
 * /c/{slug}/stories/{hash}/card-image so link previews on X and elsewhere
 * still get a large image instead of a bare summary card.
 */

export const STORY_CARD_WIDTH = 1200;
export const STORY_CARD_HEIGHT = 630;

/** Longest headline the card will show; longer text is cut with an ellipsis. */
export const STORY_CARD_HEADLINE_MAX = 160;

export type StoryCardSource = {
  image_url?: string | null;
};

export type StorySocialImage = {
  /** Path or URL for og:image / twitter:image (relative paths resolve via metadataBase). */
  url: string;
  /** Twitter card type. Always large: either the real image or the generated fallback. */
  card: "summary_large_image";
  /** True when the URL is the generated headline card rather than a story image. */
  generated: boolean;
};

export function storyCardImagePath(slug: string, hash: string): string {
  return `/c/${slug}/stories/${hash}/card-image`;
}

export function resolveStorySocialImage(
  story: StoryCardSource,
  slug: string,
  hash: string,
): StorySocialImage {
  const real = (story.image_url ?? "").trim();
  if (real) return { url: real, card: "summary_large_image", generated: false };
  return { url: storyCardImagePath(slug, hash), card: "summary_large_image", generated: true };
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

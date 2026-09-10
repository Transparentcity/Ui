import { describe, it, expect } from "vitest";

import {
  STORY_CARD_HEADLINE_MAX,
  formatCardDate,
  headlineFontSize,
  resolveStorySocialImage,
  storyCardImagePath,
  storyImageVersion,
  truncateHeadline,
  upstreamStoryImageUrl,
} from "./storyCardImage";

describe("resolveStorySocialImage", () => {
  it("points every story at its own card-image route, never at /api", () => {
    const withImage = resolveStorySocialImage(
      { image_url: "/api/feed/public/story-image/O5LjXq8T" },
      "seattle",
      "O5LjXq8T",
    );
    expect(withImage).toEqual({
      url: "/c/seattle/stories/O5LjXq8T/card-image",
      card: "summary_large_image",
      generated: false,
    });
    expect(withImage.url.startsWith("/api")).toBe(false);
  });

  it("versions the card URL by the story's last update", () => {
    const r = resolveStorySocialImage(
      {
        image_url: "/api/feed/public/story-image/AvhaOxL5",
        updated_at: "2026-08-31T23:09:27.081774",
        published_at: "2026-08-30T06:26:20.434419",
      },
      "oakland",
      "AvhaOxL5",
    );
    expect(r.url).toMatch(/^\/c\/oakland\/stories\/AvhaOxL5\/card-image\?v=[0-9a-z]+$/);

    const later = resolveStorySocialImage(
      { image_url: "/api/feed/public/story-image/AvhaOxL5", updated_at: "2026-09-06T10:00:00Z" },
      "oakland",
      "AvhaOxL5",
    );
    expect(later.url).not.toBe(r.url);
  });

  it("marks stories with no backend image as generated", () => {
    for (const image_url of [null, undefined, "", "   "]) {
      const r = resolveStorySocialImage({ image_url }, "new-york-city", "lHBaq1hn");
      expect(r.url).toBe("/c/new-york-city/stories/lHBaq1hn/card-image");
      expect(r.card).toBe("summary_large_image");
      expect(r.generated).toBe(true);
    }
  });

  it("builds the card path outside /api so robots rules do not block it", () => {
    expect(storyCardImagePath("oakland", "AvhaOxL5")).toBe(
      "/c/oakland/stories/AvhaOxL5/card-image",
    );
    expect(storyCardImagePath("oakland", "AvhaOxL5").startsWith("/api")).toBe(false);
  });
});

describe("truncateHeadline", () => {
  it("leaves short headlines alone and collapses whitespace", () => {
    expect(truncateHeadline("  NYC 311  Got 1 Complaint ")).toBe("NYC 311 Got 1 Complaint");
  });

  it("cuts long headlines on a word boundary with an ellipsis", () => {
    const long = Array.from({ length: 40 }, (_, i) => `word${i}`).join(" ");
    const out = truncateHeadline(long);
    expect(out.length).toBeLessThanOrEqual(STORY_CARD_HEADLINE_MAX);
    expect(out.endsWith("…")).toBe(true);
    // Every token before the ellipsis is a whole word, so the cut landed on a boundary.
    const tokens = out.slice(0, -1).split(" ");
    expect(tokens.length).toBeGreaterThan(10);
    expect(tokens.every((w) => /^word\d+$/.test(w))).toBe(true);
    expect(out).toMatch(/^word0 word1/);
  });

  it("strips trailing punctuation before the ellipsis", () => {
    const text = `${"a".repeat(100)}, ${"b".repeat(100)}`;
    expect(truncateHeadline(text, 103)).toBe(`${"a".repeat(100)}…`);
  });
});

describe("headlineFontSize", () => {
  it("steps down as the headline gets longer", () => {
    const sizes = [20, 60, 100, 150].map((n) => headlineFontSize("x".repeat(n)));
    expect(sizes).toEqual([64, 56, 48, 40]);
  });
});

describe("formatCardDate", () => {
  it("formats ISO dates and ignores junk", () => {
    expect(formatCardDate("2026-09-05T18:00:00Z")).toBe("Sep 5, 2026");
    expect(formatCardDate("2026-09-05")).toBe("Sep 5, 2026");
    expect(formatCardDate("not a date")).toBe("");
    expect(formatCardDate(null)).toBe("");
  });
});

describe("storyImageVersion", () => {
  it("derives a stable token from updated_at, falling back to published_at", () => {
    const a = storyImageVersion({ updated_at: "2026-08-31T23:09:27Z" });
    const b = storyImageVersion({ updated_at: "2026-08-31T23:09:27Z" });
    const c = storyImageVersion({ published_at: "2026-08-30T06:26:20Z" });
    expect(a).toBe(b);
    expect(a).not.toBe(c);
    expect(a).toMatch(/^[0-9a-z]+$/);
    expect(storyImageVersion({})).toBe("");
    expect(storyImageVersion({ updated_at: "garbage" })).toBe("");
  });
});

describe("upstreamStoryImageUrl", () => {
  const origin = "https://api.transparent.city";

  it("hangs backend-relative paths off the API origin, query and all", () => {
    expect(upstreamStoryImageUrl("/api/feed/public/story-image/AvhaOxL5", origin)).toBe(
      `${origin}/api/feed/public/story-image/AvhaOxL5`,
    );
    expect(upstreamStoryImageUrl("/api/time-series/public/3890858/image?period=month", origin)).toBe(
      `${origin}/api/time-series/public/3890858/image?period=month`,
    );
  });

  it("does not double the slash when the origin has a trailing one", () => {
    expect(upstreamStoryImageUrl("/api/feed/public/story-image/x", `${origin}/`)).toBe(
      `${origin}/api/feed/public/story-image/x`,
    );
  });

  it("passes absolute http(s) URLs through untouched", () => {
    const ext = "https://res.cloudinary.com/x/image/upload/s--sig--/photo.jpg";
    expect(upstreamStoryImageUrl(ext, origin)).toBe(ext);
  });

  it("returns empty for missing, relative, or protocol-relative values", () => {
    for (const value of [null, undefined, "", "   ", "photo.jpg", "//evil.example/x.png"]) {
      expect(upstreamStoryImageUrl(value, origin)).toBe("");
    }
  });
});

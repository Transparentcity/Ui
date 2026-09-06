import { describe, it, expect } from "vitest";

import {
  STORY_CARD_HEADLINE_MAX,
  formatCardDate,
  headlineFontSize,
  resolveStorySocialImage,
  storyCardImagePath,
  truncateHeadline,
} from "./storyCardImage";

describe("resolveStorySocialImage", () => {
  it("uses the backend image when present and keeps the large card", () => {
    const r = resolveStorySocialImage(
      { image_url: "/api/feed/public/story-image/O5LjXq8T" },
      "seattle",
      "O5LjXq8T",
    );
    expect(r).toEqual({
      url: "/api/feed/public/story-image/O5LjXq8T",
      card: "summary_large_image",
      generated: false,
    });
  });

  it("falls back to the generated headline card when there is no image", () => {
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

/**
 * Tests for FeaturedStories / StoryFeedCard clickability.
 *
 * Ensures dashboard story cards link to the correct detail pages
 * regardless of whether short_hash or detail_url is available.
 */

import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import type { PublicFeedStory } from "@/lib/publicApiClient";
import FeaturedStories from "./FeaturedStories";

function makeStory(overrides: Partial<PublicFeedStory> = {}): PublicFeedStory {
  return {
    id: 1,
    story_type: "safety",
    city_id: 100,
    city_name: "Dallas",
    city_emoji: "🤠",
    district: 0,
    headline: "Dallas Property Crime Is Down 74.5%",
    description: "Property crime incidents dropped significantly year-over-year.",
    detail_url: "/c/dallas/stories/abc123",
    story_date: "2026-04-14",
    published_at: "2026-04-14T12:00:00Z",
    short_hash: null,
    ...overrides,
  };
}

const BASE_PROPS = {
  slug: "dallas",
  cityDisplayName: "Dallas, Texas",
  cityEmoji: "🤠",
};

describe("FeaturedStories card clickability", () => {
  it("renders a clickable link when short_hash is present", () => {
    render(
      <FeaturedStories
        {...BASE_PROPS}
        stories={[makeStory({ short_hash: "abc123" })]}
      />,
    );
    const link = screen.getByRole("link", { name: /Property Crime/i });
    expect(link).toHaveAttribute("href", "/c/dallas/stories/abc123");
  });

  it("renders a clickable link using detail_url when short_hash is missing", () => {
    render(
      <FeaturedStories
        {...BASE_PROPS}
        stories={[makeStory({ short_hash: null, detail_url: "/c/dallas/stories/def456" })]}
      />,
    );
    const link = screen.getByRole("link", { name: /Property Crime/i });
    expect(link).toHaveAttribute("href", "/c/dallas/stories/def456");
  });

  it("renders a clickable link when detail_url is a full URL (not /c/ or /s/ prefix)", () => {
    render(
      <FeaturedStories
        {...BASE_PROPS}
        stories={[makeStory({ short_hash: null, detail_url: "/feed/42" })]}
      />,
    );
    const link = screen.getByRole("link", { name: /Property Crime/i });
    expect(link).toHaveAttribute("href", "/feed/42");
  });

  it("renders a non-clickable card when both short_hash and detail_url are empty", () => {
    render(
      <FeaturedStories
        {...BASE_PROPS}
        stories={[makeStory({ short_hash: null, detail_url: "" })]}
      />,
    );
    // Should render as a div, not a link
    expect(screen.queryByRole("link", { name: /Property Crime/i })).not.toBeInTheDocument();
    // But the headline should still be visible
    expect(screen.getByRole("heading", { name: /Property Crime/i })).toBeInTheDocument();
  });

  it("prefers short_hash over detail_url when both are present", () => {
    render(
      <FeaturedStories
        {...BASE_PROPS}
        stories={[makeStory({ short_hash: "xyz789", detail_url: "/feed/99" })]}
      />,
    );
    const link = screen.getByRole("link", { name: /Property Crime/i });
    expect(link).toHaveAttribute("href", "/c/dallas/stories/xyz789");
  });

  it("renders the empty state when no stories are provided", () => {
    render(<FeaturedStories {...BASE_PROPS} stories={[]} />);
    expect(screen.getByText(/don\u2019t have stories/i)).toBeInTheDocument();
  });
});

import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { EnrichedFeedStory } from "@/lib/feed/mockFeedData";
import { FeedStoryDetailView } from "./FeedStoryDetailView";

vi.mock("./EscalateSheet", () => ({
  default: () => null,
}));

function makeStory(
  overrides: Partial<EnrichedFeedStory> = {},
): EnrichedFeedStory {
  return {
    id: 42,
    story_type: "context",
    city_id: 1,
    city_name: "San Francisco",
    city_emoji: "🌉",
    district: 0,
    research_report_id: 1,
    headline: "Transit delays are improving citywide",
    description: "A shorter feed summary.",
    summary: "A shorter feed summary.",
    detail_url: "/r/report-1",
    view_count: 0,
    click_count: 0,
    share_count: 0,
    applaud_count: 0,
    escalate_count: 0,
    investigate_count: 0,
    priority_score: 10,
    is_featured: false,
    status: "active",
    story_date: "2026-03-20",
    published_at: new Date().toISOString(),
    metadata: {},
    primary_visualization: null,
    visualization_type: null,
    card_type: "context",
    template: "text_only",
    type_icon: "🧭",
    type_label: "Context",
    actor: "City Hall",
    neighborhood_label: "San Francisco · City-wide",
    subline: "Today",
    image_url_resolved: null,
    embed_url_resolved: null,
    cleaned_description: "A shorter feed summary.",
    canonical_url: "/feed/42",
    ...overrides,
  };
}

describe("FeedStoryDetailView", () => {
  it("renders article_html with processed visualization shortcodes", () => {
    render(
      <FeedStoryDetailView
        story={makeStory({
          article_html:
            "<h2>What changed</h2><p>Transit performance improved this month.</p>[chart:123]",
        })}
        detailNarrative={null}
        relatedStories={[]}
        onShare={vi.fn()}
      />,
    );

    expect(screen.getByText("A shorter feed summary.")).toBeInTheDocument();
    expect(screen.getByText("What changed")).toBeInTheDocument();
    expect(
      screen.getByText("Transit performance improved this month."),
    ).toBeInTheDocument();
    expect(screen.getByTitle("Chart 123")).toBeInTheDocument();
  });
});

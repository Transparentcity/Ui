import { describe, expect, it, vi } from "vitest";
import { render as rtlRender, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { ThemeProvider } from "@/contexts/ThemeContext";
import type { EnrichedFeedStory } from "@/lib/feed/mockFeedData";
import { FeedStoryDetailView } from "./FeedStoryDetailView";

// jsdom does not implement matchMedia; ThemeProvider reads it on mount.
Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

/**
 * FeedStoryDetailView needs ThemeProvider (useTheme) and a QueryClient
 * (AdminStoryProvenance runs a permissions query).
 */
function Providers({ children }: { children: ReactNode }) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return (
    <ThemeProvider>
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    </ThemeProvider>
  );
}

const render = (ui: Parameters<typeof rtlRender>[0]) =>
  rtlRender(ui, { wrapper: Providers });

vi.mock("./EscalateSheet", () => ({
  default: () => null,
}));

vi.mock("./MetricKeyContext", () => ({
  useMetricKey: () => ({
    resolveMetricKey: (name: string) => {
      const map: Record<string, string> = {
        "crime rate": "crime-rate",
        "response time": "response-time",
        homelessness: "homelessness",
      };
      return map[name.toLowerCase().trim()] ?? null;
    },
  }),
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
    type_icon: "Landmark",
    type_label: "Context",
    actor: "City Hall",
    category_icon: "Landmark",
    category_color: "var(--text-muted)",
    neighborhood_label: "San Francisco · City-wide",
    subline: "Today",
    image_url_resolved: null,
    image_alt_resolved: "Test story headline",
    image_caption_resolved: null,
    embed_url_resolved: null,
    cleaned_description: "A shorter feed summary.",
    canonical_url: "/feed/42",
    place_scoped_for_ui: false,
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

    // Lede paragraph is shown before the article body when article_html is present
    expect(screen.getByText("A shorter feed summary.")).toBeInTheDocument();
    expect(screen.getByText("What changed")).toBeInTheDocument();
    expect(
      screen.getByText("Transit performance improved this month."),
    ).toBeInTheDocument();
    expect(screen.getByTitle("Chart 123")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Source" })).toBeInTheDocument();
  });

  it("renders the interactive map with compact chrome in detail views by default", () => {
    render(
      <FeedStoryDetailView
        story={makeStory({
          article_html: "<p>Context</p>[map:AzOP6s-N]",
          visualization_type: "map",
          primary_visualization: { type: "map", short_hash: "AzOP6s-N" },
          image_url_resolved: "/api/feed/public/story-image/hash123",
          image_alt_resolved: "Austin service map",
          image_caption_resolved: "Calls are concentrated downtown.",
        })}
        detailNarrative={null}
        relatedStories={[]}
        onShare={vi.fn()}
      />,
    );

    expect(screen.queryByAltText("Austin service map")).toBeNull();
    expect(screen.getByText("Austin service map")).toBeInTheDocument();
    expect(screen.getByText("Calls are concentrated downtown.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Source" })).toBeInTheDocument();
    expect(screen.getByTitle("Map AzOP6s-N")).toBeInTheDocument();
    expect(screen.queryByText("Load interactive version")).not.toBeInTheDocument();
  });

  it("renders the saved static image when explicitly configured", () => {
    render(
      <FeedStoryDetailView
        story={makeStory({
          article_html: "<p>Context</p>[map:AzOP6s-N]",
          visualization_type: "map",
          primary_visualization: { type: "map", short_hash: "AzOP6s-N" },
          image_url_resolved: "/api/feed/public/story-image/hash123",
          image_alt_resolved: "Austin service map",
          image_caption_resolved: "Calls are concentrated downtown.",
        })}
        detailNarrative={null}
        relatedStories={[]}
        onShare={vi.fn()}
        preferStaticPrimaryVisualizationInArticle
      />,
    );

    expect(screen.getByAltText("Austin service map")).toBeInTheDocument();
    const deferredIframe = screen.getByTitle("Map AzOP6s-N");
    expect(deferredIframe).toBeInstanceOf(HTMLIFrameElement);
    expect((deferredIframe as HTMLIFrameElement).getAttribute("src")).toBeNull();
    expect((deferredIframe as HTMLIFrameElement).dataset.deferredSrc).toBe(
      "/m/AzOP6s-N?embedded=true",
    );
    expect(screen.getByText("Load interactive version")).toBeInTheDocument();
    expect(
      screen.queryByText("Calls are concentrated downtown."),
    ).toBeInTheDocument();
  });

  it("renders metric detail view with MetricLink hotlinks when metadata.metrics present", () => {
    render(
      <FeedStoryDetailView
        story={makeStory({
          city_name: "San Francisco",
          district: 6,
          metadata: {
            metrics: [
              { name: "Crime Rate", direction: "down", pct: -15 },
              { name: "Response Time", direction: "up", pct: 22 },
            ],
          },
        })}
        detailNarrative={null}
        relatedStories={[]}
        onShare={vi.fn()}
      />,
    );

    // MetricLink should render as links since our mock resolves these names
    const crimeLink = screen.getByRole("link", { name: /Crime Rate/ });
    expect(crimeLink).toHaveAttribute(
      "href",
      "/c/san-francisco/metrics/crime-rate?district=6",
    );

    const responseLink = screen.getByRole("link", { name: /Response Time/ });
    expect(responseLink).toHaveAttribute(
      "href",
      "/c/san-francisco/metrics/response-time?district=6",
    );
  });

  it("renders metric as plain text when resolveMetricKey returns null", () => {
    render(
      <FeedStoryDetailView
        story={makeStory({
          city_name: "San Francisco",
          metadata: {
            metrics: [
              { name: "Unknown Metric", direction: "up", pct: 10 },
            ],
          },
        })}
        detailNarrative={null}
        relatedStories={[]}
        onShare={vi.fn()}
      />,
    );

    // Should render text but not as a link
    expect(screen.getByText("Unknown Metric")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Unknown Metric/ })).toBeNull();
  });
});

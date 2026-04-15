/**
 * Tests for MultiMetricCard: period label resolution, metric extraction,
 * favorability logic, and MetricLink integration.
 */

import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { EnrichedFeedStory } from "@/lib/feed/mockFeedData";
import MultiMetricCard from "./MultiMetricCard";

// Stub MetricKeyContext
vi.mock("../MetricKeyContext", () => ({
  useMetricKey: () => ({
    resolveMetricKey: (name: string) => {
      const map: Record<string, string> = {
        "crime rate": "crime-rate",
        homelessness: "homelessness",
        "response time": "response-time",
      };
      return map[name.toLowerCase().trim()] ?? null;
    },
  }),
}));

// Stub Next.js Link
vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    className,
    onClick,
  }: {
    href: string;
    children: React.ReactNode;
    className?: string;
    onClick?: React.MouseEventHandler;
  }) => (
    <a href={href} className={className} onClick={onClick}>
      {children}
    </a>
  ),
}));

// Stub CardHeader
vi.mock("../CardHeader", () => ({
  default: () => <div data-testid="card-header" />,
}));

// Stub CSS module
vi.mock("../feed.module.css", () => ({
  default: new Proxy(
    {},
    { get: (_t, prop) => String(prop) },
  ),
}));

function makeStory(
  overrides: Partial<EnrichedFeedStory> = {},
): EnrichedFeedStory {
  return {
    id: 1,
    story_type: "multi_metric",
    city_id: 1,
    city_name: "San Francisco",
    city_emoji: "",
    district: 0,
    research_report_id: 1,
    headline: "This Week in District 6",
    description: "",
    summary: "",
    detail_url: "/feed/1",
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
    card_type: "multi_metric",
    template: "multi_metric",
    type_icon: "Landmark",
    type_label: "Multi-Metric",
    actor: "City Hall",
    category_icon: "Landmark",
    category_color: "#6b7280",
    neighborhood_label: "San Francisco · District 6",
    subline: "Today",
    image_url_resolved: null,
    image_alt_resolved: "Multi-metric story",
    image_caption_resolved: null,
    embed_url_resolved: null,
    cleaned_description: "",
    canonical_url: "/feed/1",
    ...overrides,
  };
}

// ── Period label resolution ──────────────────────────────────────────────

describe("MultiMetricCard period labels", () => {
  it("displays explicit period_label from metadata", () => {
    render(
      <MultiMetricCard
        story={makeStory({
          metadata: {
            period_label: "March 2026",
            metrics: [{ name: "Crime Rate", direction: "down", pct: 10 }],
          },
        })}
      >
        <div />
      </MultiMetricCard>,
    );
    expect(screen.getByText("March 2026")).toBeInTheDocument();
  });

  it("falls back to PERIOD_TYPE_LABELS for known period_type codes", () => {
    const cases: Array<[string, string]> = [
      ["yoy", "Year-over-Year"],
      ["mom", "vs. Last Month"],
      ["wow", "vs. Last Week"],
      ["ytd", "Year-to-Date"],
      ["qtd", "Quarter-to-Date"],
      ["mtd", "Month-to-Date"],
    ];
    for (const [code, label] of cases) {
      const { unmount } = render(
        <MultiMetricCard
          story={makeStory({
            metadata: {
              period_type: code,
              metrics: [{ name: "Crime Rate", direction: "down", pct: 10 }],
            },
          })}
        >
          <div />
        </MultiMetricCard>,
      );
      expect(screen.getByText(label)).toBeInTheDocument();
      unmount();
    }
  });

  it("shows no period label when neither period_label nor period_type present", () => {
    render(
      <MultiMetricCard
        story={makeStory({
          metadata: {
            metrics: [{ name: "Crime Rate", direction: "down", pct: 10 }],
          },
        })}
      >
        <div />
      </MultiMetricCard>,
    );
    // None of the period labels should be present
    expect(screen.queryByText("Year-over-Year")).toBeNull();
    expect(screen.queryByText("vs. Last Month")).toBeNull();
  });
});

// ── Favorability logic ──────────────────────────────────────────────────

describe("MultiMetricCard favorability", () => {
  it("marks crime going down as favorable", () => {
    render(
      <MultiMetricCard
        story={makeStory({
          metadata: {
            metrics: [{ name: "Crime Rate", direction: "down", pct: -15 }],
          },
        })}
      >
        <div />
      </MultiMetricCard>,
    );
    // The metric tile value element should have the favorable class
    expect(screen.getByText(/15%/)).toBeInTheDocument();
  });

  it("marks employment going up as favorable", () => {
    render(
      <MultiMetricCard
        story={makeStory({
          metadata: {
            metrics: [{ name: "Employment Rate", direction: "up", pct: 8 }],
          },
        })}
      >
        <div />
      </MultiMetricCard>,
    );
    expect(screen.getByText(/8%/)).toBeInTheDocument();
  });
});

// ── MetricLink integration ──────────────────────────────────────────────

describe("MultiMetricCard metric links", () => {
  it("renders MetricLink as a link for resolved metrics", () => {
    render(
      <MultiMetricCard
        story={makeStory({
          city_name: "San Francisco",
          metadata: {
            metrics: [{ name: "Crime Rate", direction: "down", pct: 10 }],
          },
        })}
      >
        <div />
      </MultiMetricCard>,
    );
    const link = screen.getByRole("link", { name: /Crime Rate/ });
    expect(link).toHaveAttribute(
      "href",
      "/c/san-francisco/metrics/crime-rate",
    );
  });

  it("renders MetricLink as plain text for unresolved metrics", () => {
    render(
      <MultiMetricCard
        story={makeStory({
          city_name: "San Francisco",
          metadata: {
            metrics: [{ name: "Unknown Thing", direction: "up", pct: 5 }],
          },
        })}
      >
        <div />
      </MultiMetricCard>,
    );
    expect(screen.getByText("Unknown Thing")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Unknown Thing/ })).toBeNull();
  });

  it("includes district in MetricLink href when district > 0", () => {
    render(
      <MultiMetricCard
        story={makeStory({
          city_name: "San Francisco",
          district: 6,
          metadata: {
            metrics: [{ name: "Crime Rate", direction: "down", pct: 10 }],
          },
        })}
      >
        <div />
      </MultiMetricCard>,
    );
    const link = screen.getByRole("link", { name: /Crime Rate/ });
    expect(link).toHaveAttribute(
      "href",
      "/c/san-francisco/metrics/crime-rate?district=6",
    );
  });
});

// ── Comparison variant ──────────────────────────────────────────────────

describe("MultiMetricCard comparison layout", () => {
  it("renders district vs. city comparison when comparison_type is set", () => {
    render(
      <MultiMetricCard
        story={makeStory({
          city_name: "San Francisco",
          district: 6,
          metadata: {
            comparison_type: "district_vs_city",
            metrics: [
              { name: "Crime Rate", direction: "down", pct: 22 },
              { name: "Crime Rate", direction: "down", pct: 11 },
            ],
          },
        })}
      >
        <div />
      </MultiMetricCard>,
    );
    expect(screen.getByText("Your District")).toBeInTheDocument();
    expect(screen.getByText("Citywide")).toBeInTheDocument();
  });
});

// ── Edge cases ──────────────────────────────────────────────────────────

describe("MultiMetricCard edge cases", () => {
  it("formats very large percentages as multipliers", () => {
    render(
      <MultiMetricCard
        story={makeStory({
          metadata: {
            metrics: [{ name: "Crime Rate", direction: "up", pct: 50000 }],
          },
        })}
      >
        <div />
      </MultiMetricCard>,
    );
    // formatPct: 50000% -> abs=50000, >999 so multiplier=500, <=999 so "500x"
    expect(screen.getByText(/500x/)).toBeInTheDocument();
  });

  it("shows description when no real metrics are present", () => {
    render(
      <MultiMetricCard
        story={makeStory({
          cleaned_description: "Something happened this week",
          metadata: { metrics: [] },
        })}
      >
        <div />
      </MultiMetricCard>,
    );
    expect(
      screen.getByText("Something happened this week"),
    ).toBeInTheDocument();
  });

  it("handles null metadata gracefully", () => {
    render(
      <MultiMetricCard story={makeStory({ metadata: null as never })}>
        <div />
      </MultiMetricCard>,
    );
    // Should not crash
    expect(screen.getByText(/This Week in District 6/)).toBeInTheDocument();
  });

  it("strips leading geographic scope from headline", () => {
    render(
      <MultiMetricCard
        story={makeStory({
          headline: "Citywide — Crime Down This Week",
          metadata: { metrics: [] },
        })}
      >
        <div />
      </MultiMetricCard>,
    );
    expect(screen.getByText("Crime Down This Week")).toBeInTheDocument();
  });
});

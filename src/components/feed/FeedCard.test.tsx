/**
 * Tests for FeedCard component.
 *
 * Covers: rendering, share behavior, template selection,
 * off_the_charts styling, hide functionality, navigation.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import type { EnrichedFeedStory } from "@/lib/feed/mockFeedData";

// ── jsdom polyfills ──────────────────────────────────────────────────────

// navigator.clipboard
Object.defineProperty(navigator, "clipboard", {
  value: {
    writeText: vi.fn().mockResolvedValue(undefined),
    readText: vi.fn().mockResolvedValue(""),
  },
  writable: true,
});

// window.matchMedia
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

// ── Mocks ────────────────────────────────────────────────────────────────

const mockPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}));

vi.mock("@auth0/auth0-react", () => ({
  useAuth0: () => ({
    isAuthenticated: true,
    isLoading: false,
    getAccessTokenSilently: vi.fn().mockResolvedValue("test-token"),
  }),
}));

const mockMutate = vi.fn();
vi.mock("@/lib/hooks/useFeed", () => ({
  useTrackFeedEngagement: () => ({ mutate: mockMutate }),
}));

// Mock sonner
vi.mock("sonner", () => ({
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
}));

// Mock createPortal
vi.mock("react-dom", async () => {
  const actual = await vi.importActual<typeof import("react-dom")>("react-dom");
  return {
    ...actual,
    createPortal: (node: React.ReactNode) => node,
  };
});

// Import after mocks
import FeedCard from "./FeedCard";

// ── Test factory ────────────────────────────────────────────────────────

function makeEnrichedStory(overrides: Partial<EnrichedFeedStory> = {}): EnrichedFeedStory {
  return {
    id: 42,
    story_type: "alert",
    city_id: 57260,
    city_name: "San Francisco",
    city_emoji: "🌉",
    district: 6,
    research_report_id: 100,
    headline: "Motor vehicle thefts spike in D6",
    description: "Thefts have increased 25% this month in the district.",
    summary: null,
    detail_url: "/feed/42",
    view_count: 10,
    click_count: 5,
    share_count: 2,
    like_count: 8,
    comment_count: 3,
    priority_score: 50,
    is_featured: false,
    status: "active",
    story_date: "2026-03-15",
    published_at: new Date().toISOString(),
    metadata: {},
    primary_visualization: null,
    visualization_type: null,
    // Enriched fields
    card_type: "alert",
    template: "text_only",
    applaud_count: 8,
    escalate_count: 3,
    investigate_count: 0,
    type_icon: "🔴",
    type_label: "Alert",
    actor: "Police",
    neighborhood_label: "San Francisco · District 6",
    subline: "2 hours ago",
    image_url_resolved: null,
    embed_url_resolved: null,
    cleaned_description: "Thefts have increased 25% this month in the district.",
    canonical_url: "/feed/42",
    ...overrides,
  };
}

describe("FeedCard", () => {
  const onHide = vi.fn();
  const onDelete = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  function renderCard(storyOverrides: Partial<EnrichedFeedStory> = {}) {
    return render(
      <FeedCard
        story={makeEnrichedStory(storyOverrides)}
        onHide={onHide}
        onDelete={onDelete}
      />
    );
  }

  // ── Rendering ──────────────────────────────────────────────────────────

  it("renders headline", () => {
    renderCard();
    expect(screen.getByText("Motor vehicle thefts spike in D6")).toBeInTheDocument();
  });

  it("renders Share button in action bar", () => {
    renderCard();
    expect(screen.getByLabelText("Share")).toBeInTheDocument();
  });

  it("renders Applaud and Flag in the action bar", () => {
    renderCard();
    expect(screen.getByLabelText("Applaud")).toBeInTheDocument();
    expect(screen.getByLabelText("Flag")).toBeInTheDocument();
  });

  it("applies off_the_charts CSS class for OTC stories", () => {
    const { container } = renderCard({ card_type: "off_the_charts" });
    const article = container.querySelector("article");
    expect(article?.className).toContain("cardOffTheCharts");
  });

  it("does not apply off_the_charts class for other types", () => {
    const { container } = renderCard({ card_type: "alert" });
    const article = container.querySelector("article");
    expect(article?.className).not.toContain("cardOffTheCharts");
  });

  // ── Navigation ────────────────────────────────────────────────────────

  it("navigates to feed detail route on click", () => {
    renderCard({});
    const article = screen.getByRole("link");
    fireEvent.click(article);
    expect(mockPush).toHaveBeenCalledWith("/feed/42");
  });

  it("opens in-app feed detail when onOpenFeedDetail is set and canonical is /feed/", () => {
    const onOpenFeedDetail = vi.fn();
    render(
      <FeedCard
        story={makeEnrichedStory({ canonical_url: "/feed/42" })}
        onHide={onHide}
        onDelete={onDelete}
        onOpenFeedDetail={onOpenFeedDetail}
      />,
    );
    fireEvent.click(screen.getByRole("link"));
    expect(onOpenFeedDetail).toHaveBeenCalledWith(
      expect.objectContaining({ id: 42, canonical_url: "/feed/42" }),
    );
    expect(mockPush).not.toHaveBeenCalled();
  });

  it("still navigates for non-feed canonical URLs when onOpenFeedDetail is set", () => {
    const onOpenFeedDetail = vi.fn();
    render(
      <FeedCard
        story={makeEnrichedStory({
          canonical_url: "/c/san-francisco/metrics/crime-incidents",
          card_type: "alert",
          metadata: { metric_key: "crime-incidents" },
        })}
        onHide={onHide}
        onDelete={onDelete}
        onOpenFeedDetail={onOpenFeedDetail}
      />,
    );
    fireEvent.click(screen.getByRole("link"));
    expect(onOpenFeedDetail).not.toHaveBeenCalled();
    expect(mockPush).toHaveBeenCalledWith("/c/san-francisco/metrics/crime-incidents");
  });

  // ── Template selection ─────────────────────────────────────────────────

  it("uses TextOnlyCard for text_only template", () => {
    renderCard({ template: "text_only" });
    // TextOnly shows description directly
    expect(screen.getByText(/Thefts have increased/)).toBeInTheDocument();
  });

  // ── Share behavior ─────────────────────────────────────────────────────

  it("tracks share engagement when share is clicked", () => {
    renderCard();
    const shareBtn = screen.getByLabelText("Share");
    fireEvent.click(shareBtn);
    expect(mockMutate).toHaveBeenCalledWith({ storyId: 42, action: "share" });
  });
});

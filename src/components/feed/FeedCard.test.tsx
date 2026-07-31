/**
 * Tests for FeedCard component.
 *
 * Covers: rendering, share behavior, template selection,
 * off_the_charts styling, hide functionality, navigation,
 * multi-metric period context labels.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { EnrichedFeedStory } from "@/lib/feed/mockFeedData";
import { requiresPublishForPublicShare } from "@/lib/feed/canonicalUrl";

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
  const story: EnrichedFeedStory = {
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
    type_icon: "Shield",
    type_label: "Alert",
    actor: "Police",
    category_icon: "Shield",
    category_color: "#dc2626",
    neighborhood_label: "San Francisco · District 6",
    subline: "2 hours ago",
    image_url_resolved: null,
    image_alt_resolved: "Theft in District 6",
    image_caption_resolved: null,
    embed_url_resolved: null,
    cleaned_description: "Thefts have increased 25% this month in the district.",
    canonical_url: "/feed/42",
    place_scoped_for_ui: false,
    ...overrides,
  };
  if (!("place_scoped_for_ui" in overrides)) {
    story.place_scoped_for_ui = requiresPublishForPublicShare(story);
  }
  return story;
}

describe("FeedCard", () => {
  const onHide = vi.fn();
  const onDelete = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  function renderCard(storyOverrides: Partial<EnrichedFeedStory> = {}, { isAdmin = false }: { isAdmin?: boolean } = {}) {
    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    return render(
      <QueryClientProvider client={qc}>
        <FeedCard
          story={makeEnrichedStory(storyOverrides)}
          isAdmin={isAdmin}
          onHide={onHide}
          onDelete={onDelete}
        />
      </QueryClientProvider>,
    );
  }

  // ── Rendering ──────────────────────────────────────────────────────────

  it("renders headline", () => {
    renderCard();
    expect(screen.getByText("Motor vehicle thefts spike in D6")).toBeInTheDocument();
  });

  it("renders a saved place label when the story is place-scoped", () => {
    renderCard({ user_place_id: 7, neighborhood_label: "Noe Valley Home" });
    expect(screen.getByText("Noe Valley Home")).toBeInTheDocument();
  });

  it("shows a saved place pin for place-scoped stories", () => {
    renderCard({ user_place_id: 99, neighborhood_label: "Noe Valley Home" });
    expect(screen.getByLabelText("Saved place")).toBeInTheDocument();
  });

  it("does not show a saved place pin for city feed stories", () => {
    renderCard();
    expect(screen.queryByLabelText("Saved place")).not.toBeInTheDocument();
  });

  it("renders Share button in action bar", () => {
    renderCard();
    expect(screen.getByLabelText("Share")).toBeInTheDocument();
  });

  it("does not render Applaud or Flag buttons", () => {
    renderCard();
    expect(screen.queryByLabelText("Applaud")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Flag")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Investigate")).not.toBeInTheDocument();
  });

  it("renders OffTheChartsCard template for off_the_charts stories", () => {
    renderCard({ card_type: "off_the_charts" });
    expect(screen.getByText(/Off the Charts/)).toBeInTheDocument();
  });

  it("does not show Off the Charts badge for alert stories", () => {
    renderCard({ card_type: "alert" });
    expect(screen.queryByText(/^Off the Charts$/)).not.toBeInTheDocument();
  });

  it("shows Fix It, Already badge when story_type is fix_it_already", () => {
    renderCard({ story_type: "fix_it_already" });
    expect(screen.getByText("Fix It, Already")).toBeInTheDocument();
  });

  it("does not show Fix It, Already badge for other story types", () => {
    renderCard({ story_type: "alert" });
    expect(screen.queryByText("Fix It, Already")).not.toBeInTheDocument();
  });

  // ── Navigation ────────────────────────────────────────────────────────

  it("navigates to feed detail route on click", () => {
    renderCard({});
    const article = screen.getByRole("article");
    fireEvent.click(article);
    expect(mockPush).toHaveBeenCalledWith("/feed/42");
  });

  it("opens in-app feed detail when onOpenFeedDetail is set", () => {
    const onOpenFeedDetail = vi.fn();
    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    render(
      <QueryClientProvider client={qc}>
        <FeedCard
          story={makeEnrichedStory({
            canonical_url: "/c/san-francisco/metrics/crime-incidents",
            card_type: "alert",
            metadata: { metric_key: "crime-incidents" },
          })}
          onHide={onHide}
          onDelete={onDelete}
          onOpenFeedDetail={onOpenFeedDetail}
        />
      </QueryClientProvider>,
    );
    fireEvent.click(screen.getByRole("article"));
    expect(onOpenFeedDetail).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 42,
        canonical_url: "/c/san-francisco/metrics/crime-incidents",
      }),
    );
    expect(mockPush).not.toHaveBeenCalled();
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

  it("opens share dialog for saved-place stories with URL field and Share link", () => {
    renderCard({ user_place_id: 99, metadata: {} });
    const shareBtn = screen.getByLabelText("Share");
    fireEvent.click(shareBtn);
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByRole("heading", { name: /public link/i })).toBeInTheDocument();
    expect(within(dialog).getByLabelText("Public story link")).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Share link" })).toBeEnabled();
    expect(mockMutate).not.toHaveBeenCalled();
  });

  // ── Multi-metric period context ─────────────────────────────────────────

  it("renders period_label on multi-metric card when provided", () => {
    renderCard({
      card_type: "multi_metric",
      template: "multi_metric",
      headline: "Crime Down + 2 More",
      metadata: {
        period_label: "Year-over-Year",
        metrics: [
          { name: "Crime", direction: "down", pct: 12 },
          { name: "Violent Crime", direction: "down", pct: 8 },
        ],
      },
    });
    expect(screen.getByText("Year-over-Year")).toBeInTheDocument();
  });

  it("maps period_type to human-readable label on multi-metric card", () => {
    renderCard({
      card_type: "multi_metric",
      template: "multi_metric",
      headline: "Crime Down + 1 More",
      metadata: {
        period_type: "mom",
        metrics: [
          { name: "Crime", direction: "down", pct: 12 },
          { name: "Violent Crime", direction: "down", pct: 8 },
        ],
      },
    });
    expect(screen.getByText("vs. Last Month")).toBeInTheDocument();
  });

  it("does not render period label when metadata lacks period info", () => {
    renderCard({
      card_type: "multi_metric",
      template: "multi_metric",
      headline: "Crime Down + 1 More",
      metadata: {
        metrics: [
          { name: "Crime", direction: "down", pct: 12 },
          { name: "Violent Crime", direction: "down", pct: 8 },
        ],
      },
    });
    expect(screen.queryByText("Year-over-Year")).not.toBeInTheDocument();
    expect(screen.queryByText("vs. Last Month")).not.toBeInTheDocument();
  });

  // ── Overflow menu visibility (admin vs non-admin) ─────────────────────

  it("hides overflow (ellipses) button for non-admin users", () => {
    renderCard();
    expect(screen.queryByLabelText("More options")).not.toBeInTheDocument();
  });

  it("shows overflow (ellipses) button for admin users", () => {
    renderCard({}, { isAdmin: true });
    expect(screen.getByLabelText("More options")).toBeInTheDocument();
  });

  it("shows overflow menu items when admin clicks ellipses", () => {
    renderCard({}, { isAdmin: true });
    const overflowBtn = screen.getByLabelText("More options");
    fireEvent.click(overflowBtn);
    expect(screen.getByText("Hide")).toBeInTheDocument();
    expect(screen.getByText("Admin: Like")).toBeInTheDocument();
    expect(screen.getByText("Admin: Delete this card")).toBeInTheDocument();
  });

  it("shows Unlike in overflow when story is already liked", () => {
    renderCard({ liked_by_me: true }, { isAdmin: true });
    fireEvent.click(screen.getByLabelText("More options"));
    expect(screen.getByText("Admin: Unlike")).toBeInTheDocument();
    expect(screen.queryByText("Admin: Like")).not.toBeInTheDocument();
  });

  it("does not render overflow menu for non-admin users", () => {
    renderCard();
    expect(screen.queryByText("Hide")).not.toBeInTheDocument();
    expect(screen.queryByText("Admin: Like")).not.toBeInTheDocument();
    expect(screen.queryByText("Admin: Delete this card")).not.toBeInTheDocument();
  });
});

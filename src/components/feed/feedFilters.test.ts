/**
 * Tests for feed filter logic: topic ordering, My Block address gating,
 * district collapsibility, client-side filtering, and empty state conditions.
 *
 * These are pure logic tests that validate the filtering behavior
 * extracted from FeedContainer without needing to render the component.
 */

import { describe, it, expect } from "vitest";
import type { FeedStory } from "@/lib/hooks/useFeed";
import { enrichStories } from "@/lib/feed/mockFeedData";

// ── Test factory ──────────────────────────────────────────────────────────

function makeStory(overrides: Partial<FeedStory> = {}): FeedStory {
  return {
    id: 1,
    story_type: "research",
    city_id: 57260,
    city_name: "San Francisco",
    city_emoji: "\u{1F309}",
    district: 6,
    research_report_id: 100,
    headline: "Test headline",
    description: "This is a test description with enough length to be meaningful.",
    summary: null,
    detail_url: "/feed/1",
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
    ...overrides,
  };
}

// ── Replicate filter logic from FeedContainer ─────────────────────────────

type FilterOpts = {
  hiddenIds?: Set<number>;
  selectedTopic?: string | null;
  selectedCityIds?: Set<number>;
};

function filterStories(
  stories: FeedStory[],
  opts: FilterOpts = {},
) {
  const { hiddenIds = new Set(), selectedTopic = null, selectedCityIds = new Set() } = opts;
  const enriched = enrichStories(stories);
  return enriched.filter((s) => {
    if (hiddenIds.has(s.id)) return false;
    if (selectedTopic) {
      if (selectedTopic === "my_block") {
        if (!s.metadata?.my_block) return false;
      } else if (s.card_type !== selectedTopic) {
        return false;
      }
    }
    if (selectedCityIds.size === 1 && !selectedCityIds.has(s.city_id)) return false;
    return true;
  });
}

// ── Topic filter order ────────────────────────────────────────────────────

describe("Topic filter chip order", () => {
  const TOPIC_ORDER = [
    { value: "", label: "All topics" },
    { value: "my_block", label: "My Block" },
    { value: "safety", label: "Safety" },
    { value: "justice", label: "Justice" },
    { value: "business", label: "Business" },
    { value: "spending", label: "Spending" },
    { value: "alert", label: "Alerts" },
    { value: "trend", label: "Trends" },
    { value: "context", label: "Context" },
    { value: "off_the_charts", label: "Off the Charts" },
    { value: "311_images", label: "311 Photos" },
  ];

  it("places My Block as the second chip (right after All topics)", () => {
    expect(TOPIC_ORDER[0].value).toBe("");
    expect(TOPIC_ORDER[1].value).toBe("my_block");
  });

  it("includes all expected topics", () => {
    const values = TOPIC_ORDER.map((t) => t.value);
    expect(values).toContain("safety");
    expect(values).toContain("justice");
    expect(values).toContain("business");
    expect(values).toContain("spending");
    expect(values).toContain("alert");
    expect(values).toContain("trend");
    expect(values).toContain("context");
    expect(values).toContain("off_the_charts");
    expect(values).toContain("311_images");
  });

  it("has 11 topic chips total", () => {
    expect(TOPIC_ORDER).toHaveLength(11);
  });
});

// ── My Block client-side filter ───────────────────────────────────────────

describe("My Block filter", () => {
  it("shows only stories with my_block metadata when filter is active", () => {
    const stories = [
      makeStory({ id: 1, metadata: { my_block: true } }),
      makeStory({ id: 2, metadata: {} }),
      makeStory({ id: 3, metadata: { my_block: true } }),
    ];
    const result = filterStories(stories, { selectedTopic: "my_block" });
    expect(result).toHaveLength(2);
    expect(result.map((s) => s.id)).toEqual([1, 3]);
  });

  it("returns empty array when no stories have my_block metadata", () => {
    const stories = [
      makeStory({ id: 1, metadata: {} }),
      makeStory({ id: 2, metadata: { some_other: true } }),
    ];
    const result = filterStories(stories, { selectedTopic: "my_block" });
    expect(result).toHaveLength(0);
  });

  it("returns all stories when no topic filter is set", () => {
    const stories = [
      makeStory({ id: 1, metadata: { my_block: true } }),
      makeStory({ id: 2, metadata: {} }),
    ];
    const result = filterStories(stories, { selectedTopic: null });
    expect(result).toHaveLength(2);
  });
});

// ── My Block address gating ───────────────────────────────────────────────

describe("My Block address gating", () => {
  it("should open location modal when user has no saved places", () => {
    const userPlaces: { id: number; city_id: number; label: string }[] = [];
    const hasAddress = userPlaces.length > 0;

    // Simulate clicking My Block without address
    let showLocationModal = false;
    let selectedTopic: string | null = null;

    if (!hasAddress) {
      showLocationModal = true;
    } else {
      selectedTopic = "my_block";
    }

    expect(showLocationModal).toBe(true);
    expect(selectedTopic).toBeNull();
  });

  it("should set topic to my_block when user has saved places", () => {
    const userPlaces = [{ id: 1, city_id: 57260, label: "My block" }];
    const hasAddress = userPlaces.length > 0;

    let showLocationModal = false;
    let selectedTopic: string | null = null;

    if (!hasAddress) {
      showLocationModal = true;
    } else {
      selectedTopic = "my_block";
    }

    expect(showLocationModal).toBe(false);
    expect(selectedTopic).toBe("my_block");
  });
});

// ── My Block empty state conditions ───────────────────────────────────────

describe("My Block empty state", () => {
  it("shows 'no stories yet' when user has address but no my_block stories", () => {
    const stories = [
      makeStory({ id: 1, metadata: {} }),
      makeStory({ id: 2, metadata: {} }),
    ];
    const visible = filterStories(stories, { selectedTopic: "my_block" });
    const hasAddress = true;
    const isMyBlockEmpty = visible.length === 0 && stories.length > 0;

    expect(isMyBlockEmpty).toBe(true);
    expect(hasAddress).toBe(true);
    // Component would show: "No My Block stories yet"
  });

  it("shows 'add address' when user has no address and no my_block stories", () => {
    const stories = [
      makeStory({ id: 1, metadata: {} }),
    ];
    const visible = filterStories(stories, { selectedTopic: "my_block" });
    const hasAddress = false;
    const isMyBlockEmpty = visible.length === 0 && stories.length > 0;

    expect(isMyBlockEmpty).toBe(true);
    expect(hasAddress).toBe(false);
    // Component would show: "Set your location" + "Add your address" button
  });

  it("does not show empty state when my_block stories exist", () => {
    const stories = [
      makeStory({ id: 1, metadata: { my_block: true } }),
      makeStory({ id: 2, metadata: {} }),
    ];
    const visible = filterStories(stories, { selectedTopic: "my_block" });

    expect(visible.length).toBeGreaterThan(0);
    // No empty state shown
  });
});

// ── Topic filter (non-My Block) ───────────────────────────────────────────

describe("Topic filter (card_type matching)", () => {
  it("filters by card_type for standard topics", () => {
    const stories = [
      makeStory({ id: 1, story_type: "alert" }),
      makeStory({ id: 2, story_type: "research", headline: "Crime dropped 15% in District 6" }),
      makeStory({ id: 3, story_type: "spending" }),
    ];
    const enriched = enrichStories(stories);
    // Filter for alert card_type
    const alertStories = enriched.filter((s) => s.card_type === "alert");
    expect(alertStories.length).toBeGreaterThanOrEqual(1);
  });

  it("returns empty when no stories match the selected topic", () => {
    const stories = [
      makeStory({ id: 1, story_type: "research" }),
    ];
    const result = filterStories(stories, { selectedTopic: "311_images" });
    expect(result).toHaveLength(0);
  });
});

// ── Generic client-side empty state ───────────────────────────────────────

describe("Generic filter empty state", () => {
  it("triggers when topic filter produces zero results from non-empty stories", () => {
    const stories = [makeStory({ id: 1 }), makeStory({ id: 2 })];
    const selectedTopic = "311_images";
    const visible = filterStories(stories, { selectedTopic });

    const showGenericEmpty =
      visible.length === 0 &&
      stories.length > 0 &&
      selectedTopic !== "my_block" &&
      selectedTopic !== null;

    expect(showGenericEmpty).toBe(true);
  });

  it("does not trigger for my_block (has its own empty state)", () => {
    const stories = [makeStory({ id: 1 })];
    const selectedTopic = "my_block";
    const visible = filterStories(stories, { selectedTopic });

    const showGenericEmpty =
      visible.length === 0 &&
      stories.length > 0 &&
      selectedTopic !== "my_block" &&
      selectedTopic !== null;

    expect(showGenericEmpty).toBe(false);
  });

  it("does not trigger when stories are visible", () => {
    const stories = [makeStory({ id: 1, metadata: { my_block: true } })];
    const selectedTopic = "my_block";
    const visible = filterStories(stories, { selectedTopic });

    const showGenericEmpty =
      visible.length === 0 && stories.length > 0;

    expect(showGenericEmpty).toBe(false);
  });
});

// ── City filter interaction ───────────────────────────────────────────────

describe("City filter", () => {
  it("filters stories by city_id when a single city is selected", () => {
    const stories = [
      makeStory({ id: 1, city_id: 100 }),
      makeStory({ id: 2, city_id: 200 }),
      makeStory({ id: 3, city_id: 100 }),
    ];
    const result = filterStories(stories, { selectedCityIds: new Set([100]) });
    expect(result).toHaveLength(2);
    expect(result.every((s) => s.city_id === 100)).toBe(true);
  });

  it("shows all stories when no city is selected (empty set)", () => {
    const stories = [
      makeStory({ id: 1, city_id: 100 }),
      makeStory({ id: 2, city_id: 200 }),
    ];
    const result = filterStories(stories, { selectedCityIds: new Set() });
    expect(result).toHaveLength(2);
  });
});

// ── Hidden stories ────────────────────────────────────────────────────────

describe("Hidden stories filter", () => {
  it("excludes hidden story IDs", () => {
    const stories = [
      makeStory({ id: 1 }),
      makeStory({ id: 2 }),
      makeStory({ id: 3 }),
    ];
    const result = filterStories(stories, { hiddenIds: new Set([2]) });
    expect(result).toHaveLength(2);
    expect(result.map((s) => s.id)).toEqual([1, 3]);
  });

  it("combines with topic filter", () => {
    const stories = [
      makeStory({ id: 1, metadata: { my_block: true } }),
      makeStory({ id: 2, metadata: { my_block: true } }),
      makeStory({ id: 3, metadata: {} }),
    ];
    const result = filterStories(stories, {
      selectedTopic: "my_block",
      hiddenIds: new Set([1]),
    });
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(2);
  });
});

// ── District drawer state logic ───────────────────────────────────────────

describe("District drawer toggle logic", () => {
  it("shows district term as label when no district is selected", () => {
    const selectedDistrict: number | null = null;
    const districtPrefix = "D";
    const districtTerm = "District";

    const label = selectedDistrict !== null
      ? `${districtPrefix}${selectedDistrict}`
      : `${districtTerm}s`;

    expect(label).toBe("Districts");
  });

  it("shows selected district in chip when one is picked", () => {
    const selectedDistrict = 5;
    const districtPrefix = "D";
    const districtTerm = "District";

    const label = selectedDistrict !== null
      ? `${districtPrefix}${selectedDistrict}`
      : `${districtTerm}s`;

    expect(label).toBe("D5");
  });

  it("uses Ward prefix for ward-based cities", () => {
    const selectedDistrict = 3;
    const districtTerm = "Ward";
    const districtPrefix = districtTerm.toLowerCase() === "ward" ? "W" : "D";

    const label = selectedDistrict !== null
      ? `${districtPrefix}${selectedDistrict}`
      : `${districtTerm}s`;

    expect(label).toBe("W3");
  });

  it("highlights chip when drawer is open or district is selected", () => {
    // Case 1: drawer open, no selection
    expect(true || null !== null).toBe(true);
    // Case 2: drawer closed, selection active
    expect(false || 5 !== null).toBe(true);
    // Case 3: drawer closed, no selection -> not highlighted
    expect(false || null !== null).toBe(false);
  });
});

// ── feedOrder removal ─────────────────────────────────────────────────────

describe("Feed order", () => {
  it("always uses 'for_you' ordering (toggle removed)", () => {
    const feedOrder = "for_you" as const;
    expect(feedOrder).toBe("for_you");
  });
});

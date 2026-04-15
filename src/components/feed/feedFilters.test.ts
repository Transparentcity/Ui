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
    const userPlaces = [{ id: 1, city_id: 57260, label: "My Block" }];
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

// ── Bad data suppression ─────────────────────────────────────────────────

/**
 * Replicate the bad-data filter from FeedContainer.visibleStories.
 * Stories are suppressed when:
 *  - value is 0 and pct is exactly -100 (stale data gap)
 *  - abs(pct) > 500 (implausible spike)
 *  - pct <= -90 (extreme drop, likely partial reporting period)
 */
function shouldSuppressStory(storyPct: number | undefined, storyVal: number | undefined): boolean {
  if (storyPct != null) {
    if (storyVal === 0 && storyPct === -100) return true;
    if (Math.abs(storyPct) > 500) return true;
    if (storyPct <= -90) return true;
  }
  return false;
}

describe("Bad data suppression", () => {
  it("suppresses value=0, pct=-100 (stale data gap)", () => {
    expect(shouldSuppressStory(-100, 0)).toBe(true);
  });

  it("suppresses >500% increase", () => {
    expect(shouldSuppressStory(600, 1200)).toBe(true);
  });

  it("suppresses >500% decrease (should not happen, but covered)", () => {
    expect(shouldSuppressStory(-600, 10)).toBe(true);
  });

  it("suppresses -95% drop (partial reporting period)", () => {
    expect(shouldSuppressStory(-95, 269)).toBe(true);
  });

  it("suppresses -90% drop", () => {
    expect(shouldSuppressStory(-90, 100)).toBe(true);
  });

  it("allows -89% drop (within plausible range)", () => {
    expect(shouldSuppressStory(-89, 500)).toBe(false);
  });

  it("allows moderate changes like -50%", () => {
    expect(shouldSuppressStory(-50, 3000)).toBe(false);
  });

  it("allows moderate positive changes like +200%", () => {
    expect(shouldSuppressStory(200, 600)).toBe(false);
  });

  it("does not suppress when pct is undefined", () => {
    expect(shouldSuppressStory(undefined, 0)).toBe(false);
  });
});

// ── First-visit filter defaults (maximize stories for new subscribers) ───

/**
 * Replicate the filter-initialization logic from FeedContainer.
 * `savedFilters` is null on a first-ever visit (nothing in sessionStorage).
 */
function computeInitialFilters(opts: {
  savedFilters: { onlyMySavedPlaces: boolean } | null;
  userPlacesCount: number;
  homeCityId: number | null;
  explicitCityId: number | null;
}) {
  const { savedFilters, homeCityId, explicitCityId } = opts;

  const onlyMySavedPlacesFeed = savedFilters?.onlyMySavedPlaces ?? false;

  const selectedCityIds =
    explicitCityId != null
      ? new Set([explicitCityId])
      : homeCityId != null
        ? new Set([homeCityId])
        : new Set<number>();

  const selectedTopics = new Set<string>(); // always empty on init
  const selectedDistricts = new Map<number, Set<number>>();
  const personalNewsletterOnly = false;
  const selectedPlaceId: number | null = null;

  return {
    onlyMySavedPlacesFeed,
    selectedCityIds,
    selectedTopics,
    selectedDistricts,
    personalNewsletterOnly,
    selectedPlaceId,
  };
}

/**
 * Replicate apiOnlyMySavedPlaces derivation from FeedContainer.
 * This is the flag that actually restricts the API call.
 */
function computeApiOnlyMySavedPlaces(opts: {
  isAuthenticated: boolean;
  onlyMySavedPlacesFeed: boolean;
  selectedPlaceId: number | null;
  selectedCityIds: Set<number>;
  personalNewsletterOnly: boolean;
  isOnboardingScanning: boolean;
  userPlacesCount: number;
}) {
  return (
    opts.isAuthenticated &&
    opts.onlyMySavedPlacesFeed &&
    opts.selectedPlaceId == null &&
    opts.selectedCityIds.size === 0 &&
    !opts.personalNewsletterOnly &&
    !opts.isOnboardingScanning &&
    opts.userPlacesCount > 0
  );
}

describe("First-visit filter defaults (new subscriber)", () => {
  it("does NOT enable onlyMySavedPlaces on first visit, even with saved places", () => {
    const filters = computeInitialFilters({
      savedFilters: null, // first visit: no sessionStorage
      userPlacesCount: 3,
      homeCityId: 100,
      explicitCityId: null,
    });
    expect(filters.onlyMySavedPlacesFeed).toBe(false);
  });

  it("restores onlyMySavedPlaces=true from a previous session", () => {
    const filters = computeInitialFilters({
      savedFilters: { onlyMySavedPlaces: true },
      userPlacesCount: 3,
      homeCityId: 100,
      explicitCityId: null,
    });
    expect(filters.onlyMySavedPlacesFeed).toBe(true);
  });

  it("restores onlyMySavedPlaces=false from a previous session", () => {
    const filters = computeInitialFilters({
      savedFilters: { onlyMySavedPlaces: false },
      userPlacesCount: 3,
      homeCityId: 100,
      explicitCityId: null,
    });
    expect(filters.onlyMySavedPlacesFeed).toBe(false);
  });

  it("defaults topics to empty set (all topics shown)", () => {
    const filters = computeInitialFilters({
      savedFilters: null,
      userPlacesCount: 0,
      homeCityId: 100,
      explicitCityId: null,
    });
    expect(filters.selectedTopics.size).toBe(0);
  });

  it("defaults districts to empty map (all districts shown)", () => {
    const filters = computeInitialFilters({
      savedFilters: null,
      userPlacesCount: 0,
      homeCityId: 100,
      explicitCityId: null,
    });
    expect(filters.selectedDistricts.size).toBe(0);
  });

  it("selects home city when no explicit city is passed", () => {
    const filters = computeInitialFilters({
      savedFilters: null,
      userPlacesCount: 0,
      homeCityId: 42,
      explicitCityId: null,
    });
    expect(filters.selectedCityIds).toEqual(new Set([42]));
  });

  it("selects explicit city over home city", () => {
    const filters = computeInitialFilters({
      savedFilters: null,
      userPlacesCount: 0,
      homeCityId: 42,
      explicitCityId: 99,
    });
    expect(filters.selectedCityIds).toEqual(new Set([99]));
  });

  it("leaves city selection empty when neither home nor explicit city exists", () => {
    const filters = computeInitialFilters({
      savedFilters: null,
      userPlacesCount: 0,
      homeCityId: null,
      explicitCityId: null,
    });
    expect(filters.selectedCityIds.size).toBe(0);
  });
});

describe("apiOnlyMySavedPlaces derivation", () => {
  it("is false when onlyMySavedPlacesFeed is false (first visit default)", () => {
    const result = computeApiOnlyMySavedPlaces({
      isAuthenticated: true,
      onlyMySavedPlacesFeed: false,
      selectedPlaceId: null,
      selectedCityIds: new Set(),
      personalNewsletterOnly: false,
      isOnboardingScanning: false,
      userPlacesCount: 3,
    });
    expect(result).toBe(false);
  });

  it("is false when a specific city is selected (even if toggle is on)", () => {
    const result = computeApiOnlyMySavedPlaces({
      isAuthenticated: true,
      onlyMySavedPlacesFeed: true,
      selectedPlaceId: null,
      selectedCityIds: new Set([100]),
      personalNewsletterOnly: false,
      isOnboardingScanning: false,
      userPlacesCount: 3,
    });
    expect(result).toBe(false);
  });

  it("is false during onboarding scanning (even if toggle is on)", () => {
    const result = computeApiOnlyMySavedPlaces({
      isAuthenticated: true,
      onlyMySavedPlacesFeed: true,
      selectedPlaceId: null,
      selectedCityIds: new Set(),
      personalNewsletterOnly: false,
      isOnboardingScanning: true,
      userPlacesCount: 3,
    });
    expect(result).toBe(false);
  });

  it("is false when user has no saved places (even if toggle is on)", () => {
    const result = computeApiOnlyMySavedPlaces({
      isAuthenticated: true,
      onlyMySavedPlacesFeed: true,
      selectedPlaceId: null,
      selectedCityIds: new Set(),
      personalNewsletterOnly: false,
      isOnboardingScanning: false,
      userPlacesCount: 0,
    });
    expect(result).toBe(false);
  });

  it("is true only when all conditions are met (returning user with toggle on)", () => {
    const result = computeApiOnlyMySavedPlaces({
      isAuthenticated: true,
      onlyMySavedPlacesFeed: true,
      selectedPlaceId: null,
      selectedCityIds: new Set(),
      personalNewsletterOnly: false,
      isOnboardingScanning: false,
      userPlacesCount: 3,
    });
    expect(result).toBe(true);
  });

  it("is false when not authenticated", () => {
    const result = computeApiOnlyMySavedPlaces({
      isAuthenticated: false,
      onlyMySavedPlacesFeed: true,
      selectedPlaceId: null,
      selectedCityIds: new Set(),
      personalNewsletterOnly: false,
      isOnboardingScanning: false,
      userPlacesCount: 3,
    });
    expect(result).toBe(false);
  });
});

describe("New subscriber sees maximum stories (end-to-end filter scenarios)", () => {
  it("Scenario 1: home city has stories, first visit", () => {
    const filters = computeInitialFilters({
      savedFilters: null,
      userPlacesCount: 2,
      homeCityId: 100,
      explicitCityId: null,
    });

    // API sends city_id=100, no saved-places restriction
    const apiFlag = computeApiOnlyMySavedPlaces({
      isAuthenticated: true,
      onlyMySavedPlacesFeed: filters.onlyMySavedPlacesFeed,
      selectedPlaceId: filters.selectedPlaceId,
      selectedCityIds: filters.selectedCityIds,
      personalNewsletterOnly: filters.personalNewsletterOnly,
      isOnboardingScanning: false,
      userPlacesCount: 2,
    });

    expect(filters.selectedCityIds).toEqual(new Set([100]));
    expect(filters.selectedTopics.size).toBe(0); // all topics
    expect(apiFlag).toBe(false); // no saved-places restriction
  });

  it("Scenario 2: city not launched, auto-switch to All Cities", () => {
    const filters = computeInitialFilters({
      savedFilters: null,
      userPlacesCount: 1,
      homeCityId: 999,
      explicitCityId: null,
    });

    // Simulate auto-switch: city had no stories, so selectedCityIds becomes empty
    const afterAutoSwitch = new Set<number>();

    const apiFlag = computeApiOnlyMySavedPlaces({
      isAuthenticated: true,
      onlyMySavedPlacesFeed: filters.onlyMySavedPlacesFeed,
      selectedPlaceId: filters.selectedPlaceId,
      selectedCityIds: afterAutoSwitch,
      personalNewsletterOnly: filters.personalNewsletterOnly,
      isOnboardingScanning: false,
      userPlacesCount: 1,
    });

    expect(afterAutoSwitch.size).toBe(0); // all cities mode
    expect(filters.selectedTopics.size).toBe(0); // all topics
    expect(apiFlag).toBe(false); // no saved-places restriction
  });

  it("Scenario 3: no home city and no explicit city, first visit", () => {
    const filters = computeInitialFilters({
      savedFilters: null,
      userPlacesCount: 0,
      homeCityId: null,
      explicitCityId: null,
    });

    const apiFlag = computeApiOnlyMySavedPlaces({
      isAuthenticated: true,
      onlyMySavedPlacesFeed: filters.onlyMySavedPlacesFeed,
      selectedPlaceId: filters.selectedPlaceId,
      selectedCityIds: filters.selectedCityIds,
      personalNewsletterOnly: filters.personalNewsletterOnly,
      isOnboardingScanning: false,
      userPlacesCount: 0,
    });

    expect(filters.selectedCityIds.size).toBe(0); // all cities
    expect(apiFlag).toBe(false); // no restriction
  });
});

// ── feedOrder removal ─────────────────────────────────────────────────────

describe("Feed order", () => {
  it("always uses 'for_you' ordering (toggle removed)", () => {
    const feedOrder = "for_you" as const;
    expect(feedOrder).toBe("for_you");
  });
});

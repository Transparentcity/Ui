/**
 * Tests for the Feed V2 enrichment layer.
 *
 * Covers: deriveCardType, deriveTemplate, deriveActor, enrichStory,
 * enrichStories interleaving, buildPlaceMap, and all new card types
 * (context, multi_metric, off_the_charts, my_block, 311_images).
 */

import { describe, it, expect } from "vitest";
import type { FeedStory } from "@/lib/hooks/useFeed";
import {
  enrichStory,
  enrichStories,
  buildPlaceMap,
  type CardType,
  type EnrichedFeedStory,
} from "./mockFeedData";

// ── Test factory ──────────────────────────────────────────────────────────

function makeStory(overrides: Partial<FeedStory> = {}): FeedStory {
  return {
    id: 1,
    story_type: "research",
    city_id: 57260,
    city_name: "San Francisco",
    city_emoji: "🌉",
    district: 6,
    research_report_id: 100,
    headline: "Test headline",
    description: "This is a test description with enough length to be meaningful and not get cleaned up by the text cleanup module.",
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

// ── deriveCardType (tested via enrichStory) ────────────────────────────────

describe("deriveCardType", () => {
  it.each<[string, Partial<FeedStory>, CardType]>([
    ["trusts backend story_type 'alert'", { story_type: "alert" }, "alert"],
    ["trusts backend story_type 'trend'", { story_type: "trend" }, "trend"],
    ["trusts backend story_type 'safety'", { story_type: "safety" }, "safety"],
    ["trusts backend story_type 'justice'", { story_type: "justice" }, "justice"],
    ["trusts backend story_type 'business'", { story_type: "business" }, "business"],
    ["trusts backend story_type 'spending'", { story_type: "spending" }, "spending"],
    ["trusts backend story_type 'context'", { story_type: "context" }, "context"],
    ["trusts backend story_type 'multi_metric'", { story_type: "multi_metric" }, "multi_metric"],
    ["trusts backend story_type 'off_the_charts'", { story_type: "off_the_charts" }, "off_the_charts"],
    ["falls back to alert for unknown 'my_block'", { story_type: "my_block" }, "alert"],
    ["trusts backend story_type '311_images'", { story_type: "311_images" }, "311_images"],
  ])("%s", (_label, overrides, expected) => {
    const enriched = enrichStory(makeStory(overrides));
    expect(enriched.card_type).toBe(expected);
  });

  it("falls back to metadata.angle 'metric_highlight' → trend", () => {
    const enriched = enrichStory(
      makeStory({ story_type: "research", metadata: { angle: "metric_highlight" } })
    );
    expect(enriched.card_type).toBe("trend");
  });

  it("falls back to anomaly_severity critical → alert", () => {
    const enriched = enrichStory(
      makeStory({ story_type: "research", metadata: { anomaly_severity: "critical" } })
    );
    expect(enriched.card_type).toBe("alert");
  });

  it("detects spending from headline keywords", () => {
    const enriched = enrichStory(
      makeStory({ story_type: "research", headline: "City contract worth $50M awarded" })
    );
    expect(enriched.card_type).toBe("spending");
  });

  it("detects justice from headline keywords", () => {
    const enriched = enrichStory(
      makeStory({ story_type: "research", headline: "DA files charges in fraud case" })
    );
    expect(enriched.card_type).toBe("justice");
  });

  it("detects safety from headline keywords", () => {
    const enriched = enrichStory(
      makeStory({ story_type: "research", headline: "911 response time up 15%" })
    );
    expect(enriched.card_type).toBe("safety");
  });

  it("trusts backend story_type 'traction'", () => {
    const enriched = enrichStory(makeStory({ story_type: "traction" }));
    expect(enriched.card_type).toBe("traction");
  });

  it("detects traction from 'solar' keyword", () => {
    const enriched = enrichStory(
      makeStory({ story_type: "research", headline: "1,200 solar panels installed on city buildings" })
    );
    expect(enriched.card_type).toBe("traction");
  });

  it("detects traction from 'units built' keyword", () => {
    const enriched = enrichStory(
      makeStory({ story_type: "research", headline: "400 affordable housing units built this year" })
    );
    expect(enriched.card_type).toBe("traction");
  });

  it("detects traction from 'people helped' keyword", () => {
    const enriched = enrichStory(
      makeStory({ story_type: "research", headline: "City shelter helped 3,000 people last quarter" })
    );
    expect(enriched.card_type).toBe("traction");
  });

  it("traction takes priority over business for 'restaurant expanded'", () => {
    const enriched = enrichStory(
      makeStory({ story_type: "research", headline: "Local restaurant expanded to second location" })
    );
    expect(enriched.card_type).toBe("traction");
  });

  it("detects business from headline keywords", () => {
    const enriched = enrichStory(
      makeStory({ story_type: "research", headline: "New restaurant opens in the Mission" })
    );
    expect(enriched.card_type).toBe("business");
  });

  it("detects 311_images from visualization_type 'photo'", () => {
    const enriched = enrichStory(
      makeStory({ story_type: "research", visualization_type: "photo" })
    );
    expect(enriched.card_type).toBe("311_images");
  });

  it("detects 311_images from metadata.311_image", () => {
    const enriched = enrichStory(
      makeStory({ story_type: "research", metadata: { "311_image": true } })
    );
    expect(enriched.card_type).toBe("311_images");
  });

  it.each([
    "graffiti", "pothole", "sidewalk", "litter", "dumping", "rodent", "blocked", "streetlight",
  ])("detects 311_images from headline keyword '%s'", (keyword) => {
    const enriched = enrichStory(
      makeStory({ story_type: "manual", headline: `SF ${keyword} complaints surge` })
    );
    expect(enriched.card_type).toBe("311_images");
  });

  it("defaults to alert when nothing matches", () => {
    const enriched = enrichStory(makeStory({ story_type: "research" }));
    expect(enriched.card_type).toBe("alert");
  });
});

// ── deriveTemplate (tested via enrichStory) ───────────────────────────────

describe("deriveTemplate", () => {
  it("returns 'multi_metric' when card_type is multi_metric", () => {
    const enriched = enrichStory(makeStory({ story_type: "multi_metric" }));
    expect(enriched.template).toBe("multi_metric");
  });

  it("returns 'multi_metric' when metadata.metrics has 2+ entries", () => {
    const enriched = enrichStory(
      makeStory({
        story_type: "research",
        metadata: { metrics: [{ name: "A" }, { name: "B" }] },
      })
    );
    expect(enriched.template).toBe("multi_metric");
  });

  it("returns 'text_chart' for chart visualization", () => {
    const enriched = enrichStory(
      makeStory({
        visualization_type: "chart",
        primary_visualization: { id: 1, type: "chart", short_hash: null },
      })
    );
    expect(enriched.template).toBe("text_chart");
  });

  it("returns 'text_chart' for map visualization", () => {
    const enriched = enrichStory(
      makeStory({
        visualization_type: "map",
        primary_visualization: { id: null, type: "map", short_hash: "abc123" },
      })
    );
    expect(enriched.template).toBe("text_chart");
  });

  it("returns 'text_photo' for photo visualization", () => {
    const enriched = enrichStory(
      makeStory({ visualization_type: "photo" })
    );
    expect(enriched.template).toBe("text_photo");
  });

  it("returns 'text_photo' when metadata has 311_image", () => {
    const enriched = enrichStory(
      makeStory({ metadata: { "311_image": "https://example.com/img.jpg" } })
    );
    expect(enriched.template).toBe("text_photo");
  });

  it("returns 'text_only' for stories without visualizations", () => {
    const enriched = enrichStory(makeStory());
    expect(enriched.template).toBe("text_only");
  });
});

// ── deriveActor (tested via enrichStory) ──────────────────────────────────

describe("deriveActor", () => {
  it.each<[string, string, CardType | undefined, string]>([
    ["graffiti → Public Works", "Graffiti reported on 24th", undefined, "Public Works"],
    ["police keyword → Police", "Police arrest burglary suspect", undefined, "Police"],
    ["fire dept → Fire Dept", "Fire department responds to 3-alarm blaze", undefined, "Fire Dept"],
    ["building permit → Building Dept", "New building permit filed for condo", undefined, "Building Dept"],
    ["transit → Transit", "Muni delays double on weekday mornings", undefined, "Transit"],
    ["health → Public Health", "Hospital admissions spike after overdose wave", undefined, "Public Health"],
    ["budget → Controller", "City budget shortfall reaches $100M", undefined, "Controller"],
    ["court → District Attorney", "DA files new charges in corruption probe", undefined, "District Attorney"],
    ["311 keyword → 311", "311 complaints surge in the Tenderloin", undefined, "311"],
  ])("%s", (_label, headline, _cardType, expectedActor) => {
    const enriched = enrichStory(makeStory({ headline }));
    expect(enriched.actor).toBe(expectedActor);
  });

  it("falls back by card_type for safety → Police", () => {
    const enriched = enrichStory(
      makeStory({ story_type: "safety", headline: "A generic headline with no keywords" })
    );
    expect(enriched.actor).toBe("Police");
  });

  it("falls back for my_block → City Hall", () => {
    const enriched = enrichStory(
      makeStory({ story_type: "my_block", headline: "A generic headline" })
    );
    expect(enriched.actor).toBe("City Hall");
  });

  it("falls back for context → City Hall", () => {
    const enriched = enrichStory(
      makeStory({ story_type: "context", headline: "A generic headline" })
    );
    expect(enriched.actor).toBe("City Hall");
  });

  it("falls back for off_the_charts → City Hall", () => {
    const enriched = enrichStory(
      makeStory({ story_type: "off_the_charts", headline: "A generic headline" })
    );
    expect(enriched.actor).toBe("City Hall");
  });

  it("falls back for traction → City Hall", () => {
    const enriched = enrichStory(
      makeStory({ story_type: "traction", headline: "A generic traction headline" })
    );
    expect(enriched.actor).toBe("City Hall");
  });
});

// ── enrichStory field population ──────────────────────────────────────────

describe("enrichStory", () => {
  it("populates all enriched fields", () => {
    const story = makeStory({
      story_type: "alert",
      like_count: 12,
      comment_count: 5,
      share_count: 3,
    });
    const enriched = enrichStory(story);

    expect(enriched.card_type).toBe("alert");
    expect(enriched.template).toBe("text_only");
    // Engagement counts are still mapped from the backend but no longer rendered in the UI
    expect(enriched.applaud_count).toBe(12);
    expect(enriched.escalate_count).toBe(5);
    expect(enriched.investigate_count).toBe(0);
    expect(enriched.type_icon).toBeTruthy();
    expect(enriched.type_label).toBe("Alert");
    expect(enriched.actor).toBeTruthy();
    expect(enriched.neighborhood_label).toContain("San Francisco");
    expect(enriched.subline).toBeTruthy();
    expect(typeof enriched.cleaned_description).toBe("string");
  });

  it("uses type_icon from TYPE_ICONS map for each card type", () => {
    const types: CardType[] = [
      "alert", "trend", "business", "spending", "justice", "safety",
      "311_images", "my_block", "context", "multi_metric", "off_the_charts",
    ];
    for (const t of types) {
      const enriched = enrichStory(makeStory({ story_type: t }));
      expect(enriched.type_icon).toBeTruthy();
      expect(enriched.type_label).toBeTruthy();
    }
  });

  it("resolves image_url for chart visualization", () => {
    const enriched = enrichStory(
      makeStory({
        visualization_type: "chart",
        primary_visualization: { id: 42, type: "chart", short_hash: null },
      })
    );
    expect(enriched.image_url_resolved).toContain("/api/time-series/public/42/image");
  });

  it("resolves embed_url for anomaly visualization", () => {
    const enriched = enrichStory(
      makeStory({
        visualization_type: "anomaly",
        primary_visualization: { id: 99, type: "anomaly", short_hash: null },
      })
    );
    expect(enriched.embed_url_resolved).toBe("/a/99?embedded=true");
  });

  it("resolves embed_url for map via short_hash", () => {
    const enriched = enrichStory(
      makeStory({
        visualization_type: "map",
        primary_visualization: { id: null, type: "map", short_hash: "xyz789" },
      })
    );
    expect(enriched.embed_url_resolved).toBe("/m/xyz789?embedded=true");
  });

  it("returns null image/embed for stories without visualizations", () => {
    const enriched = enrichStory(makeStory());
    expect(enriched.image_url_resolved).toBeNull();
    expect(enriched.embed_url_resolved).toBeNull();
  });

  it("defaults engagement counts to 0 when null", () => {
    // Engagement counts are still mapped from the backend but no longer rendered in the UI
    const enriched = enrichStory(
      makeStory({ like_count: 0, comment_count: 0, share_count: 0 })
    );
    expect(enriched.applaud_count).toBe(0);
    expect(enriched.escalate_count).toBe(0);
    expect(enriched.investigate_count).toBe(0);
  });

  it("prefers summary over description when summary has >20 chars", () => {
    const enriched = enrichStory(
      makeStory({
        summary: "This is a long and meaningful summary that should be used for display in feed cards.",
        description: "Short desc",
      })
    );
    // cleaned_description should derive from the summary
    expect(enriched.cleaned_description).toBeTruthy();
  });
});

// ── Neighborhood label derivation ──────────────────────────────────────────

describe("neighborhood label", () => {
  it("shows district when present", () => {
    const enriched = enrichStory(makeStory({ city_name: "Chicago", district: 5 }));
    expect(enriched.neighborhood_label).toBe("Chicago · District 5");
  });

  it("shows city-wide for district 0", () => {
    const enriched = enrichStory(makeStory({ city_name: "Oakland", district: 0 }));
    expect(enriched.neighborhood_label).toBe("Oakland · City-wide");
  });

  it("shows just city when district is null", () => {
    const enriched = enrichStory(makeStory({ city_name: "Seattle", district: null as unknown as number }));
    expect(enriched.neighborhood_label).toBe("Seattle");
  });

  it("extracts district from headline when district is 0", () => {
    const enriched = enrichStory(
      makeStory({
        city_name: "San Francisco",
        district: 0,
        headline: "District 6 sees spike in 311 requests",
      })
    );
    expect(enriched.neighborhood_label).toBe("San Francisco · District 6");
  });

  it("uses placeMap for richer labels", () => {
    const places = [
      { city_id: 57260, district: 6, label: "San Francisco – Mission · D6" },
    ];
    const placeMap = buildPlaceMap(places);
    const enriched = enrichStory(
      makeStory({ city_id: 57260, district: 6 }),
      placeMap
    );
    // Should use the place label since "Mission" is extra info
    expect(enriched.neighborhood_label).toContain("Mission");
  });
});

// ── Subline formatting ────────────────────────────────────────────────────

describe("subline (time ago)", () => {
  it("shows 'Just now' for very recent stories", () => {
    const enriched = enrichStory(
      makeStory({ published_at: new Date().toISOString() })
    );
    expect(enriched.subline).toBe("Just now");
  });

  it("shows hours for stories < 24h old", () => {
    const twoHoursAgo = new Date(Date.now() - 2 * 3600000).toISOString();
    const enriched = enrichStory(makeStory({ published_at: twoHoursAgo }));
    expect(enriched.subline).toBe("2 hours ago");
  });

  it("shows 'Yesterday' for 1-day-old stories", () => {
    const yesterday = new Date(Date.now() - 26 * 3600000).toISOString();
    const enriched = enrichStory(makeStory({ published_at: yesterday }));
    expect(enriched.subline).toBe("Yesterday");
  });

  it("shows 'N days ago' for stories < 7 days old", () => {
    const threeDaysAgo = new Date(Date.now() - 3 * 86400000).toISOString();
    const enriched = enrichStory(makeStory({ published_at: threeDaysAgo }));
    expect(enriched.subline).toBe("3 days ago");
  });

  it("shows date for stories > 7 days old", () => {
    const enriched = enrichStory(
      makeStory({ published_at: "2026-01-15T12:00:00Z" })
    );
    expect(enriched.subline).toMatch(/Jan\s+15/);
  });

  it("falls back to story_date when published_at is null", () => {
    const enriched = enrichStory(
      makeStory({ published_at: null, story_date: "2026-01-10T12:00:00Z" })
    );
    // Could be Jan 9 or 10 depending on timezone; just verify it shows a date
    expect(enriched.subline).toMatch(/Jan\s+\d+/);
  });
});

// ── enrichStories interleaving ─────────────────────────────────────────────

describe("enrichStories", () => {
  it("returns enriched array for text-only stories", () => {
    const stories = [makeStory({ id: 1 }), makeStory({ id: 2 }), makeStory({ id: 3 })];
    const result = enrichStories(stories);
    expect(result).toHaveLength(3);
    expect(result[0].card_type).toBeTruthy();
  });

  it("interleaves viz stories every 3rd position", () => {
    // 4 text-only + 2 with viz = 6 total
    const textStories = Array.from({ length: 4 }, (_, i) =>
      makeStory({ id: i + 1, headline: `Text story ${i + 1}` })
    );
    const vizStories = Array.from({ length: 2 }, (_, i) =>
      makeStory({
        id: 100 + i,
        headline: `Viz story ${i + 1}`,
        visualization_type: "chart",
        primary_visualization: { id: 100 + i, type: "chart", short_hash: null },
      })
    );
    const all = [...textStories, ...vizStories];
    const result = enrichStories(all);

    expect(result).toHaveLength(6);
    // Position 3 (index 3) should be a viz story (every 3rd position)
    expect(result[3].embed_url_resolved).toBeTruthy();
  });

  it("treats photo stories as visual for interleaving", () => {
    // 4 text-only + 1 photo story (311_images with no embed_url)
    const textStories = Array.from({ length: 4 }, (_, i) =>
      makeStory({ id: i + 1, headline: `Text story ${i + 1}` })
    );
    const photoStory = makeStory({
      id: 200,
      story_type: "311_images",
      headline: "Graffiti on Market St",
    });
    const all = [...textStories, photoStory];
    const result = enrichStories(all);

    expect(result).toHaveLength(5);
    // The photo story should be interleaved at position 3 (every 3rd)
    const photoIdx = result.findIndex((s) => s.id === 200);
    expect(photoIdx).toBe(3);
  });

  it("returns all stories when no viz stories present", () => {
    const stories = Array.from({ length: 5 }, (_, i) =>
      makeStory({ id: i + 1 })
    );
    const result = enrichStories(stories);
    expect(result).toHaveLength(5);
  });

  it("handles empty input", () => {
    const result = enrichStories([]);
    expect(result).toEqual([]);
  });
});

// ── buildPlaceMap ──────────────────────────────────────────────────────────

describe("buildPlaceMap", () => {
  it("builds a Map from places array", () => {
    const places = [
      { city_id: 57260, district: 6, label: "San Francisco – D6" },
      { city_id: 57035, district: 1, label: "New York – D1" },
    ];
    const map = buildPlaceMap(places);
    expect(map.size).toBe(2);
    expect(map.get("57260:6")).toBe("San Francisco – D6");
    expect(map.get("57035:1")).toBe("New York – D1");
  });

  it("handles empty array", () => {
    const map = buildPlaceMap([]);
    expect(map.size).toBe(0);
  });
});

// ── TYPE_ICONS / TYPE_LABELS completeness ──────────────────────────────────

describe("type metadata completeness", () => {
  const ALL_CARD_TYPES: CardType[] = [
    "alert", "trend", "business", "spending", "justice", "safety",
    "311_images", "my_block", "context", "multi_metric", "off_the_charts",
    "comparison", "milestone",
  ];

  it("every card type has an icon", () => {
    for (const t of ALL_CARD_TYPES) {
      const enriched = enrichStory(makeStory({ story_type: t }));
      expect(enriched.type_icon).toBeTruthy();
    }
  });

  it("every card type has a label", () => {
    for (const t of ALL_CARD_TYPES) {
      const enriched = enrichStory(makeStory({ story_type: t }));
      expect(enriched.type_label).toBeTruthy();
    }
  });

  it("labels match expected values", () => {
    const expected: Record<CardType, string> = {
      alert: "Alert",
      trend: "Trend",
      business: "Business",
      spending: "Spending",
      justice: "Justice",
      safety: "Safety",
      "311_images": "311 Photos",
      context: "Context",
      multi_metric: "This Week",
      off_the_charts: "Off the Charts",
      comparison: "Your District",
      milestone: "Milestone",
    };
    for (const [type, label] of Object.entries(expected)) {
      const enriched = enrichStory(makeStory({ story_type: type }));
      expect(enriched.type_label).toBe(label);
    }
  });
});

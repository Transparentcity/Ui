import { describe, it, expect } from "vitest";
import { resolveCanonicalUrl } from "./canonicalUrl";
import type { EnrichedFeedStory } from "./mockFeedData";

/** Minimal enriched story factory for testing. */
function makeStory(overrides: Partial<EnrichedFeedStory> = {}): EnrichedFeedStory {
  return {
    id: 1,
    story_type: "research",
    city_id: 1,
    city_name: "San Francisco",
    city_emoji: "🌉",
    district: 0,
    research_report_id: 1,
    headline: "Test headline",
    description: "Test description",
    detail_url: "/r/abc123",
    view_count: 0,
    click_count: 0,
    share_count: 0,
    applaud_count: 0,
    escalate_count: 0,
    investigate_count: 0,
    priority_score: 50,
    is_featured: false,
    status: "active",
    story_date: "2025-01-01",
    metadata: {},
    card_type: "alert",
    template: "text_only",
    type_icon: "🔴",
    type_label: "Alert",
    actor: "City Hall",
    neighborhood_label: "San Francisco · City-wide",
    subline: "",
    image_url_resolved: null,
    embed_url_resolved: null,
    cleaned_description: "Test description",
    canonical_url: "",
    ...overrides,
  } as EnrichedFeedStory;
}

describe("resolveCanonicalUrl", () => {
  // ── Multi-metric → city/district page ──────────────────────────────────

  it("routes multi_metric citywide to city dashboard", () => {
    const story = makeStory({ card_type: "multi_metric", district: 0 });
    expect(resolveCanonicalUrl(story)).toBe("/c/san-francisco");
  });

  it("routes multi_metric with district to district page", () => {
    const story = makeStory({ card_type: "multi_metric", district: 5 });
    expect(resolveCanonicalUrl(story)).toBe("/c/san-francisco/district/5");
  });

  it("routes comparison to city dashboard", () => {
    const story = makeStory({ card_type: "comparison", district: 0 });
    expect(resolveCanonicalUrl(story)).toBe("/c/san-francisco");
  });

  it("falls back to /feed/{id} for multi_metric without city_name", () => {
    const story = makeStory({ card_type: "multi_metric", city_name: null });
    expect(resolveCanonicalUrl(story)).toBe("/feed/1");
  });

  // ── Single metric → metric detail page ─────────────────────────────────

  it("routes alert with metric_key to metric detail", () => {
    const story = makeStory({
      card_type: "alert",
      metadata: { metric_key: "crime-incidents" },
    });
    expect(resolveCanonicalUrl(story)).toBe("/c/san-francisco/metrics/crime-incidents");
  });

  it("routes trend with metric_key to metric detail", () => {
    const story = makeStory({
      card_type: "trend",
      metadata: { metric_key: "pothole-reports" },
    });
    expect(resolveCanonicalUrl(story)).toBe("/c/san-francisco/metrics/pothole-reports");
  });

  it("routes off_the_charts with metric_key to metric detail", () => {
    const story = makeStory({
      card_type: "off_the_charts",
      metadata: { metric_key: "fire-calls" },
    });
    expect(resolveCanonicalUrl(story)).toBe("/c/san-francisco/metrics/fire-calls");
  });

  it("includes district query param for district-level metric stories", () => {
    const story = makeStory({
      card_type: "alert",
      district: 3,
      metadata: { metric_key: "crime-incidents" },
    });
    expect(resolveCanonicalUrl(story)).toBe(
      "/c/san-francisco/metrics/crime-incidents?district=3"
    );
  });

  it("metric page wins over anomaly even when viz is anomaly type", () => {
    const story = makeStory({
      card_type: "alert",
      visualization_type: "anomaly",
      visualization_ref_id: 99,
      metadata: { metric_key: "crime-incidents" },
    });
    expect(resolveCanonicalUrl(story)).toBe("/c/san-francisco/metrics/crime-incidents");
  });

  // ── Single metric in metrics array ─────────────────────────────────────

  it("routes single-item metrics array to metric detail", () => {
    const story = makeStory({
      card_type: "context",
      metadata: { metrics: [{ metric_key: "homeless-count" }] },
    });
    expect(resolveCanonicalUrl(story)).toBe("/c/san-francisco/metrics/homeless-count");
  });

  it("does not route multi-item metrics array to metric detail", () => {
    const story = makeStory({
      card_type: "context",
      story_type: "context",
      detail_url: "",
      metadata: {
        metrics: [
          { metric_key: "homeless-count" },
          { metric_key: "shelter-beds" },
        ],
      },
    });
    // Falls through to default
    expect(resolveCanonicalUrl(story)).toBe("/feed/1");
  });

  // ── Anomaly → /a/{id} ─────────────────────────────────────────────────

  it("routes anomaly viz without metric_key to anomaly page", () => {
    const story = makeStory({
      card_type: "alert",
      visualization_type: "anomaly",
      visualization_ref_id: 42,
      metadata: {},
    });
    expect(resolveCanonicalUrl(story)).toBe("/a/42");
  });

  // ── Map → /m/{hash} ───────────────────────────────────────────────────

  it("routes map viz to map page by hash", () => {
    const story = makeStory({
      card_type: "context",
      visualization_type: "map",
      primary_visualization: { short_hash: "abc123" },
    });
    expect(resolveCanonicalUrl(story)).toBe("/m/abc123");
  });

  it("routes map viz to map page by id when no hash", () => {
    const story = makeStory({
      card_type: "context",
      visualization_type: "map",
      visualization_ref_id: 77,
      primary_visualization: {},
    });
    expect(resolveCanonicalUrl(story)).toBe("/m/77");
  });

  // ── Research → /r/{hash} ───────────────────────────────────────────────

  it("routes research story with /r/ detail_url to research page", () => {
    const story = makeStory({
      story_type: "research",
      card_type: "context",
      detail_url: "/r/xyz789",
    });
    expect(resolveCanonicalUrl(story)).toBe("/r/xyz789");
  });

  // ── Default fallback → /feed/{id} ─────────────────────────────────────

  it("routes spending to feed story page", () => {
    const story = makeStory({ card_type: "spending", story_type: "spending", detail_url: "" });
    expect(resolveCanonicalUrl(story)).toBe("/feed/1");
  });

  it("routes justice to feed story page", () => {
    const story = makeStory({ card_type: "justice", story_type: "justice", detail_url: "" });
    expect(resolveCanonicalUrl(story)).toBe("/feed/1");
  });

  it("routes 311_images to feed story page", () => {
    const story = makeStory({ card_type: "311_images", story_type: "311_images", detail_url: "" });
    expect(resolveCanonicalUrl(story)).toBe("/feed/1");
  });

  it("routes context without special viz to feed story page", () => {
    const story = makeStory({ card_type: "context", story_type: "context", detail_url: "/some/other" });
    expect(resolveCanonicalUrl(story)).toBe("/feed/1");
  });
});

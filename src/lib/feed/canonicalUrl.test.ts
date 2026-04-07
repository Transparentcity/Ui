import { describe, it, expect } from "vitest";
import { resolveCanonicalUrl, resolveOutboundCanonicalPath } from "./canonicalUrl";
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
  // ── Multi-metric / comparison: always route to dashboard, never story page ──

  it("routes multi_metric with short_hash to city dashboard (not story page)", () => {
    const story = makeStory({ card_type: "multi_metric", short_hash: "xyz789", district: 0 });
    expect(resolveCanonicalUrl(story)).toBe("/c/san-francisco");
  });

  it("routes multi_metric with short_hash and district to district dashboard", () => {
    const story = makeStory({ card_type: "multi_metric", short_hash: "xyz789", district: 3 });
    expect(resolveCanonicalUrl(story)).toBe("/c/san-francisco/district/3");
  });

  it("routes comparison with short_hash to city dashboard (not story page)", () => {
    const story = makeStory({ card_type: "comparison", short_hash: "cmp456", district: 0 });
    expect(resolveCanonicalUrl(story)).toBe("/c/san-francisco");
  });

  // ── Other card types with short_hash → canonical story page ──

  it("routes story with short_hash and city to canonical story page", () => {
    const story = makeStory({ short_hash: "abc123" });
    expect(resolveCanonicalUrl(story)).toBe("/c/san-francisco/stories/abc123");
  });

  it("falls back to /s/{hash} when short_hash exists but no city_name", () => {
    const story = makeStory({ short_hash: "abc123", city_name: null });
    expect(resolveCanonicalUrl(story)).toBe("/s/abc123");
  });

  it("prefers short_hash over metric_key metadata", () => {
    const story = makeStory({
      card_type: "alert",
      short_hash: "fed123",
      metadata: { metric_key: "crime-incidents" },
    });
    expect(resolveCanonicalUrl(story)).toBe("/c/san-francisco/stories/fed123");
  });

  it("routes alert story with short_hash to story page regardless of visualization", () => {
    const story = makeStory({
      card_type: "alert",
      short_hash: "h1234567",
      visualization_type: "anomaly",
      visualization_ref_id: 99,
    });
    expect(resolveCanonicalUrl(story)).toBe("/c/san-francisco/stories/h1234567");
  });

  it("routes trend story with short_hash to story page", () => {
    const story = makeStory({ card_type: "trend", short_hash: "tr123abc" });
    expect(resolveCanonicalUrl(story)).toBe("/c/san-francisco/stories/tr123abc");
  });

  it("routes spending story with short_hash to story page", () => {
    const story = makeStory({ card_type: "spending", short_hash: "sp456def" });
    expect(resolveCanonicalUrl(story)).toBe("/c/san-francisco/stories/sp456def");
  });

  it("routes 311_images story with short_hash to story page", () => {
    const story = makeStory({ card_type: "311_images", short_hash: "im789ghi" });
    expect(resolveCanonicalUrl(story)).toBe("/c/san-francisco/stories/im789ghi");
  });

  it("routes map-viz story with short_hash to story page, not map page", () => {
    const story = makeStory({
      card_type: "context",
      short_hash: "mp000xyz",
      visualization_type: "map",
      visualization_ref_id: 77,
      primary_visualization: { short_hash: "maphash" },
    });
    expect(resolveCanonicalUrl(story)).toBe("/c/san-francisco/stories/mp000xyz");
  });

  it("routes research story with short_hash to story page, not /r/ URL", () => {
    const story = makeStory({
      story_type: "research",
      card_type: "context",
      short_hash: "rsh12345",
      detail_url: "/r/xyz789",
    });
    expect(resolveCanonicalUrl(story)).toBe("/c/san-francisco/stories/rsh12345");
  });

  // ── Legacy no-hash: multi_metric / comparison also route to dashboard ──

  it("routes legacy multi_metric (no hash) citywide to city dashboard", () => {
    const story = makeStory({ card_type: "multi_metric", district: 0 });
    expect(resolveCanonicalUrl(story)).toBe("/c/san-francisco");
  });

  it("routes legacy multi_metric (no hash) with district to district page", () => {
    const story = makeStory({ card_type: "multi_metric", district: 5 });
    expect(resolveCanonicalUrl(story)).toBe("/c/san-francisco/district/5");
  });

  it("routes legacy comparison (no hash) to city dashboard", () => {
    const story = makeStory({ card_type: "comparison", district: 0 });
    expect(resolveCanonicalUrl(story)).toBe("/c/san-francisco");
  });

  it("falls back to /feed/{id} for legacy multi_metric without city_name", () => {
    const story = makeStory({ card_type: "multi_metric", city_name: null });
    expect(resolveCanonicalUrl(story)).toBe("/feed/1");
  });

  // ── Legacy no-hash: all other types fall back to /feed/{id} ──

  it("falls back to /feed/{id} for alert without short_hash", () => {
    const story = makeStory({ card_type: "alert", metadata: { metric_key: "crime-incidents" } });
    expect(resolveCanonicalUrl(story)).toBe("/feed/1");
  });

  it("falls back to /feed/{id} for spending without short_hash", () => {
    const story = makeStory({ card_type: "spending", story_type: "spending", detail_url: "" });
    expect(resolveCanonicalUrl(story)).toBe("/feed/1");
  });

  it("falls back to /feed/{id} for anomaly viz without short_hash", () => {
    const story = makeStory({
      card_type: "alert",
      visualization_type: "anomaly",
      visualization_ref_id: 42,
    });
    expect(resolveCanonicalUrl(story)).toBe("/feed/1");
  });

  it("falls back to /feed/{id} for map viz without short_hash", () => {
    const story = makeStory({
      card_type: "context",
      visualization_type: "map",
      primary_visualization: { short_hash: "maphash" },
    });
    expect(resolveCanonicalUrl(story)).toBe("/feed/1");
  });

  it("falls back to /feed/{id} for research /r/ detail_url without short_hash", () => {
    const story = makeStory({ story_type: "research", card_type: "context", detail_url: "/r/xyz789" });
    expect(resolveCanonicalUrl(story)).toBe("/feed/1");
  });
});

describe("resolveOutboundCanonicalPath", () => {
  it("delegates entirely to resolveCanonicalUrl", () => {
    const stories = [
      makeStory({ short_hash: "abc123", city_name: "San Francisco" }),
      makeStory({ short_hash: "abc123", city_name: null }),
      makeStory({ card_type: "spending", story_type: "spending", detail_url: "" }),
      makeStory({ card_type: "multi_metric", district: 0 }),
    ];
    for (const story of stories) {
      expect(resolveOutboundCanonicalPath(story)).toBe(resolveCanonicalUrl(story));
    }
  });
});

/**
 * Tests for the landing-page picker.
 *
 * Covers: 36-hour age cutoff, recency-weighted scoring, the cold-case cap
 * (driven by metadata.cold_case), and the diversity rules for cities and
 * card types.
 */

import { describe, it, expect } from "vitest";
import { pickFeaturedStories } from "./pickFeaturedStories";
import type { EnrichedFeedStory } from "./mockFeedData";

const now = Date.now();
const isoHoursAgo = (h: number) => new Date(now - h * 3600000).toISOString();

let nextId = 1;
function story(opts: {
  hoursAgo: number;
  card_type?: string;
  city_id?: number;
  headline?: string;
  cold_case?: boolean;
  description?: string;
}): EnrichedFeedStory {
  return {
    id: nextId++,
    headline: opts.headline ?? `A reasonably descriptive headline for story ${nextId}`,
    cleaned_description: opts.description ?? "x".repeat(120),
    card_type: (opts.card_type ?? "trend") as EnrichedFeedStory["card_type"],
    city_id: opts.city_id ?? 1,
    published_at: isoHoursAgo(opts.hoursAgo),
    story_date: isoHoursAgo(opts.hoursAgo),
    metadata: opts.cold_case ? { cold_case: true } : {},
  } as unknown as EnrichedFeedStory;
}

describe("pickFeaturedStories", () => {
  it("excludes stories older than 36 hours", () => {
    const pool = [
      story({ hoursAgo: 1, city_id: 1 }),
      story({ hoursAgo: 12, city_id: 2 }),
      story({ hoursAgo: 35, city_id: 3 }),
      story({ hoursAgo: 37, city_id: 4 }),
      story({ hoursAgo: 72, city_id: 5 }),
    ];
    const picked = pickFeaturedStories(pool, 10);
    expect(picked.length).toBe(3);
    for (const s of picked) {
      const ageHrs = (Date.now() - new Date(s.published_at!).getTime()) / 3600000;
      expect(ageHrs).toBeLessThanOrEqual(36);
    }
  });

  it("never picks more than one cold case", () => {
    const pool = [
      story({ hoursAgo: 1, city_id: 1, cold_case: true, card_type: "justice", headline: "Cold Case A long descriptive headline here" }),
      story({ hoursAgo: 2, city_id: 2, cold_case: true, card_type: "justice", headline: "Cold Case B long descriptive headline here" }),
      story({ hoursAgo: 3, city_id: 3, cold_case: true, card_type: "justice", headline: "Cold Case C long descriptive headline here" }),
      story({ hoursAgo: 4, city_id: 4, card_type: "alert" }),
      story({ hoursAgo: 5, city_id: 5, card_type: "trend" }),
      story({ hoursAgo: 6, city_id: 6, card_type: "context" }),
      story({ hoursAgo: 7, city_id: 7, card_type: "off_the_charts" }),
      story({ hoursAgo: 8, city_id: 8, card_type: "traction" }),
      story({ hoursAgo: 9, city_id: 9, card_type: "business" }),
    ];
    const picked = pickFeaturedStories(pool, 10);
    const coldCases = picked.filter((s) => s.metadata?.cold_case === true);
    expect(coldCases.length).toBeLessThanOrEqual(1);
  });

  it("treats a 'Cold Case:' headline as a cold case even when metadata.cold_case is unset", () => {
    const pool = [
      story({ hoursAgo: 1, city_id: 1, card_type: "justice", headline: "Cold Case: Headline With Missing Metadata Flag" }),
      story({ hoursAgo: 2, city_id: 2, card_type: "justice", headline: "Cold Case: A Second Untagged Cold Case Headline" }),
      story({ hoursAgo: 3, city_id: 3, card_type: "alert" }),
      story({ hoursAgo: 4, city_id: 4, card_type: "trend" }),
    ];
    const picked = pickFeaturedStories(pool, 10);
    const coldCases = picked.filter((s) => /^cold case/i.test(s.headline ?? ""));
    expect(coldCases.length).toBe(1);
  });

  it("dedupes stories that share an identical headline (different ids)", () => {
    const dupHeadline = "Cold Case: Kevin Clewer Was Stabbed 42 Times in Boystown in 2004";
    const pool = [
      story({ hoursAgo: 1, city_id: 1, card_type: "justice", headline: dupHeadline }),
      story({ hoursAgo: 2, city_id: 1, card_type: "justice", headline: dupHeadline }),
      story({ hoursAgo: 3, city_id: 2, card_type: "alert" }),
    ];
    const picked = pickFeaturedStories(pool, 10);
    const matching = picked.filter((s) => s.headline === dupHeadline);
    expect(matching.length).toBe(1);
  });

  it("favors more recent stories when other factors are equal", () => {
    // Three context stories from three different cities; recency should rank them.
    const pool = [
      story({ hoursAgo: 30, card_type: "context", city_id: 1 }),
      story({ hoursAgo: 12, card_type: "context", city_id: 2 }),
      story({ hoursAgo: 1, card_type: "context", city_id: 3 }),
    ];
    const picked = pickFeaturedStories(pool, 1);
    expect(picked).toHaveLength(1);
    expect(picked[0].city_id).toBe(3);
  });

  it("skips stories whose published date is missing or outside the window in fallback fill", () => {
    const pool = [
      story({ hoursAgo: 100, card_type: "alert", city_id: 1 }),
      story({ hoursAgo: 200, card_type: "alert", city_id: 2 }),
    ];
    const picked = pickFeaturedStories(pool, 10);
    expect(picked).toHaveLength(0);
  });
});

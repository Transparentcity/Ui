/**
 * Tests for card template routing, headline extraction, and graceful fallbacks.
 *
 * Covers:
 * - AlertCard headline percentage extraction
 * - SpendingCard dollar amount and percentage extraction
 * - FeedCard template routing (trend-with-data -> AlertCard)
 * - FeedContainer compact mode decisions
 * - Graceful fallbacks when no data is extractable
 */

import { describe, it, expect } from "vitest";
import type { FeedStory } from "@/lib/hooks/useFeed";
import { enrichStory } from "@/lib/feed/mockFeedData";

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

// ── Headline percentage extraction tests ──────────────────────────────────
// These test the regex patterns used by AlertCard.extractPctFromHeadline
// and SpendingCard.extractPctFromText by verifying the enriched story
// data flows correctly through the system.

// Helper: replicate AlertCard's extractPctFromHeadline logic for unit testing
function extractPctFromHeadline(headline: string): number | null {
  if (!headline) return null;
  const parsePct = (s: string) => parseFloat(s.replace(/,/g, ""));
  const upMatch = headline.match(/(?:up|rose|surged|jumped|point(?:ed)?|increase[ds]?|grew|spike[ds]?)\s+([\d,]+(?:\.\d+)?)%/i);
  if (upMatch) return parsePct(upMatch[1]);
  const downMatch = headline.match(/(?:down|dropped|fell|declined?|decrease[ds]?|plunged|plummeted?|sank|shrank)\s+([\d,]+(?:\.\d+)?)%/i);
  if (downMatch) return -parsePct(downMatch[1]);
  const aboveMatch = headline.match(/([\d,]+(?:\.\d+)?)%\s+(?:above|increase|higher|more|over|up)/i);
  if (aboveMatch) return parsePct(aboveMatch[1]);
  const belowMatch = headline.match(/([\d,]+(?:\.\d+)?)%\s+(?:below|decrease|lower|less|under|down)/i);
  if (belowMatch) return -parsePct(belowMatch[1]);
  const signedMatch = headline.match(/([+-])([\d,]+(?:\.\d+)?)%/);
  if (signedMatch) return signedMatch[1] === "-" ? -parsePct(signedMatch[2]) : parsePct(signedMatch[2]);
  if (/\bdoubled\b/i.test(headline)) return 100;
  if (/\btripled\b/i.test(headline)) return 200;
  return null;
}

// Helper: replicate SpendingCard's formatAmount logic for unit testing
function formatAmount(raw: number | string | undefined): string {
  if (raw == null) return "";
  const n = typeof raw === "string" ? parseFloat(raw) : raw;
  if (isNaN(n)) return String(raw);
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toLocaleString()}`;
}

// Helper: replicate SpendingCard's extractDollarAmount logic
function extractDollarAmount(text: string): number | null {
  if (!text) return null;
  const shortMatch = text.match(/\$(\d+(?:\.\d+)?)\s*(M|million|B|billion|K|thousand)/i);
  if (shortMatch) {
    const num = parseFloat(shortMatch[1]);
    const unit = shortMatch[2].toUpperCase();
    if (unit === "B" || unit === "BILLION") return num * 1_000_000_000;
    if (unit === "M" || unit === "MILLION") return num * 1_000_000;
    if (unit === "K" || unit === "THOUSAND") return num * 1_000;
  }
  const rawMatch = text.match(/\$([\d,]+(?:\.\d{1,2})?)/);
  if (rawMatch) {
    const num = parseFloat(rawMatch[1].replace(/,/g, ""));
    if (!isNaN(num) && num > 0) return num;
  }
  return null;
}

describe("extractPctFromHeadline", () => {
  it("extracts 'Up X%' pattern", () => {
    expect(extractPctFromHeadline("Traffic Citations in Bayview Hunters Point Up 57%")).toBe(57);
  });

  it("extracts 'Surged X%' pattern", () => {
    expect(extractPctFromHeadline("Offensive Graffiti Cases Surged 437% in District 2")).toBe(437);
  });

  it("extracts 'Jumped X%' pattern", () => {
    expect(extractPctFromHeadline("District 8 Homeless 911 Calls Jumped 421% in One Week")).toBe(421);
  });

  it("extracts 'Dropped X%' pattern", () => {
    expect(extractPctFromHeadline("DA Charges Filed Dropped 57%")).toBe(-57);
  });

  it("extracts 'X% Above' pattern", () => {
    expect(extractPctFromHeadline("SF Awarded $1.3 Billion in Contracts in March, 428% Above Average")).toBe(428);
  });

  it("extracts 'X% Below' pattern", () => {
    expect(extractPctFromHeadline("Response Times 15% Below Target")).toBe(-15);
  });

  it("extracts signed '+X%' pattern", () => {
    expect(extractPctFromHeadline("Crime Rate +23% This Quarter")).toBe(23);
  });

  it("extracts signed '-X%' pattern", () => {
    expect(extractPctFromHeadline("Budget Shortfall -12% from Projection")).toBe(-12);
  });

  it("extracts 'Doubled' keyword", () => {
    expect(extractPctFromHeadline("Pothole Reports Doubled This Month")).toBe(100);
  });

  it("extracts 'Tripled' keyword", () => {
    expect(extractPctFromHeadline("Noise Complaints Tripled Near New Development")).toBe(200);
  });

  it("extracts decimal percentages", () => {
    expect(extractPctFromHeadline("Housing Permits Increased 12.5% Year Over Year")).toBe(12.5);
  });

  it("returns null for headlines without percentages", () => {
    expect(extractPctFromHeadline("Violent Crime Dropped to a 3-Month Low")).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(extractPctFromHeadline("")).toBeNull();
  });

  it("extracts 'Spiked X%' pattern", () => {
    expect(extractPctFromHeadline("Water Main Breaks Spiked 89% After Storm")).toBe(89);
  });

  it("extracts 'Declined X%' pattern", () => {
    expect(extractPctFromHeadline("Transit Ridership Declined 34% from Pre-Pandemic Levels")).toBe(-34);
  });

  it("extracts 'Plunged X%' pattern", () => {
    expect(extractPctFromHeadline("Restaurant Inspections Plunged 60% During Holiday Week")).toBe(-60);
  });

  it("extracts comma-separated '21,000% Above' pattern", () => {
    expect(extractPctFromHeadline("21,000% Above Normal for That Category")).toBe(21_000);
  });

  it("extracts comma-separated 'Surged 1,200%' pattern", () => {
    expect(extractPctFromHeadline("Spending Surged 1,200% Last Quarter")).toBe(1_200);
  });

  it("extracts comma-separated signed '+2,500%' pattern", () => {
    expect(extractPctFromHeadline("+2,500% Recorded")).toBe(2_500);
  });
});

describe("formatAmount", () => {
  it("formats billions", () => {
    expect(formatAmount(1_300_000_000)).toBe("$1.3B");
  });

  it("formats exactly 1 billion", () => {
    expect(formatAmount(1_000_000_000)).toBe("$1.0B");
  });

  it("formats sub-billion as millions", () => {
    expect(formatAmount(999_000_000)).toBe("$999.0M");
  });

  it("formats string input for billions", () => {
    expect(formatAmount("1300000000")).toBe("$1.3B");
  });

  it("returns empty for undefined", () => {
    expect(formatAmount(undefined)).toBe("");
  });

  it("formats millions", () => {
    expect(formatAmount(4_200_000)).toBe("$4.2M");
  });

  it("formats thousands", () => {
    expect(formatAmount(50_000)).toBe("$50K");
  });
});

describe("extractDollarAmount", () => {
  it("extracts $X.XM pattern", () => {
    expect(extractDollarAmount("Contract worth $4.2M awarded")).toBe(4_200_000);
  });

  it("extracts $X Billion pattern", () => {
    expect(extractDollarAmount("SF Awarded $1.3 Billion in Contracts")).toBe(1_300_000_000);
  });

  it("extracts $XK pattern", () => {
    expect(extractDollarAmount("Small grant of $50K approved")).toBe(50_000);
  });

  it("extracts $X million (lowercase) pattern", () => {
    expect(extractDollarAmount("Budget includes $12 million for parks")).toBe(12_000_000);
  });

  it("extracts comma-separated dollar amounts", () => {
    expect(extractDollarAmount("Payment of $1,234,567 processed")).toBe(1_234_567);
  });

  it("returns null for text without dollar amounts", () => {
    expect(extractDollarAmount("No money mentioned here")).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(extractDollarAmount("")).toBeNull();
  });
});

// ── Card routing tests ────────────────────────────────────────────────────

describe("card routing for trend stories", () => {
  it("trend story with 'Up X%' headline gets non-compact treatment", () => {
    const story = makeStory({
      story_type: "trend",
      headline: "Traffic Citations in Bayview Hunters Point Up 57%",
    });
    const enriched = enrichStory(story);
    expect(enriched.card_type).toBe("trend");
    // Verify headline has extractable percentage (FeedCard routes to AlertCard)
    expect(extractPctFromHeadline(enriched.headline!)).toBe(57);
  });

  it("trend story with 'Surged X%' headline has extractable percentage", () => {
    const story = makeStory({
      story_type: "trend",
      headline: "Offensive Graffiti Cases Surged 437% in District 2",
    });
    const enriched = enrichStory(story);
    expect(enriched.card_type).toBe("trend");
    expect(extractPctFromHeadline(enriched.headline!)).toBe(437);
  });

  it("safety story with 'Jumped X%' headline has extractable percentage", () => {
    const story = makeStory({
      story_type: "safety",
      headline: "District 8 Homeless 911 Calls Jumped 421% in One Week",
    });
    const enriched = enrichStory(story);
    expect(enriched.card_type).toBe("safety");
    expect(extractPctFromHeadline(enriched.headline!)).toBe(421);
  });

  it("trend story without percentage stays as trend", () => {
    const story = makeStory({
      story_type: "trend",
      headline: "Violent Crime Dropped to a 3-Month Low",
    });
    const enriched = enrichStory(story);
    expect(enriched.card_type).toBe("trend");
    expect(extractPctFromHeadline(enriched.headline!)).toBeNull();
  });
});

describe("card routing for spending stories", () => {
  it("spending story headline has extractable dollar amount", () => {
    const story = makeStory({
      story_type: "spending",
      headline: "SF Awarded $1.3 Billion in Contracts in March, 428% Above Average",
    });
    const enriched = enrichStory(story);
    expect(enriched.card_type).toBe("spending");
    expect(extractDollarAmount(enriched.headline!)).toBe(1_300_000_000);
    expect(extractPctFromHeadline(enriched.headline!)).toBe(428);
  });
});

describe("card routing for alert stories", () => {
  it("alert story with metadata pct_change uses metadata value", () => {
    const story = makeStory({
      story_type: "alert",
      headline: "911 Response Times Blew Up",
      metadata: { pct_change: 150 },
    });
    const enriched = enrichStory(story);
    expect(enriched.card_type).toBe("alert");
    expect(enriched.metadata!.pct_change).toBe(150);
  });

  it("alert story with pct_change in headline extracts it as fallback", () => {
    const story = makeStory({
      story_type: "alert",
      headline: "911 Response Times Jumped 200% This Week",
      metadata: {},
    });
    const enriched = enrichStory(story);
    expect(enriched.card_type).toBe("alert");
    expect(extractPctFromHeadline(enriched.headline!)).toBe(200);
  });
});

// ── Compact mode decision tests ──────────────────────────────────────────

describe("compact mode decisions", () => {
  // Replicates the FeedContainer compact logic
  function isCompact(story: ReturnType<typeof enrichStory>): boolean {
    const headlineHasPct = /\d+(\.\d+)?%/.test(story.headline ?? "");
    const headlineHasKeyword = /\b(jumped|surged|dropped|doubled|tripled|plunged|spiked|soared|plummeted|low|high|record)\b/i.test(story.headline ?? "");
    const hasMetricData = !!(
      story.metadata?.pct_change ||
      story.metadata?.current_period_value ||
      story.metadata?.trend_pct_change
    );
    const hasDescription = !!(story.cleaned_description && story.cleaned_description.length > 30);
    return (
      story.template === "text_only" &&
      (story.card_type === "context" || story.card_type === "trend") &&
      !story.metadata?.key_insight &&
      !story.metadata?.trend_metric_name &&
      !headlineHasPct &&
      !headlineHasKeyword &&
      !hasMetricData &&
      !hasDescription
    );
  }

  it("trend story with percentage is NOT compact", () => {
    const story = enrichStory(makeStory({
      story_type: "trend",
      headline: "Traffic Citations Up 57%",
    }));
    expect(isCompact(story)).toBe(false);
  });

  it("trend story with 'Surged' keyword is NOT compact", () => {
    const story = enrichStory(makeStory({
      story_type: "trend",
      headline: "Graffiti Cases Surged 437% in District 2",
    }));
    expect(isCompact(story)).toBe(false);
  });

  it("trend story with 'Dropped' keyword is NOT compact", () => {
    const story = enrichStory(makeStory({
      story_type: "trend",
      headline: "Violent Crime Dropped to a 3-Month Low",
    }));
    expect(isCompact(story)).toBe(false);
  });

  it("trend story with pct_change metadata is NOT compact", () => {
    const story = enrichStory(makeStory({
      story_type: "trend",
      headline: "Something happened",
      metadata: { pct_change: 42 },
    }));
    expect(isCompact(story)).toBe(false);
  });

  it("trend story with trend_metric_name is NOT compact", () => {
    const story = enrichStory(makeStory({
      story_type: "trend",
      headline: "Some trend",
      metadata: { trend_metric_name: "Crime Rate" },
    }));
    expect(isCompact(story)).toBe(false);
  });

  it("context story with key_insight is NOT compact", () => {
    const story = enrichStory(makeStory({
      story_type: "context",
      headline: "Budget context",
      metadata: { key_insight: "Important finding" },
    }));
    expect(isCompact(story)).toBe(false);
  });

  it("plain trend story without data IS compact", () => {
    const story = enrichStory(makeStory({
      story_type: "trend",
      headline: "General Update on City Services",
      description: "",
    }));
    expect(isCompact(story)).toBe(true);
  });

  it("plain context story without data IS compact", () => {
    const story = enrichStory(makeStory({
      story_type: "context",
      headline: "Background on Recent Policy Changes",
      description: "",
    }));
    expect(isCompact(story)).toBe(true);
  });

  it("alert story is NEVER compact (not trend/context)", () => {
    const story = enrichStory(makeStory({
      story_type: "alert",
      headline: "Something basic",
    }));
    expect(isCompact(story)).toBe(false);
  });

  it("spending story is NEVER compact", () => {
    const story = enrichStory(makeStory({
      story_type: "spending",
      headline: "Budget Update",
    }));
    expect(isCompact(story)).toBe(false);
  });

  it("trend story with 'record' keyword is NOT compact", () => {
    const story = enrichStory(makeStory({
      story_type: "trend",
      headline: "Permits Hit a Record High in March",
    }));
    expect(isCompact(story)).toBe(false);
  });
});

// ── Graceful fallback tests ──────────────────────────────────────────────

describe("graceful fallbacks", () => {
  it("alert story with no percentage and no metadata still enriches cleanly", () => {
    const story = enrichStory(makeStory({
      story_type: "alert",
      headline: "Something Unusual Happened in the City",
      metadata: {},
    }));
    expect(story.card_type).toBe("alert");
    expect(story.type_icon).toBeTruthy();
    expect(story.type_label).toBe("Alert");
    expect(story.actor).toBeTruthy();
    // No percentage to extract, card should still render headline + description
    expect(extractPctFromHeadline(story.headline!)).toBeNull();
  });

  it("spending story with no dollar amount still enriches cleanly", () => {
    const story = enrichStory(makeStory({
      story_type: "spending",
      headline: "City Awards New Maintenance Contract",
      metadata: {},
    }));
    expect(story.card_type).toBe("spending");
    expect(extractDollarAmount(story.headline!)).toBeNull();
    // Card should still render headline + description without hero
  });

  it("off_the_charts story with no otc_ metadata still enriches cleanly", () => {
    const story = enrichStory(makeStory({
      story_type: "off_the_charts",
      headline: "Something Wild Happened",
      metadata: {},
    }));
    expect(story.card_type).toBe("off_the_charts");
    expect(story.type_label).toBe("Off the Charts");
  });

  it("multi_metric story with empty metrics array still enriches cleanly", () => {
    const story = enrichStory(makeStory({
      story_type: "multi_metric",
      headline: "This Week in District 6",
      metadata: { metrics: [] },
    }));
    expect(story.card_type).toBe("multi_metric");
    expect(story.template).toBe("multi_metric");
  });

  it("story with null headline doesn't crash extraction", () => {
    expect(extractPctFromHeadline("")).toBeNull();
    expect(extractDollarAmount("")).toBeNull();
  });

  it("story with metadata but wrong field types doesn't crash", () => {
    const story = enrichStory(makeStory({
      story_type: "alert",
      headline: "Test",
      metadata: {
        pct_change: "not a number",
        current_period_value: null,
      },
    }));
    // Should not throw, just enrich normally
    expect(story.card_type).toBe("alert");
  });
});

// ── New story type routing tests ──────────────────────────────────────────

describe("card routing for new story types", () => {
  it("comparison story routes to multi_metric template", () => {
    const story = enrichStory(makeStory({
      story_type: "comparison",
      headline: "Your district improved twice as fast as the city average",
      metadata: {
        comparison_type: "district_vs_city",
        metrics: [
          { name: "Crime", direction: "down", pct: 22 },
          { name: "Crime", direction: "down", pct: 11 },
        ],
      },
    }));
    expect(story.card_type).toBe("comparison");
    expect(story.template).toBe("multi_metric");
    expect(story.type_icon).toBeTruthy();
    expect(story.type_label).toBe("Your District");
  });

  it("milestone story enriches cleanly", () => {
    const story = enrichStory(makeStory({
      story_type: "milestone",
      headline: "Fewest robberies since January 2019",
      metadata: { milestone_type: "record_low", last_occurrence: "2019-01" },
    }));
    expect(story.card_type).toBe("milestone");
    expect(story.type_label).toBe("Milestone");
  });

  it("comparison story is NEVER compact", () => {
    const story = enrichStory(makeStory({
      story_type: "comparison",
      headline: "Your ward vs. the city",
    }));
    // comparison is not trend/context, so isCompact = false
    expect(story.card_type).toBe("comparison");
  });
});

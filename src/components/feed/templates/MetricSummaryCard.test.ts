/**
 * Tests for MetricSummaryCard utility functions:
 * - formatPeriodRange: human-readable date range labels
 * - buildSourceText: source/context line for metric cards
 */
import { describe, it, expect } from "vitest";
import { formatPeriodRange, buildSourceText } from "./MetricSummaryCard";
import type { PublicCityMetricItem, PublicMetricComparison } from "@/lib/publicApiClient";

// ── formatPeriodRange ─────────────────────────────────────────────────────

describe("formatPeriodRange", () => {
  it("returns null when start is null", () => {
    expect(formatPeriodRange(null, null)).toBeNull();
  });

  it("returns null when start is undefined", () => {
    expect(formatPeriodRange(undefined, undefined)).toBeNull();
  });

  it("returns null when start is invalid date string", () => {
    expect(formatPeriodRange("not-a-date", null)).toBeNull();
  });

  it("returns single month when end is null", () => {
    const result = formatPeriodRange("2026-03-15T00:00:00Z", null);
    expect(result).toBe("Mar 2026 data");
  });

  it("returns single month when end is invalid", () => {
    const result = formatPeriodRange("2026-03-15T00:00:00Z", "bad-date");
    expect(result).toBe("Mar 2026 data");
  });

  it("returns single month when start and end are same month", () => {
    const result = formatPeriodRange("2026-03-05T00:00:00Z", "2026-03-25T00:00:00Z");
    expect(result).toBe("Mar 2026 data");
  });

  it("returns range within same year", () => {
    const result = formatPeriodRange("2026-01-15T00:00:00Z", "2026-03-15T00:00:00Z");
    expect(result).toBe("Jan\u2013Mar 2026 data");
  });

  it("returns range spanning different years", () => {
    const result = formatPeriodRange("2025-11-15T00:00:00Z", "2026-02-15T00:00:00Z");
    expect(result).toBe("Nov 2025\u2013Feb 2026 data");
  });

  // Regression: date-only strings like "2026-01-01" are parsed as UTC midnight.
  // In western timezones, local Date methods would show Dec 2025 instead of Jan 2026.
  it("handles date-only strings correctly (no timezone shift)", () => {
    const result = formatPeriodRange("2026-01-01", "2026-03-31");
    expect(result).toBe("Jan\u2013Mar 2026 data");
  });

  it("handles date-only string for start only", () => {
    const result = formatPeriodRange("2026-01-01", null);
    expect(result).toBe("Jan 2026 data");
  });
});

// ── buildSourceText ───────────────────────────────────────────────────────

function makeMetric(overrides: Partial<PublicCityMetricItem> = {}): PublicCityMetricItem {
  return {
    id: 1,
    name: "Crime Incidents",
    category: "Safety",
    subcategory: null,
    city_id: 1,
    green_direction: "down",
    unit: null,
    dataset_domain: null,
    ...overrides,
  } as PublicCityMetricItem;
}

function makeComparison(overrides: Partial<PublicMetricComparison> = {}): PublicMetricComparison {
  return {
    metric_id: 1,
    current_period_value: 100,
    comparison_period_value: 90,
    current_period_start: null,
    current_period_end: null,
    comparison_period_start: null,
    comparison_period_end: null,
    ...overrides,
  } as PublicMetricComparison;
}

describe("buildSourceText", () => {
  it("returns portal domain when provided", () => {
    const result = buildSourceText(
      makeMetric(),
      makeComparison(),
      "data.sfgov.org"
    );
    expect(result).toBe("Source: data.sfgov.org");
  });

  it("portal domain takes priority over period dates", () => {
    const result = buildSourceText(
      makeMetric(),
      makeComparison({
        current_period_start: "2026-01-15T00:00:00Z",
        current_period_end: "2026-03-15T00:00:00Z",
      }),
      "data.sfgov.org"
    );
    expect(result).toBe("Source: data.sfgov.org");
  });

  it("falls back to period range when no portal domain", () => {
    const result = buildSourceText(
      makeMetric(),
      makeComparison({
        current_period_start: "2026-01-15T00:00:00Z",
        current_period_end: "2026-03-15T00:00:00Z",
      })
    );
    expect(result).toBe("Jan\u2013Mar 2026 data");
  });

  it("returns null when no portal domain and no period dates", () => {
    const result = buildSourceText(
      makeMetric({ category: "Safety" }),
      makeComparison()
    );
    expect(result).toBeNull();
  });

  it("returns null when portal domain is undefined and dates are null", () => {
    const result = buildSourceText(
      makeMetric(),
      makeComparison({ current_period_start: null, current_period_end: null }),
      undefined
    );
    expect(result).toBeNull();
  });
});

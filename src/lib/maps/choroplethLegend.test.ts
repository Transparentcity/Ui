import { describe, expect, it } from "vitest";
import {
  buildChoroplethScaleLegend,
  formatScaleDateRange,
} from "./choroplethLegend";

const LOW_RGB: [number, number, number] = [246, 237, 255];
const HIGH_RGB: [number, number, number] = [173, 53, 250];
const NO_DATA_FILL = "#e5e7eb";

const BASE_CONFIG = {
  lowRgb: LOW_RGB,
  highRgb: HIGH_RGB,
  noDataFill: NO_DATA_FILL,
  hasNoData: false,
  mapConfig: { item_noun: "arrests" },
  startDate: "2025-09-28",
  endDate: "2026-09-27",
};

// ── formatScaleDateRange ──────────────────────────────────────────────────────

describe("formatScaleDateRange", () => {
  it("omits start year when same as end year", () => {
    expect(formatScaleDateRange("2026-01-01", "2026-09-27")).toBe(
      "Jan 1 – Sep 27, 2026",
    );
  });

  it("includes year on both dates for cross-year ranges", () => {
    expect(formatScaleDateRange("2025-09-28", "2026-09-27")).toBe(
      "Sep 28, 2025 – Sep 27, 2026",
    );
  });

  it("returns null when both dates are absent", () => {
    expect(formatScaleDateRange(null, null)).toBeNull();
    expect(formatScaleDateRange(undefined, undefined)).toBeNull();
    expect(formatScaleDateRange()).toBeNull();
  });

  it("handles start-only", () => {
    expect(formatScaleDateRange("2026-01-01", null)).toBe("From Jan 1, 2026");
  });

  it("handles end-only", () => {
    expect(formatScaleDateRange(null, "2026-09-27")).toBe("Through Sep 27, 2026");
  });
});

// ── buildChoroplethScaleLegend ────────────────────────────────────────────────

describe("buildChoroplethScaleLegend", () => {
  it("labels min and max with the item noun", () => {
    const leg = buildChoroplethScaleLegend({
      ...BASE_CONFIG,
      minValue: 1,
      maxValue: 415,
    });
    expect(leg.minLabel).toBe("1 arrests");
    expect(leg.maxLabel).toBe("415 arrests");
  });

  it("formats percentage metrics without the noun", () => {
    const leg = buildChoroplethScaleLegend({
      ...BASE_CONFIG,
      minValue: 10,
      maxValue: 85.5,
      mapConfig: { aggregation_type: "RATIO", item_noun: "% Closed" },
    });
    expect(leg.minLabel).toBe("10.0%");
    expect(leg.maxLabel).toBe("85.5%");
  });

  it("sets isSingleValue when min equals max", () => {
    const leg = buildChoroplethScaleLegend({
      ...BASE_CONFIG,
      minValue: 5,
      maxValue: 5,
    });
    expect(leg.isSingleValue).toBe(true);
  });

  it("is not isSingleValue when min differs from max", () => {
    const leg = buildChoroplethScaleLegend({
      ...BASE_CONFIG,
      minValue: 1,
      maxValue: 415,
    });
    expect(leg.isSingleValue).toBe(false);
  });

  it("reflects hasNoData and noDataColor from config", () => {
    const leg = buildChoroplethScaleLegend({
      ...BASE_CONFIG,
      minValue: 0,
      maxValue: 10,
      hasNoData: true,
    });
    expect(leg.hasNoData).toBe(true);
    expect(leg.noDataColor).toBe(NO_DATA_FILL);
  });

  it("builds correct CSS color strings from RGB triples", () => {
    const leg = buildChoroplethScaleLegend({
      ...BASE_CONFIG,
      minValue: 0,
      maxValue: 10,
    });
    expect(leg.lowColor).toBe("rgb(246,237,255)");
    expect(leg.highColor).toBe("rgb(173,53,250)");
  });

  it("includes a cross-year date range", () => {
    const leg = buildChoroplethScaleLegend({
      ...BASE_CONFIG,
      minValue: 0,
      maxValue: 10,
    });
    expect(leg.dateRange).toBe("Sep 28, 2025 – Sep 27, 2026");
  });

  it("sets dateRange to null when both dates are absent", () => {
    const leg = buildChoroplethScaleLegend({
      ...BASE_CONFIG,
      minValue: 0,
      maxValue: 10,
      startDate: null,
      endDate: null,
    });
    expect(leg.dateRange).toBeNull();
  });
});

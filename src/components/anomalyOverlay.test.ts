import { describe, expect, it } from "vitest";
import {
  buildAnomalyOverlayTraces,
  dateInInclusiveRange,
  overlayBandBounds,
  toLocalYmd,
  type AnomalyOverlay,
} from "./anomalyOverlay";

const overlay: AnomalyOverlay = {
  periodType: "week",
  recentStart: "2026-07-06",
  recentEnd: "2026-07-12",
  comparisonStart: "2026-04-13",
  comparisonEnd: "2026-06-29",
  comparisonMean: 14.5,
  stddev: 4.3,
  thresholdStddev: 2,
};

describe("toLocalYmd", () => {
  it("keeps ISO date strings intact", () => {
    expect(toLocalYmd("2026-07-06T00:00:00")).toBe("2026-07-06");
  });

  it("formats local dates without UTC shift", () => {
    expect(toLocalYmd(new Date(2026, 6, 6))).toBe("2026-07-06");
  });
});

describe("dateInInclusiveRange", () => {
  it("includes the start and end dates", () => {
    expect(dateInInclusiveRange(new Date(2026, 6, 6), "2026-07-06", "2026-07-12")).toBe(
      true,
    );
    expect(dateInInclusiveRange(new Date(2026, 6, 12), "2026-07-06", "2026-07-12")).toBe(
      true,
    );
  });

  it("excludes dates outside the window", () => {
    expect(dateInInclusiveRange(new Date(2026, 6, 13), "2026-07-06", "2026-07-12")).toBe(
      false,
    );
  });
});

describe("overlayBandBounds", () => {
  it("builds a ±2σ band that does not go below zero", () => {
    expect(overlayBandBounds(overlay)).toEqual({
      lower: 14.5 - 8.6,
      upper: 14.5 + 8.6,
    });
    expect(overlayBandBounds({ ...overlay, comparisonMean: 1, stddev: 10 }).lower).toBe(
      0,
    );
  });
});

describe("buildAnomalyOverlayTraces", () => {
  it("highlights comparison and recent points", () => {
    const x = [
      new Date(2026, 3, 13),
      new Date(2026, 5, 29),
      new Date(2026, 6, 6),
      new Date(2026, 7, 3),
    ];
    const y = [10, 12, 28, 9];
    const traces = buildAnomalyOverlayTraces(x, y, overlay);
    const names = traces.map((t) => t.name).filter(Boolean);
    expect(names).toContain("Normal Range (±2σ)");
    expect(names).toContain("Historical Mean");
    expect(names).toContain("Comparison Window");
    expect(names).toContain("Recent (2026-07-06)");
  });
});

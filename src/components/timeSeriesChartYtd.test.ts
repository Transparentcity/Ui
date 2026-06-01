import { describe, expect, it } from "vitest";
import {
  formatYtdLegendLabel,
  isDenseMultiGroupYtd,
  maxYtdSevenDayAverage,
  niceYAxisMax,
  trailingSevenDayAverage,
} from "./timeSeriesChartYtd";

describe("timeSeriesChartYtd", () => {
  it("detects dense multi-group YTD charts", () => {
    const keys = [
      "Permit Issued|2026",
      "In Review|2026",
      "VOIDED|2026",
      "PAID|2026",
    ];
    expect(isDenseMultiGroupYtd("ytd", keys)).toBe(true);
    expect(isDenseMultiGroupYtd("month", keys)).toBe(false);
    expect(isDenseMultiGroupYtd("ytd", ["2026", "2025"])).toBe(false);
  });

  it("formats compact legend labels", () => {
    expect(formatYtdLegendLabel("Permit Issued", "2026", true)).toBe(
      "Permit Issued · '26",
    );
    expect(formatYtdLegendLabel("Permit Issued", "2026", false)).toBe(
      "Permit Issued 2026",
    );
  });

  it("rounds y-axis max to readable ticks", () => {
    expect(niceYAxisMax(3.2)).toBe(4);
    expect(niceYAxisMax(11)).toBe(20);
  });

  it("computes trailing seven-day averages", () => {
    expect(trailingSevenDayAverage([1, 3, 5])).toEqual([1, 2, 3]);
  });

  it("limits prior-year contribution to y-axis max when toggled off", () => {
    const map = new Map([
      ["High|2026", [{ time_period: "1", numeric_value: 10 }]],
      ["High|2025", [{ time_period: "1", numeric_value: 100 }]],
    ]);
    const currentYear = new Date().getFullYear();
    expect(
      maxYtdSevenDayAverage(map, { currentYear, showPriorYear: false }),
    ).toBe(10);
    expect(
      maxYtdSevenDayAverage(map, { currentYear, showPriorYear: true }),
    ).toBe(100);
  });
});

import { describe, expect, it } from "vitest";
import { formatMetricValue, yearFromDateString } from "./formatters";

describe("formatMetricValue thousands", () => {
  it("shows one decimal when fractional thousands", () => {
    expect(formatMetricValue(13100)).toBe("13.1k");
    expect(formatMetricValue(13050)).toBe("13.1k");
  });

  it("omits decimal when thousands are whole", () => {
    expect(formatMetricValue(13000)).toBe("13k");
    expect(formatMetricValue(1000)).toBe("1k");
  });

  it("does not use k suffix for zero", () => {
    expect(formatMetricValue(0)).toBe("0");
  });

  it("keeps integer rounding for millions and billions", () => {
    expect(formatMetricValue(1_500_000)).toBe("2M");
    expect(formatMetricValue(1_200_000_000)).toBe("1B");
  });
});

describe("yearFromDateString", () => {
  it("reads the year from Jan 1 dates regardless of local timezone", () => {
    // new Date("2026-01-01").getFullYear() returns 2025 in US timezones;
    // this helper must not have that off-by-one.
    expect(yearFromDateString("2026-01-01")).toBe(2026);
    expect(yearFromDateString("2025-01-01")).toBe(2025);
  });

  it("handles mid-year dates and datetime strings", () => {
    expect(yearFromDateString("2026-07-16")).toBe(2026);
    expect(yearFromDateString("2026-01-01T00:00:00Z")).toBe(2026);
    expect(yearFromDateString("2026/01/01")).toBe(2026);
  });

  it("returns null for missing or invalid input", () => {
    expect(yearFromDateString(null)).toBeNull();
    expect(yearFromDateString(undefined)).toBeNull();
    expect(yearFromDateString("")).toBeNull();
    expect(yearFromDateString("not-a-date")).toBeNull();
  });
});

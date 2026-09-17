import { describe, expect, it } from "vitest";
import { getDateFromISOWeek, getISOWeeksInYear, getISOYearAndWeek } from "./isoWeek";

function ymd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

describe("getDateFromISOWeek", () => {
  it("puts 2026-W37 on Monday Sep 7, not Sep 14", () => {
    expect(ymd(getDateFromISOWeek(2026, 37))).toBe("2026-09-07");
  });

  it("starts 2026 week 1 on Monday Dec 29 2025 (Jan 4 is a Sunday)", () => {
    expect(ymd(getDateFromISOWeek(2026, 1))).toBe("2025-12-29");
  });

  it("starts 2024 week 1 on Monday Jan 1 (Jan 4 is a Thursday)", () => {
    expect(ymd(getDateFromISOWeek(2024, 1))).toBe("2024-01-01");
  });
});

describe("ISO week round-trip", () => {
  it("maps a Monday week-start back to itself", () => {
    const mondays = [
      new Date(2026, 8, 7),
      new Date(2026, 7, 31),
      new Date(2025, 11, 29),
      new Date(2024, 0, 1),
    ];
    for (const monday of mondays) {
      const { isoYear, isoWeek } = getISOYearAndWeek(monday);
      expect(ymd(getDateFromISOWeek(isoYear, isoWeek))).toBe(ymd(monday));
    }
  });
});

describe("getISOWeeksInYear", () => {
  it("returns 53 for 2026", () => {
    expect(getISOWeeksInYear(2026)).toBe(53);
  });
});

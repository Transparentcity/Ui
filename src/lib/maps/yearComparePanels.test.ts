import { describe, expect, it } from "vitest";
import {
  extractPointYear,
  isYearCompareMapConfig,
  resolveYearComparePanels,
} from "./yearComparePanels";

describe("extractPointYear", () => {
  it("reads explicit year field", () => {
    expect(extractPointYear({ year: 2026 }, "year")).toBe("2026");
  });

  it("parses incident_date", () => {
    expect(extractPointYear({ incident_date: "2025-03-01T00:00:00" })).toBe("2025");
  });
});

describe("resolveYearComparePanels", () => {
  const points = [
    { lat: 1, lon: 2, year: "2025", incident_category: "Assault" },
    { lat: 1.1, lon: 2.1, year: "2026", incident_category: "Robbery" },
    { lat: 1.2, lon: 2.2, year: "2026", incident_category: "Assault" },
  ];

  it("builds chronological panels when year_compare is set", () => {
    const panels = resolveYearComparePanels(points, {
      year_compare: true,
      year_field: "year",
      year_values: ["2025", "2026"],
    });
    expect(panels).not.toBeNull();
    expect(panels!.map((p) => p.year)).toEqual(["2025", "2026"]);
    expect(panels![0]!.points).toHaveLength(1);
    expect(panels![1]!.points).toHaveLength(2);
  });

  it("returns null for a single year", () => {
    expect(
      resolveYearComparePanels(
        [{ lat: 1, lon: 2, year: "2026" }],
        { year_compare: true, year_field: "year" }
      )
    ).toBeNull();
  });

  it("auto-enables for period_type ytd with two years", () => {
    const panels = resolveYearComparePanels(
      [
        { lat: 1, lon: 2, incident_date: "2025-01-15" },
        { lat: 1, lon: 2, incident_date: "2026-02-01" },
      ],
      { period_type: "ytd" }
    );
    expect(panels?.map((p) => p.year)).toEqual(["2025", "2026"]);
  });
});

describe("isYearCompareMapConfig", () => {
  it("detects year_compare and layout flags", () => {
    expect(isYearCompareMapConfig({ year_compare: true })).toBe(true);
    expect(isYearCompareMapConfig({ layout: "year_panels" })).toBe(true);
    expect(isYearCompareMapConfig({})).toBe(false);
  });
});

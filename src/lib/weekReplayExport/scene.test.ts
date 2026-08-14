/**
 * Export chart-row tests: metric ranking, overflow aggregation, and color
 * assignment. Mirrors the bar chart in WeekReplayMap, which is the point — the
 * exported video should not reorder or re-bucket what the viewer just watched.
 */
import { describe, it, expect } from "vitest";

import { buildExportChartRows } from "./scene";

const colors = new Map([
  ["1", "#FF6B5A"],
  ["2", "#10B981"],
  ["3", "#3B82F6"],
  ["4", "#F59E0B"],
]);

/** `count` events of one metric. */
function events(metricId: number, metricName: string, count: number) {
  return Array.from({ length: count }, () => ({ metricId, metricName }));
}

describe("buildExportChartRows", () => {
  it("ranks metrics by how much of the week they account for", () => {
    const rows = buildExportChartRows(
      [
        ...events(1, "🚨 Assaults", 3),
        ...events(2, "🧽 Graffiti", 7),
        ...events(3, "🚌 Muni Delays", 5),
      ],
      colors,
      8,
    );
    expect(rows.map((r) => r.label)).toEqual(["Graffiti", "Muni Delays", "Assaults"]);
    expect(rows.map((r) => r.total)).toEqual([7, 5, 3]);
  });

  it("strips the icon into its own field so it can be drawn separately", () => {
    const rows = buildExportChartRows(events(1, "🚨 Assaults", 1), colors, 8);
    expect(rows[0].label).toBe("Assaults");
    expect(rows[0].icon).toBe("🚨");
  });

  it("leaves the icon null for metrics that have none", () => {
    const rows = buildExportChartRows(events(1, "Park Maintenance", 1), colors, 8);
    expect(rows[0].icon).toBeNull();
    expect(rows[0].label).toBe("Park Maintenance");
  });

  it("breaks count ties alphabetically", () => {
    const rows = buildExportChartRows(
      [
        ...events(1, "Transit Delays", 2),
        ...events(2, "Assaults", 2),
        ...events(3, "Graffiti", 2),
      ],
      colors,
      8,
    );
    expect(rows.map((r) => r.label)).toEqual(["Assaults", "Graffiti", "Transit Delays"]);
  });

  it("folds everything past the row budget into one Other bar", () => {
    // The video can't scroll where the live list does, so the tail aggregates.
    const rows = buildExportChartRows(
      [
        ...events(1, "A", 9),
        ...events(2, "B", 7),
        ...events(3, "C", 4),
        ...events(4, "D", 2),
      ],
      colors,
      2,
    );
    expect(rows.map((r) => r.label)).toEqual(["A", "B", "Other"]);
    expect(rows[2].total).toBe(6);
    expect(rows[2].icon).toBeNull();
  });

  it("adds no Other row when everything fits", () => {
    const rows = buildExportChartRows(
      [...events(1, "A", 2), ...events(2, "B", 1)],
      colors,
      8,
    );
    expect(rows.map((r) => r.label)).toEqual(["A", "B"]);
  });

  it("takes each row's color from the shared palette so bars match events", () => {
    const rows = buildExportChartRows(events(2, "Graffiti", 1), colors, 8);
    expect(rows[0].color).toBe("#10B981");
  });

  it("falls back to gray for a metric with no assigned color", () => {
    const rows = buildExportChartRows(events(99, "Unmapped", 1), colors, 8);
    expect(rows[0].color).toBe("#94a3b8");
  });

  it("keys rows by metric id, so events can point at their own row", () => {
    const rows = buildExportChartRows(events(3, "Muni Delays", 1), colors, 8);
    expect(rows[0].key).toBe("3");
  });

  it("returns nothing for an empty week", () => {
    expect(buildExportChartRows([], colors, 8)).toEqual([]);
  });
});

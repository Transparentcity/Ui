import { describe, expect, it } from "vitest";
import {
  completeDateRange,
  metricMapPermalinkKey,
  permalinkRangeForYear,
} from "./metricMapPermalinks";

describe("completeDateRange", () => {
  it("requires both start and end", () => {
    expect(completeDateRange({ start: "2026-01-01", end: null })).toBeNull();
    expect(
      completeDateRange({ start: "2026-01-01", end: "2026-09-15" })
    ).toEqual({ start: "2026-01-01", end: "2026-09-15" });
  });
});

describe("permalinkRangeForYear", () => {
  const current = { start: "2026-01-01", end: "2026-09-15" };
  const prior = { start: "2025-01-01", end: "2025-09-15" };

  it("maps the current year to the current period", () => {
    expect(
      permalinkRangeForYear("2026", 2026, 2025, current, prior)
    ).toEqual(current);
  });

  it("maps the comparison year to the prior period", () => {
    expect(
      permalinkRangeForYear("2025", 2026, 2025, current, prior)
    ).toEqual(prior);
  });

  it("returns null for an unmatched year", () => {
    expect(
      permalinkRangeForYear("2024", 2026, 2025, current, prior)
    ).toBeNull();
  });
});

describe("metricMapPermalinkKey", () => {
  it("namespaces panel ids by view", () => {
    expect(
      metricMapPermalinkKey({ kind: "points", label: "Location pins" }, "2026")
    ).toBe("points:2026");
    expect(
      metricMapPermalinkKey(
        { kind: "choropleth", shapeLayerId: "10", label: "Districts" },
        "prior"
      )
    ).toBe("choro:10:prior");
  });
});

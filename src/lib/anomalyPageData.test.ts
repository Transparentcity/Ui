import { describe, expect, it } from "vitest";
import { pickAnomalyLookup, pickLiveChart } from "./anomalyPageData";

const items = [
  {
    chart_id: 1,
    chart_title: "Weekly citywide",
    period_type: "week",
    district: 0,
    data_point_count: 100,
    created_at: null,
    group_field: null,
  },
  {
    chart_id: 2,
    chart_title: "Daily citywide",
    period_type: "day",
    district: 0,
    data_point_count: 400,
    created_at: null,
    group_field: null,
  },
  {
    chart_id: 3,
    chart_title: "Weekly D6",
    period_type: "week",
    district: 6,
    data_point_count: 80,
    created_at: null,
    group_field: null,
  },
  {
    chart_id: 4,
    chart_title: "Weekly by category",
    period_type: "week",
    district: 0,
    data_point_count: 80,
    created_at: null,
    group_field: "category",
  },
];

describe("pickLiveChart", () => {
  it("prefers matching period, district, and ungrouped series", () => {
    const chart = pickLiveChart(items, {
      periodType: "week",
      district: 0,
    });
    expect(chart?.chart_id).toBe(1);
  });

  it("falls back to daily when the requested grain is missing", () => {
    const chart = pickLiveChart(items, {
      periodType: "month",
      district: 0,
    });
    expect(chart?.chart_id).toBe(2);
  });

  it("matches a numbered district", () => {
    const chart = pickLiveChart(items, {
      periodType: "week",
      district: 6,
    });
    expect(chart?.chart_id).toBe(3);
  });

  it("matches a grouped chart when group_field is set", () => {
    const chart = pickLiveChart(items, {
      periodType: "week",
      district: 0,
      groupField: "category",
    });
    expect(chart?.chart_id).toBe(4);
  });
});

describe("pickAnomalyLookup", () => {
  it("prefers a result row when both tables have the same id", () => {
    const picked = pickAnomalyLookup(
      { id: 47, metric_id: 1 },
      { id: 47, metric_id: 99 },
    );
    expect(picked).toEqual({
      source: "result",
      row: { id: 47, metric_id: 1 },
    });
  });

  it("falls back to slim stats when the result id does not exist", () => {
    const picked = pickAnomalyLookup(null, { id: 3, metric_id: 12 });
    expect(picked).toEqual({
      source: "stats",
      row: { id: 3, metric_id: 12 },
    });
  });

  it("returns null when neither table has the id", () => {
    expect(pickAnomalyLookup(null, null)).toBeNull();
  });
});

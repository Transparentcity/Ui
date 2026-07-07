import { describe, expect, it } from "vitest";

import type { ComparisonResponse } from "@/lib/apiClient";
import {
  rankMetricMovers,
  MOVER_NOISE_FLOOR_PCT,
  type MoverMetricInput,
} from "./rankMetricMovers";

function metric(
  id: number,
  overrides: Partial<MoverMetricInput> = {},
): MoverMetricInput {
  return {
    id,
    metric_name: `Metric ${id}`,
    greendirection: "down",
    ...overrides,
  };
}

function comparison(
  metricId: number,
  prior: number | null,
  curr: number | null,
  overrides: Partial<ComparisonResponse> = {},
): ComparisonResponse {
  return {
    metric_id: metricId,
    district: 0,
    comparison_type: "mtd",
    current_period_value: curr,
    current_period_start: "2026-07-01",
    current_period_end: "2026-07-05",
    comparison_period_value: prior,
    comparison_period_start: "2026-06-01",
    comparison_period_end: "2026-06-05",
    period_type: "day",
    computed_at: "2026-07-05T00:00:00Z",
    is_precomputed: true,
    ...overrides,
  };
}

function mapOf(...entries: Array<[number, ComparisonResponse]>) {
  const out: Record<number, { mtd: ComparisonResponse }> = {};
  for (const [id, comp] of entries) out[id] = { mtd: comp };
  return out;
}

describe("rankMetricMovers", () => {
  it("ranks by absolute percent change descending", () => {
    const metrics = [metric(1), metric(2), metric(3)];
    const comparisonsMap = mapOf(
      [1, comparison(1, 100, 110)], // +10%
      [2, comparison(2, 100, 50)], // -50%
      [3, comparison(3, 100, 125)], // +25%
    );
    const { rows } = rankMetricMovers({ metrics, comparisonsMap });
    expect(rows.map((r) => r.metric.id)).toEqual([2, 3, 1]);
  });

  it("computes prior, new, diff and pct for each row", () => {
    const metrics = [metric(1)];
    const comparisonsMap = mapOf([1, comparison(1, 169, 128)]);
    const { rows } = rankMetricMovers({ metrics, comparisonsMap });
    expect(rows).toHaveLength(1);
    const row = rows[0];
    expect(row.priorValue).toBe(169);
    expect(row.newValue).toBe(128);
    expect(row.diff).toBe(-41);
    expect(row.pctChange).toBeCloseTo(-24.26, 1);
  });

  it("filters out noise below the floor", () => {
    const metrics = [metric(1), metric(2)];
    const comparisonsMap = mapOf(
      [1, comparison(1, 100, 101)], // +1% — noise
      [2, comparison(2, 100, 110)], // +10%
    );
    const { rows, summary } = rankMetricMovers({ metrics, comparisonsMap });
    expect(rows.map((r) => r.metric.id)).toEqual([2]);
    expect(summary.tracked).toBe(2);
    expect(MOVER_NOISE_FLOOR_PCT).toBe(2);
  });

  it("skips metrics with missing or zero-base comparisons", () => {
    const metrics = [metric(1), metric(2), metric(3), metric(4)];
    const comparisonsMap = mapOf(
      [1, comparison(1, null, 100)],
      [2, comparison(2, 0, 100)],
      [3, comparison(3, 100, null)],
      [4, comparison(4, 100, 150)],
    );
    const { rows, summary } = rankMetricMovers({ metrics, comparisonsMap });
    expect(rows.map((r) => r.metric.id)).toEqual([4]);
    expect(summary.tracked).toBe(1);
  });

  it("classifies direction using greendirection", () => {
    // greendirection down (crime-like): increase = rising (bad)
    const down = metric(1, { greendirection: "down" });
    // greendirection up (business-like): increase = improving (good)
    const up = metric(2, { greendirection: "up" });
    const comparisonsMap = mapOf(
      [1, comparison(1, 100, 150)],
      [2, comparison(2, 100, 150)],
    );
    const { rows, summary } = rankMetricMovers({
      metrics: [down, up],
      comparisonsMap,
      limit: 10,
    });
    const byId = new Map(rows.map((r) => [r.metric.id, r]));
    expect(byId.get(1)?.direction).toBe("worsening");
    expect(byId.get(2)?.direction).toBe("improving");
    expect(summary.worsening).toBe(1);
    expect(summary.improving).toBe(1);
  });

  it("filters by direction for rising / improving sorts", () => {
    const metrics = [
      metric(1, { greendirection: "down" }), // +50% → rising
      metric(2, { greendirection: "down" }), // -30% → improving
    ];
    const comparisonsMap = mapOf(
      [1, comparison(1, 100, 150)],
      [2, comparison(2, 100, 70)],
    );
    const rising = rankMetricMovers({ metrics, comparisonsMap, sort: "worsening" });
    expect(rising.rows.map((r) => r.metric.id)).toEqual([1]);
    const improving = rankMetricMovers({
      metrics,
      comparisonsMap,
      sort: "improving",
    });
    expect(improving.rows.map((r) => r.metric.id)).toEqual([2]);
  });

  it("flags rows updated since the recency anchor and ranks them first", () => {
    const metrics = [
      metric(1, { most_recent_data_date: "2026-07-01" }), // before anchor
      metric(2, { most_recent_data_date: "2026-07-05" }), // after anchor
    ];
    const comparisonsMap = mapOf(
      [1, comparison(1, 100, 200, { computed_at: "2026-07-01T00:00:00Z", current_period_end: "2026-07-01" })], // +100%
      [2, comparison(2, 100, 110)], // +10% but NEW
    );
    const { rows } = rankMetricMovers({
      metrics,
      comparisonsMap,
      recencyAnchor: "2026-07-03T00:00:00Z",
    });
    expect(rows[0].metric.id).toBe(2);
    expect(rows[0].isNew).toBe(true);
    expect(rows[1].isNew).toBe(false);
  });

  it("sorts by data freshness for most_recent", () => {
    const metrics = [
      metric(1, { most_recent_data_date: "2026-07-01" }),
      metric(2, { most_recent_data_date: "2026-07-05" }),
    ];
    const comparisonsMap = mapOf(
      [1, comparison(1, 100, 300)], // bigger mover, older data
      [2, comparison(2, 100, 110)],
    );
    const { rows } = rankMetricMovers({
      metrics,
      comparisonsMap,
      sort: "most_recent",
    });
    expect(rows.map((r) => r.metric.id)).toEqual([2, 1]);
  });

  it("applies the limit and reports totalMatching", () => {
    const metrics = Array.from({ length: 8 }, (_, i) => metric(i + 1));
    const entries = metrics.map(
      (m, i) =>
        [m.id, comparison(m.id, 100, 110 + i * 10)] as [
          number,
          ComparisonResponse,
        ],
    );
    const { rows, totalMatching } = rankMetricMovers({
      metrics,
      comparisonsMap: mapOf(...entries),
      limit: 5,
    });
    expect(rows).toHaveLength(5);
    expect(totalMatching).toBe(8);
  });
});

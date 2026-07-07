/**
 * Shared "movers" algorithm for the briefing home.
 *
 * One ranking applies to every dashboard scope — city, district, and saved
 * place — because the batch-comparisons response shape is identical across
 * them. Given metric definitions plus a comparisons map, it produces rows
 * with prior value, new value, absolute difference, and percent change,
 * ranked by movement, along with summary counts for the stat chips.
 */

import type { ComparisonResponse, ComparisonType } from "@/lib/apiClient";
import { normalizeGreenDirection } from "@/lib/metricGreenDirection";

export interface MoverMetricInput {
  id: number;
  metric_name: string;
  metric_key?: string | null;
  category?: string | null;
  greendirection?: string | null;
  display_unit?: string | null;
  most_recent_data_date?: string | null;
}

export interface MoverRow {
  metric: MoverMetricInput;
  comparison: ComparisonResponse;
  priorValue: number;
  newValue: number;
  /** newValue - priorValue */
  diff: number;
  /** Signed percent change ((new - prior) / |prior|) * 100 */
  pctChange: number;
  /**
   * "improving" when the change is in the metric's green direction,
   * "worsening" when it moves the bad way, "flat" when unchanged.
   */
  direction: "worsening" | "improving" | "flat";
  /** True when the metric's data was updated after the recency anchor. */
  isNew: boolean;
}

export interface MoversSummary {
  /** Metrics with usable comparison data in this scope. */
  tracked: number;
  /** Movers heading the bad way (above noise floor). */
  worsening: number;
  /** Movers heading the good way (above noise floor). */
  improving: number;
}

export type MoversSort =
  | "biggest_mover"
  | "most_recent"
  | "worsening"
  | "improving";

export interface RankMetricMoversOptions {
  metrics: MoverMetricInput[];
  /** metric id → comparisons by type (batch response shape for any scope). */
  comparisonsMap: Record<
    number,
    Partial<Record<ComparisonType, ComparisonResponse>> | undefined
  >;
  comparisonType?: ComparisonType;
  sort?: MoversSort;
  /** ISO timestamp: rows with newer data get the NEW badge + tie-break boost. */
  recencyAnchor?: string | null;
  limit?: number;
}

export interface RankMetricMoversResult {
  rows: MoverRow[];
  summary: MoversSummary;
  /** Total rows matching the sort/filter before the limit was applied. */
  totalMatching: number;
}

/** Changes smaller than this (absolute % change) are treated as noise. */
export const MOVER_NOISE_FLOOR_PCT = 2;

function metricDataTimestamp(row: MoverRow): number {
  const candidates = [
    row.metric.most_recent_data_date,
    row.comparison.current_period_end,
    row.comparison.computed_at,
  ];
  for (const c of candidates) {
    if (!c) continue;
    const t = new Date(c).getTime();
    if (Number.isFinite(t)) return t;
  }
  return 0;
}

function buildRow(
  metric: MoverMetricInput,
  comparison: ComparisonResponse,
  anchorTime: number | null,
): MoverRow | null {
  const prior = comparison.comparison_period_value;
  const curr = comparison.current_period_value;
  if (prior == null || curr == null) return null;
  // Percent change is undefined from a zero base; skip rather than fabricate.
  if (prior === 0) return null;

  const diff = curr - prior;
  const pctChange = (diff / Math.abs(prior)) * 100;
  const green = normalizeGreenDirection(metric.greendirection);
  const direction: MoverRow["direction"] =
    diff === 0
      ? "flat"
      : (diff > 0) === (green === "up")
        ? "improving"
        : "worsening";

  const row: MoverRow = {
    metric,
    comparison,
    priorValue: prior,
    newValue: curr,
    diff,
    pctChange,
    direction,
    isNew: false,
  };
  if (anchorTime != null) {
    row.isNew = metricDataTimestamp(row) > anchorTime;
  }
  return row;
}

/**
 * Rank metric movers for a dashboard scope.
 *
 * Ranking: |pct change| descending, with a noise floor of
 * {@link MOVER_NOISE_FLOOR_PCT}. Rows updated since the recency anchor win
 * ties. "most_recent" sorts by data freshness instead; "worsening"/"improving"
 * filter by direction then rank by movement.
 */
export function rankMetricMovers(
  options: RankMetricMoversOptions,
): RankMetricMoversResult {
  const {
    metrics,
    comparisonsMap,
    comparisonType = "mtd",
    sort = "biggest_mover",
    recencyAnchor = null,
    limit = 5,
  } = options;

  const anchorTime = (() => {
    if (!recencyAnchor) return null;
    const t = new Date(recencyAnchor).getTime();
    return Number.isFinite(t) ? t : null;
  })();

  const allRows: MoverRow[] = [];
  for (const metric of metrics) {
    const comparison = comparisonsMap[metric.id]?.[comparisonType];
    if (!comparison) continue;
    const row = buildRow(metric, comparison, anchorTime);
    if (row) allRows.push(row);
  }

  const aboveNoise = (r: MoverRow) =>
    Math.abs(r.pctChange) >= MOVER_NOISE_FLOOR_PCT;

  const summary: MoversSummary = {
    tracked: allRows.length,
    worsening: allRows.filter((r) => r.direction === "worsening" && aboveNoise(r))
      .length,
    improving: allRows.filter(
      (r) => r.direction === "improving" && aboveNoise(r),
    ).length,
  };

  let candidates: MoverRow[];
  switch (sort) {
    case "worsening":
      candidates = allRows.filter(
        (r) => r.direction === "worsening" && aboveNoise(r),
      );
      break;
    case "improving":
      candidates = allRows.filter(
        (r) => r.direction === "improving" && aboveNoise(r),
      );
      break;
    case "most_recent":
      candidates = allRows.filter(aboveNoise);
      break;
    case "biggest_mover":
    default:
      candidates = allRows.filter(aboveNoise);
      break;
  }

  const byMovement = (a: MoverRow, b: MoverRow) => {
    // NEW-since-anchor rows first, then magnitude of change.
    if (a.isNew !== b.isNew) return a.isNew ? -1 : 1;
    const d = Math.abs(b.pctChange) - Math.abs(a.pctChange);
    if (d !== 0) return d;
    return a.metric.metric_name.localeCompare(b.metric.metric_name);
  };
  const byFreshness = (a: MoverRow, b: MoverRow) => {
    const d = metricDataTimestamp(b) - metricDataTimestamp(a);
    if (d !== 0) return d;
    return byMovement(a, b);
  };

  candidates.sort(sort === "most_recent" ? byFreshness : byMovement);

  return {
    rows: candidates.slice(0, Math.max(0, limit)),
    summary,
    totalMatching: candidates.length,
  };
}

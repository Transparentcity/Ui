/**
 * Shared "movers" algorithm for the briefing home.
 *
 * One ranking applies to every dashboard scope — city, district, and saved
 * place — because the batch-comparisons response shape is identical across
 * them. Given metric definitions plus a comparisons map, it produces rows
 * with prior value, new value, absolute difference, and percent change,
 * ranked by blended movement (percent + absolute change), along with
 * summary counts for the stat chips.
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
  /**
   * True when the metric's data was updated after the recency anchor.
   * Display-only (drives the NEW badge); has no effect on ranking.
   */
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
  /** ISO timestamp: rows with newer data get the NEW badge (display only). */
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
 * Blended movement ordering: each candidate is ranked by |percent change|
 * and separately by |absolute change| within the candidate set, and the two
 * ranks are summed (lower total = bigger mover). Rank blending — rather than
 * mixing the raw values — keeps absolute changes usable across metrics with
 * incomparable units (counts vs dollars vs rates). Ties break by |percent
 * change|, then metric name. Returns a new sorted array.
 */
function sortByMovement(rows: MoverRow[]): MoverRow[] {
  const rankBy = (value: (r: MoverRow) => number): Map<MoverRow, number> => {
    const sorted = [...rows].sort((a, b) => value(b) - value(a));
    const ranks = new Map<MoverRow, number>();
    for (let i = 0; i < sorted.length; i++) {
      const prev = i > 0 ? sorted[i - 1] : null;
      // Equal values share a rank so ordering doesn't depend on input order.
      const rank =
        prev && value(prev) === value(sorted[i]) ? ranks.get(prev)! : i;
      ranks.set(sorted[i], rank);
    }
    return ranks;
  };
  const pctRank = rankBy((r) => Math.abs(r.pctChange));
  const diffRank = rankBy((r) => Math.abs(r.diff));
  return [...rows].sort((a, b) => {
    const d =
      pctRank.get(a)! +
      diffRank.get(a)! -
      (pctRank.get(b)! + diffRank.get(b)!);
    if (d !== 0) return d;
    const p = Math.abs(b.pctChange) - Math.abs(a.pctChange);
    if (p !== 0) return p;
    return a.metric.metric_name.localeCompare(b.metric.metric_name);
  });
}

/**
 * Rank metric movers for a dashboard scope.
 *
 * Ranking: blended movement (see {@link sortByMovement}) combining percent
 * change and absolute change, with a noise floor of
 * {@link MOVER_NOISE_FLOOR_PCT}. The recency anchor only sets the NEW badge
 * flag; it does not affect ordering. "most_recent" sorts by data freshness
 * instead; "worsening"/"improving" filter by direction then rank by movement.
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

  if (sort === "most_recent") {
    candidates.sort((a, b) => {
      const d = metricDataTimestamp(b) - metricDataTimestamp(a);
      if (d !== 0) return d;
      const p = Math.abs(b.pctChange) - Math.abs(a.pctChange);
      if (p !== 0) return p;
      return a.metric.metric_name.localeCompare(b.metric.metric_name);
    });
  } else {
    candidates = sortByMovement(candidates);
  }

  return {
    rows: candidates.slice(0, Math.max(0, limit)),
    summary,
    totalMatching: candidates.length,
  };
}

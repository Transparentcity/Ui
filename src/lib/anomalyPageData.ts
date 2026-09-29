import { getApiBaseUrl } from "./apiBase";
import type { TimeSeriesDataPoint } from "@/components/TimeSeriesChart";
import type { AnomalyOverlay } from "@/components/anomalyOverlay";
import type {
  PublicTimeSeriesChartResponse,
  PublicTimeSeriesSummary,
  PublicTimeSeriesSummaryItem,
} from "./publicApiClient";

export type AnomalyPageSource = "stats" | "result";

export interface AnomalyPageModel {
  source: AnomalyPageSource;
  id: number;
  metricId: number;
  cityId?: number | null;
  periodType: "day" | "week" | "month" | "year";
  district: number;
  placeType: string;
  placeKey: string | null;
  groupField?: string | null;
  groupValue?: string | null;
  recentMean: number;
  comparisonMean: number;
  stdDev: number;
  difference: number;
  percentChange: number;
  isAnomaly: boolean;
  runIsActive: boolean;
  metricName: string;
  itemNoun: string | null;
  cityName: string | null;
  endpoint?: string | null;
  comparisonSize: number | null;
  calculationStartDate: string | null;
  calculationEndDate: string | null;
  overlay: AnomalyOverlay;
  liveSeries: TimeSeriesDataPoint[] | null;
  liveMetadata: {
    chart_title?: string | null;
    y_axis_label?: string;
    object_name?: string;
    period_type?: string;
    district?: number | null;
    city_name?: string;
  } | null;
  /** Frozen payload kept only as a last-resort fallback when no live series exists. */
  chartPayload: { dates: string[]; values: number[]; periods: string[] } | null;
}

export interface PublicAnomalyStatsRow {
  id: number;
  metric_id: number;
  city_id: number;
  period_type: string;
  period_date: string;
  place_type: string;
  place_field?: string | null;
  place_key?: string | null;
  recent_mean?: number | null;
  comparison_mean?: number | null;
  stddev?: number | null;
  difference?: number | null;
  pct_change?: number | null;
  threshold_stddev?: number;
  is_anomaly: boolean;
  comparison_size?: number | null;
  recent_start?: string | null;
  recent_end?: string | null;
  comparison_start?: string | null;
  comparison_end?: string | null;
  metric_name?: string | null;
  item_noun?: string | null;
  city_name?: string | null;
  endpoint?: string | null;
}

export interface PublicAnomalyResultRow {
  id?: number | null;
  metric_id: number;
  period_type: string;
  district?: number | null;
  group_field?: string | null;
  group_value?: string | null;
  recent_mean?: number | null;
  comparison_mean?: number | null;
  stddev?: number | null;
  difference?: number | null;
  pct_change?: number | null;
  is_anomaly?: boolean;
  run_is_active?: boolean;
  object_name?: string | null;
  metric_name?: string | null;
  item_noun?: string | null;
  city_name?: string | null;
  endpoint?: string | null;
  comparison_window?: { size?: number; label?: string } | null;
  calculation_start_date?: string | null;
  calculation_end_date?: string | null;
  chart_payload?: {
    dates?: string[];
    values?: number[];
    periods?: string[];
  } | null;
}

function asPeriodType(value: string | undefined | null): AnomalyOverlay["periodType"] {
  if (value === "day" || value === "week" || value === "month" || value === "year") {
    return value;
  }
  return "week";
}

function isoDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const match = String(value).match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : String(value).slice(0, 10);
}

function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  date.setDate(date.getDate() + days);
  const yy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

function periodEndFromStart(start: string, periodType: AnomalyOverlay["periodType"]): string {
  if (periodType === "week") return addDays(start, 6);
  if (periodType === "month") {
    const [y, m] = start.split("-").map(Number);
    const last = new Date(y, m, 0).getDate();
    return `${y}-${String(m).padStart(2, "0")}-${String(last).padStart(2, "0")}`;
  }
  if (periodType === "year") return `${start.slice(0, 4)}-12-31`;
  return start;
}

function districtFromPlace(placeType: string | null | undefined, placeKey: string | null | undefined): number {
  if (!placeType || placeType === "citywide") return 0;
  const parsed = Number.parseInt(placeKey || "", 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function pickLiveChart(
  items: PublicTimeSeriesSummaryItem[],
  opts: {
    periodType: string;
    district: number;
    groupField?: string | null;
  },
): PublicTimeSeriesSummaryItem | undefined {
  const district = opts.district ?? 0;
  const wantGroup = opts.groupField || null;
  const period = opts.periodType.toLowerCase();

  const matches = (item: PublicTimeSeriesSummaryItem, periodType: string) => {
    const itemPeriod = (item.period_type || "").toLowerCase();
    const itemDistrict = item.district ?? 0;
    const itemGroup = item.group_field || null;
    return (
      itemPeriod === periodType &&
      itemDistrict === district &&
      itemGroup === wantGroup
    );
  };

  return (
    items.find((item) => matches(item, period)) ||
    items.find((item) => matches(item, "day")) ||
    items.find(
      (item) =>
        (item.district ?? 0) === district &&
        (item.group_field || null) === wantGroup,
    )
  );
}

function overlayFromStats(row: PublicAnomalyStatsRow): AnomalyOverlay {
  const periodType = asPeriodType(row.period_type);
  const recentStart = isoDate(row.recent_start) || isoDate(row.period_date) || "";
  let recentEnd =
    isoDate(row.recent_end) ||
    (recentStart ? periodEndFromStart(recentStart, periodType) : recentStart);
  // Slim weekly/monthly rows store a single period_date for both start and end.
  if (
    recentStart &&
    recentEnd === recentStart &&
    (periodType === "week" || periodType === "month" || periodType === "year")
  ) {
    recentEnd = periodEndFromStart(recentStart, periodType);
  }
  return {
    periodType,
    recentStart,
    recentEnd,
    comparisonStart: isoDate(row.comparison_start),
    comparisonEnd: isoDate(row.comparison_end),
    comparisonMean: row.comparison_mean ?? 0,
    stddev: row.stddev ?? 0,
    thresholdStddev: row.threshold_stddev ?? 2,
  };
}

function overlayFromResult(row: PublicAnomalyResultRow): AnomalyOverlay {
  const periodType = asPeriodType(row.period_type);
  const recentStart = isoDate(row.calculation_start_date) || "";
  const recentEnd =
    isoDate(row.calculation_end_date) ||
    (recentStart ? periodEndFromStart(recentStart, periodType) : recentStart);
  const comparisonSize = row.comparison_window?.size || 12;
  let comparisonStart: string | null = null;
  let comparisonEnd: string | null = null;
  if (recentStart && periodType === "week") {
    comparisonEnd = addDays(recentStart, -7);
    comparisonStart = addDays(recentStart, -7 * comparisonSize);
  } else if (recentStart && periodType === "month") {
    const [y, m] = recentStart.split("-").map(Number);
    const end = new Date(y, m - 2, 1);
    const start = new Date(y, m - 1 - comparisonSize, 1);
    comparisonEnd = `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, "0")}-01`;
    comparisonStart = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, "0")}-01`;
  }
  return {
    periodType,
    recentStart,
    recentEnd,
    comparisonStart,
    comparisonEnd,
    comparisonMean: row.comparison_mean ?? 0,
    stddev: row.stddev ?? 0,
    thresholdStddev: 2,
  };
}

function modelFromStats(row: PublicAnomalyStatsRow): Omit<
  AnomalyPageModel,
  "liveSeries" | "liveMetadata"
> {
  const overlay = overlayFromStats(row);
  const recentStart = overlay.recentStart;
  return {
    source: "stats",
    id: row.id,
    metricId: row.metric_id,
    cityId: row.city_id,
    periodType: overlay.periodType,
    district: districtFromPlace(row.place_type, row.place_key ?? null),
    placeType: row.place_type || "citywide",
    placeKey: row.place_key ?? null,
    recentMean: row.recent_mean ?? 0,
    comparisonMean: row.comparison_mean ?? 0,
    stdDev: row.stddev ?? 0,
    difference: row.difference ?? 0,
    percentChange: row.pct_change ?? 0,
    isAnomaly: Boolean(row.is_anomaly),
    runIsActive: true,
    metricName: row.metric_name || `Metric ${row.metric_id}`,
    itemNoun: row.item_noun ?? null,
    cityName: row.city_name ?? null,
    endpoint: row.endpoint ?? null,
    comparisonSize: row.comparison_size ?? null,
    calculationStartDate: recentStart,
    calculationEndDate: overlay.recentEnd ?? recentStart,
    overlay,
    chartPayload: null,
  };
}

function modelFromResult(row: PublicAnomalyResultRow): Omit<
  AnomalyPageModel,
  "liveSeries" | "liveMetadata"
> {
  const overlay = overlayFromResult(row);
  const payload = row.chart_payload;
  return {
    source: "result",
    id: row.id ?? 0,
    metricId: row.metric_id,
    periodType: overlay.periodType,
    district: row.district ?? 0,
    placeType: (row.district ?? 0) === 0 ? "citywide" : "district",
    placeKey: (row.district ?? 0) > 0 ? String(row.district) : null,
    groupField: row.group_field ?? null,
    groupValue: row.group_value ?? null,
    recentMean: row.recent_mean ?? 0,
    comparisonMean: row.comparison_mean ?? 0,
    stdDev: row.stddev ?? 0,
    difference: row.difference ?? 0,
    percentChange: row.pct_change ?? 0,
    isAnomaly: Boolean(row.is_anomaly),
    runIsActive: row.run_is_active !== false,
    metricName: row.object_name || row.metric_name || `Metric ${row.metric_id}`,
    itemNoun: row.item_noun ?? null,
    cityName: row.city_name ?? null,
    endpoint: row.endpoint ?? null,
    comparisonSize: row.comparison_window?.size ?? null,
    calculationStartDate: overlay.recentStart || isoDate(row.calculation_start_date),
    calculationEndDate: overlay.recentEnd || isoDate(row.calculation_end_date),
    overlay,
    chartPayload:
      payload?.dates && payload.values && payload.periods
        ? {
            dates: payload.dates,
            values: payload.values,
            periods: payload.periods,
          }
        : null,
  };
}

async function fetchJsonOrNull<T>(path: string): Promise<T | null> {
  try {
    const url = `${getApiBaseUrl()}${path}`;
    const res = await fetch(url, {
      method: "GET",
      credentials: "omit",
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

async function loadLiveSeries(
  metricId: number,
  opts: {
    periodType: string;
    district: number;
    groupField?: string | null;
    groupValue?: string | null;
    cityName?: string | null;
    metricName: string;
    itemNoun?: string | null;
  },
): Promise<Pick<AnomalyPageModel, "liveSeries" | "liveMetadata">> {
  const summary = await fetchJsonOrNull<PublicTimeSeriesSummary>(
    `/api/public/metrics/${metricId}/time-series/summary`,
  );
  if (!summary?.time_series?.length) {
    return { liveSeries: null, liveMetadata: null };
  }
  const chart = pickLiveChart(summary.time_series, opts);
  if (!chart) {
    return { liveSeries: null, liveMetadata: null };
  }
  const series = await fetchJsonOrNull<PublicTimeSeriesChartResponse>(
    `/api/time-series/public/${chart.chart_id}`,
  );
  if (!series?.data?.length) {
    return { liveSeries: null, liveMetadata: null };
  }
  const groupField = opts.groupField;
  const groupValue = opts.groupValue;
  const data = groupField
    ? series.data.filter(
        (point) => !groupValue || point.group_value === groupValue,
      )
    : series.data.map((point) => ({
        time_period: point.time_period,
        numeric_value: point.numeric_value,
        group_value: null,
      }));
  if (!data.length) {
    return { liveSeries: null, liveMetadata: null };
  }
  return {
    liveSeries: data,
    liveMetadata: {
      chart_title: chart.chart_title || opts.metricName,
      y_axis_label: opts.itemNoun || undefined,
      object_name: opts.metricName,
      period_type: (series.metadata?.period_type as string) || chart.period_type || opts.periodType,
      district: chart.district ?? opts.district,
      city_name: opts.cityName || undefined,
    },
  };
}

export type AnomalyLookupHit<TResult, TStats> =
  | { source: "result"; row: TResult }
  | { source: "stats"; row: TStats };

/**
 * /a/{id} is a shared namespace. Feed, newsletter, and show_anomaly links are
 * anomaly_results ids, so those win when both tables have a row. Slim stats
 * only serve the page when that result id does not exist.
 */
export function pickAnomalyLookup<TResult, TStats>(
  result: TResult | null | undefined,
  stats: TStats | null | undefined,
): AnomalyLookupHit<TResult, TStats> | null {
  if (result) return { source: "result", row: result };
  if (stats) return { source: "stats", row: stats };
  return null;
}

/**
 * Resolve /a/{id} against the legacy result table first, then slim stats.
 */
export async function loadAnomalyPageModel(id: string): Promise<AnomalyPageModel> {
  const [result, stats] = await Promise.all([
    fetchJsonOrNull<PublicAnomalyResultRow>(`/api/anomalies/public/result/${id}`),
    fetchJsonOrNull<PublicAnomalyStatsRow>(`/api/anomalies/public/stats/${id}`),
  ]);

  const picked = pickAnomalyLookup(result, stats);
  const base = picked
    ? picked.source === "result"
      ? modelFromResult(picked.row)
      : modelFromStats(picked.row)
    : null;
  if (!base) {
    throw new Error("Anomaly not found");
  }

  const live = await loadLiveSeries(base.metricId, {
    periodType: base.periodType,
    district: base.district,
    groupField: base.groupField,
    groupValue: base.groupValue,
    cityName: base.cityName,
    metricName: base.metricName,
    itemNoun: base.itemNoun,
  });

  return { ...base, ...live };
}

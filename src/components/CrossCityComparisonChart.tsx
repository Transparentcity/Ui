"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
  type ReactNode,
} from "react";
import type { PlotParams } from "react-plotly.js";
import type { Config, Data, Layout, PlotHoverEvent } from "plotly.js";
import { useQueries, useQuery } from "@tanstack/react-query";
import {
  getAdminMetricTimeSeries,
  getAdminMetricTimeSeriesDetail,
  getMyPermissions,
  listAdminMetrics,
  listCities,
  type AdminMetricListItem,
  type AdminMetricTimeSeries,
  type AdminMetricTimeSeriesDetail,
  type AdminTimeSeriesSummary,
  type CityListItem,
} from "@/lib/apiClient";
import { useImpersonationCacheKey } from "@/lib/impersonation";
import { useTheme } from "@/contexts/ThemeContext";
import Loader from "./Loader";
import "./CrossCityComparisonChart.css";

const PLOT_AXIS_FONT_FAMILY =
  "'IBM Plex Sans', Inter, Arial, Helvetica, 'Noto Color Emoji', 'Apple Color Emoji', 'Segoe UI Emoji', sans-serif";

const Plot = dynamic(
  () => import("react-plotly.js"),
  { ssr: false }
) as ComponentType<PlotParams>;

/** Keep Plotly out of hover-tip re-renders so onHover state doesn't immediately unhover. */
const CrossCityPlot = memo(function CrossCityPlot({
  data,
  layout,
  config,
  height,
  onHover,
}: {
  data: Data[];
  layout: Partial<Layout>;
  config: Partial<Config>;
  height: number;
  onHover: (event: Readonly<PlotHoverEvent>) => void;
}) {
  const onHoverRef = useRef(onHover);
  onHoverRef.current = onHover;

  return (
    <Plot
      data={data}
      layout={layout}
      config={config}
      style={{ width: "100%", height }}
      onHover={(event) => onHoverRef.current(event)}
      useResizeHandler
    />
  );
});

type ValueMode = "absolute" | "per_1k";
type RangeMode = "1m" | "3m" | "ytd" | "1y" | "3y";

interface CrossCityHoverRow {
  metricId: number;
  label: string;
  color: string;
  value: number;
  formatted: string;
  smoothingLabel: string | null;
}

interface CrossCityHoverTip {
  dateLabel: string;
  left: number;
  top: number;
  rows: CrossCityHoverRow[];
}

interface ChartSeriesPoint {
  metricId: number;
  label: string;
  color: string;
  smoothingLabel: string | null;
  /** day-key → displayed (possibly smoothed) y value */
  valuesByDay: Map<string, number>;
}
interface CrossCityComparisonChartProps {
  templateId: number;
  token: string;
  height?: number;
  metricName?: string;
  fullPageHref?: string;
}

interface CityLookupItem {
  name: string;
  emoji: string | null;
  population: number | null;
  population_source_name: string | null;
  population_data_year: number | null;
}

interface CitySeries {
  metric: AdminMetricListItem;
  chart: AdminTimeSeriesSummary;
  detail: AdminMetricTimeSeriesDetail;
  city: CityLookupItem;
  color: string;
}

interface ParsedPoint {
  time: string;
  date: Date;
  value: number;
}

const SERIES_COLORS = [
  "#ad35fa",
  "#8dd3c7",
  "#ffffb3",
  "#bebada",
  "#fb8072",
  "#80b1d3",
  "#fdb462",
  "#b3de69",
  "#fccde5",
  "#d9d9d9",
  "#bc80bd",
  "#ccebc5",
];

const RANGE_LABELS: Record<RangeMode, string> = {
  "1m": "1M",
  "3m": "3M",
  ytd: "YTD",
  "1y": "1Y",
  "3y": "3Y",
};

function parsePopulation(value: CityListItem["population"]): number | null {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number(value.replace(/,/g, ""));
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }
  return null;
}

function formatPopulation(value: number | null): string | null {
  if (value == null) return null;
  if (value >= 1_000_000) {
    const millions = value / 1_000_000;
    const label =
      millions >= 10
        ? millions.toFixed(0)
        : millions.toFixed(1).replace(/\.0$/, "");
    return `${label}M`;
  }
  if (value >= 1_000) {
    const thousands = value / 1_000;
    const label =
      thousands >= 100
        ? thousands.toFixed(0)
        : thousands.toFixed(thousands >= 10 ? 0 : 1).replace(/\.0$/, "");
    return `${label}k`;
  }
  return value.toLocaleString();
}

function buildCityLookup(cities: CityListItem[]): Map<number, CityLookupItem> {
  const map = new Map<number, CityLookupItem>();
  for (const city of cities) {
    map.set(city.city_id, {
      name: city.city_name,
      emoji: city.emoji ?? null,
      population: parsePopulation(city.population),
      population_source_name: city.population_source_name ?? null,
      population_data_year: city.population_data_year ?? null,
    });
  }
  return map;
}

function pickBestChart(series: AdminMetricTimeSeries): AdminTimeSeriesSummary | null {
  const citywideBase = series.time_series.filter((item) => {
    const district = item.district ?? 0;
    return district === 0 && !item.group_field;
  });
  const candidates =
    citywideBase.length > 0
      ? citywideBase
      : series.time_series.filter((item) => !item.group_field);

  const priority = ["day", "month", "year"];
  for (const period of priority) {
    const match = candidates.find(
      (item) => item.period_type?.toLowerCase() === period
    );
    if (match) return match;
  }
  return candidates[0] ?? null;
}

function parsePoints(detail: AdminMetricTimeSeriesDetail): ParsedPoint[] {
  return detail.data
    .map((point) => {
      const date = new Date(point.time_period);
      const value = Number(point.numeric_value);
      if (Number.isNaN(date.getTime()) || !Number.isFinite(value)) {
        return null;
      }
      return {
        time: point.time_period,
        date,
        value,
      };
    })
    .filter((point): point is ParsedPoint => point != null)
    .sort((a, b) => a.date.getTime() - b.date.getTime());
}

function getRangeStart(maxDate: Date, range: RangeMode): Date {
  const start = new Date(maxDate);
  if (range === "ytd") {
    return new Date(maxDate.getFullYear(), 0, 1);
  }
  if (range === "1m") start.setMonth(start.getMonth() - 1);
  if (range === "3m") start.setMonth(start.getMonth() - 3);
  if (range === "1y") start.setFullYear(start.getFullYear() - 1);
  if (range === "3y") start.setFullYear(start.getFullYear() - 3);
  return start;
}

/** Trailing average window size and label, aligned with YTD TimeSeriesChart styling. */
function getSmoothingConfig(
  periodType: string | undefined,
  rangeMode: RangeMode
): { window: number; label: string } | null {
  const pt = (periodType ?? "day").toLowerCase();
  if (pt === "day") {
    const days = rangeMode === "1y" || rangeMode === "3y" ? 28 : 7;
    return { window: days, label: `${days}-day avg` };
  }
  if (pt === "week") {
    const weeks = rangeMode === "1y" || rangeMode === "3y" ? 4 : 2;
    return { window: weeks, label: `${weeks}-week avg` };
  }
  if (pt === "month") {
    const months = rangeMode === "3y" ? 6 : 3;
    return { window: months, label: `${months}-month avg` };
  }
  return null;
}

function computeTrailingAverage(
  values: (number | null)[],
  windowSize: number
): (number | null)[] {
  if (windowSize <= 1) return values;
  return values.map((_, idx) => {
    const start = Math.max(0, idx - windowSize + 1);
    const window = values
      .slice(start, idx + 1)
      .filter((v): v is number => v != null && Number.isFinite(v));
    if (window.length === 0) return null;
    return window.reduce((sum, v) => sum + v, 0) / window.length;
  });
}

function buildPopulationFootnote(series: CitySeries[]): string | null {
  const sources = new Set<string>();
  for (const item of series) {
    const source = item.city.population_source_name;
    if (!source) continue;
    const label = item.city.population_data_year
      ? `${source} ${item.city.population_data_year}`
      : source;
    sources.add(label);
  }
  if (sources.size === 0) return null;
  return `Population data: ${Array.from(sources).join("; ")}`;
}

interface CrossCityTableRow {
  metricId: number;
  cityName: string;
  emoji: string | null;
  color: string;
  population: number | null;
  startValue: number | null;
  endValue: number | null;
  average: number | null;
  change: number | null;
  changePct: number | null;
}

function toDisplayValue(
  absolute: number,
  population: number | null,
  valueMode: ValueMode
): number | null {
  if (valueMode === "absolute") return absolute;
  if (!population) return null;
  return absolute / (population / 1000);
}

function formatTableValue(value: number | null, valueMode: ValueMode): string {
  if (value == null || !Number.isFinite(value)) return "—";
  if (valueMode === "per_1k") {
    return value.toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }
  return Math.round(value).toLocaleString();
}

function formatTableChange(value: number | null, valueMode: ValueMode): string {
  if (value == null || !Number.isFinite(value)) return "—";
  const sign = value > 0 ? "+" : "";
  if (valueMode === "per_1k") {
    return `${sign}${value.toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  }
  return `${sign}${Math.round(value).toLocaleString()}`;
}

function formatTablePct(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return "—";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(1)}%`;
}

function formatTableDate(value: string | Date | null): string {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return typeof value === "string" ? value : "";
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function toDayKey(value: string | Date | number): string | null {
  if (typeof value === "string") {
    const match = value.match(/^(\d{4}-\d{2}-\d{2})/);
    if (match) return match[1];
  }
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  // Prefer UTC for ISO timestamps so day keys stay stable across timezones.
  if (typeof value === "string" && value.includes("T")) {
    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, "0");
    const day = String(date.getUTCDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatHoverValue(value: number, valueMode: ValueMode): string {
  if (valueMode === "per_1k") {
    return value.toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }
  return Math.round(value).toLocaleString();
}

export default function CrossCityComparisonChart({
  templateId,
  token,
  height = 360,
  metricName,
  fullPageHref,
}: CrossCityComparisonChartProps) {
  const { theme } = useTheme();
  const [valueMode, setValueMode] = useState<ValueMode>("absolute");
  const [rangeMode, setRangeMode] = useState<RangeMode>("1y");
  /** Admin-only: when true, include cities that are not launched. */
  const [showAllCities, setShowAllCities] = useState(false);
  const [dataTableExpanded, setDataTableExpanded] = useState(false);
  const [hoverTip, setHoverTip] = useState<CrossCityHoverTip | null>(null);
  const plotWrapRef = useRef<HTMLDivElement>(null);
  const chartSeriesPointsRef = useRef<ChartSeriesPoint[]>([]);
  const valueModeRef = useRef(valueMode);

  const isDark = theme === "dark";
  const axisTextColor = isDark ? "#94a3b8" : "#64748b";
  const gridColor = isDark ? "rgba(148, 163, 184, 0.18)" : "rgba(148, 163, 184, 0.25)";
  const identityKey = useImpersonationCacheKey();

  const permissionsQuery = useQuery({
    queryKey: ["admin", "me", "permissions", identityKey],
    queryFn: () => getMyPermissions(token),
    enabled: Boolean(token),
    staleTime: 5 * 60 * 1000,
  });
  const isAdmin = permissionsQuery.data?.is_admin ?? false;
  const includeUnlaunched = isAdmin && showAllCities;

  const metricsQuery = useQuery({
    queryKey: ["cross-city-comparison", "metrics", templateId],
    queryFn: () =>
      listAdminMetrics(token, {
        template_id: templateId,
        is_active: true,
        limit: 500,
      }),
    enabled: Boolean(token && templateId),
    staleTime: 2 * 60 * 1000,
  });

  const citiesQuery = useQuery({
    queryKey: ["cross-city-comparison", "cities"],
    queryFn: () => listCities(token),
    enabled: Boolean(token),
    staleTime: 10 * 60 * 1000,
  });

  const launchedCityIds = useMemo(() => {
    const ids = new Set<number>();
    for (const city of citiesQuery.data ?? []) {
      if (city.is_launched) ids.add(city.city_id);
    }
    return ids;
  }, [citiesQuery.data]);

  const cityMetrics = useMemo(() => {
    const withCity = (metricsQuery.data ?? []).filter((metric) => metric.city_id != null);
    if (includeUnlaunched) return withCity;
    return withCity.filter((metric) => launchedCityIds.has(metric.city_id!));
  }, [includeUnlaunched, launchedCityIds, metricsQuery.data]);

  const cityLookup = useMemo(
    () => buildCityLookup(citiesQuery.data ?? []),
    [citiesQuery.data]
  );

  const summaryQueries = useQueries({
    queries: cityMetrics.map((metric) => ({
      queryKey: ["cross-city-comparison", "summary", metric.id],
      queryFn: () =>
        getAdminMetricTimeSeries(metric.id, token, {
          exclude_group_fields: true,
        }),
      enabled: Boolean(token),
      staleTime: 2 * 60 * 1000,
    })),
  });

  const selectedCharts = useMemo(
    () =>
      cityMetrics
        .map((metric, index) => {
          const summary = summaryQueries[index]?.data;
          const chart = summary ? pickBestChart(summary) : null;
          return chart ? { metric, chart } : null;
        })
        .filter(
          (item): item is { metric: AdminMetricListItem; chart: AdminTimeSeriesSummary } =>
            item != null
        ),
    [cityMetrics, summaryQueries]
  );

  const detailQueries = useQueries({
    queries: selectedCharts.map(({ metric, chart }) => ({
      queryKey: ["cross-city-comparison", "detail", metric.id, chart.chart_id],
      queryFn: () => getAdminMetricTimeSeriesDetail(metric.id, chart.chart_id, token),
      enabled: Boolean(token && chart.chart_id),
      staleTime: 2 * 60 * 1000,
    })),
  });

  const citySeries = useMemo<CitySeries[]>(() => {
    return selectedCharts
      .map(({ metric, chart }, index) => {
        const detail = detailQueries[index]?.data;
        const cityId = metric.city_id;
        if (!detail || cityId == null) return null;
        const city = cityLookup.get(cityId) ?? {
          name: metric.city_name ?? `City ${cityId}`,
          emoji: null,
          population: null,
          population_source_name: null,
          population_data_year: null,
        };
        return {
          metric,
          chart,
          detail,
          city,
          // Temporary color; reassigned after value-based ordering below.
          color: SERIES_COLORS[index % SERIES_COLORS.length],
        };
      })
      .filter((item): item is CitySeries => item != null);
  }, [cityLookup, detailQueries, selectedCharts]);

  const commonDateWindow = useMemo(() => {
    const extents = citySeries
      .map((series) => {
        const points = parsePoints(series.detail);
        if (points.length === 0) return null;
        return {
          start: points[0].date,
          end: points[points.length - 1].date,
        };
      })
      .filter((extent): extent is { start: Date; end: Date } => extent != null);

    if (extents.length === 0) return null;
    const commonStart = new Date(
      Math.max(...extents.map((extent) => extent.start.getTime()))
    );
    const commonEnd = new Date(Math.min(...extents.map((extent) => extent.end.getTime())));
    if (commonStart > commonEnd) return null;
    return { start: commonStart, end: commonEnd };
  }, [citySeries]);

  const rangeStart = commonDateWindow
    ? new Date(
        Math.max(
          commonDateWindow.start.getTime(),
          getRangeStart(commonDateWindow.end, rangeMode).getTime()
        )
      )
    : null;

  /** Order by latest value in the active mode so legend/traces/table stay aligned. */
  const sortedCitySeries = useMemo(() => {
    const getLatestDisplayValue = (series: CitySeries): number => {
      if (!rangeStart || !commonDateWindow) return Number.NEGATIVE_INFINITY;
      const parsed = parsePoints(series.detail).filter(
        (point) => point.date >= rangeStart && point.date <= commonDateWindow.end
      );
      if (parsed.length === 0) return Number.NEGATIVE_INFINITY;
      const latest = toDisplayValue(
        parsed[parsed.length - 1].value,
        series.city.population,
        valueMode
      );
      return latest ?? Number.NEGATIVE_INFINITY;
    };

    return [...citySeries]
      .sort((a, b) => {
        const valueDiff = getLatestDisplayValue(b) - getLatestDisplayValue(a);
        if (valueDiff !== 0) return valueDiff;
        const popA = a.city.population ?? -1;
        const popB = b.city.population ?? -1;
        if (popB !== popA) return popB - popA;
        return a.city.name.localeCompare(b.city.name, undefined, {
          sensitivity: "base",
        });
      })
      .map((series, index) => ({
        ...series,
        color: SERIES_COLORS[index % SERIES_COLORS.length],
      }));
  }, [citySeries, commonDateWindow, rangeStart, valueMode]);

  const smoothingFootnote = useMemo(() => {
    const longRange = rangeMode === "1y" || rangeMode === "3y";
    return longRange
      ? "Bold lines are 28-day trailing averages; faint lines are raw values."
      : "Bold lines are 7-day trailing averages; faint lines are raw values.";
  }, [rangeMode]);

  const chartSeriesPoints = useMemo<ChartSeriesPoint[]>(() => {
    if (!rangeStart || !commonDateWindow) return [];
    const out: ChartSeriesPoint[] = [];

    for (const series of sortedCitySeries) {
      const population = series.city.population;
      const parsed = parsePoints(series.detail).filter(
        (point) => point.date >= rangeStart && point.date <= commonDateWindow.end
      );
      if (parsed.length === 0) continue;

      const y = parsed.map((point) => {
        if (valueMode === "absolute") return point.value;
        if (!population) return null;
        return point.value / (population / 1000);
      });
      const popLabel = formatPopulation(population);
      const label = `${series.city.emoji ? `${series.city.emoji} ` : ""}${series.city.name}${
        popLabel ? ` (${popLabel})` : ""
      }`;
      const smoothing = getSmoothingConfig(series.chart.period_type, rangeMode);
      const canSmooth =
        smoothing != null &&
        smoothing.window > 1 &&
        parsed.length >= smoothing.window;
      const displayY = canSmooth
        ? computeTrailingAverage(y, smoothing.window)
        : y;

      const valuesByDay = new Map<string, number>();
      parsed.forEach((point, index) => {
        const dayKey = toDayKey(point.time) ?? toDayKey(point.date);
        const value = displayY[index];
        if (!dayKey || value == null || !Number.isFinite(value)) return;
        valuesByDay.set(dayKey, value);
      });
      if (valuesByDay.size === 0) continue;

      out.push({
        metricId: series.metric.id,
        label,
        color: series.color,
        smoothingLabel: canSmooth && smoothing ? smoothing.label : null,
        valuesByDay,
      });
    }

    return out;
  }, [sortedCitySeries, commonDateWindow, rangeStart, valueMode, rangeMode]);

  const traces = useMemo<Data[]>(() => {
    if (!rangeStart || !commonDateWindow) return [];
    const out: Data[] = [];

    for (const series of sortedCitySeries) {
      const population = series.city.population;
      const parsed = parsePoints(series.detail).filter(
        (point) => point.date >= rangeStart && point.date <= commonDateWindow.end
      );
      if (parsed.length === 0) continue;

      const x = parsed.map((point) => point.time);
      const y = parsed.map((point) => {
        if (valueMode === "absolute") return point.value;
        if (!population) return null;
        return point.value / (population / 1000);
      });
      const popLabel = formatPopulation(population);
      const cityLabel = `${series.city.emoji ? `${series.city.emoji} ` : ""}${series.city.name}${
        popLabel ? ` (${popLabel})` : ""
      }`;
      const smoothing = getSmoothingConfig(series.chart.period_type, rangeMode);
      const canSmooth =
        smoothing != null &&
        smoothing.window > 1 &&
        parsed.length >= smoothing.window;

      // Keep traces hoverable so Plotly fires onHover; native labels are CSS-hidden.
      if (!canSmooth) {
        out.push({
          type: "scatter",
          mode: "lines",
          name: cityLabel,
          x,
          y,
          line: { color: series.color, width: 2 },
          hovertemplate: "%{x}<extra></extra>",
          showlegend: false,
        });
        continue;
      }

      const yAvg = computeTrailingAverage(y, smoothing.window);

      out.push({
        type: "scatter",
        mode: "lines",
        name: cityLabel,
        x,
        y,
        line: { color: series.color, width: 0.75 },
        opacity: 0.2,
        showlegend: false,
        hoverinfo: "skip",
      });
      out.push({
        type: "scatter",
        mode: "lines",
        name: cityLabel,
        x,
        y: yAvg,
        line: { color: series.color, width: 2 },
        hovertemplate: "%{x}<extra></extra>",
        showlegend: false,
      });
    }

    return out;
  }, [sortedCitySeries, commonDateWindow, rangeStart, valueMode, rangeMode]);

  chartSeriesPointsRef.current = chartSeriesPoints;
  valueModeRef.current = valueMode;

  const handlePlotHover = useCallback((event: Readonly<PlotHoverEvent>) => {
    const point = event.points?.[0];
    const mouse = event.event;
    const wrap = plotWrapRef.current;
    if (!point || !mouse || !wrap) return;

    const dayKey = toDayKey(point.x as string | Date | number);
    const mode = valueModeRef.current;
    const rows: CrossCityHoverRow[] = [];

    const lookupValue = (series: ChartSeriesPoint): number | null => {
      if (dayKey && series.valuesByDay.has(dayKey)) {
        return series.valuesByDay.get(dayKey) ?? null;
      }
      // Nearest day if Plotly's x formatting doesn't match our keys exactly.
      if (!dayKey) return null;
      const target = new Date(`${dayKey}T00:00:00`).getTime();
      if (Number.isNaN(target)) return null;
      let best: { value: number; delta: number } | null = null;
      for (const [key, value] of series.valuesByDay) {
        const ts = new Date(`${key}T00:00:00`).getTime();
        if (Number.isNaN(ts)) continue;
        const delta = Math.abs(ts - target);
        if (!best || delta < best.delta) best = { value, delta };
      }
      // Only accept within ~2 days for daily series drift.
      if (!best || best.delta > 2 * 24 * 60 * 60 * 1000) return null;
      return best.value;
    };

    for (const series of chartSeriesPointsRef.current) {
      const value = lookupValue(series);
      if (value == null || !Number.isFinite(value)) continue;
      rows.push({
        metricId: series.metricId,
        label: series.label,
        color: series.color,
        value,
        formatted: formatHoverValue(value, mode),
        smoothingLabel: series.smoothingLabel,
      });
    }

    // Fallback if day-key matching misses (timezone / x format mismatch).
    if (rows.length === 0) {
      for (const hoverPoint of event.points ?? []) {
        const value = Number(hoverPoint.y);
        if (!Number.isFinite(value)) continue;
        // Plotly includes fullData at runtime; @types/plotly.js PlotDatum omits it.
        const fullData = (
          hoverPoint as typeof hoverPoint & {
            fullData?: { line?: { color?: string } };
          }
        ).fullData;
        const lineColor = fullData?.line?.color;
        const color = typeof lineColor === "string" ? lineColor : "#64748b";
        const label =
          typeof hoverPoint.data?.name === "string"
            ? hoverPoint.data.name
            : "City";
        rows.push({
          metricId: hoverPoint.curveNumber ?? rows.length,
          label,
          color,
          value,
          formatted: formatHoverValue(value, mode),
          smoothingLabel: null,
        });
      }
    }

    rows.sort((a, b) => b.value - a.value);
    if (rows.length === 0) return;

    const rect = wrap.getBoundingClientRect();
    const rawLeft = mouse.clientX - rect.left + 14;
    const rawTop = mouse.clientY - rect.top + 14;
    const tipWidth = 260;
    const tipHeight = Math.min(28 + rows.length * 22, rect.height - 8);
    const left = Math.max(8, Math.min(rawLeft, rect.width - tipWidth - 8));
    const top = Math.max(8, Math.min(rawTop, rect.height - tipHeight - 8));

    setHoverTip({
      dateLabel: formatTableDate(point.x as string | Date),
      left,
      top,
      rows,
    });
  }, []);

  const clearHoverTip = useCallback(() => {
    setHoverTip(null);
  }, []);

  useEffect(() => {
    clearHoverTip();
  }, [valueMode, rangeMode, clearHoverTip]);

  const showSmoothingFootnote = useMemo(
    () =>
      sortedCitySeries.some((series) => {
        const smoothing = getSmoothingConfig(series.chart.period_type, rangeMode);
        return smoothing != null && smoothing.window > 1;
      }),
    [sortedCitySeries, rangeMode]
  );

  const populationFootnote = useMemo(
    () => buildPopulationFootnote(sortedCitySeries),
    [sortedCitySeries]
  );

  const tableRows = useMemo<CrossCityTableRow[]>(() => {
    if (!rangeStart || !commonDateWindow) return [];
    const rows: CrossCityTableRow[] = [];

    for (const series of sortedCitySeries) {
      const population = series.city.population;
      const parsed = parsePoints(series.detail).filter(
        (point) => point.date >= rangeStart && point.date <= commonDateWindow.end
      );
      if (parsed.length === 0) continue;

      const values = parsed
        .map((point) => toDisplayValue(point.value, population, valueMode))
        .filter((value): value is number => value != null && Number.isFinite(value));
      if (values.length === 0) continue;

      const startValue = toDisplayValue(parsed[0].value, population, valueMode);
      const endValue = toDisplayValue(
        parsed[parsed.length - 1].value,
        population,
        valueMode
      );
      const average =
        values.reduce((sum, value) => sum + value, 0) / values.length;
      const change =
        startValue != null && endValue != null ? endValue - startValue : null;
      const changePct =
        change != null && startValue != null && startValue !== 0
          ? (change / startValue) * 100
          : null;

      rows.push({
        metricId: series.metric.id,
        cityName: series.city.name,
        emoji: series.city.emoji,
        color: series.color,
        population,
        startValue,
        endValue,
        average,
        change,
        changePct,
      });
    }

    // Keep table order identical to chart/legend (already sorted by latest value).
    return rows;
  }, [sortedCitySeries, commonDateWindow, rangeStart, valueMode]);

  const isBootstrapping = metricsQuery.isLoading || citiesQuery.isLoading;
  const isSeriesLoading =
    !isBootstrapping &&
    cityMetrics.length > 0 &&
    (summaryQueries.some((query) => query.isLoading || query.isFetching) ||
      detailQueries.some((query) => query.isLoading || query.isFetching));
  const seriesLoadLabel = useMemo(() => {
    if (!isSeriesLoading) return null;
    const total = cityMetrics.length;
    const ready = sortedCitySeries.length;
    if (total <= 0) return "Loading time series…";
    return `Loading time series… (${ready} of ${total} cities)`;
  }, [isSeriesLoading, cityMetrics.length, sortedCitySeries.length]);

  const isError =
    metricsQuery.isError ||
    citiesQuery.isError ||
    summaryQueries.some((query) => query.isError) ||
    detailQueries.some((query) => query.isError);

  const hasAnyPopulation = sortedCitySeries.some(
    (series) => series.city.population != null
  );

  const layout: Partial<Layout> = useMemo(
    () => ({
      autosize: true,
      margin: { l: 56, r: 16, t: 12, b: 42 },
      paper_bgcolor: "transparent",
      plot_bgcolor: "transparent",
      // Collect all series at the hovered x; labels come from our custom tip sorted by value.
      hovermode: "x",
      hoverlabel: {
        bgcolor: "rgba(0,0,0,0)",
        bordercolor: "rgba(0,0,0,0)",
        font: {
          family: PLOT_AXIS_FONT_FAMILY,
          size: 1,
          color: "rgba(0,0,0,0)",
        },
      },
      // Keep Plotly from resetting hover while React updates the tip overlay.
      uirevision: "cross-city-comparison",
      showlegend: false,
      xaxis: {
        showgrid: false,
        zeroline: false,
        color: axisTextColor,
        tickfont: {
          family: PLOT_AXIS_FONT_FAMILY,
          size: 10,
          color: axisTextColor,
        },
        spikedash: "dot",
        spikemode: "across",
        spikesnap: "cursor",
        spikethickness: 1,
        spikecolor: isDark ? "#64748b" : "#94a3b8",
        showspikes: true,
      },
      yaxis: {
        title: valueMode === "per_1k" ? { text: "Per 1k people" } : undefined,
        gridcolor: gridColor,
        zeroline: false,
        color: axisTextColor,
        tickfont: {
          family: PLOT_AXIS_FONT_FAMILY,
          size: 10,
          color: axisTextColor,
        },
      },
    }),
    [axisTextColor, gridColor, isDark, valueMode]
  );

  const config: Partial<Config> = useMemo(
    () => ({
      displayModeBar: false,
      responsive: true,
    }),
    []
  );

  const title = metricName ?? cityMetrics[0]?.metric_name ?? "Cross-city comparison";

  const chartHeader = (subtitle: ReactNode) => (
    <div className="cross-city-chart-header-intro">
      <div className="cross-city-chart-title-row">
        <h3 className="cross-city-chart-title">{title}</h3>
        {fullPageHref ? (
          <Link
            href={fullPageHref}
            target="_blank"
            rel="noopener noreferrer"
            className="cross-city-chart-full-page-link"
          >
            View full page →
          </Link>
        ) : null}
      </div>
      {subtitle ? <p className="cross-city-chart-subtitle">{subtitle}</p> : null}
    </div>
  );

  if (isBootstrapping) {
    return (
      <section className="cross-city-chart-card">
        {chartHeader("Loading cross-city comparison…")}
        <div className="cross-city-chart-loading" role="status" aria-live="polite">
          <Loader size="md" color="dark" />
          <span>Loading cities and metrics…</span>
        </div>
      </section>
    );
  }

  if (isError) {
    return (
      <section className="cross-city-chart-card">
        {chartHeader(null)}
        <div className="cross-city-chart-empty">Unable to load cross-city comparison.</div>
      </section>
    );
  }

  const emptyMessage = includeUnlaunched
    ? "No comparable city time series found for this template."
    : "No comparable city time series found for launched cities on this template.";

  return (
    <section className="cross-city-chart-card">
      <div className="cross-city-chart-header">
        {chartHeader(
          <>
            {citySeries.length} cities matched from template #{templateId}
            {!includeUnlaunched ? " (launched only)" : ""}
          </>
        )}
        <div className="cross-city-chart-controls" aria-label="Cross-city comparison controls">
          <div className="cross-city-chart-segmented" aria-label="Date range">
            {(Object.keys(RANGE_LABELS) as RangeMode[]).map((range) => (
              <button
                key={range}
                type="button"
                className={
                  rangeMode === range
                    ? "cross-city-chart-toggle-active"
                    : "cross-city-chart-toggle"
                }
                onClick={() => setRangeMode(range)}
                aria-pressed={rangeMode === range}
              >
                {RANGE_LABELS[range]}
              </button>
            ))}
          </div>
          <div className="cross-city-chart-segmented" aria-label="Value mode">
            <button
              type="button"
              className={
                valueMode === "absolute"
                  ? "cross-city-chart-toggle-active"
                  : "cross-city-chart-toggle"
              }
              onClick={() => setValueMode("absolute")}
              aria-pressed={valueMode === "absolute"}
            >
              Absolute
            </button>
            <button
              type="button"
              className={
                valueMode === "per_1k"
                  ? "cross-city-chart-toggle-active"
                  : "cross-city-chart-toggle"
              }
              onClick={() => setValueMode("per_1k")}
              aria-pressed={valueMode === "per_1k"}
              disabled={!hasAnyPopulation}
              title={
                hasAnyPopulation
                  ? "Normalize each city by population"
                  : "No city population values available"
              }
            >
              Per 1k people
            </button>
          </div>
          {isAdmin ? (
            <label className="cross-city-chart-launched-toggle">
              <input
                type="checkbox"
                checked={showAllCities}
                onChange={(e) => setShowAllCities(e.target.checked)}
              />
              <span>Include unlaunched cities</span>
            </label>
          ) : null}
        </div>
      </div>

      {sortedCitySeries.length > 0 || isSeriesLoading ? (
        <div className="cross-city-chart-body">
          <div
            ref={plotWrapRef}
            className="cross-city-chart-plot-wrap"
            style={{ minHeight: height }}
            aria-busy={isSeriesLoading}
            onMouseLeave={clearHoverTip}
          >
            {sortedCitySeries.length > 0 ? (
              <div className="cross-city-chart-plot">
                <CrossCityPlot
                  data={traces}
                  layout={layout}
                  config={config}
                  height={height}
                  onHover={handlePlotHover}
                />
                {hoverTip ? (
                  <div
                    className="cross-city-chart-hover-tip"
                    style={{ left: hoverTip.left, top: hoverTip.top }}
                    role="tooltip"
                  >
                    <div className="cross-city-chart-hover-tip-date">
                      {hoverTip.dateLabel}
                    </div>
                    <ul className="cross-city-chart-hover-tip-list">
                      {hoverTip.rows.map((row) => (
                        <li key={row.metricId} className="cross-city-chart-hover-tip-row">
                          <span
                            className="cross-city-chart-swatch"
                            style={{ backgroundColor: row.color }}
                            aria-hidden="true"
                          />
                          <span className="cross-city-chart-hover-tip-label">
                            {row.label}
                            {row.smoothingLabel ? (
                              <span className="cross-city-chart-hover-tip-meta">
                                {" "}
                                · {row.smoothingLabel}
                              </span>
                            ) : null}
                          </span>
                          <span className="cross-city-chart-hover-tip-value">
                            {row.formatted}
                            {valueMode === "per_1k" ? " /1k" : ""}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>
            ) : null}
            {isSeriesLoading ? (
              <div
                className="cross-city-chart-plot-loading"
                role="status"
                aria-live="polite"
              >
                <Loader size="md" color="dark" />
                <span>{seriesLoadLabel ?? "Loading time series…"}</span>
              </div>
            ) : null}
          </div>
          {sortedCitySeries.length > 0 ? (
            <div className="cross-city-chart-legend" aria-label="Cities in comparison">
              {sortedCitySeries.map((series) => {
                const popLabel = formatPopulation(series.city.population);
                return (
                  <div key={series.metric.id} className="cross-city-chart-legend-item">
                    <span
                      className="cross-city-chart-swatch"
                      style={{ backgroundColor: series.color }}
                      aria-hidden="true"
                    />
                    {series.city.emoji ? (
                      <span className="cross-city-chart-emoji" aria-hidden="true">
                        {series.city.emoji}
                      </span>
                    ) : null}
                    <span className="cross-city-chart-legend-text">
                      <span className="cross-city-chart-city">{series.city.name}</span>
                      {popLabel ? (
                        <span className="cross-city-chart-population">
                          {" "}
                          ({popLabel})
                        </span>
                      ) : null}
                    </span>
                  </div>
                );
              })}
            </div>
          ) : null}
        </div>
      ) : (
        <div className="cross-city-chart-empty">{emptyMessage}</div>
      )}

      {valueMode === "per_1k" && !hasAnyPopulation ? (
        <p className="cross-city-chart-note">
          Per 1k people view is unavailable because no city population values were found.
        </p>
      ) : null}
      {showSmoothingFootnote ? (
        <p className="cross-city-chart-footnote">{smoothingFootnote}</p>
      ) : null}
      {populationFootnote ? (
        <p className="cross-city-chart-footnote">{populationFootnote}</p>
      ) : null}

      {tableRows.length > 0 ? (
        <section
          className="cross-city-chart-data-section"
          aria-label="Numeric breakdown by city"
        >
          <button
            type="button"
            className="cross-city-chart-data-toggle"
            aria-expanded={dataTableExpanded}
            aria-controls="cross-city-chart-data-panel"
            onClick={() => setDataTableExpanded((open) => !open)}
          >
            <span>
              Data table
              <span className="cross-city-chart-data-toggle-meta">
                {" "}
                ({tableRows.length} {tableRows.length === 1 ? "city" : "cities"})
              </span>
            </span>
            <span className="cross-city-chart-data-toggle-icon" aria-hidden="true">
              {dataTableExpanded ? "−" : "+"}
            </span>
          </button>
          {dataTableExpanded ? (
            <div id="cross-city-chart-data-panel" className="cross-city-chart-data-panel">
              <div className="cross-city-chart-data-scroll">
                <table className="cross-city-chart-data-table">
                  <thead>
                    <tr>
                      <th scope="col">City</th>
                      <th scope="col" className="cross-city-chart-data-num">
                        Population
                      </th>
                      <th scope="col" className="cross-city-chart-data-num">
                        Start
                        {rangeStart ? (
                          <span className="cross-city-chart-data-subhead">
                            {formatTableDate(rangeStart)}
                          </span>
                        ) : null}
                      </th>
                      <th scope="col" className="cross-city-chart-data-num">
                        Latest
                        {commonDateWindow ? (
                          <span className="cross-city-chart-data-subhead">
                            {formatTableDate(commonDateWindow.end)}
                          </span>
                        ) : null}
                      </th>
                      <th scope="col" className="cross-city-chart-data-num">
                        Average
                      </th>
                      <th scope="col" className="cross-city-chart-data-num">
                        Δ
                      </th>
                      <th scope="col" className="cross-city-chart-data-num">
                        Δ%
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {tableRows.map((row) => {
                      const popLabel = formatPopulation(row.population);
                      return (
                      <tr key={row.metricId}>
                        <td>
                          <span className="cross-city-chart-data-city">
                            <span
                              className="cross-city-chart-swatch"
                              style={{ backgroundColor: row.color }}
                              aria-hidden="true"
                            />
                            {row.emoji ? (
                              <span aria-hidden="true">{row.emoji}</span>
                            ) : null}
                            <span>
                              {row.cityName}
                              {popLabel ? (
                                <span className="cross-city-chart-population">
                                  {" "}
                                  ({popLabel})
                                </span>
                              ) : null}
                            </span>
                          </span>
                        </td>
                        <td className="cross-city-chart-data-num">
                          {row.population != null
                            ? row.population.toLocaleString()
                            : "—"}
                        </td>
                        <td className="cross-city-chart-data-num">
                          {formatTableValue(row.startValue, valueMode)}
                        </td>
                        <td className="cross-city-chart-data-num">
                          {formatTableValue(row.endValue, valueMode)}
                        </td>
                        <td className="cross-city-chart-data-num">
                          {formatTableValue(row.average, valueMode)}
                        </td>
                        <td className="cross-city-chart-data-num">
                          {formatTableChange(row.change, valueMode)}
                        </td>
                        <td className="cross-city-chart-data-num">
                          {formatTablePct(row.changePct)}
                        </td>
                      </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <p className="cross-city-chart-data-caption">
                Values match the chart’s selected range
                {valueMode === "per_1k" ? " (per 1k people)" : ""}
                . Δ is latest minus start.
              </p>
            </div>
          ) : null}
        </section>
      ) : null}
    </section>
  );
}

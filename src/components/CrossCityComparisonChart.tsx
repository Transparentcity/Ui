"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useMemo, useState, type ComponentType, type ReactNode } from "react";
import type { PlotParams } from "react-plotly.js";
import type { Config, Data, Layout } from "plotly.js";
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
import Loader from "./Loader";
import "./CrossCityComparisonChart.css";

const Plot = dynamic(
  () => import("react-plotly.js"),
  { ssr: false }
) as ComponentType<PlotParams>;

type ValueMode = "absolute" | "per_1k";
type RangeMode = "1m" | "3m" | "ytd" | "1y" | "3y";

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

function formatPopulation(value: number | null): string {
  if (value == null) return "pop. unknown";
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(0)}k`;
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

export default function CrossCityComparisonChart({
  templateId,
  token,
  height = 360,
  metricName,
  fullPageHref,
}: CrossCityComparisonChartProps) {
  const [valueMode, setValueMode] = useState<ValueMode>("absolute");
  const [rangeMode, setRangeMode] = useState<RangeMode>("1y");
  /** Admin-only: when true, include cities that are not launched. */
  const [showAllCities, setShowAllCities] = useState(false);

  const permissionsQuery = useQuery({
    queryKey: ["cross-city-comparison", "permissions"],
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
          color: SERIES_COLORS[index % SERIES_COLORS.length],
        };
      })
      .filter((item): item is CitySeries => item != null);
  }, [cityLookup, detailQueries, selectedCharts]);

  const sortedCitySeries = useMemo(() => {
    return [...citySeries]
      .sort((a, b) => {
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
  }, [citySeries]);

  const commonDateWindow = useMemo(() => {
    const extents = sortedCitySeries
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
  }, [sortedCitySeries]);

  const rangeStart = commonDateWindow
    ? new Date(
        Math.max(
          commonDateWindow.start.getTime(),
          getRangeStart(commonDateWindow.end, rangeMode).getTime()
        )
      )
    : null;

  const smoothingFootnote = useMemo(() => {
    const longRange = rangeMode === "1y" || rangeMode === "3y";
    return longRange
      ? "Bold lines are 28-day trailing averages; faint lines are raw values."
      : "Bold lines are 7-day trailing averages; faint lines are raw values.";
  }, [rangeMode]);

  const traces = useMemo<Data[]>(() => {
    if (!rangeStart || !commonDateWindow) return [];
    const valueLabel =
      valueMode === "per_1k" ? "%{y:.2f} per 1k people" : "%{y:,.0f}";
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
      const cityLabel = `${series.city.emoji ? `${series.city.emoji} ` : ""}${series.city.name}`;
      const smoothing = getSmoothingConfig(series.chart.period_type, rangeMode);
      const canSmooth =
        smoothing != null &&
        smoothing.window > 1 &&
        parsed.length >= smoothing.window;

      if (!canSmooth) {
        out.push({
          type: "scatter",
          mode: "lines",
          name: cityLabel,
          x,
          y,
          line: { color: series.color, width: 2 },
          hovertemplate: `<b>${cityLabel}</b><br>%{x}<br>${valueLabel}<extra></extra>`,
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
        name: `${cityLabel} (${smoothing.label})`,
        x,
        y: yAvg,
        line: { color: series.color, width: 2 },
        hovertemplate:
          `<b>${cityLabel}</b> · ${smoothing.label}<br>%{x}<br>${valueLabel}<extra></extra>`,
        showlegend: false,
      });
    }

    return out;
  }, [sortedCitySeries, commonDateWindow, rangeStart, valueMode, rangeMode]);

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

  const layout: Partial<Layout> = {
    autosize: true,
    margin: { l: 56, r: 16, t: 12, b: 42 },
    paper_bgcolor: "transparent",
    plot_bgcolor: "transparent",
    hovermode: "x unified",
    showlegend: false,
    xaxis: {
      showgrid: false,
      zeroline: false,
      color: "var(--text-secondary)",
    },
    yaxis: {
      title: valueMode === "per_1k" ? { text: "Per 1k people" } : undefined,
      gridcolor: "rgba(148, 163, 184, 0.18)",
      zeroline: false,
      color: "var(--text-secondary)",
    },
  };

  const config: Partial<Config> = {
    displayModeBar: false,
    responsive: true,
  };

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
            className="cross-city-chart-plot-wrap"
            style={{ minHeight: height }}
            aria-busy={isSeriesLoading}
          >
            {sortedCitySeries.length > 0 ? (
              <div className="cross-city-chart-plot">
                <Plot
                  data={traces}
                  layout={layout}
                  config={config}
                  style={{ width: "100%", height }}
                />
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
              {sortedCitySeries.map((series) => (
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
                    <span className="cross-city-chart-population">
                      {formatPopulation(series.city.population)}
                    </span>
                  </span>
                </div>
              ))}
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
    </section>
  );
}

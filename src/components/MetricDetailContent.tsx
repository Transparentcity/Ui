"use client";

import React, { useState, useMemo, useEffect } from "react";
import { usePublicMetricComparisons, usePublicMetricTimeSeriesSummary } from "@/lib/hooks/usePublicMetric";
import type { PublicMetricDetail } from "@/lib/publicApiClient";
import MetricMapEmbed from "./MetricMapEmbed";
import CategoryBreakdown from "./CategoryBreakdown";
import { slugify } from "@/lib/utils";
import { getDataPortalForCity } from "@/lib/dataPortals";
import { API_BASE } from "@/lib/apiBase";
import TimeSeriesChart from "./TimeSeriesChart";
import Loader from "./Loader";
import type { PublicTimeSeriesSummaryItem } from "@/lib/publicApiClient";

interface PublicTimeSeriesPoint {
  time_period: string;
  numeric_value: number;
  group_value?: string | null;
}

interface PublicTimeSeriesResponse {
  count: number;
  metadata?: Record<string, any>;
  data: PublicTimeSeriesPoint[];
}

async function getPublicTimeSeries(chartId: number): Promise<PublicTimeSeriesResponse> {
  const response = await fetch(`${API_BASE}/api/time-series/public/${chartId}`);
  if (!response.ok) {
    throw new Error(`Failed to load time series ${chartId}`);
  }
  return response.json();
}

function aggregateTimeSeries(data: PublicTimeSeriesPoint[]): PublicTimeSeriesPoint[] {
  const map = new Map<string, { sum: number; count: number }>();
  data.forEach((point) => {
    const key = `${point.time_period}|${point.group_value || ""}`;
    const existing = map.get(key) || { sum: 0, count: 0 };
    map.set(key, {
      sum: existing.sum + (point.numeric_value || 0),
      count: existing.count + 1,
    });
  });
  return Array.from(map.entries()).map(([key, { sum }]) => {
    const [time_period, group_value] = key.split("|");
    return {
      time_period,
      numeric_value: sum,
      group_value: group_value || null,
    };
  });
}

// Simple component to fetch and display time series chart
function PublicTimeSeriesChart({ 
  chartId
}: { 
  chartId: number;
}) {
  const [data, setData] = useState<PublicTimeSeriesResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    getPublicTimeSeries(chartId)
      .then((res) => {
        if (mounted) {
          setData(res);
        }
      })
      .catch(() => {
        if (mounted) setData(null);
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [chartId]);

  if (loading) {
    return (
      <div className="metric-placeholder" style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "0.75rem" }}>
        <Loader size="sm" color="dark" />
        Loading chart…
      </div>
    );
  }
  if (!data || data.data.length === 0) {
    return <div className="metric-placeholder">No chart data available.</div>;
  }
  
  // Aggregate duplicate periods (sum values for same time_period + group_value)
  const aggregated = aggregateTimeSeries(data.data);
  
  return (
    <TimeSeriesChart
      data={aggregated}
      metadata={data.metadata}
      height={320}
      defaultPeriod="ytd"
      fullBleed={true}
      hidePeriodSelector={false}
      showExternalTitle={true}
    />
  );
}

interface MetricDetailContentProps {
  metric: PublicMetricDetail;
  citySlug: string;
  cityName: string;
  district?: number | null;
}

export default function MetricDetailContent({
  metric,
  citySlug,
  cityName,
  district,
}: MetricDetailContentProps) {
  const [selectedPeriod, setSelectedPeriod] = useState<"ytd" | "mtd" | "mtd_prior_year">("ytd");
  const [definitionExpanded, setDefinitionExpanded] = useState(false);
  const selectedDistrict = district ?? null; // null = citywide, number = specific district

  const comparisonsQuery = usePublicMetricComparisons(
    metric.id,
    selectedDistrict,
    selectedPeriod
  );
  const timeSeriesQuery = usePublicMetricTimeSeriesSummary(metric.id);

  const comparison = comparisonsQuery.data?.comparisons[selectedPeriod];

  const periodButtonLabels = {
    ytd: "Year-to-Date",
    mtd: "Month-to-Date",
    mtd_prior_year: "Month-to-Date (Prior Year)",
  };

  const periodLabels = {
    ytd: "Year-to-Date Comparison",
    mtd: "Month-to-Date Comparison",
    mtd_prior_year: "Month-to-Date Comparison (Prior Year)",
  };

  const periodDescriptions = {
    ytd: "compared to last year",
    mtd: "compared to last month",
    mtd_prior_year: "compared to the same month last year",
  };

  const comparisonLabels: Record<typeof selectedPeriod, { previous: string; current: string }> = {
    ytd: { previous: "Last Year", current: "This Year" },
    mtd: { previous: "Last Month", current: "This Month" },
    mtd_prior_year: { previous: "Last Year", current: "This Year" },
  };

  const formatValue = (value: number | null | undefined): string => {
    if (value === null || value === undefined) return "No data";
    const absValue = Math.abs(value);
    const sign = value < 0 ? "-" : "";
    const formatWithSuffix = (scaled: number, suffix: string) =>
      `${scaled.toFixed(1).replace(/\.0$/, "")}${suffix}`;

    if (absValue >= 1e9) return `${sign}${formatWithSuffix(absValue / 1e9, "B")}`;
    if (absValue >= 1e6) return `${sign}${formatWithSuffix(absValue / 1e6, "M")}`;
    if (absValue >= 1e3) return `${sign}${formatWithSuffix(absValue / 1e3, "k")}`;
    const rounded = Math.round(absValue * 10) / 10;
    return `${sign}${rounded.toLocaleString(undefined, { maximumFractionDigits: 1 })}`;
  };

  const formatDateRange = (start: string | null | undefined, end: string | null | undefined): string => {
    if (!start || !end) return "—";
    const startDate = new Date(start);
    const endDate = new Date(end);
    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
      return "—";
    }
    const startStr = startDate.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    const endStr = endDate.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
    return `${startStr} – ${endStr}`;
  };

  const trend = comparison && comparison.current_period_value !== null && comparison.comparison_period_value !== null
    ? (() => {
        const current = comparison.current_period_value ?? 0;
        const previous = comparison.comparison_period_value ?? 0;
        const diff = current - previous;
        const percent = previous !== 0 ? (diff / previous) * 100 : 0;
        return {
          diff,
          percent,
          isIncrease: diff > 0,
        };
      })()
    : null;

  const trendTone = useMemo(() => {
    if (!trend || !metric?.greendirection) return "neutral";
    const absPercent = Math.abs(trend.percent);
    if (absPercent <= 5) return "neutral";
    const shouldBeUp = metric.greendirection === "up";
    if ((trend.isIncrease && shouldBeUp) || (!trend.isIncrease && !shouldBeUp)) {
      return "good";
    }
    return "bad";
  }, [trend, metric?.greendirection]);

  const locationLabel = selectedDistrict !== null && selectedDistrict > 0
    ? `District ${selectedDistrict}`
    : cityName;

  const preferredChartId = useMemo(() => {
    const series = timeSeriesQuery.data?.time_series || [];
    if (series.length === 0) return null;
    
    // Filter by selected district (null/0 = citywide)
    const targetDistrict = selectedDistrict ?? 0;
    const districtSeries = series.filter(
      (item) => {
        const itemDistrict = item.district ?? 0;
        return itemDistrict === targetDistrict && !item.group_field;
      }
    );
    
    // If no district-specific chart, fall back to citywide
    const candidates = districtSeries.length > 0 
      ? districtSeries 
      : series.filter((item) => (item.district === 0 || item.district === null) && !item.group_field);
    
    if (candidates.length === 0) return series[0]?.chart_id ?? null;
    // Prefer daily chart for YTD (YTD is computed from daily series)
    const dayChart = candidates.find((item) => item.period_type?.toLowerCase() === "day");
    if (dayChart) return dayChart.chart_id;
    // Fallback to YTD chart, then month
    const ytdChart = candidates.find((item) => item.period_type?.toLowerCase() === "ytd");
    if (ytdChart) return ytdChart.chart_id;
    const monthChart = candidates.find((item) => item.period_type?.toLowerCase() === "month");
    return monthChart?.chart_id ?? candidates[0].chart_id;
  }, [timeSeriesQuery.data, selectedDistrict]);

  return (
    <div className="metric-detail-content">
      {/* Last Updated */}
      {metric.last_execution_at && (
        <div className="metric-last-updated">
          Last updated on {new Date(metric.last_execution_at).toLocaleDateString("en-US", {
            month: "long",
            day: "numeric",
            year: "numeric"
          })}
        </div>
      )}

      {/* Comparison */}
      <section className="metric-section metric-comparison">
        <h2 className="metric-section-title">How have {metric.metric_name.toLowerCase()} changed in {locationLabel}?</h2>
        <div className="metric-period-selector">
          {(["ytd", "mtd", "mtd_prior_year"] as const).map((period) => (
            <button
              key={period}
              className={`period-button ${selectedPeriod === period ? "active" : ""}`}
              onClick={() => setSelectedPeriod(period)}
            >
              {periodButtonLabels[period]}
            </button>
          ))}
        </div>
        <div className="metric-comparison-grid">
          {/* Previous period on LEFT */}
          <div className="comparison-card">
            <div className="comparison-label">{comparisonLabels[selectedPeriod].previous}</div>
            <div className="comparison-dates">
              {formatDateRange(comparison?.comparison_period_start, comparison?.comparison_period_end)}
            </div>
            <div className="comparison-value">{formatValue(comparison?.comparison_period_value)}</div>
            <div className="comparison-unit">{metric.item_noun}</div>
          </div>
          <div className="comparison-vs">→</div>
          {/* Current period on RIGHT */}
          <div className="comparison-card">
            <div className="comparison-label">{comparisonLabels[selectedPeriod].current}</div>
            <div className="comparison-dates">
              {formatDateRange(comparison?.current_period_start, comparison?.current_period_end)}
            </div>
            <div className="comparison-value">{formatValue(comparison?.current_period_value)}</div>
            <div className="comparison-unit">{metric.item_noun}</div>
          </div>
        </div>
        {trend && (
          <div className="comparison-summary">
            In {locationLabel}, {metric.metric_name.toLowerCase()} {metric.item_noun} are{" "}
            <span
              className={
                trendTone === "neutral"
                  ? "trend-neutral"
                  : trendTone === "good"
                    ? "trend-good"
                    : "trend-bad"
              }
            >
              {trend.isIncrease ? "up" : "down"} {Math.abs(trend.percent).toFixed(1)}%
            </span>{" "}
            {periodDescriptions[selectedPeriod]}.
          </div>
        )}
      </section>

      {/* YTD Comparison Chart */}
      {preferredChartId && (
        <section className="metric-section metric-chart-section">
          <h2 className="metric-section-title">What are the trends over time?</h2>
          <div className="metric-chart-container">
            <PublicTimeSeriesChart chartId={preferredChartId} />
          </div>
        </section>
      )}

      {/* District Comparison - only show for citywide view */}
      {(selectedDistrict === null || selectedDistrict === 0) ? (
        <section className="metric-section">
          <h2 className="metric-section-title">Where are {metric.metric_name.toLowerCase()} highest in {cityName}?</h2>
          <MetricMapEmbed
            metricId={metric.id}
            selectedPeriod={selectedPeriod}
            height={400}
            showLink={true}
            showPeriodSelector={false}
            district={null}
            metricName={metric.metric_name}
            itemNoun={metric.item_noun}
            dateRange={{
              start: comparison?.current_period_start || null,
              end: comparison?.current_period_end || null,
            }}
          />
        </section>
      ) : (
        <section className="metric-section">
          <h2 className="metric-section-title">Where are {metric.metric_name.toLowerCase()} happening in District {selectedDistrict}?</h2>
          <MetricMapEmbed
            metricId={metric.id}
            selectedPeriod={selectedPeriod}
            height={400}
            showLink={true}
            showPeriodSelector={false}
            district={selectedDistrict}
            metricName={metric.metric_name}
            itemNoun={metric.item_noun}
            dateRange={{
              start: comparison?.current_period_start || null,
              end: comparison?.current_period_end || null,
            }}
          />
        </section>
      )}

      {/* Definition */}
      {metric.definition && (
        <section className="metric-section metric-definition">
          <h2 className="metric-section-title">How are these calculated?</h2>
          <p className="metric-source-intro">
            This data comes from {cityName}'s own{" "}
            {(() => {
              const portal = getDataPortalForCity(citySlug, cityName);
              return portal ? (
                <a
                  href={portal.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="provenance-link-inline"
                >
                  {portal.name}
                </a>
              ) : (
                "official open data portal"
              );
            })()}
            . Learn more about{" "}
            <a href="/mission" className="provenance-link-inline">
              Transparent City's mission
            </a>{" "}
            and{" "}
            <a href={`/c/${citySlug}/methodology`} className="provenance-link-inline">
              our methodology
            </a>
            .
          </p>
          <p className={`metric-definition-text ${definitionExpanded ? "expanded" : "clamped"}`}>
            {metric.definition}
          </p>
          <button
            className="metric-more-btn"
            onClick={() => setDefinitionExpanded((prev) => !prev)}
          >
            {definitionExpanded ? "Show less" : "Show more"}
          </button>
          {definitionExpanded && (
            <div className="metric-definition-extra">
              {(metric.source_url || metric.data_sf_url) && (
                <div className="provenance-item">
                  <h3 className="provenance-label">Where does this data come from?</h3>
                  <p className="provenance-value">
                    {metric.dataset_title && (
                      <>
                        {metric.dataset_title}
                        {metric.dataset_category && ` (${metric.dataset_category})`}
                      </>
                    )}
                    {metric.source_url && (
                      <a
                        href={metric.source_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="provenance-link"
                      >
                        View original dataset →
                      </a>
                    )}
                    {metric.data_sf_url && !metric.source_url && (
                      <a
                        href={metric.data_sf_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="provenance-link"
                      >
                        View on DataSF →
                      </a>
                    )}
                  </p>
                </div>
              )}
              {metric.most_recent_data_date && (
                <div className="provenance-item">
                  <h3 className="provenance-label">How recent is this data?</h3>
                  <p className="provenance-value">
                    Data through {new Date(metric.most_recent_data_date).toLocaleDateString()}
                  </p>
                </div>
              )}
              {(metric.earliest_data_date || metric.most_recent_data_date) && (
                <div className="provenance-item">
                  <h3 className="provenance-label">How far back does this go?</h3>
                  <p className="provenance-value">
                    {metric.earliest_data_date &&
                      new Date(metric.earliest_data_date).toLocaleDateString()}
                    {metric.earliest_data_date && metric.most_recent_data_date && " – "}
                    {metric.most_recent_data_date &&
                      new Date(metric.most_recent_data_date).toLocaleDateString()}
                  </p>
                </div>
              )}
            </div>
          )}
        </section>
      )}

      {/* Category Breakdown */}
      {metric.category_fields && metric.category_fields.length > 0 && (
        <section className="metric-section">
          <h2 className="metric-section-title">What types of {metric.metric_name.toLowerCase()} are there?</h2>
          <CategoryBreakdown metricId={metric.id} categoryFields={metric.category_fields} />
        </section>
      )}
    </div>
  );
}

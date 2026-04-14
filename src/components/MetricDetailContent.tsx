"use client";

import React, { useState, useMemo, useEffect } from "react";
import { formatDateRangeFromStrings } from "@/lib/formatters";
import { usePublicMetricComparisons, usePublicMetricTimeSeriesSummary } from "@/lib/hooks/usePublicMetric";
import type { PublicMetricDetail, PublicMetricComparisons, PublicTimeSeriesSummary } from "@/lib/publicApiClient";
import {
  getPublicCityDetail,
  getPublicMetricCompletenessDaily,
  getPublicMetricCompletenessStats,
  type CompletenessStatisticsResponse,
  type DailyCompletenessResponse,
  type PublicCityDetail,
} from "@/lib/publicApiClient";
import MetricMapEmbed from "./MetricMapEmbed";
import DistrictComparisonTable from "./DistrictComparisonTable";
import DeltaMapView from "./DeltaMapView";
import CategoryBreakdown from "./CategoryBreakdown";
import { API_BASE } from "@/lib/apiBase";
import Loader from "./Loader";
import PublicMetricTimeSeriesChart from "./PublicMetricTimeSeriesChart";
import { selectPublicMetricCharts } from "@/lib/selectPublicMetricCharts";
import CompletenessSparkline from "./CompletenessSparkline";

interface MetricDetailContentProps {
  metric: PublicMetricDetail;
  cityName: string;
  /** When provided (e.g. on metric page), enables "View full page" link for the time series chart. */
  citySlug?: string | null;
  district?: number | null;
  initialComparisons?: PublicMetricComparisons;
  initialTimeSeriesSummary?: PublicTimeSeriesSummary;
}

export default function MetricDetailContent({
  metric,
  cityName,
  citySlug,
  district,
  initialComparisons,
  initialTimeSeriesSummary,
}: MetricDetailContentProps) {
  const [selectedPeriod, setSelectedPeriod] = useState<"ytd" | "mtd" | "mtd_prior_year">("ytd");
  const selectedDistrict = district ?? null; // null = citywide, number = specific district

  // Detect narrow screens for compact map/chart layout
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const mql = window.matchMedia("(max-width: 640px)");
    setIsMobile(mql.matches);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, []);

  const comparisonsQuery = usePublicMetricComparisons(
    metric.id,
    selectedDistrict,
    selectedPeriod,
    initialComparisons
  );
  const timeSeriesQuery = usePublicMetricTimeSeriesSummary(metric.id, initialTimeSeriesSummary);
  
  // Fetch completeness information
  const [completenessDaily, setCompletenessDaily] = useState<DailyCompletenessResponse | null>(null);
  const [completenessLoading, setCompletenessLoading] = useState(false);
  const [completenessStats, setCompletenessStats] = useState<CompletenessStatisticsResponse | null>(null);
  const [cityDetail, setCityDetail] = useState<PublicCityDetail | null>(null);
  useEffect(() => {
    setCompletenessDaily(null);
    setCompletenessStats(null);
    setCompletenessLoading(false);
  }, [metric.id, selectedDistrict]);
  useEffect(() => {
    if (completenessDaily) return;
    setCompletenessLoading(true);
    getPublicMetricCompletenessDaily(metric.id, "day", 90, selectedDistrict)
      .then(setCompletenessDaily)
      .catch((err) => {
        console.warn("Failed to load completeness daily data:", err);
        setCompletenessDaily(null);
      })
      .finally(() => setCompletenessLoading(false));
  }, [metric.id, selectedDistrict, completenessDaily]);
  useEffect(() => {
    if (completenessStats) return;
    getPublicMetricCompletenessStats(metric.id, selectedDistrict)
      .then(setCompletenessStats)
      .catch((err) => {
        console.warn("Failed to load completeness stats:", err);
        setCompletenessStats(null);
      });
  }, [metric.id, selectedDistrict, completenessStats]);
  useEffect(() => {
    if (!metric.city_id) return;
    let mounted = true;
    getPublicCityDetail(metric.city_id)
      .then((detail) => {
        if (mounted) setCityDetail(detail);
      })
      .catch((err) => {
        console.warn("Failed to load city detail:", err);
        if (mounted) setCityDetail(null);
      });
    return () => {
      mounted = false;
    };
  }, [metric.city_id]);

  const comparison = comparisonsQuery.data?.comparisons[selectedPeriod];
  // Consider "loading" if actively fetching OR if we don't have comparison data yet for the selected period
  const isComparisonsLoading = comparisonsQuery.isLoading || comparisonsQuery.isFetching || (!comparisonsQuery.isError && !comparison);
  const isTimeSeriesLoading = timeSeriesQuery.isLoading || timeSeriesQuery.isFetching;

  const currentCalendarYear = new Date().getFullYear();
  const mostRecentYear = metric.most_recent_data_date
    ? new Date(metric.most_recent_data_date).getFullYear()
    : currentCalendarYear;
  const comparisonCurrentYear = comparison?.current_period_end
    ? new Date(comparison.current_period_end).getFullYear()
    : currentCalendarYear;
  const isStale = mostRecentYear < currentCalendarYear || comparisonCurrentYear < currentCalendarYear;

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

  // Year for headers/labels: from comparison period dates when available
  const currentYear =
    comparison?.current_period_end || comparison?.current_period_start
      ? new Date(comparison.current_period_end || comparison.current_period_start!).getFullYear()
      : new Date().getFullYear();
  const priorYear =
    comparison?.comparison_period_end || comparison?.comparison_period_start
      ? new Date(comparison.comparison_period_end || comparison.comparison_period_start!).getFullYear()
      : currentYear - 1;

  const comparisonLabels: Record<typeof selectedPeriod, { previous: string; current: string }> = isStale
    ? {
        ytd: { previous: `Prior year to date (${priorYear})`, current: `Last available year to date (${currentYear})` },
        mtd: { previous: `Prior period (${priorYear})`, current: `Last available period (${currentYear})` },
        mtd_prior_year: { previous: `Prior year (${priorYear})`, current: `Last available year (${currentYear})` },
      }
    : {
        ytd: { previous: "Last Year", current: "This Year" },
        mtd: { previous: "Last Month", current: "This Month" },
        mtd_prior_year: { previous: "Last Year", current: "This Year" },
      };

  const formatValue = (value: number | null | undefined, isLoading?: boolean): string => {
    if (isLoading) return "Loading...";
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

  const formatBreakdownNum = (n: number | null | undefined): string =>
    n != null ? n.toLocaleString(undefined, { maximumFractionDigits: 0 }) : "—";
  const formatBreakdownResult = (r: number | null | undefined, isPct?: boolean): string =>
    r != null ? (isPct ? r.toFixed(1) + "%" : r.toLocaleString(undefined, { maximumFractionDigits: 1 })) : "—";

  const formatDateRange = (start: string | null | undefined, end: string | null | undefined, isLoading?: boolean): string =>
    formatDateRangeFromStrings(start, end, { loading: isLoading });

  const currentPeriodEndFormatted =
    comparison?.current_period_end
      ? new Date(comparison.current_period_end).toLocaleDateString("en-US", {
          month: "long",
          day: "numeric",
          year: "numeric",
          timeZone: "UTC",
        })
      : null;

  // When the metric is stale and the current period value is 0, that means no data has
  // been reported yet (not that the count is literally zero). Suppress the trend in that
  // case so we don't show a misleading "down 100%".
  const currentPeriodIsEmpty = isStale && comparison?.current_period_value === 0;

  const trend = comparison && comparison.current_period_value !== null && comparison.comparison_period_value !== null && !currentPeriodIsEmpty
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

  const resolvedCityName = cityDetail?.name || cityName;
  const locationLabel = selectedDistrict !== null && selectedDistrict > 0
    ? `District ${selectedDistrict}`
    : resolvedCityName;

  // Compute reporting completeness lag: how many trailing days in the completeness data
  // are still "unstable" (i.e., their counts are still changing / not yet fully reported).
  // This reflects how long it typically takes for a day's data to be complete, not just
  // how far behind the publication date is.
  const staleness_days = useMemo(() => {
    if (!completenessDaily?.data || completenessDaily.data.length === 0) return undefined;
    const sorted = [...completenessDaily.data].sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    );
    let lag = 0;
    for (const entry of sorted) {
      if (!entry.is_stable) {
        lag++;
      } else {
        break;
      }
    }
    return lag > 0 ? lag : undefined;
  }, [completenessDaily]);

  const { primaryChartId, yearChartId } = useMemo(
    () =>
      selectPublicMetricCharts(
        timeSeriesQuery.data?.time_series || [],
        selectedDistrict
      ),
    [timeSeriesQuery.data, selectedDistrict]
  );

  const preferredChartId = primaryChartId;

  return (
    <div className="metric-detail-content">
      {/* No data for current period — prominent when metric is stale */}
      {isStale && (
        <div className="metric-detail-stale-banner" role="alert">
          <strong className="metric-detail-stale-banner-title">No data for the current period</strong>
          <p className="metric-detail-stale-banner-text">
            The figures below are prior year to date (through the latest available date). There is no data for {currentCalendarYear} yet.
          </p>
        </div>
      )}

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
        <h2 className="metric-section-title">
          {isStale
            ? `Prior year to date: how have ${metric.metric_name.toLowerCase()} changed in ${locationLabel}?`
            : `How have ${metric.metric_name.toLowerCase()} changed in ${locationLabel} in ${currentYear}?`}
        </h2>
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
          <div className={`comparison-card${isComparisonsLoading ? " loading" : ""}`}>
            <div className="comparison-label">{comparisonLabels[selectedPeriod].previous}</div>
            <div className="comparison-dates">
              {formatDateRange(comparison?.comparison_period_start, comparison?.comparison_period_end, isComparisonsLoading)}
            </div>
            <div className="comparison-value">{formatValue(comparison?.comparison_period_value, isComparisonsLoading)}</div>
            {comparison?.calculation_breakdown && !isComparisonsLoading && (
              <div className="comparison-card-breakdown">
                {comparison.calculation_breakdown.numerator_name} ÷ {comparison.calculation_breakdown.denominator_name}
                <br />
                <span className="comparison-card-breakdown-formula">
                  {formatBreakdownNum(comparison.calculation_breakdown.comparison_period.numerator_value)} ÷ {formatBreakdownNum(comparison.calculation_breakdown.comparison_period.denominator_value)}
                  {comparison.calculation_breakdown.display_unit === "percentage" && " × 100"} = {formatBreakdownResult(comparison.calculation_breakdown.comparison_period.result, comparison.calculation_breakdown.display_unit === "percentage")}
                </span>
              </div>
            )}
            <div className="comparison-unit">{metric.item_noun}</div>
          </div>
          <div className="comparison-vs">→</div>
          {/* Current period on RIGHT */}
          <div className={`comparison-card${isComparisonsLoading ? " loading" : ""}`}>
            <div className="comparison-label">{comparisonLabels[selectedPeriod].current}</div>
            <div className="comparison-dates">
              {formatDateRange(comparison?.current_period_start, comparison?.current_period_end, isComparisonsLoading)}
            </div>
            <div className="comparison-value">{currentPeriodIsEmpty ? "No data" : formatValue(comparison?.current_period_value, isComparisonsLoading)}</div>
            {comparison?.calculation_breakdown && !isComparisonsLoading && !currentPeriodIsEmpty && (
              <div className="comparison-card-breakdown">
                {comparison.calculation_breakdown.numerator_name} ÷ {comparison.calculation_breakdown.denominator_name}
                <br />
                <span className="comparison-card-breakdown-formula">
                  {formatBreakdownNum(comparison.calculation_breakdown.current_period.numerator_value)} ÷ {formatBreakdownNum(comparison.calculation_breakdown.current_period.denominator_value)}
                  {comparison.calculation_breakdown.display_unit === "percentage" && " × 100"} = {formatBreakdownResult(comparison.calculation_breakdown.current_period.result, comparison.calculation_breakdown.display_unit === "percentage")}
                </span>
              </div>
            )}
            {!currentPeriodIsEmpty && <div className="comparison-unit">{metric.item_noun}</div>}
          </div>
        </div>
        {comparison?.calculation_breakdown && !isComparisonsLoading && (
          <div className="metric-calculation-explanation">
            <p>
              This rate is calculated as <strong>{comparison.calculation_breakdown.numerator_name}</strong> divided by <strong>{comparison.calculation_breakdown.denominator_name}</strong>
              {comparison.calculation_breakdown.display_unit === "percentage" && ", then multiplied by 100 for percentage"}.
              Both components use the same date range so the comparison is apples-to-apples.
            </p>
          </div>
        )}
        {trend && !isComparisonsLoading && (
          <div className="comparison-summary">
            {isStale ? (
              <>
                In {locationLabel}, {metric.metric_name.toLowerCase()} {metric.item_noun} (prior year to date) are{" "}
                <span
                  className={
                    trendTone === "neutral"
                      ? "trend-neutral"
                      : trendTone === "good"
                        ? "trend-good"
                        : "trend-bad"
                  }
                >
                  {trend.isIncrease ? "up" : "down"} {Math.round(Math.abs(trend.percent))}%
                </span>{" "}
                {periodDescriptions[selectedPeriod]}. No data for {currentCalendarYear} yet.
              </>
            ) : (
              <>
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
                  {trend.isIncrease ? "up" : "down"} {Math.round(Math.abs(trend.percent))}%
                </span>{" "}
                {periodDescriptions[selectedPeriod]}.
              </>
            )}
          </div>
        )}
      </section>

      {/* YTD Comparison Chart */}
      {preferredChartId && (
        <section className="metric-section metric-chart-section">
          <div style={{ display: "flex", alignItems: "center", gap: "1rem", flexWrap: "wrap" }}>
            <h2 className="metric-section-title" style={{ marginBottom: 0 }}>What are the trends over time?</h2>
            {citySlug && (
              <a
                href={`/c/${citySlug}/metrics/${metric.metric_key}/chart/${preferredChartId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="metric-chart-full-page-link"
              >
                View full page →
              </a>
            )}
          </div>
          {isStale ? (
            <p className="metric-comparison-caption">
              No data for the current period. Trends below are prior year to date (through {metric.most_recent_data_date ? new Date(metric.most_recent_data_date).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" }) : "the latest available date"}).
            </p>
          ) : comparison &&
            comparison.current_period_value !== null &&
            comparison.comparison_period_value !== null &&
            currentPeriodEndFormatted ? (
              <p className="metric-comparison-caption">
                So far in {currentYear}, {metric.metric_name.toLowerCase()} {metric.item_noun} are{" "}
                {formatValue(comparison.current_period_value)}
                {trend ? `, ${trend.isIncrease ? "up" : "down"} by ${Math.round(Math.abs(trend.percent))}%` : ""} from last year&apos;s {formatValue(comparison.comparison_period_value)} to this date of {currentPeriodEndFormatted}.
              </p>
            ) : null}
          {!isStale && staleness_days !== undefined && staleness_days > 0 && (
            <div className="metric-staleness-badge">
              <span className="metric-staleness-icon">⏱</span>
              ~{staleness_days} day{staleness_days !== 1 ? "s" : ""} to fully report — data for the most recent {staleness_days} day{staleness_days !== 1 ? "s" : ""} may still be updating, shown as{" "}
              <span className="metric-staleness-incomplete-label">incomplete</span> on the chart below.
            </div>
          )}
          <div className="metric-chart-container">
            <PublicMetricTimeSeriesChart
              primaryChartId={primaryChartId}
              yearChartId={yearChartId}
              staleness_days={staleness_days}
            />
          </div>
        </section>
      )}

      {/* District Comparison - only show if metric has map_query configured */}
      {metric.map_query && (
        (selectedDistrict === null || selectedDistrict === 0) ? (
          <section className="metric-section">
            <h2 className="metric-section-title">Where are {metric.metric_name.toLowerCase()} highest in {resolvedCityName}?</h2>
            {isStale ? (
              <p className="metric-section-subtitle">Prior year to date (no current-year data)</p>
            ) : comparison?.current_period_start && comparison?.current_period_end ? (
              <p className="metric-section-subtitle">
                {formatDateRange(comparison.current_period_start, comparison.current_period_end)}
              </p>
            ) : null}
            <MetricMapEmbed
              metricId={metric.id}
              selectedPeriod={selectedPeriod}
              height={isMobile ? 280 : 400}
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
            {isStale ? (
              <p className="metric-section-subtitle">Prior year to date (no current-year data)</p>
            ) : comparison?.current_period_start && comparison?.current_period_end ? (
              <p className="metric-section-subtitle">
                {formatDateRange(comparison.current_period_start, comparison.current_period_end)}
              </p>
            ) : null}
            <MetricMapEmbed
              metricId={metric.id}
              selectedPeriod={selectedPeriod}
              height={isMobile ? 280 : 400}
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
        )
      )}

      {/* Delta Map - change by district (citywide view only) */}
      {metric.map_query && (selectedDistrict === null || selectedDistrict === 0) && (() => {
        const comparisonPeriodLabel = {
          ytd: "last year",
          mtd: "last month",
          mtd_prior_year: "same month last year",
        }[selectedPeriod] || "the previous period";
        
        const comparisonSubtitleLabel = {
          ytd: "same period last year",
          mtd: "last month",
          mtd_prior_year: "same month last year",
        }[selectedPeriod] || "the previous period";
        
        return (
          <section className="metric-section">
            <h2 className="metric-section-title">How has {metric.metric_name.toLowerCase()} changed from {comparisonPeriodLabel}?</h2>
            {isStale ? (
              <p className="metric-section-subtitle">Prior year to date comparison (no current-year data)</p>
            ) : comparison?.current_period_start && comparison?.current_period_end ? (
              <p className="metric-section-subtitle">
                Comparing {formatDateRange(comparison.current_period_start, comparison.current_period_end)} to {comparisonSubtitleLabel}
              </p>
            ) : null}
            <DeltaMapView
              metricId={metric.id}
              comparisonType={selectedPeriod}
              greenDirection={metric.greendirection as "up" | "down" | null}
              height={isMobile ? 260 : 350}
              showLink={true}
              currentPeriodEnd={comparison?.current_period_end ?? undefined}
              dateRange={{
                start: comparison?.current_period_start || null,
                end: comparison?.current_period_end || null,
              }}
              comparisonDateRange={{
                start: comparison?.comparison_period_start || null,
                end: comparison?.comparison_period_end || null,
              }}
            />
            <DistrictComparisonTable
              metricId={metric.id}
              comparisonType={selectedPeriod}
              greenDirection={metric.greendirection as "up" | "down" | null}
              itemNoun={metric.item_noun}
              metricName={metric.metric_name}
              cityName={resolvedCityName}
              currentPeriodEnd={comparison?.current_period_end ?? undefined}
              currentPeriodStart={comparison?.current_period_start ?? undefined}
              citywideCurrent={comparison?.current_period_value ?? null}
              citywideComparison={comparison?.comparison_period_value ?? null}
            />
          </section>
        );
      })()}

      {/* Category Breakdown */}
      {metric.category_fields && metric.category_fields.length > 0 && (
        <section className="metric-section">
          <h2 className="metric-section-title">What types of {metric.metric_name.toLowerCase()} are there?</h2>
          <CategoryBreakdown
            metricId={metric.id}
            categoryFields={metric.category_fields}
            timeSeriesSummary={timeSeriesQuery.data ?? undefined}
            currentPeriodStart={comparison?.current_period_start}
            currentPeriodEnd={comparison?.current_period_end}
          />
        </section>
      )}

      {/* About This Data */}
      <section id="about-this-data" className="metric-section metric-definition">
        <h2 className="metric-section-title">About this data</h2>
        
        {/* Data source summary - always visible */}
        <div className="data-source-summary">
          {(() => {
            const portalUrl = cityDetail?.main_portal_url || null;
            const portalDomain = cityDetail?.main_domain || null;
            const datasetName = metric.dataset_name || metric.dataset_title || metric.metric_name;
            const datasetUrl = metric.source_url || metric.data_sf_url;
            const endpointUrl = datasetUrl || (portalUrl && metric.endpoint ? `${portalUrl.replace(/\/$/, "")}/resource/${metric.endpoint}` : null);
            const portalName = (() => {
              if (portalDomain) return portalDomain;
              if (portalUrl) {
                try {
                  return new URL(portalUrl).hostname.replace(/^www\./, "");
                } catch {
                  return portalUrl;
                }
              }
              return null;
            })();
            
            return (
              <div className="provenance-item">
                <h3 className="provenance-label">Source</h3>
                {metric.definition && (
                  <p className="provenance-value">
                    {metric.definition}
                  </p>
                )}
                <p className="provenance-value">
                  This data comes from{" "}
                  {endpointUrl ? (
                    <a
                      href={endpointUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="provenance-link-inline"
                    >
                      {datasetName}
                    </a>
                  ) : (
                    <strong>{datasetName}</strong>
                  )}
                  , a public dataset maintained by {resolvedCityName} on{" "}
                  {portalUrl ? (
                    <a
                      href={portalUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="provenance-link-inline"
                    >
                      {portalName || "the city's open data portal"}
                    </a>
                  ) : (
                    "the city's open data portal"
                  )}
                  .
                </p>
              </div>
            );
          })()}
        </div>

        <div className="metric-definition-extra" style={{ marginTop: "1rem" }}>
            {(metric.earliest_data_date || metric.most_recent_data_date) && (
              <div className="provenance-item">
                <h3 className="provenance-label">Coverage</h3>
                <p className="provenance-value">
                  {metric.earliest_data_date && metric.most_recent_data_date ? (
                    <>
                      From{" "}
                      {new Date(metric.earliest_data_date).toLocaleDateString("en-US", {
                        month: "long",
                        day: "numeric",
                        year: "numeric"
                      })}
                      {" to "}
                      {new Date(metric.most_recent_data_date).toLocaleDateString("en-US", {
                        month: "long",
                        day: "numeric",
                        year: "numeric"
                      })}
                    </>
                  ) : (
                    <>
                      {metric.most_recent_data_date && (
                        <>
                          Most recent: {new Date(metric.most_recent_data_date).toLocaleDateString("en-US", {
                            month: "long",
                            day: "numeric",
                            year: "numeric"
                          })}
                        </>
                      )}
                    </>
                  )}
                  {(metric.last_execution_at || completenessStats?.total_runs !== undefined) && (
                    <>
                      <br />
                      <span style={{ color: "var(--text-secondary)" }}>
                        {metric.last_execution_at
                          ? `Last checked ${new Date(metric.last_execution_at).toLocaleDateString("en-US", {
                              month: "short",
                              day: "numeric",
                              year: "numeric"
                            })}`
                          : "Last checked date unavailable"}
                        {completenessStats?.total_runs !== undefined
                          ? ` · ${completenessStats.total_runs.toLocaleString()} distinct days run`
                          : ""}
                      </span>
                    </>
                  )}
                </p>
              </div>
            )}
            {completenessLoading ? (
              <div className="provenance-item">
                <h3 className="provenance-label">Reporting completeness</h3>
                <div className="provenance-value" style={{ display: "flex", justifyContent: "center", padding: "0.75rem 0" }}>
                  <Loader size="sm" color="dark" />
                </div>
              </div>
            ) : completenessDaily?.data?.length ? (
              <div className="provenance-item">
                <h3 className="provenance-label">Reporting completeness</h3>
                <div className="provenance-value" style={{ display: "flex", justifyContent: "center" }}>
                  <CompletenessSparkline data={completenessDaily.data} height={60} fullWidth />
                </div>
              </div>
            ) : null}
        </div>
      </section>
    </div>
  );
}

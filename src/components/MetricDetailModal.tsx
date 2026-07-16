"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { formatDateRangeFromStrings } from "@/lib/formatters";
import { usePublicMetric, usePublicMetricComparisons, usePublicMetricTimeSeriesSummary } from "@/lib/hooks/usePublicMetric";
import { usePlaceMetricComparisons } from "@/lib/hooks/useMetrics";
import {
  getPublicCityDetail,
  getPublicMetricCompletenessDaily,
  getPublicMetricCompletenessStats,
  type CompletenessStatisticsResponse,
  type DailyCompletenessResponse,
  type PublicCityDetail,
  type PublicMetricComparisons,
} from "@/lib/publicApiClient";
import MetricMapEmbed from "./MetricMapEmbed";
import MetricDistrictChangeSection from "./MetricDistrictChangeSection";
import CategoryBreakdown from "./CategoryBreakdown";
import { slugify } from "@/lib/utils";
import Loader from "./Loader";
import PublicMetricTimeSeriesChart from "./PublicMetricTimeSeriesChart";
import { selectPublicMetricCharts } from "@/lib/selectPublicMetricCharts";
import { computeReportingCompletenessStalenessDays } from "@/lib/computeReportingCompletenessStalenessDays";
import { getMetricAggregationValueField } from "@/lib/metricMapCaptionTotal";
import {
  buildMetricSourceInformation,
  resolveMetricDatasetAttribution,
} from "@/lib/metricDatasetAttribution";
import CompletenessSparkline from "./CompletenessSparkline";
import MetricSourceAttribution from "./MetricSourceAttribution";
import styles from "./MetricsAdmin.module.css";
import "./MetricDetailModal.css";

interface MetricDetailModalProps {
  metricId: number | null;
  cityName: string;
  /** City URL slug (e.g. "san-francisco") for "View full page" chart link. */
  citySlug?: string | null;
  isOpen: boolean;
  onClose: () => void;
  district?: number | null;
  /** When set, comparisons/maps are scoped to this saved place instead of city/district. */
  placeId?: number | null;
  placeLabel?: string | null;
  placeLat?: number | null;
  placeLng?: number | null;
  placeRadiusM?: number | null;
}

export default function MetricDetailModal({
  metricId,
  cityName,
  citySlug,
  isOpen,
  onClose,
  district,
  placeId = null,
  placeLabel = null,
  placeLat = null,
  placeLng = null,
  placeRadiusM = null,
}: MetricDetailModalProps) {
  const [selectedPeriod, setSelectedPeriod] = useState<"ytd" | "mtd" | "mtd_prior_year">("ytd");
  const isPlaceScope = placeId != null;
  const selectedDistrict = isPlaceScope ? null : (district ?? null); // null = citywide, number = specific district

  const metricQuery = usePublicMetric(metricId);
  const publicComparisonsQuery = usePublicMetricComparisons(
    isPlaceScope ? null : metricId,
    selectedDistrict,
    selectedPeriod
  );
  const placeComparisonsQuery = usePlaceMetricComparisons(
    isPlaceScope ? placeId : null,
    isPlaceScope ? metricId : null
  );
  const comparisonsQuery = isPlaceScope ? placeComparisonsQuery : publicComparisonsQuery;
  const timeSeriesQuery = usePublicMetricTimeSeriesSummary(isPlaceScope ? null : metricId);
  const metric = metricQuery.data;
  const mapValueField = useMemo(
    () => (metric ? getMetricAggregationValueField(metric) : null),
    [metric]
  );

  // Fetch completeness information
  const [completenessDaily, setCompletenessDaily] = useState<DailyCompletenessResponse | null>(null);
  const [completenessLoading, setCompletenessLoading] = useState(false);
  const [completenessStats, setCompletenessStats] = useState<CompletenessStatisticsResponse | null>(null);
  const [cityDetail, setCityDetail] = useState<PublicCityDetail | null>(null);

  const datasetAttribution = useMemo(() => {
    if (!metric) return null;
    return buildMetricSourceInformation(metric, {
      portalUrl: cityDetail?.main_portal_url,
      portalDomain: cityDetail?.main_domain,
      cityName: cityDetail?.name || cityName,
    });
  }, [
    metric,
    cityDetail?.main_portal_url,
    cityDetail?.main_domain,
    cityDetail?.name,
    cityName,
  ]);

  useEffect(() => {
    setCompletenessDaily(null);
    setCompletenessStats(null);
    setCompletenessLoading(false);
  }, [metricId, selectedDistrict]);
  useEffect(() => {
    if (!isOpen || !metricId || completenessDaily) return;
    setCompletenessLoading(true);
    getPublicMetricCompletenessDaily(metricId, "day", 90, selectedDistrict)
      .then(setCompletenessDaily)
      .catch((err) => {
        console.warn("Failed to load completeness daily data:", err);
        setCompletenessDaily(null);
      })
      .finally(() => setCompletenessLoading(false));
  }, [isOpen, metricId, selectedDistrict, completenessDaily]);
  useEffect(() => {
    if (!isOpen || !metricId || completenessStats) return;
    getPublicMetricCompletenessStats(metricId, selectedDistrict)
      .then(setCompletenessStats)
      .catch((err) => {
        console.warn("Failed to load completeness stats:", err);
        setCompletenessStats(null);
      });
  }, [isOpen, metricId, selectedDistrict, completenessStats]);
  useEffect(() => {
    if (!metric?.city_id) return;
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
  }, [metric?.city_id]);

  const comparisonsData = comparisonsQuery.data as PublicMetricComparisons | undefined;
  const comparison = comparisonsData?.comparisons?.[selectedPeriod];
  const sourcePeriodStart = comparison?.current_period_start ?? null;
  const sourcePeriodEnd = comparison?.current_period_end ?? null;
  // Consider "loading" if actively fetching OR if we don't have comparison data yet for the selected period
  const isComparisonsLoading = comparisonsQuery.isLoading || comparisonsQuery.isFetching || (!comparisonsQuery.isError && !comparison);
  const isLoading = metricQuery.isLoading;
  const error = metricQuery.error;

  const currentCalendarYear = new Date().getFullYear();
  const mostRecentYear = metric?.most_recent_data_date
    ? new Date(metric.most_recent_data_date).getFullYear()
    : currentCalendarYear;
  const comparisonCurrentYear = comparison?.current_period_end
    ? new Date(comparison.current_period_end).getFullYear()
    : currentCalendarYear;
  const isStale = !!(metric && (mostRecentYear < currentCalendarYear || comparisonCurrentYear < currentCalendarYear));

  const resolvedCityName = cityDetail?.name || cityName;
  const resolvedCitySlug = citySlug ?? slugify(resolvedCityName);
  const metricPath = metric?.metric_key ?? String(metricId);
  const districtParam = selectedDistrict !== null && selectedDistrict > 0 ? `?district=${selectedDistrict}` : "";
  const publicUrl = typeof window !== "undefined" 
    ? `${window.location.origin}/c/${resolvedCitySlug}/metrics/${metricPath}${districtParam}`
    : "";

  const periodLabels: Record<typeof selectedPeriod, string> = {
    ytd: "Year-to-Date Comparison",
    mtd: "Month-to-Date Comparison",
    mtd_prior_year: "This Month vs Last Year",
  };

  const periodButtonLabels: Record<typeof selectedPeriod, string> = {
    ytd: "Year-to-Date",
    mtd: "Month-to-Date",
    mtd_prior_year: "Month vs Last Year",
  };

  const periodDescriptions: Record<typeof selectedPeriod, string> = {
    ytd: "compared to same period last year",
    mtd: "compared to same period last month",
    mtd_prior_year: "compared to same month last year",
  };

  // Dynamic labels for comparison cards; when stale, contextualize as prior year to date
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

  const formatValue = (value: number | null | undefined, loading?: boolean): string => {
    if (loading) return "Loading...";
    if (value === null || value === undefined) return "No data";
    return value.toLocaleString(undefined, { maximumFractionDigits: 0 });
  };

  const formatDateRange = (start: string | null | undefined, end: string | null | undefined, loading?: boolean): string =>
    formatDateRangeFromStrings(start, end, { loading });

  const formatBreakdownNum = (n: number | null | undefined): string =>
    n != null ? n.toLocaleString(undefined, { maximumFractionDigits: 0 }) : "—";
  const formatBreakdownResult = (r: number | null | undefined, isPct?: boolean): string =>
    r != null ? (isPct ? r.toFixed(1) + "%" : r.toLocaleString(undefined, { maximumFractionDigits: 1 })) : "—";

  const currentPeriodEndFormatted =
    comparison?.current_period_end
      ? new Date(comparison.current_period_end).toLocaleDateString("en-US", {
          month: "long",
          day: "numeric",
          year: "numeric",
          timeZone: "UTC",
        })
      : null;

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

  const locationLabel = isPlaceScope
    ? (placeLabel?.trim() || "Your place")
    : selectedDistrict !== null && selectedDistrict > 0
      ? `District ${selectedDistrict}`
      : resolvedCityName;

  const { primaryChartId, yearChartId } = useMemo(
    () =>
      isPlaceScope
        ? { primaryChartId: null as number | null, yearChartId: null as number | null }
        : selectPublicMetricCharts(
            timeSeriesQuery.data?.time_series || [],
            selectedDistrict
          ),
    [isPlaceScope, timeSeriesQuery.data, selectedDistrict]
  );

  const preferredChartId = primaryChartId;

  const staleness_days = useMemo(
    () => computeReportingCompletenessStalenessDays(completenessDaily),
    [completenessDaily]
  );

  const reportingCompletenessHref =
    metric?.metric_key && resolvedCitySlug
      ? `/c/${resolvedCitySlug}/metrics/${metric.metric_key}#reporting-completeness`
      : null;

  const handleShare = async () => {
    if (navigator.share && publicUrl) {
      try {
        await navigator.share({
          title: metric?.metric_name || "Metric Details",
          text: `View detailed data and trends for ${metric?.metric_name}`,
          url: publicUrl,
        });
      } catch (err) {
        // User cancelled or error occurred
      }
    } else if (publicUrl) {
      // Fallback: copy to clipboard
      try {
        await navigator.clipboard.writeText(publicUrl);
        alert("Link copied to clipboard!");
      } catch (err) {
        console.error("Failed to copy link:", err);
      }
    }
  };

  if (!isOpen || !metricId) return null;

  const content = (
    <div className={`${styles.modalOverlay} metric-detail-modal-overlay`} onMouseDown={onClose}>
      <div className={`${styles.modal} metric-detail-modal`} onMouseDown={(e) => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <div className="metric-modal-title-row">
            <button className={`${styles.iconBtn} metric-modal-close-btn`} onClick={onClose} title="Close" aria-label="Close">
              <i className="fas fa-times" />
            </button>
            <div className={styles.modalTitle}>
              {isLoading
                ? "Loading..."
                : error
                  ? "Error"
                  : `${locationLabel} — ${metric?.metric_name || "Metric Details"} in ${currentYear}`}
            </div>
          </div>
        </div>
        <div className={`${styles.modalBody} metric-detail-modal-body`}>
          {isLoading ? (
            <div className={styles.muted} style={{ padding: 16, textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: "1rem" }}>
              <Loader size="md" color="dark" />
              Loading metric details…
            </div>
          ) : error ? (
            <div className={styles.muted} style={{ padding: 16, textAlign: "center", color: "var(--error)" }}>
              <i className="fas fa-exclamation-triangle" style={{ marginRight: "8px" }} />
              Failed to load metric: {error instanceof Error ? error.message : "Unknown error"}
            </div>
          ) : !metric ? (
            <div className={styles.muted} style={{ padding: 16, textAlign: "center" }}>
              Metric not found
            </div>
          ) : (
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

              {/* Share row — place-scoped views are personal; link to citywide public page */}
              <div className="metric-share-row">
                <div className="metric-share-url">
                  <label className="metric-share-label">
                    {isPlaceScope ? "Citywide public page" : "Share this page"}
                  </label>
                  <input
                    className="metric-share-input"
                    value={publicUrl}
                    readOnly
                    onFocus={(e) => e.currentTarget.select()}
                  />
                </div>
                <div className="metric-share-actions">
                  {!isPlaceScope && (
                    <button
                      className={styles.secondaryBtn}
                      onClick={handleShare}
                      title="Share this metric"
                    >
                      <i className="fas fa-share-alt" /> Share
                    </button>
                  )}
                  <button
                    className={styles.secondaryBtn}
                    onClick={() => window.open(`/c/${resolvedCitySlug}/metrics/${metricPath}`, "_blank")}
                    title={isPlaceScope ? "Open citywide public page" : "Open public page"}
                  >
                    <i className="fas fa-external-link-alt" /> Open Page
                  </button>
                </div>
              </div>

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
                    <div className="comparison-value">{formatValue(comparison?.current_period_value, isComparisonsLoading)}</div>
                    {comparison?.calculation_breakdown && !isComparisonsLoading && (
                      <div className="comparison-card-breakdown">
                        {comparison.calculation_breakdown.numerator_name} ÷ {comparison.calculation_breakdown.denominator_name}
                        <br />
                        <span className="comparison-card-breakdown-formula">
                          {formatBreakdownNum(comparison.calculation_breakdown.current_period.numerator_value)} ÷ {formatBreakdownNum(comparison.calculation_breakdown.current_period.denominator_value)}
                          {comparison.calculation_breakdown.display_unit === "percentage" && " × 100"} = {formatBreakdownResult(comparison.calculation_breakdown.current_period.result, comparison.calculation_breakdown.display_unit === "percentage")}
                        </span>
                      </div>
                    )}
                    <div className="comparison-unit">{metric.item_noun}</div>
                  </div>
                </div>
                {/* Prose explanation for derived metrics */}
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

              {/* YTD Comparison Chart — city/district public charts only */}
              {!isPlaceScope && preferredChartId && metric && (
                <section className="metric-section metric-chart-section">
                  <div style={{ display: "flex", alignItems: "center", gap: "1rem", flexWrap: "wrap" }}>
                    <h2 className="metric-section-title" style={{ marginBottom: 0 }}>What are the trends over time?</h2>
                    {resolvedCitySlug && metric.metric_key && (
                      <a
                        href={`/c/${resolvedCitySlug}/metrics/${metric.metric_key}/chart/${preferredChartId}`}
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
                      ~{staleness_days} day{staleness_days !== 1 ? "s" : ""} to fully report — the most recent {staleness_days} day{staleness_days !== 1 ? "s" : ""} may still be updating, shown as a{" "}
                      <span className="metric-staleness-incomplete-label">dotted line</span> on the current-year series (legend: Incomplete data).
                    </div>
                  )}
                  <div className="metric-chart-container">
                    <PublicMetricTimeSeriesChart
                      primaryChartId={primaryChartId}
                      yearChartId={yearChartId}
                      staleness_days={staleness_days}
                      reportingCompletenessHref={reportingCompletenessHref}
                    />
                    <MetricSourceAttribution
                      sourceInfo={datasetAttribution}
                      startDate={sourcePeriodStart}
                      endDate={sourcePeriodEnd}
                    />
                  </div>
                </section>
              )}

              {/* Map — place-scoped uses lat/lng/radius; city/district uses public preview */}
              {metric.map_query &&
                (!isPlaceScope ||
                  (placeLat != null &&
                    placeLng != null &&
                    placeRadiusM != null &&
                    placeRadiusM > 0)) && (
                <section className="metric-section">
                  <h2 className="metric-section-title">
                    {isPlaceScope
                      ? `Where are ${metric.metric_name.toLowerCase()} happening near ${locationLabel}?`
                      : selectedDistrict !== null && selectedDistrict > 0
                        ? `Where are ${metric.metric_name.toLowerCase()} happening in District ${selectedDistrict}?`
                        : `Where are ${metric.metric_name.toLowerCase()} highest in ${resolvedCityName}?`}
                  </h2>
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
                    height={400}
                    showLink={!isPlaceScope}
                    showPeriodSelector={false}
                    district={isPlaceScope ? null : selectedDistrict}
                    placeCircle={
                      isPlaceScope
                        ? { lat: placeLat!, lng: placeLng!, radius_m: placeRadiusM! }
                        : null
                    }
                    placeLabel={isPlaceScope ? placeLabel : null}
                    metricName={metric.metric_name}
                    itemNoun={metric.item_noun}
                    valueField={mapValueField}
                    knownTotal={
                      isPlaceScope && comparison?.current_period_value != null
                        ? comparison.current_period_value
                        : undefined
                    }
                    dateRange={{
                      start: comparison?.current_period_start || null,
                      end: comparison?.current_period_end || null,
                    }}
                    comparisonDateRange={{
                      start: comparison?.comparison_period_start || null,
                      end: comparison?.comparison_period_end || null,
                    }}
                  />
                  <MetricSourceAttribution
                    sourceInfo={datasetAttribution}
                    startDate={sourcePeriodStart}
                    endDate={sourcePeriodEnd}
                  />
                </section>
              )}

              {!isPlaceScope && metric.map_query && (selectedDistrict === null || selectedDistrict === 0) && (
                <MetricDistrictChangeSection
                  metricId={metric.id}
                  metricName={metric.metric_name}
                  cityName={resolvedCityName}
                  itemNoun={metric.item_noun}
                  greenDirection={metric.greendirection as "up" | "down" | null}
                  selectedPeriod={selectedPeriod}
                  isStale={isStale}
                  comparison={comparison}
                  deltaMapHeight={350}
                  sourceInfo={datasetAttribution}
                  sourceStartDate={sourcePeriodStart}
                  sourceEndDate={sourcePeriodEnd}
                />
              )}

              {/* Category Breakdown — city/district only (not place-scoped) */}
              {!isPlaceScope && metric.category_fields && metric.category_fields.length > 0 && (
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
              <section className="metric-section metric-definition">
                <h2 className="metric-section-title">About this data</h2>
                
                {/* Data source summary - always visible */}
                <div className="data-source-summary">
                  {(() => {
                    const portalUrl = cityDetail?.main_portal_url || null;
                    const portalDomain = cityDetail?.main_domain || null;
                    const { datasetName, datasetUrl } = resolveMetricDatasetAttribution(
                      metric,
                      { portalUrl, portalDomain }
                    );
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
                          {datasetName ? (
                            <>
                              This data comes from{" "}
                              {datasetUrl ? (
                                <a
                                  href={datasetUrl}
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
                            </>
                          ) : (
                            <>
                              This data comes from a public dataset maintained by{" "}
                              {resolvedCityName}
                              {portalUrl ? (
                                <>
                                  {" "}
                                  on{" "}
                                  <a
                                    href={portalUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="provenance-link-inline"
                                  >
                                    {portalName || "the city's open data portal"}
                                  </a>
                                </>
                              ) : (
                                " on the city's open data portal"
                              )}
                              .
                            </>
                          )}
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
                    <div id="reporting-completeness">
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
                </div>
              </section>

            </div>
          )}
        </div>
      </div>
    </div>
  );
  if (typeof document !== "undefined" && document.body) {
    return createPortal(content, document.body);
  }
  return content;
}

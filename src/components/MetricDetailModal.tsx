"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { usePublicMetric, usePublicMetricComparisons, usePublicMetricTimeSeriesSummary } from "@/lib/hooks/usePublicMetric";
import {
  getPublicCityDetail,
  getPublicMetricCompletenessDaily,
  getPublicMetricCompletenessStats,
  type CompletenessStatisticsResponse,
  type DailyCompletenessResponse,
  type PublicCityDetail,
} from "@/lib/publicApiClient";
import MetricMapEmbed from "./MetricMapEmbed";
import CategoryBreakdown from "./CategoryBreakdown";
import { slugify } from "@/lib/utils";
import { API_BASE } from "@/lib/apiBase";
import TimeSeriesChart from "./TimeSeriesChart";
import Loader from "./Loader";
import CompletenessSparkline from "./CompletenessSparkline";
import styles from "./MetricsAdmin.module.css";
import "./MetricDetailModal.css";

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

function aggregateTimeSeries(points: PublicTimeSeriesPoint[]): PublicTimeSeriesPoint[] {
  const map = new Map<string, PublicTimeSeriesPoint>();
  points.forEach((point) => {
    const key = `${point.time_period}||${point.group_value ?? ""}`;
    const existing = map.get(key);
    if (existing) {
      existing.numeric_value += point.numeric_value;
    } else {
      map.set(key, {
        time_period: point.time_period,
        numeric_value: point.numeric_value,
        group_value: point.group_value ?? null,
      });
    }
  });
  return Array.from(map.values());
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

interface MetricDetailModalProps {
  metricId: number | null;
  cityName: string;
  isOpen: boolean;
  onClose: () => void;
  district?: number | null;
}

export default function MetricDetailModal({
  metricId,
  cityName,
  isOpen,
  onClose,
  district,
}: MetricDetailModalProps) {
  const [selectedPeriod, setSelectedPeriod] = useState<"ytd" | "mtd" | "mtd_prior_year">("ytd");
  const [definitionExpanded, setDefinitionExpanded] = useState(false);
  const selectedDistrict = district ?? null; // null = citywide, number = specific district

  const metricQuery = usePublicMetric(metricId);
  const comparisonsQuery = usePublicMetricComparisons(
    metricId,
    selectedDistrict,
    selectedPeriod
  );
  const timeSeriesQuery = usePublicMetricTimeSeriesSummary(metricId);
  const metric = metricQuery.data;
  
  // Fetch completeness information
  const [completenessDaily, setCompletenessDaily] = useState<DailyCompletenessResponse | null>(null);
  const [completenessLoading, setCompletenessLoading] = useState(false);
  const [completenessStats, setCompletenessStats] = useState<CompletenessStatisticsResponse | null>(null);
  const [cityDetail, setCityDetail] = useState<PublicCityDetail | null>(null);
  useEffect(() => {
    setCompletenessDaily(null);
    setCompletenessStats(null);
    setCompletenessLoading(false);
  }, [metricId]);
  useEffect(() => {
    if (!metricId || !definitionExpanded || completenessDaily) return;
    setCompletenessLoading(true);
    getPublicMetricCompletenessDaily(metricId, "day", 90)
      .then(setCompletenessDaily)
      .catch((err) => {
        console.warn("Failed to load completeness daily data:", err);
        setCompletenessDaily(null);
      })
      .finally(() => setCompletenessLoading(false));
  }, [metricId, definitionExpanded, completenessDaily]);
  useEffect(() => {
    if (!metricId || !definitionExpanded || completenessStats) return;
    getPublicMetricCompletenessStats(metricId)
      .then(setCompletenessStats)
      .catch((err) => {
        console.warn("Failed to load completeness stats:", err);
        setCompletenessStats(null);
      });
  }, [metricId, definitionExpanded, completenessStats]);
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

  const comparison = comparisonsQuery.data?.comparisons[selectedPeriod];
  const isLoading = metricQuery.isLoading;
  const error = metricQuery.error;

  const resolvedCityName = cityDetail?.name || cityName;
  const citySlug = slugify(resolvedCityName);
  const metricPath = metric?.metric_key ?? String(metricId);
  const districtParam = selectedDistrict !== null && selectedDistrict > 0 ? `?district=${selectedDistrict}` : "";
  const publicUrl = typeof window !== "undefined" 
    ? `${window.location.origin}/c/${citySlug}/metrics/${metricPath}${districtParam}`
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

  // Dynamic labels for comparison cards based on period type
  const comparisonLabels: Record<typeof selectedPeriod, { previous: string; current: string }> = {
    ytd: { previous: "Last Year", current: "This Year" },
    mtd: { previous: "Last Month", current: "This Month" },
    mtd_prior_year: { previous: "Last Year", current: "This Year" },
  };

  const formatValue = (value: number | null | undefined): string => {
    if (value === null || value === undefined) return "No data";
    return value.toLocaleString(undefined, { maximumFractionDigits: 0 });
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
    : resolvedCityName;

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
    // Prefer daily chart for YTD view, then ytd, then month
    const dayChart = candidates.find((item) => item.period_type?.toLowerCase() === "day");
    if (dayChart) return dayChart.chart_id;
    const ytdChart = candidates.find((item) => item.period_type?.toLowerCase() === "ytd");
    if (ytdChart) return ytdChart.chart_id;
    const monthChart = candidates.find((item) => item.period_type?.toLowerCase() === "month");
    return monthChart?.chart_id ?? candidates[0].chart_id;
  }, [timeSeriesQuery.data, selectedDistrict]);

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
        console.log("Share cancelled or failed:", err);
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
    <div className={styles.modalOverlay} onMouseDown={onClose}>
      <div className={`${styles.modal} metric-detail-modal`} onMouseDown={(e) => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <div className="metric-modal-title-row">
            <div className={styles.modalTitle}>
              {isLoading
                ? "Loading..."
                : error
                  ? "Error"
                  : `${locationLabel} — ${metric?.metric_name || "Metric Details"}`}
            </div>
            <button className={`${styles.iconBtn} metric-modal-close-btn`} onClick={onClose} title="Close">
              <i className="fas fa-times" />
            </button>
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
              {/* Share row */}
              <div className="metric-share-row">
                <div className="metric-share-url">
                  <label className="metric-share-label">Share this page</label>
                  <input
                    className="metric-share-input"
                    value={publicUrl}
                    readOnly
                    onFocus={(e) => e.currentTarget.select()}
                  />
                </div>
                <div className="metric-share-actions">
                  <button
                    className={styles.secondaryBtn}
                    onClick={handleShare}
                    title="Share this metric"
                  >
                    <i className="fas fa-share-alt" /> Share
                  </button>
                  <button
                    className={styles.secondaryBtn}
                    onClick={() => window.open(`/c/${citySlug}/metrics/${metricPath}`, "_blank")}
                    title="Open public page"
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
                    year: "numeric",
                    timeZone: "UTC"
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
                      {trend.isIncrease ? "up" : "down"} {Math.round(Math.abs(trend.percent))}%
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
                  <h2 className="metric-section-title">Where are {metric.metric_name.toLowerCase()} highest in {resolvedCityName}?</h2>
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

              {/* Category Breakdown */}
              {metric.category_fields && metric.category_fields.length > 0 && (
                <section className="metric-section">
                  <h2 className="metric-section-title">What types of {metric.metric_name.toLowerCase()} are there?</h2>
                  <CategoryBreakdown metricId={metric.id} categoryFields={metric.category_fields} />
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

                {/* Expand for technical details */}
                <button
                  className="metric-more-btn"
                  onClick={() => setDefinitionExpanded((prev) => !prev)}
                  style={{ marginTop: "1rem" }}
                >
                  {definitionExpanded ? "Hide info" : "More info"}
                </button>

                {/* Expanded technical details */}
                {definitionExpanded && (
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
                                      year: "numeric",
                                      timeZone: "UTC"
                                    })}`
                                  : "Last checked date unavailable"}
                                {completenessStats?.total_runs !== undefined
                                  ? ` · ${completenessStats.total_runs.toLocaleString()} runs`
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
                )}
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

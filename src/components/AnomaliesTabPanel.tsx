"use client";

import { useState } from "react";
import { useCityAnomalies, type AnomalyResult } from "@/lib/hooks/useAnomalies";
import AnomalySparkline from "./AnomalySparkline";
import AnomalyChartModal from "./AnomalyChartModal";
import Loader from "./Loader";
import { MetricLink } from "./MetricLink";
import { slugify } from "@/lib/utils";
import styles from "./AnomaliesTabPanel.module.css";

interface AnomaliesTabPanelProps {
  cityId: number;
  cityName?: string;
  initialDistrict?: number | null;
  onMetricClick?: (metricId: number, district?: number | null) => void;
}

// Helper to format period date range title
function formatPeriodTitle(periodType: string, dateStr: string | null | undefined): string {
  if (!dateStr) return "";
  
  try {
    if (periodType === "month") {
      let year: string, month: string;
      if (/^\d{4}-\d{2}$/.test(dateStr)) {
        [year, month] = dateStr.split("-");
      } else if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
        [year, month] = dateStr.split("-");
      } else {
        const date = new Date(dateStr);
        if (isNaN(date.getTime())) return "";
        year = date.getFullYear().toString();
        month = (date.getMonth() + 1).toString().padStart(2, "0");
      }
      const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", 
                          "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
      const monthNum = parseInt(month);
      if (isNaN(monthNum) || monthNum < 1 || monthNum > 12) return "";
      return `${monthNames[monthNum - 1]} ${year}`;
    } else if (periodType === "week") {
      if (dateStr.includes("-W")) {
        const [year, weekPart] = dateStr.split("-W");
        const weekNum = parseInt(weekPart);
        if (isNaN(weekNum)) return "";
        
        const jan4 = new Date(parseInt(year), 0, 4);
        const jan4Day = jan4.getDay() || 7;
        const daysToMonday = (8 - jan4Day) % 7;
        const week1Monday = new Date(parseInt(year), 0, 4 + daysToMonday);
        const weekStart = new Date(week1Monday);
        weekStart.setDate(weekStart.getDate() + (weekNum - 1) * 7);
        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekEnd.getDate() + 6);
        
        const startMonth = weekStart.toLocaleDateString("en-US", { month: "short" });
        const startDay = weekStart.getDate();
        const endMonth = weekEnd.toLocaleDateString("en-US", { month: "short" });
        const endDay = weekEnd.getDate();
        const yearStr = weekStart.getFullYear();
        
        if (startMonth === endMonth) {
          return `${startMonth} ${startDay}–${endDay}, ${yearStr}`;
        } else {
          return `${startMonth} ${startDay} – ${endMonth} ${endDay}, ${yearStr}`;
        }
      } else {
        const date = new Date(dateStr);
        if (isNaN(date.getTime())) return "";
        
        const day = date.getDay();
        const diff = date.getDate() - day + (day === 0 ? -6 : 1);
        const monday = new Date(date.setDate(diff));
        const sunday = new Date(monday);
        sunday.setDate(sunday.getDate() + 6);
        
        const startMonth = monday.toLocaleDateString("en-US", { month: "short" });
        const startDay = monday.getDate();
        const endMonth = sunday.toLocaleDateString("en-US", { month: "short" });
        const endDay = sunday.getDate();
        const yearStr = monday.getFullYear();
        
        if (startMonth === endMonth) {
          return `${startMonth} ${startDay}–${endDay}, ${yearStr}`;
        } else {
          return `${startMonth} ${startDay} – ${endMonth} ${endDay}, ${yearStr}`;
        }
      }
    } else if (periodType === "day") {
      const date = new Date(dateStr);
      if (isNaN(date.getTime())) return "";
      return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
    } else if (periodType === "year") {
      if (/^\d{4}$/.test(dateStr)) {
        return dateStr;
      }
      const date = new Date(dateStr);
      if (isNaN(date.getTime())) return "";
      return date.getFullYear().toString();
    }
    return "";
  } catch {
    return "";
  }
}

// Human-readable period type for display
function formatPeriodTypeLabel(periodType: string): string {
  const labels: Record<string, string> = {
    day: "Daily",
    week: "Weekly",
    month: "Monthly",
    year: "Yearly",
  };
  return labels[periodType?.toLowerCase()] ?? periodType ?? "";
}

// Get date range info from chart_payload
function getDateRangeInfo(
  chartPayload: Record<string, any> | null | undefined,
  periodType?: string
) {
  if (!chartPayload?.dates || !chartPayload?.periods) {
    return null;
  }

  const dates = chartPayload.dates as string[];
  const periods = chartPayload.periods as string[];
  
  const recentDates: string[] = [];
  const comparisonDates: string[] = [];
  
  dates.forEach((date, idx) => {
    const period = periods[idx];
    if (period === "recent") {
      recentDates.push(date);
    } else if (period === "comparison") {
      comparisonDates.push(date);
    }
  });

  // Recent period display
  let recentDisplay: string | null = null;
  if (recentDates.length > 0) {
    const lastRecent = recentDates[recentDates.length - 1];
    recentDisplay = formatPeriodTitle(periodType || "", lastRecent);
  }

  // Comparison period display (range)
  let comparisonDisplay: string | null = null;
  if (comparisonDates.length > 0) {
    const firstComp = formatPeriodTitle(periodType || "", comparisonDates[0]);
    const lastComp = formatPeriodTitle(periodType || "", comparisonDates[comparisonDates.length - 1]);
    if (firstComp && lastComp) {
      comparisonDisplay = firstComp === lastComp ? firstComp : `${firstComp} – ${lastComp}`;
    }
  }

  return {
    recentDisplay,
    comparisonDisplay,
    comparisonCount: comparisonDates.length,
  };
}

// Calculate sigma (z-score)
function getSigma(anomaly: AnomalyResult): number {
  const stddev = anomaly.stddev;
  if (stddev == null || stddev <= 0) return 0;
  return Math.abs(anomaly.difference ?? 0) / stddev;
}

// Helper to format anomaly display info
function getAnomalyDisplayInfo(anomaly: AnomalyResult) {
  const recentMean = anomaly.recent_mean ?? 0;
  const comparisonMean = anomaly.comparison_mean ?? 0;
  const diff = anomaly.difference ?? (recentMean - comparisonMean);
  const absDiff = Math.abs(diff);
  const isUp = diff > 0;
  const sigma = getSigma(anomaly);
  
  // Percentage change
  const pctChange = anomaly.pct_change ?? (comparisonMean !== 0 ? (diff / comparisonMean) * 100 : 0);

  const greendirection = anomaly.greendirection || "down";
  const isBad = greendirection === "up" ? !isUp : isUp;

  const itemNoun = anomaly.item_noun || "items";
  const displayNoun =
    Math.round(absDiff) === 1
      ? itemNoun
      : itemNoun.endsWith("s")
      ? itemNoun
      : `${itemNoun}s`;

  // District/Citywide - always shown in the badge
  let districtDisplay: string;
  if (anomaly.district === 0 || anomaly.district === null || anomaly.district === undefined) {
    districtDisplay = "Citywide";
  } else {
    districtDisplay = `District ${anomaly.district}`;
  }

  // Group field/value - shown separately if present
  const groupField = anomaly.group_field || null;
  const groupValue = anomaly.group_value || null;

  const metricName = anomaly.metric_name || anomaly.object_name || `Metric ${anomaly.metric_id}`;
  const dateInfo = getDateRangeInfo(anomaly.chart_payload, anomaly.period_type);

  return {
    recentMean,
    comparisonMean,
    diff,
    absDiff,
    isUp,
    isBad,
    sigma,
    pctChange,
    displayNoun,
    districtDisplay,
    groupField,
    groupValue,
    metricName,
    recentDisplay: dateInfo?.recentDisplay,
    comparisonDisplay: dateInfo?.comparisonDisplay,
    comparisonCount: dateInfo?.comparisonCount ?? 0,
  };
}

export default function AnomaliesTabPanel({
  cityId,
  cityName,
  initialDistrict,
  onMetricClick,
}: AnomaliesTabPanelProps) {
  const [selectedAnomalyId, setSelectedAnomalyId] = useState<number | null>(null);

  // Fetch anomalies - display in API order (relevance-ranked)
  const { data: anomaliesData, isLoading, error } = useCityAnomalies(cityId, {
    is_anomaly: true,
    limit: 100,
  });

  const anomalies = anomaliesData?.results ?? [];

  const handleAnomalyClick = (anomaly: AnomalyResult) => {
    if (anomaly.id) setSelectedAnomalyId(anomaly.id);
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h2 className={styles.title}>
          <i className="fas fa-bell" style={{ marginRight: "8px" }} />
          Anomaly Alerts
        </h2>
      </div>

      <div className={styles.content}>
        {isLoading && (
          <div className={styles.loadingContainer}>
            <Loader size="md" color="purple" />
            <span>Loading anomalies...</span>
          </div>
        )}

        {error && !isLoading && (
          <div className={styles.errorContainer}>
            <i className="fas fa-exclamation-triangle" />
            <span>
              Failed to load anomalies:{" "}
              {error instanceof Error ? error.message : "Unknown error"}
            </span>
          </div>
        )}

        {!isLoading && !error && anomalies.length === 0 && (
          <div className={styles.emptyContainer}>
            <i className="fas fa-check-circle" />
            <span>No significant anomalies detected</span>
            <p className={styles.emptySubtext}>
              Anomalies are detected when data significantly deviates from historical patterns.
            </p>
          </div>
        )}

        {!isLoading && !error && anomalies.length > 0 && (
          <div className={styles.anomaliesList}>
            {anomalies.map((anomaly, idx) => {
              const info = getAnomalyDisplayInfo(anomaly);

              return (
                <button
                  key={`${anomaly.id}-${idx}`}
                  type="button"
                  className={styles.anomalyCard}
                  onClick={() => handleAnomalyClick(anomaly)}
                  data-is-bad={info.isBad}
                >
                  {/* Sparkline */}
                  {anomaly.chart_payload && (
                    <div className={styles.sparklineContainer}>
                      <AnomalySparkline
                        chartData={{
                          dates: anomaly.chart_payload.dates || [],
                          values: anomaly.chart_payload.values || [],
                          periods: anomaly.chart_payload.periods || [],
                        }}
                        height={70}
                        width={120}
                        showAverage={true}
                        showAnnotations={true}
                      />
                    </div>
                  )}

                  {/* Info */}
                  <div className={styles.anomalyInfo}>
                    {/* Header: Metric name (+ group if present) + district badge */}
                    <div className={styles.headerRow}>
                      <div className={styles.titleBlock}>
                        {info.groupValue ? (
                          <>
                            {/* Has group: metric name small, group value prominent */}
                            <span className={styles.metricNameSmall}>
                              {cityName ? (
                                <MetricLink
                                  metricId={anomaly.metric_id}
                                  citySlug={slugify(cityName)}
                                  mode="modal"
                                  district={initialDistrict ?? undefined}
                                  onModalOpen={onMetricClick}
                                  className="metric-link-inline"
                                >
                                  {info.metricName}
                                </MetricLink>
                              ) : (
                                info.metricName
                              )}
                            </span>
                            <span className={styles.groupValueLarge}>
                              {info.groupField && <span className={styles.groupFieldLabel}>{info.groupField}: </span>}
                              {info.groupValue}
                            </span>
                          </>
                        ) : (
                          /* No group: metric name prominent */
                          <span className={styles.metricNameLarge}>
                            {cityName ? (
                              <MetricLink
                                metricId={anomaly.metric_id}
                                citySlug={slugify(cityName)}
                                mode="modal"
                                district={initialDistrict ?? undefined}
                                onModalOpen={onMetricClick}
                                className="metric-link-inline"
                              >
                                {info.metricName}
                              </MetricLink>
                            ) : (
                              info.metricName
                            )}
                          </span>
                        )}
                      </div>
                      <span className={styles.districtBadge}>{info.districtDisplay}</span>
                    </div>
                    
                    {/* Row 2: Change summary with sigma */}
                    <div className={styles.changeRow}>
                      <span className={styles.changeAmount} data-is-bad={info.isBad}>
                        <i className={`fas fa-arrow-${info.isUp ? "up" : "down"}`} />
                        {info.isUp ? "+" : "−"}{Math.round(info.absDiff).toLocaleString()} {info.displayNoun}
                      </span>
                      <span className={styles.changeStats}>
                        ({info.isUp ? "+" : ""}{info.pctChange.toFixed(0)}%, {info.sigma.toFixed(1)}σ)
                      </span>
                    </div>

                    {/* Row 3: Period and date ranges */}
                    <div className={styles.dateRow}>
                      <span className={styles.periodBadge}>
                        {formatPeriodTypeLabel(anomaly.period_type)}
                      </span>
                      <span className={styles.dateInfo}>
                        <strong>Recent:</strong> {info.recentDisplay || "—"}
                        {info.comparisonDisplay && (
                          <>
                            {" "}vs <strong>Avg of {info.comparisonCount}:</strong> {info.comparisonDisplay}
                          </>
                        )}
                      </span>
                    </div>

                    {/* Row 4: Numeric comparison */}
                    <div className={styles.statsRow}>
                      <span className={styles.statItem}>
                        <span className={styles.statLabel}>Historic avg:</span>
                        <span className={styles.statValue}>{Math.round(info.comparisonMean).toLocaleString()}</span>
                      </span>
                      <span className={styles.statArrow}>→</span>
                      <span className={styles.statItem}>
                        <span className={styles.statLabel}>Recent:</span>
                        <span className={styles.statValue} data-is-bad={info.isBad}>
                          {Math.round(info.recentMean).toLocaleString()}
                        </span>
                      </span>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      <AnomalyChartModal
        anomalyId={selectedAnomalyId}
        isOpen={selectedAnomalyId !== null}
        onClose={() => setSelectedAnomalyId(null)}
        citySlug={cityName ? slugify(cityName) : undefined}
      />
    </div>
  );
}

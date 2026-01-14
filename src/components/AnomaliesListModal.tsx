"use client";

import { useState, useMemo } from "react";
import { useCityAnomalies, type AnomalyResult } from "@/lib/hooks/useAnomalies";
import AnomalySparkline from "./AnomalySparkline";
import styles from "./AnomaliesListModal.module.css";

interface AnomaliesListModalProps {
  isOpen: boolean;
  onClose: () => void;
  cityId: number;
  initialDistrict?: number | null;
  onAnomalySelect?: (anomaly: AnomalyResult) => void;
}

// Helper to group anomalies by metric
interface AnomalyGroup {
  metricId: number;
  metricName: string;
  itemNoun: string;
  anomalies: AnomalyResult[];
}

function groupAnomaliesByMetric(anomalies: AnomalyResult[]): AnomalyGroup[] {
  const groupMap = new Map<number, AnomalyGroup>();

  anomalies.forEach((anomaly) => {
    const metricId = anomaly.metric_id;
    if (!groupMap.has(metricId)) {
      groupMap.set(metricId, {
        metricId,
        metricName: anomaly.metric_name || anomaly.object_name || `Metric ${metricId}`,
        itemNoun: anomaly.item_noun || "items",
        anomalies: [],
      });
    }
    groupMap.get(metricId)!.anomalies.push(anomaly);
  });

  // Return groups in order of first anomaly appearance
  return Array.from(groupMap.values());
}

// Helper to format period date range title for anomaly lists
function formatPeriodTitle(periodType: string, dateStr: string | null | undefined): string {
  if (!dateStr) return "";
  
  try {
    if (periodType === "month") {
      // Handle month format: "2025-12" or "2025-12-01"
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
      const monthNames = ["January", "February", "March", "April", "May", "June", 
                          "July", "August", "September", "October", "November", "December"];
      const monthNum = parseInt(month);
      if (isNaN(monthNum) || monthNum < 1 || monthNum > 12) return "";
      return `${monthNames[monthNum - 1]} ${year}`;
    } else if (periodType === "week") {
      // Handle ISO week format: "2025-W02" or date string
      if (dateStr.includes("-W")) {
        const [year, weekPart] = dateStr.split("-W");
        const weekNum = parseInt(weekPart);
        if (isNaN(weekNum)) return "";
        
        // Calculate week range (Monday to Sunday)
        const jan4 = new Date(parseInt(year), 0, 4); // Jan 4 is always in week 1
        const jan4Day = jan4.getDay() || 7; // Convert Sunday (0) to 7
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
          return `Week of ${startMonth} ${startDay}-${endDay}, ${yearStr}`;
        } else {
          return `Week of ${startMonth} ${startDay} - ${endMonth} ${endDay}, ${yearStr}`;
        }
      } else {
        // Try to parse as date and calculate week
        const date = new Date(dateStr);
        if (isNaN(date.getTime())) return "";
        
        // Get Monday of the week
        const day = date.getDay();
        const diff = date.getDate() - day + (day === 0 ? -6 : 1); // Adjust when day is Sunday
        const monday = new Date(date.setDate(diff));
        const sunday = new Date(monday);
        sunday.setDate(sunday.getDate() + 6);
        
        const startMonth = monday.toLocaleDateString("en-US", { month: "short" });
        const startDay = monday.getDate();
        const endMonth = sunday.toLocaleDateString("en-US", { month: "short" });
        const endDay = sunday.getDate();
        const yearStr = monday.getFullYear();
        
        if (startMonth === endMonth) {
          return `Week of ${startMonth} ${startDay}-${endDay}, ${yearStr}`;
        } else {
          return `Week of ${startMonth} ${startDay} - ${endMonth} ${endDay}, ${yearStr}`;
        }
      }
    } else if (periodType === "day") {
      const date = new Date(dateStr);
      if (isNaN(date.getTime())) return "";
      return date.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
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

// Helper to get period date from anomaly (checks period_date first, then chart_payload)
function getAnomalyPeriodDate(anomaly: AnomalyResult): string | null {
  // First try period_date field
  if ((anomaly as any).period_date) {
    return (anomaly as any).period_date;
  }
  
  // Then try chart_payload dates
  if (anomaly.chart_payload?.dates && Array.isArray(anomaly.chart_payload.dates)) {
    const dates = anomaly.chart_payload.dates;
    const periods = anomaly.chart_payload.periods;
    
    // Find the most recent "recent" period date
    if (Array.isArray(periods)) {
      for (let i = dates.length - 1; i >= 0; i--) {
        if (periods[i] === "recent" && dates[i]) {
          return dates[i];
        }
      }
    }
    
    // Fallback to last date
    if (dates.length > 0) {
      return dates[dates.length - 1];
    }
  }
  
  return null;
}

// Helper to format anomaly display info
function getAnomalyDisplayInfo(anomaly: AnomalyResult, itemNoun: string) {
  const recentMean = anomaly.recent_mean ?? 0;
  const comparisonMean = anomaly.comparison_mean ?? 0;
  const diff = recentMean - comparisonMean;
  const absDiff = Math.abs(diff);
  const isUp = diff > 0;
  const moreOrFewer = isUp ? "more" : "fewer";

  // Pluralize item noun
  const displayNoun =
    Math.round(absDiff) === 1
      ? itemNoun
      : itemNoun.endsWith("s")
      ? itemNoun
      : `${itemNoun}s`;

  // Get location display
  let locationDisplay = anomaly.group_value || "";
  if (!locationDisplay) {
    if (anomaly.district === 0) {
      locationDisplay = "Citywide";
    } else {
      locationDisplay = `District ${anomaly.district}`;
    }
  }

  const groupFieldLabel = anomaly.group_field || "Location";

  return {
    recentMean,
    comparisonMean,
    diff,
    absDiff,
    isUp,
    moreOrFewer,
    displayNoun,
    locationDisplay,
    groupFieldLabel,
  };
}

export default function AnomaliesListModal({
  isOpen,
  onClose,
  cityId,
  initialDistrict,
  onAnomalySelect,
}: AnomaliesListModalProps) {
  const [districtFilter, setDistrictFilter] = useState<number | null>(
    initialDistrict ?? 0
  );
  const [expandedMetricIds, setExpandedMetricIds] = useState<Set<number>>(
    new Set()
  );

  // Fetch anomalies
  const { data: anomaliesData, isLoading, error } = useCityAnomalies(
    isOpen ? cityId : null,
    {
      district: districtFilter === -1 ? undefined : districtFilter ?? undefined,
      is_anomaly: true,
      limit: 100,
    }
  );

  const anomalies = anomaliesData?.results ?? [];

  // Group anomalies by metric
  const groupedAnomalies = useMemo(
    () => groupAnomaliesByMetric(anomalies),
    [anomalies]
  );

  // Get period title from first anomaly (all anomalies should have same period)
  const periodTitle = useMemo(() => {
    if (anomalies.length === 0) return null;
    const firstAnomaly = anomalies[0];
    const periodDate = getAnomalyPeriodDate(firstAnomaly);
    const anomalyPeriodType = (firstAnomaly as any).period_type || "month";
    return formatPeriodTitle(anomalyPeriodType, periodDate);
  }, [anomalies]);

  const toggleMetricExpanded = (metricId: number) => {
    setExpandedMetricIds((prev) => {
      const next = new Set(prev);
      if (next.has(metricId)) {
        next.delete(metricId);
      } else {
        next.add(metricId);
      }
      return next;
    });
  };

  const handleAnomalyClick = (anomaly: AnomalyResult) => {
    if (onAnomalySelect) {
      onAnomalySelect(anomaly);
    }
  };

  if (!isOpen) return null;

  return (
    <div className={styles.modalOverlay} onMouseDown={onClose}>
      <div className={styles.modal} onMouseDown={(e) => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <div className={styles.modalTitleContainer}>
            <div className={styles.modalTitle}>
              <i className="fas fa-bell" style={{ marginRight: "8px" }} />
              Anomaly Alerts
            </div>
            {periodTitle && (
              <div className={styles.modalSubtitle}>{periodTitle}</div>
            )}
          </div>
          <button className={styles.closeBtn} onClick={onClose} title="Close">
            <i className="fas fa-times" />
          </button>
        </div>

        <div className={styles.modalBody}>
          {/* District Filter */}
          <div className={styles.filterRow}>
            <label className={styles.filterLabel}>Filter by:</label>
            <select
              className={styles.filterSelect}
              value={districtFilter ?? -1}
              onChange={(e) => {
                const val = parseInt(e.target.value, 10);
                setDistrictFilter(val === -1 ? null : val);
              }}
            >
              <option value={0}>Citywide Only</option>
              <option value={-1}>All Districts</option>
              {/* Add more district options dynamically if needed */}
            </select>
          </div>

          {/* Loading State */}
          {isLoading && (
            <div className={styles.loadingContainer}>
              <i className="fas fa-spinner fa-spin" />
              <span>Loading anomalies...</span>
            </div>
          )}

          {/* Error State */}
          {error && !isLoading && (
            <div className={styles.errorContainer}>
              <i className="fas fa-exclamation-triangle" />
              <span>
                Failed to load anomalies:{" "}
                {error instanceof Error ? error.message : "Unknown error"}
              </span>
            </div>
          )}

          {/* Empty State */}
          {!isLoading && !error && anomalies.length === 0 && (
            <div className={styles.emptyContainer}>
              <i className="fas fa-check-circle" />
              <span>No significant anomalies detected</span>
            </div>
          )}

          {/* Anomaly List */}
          {!isLoading && !error && anomalies.length > 0 && (
            <>
              {/* Period Title Header */}
              {periodTitle && (
                <div className={styles.periodTitleHeader}>
                  <h3 className={styles.periodTitle}>{periodTitle}</h3>
                </div>
              )}
              <div className={styles.anomaliesList}>
              {groupedAnomalies.map((group) => {
                const topAnomaly = group.anomalies[0];
                const remainingAnomalies = group.anomalies.slice(1);
                const isExpanded = expandedMetricIds.has(group.metricId);
                const topInfo = getAnomalyDisplayInfo(topAnomaly, group.itemNoun);

                return (
                  <div key={group.metricId} className={styles.metricGroup}>
                    {/* Metric Header */}
                    <div className={styles.metricHeader}>
                      <span className={styles.metricName}>{group.metricName}</span>
                      {remainingAnomalies.length > 0 && (
                        <button
                          className={styles.expandBtn}
                          onClick={() => toggleMetricExpanded(group.metricId)}
                        >
                          {isExpanded
                            ? "Hide"
                            : `+${remainingAnomalies.length} more`}
                          <i
                            className={`fas fa-chevron-${
                              isExpanded ? "up" : "down"
                            }`}
                            style={{ marginLeft: "4px" }}
                          />
                        </button>
                      )}
                    </div>

                    {/* Top Anomaly Card */}
                    <button
                      className={styles.anomalyCard}
                      onClick={() => handleAnomalyClick(topAnomaly)}
                      data-is-positive={topInfo.isUp}
                    >
                      {/* Sparkline Chart */}
                      {topAnomaly.chart_payload && (
                        <div className={styles.sparklineContainer}>
                          <AnomalySparkline
                            chartData={{
                              dates: topAnomaly.chart_payload.dates || [],
                              values: topAnomaly.chart_payload.values || [],
                              periods: topAnomaly.chart_payload.periods || [],
                            }}
                            height={80}
                            width={150}
                            showAverage={true}
                            showAnnotations={true}
                          />
                        </div>
                      )}

                      {/* Anomaly Info */}
                      <div className={styles.anomalyInfo}>
                        <div className={styles.anomalyText}>
                          <i
                            className={`fas fa-arrow-${topInfo.isUp ? "up" : "down"}`}
                            style={{ marginRight: "4px" }}
                          />
                          <strong>
                            {Math.round(topInfo.absDiff).toLocaleString()}
                          </strong>{" "}
                          {topInfo.moreOrFewer} {topInfo.displayNoun} than average
                          for{" "}
                          <strong>{topInfo.locationDisplay}</strong>
                        </div>
                        <div className={styles.anomalyStats}>
                          Historic Avg:{" "}
                          {Math.round(topInfo.comparisonMean).toLocaleString()} |
                          Recent:{" "}
                          {Math.round(topInfo.recentMean).toLocaleString()}
                        </div>
                      </div>
                    </button>

                    {/* Expanded Sub-Anomalies */}
                    {isExpanded && remainingAnomalies.length > 0 && (
                      <div className={styles.subAnomalies}>
                        {remainingAnomalies.map((anomaly, idx) => {
                          const info = getAnomalyDisplayInfo(
                            anomaly,
                            group.itemNoun
                          );
                          return (
                            <button
                              key={anomaly.id ?? idx}
                              className={styles.subAnomalyCard}
                              onClick={() => handleAnomalyClick(anomaly)}
                              data-is-positive={info.isUp}
                            >
                              <i
                                className={`fas fa-arrow-${
                                  info.isUp ? "up" : "down"
                                }`}
                                style={{ marginRight: "6px" }}
                              />
                              <span>
                                <strong>
                                  {Math.round(info.absDiff).toLocaleString()}
                                </strong>{" "}
                                {info.moreOrFewer} {info.displayNoun} for{" "}
                                <strong>{info.locationDisplay}</strong>
                              </span>
                              <span className={styles.subAnomalyStats}>
                                Avg: {Math.round(info.comparisonMean).toLocaleString()}{" "}
                                | Recent: {Math.round(info.recentMean).toLocaleString()}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
              </div>
            </>
          )}
        </div>

        <div className={styles.modalFooter}>
          <button className={styles.secondaryBtn} onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

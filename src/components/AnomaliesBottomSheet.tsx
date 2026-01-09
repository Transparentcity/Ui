"use client";

import { useState, useMemo, useEffect } from "react";
import { createPortal } from "react-dom";
import { useCityAnomalies, type AnomalyResult } from "@/lib/hooks/useAnomalies";
import AnomalySparkline from "./AnomalySparkline";
import styles from "./AnomaliesBottomSheet.module.css";

interface AnomaliesBottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  cityId: number;
  district?: number | null; // Synced with map's selected district
  selectedAnomaly?: AnomalyResult | null;
  onAnomalySelect?: (anomaly: AnomalyResult | null) => void;
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

  return Array.from(groupMap.values());
}

// Helper to format a date string for display
function formatDateForDisplay(dateStr: string): string {
  try {
    // Handle ISO week format: "2025-W02"
    if (dateStr.includes("-W")) {
      const [year, weekPart] = dateStr.split("-W");
      return `Week ${parseInt(weekPart)} of ${year}`;
    }
    // Handle month format: "2025-01"
    if (/^\d{4}-\d{2}$/.test(dateStr)) {
      const [year, month] = dateStr.split("-");
      const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
      return `${monthNames[parseInt(month) - 1]} ${year}`;
    }
    // Handle full date format: "2025-01-08"
    const date = new Date(dateStr);
    if (!isNaN(date.getTime())) {
      return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    }
    return dateStr;
  } catch {
    return dateStr;
  }
}

// Helper to extract date ranges from chart_payload
function getDateRangeInfo(chartPayload: Record<string, any> | null | undefined) {
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

  const recentDate = recentDates.length > 0 
    ? formatDateForDisplay(recentDates[recentDates.length - 1])
    : null;

  let comparisonRange: string | null = null;
  if (comparisonDates.length > 0) {
    const firstComp = formatDateForDisplay(comparisonDates[0]);
    const lastComp = formatDateForDisplay(comparisonDates[comparisonDates.length - 1]);
    if (firstComp === lastComp) {
      comparisonRange = firstComp;
    } else {
      comparisonRange = `${firstComp} – ${lastComp}`;
    }
  }

  return { recentDate, comparisonRange };
}

// Helper to format anomaly display info
function getAnomalyDisplayInfo(anomaly: AnomalyResult, itemNoun?: string) {
  const recentMean = anomaly.recent_mean ?? 0;
  const comparisonMean = anomaly.comparison_mean ?? 0;
  const diff = recentMean - comparisonMean;
  const absDiff = Math.abs(diff);
  const isUp = diff > 0;
  const moreOrFewer = isUp ? "more" : "fewer";

  const noun = itemNoun || anomaly.item_noun || "items";
  const displayNoun =
    Math.round(absDiff) === 1
      ? noun
      : noun.endsWith("s")
      ? noun
      : `${noun}s`;

  let locationDisplay = anomaly.group_value || "";
  if (!locationDisplay) {
    if (anomaly.district === 0) {
      locationDisplay = "Citywide";
    } else {
      locationDisplay = `District ${anomaly.district}`;
    }
  }

  const metricName = anomaly.metric_name || anomaly.object_name || "Metric";
  const dateInfo = getDateRangeInfo(anomaly.chart_payload);

  return {
    recentMean,
    comparisonMean,
    diff,
    absDiff,
    isUp,
    moreOrFewer,
    displayNoun,
    locationDisplay,
    metricName,
    recentDate: dateInfo?.recentDate,
    comparisonRange: dateInfo?.comparisonRange,
  };
}

export default function AnomaliesBottomSheet({
  isOpen,
  onClose,
  cityId,
  district,
  selectedAnomaly,
  onAnomalySelect,
}: AnomaliesBottomSheetProps) {
  const [expandedMetricIds, setExpandedMetricIds] = useState<Set<number>>(
    new Set()
  );
  const [isExpanded, setIsExpanded] = useState(true); // Expanded = show list, collapsed = show single anomaly

  // Fetch anomalies for this city/district (default to weekly)
  const { data: anomaliesData, isLoading, error } = useCityAnomalies(
    isOpen ? cityId : null,
    {
      district: district ?? undefined,
      period_type: "week",
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

  // When an anomaly is selected, collapse the sheet
  useEffect(() => {
    if (selectedAnomaly) {
      setIsExpanded(false);
    }
  }, [selectedAnomaly]);

  // When sheet opens without a selection, expand it
  useEffect(() => {
    if (isOpen && !selectedAnomaly) {
      setIsExpanded(true);
    }
  }, [isOpen, selectedAnomaly]);

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
    setIsExpanded(false);
  };

  const handleExpandClick = () => {
    setIsExpanded(true);
    if (onAnomalySelect) {
      onAnomalySelect(null);
    }
  };

  const handleClose = () => {
    if (onAnomalySelect) {
      onAnomalySelect(null);
    }
    onClose();
  };

  // Don't render on server or if not open
  if (!isOpen || typeof document === "undefined") return null;

  // Get district label for header
  const districtLabel = district === 0 || district === null || district === undefined
    ? "Citywide"
    : `District ${district}`;

  // If collapsed and has selected anomaly, show collapsed view
  if (!isExpanded && selectedAnomaly) {
    const info = getAnomalyDisplayInfo(selectedAnomaly);

    return createPortal(
      <div className={styles.bottomSheet} data-collapsed="true">
        <button
          className={styles.collapsedCard}
          onClick={handleExpandClick}
          data-is-positive={info.isUp}
        >
          {/* Sparkline */}
          {selectedAnomaly.chart_payload && (
            <div className={styles.collapsedSparkline}>
              <AnomalySparkline
                chartData={{
                  dates: selectedAnomaly.chart_payload.dates || [],
                  values: selectedAnomaly.chart_payload.values || [],
                  periods: selectedAnomaly.chart_payload.periods || [],
                }}
                height={50}
                width={100}
                showAverage={false}
                showAnnotations={false}
              />
            </div>
          )}

          {/* Info */}
          <div className={styles.collapsedInfo}>
            <div className={styles.collapsedMetric}>{info.metricName}</div>
            <div className={styles.collapsedText}>
              <i className={`fas fa-arrow-${info.isUp ? "up" : "down"}`} />
              <strong>{Math.round(info.absDiff).toLocaleString()}</strong>{" "}
              {info.moreOrFewer} for {info.locationDisplay}
            </div>
            {info.recentDate && (
              <div className={styles.collapsedDate}>
                {info.recentDate}{info.comparisonRange && ` vs ${info.comparisonRange}`}
              </div>
            )}
          </div>

          {/* Expand button */}
          <div className={styles.collapsedActions}>
            <i className="fas fa-chevron-up" title="Show all anomalies" />
          </div>
        </button>

        {/* Close button */}
        <button className={styles.closeBtn} onClick={handleClose} title="Close">
          <i className="fas fa-times" />
        </button>
      </div>,
      document.body
    );
  }

  // Expanded view - show list
  return createPortal(
    <div className={styles.bottomSheet} data-collapsed="false">
      {/* Handle for drag (visual only) */}
      <div className={styles.dragHandle}>
        <div className={styles.dragBar} />
      </div>

      {/* Header */}
      <div className={styles.header}>
        <div className={styles.headerTitle}>
          <i className="fas fa-bell" style={{ marginRight: "8px" }} />
          Anomalies — {districtLabel}
        </div>
        <button className={styles.closeBtn} onClick={handleClose} title="Close">
          <i className="fas fa-times" />
        </button>
      </div>

      {/* Content */}
      <div className={styles.content}>
        {/* Loading State */}
        {isLoading && (
          <div className={styles.stateContainer}>
            <i className="fas fa-spinner fa-spin" />
            <span>Loading anomalies...</span>
          </div>
        )}

        {/* Error State */}
        {error && !isLoading && (
          <div className={styles.stateContainer} data-error="true">
            <i className="fas fa-exclamation-triangle" />
            <span>
              Failed to load anomalies:{" "}
              {error instanceof Error ? error.message : "Unknown error"}
            </span>
          </div>
        )}

        {/* Empty State */}
        {!isLoading && !error && anomalies.length === 0 && (
          <div className={styles.stateContainer}>
            <i className="fas fa-check-circle" />
            <span>No anomalies detected for {districtLabel}</span>
          </div>
        )}

        {/* Anomaly List */}
        {!isLoading && !error && anomalies.length > 0 && (
          <div className={styles.anomaliesList}>
            {groupedAnomalies.map((group) => {
              const topAnomaly = group.anomalies[0];
              const remainingAnomalies = group.anomalies.slice(1);
              const isGroupExpanded = expandedMetricIds.has(group.metricId);
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
                        {isGroupExpanded
                          ? "Hide"
                          : `+${remainingAnomalies.length} more`}
                        <i
                          className={`fas fa-chevron-${
                            isGroupExpanded ? "up" : "down"
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
                          height={60}
                          width={120}
                          showAverage={true}
                          showAnnotations={false}
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
                        {topInfo.moreOrFewer} {topInfo.displayNoun} for{" "}
                        <strong>{topInfo.locationDisplay}</strong>
                      </div>
                      {topInfo.recentDate && (
                        <div className={styles.dateRange}>
                          {topInfo.recentDate}{topInfo.comparisonRange && ` vs ${topInfo.comparisonRange}`}
                        </div>
                      )}
                      <div className={styles.anomalyStats}>
                        Avg: {Math.round(topInfo.comparisonMean).toLocaleString()} |
                        Recent: {Math.round(topInfo.recentMean).toLocaleString()}
                      </div>
                    </div>
                  </button>

                  {/* Expanded Sub-Anomalies */}
                  {isGroupExpanded && remainingAnomalies.length > 0 && (
                    <div className={styles.subAnomalies}>
                      {remainingAnomalies.map((anomaly, idx) => {
                        const info = getAnomalyDisplayInfo(anomaly, group.itemNoun);
                        return (
                          <button
                            key={anomaly.id ?? idx}
                            className={styles.subAnomalyCard}
                            onClick={() => handleAnomalyClick(anomaly)}
                            data-is-positive={info.isUp}
                          >
                            <i
                              className={`fas fa-arrow-${info.isUp ? "up" : "down"}`}
                              style={{ marginRight: "6px" }}
                            />
                            <span>
                              <strong>
                                {Math.round(info.absDiff).toLocaleString()}
                              </strong>{" "}
                              {info.moreOrFewer} for{" "}
                              <strong>{info.locationDisplay}</strong>
                              {info.recentDate && (
                                <span className={styles.subAnomalyDate}> ({info.recentDate})</span>
                              )}
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
        )}
      </div>
    </div>,
    document.body
  );
}

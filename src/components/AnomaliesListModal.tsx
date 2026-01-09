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
          <div className={styles.modalTitle}>
            <i className="fas fa-bell" style={{ marginRight: "8px" }} />
            Anomaly Alerts
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

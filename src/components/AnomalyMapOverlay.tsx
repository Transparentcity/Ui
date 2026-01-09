"use client";

import { type AnomalyResult } from "@/lib/hooks/useAnomalies";
import AnomalySparkline from "./AnomalySparkline";
import styles from "./AnomalyMapOverlay.module.css";

interface AnomalyMapOverlayProps {
  anomaly: AnomalyResult;
  onClose: () => void;
  onBackToList?: () => void;
}

// Helper to format anomaly display info
function getAnomalyDisplayInfo(anomaly: AnomalyResult) {
  const recentMean = anomaly.recent_mean ?? 0;
  const comparisonMean = anomaly.comparison_mean ?? 0;
  const diff = recentMean - comparisonMean;
  const absDiff = Math.abs(diff);
  const isUp = diff > 0;
  const moreOrFewer = isUp ? "more" : "fewer";

  // Get item noun
  const itemNoun = anomaly.item_noun || "items";
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

  // Get metric name
  const metricName = anomaly.metric_name || anomaly.object_name || "Metric";

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
  };
}

export default function AnomalyMapOverlay({
  anomaly,
  onClose,
  onBackToList,
}: AnomalyMapOverlayProps) {
  const info = getAnomalyDisplayInfo(anomaly);

  return (
    <div className={styles.overlay} data-is-positive={info.isUp}>
      {/* Header with back/close buttons */}
      <div className={styles.header}>
        {onBackToList && (
          <button className={styles.backBtn} onClick={onBackToList}>
            <i className="fas fa-arrow-left" />
            <span>Back to list</span>
          </button>
        )}
        <div className={styles.headerTitle}>{info.metricName}</div>
        <button className={styles.closeBtn} onClick={onClose} title="Close">
          <i className="fas fa-times" />
        </button>
      </div>

      {/* Content */}
      <div className={styles.content}>
        {/* Sparkline Chart */}
        {anomaly.chart_payload && (
          <div className={styles.chartContainer}>
            <AnomalySparkline
              chartData={{
                dates: anomaly.chart_payload.dates || [],
                values: anomaly.chart_payload.values || [],
                periods: anomaly.chart_payload.periods || [],
              }}
              height={100}
              width={180}
              showAverage={true}
              showAnnotations={true}
            />
          </div>
        )}

        {/* Text Info */}
        <div className={styles.infoContainer}>
          <div className={styles.mainText}>
            <i
              className={`fas fa-arrow-${info.isUp ? "up" : "down"}`}
              style={{ marginRight: "6px" }}
            />
            <strong>{Math.round(info.absDiff).toLocaleString()}</strong>{" "}
            {info.moreOrFewer} {info.displayNoun} than average for{" "}
            <strong>{info.locationDisplay}</strong>
          </div>
          <div className={styles.statsText}>
            Historic Avg: {Math.round(info.comparisonMean).toLocaleString()} |
            Recent: {Math.round(info.recentMean).toLocaleString()}
          </div>
        </div>
      </div>
    </div>
  );
}

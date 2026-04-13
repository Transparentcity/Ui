"use client";

import React from "react";
import styles from "./MetricActions.module.css";

interface MetricActionsProps {
  metricId: number;
  onEdit: () => void;
  onViewCharts: () => void;
  onExecute: () => void;
  onDelete: () => void;
  onPurgeData?: () => void;
  onViewAnomalies?: () => void;
  onViewMaps?: () => void;
  compact?: boolean;
}

export default function MetricActions({
  metricId,
  onEdit,
  onViewCharts,
  onExecute,
  onDelete,
  onPurgeData,
  onViewAnomalies,
  onViewMaps,
  compact = false,
}: MetricActionsProps) {
  return (
    <div className={`${styles.actions} ${compact ? styles.actionsCompact : ""}`}>
      <button
        className={styles.iconBtn}
        onClick={(e) => {
          e.stopPropagation();
          onEdit();
        }}
        title="Edit metric"
        aria-label="Edit metric"
      >
        <i className="fas fa-edit" aria-hidden="true" />
      </button>
      <button
        className={styles.iconBtn}
        onClick={(e) => {
          e.stopPropagation();
          onViewCharts();
        }}
        title="Time series charts"
        aria-label="Time series charts"
      >
        <i className="fas fa-chart-line" aria-hidden="true" />
      </button>
      {onViewAnomalies && (
        <button
          className={styles.iconBtn}
          onClick={(e) => {
            e.stopPropagation();
            onViewAnomalies();
          }}
          title="View anomalies"
          aria-label="View anomalies"
        >
          <i className="fas fa-exclamation-triangle" aria-hidden="true" />
        </button>
      )}
      {onViewMaps && (
        <button
          className={styles.iconBtn}
          onClick={(e) => {
            e.stopPropagation();
            onViewMaps();
          }}
          title="View maps"
          aria-label="View maps"
        >
          <i className="fas fa-map-marked-alt" aria-hidden="true" />
        </button>
      )}
      <button
        className={styles.iconBtn}
        onClick={(e) => {
          e.stopPropagation();
          onExecute();
        }}
        title="Execute"
        aria-label="Execute"
      >
        <i className="fas fa-play" aria-hidden="true" />
      </button>
      {onPurgeData && (
        <button
          className={`${styles.iconBtn} ${styles.iconBtnDanger}`}
          onClick={(e) => {
            e.stopPropagation();
            onPurgeData();
          }}
          title="Clear metric data (keep definition)"
          aria-label="Clear metric data"
        >
          <i className="fas fa-eraser" aria-hidden="true" />
        </button>
      )}
      <button
        className={`${styles.iconBtn} ${styles.iconBtnDanger}`}
        onClick={(e) => {
          e.stopPropagation();
          onDelete();
        }}
        title="Delete"
        aria-label="Delete"
      >
        <i className="fas fa-trash" aria-hidden="true" />
      </button>
    </div>
  );
}

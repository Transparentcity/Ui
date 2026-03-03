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
      >
        <i className="fas fa-edit" />
      </button>
      <button
        className={styles.iconBtn}
        onClick={(e) => {
          e.stopPropagation();
          onViewCharts();
        }}
        title="Time series charts"
      >
        <i className="fas fa-chart-line" />
      </button>
      {onViewAnomalies && (
        <button
          className={styles.iconBtn}
          onClick={(e) => {
            e.stopPropagation();
            onViewAnomalies();
          }}
          title="View anomalies"
        >
          <i className="fas fa-exclamation-triangle" />
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
        >
          <i className="fas fa-map-marked-alt" />
        </button>
      )}
      <button
        className={styles.iconBtn}
        onClick={(e) => {
          e.stopPropagation();
          onExecute();
        }}
        title="Execute"
      >
        <i className="fas fa-play" />
      </button>
      {onPurgeData && (
        <button
          className={`${styles.iconBtn} ${styles.iconBtnDanger}`}
          onClick={(e) => {
            e.stopPropagation();
            onPurgeData();
          }}
          title="Clear metric data (keep definition)"
        >
          <i className="fas fa-eraser" />
        </button>
      )}
      <button
        className={`${styles.iconBtn} ${styles.iconBtnDanger}`}
        onClick={(e) => {
          e.stopPropagation();
          onDelete();
        }}
        title="Delete"
      >
        <i className="fas fa-trash" />
      </button>
    </div>
  );
}


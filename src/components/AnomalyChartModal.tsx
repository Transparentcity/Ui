"use client";

import { createPortal } from "react-dom";
import { useAnomalyDetail } from "@/lib/hooks/useAnomalies";
import AnomalyChart from "./AnomalyChart";
import AnomalyInactiveBanner from "./AnomalyInactiveBanner";
import { MetricLink } from "./MetricLink";
import styles from "./MetricsAdmin.module.css";

interface AnomalyChartModalProps {
  anomalyId: number | null;
  isOpen: boolean;
  onClose: () => void;
  citySlug?: string; // City slug for metric detail links
}

export default function AnomalyChartModal({
  anomalyId,
  isOpen,
  onClose,
  citySlug,
}: AnomalyChartModalProps) {
  const anomalyDetailQuery = useAnomalyDetail(anomalyId);
  const anomalyDetail = anomalyDetailQuery.data ?? null;
  const isLoading = anomalyDetailQuery.isLoading;
  const error = anomalyDetailQuery.error;

  if (!isOpen || !anomalyId) return null;

  // Get full view URL
  const fullViewUrl = `/a/${anomalyId}`;

  // Handle opening full view in new tab
  const handleFullView = () => {
    window.open(fullViewUrl, "_blank", "noopener,noreferrer");
  };

  const content = (
    <div className={styles.modalOverlay} onMouseDown={onClose}>
      <div className={styles.modal} onMouseDown={(e) => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <div className={styles.modalTitle}>
            Anomaly Chart
            {anomalyDetail && (
              <span style={{ marginLeft: "8px", fontSize: "0.9em", fontWeight: "normal", color: "var(--text-secondary)" }}>
                {anomalyDetail.object_name || anomalyDetail.metric_name || `Anomaly ${anomalyId}`}
              </span>
            )}
          </div>
          <button className={styles.iconBtn} onClick={onClose} title="Close" aria-label="Close">
            <i className="fas fa-times" />
          </button>
        </div>
        <div className={styles.modalBody}>
          {isLoading ? (
            <div className={styles.muted} style={{ padding: 16, textAlign: "center" }}>
              <i className="fas fa-spinner fa-spin" style={{ marginRight: "8px" }} />
              Loading anomaly chart...
            </div>
          ) : error ? (
            <div className={styles.muted} style={{ padding: 16, textAlign: "center", color: "var(--error-text)" }}>
              <i className="fas fa-exclamation-triangle" style={{ marginRight: "8px" }} />
              Failed to load anomaly chart: {error instanceof Error ? error.message : "Unknown error"}
            </div>
          ) : !anomalyDetail ? (
            <div className={styles.muted} style={{ padding: 16, textAlign: "center" }}>
              Anomaly not found
            </div>
          ) : !anomalyDetail.chart_payload ? (
            <div className={styles.muted} style={{ padding: 16, textAlign: "center" }}>
              No chart data available for this anomaly
            </div>
          ) : (
            <>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 14 }}>
                <div className={styles.muted} style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
                  {anomalyDetail.city_name && (
                    <span>
                      <strong>{anomalyDetail.city_name}</strong>
                      {anomalyDetail.district !== undefined && (
                        <>
                          {anomalyDetail.district === 0 ? " (Citywide)" : `, District ${anomalyDetail.district}`}
                        </>
                      )}
                    </span>
                  )}
                  {!anomalyDetail.city_name && anomalyDetail.district !== undefined && (
                    <span>
                      <strong>{anomalyDetail.district === 0 ? "Citywide" : `District ${anomalyDetail.district}`}</strong>
                    </span>
                  )}
                  {anomalyDetail.period_type && (
                    <>
                      {anomalyDetail.city_name || anomalyDetail.district !== undefined ? (
                        <span> • </span>
                      ) : null}
                      <span>
                        <strong>Period:</strong> {anomalyDetail.period_type}
                      </span>
                    </>
                  )}
                </div>
                <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                  <button
                    className={styles.primaryBtn}
                    onClick={handleFullView}
                    style={{ display: "flex", alignItems: "center", gap: "4px" }}
                  >
                    <i className="fas fa-external-link-alt" /> Full View
                  </button>
                  {citySlug && anomalyDetail.object_id && (
                    <MetricLink
                      metricId={parseInt(anomalyDetail.object_id, 10)}
                      citySlug={citySlug}
                      className={styles.secondaryBtn}
                      style={{ display: "flex", alignItems: "center", gap: "4px" }}
                    >
                      <i className="fas fa-chart-line" /> View Metric Details
                    </MetricLink>
                  )}
                </div>
              </div>

              {anomalyDetail.run_is_active === false && (
                <AnomalyInactiveBanner compact />
              )}

              <div style={{ marginTop: 14 }}>
                <AnomalyChart
                  chartData={{
                    dates: anomalyDetail.chart_payload.dates || [],
                    values: anomalyDetail.chart_payload.values || [],
                    periods: anomalyDetail.chart_payload.periods || [],
                  }}
                  anomaly={{
                    comparison_mean: anomalyDetail.comparison_mean || 0,
                    recent_mean: anomalyDetail.recent_mean || 0,
                    std_dev: anomalyDetail.stddev || 0,
                    percent_change: anomalyDetail.pct_change || 0,
                    period_type: anomalyDetail.period_type || "month",
                  }}
                  metadata={{
                    object_name: anomalyDetail.object_name ?? undefined,
                    field_name: anomalyDetail.metric_name ?? undefined,
                    y_axis_label: undefined,
                    period_type: anomalyDetail.period_type,
                    group_field_name: anomalyDetail.group_field ?? undefined,
                    group_value: anomalyDetail.group_value ?? undefined,
                    city_name: anomalyDetail.city_name ?? undefined,
                    district: anomalyDetail.district,
                    subtitle:
                      (anomalyDetail.chart_payload as { subtitle?: string } | undefined)
                        ?.subtitle ?? undefined,
                  }}
                  height={400}
                />
              </div>

              {/* Additional stats section */}
              <div style={{ marginTop: 16, padding: 12, background: "var(--bg-secondary)", borderRadius: "8px" }}>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: "12px" }}>
                  <div>
                    <div style={{ fontSize: "12px", color: "var(--text-secondary)", marginBottom: "4px" }}>Recent Value</div>
                    <div style={{ fontSize: "16px", fontWeight: 600, color: "var(--text-primary)" }}>
                      {(anomalyDetail.recent_mean || 0).toLocaleString(undefined, {
                        minimumFractionDigits: 0,
                        maximumFractionDigits: 2,
                      })}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: "12px", color: "var(--text-secondary)", marginBottom: "4px" }}>Historical Average</div>
                    <div style={{ fontSize: "16px", fontWeight: 600, color: "var(--text-primary)" }}>
                      {(anomalyDetail.comparison_mean || 0).toLocaleString(undefined, {
                        minimumFractionDigits: 0,
                        maximumFractionDigits: 2,
                      })}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: "12px", color: "var(--text-secondary)", marginBottom: "4px" }}>Difference</div>
                    <div
                      style={{
                        fontSize: "16px",
                        fontWeight: 600,
                        color:
                          (anomalyDetail.recent_mean || 0) > (anomalyDetail.comparison_mean || 0)
                            ? "var(--success-text, #10b981)"
                            : "var(--error-text, #ef4444)",
                      }}
                    >
                      {((anomalyDetail.recent_mean || 0) - (anomalyDetail.comparison_mean || 0) > 0 ? "+" : "")}
                      {((anomalyDetail.recent_mean || 0) - (anomalyDetail.comparison_mean || 0)).toLocaleString(undefined, {
                        minimumFractionDigits: 0,
                        maximumFractionDigits: 2,
                      })}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: "12px", color: "var(--text-secondary)", marginBottom: "4px" }}>% Change</div>
                    <div
                      style={{
                        fontSize: "16px",
                        fontWeight: 600,
                        color: (anomalyDetail.pct_change || 0) > 0 ? "var(--success-text, #10b981)" : "var(--error-text, #ef4444)",
                      }}
                    >
                      {(anomalyDetail.pct_change || 0) > 0 ? "+" : ""}
                      {(anomalyDetail.pct_change || 0).toFixed(2)}%
                    </div>
                  </div>
                  {anomalyDetail.stddev && anomalyDetail.stddev > 0 && (
                    <div>
                      <div style={{ fontSize: "12px", color: "var(--text-secondary)", marginBottom: "4px" }}>Z-Score (σ)</div>
                      <div style={{ fontSize: "16px", fontWeight: 600, color: "var(--text-primary)" }}>
                        {(
                          Math.abs((anomalyDetail.recent_mean || 0) - (anomalyDetail.comparison_mean || 0)) /
                          anomalyDetail.stddev
                        ).toFixed(2)}σ
                      </div>
                    </div>
                  )}
                </div>
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
  if (typeof document !== "undefined" && document.body) {
    return createPortal(content, document.body);
  }
  return content;
}


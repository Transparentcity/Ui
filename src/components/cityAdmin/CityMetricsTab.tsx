"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useAuth0 } from "@auth0/auth0-react";
import {
  getMetricRecordCounts,
  getDefaultExecuteStartDateByPeriod,
  clearCityAdminCache,
} from "@/lib/apiClient";
import {
  useCityMetricOrdering,
  useTemplateInstantiationStatus,
  useInstantiateSingleTemplate,
  useInstantiateAllTemplates,
  useAvailableModels,
} from "@/lib/hooks/useCityAdmin";
import {
  useDeleteMetric,
  useExecuteMetric,
  usePurgeMetricData,
  useUpdateMetric,
  useMetricTimeSeries,
  useMetricTimeSeriesDetail,
  useMetric,
} from "@/lib/hooks/useMetrics";
import { useAnomalies, useAnomalyDetail } from "@/lib/hooks/useAnomalies";
import { useJobWebSocketContext } from "@/contexts/JobWebSocketContext";
import { notifyJobCreated } from "@/lib/useJobWebSocket";
import { pickDefaultModelKey } from "@/lib/modelDefaults";
import MetricEditModal from "@/components/MetricEditModal";
import MetricChartsModal from "@/components/MetricChartsModal";
import MetricMapsModal from "@/components/MetricMapsModal";
import MetricOrderEditor from "@/components/MetricOrderEditor";
import RunAllMetricsModal from "@/components/RunAllMetricsModal";
import StructuringNotesModal from "@/components/StructuringNotesModal";
import TimeSeriesChart from "@/components/TimeSeriesChart";
import AnomalyChart from "@/components/AnomalyChart";
import styles from "./CityMetricsTab.module.css";
import metricStyles from "@/components/MetricsAdmin.module.css";
import cityAdminStyles from "@/components/CityDataAdmin.module.css";

// ─── Types ───────────────────────────────────────────────────────────────────

type MetricSection = "active" | "templates" | "settings" | "cleanup";

interface CityMetric {
  id: number;
  metric_name: string;
  metric_key: string;
  category?: string | null;
  subcategory?: string | null;
  is_active?: boolean;
  show_on_dash?: boolean;
  last_execution_status?: string | null;
  last_execution_at?: string | null;
  most_recent_data_date?: string | null;
  record_counts?: {
    total_active?: number;
    total_inactive?: number;
    active_data_points?: number;
    inactive_data_points?: number;
  } | null;
}

interface TemplateRow {
  template_id: number;
  template_name: string;
  category?: string | null;
  category_slug?: string | null;
  subcategory?: string | null;
  status: string;
  metric_id?: number | null;
}

export interface CityMetricsTabProps {
  cityId: number;
  metrics: any[];
  cityName: string;
  onMetricChange: () => void;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function templateCategorySlug(category?: string | null, apiSlug?: string | null): string {
  if (apiSlug?.trim()) return apiSlug.trim();
  if (!category?.trim()) return "uncategorized";
  return category.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "uncategorized";
}

function formatDate(value?: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("en-US", { timeZone: "UTC" });
}

function citySlugFrom(name?: string): string | null {
  if (!name) return null;
  return name.trim().toLowerCase().replace(/[^a-z0-9\s-]/g, "").replace(/[\s_-]+/g, "-").replace(/^-|-$/g, "");
}

// ─── DrawerChart: inline mini chart inside the detail drawer ─────────────────

function DrawerChart({ metricId }: { metricId: number }) {
  const chartsQuery = useMetricTimeSeries(metricId, { exclude_group_fields: true });
  const [selectedChartId, setSelectedChartId] = useState<number | null>(null);

  const charts = chartsQuery.data?.time_series ?? [];

  // Auto-select best chart: prefer monthly citywide
  useEffect(() => {
    if (!charts.length) return;
    if (selectedChartId && charts.find((c) => c.chart_id === selectedChartId)) return;

    const preferred =
      charts.find((c) => c.period_type === "month" && (c.district === 0 || c.district == null)) ||
      charts.find((c) => c.period_type === "month") ||
      charts.find((c) => c.district === 0 || c.district == null) ||
      charts[0];

    setSelectedChartId(preferred?.chart_id ?? null);
  }, [charts, selectedChartId]);

  const detailQuery = useMetricTimeSeriesDetail(metricId, selectedChartId);
  const detail = detailQuery.data;

  const periodOptions = useMemo(() => {
    const seen = new Set<string>();
    return charts.filter((c) => {
      if (seen.has(c.period_type)) return false;
      seen.add(c.period_type);
      return true;
    });
  }, [charts]);

  if (chartsQuery.isLoading) {
    return (
      <div className={styles.drawerChartPlaceholder}>
        <i className="fas fa-spinner fa-spin" />
        <span>Loading chart…</span>
      </div>
    );
  }

  if (!charts.length) {
    return (
      <div className={styles.drawerChartPlaceholder}>
        <i className="fas fa-chart-line" style={{ fontSize: 24, opacity: 0.3 }} />
        <span>No chart data available</span>
      </div>
    );
  }

  const points = detail?.data ?? [];
  const basePoints = points.filter((p) => !p.group_value || p.group_value === "—");

  // Find the period type of the selected chart for TimeSeriesChart metadata
  const selectedChart = charts.find((c) => c.chart_id === selectedChartId);
  const periodType = selectedChart?.period_type;

  return (
    <>
      {periodOptions.length > 1 && (
        <div className={styles.drawerChartSelector}>
          {periodOptions.map((opt) => (
            <button
              key={opt.chart_id}
              className={`${styles.chartSelectorBtn} ${selectedChartId === opt.chart_id ? styles.chartSelectorBtnActive : ""}`}
              onClick={() => setSelectedChartId(opt.chart_id)}
            >
              {opt.period_type}
            </button>
          ))}
        </div>
      )}
      {detailQuery.isLoading ? (
        <div className={styles.drawerChartPlaceholder}>
          <i className="fas fa-spinner fa-spin" />
        </div>
      ) : basePoints.length ? (
        <TimeSeriesChart
          data={basePoints}
          metadata={{ period_type: periodType }}
          height={200}
          hidePeriodSelector={true}
        />
      ) : (
        <div className={styles.drawerChartPlaceholder}>
          <span>No data points for this series</span>
        </div>
      )}
    </>
  );
}

// ─── AnomaliesModal (inlined, same as CityDataAdmin) ────────────────────────

function AnomaliesModal({
  metricId,
  onClose,
}: {
  metricId: number;
  onClose: () => void;
}) {
  const [periodFilter, setPeriodFilter] = useState<string>("all");
  const [yesNoFilter, setYesNoFilter] = useState<"yes" | "no" | "all">("yes");
  const [selectedPeriodDate, setSelectedPeriodDate] = useState<string | null>(null);
  const [selectedAnomalyId, setSelectedAnomalyId] = useState<number | null>(null);
  const metricQuery = useMetric(metricId);
  const metricData = metricQuery.data ?? null;

  const anomaliesQuery = useAnomalies({
    metric_id: metricId,
    limit: 100,
    ...(periodFilter !== "all" ? { period_type: periodFilter } : {}),
    ...(selectedPeriodDate ? { period_date: selectedPeriodDate } : {}),
    ...(yesNoFilter === "yes" ? { is_anomaly: true } : yesNoFilter === "no" ? { is_anomaly: false } : {}),
  });
  const anomalyDetailQuery = useAnomalyDetail(selectedAnomalyId);

  const anomaliesData = anomaliesQuery.data ?? null;
  const anomalyDetail = anomalyDetailQuery.data ?? null;

  useEffect(() => {
    if (anomaliesQuery.data !== undefined) anomaliesQuery.refetch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [periodFilter, yesNoFilter, selectedPeriodDate]);

  useEffect(() => { setSelectedPeriodDate(null); }, [periodFilter]);

  const getAnomalyRecentDate = (anomaly: any): string | null => {
    const dates = anomaly.chart_payload?.dates;
    const periods = anomaly.chart_payload?.periods;
    if (Array.isArray(periods) && Array.isArray(dates)) {
      for (let i = dates.length - 1; i >= 0; i--) {
        if (periods[i] === "recent" && dates[i]) return dates[i];
      }
    }
    return Array.isArray(dates) && dates.length > 0 ? dates[dates.length - 1] : null;
  };

  const filtered = useMemo(() => {
    let results = anomaliesData?.results ?? [];
    if (periodFilter !== "all") results = results.filter((a: any) => a.period_type === periodFilter);
    return [...results].sort((a: any, b: any) => (getAnomalyRecentDate(b) ?? "").localeCompare(getAnomalyRecentDate(a) ?? ""));
  }, [anomaliesData, periodFilter]);

  const goTo = (dir: 1 | -1) => {
    if (!selectedAnomalyId || !filtered.length) return;
    const idx = filtered.findIndex((a: any) => a.id === selectedAnomalyId);
    const next = (idx + dir + filtered.length) % filtered.length;
    setSelectedAnomalyId(filtered[next]?.id ?? null);
  };

  return createPortal(
    <div className={metricStyles.modalOverlay} onMouseDown={onClose}>
      <div
        className={metricStyles.modal}
        onMouseDown={(e) => e.stopPropagation()}
        style={{ maxWidth: "95vw", width: "1200px" }}
      >
        <div className={metricStyles.modalHeader}>
          <div className={metricStyles.modalTitle}>
            <i className="fas fa-exclamation-triangle" style={{ marginRight: 8, color: "var(--warning-text, #f59e0b)" }} />
            <span className={metricStyles.modalTitleText}>
              Anomaly Detection: {metricData?.metric_name || `Metric ${metricId}`}
              {anomaliesData ? ` (${anomaliesData.count} results)` : ""}
            </span>
          </div>
          <button className={metricStyles.iconBtn} onClick={onClose} title="Close">
            <i className="fas fa-times" />
          </button>
        </div>
        <div className={metricStyles.modalBody}>
          {selectedAnomalyId ? (
            anomalyDetailQuery.isLoading ? (
              <div className={metricStyles.muted} style={{ padding: 16, textAlign: "center" }}>
                <i className="fas fa-spinner fa-spin" style={{ marginRight: 8 }} />Loading…
              </div>
            ) : anomalyDetail ? (
              <>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 14 }}>
                  <button className={metricStyles.secondaryBtn} onClick={() => setSelectedAnomalyId(null)}>
                    <i className="fas fa-arrow-left" /> Back
                  </button>
                  {filtered.length > 1 && (
                    <div style={{ display: "flex", gap: 8 }}>
                      <button className={metricStyles.iconBtn} onClick={() => goTo(-1)} title="Previous">
                        <i className="fas fa-chevron-left" />
                      </button>
                      <span style={{ fontSize: 12, color: "var(--text-secondary)", alignSelf: "center" }}>
                        {filtered.findIndex((a: any) => a.id === selectedAnomalyId) + 1} / {filtered.length}
                      </span>
                      <button className={metricStyles.iconBtn} onClick={() => goTo(1)} title="Next">
                        <i className="fas fa-chevron-right" />
                      </button>
                    </div>
                  )}
                </div>
                {anomalyDetail.chart_payload ? (
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
                      period_type: anomalyDetail.period_type,
                    }}
                    height={400}
                  />
                ) : (
                  <div className={metricStyles.muted} style={{ padding: 16, textAlign: "center" }}>No chart data</div>
                )}
              </>
            ) : null
          ) : (
            <>
              <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
                <select
                  value={yesNoFilter}
                  onChange={(e) => setYesNoFilter(e.target.value as "yes" | "no" | "all")}
                  style={{ padding: "4px 8px", fontSize: 12, border: "1px solid var(--border-primary)", borderRadius: 4, background: "var(--bg-primary)", color: "var(--text-primary)" }}
                >
                  <option value="yes">Anomalies only</option>
                  <option value="no">Non-anomalies only</option>
                  <option value="all">All</option>
                </select>
                <select
                  value={periodFilter}
                  onChange={(e) => setPeriodFilter(e.target.value)}
                  style={{ padding: "4px 8px", fontSize: 12, border: "1px solid var(--border-primary)", borderRadius: 4, background: "var(--bg-primary)", color: "var(--text-primary)" }}
                >
                  <option value="all">All periods</option>
                  <option value="day">Daily</option>
                  <option value="week">Weekly</option>
                  <option value="month">Monthly</option>
                  <option value="year">Yearly</option>
                </select>
              </div>
              {anomaliesQuery.isLoading ? (
                <div className={metricStyles.muted} style={{ padding: 24, textAlign: "center" }}>
                  <i className="fas fa-spinner fa-spin" /> Loading…
                </div>
              ) : filtered.length === 0 ? (
                <div className={metricStyles.muted} style={{ padding: 24, textAlign: "center" }}>No results</div>
              ) : (
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                  <thead>
                    <tr style={{ background: "var(--bg-secondary)" }}>
                      <th style={{ padding: "6px 10px", textAlign: "left" }}>Date</th>
                      <th style={{ padding: "6px 10px", textAlign: "left" }}>Period</th>
                      <th style={{ padding: "6px 10px", textAlign: "right" }}>Change</th>
                      <th style={{ padding: "6px 10px", textAlign: "left" }}>Anomaly</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((a: any) => (
                      <tr
                        key={a.id}
                        style={{ borderBottom: "1px solid var(--border-primary)", cursor: "pointer" }}
                        onClick={() => setSelectedAnomalyId(a.id)}
                      >
                        <td style={{ padding: "6px 10px" }}>{getAnomalyRecentDate(a) ?? "—"}</td>
                        <td style={{ padding: "6px 10px" }}>{a.period_type}</td>
                        <td style={{ padding: "6px 10px", textAlign: "right", color: (a.pct_change ?? 0) > 0 ? "var(--color-success, #22c55e)" : "var(--color-error, #ef4444)", fontWeight: 600 }}>
                          {a.pct_change != null ? `${a.pct_change > 0 ? "+" : ""}${a.pct_change.toFixed(1)}%` : "—"}
                        </td>
                        <td style={{ padding: "6px 10px" }}>{a.is_anomaly ? "Yes" : "No"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}

// ─── ExecuteModal ─────────────────────────────────────────────────────────────

function ExecuteModal({
  metricId,
  onClose,
}: {
  metricId: number;
  onClose: () => void;
}) {
  const [periodType, setPeriodType] = useState("day");
  const [startDate, setStartDate] = useState(() => getDefaultExecuteStartDateByPeriod("day"));
  const [endDate, setEndDate] = useState(() => new Date().toISOString().split("T")[0]);
  const executeMetricMutation = useExecuteMetric();

  const onPeriodChange = (p: string) => {
    setPeriodType(p);
    setStartDate(getDefaultExecuteStartDateByPeriod(p));
  };

  const execute = () => {
    executeMetricMutation.mutate(
      { metricId, payload: { period_type: periodType, start_date: startDate || null, end_date: endDate || null } },
      {
        onSuccess: (res) => {
          notifyJobCreated(res.job_id);
          alert(`Metric execution started.\nJob ID: ${res.job_id}`);
          onClose();
        },
        onError: (err) => {
          alert(err instanceof Error ? err.message : "Failed to execute metric");
        },
      }
    );
  };

  return createPortal(
    <div className={metricStyles.modalOverlay} onClick={onClose}>
      <div className={metricStyles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={metricStyles.modalHeader}>
          <h2>Execute Metric {metricId}</h2>
          <button className={metricStyles.modalClose} onClick={onClose}>×</button>
        </div>
        <div className={metricStyles.modalBody}>
          {(["Period Type", "Start Date", "End Date"] as const).map((label) => (
            <div key={label} style={{ marginBottom: 16 }}>
              <label style={{ display: "block", marginBottom: 8, fontWeight: 500 }}>{label}</label>
              {label === "Period Type" ? (
                <select
                  value={periodType}
                  onChange={(e) => onPeriodChange(e.target.value)}
                  style={{ width: "100%", padding: 8, borderRadius: 4, border: "1px solid var(--border-primary)", background: "var(--bg-primary)", color: "var(--text-primary)" }}
                >
                  <option value="day">Daily</option>
                  <option value="week">Weekly</option>
                  <option value="month">Monthly</option>
                  <option value="year">Yearly</option>
                  <option value="ytd">Year-to-Date</option>
                </select>
              ) : (
                <input
                  type="date"
                  value={label === "Start Date" ? startDate : endDate}
                  onChange={(e) => label === "Start Date" ? setStartDate(e.target.value) : setEndDate(e.target.value)}
                  style={{ width: "100%", padding: 8, borderRadius: 4, border: "1px solid var(--border-primary)", background: "var(--bg-primary)", color: "var(--text-primary)" }}
                />
              )}
            </div>
          ))}
        </div>
        <div className={metricStyles.modalFooter}>
          <button className={metricStyles.secondaryBtn} onClick={onClose}>Cancel</button>
          <button className={metricStyles.primaryBtn} onClick={execute} disabled={executeMetricMutation.isPending}>
            <i className="fas fa-play" /> Execute
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

// ─── MetricDetailDrawer ───────────────────────────────────────────────────────

interface DrawerProps {
  metric: CityMetric;
  cityName: string;
  onClose: () => void;
  onSettings: () => void;
  onCharts: () => void;
  onMaps: () => void;
  onAnomalies: () => void;
  onExecute: () => void;
  onDeactivate: () => void;
  onDelete: () => void;
  deactivating?: boolean;
  deleting?: boolean;
}

function MetricDetailDrawer({
  metric,
  cityName,
  onClose,
  onSettings,
  onCharts,
  onMaps,
  onAnomalies,
  onExecute,
  onDeactivate,
  onDelete,
  deactivating,
  deleting,
}: DrawerProps) {
  const isActive = metric.is_active !== false;
  const isSuccess = metric.last_execution_status === "completed" || metric.last_execution_status === "success";
  const isFailure = ["failed", "failure", "error"].includes(metric.last_execution_status ?? "");

  return (
    <>
      <div className={styles.drawerBackdrop} onClick={onClose} />
      <div className={styles.drawer} role="complementary" aria-label={`Details for ${metric.metric_name}`}>
        {/* Header */}
        <div className={styles.drawerHeader}>
          <div className={styles.drawerTitle}>
            <p className={styles.drawerMetricName}>{metric.metric_name}</p>
            <div className={styles.drawerMetricMeta}>
              <span className={styles.drawerMetricKey}>{metric.metric_key}</span>
              {metric.category && (
                <span className={styles.drawerBadge}>{metric.category}</span>
              )}
              {!isActive && (
                <span className={`${styles.drawerBadge}`} style={{ borderColor: "var(--color-error, #ef4444)", color: "var(--color-error, #ef4444)" }}>
                  Inactive
                </span>
              )}
            </div>
          </div>
          <button className={styles.drawerCloseBtn} onClick={onClose} aria-label="Close drawer">
            ×
          </button>
        </div>

        <div className={styles.drawerBody}>
          {/* Inline chart */}
          <div className={styles.drawerChartSection}>
            <div className={styles.drawerChartHeader}>
              <span className={styles.drawerSectionLabel}>Time Series</span>
              <button className={styles.actionBtn} style={{ fontSize: 11, padding: "3px 10px" }} onClick={onCharts}>
                <i className="fas fa-expand-alt" /> Full charts
              </button>
            </div>
            <DrawerChart metricId={metric.id} />
          </div>

          {/* Key facts */}
          <div className={styles.drawerFactsSection}>
            <div className={styles.drawerSectionLabel} style={{ marginBottom: 8 }}>Details</div>
            <div className={styles.drawerFactsGrid}>
              <div className={styles.drawerFact}>
                <span className={styles.drawerFactLabel}>Metric ID</span>
                <span className={`${styles.drawerFactValue} ${styles.drawerFactValueMono}`}>{metric.id}</span>
              </div>
              <div className={styles.drawerFact}>
                <span className={styles.drawerFactLabel}>Last data date</span>
                <span className={styles.drawerFactValue}>{formatDate(metric.most_recent_data_date)}</span>
              </div>
              <div className={styles.drawerFact}>
                <span className={styles.drawerFactLabel}>Last run</span>
                <span className={styles.drawerFactValue}>
                  {metric.last_execution_at ? (
                    <>
                      <span
                        className={`${styles.statusDot} ${isSuccess ? styles.statusSuccess : isFailure ? styles.statusFailed : styles.statusNone}`}
                      />
                      {formatDate(metric.last_execution_at)}
                    </>
                  ) : (
                    "Never"
                  )}
                </span>
              </div>
              <div className={styles.drawerFact}>
                <span className={styles.drawerFactLabel}>Status</span>
                <span className={styles.drawerFactValue}>
                  {metric.last_execution_status ?? "—"}
                </span>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className={styles.drawerActionsSection}>
            <button className={`${styles.actionBtn} ${styles.actionBtnPrimary}`} onClick={onSettings}>
              <i className="fas fa-cog" /> Settings
            </button>
            <button className={styles.actionBtn} onClick={onMaps}>
              <i className="fas fa-map" /> Maps
            </button>
            <button className={styles.actionBtn} onClick={onAnomalies}>
              <i className="fas fa-exclamation-triangle" /> Anomalies
            </button>
            <button className={styles.actionBtn} onClick={onExecute}>
              <i className="fas fa-play" /> Execute
            </button>
            <button
              className={`${styles.actionBtn} ${styles.actionBtnWarning}`}
              onClick={onDeactivate}
              disabled={deactivating}
              title={isActive ? "Deactivate this metric" : "Reactivate this metric"}
            >
              {isActive ? (
                <><i className="fas fa-pause" /> Deactivate</>
              ) : (
                <><i className="fas fa-check" /> Reactivate</>
              )}
            </button>
            <button
              className={`${styles.actionBtn} ${styles.actionBtnDanger}`}
              onClick={onDelete}
              disabled={deleting}
            >
              <i className="fas fa-trash" /> Delete
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function CityMetricsTab({
  cityId,
  metrics: rawMetrics,
  cityName,
  onMetricChange,
}: CityMetricsTabProps) {
  const { getAccessTokenSilently } = useAuth0();
  const [isClient, setIsClient] = useState(false);
  useEffect(() => setIsClient(true), []);

  const metrics = (rawMetrics ?? []) as CityMetric[];

  // ── Section switcher ──────────────────────────────────────────────────────
  const [section, setSection] = useState<MetricSection>("active");

  // ── Shared data hooks ─────────────────────────────────────────────────────
  const { data: orderingData } = useCityMetricOrdering(cityId);
  const { data: availableModelsData } = useAvailableModels();
  const templateStatusQuery = useTemplateInstantiationStatus(cityId);
  const instantiateSingleMutation = useInstantiateSingleTemplate();
  const instantiateAllMutation = useInstantiateAllTemplates();
  const { jobs } = useJobWebSocketContext();

  // ── Metric mutations ─────────────────────────────────────────────────────
  const deleteMetricMutation = useDeleteMetric();
  const updateMetricMutation = useUpdateMetric();
  const purgeMetricMutation = usePurgeMetricData();

  // ── Modals state ──────────────────────────────────────────────────────────
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editModalMetricId, setEditModalMetricId] = useState<number | null>(null);
  const [chartsOpen, setChartsOpen] = useState(false);
  const [chartsMetricId, setChartsMetricId] = useState<number | null>(null);
  const [mapsOpen, setMapsOpen] = useState(false);
  const [mapsMetricId, setMapsMetricId] = useState<number | null>(null);
  const [executeOpen, setExecuteOpen] = useState(false);
  const [executeMetricId, setExecuteMetricId] = useState<number | null>(null);
  const [anomaliesOpen, setAnomaliesOpen] = useState(false);
  const [anomaliesMetricId, setAnomaliesMetricId] = useState<number | null>(null);
  const [runAllOpen, setRunAllOpen] = useState(false);

  // ── Detail drawer ─────────────────────────────────────────────────────────
  const [drawerMetricId, setDrawerMetricId] = useState<number | null>(null);
  const drawerMetric = useMemo(() => metrics.find((m) => m.id === drawerMetricId) ?? null, [metrics, drawerMetricId]);

  // ── Active section state ──────────────────────────────────────────────────
  const [search, setSearch] = useState("");
  const [metricSort, setMetricSort] = useState<"asc" | "desc" | null>(null);

  // ── Template section state ────────────────────────────────────────────────
  const [templateShowAll, setTemplateShowAll] = useState(false);
  const [templateModelKey, setTemplateModelKey] = useState("");
  const [showRunAllTemplatesModal, setShowRunAllTemplatesModal] = useState(false);
  const [runningSingleJobByTemplateId, setRunningSingleJobByTemplateId] = useState<Record<number, string>>({});
  const [runningAllJobId, setRunningAllJobId] = useState<string | null>(null);
  const [structuringNotesTarget, setStructuringNotesTarget] = useState<{ metricId?: number | null; templateId: number } | null>(null);

  // ── Cleanup section state ─────────────────────────────────────────────────
  const [recordCounts, setRecordCounts] = useState<Record<number, any> | null>(null);
  const [loadingRecordCounts, setLoadingRecordCounts] = useState(false);
  const [bulkDeleteConfirm, setBulkDeleteConfirm] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);

  // ── Default template model ────────────────────────────────────────────────
  useEffect(() => {
    if (availableModelsData?.length && !templateModelKey) {
      const key = pickDefaultModelKey(availableModelsData);
      if (key) setTemplateModelKey(key);
    }
  }, [availableModelsData, templateModelKey]);

  // ── Template job completion watcher ──────────────────────────────────────
  useEffect(() => {
    const terminal = new Set(["completed", "failed", "cancelled"]);
    if (runningAllJobId && jobs?.some((j) => j.job_id === runningAllJobId && terminal.has(j.status))) {
      setRunningAllJobId(null);
      templateStatusQuery.refetch();
    }
    const stillRunning = { ...runningSingleJobByTemplateId };
    let changed = false;
    Object.entries(stillRunning).forEach(([idStr, jid]) => {
      const j = jobs?.find((x) => x.job_id === jid);
      if (j && terminal.has(j.status)) {
        delete stillRunning[Number(idStr)];
        changed = true;
      }
    });
    if (changed) {
      setRunningSingleJobByTemplateId(stillRunning);
      templateStatusQuery.refetch();
    }
  }, [jobs, runningAllJobId, runningSingleJobByTemplateId, templateStatusQuery]);

  // ── Auto-load record counts when entering cleanup section ─────────────────
  useEffect(() => {
    if (section !== "cleanup" || recordCounts || loadingRecordCounts) return;
    (async () => {
      try {
        setLoadingRecordCounts(true);
        const token = await getAccessTokenSilently();
        const res = await getMetricRecordCounts(cityId, token);
        setRecordCounts(res.counts);
      } catch {
        // silently fail — cleanup still works without counts
      } finally {
        setLoadingRecordCounts(false);
      }
    })();
  }, [section, cityId, recordCounts, loadingRecordCounts, getAccessTokenSilently]);

  // ── Derived data ──────────────────────────────────────────────────────────

  const orderingMap = useMemo(() => {
    const map = new Map<number, { categoryOrder: number; metricOrder: number; categoryName: string }>();
    orderingData?.orderings?.forEach((o) => {
      if (o.metric_id) {
        map.set(o.metric_id, { categoryOrder: o.category_order, metricOrder: o.metric_order, categoryName: o.category_name });
      }
    });
    return map;
  }, [orderingData]);

  const dashboardMetrics = useMemo(() => metrics.filter((m) => m.show_on_dash === true), [metrics]);

  const activeMetrics = useMemo(() => metrics.filter((m) => m.is_active !== false), [metrics]);

  const inactiveMetrics = useMemo(() => metrics.filter((m) => m.is_active === false), [metrics]);

  const noDataActiveMetrics = useMemo(
    () => activeMetrics.filter((m) => !m.most_recent_data_date),
    [activeMetrics]
  );

  const metricNameById = useMemo(() => {
    const map = new Map<number, string>();
    metrics.forEach((m) => map.set(m.id, m.metric_name));
    return map;
  }, [metrics]);

  const sortedTemplates = useMemo(() => {
    const raw = templateStatusQuery.data?.templates ?? [];
    return [...raw].sort((a, b) => {
      const slugCmp = templateCategorySlug(a.category, (a as TemplateRow).category_slug).localeCompare(
        templateCategorySlug(b.category, (b as TemplateRow).category_slug),
        undefined,
        { sensitivity: "base" }
      );
      if (slugCmp !== 0) return slugCmp;
      const catCmp = (a.category ?? "").localeCompare(b.category ?? "", undefined, { sensitivity: "base" });
      if (catCmp !== 0) return catCmp;
      const subCmp = (a.subcategory ?? "").localeCompare(b.subcategory ?? "", undefined, { sensitivity: "base" });
      if (subCmp !== 0) return subCmp;
      return a.template_name.localeCompare(b.template_name, undefined, { sensitivity: "base" });
    });
  }, [templateStatusQuery.data?.templates]);

  const notInstantiatedCount = useMemo(
    () => sortedTemplates.filter((t) => t.status !== "instantiated").length,
    [sortedTemplates]
  );

  const visibleTemplates = useMemo(
    () => (templateShowAll ? sortedTemplates : sortedTemplates.filter((t) => t.status !== "instantiated")),
    [sortedTemplates, templateShowAll]
  );

  // Grouped active metrics with search + sort
  const groupedActiveMetrics = useMemo(() => {
    const lastDataDateKey = (m: CityMetric) => m.most_recent_data_date ? new Date(m.most_recent_data_date).getTime() : 0;

    let filtered = activeMetrics;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      filtered = filtered.filter((m) => m.metric_name.toLowerCase().includes(q) || m.metric_key.toLowerCase().includes(q));
    }

    const grouped: Record<string, { metrics: (CityMetric & { metricOrder: number })[]; categoryOrder: number }> = {};
    filtered.forEach((metric) => {
      const ordering = orderingMap.get(metric.id);
      const category = ordering?.categoryName || metric.category || "Uncategorized";
      const categoryOrder = ordering?.categoryOrder ?? 1000;
      const metricOrder = ordering?.metricOrder ?? 1000;
      if (!grouped[category]) grouped[category] = { metrics: [], categoryOrder };
      grouped[category].categoryOrder = Math.min(grouped[category].categoryOrder, categoryOrder);
      grouped[category].metrics.push({ ...metric, metricOrder });
    });

    const sortedCats = Object.keys(grouped).sort((a, b) => {
      const diff = grouped[a].categoryOrder - grouped[b].categoryOrder;
      return diff !== 0 ? diff : a.localeCompare(b);
    });

    sortedCats.forEach((cat) => {
      grouped[cat].metrics.sort((a, b) => {
        if (metricSort === "desc") {
          const tA = a.last_execution_at ? new Date(a.last_execution_at).getTime() : 0;
          const tB = b.last_execution_at ? new Date(b.last_execution_at).getTime() : 0;
          return tB - tA;
        }
        if (metricSort === "asc") {
          const tA = a.last_execution_at ? new Date(a.last_execution_at).getTime() : 0;
          const tB = b.last_execution_at ? new Date(b.last_execution_at).getTime() : 0;
          return tA - tB;
        }
        const dA = lastDataDateKey(a);
        const dB = lastDataDateKey(b);
        if (dB !== dA) return dB - dA;
        return a.metricOrder !== b.metricOrder ? a.metricOrder - b.metricOrder : a.metric_name.localeCompare(b.metric_name);
      });
    });

    return { sortedCats, grouped };
  }, [activeMetrics, search, metricSort, orderingMap]);

  // ── Handlers ──────────────────────────────────────────────────────────────

  const openEditModal = (metricId: number) => { setEditModalMetricId(metricId); setEditModalOpen(true); };
  const closeEditModal = () => { setEditModalOpen(false); setEditModalMetricId(null); };

  const openCharts = (metricId: number) => { setChartsMetricId(metricId); setChartsOpen(true); };
  const closeCharts = () => { setChartsOpen(false); setChartsMetricId(null); };

  const openMaps = (metricId: number) => { setMapsMetricId(metricId); setMapsOpen(true); };
  const closeMaps = () => { setMapsOpen(false); setMapsMetricId(null); };

  const openExecute = (metricId: number) => { setExecuteMetricId(metricId); setExecuteOpen(true); };
  const closeExecute = () => { setExecuteOpen(false); setExecuteMetricId(null); };

  const openAnomalies = (metricId: number) => { setAnomaliesMetricId(metricId); setAnomaliesOpen(true); };
  const closeAnomalies = () => { setAnomaliesOpen(false); setAnomaliesMetricId(null); };

  // The city admin payload (including its metrics) is cached client-side for
  // 60s in apiClient; clear it before refetching or mutations appear to no-op.
  const refreshMetrics = () => {
    clearCityAdminCache(cityId);
    onMetricChange();
  };

  const handleDelete = (metricId: number) => {
    if (!confirm("Delete this metric and all its data? This cannot be undone.")) return;
    deleteMetricMutation.mutate(metricId, {
      onSuccess: (res) => {
        alert(res.message || `Deleted metric ${metricId}`);
        if (drawerMetricId === metricId) setDrawerMetricId(null);
        refreshMetrics();
      },
      onError: (err) => alert(err instanceof Error ? err.message : "Failed to delete metric"),
    });
  };

  const handleDeactivate = (metric: CityMetric) => {
    const nextActive = metric.is_active === false; // toggle
    if (!nextActive) {
      const ok = confirm(
        `Deactivate "${metric.metric_name}"?\n\nIt will be hidden from the public dashboard and excluded from scheduled runs. Its data is kept, and you can reactivate it any time from the Inactive & Cleanup tab.`
      );
      if (!ok) return;
    }
    updateMetricMutation.mutate(
      { metricId: metric.id, payload: { is_active: nextActive } },
      {
        onSuccess: () => {
          refreshMetrics();
          if (drawerMetricId === metric.id) setDrawerMetricId(null);
          alert(
            nextActive
              ? `"${metric.metric_name}" reactivated. It is back in the Metrics tab.`
              : `"${metric.metric_name}" deactivated. You can find it in the Inactive & Cleanup tab.`
          );
        },
        onError: (err) => alert(err instanceof Error ? err.message : "Failed to update metric"),
      }
    );
  };

  const handlePurge = (metricId: number) => {
    if (!confirm("Purge all data for this metric? The definition will be kept.")) return;
    purgeMetricMutation.mutate({ metricId }, {
      onSuccess: (res: any) => {
        alert(res.message || "Data purged");
        refreshMetrics();
      },
      onError: (err) => alert(err instanceof Error ? err.message : "Failed to purge metric data"),
    });
  };

  const handleBulkDeleteInactive = async () => {
    setBulkDeleting(true);
    setBulkDeleteConfirm(false);
    const toDelete = [...inactiveMetrics];
    let deleted = 0;
    let failed = 0;
    for (const m of toDelete) {
      try {
        await deleteMetricMutation.mutateAsync(m.id);
        deleted++;
      } catch {
        failed++;
      }
    }
    setBulkDeleting(false);
    alert(`Deleted ${deleted} metric${deleted !== 1 ? "s" : ""}.${failed > 0 ? ` ${failed} failed — check console.` : ""}`);
    refreshMetrics();
  };

  // ── Helpers for drawer ────────────────────────────────────────────────────

  const openDrawer = (metricId: number) => setDrawerMetricId(metricId);
  const closeDrawer = () => setDrawerMetricId(null);

  const chartsMetricKey = useMemo(
    () => (chartsMetricId ? metrics.find((m) => m.id === chartsMetricId)?.metric_key ?? null : null),
    [chartsMetricId, metrics]
  );

  // ── Badge counts ──────────────────────────────────────────────────────────
  const cleanupCount = inactiveMetrics.length + noDataActiveMetrics.length;

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div>
      {/* Section switcher */}
      <nav className={styles.sectionNav} aria-label="Metrics sections">
        {(
          [
            { key: "active" as MetricSection, label: "Metrics", badge: null as number | null, badgeWarning: false },
            { key: "templates" as MetricSection, label: "Templates", badge: notInstantiatedCount > 0 ? notInstantiatedCount : null, badgeWarning: false },
            { key: "settings" as MetricSection, label: "Display Settings", badge: null as number | null, badgeWarning: false },
            { key: "cleanup" as MetricSection, label: "Inactive & Cleanup", badge: cleanupCount > 0 ? cleanupCount : null, badgeWarning: true },
          ]
        ).map(({ key, label, badge, badgeWarning }) => (
          <button
            key={key}
            className={`${styles.sectionBtn} ${section === key ? styles.sectionBtnActive : ""}`}
            onClick={() => setSection(key as MetricSection)}
            aria-current={section === key ? "true" : undefined}
          >
            {label}
            {badge != null && (
              <span className={`${styles.sectionBadge} ${badgeWarning ? styles.sectionBadgeWarning : ""}`}>
                {badge}
              </span>
            )}
          </button>
        ))}
      </nav>

      {/* ── Section: Active Metrics ──────────────────────────────────────── */}
      {section === "active" && (
        <div>
          <div className={styles.toolbar}>
            <input
              type="search"
              placeholder="Search metrics…"
              className={styles.searchInput}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <select
              className={styles.sortSelect}
              value={metricSort ?? ""}
              onChange={(e) => setMetricSort((e.target.value as "asc" | "desc") || null)}
              aria-label="Sort metrics"
            >
              <option value="">Sort: by last data date</option>
              <option value="desc">Sort: last run newest first</option>
              <option value="asc">Sort: last run oldest first</option>
            </select>
            <button
              className={styles.runAllBtn}
              onClick={() => setRunAllOpen(true)}
              disabled={activeMetrics.length === 0}
            >
              ▶ Run All Metrics
            </button>
          </div>

          {activeMetrics.length === 0 ? (
            <div className={styles.emptyState}>
              <i className={`fas fa-chart-bar ${styles.emptyStateIcon}`} />
              <p>No active metrics for this city.</p>
            </div>
          ) : groupedActiveMetrics.sortedCats.length === 0 ? (
            <div className={styles.emptyState}>
              <p>No metrics match &ldquo;{search}&rdquo;</p>
            </div>
          ) : (
            groupedActiveMetrics.sortedCats.map((category) => (
              <div key={category} style={{ marginBottom: 28 }}>
                <h4 className={styles.categoryHeading}>{category}</h4>
                <div className={cityAdminStyles.metricsTableContainer}>
                  <table className={cityAdminStyles.metricsTable}>
                    <thead>
                      <tr>
                        <th>Metric</th>
                        <th>Last data</th>
                        <th>Last run</th>
                      </tr>
                    </thead>
                    <tbody>
                      {groupedActiveMetrics.grouped[category].metrics.map((metric) => {
                        const isSelected = drawerMetricId === metric.id;
                        const hasNoData = !metric.most_recent_data_date;
                        const isSuccess = metric.last_execution_status === "completed" || metric.last_execution_status === "success";
                        const isFailure = ["failed", "failure", "error"].includes(metric.last_execution_status ?? "");

                        return (
                          <tr
                            key={metric.id}
                            role="button"
                            tabIndex={0}
                            aria-label={`Open details for ${metric.metric_name}`}
                            className={`${cityAdminStyles.metricTableRow} ${isSelected ? styles.metricRowSelected : ""} ${hasNoData ? cityAdminStyles.metricTableRowNoData : ""}`}
                            style={{
                              backgroundColor: !isSelected && !hasNoData
                                ? isSuccess
                                  ? "rgba(76, 175, 80, 0.07)"
                                  : isFailure
                                  ? "rgba(244, 67, 54, 0.07)"
                                  : undefined
                                : undefined,
                            }}
                            onClick={() => openDrawer(metric.id)}
                            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openDrawer(metric.id); } }}
                          >
                            <td className={cityAdminStyles.metricNameCell}>
                              <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
                                <span style={{ fontWeight: 500 }}>{metric.metric_name}</span>
                                <span className={cityAdminStyles.metricIdInline}>({metric.id})</span>
                              </div>
                            </td>
                            <td className={cityAdminStyles.metricDateCell}>
                              {metric.most_recent_data_date
                                ? <span>{new Date(metric.most_recent_data_date).toLocaleDateString("en-US", { timeZone: "UTC" })}</span>
                                : <span style={{ color: "var(--color-error, #ef4444)" }}>No data</span>
                              }
                            </td>
                            <td className={cityAdminStyles.metricExecutionCell}>
                              {metric.last_execution_at ? (
                                <span>
                                  <span className={`${styles.statusDot} ${isSuccess ? styles.statusSuccess : isFailure ? styles.statusFailed : styles.statusNone}`} />
                                  {new Date(metric.last_execution_at).toLocaleDateString("en-US", { timeZone: "UTC" })}
                                </span>
                              ) : (
                                <span style={{ color: "var(--text-tertiary)" }}>Never</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* ── Section: Templates ───────────────────────────────────────────── */}
      {section === "templates" && (
        <div>
          <p className={styles.sectionInfo}>
            Templates are platform-defined metric definitions. Click <strong>Run</strong> to have Seymour map a template to a city-specific dataset and create the metric.
          </p>

          <div className={styles.templatesToolbar}>
            <label className={styles.toggleLabel}>
              <input
                type="checkbox"
                checked={templateShowAll}
                onChange={(e) => setTemplateShowAll(e.target.checked)}
              />
              Show already instantiated
            </label>
            <label style={{ fontSize: 12, color: "var(--text-secondary)", display: "flex", alignItems: "center", gap: 6 }}>
              Model:
              <select
                value={templateModelKey}
                onChange={(e) => setTemplateModelKey(e.target.value)}
                style={{ marginLeft: 6, padding: "4px 8px", fontSize: 12, borderRadius: 4, border: "1px solid var(--border-primary)", background: "var(--bg-secondary)", color: "var(--text-primary)", minWidth: 160 }}
                disabled={instantiateAllMutation.isPending || !!runningAllJobId}
              >
                {availableModelsData?.flatMap((g) =>
                  (g.models || []).map((m) => (
                    <option key={m.key} value={m.key} disabled={!m.is_available}>
                      {m.key}{!m.is_available ? " (no key)" : ""}
                    </option>
                  ))
                )}
              </select>
            </label>
            <button
              onClick={() => setShowRunAllTemplatesModal(true)}
              disabled={instantiateAllMutation.isPending || !!runningAllJobId}
              className={styles.primaryBtn}
              style={{ background: "var(--brand-secondary, #00a86b)" }}
            >
              {runningAllJobId ? "Running all…" : instantiateAllMutation.isPending ? "Starting…" : "Run all templates"}
            </button>
          </div>

          {visibleTemplates.length === 0 ? (
            <div className={styles.emptyState}>
              <i className={`fas fa-check-circle ${styles.emptyStateIcon}`} />
              <p>All templates have been instantiated for this city.</p>
              <button className={styles.actionBtn} onClick={() => setTemplateShowAll(true)}>Show all templates</button>
            </div>
          ) : (
            <div className={cityAdminStyles.metricsTableContainer}>
              <table className={cityAdminStyles.metricsTable}>
                <thead>
                  <tr>
                    <th>Template</th>
                    <th>Mapped metric</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleTemplates.map((t, index) => {
                    const jobId = runningSingleJobByTemplateId[t.template_id];
                    const job = jobId ? jobs?.find((j) => j.job_id === jobId) : null;
                    const isRunning = !!jobId && job && (job.status === "pending" || job.status === "running");
                    const isInstantiated = t.status === "instantiated";
                    const categoryLabel = t.category?.trim() ? t.category : "Uncategorized";
                    const subcategoryLabel = t.subcategory?.trim() || "";
                    const prev = index > 0 ? visibleTemplates[index - 1] : null;
                    const prevCategory = prev ? (prev.category?.trim() ? prev.category : "Uncategorized") : null;
                    const prevSubcategory = prev?.subcategory?.trim() || "";
                    const showCategory = prevCategory !== categoryLabel;
                    const showSubcategory = !!subcategoryLabel && (showCategory || prevSubcategory !== subcategoryLabel);
                    const mappedMetricName = t.metric_id != null ? metricNameById.get(t.metric_id) : undefined;

                    return (
                      <Fragment key={t.template_id}>
                        {showCategory && (
                          <tr className={cityAdminStyles.templateCategoryRow}>
                            <td colSpan={3}>{categoryLabel}</td>
                          </tr>
                        )}
                        {showSubcategory && (
                          <tr className={cityAdminStyles.templateSubcategoryRow}>
                            <td colSpan={3}>{subcategoryLabel}</td>
                          </tr>
                        )}
                        <tr
                          className={cityAdminStyles.metricTableRow}
                          style={{ opacity: isInstantiated ? 0.9 : 0.7, backgroundColor: isRunning ? "rgba(99,102,241,0.05)" : undefined }}
                        >
                          <td className={cityAdminStyles.metricNameCell}>
                            <div style={{ fontWeight: 500, color: isInstantiated ? "var(--text-primary)" : "var(--text-secondary)", display: "flex", alignItems: "baseline", gap: 6 }}>
                              <span>{t.template_name}</span>
                              <span className={cityAdminStyles.metricIdInline}>(template {t.template_id})</span>
                            </div>
                            {isRunning && job?.status_message && (
                              <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 2 }}>{job.status_message}</div>
                            )}
                          </td>
                          <td>
                            {isInstantiated && t.metric_id != null ? (
                              <span style={{ fontSize: 12, color: "var(--color-success, #22c55e)" }}>
                                {mappedMetricName ? `${mappedMetricName} ` : ""}#{t.metric_id}
                              </span>
                            ) : (
                              <span style={{ fontSize: 12, color: "var(--text-tertiary)" }}>—</span>
                            )}
                          </td>
                          <td>
                            <div className={cityAdminStyles.templateMetricActions}>
                              <button
                                onClick={async () => {
                                  try {
                                    const result = await instantiateSingleMutation.mutateAsync({ cityId, templateId: t.template_id, modelKey: templateModelKey || undefined });
                                    setRunningSingleJobByTemplateId((prev) => ({ ...prev, [t.template_id]: result.job_id }));
                                    notifyJobCreated(result.job_id);
                                  } catch (err) {
                                    alert("Failed to start: " + (err instanceof Error ? err.message : String(err)));
                                  }
                                }}
                                disabled={isRunning || instantiateSingleMutation.isPending}
                                className={styles.rowActionBtn}
                                style={{ background: isRunning || instantiateSingleMutation.isPending ? "var(--text-secondary)" : "var(--brand-accent, #6366f1)", color: "white", border: "none" }}
                              >
                                {isRunning ? "Running…" : isInstantiated ? "Re-run" : "Run"}
                              </button>
                              <button
                                onClick={() => setStructuringNotesTarget({ metricId: t.metric_id, templateId: t.template_id })}
                                className={styles.rowActionBtn}
                                title="View AI structuring notes"
                              >
                                <i className="fas fa-clipboard-list" style={{ marginRight: 3 }} />Notes
                              </button>
                            </div>
                          </td>
                        </tr>
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Run all templates confirm modal */}
          {showRunAllTemplatesModal && (
            <div className={styles.confirmOverlay} onClick={() => setShowRunAllTemplatesModal(false)}>
              <div className={styles.confirmBox} onClick={(e) => e.stopPropagation()}>
                <p className={styles.confirmTitle}>Run all templates</p>
                <p className={styles.confirmBody}>Choose whether to re-run templates that already have a metric, or only process missing ones.</p>
                <div className={styles.confirmActions}>
                  <button className={styles.confirmCancelBtn} onClick={() => setShowRunAllTemplatesModal(false)}>Cancel</button>
                  <button
                    className={styles.actionBtn}
                    style={{ background: "#eab308", color: "#000", border: "none" }}
                    onClick={async () => {
                      setShowRunAllTemplatesModal(false);
                      try {
                        const result = await instantiateAllMutation.mutateAsync({ cityId, modelKey: templateModelKey || undefined, onlyMissing: false });
                        setRunningAllJobId(result.job_id);
                        notifyJobCreated(result.job_id);
                      } catch (err) { alert("Failed: " + (err instanceof Error ? err.message : String(err))); }
                    }}
                  >
                    Run all (including existing)
                  </button>
                  <button
                    className={styles.primaryBtn}
                    onClick={async () => {
                      setShowRunAllTemplatesModal(false);
                      try {
                        const result = await instantiateAllMutation.mutateAsync({ cityId, modelKey: templateModelKey || undefined, onlyMissing: true });
                        setRunningAllJobId(result.job_id);
                        notifyJobCreated(result.job_id);
                      } catch (err) { alert("Failed: " + (err instanceof Error ? err.message : String(err))); }
                    }}
                  >
                    Only missing
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Section: Display Settings ────────────────────────────────────── */}
      {section === "settings" && (
        <div>
          <p className={styles.settingsDescription}>
            Controls the order, naming, and categorization of this city&rsquo;s metrics on the public dashboard.
            Changes here only affect how metrics are presented — they don&rsquo;t activate or deactivate any metric.
          </p>
          {dashboardMetrics.length > 0 ? (
            <MetricOrderEditor cityId={cityId} metrics={dashboardMetrics as any} />
          ) : (
            <div className={styles.emptyState}>
              <i className={`fas fa-sort-amount-down ${styles.emptyStateIcon}`} />
              <p>No metrics are currently marked &ldquo;show on dashboard&rdquo;.</p>
              <p style={{ fontSize: 12 }}>Enable <strong>Show on Dashboard</strong> in a metric&rsquo;s settings to include it here.</p>
            </div>
          )}
        </div>
      )}

      {/* ── Section: Inactive & Cleanup ──────────────────────────────────── */}
      {section === "cleanup" && (
        <div>
          {/* Inactive metrics */}
          <div className={styles.cleanupSubSection}>
            <div className={styles.cleanupToolbar}>
              <h4 className={styles.cleanupSubHeading}>
                Inactive metrics
                {inactiveMetrics.length > 0 && (
                  <span className={styles.sectionBadge} style={{ background: "var(--color-error, #ef4444)" }}>{inactiveMetrics.length}</span>
                )}
              </h4>
              {inactiveMetrics.length > 0 && (
                <button
                  className={styles.dangerBtn}
                  disabled={bulkDeleting}
                  onClick={() => setBulkDeleteConfirm(true)}
                >
                  {bulkDeleting ? "Deleting…" : `Delete all inactive (${inactiveMetrics.length})`}
                </button>
              )}
            </div>

            {inactiveMetrics.length === 0 ? (
              <div className={styles.emptyState}>
                <i className={`fas fa-check-circle ${styles.emptyStateIcon}`} />
                <p>No inactive metrics.</p>
              </div>
            ) : (
              <div className={cityAdminStyles.metricsTableContainer}>
                <table className={cityAdminStyles.metricsTable}>
                  <thead>
                    <tr>
                      <th>Metric</th>
                      <th>Last data</th>
                      {loadingRecordCounts ? <th>Records</th> : recordCounts ? <th>Records</th> : null}
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {inactiveMetrics.map((metric) => {
                      const counts = recordCounts?.[metric.id];
                      const totalRecords = counts ? (counts.total_active ?? 0) + (counts.total_inactive ?? 0) : null;

                      return (
                        <tr key={metric.id} className={cityAdminStyles.metricTableRow}>
                          <td className={cityAdminStyles.metricNameCell}>
                            <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
                              <span style={{ fontWeight: 500, color: "var(--text-secondary)" }}>{metric.metric_name}</span>
                              <span className={cityAdminStyles.metricIdInline}>({metric.id})</span>
                            </div>
                            {metric.category && <div style={{ fontSize: 10, color: "var(--text-tertiary)", marginTop: 2 }}>{metric.category}</div>}
                          </td>
                          <td className={cityAdminStyles.metricDateCell}>{formatDate(metric.most_recent_data_date)}</td>
                          {recordCounts || loadingRecordCounts ? (
                            <td className={cityAdminStyles.metricDateCell}>
                              {loadingRecordCounts
                                ? <i className="fas fa-spinner fa-spin" style={{ fontSize: 10 }} />
                                : totalRecords != null
                                ? <span style={{ fontWeight: totalRecords > 0 ? 600 : 400, color: totalRecords > 0 ? "var(--text-primary)" : "var(--text-tertiary)" }}>{totalRecords.toLocaleString()}</span>
                                : "—"}
                            </td>
                          ) : null}
                          <td>
                            <div style={{ display: "flex", gap: 6, flexWrap: "nowrap" }}>
                              <button
                                className={`${styles.rowActionBtn} ${styles.rowActionBtnSuccess}`}
                                onClick={() => handleDeactivate(metric)}
                                disabled={updateMetricMutation.isPending}
                              >
                                Reactivate
                              </button>
                              <button
                                className={styles.rowActionBtn}
                                onClick={() => handlePurge(metric.id)}
                                disabled={purgeMetricMutation.isPending}
                                title="Remove all data but keep definition"
                              >
                                Purge data
                              </button>
                              <button
                                className={`${styles.rowActionBtn} ${styles.rowActionBtnDanger}`}
                                onClick={() => handleDelete(metric.id)}
                                disabled={deleteMetricMutation.isPending}
                              >
                                Delete
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Active metrics with no data */}
          <div className={styles.cleanupSubSection}>
            <h4 className={styles.cleanupSubHeading}>
              Active metrics with no data
              {noDataActiveMetrics.length > 0 && (
                <span className={styles.sectionBadge} style={{ background: "var(--color-warning, #f59e0b)" }}>{noDataActiveMetrics.length}</span>
              )}
            </h4>
            <p className={styles.sectionInfo}>
              These metrics are active but have never been run, or all their data was purged.
            </p>

            {noDataActiveMetrics.length === 0 ? (
              <div className={styles.emptyState}>
                <i className={`fas fa-check-circle ${styles.emptyStateIcon}`} />
                <p>All active metrics have data.</p>
              </div>
            ) : (
              <div className={cityAdminStyles.metricsTableContainer}>
                <table className={cityAdminStyles.metricsTable}>
                  <thead>
                    <tr>
                      <th>Metric</th>
                      <th>Last run</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {noDataActiveMetrics.map((metric) => {
                      const isFailure = ["failed", "failure", "error"].includes(metric.last_execution_status ?? "");
                      return (
                        <tr key={metric.id} className={`${cityAdminStyles.metricTableRow} ${cityAdminStyles.metricTableRowNoData}`}>
                          <td className={cityAdminStyles.metricNameCell}>
                            <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
                              <span style={{ fontWeight: 500 }}>{metric.metric_name}</span>
                              <span className={cityAdminStyles.metricIdInline}>({metric.id})</span>
                            </div>
                            {metric.category && <div style={{ fontSize: 10, color: "var(--text-tertiary)", marginTop: 2 }}>{metric.category}</div>}
                          </td>
                          <td className={cityAdminStyles.metricExecutionCell}>
                            {metric.last_execution_at ? (
                              <span>
                                <span className={`${styles.statusDot} ${isFailure ? styles.statusFailed : styles.statusNone}`} />
                                {formatDate(metric.last_execution_at)}
                                {isFailure && <span style={{ fontSize: 10, color: "var(--color-error, #ef4444)", marginLeft: 4 }}>Failed</span>}
                              </span>
                            ) : <span style={{ color: "var(--text-tertiary)" }}>Never</span>}
                          </td>
                          <td>
                            <div style={{ display: "flex", gap: 6, flexWrap: "nowrap" }}>
                              <button
                                className={styles.rowActionBtn}
                                onClick={() => { openDrawer(metric.id); setSection("active"); }}
                                title="View and execute this metric"
                              >
                                Open
                              </button>
                              <button
                                className={styles.rowActionBtn}
                                onClick={() => openExecute(metric.id)}
                              >
                                Execute
                              </button>
                              <button
                                className={`${styles.rowActionBtn} ${styles.rowActionBtnDanger}`}
                                onClick={() => handleDelete(metric.id)}
                              >
                                Delete
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Detail Drawer ────────────────────────────────────────────────── */}
      {drawerMetric && (
        <MetricDetailDrawer
          metric={drawerMetric}
          cityName={cityName}
          onClose={closeDrawer}
          onSettings={() => openEditModal(drawerMetric.id)}
          onCharts={() => openCharts(drawerMetric.id)}
          onMaps={() => openMaps(drawerMetric.id)}
          onAnomalies={() => openAnomalies(drawerMetric.id)}
          onExecute={() => openExecute(drawerMetric.id)}
          onDeactivate={() => handleDeactivate(drawerMetric)}
          onDelete={() => handleDelete(drawerMetric.id)}
          deactivating={updateMetricMutation.isPending}
          deleting={deleteMetricMutation.isPending}
        />
      )}

      {/* ── Bulk delete confirm ──────────────────────────────────────────── */}
      {bulkDeleteConfirm && (
        <div className={styles.confirmOverlay}>
          <div className={styles.confirmBox}>
            <p className={styles.confirmTitle}>Delete {inactiveMetrics.length} inactive metric{inactiveMetrics.length !== 1 ? "s" : ""}?</p>
            <p className={styles.confirmBody}>
              This will permanently delete the following metrics and all their data:
              <br />
              <strong>{inactiveMetrics.slice(0, 10).map((m) => m.metric_name).join(", ")}{inactiveMetrics.length > 10 ? `, and ${inactiveMetrics.length - 10} more` : ""}</strong>
              <br /><br />
              This cannot be undone.
            </p>
            <div className={styles.confirmActions}>
              <button className={styles.confirmCancelBtn} onClick={() => setBulkDeleteConfirm(false)}>Cancel</button>
              <button className={styles.dangerBtn} onClick={handleBulkDeleteInactive}>Delete all</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Shared modals ────────────────────────────────────────────────── */}
      {editModalMetricId && (
        <MetricEditModal
          metricId={editModalMetricId}
          isOpen={editModalOpen}
          onClose={closeEditModal}
          onExecute={(metricId) => { closeEditModal(); openExecute(metricId); }}
          onSave={() => { refreshMetrics(); }}
        />
      )}

      <MetricChartsModal
        metricId={chartsMetricId}
        isOpen={chartsOpen}
        onClose={closeCharts}
        metricKey={chartsMetricKey}
        citySlug={citySlugFrom(cityName)}
      />

      <MetricMapsModal
        metricId={mapsMetricId}
        metricName={mapsMetricId ? metrics.find((m) => m.id === mapsMetricId)?.metric_name : undefined}
        isOpen={mapsOpen}
        onClose={closeMaps}
      />

      <StructuringNotesModal
        metricId={structuringNotesTarget?.metricId}
        templateId={structuringNotesTarget?.templateId}
        cityId={cityId}
        isOpen={structuringNotesTarget != null}
        onClose={() => setStructuringNotesTarget(null)}
      />

      <RunAllMetricsModal
        isOpen={runAllOpen}
        onClose={() => setRunAllOpen(false)}
        cityId={cityId}
        cityName={cityName}
        metrics={activeMetrics as any}
      />

      {isClient && executeOpen && executeMetricId && (
        <ExecuteModal metricId={executeMetricId} onClose={closeExecute} />
      )}

      {isClient && anomaliesOpen && anomaliesMetricId && (
        <AnomaliesModal metricId={anomaliesMetricId} onClose={closeAnomalies} />
      )}
    </div>
  );
}

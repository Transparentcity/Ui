"use client";

import { Fragment, useMemo, useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { useAuth0 } from "@auth0/auth0-react";
import { useJobWebSocketContext } from "@/contexts/JobWebSocketContext";
import {
  getDefaultExecuteStartDateByPeriod,
  getMetricRecordCounts,
  updateAdminMetric,
  purgeAdminMetricData,
} from "@/lib/apiClient";
import {
  useCityMetricOrdering,
  useTemplateInstantiationStatus,
  useInstantiateSingleTemplate,
  useInstantiateAllTemplates,
} from "@/lib/hooks/useCityAdmin";
import {
  useDeleteMetric,
  useExecuteMetric,
  useMetricTimeSeries,
  useMetricTimeSeriesDetail,
} from "@/lib/hooks/useMetrics";
import { notifyJobCreated } from "@/lib/useJobWebSocket";
import { pickDefaultModelKey } from "@/lib/modelDefaults";
import MetricEditModal from "@/components/MetricEditModal";
import MetricChartsModal from "@/components/MetricChartsModal";
import MetricMapsModal from "@/components/MetricMapsModal";
import MetricOrderEditor from "@/components/MetricOrderEditor";
import RunAllMetricsModal from "@/components/RunAllMetricsModal";
import StructuringNotesModal from "@/components/StructuringNotesModal";
import TimeSeriesChart from "@/components/TimeSeriesChart";
import metricStyles from "@/components/MetricsAdmin.module.css";
import styles from "./CityMetricsTab.module.css";
import type { ModelGroupInfo } from "@/lib/apiClient";

// ─── Types ──────────────────────────────────────────────────────────────────

interface Metric {
  id: number;
  metric_name: string;
  metric_key: string;
  category?: string;
  subcategory?: string;
  show_on_dash?: boolean;
  is_active?: boolean;
  last_execution_status?: string;
  last_execution_at?: string | null;
  most_recent_data_date?: string | null;
  freshness?: { update_frequency?: string; lag_days?: number; is_stale?: boolean };
  most_recent_period_total?: number | null;
  item_noun?: string;
  record_counts?: {
    total_active?: number;
    total_inactive?: number;
    active_data_points?: number;
    inactive_data_points?: number;
    [key: string]: unknown;
  } | null;
}

interface CityData {
  id: number;
  name: string;
  city_name?: string;
  metrics?: Metric[];
}

interface CityMetricsTabProps {
  cityId: number;
  cityData: CityData | null;
  availableModelsData?: ModelGroupInfo[];
  refetchCity: () => void;
  embedded?: boolean;
  onViewAnomalies?: (metricId: number) => void;
}

type MetricsSection = "metrics" | "templates" | "settings" | "cleanup";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function templateCategorySlug(category?: string | null, apiSlug?: string | null): string {
  if (apiSlug?.trim()) return apiSlug.trim();
  if (!category?.trim()) return "uncategorized";
  return category.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "uncategorized";
}

function formatDate(value?: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("en-US", { timeZone: "UTC", month: "short", day: "numeric", year: "numeric" });
}

function citySlugFromName(name?: string | null): string | null {
  if (!name) return null;
  return name.trim().toLowerCase().replace(/[^a-z0-9\s-]/g, "").replace(/[\s_-]+/g, "-").replace(/^-|-$/g, "");
}

// ─── Detail Panel ────────────────────────────────────────────────────────────

interface DetailPanelProps {
  metric: Metric;
  citySlug: string | null;
  onClose: () => void;
  onEdit: () => void;
  onCharts: () => void;
  onMaps: () => void;
  onAnomalies: () => void;
  onExecute: () => void;
  onDeactivate: () => void;
  onDelete: () => void;
}

function DetailPanel({
  metric,
  citySlug,
  onClose,
  onEdit,
  onCharts,
  onMaps,
  onAnomalies,
  onExecute,
  onDeactivate,
  onDelete,
}: DetailPanelProps) {
  const [periodTypeFilter, setPeriodTypeFilter] = useState<string>("all");
  const chartsQuery = useMetricTimeSeries(metric.id, { exclude_group_fields: false });
  const chartsData = chartsQuery.data ?? null;

  // Pick first chart that matches period filter (prefer monthly citywide for overview)
  const selectedChart = useMemo(() => {
    if (!chartsData?.time_series?.length) return null;
    const list = chartsData.time_series;
    if (periodTypeFilter === "all") {
      return (
        list.find((ts) => ts.period_type?.toLowerCase() === "month" && (ts.district === null || ts.district === 0)) ??
        list.find((ts) => ts.period_type?.toLowerCase() === "month") ??
        list[0]
      );
    }
    return (
      list.find((ts) => ts.period_type?.toLowerCase() === "day" && (ts.district === null || ts.district === 0)) ??
      list.find((ts) => ts.period_type?.toLowerCase() === periodTypeFilter) ??
      list[0]
    );
  }, [chartsData, periodTypeFilter]);

  const chartDetailQuery = useMetricTimeSeriesDetail(metric.id, selectedChart?.chart_id ?? null);
  const chartDetail = chartDetailQuery.data ?? null;

  const uniquePeriodTypes = useMemo(() => {
    if (!chartsData?.time_series) return [];
    const types = new Set<string>();
    chartsData.time_series.forEach((ts) => { if (ts.period_type) types.add(ts.period_type.toLowerCase()); });
    return Array.from(types).sort();
  }, [chartsData]);

  const execStatus = metric.last_execution_status;
  const isSuccess = execStatus === "completed" || execStatus === "success";
  const isFailure = execStatus === "failed" || execStatus === "failure" || execStatus === "error";

  return (
    <>
      <div className={styles.panelBackdrop} onClick={onClose} aria-hidden />
      <div className={styles.detailPanel} role="complementary" aria-label={`Details: ${metric.metric_name}`}>
        {/* Header */}
        <div className={styles.panelHeader}>
          <div className={styles.panelTitle}>
            <div className={styles.panelMetricName}>{metric.metric_name}</div>
            <div className={styles.panelMeta}>
              <span>ID {metric.id}</span>
              <span>Key: <code style={{ fontSize: 10 }}>{metric.metric_key}</code></span>
              {metric.category && <span>{metric.category}{metric.subcategory ? ` › ${metric.subcategory}` : ""}</span>}
              {metric.is_active === false && (
                <span style={{ color: "#dc2626", fontWeight: 600 }}>Inactive</span>
              )}
            </div>
          </div>
          <button className={styles.panelCloseBtn} onClick={onClose} aria-label="Close panel">×</button>
        </div>

        {/* Body */}
        <div className={styles.panelBody}>
          {/* Chart */}
          <div className={styles.panelChartArea}>
            <div className={styles.chartControls}>
              <span className={styles.muted} style={{ fontWeight: 600 }}>Chart preview</span>
              {uniquePeriodTypes.length > 1 && (
                <select
                  className={styles.chartSelect}
                  value={periodTypeFilter}
                  onChange={(e) => setPeriodTypeFilter(e.target.value)}
                >
                  <option value="all">Monthly (default)</option>
                  {uniquePeriodTypes.map((pt) => (
                    <option key={pt} value={pt}>{pt.charAt(0).toUpperCase() + pt.slice(1)}</option>
                  ))}
                </select>
              )}
              {chartsData && (
                <button className={styles.panelBtn} onClick={onCharts} style={{ marginLeft: "auto", fontSize: 11 }}>
                  <i className="fas fa-expand-alt" /> Full chart browser
                </button>
              )}
            </div>

            {chartsQuery.isLoading ? (
              <div className={styles.muted} style={{ textAlign: "center", padding: "20px 0" }}>
                <span className={styles.spinner} /> Loading chart…
              </div>
            ) : !chartsData || chartsData.time_series.length === 0 ? (
              <div className={styles.muted} style={{ textAlign: "center", padding: "20px 0" }}>
                No time series data yet.{" "}
                <button className={styles.panelBtn} onClick={onExecute} style={{ marginLeft: 8 }}>
                  <i className="fas fa-play" /> Execute metric
                </button>
              </div>
            ) : chartDetailQuery.isLoading ? (
              <div className={styles.muted} style={{ textAlign: "center", padding: "20px 0" }}>
                <span className={styles.spinner} /> Loading data…
              </div>
            ) : chartDetail ? (
              <TimeSeriesChart
                data={chartDetail.data}
                defaultPeriod={
                  (selectedChart?.period_type?.toLowerCase() as "day" | "week" | "month" | "year" | "ytd") ?? "month"
                }
                metadata={{ period_type: selectedChart?.period_type ?? "month" }}
                height={220}
                hidePeriodSelector
              />
            ) : (
              <div className={styles.muted} style={{ textAlign: "center", padding: "20px 0" }}>Select a period above to preview.</div>
            )}
          </div>

          {/* Key facts */}
          <div className={styles.panelFactsGrid}>
            <div className={styles.panelFact}>
              <span className={styles.panelFactLabel}>Most recent data</span>
              <span className={styles.panelFactValue}>{formatDate(metric.most_recent_data_date)}</span>
            </div>
            <div className={styles.panelFact}>
              <span className={styles.panelFactLabel}>Last execution</span>
              <span className={styles.panelFactValue} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                {formatDate(metric.last_execution_at)}
                {execStatus && (
                  <span className={`${styles.statusBadge} ${isSuccess ? styles.statusSuccess : isFailure ? styles.statusFailed : styles.statusNone}`}>
                    {execStatus}
                  </span>
                )}
              </span>
            </div>
            <div className={styles.panelFact}>
              <span className={styles.panelFactLabel}>Dashboard</span>
              <span className={styles.panelFactValue}>{metric.show_on_dash ? "Shown" : "Hidden"}</span>
            </div>
            <div className={styles.panelFact}>
              <span className={styles.panelFactLabel}>Status</span>
              <span className={styles.panelFactValue}>{metric.is_active === false ? "Inactive" : "Active"}</span>
            </div>
          </div>

          {/* Actions */}
          <div className={styles.panelActions}>
            <button className={`${styles.panelBtn} ${styles.panelBtnPrimary}`} onClick={onEdit}>
              <i className="fas fa-cog" /> Settings
            </button>
            <button className={styles.panelBtn} onClick={onCharts}>
              <i className="fas fa-chart-line" /> Charts
            </button>
            <button className={styles.panelBtn} onClick={onMaps}>
              <i className="fas fa-map" /> Maps
            </button>
            <button className={styles.panelBtn} onClick={onAnomalies}>
              <i className="fas fa-exclamation-triangle" /> Anomalies
            </button>
            <button className={styles.panelBtn} onClick={onExecute}>
              <i className="fas fa-play" /> Execute
            </button>
            <button className={`${styles.panelBtn} ${styles.panelBtnWarning}`} onClick={onDeactivate}>
              <i className="fas fa-pause-circle" /> {metric.is_active === false ? "Reactivate" : "Deactivate"}
            </button>
            <button className={`${styles.panelBtn} ${styles.panelBtnDanger}`} onClick={onDelete}>
              <i className="fas fa-trash" /> Delete
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

// ─── Metrics Section (active metrics list) ───────────────────────────────────

interface MetricsSectionProps {
  cityId: number;
  cityData: CityData | null;
  refetchCity: () => void;
  onRunAll: () => void;
  onViewAnomalies?: (metricId: number) => void;
}

function MetricsSection({ cityId, cityData, refetchCity, onRunAll, onViewAnomalies }: MetricsSectionProps) {
  const { getAccessTokenSilently } = useAuth0();
  const [search, setSearch] = useState("");
  const [sortMode, setSortMode] = useState<"data" | "exec_desc" | "exec_asc">("data");
  const [selectedMetricId, setSelectedMetricId] = useState<number | null>(null);

  // Modal state
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editModalMetricId, setEditModalMetricId] = useState<number | null>(null);
  const [chartsOpen, setChartsOpen] = useState(false);
  const [chartsMetricId, setChartsMetricId] = useState<number | null>(null);
  const [mapsOpen, setMapsOpen] = useState(false);
  const [mapsMetricId, setMapsMetricId] = useState<number | null>(null);
  const [fallbackAnomaliesMetricId, setFallbackAnomaliesMetricId] = useState<number | null>(null);
  const [showExecuteModal, setShowExecuteModal] = useState(false);
  const [executeMetricId, setExecuteMetricId] = useState<number | null>(null);
  const [executePeriodType, setExecutePeriodType] = useState("day");
  const [executeStartDate, setExecuteStartDate] = useState("");
  const [executeEndDate, setExecuteEndDate] = useState("");
  const [isClient, setIsClient] = useState(false);
  useEffect(() => setIsClient(true), []);

  const deleteMetricMutation = useDeleteMetric();
  const executeMetricMutation = useExecuteMetric();
  const { data: orderingData } = useCityMetricOrdering(cityId);

  const orderingMap = useMemo(() => {
    const map = new Map<number, { categoryOrder: number; metricOrder: number; categoryName: string }>();
    orderingData?.orderings?.forEach((o) => {
      if (o.metric_id) map.set(o.metric_id, { categoryOrder: o.category_order, metricOrder: o.metric_order, categoryName: o.category_name });
    });
    return map;
  }, [orderingData]);

  // Active metrics only, filtered by search
  const activeMetrics = useMemo(() => {
    const all = (cityData?.metrics ?? []).filter((m) => m.is_active !== false);
    if (!search.trim()) return all;
    const q = search.toLowerCase();
    return all.filter((m) => m.metric_name.toLowerCase().includes(q) || m.metric_key.toLowerCase().includes(q));
  }, [cityData?.metrics, search]);

  // Group by category respecting ordering
  const grouped = useMemo(() => {
    const g: Record<string, { metrics: (Metric & { metricOrder: number })[]; categoryOrder: number }> = {};
    const lastDataKey = (m: Metric) => (m.most_recent_data_date ? new Date(m.most_recent_data_date).getTime() : 0);

    activeMetrics.forEach((metric) => {
      const ordering = orderingMap.get(metric.id);
      const category = ordering?.categoryName || metric.category || "Uncategorized";
      const categoryOrder = ordering?.categoryOrder ?? 1000;
      const metricOrder = ordering?.metricOrder ?? 1000;
      if (!g[category]) g[category] = { metrics: [], categoryOrder };
      g[category].categoryOrder = Math.min(g[category].categoryOrder, categoryOrder);
      g[category].metrics.push({ ...metric, metricOrder });
    });

    const sortedCategories = Object.keys(g).sort((a, b) => {
      const diff = g[a].categoryOrder - g[b].categoryOrder;
      return diff !== 0 ? diff : a.localeCompare(b);
    });

    sortedCategories.forEach((cat) => {
      g[cat].metrics.sort((a, b) => {
        if (sortMode === "exec_desc") {
          return (b.last_execution_at ? new Date(b.last_execution_at).getTime() : 0) -
            (a.last_execution_at ? new Date(a.last_execution_at).getTime() : 0);
        }
        if (sortMode === "exec_asc") {
          return (a.last_execution_at ? new Date(a.last_execution_at).getTime() : 0) -
            (b.last_execution_at ? new Date(b.last_execution_at).getTime() : 0);
        }
        const dDiff = (b.most_recent_data_date ? new Date(b.most_recent_data_date).getTime() : 0) -
          (a.most_recent_data_date ? new Date(a.most_recent_data_date).getTime() : 0);
        if (dDiff !== 0) return dDiff;
        if (a.metricOrder !== b.metricOrder) return a.metricOrder - b.metricOrder;
        return a.metric_name.localeCompare(b.metric_name);
      });
    });

    return { sortedCategories, g };
  }, [activeMetrics, orderingMap, sortMode]);

  const selectedMetric = useMemo(
    () => (selectedMetricId != null ? (cityData?.metrics ?? []).find((m) => m.id === selectedMetricId) ?? null : null),
    [selectedMetricId, cityData?.metrics]
  );

  const citySlug = citySlugFromName(cityData?.name || cityData?.city_name);

  // Handlers
  const openEdit = (metricId: number) => { setEditModalMetricId(metricId); setEditModalOpen(true); };
  const openCharts = (metricId: number) => { setChartsMetricId(metricId); setChartsOpen(true); };
  const openMaps = (metricId: number) => { setMapsMetricId(metricId); setMapsOpen(true); };
  const openAnomalies = (metricId: number) => {
    if (onViewAnomalies) {
      onViewAnomalies(metricId);
    } else {
      setFallbackAnomaliesMetricId(metricId);
    }
  };

  const openExecute = (metricId: number) => {
    const periodType = "day";
    setExecuteMetricId(metricId);
    setExecutePeriodType(periodType);
    setExecuteStartDate(getDefaultExecuteStartDateByPeriod(periodType));
    setExecuteEndDate(new Date().toISOString().split("T")[0]);
    setShowExecuteModal(true);
  };

  const runExecute = () => {
    if (!executeMetricId) return;
    executeMetricMutation.mutate(
      { metricId: executeMetricId, payload: { period_type: executePeriodType, start_date: executeStartDate || null, end_date: executeEndDate || null } },
      {
        onSuccess: (res) => { notifyJobCreated(res.job_id); alert(`Execution started. Job: ${res.job_id}`); setShowExecuteModal(false); },
        onError: (err) => { alert(err instanceof Error ? err.message : "Failed to execute"); },
      }
    );
  };

  const handleDeactivate = async (metric: Metric) => {
    const isActive = metric.is_active !== false;
    const action = isActive ? "Deactivate" : "Reactivate";
    if (!confirm(`${action} "${metric.metric_name}"?`)) return;
    try {
      const token = await getAccessTokenSilently();
      await updateAdminMetric(metric.id, { is_active: !isActive }, token);
      refetchCity();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to update metric");
    }
  };

  const handleDelete = (metricId: number) => {
    if (!confirm("Delete this metric and all its data? This cannot be undone.")) return;
    deleteMetricMutation.mutate(metricId, {
      onSuccess: () => { setSelectedMetricId(null); refetchCity(); },
      onError: (err) => { alert(err instanceof Error ? err.message : "Failed to delete"); },
    });
  };

  const totalActive = activeMetrics.length;

  return (
    <div>
      {/* Toolbar */}
      <div className={styles.toolbar}>
        <div className={styles.toolbarLeft}>
          <input
            className={styles.searchInput}
            type="search"
            placeholder={`Search ${totalActive} active metrics…`}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <select className={styles.sortSelect} value={sortMode} onChange={(e) => setSortMode(e.target.value as typeof sortMode)}>
            <option value="data">Sort: Last data date</option>
            <option value="exec_desc">Sort: Last execution (newest)</option>
            <option value="exec_asc">Sort: Last execution (oldest)</option>
          </select>
        </div>
        <div className={styles.toolbarRight}>
          <button className={styles.primaryBtn} onClick={onRunAll} disabled={!totalActive}>
            <i className="fas fa-play" /> Run All Metrics
          </button>
        </div>
      </div>

      {/* Hint */}
      <p className={styles.muted} style={{ marginBottom: 16 }}>
        Click any metric to view its chart and settings. Rows with a red left border have no data yet.
        Inactive metrics are shown in the <strong>Inactive &amp; Cleanup</strong> section.
      </p>

      {/* Grouped list */}
      {totalActive === 0 ? (
        <div className={styles.emptyState}>
          {search ? `No active metrics match "${search}"` : "No active metrics for this city."}
        </div>
      ) : (
        grouped.sortedCategories.map((category) => (
          <div key={category} className={styles.categoryBlock}>
            <h4 className={styles.categoryHeading}>{category}</h4>
            <div className={styles.metricsTableContainer}>
              <table className={styles.metricsTable}>
                <thead>
                  <tr>
                    <th style={{ minWidth: 220 }}>Metric</th>
                    <th>Last data</th>
                    <th>Last run</th>
                  </tr>
                </thead>
                <tbody>
                  {grouped.g[category].metrics.map((metric) => {
                    const hasNoData = !metric.most_recent_data_date;
                    const isSuccess = metric.last_execution_status === "completed" || metric.last_execution_status === "success";
                    const isFailure = metric.last_execution_status === "failed" || metric.last_execution_status === "failure" || metric.last_execution_status === "error";
                    const isSelected = selectedMetricId === metric.id;
                    return (
                      <tr
                        key={metric.id}
                        className={`${styles.metricRow} ${hasNoData ? styles.metricRowNoData : ""} ${isSelected ? styles.metricRowSelected : ""}`}
                        style={{
                          backgroundColor: !isSelected
                            ? hasNoData
                              ? "rgba(220,38,38,0.08)"
                              : isSuccess
                              ? "rgba(34,197,94,0.07)"
                              : isFailure
                              ? "rgba(239,68,68,0.07)"
                              : undefined
                            : undefined,
                        }}
                        onClick={() => setSelectedMetricId(isSelected ? null : metric.id)}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setSelectedMetricId(isSelected ? null : metric.id); } }}
                        aria-label={`${metric.metric_name} — click to view details`}
                      >
                        <td>
                          <div className={styles.metricName}>
                            <span className={styles.metricNameText}>{metric.metric_name}</span>
                            <span className={styles.metricId}>({metric.id})</span>
                            <span className={styles.chevron}>{isSelected ? "▼" : "▶"}</span>
                          </div>
                        </td>
                        <td>
                          {metric.most_recent_data_date ? (
                            <span className={styles.metricDateText}>{formatDate(metric.most_recent_data_date)}</span>
                          ) : (
                            <span className={styles.metricDateMissing}>No data</span>
                          )}
                        </td>
                        <td>
                          <span className={`${styles.statusBadge} ${isSuccess ? styles.statusSuccess : isFailure ? styles.statusFailed : styles.statusNone}`}>
                            {metric.last_execution_at ? formatDate(metric.last_execution_at) : "Never"}
                          </span>
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

      {/* Detail panel */}
      {selectedMetric && (
        <DetailPanel
          metric={selectedMetric}
          citySlug={citySlug}
          onClose={() => setSelectedMetricId(null)}
          onEdit={() => { openEdit(selectedMetric.id); }}
          onCharts={() => { openCharts(selectedMetric.id); }}
          onMaps={() => { openMaps(selectedMetric.id); }}
          onAnomalies={() => { openAnomalies(selectedMetric.id); }}
          onExecute={() => { openExecute(selectedMetric.id); }}
          onDeactivate={() => handleDeactivate(selectedMetric)}
          onDelete={() => handleDelete(selectedMetric.id)}
        />
      )}

      {/* Modals */}
      {editModalMetricId && (
        <MetricEditModal
          metricId={editModalMetricId}
          isOpen={editModalOpen}
          onClose={() => { setEditModalOpen(false); setEditModalMetricId(null); }}
          onExecute={(id) => { setEditModalOpen(false); setEditModalMetricId(null); openExecute(id); }}
          onSave={refetchCity}
        />
      )}
      <MetricChartsModal
        metricId={chartsMetricId}
        isOpen={chartsOpen}
        onClose={() => { setChartsOpen(false); setChartsMetricId(null); }}
        metricKey={chartsMetricId ? (cityData?.metrics ?? []).find((m) => m.id === chartsMetricId)?.metric_key ?? null : null}
        citySlug={citySlug}
      />
      <MetricMapsModal
        metricId={mapsMetricId}
        metricName={(cityData?.metrics ?? []).find((m) => m.id === mapsMetricId)?.metric_name}
        isOpen={mapsOpen}
        onClose={() => { setMapsOpen(false); setMapsMetricId(null); }}
      />

      {/* Fallback anomalies view (when no parent callback provided — uses charts modal) */}
      {fallbackAnomaliesMetricId && (
        <MetricChartsModal
          metricId={fallbackAnomaliesMetricId}
          isOpen={true}
          onClose={() => setFallbackAnomaliesMetricId(null)}
          metricKey={(cityData?.metrics ?? []).find((m) => m.id === fallbackAnomaliesMetricId)?.metric_key ?? null}
          citySlug={citySlug}
        />
      )}

      {/* Execute modal */}
      {isClient && showExecuteModal && createPortal(
        <div className={metricStyles.modalOverlay} onClick={() => setShowExecuteModal(false)}>
          <div className={metricStyles.modal} onClick={(e) => e.stopPropagation()}>
            <div className={metricStyles.modalHeader}>
              <h2>Execute Metric {executeMetricId}</h2>
              <button className={metricStyles.modalClose} onClick={() => setShowExecuteModal(false)}>×</button>
            </div>
            <div className={metricStyles.modalBody}>
              <div style={{ marginBottom: 14 }}>
                <label style={{ display: "block", marginBottom: 6, fontWeight: 500, fontSize: 13 }}>Period Type</label>
                <select
                  value={executePeriodType}
                  onChange={(e) => { setExecutePeriodType(e.target.value); setExecuteStartDate(getDefaultExecuteStartDateByPeriod(e.target.value)); }}
                  style={{ width: "100%", padding: 8, borderRadius: 4, border: "1px solid var(--border-primary)", background: "var(--bg-primary)", color: "var(--text-primary)" }}
                >
                  <option value="day">Daily</option>
                  <option value="week">Weekly</option>
                  <option value="month">Monthly</option>
                  <option value="year">Yearly</option>
                  <option value="ytd">Year-to-Date</option>
                </select>
              </div>
              <div style={{ marginBottom: 14 }}>
                <label style={{ display: "block", marginBottom: 6, fontWeight: 500, fontSize: 13 }}>Start Date</label>
                <input type="date" value={executeStartDate} onChange={(e) => setExecuteStartDate(e.target.value)} style={{ width: "100%", padding: 8, borderRadius: 4, border: "1px solid var(--border-primary)", background: "var(--bg-primary)", color: "var(--text-primary)" }} />
              </div>
              <div style={{ marginBottom: 14 }}>
                <label style={{ display: "block", marginBottom: 6, fontWeight: 500, fontSize: 13 }}>End Date</label>
                <input type="date" value={executeEndDate} onChange={(e) => setExecuteEndDate(e.target.value)} style={{ width: "100%", padding: 8, borderRadius: 4, border: "1px solid var(--border-primary)", background: "var(--bg-primary)", color: "var(--text-primary)" }} />
              </div>
            </div>
            <div className={metricStyles.modalFooter}>
              <button className={metricStyles.secondaryBtn} onClick={() => setShowExecuteModal(false)}>Cancel</button>
              <button className={metricStyles.primaryBtn} onClick={runExecute} disabled={executeMetricMutation.isPending}>
                <i className="fas fa-play" /> Execute
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

// ─── Templates Section ────────────────────────────────────────────────────────

interface TemplatesSectionProps {
  cityId: number;
  cityData: CityData | null;
  availableModelsData?: ModelGroupInfo[];
}

function TemplatesSection({ cityId, cityData, availableModelsData }: TemplatesSectionProps) {
  const [showAll, setShowAll] = useState(false);
  const [modelKey, setModelKey] = useState("");
  const [showRunAllModal, setShowRunAllModal] = useState(false);
  const [runningSingleJobByTemplateId, setRunningSingleJobByTemplateId] = useState<Record<number, string>>({});
  const [runningAllJobId, setRunningAllJobId] = useState<string | null>(null);
  const { jobs } = useJobWebSocketContext();

  const templateStatusQuery = useTemplateInstantiationStatus(cityId);
  const instantiateSingleMutation = useInstantiateSingleTemplate();
  const instantiateAllMutation = useInstantiateAllTemplates();

  // Default model when models load
  useEffect(() => {
    if (availableModelsData?.length && !modelKey) {
      const key = pickDefaultModelKey(availableModelsData);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (key) setModelKey(key);
    }
  }, [availableModelsData, modelKey]);

  // Clear running state when jobs complete
  useEffect(() => {
    const terminal = new Set(["completed", "failed", "cancelled"]);
    if (runningAllJobId && jobs?.some((j) => j.job_id === runningAllJobId && terminal.has(j.status))) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setRunningAllJobId(null);
      templateStatusQuery.refetch();
    }
    const stillRunning = { ...runningSingleJobByTemplateId };
    let changed = false;
    Object.entries(stillRunning).forEach(([templateIdStr, jid]) => {
      const j = jobs?.find((x) => x.job_id === jid);
      if (j && terminal.has(j.status)) { delete stillRunning[Number(templateIdStr)]; changed = true; }
    });
    if (changed) { setRunningSingleJobByTemplateId(stillRunning); templateStatusQuery.refetch(); }
  }, [jobs, runningAllJobId, runningSingleJobByTemplateId, templateStatusQuery]);

  const metricNameById = useMemo(() => {
    const map = new Map<number, string>();
    (cityData?.metrics ?? []).forEach((m) => map.set(m.id, m.metric_name));
    return map;
  }, [cityData?.metrics]);

  const sortedRows = useMemo(() => {
    const raw = templateStatusQuery.data?.templates;
    if (!raw?.length) return [];
    return [...raw].sort((a, b) => {
      const slugCmp = templateCategorySlug(a.category, a.category_slug).localeCompare(templateCategorySlug(b.category, b.category_slug), undefined, { sensitivity: "base" });
      if (slugCmp !== 0) return slugCmp;
      const catCmp = (a.category ?? "").localeCompare(b.category ?? "", undefined, { sensitivity: "base" });
      if (catCmp !== 0) return catCmp;
      const subCmp = (a.subcategory ?? "").localeCompare(b.subcategory ?? "", undefined, { sensitivity: "base" });
      if (subCmp !== 0) return subCmp;
      return a.template_name.localeCompare(b.template_name, undefined, { sensitivity: "base" });
    });
  }, [templateStatusQuery.data?.templates]);

  const [structuringNotesTarget, setStructuringNotesTarget] = useState<{ metricId?: number | null; templateId: number } | null>(null);

  const displayRows = showAll ? sortedRows : sortedRows.filter((t) => t.status !== "instantiated");
  const uninstantiatedCount = sortedRows.filter((t) => t.status !== "instantiated").length;

  return (
    <div>
      <div className={styles.settingsBanner} style={{ background: "var(--bg-secondary)" }}>
        <strong>Template metrics</strong> are platform-level metric definitions that Seymour AI uses to find and structure city-specific data.
        Uninstantiated templates have not yet been mapped to this city&apos;s datasets.
      </div>

      {/* Toolbar */}
      <div className={styles.toolbar}>
        <div className={styles.toolbarLeft}>
          <div className={styles.templateToggle}>
            <button className={`${styles.toggleBtn} ${!showAll ? styles.toggleBtnActive : ""}`} onClick={() => setShowAll(false)}>
              Not yet set up ({uninstantiatedCount})
            </button>
            <button className={`${styles.toggleBtn} ${showAll ? styles.toggleBtnActive : ""}`} onClick={() => setShowAll(true)}>
              All templates ({sortedRows.length})
            </button>
          </div>
        </div>
        <div className={styles.toolbarRight}>
          {availableModelsData && (
            <select className={styles.sortSelect} value={modelKey} onChange={(e) => setModelKey(e.target.value)} disabled={instantiateAllMutation.isPending || !!runningAllJobId}>
              {availableModelsData.flatMap((g) => (g.models || []).map((m) => (
                <option key={m.key} value={m.key} disabled={!m.is_available}>{m.key}{!m.is_available ? " (no key)" : ""}</option>
              )))}
            </select>
          )}
          <button
            className={styles.primaryBtn}
            onClick={() => setShowRunAllModal(true)}
            disabled={instantiateAllMutation.isPending || !!runningAllJobId}
          >
            {runningAllJobId ? <><span className={styles.spinner} /> Running…</> : "Run all templates"}
          </button>
        </div>
      </div>

      {templateStatusQuery.isLoading ? (
        <div className={styles.muted} style={{ padding: "24px", textAlign: "center" }}><span className={styles.spinner} /> Loading…</div>
      ) : displayRows.length === 0 ? (
        <div className={styles.emptyState}>
          {showAll ? "No templates configured for this city." : "All templates have been instantiated!"}
        </div>
      ) : (
        <div className={styles.metricsTableContainer}>
          <table className={styles.metricsTable}>
            <thead>
              <tr>
                <th style={{ minWidth: 220 }}>Template</th>
                <th>Mapped metric</th>
                <th style={{ width: 140 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {displayRows.map((t, index) => {
                const jobId = runningSingleJobByTemplateId[t.template_id];
                const job = jobId ? jobs?.find((j) => j.job_id === jobId) : null;
                const isRunning = !!jobId && job && (job.status === "pending" || job.status === "running");
                const isInstantiated = t.status === "instantiated";
                const categoryLabel = t.category?.trim() ? t.category : "Uncategorized";
                const subcategoryLabel = t.subcategory?.trim() || "";
                const prev = index > 0 ? displayRows[index - 1] : null;
                const prevCategory = prev ? (prev.category?.trim() ? prev.category : "Uncategorized") : null;
                const prevSubcategory = prev?.subcategory?.trim() || "";
                const showCategory = prevCategory !== categoryLabel;
                const showSubcategory = !!subcategoryLabel && (showCategory || prevSubcategory !== subcategoryLabel);
                const mappedName = t.metric_id != null ? metricNameById.get(t.metric_id) : undefined;

                return (
                  <Fragment key={t.template_id}>
                    {showCategory && <tr className={styles.templateCategoryRow}><td colSpan={3}>{categoryLabel}</td></tr>}
                    {showSubcategory && <tr className={styles.templateSubcategoryRow}><td colSpan={3}>{subcategoryLabel}</td></tr>}
                    <tr style={{ opacity: isInstantiated ? 0.9 : 0.7, backgroundColor: isRunning ? "rgba(99,102,241,0.05)" : undefined }}>
                      <td>
                        <div style={{ fontWeight: 500, color: isInstantiated ? "var(--text-primary)" : "var(--text-secondary)", display: "flex", alignItems: "center", gap: 6 }}>
                          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.template_name}</span>
                          <span className={styles.metricId}>(template {t.template_id})</span>
                        </div>
                        {isRunning && job?.status_message && (
                          <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 2 }}>{job.status_message}</div>
                        )}
                      </td>
                      <td>
                        {isInstantiated && t.metric_id != null ? (
                          <span style={{ fontSize: 12, color: "var(--color-success, #22c55e)" }}>
                            {mappedName ? `${mappedName} ` : ""}#{t.metric_id}
                          </span>
                        ) : (
                          <span style={{ fontSize: 12, color: "var(--text-tertiary)" }}>—</span>
                        )}
                      </td>
                      <td>
                        <div className={styles.templateMetricActions}>
                          <button
                            onClick={async () => {
                              try {
                                const result = await instantiateSingleMutation.mutateAsync({ cityId, templateId: t.template_id, modelKey: modelKey || undefined });
                                setRunningSingleJobByTemplateId((prev) => ({ ...prev, [t.template_id]: result.job_id }));
                                notifyJobCreated(result.job_id);
                              } catch (err) {
                                alert("Failed: " + (err instanceof Error ? err.message : String(err)));
                              }
                            }}
                            disabled={isRunning || instantiateSingleMutation.isPending}
                            style={{ padding: "4px 10px", background: isRunning || instantiateSingleMutation.isPending ? "var(--text-secondary)" : "var(--brand-accent, #6366f1)", color: "#fff", border: "none", borderRadius: 4, fontSize: 11, fontWeight: 500, cursor: isRunning ? "wait" : "pointer" }}
                          >
                            {isRunning ? "Running…" : isInstantiated ? "Re-run" : "Run"}
                          </button>
                          <button
                            onClick={() => setStructuringNotesTarget({ metricId: t.metric_id, templateId: t.template_id })}
                            style={{ padding: "4px 8px", background: "transparent", color: "var(--text-secondary)", border: "1px solid var(--border-primary)", borderRadius: 4, fontSize: 11, fontWeight: 500, cursor: "pointer" }}
                            title="View AI structuring notes"
                          >
                            <i className="fas fa-clipboard-list" style={{ marginRight: 3 }} /> Notes
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

      {/* Run all confirmation modal */}
      {showRunAllModal && (
        <div className={styles.confirmOverlay} onClick={() => setShowRunAllModal(false)}>
          <div className={styles.confirmBox} onClick={(e) => e.stopPropagation()}>
            <p className={styles.confirmTitle}>Run all templates</p>
            <p style={{ fontSize: 14, marginBottom: 16, color: "var(--text-secondary)" }}>
              Run all templates for this city. Choose whether to skip templates that already have a mapped metric.
            </p>
            <div className={styles.confirmActions}>
              <button className={styles.secondaryBtn} onClick={() => setShowRunAllModal(false)}>Cancel</button>
              <button
                style={{ padding: "7px 14px", background: "#eab308", color: "#000", border: "none", borderRadius: 6, fontSize: 13, fontWeight: 500, cursor: "pointer" }}
                onClick={async () => {
                  setShowRunAllModal(false);
                  try {
                    const result = await instantiateAllMutation.mutateAsync({ cityId, modelKey: modelKey || undefined, onlyMissing: false });
                    setRunningAllJobId(result.job_id);
                    notifyJobCreated(result.job_id);
                  } catch (err) { alert("Failed: " + (err instanceof Error ? err.message : String(err))); }
                }}
              >Run all (incl. existing)</button>
              <button
                className={styles.primaryBtn}
                onClick={async () => {
                  setShowRunAllModal(false);
                  try {
                    const result = await instantiateAllMutation.mutateAsync({ cityId, modelKey: modelKey || undefined, onlyMissing: true });
                    setRunningAllJobId(result.job_id);
                    notifyJobCreated(result.job_id);
                  } catch (err) { alert("Failed: " + (err instanceof Error ? err.message : String(err))); }
                }}
              >Run missing only</button>
            </div>
          </div>
        </div>
      )}

      <StructuringNotesModal
        metricId={structuringNotesTarget?.metricId}
        templateId={structuringNotesTarget?.templateId}
        cityId={cityId}
        isOpen={structuringNotesTarget != null}
        onClose={() => setStructuringNotesTarget(null)}
      />
    </div>
  );
}

// ─── Display Settings Section ─────────────────────────────────────────────────

interface DisplaySettingsSectionProps {
  cityId: number;
  cityData: CityData | null;
}

function DisplaySettingsSection({ cityId, cityData }: DisplaySettingsSectionProps) {
  const dashboardMetrics = useMemo(
    () => (cityData?.metrics ?? []).filter((m) => m.show_on_dash === true),
    [cityData?.metrics]
  );

  return (
    <div>
      <div className={styles.settingsBanner}>
        <strong>Display Settings</strong> control how metrics appear on this city&apos;s public dashboard — including the order of categories, category names, and the order of metrics within each category.
        Only metrics with &ldquo;Show on dashboard&rdquo; enabled appear here and in the public metric order.
      </div>
      {dashboardMetrics.length === 0 ? (
        <div className={styles.emptyState}>No metrics are currently set to show on the dashboard. Edit a metric&apos;s settings to enable this.</div>
      ) : (
        <MetricOrderEditor cityId={cityId} metrics={dashboardMetrics as any[]} />
      )}
    </div>
  );
}

// ─── Cleanup Section ──────────────────────────────────────────────────────────

interface CleanupSectionProps {
  cityId: number;
  cityData: CityData | null;
  refetchCity: () => void;
}

function CleanupSection({ cityId, cityData, refetchCity }: CleanupSectionProps) {
  const { getAccessTokenSilently } = useAuth0();
  const [recordCounts, setRecordCounts] = useState<Record<number, any> | null>(null);
  const [loadingCounts, setLoadingCounts] = useState(false);
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const deleteMetricMutation = useDeleteMetric();

  const inactiveMetrics = useMemo(() => (cityData?.metrics ?? []).filter((m) => m.is_active === false), [cityData?.metrics]);
  const noDataMetrics = useMemo(() => (cityData?.metrics ?? []).filter((m) => m.is_active !== false && !m.most_recent_data_date), [cityData?.metrics]);

  // Auto-load record counts for inactive metrics on mount
  useEffect(() => {
    if (!inactiveMetrics.length || loadingCounts || recordCounts) return;
    const load = async () => {
      try {
        setLoadingCounts(true);
        const token = await getAccessTokenSilently();
        const response = await getMetricRecordCounts(cityId, token);
        setRecordCounts(response.counts);
      } catch (err) {
        console.error("Failed to load record counts:", err);
      } finally {
        setLoadingCounts(false);
      }
    };
    load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cityId, inactiveMetrics.length]);

  const handleReactivate = async (metric: Metric) => {
    if (!confirm(`Reactivate "${metric.metric_name}"?`)) return;
    try {
      const token = await getAccessTokenSilently();
      await updateAdminMetric(metric.id, { is_active: true }, token);
      refetchCity();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed");
    }
  };

  const handlePurge = async (metric: Metric) => {
    if (!confirm(`Purge all data for "${metric.metric_name}"? The metric definition is kept but all time series data will be deleted.`)) return;
    try {
      const token = await getAccessTokenSilently();
      const result = await purgeAdminMetricData(metric.id, token);
      alert(`Purged: ${result.deleted_time_series_data} data rows, ${result.deleted_anomaly_results} anomalies.`);
      refetchCity();
      setRecordCounts(null);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to purge");
    }
  };

  const handleDelete = (metric: Metric) => {
    if (!confirm(`Delete "${metric.metric_name}" and ALL its data permanently? This cannot be undone.`)) return;
    deleteMetricMutation.mutate(metric.id, {
      onSuccess: () => { refetchCity(); setRecordCounts(null); },
      onError: (err) => { alert(err instanceof Error ? err.message : "Failed to delete"); },
    });
  };

  const handleBulkDelete = async () => {
    setBulkDeleting(true);
    setConfirmBulkDelete(false);
    const errors: string[] = [];
    for (const metric of inactiveMetrics) {
      try {
        await new Promise<void>((resolve, reject) => {
          deleteMetricMutation.mutate(metric.id, { onSuccess: () => resolve(), onError: (e) => reject(e) });
        });
      } catch (err) {
        errors.push(`${metric.metric_name}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    setBulkDeleting(false);
    refetchCity();
    setRecordCounts(null);
    if (errors.length) alert(`Completed with errors:\n${errors.join("\n")}`);
    else alert(`Deleted ${inactiveMetrics.length} inactive metrics.`);
  };

  const hasAnyIssues = inactiveMetrics.length > 0 || noDataMetrics.length > 0;

  if (!hasAnyIssues) {
    return (
      <div className={styles.emptyState}>
        <i className="fas fa-check-circle" style={{ fontSize: 24, color: "#22c55e", marginBottom: 8 }} />
        <div>No inactive metrics or metrics missing data. All looks good.</div>
      </div>
    );
  }

  return (
    <div>
      {/* Inactive metrics */}
      {inactiveMetrics.length > 0 && (
        <>
          <div className={styles.cleanupBanner}>
            <strong>{inactiveMetrics.length} inactive metric{inactiveMetrics.length !== 1 ? "s" : ""}</strong> — these metrics are deactivated but their definitions and any existing data remain in the database.
            Reactivate them to resume collection, purge their data to keep the definition but free up storage, or delete them entirely.
          </div>
          <div className={styles.cleanupToolbar}>
            <span className={styles.muted}>
              {loadingCounts ? <><span className={styles.spinner} /> Loading data counts…</> : "Record counts loaded automatically."}
            </span>
            <button
              className={styles.dangerBtn}
              onClick={() => setConfirmBulkDelete(true)}
              disabled={bulkDeleting}
            >
              {bulkDeleting ? <><span className={styles.spinner} /> Deleting…</> : `Delete all ${inactiveMetrics.length} inactive`}
            </button>
          </div>

          <div className={styles.metricsTableContainer}>
            <table className={styles.metricsTable}>
              <thead>
                <tr>
                  <th style={{ minWidth: 200 }}>Metric</th>
                  <th>DB records</th>
                  <th>Last data</th>
                  <th style={{ width: 240 }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {inactiveMetrics.map((metric) => {
                  const counts = recordCounts?.[metric.id];
                  const totalRecords = counts?.total_active != null || counts?.total_inactive != null
                    ? ((counts.total_active ?? 0) + (counts.total_inactive ?? 0))
                    : null;
                  return (
                    <tr key={metric.id} style={{ opacity: 0.8, background: "rgba(220,38,38,0.04)" }}>
                      <td>
                        <div className={styles.metricName}>
                          <span className={styles.metricNameText}>{metric.metric_name}</span>
                          <span className={styles.metricId}>({metric.id})</span>
                        </div>
                        {metric.category && <div style={{ fontSize: 10, color: "var(--text-tertiary)", marginTop: 2 }}>{metric.category}</div>}
                      </td>
                      <td>
                        {loadingCounts ? (
                          <span className={styles.muted}><span className={styles.spinner} /></span>
                        ) : totalRecords != null ? (
                          <span style={{ fontSize: 12, color: totalRecords > 0 ? "var(--text-primary)" : "var(--text-tertiary)" }}>
                            {totalRecords.toLocaleString()}
                          </span>
                        ) : (
                          <span className={styles.muted}>—</span>
                        )}
                      </td>
                      <td>
                        <span className={styles.metricDateText}>{formatDate(metric.most_recent_data_date)}</span>
                      </td>
                      <td>
                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                          <button
                            className={styles.secondaryBtn}
                            style={{ fontSize: 11, padding: "4px 10px" }}
                            onClick={() => handleReactivate(metric)}
                          >
                            <i className="fas fa-undo" /> Reactivate
                          </button>
                          <button
                            className={styles.secondaryBtn}
                            style={{ fontSize: 11, padding: "4px 10px", color: "#d97706", borderColor: "#d97706" }}
                            onClick={() => handlePurge(metric)}
                          >
                            <i className="fas fa-database" /> Purge data
                          </button>
                          <button
                            className={styles.dangerBtn}
                            style={{ fontSize: 11, padding: "4px 10px" }}
                            onClick={() => handleDelete(metric)}
                          >
                            <i className="fas fa-trash" /> Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Active metrics with no data */}
      {noDataMetrics.length > 0 && (
        <>
          <div className={styles.cleanupSubheading} style={{ marginTop: inactiveMetrics.length > 0 ? 32 : 0 }}>
            Active metrics with no data ({noDataMetrics.length})
          </div>
          <p className={styles.muted} style={{ marginBottom: 12 }}>
            These metrics are active but have never collected data. They may need to be configured and executed, or deleted if not applicable.
          </p>
          <div className={styles.metricsTableContainer}>
            <table className={styles.metricsTable}>
              <thead>
                <tr>
                  <th style={{ minWidth: 200 }}>Metric</th>
                  <th>Category</th>
                  <th>Last run</th>
                  <th style={{ width: 160 }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {noDataMetrics.map((metric) => {
                  const isFailure = metric.last_execution_status === "failed" || metric.last_execution_status === "failure" || metric.last_execution_status === "error";
                  return (
                    <tr key={metric.id} style={{ borderLeft: "3px solid rgba(220,38,38,0.6)" }}>
                      <td>
                        <div className={styles.metricName}>
                          <span className={styles.metricNameText}>{metric.metric_name}</span>
                          <span className={styles.metricId}>({metric.id})</span>
                        </div>
                      </td>
                      <td><span className={styles.muted}>{metric.category || "—"}</span></td>
                      <td>
                        {metric.last_execution_at ? (
                          <span className={`${styles.statusBadge} ${isFailure ? styles.statusFailed : styles.statusNone}`}>
                            {formatDate(metric.last_execution_at)}
                          </span>
                        ) : (
                          <span className={styles.muted}>Never run</span>
                        )}
                      </td>
                      <td>
                        <div style={{ display: "flex", gap: 6 }}>
                          <button
                            className={styles.dangerBtn}
                            style={{ fontSize: 11, padding: "4px 10px" }}
                            onClick={() => handleDelete(metric)}
                          >
                            <i className="fas fa-trash" /> Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Bulk delete confirm */}
      {confirmBulkDelete && (
        <div className={styles.confirmOverlay} onClick={() => setConfirmBulkDelete(false)}>
          <div className={styles.confirmBox} onClick={(e) => e.stopPropagation()}>
            <p className={styles.confirmTitle}>Delete {inactiveMetrics.length} inactive metrics?</p>
            <p className={styles.muted} style={{ marginBottom: 8 }}>The following metrics and ALL their data will be permanently deleted:</p>
            <ul className={styles.confirmList}>
              {inactiveMetrics.map((m) => <li key={m.id}>{m.metric_name} (#{m.id})</li>)}
            </ul>
            <div className={styles.confirmActions}>
              <button className={styles.secondaryBtn} onClick={() => setConfirmBulkDelete(false)}>Cancel</button>
              <button className={styles.dangerBtn} onClick={handleBulkDelete}>Delete all {inactiveMetrics.length}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function CityMetricsTab({
  cityId,
  cityData,
  availableModelsData,
  refetchCity,
  onViewAnomalies,
}: CityMetricsTabProps) {
  const [section, setSection] = useState<MetricsSection>("metrics");
  const [runAllMetricsOpen, setRunAllMetricsOpen] = useState(false);

  const allMetrics = cityData?.metrics ?? [];
  const activeCount = allMetrics.filter((m) => m.is_active !== false).length;
  const inactiveCount = allMetrics.filter((m) => m.is_active === false).length;
  const noDataCount = allMetrics.filter((m) => m.is_active !== false && !m.most_recent_data_date).length;
  const cleanupCount = inactiveCount + noDataCount;

  // Template counts need the instantiation status — we pass the query down to TemplatesSection
  // For the nav badge, use inlinedata: count metrics with no template_id mapping
  // We can't easily get uninstantiated count without the hook; TemplatesSection owns that.
  // We'll just use "Templates" without a count badge to avoid double-fetching.

  return (
    <div>
      {/* Sub-section nav */}
      <nav className={styles.sectionNav} aria-label="Metrics sub-sections">
        <button
          className={`${styles.sectionBtn} ${section === "metrics" ? styles.sectionBtnActive : ""}`}
          onClick={() => setSection("metrics")}
        >
          Metrics
          {activeCount > 0 && <span className={styles.badge}>{activeCount}</span>}
        </button>
        <button
          className={`${styles.sectionBtn} ${section === "templates" ? styles.sectionBtnActive : ""}`}
          onClick={() => setSection("templates")}
        >
          Templates
        </button>
        <button
          className={`${styles.sectionBtn} ${section === "settings" ? styles.sectionBtnActive : ""}`}
          onClick={() => setSection("settings")}
        >
          Display Settings
        </button>
        <button
          className={`${styles.sectionBtn} ${section === "cleanup" ? styles.sectionBtnActive : ""}`}
          onClick={() => setSection("cleanup")}
        >
          Inactive &amp; Cleanup
          {cleanupCount > 0 && <span className={`${styles.badge} ${styles.badgeWarning}`}>{cleanupCount}</span>}
        </button>
      </nav>

      {/* Sections */}
      {section === "metrics" && (
        <MetricsSection
          cityId={cityId}
          cityData={cityData}
          refetchCity={refetchCity}
          onRunAll={() => setRunAllMetricsOpen(true)}
          onViewAnomalies={onViewAnomalies}
        />
      )}
      {section === "templates" && (
        <TemplatesSection
          cityId={cityId}
          cityData={cityData}
          availableModelsData={availableModelsData}
        />
      )}
      {section === "settings" && (
        <DisplaySettingsSection cityId={cityId} cityData={cityData} />
      )}
      {section === "cleanup" && (
        <CleanupSection
          cityId={cityId}
          cityData={cityData}
          refetchCity={refetchCity}
        />
      )}

      {/* Run All Metrics modal (accessible from any section) */}
      <RunAllMetricsModal
        isOpen={runAllMetricsOpen}
        onClose={() => setRunAllMetricsOpen(false)}
        cityId={cityId}
        cityName={cityData?.name || cityData?.city_name || `City ${cityId}`}
        metrics={(cityData?.metrics || []) as any[]}
      />
    </div>
  );
}

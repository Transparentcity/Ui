"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { MouseEvent as ReactMouseEvent } from "react";
import { useAuth0 } from "@auth0/auth0-react";
import { useQueryClient } from "@tanstack/react-query";

import {
  type CreateAdminMetricRequest,
  exportAdminMetrics,
  exportAdminPlatformMetadata,
  importAdminMetrics,
  importAdminPlatformMetadata,
  refreshAllShapeLayerGeometries,
  getDefaultExecuteStartDateByPeriod,
} from "@/lib/apiClient";
import { isRecoverableAuth0TokenError } from "@/lib/auth0AccessToken";
import {
  ADMIN_API_ACCESS_TOKEN_QUERY_KEY,
  useMetrics,
  useMetricsSummary,
  useMetricCategories,
  useMetricTypes,
  useMetricCities,
  useCreateMetric,
  useDeleteMetric,
  useExecuteMetric,
  usePurgeMetricData,
  useClearCityMetricData,
} from "@/lib/hooks/useMetrics";
import { notifyJobCreated } from "@/lib/useJobWebSocket";

import ShapeLayerTemplatesAdmin from "@/components/ShapeLayerTemplatesAdmin";
import MetricChainAdmin from "@/components/MetricChainAdmin";
import MetricActions from "@/components/MetricActions";
import MetricEditModal from "@/components/MetricEditModal";
import MetricChartsModal from "@/components/MetricChartsModal";
import MetricMapsModal from "@/components/MetricMapsModal";
import TemplatesSection from "./TemplatesSection";
import styles from "./PlatformMetricsAdmin.module.css";
import metricStyles from "@/components/MetricsAdmin.module.css";

// ─── Types ───────────────────────────────────────────────────────────────────

type PlatformSection = "templates" | "chains" | "shapes" | "metrics";
type StatusFilter = "" | "true" | "false";
type LastRunFilter = "" | "failed" | "completed" | "never";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function isLikelyAuthError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const e = error as { status?: number; message?: unknown };
  if (e.status === 401) return true;
  return isRecoverableAuth0TokenError(error);
}

function formatDate(value?: string | null): string {
  if (!value) return "—";
  const dt = new Date(value);
  return Number.isNaN(dt.getTime()) ? value : dt.toLocaleDateString();
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function PlatformMetricsAdmin() {
  const { getAccessTokenSilently, loginWithRedirect } = useAuth0();
  const queryClient = useQueryClient();

  // ── Section state ──────────────────────────────────────────────────────────
  const [section, setSection] = useState<PlatformSection>("metrics");

  // ── Admin token (for cross-city chart) ────────────────────────────────────
  const [adminToken, setAdminToken] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    getAccessTokenSilently()
      .then((token) => { if (!cancelled) setAdminToken(token); })
      .catch((err) => { if (!cancelled && !isRecoverableAuth0TokenError(err)) setAdminToken(null); });
    return () => { cancelled = true; };
  }, [getAccessTokenSilently]);

  // ── Metrics section filters ────────────────────────────────────────────────
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("");
  const [selectedType, setSelectedType] = useState("");
  const [selectedStatus, setSelectedStatus] = useState<StatusFilter>("");
  const [selectedLastRunStatus, setSelectedLastRunStatus] = useState<LastRunFilter>("");
  const [selectedTemplateId, setSelectedTemplateId] = useState<number | null>(null);
  const [citySearchQuery, setCitySearchQuery] = useState("");
  const [selectedCityId, setSelectedCityId] = useState<number | null>(null);
  const [showCityDropdown, setShowCityDropdown] = useState(false);
  const [pinnedActionsMetricId, setPinnedActionsMetricId] = useState<number | null>(null);
  const [showExportImport, setShowExportImport] = useState(false);

  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const hideDropdownTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // ── Queries ────────────────────────────────────────────────────────────────
  const summaryQuery = useMetricsSummary();
  const categoriesQuery = useMetricCategories();
  const typesQuery = useMetricTypes();
  const citiesQuery = useMetricCities();

  const metricsQuery = useMetrics({
    limit: selectedTemplateId != null ? 500 : 100,
    search: debouncedSearchQuery || undefined,
    category: selectedCategory || undefined,
    metric_type: selectedType || undefined,
    is_active: selectedStatus === "" ? undefined : selectedStatus === "true",
    city_id: selectedCityId || undefined,
    template_id: selectedTemplateId ?? undefined,
    last_execution_status: selectedLastRunStatus || undefined,
    include_record_counts: false,
  });

  const templatesQuery = useMetrics({
    metric_type: "template",
    limit: 200,
    include_record_counts: false,
  });

  // ── Mutations ──────────────────────────────────────────────────────────────
  const createMetricMutation = useCreateMetric();
  const deleteMetricMutation = useDeleteMetric();
  const executeMetricMutation = useExecuteMetric();
  const purgeMetricDataMutation = usePurgeMetricData();
  const clearCityMetricDataMutation = useClearCityMetricData();

  // ── Modals ─────────────────────────────────────────────────────────────────
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editModalMetricId, setEditModalMetricId] = useState<number | null>(null);
  const [chartsOpen, setChartsOpen] = useState(false);
  const [chartsMetricId, setChartsMetricId] = useState<number | null>(null);
  const [mapsOpen, setMapsOpen] = useState(false);
  const [mapsMetricId, setMapsMetricId] = useState<number | null>(null);
  const [showExecuteModal, setShowExecuteModal] = useState(false);
  const [executeMetricId, setExecuteMetricId] = useState<number | null>(null);
  const [executePeriodType, setExecutePeriodType] = useState<string>("day");
  const [executeStartDate, setExecuteStartDate] = useState<string>("");
  const [executeEndDate, setExecuteEndDate] = useState<string>("");

  // Legacy create modal
  const [editOpen, setEditOpen] = useState(false);
  const [editForm, setEditForm] = useState({
    metric_name: "",
    metric_key: "",
    category: "",
    subcategory: "",
    summary: "",
    definition: "",
    is_active: true,
    show_on_dash: false,
    date_field: "",
    endpoint: "",
    aggregation_type: "COUNT",
  });

  // Export / Import
  const [platformExporting, setPlatformExporting] = useState(false);
  const [platformImporting, setPlatformImporting] = useState(false);
  const [platformImportFile, setPlatformImportFile] = useState<File | null>(null);
  const [platformImportTargetCityId, setPlatformImportTargetCityId] = useState<number | null>(null);
  const [includeShapefileGeometry, setIncludeShapefileGeometry] = useState(false);
  const [refreshingGeometries, setRefreshingGeometries] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importTargetCityId, setImportTargetCityId] = useState<number | null>(null);

  // ── Derived ────────────────────────────────────────────────────────────────
  const summary = summaryQuery.data ?? null;
  const categories = categoriesQuery.data ?? [];
  const types = typesQuery.data ?? [];
  const cities = citiesQuery.data ?? [];

  const metrics = useMemo(() => {
    const filtered = metricsQuery.data ?? [];
    return [...filtered].sort((a, b) => {
      const catCmp = (a.category ?? "").localeCompare(b.category ?? "", undefined, { sensitivity: "base" });
      if (catCmp !== 0) return catCmp;
      return (a.metric_name ?? "").localeCompare(b.metric_name ?? "", undefined, { sensitivity: "base" });
    });
  }, [metricsQuery.data]);

  const loading = metricsQuery.isLoading;
  const firstError =
    summaryQuery.error || categoriesQuery.error || typesQuery.error || citiesQuery.error || metricsQuery.error || null;
  const isAuthError = isLikelyAuthError(firstError);
  const error = firstError && !isAuthError ? (firstError as Error).message || "Failed to load data" : null;

  const selectedCityDisplayName = useMemo(() => {
    if (!selectedCityId) return "";
    return cities.find((c) => c.id === selectedCityId)?.display_name || "";
  }, [cities, selectedCityId]);

  const filteredCities = useMemo(() => {
    const q = citySearchQuery.toLowerCase().trim();
    if (!q) return cities.slice(0, 50);
    return cities.filter((c) => c.display_name.toLowerCase().includes(q)).slice(0, 50);
  }, [cities, citySearchQuery]);

  const templateNameById = useMemo(() => {
    const map = new Map<number, string>();
    for (const t of templatesQuery.data ?? []) map.set(t.id, t.metric_name);
    return map;
  }, [templatesQuery.data]);

  const sortedTemplates = useMemo(
    () => [...(templatesQuery.data ?? [])].sort((a, b) =>
      a.metric_name.localeCompare(b.metric_name, undefined, { sensitivity: "base" })
    ),
    [templatesQuery.data]
  );

  const tableEmpty = !loading && metrics.length === 0;

  // ── Effects ────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    searchTimeoutRef.current = setTimeout(() => setDebouncedSearchQuery(searchQuery), 500);
    return () => { if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current); };
  }, [searchQuery]);

  useEffect(() => {
    if (selectedCityId && selectedCityDisplayName) setCitySearchQuery(selectedCityDisplayName);
  }, [selectedCityId, selectedCityDisplayName]);

  useEffect(() => {
    setPinnedActionsMetricId(null);
  }, [selectedTemplateId, selectedCityId, debouncedSearchQuery, selectedCategory, selectedType, selectedStatus, selectedLastRunStatus]);

  // ── Handlers ──────────────────────────────────────────────────────────────

  const openEditModal = (metricId: number) => { setEditModalMetricId(metricId); setEditModalOpen(true); };
  const closeEditModal = () => { setEditModalOpen(false); setEditModalMetricId(null); };

  const openCharts = (metricId: number) => { setChartsMetricId(metricId); setChartsOpen(true); };
  const closeCharts = () => { setChartsOpen(false); setChartsMetricId(null); };

  const openMaps = (metricId: number) => { setMapsMetricId(metricId); setMapsOpen(true); };
  const closeMaps = () => { setMapsOpen(false); setMapsMetricId(null); };

  const openExecuteModal = (metricId: number) => {
    const periodType = "day";
    setExecuteMetricId(metricId);
    setExecutePeriodType(periodType);
    setExecuteStartDate(getDefaultExecuteStartDateByPeriod(periodType));
    setExecuteEndDate(new Date().toISOString().split("T")[0]);
    setShowExecuteModal(true);
  };

  const onExecutePeriodTypeChange = (p: string) => {
    setExecutePeriodType(p);
    setExecuteStartDate(getDefaultExecuteStartDateByPeriod(p));
  };

  const closeExecuteModal = () => { setShowExecuteModal(false); setExecuteMetricId(null); };

  const executeMetric = () => {
    if (!executeMetricId) return;
    executeMetricMutation.mutate(
      { metricId: executeMetricId, payload: { period_type: executePeriodType, start_date: executeStartDate || null, end_date: executeEndDate || null } },
      {
        onSuccess: (res) => { notifyJobCreated(res.job_id); alert(`Execution started. Job: ${res.job_id}`); closeExecuteModal(); },
        onError: (err) => alert(err instanceof Error ? err.message : "Failed to execute"),
      }
    );
  };

  const deleteMetric = (metricId: number) => {
    if (!confirm("Delete this metric? This cannot be undone.")) return;
    deleteMetricMutation.mutate(metricId, {
      onSuccess: (res) => alert(res.message || `Deleted metric ${metricId}`),
      onError: (err) => alert(err instanceof Error ? err.message : "Failed to delete"),
    });
  };

  const purgeMetricData = (metricId: number, metricName: string) => {
    if (!confirm(`Clear all data for "${metricName}"?\n\nThe metric definition is kept. This cannot be undone.`)) return;
    purgeMetricDataMutation.mutate({ metricId }, {
      onSuccess: (res) => { alert(res.message || `Cleared data for ${(res as any).metric_name}`); metricsQuery.refetch(); summaryQuery.refetch(); },
      onError: (err) => alert(err instanceof Error ? err.message : "Failed to purge"),
    });
  };

  const clearCityData = (cityId: number | null) => {
    const scope = cityId ? `city "${cities.find((c) => c.id === cityId)?.display_name ?? cityId}"` : "all cities";
    if (!confirm(`Clear all metric data for ${scope}?\n\nThis removes time series, anomalies, maps, feed stories. Metrics and users are kept.`)) return;
    clearCityMetricDataMutation.mutate({ cityId }, {
      onSuccess: (res) => { alert(res.message || `Cleared records for ${scope}`); metricsQuery.refetch(); summaryQuery.refetch(); },
      onError: (err) => alert(err instanceof Error ? err.message : "Failed to clear"),
    });
  };

  const openCreate = () => {
    setEditForm({ metric_name: "", metric_key: "", category: "", subcategory: "", summary: "", definition: "", is_active: true, show_on_dash: false, date_field: "", endpoint: "", aggregation_type: "COUNT" });
    setEditOpen(true);
  };

  const closeEdit = () => setEditOpen(false);

  const saveEdit = () => {
    if (!editForm.metric_name.trim() || !editForm.category.trim()) { alert("Please fill in Metric Name and Category."); return; }
    if (!editForm.metric_key.trim() || !editForm.date_field.trim() || !editForm.endpoint.trim()) { alert("Please fill Metric Key, Date Field, and Endpoint."); return; }
    const payload: CreateAdminMetricRequest = {
      metric_name: editForm.metric_name.trim(),
      metric_key: editForm.metric_key.trim(),
      category: editForm.category.trim(),
      subcategory: editForm.subcategory.trim() || null,
      summary: editForm.summary.trim() || null,
      definition: editForm.definition.trim() || null,
      date_field: editForm.date_field.trim(),
      endpoint: editForm.endpoint.trim(),
      aggregation_type: editForm.aggregation_type,
      is_active: editForm.is_active,
      show_on_dash: editForm.show_on_dash,
    };
    createMetricMutation.mutate(payload, {
      onSuccess: (res) => { alert(res.message || `Created metric`); closeEdit(); metricsQuery.refetch(); },
      onError: (err) => alert(err instanceof Error ? err.message : "Failed to create"),
    });
  };

  const handleMetricRowPointerToggle = useCallback(
    (e: ReactMouseEvent<HTMLTableRowElement>, metricId: number) => {
      if ((e.target as HTMLElement).closest("[data-metric-actions-wrap]")) return;
      const coarse = typeof window !== "undefined" && (window.matchMedia("(pointer: coarse)").matches || window.matchMedia("(hover: none)").matches);
      if (!coarse) return;
      setPinnedActionsMetricId((prev) => (prev === metricId ? null : metricId));
    },
    []
  );

  const setCityFromDropdown = (cityId: number, displayName: string) => {
    setSelectedCityId(cityId);
    setCitySearchQuery(displayName);
    setShowCityDropdown(false);
  };

  const clearCity = () => { setSelectedCityId(null); setCitySearchQuery(""); setShowCityDropdown(false); };

  const scheduleHideDropdown = () => {
    if (hideDropdownTimeoutRef.current) clearTimeout(hideDropdownTimeoutRef.current);
    hideDropdownTimeoutRef.current = setTimeout(() => setShowCityDropdown(false), 150);
  };

  const cancelHideDropdown = () => {
    if (hideDropdownTimeoutRef.current) clearTimeout(hideDropdownTimeoutRef.current);
  };

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div className={metricStyles.metricsAdmin}>
      {/* Error banner */}
      {(error || isAuthError) && (
        <div className={styles.errorBanner}>
          {isAuthError ? (
            <>
              <span>Session expired or authentication failed.</span>
              <button type="button" onClick={() => loginWithRedirect()} style={{ textDecoration: "underline", cursor: "pointer", background: "none", border: "none", color: "inherit", font: "inherit" }}>Sign in again</button>
              <button type="button" onClick={() => { void queryClient.invalidateQueries({ queryKey: [...ADMIN_API_ACCESS_TOKEN_QUERY_KEY] }); metricsQuery.refetch(); summaryQuery.refetch(); }} style={{ textDecoration: "underline", cursor: "pointer", background: "none", border: "none", color: "inherit", font: "inherit" }}>Retry</button>
            </>
          ) : (
            String(error)
          )}
        </div>
      )}

      {/* ── Section switcher ──────────────────────────────────────────────── */}
      <nav className={styles.sectionNav} aria-label="Platform admin sections">
        {([
          { key: "metrics" as PlatformSection, label: "All Metrics", icon: "fa-chart-bar" },
          { key: "templates" as PlatformSection, label: "Templates", icon: "fa-layer-group" },
          { key: "chains" as PlatformSection, label: "Causal Chains", icon: "fa-project-diagram" },
          { key: "shapes" as PlatformSection, label: "Shape Layers", icon: "fa-draw-polygon" },
        ]).map(({ key, label, icon }) => (
          <button
            key={key}
            className={`${styles.sectionBtn} ${section === key ? styles.sectionBtnActive : ""}`}
            onClick={() => setSection(key)}
            aria-current={section === key ? "true" : undefined}
          >
            <i className={`fas ${icon}`} />
            {label}
          </button>
        ))}
      </nav>

      {/* ── Templates ────────────────────────────────────────────────────── */}
      {section === "templates" && (
        <TemplatesSection adminToken={adminToken} />
      )}

      {/* ── Causal Chains ────────────────────────────────────────────────── */}
      {section === "chains" && (
        <div>
          <p className={styles.sectionDescription}>
            Define cause-and-effect relationships between metrics. Chains power the decomposition view on public metric detail pages, showing upstream drivers and downstream impacts.
          </p>
          <MetricChainAdmin />
        </div>
      )}

      {/* ── Shape Layers ─────────────────────────────────────────────────── */}
      {section === "shapes" && (
        <div>
          <p className={styles.sectionDescription}>
            City-agnostic geographic boundary layer templates. Each template defines a layer type (neighborhood, district, ZIP, etc.) that can be instantiated per city with city-specific shapefile geometry.
          </p>
          <ShapeLayerTemplatesAdmin />
        </div>
      )}

      {/* ── All Metrics ──────────────────────────────────────────────────── */}
      {section === "metrics" && (
        <div>
          {/* Stats */}
          <div className={styles.statsGrid}>
            <div className={styles.statCard}>
              <div className={styles.statIcon}><i className="fas fa-chart-bar" style={{ color: "var(--brand-primary)" }} /></div>
              <div><div className={styles.statLabel}>Total</div><div className={styles.statValue}>{summary?.total_metrics ?? "—"}</div></div>
            </div>
            <div className={styles.statCard}>
              <div className={styles.statIcon}><i className="fas fa-check-circle" style={{ color: "var(--color-success, #22c55e)" }} /></div>
              <div><div className={styles.statLabel}>Active</div><div className={styles.statValue}>{summary?.active_metrics ?? "—"}</div></div>
            </div>
            <div className={styles.statCard}>
              <div className={styles.statIcon}><i className="fas fa-play-circle" style={{ color: "var(--brand-accent, #6366f1)" }} /></div>
              <div><div className={styles.statLabel}>Completed</div><div className={styles.statValue}>{summary?.completed_metrics ?? "—"}</div></div>
            </div>
            <div className={styles.statCard}>
              <div className={styles.statIcon}><i className="fas fa-exclamation-triangle" style={{ color: "var(--color-error, var(--error))" }} /></div>
              <div><div className={styles.statLabel}>Failed</div><div className={styles.statValue}>{summary?.failed_metrics ?? "—"}</div></div>
            </div>
          </div>

          {/* Export / Import (collapsible) */}
          <div className={styles.backupPanel}>
            <button
              onClick={() => setShowExportImport((v) => !v)}
              style={{ background: "none", border: "none", cursor: "pointer", padding: 0, display: "flex", alignItems: "center", gap: 8, width: "100%" }}
            >
              <span className={styles.backupPanelTitle}>Export / Import</span>
              <i className={`fas fa-chevron-${showExportImport ? "up" : "down"}`} style={{ fontSize: 11, color: "var(--text-secondary)", marginLeft: "auto" }} />
            </button>
            {showExportImport && (
              <>
                <p className={styles.backupPanelIntro}>
                  Use the city filter (optional). Full platform JSON includes cities, structure configs, leaders, and metrics — no time series or anomalies.
                  Shapefile <em>rows</em> are always included; map geometry is omitted by default (recommended). After importing on another env, use{" "}
                  <strong>Refresh map geometries</strong> (or City Data → Shape layers) to re-download GeoJSON from each layer&apos;s source endpoint.
                </p>

                {/* Full platform metadata */}
                <div className={styles.backupRow}>
                  <div className={styles.backupRowHead}>
                    <span className={styles.backupRowLabel}>Full platform metadata</span>
                    <span className={styles.backupRowHint}><code>platform_metadata.json</code> or legacy <code>metrics_export.json</code></span>
                  </div>
                  <div className={styles.backupRowActions}>
                    <label className={styles.backupCheckbox} title="Usually times out on production via HTTP. Prefer lean export + Refresh map geometries, or scripts/export_platform_metadata.py --include-shapefile-geometry">
                      <input type="checkbox" checked={includeShapefileGeometry} onChange={(e) => setIncludeShapefileGeometry(e.target.checked)} />
                      Include map geometry (large; may timeout)
                    </label>
                    <button className={styles.secondaryBtn} disabled={platformExporting} onClick={async () => {
                      if (platformExporting) return;
                      setPlatformExporting(true);
                      try {
                        const token = await getAccessTokenSilently();
                        const blob = await exportAdminPlatformMetadata(token, { city_id: selectedCityId ?? undefined, include_shapefile_geometry: includeShapefileGeometry });
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement("a");
                        a.href = url; a.download = "platform_metadata.json"; a.click();
                        URL.revokeObjectURL(url);
                      } catch (err) { alert(err instanceof Error ? err.message : "Export failed"); }
                      finally { setPlatformExporting(false); }
                    }}>
                      <i className="fas fa-download" /> {platformExporting ? "Exporting…" : "Export"}
                    </button>
                    <div className={styles.importGroup}>
                      <input type="file" accept=".json" className={styles.importFileInput} onChange={(e) => setPlatformImportFile(e.target.files?.[0] ?? null)} />
                      <select value={platformImportTargetCityId ?? ""} onChange={(e) => setPlatformImportTargetCityId(e.target.value ? Number(e.target.value) : null)}
                        style={{ padding: "6px 8px", fontSize: 12, borderRadius: 4, border: "1px solid var(--border-primary)", background: "var(--bg-primary)", color: "var(--text-primary)" }}>
                        <option value="">No city remap</option>
                        {cities.map((c) => <option key={c.id} value={c.id}>{c.display_name}</option>)}
                      </select>
                      <button className={styles.secondaryBtn} disabled={!platformImportFile || platformImporting} onClick={async () => {
                        if (!platformImportFile) return;
                        setPlatformImporting(true);
                        try {
                          const token = await getAccessTokenSilently();
                          const res = await importAdminPlatformMetadata(token, platformImportFile, { target_city_id: platformImportTargetCityId ?? undefined });
                          const shapefileCount = res.counts?.city_shapefiles ?? 0;
                          const hint =
                            shapefileCount > 0
                              ? `\n\nImported ${shapefileCount} shape layer row(s). If geometry was omitted, select the city and click Refresh map geometries.`
                              : "";
                          alert((res.message || "Import complete") + hint);
                          metricsQuery.refetch(); summaryQuery.refetch();
                        } catch (err) { alert(err instanceof Error ? err.message : "Import failed"); }
                        finally { setPlatformImporting(false); }
                      }}>
                        <i className="fas fa-upload" /> {platformImporting ? "Importing…" : "Import"}
                      </button>
                    </div>
                    <button
                      className={styles.secondaryBtn}
                      disabled={!selectedCityId || refreshingGeometries}
                      title={
                        selectedCityId
                          ? "Re-download GeoJSON from each layer's source_endpoint"
                          : "Select a city filter first"
                      }
                      onClick={async () => {
                        if (!selectedCityId || refreshingGeometries) return;
                        if (
                          !confirm(
                            `Re-download map geometries for ${selectedCityDisplayName || `city ${selectedCityId}`} from each layer's source endpoint?`
                          )
                        ) {
                          return;
                        }
                        setRefreshingGeometries(true);
                        try {
                          const token = await getAccessTokenSilently();
                          const res = await refreshAllShapeLayerGeometries(selectedCityId, token);
                          alert(
                            `Geometry refresh: ${res.refreshed} updated, ${res.skipped} skipped, ${res.failed} failed (of ${res.total}).`
                          );
                        } catch (err) {
                          alert(err instanceof Error ? err.message : "Geometry refresh failed");
                        } finally {
                          setRefreshingGeometries(false);
                        }
                      }}
                    >
                      <i className="fas fa-map" />{" "}
                      {refreshingGeometries ? "Refreshing geometries…" : "Refresh map geometries"}
                    </button>
                  </div>
                </div>

                {/* Metrics only */}
                <div className={styles.backupRow}>
                  <div className={styles.backupRowHead}>
                    <span className={styles.backupRowLabel}>Metric definitions only</span>
                    <span className={styles.backupRowHint}><code>metrics_export.json</code> — definitions + category order</span>
                  </div>
                  <div className={styles.backupRowActions}>
                    <button className={styles.secondaryBtn} disabled={exporting} onClick={async () => {
                      setExporting(true);
                      try {
                        const token = await getAccessTokenSilently();
                        const blob = await exportAdminMetrics(token, { city_id: selectedCityId ?? undefined });
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement("a");
                        a.href = url; a.download = "metrics_export.json"; a.click();
                        URL.revokeObjectURL(url);
                      } catch (err) { alert(err instanceof Error ? err.message : "Export failed"); }
                      finally { setExporting(false); }
                    }}>
                      <i className="fas fa-download" /> {exporting ? "Exporting…" : "Export"}
                    </button>
                    <div className={styles.importGroup}>
                      <input type="file" accept=".json" className={styles.importFileInput} onChange={(e) => setImportFile(e.target.files?.[0] ?? null)} />
                      <select value={importTargetCityId ?? ""} onChange={(e) => setImportTargetCityId(e.target.value ? Number(e.target.value) : null)}
                        style={{ padding: "6px 8px", fontSize: 12, borderRadius: 4, border: "1px solid var(--border-primary)", background: "var(--bg-primary)", color: "var(--text-primary)" }}>
                        <option value="">No city remap</option>
                        {cities.map((c) => <option key={c.id} value={c.id}>{c.display_name}</option>)}
                      </select>
                      <button className={styles.secondaryBtn} disabled={!importFile || importing} onClick={async () => {
                        if (!importFile) return;
                        setImporting(true);
                        try {
                          const token = await getAccessTokenSilently();
                          const res = await importAdminMetrics(token, importFile, { target_city_id: importTargetCityId ?? undefined });
                          alert((res as any).message || "Import complete");
                          metricsQuery.refetch(); summaryQuery.refetch();
                        } catch (err) { alert(err instanceof Error ? err.message : "Import failed"); }
                        finally { setImporting(false); }
                      }}>
                        <i className="fas fa-upload" /> {importing ? "Importing…" : "Import"}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Clear data */}
                <div className={styles.backupRow}>
                  <div className={styles.backupRowHead}>
                    <span className={styles.backupRowLabel}>Clear metric data</span>
                    <span className={styles.backupRowHint}>Delete time series, anomalies, and maps for a city or all cities (keeps metric definitions)</span>
                  </div>
                  <div className={styles.backupRowActions}>
                    {selectedCityId && (
                      <button className={styles.secondaryBtn} style={{ borderColor: "var(--color-error, var(--error))", color: "var(--color-error, var(--error))" }} onClick={() => clearCityData(selectedCityId)}>
                        <i className="fas fa-trash" /> Clear selected city
                      </button>
                    )}
                    <button className={styles.secondaryBtn} style={{ borderColor: "var(--color-error, var(--error))", color: "var(--color-error, var(--error))" }} onClick={() => clearCityData(null)}>
                      <i className="fas fa-trash" /> Clear ALL cities
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Filters */}
          <div className={metricStyles.filtersContainer}>
            <div className={metricStyles.filtersRow}>
              <input
                className={metricStyles.searchInput}
                placeholder="Search metrics…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />

              {/* City filter */}
              <div className={metricStyles.cityFilterWrapper}>
                <input
                  className={metricStyles.cityInput}
                  placeholder="Filter by city…"
                  value={citySearchQuery}
                  onChange={(e) => { setCitySearchQuery(e.target.value); setShowCityDropdown(true); if (selectedCityId) setSelectedCityId(null); }}
                  onFocus={() => { cancelHideDropdown(); setShowCityDropdown(true); }}
                  onBlur={() => scheduleHideDropdown()}
                />
                {(selectedCityId || citySearchQuery) && (
                  <button className={metricStyles.clearCityBtn} onMouseDown={(e) => e.preventDefault()} onClick={clearCity} aria-label="Clear city filter">
                    <i className="fas fa-times" />
                  </button>
                )}
                {showCityDropdown && (
                  <div className={metricStyles.cityDropdown} onMouseDown={cancelHideDropdown} onMouseLeave={scheduleHideDropdown}>
                    {filteredCities.length === 0 ? (
                      <div className={metricStyles.cityDropdownEmpty}>No cities found</div>
                    ) : (
                      filteredCities.map((c) => (
                        <div key={c.id} className={metricStyles.cityDropdownItem} onMouseDown={(e) => e.preventDefault()} onClick={() => setCityFromDropdown(c.id, c.display_name)}>
                          <span>{c.display_name}</span>
                          <span className={metricStyles.muted}>{c.metric_count}</span>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>

              <select className={metricStyles.select} value={selectedCategory} onChange={(e) => setSelectedCategory(e.target.value)}>
                <option value="">All Categories</option>
                {categories.map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}
              </select>

              <select className={metricStyles.select} value={selectedType} onChange={(e) => setSelectedType(e.target.value)}>
                <option value="">All Types</option>
                {types.map((t) => <option key={t.name} value={t.name}>{t.name}</option>)}
              </select>

              <select className={metricStyles.select} value={selectedTemplateId?.toString() ?? ""} onChange={(e) => setSelectedTemplateId(e.target.value ? Number(e.target.value) : null)}>
                <option value="">All Templates</option>
                {sortedTemplates.map((t) => <option key={t.id} value={t.id}>{t.metric_name}</option>)}
              </select>

              <select className={metricStyles.select} value={selectedStatus} onChange={(e) => setSelectedStatus(e.target.value as StatusFilter)}>
                <option value="">All Status</option>
                <option value="true">Active</option>
                <option value="false">Inactive</option>
              </select>

              <select className={metricStyles.select} value={selectedLastRunStatus} onChange={(e) => setSelectedLastRunStatus(e.target.value as LastRunFilter)}>
                <option value="">All Last Runs</option>
                <option value="failed">Failed</option>
                <option value="completed">Completed</option>
                <option value="never">Never run</option>
              </select>

              <button
                className={metricStyles.primaryBtn}
                onClick={() => setSelectedLastRunStatus("failed")}
                title="Show only failed metrics"
                style={{ whiteSpace: "nowrap" }}
              >
                <i className="fas fa-exclamation-triangle" /> Failed
              </button>

              <button className={metricStyles.secondaryBtn} onClick={() => { metricsQuery.refetch(); summaryQuery.refetch(); }} title="Refresh">
                <i className="fas fa-sync" />
              </button>

              <button className={metricStyles.primaryBtn} onClick={openCreate}>
                <i className="fas fa-plus" /> Create Metric
              </button>
            </div>
          </div>

          {/* Table */}
          <div className={metricStyles.tableContainer}>
            <div className={metricStyles.tableHeader}>
              <div className={metricStyles.tableTitle}>
                Metrics{metrics.length > 0 ? ` — ${metrics.length}` : ""}
              </div>
            </div>
            <div className={metricStyles.tableWrapper}>
              <table className={`${metricStyles.table} ${metricStyles.metricsListTable}`}>
                <thead>
                  <tr>
                    <th className={`${metricStyles.th} ${metricStyles.metricIdTh}`}>ID</th>
                    <th className={metricStyles.th}>Metric</th>
                    <th className={`${metricStyles.th} ${metricStyles.hideNarrow}`}>City</th>
                    <th className={`${metricStyles.th} ${metricStyles.hideNarrow}`}>Category</th>
                    <th className={`${metricStyles.th} ${metricStyles.hideNarrow}`}>Template</th>
                    <th className={metricStyles.th}>Last data</th>
                    <th className={metricStyles.th}>Changed</th>
                    <th className={metricStyles.th}>Charts</th>
                    <th className={`${metricStyles.th} ${metricStyles.hideNarrow}`} title="Location, category, map, districts">Setup</th>
                  </tr>
                </thead>
                <tbody>
                  {loading && (
                    <tr><td className={metricStyles.td} colSpan={9}><span className={metricStyles.muted}>Loading…</span></td></tr>
                  )}
                  {tableEmpty && (
                    <tr><td className={metricStyles.td} colSpan={9}><span className={metricStyles.muted}>No metrics found matching the current filters.</span></td></tr>
                  )}
                  {!loading && metrics.map((m) => (
                    <tr
                      key={m.id}
                      className={`${metricStyles.rowHover} ${metricStyles.metricRow} ${pinnedActionsMetricId === m.id ? metricStyles.metricRowActionsPinned : ""}`}
                      onClick={(e) => handleMetricRowPointerToggle(e, m.id)}
                    >
                      <td className={`${metricStyles.td} ${metricStyles.metricsListTd} ${metricStyles.metricIdTd}`}>
                        <span className={metricStyles.metricIdCell}>{m.id}</span>
                      </td>
                      <td className={`${metricStyles.td} ${metricStyles.metricsListTd}`}>
                        <div className={metricStyles.metricNameContent}>
                          <div>
                            <div className={metricStyles.metricNameTitle}>{m.metric_name}</div>
                            <div className={`${metricStyles.muted} ${metricStyles.metricNameKey}`}>{m.metric_key}</div>
                            {!m.is_active && (
                              <span className={`${metricStyles.badge} ${metricStyles.badgeRed} ${metricStyles.metricInactiveBadge}`}>Inactive</span>
                            )}
                          </div>
                          <div className={metricStyles.metricActionsRow} data-metric-actions-wrap onClick={(e) => e.stopPropagation()}>
                            <MetricActions
                              metricId={m.id}
                              compact
                              onEdit={() => openEditModal(m.id)}
                              onViewCharts={() => openCharts(m.id)}
                              onViewMaps={() => openMaps(m.id)}
                              onExecute={() => openExecuteModal(m.id)}
                              onPurgeData={() => purgeMetricData(m.id, m.metric_name)}
                              onDelete={() => deleteMetric(m.id)}
                            />
                          </div>
                        </div>
                      </td>
                      <td className={`${metricStyles.td} ${metricStyles.metricsListTd} ${metricStyles.hideNarrow}`}>
                        <span className={metricStyles.muted}>{m.city_name || "—"}</span>
                      </td>
                      <td className={`${metricStyles.td} ${metricStyles.metricsListTd} ${metricStyles.hideNarrow}`}>
                        <span className={`${metricStyles.badge} ${metricStyles.badgePrimary}`}>{m.category}</span>
                      </td>
                      <td className={`${metricStyles.td} ${metricStyles.metricsListTd} ${metricStyles.hideNarrow}`}>
                        {m.template_id != null ? (
                          <span className={metricStyles.templateCell} title={`Template #${m.template_id}${templateNameById.get(m.template_id) ? `: ${templateNameById.get(m.template_id)}` : ""}`}>
                            {templateNameById.get(m.template_id) ?? `ID ${m.template_id}`}
                          </span>
                        ) : <span className={metricStyles.muted}>—</span>}
                      </td>
                      <td className={`${metricStyles.td} ${metricStyles.metricsListTd}`}>
                        {m.most_recent_data_date ? formatDate(m.most_recent_data_date) : "—"}
                      </td>
                      <td className={`${metricStyles.td} ${metricStyles.metricsListTd}`}>
                        {m.changed_since_last_run === true && <span className={metricStyles.badgeYellow}>Yes</span>}
                        {m.changed_since_last_run === false && <span className={metricStyles.muted}>No</span>}
                        {m.changed_since_last_run == null && <span className={metricStyles.muted}>—</span>}
                      </td>
                      <td className={`${metricStyles.td} ${metricStyles.metricsListTd}`}>
                        <span title="Time series count">{m.time_series_count ?? 0}</span>
                      </td>
                      <td className={`${metricStyles.td} ${metricStyles.metricsListTd} ${metricStyles.hideNarrow}`}>
                        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                          <span title={m.has_location_fields ? "Location fields configured" : "No location fields"} style={{ color: m.has_location_fields ? "var(--color-success, #22c55e)" : "var(--text-tertiary)" }}>
                            <i className="fas fa-map-marker-alt" style={{ opacity: m.has_location_fields ? 1 : 0.35 }} />
                          </span>
                          <span title={m.has_category_fields ? "Category fields configured" : "No category fields"} style={{ color: m.has_category_fields ? "var(--color-success, #22c55e)" : "var(--text-tertiary)" }}>
                            <i className="fas fa-tags" style={{ opacity: m.has_category_fields ? 1 : 0.35 }} />
                          </span>
                          <span title={m.has_map_fields ? "Map query configured" : "No map query"} style={{ color: m.has_map_fields ? "var(--color-success, #22c55e)" : "var(--text-tertiary)" }}>
                            <i className="fas fa-map" style={{ opacity: m.has_map_fields ? 1 : 0.35 }} />
                          </span>
                          <span title={m.supports_districts ? "Supports districts" : "No districts"} style={{ color: m.supports_districts ? "var(--color-success, #22c55e)" : "var(--text-tertiary)" }}>
                            <i className="fas fa-border-all" style={{ opacity: m.supports_districts ? 1 : 0.35 }} />
                          </span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ── Modals (rendered outside section so they survive section switches) */}

      <MetricEditModal
        metricId={editModalMetricId ?? 0}
        isOpen={editModalOpen}
        onClose={closeEditModal}
        onExecute={(id) => { closeEditModal(); openExecuteModal(id); }}
        onSave={() => metricsQuery.refetch()}
      />

      <MetricChartsModal
        metricId={chartsMetricId}
        isOpen={chartsOpen}
        onClose={closeCharts}
        metricKey={chartsMetricId ? metrics.find((m) => m.id === chartsMetricId)?.metric_key : null}
        citySlug={(() => {
          if (!chartsMetricId) return null;
          const m = metrics.find((x) => x.id === chartsMetricId);
          if (!m?.city_id) return null;
          const city = cities.find((c) => c.id === m.city_id);
          if (!city?.name) return null;
          return city.name.trim().toLowerCase().replace(/[^a-z0-9\s-]/g, "").replace(/[\s_-]+/g, "-").replace(/^-|-$/g, "");
        })()}
      />

      <MetricMapsModal
        metricId={mapsMetricId}
        metricName={metrics.find((m) => m.id === mapsMetricId)?.metric_name}
        isOpen={mapsOpen}
        onClose={closeMaps}
      />

      {/* Create metric modal */}
      {editOpen && (
        <div className={metricStyles.modalOverlay} onMouseDown={closeEdit}>
          <div className={metricStyles.modal} onMouseDown={(e) => e.stopPropagation()}>
            <div className={metricStyles.modalHeader}>
              <div className={metricStyles.modalTitle}>Create New Metric</div>
              <button className={metricStyles.iconBtn} onClick={closeEdit}><i className="fas fa-times" /></button>
            </div>
            <div className={metricStyles.modalBody}>
              <div className={metricStyles.grid2}>
                <div style={{ gridColumn: "1 / -1" }}>
                  <div className={metricStyles.fieldLabel}>Metric Name *</div>
                  <input className={metricStyles.input} value={editForm.metric_name} onChange={(e) => setEditForm((p) => ({ ...p, metric_name: e.target.value }))} />
                </div>
                <div>
                  <div className={metricStyles.fieldLabel}>Metric Key *</div>
                  <input className={metricStyles.input} value={editForm.metric_key} onChange={(e) => setEditForm((p) => ({ ...p, metric_key: e.target.value }))} />
                </div>
                <div>
                  <div className={metricStyles.fieldLabel}>Category *</div>
                  <input className={metricStyles.input} value={editForm.category} onChange={(e) => setEditForm((p) => ({ ...p, category: e.target.value }))} />
                </div>
                <div>
                  <div className={metricStyles.fieldLabel}>Subcategory</div>
                  <input className={metricStyles.input} value={editForm.subcategory} onChange={(e) => setEditForm((p) => ({ ...p, subcategory: e.target.value }))} />
                </div>
                <div>
                  <div className={metricStyles.fieldLabel}>Date Field *</div>
                  <input className={metricStyles.input} value={editForm.date_field} onChange={(e) => setEditForm((p) => ({ ...p, date_field: e.target.value }))} />
                </div>
                <div>
                  <div className={metricStyles.fieldLabel}>Endpoint *</div>
                  <input className={metricStyles.input} value={editForm.endpoint} onChange={(e) => setEditForm((p) => ({ ...p, endpoint: e.target.value }))} />
                </div>
                <div>
                  <div className={metricStyles.fieldLabel}>Aggregation Type</div>
                  <select className={metricStyles.select} value={editForm.aggregation_type} onChange={(e) => setEditForm((p) => ({ ...p, aggregation_type: e.target.value }))}>
                    <option value="COUNT">COUNT</option>
                    <option value="SUM">SUM</option>
                    <option value="AVG">AVG</option>
                    <option value="MAX">MAX</option>
                    <option value="MIN">MIN</option>
                  </select>
                </div>
                <div style={{ gridColumn: "1 / -1" }}>
                  <div className={metricStyles.fieldLabel}>Summary</div>
                  <textarea className={metricStyles.textarea} value={editForm.summary} onChange={(e) => setEditForm((p) => ({ ...p, summary: e.target.value }))} />
                </div>
                <div className={metricStyles.checkboxRow}>
                  <input type="checkbox" checked={editForm.is_active} onChange={(e) => setEditForm((p) => ({ ...p, is_active: e.target.checked }))} />
                  <span className={metricStyles.muted}>Active</span>
                </div>
                <div className={metricStyles.checkboxRow}>
                  <input type="checkbox" checked={editForm.show_on_dash} onChange={(e) => setEditForm((p) => ({ ...p, show_on_dash: e.target.checked }))} />
                  <span className={metricStyles.muted}>Show on Dashboard</span>
                </div>
              </div>
            </div>
            <div className={metricStyles.modalFooter}>
              <button className={metricStyles.secondaryBtn} onClick={closeEdit}>Cancel</button>
              <button className={metricStyles.primaryBtn} onClick={saveEdit} disabled={createMetricMutation.isPending}>
                <i className="fas fa-save" /> Create
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Execute modal */}
      {showExecuteModal && (
        <div className={metricStyles.modalOverlay} onClick={closeExecuteModal}>
          <div className={metricStyles.modal} onClick={(e) => e.stopPropagation()}>
            <div className={metricStyles.modalHeader}>
              <h2>Execute Metric {executeMetricId}</h2>
              <button className={metricStyles.modalClose} onClick={closeExecuteModal}>×</button>
            </div>
            <div className={metricStyles.modalBody}>
              {[
                { label: "Period Type", type: "select" as const },
                { label: "Start Date", type: "date" as const },
                { label: "End Date", type: "date" as const },
              ].map(({ label, type }) => (
                <div key={label} style={{ marginBottom: 16 }}>
                  <label style={{ display: "block", marginBottom: 8, fontWeight: 500 }}>{label}</label>
                  {type === "select" ? (
                    <select value={executePeriodType} onChange={(e) => onExecutePeriodTypeChange(e.target.value)}
                      style={{ width: "100%", padding: 8, borderRadius: 4, border: "1px solid var(--border-color)", background: "var(--bg-primary)", color: "var(--text-primary)" }}>
                      <option value="day">Daily</option>
                      <option value="week">Weekly</option>
                      <option value="month">Monthly</option>
                      <option value="year">Yearly</option>
                      <option value="ytd">Year-to-Date</option>
                    </select>
                  ) : (
                    <input type="date" value={label === "Start Date" ? executeStartDate : executeEndDate}
                      onChange={(e) => label === "Start Date" ? setExecuteStartDate(e.target.value) : setExecuteEndDate(e.target.value)}
                      style={{ width: "100%", padding: 8, borderRadius: 4, border: "1px solid var(--border-color)", background: "var(--bg-primary)", color: "var(--text-primary)" }} />
                  )}
                </div>
              ))}
            </div>
            <div className={metricStyles.modalFooter}>
              <button className={metricStyles.secondaryBtn} onClick={closeExecuteModal}>Cancel</button>
              <button className={metricStyles.primaryBtn} onClick={executeMetric} disabled={executeMetricMutation.isPending}>
                <i className="fas fa-play" /> Execute
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

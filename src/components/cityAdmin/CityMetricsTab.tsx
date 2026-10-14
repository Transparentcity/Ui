"use client";

import { Fragment, useEffect, useMemo, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useQueryClient } from "@tanstack/react-query";
import {
  getDefaultExecuteStartDateByPeriod,
  clearCityAdminCache,
} from "@/lib/apiClient";
import {
  useTemplateInstantiationStatus,
  useInstantiateSingleTemplate,
  useInstantiateAllTemplates,
  useAvailableModels,
  useMetricRecordCounts,
} from "@/lib/hooks/useCityAdmin";
import {
  useDeleteMetric,
  useExecuteMetric,
  usePurgeMetricData,
  useUpdateMetric,
} from "@/lib/hooks/useMetrics";
import { useJobWebSocketContext } from "@/contexts/JobWebSocketContext";
import { notifyJobCreated } from "@/lib/useJobWebSocket";
import { pickDefaultModelKey } from "@/lib/modelDefaults";
import { slugify } from "@/lib/utils";
import MetricDrawer from "@/components/citySite/MetricDrawer";
import MetricEditModal from "@/components/MetricEditModal";
import MetricOrderEditor from "@/components/MetricOrderEditor";
import StructuringNotesModal from "@/components/StructuringNotesModal";
import styles from "./CityMetricsTab.module.css";
import metricStyles from "@/components/MetricsAdmin.module.css";
import cityAdminStyles from "@/components/CityDataAdmin.module.css";

// ─── Types ───────────────────────────────────────────────────────────────────

type MetricSection = "active" | "templates" | "settings" | "cleanup";

interface CityMetric {
  id: number;
  metric_name: string;
  category?: string;
  subcategory?: string | null;
  is_active?: boolean;
  show_on_dash?: boolean;
  last_execution_status?: string | null;
  last_execution_at?: string | null;
  most_recent_data_date?: string | null;
}

export interface CityMetricsTabProps {
  cityId: number;
  metrics: CityMetric[];
  cityName: string;
  onMetricChange: () => void;
  /** Rendered as the Metrics section. */
  metricsPanel: ReactNode;
  onViewJob?: (jobId: string) => void;
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

// ─── Main component ───────────────────────────────────────────────────────────

/** Global admins only: the cleanup actions call admin-only metric routes. */
export default function CityMetricsTab({
  cityId,
  metrics,
  cityName,
  onMetricChange,
  metricsPanel,
  onViewJob,
}: CityMetricsTabProps) {
  const queryClient = useQueryClient();

  // ── Section switcher ──────────────────────────────────────────────────────
  const [section, setSection] = useState<MetricSection>("active");

  // ── Shared data hooks ─────────────────────────────────────────────────────
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
  const [editModalMetricId, setEditModalMetricId] = useState<number | null>(null);
  const [executeMetricId, setExecuteMetricId] = useState<number | null>(null);

  // ── Detail drawer ─────────────────────────────────────────────────────────
  const [drawerMetricId, setDrawerMetricId] = useState<number | null>(null);

  // ── Template section state ────────────────────────────────────────────────
  const [templateShowAll, setTemplateShowAll] = useState(true);
  const [templateModelKey, setTemplateModelKey] = useState("");
  const [showRunAllTemplatesModal, setShowRunAllTemplatesModal] = useState(false);
  const [runningSingleJobByTemplateId, setRunningSingleJobByTemplateId] = useState<Record<number, string>>({});
  const [runningAllJobId, setRunningAllJobId] = useState<string | null>(null);
  const [structuringNotesTarget, setStructuringNotesTarget] = useState<{ metricId?: number | null; templateId: number } | null>(null);

  // ── Cleanup section state ─────────────────────────────────────────────────
  const { data: recordCountsData, isLoading: loadingRecordCounts } = useMetricRecordCounts(
    cityId,
    section === "cleanup"
  );
  const recordCounts = recordCountsData?.counts;
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
    const invalidateNotes = () => {
      templateStatusQuery.refetch();
      queryClient.invalidateQueries({ queryKey: ["templateStructuringNotes"] });
      queryClient.invalidateQueries({ queryKey: ["structuringNotes"] });
    };
    if (runningAllJobId && jobs?.some((j) => j.job_id === runningAllJobId && terminal.has(j.status))) {
      setRunningAllJobId(null);
      invalidateNotes();
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
      invalidateNotes();
    }
  }, [jobs, runningAllJobId, runningSingleJobByTemplateId, templateStatusQuery, queryClient]);

  // ── Derived data ──────────────────────────────────────────────────────────

  const dashboardMetrics = useMemo(() => metrics.filter((m) => m.show_on_dash === true), [metrics]);

  const inactiveMetrics = useMemo(() => metrics.filter((m) => m.is_active === false), [metrics]);

  const noDataActiveMetrics = useMemo(
    () => metrics.filter((m) => m.is_active !== false && !m.most_recent_data_date),
    [metrics]
  );

  const metricNameById = useMemo(() => {
    const map = new Map<number, string>();
    metrics.forEach((m) => map.set(m.id, m.metric_name));
    return map;
  }, [metrics]);

  const sortedTemplates = useMemo(() => {
    const raw = templateStatusQuery.data?.templates ?? [];
    return [...raw].sort((a, b) => {
      const slugCmp = templateCategorySlug(a.category, a.category_slug).localeCompare(
        templateCategorySlug(b.category, b.category_slug),
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

  // ── Handlers ──────────────────────────────────────────────────────────────

  // The city admin payload (including its metrics) is cached client-side for
  // 60s in apiClient; clear it before refetching or mutations appear to no-op.
  const refreshMetrics = () => {
    clearCityAdminCache(cityId);
    onMetricChange();
  };

  const selectSection = (next: MetricSection) => {
    // The Metrics panel saves through the ops API, which leaves the city admin
    // payload behind it stale (e.g. a metric deactivated there).
    if (section === "active" && next !== "active") refreshMetrics();
    setSection(next);
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

  const handleReactivate = (metric: CityMetric) => {
    updateMetricMutation.mutate(
      { metricId: metric.id, payload: { is_active: true } },
      {
        onSuccess: () => {
          refreshMetrics();
          alert(`"${metric.metric_name}" reactivated. It is back in the Metrics tab.`);
        },
        onError: (err) => alert(err instanceof Error ? err.message : "Failed to update metric"),
      }
    );
  };

  const handlePurge = (metricId: number) => {
    if (!confirm("Purge all data for this metric? The definition will be kept.")) return;
    purgeMetricMutation.mutate({ metricId }, {
      onSuccess: (res) => {
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
      } catch (err) {
        failed++;
        console.error(`Failed to delete metric ${m.id}:`, err);
      }
    }
    setBulkDeleting(false);
    alert(`Deleted ${deleted} metric${deleted !== 1 ? "s" : ""}.${failed > 0 ? ` ${failed} failed — check console.` : ""}`);
    refreshMetrics();
  };

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
            onClick={() => selectSection(key)}
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

      {section === "active" && metricsPanel}

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
              {sortedTemplates.length === 0 ? (
                <p>No templates are available.</p>
              ) : (
                <>
                  <p>All templates have been instantiated for this city.</p>
                  <button className={styles.actionBtn} onClick={() => setTemplateShowAll(true)}>Show all templates</button>
                </>
              )}
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
                              {t.has_notes ? (
                                <button
                                  onClick={() => setStructuringNotesTarget({ metricId: t.metric_id, templateId: t.template_id })}
                                  className={styles.rowActionBtn}
                                  title="View AI structuring notes"
                                >
                                  <i className="fas fa-clipboard-list" style={{ marginRight: 3 }} />Notes
                                </button>
                              ) : null}
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
            <MetricOrderEditor
              cityId={cityId}
              metrics={dashboardMetrics}
              citySlug={slugify(cityName) || null}
            />
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
                                onClick={() => handleReactivate(metric)}
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
                                onClick={() => setDrawerMetricId(metric.id)}
                                title="View run history and errors for this metric"
                              >
                                Open
                              </button>
                              <button
                                className={styles.rowActionBtn}
                                onClick={() => setExecuteMetricId(metric.id)}
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
      {drawerMetricId != null && (
        <MetricDrawer
          cityId={cityId}
          metricId={drawerMetricId}
          canManage
          isAdmin
          onClose={() => setDrawerMetricId(null)}
          onViewJob={(jobId) => onViewJob?.(jobId)}
          onEditMetric={setEditModalMetricId}
          onTogglePublic={refreshMetrics}
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
      {editModalMetricId != null && (
        <MetricEditModal
          metricId={editModalMetricId}
          isOpen
          onClose={() => setEditModalMetricId(null)}
          onExecute={(metricId) => {
            setEditModalMetricId(null);
            setExecuteMetricId(metricId);
          }}
          onSave={refreshMetrics}
        />
      )}

      <StructuringNotesModal
        metricId={structuringNotesTarget?.metricId}
        templateId={structuringNotesTarget?.templateId}
        cityId={cityId}
        isOpen={structuringNotesTarget != null}
        onClose={() => setStructuringNotesTarget(null)}
      />

      {executeMetricId != null && (
        <ExecuteModal metricId={executeMetricId} onClose={() => setExecuteMetricId(null)} />
      )}
    </div>
  );
}

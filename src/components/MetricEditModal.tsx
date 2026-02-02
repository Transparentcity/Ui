"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import {
  type UpdateAdminMetricRequest,
  flushMetricCompleteness,
  purgeAdminMetricData,
  type PurgeMetricDataResponse,
} from "@/lib/apiClient";
import {
  useMetric,
  useMetricCityStructure,
  useUpdateMetric,
  useValidateMetricFreshness,
  useFlushMetricCompleteness,
  usePurgeMetricData,
} from "@/lib/hooks/useMetrics";
import { getPublicMetricCompleteness, getPublicMetricCompletenessStats, getPublicMetricCompletenessDaily, type MetricCompletenessResponse, type CompletenessStatisticsResponse, type DailyCompletenessResponse } from "@/lib/publicApiClient";
import CompletenessSparkline from "./CompletenessSparkline";
import styles from "./MetricsAdmin.module.css";

interface MetricEditModalProps {
  metricId: number;
  isOpen: boolean;
  onClose: () => void;
  onExecute?: (metricId: number) => void;
  onSave?: () => void;
}

function formatDateTime(value?: string | null): string {
  if (!value) return "Never";
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return value;
  // Use UTC timezone to avoid off-by-one date issues with server timestamps
  return dt.toLocaleString("en-US", { timeZone: "UTC" });
}

function formatDate(value?: string | null): string {
  if (!value) return "—";
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return value;
  return dt.toLocaleDateString();
}

function FreshnessBadge({
  freshness,
}: {
  freshness?: { update_frequency?: string | null; lag_days?: number | null; is_stale?: boolean | null } | null;
}) {
  if (!freshness || !freshness.update_frequency) {
    return <span className={`${styles.badge} ${styles.muted}`}>Unknown</span>;
  }

  const lag = freshness.lag_days ?? 0;
  const frequency = freshness.update_frequency || 'unknown';
  const isStale = freshness.is_stale ?? false;

  let colorClass = styles.badgeSuccess;
  if (lag >= 7 || isStale) {
    colorClass = styles.badgeDanger;
  } else if (lag >= 3) {
    colorClass = styles.badgeWarning;
  }

  const displayText = `${frequency}${lag > 0 ? ` (${lag}d)` : ''}`;

  return (
    <span className={`${styles.badge} ${colorClass}`} title={`Updated ${frequency}, ${lag} days behind`}>
      {displayText}
    </span>
  );
}

function StatusBadge({
  isActive,
  lastExecutionStatus,
}: {
  isActive: boolean;
  lastExecutionStatus?: string | null;
}) {
  if (!isActive) {
    return <span className={`${styles.badge}`}>Inactive</span>;
  }
  const status = (lastExecutionStatus || "").toLowerCase();
  if (status === "completed") {
    return <span className={`${styles.badge} ${styles.badgeGreen}`}>Completed</span>;
  }
  if (status === "running") {
    return <span className={`${styles.badge} ${styles.badgeYellow}`}>Running</span>;
  }
  if (status === "failed") {
    return <span className={`${styles.badge} ${styles.badgeRed}`}>Failed</span>;
  }
  return <span className={`${styles.badge}`}>Not Run</span>;
}

export default function MetricEditModal({
  metricId,
  isOpen,
  onClose,
  onExecute,
  onSave,
}: MetricEditModalProps) {
  const metricQuery = useMetric(metricId);
  const cityStructureQuery = useMetricCityStructure(metricId);
  const updateMetricMutation = useUpdateMetric();
  const validateFreshnessMutation = useValidateMetricFreshness();
  const flushCompletenessMutation = useFlushMetricCompleteness();
  const purgeMetricMutation = usePurgeMetricData();

  const metric = metricQuery.data ?? null;
  const cityStructure = cityStructureQuery.data ?? null;

  // Form state
  const [editForm, setEditForm] = useState<{
    metric_name: string;
    category: string;
    subcategory: string;
    summary: string;
    definition: string;
    is_active: boolean;
    show_on_dash: boolean;
    greendirection: string;
    item_noun: string;
    template_id: string;
  }>({
    metric_name: "",
    category: "",
    subcategory: "",
    summary: "",
    definition: "",
    is_active: true,
    show_on_dash: false,
    greendirection: "up",
    item_noun: "",
    template_id: "",
  });

  // Query and map config state
  const [editQueryConfig, setEditQueryConfig] = useState<Record<string, any> | null>(null);
  const [showQueryConfig, setShowQueryConfig] = useState(false);
  const [editMapFields, setEditMapFields] = useState<{
    map_query: string | null;
    map_filters: Record<string, any> | null;
    map_config: Record<string, any> | null;
    location_fields: any[] | null;
    category_fields: any[] | null;
  } | null>(null);
  const [showMapFields, setShowMapFields] = useState(false);

  // Location and category fields (editable)
  const [locationFields, setLocationFields] = useState("[]");
  const [categoryFields, setCategoryFields] = useState("[]");
  const [fieldsError, setFieldsError] = useState<string | null>(null);
  const [fieldsSaving, setFieldsSaving] = useState(false);

  const [showAllGaps, setShowAllGaps] = useState(false);
  
  // Completeness data state
  const [completenessData, setCompletenessData] = useState<MetricCompletenessResponse | null>(null);
  const [completenessStats, setCompletenessStats] = useState<CompletenessStatisticsResponse | null>(null);
  const [completenessDaily, setCompletenessDaily] = useState<DailyCompletenessResponse | null>(null);
  const [completenessLoading, setCompletenessLoading] = useState(false);
  const [showCompletenessDetails, setShowCompletenessDetails] = useState(false);
  const [flushingCompleteness, setFlushingCompleteness] = useState(false);
  
  // Purge state
  const [showPurgeConfirm, setShowPurgeConfirm] = useState(false);
  const [purging, setPurging] = useState(false);
  const [purgeResult, setPurgeResult] = useState<PurgeMetricDataResponse | null>(null);

  // Fetch completeness data when metric loads
  useEffect(() => {
    if (metric?.id) {
      setCompletenessLoading(true);
      Promise.all([
        getPublicMetricCompleteness(metric.id),
        getPublicMetricCompletenessStats(metric.id).catch(() => null),
        getPublicMetricCompletenessDaily(metric.id, "day", 90).catch(() => null)
      ])
        .then(([completeness, stats, daily]) => {
          setCompletenessData(completeness);
          setCompletenessStats(stats);
          setCompletenessDaily(daily);
        })
        .catch((err) => {
          console.warn("Failed to load completeness data:", err);
          setCompletenessData(null);
          setCompletenessStats(null);
          setCompletenessDaily(null);
        })
        .finally(() => setCompletenessLoading(false));
    } else {
      setCompletenessData(null);
      setCompletenessStats(null);
      setCompletenessDaily(null);
    }
  }, [metric?.id]);

  // Update form when metric data loads
  useEffect(() => {
    if (metric) {
      setEditForm({
        metric_name: metric.metric_name || "",
        category: metric.category || "",
        subcategory: metric.subcategory || "",
        summary: metric.summary || "",
        definition: metric.definition || "",
        is_active: metric.is_active !== false,
        show_on_dash: metric.show_on_dash === true,
        greendirection: metric.greendirection || "up",
        item_noun: metric.item_noun || "",
        template_id: metric.template_id != null ? String(metric.template_id) : "",
      });
      setEditQueryConfig(metric.metadata?.query_config || null);
      setEditMapFields({
        map_query: metric.map_query || null,
        map_filters: metric.map_filters || null,
        map_config: metric.map_config || null,
        location_fields: metric.location_fields || null,
        category_fields: metric.category_fields || null,
      });
      setLocationFields(JSON.stringify(metric.location_fields ?? [], null, 2));
      setCategoryFields(JSON.stringify(metric.category_fields ?? [], null, 2));
      setFieldsError(null);
    }
  }, [metric]);

  const resetFields = () => {
    if (!metric) return;
    setLocationFields(JSON.stringify(metric.location_fields ?? [], null, 2));
    setCategoryFields(JSON.stringify(metric.category_fields ?? [], null, 2));
    setFieldsError(null);
  };

  const saveFields = () => {
    if (!metric) return;

    let parsedLocation: any[] | null = [];
    let parsedCategory: any[] | null = [];

    try {
      const trimmed = locationFields.trim();
      parsedLocation = trimmed ? JSON.parse(trimmed) : [];
      if (parsedLocation && !Array.isArray(parsedLocation)) {
        throw new Error("Location fields must be an array");
      }
    } catch (err) {
      setFieldsError(
        err instanceof Error
          ? `Location fields error: ${err.message}`
          : "Invalid location fields JSON"
      );
      return;
    }

    try {
      const trimmed = categoryFields.trim();
      parsedCategory = trimmed ? JSON.parse(trimmed) : [];
      if (parsedCategory && !Array.isArray(parsedCategory)) {
        throw new Error("Category fields must be an array");
      }
    } catch (err) {
      setFieldsError(
        err instanceof Error
          ? `Category fields error: ${err.message}`
          : "Invalid category fields JSON"
      );
      return;
    }

    setFieldsSaving(true);
    setFieldsError(null);

    updateMetricMutation.mutate(
      {
        metricId: metric.id,
        payload: {
          location_fields: parsedLocation,
          category_fields: parsedCategory,
        },
      },
      {
        onSuccess: () => {
          setFieldsSaving(false);
          metricQuery.refetch();
        },
        onError: (err) => {
          setFieldsSaving(false);
          setFieldsError(
            err instanceof Error ? err.message : "Failed to save fields"
          );
        },
      }
    );
  };

  const saveEdit = async () => {
    if (!metric) return;
    if (!editForm.metric_name.trim() || !editForm.category.trim()) {
      alert("Please fill in Metric Name and Category.");
      return;
    }

    // Parse template_id: convert to number or null
    const parsedTemplateId = editForm.template_id.trim()
      ? parseInt(editForm.template_id.trim(), 10)
      : null;
    if (editForm.template_id.trim() && (parsedTemplateId === null || isNaN(parsedTemplateId))) {
      alert("Template ID must be a valid number.");
      return;
    }

    const payload: UpdateAdminMetricRequest = {
      metric_name: editForm.metric_name.trim(),
      category: editForm.category.trim(),
      subcategory: editForm.subcategory.trim() || null,
      summary: editForm.summary.trim() || null,
      definition: editForm.definition.trim() || null,
      is_active: editForm.is_active,
      show_on_dash: editForm.show_on_dash,
      greendirection: editForm.greendirection || "up",
      item_noun: editForm.item_noun.trim() || null,
      template_id: parsedTemplateId,
    };
    updateMetricMutation.mutate(
      { metricId: metric.id, payload },
      {
        onSuccess: (res) => {
          alert(res.message || `Updated metric ${metric.id}`);
          onSave?.();
          onClose();
        },
        onError: (err) => {
          console.error("Error saving metric:", err);
          alert(err instanceof Error ? err.message : "Failed to save metric");
        },
      }
    );
  };

  if (!isOpen || !metric) return null;

  const content = (
    <div className={styles.modalOverlay} onMouseDown={onClose}>
      <div className={styles.modal} onMouseDown={(e) => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <div className={styles.modalTitle}>Edit Metric: {metric.metric_name}</div>
          <button className={styles.iconBtn} onClick={onClose} title="Close">
            <i className="fas fa-times" />
          </button>
        </div>
        <div className={styles.modalBody} style={{ maxHeight: "80vh", overflowY: "auto" }}>
          {/* Editable Form Fields */}
          <div className={styles.grid2}>
            <div style={{ gridColumn: "1 / -1" }}>
              <div className={styles.fieldLabel}>Metric Name *</div>
              <input
                className={styles.input}
                value={editForm.metric_name}
                onChange={(e) => setEditForm((p) => ({ ...p, metric_name: e.target.value }))}
              />
            </div>

            <div>
              <div className={styles.fieldLabel}>Metric Key (read-only)</div>
              <input
                className={styles.input}
                value={metric.metric_key || ""}
                disabled
                style={{ backgroundColor: "var(--bg-secondary)", color: "var(--text-secondary)" }}
              />
            </div>

            <div>
              <div className={styles.fieldLabel}>Metric ID (read-only)</div>
              <input
                className={styles.input}
                value={metric.id || ""}
                disabled
                style={{ backgroundColor: "var(--bg-secondary)", color: "var(--text-secondary)" }}
              />
            </div>

            <div>
              <div className={styles.fieldLabel}>Template ID</div>
              <input
                className={styles.input}
                type="number"
                value={editForm.template_id}
                onChange={(e) => setEditForm((p) => ({ ...p, template_id: e.target.value }))}
                placeholder="e.g., 19 for 311 metrics"
                min="0"
              />
              <div className={styles.muted} style={{ fontSize: 11, marginTop: 2 }}>
                Links to metric template. Enter 0 to clear/remove template link.
              </div>
            </div>

            <div>
              <div className={styles.fieldLabel}>Item Noun</div>
              <input
                className={styles.input}
                value={editForm.item_noun}
                onChange={(e) => setEditForm((p) => ({ ...p, item_noun: e.target.value }))}
                placeholder="e.g., Incidents, Cases, Permits"
              />
            </div>

            <div>
              <div className={styles.fieldLabel}>Green Direction</div>
              <select
                className={styles.input}
                value={editForm.greendirection}
                onChange={(e) => setEditForm((p) => ({ ...p, greendirection: e.target.value }))}
                style={{ cursor: "pointer" }}
              >
                <option value="up">Up ↑ (higher is better)</option>
                <option value="down">Down ↓ (lower is better)</option>
              </select>
            </div>

            <div>
              <div className={styles.fieldLabel}>Category *</div>
              <input
                className={styles.input}
                value={editForm.category}
                onChange={(e) => setEditForm((p) => ({ ...p, category: e.target.value }))}
              />
            </div>

            <div>
              <div className={styles.fieldLabel}>Subcategory</div>
              <input
                className={styles.input}
                value={editForm.subcategory}
                onChange={(e) => setEditForm((p) => ({ ...p, subcategory: e.target.value }))}
              />
            </div>

            <div style={{ gridColumn: "1 / -1" }}>
              <div className={styles.fieldLabel}>Summary</div>
              <textarea
                className={styles.textarea}
                value={editForm.summary}
                onChange={(e) => setEditForm((p) => ({ ...p, summary: e.target.value }))}
                rows={3}
              />
            </div>

            <div style={{ gridColumn: "1 / -1" }}>
              <div className={styles.fieldLabel}>Definition</div>
              <textarea
                className={styles.textarea}
                value={editForm.definition}
                onChange={(e) => setEditForm((p) => ({ ...p, definition: e.target.value }))}
                rows={4}
              />
            </div>

            <div className={styles.checkboxRow}>
              <input
                type="checkbox"
                checked={editForm.is_active}
                onChange={(e) => setEditForm((p) => ({ ...p, is_active: e.target.checked }))}
                aria-label="Active"
              />
              <span className={styles.muted}>Active</span>
            </div>
            <div className={styles.checkboxRow}>
              <input
                type="checkbox"
                checked={editForm.show_on_dash}
                onChange={(e) => setEditForm((p) => ({ ...p, show_on_dash: e.target.checked }))}
                aria-label="Show on dashboard"
              />
              <span className={styles.muted}>Show on Dashboard</span>
            </div>
          </div>

          {/* Read-only Info Fields */}
          <div style={{ marginTop: 24, paddingTop: 24, borderTop: "1px solid var(--border-primary)" }}>
            <div className={styles.grid2}>
              <div>
                <div className={styles.fieldLabel}>Type</div>
                <div className={styles.fieldValue}>{metric.metric_type || "queried"}</div>
              </div>
              <div>
                <div className={styles.fieldLabel}>Data Source</div>
                <div className={styles.fieldValue}>{metric.data_source_type || "—"}</div>
              </div>
              {metric.endpoint && (
                <div>
                  <div className={styles.fieldLabel}>Endpoint</div>
                  <div className={styles.fieldValue}>{metric.endpoint}</div>
                </div>
              )}
              {metric.city_name && (
                <div>
                  <div className={styles.fieldLabel}>City</div>
                  <div className={styles.fieldValue}>{metric.city_name}</div>
                </div>
              )}
            </div>
          </div>

          {/* Editable Location and Category Fields */}
          <div style={{ marginTop: 24, paddingTop: 24, borderTop: "1px solid var(--border-primary)" }}>
            <div className={styles.fieldLabel}>Location Fields (JSON array)</div>
            <textarea
              className={styles.textarea}
              value={locationFields}
              onChange={(e) => setLocationFields(e.target.value)}
              rows={6}
              style={{ fontFamily: "monospace" }}
            />
            <div className={styles.muted} style={{ marginTop: 4 }}>
              Current count: {metric.location_fields?.length ?? 0}
            </div>
            <div className={styles.fieldLabel} style={{ marginTop: 12 }}>
              Category Fields (JSON array)
            </div>
            <textarea
              className={styles.textarea}
              value={categoryFields}
              onChange={(e) => setCategoryFields(e.target.value)}
              rows={6}
              style={{ fontFamily: "monospace" }}
            />
            <div className={styles.muted} style={{ marginTop: 4 }}>
              Current count: {metric.category_fields?.length ?? 0}
            </div>
            {fieldsError && (
              <div className={styles.errorMessage} style={{ marginTop: 8 }}>
                {fieldsError}
              </div>
            )}
            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                gap: 8,
                marginTop: 8,
              }}
            >
              <button className={styles.secondaryBtn} onClick={resetFields}>
                Reset
              </button>
              <button
                className={styles.primaryBtn}
                onClick={saveFields}
                disabled={fieldsSaving}
              >
                {fieldsSaving ? "Saving..." : "Save Fields"}
              </button>
            </div>
          </div>

          {/* Query Configuration (Read-only, collapsible) */}
          {editQueryConfig && (
            <div style={{ marginTop: 24, paddingTop: 24, borderTop: "1px solid var(--border-primary)" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                <div className={styles.fieldLabel}>Structured Query Configuration</div>
                <button
                  type="button"
                  className={styles.secondaryBtn}
                  onClick={() => setShowQueryConfig(!showQueryConfig)}
                  style={{ padding: "4px 12px", fontSize: 12 }}
                >
                  <i className={`fas fa-${showQueryConfig ? "chevron-up" : "chevron-down"}`} />{" "}
                  {showQueryConfig ? "Hide" : "Show"}
                </button>
              </div>
              {showQueryConfig && (
                <div style={{ marginTop: 8 }}>
                  <textarea
                    className={styles.textarea}
                    value={JSON.stringify(editQueryConfig, null, 2)}
                    readOnly
                    style={{
                      fontFamily: "monospace",
                      fontSize: 12,
                      minHeight: 300,
                      backgroundColor: "var(--bg-secondary)",
                      color: "var(--text-primary)",
                    }}
                  />
                  <div style={{ marginTop: 8, fontSize: 12, color: "var(--text-secondary)" }}>
                    <div style={{ marginBottom: 4 }}>
                      <strong>Version:</strong> {editQueryConfig.version || "1.0"}
                    </div>
                    {editQueryConfig.description && (
                      <div style={{ marginBottom: 4 }}>
                        <strong>Description:</strong> {editQueryConfig.description}
                      </div>
                    )}
                    <div style={{ marginBottom: 4 }}>
                      <strong>Use Same Config:</strong> {editQueryConfig.use_same_config ? "Yes" : "No"}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Map Configuration (Read-only, collapsible) */}
          {editMapFields && (
            <div style={{ marginTop: 24, paddingTop: 24, borderTop: "1px solid var(--border-primary)" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                <div className={styles.fieldLabel}>Map Configuration</div>
                <button
                  type="button"
                  className={styles.secondaryBtn}
                  onClick={() => setShowMapFields(!showMapFields)}
                  style={{ padding: "4px 12px", fontSize: 12 }}
                >
                  <i className={`fas fa-${showMapFields ? "chevron-up" : "chevron-down"}`} />{" "}
                  {showMapFields ? "Hide" : "Show"}
                </button>
              </div>
              {showMapFields && (
                <div style={{ marginTop: 8 }}>
                  {editMapFields.map_query && (
                    <div style={{ marginBottom: 12 }}>
                      <div className={styles.fieldLabel} style={{ marginBottom: 4 }}>Map Query</div>
                      <textarea
                        className={styles.textarea}
                        value={editMapFields.map_query}
                        readOnly
                        style={{
                          fontFamily: "monospace",
                          fontSize: 12,
                          minHeight: 80,
                          backgroundColor: "var(--bg-secondary)",
                          color: "var(--text-primary)",
                        }}
                      />
                    </div>
                  )}
                  {editMapFields.map_filters && Object.keys(editMapFields.map_filters).length > 0 && (
                    <div style={{ marginBottom: 12 }}>
                      <div className={styles.fieldLabel} style={{ marginBottom: 4 }}>Map Filters</div>
                      <textarea
                        className={styles.textarea}
                        value={JSON.stringify(editMapFields.map_filters, null, 2)}
                        readOnly
                        style={{
                          fontFamily: "monospace",
                          fontSize: 12,
                          minHeight: 150,
                          backgroundColor: "var(--bg-secondary)",
                          color: "var(--text-primary)",
                        }}
                      />
                    </div>
                  )}
                  {editMapFields.map_config && Object.keys(editMapFields.map_config).length > 0 && (
                    <div style={{ marginBottom: 12 }}>
                      <div className={styles.fieldLabel} style={{ marginBottom: 4 }}>Map Config</div>
                      <textarea
                        className={styles.textarea}
                        value={JSON.stringify(editMapFields.map_config, null, 2)}
                        readOnly
                        style={{
                          fontFamily: "monospace",
                          fontSize: 12,
                          minHeight: 150,
                          backgroundColor: "var(--bg-secondary)",
                          color: "var(--text-primary)",
                        }}
                      />
                    </div>
                  )}
                  {(!editMapFields.map_query && 
                    (!editMapFields.map_filters || Object.keys(editMapFields.map_filters).length === 0) &&
                    (!editMapFields.map_config || Object.keys(editMapFields.map_config).length === 0)) && (
                    <div style={{ padding: 12, backgroundColor: "var(--bg-secondary)", borderRadius: 4, color: "var(--text-secondary)" }}>
                      No map configuration available for this metric.
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Execution Info (Read-only) */}
          <div style={{ marginTop: 24, paddingTop: 24, borderTop: "1px solid var(--border-primary)" }}>
            <div className={styles.fieldLabel}>Execution</div>
            <div className={styles.fieldValue}>
              <div className={styles.chartMeta}>
                <span>
                  <strong>Last Run:</strong> {formatDateTime(metric.last_execution_at)}
                </span>
                <span>
                  <strong>Status:</strong>{" "}
                  <StatusBadge isActive={metric.is_active} lastExecutionStatus={metric.last_execution_status} />
                </span>
                <span>
                  <strong>Count:</strong> {metric.execution_count ?? 0}
                </span>
                <span>
                  <strong>Job:</strong> {metric.last_execution_job_id || "—"}
                </span>
              </div>
              {metric.last_execution_error && (
                <div style={{ marginTop: 10 }} className={styles.errorMessage}>
                  {metric.last_execution_error}
                </div>
              )}
            </div>
          </div>

          {/* Data Freshness (Read-only) */}
          <div style={{ marginTop: 24, paddingTop: 24, borderTop: "1px solid var(--border-primary)" }}>
            <div className={styles.fieldLabel}>Data Freshness</div>
            {metric.data_freshness_metadata ? (
              <div className={styles.fieldValue}>
                {metric.endpoint && (
                  <div style={{ marginBottom: 16 }}>
                    <div style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 4 }}>
                      Dataset
                    </div>
                    <div style={{ fontSize: 13 }}>
                      {metric.dataset_name ? (
                        <span>{metric.dataset_name} <span style={{ color: "var(--text-secondary)" }}>({metric.endpoint})</span></span>
                      ) : (
                        <span>{metric.endpoint}</span>
                      )}
                    </div>
                  </div>
                )}
                <div className={styles.grid2}>
                  <div>
                    <div style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 4 }}>
                      Update Frequency
                    </div>
                    <div>
                      <FreshnessBadge freshness={{
                        update_frequency: metric.data_freshness_metadata.detected_update_frequency,
                        lag_days: metric.data_freshness_metadata.lag_days,
                        is_stale: (metric.data_freshness_metadata.lag_days ?? 0) > 7
                      }} />
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 4 }}>
                      Lag Time
                    </div>
                    <div>
                      {metric.data_freshness_metadata.lag_days !== undefined
                        ? `${metric.data_freshness_metadata.lag_days} days behind`
                        : "—"}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 4 }}>
                      First Date
                    </div>
                    <div style={{ fontSize: 13 }}>
                      {metric.earliest_data_date || metric.data_freshness_metadata.earliest_data_date
                        ? formatDate(metric.earliest_data_date || metric.data_freshness_metadata.earliest_data_date)
                        : "—"}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 4 }}>
                      Last Date
                    </div>
                    <div style={{ fontSize: 13 }}>
                      {metric.most_recent_data_date || metric.data_freshness_metadata.most_recent_data_date
                        ? formatDate(metric.most_recent_data_date || metric.data_freshness_metadata.most_recent_data_date)
                        : "—"}
                    </div>
                  </div>
                </div>
                <div style={{ marginTop: 12, display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button
                    className={styles.secondaryBtn}
                    onClick={() => {
                      if (!metric?.id) return;
                      validateFreshnessMutation.mutate(
                        { metricId: metric.id, payload: { days_to_analyze: 90 } },
                        {
                          onSuccess: (res) => {
                            alert(res.message || "Freshness validation completed");
                            metricQuery.refetch();
                          },
                          onError: (err) => {
                            console.error("Error validating freshness:", err);
                            alert("Failed to validate freshness");
                          },
                        }
                      );
                    }}
                  >
                    <i className="fas fa-sync-alt" /> Validate Freshness
                  </button>
                  {completenessData && completenessData.has_data && (
                    <button
                      className={styles.secondaryBtn}
                      onClick={() => setShowCompletenessDetails(!showCompletenessDetails)}
                    >
                      <i className={`fas fa-${showCompletenessDetails ? "chevron-up" : "chevron-down"}`} />{" "}
                      {showCompletenessDetails ? "Hide" : "Show"} Completeness Details
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <div className={styles.fieldValue}>
                <div style={{ color: "var(--text-secondary)", fontSize: 13, marginBottom: 12 }}>
                  No freshness metadata available. Run "Validate Freshness" to analyze data freshness.
                </div>
                {completenessData && completenessData.has_data && (
                  <button
                    className={styles.secondaryBtn}
                    onClick={() => setShowCompletenessDetails(!showCompletenessDetails)}
                  >
                    <i className={`fas fa-${showCompletenessDetails ? "chevron-up" : "chevron-down"}`} />{" "}
                    {showCompletenessDetails ? "Hide" : "Show"} Completeness Details
                  </button>
                )}
              </div>
            )}
            
            {/* Completeness Statistics - Always show if available */}
            {completenessStats && completenessStats.total_checks > 0 && (
              <div style={{ 
                    marginTop: 16, 
                    padding: 16, 
                    backgroundColor: "var(--bg-secondary, #f5f5f5)",
                    borderRadius: 4,
                    border: "1px solid var(--border-primary)"
                  }}>
                    <div style={{ marginBottom: 12, display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                      <h4 style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>
                        📊 Completeness Statistics
                      </h4>
                      <button
                        className={styles.dangerBtn || styles.secondaryBtn}
                        onClick={() => {
                          if (!metric?.id) return;
                          if (!window.confirm(
                            `Are you sure you want to flush all completeness data for "${metric.metric_name}"?\n\n` +
                            `This will delete ${completenessStats.total_checks.toLocaleString()} period records and allow completeness patterns to be relearned from scratch.\n\n` +
                            `This action cannot be undone.`
                          )) return;
                          setFlushingCompleteness(true);
                          flushCompletenessMutation.mutate(
                            { metricId: metric.id },
                            {
                              onSuccess: (res) => {
                                alert(res.message || "Completeness data flushed successfully");
                                // Clear local state to reflect the deletion
                                setCompletenessData(null);
                                setCompletenessStats(null);
                                setCompletenessDaily(null);
                                metricQuery.refetch();
                              },
                              onError: (err) => {
                                console.error("Error flushing completeness:", err);
                                alert(err instanceof Error ? err.message : "Failed to flush completeness data");
                              },
                              onSettled: () => {
                                setFlushingCompleteness(false);
                              },
                            }
                          );
                        }}
                        disabled={flushingCompleteness}
                        style={{ 
                          padding: "4px 10px", 
                          fontSize: 11, 
                          backgroundColor: "var(--color-danger, #ef4444)",
                          color: "white",
                          border: "none",
                          borderRadius: 4,
                          cursor: flushingCompleteness ? "not-allowed" : "pointer",
                          opacity: flushingCompleteness ? 0.7 : 1,
                        }}
                        title="Delete all completeness data and start fresh"
                      >
                        <i className={`fas fa-${flushingCompleteness ? "spinner fa-spin" : "trash-alt"}`} style={{ marginRight: 4 }} />
                        {flushingCompleteness ? "Flushing..." : "Flush Data"}
                      </button>
                    </div>
                    
                    <div style={{ 
                      display: "grid", 
                      gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", 
                      gap: 12,
                      marginBottom: 12
                    }}>
                      <div style={{ padding: 8, backgroundColor: "var(--bg-primary, #fff)", borderRadius: 4 }}>
                        <div style={{ fontSize: 11, color: "var(--text-secondary)", marginBottom: 4 }}>
                          Total Checks
                        </div>
                        <div style={{ fontSize: 18, fontWeight: 600 }}>
                          {completenessStats.total_checks.toLocaleString()}
                        </div>
                      </div>
                      
                      <div style={{ padding: 8, backgroundColor: "var(--bg-primary, #fff)", borderRadius: 4 }}>
                        <div style={{ fontSize: 11, color: "var(--text-secondary)", marginBottom: 4 }}>
                          Total Changes
                        </div>
                        <div style={{ fontSize: 18, fontWeight: 600, color: completenessStats.total_changes > 0 ? "var(--color-warning, #f59e0b)" : "var(--text-primary)" }}>
                          {completenessStats.total_changes.toLocaleString()}
                        </div>
                        {completenessStats.recent_changes > 0 && (
                          <div style={{ fontSize: 10, color: "var(--text-secondary)", marginTop: 2 }}>
                            {completenessStats.recent_changes} this week
                          </div>
                        )}
                      </div>
                      
                      <div style={{ padding: 8, backgroundColor: "var(--bg-primary, #fff)", borderRadius: 4 }}>
                        <div style={{ fontSize: 11, color: "var(--text-secondary)", marginBottom: 4 }}>
                          Stable Periods
                        </div>
                        <div style={{ fontSize: 18, fontWeight: 600, color: "var(--color-success, #10b981)" }}>
                          {completenessStats.stable_periods_count.toLocaleString()}
                        </div>
                        {completenessStats.avg_stable_days && (
                          <div style={{ fontSize: 10, color: "var(--text-secondary)", marginTop: 2 }}>
                            Avg {completenessStats.avg_stable_days.toFixed(1)} days
                          </div>
                        )}
                      </div>
                      
                      <div style={{ padding: 8, backgroundColor: "var(--bg-primary, #fff)", borderRadius: 4 }}>
                        <div style={{ fontSize: 11, color: "var(--text-secondary)", marginBottom: 4 }}>
                          Unstable Periods
                        </div>
                        <div style={{ fontSize: 18, fontWeight: 600, color: "var(--color-warning, #f59e0b)" }}>
                          {completenessStats.unstable_periods_count.toLocaleString()}
                        </div>
                      </div>
                    </div>
                    
                    {/* Daily Completeness Sparkline */}
                    {completenessDaily && completenessDaily.data.length > 0 && (
                      <div style={{ 
                        marginTop: 12, 
                        padding: 12, 
                        backgroundColor: "var(--bg-primary, #fff)", 
                        borderRadius: 4,
                        border: "1px solid var(--border-secondary, #e0e0e0)"
                      }}>
                        <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 12 }}>
                          Daily Completeness Trend (Last 90 Days)
                        </div>
                        <div style={{ marginTop: 8, marginBottom: 8, paddingTop: 8, width: "100%", overflowX: "auto" }}>
                          <CompletenessSparkline 
                            data={completenessDaily.data} 
                            width={600} 
                            height={60}
                          />
                        </div>
                        <div style={{ fontSize: 10, color: "var(--text-secondary)", marginTop: 8 }}>
                          <i className="fas fa-info-circle" style={{ marginRight: 4 }} />
                          Green = No growth, Split bars = Current (blue) vs First Seen (orange) - shows data growth over time
                        </div>
                      </div>
                    )}
                    
                    {completenessStats.max_change_magnitude_pct && (
                      <div style={{ 
                        marginTop: 12, 
                        padding: 12, 
                        backgroundColor: "var(--bg-primary, #fff)", 
                        borderRadius: 4,
                        border: "1px solid var(--border-secondary, #e0e0e0)"
                      }}>
                        <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8 }}>
                          Change Magnitude
                        </div>
                        <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
                          {completenessStats.max_change_magnitude_pct && (
                            <div>
                              <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>Max Change</div>
                              <div style={{ fontSize: 14, fontWeight: 600 }}>
                                {completenessStats.max_change_magnitude_pct.toFixed(1)}%
                              </div>
                            </div>
                          )}
                          {completenessStats.avg_change_magnitude_pct && (
                            <div>
                              <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>Avg Change</div>
                              <div style={{ fontSize: 14, fontWeight: 600 }}>
                                {completenessStats.avg_change_magnitude_pct.toFixed(1)}%
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                    
                    <div style={{ 
                      marginTop: 12, 
                      padding: 8, 
                      fontSize: 11, 
                      color: "var(--text-secondary)",
                      display: "flex",
                      gap: 16,
                      flexWrap: "wrap"
                    }}>
                      {completenessStats.periods_checked_today > 0 && (
                        <span>
                          <i className="fas fa-check-circle" style={{ color: "var(--color-success, #10b981)", marginRight: 4 }} />
                          {completenessStats.periods_checked_today.toLocaleString()} checked today
                        </span>
                      )}
                      {completenessStats.periods_checked_this_week > 0 && (
                        <span>
                          <i className="fas fa-calendar-week" style={{ marginRight: 4 }} />
                          {completenessStats.periods_checked_this_week.toLocaleString()} checked this week
                        </span>
                      )}
                      {completenessStats.last_check_date && (
                        <span>
                          <i className="fas fa-clock" style={{ marginRight: 4 }} />
                          Last check: {new Date(completenessStats.last_check_date).toLocaleDateString()}
                        </span>
                      )}
                    </div>
                  </div>
            )}
            
            {/* Period Completeness Details - Show outside freshness metadata section too */}
            {showCompletenessDetails && completenessData && completenessData.has_data && (
              <div style={{ 
                    marginTop: 16, 
                    padding: 16, 
                    backgroundColor: "var(--bg-secondary, #f5f5f5)",
                    borderRadius: 4,
                    border: "1px solid var(--border-primary)"
                  }}>
                    <div style={{ marginBottom: 12 }}>
                      <h4 style={{ margin: 0, fontSize: 14, fontWeight: 600, marginBottom: 8 }}>
                        Period Completeness & Stability
                      </h4>
                      <p style={{ margin: 0, fontSize: 12, color: "var(--text-secondary)" }}>
                        This metric's data may build up over time as reports are filed. 
                        We track when periods stabilize to avoid false alerts from incomplete data.
                      </p>
                    </div>
                    
                    {completenessLoading ? (
                      <div style={{ padding: 12, textAlign: "center", color: "var(--text-secondary)" }}>
                        Loading completeness data...
                      </div>
                    ) : completenessData.period_types.length === 0 ? (
                      <div style={{ padding: 12, textAlign: "center", color: "var(--text-secondary)" }}>
                        No completeness data available yet. This will populate as time series data is stored.
                      </div>
                    ) : (
                      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                        {completenessData.period_types.map((periodInfo) => (
                          <div 
                            key={periodInfo.period_type}
                            style={{
                              padding: 12,
                              backgroundColor: "var(--bg-primary, #fff)",
                              borderRadius: 4,
                              border: "1px solid var(--border-secondary, #e0e0e0)"
                            }}
                          >
                            <div style={{ 
                              display: "flex", 
                              justifyContent: "space-between", 
                              alignItems: "center",
                              marginBottom: 8
                            }}>
                              <strong style={{ textTransform: "capitalize", fontSize: 13 }}>
                                {periodInfo.period_type} Periods
                              </strong>
                              {periodInfo.is_stable && (
                                <span className={`${styles.badge} ${styles.badgeSuccess}`} style={{ fontSize: 11 }}>
                                  Stable
                                </span>
                              )}
                              {!periodInfo.is_stable && periodInfo.avg_days_to_stabilize && (
                                <span className={`${styles.badge} ${styles.badgeWarning}`} style={{ fontSize: 11 }}>
                                  Learning
                                </span>
                              )}
                            </div>
                            
                            {/* Progress tracking for periods without patterns */}
                            {!periodInfo.is_stable && (
                              <>
                                {(periodInfo.stable_periods_count !== null && periodInfo.stable_periods_count !== undefined) || 
                                 (periodInfo.total_periods_tracked !== null && periodInfo.total_periods_tracked !== undefined) ? (
                                  <>
                                    {/* Progress bar */}
                                    {periodInfo.stable_periods_count !== null && periodInfo.stable_periods_count !== undefined && (
                                      <div style={{ marginBottom: 12 }}>
                                        <div style={{ 
                                          display: "flex", 
                                          justifyContent: "space-between", 
                                          alignItems: "center",
                                          marginBottom: 4,
                                          fontSize: 12
                                        }}>
                                          <span style={{ color: "var(--text-secondary)" }}>
                                            Stable Periods Progress
                                          </span>
                                          <span style={{ fontWeight: 600, fontSize: 13 }}>
                                            {periodInfo.stable_periods_count} / {periodInfo.min_stable_periods_required || 5} required
                                          </span>
                                        </div>
                                        <div style={{
                                          width: "100%",
                                          height: 8,
                                          backgroundColor: "var(--bg-tertiary, #e0e0e0)",
                                          borderRadius: 4,
                                          overflow: "hidden"
                                        }}>
                                          <div style={{
                                            width: `${Math.min(100, ((periodInfo.stable_periods_count / (periodInfo.min_stable_periods_required || 5)) * 100))}%`,
                                            height: "100%",
                                            backgroundColor: periodInfo.stable_periods_count >= (periodInfo.min_stable_periods_required || 5) 
                                              ? "var(--success-color, #28a745)" 
                                              : "var(--warning-color, #ffc107)",
                                            transition: "width 0.3s ease"
                                          }} />
                                        </div>
                                      </div>
                                    )}
                                    
                                    {/* Counts breakdown */}
                                    <div style={{ 
                                      display: "grid", 
                                      gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", 
                                      gap: 12,
                                      fontSize: 12,
                                      marginBottom: 12
                                    }}>
                                      {periodInfo.total_periods_tracked !== null && periodInfo.total_periods_tracked !== undefined && (
                                        <div>
                                          <div style={{ color: "var(--text-secondary)", marginBottom: 2 }}>
                                            Total Tracked
                                          </div>
                                          <div style={{ fontWeight: 600 }}>
                                            {periodInfo.total_periods_tracked} periods
                                          </div>
                                        </div>
                                      )}
                                      
                                      {periodInfo.stable_periods_count !== null && periodInfo.stable_periods_count !== undefined && (
                                        <div>
                                          <div style={{ color: "var(--text-secondary)", marginBottom: 2 }}>
                                            Stable
                                          </div>
                                          <div style={{ fontWeight: 600, color: "var(--success-color, #28a745)" }}>
                                            {periodInfo.stable_periods_count}
                                          </div>
                                        </div>
                                      )}
                                      
                                      {periodInfo.unstable_periods_count !== null && periodInfo.unstable_periods_count !== undefined && (
                                        <div>
                                          <div style={{ color: "var(--text-secondary)", marginBottom: 2 }}>
                                            Still Building
                                          </div>
                                          <div style={{ fontWeight: 600, color: "var(--warning-color, #ffc107)" }}>
                                            {periodInfo.unstable_periods_count}
                                          </div>
                                        </div>
                                      )}
                                      
                                      {periodInfo.periods_needed_for_pattern !== null && periodInfo.periods_needed_for_pattern !== undefined && periodInfo.periods_needed_for_pattern > 0 && (
                                        <div>
                                          <div style={{ color: "var(--text-secondary)", marginBottom: 2 }}>
                                            Still Needed
                                          </div>
                                          <div style={{ fontWeight: 600, color: "var(--text-primary)" }}>
                                            {periodInfo.periods_needed_for_pattern} more
                                          </div>
                                        </div>
                                      )}
                                      
                                      {periodInfo.avg_days_to_stabilize !== null && periodInfo.avg_days_to_stabilize !== undefined && (
                                        <div>
                                          <div style={{ color: "var(--text-secondary)", marginBottom: 2 }}>
                                            Avg Days to Stabilize
                                          </div>
                                          <div style={{ fontWeight: 600 }}>
                                            {Math.round(periodInfo.avg_days_to_stabilize)} days
                                          </div>
                                        </div>
                                      )}
                                    </div>
                                    
                                    {/* Status message with estimated time */}
                                    <div style={{ 
                                      marginTop: 8, 
                                      padding: 8, 
                                      backgroundColor: "var(--bg-tertiary, #fafafa)",
                                      borderRadius: 3,
                                      fontSize: 11,
                                      color: "var(--text-secondary)"
                                    }}>
                                      <i className="fas fa-info-circle" style={{ marginRight: 4 }} />
                                      {periodInfo.periods_needed_for_pattern !== null && periodInfo.periods_needed_for_pattern !== undefined && periodInfo.periods_needed_for_pattern > 0 ? (
                                        <>
                                          Need {periodInfo.periods_needed_for_pattern} more stable {periodInfo.periods_needed_for_pattern === 1 ? "period" : "periods"} to establish patterns.
                                          {periodInfo.avg_days_to_stabilize !== null && periodInfo.avg_days_to_stabilize !== undefined && (
                                            <> Pattern typically available after ~{Math.round(periodInfo.avg_days_to_stabilize)} days.</>
                                          )}
                                        </>
                                      ) : periodInfo.total_periods_tracked !== null && periodInfo.total_periods_tracked !== undefined && periodInfo.total_periods_tracked === 0 ? (
                                        <>No periods tracked yet. This will populate as time series data is stored.</>
                                      ) : (
                                        <>Stability patterns are still being learned. Need more historical data.</>
                                      )}
                                    </div>
                                  </>
                                ) : (
                                  <div style={{ 
                                    marginTop: 8, 
                                    padding: 8, 
                                    backgroundColor: "var(--bg-tertiary, #fafafa)",
                                    borderRadius: 3,
                                    fontSize: 11,
                                    color: "var(--text-secondary)"
                                  }}>
                                    <i className="fas fa-info-circle" style={{ marginRight: 4 }} />
                                    Stability patterns are still being learned. Need more historical data.
                                  </div>
                                )}
                              </>
                            )}
                            
                            {/* Pattern stats for stable periods */}
                            {periodInfo.is_stable && (
                              <div style={{ 
                                display: "grid", 
                                gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", 
                                gap: 12,
                                fontSize: 12
                              }}>
                                {periodInfo.sample_size !== null && periodInfo.sample_size !== undefined && (
                                  <div>
                                    <div style={{ color: "var(--text-secondary)", marginBottom: 2 }}>
                                      Based on
                                    </div>
                                    <div style={{ fontWeight: 600 }}>
                                      {periodInfo.sample_size} stable periods
                                    </div>
                                  </div>
                                )}
                                
                                {periodInfo.avg_days_to_stabilize !== null && periodInfo.avg_days_to_stabilize !== undefined && (
                                  <div>
                                    <div style={{ color: "var(--text-secondary)", marginBottom: 2 }}>
                                      Avg Days to Stabilize
                                    </div>
                                    <div style={{ fontWeight: 600 }}>
                                      {Math.round(periodInfo.avg_days_to_stabilize)} days
                                    </div>
                                  </div>
                                )}
                                
                                {periodInfo.completeness_pct !== null && periodInfo.completeness_pct !== undefined && (
                                  <div>
                                    <div style={{ color: "var(--text-secondary)", marginBottom: 2 }}>
                                      Completeness
                                    </div>
                                    <div style={{ fontWeight: 600 }}>
                                      {Math.round(periodInfo.completeness_pct)}%
                                    </div>
                                  </div>
                                )}
                                
                                {periodInfo.days_to_stabilize !== null && periodInfo.days_to_stabilize !== undefined && (
                                  <div>
                                    <div style={{ color: "var(--text-secondary)", marginBottom: 2 }}>
                                      Typical Stabilization
                                    </div>
                                    <div style={{ fontWeight: 600 }}>
                                      {periodInfo.days_to_stabilize} days
                                    </div>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        ))}
                        
                        {completenessData.period_types.every(p => !p.avg_days_to_stabilize && !p.is_stable) && (
                          <div style={{ 
                            padding: 12, 
                            backgroundColor: "var(--bg-tertiary, #fafafa)",
                            borderRadius: 4,
                            fontSize: 12,
                            color: "var(--text-secondary)",
                            textAlign: "center"
                          }}>
                            <i className="fas fa-info-circle" style={{ marginRight: 4 }} />
                            Completeness tracking is active. Patterns will appear as more periods stabilize.
                          </div>
                        )}
                      </div>
                    )}
                  </div>
            )}
          </div>

          {/* City Structure (Read-only) */}
          {cityStructure?.city_id && (
            <div style={{ marginTop: 24, paddingTop: 24, borderTop: "1px solid var(--border-primary)" }}>
              <div className={styles.fieldLabel}>City Structure</div>
              <div className={styles.fieldValue}>
                <div style={{ marginBottom: 10 }}>
                  <span className={`${styles.badge} ${styles.badgePrimary}`}>{cityStructure.status}</span>
                </div>
                {(cityStructure.geographic_structures?.length || 0) > 0 && (
                  <div style={{ marginBottom: 10 }}>
                    <div className={styles.fieldLabel}>Geographic Structures</div>
                    <table className={styles.miniTable}>
                      <thead>
                        <tr>
                          <th className={styles.miniTh}>Name</th>
                          <th className={styles.miniTh}>Field</th>
                          <th className={styles.miniTh}>Range</th>
                        </tr>
                      </thead>
                      <tbody>
                        {cityStructure.geographic_structures.map((g: any, idx: number) => (
                          <tr key={idx}>
                            <td className={styles.miniTd}>{g.structure_name || g.structure_type || "—"}</td>
                            <td className={styles.miniTd}>{g.identifier_field || "—"}</td>
                            <td className={styles.miniTd}>
                              {g.min_value !== null && g.max_value !== null ? `${g.min_value}–${g.max_value}` : "—"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
        <div className={styles.modalFooter}>
          <button className={styles.secondaryBtn} onClick={onClose}>
            Cancel
          </button>
          {onExecute && (
            <button className={styles.secondaryBtn} onClick={() => onExecute(metric.id)}>
              <i className="fas fa-play" /> Execute
            </button>
          )}
          <button
            className={styles.dangerBtn || styles.secondaryBtn}
            onClick={() => {
              if (!metric?.id) return;
              const confirmText = `⚠️ DESTRUCTIVE ACTION ⚠️\n\nAre you sure you want to PURGE ALL DATA for "${metric.metric_name}"?\n\nThis will permanently delete:\n• All time series data points\n• All time series charts/metadata\n• All saved maps\n• All anomaly results and runs\n• All completeness records\n• All stability patterns\n• All metric comparisons\n\nThe metric definition itself will be preserved.\n\nTHIS ACTION CANNOT BE UNDONE!`;
              if (!window.confirm(confirmText)) return;
              
              // Double confirmation for safety
              const doubleConfirm = window.prompt(
                `Type "PURGE" to confirm deletion of all data for "${metric.metric_name}":`,
                ""
              );
              if (doubleConfirm !== "PURGE") {
                if (doubleConfirm !== null) {
                  alert("Purge cancelled. You must type 'PURGE' exactly to confirm.");
                }
                return;
              }
              
              setPurging(true);
              setPurgeResult(null);
              purgeMetricMutation.mutate(
                { metricId: metric.id },
                {
                  onSuccess: (res) => {
                    setPurgeResult(res);
                    const totalDeleted = 
                      res.deleted_time_series_data + 
                      res.deleted_time_series_metadata + 
                      res.deleted_saved_maps + 
                      res.deleted_anomaly_results + 
                      res.deleted_anomaly_runs + 
                      res.deleted_completeness_records + 
                      res.deleted_stability_patterns +
                      res.deleted_comparisons;
                    alert(
                      `✅ Successfully purged all data for "${res.metric_name}"\n\n` +
                      `Deleted:\n` +
                      `• ${res.deleted_time_series_data.toLocaleString()} data points\n` +
                      `• ${res.deleted_time_series_metadata.toLocaleString()} charts\n` +
                      `• ${res.deleted_saved_maps.toLocaleString()} maps\n` +
                      `• ${res.deleted_anomaly_results.toLocaleString()} anomaly results\n` +
                      `• ${res.deleted_anomaly_runs.toLocaleString()} anomaly runs\n` +
                      `• ${res.deleted_completeness_records.toLocaleString()} completeness records\n` +
                      `• ${res.deleted_stability_patterns.toLocaleString()} stability patterns\n` +
                      `• ${res.deleted_comparisons.toLocaleString()} comparisons\n\n` +
                      `Total: ${totalDeleted.toLocaleString()} records deleted`
                    );
                    // Clear local state
                    setCompletenessData(null);
                    setCompletenessStats(null);
                    setCompletenessDaily(null);
                    metricQuery.refetch();
                  },
                  onError: (err) => {
                    console.error("Error purging metric data:", err);
                    alert(err instanceof Error ? err.message : "Failed to purge metric data");
                  },
                  onSettled: () => {
                    setPurging(false);
                  },
                }
              );
            }}
            disabled={purging}
            style={{
              backgroundColor: "var(--color-danger, #ef4444)",
              color: "white",
              border: "none",
              cursor: purging ? "not-allowed" : "pointer",
              opacity: purging ? 0.7 : 1,
            }}
            title="Delete ALL data for this metric (time series, maps, anomalies, completeness)"
          >
            <i className={`fas fa-${purging ? "spinner fa-spin" : "trash-alt"}`} /> {purging ? "Purging..." : "Purge Data"}
          </button>
          <button className={styles.primaryBtn} onClick={saveEdit}>
            <i className="fas fa-save" /> Save
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





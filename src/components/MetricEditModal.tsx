"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import {
  type UpdateAdminMetricRequest,
} from "@/lib/apiClient";
import {
  useMetric,
  useMetricCityStructure,
  useUpdateMetric,
  useValidateMetricFreshness,
} from "@/lib/hooks/useMetrics";
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
  return dt.toLocaleString();
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
          {metric.data_freshness_metadata && (
            <div style={{ marginTop: 24, paddingTop: 24, borderTop: "1px solid var(--border-primary)" }}>
              <div className={styles.fieldLabel}>Data Freshness</div>
              <div className={styles.fieldValue}>
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
                <div style={{ marginTop: 12 }}>
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
                </div>
              </div>
            </div>
          )}

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





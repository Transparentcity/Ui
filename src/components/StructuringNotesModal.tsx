"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import {
  useStructuringNotes,
  useTemplateStructuringNotes,
} from "@/lib/hooks/useMetrics";
import styles from "./MetricsAdmin.module.css";

interface StructuringNotesModalProps {
  /** Metric ID — used for instantiated templates. */
  metricId?: number | null;
  /** Template ID + City ID — used for any template (including failed ones). */
  templateId?: number | null;
  cityId?: number | null;
  isOpen: boolean;
  onClose: () => void;
}

/* ---------- structuring notes types ---------- */

interface IssueAndResolution {
  issue?: string;
  resolution?: string;
  resolved?: boolean;
}

interface ExecutionVerification {
  data_points_returned?: number | null;
  date_range_start?: string | null;
  date_range_end?: string | null;
  sample_values?: number[];
  values_look_reasonable?: boolean;
  notes?: string | null;
}

interface AgentObservations {
  confidence?: number | null;
  confidence_rationale?: string | null;
  dataset_rationale?: string | null;
  date_field_rationale?: string | null;
  category_values_observed?: Record<string, string[]>;
  issues_and_resolutions?: IssueAndResolution[];
  execution_verification?: ExecutionVerification;
  warnings?: string[];
}

interface FreshnessInfo {
  assessment?: string | null;
  lag_days?: number | null;
  detected_frequency?: string | null;
  last_data_date?: string | null;
  earliest_data_date?: string | null;
  notes?: string | null;
}

interface DateFieldInfo {
  field_name?: string;
  detection_method?: string;
  rationale?: string;
  alternatives_considered?: string[];
  confidence?: number | null;
}

interface FieldSearchEntry {
  field_type?: string;
  searched_for?: string;
  status?: string;
  field_found?: string | null;
  confidence?: number | null;
  notes?: string | null;
}

interface ValidationHistoryEntry {
  passed?: boolean;
  phase?: string;
  iteration?: number;
  timestamp?: string | null;
  issues?: string[];
  suggestions?: string[];
}

interface TrialExecution {
  success?: boolean;
  job_id?: string | null;
  rows_processed?: number | null;
  execution_time_ms?: number | null;
  error_message?: string | null;
}

/* ---------- tiny helpers ---------- */

function formatDate(v?: string | null): string {
  if (!v) return "—";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return v;
  return d.toLocaleDateString();
}

function confidenceColor(c: number): string {
  if (c >= 0.8) return "var(--color-success, #22c55e)";
  if (c >= 0.5) return "var(--color-warning, #eab308)";
  return "var(--color-error, #ef4444)";
}

function confidenceLabel(c: number): string {
  if (c >= 0.9) return "Very High";
  if (c >= 0.8) return "High";
  if (c >= 0.6) return "Medium";
  if (c >= 0.4) return "Low";
  return "Very Low";
}

function statusBadge(status: string | null) {
  if (!status) return null;
  const color =
    status === "completed"
      ? "var(--color-success, #22c55e)"
      : status === "failed"
        ? "var(--color-error, #ef4444)"
        : "var(--text-secondary)";
  return (
    <span
      style={{
        display: "inline-block",
        padding: "2px 8px",
        borderRadius: "4px",
        fontSize: "11px",
        fontWeight: 600,
        color: "white",
        background: color,
        textTransform: "uppercase",
        letterSpacing: "0.03em",
      }}
    >
      {status}
    </span>
  );
}

/* ---------- collapsible section ---------- */

function Section({
  title,
  defaultOpen = false,
  badge,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  badge?: React.ReactNode;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className={styles.collapsibleSection}>
      <button
        className={styles.collapsibleHeader}
        onClick={() => setOpen(!open)}
        aria-expanded={open}
      >
        <i className={`fas fa-chevron-${open ? "down" : "right"}`} />
        <span>{title}</span>
        {badge}
      </button>
      {open && <div style={{ padding: "8px 0" }}>{children}</div>}
    </div>
  );
}

/* ---------- sub-components for each notes section ---------- */

function AgentObservationsPanel({ obs }: { obs: AgentObservations }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
      {/* Confidence */}
      {obs.confidence != null && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "10px",
            padding: "10px 12px",
            borderRadius: "6px",
            background: "var(--bg-tertiary, #f8f9fa)",
          }}
        >
          <span style={{ fontWeight: 600, fontSize: "13px" }}>
            Agent Confidence:
          </span>
          <span
            style={{
              fontWeight: 700,
              fontSize: "16px",
              color: confidenceColor(obs.confidence),
            }}
          >
            {Math.round(obs.confidence * 100)}%
          </span>
          <span
            style={{
              fontSize: "12px",
              color: "var(--text-secondary)",
            }}
          >
            ({confidenceLabel(obs.confidence)})
          </span>
          {obs.confidence_rationale && (
            <span
              style={{
                fontSize: "12px",
                color: "var(--text-secondary)",
                marginLeft: "auto",
              }}
            >
              — {obs.confidence_rationale}
            </span>
          )}
        </div>
      )}

      {/* Dataset rationale */}
      {obs.dataset_rationale && (
        <NoteRow label="Dataset Choice" value={obs.dataset_rationale} />
      )}

      {/* Date field rationale */}
      {obs.date_field_rationale && (
        <NoteRow label="Date Field Choice" value={obs.date_field_rationale} />
      )}

      {/* Category values */}
      {obs.category_values_observed &&
        Object.keys(obs.category_values_observed).length > 0 && (
          <div>
            <div style={labelStyle}>Category Values Found</div>
            {Object.entries(obs.category_values_observed).map(
              ([field, values]) => (
                <div key={field} style={{ marginBottom: "6px" }}>
                  <code style={codeStyle}>{field}</code>
                  <span style={{ fontSize: "12px", color: "var(--text-secondary)", marginLeft: "6px" }}>
                    →{" "}
                    {values.slice(0, 10).join(", ")}
                    {values.length > 10 && ` (+${values.length - 10} more)`}
                  </span>
                </div>
              )
            )}
          </div>
        )}

      {/* Issues & resolutions */}
      {obs.issues_and_resolutions && obs.issues_and_resolutions.length > 0 && (
        <div>
          <div style={labelStyle}>Issues Encountered</div>
          {obs.issues_and_resolutions.map(
            (item: IssueAndResolution, i: number) => (
              <div
                key={i}
                style={{
                  padding: "8px 10px",
                  borderRadius: "4px",
                  background: item.resolved
                    ? "rgba(34, 197, 94, 0.06)"
                    : "rgba(239, 68, 68, 0.06)",
                  border: `1px solid ${item.resolved ? "rgba(34, 197, 94, 0.2)" : "rgba(239, 68, 68, 0.2)"}`,
                  marginBottom: "6px",
                  fontSize: "12px",
                }}
              >
                <div style={{ fontWeight: 500 }}>
                  {item.resolved ? "✓" : "✗"} {item.issue}
                </div>
                {item.resolution && (
                  <div style={{ color: "var(--text-secondary)", marginTop: "2px" }}>
                    → {item.resolution}
                  </div>
                )}
              </div>
            )
          )}
        </div>
      )}

      {/* Execution verification */}
      {obs.execution_verification && (
        <ExecutionVerificationPanel ev={obs.execution_verification} />
      )}

      {/* Warnings */}
      {obs.warnings && obs.warnings.length > 0 && (
        <div>
          <div style={labelStyle}>Agent Warnings</div>
          {obs.warnings.map((w, i) => (
            <div
              key={i}
              style={{
                padding: "4px 8px",
                fontSize: "12px",
                color: "var(--color-warning, #92400e)",
                background: "rgba(234, 179, 8, 0.08)",
                borderRadius: "4px",
                marginBottom: "4px",
              }}
            >
              ⚠ {w}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ExecutionVerificationPanel({ ev }: { ev: ExecutionVerification }) {
  return (
    <div>
      <div style={labelStyle}>Execution Verification</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px 16px", fontSize: "12px" }}>
        {ev.data_points_returned != null && (
          <KV label="Data Points" value={String(ev.data_points_returned)} />
        )}
        {ev.date_range_start && (
          <KV label="Date Range" value={`${formatDate(ev.date_range_start)} — ${formatDate(ev.date_range_end)}`} />
        )}
        {ev.sample_values && ev.sample_values.length > 0 && (
          <KV
            label="Sample Values"
            value={ev.sample_values.map((v) => v.toLocaleString()).join(", ")}
          />
        )}
        <KV
          label="Values Reasonable"
          value={ev.values_look_reasonable ? "Yes" : "No"}
        />
      </div>
      {ev.notes && (
        <div style={{ fontSize: "12px", color: "var(--text-secondary)", marginTop: "4px" }}>
          {ev.notes}
        </div>
      )}
    </div>
  );
}

function FreshnessPanel({ f }: { f: FreshnessInfo }) {
  const assessmentColor: Record<string, string> = {
    fresh: "var(--color-success, #22c55e)",
    acceptable: "var(--color-warning, #eab308)",
    stale: "var(--color-error, #ef4444)",
    very_stale: "var(--color-error, #ef4444)",
  };
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px 16px", fontSize: "12px" }}>
      {f.assessment && (
        <KV
          label="Assessment"
          value={f.assessment.replace("_", " ")}
          valueColor={assessmentColor[f.assessment]}
        />
      )}
      {f.lag_days != null && <KV label="Lag" value={`${f.lag_days} days`} />}
      {f.detected_frequency && (
        <KV label="Update Frequency" value={f.detected_frequency} />
      )}
      {f.last_data_date && (
        <KV label="Latest Data" value={formatDate(f.last_data_date)} />
      )}
      {f.earliest_data_date && (
        <KV label="Earliest Data" value={formatDate(f.earliest_data_date)} />
      )}
      {f.notes && (
        <div style={{ gridColumn: "1 / -1", color: "var(--text-secondary)" }}>
          {f.notes}
        </div>
      )}
    </div>
  );
}

function DateFieldPanel({ df }: { df: DateFieldInfo }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "4px", fontSize: "12px" }}>
      <KV label="Field" value={df.field_name ?? "—"} />
      <KV label="Detection" value={df.detection_method?.replace("_", " ") ?? "—"} />
      {df.rationale && <KV label="Rationale" value={df.rationale} />}
      {df.alternatives_considered?.length > 0 && (
        <KV label="Alternatives" value={df.alternatives_considered.join(", ")} />
      )}
      {df.confidence != null && (
        <KV
          label="Confidence"
          value={`${Math.round(df.confidence * 100)}%`}
          valueColor={confidenceColor(df.confidence)}
        />
      )}
    </div>
  );
}

function FieldSearchesPanel({ searches }: { searches: FieldSearchEntry[] }) {
  return (
    <table className={styles.miniTable}>
      <thead>
        <tr>
          <th className={styles.miniTh}>Type</th>
          <th className={styles.miniTh}>Searched For</th>
          <th className={styles.miniTh}>Status</th>
          <th className={styles.miniTh}>Found</th>
          <th className={styles.miniTh}>Confidence</th>
          <th className={styles.miniTh}>Notes</th>
        </tr>
      </thead>
      <tbody>
        {searches.map((s, i) => (
          <tr key={i}>
            <td className={styles.miniTd}>{s.field_type}</td>
            <td className={styles.miniTd}>{s.searched_for}</td>
            <td className={styles.miniTd}>
              <span
                style={{
                  color:
                    s.status === "found"
                      ? "var(--color-success, #22c55e)"
                      : "var(--color-error, #ef4444)",
                  fontWeight: 500,
                }}
              >
                {s.status?.replace("_", " ")}
              </span>
            </td>
            <td className={styles.miniTd}>
              {s.field_found ? <code style={codeStyle}>{s.field_found}</code> : "—"}
            </td>
            <td className={styles.miniTd}>
              {s.confidence != null ? `${Math.round(s.confidence * 100)}%` : "—"}
            </td>
            <td className={styles.miniTd} style={{ maxWidth: "200px", fontSize: "11px" }}>
              {s.notes || "—"}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function ValidationHistoryPanel({
  history,
}: {
  history: ValidationHistoryEntry[];
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
      {history.map((v, i) => (
        <div
          key={i}
          style={{
            padding: "8px 10px",
            borderRadius: "4px",
            background: v.passed
              ? "rgba(34, 197, 94, 0.06)"
              : "rgba(239, 68, 68, 0.06)",
            border: `1px solid ${v.passed ? "rgba(34, 197, 94, 0.2)" : "rgba(239, 68, 68, 0.2)"}`,
            fontSize: "12px",
          }}
        >
          <div style={{ display: "flex", gap: "12px", fontWeight: 500 }}>
            <span>{v.passed ? "✓ Pass" : "✗ Fail"}</span>
            <span style={{ color: "var(--text-secondary)", fontWeight: 400 }}>
              {v.phase} (iteration {v.iteration})
            </span>
            {v.timestamp && (
              <span style={{ color: "var(--text-tertiary)", fontWeight: 400, marginLeft: "auto" }}>
                {formatDate(v.timestamp)}
              </span>
            )}
          </div>
          {v.issues?.length > 0 && (
            <ul style={{ margin: "4px 0 0 16px", padding: 0, color: "var(--text-secondary)" }}>
              {v.issues.map((issue, j) => (
                <li key={j}>{issue}</li>
              ))}
            </ul>
          )}
          {v.suggestions?.length > 0 && (
            <ul style={{ margin: "2px 0 0 16px", padding: 0, color: "var(--text-tertiary)" }}>
              {v.suggestions.map((s, j) => (
                <li key={j}>💡 {s}</li>
              ))}
            </ul>
          )}
        </div>
      ))}
    </div>
  );
}

function TrialExecutionPanel({ te }: { te: TrialExecution }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px 16px", fontSize: "12px" }}>
      <KV
        label="Status"
        value={te.success ? "Success" : "Failed"}
        valueColor={te.success ? "var(--color-success, #22c55e)" : "var(--color-error, #ef4444)"}
      />
      {te.job_id && <KV label="Job ID" value={te.job_id} />}
      {te.rows_processed != null && (
        <KV label="Rows Processed" value={te.rows_processed.toLocaleString()} />
      )}
      {te.execution_time_ms != null && (
        <KV label="Duration" value={`${(te.execution_time_ms / 1000).toFixed(1)}s`} />
      )}
      {te.error_message && (
        <div style={{ gridColumn: "1 / -1", color: "var(--color-error, #ef4444)" }}>
          {te.error_message}
        </div>
      )}
    </div>
  );
}

/* ---------- reusable primitives ---------- */

function NoteRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={labelStyle}>{label}</div>
      <div style={{ fontSize: "13px", color: "var(--text-primary)" }}>
        {value}
      </div>
    </div>
  );
}

function KV({
  label,
  value,
  valueColor,
}: {
  label: string;
  value: string;
  valueColor?: string;
}) {
  return (
    <div>
      <span style={{ color: "var(--text-secondary)" }}>{label}: </span>
      <span style={{ fontWeight: 500, color: valueColor }}>{value}</span>
    </div>
  );
}

const labelStyle: React.CSSProperties = {
  fontSize: "11px",
  fontWeight: 600,
  color: "var(--text-secondary)",
  textTransform: "uppercase",
  letterSpacing: "0.04em",
  marginBottom: "4px",
};

const codeStyle: React.CSSProperties = {
  padding: "1px 5px",
  borderRadius: "3px",
  background: "var(--bg-tertiary, #f0f0f0)",
  fontSize: "11px",
  fontFamily: "monospace",
};

/* ---------- main modal ---------- */

export default function StructuringNotesModal({
  metricId,
  templateId,
  cityId,
  isOpen,
  onClose,
}: StructuringNotesModalProps) {
  // Use metric-based query when we have a metricId, template-based otherwise
  const metricQuery = useStructuringNotes(isOpen && metricId ? metricId : null);
  const templateQuery = useTemplateStructuringNotes(
    isOpen && !metricId && templateId ? templateId : null,
    isOpen && !metricId && cityId ? cityId : null,
  );
  const notesQuery = metricId ? metricQuery : templateQuery;
  const data = notesQuery.data ?? null;

  if (!isOpen) return null;
  if (!metricId && !templateId) return null;

  const notes = data?.structuring_notes ?? {};
  const obs = notes.agent_observations;
  const hasContent =
    data?.has_structured_notes ||
    obs ||
    notes.date_field ||
    notes.freshness ||
    notes.field_searches?.length ||
    notes.validation_history?.length ||
    notes.trial_execution;

  const content = (
    <div className={styles.modalOverlay} onMouseDown={onClose}>
      <div
        className={styles.modal}
        onMouseDown={(e) => e.stopPropagation()}
        style={{ maxWidth: "720px" }}
      >
        {/* Header */}
        <div className={styles.modalHeader}>
          <div className={styles.modalTitle}>
            Structuring Notes
            {data?.template_name && (
              <span style={{ fontWeight: 400, color: "var(--text-secondary)", marginLeft: "6px" }}>
                — {data.template_name}
              </span>
            )}
            {data?.city_name && (
              <span style={{ fontWeight: 400, color: "var(--text-tertiary)", marginLeft: "4px" }}>
                ({data.city_name})
              </span>
            )}
          </div>
          <button className={styles.iconBtn} onClick={onClose} title="Close">
            <i className="fas fa-times" />
          </button>
        </div>

        {/* Body */}
        <div className={styles.modalBody}>
          {notesQuery.isLoading ? (
            <div style={{ padding: "24px", textAlign: "center", color: "var(--text-secondary)" }}>
              Loading…
            </div>
          ) : notesQuery.isError ? (
            <div style={{ padding: "24px", color: "var(--color-error, #ef4444)" }}>
              Failed to load structuring notes.
            </div>
          ) : !hasContent ? (
            <div style={{ padding: "24px", textAlign: "center", color: "var(--text-secondary)" }}>
              No structuring notes available for this metric.
              {!data?.has_structured_notes && notes && Object.keys(notes).length > 0 && (
                <div style={{ marginTop: "8px", fontSize: "12px" }}>
                  (Legacy template hints are present but not in the structured format.)
                </div>
              )}
            </div>
          ) : (
            <>
              {/* Overview bar */}
              <div
                style={{
                  display: "flex",
                  gap: "16px",
                  flexWrap: "wrap",
                  alignItems: "center",
                  padding: "10px 12px",
                  borderRadius: "6px",
                  background: "var(--bg-tertiary, #f8f9fa)",
                  marginBottom: "12px",
                  fontSize: "13px",
                }}
              >
                <span>
                  <strong>Metric:</strong> {data?.metric_name}{" "}
                  <span style={{ color: "var(--text-tertiary)" }}>#{data?.metric_id}</span>
                </span>
                {data?.last_execution_status && (
                  <span>
                    <strong>Last Exec:</strong>{" "}
                    {statusBadge(data.last_execution_status)}
                  </span>
                )}
                {notes.overall_confidence != null && (
                  <span>
                    <strong>Confidence:</strong>{" "}
                    <span
                      style={{
                        fontWeight: 700,
                        color: confidenceColor(notes.overall_confidence),
                      }}
                    >
                      {Math.round(notes.overall_confidence * 100)}%
                    </span>
                  </span>
                )}
                {notes.generated_at && (
                  <span style={{ marginLeft: "auto", fontSize: "11px", color: "var(--text-tertiary)" }}>
                    Generated {formatDate(notes.generated_at)}
                  </span>
                )}
              </div>

              {/* Error context */}
              {notes.error_context && (
                <div
                  style={{
                    padding: "10px 12px",
                    borderRadius: "6px",
                    background: "rgba(239, 68, 68, 0.06)",
                    border: "1px solid rgba(239, 68, 68, 0.2)",
                    marginBottom: "12px",
                    fontSize: "13px",
                    color: "var(--color-error, #ef4444)",
                  }}
                >
                  <strong>Error:</strong> {notes.error_context}
                </div>
              )}

              {/* Warnings */}
              {notes.warnings?.length > 0 && (
                <div style={{ marginBottom: "12px" }}>
                  {notes.warnings.map((w: string, i: number) => (
                    <div
                      key={i}
                      style={{
                        padding: "6px 10px",
                        fontSize: "12px",
                        color: "var(--color-warning, #92400e)",
                        background: "rgba(234, 179, 8, 0.08)",
                        borderRadius: "4px",
                        marginBottom: "4px",
                      }}
                    >
                      ⚠ {w}
                    </div>
                  ))}
                </div>
              )}

              {/* Agent Observations (primary section) */}
              {obs && (
                <Section title="Agent Observations" defaultOpen={true}>
                  <AgentObservationsPanel obs={obs} />
                </Section>
              )}

              {/* Date Field */}
              {notes.date_field && (
                <Section title="Date Field" defaultOpen={!obs}>
                  <DateFieldPanel df={notes.date_field} />
                </Section>
              )}

              {/* Freshness */}
              {notes.freshness && (
                <Section
                  title="Data Freshness"
                  badge={
                    notes.freshness.assessment && (
                      <span
                        style={{
                          marginLeft: "8px",
                          fontSize: "11px",
                          padding: "1px 6px",
                          borderRadius: "3px",
                          background:
                            notes.freshness.assessment === "fresh"
                              ? "rgba(34, 197, 94, 0.12)"
                              : notes.freshness.assessment === "acceptable"
                                ? "rgba(234, 179, 8, 0.12)"
                                : "rgba(239, 68, 68, 0.12)",
                          color:
                            notes.freshness.assessment === "fresh"
                              ? "var(--color-success, #22c55e)"
                              : notes.freshness.assessment === "acceptable"
                                ? "var(--color-warning, #eab308)"
                                : "var(--color-error, #ef4444)",
                        }}
                      >
                        {notes.freshness.assessment.replace("_", " ")}
                      </span>
                    )
                  }
                >
                  <FreshnessPanel f={notes.freshness} />
                </Section>
              )}

              {/* Field Searches */}
              {notes.field_searches?.length > 0 && (
                <Section title={`Field Searches (${notes.field_searches.length})`}>
                  <FieldSearchesPanel searches={notes.field_searches} />
                </Section>
              )}

              {/* Dataset Search */}
              {notes.dataset_search && (
                <Section title="Dataset Selection">
                  <div style={{ fontSize: "12px", display: "flex", flexDirection: "column", gap: "4px" }}>
                    {notes.dataset_search.dataset_chosen && (
                      <KV label="Chosen" value={notes.dataset_search.dataset_chosen} />
                    )}
                    {notes.dataset_search.endpoint_chosen && (
                      <KV label="Endpoint" value={notes.dataset_search.endpoint_chosen} />
                    )}
                    {notes.dataset_search.rationale && (
                      <KV label="Rationale" value={notes.dataset_search.rationale} />
                    )}
                    {notes.dataset_search.datasets_examined?.length > 0 && (
                      <KV
                        label="Examined"
                        value={notes.dataset_search.datasets_examined.join(", ")}
                      />
                    )}
                  </div>
                </Section>
              )}

              {/* Trial Execution */}
              {notes.trial_execution && (
                <Section title="Trial Execution">
                  <TrialExecutionPanel te={notes.trial_execution} />
                </Section>
              )}

              {/* Validation History */}
              {notes.validation_history?.length > 0 && (
                <Section title={`Validation History (${notes.validation_history.length})`}>
                  <ValidationHistoryPanel history={notes.validation_history} />
                </Section>
              )}

              {/* Last execution error */}
              {data?.last_execution_error && (
                <Section title="Last Execution Error">
                  <pre
                    style={{
                      fontSize: "11px",
                      padding: "8px",
                      background: "var(--bg-tertiary, #f8f9fa)",
                      borderRadius: "4px",
                      overflow: "auto",
                      maxHeight: "200px",
                      whiteSpace: "pre-wrap",
                      wordBreak: "break-word",
                    }}
                  >
                    {data.last_execution_error}
                  </pre>
                </Section>
              )}
            </>
          )}
        </div>

        {/* Footer */}
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

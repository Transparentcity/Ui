"use client";

import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import { useAuth0 } from "@auth0/auth0-react";

import MetricEditModal from "@/components/MetricEditModal";
import {
  getCivicResearchLog,
  startCivicResearch,
  updateAdminMetric,
  type CivicResearchEntry,
  type CivicResearchLog,
  type CivicResearchMetric,
  type CivicSummaryTopic,
} from "@/lib/apiClient";
import { notifyJobCreated } from "@/lib/useJobWebSocket";

const TYPED_QUESTION_KEY = "__typed_question__";
const MIN_QUESTION_LENGTH = 10;
const MAX_QUESTION_LENGTH = 300;

const OUTCOMES: Record<string, { label: string; color: string }> = {
  story: { label: "Story published", color: "var(--success, #16a34a)" },
  already_covered: { label: "Already covered", color: "var(--text-secondary, #374151)" },
  no_city_data: { label: "No city data", color: "var(--warning, #d97706)" },
  no_story: { label: "No story", color: "var(--warning, #d97706)" },
  none: { label: "Nothing researched", color: "var(--text-tertiary, #6b7280)" },
  pending: { label: "Queued", color: "var(--text-tertiary, #6b7280)" },
  running: { label: "Running", color: "var(--brand-primary, #ad35fa)" },
  cancelled: { label: "Cancelled", color: "var(--text-tertiary, #6b7280)" },
};
const ERROR_OUTCOME = { label: "Error", color: "var(--error, #ef4444)" };

const sectionTitleStyle: CSSProperties = {
  fontWeight: 700,
  fontSize: 12,
  color: "var(--text-primary, #111)",
  margin: "14px 0 6px",
};
const mutedStyle: CSSProperties = { color: "var(--text-tertiary, #6b7280)", fontSize: 11 };
const rowStyle: CSSProperties = {
  border: "1px solid var(--border-primary, #e5e7eb)",
  borderRadius: 8,
  padding: "8px 10px",
  background: "var(--bg-primary, #fff)",
  fontSize: 12,
};
const primaryButtonStyle: CSSProperties = {
  padding: "4px 10px",
  borderRadius: 5,
  border: "1px solid var(--brand-primary, #ad35fa)",
  background: "var(--brand-primary, #ad35fa)",
  color: "#fff",
  fontSize: 11,
  fontWeight: 600,
  cursor: "pointer",
  flexShrink: 0,
};
const secondaryButtonStyle: CSSProperties = {
  padding: "3px 8px",
  borderRadius: 5,
  border: "1px solid var(--border-primary, #e5e7eb)",
  background: "transparent",
  color: "var(--text-secondary, #374151)",
  fontSize: 11,
  cursor: "pointer",
};

function errorText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

function withoutKey(record: Record<string, string>, key: string): Record<string, string> {
  const next = { ...record };
  delete next[key];
  return next;
}

function OutcomeBadge({ outcome }: { outcome: string }) {
  const { label, color } = OUTCOMES[outcome] ?? ERROR_OUTCOME;
  return (
    <span style={{ color, fontWeight: 700, fontSize: 11, flexShrink: 0 }}>{label}</span>
  );
}

function StartStatus({ jobId, error }: { jobId?: string; error?: string }) {
  if (error) {
    return <div style={{ color: "var(--error, #ef4444)", fontSize: 11, marginTop: 4 }}>{error}</div>;
  }
  if (!jobId) return null;
  return (
    <div style={{ color: "var(--success, #16a34a)", fontSize: 11, marginTop: 4 }}>
      Research started (job {jobId.slice(0, 8)}). Refresh the log when it finishes.
    </div>
  );
}

function TopicRow({
  topic,
  busy,
  disabled,
  jobId,
  error,
  onResearch,
}: {
  topic: CivicSummaryTopic;
  busy: boolean;
  disabled: boolean;
  jobId?: string;
  error?: string;
  onResearch: () => void;
}) {
  const voices = topic.voices ?? [];
  const decision = topic.decision;
  return (
    <div style={rowStyle}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
        <div>
          <div style={{ fontWeight: 700 }}>{topic.title}</div>
          <div style={{ marginTop: 2, fontStyle: topic.question ? "italic" : "normal" }}>
            {topic.question ?? (
              <span style={mutedStyle}>No factual question extracted; Seymour will pick one.</span>
            )}
          </div>
          <div style={{ ...mutedStyle, marginTop: 2 }}>
            {[
              voices.length > 0 ? voices.join(", ") : null,
              decision?.date
                ? `Decision: ${decision.body ? `${decision.body} · ` : ""}${decision.date}`
                : null,
              topic.metric_hints.length > 0
                ? `Metric hints: ${topic.metric_hints.map((id) => `#${id}`).join(", ")}`
                : "No matching metric yet",
            ]
              .filter(Boolean)
              .join(" · ")}
          </div>
        </div>
        <button
          type="button"
          onClick={onResearch}
          disabled={disabled}
          title="Answer this with city data and publish a context story, or log that the data cannot answer it"
          style={{ ...primaryButtonStyle, opacity: disabled ? 0.6 : 1, alignSelf: "flex-start" }}
        >
          {busy ? "Starting…" : "Research"}
        </button>
      </div>
      <StartStatus jobId={jobId} error={error} />
    </div>
  );
}

function LogEntryRow({
  entry,
  metricsById,
}: {
  entry: CivicResearchEntry;
  metricsById: Map<number, CivicResearchMetric>;
}) {
  return (
    <div style={rowStyle}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
        <div style={{ fontWeight: 600 }}>
          {entry.question ?? entry.topic ?? "Scheduled run"}
        </div>
        <OutcomeBadge outcome={entry.outcome} />
      </div>
      <div style={{ ...mutedStyle, marginTop: 2 }}>
        {entry.researched_at ? new Date(entry.researched_at).toLocaleString() : "Not finished"}
        {entry.mode ? ` · ${entry.mode}` : ""}
        {entry.question && entry.topic && entry.topic !== entry.question ? ` · ${entry.topic}` : ""}
      </div>
      {entry.reason && (
        <div style={{ color: "var(--text-secondary, #374151)", marginTop: 4 }}>{entry.reason}</div>
      )}
      {entry.stories.map((story) => (
        <div key={story.id} style={{ marginTop: 4 }}>
          {story.short_hash ? (
            <a href={`/s/${story.short_hash}`} target="_blank" rel="noreferrer">
              {story.headline ?? `Story ${story.id}`}
            </a>
          ) : (
            story.headline ?? `Story ${story.id}`
          )}
          <span style={mutedStyle}>
            {story.status && story.status !== "active" ? ` · ${story.status}` : ""}
            {story.eval_accuracy ? ` · accuracy ${story.eval_accuracy}` : ""}
          </span>
        </div>
      ))}
      {entry.created_metric_ids.length > 0 && (
        <div style={{ ...mutedStyle, marginTop: 4 }}>
          Built{" "}
          {entry.created_metric_ids
            .map((id) => metricsById.get(id)?.metric_name ?? `metric #${id}`)
            .join(", ")}
        </div>
      )}
    </div>
  );
}

function MetricRow({
  metric,
  isAdmin,
  busy,
  onEdit,
  onPromote,
  onDeactivate,
}: {
  metric: CivicResearchMetric;
  isAdmin: boolean;
  busy: boolean;
  onEdit: () => void;
  onPromote: () => void;
  onDeactivate: () => void;
}) {
  const state = !metric.is_active
    ? "Inactive"
    : metric.show_on_dash
      ? "On dashboard"
      : "Hidden, runs daily";
  return (
    <div style={{ ...rowStyle, display: "flex", justifyContent: "space-between", gap: 8 }}>
      <div>
        <div style={{ fontWeight: 600 }}>
          {metric.metric_name} <span style={mutedStyle}>#{metric.id}</span>
        </div>
        <div style={{ ...mutedStyle, marginTop: 2 }}>
          {state} · built {new Date(metric.created_at).toLocaleDateString()}
          {metric.question ? ` · for “${metric.question}”` : ""}
        </div>
      </div>
      {isAdmin && (
        <div style={{ display: "flex", gap: 6, alignItems: "flex-start", flexShrink: 0 }}>
          <button type="button" onClick={onEdit} disabled={busy} style={secondaryButtonStyle}>
            Edit
          </button>
          {metric.is_active && !metric.show_on_dash && (
            <button type="button" onClick={onPromote} disabled={busy} style={secondaryButtonStyle}>
              Show on dashboard
            </button>
          )}
          {metric.is_active && (
            <button type="button" onClick={onDeactivate} disabled={busy} style={secondaryButtonStyle}>
              Deactivate
            </button>
          )}
        </div>
      )}
    </div>
  );
}

interface CivicResearchPanelProps {
  cityId: number;
  /** Topics from the latest civic summary; empty or missing on older summaries. */
  topics?: CivicSummaryTopic[] | null;
  /** Promote, deactivate, and edit use the admin-only metrics API. */
  isAdmin: boolean;
}

/**
 * Civic research: research a summary topic or a typed question, review what
 * each run found, and promote or retire the hidden metrics it built.
 */
export default function CivicResearchPanel({ cityId, topics, isAdmin }: CivicResearchPanelProps) {
  const { getAccessTokenSilently } = useAuth0();
  const [expanded, setExpanded] = useState(false);
  const [log, setLog] = useState<CivicResearchLog | null>(null);
  const [logLoading, setLogLoading] = useState(true);
  const [logError, setLogError] = useState<string | null>(null);
  const [question, setQuestion] = useState("");
  const [starting, setStarting] = useState<string | null>(null);
  const [startedJobs, setStartedJobs] = useState<Record<string, string>>({});
  const [startErrors, setStartErrors] = useState<Record<string, string>>({});
  const [metricBusyId, setMetricBusyId] = useState<number | null>(null);
  const [metricError, setMetricError] = useState<string | null>(null);
  const [editingMetricId, setEditingMetricId] = useState<number | null>(null);

  const fetchLog = useCallback(async () => {
    const token = await getAccessTokenSilently();
    return getCivicResearchLog(cityId, token);
  }, [cityId, getAccessTokenSilently]);

  useEffect(() => {
    let cancelled = false;
    fetchLog()
      .then((data) => {
        if (cancelled) return;
        setLog(data);
        setLogError(null);
      })
      .catch((e: unknown) => {
        if (!cancelled) setLogError(errorText(e));
      })
      .finally(() => {
        if (!cancelled) setLogLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [fetchLog]);

  const refreshLog = useCallback(async () => {
    setLogLoading(true);
    try {
      setLog(await fetchLog());
      setLogError(null);
    } catch (e) {
      setLogError(errorText(e));
    } finally {
      setLogLoading(false);
    }
  }, [fetchLog]);

  const research = useCallback(
    async (key: string, target: { topicTitle: string } | { question: string }) => {
      setStarting(key);
      setStartErrors((prev) => withoutKey(prev, key));
      try {
        const token = await getAccessTokenSilently();
        const started = await startCivicResearch(cityId, target, token);
        notifyJobCreated(started.job_id);
        setStartedJobs((prev) => ({ ...prev, [key]: started.job_id }));
        if (key === TYPED_QUESTION_KEY) setQuestion("");
      } catch (e) {
        setStartErrors((prev) => ({ ...prev, [key]: errorText(e) }));
      } finally {
        setStarting(null);
      }
    },
    [cityId, getAccessTokenSilently]
  );

  const changeMetric = useCallback(
    async (
      metric: CivicResearchMetric,
      change: { show_on_dash: true } | { is_active: false }
    ) => {
      const confirmText =
        "show_on_dash" in change
          ? `Show "${metric.metric_name}" on the public dashboard?`
          : `Deactivate "${metric.metric_name}"? It stops running daily.`;
      if (!window.confirm(confirmText)) return;
      setMetricBusyId(metric.id);
      setMetricError(null);
      try {
        const token = await getAccessTokenSilently();
        await updateAdminMetric(metric.id, change, token);
        await refreshLog();
      } catch (e) {
        setMetricError(errorText(e));
      } finally {
        setMetricBusyId(null);
      }
    },
    [getAccessTokenSilently, refreshLog]
  );

  const metricsById = useMemo(
    () => new Map((log?.created_metrics ?? []).map((m) => [m.id, m])),
    [log]
  );
  const topicList = topics ?? [];
  const entries = log?.entries ?? [];
  const toReview = (log?.created_metrics ?? []).filter((m) => m.is_active && !m.show_on_dash);
  const typedQuestion = question.trim();

  return (
    <section style={{
      background: "var(--bg-secondary, #f8f9fa)",
      border: "1px solid var(--border-primary, #e5e7eb)",
      borderRadius: 12,
      padding: "12px 18px",
      marginBottom: 16,
    }}>
      <button
        type="button"
        onClick={() => setExpanded((open) => !open)}
        aria-expanded={expanded}
        style={{
          display: "flex",
          width: "100%",
          alignItems: "baseline",
          gap: 10,
          padding: 0,
          border: "none",
          background: "transparent",
          cursor: "pointer",
          textAlign: "left",
        }}
      >
        <span style={{
          color: "var(--brand-primary, #ad35fa)",
          fontFamily: "var(--font-heading)",
          fontSize: 13,
          fontWeight: 700,
        }}>
          {expanded ? "▾" : "▸"} Civic research
        </span>
        <span style={mutedStyle}>
          {logLoading && !log
            ? "Loading research log…"
            : [
                `${topicList.length} topic${topicList.length === 1 ? "" : "s"}`,
                `${entries.length} researched in ${log?.days ?? 30} days`,
                `${toReview.length} hidden metric${toReview.length === 1 ? "" : "s"} to review`,
              ].join(" · ")}
        </span>
      </button>

      {expanded && (
        <div>
          <div style={sectionTitleStyle}>Research a question</div>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (typedQuestion.length < MIN_QUESTION_LENGTH) return;
              void research(TYPED_QUESTION_KEY, { question: typedQuestion });
            }}
            style={{ display: "flex", gap: 8 }}
          >
            <input
              type="text"
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              maxLength={MAX_QUESTION_LENGTH}
              placeholder="e.g. Have drug arrests in the Tenderloin risen this year?"
              aria-label="Question to research"
              style={{
                flex: 1,
                padding: "5px 8px",
                borderRadius: 6,
                border: "1px solid var(--border-primary, #e5e7eb)",
                background: "var(--bg-primary, #fff)",
                fontSize: 12,
              }}
            />
            <button
              type="submit"
              disabled={starting !== null || typedQuestion.length < MIN_QUESTION_LENGTH}
              style={{
                ...primaryButtonStyle,
                opacity: starting !== null || typedQuestion.length < MIN_QUESTION_LENGTH ? 0.6 : 1,
              }}
            >
              {starting === TYPED_QUESTION_KEY ? "Starting…" : "Research"}
            </button>
          </form>
          <StartStatus
            jobId={startedJobs[TYPED_QUESTION_KEY]}
            error={startErrors[TYPED_QUESTION_KEY]}
          />

          {topicList.length > 0 && (
            <>
              <div style={sectionTitleStyle}>Topics in the latest summary</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {topicList.map((topic) => (
                  <TopicRow
                    key={topic.title}
                    topic={topic}
                    busy={starting === topic.title}
                    disabled={starting !== null}
                    jobId={startedJobs[topic.title]}
                    error={startErrors[topic.title]}
                    onResearch={() => void research(topic.title, { topicTitle: topic.title })}
                  />
                ))}
              </div>
            </>
          )}

          <div style={{ ...sectionTitleStyle, display: "flex", alignItems: "center", gap: 8 }}>
            Research log
            <button
              type="button"
              onClick={() => void refreshLog()}
              disabled={logLoading}
              style={{ ...secondaryButtonStyle, opacity: logLoading ? 0.5 : 1 }}
            >
              ↻ Refresh
            </button>
          </div>
          {logError && <div style={{ color: "var(--error, #ef4444)", fontSize: 12 }}>{logError}</div>}
          {!logError && entries.length === 0 && (
            <div style={mutedStyle}>{logLoading ? "Loading…" : "Nothing researched yet."}</div>
          )}
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {entries.map((entry, index) => (
              <LogEntryRow
                key={`${entry.job_id}-${index}`}
                entry={entry}
                metricsById={metricsById}
              />
            ))}
          </div>

          {(log?.created_metrics.length ?? 0) > 0 && (
            <>
              <div style={sectionTitleStyle}>Metrics built by research</div>
              {metricError && (
                <div style={{ color: "var(--error, #ef4444)", fontSize: 12, marginBottom: 6 }}>
                  {metricError}
                </div>
              )}
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {log?.created_metrics.map((metric) => (
                  <MetricRow
                    key={metric.id}
                    metric={metric}
                    isAdmin={isAdmin}
                    busy={metricBusyId === metric.id}
                    onEdit={() => setEditingMetricId(metric.id)}
                    onPromote={() => void changeMetric(metric, { show_on_dash: true })}
                    onDeactivate={() => void changeMetric(metric, { is_active: false })}
                  />
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {editingMetricId != null && (
        <MetricEditModal
          metricId={editingMetricId}
          isOpen
          onClose={() => setEditingMetricId(null)}
          onSave={() => void refreshLog()}
        />
      )}
    </section>
  );
}

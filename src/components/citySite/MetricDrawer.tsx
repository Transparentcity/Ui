"use client";

/**
 * MetricDrawer — slide-in drawer for a single metric in the City site view.
 *
 * Panels:
 *   - Header: name, category/template, public toggle
 *   - Health: freshness explanation, structure flags
 *   - Share & embed: canonical URLs, iframe code, shortcodes per asset
 *   - Run history: from metric_run_log (falls back to last_execution_*)
 *   - Stories: AdminStoryRow list with judge and hide/show actions
 *   - Actions: Re-run, Generate story (with quota), Edit (admin only)
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth0 } from "@auth0/auth0-react";
import type { OpsMetricDetail, OpsCityStory } from "@/lib/apiClient";
import {
  getOpsMetricDetail,
  getJob,
  opsGenerateMetricStory,
  opsSetStoryVisibility,
  opsBatchExecute,
  getOpsStoryReview,
  opsJudgeStory,
  opsRejudgeStory,
  opsAutocorrectStory,
  opsSetStoryOverride,
  updateCityMetric,
} from "@/lib/apiClient";
import AdminStoryRow from "@/components/admin/AdminStoryRow";
import type { ReviewStory, StoryReviewApi } from "@/components/StoryReviewModal";
import StoryReviewModal from "@/components/StoryReviewModal";
import MetricAssetLinks from "./MetricAssetLinks";
import styles from "./CitySite.module.css";

// ── helpers ────────────────────────────────────────────────────────────────

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString();
}

function statusClass(status: string): string {
  const s = status.toLowerCase();
  if (s === "completed" || s === "success") return styles.runStatusOk;
  if (s === "failed" || s === "error" || s === "cancelled") return styles.runStatusFail;
  return styles.runStatusUnknown;
}

function toReviewStory(s: OpsCityStory & { article_html?: string | null; summary?: string | null; metadata?: Record<string, unknown> }): ReviewStory {
  return {
    id: s.id,
    headline: s.headline ?? "",
    story_type: s.story_type ?? undefined,
    story_date: s.story_date ?? undefined,
    city_emoji: s.city_emoji ?? undefined,
    city_name: s.city_name ?? undefined,
    metadata: s.metadata,
    article_html: s.article_html ?? undefined,
    summary: s.summary ?? undefined,
    description: s.description ?? undefined,
    job_session_id: s.job_session_id ?? undefined,
    short_hash: s.short_hash ?? undefined,
  };
}

// ── Toggle pill ────────────────────────────────────────────────────────────

interface ToggleProps {
  on: boolean;
  onToggle: (next: boolean) => void;
  disabled?: boolean;
}

function TogglePill({ on, onToggle, disabled }: ToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      disabled={disabled}
      onClick={() => onToggle(!on)}
      className={`${styles.toggle} ${on ? styles.toggleOn : styles.toggleOff}`}
    >
      <span
        className={`${styles.toggleThumb} ${on ? styles.toggleThumbOn : styles.toggleThumbOff}`}
      />
    </button>
  );
}

// ── Main drawer ────────────────────────────────────────────────────────────

interface MetricDrawerProps {
  cityId: number;
  metricId: number;
  canManage: boolean;
  isAdmin: boolean;
  onClose: () => void;
  onViewJob: (jobId: string) => void;
  onEditMetric?: (id: number) => void;
  /** Callback so parent can refresh the metric row's show_on_dash state. */
  onTogglePublic?: (metricId: number, newVal: boolean) => void;
}

export default function MetricDrawer({
  cityId,
  metricId,
  canManage,
  isAdmin,
  onClose,
  onViewJob,
  onEditMetric,
  onTogglePublic,
}: MetricDrawerProps) {
  const { getAccessTokenSilently } = useAuth0();
  const [detail, setDetail] = useState<OpsMetricDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toggling, setToggling] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [genJobId, setGenJobId] = useState<string | null>(null);
  const [reviewingStory, setReviewingStory] = useState<ReviewStory | null>(null);
  const [hidingStory, setHidingStory] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const token = await getAccessTokenSilently();
      const d = await getOpsMetricDetail(cityId, metricId, token);
      setDetail(d);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load metric detail");
    } finally {
      setLoading(false);
    }
  }, [cityId, metricId, getAccessTokenSilently]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (!genJobId) return;
    let cancelled = false;
    const poll = async () => {
      try {
        const token = await getAccessTokenSilently();
        const job = await getJob(genJobId, token);
        if (cancelled) return;
        if (job.status === "pending" || job.status === "running") return;
        setGenJobId(null);
        setGenerating(false);
        if (job.status === "failed" || job.status === "cancelled") {
          setError(job.error_message || "Story generation failed.");
        }
        void load();
      } catch {
        // Keep polling until the job reaches a terminal status.
      }
    };
    const timer = setInterval(() => void poll(), 5000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [genJobId, getAccessTokenSilently, load]);

  const handleTogglePublic = useCallback(async (next: boolean) => {
    if (!detail || toggling) return;
    setToggling(true);
    try {
      const token = await getAccessTokenSilently();
      await updateCityMetric(cityId, metricId, { show_on_dash: next }, token);
      setDetail((d) => d ? { ...d, show_on_dash: next } : d);
      onTogglePublic?.(metricId, next);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not update whether this metric is public.");
    } finally {
      setToggling(false);
    }
  }, [detail, toggling, cityId, metricId, getAccessTokenSilently, onTogglePublic]);

  const handleReRun = useCallback(async () => {
    if (!detail) return;
    try {
      const token = await getAccessTokenSilently();
      await opsBatchExecute(cityId, { city_id: cityId, metric_ids: [metricId] }, token);
    } catch (e) {
      console.error("Re-run failed", e);
    }
  }, [detail, cityId, metricId, getAccessTokenSilently]);

  const handleGenerate = useCallback(async () => {
    if (!detail || generating) return;
    setGenerating(true);
    try {
      const token = await getAccessTokenSilently();
      const res = await opsGenerateMetricStory(cityId, metricId, token);
      if (res.job_id) {
        setGenJobId(res.job_id);
      } else {
        setGenerating(false);
        setError("Story generation did not return a job id.");
      }
    } catch (e) {
      console.error("Generate story failed", e);
      setGenerating(false);
    }
  }, [detail, generating, cityId, metricId, getAccessTokenSilently]);

  const handleHideStory = useCallback(async (storyId: number, currentStatus: string) => {
    const newStatus: "active" | "hidden" = currentStatus === "hidden" ? "active" : "hidden";
    setHidingStory(storyId);
    try {
      const token = await getAccessTokenSilently();
      await opsSetStoryVisibility(cityId, storyId, newStatus, token);
      setDetail((d) =>
        d
          ? {
              ...d,
              stories: d.stories.map((s) =>
                s.id === storyId ? { ...s, status: newStatus } : s
              ),
            }
          : d
      );
    } catch (e) {
      console.error("Visibility toggle failed", e);
    } finally {
      setHidingStory(null);
    }
  }, [cityId, getAccessTokenSilently]);

  const openReviewModal = useCallback(async (storyRow: OpsCityStory) => {
    try {
      const token = await getAccessTokenSilently();
      const res = await getOpsStoryReview(cityId, storyRow.id, token);
      setReviewingStory(toReviewStory(res.story));
    } catch (e) {
      console.error("Failed to load story review", e);
    }
  }, [cityId, getAccessTokenSilently]);

  const reviewApi = useMemo<StoryReviewApi>(() => ({
    loadEvals: async (storyId, token) =>
      (await getOpsStoryReview(cityId, storyId, token)).evals,
    judge: (storyId, token) => opsJudgeStory(cityId, storyId, token),
    rejudge: (evalId, storyId, token) => opsRejudgeStory(cityId, storyId, evalId, token),
    autocorrect: (evalId, storyId, token) => opsAutocorrectStory(cityId, storyId, evalId, token),
    override: (storyId, token) => opsSetStoryOverride(cityId, storyId, false, token),
    revokeOverride: (storyId, token) => opsSetStoryOverride(cityId, storyId, true, token),
  }), [cityId]);

  // ── Render ─────────────────────────────────────────────────────────────

  return (
    <>
      {/* Overlay */}
      <div
        className={styles.drawerOverlay}
        onClick={(e) => e.target === e.currentTarget && onClose()}
      >
        <aside className={styles.drawer}>
          {/* Header */}
          <div className={styles.drawerHeader}>
            <div className={styles.drawerTitleBlock}>
              <h2 className={styles.drawerTitle}>
                {loading ? "Loading…" : (detail?.metric_name ?? "Metric")}
              </h2>
              {detail && (
                <p className={styles.drawerSubtitle}>
                  {[detail.category, detail.template_name && `Template: ${detail.template_name}`]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              )}
            </div>
            <button type="button" className={styles.drawerCloseBtn} onClick={onClose}>
              ×
            </button>
          </div>

          {error && (
            <p style={{ color: "var(--error, #ef4444)", fontSize: "0.8rem" }}>{error}</p>
          )}

          {detail && (
            <>
              {/* Public toggle */}
              {canManage && (
                <div className={styles.drawerToggleRow}>
                  <TogglePill
                    on={detail.show_on_dash}
                    onToggle={handleTogglePublic}
                    disabled={toggling}
                  />
                  <span className={styles.drawerToggleLabel}>
                    {detail.show_on_dash ? "Public" : "Hidden from site"}
                  </span>
                  <span className={styles.drawerToggleSub}>
                    {detail.show_on_dash
                      ? "Appears on the public city page."
                      : "Toggle on to add to the public city page."}
                  </span>
                </div>
              )}

              {/* Health */}
              <div className={styles.drawerSection}>
                <h3 className={styles.sectionTitle}>Health</h3>
                <div className={styles.healthGrid}>
                  <span className={styles.healthItem}>
                    <span className={styles.healthLabel}>Data through </span>
                    {detail.most_recent_data_date
                      ? new Date(detail.most_recent_data_date).toLocaleDateString("en-US", {
                          month: "short", day: "numeric", year: "numeric",
                        })
                      : "No data"}
                  </span>
                  <span className={styles.healthItem}>
                    <span className={styles.healthLabel}>Last run </span>
                    {detail.last_execution_at
                      ? `${fmtDate(detail.last_execution_at)} (${detail.last_execution_status ?? "?"})`
                      : "Never"}
                  </span>
                  <span className={styles.healthItem}>
                    <span className={styles.healthLabel}>District </span>
                    {detail.has_district_field ? "✓" : "—"}
                  </span>
                  <span className={styles.healthItem}>
                    <span className={styles.healthLabel}>Map </span>
                    {detail.has_map_fields ? "✓" : "—"}
                  </span>
                  <span className={styles.healthItem}>
                    <span className={styles.healthLabel}>Precise location </span>
                    {detail.has_precise_location ? "✓" : "—"}
                  </span>
                </div>
                {detail.last_execution_error && (
                  <p className={styles.runError} title={detail.last_execution_error}>
                    Last error: {detail.last_execution_error}
                  </p>
                )}
              </div>

              <MetricAssetLinks
                permalink={detail.permalink}
                links={detail.asset_links ?? { charts: [], maps: [], anomalies: [] }}
                totals={detail.assets}
                templateId={detail.template_id}
              />

              {/* Run history */}
              <div className={styles.drawerSection}>
                <h3 className={styles.sectionTitle}>Run history</h3>
                {detail.run_history.length === 0 ? (
                  <p style={{ fontSize: "0.75rem", color: "var(--text-secondary, #888)" }}>
                    No run history yet (builds from migration 149 onward).
                  </p>
                ) : (
                  <div className={styles.runHistoryList}>
                    {detail.run_history.map((r, i) => (
                      <div key={r.job_id ?? i} className={styles.runHistoryRow}>
                        <span className={`${styles.runStatus} ${statusClass(r.status)}`}>
                          {r.status}
                        </span>
                        <div className={styles.runMeta}>
                          <div>
                            {fmtDateTime(r.ran_at)}
                            {r.trigger && r.trigger !== "batch" && (
                              <span style={{ marginLeft: 6, fontStyle: "italic" }}>
                                ({r.trigger})
                              </span>
                            )}
                          </div>
                          {r.max_data_date && (
                            <div style={{ fontSize: "0.68rem", color: "var(--text-secondary, #999)" }}>
                              Data through {fmtDate(r.max_data_date)}
                            </div>
                          )}
                          {r.error && (
                            <div className={styles.runError} title={r.error}>
                              {r.error}
                            </div>
                          )}
                        </div>
                        {r.job_id && (
                          <button
                            type="button"
                            className={styles.logsLink}
                            onClick={() => onViewJob(r.job_id!)}
                          >
                            Logs
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Stories */}
              <div className={styles.drawerSection}>
                <h3 className={styles.sectionTitle}>
                  Stories ({detail.stories.length})
                </h3>
                {genJobId && (
                  <div className={styles.generatingRow}>
                    <span className={styles.spinner} />
                    Generating story…
                    <button
                      type="button"
                      className={styles.logsLink}
                      onClick={() => onViewJob(genJobId)}
                    >
                      Logs
                    </button>
                  </div>
                )}
                {detail.stories.length === 0 && !genJobId && (
                  <p style={{ fontSize: "0.75rem", color: "var(--text-secondary, #888)" }}>
                    No stories yet for this metric.
                  </p>
                )}
                {detail.stories.map((story) => (
                  <AdminStoryRow
                    key={story.id}
                    story={{
                      id: story.id,
                      headline: story.headline ?? "",
                      description: story.description ?? null,
                      city_name: story.city_name ?? null,
                      city_emoji: story.city_emoji ?? null,
                      district: story.district ?? null,
                      user_place_id: story.user_place_id ?? null,
                      place_label: story.place_label ?? null,
                      story_date: story.story_date ?? null,
                      published_at: story.published_at ?? null,
                      created_at: story.created_at ?? null,
                      view_count: story.view_count ?? 0,
                      click_count: story.click_count ?? 0,
                      applaud_count: story.applaud_count ?? 0,
                      accuracy: story.accuracy ?? null,
                      job_session_id: story.job_session_id ?? null,
                      scheduled_job_name: story.scheduled_job_name ?? null,
                    }}
                    onViewSession={(sid) => onViewJob(sid)}
                    onOpen={() => void openReviewModal(story)}
                    actions={
                      canManage ? (
                        <button
                          type="button"
                          style={{
                            padding: "0.2rem 0.5rem",
                            border: "1px solid #e0e0e0",
                            borderRadius: 5,
                            background: "none",
                            fontSize: "0.7rem",
                            cursor: "pointer",
                            whiteSpace: "nowrap",
                          }}
                          disabled={hidingStory === story.id}
                          onClick={(e) => {
                            e.stopPropagation();
                            void handleHideStory(story.id, story.status ?? "active");
                          }}
                        >
                          {hidingStory === story.id
                            ? "…"
                            : story.status === "hidden"
                              ? "Show on site"
                              : "Hide from site"}
                        </button>
                      ) : undefined
                    }
                  />
                ))}
              </div>

              {/* Actions */}
              {canManage && (
                <div className={styles.drawerActions}>
                  <button
                    type="button"
                    className={styles.actionBtn}
                    onClick={() => void handleReRun()}
                  >
                    Re-run metric
                  </button>
                  <button
                    type="button"
                    className={`${styles.actionBtn} ${
                      detail.gen_quota.remaining > 0 ? styles.actionBtnPrimary : ""
                    }`}
                    disabled={generating || detail.gen_quota.remaining <= 0}
                    onClick={() => void handleGenerate()}
                  >
                    {generating ? "Generating…" : "✦ Generate story"}
                  </button>
                  <span
                    className={`${styles.quotaNote} ${
                      detail.gen_quota.remaining === 0 ? styles.quotaExhausted : ""
                    }`}
                  >
                    {detail.gen_quota.remaining} of {detail.gen_quota.daily_cap} left today
                  </span>
                  {isAdmin && onEditMetric && (
                    <button
                      type="button"
                      className={styles.actionBtn}
                      onClick={() => onEditMetric(metricId)}
                    >
                      Edit
                    </button>
                  )}
                </div>
              )}
            </>
          )}
        </aside>
      </div>

      {/* Story review modal */}
      {reviewingStory != null && (
        <StoryReviewModal
          story={reviewingStory}
          api={reviewApi}
          canAct={canManage}
          onClose={() => setReviewingStory(null)}
          onViewSession={(sid) => onViewJob(sid)}
        />
      )}
    </>
  );
}

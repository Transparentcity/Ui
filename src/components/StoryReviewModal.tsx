"use client";

/**
 * StoryReviewModal — story preview plus the accuracy-judge sidebar.
 *
 * Shared by the Feed admin tool and the city ops Stories panel. All data and
 * actions go through a StoryReviewApi adapter, so each surface can point it at
 * the routes its viewer may use (admin routes, or /api/ops/cities/{id}/...).
 * `canAct` hides judge / correct / override for view-only viewers, and session
 * links only render when `onViewSession` is provided.
 */

import { useAuth0 } from "@auth0/auth0-react";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import type { FeedStory } from "@/lib/api/feed";
import { autocorrectStoryEval, getJob, type StoryEvalRow } from "@/lib/apiClient";
import { slugify } from "@/lib/utils";
import Loader from "@/components/Loader";
import { EvalCorrectionHistoryPanel } from "@/components/eval/EvalCorrectionHistoryPanel";
import { EvalTicketsPanel } from "@/components/eval/EvalTicketsPanel";
import { JudgeScoresPanel, ScoreBadge } from "@/components/eval/JudgeScoresPanel";
import { VisualizationDeferredInteractiveContainer } from "@/components/VisualizationDeferredInteractiveContainer";
import { processVisualizationShortcodes } from "@/lib/visualizationShortcodes";
import styles from "./FeedAdmin.module.css";

/** Accuracy at or above this keeps a story public and newsletter-eligible. */
export const PASSING_ACCURACY = 4;

/** The story fields the modal reads. FeedStory satisfies it. */
export type ReviewStory = Pick<FeedStory, "id" | "headline"> &
  Partial<
    Pick<
      FeedStory,
      | "story_type"
      | "story_date"
      | "city_emoji"
      | "city_name"
      | "user_place_id"
      | "metadata"
      | "article_html"
      | "summary"
      | "description"
      | "job_session_id"
      | "canonical_path"
      | "public_url"
      | "short_hash"
    >
  >;

export type AutocorrectResponse = Awaited<ReturnType<typeof autocorrectStoryEval>>;

/** Where the modal reads evals and sends judge actions. */
export interface StoryReviewApi {
  loadEvals: (storyId: number, token: string) => Promise<StoryEvalRow[]>;
  judge: (storyId: number, token: string) => Promise<unknown>;
  rejudge: (evalId: number, storyId: number, token: string) => Promise<unknown>;
  autocorrect: (evalId: number, storyId: number, token: string) => Promise<AutocorrectResponse>;
  override: (storyId: number, token: string) => Promise<unknown>;
  revokeOverride: (storyId: number, token: string) => Promise<unknown>;
}

interface StoryReviewModalProps {
  story: ReviewStory;
  api: StoryReviewApi;
  onClose: () => void;
  /** Judge, re-judge, auto-correct, and override. False = view only. */
  canAct: boolean;
  /** Omit to hide creation / judge session links. */
  onViewSession?: (sessionId: string, label: string) => void;
  /** Called when accuracy or the eligibility override changes. */
  onStoryChange?: (storyId: number, metadataPatch: Record<string, unknown>) => void;
  /** Extra footer buttons (e.g. the admin Like toggle). */
  footerActions?: ReactNode;
  /** Evals already fetched with the story; skips the first load. */
  initialEvals?: StoryEvalRow[];
}

function formatDate(value?: string | null): string {
  if (!value) return "\u2014";
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return value;
  return dt.toLocaleDateString();
}

export function storyAccuracy(story: ReviewStory): number | null {
  const raw = story.metadata?.eval_accuracy;
  if (raw == null || raw === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

function GatingBadge({
  accuracy,
  manualOverride,
}: {
  accuracy: number | null;
  manualOverride?: boolean;
}) {
  if (manualOverride) {
    return (
      <span className={`${styles.badge} ${styles.badgeYellow}`} title="Admin override: eligible regardless of eval score">
        override: eligible
      </span>
    );
  }
  if (accuracy == null) {
    return <span className={styles.badge}>unjudged</span>;
  }
  if (accuracy >= PASSING_ACCURACY) {
    return (
      <span className={`${styles.badge} ${styles.badgeGreen}`}>
        public + newsletter
      </span>
    );
  }
  return (
    <span
      className={`${styles.badge} ${styles.badgeRed}`}
      title="Hidden from the public site and newsletter pools until accuracy ≥ 4 or admin override"
    >
      hidden: accuracy {accuracy}
    </span>
  );
}

function fmtTokens(n?: number | null): string {
  if (n == null) return "—";
  return n.toLocaleString();
}

function fmtCost(n?: number | null): string {
  if (n == null) return "—";
  if (n < 0.001) return "<$0.001";
  return `$${n.toFixed(3)}`;
}

function fmtMs(ms?: number | null): string {
  if (ms == null) return "—";
  if (ms < 1000) return `${Math.round(ms)} ms`;
  return `${(ms / 1000).toFixed(1)} s`;
}

/** Creation-session tool-call summary for the story-eval sidebar. */
function StoryEvalTelemetry({ row }: { row: StoryEvalRow }) {
  const t = row.run_telemetry;
  const u = row.judge_usage;
  const byName =
    t?.tool_calls_by_name || t?.session_tool_calls_by_name || null;
  const toolCount = t?.tool_call_count ?? t?.session_tool_call_count;
  const llmCount = t?.llm_call_count ?? t?.session_llm_call_count;
  const failed = t?.failed_tool_calls ?? t?.session_failed_tool_calls;
  const execMs = t?.execution_time_ms ?? t?.session_execution_time_ms;

  if (!t && !u) return null;

  return (
    <div style={{ marginTop: 14 }}>
      <div style={{ fontWeight: 600, fontSize: 12, marginBottom: 4 }}>
        Creation session
      </div>
      <table style={{ fontSize: 12, borderCollapse: "collapse", width: "100%" }}>
        <tbody>
          <tr>
            <td className={styles.muted}>Session trace</td>
            <td style={{ textAlign: "right" }}>
              {t?.session_trace_available
                ? `${toolCount ?? 0} calls loaded`
                : "not available"}
            </td>
          </tr>
          <tr>
            <td className={styles.muted}>LLM calls</td>
            <td style={{ textAlign: "right" }}>{llmCount ?? "n/a"}</td>
          </tr>
          <tr>
            <td className={styles.muted}>Tool calls</td>
            <td style={{ textAlign: "right" }}>
              {toolCount ?? "n/a"}
              {failed ? ` (${failed} failed)` : ""}
            </td>
          </tr>
          {execMs != null && (
            <tr>
              <td className={styles.muted}>Session time</td>
              <td style={{ textAlign: "right" }}>{fmtMs(execMs)}</td>
            </tr>
          )}
          {(row.judge_model_key || u) && (
            <tr>
              <td className={styles.muted}>Judge model</td>
              <td style={{ textAlign: "right", fontWeight: 600 }}>
                {row.judge_model_key || "default"}
              </td>
            </tr>
          )}
          {u && (
            <tr>
              <td className={styles.muted}>Judge cost / time</td>
              <td style={{ textAlign: "right" }}>
                {fmtCost(u.cost_usd)} / {fmtMs(u.judge_ms)}
                {u.prompt_tokens != null || u.completion_tokens != null
                  ? ` · ${fmtTokens(u.prompt_tokens)}→${fmtTokens(u.completion_tokens)}`
                  : ""}
              </td>
            </tr>
          )}
        </tbody>
      </table>
      {byName && Object.keys(byName).length > 0 && (
        <div
          style={{
            marginTop: 6,
            fontSize: 11,
            color: "var(--text-secondary)",
            lineHeight: 1.45,
          }}
        >
          {Object.entries(byName)
            .sort((a, b) => b[1] - a[1])
            .map(([name, count]) => `${count}× ${name}`)
            .join(", ")}
        </div>
      )}
    </div>
  );
}

/** Auto-correction history panel for the eval sidebar. */
function CorrectionHistoryPanel({ row }: { row: StoryEvalRow }) {
  return (
    <EvalCorrectionHistoryPanel
      attemptedAt={row.correction_attempted_at}
      sessionId={row.correction_session_id}
      fields={row.correction_fields}
      errors={row.correction_errors}
      before={row.correction_before}
      after={row.correction_after}
      attempts={row.correction_attempts}
      attemptCount={row.correction_attempt_count}
    />
  );
}

/** Public story page for admin preview — not the CTA `detail_url` (report / chart / anomaly). */
export function publicStoryPath(
  story: Pick<ReviewStory, "id" | "canonical_path" | "public_url" | "short_hash" | "city_name">
): string {
  if (story.canonical_path?.startsWith("/")) return story.canonical_path;
  if (story.public_url?.startsWith("/")) return story.public_url;
  if (story.short_hash && story.city_name) {
    const slug = slugify(story.city_name);
    if (slug) return `/c/${slug}/stories/${story.short_hash}`;
  }
  if (story.short_hash) return `/s/${story.short_hash}`;
  return `/feed/${story.id}`;
}


export default function StoryReviewModal({
  story: storyProp,
  api,
  onClose,
  canAct,
  onViewSession,
  onStoryChange,
  footerActions,
  initialEvals,
}: StoryReviewModalProps) {
  const { getAccessTokenSilently } = useAuth0();
  // Metadata the modal learned (latest accuracy, override) on top of the prop.
  const [metadataOverlay, setMetadataOverlay] = useState<Record<string, unknown>>({});
  const story = useMemo<ReviewStory>(
    () => ({ ...storyProp, metadata: { ...(storyProp.metadata || {}), ...metadataOverlay } }),
    [storyProp, metadataOverlay]
  );
  const [previewEvals, setPreviewEvals] = useState<StoryEvalRow[]>(initialEvals ?? []);
  const [previewEvalsLoading, setPreviewEvalsLoading] = useState(false);
  // Which eval row is shown in detail (null = latest)
  const [selectedEvalId, setSelectedEvalId] = useState<number | null>(null);
  const [previewJudging, setPreviewJudging] = useState(false);
  const [rejudgingId, setRejudgingId] = useState<number | null>(null);
  const [correctingId, setCorrectingId] = useState<number | null>(null);
  const [lastCorrectionResult, setLastCorrectionResult] = useState<{
    corrected: boolean;
    changed_fields?: string[];
    reason?: string;
  } | null>(null);
  const [overridingEligibility, setOverridingEligibility] = useState(false);

  // Stop polling (and state updates) once the modal is closed.
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const patchStory = useCallback(
    (patch: Record<string, unknown>) => {
      setMetadataOverlay((prev) => ({ ...prev, ...patch }));
      onStoryChange?.(storyProp.id, patch);
    },
    [onStoryChange, storyProp.id]
  );

  // Expand [chart:]/[map:]/[anomaly:] shortcodes into live embeds; keep the
  // debug label so admins can still see which shortcode produced each embed.
  const previewArticleHtml = useMemo(() => {
    const html = story.article_html?.trim();
    if (!html) return null;
    return processVisualizationShortcodes(html, {
      chartHeight: "480px",
      mapHeight: "480px",
      anomalyHeight: "380px",
    });
  }, [story.article_html]);

  const accuracy = storyAccuracy(story);

  const loadPreviewEvals = useCallback(
    async (storyId: number) => {
      try {
        setPreviewEvalsLoading(true);
        const token = await getAccessTokenSilently();
        const rows = await api.loadEvals(storyId, token);
        setPreviewEvals(rows);
        const latest = rows.find((r) => r.accuracy_score != null);
        if (latest?.accuracy_score != null) {
          const accuracy = latest.accuracy_score;
          setMetadataOverlay((prev) => ({ ...prev, eval_accuracy: accuracy }));
          onStoryChange?.(storyId, { eval_accuracy: accuracy });
        }
      } catch (err) {
        console.error("Error loading story evals:", err);
        setPreviewEvals([]);
      } finally {
        setPreviewEvalsLoading(false);
      }
    },
    [api, getAccessTokenSilently, onStoryChange]
  );

  const skipFirstLoad = useRef(initialEvals != null);
  useEffect(() => {
    setSelectedEvalId(null);
    if (skipFirstLoad.current) {
      skipFirstLoad.current = false;
      return;
    }
    void loadPreviewEvals(storyProp.id);
  }, [storyProp.id, loadPreviewEvals]);

  const handleJudgePreview = useCallback(async () => {
    try {
      setPreviewJudging(true);
      const token = await getAccessTokenSilently();
      await api.judge(story.id, token);
      toast.success("Judging this story in the background");
      setTimeout(() => void loadPreviewEvals(story.id), 1200);
    } catch (err) {
      console.error("Error judging story:", err);
      toast.error(err instanceof Error ? err.message : "Failed to judge story");
    } finally {
      setPreviewJudging(false);
    }
  }, [api, getAccessTokenSilently, loadPreviewEvals, story.id]);

  const handleRejudge = useCallback(
    async (rowId: number) => {
      try {
        setRejudgingId(rowId);
        const token = await getAccessTokenSilently();
        await api.rejudge(rowId, story.id, token);
        toast.success("Story re-judged");
        await loadPreviewEvals(story.id);
      } catch (err) {
        console.error("Error re-judging story:", err);
        toast.error(err instanceof Error ? err.message : "Re-judge failed");
      } finally {
        setRejudgingId(null);
      }
    },
    [api, getAccessTokenSilently, loadPreviewEvals, story.id]
  );

  const handleAutoCorrect = useCallback(
    async (rowId: number) => {
      try {
        setCorrectingId(rowId);
        setLastCorrectionResult(null);
        const token = await getAccessTokenSilently();
        const resp = await api.autocorrect(rowId, story.id, token);

        // Already-passing fast path — no job created.
        if (resp.job_id === null) {
          toast.info(resp.reason ?? "Nothing to correct");
          setLastCorrectionResult({ corrected: false, reason: resp.reason });
          return;
        }

        // Poll the background job until it completes or fails.
        const { job_id } = resp;
        const POLL_MS = 3000;
        const TIMEOUT_MS = 120_000;
        const deadline = Date.now() + TIMEOUT_MS;

        while (Date.now() < deadline) {
          await new Promise((r) => setTimeout(r, POLL_MS));
          if (!mountedRef.current) return;
          const job = await getJob(job_id, token);

          if (job.status === "completed") {
            const result = job.result as {
              corrected?: boolean;
              changed_fields?: string[];
              reason?: string;
            } | null;
            setLastCorrectionResult({
              corrected: result?.corrected ?? false,
              changed_fields: result?.changed_fields,
              reason: result?.reason,
            });
            if (result?.corrected) {
              toast.success(`Corrected: ${(result.changed_fields ?? []).join(", ")} updated`);
            } else {
              toast.info(result?.reason ?? "Seymour made no changes");
            }
            await loadPreviewEvals(story.id);
            return;
          }

          if (job.status === "failed") {
            throw new Error(job.error ?? "Correction job failed");
          }
          // still running — keep polling
        }
        throw new Error("Auto-correct timed out after 2 minutes");
      } catch (err) {
        console.error("Auto-correct failed:", err);
        toast.error(err instanceof Error ? err.message : "Auto-correct failed");
      } finally {
        setCorrectingId(null);
      }
    },
    [api, getAccessTokenSilently, loadPreviewEvals, story.id]
  );

  const handleOverrideEligible = useCallback(
    async (revoke = false) => {
      try {
        setOverridingEligibility(true);
        const token = await getAccessTokenSilently();
        if (revoke) {
          await api.revokeOverride(story.id, token);
          toast.success("Override revoked — normal eval gating restored");
        } else {
          await api.override(story.id, token);
          toast.success("Story marked eligible — bypass eval gate");
        }
        patchStory({ eval_manual_eligible: revoke ? undefined : "true" });
      } catch (err) {
        console.error("Override eligibility failed:", err);
        toast.error(err instanceof Error ? err.message : "Failed to update override");
      } finally {
        setOverridingEligibility(false);
      }
    },
    [api, getAccessTokenSilently, patchStory, story.id]
  );

  return (
    <div className={styles.previewOverlay} onClick={() => onClose()}>
      <div
        className={`${styles.previewPanel} ${styles.previewPanelWide}`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className={styles.previewHeader}>
          <div className={styles.previewMeta}>
            <span className={styles.badge}>{story.story_type}</span>
            <span className={styles.muted}>{formatDate(story.story_date)}</span>
            {story.city_emoji && <span>{story.city_emoji}</span>}
            <span className={styles.muted}>{story.city_name}</span>
            <GatingBadge
              accuracy={accuracy}
              manualOverride={!!story.metadata?.eval_manual_eligible}
            />
          </div>
          <button
            className={styles.previewClose}
            onClick={() => onClose()}
            aria-label="Close preview"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <h2 className={styles.previewHeadline}>{story.headline}</h2>

        <div className={styles.previewSplit}>
          {/* Left: story content */}
          <div className={styles.previewMain}>
            {(story.user_place_id != null || story.metadata?.category === "personal_newsletter") && (
              <div className={styles.previewPersonalization}>
                <div className={styles.previewPersonalizationTitle}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                    <circle cx="12" cy="7" r="4" />
                  </svg>
                  Personalized story
                </div>
                <div className={styles.previewPersonalizationGrid}>
                  {story.user_place_id != null && (
                    <div className={styles.previewInfoRow}>
                      <span className={styles.previewInfoLabel}>Saved place ID</span>
                      <span className={styles.previewInfoValue}>{story.user_place_id}</span>
                    </div>
                  )}
                  {story.metadata?.category && (
                    <div className={styles.previewInfoRow}>
                      <span className={styles.previewInfoLabel}>Category</span>
                      <span className={styles.previewInfoValue}>{story.metadata.category}</span>
                    </div>
                  )}
                  {story.metadata?.user_place_ids && Array.isArray(story.metadata.user_place_ids) && story.metadata.user_place_ids.length > 0 && (
                    <div className={styles.previewInfoRow}>
                      <span className={styles.previewInfoLabel}>Place IDs</span>
                      <span className={styles.previewInfoValue}>{(story.metadata.user_place_ids as number[]).join(", ")}</span>
                    </div>
                  )}
                  {story.metadata?.user_id && (
                    <div className={styles.previewInfoRow}>
                      <span className={styles.previewInfoLabel}>User ID</span>
                      <span className={styles.previewInfoValue}>{String(story.metadata.user_id)}</span>
                    </div>
                  )}
                  {story.metadata?.user_email && (
                    <div className={styles.previewInfoRow}>
                      <span className={styles.previewInfoLabel}>User email</span>
                      <span className={styles.previewInfoValue}>{String(story.metadata.user_email)}</span>
                    </div>
                  )}
                  <div className={styles.previewInfoRow}>
                    <span className={styles.previewInfoLabel}>Privacy</span>
                    <span className={styles.previewInfoValue}>
                      <span className={styles.previewPrivacyBadge}>
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                          <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                        </svg>
                        Private (saved place)
                      </span>
                    </span>
                  </div>
                </div>
              </div>
            )}

            <div className={styles.previewBody}>
              {previewArticleHtml ? (
                <VisualizationDeferredInteractiveContainer
                  className={styles.previewArticle}
                  html={previewArticleHtml}
                />
              ) : (
                <p className={styles.previewFallback}>
                  {story.summary || story.description || "No content available."}
                </p>
              )}
            </div>
          </div>

          {/* Right: eval sidebar (mirrors newsletter workbench) */}
          <aside className={styles.previewEvalSidebar}>
            {(() => {
              // Derive the active eval row: the one selected by the user,
              // or the latest row if none is selected.
              const latestEval = previewEvals[0] ?? null;
              const activeEval =
                selectedEvalId != null
                  ? (previewEvals.find((r) => r.id === selectedEvalId) ?? latestEval)
                  : latestEval;
              const isViewingOlderRow =
                selectedEvalId != null && selectedEvalId !== latestEval?.id;
              const creationSessionId = latestEval?.session_id || story.job_session_id;
              const judgeSessionId = activeEval?.judge_usage?.judge_session_id;

              return (
                <>
                  {/* ── Header ──────────────────────────────────────────────── */}
                  <div className={styles.previewEvalTitle}>Story eval</div>
                  <div className={styles.muted} style={{ fontSize: 12, marginBottom: 10 }}>
                    Judged against the Seymour session tool-call trace. Accuracy ≥ 4
                    keeps the story on the public site and in newsletter pools;
                    failing accuracy hides it from readers until it passes or an
                    admin sets a manual override.
                  </div>

                  {/* ── Eval history picker (all rows, newest first) ─────────── */}
                  {previewEvals.length > 0 && (
                    <div style={{ marginBottom: 12 }}>
                      <div style={{ fontWeight: 600, fontSize: 12, marginBottom: 5 }}>
                        Eval history ({previewEvals.length})
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                        {previewEvals.map((row, i) => {
                          const isActive =
                            selectedEvalId === row.id ||
                            (selectedEvalId == null && i === 0);
                          return (
                            <button
                              key={row.id}
                              type="button"
                              onClick={() =>
                                setSelectedEvalId(isActive ? null : row.id)
                              }
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: 8,
                                padding: "5px 8px",
                                borderRadius: 6,
                                border: isActive
                                  ? "1px solid var(--brand-primary, #2563eb)"
                                  : "1px solid var(--border-primary)",
                                background: isActive
                                  ? "rgba(37, 99, 235, 0.06)"
                                  : "transparent",
                                cursor: "pointer",
                                textAlign: "left",
                                width: "100%",
                              }}
                            >
                              <ScoreBadge score={row.accuracy_score} size={18} />
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontSize: 11.5, fontWeight: 600 }}>
                                  #{row.id}
                                  {i === 0 ? (
                                    <span
                                      style={{
                                        marginLeft: 5,
                                        fontSize: 9.5,
                                        fontWeight: 500,
                                        padding: "1px 5px",
                                        borderRadius: 8,
                                        background: "var(--bg-secondary)",
                                        color: "var(--text-secondary)",
                                      }}
                                    >
                                      latest
                                    </span>
                                  ) : null}
                                </div>
                                <div
                                  style={{
                                    fontSize: 10.5,
                                    color: "var(--text-tertiary)",
                                    whiteSpace: "nowrap",
                                    overflow: "hidden",
                                    textOverflow: "ellipsis",
                                  }}
                                >
                                  {row.status}
                                  {row.correction_attempted_at ? " · corrected" : ""}
                                  {row.completed_at
                                    ? ` · ${formatDate(row.completed_at)}`
                                    : ""}
                                </div>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* ── "Viewing older eval" notice ───────────────────────────── */}
                  {isViewingOlderRow && (
                    <div
                      style={{
                        fontSize: 11,
                        padding: "5px 8px",
                        marginBottom: 10,
                        borderRadius: 6,
                        background: "rgba(180,130,0,0.07)",
                        color: "#8a6400",
                        border: "1px solid rgba(180,130,0,0.2)",
                      }}
                    >
                      Viewing an older eval. Actions (re-judge, correct) always
                      operate on the <strong>latest</strong> row.
                    </div>
                  )}

                  {/* ── Eval detail for the active row ───────────────────────── */}
                  {previewEvalsLoading ? (
                    <div className={styles.muted} style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <Loader size="sm" color="dark" /> Loading eval…
                    </div>
                  ) : activeEval?.scores_json ? (
                    <>
                      <JudgeScoresPanel
                        scores={activeEval.scores_json}
                        judgeModelKey={activeEval.judge_model_key}
                      />

                      {/* Tickets from new accuracy judge */}
                      {(activeEval.scores_json._tickets?.length ?? 0) > 0 && (
                        <EvalTicketsPanel tickets={activeEval.scores_json._tickets!} />
                      )}

                      {/* Action buttons — always target the latest eval row */}
                      {canAct && !isViewingOlderRow && latestEval && (
                        <div style={{ marginTop: 12, display: "flex", flexWrap: "wrap", gap: 8 }}>
                          <button
                            type="button"
                            className={styles.secondaryBtn}
                            disabled={rejudgingId === latestEval.id}
                            onClick={() => void handleRejudge(latestEval.id)}
                          >
                            {rejudgingId === latestEval.id ? (
                              <Loader size="sm" color="dark" />
                            ) : (
                              "Re-judge"
                            )}
                          </button>
                          <button
                            type="button"
                            className={styles.secondaryBtn}
                            disabled={previewJudging}
                            onClick={() => void handleJudgePreview()}
                          >
                            {previewJudging ? <Loader size="sm" color="dark" /> : "Judge again"}
                          </button>
                          {accuracy !== null && accuracy < PASSING_ACCURACY && (
                              <button
                                type="button"
                                className={styles.primaryBtn}
                                disabled={correctingId === latestEval.id}
                                title="Ask Seymour to make a minimal factual fix based on the judge's accuracy errors"
                                onClick={() => void handleAutoCorrect(latestEval.id)}
                              >
                                {correctingId === latestEval.id ? (
                                  <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                    <Loader size="sm" color="white" /> Correcting…
                                  </span>
                                ) : (
                                  "✦ Auto-correct"
                                )}
                              </button>
                            )}
                          {story.metadata?.eval_manual_eligible ? (
                            <button
                              type="button"
                              className={styles.secondaryBtn}
                              disabled={overridingEligibility}
                              title="Remove admin override — story returns to normal eval gating"
                              onClick={() => void handleOverrideEligible(true)}
                            >
                              {overridingEligibility ? (
                                <Loader size="sm" color="dark" />
                              ) : (
                                "Revoke override"
                              )}
                            </button>
                          ) : (
                            <button
                              type="button"
                              className={styles.secondaryBtn}
                              disabled={overridingEligibility}
                              title="Force this story into the newsletter pool regardless of eval score"
                              onClick={() => void handleOverrideEligible(false)}
                            >
                              {overridingEligibility ? (
                                <Loader size="sm" color="dark" />
                              ) : (
                                "Override eligible"
                              )}
                            </button>
                          )}
                        </div>
                      )}

                      {lastCorrectionResult && !isViewingOlderRow && (
                        <div style={{ marginTop: 8, fontSize: 12 }} className={styles.muted}>
                          {lastCorrectionResult.corrected
                            ? `Corrected: ${(lastCorrectionResult.changed_fields ?? []).join(", ")} — re-judged`
                            : lastCorrectionResult.reason ?? "No changes made"}
                        </div>
                      )}

                      <div style={{ marginTop: 10, fontSize: 11 }} className={styles.muted}>
                        Status: {activeEval.status}
                        {activeEval.source ? ` · ${activeEval.source}` : ""}
                        {activeEval.completed_at
                          ? ` · ${formatDate(activeEval.completed_at)}`
                          : ""}
                      </div>

                      <StoryEvalTelemetry row={activeEval} />
                      <CorrectionHistoryPanel row={activeEval} />
                    </>
                  ) : activeEval?.status === "pending" ? (
                    <div className={styles.muted}>
                      Judging in progress…{" "}
                      <button
                        type="button"
                        className={styles.secondaryBtn}
                        style={{ marginLeft: 6 }}
                        onClick={() => void loadPreviewEvals(story.id)}
                      >
                        Refresh
                      </button>
                    </div>
                  ) : activeEval?.error ? (
                    <div>
                      <div className={styles.errorMessage}>{activeEval.error}</div>
                      {canAct && !isViewingOlderRow && latestEval && (
                        <button
                          type="button"
                          className={styles.secondaryBtn}
                          style={{ marginTop: 8 }}
                          disabled={rejudgingId === latestEval.id}
                          onClick={() => void handleRejudge(latestEval.id)}
                        >
                          {rejudgingId === latestEval.id ? (
                            <Loader size="sm" color="dark" />
                          ) : (
                            "Re-judge"
                          )}
                        </button>
                      )}
                      <StoryEvalTelemetry row={activeEval} />
                      <CorrectionHistoryPanel row={activeEval} />
                    </div>
                  ) : (
                    <div>
                      <div className={styles.muted} style={{ marginBottom: 10 }}>
                        Not judged yet. New stories are judged automatically when
                        producer jobs run; you can also judge this story now.
                      </div>
                      {canAct && (
                        <button
                          type="button"
                          className={styles.primaryBtn}
                          disabled={previewJudging}
                          onClick={() => void handleJudgePreview()}
                        >
                          {previewJudging ? <Loader size="sm" color="dark" /> : "Judge story"}
                        </button>
                      )}
                    </div>
                  )}

                  {/* ── Session links ──────────────────────────────────────────── */}
                  {onViewSession && (creationSessionId || judgeSessionId) && (
                    <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 4 }}>
                      {creationSessionId && (
                        <button
                          type="button"
                          className={styles.jobSessionLink}
                          onClick={() => onViewSession(creationSessionId, "Creation session")}
                        >
                          Creation session
                        </button>
                      )}
                      {judgeSessionId && (
                        <button
                          type="button"
                          className={styles.jobSessionLink}
                          onClick={() => onViewSession(judgeSessionId, "Judge session")}
                        >
                          Judge session
                        </button>
                      )}
                    </div>
                  )}
                </>
              );
            })()}
          </aside>
        </div>

        {/* Footer */}
        <div className={styles.previewFooter}>
          <button className={styles.secondaryBtn} onClick={() => onClose()}>
            Close
          </button>
          <div className={styles.previewFooterActions}>
            {footerActions}
            <a
              className={styles.primaryBtn}
              href={(() => {
                const path = publicStoryPath(story);
                return path.startsWith("http") ? path : `${typeof window !== "undefined" ? window.location.origin : ""}${path}`;
              })()}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                <polyline points="15 3 21 3 21 9" />
                <line x1="10" y1="14" x2="21" y2="3" />
              </svg>
              Visit story
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}

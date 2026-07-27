"use client";

/**
 * Newsletter admin "Library" tab — eval playground.
 *
 * Runs eval batches over the unified newsletter pipeline with synthetic
 * personas (no real subscribers, nothing sendable):
 *   - persona range: many personas x 1 model
 *   - model pivot:   1 persona x many models
 *   - prompt sweep:  1 persona x 1 model x up to 12 prompt templates
 *   - import:        judge existing pending-send drafts
 *
 * Each cell gets deterministic stats (tokens, cost, timing, tool calls) and
 * optional LLM-as-judge scores (accuracy / relevance / cogency /
 * data_honesty / tone, with a fabrication cap).
 */

import { useAuth0 } from "@auth0/auth0-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  getAvailableModels,
  getNewsletterEvalBatch,
  getNewsletterEvalResult,
  getNewsletterPrompts,
  importNewsletterEvalSends,
  listNewsletterEvalBatches,
  listNewsletterEvalPersonas,
  listNewsletterPending,
  rejudgeNewsletterEvalResult,
  runNewsletterEvalBatch,
  type CityListItem,
  type ModelInfo,
  type NewsletterEvalBatchListItem,
  type NewsletterEvalCell,
  type NewsletterEvalJudgeScores,
  type NewsletterEvalPersona,
  type NewsletterEvalResultDetail,
  type NewsletterPendingListItem,
} from "@/lib/apiClient";
import Loader from "@/components/Loader";
import JobSessionDebugLink from "@/components/JobSessionDebugLink";
import styles from "./NewsletterAdmin.module.css";

const MAX_CELLS = 12;
// Rough per-cell token profile for the pre-run cost estimate (a full
// newsletter Seymour session is tool-heavy on input tokens).
const EST_INPUT_TOKENS = 130_000;
const EST_OUTPUT_TOKENS = 8_000;

const JUDGE_DIMENSION_LABELS: Record<string, string> = {
  accuracy: "Factual accuracy",
  relevance: "Personal relevance",
  cogency: "Cogency",
  data_honesty: "Honest use of data",
  tone: "Tone & voice",
};

// ---------------------------------------------------------------------------
// Small display helpers
// ---------------------------------------------------------------------------

/** Hide email domains anywhere in a string: 'jane@gmail.com' -> 'jane@…'. */
function maskEmails(text: string | null | undefined): string {
  if (!text) return "";
  return text.replace(/([A-Za-z0-9._%+-]+)@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, "$1@…");
}

function scoreColor(score: number | null | undefined): string {
  if (score == null) return "var(--text-tertiary, #999)";
  if (score >= 5) return "#1a7f37";
  if (score >= 4) return "#4c9a52";
  if (score >= 3) return "#b8860b";
  if (score >= 2) return "#d9640e";
  return "#c1341b";
}

function ScoreBadge({
  score,
  title,
  size = 22,
}: {
  score: number | null | undefined;
  title?: string;
  size?: number;
}) {
  return (
    <span
      title={title}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: size,
        height: size,
        borderRadius: "50%",
        fontSize: size * 0.55,
        fontWeight: 700,
        color: "#fff",
        background: scoreColor(score),
        flexShrink: 0,
      }}
    >
      {score ?? "–"}
    </span>
  );
}

function fmtTokens(n?: number | null): string {
  if (n == null) return "–";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}k`;
  return String(n);
}

function fmtCost(n?: number | null): string {
  if (n == null) return "–";
  if (n < 0.001 && n > 0) return "<$0.001";
  return `$${n.toFixed(3)}`;
}

function fmtMs(ms?: number | null): string {
  if (ms == null) return "–";
  if (ms >= 60_000) return `${(ms / 60_000).toFixed(1)}m`;
  return `${(ms / 1000).toFixed(0)}s`;
}

/** Compact telemetry strip: tokens in/out · cost · time · call counts. */
function TelemetryStrip({ cell }: { cell: NewsletterEvalCell }) {
  const u = cell.llm_usage;
  const t = cell.run_telemetry;
  if (!u && !t) return null;
  const parts: string[] = [];
  if (u?.prompt_tokens != null || u?.completion_tokens != null) {
    parts.push(`${fmtTokens(u?.prompt_tokens)}→${fmtTokens(u?.completion_tokens)} tok`);
  }
  if (u?.cost_usd != null) parts.push(fmtCost(u.cost_usd));
  const ms = t?.generation_ms ?? t?.execution_time_ms;
  if (ms != null) parts.push(fmtMs(ms));
  if (t?.llm_call_count != null || t?.tool_call_count != null) {
    parts.push(`${t?.llm_call_count ?? "?"} llm / ${t?.tool_call_count ?? "?"} tools`);
  }
  if (parts.length === 0) return null;
  return (
    <span
      title="tokens in→out · cost · generation time · LLM/tool calls"
      style={{
        fontSize: 10.5,
        color: "var(--text-secondary)",
        whiteSpace: "nowrap",
      }}
    >
      {parts.join(" · ")}
    </span>
  );
}

function cellComboLabel(cell: NewsletterEvalCell): string {
  if (cell.source === "imported") {
    const model = cell.model_key || cell.llm_usage?.model_key;
    return model ? `Imported · ${model}` : "Imported";
  }
  const model = cell.model_key || "?";
  const variant = cell.prompt_variant_label;
  return variant && variant !== "Current template"
    ? `${model} · ${variant}`
    : model;
}

function overallScore(cell: NewsletterEvalCell): number | null {
  return cell.judge_scores?.overall?.score ?? null;
}

// ---------------------------------------------------------------------------
// Judge scores panel (used in detail modal)
// ---------------------------------------------------------------------------

function JudgeScoresPanel({
  scores,
  judgeModelKey,
}: {
  scores: NewsletterEvalJudgeScores;
  judgeModelKey?: string | null;
}) {
  const [expanded, setExpanded] = useState<string | null>(null);
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
        <ScoreBadge score={scores.overall?.score} size={30} />
        <div>
          <div style={{ fontSize: 13, fontWeight: 600 }}>
            Overall{scores.fabrication_capped ? " (capped: fabrication found)" : ""}
          </div>
          <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>
            {scores.overall?.verdict || ""}
            {judgeModelKey ? ` — judged by ${judgeModelKey}` : ""}
          </div>
        </div>
      </div>

      {Object.entries(JUDGE_DIMENSION_LABELS).map(([key, label]) => {
        const dim = scores.dimensions?.[key];
        if (!dim) return null;
        const isOpen = expanded === key;
        return (
          <div key={key} style={{ borderTop: "1px solid var(--border-primary)", padding: "5px 0" }}>
            <button
              type="button"
              onClick={() => setExpanded(isOpen ? null : key)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                width: "100%",
                background: "none",
                border: "none",
                padding: 0,
                cursor: "pointer",
                textAlign: "left",
              }}
            >
              <ScoreBadge score={dim.score} size={18} />
              <span style={{ fontSize: 12.5, fontWeight: 600, color: "var(--text-primary)" }}>
                {label}
              </span>
              {key === "accuracy" && (dim.errors?.length ?? 0) > 0 && (
                <span className={`${styles.badge} ${styles.badgeYellow}`}>
                  {dim.errors!.length} error{dim.errors!.length > 1 ? "s" : ""}
                </span>
              )}
              <span style={{ marginLeft: "auto", fontSize: 11, color: "var(--text-tertiary)" }}>
                {isOpen ? "▾" : "▸"}
              </span>
            </button>
            {isOpen && (
              <div style={{ fontSize: 12, color: "var(--text-secondary)", padding: "4px 0 2px 26px" }}>
                <div>{dim.rationale}</div>
                {(dim.evidence?.length ?? 0) > 0 && (
                  <ul style={{ margin: "4px 0 0", paddingLeft: 16 }}>
                    {dim.evidence!.map((e, i) => (
                      <li key={i} style={{ fontStyle: "italic" }}>{e}</li>
                    ))}
                  </ul>
                )}
                {key === "accuracy" && (dim.errors?.length ?? 0) > 0 && (
                  <div style={{ marginTop: 4 }}>
                    <div style={{ fontWeight: 600, color: "#c1341b" }}>Factual errors:</div>
                    <ul style={{ margin: "2px 0 0", paddingLeft: 16 }}>
                      {dim.errors!.map((e, i) => (
                        <li key={i} style={{ color: "#c1341b" }}>{e}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}

      {(scores.top_issues?.length ?? 0) > 0 && (
        <div style={{ borderTop: "1px solid var(--border-primary)", paddingTop: 6, marginTop: 2 }}>
          <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 2 }}>Top issues</div>
          <ol style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: "var(--text-secondary)" }}>
            {scores.top_issues.map((issue, i) => (
              <li key={i}>{issue}</li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Detail modal (single cell, or two cells side by side)
// ---------------------------------------------------------------------------

function ResultDetailPane({
  detail,
  models,
  onRejudged,
}: {
  detail: NewsletterEvalResultDetail;
  models: ModelInfo[];
  onRejudged: (updated: NewsletterEvalResultDetail) => void;
}) {
  const { getAccessTokenSilently } = useAuth0();
  const [rejudging, setRejudging] = useState(false);
  const [rejudgeModel, setRejudgeModel] = useState<string>(detail.judge_model_key || "");
  const [showPersona, setShowPersona] = useState(false);
  const t = detail.run_telemetry;
  const u = detail.llm_usage;
  const stats = detail.stats_json;

  const handleRejudge = async () => {
    try {
      setRejudging(true);
      const token = await getAccessTokenSilently();
      const res = await rejudgeNewsletterEvalResult(
        detail.id,
        { judge_model_key: rejudgeModel || null },
        token
      );
      onRejudged({
        ...detail,
        judge_scores: res.judge_scores,
        judge_usage: res.judge_usage,
        judge_model_key: rejudgeModel || detail.judge_model_key,
      });
      toast.success("Re-judged");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Re-judge failed");
    } finally {
      setRejudging(false);
    }
  };

  return (
    <div style={{ display: "flex", gap: 14, minHeight: 0, flex: 1 }}>
      {/* Email preview */}
      <div className={styles.emailPreviewFrame} style={{ flex: "1 1 62%", overflow: "auto" }}>
        {detail.body_html ? (
          <div className={styles.emailPreviewContent}>
            <div dangerouslySetInnerHTML={{ __html: detail.body_html }} />
          </div>
        ) : (
          <div className={styles.emailPreviewEmpty}>
            {detail.status === "failed"
              ? `Generation failed: ${detail.error || "unknown error"}`
              : "No rendered HTML for this cell."}
          </div>
        )}
      </div>

      {/* Eval sidebar */}
      <div style={{ flex: "1 1 38%", overflow: "auto", minWidth: 260, fontSize: 12.5 }}>
        <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 2 }}>
          {maskEmails(detail.persona_label)} · {cellComboLabel(detail)}
        </div>
        {detail.subject && (
          <div style={{ color: "var(--text-secondary)", marginBottom: 8 }}>
            Subject: {detail.subject}
          </div>
        )}

        {/* Run telemetry */}
        <div style={{ marginBottom: 10 }}>
          <div style={{ fontWeight: 600, marginBottom: 3 }}>Run telemetry</div>
          <table style={{ fontSize: 12, borderCollapse: "collapse", width: "100%" }}>
            <tbody>
              <tr>
                <td className={styles.muted}>Model</td>
                <td style={{ textAlign: "right", fontWeight: 600 }}>
                  {detail.model_key || u?.model_key || "unknown"}
                </td>
              </tr>
              <tr>
                <td className={styles.muted}>Tokens in / out</td>
                <td style={{ textAlign: "right" }}>
                  {fmtTokens(u?.prompt_tokens)} / {fmtTokens(u?.completion_tokens)}
                </td>
              </tr>
              <tr>
                <td className={styles.muted}>Generation cost</td>
                <td style={{ textAlign: "right" }}>{fmtCost(u?.cost_usd)}</td>
              </tr>
              <tr>
                <td className={styles.muted}>Generation time</td>
                <td style={{ textAlign: "right" }}>
                  {t?.generation_ms != null || t?.execution_time_ms != null
                    ? fmtMs(t?.generation_ms ?? t?.execution_time_ms)
                    : detail.source === "imported"
                      ? "n/a (not recorded on original run)"
                      : "n/a"}
                </td>
              </tr>
              <tr>
                <td className={styles.muted}>LLM calls</td>
                <td style={{ textAlign: "right" }}>{t?.llm_call_count ?? "n/a"}</td>
              </tr>
              <tr>
                <td className={styles.muted}>Tool calls</td>
                <td style={{ textAlign: "right" }}>
                  {t?.tool_call_count ?? "n/a"}
                  {t?.failed_tool_calls ? ` (${t.failed_tool_calls} failed)` : ""}
                </td>
              </tr>
              {detail.judge_usage && !detail.judge_usage.error && (
                <tr>
                  <td className={styles.muted}>Judge cost / time</td>
                  <td style={{ textAlign: "right" }}>
                    {fmtCost(detail.judge_usage.cost_usd)} / {fmtMs(detail.judge_usage.judge_ms)}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          {t?.tool_calls_by_name && Object.keys(t.tool_calls_by_name).length > 0 && (
            <div style={{ marginTop: 4, fontSize: 11, color: "var(--text-secondary)" }}>
              {Object.entries(t.tool_calls_by_name)
                .sort((a, b) => b[1] - a[1])
                .map(([name, count]) => `${count}× ${name}`)
                .join(", ")}
            </div>
          )}
        </div>

        {/* Deterministic checks */}
        {stats && (
          <div style={{ marginBottom: 10 }}>
            <div style={{ fontWeight: 600, marginBottom: 3 }}>Checks</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
              <span className={`${styles.badge} ${stats.sections_complete ? styles.badgeGreen : styles.badgeYellow}`}>
                {stats.sections_complete
                  ? "sections complete"
                  : `missing: ${(stats.missing_sections || []).join(", ")}`}
              </span>
              {(stats.unauthorized_story_ids?.length ?? 0) > 0 && (
                <span className={`${styles.badge} ${styles.badgeYellow}`}>
                  {stats.unauthorized_story_ids!.length} unauthorized story id(s)
                </span>
              )}
              {(stats.unrendered_shortcodes ?? 0) > 0 && (
                <span className={`${styles.badge} ${styles.badgeYellow}`}>
                  {stats.unrendered_shortcodes} unrendered shortcode(s)
                </span>
              )}
              {stats.word_count != null && (
                <span className={`${styles.badge} ${styles.badgeGray}`}>
                  {stats.word_count.toLocaleString()} words
                </span>
              )}
              {stats.story_ids_used && (
                <span className={`${styles.badge} ${styles.badgeGray}`}>
                  {stats.story_ids_used.length} stories cited
                </span>
              )}
            </div>
          </div>
        )}

        {/* Judge scores */}
        {detail.judge_scores ? (
          <JudgeScoresPanel scores={detail.judge_scores} judgeModelKey={detail.judge_model_key} />
        ) : detail.judge_usage?.error ? (
          <div
            style={{
              fontSize: 12,
              color: "#c1341b",
              background: "rgba(193,52,27,0.06)",
              border: "1px solid rgba(193,52,27,0.25)",
              borderRadius: 6,
              padding: 8,
              marginBottom: 8,
            }}
          >
            Judge failed: {detail.judge_usage.error} — try re-judging below.
          </div>
        ) : (
          <div className={styles.muted} style={{ marginBottom: 8 }}>
            Not judged yet.
          </div>
        )}

        {/* Re-judge */}
        {(detail.plan_json || detail.body_html) && (
          <div style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 10 }}>
            <select
              className={styles.select}
              value={rejudgeModel}
              onChange={(e) => setRejudgeModel(e.target.value)}
              style={{ fontSize: 12, flex: 1 }}
            >
              <option value="">Default judge model</option>
              {models.map((m) => (
                <option key={m.key} value={m.key}>{m.key}</option>
              ))}
            </select>
            <button
              type="button"
              className={styles.secondaryBtn}
              onClick={handleRejudge}
              disabled={rejudging}
            >
              {rejudging ? "Judging…" : "Re-judge"}
            </button>
          </div>
        )}

        {/* Persona prompt */}
        {detail.persona_prompt && (
          <div style={{ marginTop: 10 }}>
            <button type="button" className={styles.linkBtn} onClick={() => setShowPersona(!showPersona)}>
              {showPersona ? "Hide" : "Show"} persona instructions
            </button>
            {showPersona && (
              <div
                style={{
                  fontSize: 11.5,
                  whiteSpace: "pre-wrap",
                  color: "var(--text-secondary)",
                  background: "var(--bg-secondary)",
                  borderRadius: 6,
                  padding: 8,
                  marginTop: 4,
                }}
              >
                {detail.persona_prompt}
              </div>
            )}
          </div>
        )}

        {detail.session_id && (
          <div style={{ marginTop: 8 }}>
            <JobSessionDebugLink sessionId={detail.session_id} />
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main tab component
// ---------------------------------------------------------------------------

interface CustomPersonaDraft {
  label: string;
  prompt: string;
}

interface PromptVariantDraft {
  label: string;
  template: string | null; // null = current default template
}

export default function NewsletterAdminLibraryTab({
  cities,
}: {
  cities: CityListItem[];
}) {
  const { getAccessTokenSilently } = useAuth0();

  // Reference data
  const [personas, setPersonas] = useState<NewsletterEvalPersona[]>([]);
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [defaultTemplate, setDefaultTemplate] = useState<string>("");

  // Run builder
  const [builderOpen, setBuilderOpen] = useState(false);
  const [runName, setRunName] = useState("");
  const [cityId, setCityId] = useState<number | null>(null);
  const [selectedPersonaIds, setSelectedPersonaIds] = useState<Set<string>>(new Set());
  const [customPersonas, setCustomPersonas] = useState<CustomPersonaDraft[]>([]);
  const [selectedModels, setSelectedModels] = useState<Set<string>>(new Set());
  const [promptVariants, setPromptVariants] = useState<PromptVariantDraft[]>([
    { label: "Current template", template: null },
  ]);
  const [editingVariantIdx, setEditingVariantIdx] = useState<number | null>(null);
  const [judgeEnabled, setJudgeEnabled] = useState(true);
  const [judgeModelKey, setJudgeModelKey] = useState("");
  const [launching, setLaunching] = useState(false);

  // Import panel
  const [importOpen, setImportOpen] = useState(false);
  const [importQuery, setImportQuery] = useState("");
  const [importItems, setImportItems] = useState<NewsletterPendingListItem[]>([]);
  const [importSelected, setImportSelected] = useState<Set<number>>(new Set());
  const [importLoading, setImportLoading] = useState(false);
  const [importing, setImporting] = useState(false);

  // Batches / detail
  const [batches, setBatches] = useState<NewsletterEvalBatchListItem[]>([]);
  const [batchesLoading, setBatchesLoading] = useState(true);
  const [selectedBatchId, setSelectedBatchId] = useState<number | null>(null);
  const [batchDetail, setBatchDetail] = useState<{
    batch: NewsletterEvalBatchListItem;
    results: NewsletterEvalCell[];
  } | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Detail modal (1 or 2 panes)
  const [detailPanes, setDetailPanes] = useState<NewsletterEvalResultDetail[]>([]);
  const [compareIds, setCompareIds] = useState<number[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);

  // -- Loading ------------------------------------------------------------

  const loadReferenceData = useCallback(async () => {
    try {
      const token = await getAccessTokenSilently();
      const [personaList, modelGroups, prompts] = await Promise.all([
        listNewsletterEvalPersonas(token),
        getAvailableModels(token),
        getNewsletterPrompts(token).catch(() => null),
      ]);
      setPersonas(personaList);
      const flat = modelGroups.flatMap((g) => g.models).filter((m) => m.is_available);
      setModels(flat);
      if (prompts?.unified_newsletter_prompt?.trim()) {
        setDefaultTemplate(prompts.unified_newsletter_prompt);
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to load eval reference data");
    }
  }, [getAccessTokenSilently]);

  const loadBatches = useCallback(async () => {
    try {
      setBatchesLoading(true);
      const token = await getAccessTokenSilently();
      const res = await listNewsletterEvalBatches(token, { page_size: 50 });
      setBatches(res.items);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to load eval batches");
    } finally {
      setBatchesLoading(false);
    }
  }, [getAccessTokenSilently]);

  const loadBatchDetail = useCallback(
    async (batchId: number) => {
      try {
        const token = await getAccessTokenSilently();
        const res = await getNewsletterEvalBatch(batchId, token);
        setBatchDetail(res);
      } catch (err: unknown) {
        toast.error(err instanceof Error ? err.message : "Failed to load batch");
      }
    },
    [getAccessTokenSilently]
  );

  useEffect(() => {
    loadReferenceData();
    loadBatches();
  }, [loadReferenceData, loadBatches]);

  useEffect(() => {
    if (selectedBatchId != null) {
      setBatchDetail(null);
      setCompareIds([]);
      loadBatchDetail(selectedBatchId);
    }
  }, [selectedBatchId, loadBatchDetail]);

  // Poll while the selected batch is running.
  useEffect(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    const status = batchDetail?.batch?.status;
    if (selectedBatchId != null && (status === "running" || status === "pending")) {
      pollRef.current = setInterval(() => {
        loadBatchDetail(selectedBatchId);
        loadBatches();
      }, 5000);
    }
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [selectedBatchId, batchDetail?.batch?.status, loadBatchDetail, loadBatches]);

  // -- Run builder derived state -------------------------------------------

  const personaCount = selectedPersonaIds.size + customPersonas.filter((p) => p.prompt.trim()).length;
  const cellCount = personaCount * selectedModels.size * Math.max(1, promptVariants.length);
  const overCap = cellCount > MAX_CELLS;

  const estCost = useMemo(() => {
    if (personaCount === 0 || selectedModels.size === 0) return 0;
    const variants = Math.max(1, promptVariants.length);
    let sum = 0;
    for (const key of selectedModels) {
      const m = models.find((mm) => mm.key === key);
      if (!m) continue;
      sum +=
        personaCount *
        variants *
        ((m.input_price * EST_INPUT_TOKENS + m.output_price * EST_OUTPUT_TOKENS) / 1_000_000);
    }
    return sum;
  }, [personaCount, selectedModels, promptVariants.length, models]);

  const handleLaunch = async () => {
    if (!cityId) {
      toast.error("Pick a city");
      return;
    }
    if (cellCount === 0 || overCap) return;
    try {
      setLaunching(true);
      const token = await getAccessTokenSilently();
      const personasPayload = [
        ...Array.from(selectedPersonaIds).map((id) => ({ id })),
        ...customPersonas
          .filter((p) => p.prompt.trim())
          .map((p) => ({ label: p.label || "Custom", prompt: p.prompt })),
      ];
      const res = await runNewsletterEvalBatch(
        {
          name: runName.trim() || undefined,
          city_id: cityId,
          district: 0,
          personas: personasPayload,
          model_keys: Array.from(selectedModels),
          prompt_variants: promptVariants.map((v) => ({
            label: v.label,
            template: v.template,
          })),
          judge_enabled: judgeEnabled,
          judge_model_key: judgeModelKey || null,
        },
        token
      );
      toast.success(`Eval batch started (${res.cell_count} cells)`);
      setBuilderOpen(false);
      await loadBatches();
      setSelectedBatchId(res.batch_id);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to start eval batch");
    } finally {
      setLaunching(false);
    }
  };

  // -- Import -------------------------------------------------------------

  const searchImportCandidates = useCallback(async () => {
    try {
      setImportLoading(true);
      const token = await getAccessTokenSilently();
      const res = await listNewsletterPending(token, {
        unsent_only: false,
        limit: 25,
        q: importQuery || undefined,
      });
      setImportItems(res.items);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to search drafts");
    } finally {
      setImportLoading(false);
    }
  }, [getAccessTokenSilently, importQuery]);

  useEffect(() => {
    if (importOpen) searchImportCandidates();
  }, [importOpen, searchImportCandidates]);

  const handleImport = async () => {
    if (importSelected.size === 0) return;
    try {
      setImporting(true);
      const token = await getAccessTokenSilently();
      const res = await importNewsletterEvalSends(
        {
          pending_send_ids: Array.from(importSelected),
          judge_enabled: true,
          judge_model_key: judgeModelKey || null,
        },
        token
      );
      toast.success(`Imported ${res.imported} email(s) for judging`);
      setImportOpen(false);
      setImportSelected(new Set());
      await loadBatches();
      setSelectedBatchId(res.batch_id);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Import failed");
    } finally {
      setImporting(false);
    }
  };

  // -- Detail modal ---------------------------------------------------------

  const openDetail = async (ids: number[]) => {
    try {
      setDetailLoading(true);
      const token = await getAccessTokenSilently();
      const details = await Promise.all(ids.map((id) => getNewsletterEvalResult(id, token)));
      setDetailPanes(details);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to load result");
    } finally {
      setDetailLoading(false);
    }
  };

  const toggleCompare = (id: number) => {
    setCompareIds((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= 2) return [prev[1], id];
      return [...prev, id];
    });
  };

  // -- Matrix derived data --------------------------------------------------

  const matrixData = useMemo(() => {
    const results = batchDetail?.results || [];
    const combos: string[] = [];
    const comboSeen = new Set<string>();
    for (const r of results) {
      const label = cellComboLabel(r);
      if (!comboSeen.has(label)) {
        comboSeen.add(label);
        combos.push(label);
      }
    }
    const rowLabels: string[] = [];
    const rowSeen = new Set<string>();
    for (const r of results) {
      const label = r.persona_label || "?";
      if (!rowSeen.has(label)) {
        rowSeen.add(label);
        rowLabels.push(label);
      }
    }
    const byKey = new Map<string, NewsletterEvalCell>();
    for (const r of results) {
      byKey.set(`${r.persona_label || "?"}|${cellComboLabel(r)}`, r);
    }
    return { combos, rowLabels, byKey };
  }, [batchDetail]);

  const leaderboard = useMemo(() => {
    const judged = (batchDetail?.results || []).filter(
      (r) => r.status === "completed" && r.judge_scores?.overall?.score != null
    );
    if (judged.length < 2) return [];
    return [...judged].sort((a, b) => (overallScore(b) ?? 0) - (overallScore(a) ?? 0));
  }, [batchDetail]);

  // -------------------------------------------------------------------------

  return (
    <div>
      {/* Actions */}
      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 12 }}>
        <button
          type="button"
          className={styles.primaryBtn}
          onClick={() => setBuilderOpen(!builderOpen)}
        >
          {builderOpen ? "Close run builder" : "New eval run"}
        </button>
        <button type="button" className={styles.secondaryBtn} onClick={() => setImportOpen(!importOpen)}>
          Import emails
        </button>
        <span className={styles.muted} style={{ fontSize: 12 }}>
          Synthetic eval runs — nothing here can be sent to subscribers.
        </span>
      </div>

      {/* Run builder */}
      {builderOpen && (
        <div className={styles.testPanel} style={{ marginBottom: 14 }}>
          <div className={styles.testPanelTitle}>New eval run</div>

          <div className={styles.testPanelRow}>
            <div className={styles.testField}>
              <label className={styles.testLabel}>Name (optional)</label>
              <input
                className={styles.searchInput}
                value={runName}
                onChange={(e) => setRunName(e.target.value)}
                placeholder="e.g. Prompt sweep v3 — SF commuter"
              />
            </div>
            <div className={styles.testField}>
              <label className={styles.testLabel}>City</label>
              <select
                className={styles.select}
                value={cityId ?? ""}
                onChange={(e) => setCityId(e.target.value ? Number(e.target.value) : null)}
              >
                <option value="">Select city…</option>
                {cities
                  .filter((c) => c.is_launched !== false)
                  .map((c) => (
                    <option key={c.city_id} value={c.city_id}>
                      {c.city_name}
                    </option>
                  ))}
              </select>
            </div>
          </div>

          {/* Personas */}
          <div style={{ marginTop: 10 }}>
            <label className={styles.testLabel}>Personas</label>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 4 }}>
              {personas.map((p) => {
                const active = selectedPersonaIds.has(p.id);
                return (
                  <button
                    key={p.id}
                    type="button"
                    title={p.prompt}
                    onClick={() =>
                      setSelectedPersonaIds((prev) => {
                        const next = new Set(prev);
                        if (next.has(p.id)) next.delete(p.id);
                        else next.add(p.id);
                        return next;
                      })
                    }
                    style={{
                      fontSize: 12,
                      padding: "4px 10px",
                      borderRadius: 14,
                      cursor: "pointer",
                      border: `1px solid ${active ? "var(--brand-primary, #ad35fa)" : "var(--border-primary)"}`,
                      background: active ? "var(--brand-primary-faint, rgba(173,53,250,0.09))" : "var(--bg-primary)",
                      color: active ? "var(--brand-primary, #ad35fa)" : "var(--text-primary)",
                      fontWeight: active ? 600 : 400,
                    }}
                  >
                    {p.label}
                  </button>
                );
              })}
              <button
                type="button"
                className={styles.linkBtn}
                onClick={() => setCustomPersonas((prev) => [...prev, { label: "", prompt: "" }])}
              >
                + custom persona
              </button>
            </div>
            {customPersonas.map((cp, i) => (
              <div key={i} style={{ display: "flex", gap: 6, marginTop: 6, alignItems: "flex-start" }}>
                <input
                  className={styles.searchInput}
                  style={{ maxWidth: 180 }}
                  placeholder="Label"
                  value={cp.label}
                  onChange={(e) =>
                    setCustomPersonas((prev) =>
                      prev.map((p, j) => (j === i ? { ...p, label: e.target.value } : p))
                    )
                  }
                />
                <textarea
                  className={styles.textarea}
                  style={{ flex: 1, minHeight: 48 }}
                  placeholder="Persona instructions, written as the subscriber (e.g. 'I run a coffee shop on Valencia St…')"
                  value={cp.prompt}
                  onChange={(e) =>
                    setCustomPersonas((prev) =>
                      prev.map((p, j) => (j === i ? { ...p, prompt: e.target.value } : p))
                    )
                  }
                />
                <button
                  type="button"
                  className={styles.linkBtn}
                  onClick={() => setCustomPersonas((prev) => prev.filter((_, j) => j !== i))}
                >
                  remove
                </button>
              </div>
            ))}
          </div>

          {/* Models */}
          <div style={{ marginTop: 10 }}>
            <label className={styles.testLabel}>Models</label>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 4 }}>
              {models.map((m) => {
                const active = selectedModels.has(m.key);
                return (
                  <button
                    key={m.key}
                    type="button"
                    title={`in $${m.input_price}/M · out $${m.output_price}/M`}
                    onClick={() =>
                      setSelectedModels((prev) => {
                        const next = new Set(prev);
                        if (next.has(m.key)) next.delete(m.key);
                        else next.add(m.key);
                        return next;
                      })
                    }
                    style={{
                      fontSize: 12,
                      padding: "4px 10px",
                      borderRadius: 14,
                      cursor: "pointer",
                      border: `1px solid ${active ? "var(--brand-primary, #ad35fa)" : "var(--border-primary)"}`,
                      background: active ? "var(--brand-primary-faint, rgba(173,53,250,0.09))" : "var(--bg-primary)",
                      color: active ? "var(--brand-primary, #ad35fa)" : "var(--text-primary)",
                      fontWeight: active ? 600 : 400,
                    }}
                  >
                    {m.key}
                    {m.is_default ? " ★" : ""}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Prompt variants */}
          <div style={{ marginTop: 10 }}>
            <label className={styles.testLabel}>
              Prompt variants ({promptVariants.length})
            </label>
            <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 4 }}>
              {promptVariants.map((v, i) => (
                <div key={i} style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  <input
                    className={styles.searchInput}
                    style={{ maxWidth: 220 }}
                    value={v.label}
                    onChange={(e) =>
                      setPromptVariants((prev) =>
                        prev.map((p, j) => (j === i ? { ...p, label: e.target.value } : p))
                      )
                    }
                  />
                  <span className={styles.muted} style={{ fontSize: 11 }}>
                    {v.template == null ? "uses current saved template" : `${v.template.length.toLocaleString()} chars`}
                  </span>
                  {v.template != null && (
                    <button
                      type="button"
                      className={styles.linkBtn}
                      onClick={() => setEditingVariantIdx(editingVariantIdx === i ? null : i)}
                    >
                      {editingVariantIdx === i ? "close" : "edit"}
                    </button>
                  )}
                  {i > 0 && (
                    <button
                      type="button"
                      className={styles.linkBtn}
                      onClick={() => setPromptVariants((prev) => prev.filter((_, j) => j !== i))}
                    >
                      remove
                    </button>
                  )}
                </div>
              ))}
              {editingVariantIdx != null && promptVariants[editingVariantIdx]?.template != null && (
                <textarea
                  className={styles.textarea}
                  style={{ minHeight: 220, fontFamily: "monospace", fontSize: 11.5 }}
                  value={promptVariants[editingVariantIdx].template as string}
                  onChange={(e) =>
                    setPromptVariants((prev) =>
                      prev.map((p, j) =>
                        j === editingVariantIdx ? { ...p, template: e.target.value } : p
                      )
                    )
                  }
                />
              )}
              <div>
                <button
                  type="button"
                  className={styles.linkBtn}
                  onClick={() => {
                    setPromptVariants((prev) => [
                      ...prev,
                      {
                        label: `Variant ${prev.length + 1}`,
                        template: defaultTemplate || "",
                      },
                    ]);
                    setEditingVariantIdx(promptVariants.length);
                  }}
                >
                  + add variant (starts from current template)
                </button>
              </div>
            </div>
          </div>

          {/* Judge */}
          <div className={styles.testPanelRow} style={{ marginTop: 10 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}>
              <input
                type="checkbox"
                checked={judgeEnabled}
                onChange={(e) => setJudgeEnabled(e.target.checked)}
              />
              Run LLM judge
            </label>
            {judgeEnabled && (
              <select
                className={styles.select}
                value={judgeModelKey}
                onChange={(e) => setJudgeModelKey(e.target.value)}
                style={{ maxWidth: 280 }}
              >
                <option value="">Default judge model</option>
                {models.map((m) => (
                  <option key={m.key} value={m.key}>{m.key}</option>
                ))}
              </select>
            )}
          </div>

          {/* Summary + launch */}
          <div style={{ display: "flex", gap: 12, alignItems: "center", marginTop: 12 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: overCap ? "#c1341b" : "var(--text-primary)" }}>
              {cellCount} cell{cellCount === 1 ? "" : "s"}
              {overCap ? ` — over the ${MAX_CELLS}-cell cap` : ""}
            </span>
            {estCost > 0 && (
              <span className={styles.muted} style={{ fontSize: 12 }}>
                rough generation cost ~${estCost.toFixed(2)}
              </span>
            )}
            <button
              type="button"
              className={styles.primaryBtn}
              disabled={launching || cellCount === 0 || overCap || !cityId}
              onClick={handleLaunch}
            >
              {launching ? "Starting…" : "Run eval batch"}
            </button>
          </div>
        </div>
      )}

      {/* Import panel */}
      {importOpen && (
        <div className={styles.testPanel} style={{ marginBottom: 14 }}>
          <div className={styles.testPanelTitle}>Import existing emails for judging</div>
          <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
            <input
              className={styles.searchInput}
              placeholder="Search drafts by email or subject…"
              value={importQuery}
              onChange={(e) => setImportQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && searchImportCandidates()}
            />
            <button type="button" className={styles.secondaryBtn} onClick={searchImportCandidates}>
              Search
            </button>
          </div>
          {importLoading ? (
            <Loader />
          ) : (
            <div style={{ maxHeight: 260, overflow: "auto" }}>
              {importItems.map((item) => (
                <label
                  key={item.id}
                  style={{
                    display: "flex",
                    gap: 8,
                    alignItems: "center",
                    padding: "4px 2px",
                    fontSize: 12.5,
                    borderBottom: "1px solid var(--border-primary)",
                    cursor: "pointer",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={importSelected.has(item.id)}
                    onChange={() =>
                      setImportSelected((prev) => {
                        const next = new Set(prev);
                        if (next.has(item.id)) next.delete(item.id);
                        else next.add(item.id);
                        return next;
                      })
                    }
                  />
                  <span style={{ fontWeight: 600 }}>{maskEmails(item.recipient_email)}</span>
                  <span style={{ color: "var(--text-secondary)", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {item.subject}
                  </span>
                  <span className={styles.muted} style={{ fontSize: 11 }}>
                    {item.sent_at ? "sent" : "draft"}
                    {item.created_at ? ` · ${new Date(item.created_at).toLocaleDateString()}` : ""}
                  </span>
                </label>
              ))}
              {importItems.length === 0 && <div className={styles.emptyState}>No drafts found.</div>}
            </div>
          )}
          <div style={{ marginTop: 8 }}>
            <button
              type="button"
              className={styles.primaryBtn}
              disabled={importing || importSelected.size === 0}
              onClick={handleImport}
            >
              {importing ? "Importing…" : `Import ${importSelected.size} email(s) & judge`}
            </button>
          </div>
        </div>
      )}

      {/* Batch list */}
      <div className={styles.tableContainer} style={{ marginBottom: 14 }}>
        <div className={styles.tableHeader}>
          <span className={styles.tableTitle}>Eval batches</span>
          <span className={styles.tableCount}>{batches.length}</span>
          <button
            type="button"
            className={styles.linkBtn}
            style={{ marginLeft: "auto" }}
            onClick={() => loadBatches()}
          >
            Refresh
          </button>
        </div>
        {batchesLoading ? (
          <Loader />
        ) : batches.length === 0 ? (
          <div className={styles.emptyState}>
            No eval batches yet — run one with “New eval run”.
          </div>
        ) : (
          <div className={styles.tableWrapper}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th className={styles.th}>Batch</th>
                  <th className={styles.th}>City</th>
                  <th className={styles.th}>Status</th>
                  <th className={styles.th}>Cells</th>
                  <th className={styles.th}>Avg score</th>
                  <th className={styles.th}>Total cost</th>
                  <th className={styles.th}>Created</th>
                </tr>
              </thead>
              <tbody>
                {batches.map((b) => (
                  <tr
                    key={b.id}
                    className={styles.rowClickable}
                    style={selectedBatchId === b.id ? { background: "var(--bg-secondary)" } : undefined}
                    onClick={() => setSelectedBatchId(b.id)}
                  >
                    <td className={styles.td} style={{ fontWeight: 600 }}>{b.name || `Batch ${b.id}`}</td>
                    <td className={styles.td}>{b.city_name || "—"}</td>
                    <td className={styles.td}>
                      <span
                        className={`${styles.badge} ${
                          b.status === "completed"
                            ? styles.badgeGreen
                            : b.status === "failed"
                              ? styles.badgeYellow
                              : b.status === "running"
                                ? styles.badgeBlue
                                : styles.badgeGray
                        }`}
                      >
                        {b.status}
                      </span>
                    </td>
                    <td className={styles.td}>
                      {b.completed_cells}/{b.cell_count}
                      {b.failed_cells > 0 ? ` (${b.failed_cells} failed)` : ""}
                    </td>
                    <td className={styles.td}>
                      {b.avg_overall_score != null ? (
                        <ScoreBadge score={Math.round(b.avg_overall_score * 10) / 10} title={`avg ${b.avg_overall_score.toFixed(2)}`} size={20} />
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className={styles.td}>{fmtCost(b.total_cost_usd)}</td>
                    <td className={styles.td}>{new Date(b.created_at).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Batch detail */}
      {selectedBatchId != null && (
        <div className={styles.tableContainer}>
          <div className={styles.tableHeader}>
            <span className={styles.tableTitle}>
              {batchDetail?.batch?.name || `Batch ${selectedBatchId}`}
            </span>
            {batchDetail?.batch?.status === "running" && (
              <span className={`${styles.badge} ${styles.badgeBlue}`}>running…</span>
            )}
            {compareIds.length === 2 && (
              <button type="button" className={styles.primaryBtn} onClick={() => openDetail(compareIds)}>
                Compare selected
              </button>
            )}
            <button
              type="button"
              className={styles.linkBtn}
              style={{ marginLeft: "auto" }}
              onClick={() => setSelectedBatchId(null)}
            >
              Close
            </button>
          </div>

          {!batchDetail ? (
            <Loader />
          ) : (
            <div style={{ padding: "0 12px 12px" }}>
              {/* Leaderboard (single-axis sweeps and any judged multi-cell batch) */}
              {leaderboard.length >= 2 && (
                <div style={{ margin: "10px 0 14px" }}>
                  <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>Leaderboard</div>
                  <div className={styles.tableWrapper}>
                    <table className={styles.table}>
                      <thead>
                        <tr>
                          <th className={styles.th}>#</th>
                          <th className={styles.th}>Cell</th>
                          <th className={styles.th}>Overall</th>
                          <th className={styles.th}>Acc</th>
                          <th className={styles.th}>Rel</th>
                          <th className={styles.th}>Cog</th>
                          <th className={styles.th}>Data</th>
                          <th className={styles.th}>Tone</th>
                          <th className={styles.th}>Tokens in/out</th>
                          <th className={styles.th}>Cost</th>
                          <th className={styles.th}>Time</th>
                          <th className={styles.th}>Calls</th>
                        </tr>
                      </thead>
                      <tbody>
                        {leaderboard.map((r, i) => {
                          const dims = r.judge_scores?.dimensions || {};
                          const t = r.run_telemetry;
                          return (
                            <tr key={r.id} className={styles.rowClickable} onClick={() => openDetail([r.id])}>
                              <td className={styles.td}>{i + 1}</td>
                              <td className={styles.td} style={{ fontWeight: 600 }}>
                                {maskEmails(r.persona_label)} · {cellComboLabel(r)}
                              </td>
                              <td className={styles.td}><ScoreBadge score={overallScore(r)} size={20} /></td>
                              <td className={styles.td}>{dims.accuracy?.score ?? "–"}</td>
                              <td className={styles.td}>{dims.relevance?.score ?? "–"}</td>
                              <td className={styles.td}>{dims.cogency?.score ?? "–"}</td>
                              <td className={styles.td}>{dims.data_honesty?.score ?? "–"}</td>
                              <td className={styles.td}>{dims.tone?.score ?? "–"}</td>
                              <td className={styles.td}>
                                {fmtTokens(r.llm_usage?.prompt_tokens)}/{fmtTokens(r.llm_usage?.completion_tokens)}
                              </td>
                              <td className={styles.td}>{fmtCost(r.llm_usage?.cost_usd)}</td>
                              <td className={styles.td}>{fmtMs(t?.generation_ms ?? t?.execution_time_ms)}</td>
                              <td className={styles.td}>
                                {t?.llm_call_count ?? "–"}/{t?.tool_call_count ?? "–"}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Matrix grid */}
              <div style={{ overflowX: "auto", marginTop: 10 }}>
                <table style={{ borderCollapse: "separate", borderSpacing: 6 }}>
                  <thead>
                    <tr>
                      <th />
                      {matrixData.combos.map((c) => (
                        <th
                          key={c}
                          style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)", textAlign: "left", padding: "0 4px" }}
                        >
                          {c}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {matrixData.rowLabels.map((rowLabel) => (
                      <tr key={rowLabel}>
                        <td
                          style={{
                            fontSize: 12,
                            fontWeight: 600,
                            color: "var(--text-primary)",
                            verticalAlign: "top",
                            paddingTop: 8,
                            maxWidth: 140,
                          }}
                        >
                          {maskEmails(rowLabel)}
                        </td>
                        {matrixData.combos.map((combo) => {
                          const cell = matrixData.byKey.get(`${rowLabel}|${combo}`);
                          if (!cell) return <td key={combo} />;
                          return (
                            <td key={combo} style={{ verticalAlign: "top" }}>
                              <div
                                onClick={() => cell.status === "completed" && openDetail([cell.id])}
                                style={{
                                  border: "1px solid var(--border-primary)",
                                  borderRadius: 8,
                                  padding: "8px 10px",
                                  minWidth: 190,
                                  maxWidth: 240,
                                  cursor: cell.status === "completed" ? "pointer" : "default",
                                  background: "var(--bg-primary)",
                                  opacity: cell.status === "pending" ? 0.55 : 1,
                                }}
                              >
                                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                  {cell.status === "completed" ? (
                                    <ScoreBadge
                                      score={overallScore(cell)}
                                      title={cell.judge_scores?.overall?.verdict}
                                    />
                                  ) : (
                                    <span
                                      className={`${styles.badge} ${
                                        cell.status === "failed" ? styles.badgeYellow : styles.badgeGray
                                      }`}
                                    >
                                      {cell.status === "running" ? "generating…" : cell.status}
                                    </span>
                                  )}
                                  <input
                                    type="checkbox"
                                    title="Select for compare"
                                    checked={compareIds.includes(cell.id)}
                                    disabled={cell.status !== "completed"}
                                    onClick={(e) => e.stopPropagation()}
                                    onChange={() => toggleCompare(cell.id)}
                                    style={{ marginLeft: "auto" }}
                                  />
                                </div>
                                <div
                                  style={{
                                    fontSize: 12,
                                    fontWeight: 600,
                                    margin: "5px 0 3px",
                                    display: "-webkit-box",
                                    WebkitLineClamp: 2,
                                    WebkitBoxOrient: "vertical",
                                    overflow: "hidden",
                                  }}
                                  title={cell.subject || undefined}
                                >
                                  {cell.status === "failed"
                                    ? cell.error || "failed"
                                    : cell.subject || "…"}
                                </div>
                                <TelemetryStrip cell={cell} />
                                {cell.judge_scores?.fabrication_capped && (
                                  <div style={{ marginTop: 3 }}>
                                    <span className={`${styles.badge} ${styles.badgeYellow}`}>fabrication</span>
                                  </div>
                                )}
                                {!cell.judge_scores && cell.judge_usage?.error && (
                                  <div style={{ marginTop: 3 }}>
                                    <span
                                      className={`${styles.badge} ${styles.badgeYellow}`}
                                      title={cell.judge_usage.error}
                                    >
                                      judge failed — open to retry
                                    </span>
                                  </div>
                                )}
                              </div>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Detail / compare modal */}
      {(detailPanes.length > 0 || detailLoading) && (
        <div className={styles.emailPreviewOverlay} onClick={() => setDetailPanes([])}>
          <div
            className={styles.emailPreviewModal}
            style={{ maxWidth: detailPanes.length === 2 ? 1500 : 1100, width: "94vw" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className={styles.emailPreviewHeader}>
              <div className={styles.emailPreviewTitle}>
                {detailPanes.length === 2 ? "Compare cells" : "Eval result"}
              </div>
              <div className={styles.emailPreviewActions}>
                <button type="button" className={styles.secondaryBtn} onClick={() => setDetailPanes([])}>
                  Close
                </button>
              </div>
            </div>
            <div
              className={styles.emailPreviewBody}
              style={{ display: "flex", gap: 16, minHeight: 0 }}
            >
              {detailLoading ? (
                <Loader />
              ) : (
                detailPanes.map((d) => (
                  <div key={d.id} style={{ flex: 1, display: "flex", minWidth: 0 }}>
                    <ResultDetailPane
                      detail={d}
                      models={models}
                      onRejudged={(updated) =>
                        setDetailPanes((prev) => prev.map((p) => (p.id === updated.id ? updated : p)))
                      }
                    />
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

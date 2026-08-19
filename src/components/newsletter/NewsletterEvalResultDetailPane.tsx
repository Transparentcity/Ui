"use client";

import { useAuth0 } from "@auth0/auth0-react";
import { useState, type CSSProperties } from "react";
import { toast } from "sonner";
import {
  autocorrectNewsletterEvalResult,
  getJob,
  getNewsletterEvalResult,
  rejudgeNewsletterEvalResult,
  type ModelInfo,
  type NewsletterEvalCell,
  type NewsletterEvalResultDetail,
} from "@/lib/apiClient";
import JobSessionDebugLink from "@/components/JobSessionDebugLink";
import { EvalCorrectionHistoryPanel } from "@/components/eval/EvalCorrectionHistoryPanel";
import { JudgeScoresPanel } from "@/components/eval/JudgeScoresPanel";
import Loader from "@/components/Loader";
import styles from "../NewsletterAdmin.module.css";

/** Friendly chip / select labels for Workbench model pickers. */
export function formatWorkbenchModelLabel(key: string): string {
  const labels: Record<string, string> = {
    "claude-fable-5": "Claude Fable 5",
    "claude-opus-4.8": "Claude Opus 4.8",
    "claude-sonnet-5": "Claude Sonnet 5",
    "claude-haiku-4.5": "Claude Haiku 4.5",
    "claude-sonnet-4.6": "Claude Sonnet 4.6",
    "claude-opus-4.6": "Claude Opus 4.6",
    "claude-sonnet-4.5": "Claude Sonnet 4.5",
    "claude-opus-4.5": "Claude Opus 4.5",
    "gpt-5.6-sol": "GPT-5.6 Sol",
    "gpt-5.6-terra": "GPT-5.6 Terra",
    "gpt-5.6-luna": "GPT-5.6 Luna",
    "gpt-5.5": "GPT-5.5",
    "gpt-5.4": "GPT-5.4",
    "gpt-5.2": "GPT-5.2",
    "gpt-5.1": "GPT-5.1",
    "gpt-5": "GPT-5",
    "gpt-5-mini": "GPT-5 Mini",
    "gpt-5-nano": "GPT-5 Nano",
    "gpt-4.1": "GPT-4.1",
    "gpt-4.1-mini": "GPT-4.1 Mini",
    "gpt-4.1-nano": "GPT-4.1 Nano",
    "gpt-4o": "GPT-4o",
    "gpt-4o-mini": "GPT-4o Mini",
    "gemini-3.5-flash": "Gemini 3.5 Flash",
    "gemini-3.1-pro": "Gemini 3.1 Pro",
    "gemini-3-pro": "Gemini 3 Pro",
    "gemini-3-flash": "Gemini 3 Flash",
    "gemini-2.5-pro": "Gemini 2.5 Pro",
    "gemini-2.5-flash": "Gemini 2.5 Flash",
    "grok-4.5": "Grok 4.5",
    "grok-4": "Grok 4",
    "grok-3": "Grok 3",
    "grok-3-mini": "Grok 3 Mini",
    "deepinfra/kimi-k2.6": "Kimi K2.6",
    "deepinfra/kimi-k2.5": "Kimi K2.5",
    "deepinfra/deepseek-v4-pro": "DeepSeek V4 Pro",
    "deepinfra/deepseek-v4-flash": "DeepSeek V4 Flash",
    "deepinfra/glm-5.2": "GLM 5.2",
    "deepinfra/glm-4.6": "GLM 4.6",
    "deepinfra/qwen3.7-max": "Qwen 3.7 Max",
    "deepinfra/qwen3-max-thinking": "Qwen3 Max Thinking",
    "deepinfra/qwen3-max": "Qwen3 Max",
    "deepinfra/qwen3-235b": "Qwen3 235B",
    "deepinfra/gemma-4-31b-it": "Gemma 4 31B",
    "deepinfra/qwen3-coder-480b": "Qwen3 Coder 480B",
    "deepinfra/llama-3.3-70b": "Llama 3.3 70B",
    "deepinfra/llama-3.1-70b": "Llama 3.1 70B",
    "deepinfra/qwen2.5-72b": "Qwen 2.5 72B",
    "deepinfra/gpt-oss-120b": "GPT-OSS 120B",
    "deepinfra/gpt-oss-20b": "GPT-OSS 20B",
    "deepinfra/llama-3.1-8b": "Llama 3.1 8B",
  };
  if (labels[key]) return labels[key];
  const bare = key.startsWith("deepinfra/") ? key.slice("deepinfra/".length) : key;
  return bare
    .split(/[-_/]/)
    .filter(Boolean)
    .map((part) => (part.length <= 3 ? part.toUpperCase() : part[0].toUpperCase() + part.slice(1)))
    .join(" ");
}
/** Hide email domains anywhere in a string: 'jane@gmail.com' -> 'jane@…'. */
export function maskEmails(text: string | null | undefined): string {
  if (!text) return "";
  return text.replace(/([A-Za-z0-9._%+-]+)@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, "$1@…");
}

export function fmtTokens(n?: number | null): string {
  if (n == null) return "–";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}k`;
  return String(n);
}

export function fmtCost(n?: number | null): string {
  if (n == null) return "–";
  if (n < 0.001 && n > 0) return "<$0.001";
  return `$${n.toFixed(3)}`;
}

export function fmtMs(ms?: number | null): string {
  if (ms == null) return "–";
  if (ms >= 60_000) return `${(ms / 60_000).toFixed(1)}m`;
  return `${(ms / 1000).toFixed(0)}s`;
}

/** Compact telemetry strip: tokens in/out · cost · time · call counts. */
export function TelemetryStrip({ cell }: { cell: NewsletterEvalCell }) {
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

export function cellComboLabel(cell: NewsletterEvalCell): string {
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

export function overallScore(cell: NewsletterEvalCell): number | null {
  return cell.judge_scores?.overall?.score ?? null;
}

/**
 * The fields a re-judge or auto-correct can change on an already-rendered row.
 * List views hold their own copies of each cell, so they have to be patched
 * from the refreshed detail or they keep showing the pre-correction score.
 */
export type EvalCellPatch = Pick<
  NewsletterEvalCell,
  "subject" | "stats_json" | "judge_model_key" | "judge_scores" | "judge_usage"
>;

export function evalCellPatch(updated: NewsletterEvalResultDetail): EvalCellPatch {
  return {
    subject: updated.subject,
    stats_json: updated.stats_json,
    judge_model_key: updated.judge_model_key,
    judge_scores: updated.judge_scores,
    judge_usage: updated.judge_usage,
  };
}

/**
 * Does a pending-queue row correspond to this eval result? Imported evals carry
 * the pending send id in source_ref; previews built for a send with no eval row
 * yet use id 0, which must never match a stored eval_result_id.
 */
export function evalMatchesPendingRow(
  row: { id: number; eval_result_id?: number | null },
  updated: NewsletterEvalResultDetail
): boolean {
  if (updated.source === "imported" && updated.source_ref != null) {
    const pendingId = Number(updated.source_ref);
    if (Number.isFinite(pendingId)) return row.id === pendingId;
  }
  return updated.id > 0 && row.eval_result_id === updated.id;
}

// ---------------------------------------------------------------------------
// Detail modal (single cell, or two cells side by side)
// ---------------------------------------------------------------------------

function ContextBlock({
  label,
  open,
  onToggle,
  children,
  emptyHint,
}: {
  label: string;
  open: boolean;
  onToggle: () => void;
  children?: React.ReactNode;
  emptyHint?: string;
}) {
  return (
    <div style={{ marginTop: 6 }}>
      <button type="button" className={styles.linkBtn} onClick={onToggle}>
        {open ? "Hide" : "Show"} {label}
      </button>
      {open && (
        <div
          style={{
            fontSize: 11.5,
            whiteSpace: "pre-wrap",
            color: "var(--text-secondary)",
            background: "var(--bg-secondary)",
            borderRadius: 6,
            padding: 8,
            marginTop: 4,
            maxHeight: 280,
            overflow: "auto",
            fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
          }}
        >
          {children ?? emptyHint ?? "(empty)"}
        </div>
      )}
    </div>
  );
}

function formatPlanForDisplay(plan: Record<string, unknown> | null): string | null {
  if (!plan) return null;
  const cleaned: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(plan)) {
    if (!k.startsWith("_")) cleaned[k] = v;
  }
  if (Object.keys(cleaned).length === 0) return null;
  try {
    return JSON.stringify(cleaned, null, 2);
  } catch {
    return String(cleaned);
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asStr(value: unknown): string {
  return typeof value === "string" ? value.trim() : value == null ? "" : String(value).trim();
}

/**
 * Readable email body from the editorial plan, with visualization shortcodes
 * left unexpanded ([map:], [chart:], [dashboard:]) for glance comparison.
 */
function formatPlanAsEmailText(
  plan: Record<string, unknown> | null | undefined,
  subject?: string | null
): string | null {
  if (!plan) return null;
  const lines: string[] = [];
  const subj = asStr(subject) || asStr(plan.subject);
  if (subj) lines.push(`Subject: ${subj}`);
  const preheader = asStr(plan.preheader);
  if (preheader) lines.push(`Preheader: ${preheader}`);
  if (subj || preheader) lines.push("");

  const hook = asStr(plan.hook);
  if (hook) lines.push(hook);
  const followup = asStr(plan.followup_line);
  if (followup) lines.push(followup);
  if (hook || followup) lines.push("");

  const lead = asRecord(plan.lead);
  if (lead) {
    const scope = (asStr(lead.scope_label) || "YOUR BLOCK").toUpperCase();
    lines.push(`— LEAD STORY · ${scope} —`);
    const headline = asStr(lead.headline);
    if (headline) lines.push(headline);
    const hero = asStr(lead.hero_map_hash);
    if (hero) lines.push(`[map:${hero}]`);
    const legend = Array.isArray(lead.legend_layers)
      ? lead.legend_layers.map(asStr).filter(Boolean)
      : [];
    if (legend.length) lines.push(`Legend: ${legend.join(" · ")}`);
    const qr = asRecord(lead.quick_read);
    if (qr) {
      lines.push("");
      lines.push("THE QUICK READ");
      if (asStr(qr.anchor_stat)) lines.push(asStr(qr.anchor_stat));
      if (asStr(qr.hook)) lines.push(asStr(qr.hook));
      if (asStr(qr.catch)) lines.push(`The catch: ${asStr(qr.catch)}`);
      if (asStr(qr.watch)) lines.push(`Watch: ${asStr(qr.watch)}`);
      if (asStr(qr.methodology)) lines.push(asStr(qr.methodology));
    }
    if (asStr(lead.paragraph_1)) {
      lines.push("");
      lines.push(asStr(lead.paragraph_1));
    }
    if (lead.chart_id != null && String(lead.chart_id).trim()) {
      lines.push(`[chart:${lead.chart_id}]`);
    }
    if (asStr(lead.in_the_record)) {
      lines.push(`In the record: ${asStr(lead.in_the_record)}`);
    }
    if (asStr(lead.paragraph_3)) lines.push(asStr(lead.paragraph_3));
    lines.push("");
  }

  const stats = Array.isArray(plan.by_the_numbers) ? plan.by_the_numbers : [];
  if (stats.length) {
    lines.push("— BY THE NUMBERS —");
    for (const raw of stats.slice(0, 3)) {
      const s = asRecord(raw);
      if (!s) continue;
      lines.push(`${asStr(s.value)} — ${asStr(s.label)}`);
    }
    lines.push("");
  }

  const cards = Array.isArray(plan.block_brief) ? plan.block_brief : [];
  if (cards.length) {
    lines.push("— THE BLOCK BRIEF —");
    for (const raw of cards.slice(0, 4)) {
      const c = asRecord(raw);
      if (!c) continue;
      const head = [asStr(c.stat), asStr(c.sublabel).toUpperCase(), asStr(c.headline)]
        .filter(Boolean)
        .join(" · ");
      if (head) lines.push(head);
      if (asStr(c.body)) lines.push(asStr(c.body));
      lines.push("");
    }
  }

  const across = asRecord(plan.across_city);
  if (across) {
    lines.push("— ACROSS THE CITY —");
    if (asStr(across.headline)) lines.push(asStr(across.headline));
    if (across.chart_id != null && String(across.chart_id).trim()) {
      lines.push(`[chart:${across.chart_id}]`);
    }
    if (asStr(across.ytd_text)) lines.push(`Year to date: ${asStr(across.ytd_text)}`);
    if (asStr(across.driver_text)) lines.push(`What is driving it: ${asStr(across.driver_text)}`);
    if (asStr(across.watch_text)) lines.push(`Watch: ${asStr(across.watch_text)}`);
    if (asStr(across.unknown_text)) lines.push(`What we don't know: ${asStr(across.unknown_text)}`);
    lines.push("");
  }

  lines.push("— CITYWIDE SCORECARD —");
  lines.push("[dashboard:…]");
  lines.push("");

  const mow = asRecord(plan.map_of_week);
  if (mow && asStr(mow.map_hash)) {
    lines.push("— MAP OF THE WEEK —");
    if (asStr(mow.title)) lines.push(asStr(mow.title));
    lines.push(`[map:${asStr(mow.map_hash)}]`);
    if (asStr(mow.caption)) lines.push(asStr(mow.caption));
    lines.push("");
  }

  const oneThing = asRecord(plan.one_thing);
  if (oneThing && asStr(oneThing.text)) {
    lines.push("— ONE THING YOU CAN DO —");
    lines.push(
      [asStr(oneThing.text), asStr(oneThing.link_label)].filter(Boolean).join(" ")
    );
    lines.push("");
  }

  const events = Array.isArray(plan.city_hall) ? plan.city_hall : [];
  if (events.length) {
    lines.push("— COMING UP AT CITY HALL —");
    for (const raw of events.slice(0, 4)) {
      const e = asRecord(raw);
      if (!e) continue;
      lines.push(
        `${asStr(e.weekday)} ${asStr(e.day)} ${asStr(e.month)} — ${asStr(e.title)}`
      );
      if (asStr(e.meta)) lines.push(`  ${asStr(e.meta)}`);
    }
    lines.push("");
  }

  const oln = asRecord(plan.one_last_number);
  if (oln && asStr(oln.stat)) {
    lines.push("— ONE LAST NUMBER —");
    lines.push(asStr(oln.stat));
    if (asStr(oln.context)) lines.push(asStr(oln.context));
    lines.push("");
  }

  const closing = asStr(plan.closing) || "That's the week.";
  lines.push(closing);

  const text = lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  // Need at least one real section beyond the scorecard stub.
  return text.length > 40 ? text : null;
}

const promptBlockStyle: CSSProperties = {
  fontSize: 11.5,
  whiteSpace: "pre-wrap",
  color: "var(--text-secondary)",
  background: "var(--bg-secondary)",
  borderRadius: 6,
  padding: 8,
  marginTop: 4,
  maxHeight: 220,
  overflow: "auto",
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
};

function GenerationPromptDetails({ detail }: { detail: NewsletterEvalResultDetail }) {
  const subscriber =
    detail.subscriber_context?.trim() || detail.newsletter_instructions?.trim() || "";
  const persona = (detail.newsletter_instructions || detail.persona_prompt)?.trim() || "";
  const override = detail.prompt_override?.trim() || "";
  const fullPrompt = detail.generation_prompt?.trim() || "";
  const hasAny = Boolean(subscriber || persona || override || fullPrompt);
  return (
    <details
      style={{
        border: "1px solid rgba(148, 163, 184, 0.35)",
        borderRadius: 8,
        background: "var(--bg-secondary, #f8fafc)",
        flex: "0 0 auto",
      }}
    >
      <summary
        style={{
          cursor: "pointer",
          padding: "8px 12px",
          fontSize: 12,
          fontWeight: 600,
          color: "var(--text-primary)",
          userSelect: "none",
          listStyle: "none",
        }}
      >
        Generation prompt
        {detail.prompt_variant_label ? ` · ${detail.prompt_variant_label}` : ""}
        {detail.has_prompt_override || override ? " · override" : ""}
      </summary>
      <div style={{ padding: "0 12px 10px", display: "flex", flexDirection: "column", gap: 8 }}>
        {!hasAny ? (
          <div className={styles.muted} style={{ fontSize: 11.5 }}>
            (No prompt recorded — this cell has no generation session.)
          </div>
        ) : (
          <>
            {subscriber && (
              <div>
                <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 2 }}>
                  Subscriber context (filled)
                </div>
                <pre style={promptBlockStyle}>{maskEmails(subscriber)}</pre>
              </div>
            )}
            {persona && persona !== subscriber && (
              <div>
                <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 2 }}>
                  Persona / instructions to Seymour
                </div>
                <pre style={promptBlockStyle}>{maskEmails(persona)}</pre>
              </div>
            )}
            {override && (
              <div>
                <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 2 }}>
                  Prompt template override (unfilled placeholders)
                </div>
                <pre style={{ ...promptBlockStyle, maxHeight: 320 }}>{override}</pre>
              </div>
            )}
            {fullPrompt && (
              <div>
                <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 2 }}>
                  Full prompt sent to Seymour (session)
                </div>
                <pre style={{ ...promptBlockStyle, maxHeight: 320 }}>
                  {maskEmails(fullPrompt)}
                </pre>
              </div>
            )}
          </>
        )}
      </div>
    </details>
  );
}

function EmailPlainTextBlock({ text }: { text: string }) {
  return (
    <div
      style={{
        borderTop: "1px solid rgba(148, 163, 184, 0.35)",
        background: "var(--bg-secondary, #f8fafc)",
        flex: "0 0 auto",
      }}
    >
      <div
        style={{
          padding: "8px 12px 4px",
          fontSize: 11,
          fontWeight: 600,
          color: "var(--text-secondary)",
          letterSpacing: "0.02em",
          textTransform: "uppercase",
        }}
      >
        Email text · shortcodes unexpanded
      </div>
      <pre
        style={{
          margin: 0,
          padding: "4px 12px 12px",
          fontSize: 11.5,
          lineHeight: 1.45,
          whiteSpace: "pre-wrap",
          color: "var(--text-primary)",
          fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
          maxHeight: 360,
          overflow: "auto",
        }}
      >
        {text}
      </pre>
    </div>
  );
}
export function ResultDetailPane({
  detail,
  models,
  onRejudged,
  compareMode = false,
}: {
  detail: NewsletterEvalResultDetail;
  models: ModelInfo[];
  onRejudged: (updated: NewsletterEvalResultDetail) => void;
  compareMode?: boolean;
}) {
  const { getAccessTokenSilently } = useAuth0();
  const [rejudging, setRejudging] = useState(false);
  const [correcting, setCorrecting] = useState(false);
  const [lastCorrectionResult, setLastCorrectionResult] = useState<{
    corrected?: boolean;
    changed_paths?: string[];
    reason?: string;
  } | null>(null);
  const [rejudgeModel, setRejudgeModel] = useState<string>(detail.judge_model_key || "");
  const [openContext, setOpenContext] = useState<Record<string, boolean>>({});
  const t = detail.run_telemetry;
  const u = detail.llm_usage;
  const stats = detail.stats_json;
  const planText = formatPlanForDisplay(detail.plan_json);
  const emailPlainText = formatPlanAsEmailText(detail.plan_json, detail.subject);
  const toggleContext = (key: string) =>
    setOpenContext((prev) => ({ ...prev, [key]: !prev[key] }));

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

  const hasAccuracyErrors = (): boolean =>
    (detail.judge_scores?.dimensions?.accuracy?.errors ?? []).some(Boolean);

  const handleAutoCorrect = async () => {
    if (detail.id <= 0) {
      toast.info("No eval row linked — import or judge this draft first.");
      return;
    }
    try {
      setCorrecting(true);
      setLastCorrectionResult(null);
      const token = await getAccessTokenSilently();
      const resp = await autocorrectNewsletterEvalResult(detail.id, token);

      if ("skipped" in resp && resp.skipped) {
        toast.info(resp.reason ?? "Nothing to correct");
        setLastCorrectionResult({ corrected: false, reason: resp.reason });
        return;
      }

      const { job_id } = resp as { job_id: string };
      const POLL_MS = 3000;
      const TIMEOUT_MS = 120_000;
      const deadline = Date.now() + TIMEOUT_MS;

      while (Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, POLL_MS));
        const job = await getJob(job_id, token);

        if (job.status === "completed") {
          const result = job.result as {
            corrected?: boolean;
            changed_paths?: string[];
            reason?: string;
          } | null;
          setLastCorrectionResult({
            corrected: result?.corrected ?? false,
            changed_paths: result?.changed_paths,
            reason: result?.reason,
          });
          const refreshed = await getNewsletterEvalResult(detail.id, token);
          onRejudged(refreshed);
          if (result?.corrected) {
            toast.success(
              `Corrected: ${(result.changed_paths ?? []).join(", ")} updated`
            );
          } else {
            toast.info(result?.reason ?? "Seymour made no changes");
          }
          return;
        }

        if (job.status === "failed") {
          throw new Error(job.error ?? "Correction job failed");
        }
      }
      throw new Error("Auto-correct timed out after 2 minutes");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Auto-correct failed");
    } finally {
      setCorrecting(false);
    }
  };

  const slateText = detail.stories_block?.trim() || "";
  const scoringText = detail.scoring_block?.trim() || "";
  const hasSlateOrScoring = Boolean(slateText || scoringText);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: compareMode ? "column" : "row",
        gap: compareMode ? 10 : 14,
        minHeight: 0,
        flex: 1,
        width: "100%",
        minWidth: 0,
      }}
    >
      {/* Email preview */}
      <div
        className={styles.emailPreviewFrame}
        style={{
          flex: compareMode ? "0 0 auto" : "1 1 62%",
          width: "100%",
          maxWidth: "none",
          margin: 0,
          overflow: "auto",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {compareMode && (
          <div
            style={{
              padding: "10px 12px 8px",
              borderBottom: "1px solid rgba(148, 163, 184, 0.35)",
              flex: "0 0 auto",
            }}
          >
            <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 2 }}>
              {maskEmails(detail.persona_label)} · {cellComboLabel(detail)}
            </div>
            {detail.subject && (
              <div style={{ color: "var(--text-secondary)", fontSize: 12, marginBottom: 6 }}>
                Subject: {detail.subject}
              </div>
            )}
            <GenerationPromptDetails detail={detail} />
          </div>
        )}
        {hasSlateOrScoring && (
          <details
            style={{
              borderBottom: "1px solid rgba(148, 163, 184, 0.35)",
              background: "var(--bg-secondary, #f8fafc)",
              flex: "0 0 auto",
            }}
          >
            <summary
              style={{
                cursor: "pointer",
                padding: "8px 12px",
                fontSize: 12,
                fontWeight: 600,
                color: "var(--text-secondary)",
                userSelect: "none",
                listStyle: "none",
              }}
            >
              Story slate & scoring
              {slateText ? ` · ${Math.max(1, (slateText.match(/^Story \d+/gm) || []).length)} stories` : ""}
              {scoringText ? " · ranking scores" : ""}
            </summary>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: scoringText && slateText ? "1fr 1fr" : "1fr",
                gap: 8,
                padding: "0 12px 10px",
                maxHeight: 180,
                overflow: "auto",
              }}
            >
              {slateText && (
                <pre
                  style={{
                    margin: 0,
                    fontSize: 10.5,
                    lineHeight: 1.35,
                    whiteSpace: "pre-wrap",
                    color: "var(--text-secondary)",
                    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                  }}
                >
                  {slateText}
                </pre>
              )}
              {scoringText && (
                <pre
                  style={{
                    margin: 0,
                    fontSize: 10.5,
                    lineHeight: 1.35,
                    whiteSpace: "pre-wrap",
                    color: "var(--text-secondary)",
                    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                    borderLeft: slateText ? "1px solid rgba(148, 163, 184, 0.3)" : undefined,
                    paddingLeft: slateText ? 8 : undefined,
                  }}
                >
                  {scoringText}
                </pre>
              )}
            </div>
          </details>
        )}
        {detail.body_html ? (
          <div className={styles.emailPreviewContent} style={{ flex: 1 }}>
            <div dangerouslySetInnerHTML={{ __html: detail.body_html }} />
          </div>
        ) : (
          <div className={styles.emailPreviewEmpty}>
            {detail.status === "failed"
              ? `Generation failed: ${detail.error || "unknown error"}`
              : "No rendered HTML for this cell."}
          </div>
        )}
        {emailPlainText && <EmailPlainTextBlock text={emailPlainText} />}
      </div>

      {/* Eval sidebar */}
      <div
        style={{
          flex: compareMode ? "0 0 auto" : "1 1 38%",
          overflow: "auto",
          minWidth: compareMode ? 0 : 260,
          width: compareMode ? "100%" : undefined,
          fontSize: 12.5,
        }}
      >
        {!compareMode && (
          <>
            <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 2 }}>
              {maskEmails(detail.persona_label)} · {cellComboLabel(detail)}
            </div>
            {detail.subject && (
              <div style={{ color: "var(--text-secondary)", marginBottom: 8 }}>
                Subject: {detail.subject}
              </div>
            )}
            <div style={{ marginBottom: 10 }}>
              <GenerationPromptDetails detail={detail} />
            </div>
          </>
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
                <td className={styles.muted}>Judge model</td>
                <td style={{ textAlign: "right", fontWeight: 600 }}>
                  {detail.judge_model_key
                    ? formatWorkbenchModelLabel(detail.judge_model_key)
                    : detail.judge_scores || detail.judge_usage
                      ? "default"
                      : "n/a"}
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
              <tr>
                <td className={styles.muted}>Session trace</td>
                <td style={{ textAlign: "right" }}>
                  {t?.session_trace_available
                    ? `${t.session_tool_call_count ?? t.tool_call_count ?? 0} calls loaded`
                    : "not available"}
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

        {/* Re-judge + auto-correct */}
        {detail.id > 0 && (detail.plan_json || detail.body_html) && (
          <div style={{ marginTop: 10 }}>
            <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
              <select
                className={styles.select}
                value={rejudgeModel}
                onChange={(e) => setRejudgeModel(e.target.value)}
                style={{ fontSize: 12, flex: 1, minWidth: 140 }}
              >
                <option value="">Default judge model</option>
                {models.map((m) => (
                  <option key={m.key} value={m.key}>
                    {formatWorkbenchModelLabel(m.key)}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className={styles.secondaryBtn}
                onClick={handleRejudge}
                disabled={rejudging || correcting}
              >
                {rejudging ? "Judging…" : "Re-judge"}
              </button>
              {hasAccuracyErrors() && (
                <button
                  type="button"
                  className={styles.primaryBtn}
                  disabled={correcting || rejudging}
                  title="Ask Seymour to make a minimal factual fix based on the judge's accuracy errors"
                  onClick={() => void handleAutoCorrect()}
                >
                  {correcting ? (
                    <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <Loader size="sm" color="white" /> Correcting…
                    </span>
                  ) : (
                    "✦ Auto-correct"
                  )}
                </button>
              )}
            </div>
            {lastCorrectionResult && (
              <div style={{ marginTop: 8, fontSize: 12 }} className={styles.muted}>
                {lastCorrectionResult.corrected
                  ? `Corrected: ${(lastCorrectionResult.changed_paths ?? []).join(", ")} — re-judged`
                  : lastCorrectionResult.reason ?? "No changes made"}
              </div>
            )}
          </div>
        )}

        <EvalCorrectionHistoryPanel
          attemptedAt={detail.correction_attempted_at}
          sessionId={detail.correction_session_id}
          fields={detail.correction_fields}
          errors={detail.correction_errors}
          before={detail.correction_before}
          after={detail.correction_after}
          attempts={detail.correction_attempts}
          attemptCount={detail.correction_attempt_count}
        />

        {/* Full judge context — everything the LLM judge received */}
        <div style={{ marginTop: 12 }}>
          <div style={{ fontWeight: 600, marginBottom: 2 }}>Judge context</div>
          <div className={styles.muted} style={{ fontSize: 11, marginBottom: 4 }}>
            Inputs passed to the judge (tool call args/results included; LLM
            conversation messages omitted).
          </div>
          <ContextBlock
            label="subscriber context (filled prompt)"
            open={!!openContext.subscriber}
            onToggle={() => toggleContext("subscriber")}
            emptyHint="(no generation session recorded for this cell)"
          >
            {detail.subscriber_context?.trim()
              || detail.newsletter_instructions?.trim()
              || null}
          </ContextBlock>
          <ContextBlock
            label="persona / instructions sent to Seymour"
            open={!!openContext.persona}
            onToggle={() => toggleContext("persona")}
            emptyHint="(none — shared edition)"
          >
            {(detail.newsletter_instructions || detail.persona_prompt)?.trim() || null}
          </ContextBlock>
          <ContextBlock
            label="story slate"
            open={!!openContext.slate}
            onToggle={() => toggleContext("slate")}
            emptyHint="(not available for this email)"
          >
            {detail.stories_block?.trim() || null}
          </ContextBlock>
          <ContextBlock
            label="story ranking / scoring"
            open={!!openContext.scoring}
            onToggle={() => toggleContext("scoring")}
            emptyHint="(not available — ranking scores were not stored for this email)"
          >
            {detail.scoring_block?.trim() || null}
          </ContextBlock>
          <ContextBlock
            label="editorial plan"
            open={!!openContext.plan}
            onToggle={() => toggleContext("plan")}
            emptyHint="(no structured plan — judge used rendered email text from the preview)"
          >
            {planText}
          </ContextBlock>
          {detail.prompt_override?.trim() && (
            <ContextBlock
              label="prompt template override (unfilled placeholders)"
              open={!!openContext.override}
              onToggle={() => toggleContext("override")}
            >
              {detail.prompt_override}
            </ContextBlock>
          )}
          <ContextBlock
            label="generation session trace"
            open={!!openContext.trace}
            onToggle={() => toggleContext("trace")}
            emptyHint="(not available)"
          >
            {detail.session_trace?.trim() || null}
          </ContextBlock>
        </div>

        {detail.session_id && (
          <div style={{ marginTop: 8 }}>
            <JobSessionDebugLink sessionId={detail.session_id} />
          </div>
        )}
      </div>
    </div>
  );
}

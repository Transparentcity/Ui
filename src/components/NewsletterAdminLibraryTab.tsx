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
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { toast } from "sonner";
import {
  getAvailableModels,
  getNewsletterEvalBatch,
  getNewsletterEvalResult,
  getNewsletterPrompts,
  importNewsletterEvalSends,
  listNewsletterEvalBatches,
  listNewsletterEvalPersonas,
  listNewsletterEvalResults,
  listNewsletterPending,
  rejudgeNewsletterEvalResult,
  runNewsletterEvalBatch,
  type CityListItem,
  type ModelGroupInfo,
  type ModelInfo,
  type NewsletterEvalBatchListItem,
  type NewsletterEvalCell,
  type NewsletterEvalJudgeScores,
  type NewsletterEvalLeaderboardItem,
  type NewsletterEvalLocation,
  type NewsletterEvalPersona,
  type NewsletterEvalResultDetail,
  type NewsletterPendingListItem,
} from "@/lib/apiClient";
import {
  fetchAddressSuggestions,
  type AddressSuggestion,
} from "@/lib/locationSearchUtils";
import { knownCityHallForCity } from "@/lib/cityHallLocations";
import Loader from "@/components/Loader";
import JobSessionDebugLink from "@/components/JobSessionDebugLink";
import styles from "./NewsletterAdmin.module.css";

const MAX_CELLS = 12;
const LEADERBOARD_PAGE_SIZE = 5;
// Rough per-cell token profile for the pre-run cost estimate (a full
// newsletter Seymour session is tool-heavy on input tokens).
const EST_INPUT_TOKENS = 130_000;
const EST_OUTPUT_TOKENS = 8_000;

/**
 * Shortlist for the Workbench run builder — current flagships + cheap
 * runners worth pivoting against. Everything else stays behind "Show all".
 * Keys that aren't available (missing API key) are simply omitted.
 */
const WORKBENCH_FEATURED_MODEL_KEYS: string[] = [
  "claude-sonnet-5",
  "claude-haiku-4.5",
  "claude-sonnet-4.6",
  "claude-opus-4.8",
  "gpt-5.6-terra",
  "gpt-5.6-luna",
  "gpt-5-mini",
  "gemini-3.5-flash",
  "gemini-3-flash",
  "grok-4.5",
  "deepinfra/kimi-k2.6",
  "deepinfra/kimi-k2.5",
  "deepinfra/deepseek-v4-pro",
  "deepinfra/deepseek-v4-flash",
  "deepinfra/glm-5.2",
];

/** Friendly chip / select labels for Workbench model pickers. */
function formatWorkbenchModelLabel(key: string): string {
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

function ModelChip({
  model,
  active,
  onToggle,
}: {
  model: ModelInfo;
  active: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      title={`${model.key}\nin $${model.input_price}/M · out $${model.output_price}/M`}
      onClick={onToggle}
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
      {formatWorkbenchModelLabel(model.key)}
      {model.is_default ? " ★" : ""}
    </button>
  );
}

const JUDGE_DIMENSION_LABELS: Record<string, string> = {
  accuracy: "Factual accuracy",
  relevance: "Personal relevance",
  cogency: "Cogency",
  data_honesty: "Honest use of data",
  tone: "Tone & voice",
  tool_use: "Tool use",
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
  const hasAny = Boolean(subscriber || persona || override);
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
            (Prompt inputs were not stored for this cell — re-run to capture.)
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

function ResultDetailPane({
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
                <option key={m.key} value={m.key}>
                  {formatWorkbenchModelLabel(m.key)}
                </option>
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
            emptyHint="(not stored — re-run cell to capture; check session debug)"
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
  const [modelGroups, setModelGroups] = useState<ModelGroupInfo[]>([]);
  const [showAllModels, setShowAllModels] = useState(false);
  const [defaultTemplate, setDefaultTemplate] = useState<string>("");

  // Run builder
  const [builderOpen, setBuilderOpen] = useState(false);
  const [runName, setRunName] = useState("");
  const [cityId, setCityId] = useState<number | null>(null);
  // "none" = shared-edition baseline (no persona instructions); selected by default.
  const [selectedPersonaIds, setSelectedPersonaIds] = useState<Set<string>>(
    () => new Set(["none"])
  );
  const [customPersonas, setCustomPersonas] = useState<CustomPersonaDraft[]>([]);
  const [selectedModels, setSelectedModels] = useState<Set<string>>(new Set());
  const [promptVariants, setPromptVariants] = useState<PromptVariantDraft[]>([
    { label: "Current template", template: null },
  ]);
  const [editingVariantIdx, setEditingVariantIdx] = useState<number | null>(null);
  const [judgeEnabled, setJudgeEnabled] = useState(true);
  const [judgeModelKey, setJudgeModelKey] = useState("");
  const [launching, setLaunching] = useState(false);

  // Custom location (optional personalization around an address)
  const [locationQuery, setLocationQuery] = useState("");
  const [locationSuggestions, setLocationSuggestions] = useState<AddressSuggestion[]>([]);
  const [locationSuggestLoading, setLocationSuggestLoading] = useState(false);
  const [selectedLocation, setSelectedLocation] = useState<NewsletterEvalLocation | null>(null);
  const [refreshPlaceMetrics, setRefreshPlaceMetrics] = useState(true);
  const [resolvingCityHall, setResolvingCityHall] = useState(false);
  const locationSuggestTimeoutRef = useRef<number | null>(null);

  // Import panel
  const [importOpen, setImportOpen] = useState(false);
  const [importQuery, setImportQuery] = useState("");
  const [importItems, setImportItems] = useState<NewsletterPendingListItem[]>([]);
  const [importSelected, setImportSelected] = useState<Set<number>>(new Set());
  const [importLoading, setImportLoading] = useState(false);
  const [importing, setImporting] = useState(false);

  // Global newsletter leaderboard (primary list)
  const [leaderboardItems, setLeaderboardItems] = useState<NewsletterEvalLeaderboardItem[]>([]);
  const [leaderboardLoading, setLeaderboardLoading] = useState(true);
  const [leaderboardPage, setLeaderboardPage] = useState(1);
  const [leaderboardPages, setLeaderboardPages] = useState(1);
  const [leaderboardTotal, setLeaderboardTotal] = useState(0);
  const [leaderboardQuery, setLeaderboardQuery] = useState("");
  const [leaderboardJudgedOnly, setLeaderboardJudgedOnly] = useState(true);

  // Batches / detail (secondary)
  const [batches, setBatches] = useState<NewsletterEvalBatchListItem[]>([]);
  const [batchesLoading, setBatchesLoading] = useState(true);
  const [batchesOpen, setBatchesOpen] = useState(false);
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
      const availableGroups = modelGroups
        .map((g) => ({ ...g, models: g.models.filter((m) => m.is_available) }))
        .filter((g) => g.models.length > 0);
      const flat = availableGroups.flatMap((g) => g.models);
      setModelGroups(availableGroups);
      setModels(flat);
      if (prompts?.unified_newsletter_prompt?.trim()) {
        setDefaultTemplate(prompts.unified_newsletter_prompt);
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to load eval reference data");
    }
  }, [getAccessTokenSilently]);

  const loadLeaderboard = useCallback(
    async (page = leaderboardPage) => {
      try {
        setLeaderboardLoading(true);
        const token = await getAccessTokenSilently();
        const res = await listNewsletterEvalResults(token, {
          q: leaderboardQuery.trim() || undefined,
          judged_only: leaderboardJudgedOnly,
          page,
          page_size: LEADERBOARD_PAGE_SIZE,
        });
        setLeaderboardItems(res.items);
        setLeaderboardPage(res.page);
        setLeaderboardPages(res.pages);
        setLeaderboardTotal(res.total);
      } catch (err: unknown) {
        toast.error(err instanceof Error ? err.message : "Failed to load eval leaderboard");
      } finally {
        setLeaderboardLoading(false);
      }
    },
    [getAccessTokenSilently, leaderboardPage, leaderboardQuery, leaderboardJudgedOnly]
  );

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

  const refreshLists = useCallback(async () => {
    await Promise.all([loadLeaderboard(leaderboardPage), loadBatches()]);
  }, [loadLeaderboard, loadBatches, leaderboardPage]);

  useEffect(() => {
    loadReferenceData();
    loadBatches();
  }, [loadReferenceData, loadBatches]);

  useEffect(() => {
    void loadLeaderboard(leaderboardPage);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload when filters/page change
  }, [leaderboardPage, leaderboardJudgedOnly]);

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
        void refreshLists();
      }, 5000);
    }
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [selectedBatchId, batchDetail?.batch?.status, loadBatchDetail, refreshLists]);

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

  const featuredModels = useMemo(() => {
    const byKey = new Map(models.map((m) => [m.key, m]));
    return WORKBENCH_FEATURED_MODEL_KEYS.map((key) => byKey.get(key)).filter(
      (m): m is ModelInfo => Boolean(m)
    );
  }, [models]);

  const featuredKeySet = useMemo(
    () => new Set(featuredModels.map((m) => m.key)),
    [featuredModels]
  );

  const otherModelGroups = useMemo(
    () =>
      modelGroups
        .map((g) => ({
          ...g,
          models: g.models.filter((m) => !featuredKeySet.has(m.key)),
        }))
        .filter((g) => g.models.length > 0),
    [modelGroups, featuredKeySet]
  );

  const toggleModel = (key: string) => {
    setSelectedModels((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

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
          location: selectedLocation
            ? {
                lat: selectedLocation.lat,
                lng: selectedLocation.lng,
                radius_m: selectedLocation.radius_m ?? 50,
                label: selectedLocation.label,
              }
            : undefined,
          refresh_place_metrics: selectedLocation ? refreshPlaceMetrics : false,
        },
        token
      );
      toast.success(`Eval batch started (${res.cell_count} cells)`);
      setBuilderOpen(false);
      setBatchesOpen(true);
      await refreshLists();
      setSelectedBatchId(res.batch_id);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to start eval batch");
    } finally {
      setLaunching(false);
    }
  };

  const clearSelectedLocation = () => {
    setSelectedLocation(null);
    setLocationQuery("");
    setLocationSuggestions([]);
  };

  const applyLocationSuggestion = (suggestion: AddressSuggestion) => {
    setSelectedLocation({
      lat: suggestion.lat,
      lng: suggestion.lon,
      radius_m: 50,
      label: suggestion.place_name,
    });
    setLocationQuery(suggestion.place_name);
    setLocationSuggestions([]);
  };

  const handleUseCityHall = async () => {
    if (!cityId) {
      toast.error("Pick a city first");
      return;
    }
    const city = cities.find((c) => c.city_id === cityId);
    if (!city?.city_name) {
      toast.error("Could not resolve city name");
      return;
    }

    // Curated pins for launched cities — Mapbox often returns a random street
    // (e.g. "California Ave, … 94130") for “City Hall, San Francisco”.
    const known = knownCityHallForCity(city.city_name);
    if (known) {
      setSelectedLocation({
        lat: known.lat,
        lng: known.lng,
        radius_m: known.radius_m ?? 50,
        label: known.label,
      });
      setLocationQuery(known.label);
      setLocationSuggestions([]);
      toast.success(`Using ${known.label}`);
      return;
    }

    const cityPart = [city.city_name, city.state].filter(Boolean).join(", ");
    const query = `City Hall, ${cityPart}`;
    const cityNorm = city.city_name.trim().toLowerCase();

    const matchesCity = (s: AddressSuggestion) => {
      const place = s.place_name.toLowerCase();
      const suggestionCity = (s.cityName || "").trim().toLowerCase();
      if (place.includes(cityNorm)) return true;
      if (suggestionCity && suggestionCity === cityNorm) return true;
      if (
        suggestionCity &&
        (cityNorm.includes(suggestionCity) || suggestionCity.includes(cityNorm))
      ) {
        return true;
      }
      return false;
    };
    const looksLikeCityHall = (s: AddressSuggestion) =>
      /city\s*hall/i.test(s.place_name);

    try {
      setResolvingCityHall(true);
      const suggestions = await fetchAddressSuggestions(query, {
        types: "poi",
        country: "US",
      });
      // Strict: only accept a POI whose name is actually City Hall in this city.
      // Never fall back to an arbitrary in-city address.
      const pick = suggestions.find(
        (s) => looksLikeCityHall(s) && matchesCity(s)
      );

      if (pick) {
        applyLocationSuggestion(pick);
        toast.success(`Using ${pick.place_name}`);
        return;
      }

      throw new Error(
        `Could not find City Hall for ${city.city_name}. Type the street address instead.`
      );
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Could not find city hall");
    } finally {
      setResolvingCityHall(false);
    }
  };

  // Debounced address autocomplete for the custom location field.
  useEffect(() => {
    if (locationSuggestTimeoutRef.current) {
      window.clearTimeout(locationSuggestTimeoutRef.current);
    }
    const q = locationQuery.trim();
    if (selectedLocation && q === (selectedLocation.label || "").trim()) {
      setLocationSuggestions([]);
      return;
    }
    if (q.length < 3) {
      setLocationSuggestions([]);
      return;
    }
    locationSuggestTimeoutRef.current = window.setTimeout(() => {
      void (async () => {
        setLocationSuggestLoading(true);
        try {
          const city = cities.find((c) => c.city_id === cityId);
          const scoped = city?.city_name
            ? `${q}, ${city.city_name}${city.state ? `, ${city.state}` : ""}`
            : q;
          const suggestions = await fetchAddressSuggestions(scoped);
          setLocationSuggestions(suggestions.slice(0, 6));
        } finally {
          setLocationSuggestLoading(false);
        }
      })();
    }, 280);
    return () => {
      if (locationSuggestTimeoutRef.current) {
        window.clearTimeout(locationSuggestTimeoutRef.current);
      }
    };
  }, [locationQuery, selectedLocation, cityId, cities]);

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
      setBatchesOpen(true);
      await refreshLists();
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
                onChange={(e) => {
                  const next = e.target.value ? Number(e.target.value) : null;
                  setCityId(next);
                  clearSelectedLocation();
                }}
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

          {/* Custom location */}
          <div style={{ marginTop: 10 }}>
            <label className={styles.testLabel}>
              Custom location{" "}
              <span className={styles.muted} style={{ fontWeight: 400 }}>
                (optional — personalize around an address)
              </span>
            </label>
            <div style={{ display: "flex", gap: 8, marginTop: 4, flexWrap: "wrap", alignItems: "center" }}>
              <input
                className={styles.searchInput}
                style={{ flex: "1 1 220px", minWidth: 180 }}
                value={locationQuery}
                onChange={(e) => {
                  setLocationQuery(e.target.value);
                  if (selectedLocation) setSelectedLocation(null);
                }}
                placeholder={cityId ? "Street address in this city…" : "Pick a city first"}
                disabled={!cityId}
              />
              <button
                type="button"
                className={styles.secondaryBtn}
                disabled={!cityId || resolvingCityHall}
                onClick={() => void handleUseCityHall()}
              >
                {resolvingCityHall ? "Finding…" : "Use city hall"}
              </button>
              {selectedLocation && (
                <button type="button" className={styles.linkBtn} onClick={clearSelectedLocation}>
                  Clear
                </button>
              )}
            </div>
            {(locationSuggestLoading || locationSuggestions.length > 0) && !selectedLocation && (
              <div
                style={{
                  marginTop: 4,
                  border: "1px solid var(--border-primary)",
                  borderRadius: 6,
                  background: "var(--bg-primary)",
                  maxWidth: 520,
                }}
              >
                {locationSuggestLoading && locationSuggestions.length === 0 ? (
                  <div className={styles.muted} style={{ padding: "8px 10px", fontSize: 12 }}>
                    Searching addresses…
                  </div>
                ) : (
                  locationSuggestions.map((s, i) => (
                    <button
                      key={`${s.place_name}-${i}`}
                      type="button"
                      onClick={() => applyLocationSuggestion(s)}
                      style={{
                        display: "block",
                        width: "100%",
                        textAlign: "left",
                        padding: "8px 10px",
                        border: "none",
                        borderBottom:
                          i < locationSuggestions.length - 1
                            ? "1px solid var(--border-primary)"
                            : "none",
                        background: "transparent",
                        cursor: "pointer",
                        fontSize: 12,
                        color: "var(--text-primary)",
                      }}
                    >
                      {s.place_name}
                    </button>
                  ))
                )}
              </div>
            )}
            {selectedLocation && (
              <div
                className={styles.muted}
                style={{ marginTop: 6, fontSize: 12, display: "flex", flexDirection: "column", gap: 4 }}
              >
                <span>
                  Pin: {selectedLocation.label}{" "}
                  <span style={{ opacity: 0.75 }}>
                    ({selectedLocation.lat.toFixed(5)}, {selectedLocation.lng.toFixed(5)})
                  </span>
                </span>
                <label style={{ display: "inline-flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    checked={refreshPlaceMetrics}
                    onChange={(e) => setRefreshPlaceMetrics(e.target.checked)}
                  />
                  Refresh place metrics before generating (slower, better block-level detail)
                </label>
              </div>
            )}
          </div>

          {/* Personas */}
          <div style={{ marginTop: 10 }}>
            <label className={styles.testLabel}>Personas</label>
            <div className={styles.muted} style={{ fontSize: 11, marginTop: 2, marginBottom: 4 }}>
              Same instruction slot as weekend draft assembly
              ({`{instructions_block}`}). &ldquo;No persona&rdquo; is the shared-edition
              baseline; with a location, place-focus text is still injected into the
              prompt (like a subscriber who named their home address).
            </div>
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
            <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
              <label className={styles.testLabel}>Models</label>
              <span className={styles.muted} style={{ fontSize: 11 }}>
                {selectedModels.size} selected
                {models.length === 0 ? " · loading…" : ""}
              </span>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 4 }}>
              {featuredModels.map((m) => (
                <ModelChip
                  key={m.key}
                  model={m}
                  active={selectedModels.has(m.key)}
                  onToggle={() => toggleModel(m.key)}
                />
              ))}
            </div>
            {otherModelGroups.length > 0 && (
              <div style={{ marginTop: 8 }}>
                <button
                  type="button"
                  className={styles.linkBtn}
                  onClick={() => setShowAllModels((v) => !v)}
                >
                  {showAllModels
                    ? "Hide extra models"
                    : `Show all models (${otherModelGroups.reduce((n, g) => n + g.models.length, 0)})`}
                </button>
                {showAllModels &&
                  otherModelGroups.map((group) => (
                    <div key={group.label} style={{ marginTop: 8 }}>
                      <div className={styles.muted} style={{ fontSize: 11, marginBottom: 4 }}>
                        {group.emoji ? `${group.emoji} ` : ""}
                        {group.label}
                      </div>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                        {group.models.map((m) => (
                          <ModelChip
                            key={m.key}
                            model={m}
                            active={selectedModels.has(m.key)}
                            onToggle={() => toggleModel(m.key)}
                          />
                        ))}
                      </div>
                    </div>
                  ))}
              </div>
            )}
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
                {featuredModels.map((m) => (
                  <option key={m.key} value={m.key}>
                    {formatWorkbenchModelLabel(m.key)}
                  </option>
                ))}
                {otherModelGroups.flatMap((g) =>
                  g.models.map((m) => (
                    <option key={m.key} value={m.key}>
                      {formatWorkbenchModelLabel(m.key)}
                    </option>
                  ))
                )}
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

      {/* Global newsletter leaderboard (primary) */}
      <div className={styles.tableContainer} style={{ marginBottom: 14 }}>
        <div className={styles.tableHeader}>
          <span className={styles.tableTitle}>Newsletter leaderboard</span>
          <span className={styles.tableCount}>{leaderboardTotal}</span>
          <div style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center" }}>
            <label
              className={styles.muted}
              style={{ fontSize: 12, display: "flex", gap: 4, alignItems: "center" }}
            >
              <input
                type="checkbox"
                checked={leaderboardJudgedOnly}
                onChange={(e) => {
                  setLeaderboardPage(1);
                  setLeaderboardJudgedOnly(e.target.checked);
                }}
              />
              Judged only
            </label>
            <input
              className={styles.searchInput}
              style={{ width: 180 }}
              value={leaderboardQuery}
              onChange={(e) => setLeaderboardQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  setLeaderboardPage(1);
                  void loadLeaderboard(1);
                }
              }}
              placeholder="Search subject, city…"
            />
            <button
              type="button"
              className={styles.linkBtn}
              onClick={() => {
                setLeaderboardPage(1);
                void loadLeaderboard(1);
              }}
            >
              Refresh
            </button>
          </div>
        </div>
        {leaderboardLoading && leaderboardItems.length === 0 ? (
          <Loader />
        ) : leaderboardItems.length === 0 ? (
          <div className={styles.emptyState}>
            No scored newsletters yet — run an eval or import emails to judge.
          </div>
        ) : (
          <>
            <div className={styles.tableWrapper}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th className={styles.th}>#</th>
                    <th className={styles.th}>Newsletter</th>
                    <th className={styles.th}>Overall</th>
                    <th className={styles.th}>Acc</th>
                    <th className={styles.th}>Rel</th>
                    <th className={styles.th}>Cog</th>
                    <th className={styles.th}>Data</th>
                    <th className={styles.th}>Tone</th>
                    <th className={styles.th}>Tools</th>
                    <th className={styles.th}>Tokens in/out</th>
                    <th className={styles.th}>Cost</th>
                    <th className={styles.th}>Time</th>
                    <th className={styles.th}>Calls</th>
                    <th className={styles.th}>Batch / City</th>
                  </tr>
                </thead>
                <tbody>
                  {leaderboardItems.map((r, i) => {
                    const dims = r.judge_scores?.dimensions || {};
                    const t = r.run_telemetry;
                    const rank = (leaderboardPage - 1) * LEADERBOARD_PAGE_SIZE + i + 1;
                    return (
                      <tr
                        key={r.id}
                        className={styles.rowClickable}
                        onClick={() => openDetail([r.id])}
                      >
                        <td className={styles.td}>{rank}</td>
                        <td className={styles.td}>
                          <div style={{ fontWeight: 600 }}>
                            {maskEmails(r.subject) || "(no subject)"}
                          </div>
                          <div className={styles.muted} style={{ fontSize: 11.5 }}>
                            {maskEmails(r.persona_label) || "—"} · {cellComboLabel(r)}
                            {r.source === "imported" ? " · imported" : ""}
                          </div>
                        </td>
                        <td className={styles.td}>
                          <ScoreBadge
                            score={r.overall_score ?? overallScore(r)}
                            size={20}
                          />
                        </td>
                        <td className={styles.td}>{dims.accuracy?.score ?? "–"}</td>
                        <td className={styles.td}>{dims.relevance?.score ?? "–"}</td>
                        <td className={styles.td}>{dims.cogency?.score ?? "–"}</td>
                        <td className={styles.td}>{dims.data_honesty?.score ?? "–"}</td>
                        <td className={styles.td}>{dims.tone?.score ?? "–"}</td>
                        <td className={styles.td}>{dims.tool_use?.score ?? "–"}</td>
                        <td className={styles.td}>
                          {fmtTokens(r.llm_usage?.prompt_tokens)}/
                          {fmtTokens(r.llm_usage?.completion_tokens)}
                        </td>
                        <td className={styles.td}>{fmtCost(r.llm_usage?.cost_usd)}</td>
                        <td className={styles.td}>
                          {fmtMs(t?.generation_ms ?? t?.execution_time_ms)}
                        </td>
                        <td className={styles.td}>
                          {t?.llm_call_count ?? "–"}/{t?.tool_call_count ?? "–"}
                        </td>
                        <td className={styles.td}>
                          <button
                            type="button"
                            className={styles.linkBtn}
                            style={{ fontSize: 12, padding: 0, textAlign: "left" }}
                            onClick={(e) => {
                              e.stopPropagation();
                              setBatchesOpen(true);
                              setSelectedBatchId(r.batch_id);
                            }}
                          >
                            {r.batch_name || `Batch ${r.batch_id}`}
                          </button>
                          <div className={styles.muted} style={{ fontSize: 11 }}>
                            {r.city_name || "—"}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {leaderboardTotal > 0 && (
              <div className={styles.pagination}>
                <button
                  type="button"
                  className={styles.secondaryBtn}
                  disabled={leaderboardPage <= 1 || leaderboardLoading}
                  onClick={() => setLeaderboardPage((p) => Math.max(1, p - 1))}
                >
                  Previous
                </button>
                <span className={styles.pageInfo}>
                  Page {leaderboardPage} of {leaderboardPages} ({leaderboardTotal} newsletters)
                </span>
                <button
                  type="button"
                  className={styles.secondaryBtn}
                  disabled={leaderboardPage >= leaderboardPages || leaderboardLoading}
                  onClick={() =>
                    setLeaderboardPage((p) => Math.min(leaderboardPages, p + 1))
                  }
                >
                  Next
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Batch list (secondary) */}
      <div className={styles.tableContainer} style={{ marginBottom: 14 }}>
        <div className={styles.tableHeader}>
          <button
            type="button"
            className={styles.linkBtn}
            style={{ fontWeight: 700, fontSize: 14 }}
            onClick={() => setBatchesOpen((o) => !o)}
          >
            {batchesOpen ? "▾" : "▸"} Eval batches
          </button>
          <span className={styles.tableCount}>{batches.length}</span>
          <span className={styles.muted} style={{ fontSize: 12 }}>
            batch name, city, status — open a batch for matrix view
          </span>
          <button
            type="button"
            className={styles.linkBtn}
            style={{ marginLeft: "auto" }}
            onClick={() => loadBatches()}
          >
            Refresh
          </button>
        </div>
        {batchesOpen && (
          batchesLoading ? (
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
          )
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
              {(() => {
                const loc = batchDetail.batch.config_json?.location as
                  | NewsletterEvalLocation
                  | undefined;
                if (!loc?.label && loc?.lat == null) return null;
                const district =
                  typeof loc.district === "number" && loc.district > 0
                    ? loc.district
                    : typeof batchDetail.batch.config_json?.district === "number"
                      ? (batchDetail.batch.config_json.district as number)
                      : null;
                return (
                  <div className={styles.muted} style={{ fontSize: 12, margin: "8px 0 4px" }}>
                    Location: {loc.label || "Custom pin"}
                    {district ? ` · District ${district}` : ""}
                    {loc.lat != null && loc.lng != null
                      ? ` · ${Number(loc.lat).toFixed(4)}, ${Number(loc.lng).toFixed(4)}`
                      : ""}
                  </div>
                );
              })()}
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
                          <th className={styles.th}>Tools</th>
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
                              <td className={styles.td}>{dims.tool_use?.score ?? "–"}</td>
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
        <div
          className={styles.emailPreviewOverlay}
          style={detailPanes.length === 2 ? { padding: 8 } : undefined}
          onClick={() => setDetailPanes([])}
        >
          <div
            className={styles.emailPreviewModal}
            style={
              detailPanes.length === 2
                ? {
                    width: "100%",
                    maxWidth: "100%",
                    height: "100%",
                    maxHeight: "100%",
                    borderRadius: 12,
                  }
                : { maxWidth: 1100, width: "94vw" }
            }
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
              style={{
                display: "flex",
                gap: detailPanes.length === 2 ? 12 : 16,
                minHeight: 0,
                padding: detailPanes.length === 2 ? 12 : undefined,
              }}
            >
              {detailLoading ? (
                <Loader />
              ) : (
                detailPanes.map((d) => (
                  <div
                    key={d.id}
                    style={{
                      flex: "1 1 0",
                      display: "flex",
                      minWidth: 0,
                      width: `${100 / Math.max(detailPanes.length, 1)}%`,
                    }}
                  >
                    <ResultDetailPane
                      detail={d}
                      models={models}
                      compareMode={detailPanes.length === 2}
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

"use client";

/**
 * Shared LLM-as-judge score display (newsletter workbench + feed story eval).
 */

import { useState, type ReactNode } from "react";
import type { NewsletterEvalJudgeScores } from "@/lib/apiClient";

export const JUDGE_DIMENSION_LABELS: Record<string, string> = {
  accuracy: "Factual accuracy",
  relevance: "Personal relevance",
  cogency: "Cogency",
  data_honesty: "Honest use of data",
  tone: "Tone & voice",
  tool_use: "Tool use",
  charter_compliance: "Charter compliance",
};

export function scoreColor(score: number | null | undefined): string {
  if (score == null) return "var(--text-tertiary, #999)";
  if (score >= 5) return "#1a7f37";
  if (score >= 4) return "#4c9a52";
  if (score >= 3) return "#b8860b";
  if (score >= 2) return "#d9640e";
  return "#c1341b";
}

export function ScoreBadge({
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

/** Split `"wrong claim" — why` so the incorrect fact can be bolded. */
export function formatFactualError(error: string): ReactNode {
  // [\s\S] instead of /s (dotAll) — tsconfig target is ES2017.
  const match = error.match(/^[\s]*["“]([\s\S]+?)["”]\s*[—–-]\s*([\s\S]+)$/);
  if (match) {
    return (
      <>
        <strong style={{ fontWeight: 700 }}>&ldquo;{match[1]}&rdquo;</strong>
        {" — "}
        {match[2].trim()}
      </>
    );
  }
  const dash = error.match(/^([\s\S]+?)\s+[—–]\s+([\s\S]+)$/);
  if (dash) {
    return (
      <>
        <strong style={{ fontWeight: 700 }}>{dash[1].trim()}</strong>
        {" — "}
        {dash[2].trim()}
      </>
    );
  }
  return error;
}

export function JudgeScoresPanel({
  scores,
  judgeModelKey,
}: {
  scores: NewsletterEvalJudgeScores;
  judgeModelKey?: string | null;
}) {
  const accuracyErrors = scores.dimensions?.accuracy?.errors ?? [];
  const [expanded, setExpanded] = useState<string | null>(
    accuracyErrors.length > 0 ? "accuracy" : null
  );
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
        <ScoreBadge score={scores.overall?.score} size={30} />
        <div>
          <div style={{ fontSize: 13, fontWeight: 600 }}>
            Overall{scores.fabrication_capped ? " (capped: fabrication found)" : ""}
          </div>
          {judgeModelKey && (
            <div style={{ fontSize: 11, color: "var(--text-tertiary, #999)" }}>
              Judge: {judgeModelKey}
            </div>
          )}
          <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>
            {scores.overall?.verdict || ""}
          </div>
        </div>
      </div>

      {Object.entries(JUDGE_DIMENSION_LABELS).map(([key, label]) => {
        const dim = scores.dimensions?.[key];
        if (!dim) return null;
        const isOpen = expanded === key;
        const errorCount = key === "accuracy" ? (dim.errors?.length ?? 0) : 0;
        return (
          <div
            key={key}
            style={{ borderTop: "1px solid var(--border-primary)", padding: "5px 0" }}
          >
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
              <span
                style={{
                  fontSize: 12.5,
                  fontWeight: 600,
                  color: "var(--text-primary)",
                }}
              >
                {label}
              </span>
              {errorCount > 0 && (
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    padding: "1px 7px",
                    fontSize: 10,
                    fontWeight: 600,
                    borderRadius: 999,
                    background: "rgba(193, 52, 27, 0.1)",
                    color: "#c1341b",
                    border: "1px solid rgba(193, 52, 27, 0.3)",
                  }}
                >
                  {errorCount} error{errorCount > 1 ? "s" : ""}
                </span>
              )}
              <span
                style={{
                  marginLeft: "auto",
                  fontSize: 11,
                  color: "var(--text-tertiary)",
                }}
              >
                {isOpen ? "▾" : "▸"}
              </span>
            </button>
            {isOpen && (
              <div
                style={{
                  fontSize: 12,
                  color: "var(--text-secondary)",
                  padding: "4px 0 2px 26px",
                }}
              >
                {key === "accuracy" && errorCount > 0 && (
                  <div style={{ marginBottom: 8 }}>
                    <div
                      style={{
                        fontWeight: 700,
                        color: "#c1341b",
                        marginBottom: 4,
                        fontSize: 12,
                      }}
                    >
                      Factual errors
                    </div>
                    <ol
                      style={{
                        margin: 0,
                        paddingLeft: 18,
                        color: "#c1341b",
                      }}
                    >
                      {dim.errors!.map((e, i) => (
                        <li key={i} style={{ marginBottom: 4 }}>
                          {formatFactualError(e)}
                        </li>
                      ))}
                    </ol>
                  </div>
                )}
                <div>{dim.rationale}</div>
                {(dim.evidence?.length ?? 0) > 0 && (
                  <ul style={{ margin: "4px 0 0", paddingLeft: 16 }}>
                    {dim.evidence!.map((e, i) => (
                      <li key={i} style={{ fontStyle: "italic" }}>
                        {e}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
        );
      })}

      {(scores.top_issues?.length ?? 0) > 0 && (
        <div
          style={{
            borderTop: "1px solid var(--border-primary)",
            paddingTop: 6,
            marginTop: 2,
          }}
        >
          <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 2 }}>
            Top issues
          </div>
          <ol
            style={{
              margin: 0,
              paddingLeft: 18,
              fontSize: 12,
              color: "var(--text-secondary)",
            }}
          >
            {scores.top_issues.map((issue, i) => (
              <li key={i}>{issue}</li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}

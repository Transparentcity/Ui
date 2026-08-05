"use client";

/**
 * Shared LLM-as-judge score display (newsletter workbench + feed story eval).
 */

import { useState } from "react";
import type { NewsletterEvalJudgeScores } from "@/lib/apiClient";

export const JUDGE_DIMENSION_LABELS: Record<string, string> = {
  accuracy: "Factual accuracy",
  relevance: "Personal relevance",
  cogency: "Cogency",
  data_honesty: "Honest use of data",
  tone: "Tone & voice",
  tool_use: "Tool use",
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

export function JudgeScoresPanel({
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
              {key === "accuracy" && (dim.errors?.length ?? 0) > 0 && (
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    padding: "1px 7px",
                    fontSize: 10,
                    fontWeight: 600,
                    borderRadius: 999,
                    background: "rgba(245, 158, 11, 0.1)",
                    color: "#d97706",
                    border: "1px solid rgba(245, 158, 11, 0.3)",
                  }}
                >
                  {dim.errors!.length} error{dim.errors!.length > 1 ? "s" : ""}
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
                {key === "accuracy" && (dim.errors?.length ?? 0) > 0 && (
                  <div style={{ marginTop: 4 }}>
                    <div style={{ fontWeight: 600, color: "#c1341b" }}>
                      Factual errors:
                    </div>
                    <ul style={{ margin: "2px 0 0", paddingLeft: 16 }}>
                      {dim.errors!.map((e, i) => (
                        <li key={i} style={{ color: "#c1341b" }}>
                          {e}
                        </li>
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

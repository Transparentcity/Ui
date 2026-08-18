"use client";

import { useState } from "react";

const FIELD_LABELS: Record<string, string> = {
  subject: "Subject",
  headline: "Headline",
  description: "Description",
  article_html: "Article",
  "lead.headline": "Lead headline",
  "lead.paragraph_1": "Lead paragraph 1",
  "lead.in_the_record": "In the record",
  "lead.paragraph_3": "Lead paragraph 3",
};

function DiffBlock({
  label,
  before,
  after,
}: {
  label: string;
  before: string;
  after: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const previewLen = 280;
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 4 }}>{label}</div>
      <div
        style={{
          background: "#fef2f2",
          color: "#7f1d1d",
          borderLeft: "3px solid #dc2626",
          padding: "6px 10px",
          borderRadius: "0 4px 4px 0",
          fontSize: 12,
          fontFamily: "monospace",
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
          marginBottom: 4,
        }}
      >
        {expanded || before.length <= previewLen
          ? before
          : before.slice(0, previewLen) + "…"}
      </div>
      <div
        style={{
          background: "#f0fdf4",
          color: "#14532d",
          borderLeft: "3px solid #16a34a",
          padding: "6px 10px",
          borderRadius: "0 4px 4px 0",
          fontSize: 12,
          fontFamily: "monospace",
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
        }}
      >
        {expanded || after.length <= previewLen
          ? after
          : after.slice(0, previewLen) + "…"}
      </div>
      {(before.length > previewLen || after.length > previewLen) && (
        <button
          type="button"
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            fontSize: 11,
            color: "var(--accent)",
            padding: "2px 0",
          }}
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? "Show less" : "Show full text"}
        </button>
      )}
    </div>
  );
}

export function EvalCorrectionHistoryPanel({
  attemptedAt,
  sessionId,
  fields,
  errors,
  before,
  after,
}: {
  attemptedAt: string | null | undefined;
  sessionId?: string | null;
  fields?: string[] | null;
  errors?: string[] | null;
  before?: Record<string, string> | null;
  after?: Record<string, string> | null;
}) {
  if (!attemptedAt) return null;

  const changedFields = Array.isArray(fields) ? fields : [];
  const errorList = Array.isArray(errors) ? errors : [];
  const beforeMap = before ?? {};
  const afterMap = after ?? {};
  const attempted = new Date(attemptedAt).toLocaleString();
  const corrected = changedFields.length > 0;

  return (
    <div style={{ marginTop: 14 }}>
      <div
        style={{
          fontWeight: 600,
          fontSize: 12,
          marginBottom: 4,
          display: "flex",
          alignItems: "center",
          gap: 6,
        }}
      >
        ✦ Auto-correction
        <span
          style={{
            fontSize: 10,
            fontWeight: 500,
            padding: "2px 6px",
            borderRadius: 10,
            background: corrected ? "#f0fdf4" : "#f1f5f9",
            color: corrected ? "#16a34a" : "#64748b",
          }}
        >
          {corrected
            ? `${changedFields.length} field${changedFields.length > 1 ? "s" : ""} changed`
            : "no changes"}
        </span>
      </div>
      <div style={{ fontSize: 11, color: "var(--text-secondary)", marginBottom: 8 }}>
        {attempted}
        {sessionId && (
          <>
            {" "}
            · session <code style={{ fontSize: 10 }}>{sessionId.slice(0, 8)}</code>
          </>
        )}
      </div>

      {errorList.length > 0 && (
        <div style={{ marginBottom: 10 }}>
          <div
            style={{
              fontSize: 11,
              fontWeight: 600,
              marginBottom: 4,
              color: "var(--text-secondary)",
            }}
          >
            Errors fixed
          </div>
          <ul style={{ margin: 0, paddingLeft: 16, fontSize: 12 }}>
            {errorList.map((e, i) => (
              <li key={i} style={{ marginBottom: 2 }}>
                {e}
              </li>
            ))}
          </ul>
        </div>
      )}

      {corrected ? (
        changedFields.map((field) => (
          <DiffBlock
            key={field}
            label={FIELD_LABELS[field] ?? field}
            before={beforeMap[field] ?? "(not captured)"}
            after={afterMap[field] ?? "(current text unavailable)"}
          />
        ))
      ) : (
        <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>
          Seymour reviewed the draft but made no changes.
        </div>
      )}
    </div>
  );
}

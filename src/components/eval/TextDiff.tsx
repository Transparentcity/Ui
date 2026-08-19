"use client";

import { useMemo, useState } from "react";

import { collapseUnchanged, diffWords } from "@/lib/textDiff";

const styles = {
  body: {
    fontSize: 12,
    fontFamily: "monospace",
    whiteSpace: "pre-wrap" as const,
    wordBreak: "break-word" as const,
    lineHeight: 1.5,
    padding: "6px 10px",
    borderRadius: 4,
    background: "var(--surface-2, #f8fafc)",
    border: "1px solid var(--border, #e2e8f0)",
  },
  del: {
    background: "#fee2e2",
    color: "#7f1d1d",
    textDecoration: "line-through",
    textDecorationColor: "#b91c1c",
    borderRadius: 2,
    padding: "0 1px",
  },
  ins: {
    background: "#dcfce7",
    color: "#14532d",
    fontWeight: 600,
    borderRadius: 2,
    padding: "0 1px",
  },
  toggle: {
    background: "none",
    border: "none",
    cursor: "pointer",
    fontSize: 11,
    color: "var(--accent)",
    padding: "2px 0",
  },
};

/**
 * Inline word-level diff of one corrected field.
 *
 * Removals are struck through in red and additions highlighted in green in a
 * single stream, so a changed number reads as `450 419` in place instead of
 * forcing a manual comparison of two paragraphs. Long unchanged stretches are
 * collapsed by default and expandable.
 */
export function TextDiff({
  label,
  before,
  after,
}: {
  label: string;
  before: string;
  after: string;
}) {
  const [showFull, setShowFull] = useState(false);

  const segments = useMemo(() => diffWords(before, after), [before, after]);
  const visible = useMemo(
    () => (showFull ? segments : collapseUnchanged(segments)),
    [segments, showFull]
  );

  const changeCount = segments.filter((s) => s.op !== "equal").length;
  const collapsedLength = useMemo(
    () => collapseUnchanged(segments).reduce((n, s) => n + s.text.length, 0),
    [segments]
  );
  const fullLength = segments.reduce((n, s) => n + s.text.length, 0);
  const canCollapse = collapsedLength < fullLength;

  return (
    <div style={{ marginBottom: 10 }}>
      <div
        style={{
          fontSize: 11,
          fontWeight: 600,
          marginBottom: 4,
          display: "flex",
          alignItems: "center",
          gap: 6,
        }}
      >
        <span>{label}</span>
        {changeCount === 0 ? (
          <span style={{ fontWeight: 500, color: "var(--text-secondary)" }}>
            no textual change
          </span>
        ) : (
          <span style={{ fontWeight: 500, color: "var(--text-secondary)" }}>
            {changeCount} edit{changeCount > 1 ? "s" : ""}
          </span>
        )}
      </div>
      <div style={styles.body}>
        {visible.map((segment, i) => {
          if (segment.op === "equal") return <span key={i}>{segment.text}</span>;
          return (
            <span
              key={i}
              style={segment.op === "delete" ? styles.del : styles.ins}
              title={segment.op === "delete" ? "Removed" : "Added"}
            >
              {segment.text}
            </span>
          );
        })}
      </div>
      {canCollapse && (
        <button
          type="button"
          style={styles.toggle}
          onClick={() => setShowFull((v) => !v)}
        >
          {showFull ? "Collapse unchanged text" : "Show full text"}
        </button>
      )}
    </div>
  );
}

export default TextDiff;

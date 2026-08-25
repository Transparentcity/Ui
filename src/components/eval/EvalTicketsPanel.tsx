"use client";

/**
 * Displays structured accuracy tickets emitted by the new LLM-as-judge.
 *
 * Each ticket captures one claim the judge flagged, what action it recommended,
 * and the replacement text (when available). Shown in the Feed Admin eval sidebar
 * so admins can trace exactly what the judge found and why corrections were made.
 */

import type { AccuracyJudgeTicket } from "@/lib/apiClient";

const ACTION_CONFIG: Record<
  AccuracyJudgeTicket["action"],
  { label: string; bg: string; color: string; border: string }
> = {
  replace: {
    label: "Replace",
    bg: "rgba(193, 52, 27, 0.08)",
    color: "#c1341b",
    border: "rgba(193, 52, 27, 0.25)",
  },
  research: {
    label: "Research",
    bg: "rgba(234, 115, 23, 0.08)",
    color: "#b35b0e",
    border: "rgba(234, 115, 23, 0.25)",
  },
  qualify: {
    label: "Qualify",
    bg: "rgba(180, 130, 0, 0.08)",
    color: "#8a6400",
    border: "rgba(180, 130, 0, 0.25)",
  },
};

function ActionBadge({ action }: { action: AccuracyJudgeTicket["action"] }) {
  const cfg = ACTION_CONFIG[action] ?? ACTION_CONFIG.replace;
  return (
    <span
      style={{
        display: "inline-block",
        padding: "1px 7px",
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: "0.04em",
        textTransform: "uppercase",
        borderRadius: 999,
        background: cfg.bg,
        color: cfg.color,
        border: `1px solid ${cfg.border}`,
        flexShrink: 0,
      }}
    >
      {cfg.label}
    </span>
  );
}

function Ticket({ ticket, index }: { ticket: AccuracyJudgeTicket; index: number }) {
  return (
    <div
      style={{
        paddingBottom: 10,
        marginBottom: 10,
        borderBottom: "1px solid var(--border-primary)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          marginBottom: 4,
        }}
      >
        <span style={{ fontSize: 10, color: "var(--text-tertiary)", flexShrink: 0 }}>
          #{index + 1}
        </span>
        <ActionBadge action={ticket.action} />
        {ticket.claim_id && (
          <code
            style={{
              fontSize: 10,
              color: "var(--text-tertiary)",
              background: "var(--bg-secondary)",
              padding: "1px 4px",
              borderRadius: 4,
              maxWidth: 120,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {ticket.claim_id}
          </code>
        )}
      </div>

      {/* The verbatim quote from the story */}
      <blockquote
        style={{
          margin: "0 0 4px",
          padding: "4px 8px",
          borderLeft: "3px solid var(--border-primary)",
          fontSize: 11.5,
          fontStyle: "italic",
          color: "var(--text-secondary)",
          lineHeight: 1.45,
        }}
      >
        &ldquo;{ticket.quote}&rdquo;
      </blockquote>

      {/* Reason */}
      <div style={{ fontSize: 11.5, color: "var(--text-secondary)", marginBottom: 3 }}>
        {ticket.reason}
      </div>

      {/* Suggested replacement */}
      {ticket.correction && (
        <div
          style={{
            fontSize: 11,
            padding: "3px 6px",
            borderRadius: 4,
            background: "#f0fdf4",
            color: "#15803d",
            border: "1px solid #bbf7d0",
          }}
        >
          <span style={{ fontWeight: 600 }}>Correction: </span>
          {ticket.correction}
        </div>
      )}
    </div>
  );
}

export function EvalTicketsPanel({ tickets }: { tickets: AccuracyJudgeTicket[] }) {
  if (!tickets || tickets.length === 0) return null;

  return (
    <div style={{ marginTop: 14 }}>
      <div
        style={{
          fontWeight: 600,
          fontSize: 12,
          marginBottom: 8,
          display: "flex",
          alignItems: "center",
          gap: 6,
        }}
      >
        Judge tickets
        <span
          style={{
            fontSize: 10,
            fontWeight: 500,
            padding: "1px 6px",
            borderRadius: 999,
            background: "rgba(193, 52, 27, 0.08)",
            color: "#c1341b",
            border: "1px solid rgba(193, 52, 27, 0.2)",
          }}
        >
          {tickets.length} issue{tickets.length > 1 ? "s" : ""}
        </span>
      </div>

      {tickets.map((ticket, i) => (
        <Ticket key={ticket.claim_id ?? i} ticket={ticket} index={i} />
      ))}
    </div>
  );
}

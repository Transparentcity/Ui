"use client";

import { TextDiff } from "@/components/eval/TextDiff";
import type { CorrectionAttempt } from "@/lib/apiClient";

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

function fieldLabel(field: string): string {
  return FIELD_LABELS[field] ?? field;
}

function AttemptBadge({ changedCount }: { changedCount: number }) {
  const corrected = changedCount > 0;
  return (
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
        ? `${changedCount} field${changedCount > 1 ? "s" : ""} changed`
        : "no changes"}
    </span>
  );
}

function ErrorList({
  errors,
  label = "Errors the judge reported",
}: {
  errors: string[];
  label?: string;
}) {
  if (errors.length === 0) return null;
  return (
    <div style={{ marginBottom: 10 }}>
      <div
        style={{
          fontSize: 11,
          fontWeight: 600,
          marginBottom: 4,
          color: "#c1341b",
        }}
      >
        {label}
      </div>
      <ol style={{ margin: 0, paddingLeft: 18, fontSize: 11.5, color: "#c1341b" }}>
        {errors.map((e, i) => (
          <li key={i} style={{ marginBottom: 3, lineHeight: 1.4 }}>
            {e}
          </li>
        ))}
      </ol>
    </div>
  );
}

function AttemptMeta({
  attemptedAt,
  sessionId,
}: {
  attemptedAt?: string | null;
  sessionId?: string | null;
}) {
  return (
    <div style={{ fontSize: 11, color: "var(--text-secondary)", marginBottom: 8 }}>
      {attemptedAt ? new Date(attemptedAt).toLocaleString() : "unknown time"}
      {sessionId && (
        <>
          {" "}
          · session <code style={{ fontSize: 10 }}>{sessionId.slice(0, 8)}</code>
        </>
      )}
    </div>
  );
}

/**
 * Auto-correction history for the eval sidebar.
 *
 * Each attempt renders as an inline word-level diff of the fields it changed.
 * `before` snapshots come from correction metadata; `after` is the current text
 * for the latest attempt. Earlier attempts in a chain only have their own
 * `before` snapshot, so their "after" is the next attempt's `before` (or the
 * current text for the most recent one).
 */
export function EvalCorrectionHistoryPanel({
  attemptedAt,
  sessionId,
  fields,
  errors,
  before,
  after,
  attempts,
  attemptCount,
}: {
  attemptedAt: string | null | undefined;
  sessionId?: string | null;
  fields?: string[] | null;
  errors?: string[] | null;
  before?: Record<string, string> | null;
  after?: Record<string, string> | null;
  /** Earlier attempts, oldest first. */
  attempts?: CorrectionAttempt[] | null;
  attemptCount?: number | null;
}) {
  if (!attemptedAt) return null;

  const latestFields = Array.isArray(fields) ? fields : [];
  const latestErrors = Array.isArray(errors) ? errors : [];
  const latestBefore = before ?? {};
  const currentText = after ?? {};
  const priorAttempts = (Array.isArray(attempts) ? attempts : []).filter(Boolean);

  const total = attemptCount ?? priorAttempts.length + 1;

  // For a prior attempt, the text it produced is whatever the following attempt
  // captured as its "before"; the last one hands off to the current text.
  const afterForAttempt = (index: number): Record<string, string> => {
    const next = priorAttempts[index + 1];
    if (next?.before) return next.before;
    return latestBefore && Object.keys(latestBefore).length > 0
      ? latestBefore
      : currentText;
  };

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
        ✦ Auto-correction history
        {total > 1 && (
          <span style={{ fontSize: 11, fontWeight: 500, color: "var(--text-secondary)" }}>
            {total} attempt{total > 1 ? "s" : ""}
          </span>
        )}
        <AttemptBadge changedCount={latestFields.length} />
      </div>

      {/* Top-level errors from the most recent correction — shown prominently
          even when the re-judge subsequently passed the story, so the admin
          can trace what was wrong before the fix was applied. */}
      {latestErrors.length > 0 && (
        <ErrorList errors={latestErrors} label="What the judge found wrong" />
      )}

      {priorAttempts.map((attempt, index) => {
        const attemptFields = Array.isArray(attempt.fields) ? attempt.fields : [];
        const attemptBefore = attempt.before ?? {};
        const attemptAfter = afterForAttempt(index);
        return (
          <div
            key={`${attempt.attempted_at ?? "attempt"}-${index}`}
            style={{
              marginBottom: 12,
              paddingLeft: 8,
              borderLeft: "2px solid var(--border, #e2e8f0)",
            }}
          >
            <div
              style={{
                fontSize: 11,
                fontWeight: 600,
                marginBottom: 2,
                display: "flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              Attempt {index + 1}
              <AttemptBadge changedCount={attemptFields.length} />
            </div>
            <AttemptMeta
              attemptedAt={attempt.attempted_at}
              sessionId={attempt.session_id}
            />
            <ErrorList
              errors={(Array.isArray(attempt.errors) ? attempt.errors : []).map(String)}
            />
            {attemptFields.map((field) => (
              <TextDiff
                key={field}
                label={fieldLabel(field)}
                before={attemptBefore[field] ?? ""}
                after={attemptAfter[field] ?? ""}
              />
            ))}
          </div>
        );
      })}

      <div
        style={
          priorAttempts.length > 0
            ? { paddingLeft: 8, borderLeft: "2px solid var(--accent, #2563eb)" }
            : undefined
        }
      >
        {priorAttempts.length > 0 && (
          <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 2 }}>
            Attempt {total} (latest)
          </div>
        )}
        <AttemptMeta attemptedAt={attemptedAt} sessionId={sessionId} />

        {latestFields.length > 0 ? (
          latestFields.map((field) => (
            <TextDiff
              key={field}
              label={fieldLabel(field)}
              before={latestBefore[field] ?? ""}
              after={currentText[field] ?? ""}
            />
          ))
        ) : (
          <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>
            Seymour reviewed the draft but made no changes.
          </div>
        )}
      </div>
    </div>
  );
}

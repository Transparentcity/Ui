"use client";

import { useEffect, useState } from "react";

import ThinkingTrace from "./ThinkingTrace";
import ToolCall, { type ToolCallData } from "./ToolCall";
import { describeToolCall } from "@/lib/chatToolLabels";
import styles from "./ReplyActivity.module.css";

export type ActivityStep =
  | { kind: "thinking"; content: string; isStreaming: boolean }
  | { kind: "tool"; toolName: string; toolCall: ToolCallData | null; running: boolean };

interface ReplyActivityProps {
  steps: ActivityStep[];
  isStreaming: boolean;
  /** What Seymour is doing right now; shown in the header while streaming. */
  activity?: string;
  /** Live elapsed time while streaming, or the span of the reply's events afterwards. */
  elapsedMs?: number | null;
}

/** 42000 -> "42s"; 102000 -> "1m 42s". */
export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

const CheckIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M20 6 9 17l-5-5" />
  </svg>
);

const ChevronIcon = ({ open }: { open: boolean }) => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {open ? <path d="M18 15l-6-6-6 6" /> : <path d="M6 9l6 6 6-6" />}
  </svg>
);

/**
 * One line above a reply that sums up the thinking and tool calls behind it:
 * expanded with live progress while the reply streams, collapsed to
 * "Worked for 42s · 3 steps" once it is done.
 */
export default function ReplyActivity({
  steps,
  isStreaming,
  activity,
  elapsedMs = null,
}: ReplyActivityProps) {
  const [open, setOpen] = useState(isStreaming);

  useEffect(() => {
    setOpen(isStreaming);
  }, [isStreaming]);

  if (!isStreaming && steps.length === 0) return null;

  const stepCount = steps.length;
  const stepsLabel = `${stepCount} ${stepCount === 1 ? "step" : "steps"}`;
  const duration = elapsedMs != null && elapsedMs >= 1000 ? formatDuration(elapsedMs) : null;
  const canToggle = stepCount > 0;

  const headerContent = isStreaming ? (
    <>
      <span className={styles.spinner} aria-hidden="true" />
      <span className={styles.text}>{activity || "Thinking"}</span>
      {elapsedMs != null && (
        <span className={styles.time}>{formatDuration(elapsedMs)}</span>
      )}
    </>
  ) : (
    <>
      <span className={styles.check}>
        <CheckIcon />
      </span>
      <span className={styles.text}>
        {duration ? `Worked for ${duration} · ${stepsLabel}` : stepsLabel}
      </span>
    </>
  );

  return (
    <div className={styles.activity}>
      {canToggle ? (
        <button
          type="button"
          className={`${styles.header} ${isStreaming ? styles.live : ""}`}
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
        >
          <span
            className={styles.headerContent}
            role={isStreaming ? "status" : undefined}
            aria-live={isStreaming ? "polite" : undefined}
          >
            {headerContent}
          </span>
          <span className={styles.chevron}>
            <ChevronIcon open={open} />
          </span>
        </button>
      ) : (
        <div className={`${styles.header} ${styles.headerStatic} ${styles.live}`} role="status" aria-live="polite">
          {headerContent}
        </div>
      )}
      {open && canToggle && (
        <div className={styles.steps}>
          {steps.map((step, idx) => {
            if (step.kind === "thinking") {
              return (
                <ThinkingTrace
                  key={`thinking-${idx}`}
                  content={step.content}
                  isStreaming={step.isStreaming}
                />
              );
            }
            if (step.toolCall) {
              return (
                <ToolCall
                  key={step.toolCall.tool_id || `tool-${idx}`}
                  toolCall={step.toolCall}
                  showEmbed={false}
                />
              );
            }
            if (step.running) {
              return (
                <div key={`running-${idx}`} className={styles.runningStep}>
                  <span className={styles.spinner} aria-hidden="true" />
                  {describeToolCall(step.toolName, true)}
                </div>
              );
            }
            return (
              <div key={`unfinished-${idx}`} className={styles.unfinishedStep}>
                {describeToolCall(step.toolName, true)}, not finished
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

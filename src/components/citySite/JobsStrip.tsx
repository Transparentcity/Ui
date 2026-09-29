"use client";

/**
 * JobsStrip — compact schedule health strip for CitySiteView.
 *
 * Shows four rows (Daily, Weekly, Monthly, Annual). Each row has:
 *   - Run dots (up to 8; green = ok, amber = partial, red = failed, grey = never)
 *   - A plain-language summary: "ran Sep 28, 40/40 ok"
 *   - A Details toggle that expands a run list with Logs links and re-run actions.
 */

import { useState } from "react";
import type { OpsCitySiteSchedule, OpsCitySiteScheduleRun } from "@/lib/apiClient";
import styles from "./CitySite.module.css";

// ── Color mapping ──────────────────────────────────────────────────────────

type DotColor = "ok" | "partial" | "failed" | "running" | "empty";

function runColor(run: OpsCitySiteScheduleRun): DotColor {
  const s = (run.status || "").toLowerCase();
  if (s === "completed" || s === "success") {
    if ((run.metrics_failed ?? 0) > 0) return "partial";
    return "ok";
  }
  if (s === "failed" || s === "cancelled" || s === "error") return "failed";
  if (s === "running" || s === "pending") return "running";
  return "partial";
}

const DOT_COLORS: Record<DotColor, string> = {
  ok:      "#10b981",
  partial: "#f59e0b",
  failed:  "#ef4444",
  running: "#3b82f6",
  empty:   "#d1d5db",
};

// ── Date helpers ───────────────────────────────────────────────────────────

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString();
}

// ── Sub-components ─────────────────────────────────────────────────────────

function RunDot({ run }: { run: OpsCitySiteScheduleRun | null }) {
  const color = run ? DOT_COLORS[runColor(run)] : DOT_COLORS.empty;
  const label = run
    ? `${run.status ?? "?"} · ${run.metrics_completed ?? "?"}/${run.metrics_total ?? "?"} metrics`
    : "No run";
  return (
    <span
      className={styles.runDot}
      style={{ background: color }}
      title={label}
    />
  );
}

function schedSummary(slot: OpsCitySiteSchedule): string {
  const last = slot.last_run;
  if (!last) return slot.is_overdue ? "Overdue — no run recorded" : "No runs in window";
  const date = fmtDate(last.created_at);
  const total = last.metrics_total ?? "?";
  const failed = last.metrics_failed ?? 0;
  if (failed > 0) {
    const ok = typeof total === "number" ? total - failed : "?";
    return `${date}, ${ok}/${total} ok · ${failed} failed`;
  }
  return `${date}, ${total}/${total} ok`;
}

interface RunDetailRowProps {
  run: OpsCitySiteScheduleRun;
  onReRunFailed?: (ids: number[]) => void;
  onViewJob?: (jobId: string) => void;
}

function RunDetailRow({ run, onReRunFailed, onViewJob }: RunDetailRowProps) {
  const color = DOT_COLORS[runColor(run)];
  return (
    <tr>
      <td style={{ whiteSpace: "nowrap" }}>{fmtDateTime(run.created_at)}</td>
      <td>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
          <span
            style={{
              width: 7, height: 7, borderRadius: "50%",
              background: color, display: "inline-block",
            }}
          />
          {run.status}
        </span>
      </td>
      <td>{run.metrics_completed ?? "—"}/{run.metrics_total ?? "—"}</td>
      <td>
        {run.failed_metric_names?.length
          ? run.failed_metric_names.slice(0, 3).join(", ") +
            (run.failed_metric_names.length > 3 ? "…" : "")
          : "—"}
      </td>
      <td style={{ whiteSpace: "nowrap" }}>
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
          {run.job_id && onViewJob && (
            <button
              type="button"
              className={styles.logsLink}
              onClick={() => onViewJob(run.job_id!)}
            >
              Logs
            </button>
          )}
          {run.failed_metric_ids && run.failed_metric_ids.length > 0 && onReRunFailed && (
            <button
              type="button"
              className={styles.reRunFailedBtn}
              onClick={() => onReRunFailed(run.failed_metric_ids!)}
              title="Re-run only the failed metrics"
            >
              Re-run {run.failed_metric_ids.length} failed
            </button>
          )}
        </div>
      </td>
    </tr>
  );
}

// ── Main ───────────────────────────────────────────────────────────────────

const SCHEDULE_LABELS: Record<string, string> = {
  daily_metrics:   "Daily",
  weekly_metrics:  "Weekly",
  monthly_metrics: "Monthly",
  annual_metrics:  "Annual",
};

interface JobsStripProps {
  schedules: Record<string, OpsCitySiteSchedule>;
  onReRunFailed?: (scheduleKey: string, ids: number[]) => void;
  onViewJob?: (jobId: string) => void;
  canManage?: boolean;
}

export default function JobsStrip({
  schedules,
  onReRunFailed,
  onViewJob,
  canManage,
}: JobsStripProps) {
  const [openDetail, setOpenDetail] = useState<string | null>(null);

  const keys = ["daily_metrics", "weekly_metrics", "monthly_metrics", "annual_metrics"];

  return (
    <div className={styles.jobsWrap}>
      <p className={styles.jobsTitle}>Jobs</p>
      <div className={styles.jobsSchedules}>
        {keys.map((key) => {
          const slot = schedules[key];
          if (!slot) return null;
          const runs = slot.recent_runs ?? [];
          const isOpen = openDetail === key;

          return (
            <div key={key}>
              <div className={styles.jobRow}>
                <span className={styles.schedLabel}>{SCHEDULE_LABELS[key] ?? key}</span>
                <div className={styles.runDots}>
                  {/* Show up to 8 dots, oldest left; pad with empty dots if fewer */}
                  {[...Array(8)].map((_, i) => {
                    const idx = runs.length - 8 + i;
                    const run = idx >= 0 ? runs[idx] : null;
                    return <RunDot key={i} run={run} />;
                  })}
                </div>
                <span className={styles.jobSummary}>{schedSummary(slot)}</span>
                {runs.length > 0 && (
                  <button
                    type="button"
                    className={styles.detailsBtn}
                    onClick={() => setOpenDetail(isOpen ? null : key)}
                  >
                    {isOpen ? "Hide" : "Details"}
                  </button>
                )}
              </div>

              {isOpen && (
                <div className={styles.jobDetail}>
                  <div className={styles.jobDetailHeader}>
                    <p className={styles.jobDetailTitle}>
                      Recent {SCHEDULE_LABELS[key]} runs
                    </p>
                    <button
                      type="button"
                      className={styles.closeBtn}
                      onClick={() => setOpenDetail(null)}
                    >
                      ×
                    </button>
                  </div>
                  <table className={styles.miniTable}>
                    <thead>
                      <tr>
                        <th>When</th>
                        <th>Status</th>
                        <th>Metrics</th>
                        <th>Failed</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {runs.map((r, i) => (
                        <RunDetailRow
                          key={r.job_id ?? i}
                          run={r}
                          onViewJob={onViewJob}
                          onReRunFailed={
                            canManage && onReRunFailed
                              ? (ids) => onReRunFailed(key, ids)
                              : undefined
                          }
                        />
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

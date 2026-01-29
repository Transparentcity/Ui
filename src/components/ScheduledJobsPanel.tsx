"use client";

import { useState } from "react";
import {
  ScheduledJobSummary,
  ScheduledJobRunSummary,
  runSchedule,
} from "@/lib/apiClient";
import { notifyJobCreated } from "@/lib/useJobWebSocket";
import Loader from "./Loader";
import styles from "./ScheduledJobsPanel.module.css";

interface ScheduledJobsPanelProps {
  scheduleSummaries: ScheduledJobSummary[];
  scheduleLoading: boolean;
  scheduleError: string | null;
  onRefresh: () => void;
  getAccessTokenSilently: () => Promise<string>;
  token: string | null;
}

export default function ScheduledJobsPanel({
  scheduleSummaries,
  scheduleLoading,
  scheduleError,
  onRefresh,
  getAccessTokenSilently,
  token,
}: ScheduledJobsPanelProps) {
  const [runningSchedule, setRunningSchedule] = useState<string | null>(null);
  const [removeAllInactive, setRemoveAllInactive] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const getStatusColor = (status: string): string => {
    switch (status) {
      case "completed":
        return "var(--success, #10b981)";
      case "failed":
        return "var(--error, #ef4444)";
      case "running":
        return "#3b82f6";
      case "pending":
        return "var(--warning, #f59e0b)";
      case "cancelled":
        return "var(--text-secondary, #6b7280)";
      default:
        return "var(--text-secondary, #6b7280)";
    }
  };

  const formatDate = (dateStr: string | null | undefined): string => {
    if (!dateStr) return "N/A";
    try {
      return new Date(dateStr).toLocaleString();
    } catch {
      return dateStr;
    }
  };

  const formatScheduleCounts = (run: ScheduledJobRunSummary | null | undefined) => {
    if (!run) return "No runs yet";
    if (run.metrics_total !== undefined && run.metrics_total !== null) {
      const completed = run.metrics_completed ?? 0;
      const failed = run.metrics_failed ?? 0;
      return `${completed} succeeded, ${failed} failed (${run.metrics_total} total)`;
    }
    if (run.city_count !== undefined && run.city_count !== null) {
      if (run.cities_succeeded !== null && run.cities_succeeded !== undefined) {
        return `${run.cities_succeeded} succeeded, ${run.cities_failed ?? 0} failed (${run.city_count} cities)`;
      }
      return `${run.city_count} cities`;
    }
    if (run.datasets_indexed !== undefined && run.datasets_indexed !== null) {
      return `${run.datasets_indexed} datasets indexed`;
    }
    if (run.time_series_deleted !== undefined || run.anomalies_deleted !== undefined) {
      const tsDeleted = run.time_series_deleted ?? 0;
      const anomaliesDeleted = run.anomalies_deleted ?? 0;
      const total = tsDeleted + anomaliesDeleted;
      const modeLabel = run.remove_all_inactive ? " (all inactive)" : "";
      if (total === 0) {
        return `No inactive records to remove${modeLabel}`;
      }
      return `${tsDeleted} time series, ${anomaliesDeleted} anomalies removed${modeLabel}`;
    }
    return "Run completed";
  };

  const handleRunSchedule = async (scheduleKey: string, scheduleLabel: string) => {
    if (runningSchedule) return;

    try {
      setRunningSchedule(scheduleKey);
      setLocalError(null);
      const currentToken = token || (await getAccessTokenSilently());

      const request: { schedule_key: string; remove_all_inactive?: boolean } = {
        schedule_key: scheduleKey,
      };
      if (scheduleKey === "database_cleanup" && removeAllInactive) {
        request.remove_all_inactive = true;
      }

      const response = await runSchedule(request, currentToken);

      if (response?.result?.results) {
        for (const result of response.result.results) {
          if (result.job_id) {
            notifyJobCreated(result.job_id);
          }
        }
      }

      setTimeout(() => {
        onRefresh();
      }, 1000);
    } catch (err) {
      console.error(`Error running schedule ${scheduleKey}:`, err);
      setLocalError(`Failed to run ${scheduleLabel}. Please try again.`);
    } finally {
      setRunningSchedule(null);
    }
  };

  const displayError = localError || scheduleError;

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div className={styles.headerContent}>
          <h3 className={styles.title}>Scheduled Jobs</h3>
          <p className={styles.subtitle}>
            Automated jobs that run on a schedule. Click the play button to trigger a manual run.
          </p>
        </div>
        {scheduleLoading && (
          <div className={styles.headerLoader}>
            <Loader size="sm" color="purple" />
          </div>
        )}
      </div>

      {displayError && (
        <div className={styles.error}>{displayError}</div>
      )}

      {!scheduleLoading && scheduleSummaries.length === 0 && !displayError && (
        <div className={styles.empty}>
          <p>No scheduled jobs configured.</p>
        </div>
      )}

      <div className={styles.grid}>
        {scheduleSummaries.map((schedule) => {
          const lastRun = schedule.last_run;
          const statusColor = lastRun?.status
            ? getStatusColor(lastRun.status)
            : "var(--text-secondary, #6b7280)";

          return (
            <div key={schedule.key} className={styles.card}>
              <div className={styles.cardHeader}>
                <div className={styles.cardTitleGroup}>
                  <span className={styles.cardLabel}>{schedule.label}</span>
                  <span className={styles.cardCadence}>{schedule.cadence}</span>
                </div>
                <span
                  className={styles.cardStatus}
                  style={{ color: statusColor }}
                >
                  {lastRun?.status || "not run"}
                </span>
              </div>

              <p className={styles.cardDescription}>{schedule.description}</p>

              {schedule.key === "database_cleanup" && (
                <label className={styles.cleanupOption}>
                  <input
                    type="checkbox"
                    checked={removeAllInactive}
                    onChange={(e) => setRemoveAllInactive(e.target.checked)}
                    disabled={runningSchedule !== null}
                  />
                  <span>Remove all inactive (space recovery)</span>
                </label>
              )}

              <div className={styles.cardCounts}>
                {formatScheduleCounts(lastRun)}
              </div>

              {lastRun?.created_at && (
                <div className={styles.cardMeta}>
                  Last run: {formatDate(lastRun.created_at)}
                </div>
              )}

              {schedule.recent_runs?.length > 0 && (
                <div className={styles.recentRuns}>
                  {schedule.recent_runs.map((run) => (
                    <div key={run.job_id} className={styles.runRow}>
                      <span className={styles.runCity}>
                        {run.city_name || "All cities"}
                      </span>
                      <span className={styles.runCounts}>
                        {formatScheduleCounts(run)}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              <button
                className={styles.runButton}
                onClick={(e) => {
                  e.stopPropagation();
                  handleRunSchedule(schedule.key, schedule.label);
                }}
                disabled={runningSchedule !== null}
                title={`Run ${schedule.label} now`}
              >
                {runningSchedule === schedule.key ? (
                  <Loader size="sm" color="purple" />
                ) : (
                  "▶"
                )}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

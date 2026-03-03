"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ScheduledJobSummary,
  ScheduledJobRunSummary,
  runSchedule,
  CustomScheduledJob,
  updateCustomScheduledJob,
  pauseCustomScheduledJob,
  resumeCustomScheduledJob,
  runCustomScheduledJob,
} from "@/lib/apiClient";
import { notifyJobCreated } from "@/lib/useJobWebSocket";
import Loader from "./Loader";
import styles from "./ScheduledJobsPanel.module.css";

interface ScheduledJobsPanelProps {
  scheduleSummaries: ScheduledJobSummary[];
  customSchedules: CustomScheduledJob[];
  scheduleLoading: boolean;
  scheduleError: string | null;
  onRefresh: () => void;
  getAccessTokenSilently: () => Promise<string>;
  token: string | null;
}

export default function ScheduledJobsPanel({
  scheduleSummaries,
  customSchedules,
  scheduleLoading,
  scheduleError,
  onRefresh,
  getAccessTokenSilently,
  token,
}: ScheduledJobsPanelProps) {
  const [runningSchedule, setRunningSchedule] = useState<string | null>(null);
  const [removeAllInactive, setRemoveAllInactive] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [runSuccessMessage, setRunSuccessMessage] = useState<{ jobId: string; jobName: string } | null>(null);
  const [runningCustomJobId, setRunningCustomJobId] = useState<number | null>(null);

  const [editJob, setEditJob] = useState<CustomScheduledJob | null>(null);
  const [editForm, setEditForm] = useState<{
    schedule_type: string;
    schedule_hour: string;
    schedule_minute: string;
    schedule_day_of_week: string;
    schedule_day_of_month: string;
    timezone: string;
    max_concurrent_cities: string;
    per_city_concurrency: string;
    cron_expression: string;
    question: string;
  } | null>(null);

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

  const openEdit = (job: CustomScheduledJob) => {
    setEditJob(job);
    setEditForm({
      schedule_type: job.schedule_type || "daily",
      schedule_hour: job.schedule_hour !== null && job.schedule_hour !== undefined ? String(job.schedule_hour) : "",
      schedule_minute: job.schedule_minute !== null && job.schedule_minute !== undefined ? String(job.schedule_minute) : "0",
      schedule_day_of_week: job.schedule_day_of_week !== null && job.schedule_day_of_week !== undefined ? String(job.schedule_day_of_week) : "0",
      schedule_day_of_month: job.schedule_day_of_month !== null && job.schedule_day_of_month !== undefined ? String(job.schedule_day_of_month) : "1",
      timezone: job.timezone || "UTC",
      max_concurrent_cities: job.max_concurrent_cities !== null && job.max_concurrent_cities !== undefined ? String(job.max_concurrent_cities) : "2",
      per_city_concurrency: job.per_city_concurrency !== null && job.per_city_concurrency !== undefined ? String(job.per_city_concurrency) : "2",
      cron_expression: job.cron_expression || "",
      question: job.job_config?.question || "",
    });
  };

  const closeEdit = () => {
    setEditJob(null);
    setEditForm(null);
  };

  const handleSaveEdit = async () => {
    if (!editJob || !editForm) return;
    try {
      setLocalError(null);
      const currentToken = token || (await getAccessTokenSilently());

      const scheduleType = editForm.schedule_type;
      const payload: any = {
        schedule_type: scheduleType,
        timezone: editForm.timezone || "UTC",
        max_concurrent_cities: Number(editForm.max_concurrent_cities || "2"),
        per_city_concurrency: Number(editForm.per_city_concurrency || "2"),
      };

      if (scheduleType === "cron") {
        payload.cron_expression = editForm.cron_expression || null;
      } else if (scheduleType === "hourly") {
        payload.schedule_minute = Number(editForm.schedule_minute || "0");
      } else if (scheduleType === "daily") {
        payload.schedule_hour = Number(editForm.schedule_hour || "0");
        payload.schedule_minute = Number(editForm.schedule_minute || "0");
      } else if (scheduleType === "weekly") {
        payload.schedule_day_of_week = Number(editForm.schedule_day_of_week || "0");
        payload.schedule_hour = Number(editForm.schedule_hour || "0");
        payload.schedule_minute = Number(editForm.schedule_minute || "0");
      } else if (scheduleType === "monthly") {
        payload.schedule_day_of_month = Number(editForm.schedule_day_of_month || "1");
        payload.schedule_hour = Number(editForm.schedule_hour || "0");
        payload.schedule_minute = Number(editForm.schedule_minute || "0");
      }

      const originalQuestion = editJob.job_config?.question ?? "";
      if (editForm.question !== originalQuestion) {
        payload.job_config = { ...editJob.job_config, question: editForm.question };
      }

      await updateCustomScheduledJob(editJob.id, payload, currentToken);
      closeEdit();
      onRefresh();
    } catch (err) {
      console.error("Error updating custom scheduled job:", err);
      setLocalError("Failed to update scheduled job. Please try again.");
    }
  };

  const handleRunCustomJob = async (job: CustomScheduledJob) => {
    if (runningCustomJobId !== null) return;
    try {
      setRunningCustomJobId(job.id);
      setLocalError(null);
      setRunSuccessMessage(null);
      const currentToken = token || (await getAccessTokenSilently());
      const res = await runCustomScheduledJob(job.id, currentToken);
      if (res?.status === "skipped") {
        setLocalError(res?.message ?? "Job was skipped (e.g. not active). Resume it first to run.");
        return;
      }
      if (res?.job_id) {
        notifyJobCreated(String(res.job_id));
        setRunSuccessMessage({ jobId: res.job_id, jobName: job.name });
        setTimeout(() => setRunSuccessMessage(null), 8000);
      }
      setTimeout(() => onRefresh(), 1000);
    } catch (err) {
      console.error("Error running custom scheduled job:", err);
      setLocalError("Failed to run custom scheduled job. Please try again.");
    } finally {
      setRunningCustomJobId(null);
    }
  };

  const handleToggleCustomJob = async (job: CustomScheduledJob) => {
    try {
      setLocalError(null);
      const currentToken = token || (await getAccessTokenSilently());
      if (job.status === "active") {
        await pauseCustomScheduledJob(job.id, currentToken);
      } else if (job.status === "paused") {
        await resumeCustomScheduledJob(job.id, currentToken);
      }
      onRefresh();
    } catch (err) {
      console.error("Error toggling custom scheduled job:", err);
      setLocalError("Failed to update job status. Please try again.");
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div className={styles.headerContent}>
          <h3 className={styles.title}>Scheduled Jobs</h3>
          <p className={styles.subtitle}>
            System schedules are built-in; custom schedules are editable. Click ▶ to trigger a manual run.
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

      {runSuccessMessage && (
        <div className={styles.successMessage}>
          <span>
            <strong>{runSuccessMessage.jobName}</strong> run started.{" "}
            <Link
              href={`/dashboard?tab=logs&job_id=${encodeURIComponent(runSuccessMessage.jobId)}`}
              className={styles.viewRunLink}
            >
              View in Job Logs
            </Link>
          </span>
        </div>
      )}

      {!scheduleLoading &&
        scheduleSummaries.length === 0 &&
        customSchedules.length === 0 &&
        !displayError && (
        <div className={styles.empty}>
          <p>No scheduled jobs configured.</p>
        </div>
      )}

      {customSchedules.length > 0 && (
        <div className={styles.section}>
          <div className={styles.sectionHeader}>
            <h4 className={styles.sectionTitle}>Custom schedules</h4>
            <div className={styles.sectionHint}>
              Editable schedules managed in the database.
            </div>
          </div>
          <div className={styles.grid}>
            {customSchedules.map((job) => (
              <div key={job.id} className={styles.card}>
                <div className={styles.cardHeader}>
                  <div className={styles.cardTitleGroup}>
                    <span className={styles.cardLabel}>{job.name}</span>
                    <span className={styles.cardCadence}>
                      {job.schedule_description || job.schedule_type}
                    </span>
                  </div>
                  <span
                    className={styles.cardStatus}
                    style={{ color: getStatusColor(job.status) }}
                    title="Schedule status (active/paused)"
                  >
                    {job.status}
                  </span>
                </div>

                <p className={styles.cardDescription}>{job.description || ""}</p>

                <div className={styles.customMeta}>
                  <div>
                    <span className={styles.metaLabel}>Job type</span> {job.job_type}
                  </div>
                  <div>
                    <span className={styles.metaLabel}>Concurrency</span>{" "}
                    {job.max_concurrent_cities ?? 2} cities, {job.per_city_concurrency ?? 2} per city
                  </div>
                  <div>
                    <span className={styles.metaLabel}>Next run</span>{" "}
                    {job.next_run_at ? formatDate(job.next_run_at) : "N/A"}
                  </div>
                  <div>
                    <span className={styles.metaLabel}>Last run</span>{" "}
                    {job.last_run_at ? formatDate(job.last_run_at) : "Never"}
                    {job.last_run_status && (
                      <>
                        {" · "}
                        <span
                          className={styles.lastRunStatus}
                          style={{ color: getStatusColor(job.last_run_status) }}
                        >
                          {job.last_run_status}
                        </span>
                        {job.last_run_job_id && (
                          <>
                            {" · "}
                            <Link
                              href={`/dashboard?tab=logs&job_id=${encodeURIComponent(job.last_run_job_id)}`}
                              className={styles.viewRunLink}
                            >
                              View run
                            </Link>
                          </>
                        )}
                      </>
                    )}
                  </div>
                </div>

                <div className={styles.actionsRow}>
                  <button
                    className={styles.secondaryButton}
                    onClick={() => openEdit(job)}
                  >
                    Edit
                  </button>
                  <button
                    className={styles.secondaryButton}
                    onClick={() => handleToggleCustomJob(job)}
                    disabled={job.status === "disabled"}
                  >
                    {job.status === "active" ? "Pause" : job.status === "paused" ? "Resume" : "Disabled"}
                  </button>
                  <button
                    className={styles.runButton}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleRunCustomJob(job);
                    }}
                    disabled={runningCustomJobId !== null}
                    title={`Run ${job.name} now`}
                  >
                    {runningCustomJobId === job.id ? (
                      <Loader size="sm" color="purple" />
                    ) : (
                      "▶"
                    )}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {scheduleSummaries.length > 0 && (
        <div className={styles.section}>
          <div className={styles.sectionHeader}>
            <h4 className={styles.sectionTitle}>System schedules</h4>
            <div className={styles.sectionHint}>Built-in schedules (not editable).</div>
          </div>
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

      {editJob && editForm && (
        <div className={styles.modalOverlay} onClick={closeEdit}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <div className={styles.modalTitle}>Edit: {editJob.name}</div>
              <button className={styles.iconButton} onClick={closeEdit}>
                ✕
              </button>
            </div>

            {editJob.job_config?.question != null && (
              <div className={styles.formRow}>
                <label className={styles.label}>Research prompt</label>
                <p className={styles.promptVariablesNote}>
                  Prompt variables (replaced at run time):{" "}
                  <code>{`{last_run}`}</code> — date/time of the previous run, or &quot;Never&quot; if first run;{" "}
                  <code>{`{now}`}</code> — date/time of this run. Use these to refer to time since last run (e.g. &quot;What changed since {`{last_run}`}?&quot;).
                </p>
                <textarea
                  className={styles.promptInput}
                  value={editForm.question}
                  onChange={(e) =>
                    setEditForm({ ...editForm, question: e.target.value })
                  }
                  rows={14}
                  spellCheck={false}
                  aria-label="Research prompt"
                />
              </div>
            )}

            <div className={styles.formRow}>
              <label className={styles.label}>Schedule type</label>
              <select
                className={styles.input}
                value={editForm.schedule_type}
                onChange={(e) =>
                  setEditForm({ ...editForm, schedule_type: e.target.value })
                }
              >
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
                <option value="hourly">Hourly</option>
                <option value="cron">Cron</option>
              </select>
            </div>

            {editForm.schedule_type === "cron" && (
              <div className={styles.formRow}>
                <label className={styles.label}>Cron expression</label>
                <input
                  className={styles.input}
                  value={editForm.cron_expression}
                  onChange={(e) =>
                    setEditForm({ ...editForm, cron_expression: e.target.value })
                  }
                  placeholder="0 3 * * *"
                />
              </div>
            )}

            {editForm.schedule_type !== "cron" && (
              <>
                {(editForm.schedule_type === "daily" ||
                  editForm.schedule_type === "weekly" ||
                  editForm.schedule_type === "monthly") && (
                  <div className={styles.formRowSplit}>
                    <div className={styles.formRow}>
                      <label className={styles.label}>Hour (0-23)</label>
                      <input
                        className={styles.input}
                        value={editForm.schedule_hour}
                        onChange={(e) =>
                          setEditForm({ ...editForm, schedule_hour: e.target.value })
                        }
                      />
                    </div>
                    <div className={styles.formRow}>
                      <label className={styles.label}>Minute (0-59)</label>
                      <input
                        className={styles.input}
                        value={editForm.schedule_minute}
                        onChange={(e) =>
                          setEditForm({ ...editForm, schedule_minute: e.target.value })
                        }
                      />
                    </div>
                  </div>
                )}

                {editForm.schedule_type === "hourly" && (
                  <div className={styles.formRow}>
                    <label className={styles.label}>Minute (0-59)</label>
                    <input
                      className={styles.input}
                      value={editForm.schedule_minute}
                      onChange={(e) =>
                        setEditForm({ ...editForm, schedule_minute: e.target.value })
                      }
                    />
                  </div>
                )}

                {editForm.schedule_type === "weekly" && (
                  <div className={styles.formRow}>
                    <label className={styles.label}>Day of week (0=Sunday)</label>
                    <input
                      className={styles.input}
                      value={editForm.schedule_day_of_week}
                      onChange={(e) =>
                        setEditForm({ ...editForm, schedule_day_of_week: e.target.value })
                      }
                    />
                  </div>
                )}

                {editForm.schedule_type === "monthly" && (
                  <div className={styles.formRow}>
                    <label className={styles.label}>Day of month (1-31)</label>
                    <input
                      className={styles.input}
                      value={editForm.schedule_day_of_month}
                      onChange={(e) =>
                        setEditForm({ ...editForm, schedule_day_of_month: e.target.value })
                      }
                    />
                  </div>
                )}
              </>
            )}

            <div className={styles.formRow}>
              <label className={styles.label}>Timezone</label>
              <input
                className={styles.input}
                value={editForm.timezone}
                onChange={(e) => setEditForm({ ...editForm, timezone: e.target.value })}
                placeholder="UTC"
              />
            </div>

            <div className={styles.formRowSplit}>
              <div className={styles.formRow}>
                <label className={styles.label}>Max concurrent cities</label>
                <input
                  className={styles.input}
                  value={editForm.max_concurrent_cities}
                  onChange={(e) =>
                    setEditForm({ ...editForm, max_concurrent_cities: e.target.value })
                  }
                />
              </div>
              <div className={styles.formRow}>
                <label className={styles.label}>Per-city concurrency</label>
                <input
                  className={styles.input}
                  value={editForm.per_city_concurrency}
                  onChange={(e) =>
                    setEditForm({ ...editForm, per_city_concurrency: e.target.value })
                  }
                />
              </div>
            </div>

            <div className={styles.modalFooter}>
              <button className={styles.secondaryButton} onClick={closeEdit}>
                Cancel
              </button>
              <button className={styles.primaryButton} onClick={handleSaveEdit}>
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

"use client";

import { useAuth0 } from "@auth0/auth0-react";
import { useEffect, useState } from "react";
import { Job, listJobs, getJob, getJobStats, JobStats } from "@/lib/apiClient";
import styles from "./JobLogsViewer.module.css";

export default function JobLogsViewer() {
  const { getAccessTokenSilently } = useAuth0();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<JobStats | null>(null);
  const [filterStatus, setFilterStatus] = useState<string>("");
  const [filterType, setFilterType] = useState<string>("");
  const [autoRefresh, setAutoRefresh] = useState(false);

  const loadJobs = async () => {
    try {
      setError(null);
      const token = await getAccessTokenSilently();
      const response = await listJobs(token, 100, filterStatus || undefined);
      setJobs(response.jobs);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load jobs");
      console.error("Error loading jobs:", err);
    } finally {
      setLoading(false);
    }
  };

  const loadStats = async () => {
    try {
      const token = await getAccessTokenSilently();
      const response = await getJobStats(token);
      setStats(response.stats);
    } catch (err) {
      console.error("Error loading job stats:", err);
    }
  };

  const loadJobDetails = async (jobId: string) => {
    try {
      const token = await getAccessTokenSilently();
      const job = await getJob(jobId, token);
      setSelectedJob(job);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load job details");
      console.error("Error loading job details:", err);
    }
  };

  useEffect(() => {
    loadJobs();
    loadStats();
  }, [filterStatus]);

  useEffect(() => {
    if (!autoRefresh) return;

    const interval = setInterval(() => {
      loadJobs();
      loadStats();
      if (selectedJob && (selectedJob.status === "pending" || selectedJob.status === "running")) {
        loadJobDetails(selectedJob.job_id);
      }
    }, 5000); // Refresh every 5 seconds

    return () => clearInterval(interval);
  }, [autoRefresh, selectedJob]);

  const formatDuration = (seconds: number | null | undefined): string => {
    if (!seconds) return "N/A";
    if (seconds < 60) return `${seconds.toFixed(1)}s`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${(seconds % 60).toFixed(0)}s`;
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return `${hours}h ${minutes}m`;
  };

  const formatDate = (dateStr: string | null | undefined): string => {
    if (!dateStr) return "N/A";
    try {
      return new Date(dateStr).toLocaleString();
    } catch {
      return dateStr;
    }
  };

  const getStatusColor = (status: string): string => {
    switch (status) {
      case "completed":
        return "#10b981"; // green
      case "failed":
        return "#ef4444"; // red
      case "running":
        return "#3b82f6"; // blue
      case "pending":
        return "#f59e0b"; // amber
      case "cancelled":
        return "#6b7280"; // gray
      default:
        return "#6b7280";
    }
  };

  const filteredJobs = jobs.filter((job) => {
    if (filterType && job.job_type !== filterType) return false;
    return true;
  });

  const jobTypes = Array.from(new Set(jobs.map((j) => j.job_type))).sort();

  if (loading && jobs.length === 0) {
    return (
      <div className={styles.container}>
        <div className={styles.loading}>Loading jobs...</div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h2>Job Logs</h2>
        <div className={styles.headerActions}>
          <label className={styles.autoRefreshLabel}>
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
            />
            Auto-refresh
          </label>
          <button onClick={loadJobs} className={styles.refreshButton}>
            Refresh
          </button>
        </div>
      </div>

      {stats && (
        <div className={styles.stats}>
          <div className={styles.statItem}>
            <span className={styles.statLabel}>Total:</span>
            <span className={styles.statValue}>{stats.total}</span>
          </div>
          <div className={styles.statItem}>
            <span className={styles.statLabel}>Active:</span>
            <span className={styles.statValue}>{stats.active_count}</span>
          </div>
          <div className={styles.statItem}>
            <span className={styles.statLabel}>Completed:</span>
            <span className={styles.statValue}>{stats.completed_count}</span>
          </div>
          <div className={styles.statItem}>
            <span className={styles.statLabel}>Failed:</span>
            <span className={styles.statValue} style={{ color: "#ef4444" }}>
              {stats.failed_count}
            </span>
          </div>
        </div>
      )}

      {error && <div className={styles.error}>{error}</div>}

      <div className={styles.filters}>
        <div className={styles.filterGroup}>
          <label>Status:</label>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className={styles.filterSelect}
          >
            <option value="">All</option>
            <option value="pending">Pending</option>
            <option value="running">Running</option>
            <option value="completed">Completed</option>
            <option value="failed">Failed</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </div>
        <div className={styles.filterGroup}>
          <label>Type:</label>
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            className={styles.filterSelect}
          >
            <option value="">All</option>
            {jobTypes.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className={styles.content}>
        <div className={styles.jobList}>
          <div className={styles.jobListHeader}>
            <h3>Jobs ({filteredJobs.length})</h3>
          </div>
          <div className={styles.jobListContent}>
            {filteredJobs.length === 0 ? (
              <div className={styles.empty}>No jobs found</div>
            ) : (
              filteredJobs.map((job) => (
                <div
                  key={job.job_id}
                  className={`${styles.jobItem} ${
                    selectedJob?.job_id === job.job_id ? styles.jobItemSelected : ""
                  }`}
                  onClick={() => loadJobDetails(job.job_id)}
                >
                  <div className={styles.jobItemHeader}>
                    <div className={styles.jobItemTitle}>
                      <span
                        className={styles.statusDot}
                        style={{ backgroundColor: getStatusColor(job.status) }}
                      />
                      <span className={styles.jobType}>{job.job_type}</span>
                    </div>
                    <span className={styles.jobStatus}>{job.status}</span>
                  </div>
                  <div className={styles.jobItemDescription}>{job.description}</div>
                  <div className={styles.jobItemMeta}>
                    <span>{formatDate(job.created_at)}</span>
                    {job.status === "running" && (
                      <span className={styles.progress}>{job.progress}%</span>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className={styles.jobDetails}>
          {selectedJob ? (
            <>
              <div className={styles.jobDetailsHeader}>
                <h3>Job Details</h3>
                <button
                  onClick={() => setSelectedJob(null)}
                  className={styles.closeButton}
                >
                  ×
                </button>
              </div>
              <div className={styles.jobDetailsContent}>
                <div className={styles.detailSection}>
                  <h4>Basic Information</h4>
                  <div className={styles.detailGrid}>
                    <div className={styles.detailItem}>
                      <span className={styles.detailLabel}>Job ID:</span>
                      <span className={styles.detailValue}>{selectedJob.job_id}</span>
                    </div>
                    <div className={styles.detailItem}>
                      <span className={styles.detailLabel}>Type:</span>
                      <span className={styles.detailValue}>{selectedJob.job_type}</span>
                    </div>
                    <div className={styles.detailItem}>
                      <span className={styles.detailLabel}>Status:</span>
                      <span
                        className={styles.detailValue}
                        style={{ color: getStatusColor(selectedJob.status) }}
                      >
                        {selectedJob.status}
                      </span>
                    </div>
                    <div className={styles.detailItem}>
                      <span className={styles.detailLabel}>Progress:</span>
                      <span className={styles.detailValue}>{selectedJob.progress}%</span>
                    </div>
                    <div className={styles.detailItem}>
                      <span className={styles.detailLabel}>Created:</span>
                      <span className={styles.detailValue}>
                        {formatDate(selectedJob.created_at)}
                      </span>
                    </div>
                    <div className={styles.detailItem}>
                      <span className={styles.detailLabel}>Started:</span>
                      <span className={styles.detailValue}>
                        {formatDate(selectedJob.started_at)}
                      </span>
                    </div>
                    <div className={styles.detailItem}>
                      <span className={styles.detailLabel}>Completed:</span>
                      <span className={styles.detailValue}>
                        {formatDate(selectedJob.completed_at)}
                      </span>
                    </div>
                    <div className={styles.detailItem}>
                      <span className={styles.detailLabel}>Duration:</span>
                      <span className={styles.detailValue}>
                        {formatDuration(selectedJob.duration_seconds)}
                      </span>
                    </div>
                  </div>
                </div>

                {selectedJob.status_message && (
                  <div className={styles.detailSection}>
                    <h4>Status Message</h4>
                    <div className={styles.statusMessage}>{selectedJob.status_message}</div>
                  </div>
                )}

                {selectedJob.error_message && (
                  <div className={styles.detailSection}>
                    <h4>Error Message</h4>
                    <div className={styles.errorMessage}>{selectedJob.error_message}</div>
                  </div>
                )}

                {selectedJob.job_metadata && Object.keys(selectedJob.job_metadata).length > 0 && (
                  <div className={styles.detailSection}>
                    <h4>Metadata</h4>
                    <pre className={styles.metadata}>
                      {JSON.stringify(selectedJob.job_metadata, null, 2)}
                    </pre>
                  </div>
                )}

                {selectedJob.logs && selectedJob.logs.length > 0 && (
                  <div className={styles.detailSection}>
                    <h4>Event Log ({selectedJob.logs.length} entries)</h4>
                    <div className={styles.logsContainer}>
                      {selectedJob.logs.map((log, index) => {
                        const isError = log.includes("ERROR") || log.includes("FATAL");
                        return (
                          <div
                            key={index}
                            className={`${styles.logEntry} ${isError ? styles.logEntryError : ""}`}
                          >
                            {log}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {selectedJob.result && (
                  <div className={styles.detailSection}>
                    <h4>Result</h4>
                    <pre className={styles.result}>
                      {JSON.stringify(selectedJob.result, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className={styles.noSelection}>Select a job to view details</div>
          )}
        </div>
      </div>
    </div>
  );
}


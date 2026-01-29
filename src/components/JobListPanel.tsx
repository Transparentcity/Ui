"use client";

import { useState, useEffect, useRef } from "react";
import { Job, getJob, JobStats } from "@/lib/apiClient";
import { useJobWebSocketContext } from "@/contexts/JobWebSocketContext";
import type { Job as WebSocketJob } from "@/lib/useJobWebSocket";
import Loader from "./Loader";
import styles from "./JobListPanel.module.css";

interface JobListPanelProps {
  stats: JobStats | null;
  getAccessTokenSilently: () => Promise<string>;
  token: string | null;
}

export default function JobListPanel({
  stats,
  getAccessTokenSilently,
  token,
}: JobListPanelProps) {
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<string>("");
  const [filterType, setFilterType] = useState<string>("");
  const selectedJobRef = useRef<Job | null>(null);

  const { jobs: webSocketJobs, isConnected } = useJobWebSocketContext();

  const calculateDuration = (
    started_at: string | null | undefined,
    completed_at: string | null | undefined
  ): number | null => {
    if (!started_at || !completed_at) return null;
    try {
      const startTime = new Date(started_at).getTime();
      const endTime = new Date(completed_at).getTime();
      if (!isNaN(startTime) && !isNaN(endTime) && endTime >= startTime) {
        return (endTime - startTime) / 1000;
      }
    } catch (error) {
      console.warn("Failed to calculate duration:", error);
    }
    return null;
  };

  const jobs: Job[] = webSocketJobs
    .filter((job) => {
      if (filterStatus && job.status !== filterStatus) return false;
      return true;
    })
    .map((wsJob: WebSocketJob) => ({
      job_id: wsJob.job_id,
      job_type: wsJob.job_type || "unknown",
      status: wsJob.status,
      description: wsJob.description,
      status_message: wsJob.status_message,
      progress: wsJob.progress,
      created_at: wsJob.created_at,
      started_at: wsJob.started_at || null,
      completed_at: wsJob.completed_at || null,
      error_message: wsJob.error || null,
      duration_seconds: calculateDuration(wsJob.started_at, wsJob.completed_at),
      logs: [],
      result: null,
      job_metadata: {},
    }));

  const loadJobDetails = async (jobId: string) => {
    try {
      const currentToken = token || (await getAccessTokenSilently());
      const job = await getJob(jobId, currentToken);
      if (!job.duration_seconds && job.started_at && job.completed_at) {
        job.duration_seconds = calculateDuration(job.started_at, job.completed_at);
      }
      setSelectedJob(job);
      selectedJobRef.current = job;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load job details");
      console.error("Error loading job details:", err);
    } finally {
      setDetailsLoading(false);
    }
  };

  const handleJobClick = (jobId: string) => {
    const cachedJob = jobs.find((j) => j.job_id === jobId);

    if (cachedJob) {
      setSelectedJob(cachedJob);
      selectedJobRef.current = cachedJob;

      const needsFullDetails =
        cachedJob.status === "completed" ||
        cachedJob.status === "failed" ||
        cachedJob.status === "cancelled" ||
        !cachedJob.logs ||
        cachedJob.logs.length === 0;

      if (needsFullDetails) {
        setDetailsLoading(true);
        loadJobDetails(jobId);
      }
    } else {
      setDetailsLoading(true);
      loadJobDetails(jobId);
    }
  };

  useEffect(() => {
    if (selectedJobRef.current) {
      const updatedJob = webSocketJobs.find(
        (job) => job.job_id === selectedJobRef.current?.job_id
      );
      if (updatedJob) {
        if (isConnected) {
          setSelectedJob((prev) => {
            if (prev && prev.job_id === updatedJob.job_id) {
              const calculatedDuration = calculateDuration(
                updatedJob.started_at,
                updatedJob.completed_at
              );
              return {
                ...prev,
                status: updatedJob.status,
                progress: updatedJob.progress,
                status_message: updatedJob.status_message,
                started_at: updatedJob.started_at || null,
                completed_at: updatedJob.completed_at || null,
                error_message: updatedJob.error || null,
                duration_seconds: calculatedDuration ?? prev.duration_seconds,
              };
            }
            return prev;
          });

          if (
            updatedJob.status === "completed" ||
            updatedJob.status === "failed" ||
            updatedJob.status === "cancelled"
          ) {
            loadJobDetails(updatedJob.job_id);
          }
        }
      }
    }
  }, [webSocketJobs, isConnected]);

  const formatDuration = (seconds: number | null | undefined): string => {
    if (!seconds) return "N/A";
    if (seconds < 60) return `${seconds.toFixed(1)}s`;
    if (seconds < 3600)
      return `${Math.floor(seconds / 60)}m ${(seconds % 60).toFixed(0)}s`;
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

  const filteredJobs = jobs
    .filter((job) => {
      if (filterType && job.job_type !== filterType) return false;
      return true;
    })
    .sort((a, b) => {
      const statusPriority = (status: string) => {
        switch (status) {
          case "running":
            return 0;
          case "pending":
            return 1;
          default:
            return 2;
        }
      };

      const priorityA = statusPriority(a.status);
      const priorityB = statusPriority(b.status);

      if (priorityA !== priorityB) {
        return priorityA - priorityB;
      }

      const dateA = new Date(a.created_at).getTime();
      const dateB = new Date(b.created_at).getTime();
      return dateB - dateA;
    });

  const jobTypes = Array.from(new Set(jobs.map((j) => j.job_type))).sort();

  return (
    <div className={styles.container}>
      {stats && (
        <div className={styles.stats}>
          <div className={styles.statItem}>
            <span className={styles.statLabel}>Total</span>
            <span className={styles.statValue}>{stats.total}</span>
          </div>
          <div className={styles.statItem}>
            <span className={styles.statLabel}>Active</span>
            <span className={styles.statValue}>{stats.active_count}</span>
          </div>
          <div className={styles.statItem}>
            <span className={styles.statLabel}>Completed</span>
            <span className={styles.statValue}>{stats.completed_count}</span>
          </div>
          <div className={styles.statItem}>
            <span className={styles.statLabel}>Failed</span>
            <span className={styles.statValue} style={{ color: "var(--error, #ef4444)" }}>
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
                  onClick={() => handleJobClick(job.job_id)}
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
                      <span className={styles.detailLabel}>Job ID</span>
                      <span className={styles.detailValue}>{selectedJob.job_id}</span>
                    </div>
                    <div className={styles.detailItem}>
                      <span className={styles.detailLabel}>Type</span>
                      <span className={styles.detailValue}>{selectedJob.job_type}</span>
                    </div>
                    <div className={styles.detailItem}>
                      <span className={styles.detailLabel}>Status</span>
                      <span
                        className={styles.detailValue}
                        style={{ color: getStatusColor(selectedJob.status) }}
                      >
                        {selectedJob.status}
                      </span>
                    </div>
                    <div className={styles.detailItem}>
                      <span className={styles.detailLabel}>Progress</span>
                      <span className={styles.detailValue}>{selectedJob.progress}%</span>
                    </div>
                    <div className={styles.detailItem}>
                      <span className={styles.detailLabel}>Created</span>
                      <span className={styles.detailValue}>
                        {formatDate(selectedJob.created_at)}
                      </span>
                    </div>
                    <div className={styles.detailItem}>
                      <span className={styles.detailLabel}>Started</span>
                      <span className={styles.detailValue}>
                        {formatDate(selectedJob.started_at)}
                      </span>
                    </div>
                    <div className={styles.detailItem}>
                      <span className={styles.detailLabel}>Completed</span>
                      <span className={styles.detailValue}>
                        {formatDate(selectedJob.completed_at)}
                      </span>
                    </div>
                    <div className={styles.detailItem}>
                      <span className={styles.detailLabel}>Duration</span>
                      <span className={styles.detailValue}>
                        {formatDuration(selectedJob.duration_seconds)}
                      </span>
                    </div>
                  </div>
                </div>

                {selectedJob.status_message && (
                  <div className={styles.detailSection}>
                    <h4>Status Message</h4>
                    <div className={styles.statusMessage}>
                      {selectedJob.status_message}
                    </div>
                  </div>
                )}

                {selectedJob.error_message && (
                  <div className={styles.detailSection}>
                    <h4>Error Message</h4>
                    <div className={styles.errorMessage}>
                      {selectedJob.error_message}
                    </div>
                  </div>
                )}

                {selectedJob.job_metadata &&
                  Object.keys(selectedJob.job_metadata).length > 0 && (
                    <div className={styles.detailSection}>
                      <h4>Metadata</h4>
                      <pre className={styles.codeBlock}>
                        {JSON.stringify(selectedJob.job_metadata, null, 2)}
                      </pre>
                    </div>
                  )}

                {selectedJob.logs && selectedJob.logs.length > 0 ? (
                  <div className={styles.detailSection}>
                    <h4>Event Log ({selectedJob.logs.length} entries)</h4>
                    <div className={styles.logsContainer}>
                      {selectedJob.logs.map((log, index) => {
                        const isError =
                          log.includes("ERROR") || log.includes("FATAL");
                        return (
                          <div
                            key={index}
                            className={`${styles.logEntry} ${
                              isError ? styles.logEntryError : ""
                            }`}
                          >
                            {log}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : detailsLoading ? (
                  <div className={styles.detailSection}>
                    <h4>Event Log</h4>
                    <div className={styles.loadingContainer}>
                      <Loader size="sm" color="dark" />
                      <span>Loading logs...</span>
                    </div>
                  </div>
                ) : null}

                {selectedJob.result ? (
                  <div className={styles.detailSection}>
                    <h4>Result</h4>
                    <pre className={styles.codeBlock}>
                      {JSON.stringify(selectedJob.result, null, 2)}
                    </pre>
                  </div>
                ) : detailsLoading &&
                  (selectedJob.status === "completed" ||
                    selectedJob.status === "failed") ? (
                  <div className={styles.detailSection}>
                    <h4>Result</h4>
                    <div className={styles.loadingContainer}>
                      <Loader size="sm" color="dark" />
                      <span>Loading result...</span>
                    </div>
                  </div>
                ) : null}
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

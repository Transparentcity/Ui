"use client";

import { useAuth0 } from "@auth0/auth0-react";
import { useEffect, useState, useRef } from "react";
import { Job, getJob, getJobStats, JobStats } from "@/lib/apiClient";
import { useJobWebSocketContext } from "@/contexts/JobWebSocketContext";
import type { Job as WebSocketJob } from "@/lib/useJobWebSocket";
import Loader from "./Loader";
import styles from "./JobLogsViewer.module.css";

export default function JobLogsViewer() {
  const { getAccessTokenSilently, isAuthenticated } = useAuth0();
  const [token, setToken] = useState<string | null>(null);
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<JobStats | null>(null);
  const [filterStatus, setFilterStatus] = useState<string>("");
  const [filterType, setFilterType] = useState<string>("");
  const selectedJobRef = useRef<Job | null>(null);

  // Get token for API calls (not needed for WebSocket - handled by context)
  useEffect(() => {
    if (isAuthenticated) {
      getAccessTokenSilently()
        .then((t) => {
          setToken(t);
        })
        .catch((err) => {
          console.error("Failed to get token:", err);
        });
    } else {
      setToken(null);
    }
  }, [isAuthenticated, getAccessTokenSilently]);

  // Use shared WebSocket context for real-time job updates (no polling needed)
  const { jobs: webSocketJobs, isConnected } = useJobWebSocketContext();

  // Convert WebSocket jobs to API Job format and apply filters
  const jobs: Job[] = webSocketJobs
    .filter((job) => {
      if (filterStatus && job.status !== filterStatus) return false;
      return true;
    })
    .map((wsJob: WebSocketJob) => ({
      job_id: wsJob.job_id,
      job_type: wsJob.job_type || "unknown", // Use job_type from WebSocket, fallback to "unknown"
      status: wsJob.status,
      description: wsJob.description,
      status_message: wsJob.status_message,
      progress: wsJob.progress,
      created_at: wsJob.created_at,
      started_at: wsJob.started_at || null,
      completed_at: wsJob.completed_at || null,
      error_message: wsJob.error || null,
      duration_seconds: null,
      logs: [],
      result: null,
      job_metadata: {},
    }));

  // Load stats function
  const loadStats = async () => {
    try {
      const currentToken = token || (await getAccessTokenSilently());
      const response = await getJobStats(currentToken);
      setStats(response.stats);
    } catch (err) {
      console.error("Error loading job stats:", err);
    }
  };

  const loadJobDetails = async (jobId: string) => {
    try {
      const currentToken = token || (await getAccessTokenSilently());
      const job = await getJob(jobId, currentToken);
      setSelectedJob(job);
      selectedJobRef.current = job;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load job details");
      console.error("Error loading job details:", err);
    }
  };

  // Load stats on mount and when filter changes
  useEffect(() => {
    if (token) {
      loadStats();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterStatus, token]);

  // Update selected job when it changes via WebSocket
  useEffect(() => {
    if (selectedJobRef.current) {
      const updatedJob = webSocketJobs.find(
        (job) => job.job_id === selectedJobRef.current?.job_id
      );
      if (updatedJob) {
        // When WebSocket is connected, just update local state from WebSocket data
        // Only fetch full details when job completes (to get final logs/result) or if WebSocket is disconnected
        if (isConnected) {
          // WebSocket connected: update state from WebSocket data, no API call needed
          setSelectedJob((prev) => {
            if (prev && prev.job_id === updatedJob.job_id) {
              return {
                ...prev,
                status: updatedJob.status,
                progress: updatedJob.progress,
                status_message: updatedJob.status_message,
                started_at: updatedJob.started_at || null,
                completed_at: updatedJob.completed_at || null,
                error_message: updatedJob.error || null,
              };
            }
            return prev;
          });
          
          // Only fetch full details when job completes (to get logs/result)
          if (updatedJob.status === "completed" || updatedJob.status === "failed" || updatedJob.status === "cancelled") {
            loadJobDetails(updatedJob.job_id);
          }
        } else {
          // WebSocket disconnected: fallback to polling for full details
          if (updatedJob.status === "running" || updatedJob.status === "pending") {
            loadJobDetails(updatedJob.job_id);
          } else {
            // Job completed, fetch final details
            loadJobDetails(updatedJob.job_id);
          }
        }
      }
    }
  }, [webSocketJobs, isConnected]);

  // Listen for job update events from WebSocket
  useEffect(() => {
    const handleJobUpdate = (event: CustomEvent<{ job_id: string; data: WebSocketJob }>) => {
      const { job_id, data } = event.detail;
      
      // If this is the selected job, update it
      if (selectedJobRef.current?.job_id === job_id) {
        if (isConnected) {
          // WebSocket connected: update state from WebSocket data, no API call needed
          setSelectedJob((prev) => {
            if (prev && prev.job_id === job_id) {
              return {
                ...prev,
                status: data.status,
                progress: data.progress,
                status_message: data.status_message,
                started_at: data.started_at || null,
                completed_at: data.completed_at || null,
                error_message: data.error || null,
              };
            }
            return prev;
          });
          
          // Only fetch full details when job completes (to get logs/result)
          if (data.status === "completed" || data.status === "failed" || data.status === "cancelled") {
            loadJobDetails(job_id);
          }
        } else {
          // WebSocket disconnected: fallback to polling for full details
          if (data.status === "running" || data.status === "pending") {
            loadJobDetails(job_id);
          } else {
            // Job completed, fetch final details
            loadJobDetails(job_id);
          }
        }
      }
      
      // Refresh stats when jobs update (debounce to avoid too many calls)
      if (token) {
        setTimeout(() => loadStats(), 1000);
      }
    };

    window.addEventListener("job:update", handleJobUpdate as EventListener);
    return () => {
      window.removeEventListener("job:update", handleJobUpdate as EventListener);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, isConnected]);

  // Set loading to false once we have jobs or WebSocket is connected
  useEffect(() => {
    if (isAuthenticated && (isConnected || jobs.length > 0)) {
      setLoading(false);
    }
  }, [isAuthenticated, isConnected, jobs.length]);

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
      <div className={styles.container} style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "12px", padding: "48px" }}>
        <Loader size="sm" color="dark" />
        <span>Loading jobs...</span>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h2>Job Logs</h2>
        <div className={styles.headerActions}>
          <div className={styles.connectionStatus}>
            {isConnected ? (
              <span className={styles.connected}>🟢 Real-time updates</span>
            ) : (
              <span className={styles.disconnected}>🟡 Polling fallback</span>
            )}
          </div>
          <button onClick={loadStats} className={styles.refreshButton}>
            Refresh Stats
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


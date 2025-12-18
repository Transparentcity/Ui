import { useEffect, useRef, useState, useCallback } from "react";
import { listJobs, getJob, cancelJob as cancelJobAPI, type Job as APIJob } from "./apiClient";

export interface Job {
  job_id: string;
  status: "pending" | "running" | "completed" | "failed" | "cancelled";
  description: string;
  status_message?: string;
  progress: number;
  created_at: string;
  started_at?: string | null;
  completed_at?: string | null;
  error?: string;
}

interface JobUpdateMessage {
  type: "job_update";
  job_id: string;
  data: Job;
}

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8001";

/**
 * Utility function to notify the job WebSocket hook that a new job was created.
 * Components should call this immediately after receiving a job_id from an API response.
 * 
 * @param jobId - The job ID that was just created
 */
export function notifyJobCreated(jobId: string) {
  console.log(`📢 Notifying job creation: ${jobId}`);
  window.dispatchEvent(
    new CustomEvent("jobCreated", {
      detail: jobId,
    })
  );
}

export function useJobWebSocket(token: string | null, enabled: boolean = true) {
  const [jobs, setJobs] = useState<Map<string, Job>>(new Map());
  const [isConnected, setIsConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const shouldReconnectRef = useRef(true);
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const isLoadingJobsRef = useRef(false);
  const tokenRef = useRef<string | null>(token);

  // Keep token ref in sync
  useEffect(() => {
    tokenRef.current = token;
  }, [token]);

  // Load initial jobs with deduplication
  const loadJobs = useCallback(async () => {
    // Prevent duplicate simultaneous requests
    if (isLoadingJobsRef.current) {
      console.log("⏸️ Job WebSocket: Job load already in progress, skipping");
      return;
    }

    const currentToken = tokenRef.current;
    if (!currentToken) {
      console.log("⏸️ Job WebSocket: No token available, skipping job load");
      return;
    }

    isLoadingJobsRef.current = true;
    try {
      console.log("📥 Job WebSocket: Loading initial jobs from", `${API_BASE}/api/jobs?limit=20`);
      
      // Use the apiClient function for consistency and better error handling
      const data = await listJobs(currentToken, 20);
      
      console.log("✅ Job WebSocket: Loaded", data.jobs?.length || 0, "jobs");
      const jobsMap = new Map<string, Job>();
      data.jobs?.forEach((job: APIJob) => {
        // Convert APIJob to Job format
        const jobData: Job = {
          job_id: job.job_id,
          status: job.status,
          description: job.description,
          status_message: job.status_message,
          progress: job.progress,
          created_at: job.created_at,
          started_at: job.started_at ?? undefined,
          completed_at: job.completed_at ?? undefined,
          error: job.error || job.error_message || undefined,
        };
        jobsMap.set(job.job_id, jobData);
        console.log(`  - Job ${job.job_id}: ${job.status} - ${job.description}`);
      });
      setJobs(jobsMap);
    } catch (error) {
      // Enhanced error logging
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorDetails = {
        message: errorMessage,
        apiBase: API_BASE,
        endpoint: `${API_BASE}/api/jobs?limit=20`,
        hasToken: !!currentToken,
        tokenLength: currentToken?.length || 0,
      };
      console.error("❌ Job WebSocket: Error loading jobs:", error);
      console.error("❌ Error details:", errorDetails);
      
      // Log network-specific errors
      if (errorMessage.includes("Failed to fetch") || errorMessage.includes("NetworkError")) {
        console.error("❌ Network error - Check if API is accessible:", API_BASE);
        console.error("❌ Possible causes: CORS issue, API not running, or incorrect API_BASE_URL");
      }
    } finally {
      isLoadingJobsRef.current = false;
    }
  }, []); // Remove token from deps, use ref instead

  // Fetch a specific job by ID immediately (for when we get job_id from API response)
  const fetchJob = useCallback(
    async (jobId: string) => {
      if (!token) {
        console.log("⏸️ Job WebSocket: No token available, skipping job fetch");
        return;
      }

      try {
        console.log(`🔍 Job WebSocket: Fetching job ${jobId} immediately`);
        
        // Use the apiClient function for consistency
        const apiJob = await getJob(jobId, token);
        
        // Convert APIJob to Job format
        const job: Job = {
          job_id: apiJob.job_id,
          status: apiJob.status,
          description: apiJob.description,
          status_message: apiJob.status_message,
          progress: apiJob.progress,
          created_at: apiJob.created_at,
          started_at: apiJob.started_at ?? undefined,
          completed_at: apiJob.completed_at ?? undefined,
          error: apiJob.error || apiJob.error_message || undefined,
        };
        
        console.log(`✅ Job WebSocket: Fetched job ${jobId}:`, {
          status: job.status,
          description: job.description?.substring(0, 50),
        });

        setJobs((prevJobs) => {
          const newJobs = new Map(prevJobs);
          newJobs.set(job.job_id, job);
          const activeCount = Array.from(newJobs.values()).filter(
            (j) => j.status === "running" || j.status === "pending"
          ).length;
          console.log(`📊 Job WebSocket: Added job ${jobId}, Active: ${activeCount}`);
          return newJobs;
        });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error(`❌ Job WebSocket: Error fetching job ${jobId}:`, error);
        console.error(`❌ Error details:`, {
          message: errorMessage,
          endpoint: `${API_BASE}/api/jobs/${jobId}`,
        });
      }
    },
    [token]
  );

  // Connect WebSocket
  const connect = useCallback(() => {
    if (!token || !enabled || wsRef.current?.readyState === WebSocket.OPEN) {
      return;
    }

    // Determine WebSocket URL
    // Use API_BASE if it's a full URL, otherwise use window.location
    let wsUrl: string;
    if (API_BASE.startsWith("http://") || API_BASE.startsWith("https://")) {
      const url = new URL(API_BASE);
      const protocol = url.protocol === "https:" ? "wss:" : "ws:";
      wsUrl = `${protocol}//${url.host}/api/jobs/ws`;
    } else {
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      wsUrl = `${protocol}//${window.location.host}/api/jobs/ws`;
    }

    console.log("🔌 Connecting to job WebSocket:", wsUrl);

    try {
      const ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        console.log("✅ Job WebSocket connected");
        setIsConnected(true);
        // Clear any pending reconnection
        if (reconnectTimeoutRef.current) {
          clearTimeout(reconnectTimeoutRef.current);
          reconnectTimeoutRef.current = null;
        }
      };

      ws.onmessage = (event) => {
        try {
          const message: JobUpdateMessage = JSON.parse(event.data);

          if (message.type === "job_update") {
            console.log(`📨 Job WebSocket: Received update for job ${message.job_id}:`, {
              status: message.data.status,
              progress: message.data.progress,
              description: message.data.description?.substring(0, 50),
            });
            
            setJobs((prevJobs) => {
              const newJobs = new Map(prevJobs);
              newJobs.set(message.job_id, message.data);
              const activeCount = Array.from(newJobs.values()).filter(
                (job) => job.status === "running" || job.status === "pending"
              ).length;
              console.log(`📊 Job WebSocket: Total jobs: ${newJobs.size}, Active: ${activeCount}`);
              return newJobs;
            });

            // Auto-remove completed jobs after 5 seconds
            if (
              message.data.status === "completed" &&
              message.data.progress === 100
            ) {
              setTimeout(() => {
                setJobs((prevJobs) => {
                  const newJobs = new Map(prevJobs);
                  newJobs.delete(message.job_id);
                  console.log(`🗑️ Job WebSocket: Auto-removed completed job ${message.job_id}`);
                  return newJobs;
                });
              }, 5000);
            }
          } else {
            console.log("📨 Job WebSocket: Received unknown message type:", message.type);
          }
        } catch (error) {
          console.error("❌ Job WebSocket: Error parsing message:", error, "Raw data:", event.data);
        }
      };

      ws.onclose = (event) => {
        console.log("❌ Job WebSocket disconnected", {
          code: event.code,
          reason: event.reason,
          wasClean: event.wasClean,
        });
        setIsConnected(false);

        // Reconnect after 5 seconds if we should
        if (shouldReconnectRef.current && enabled) {
          reconnectTimeoutRef.current = setTimeout(() => {
            console.log("🔄 Reconnecting job WebSocket...");
            connect();
          }, 5000);
        }
      };

      ws.onerror = (event) => {
        // WebSocket error events don't provide detailed error info
        // Check the readyState to see if connection failed
        const state = ws.readyState;
        console.error("Job WebSocket error:", {
          readyState: state,
          readyStateText:
            state === WebSocket.CONNECTING
              ? "CONNECTING"
              : state === WebSocket.OPEN
              ? "OPEN"
              : state === WebSocket.CLOSING
              ? "CLOSING"
              : "CLOSED",
          url: wsUrl,
        });
        setIsConnected(false);
      };

      wsRef.current = ws;
    } catch (error) {
      console.error("Failed to create WebSocket:", error);
      setIsConnected(false);
    }
  }, [token, enabled]);

  // Disconnect WebSocket
  const disconnect = useCallback(() => {
    shouldReconnectRef.current = false;
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    setIsConnected(false);
  }, []);

  // Cancel a job
  const cancelJob = useCallback(
    async (jobId: string) => {
      if (!token) return;

      try {
        // Use the apiClient function for consistency
        const data = await cancelJobAPI(jobId, token);
        console.log(`Job ${jobId} cancelled successfully:`, data);
        // The WebSocket will update the job status
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error(`Error cancelling job ${jobId}:`, error);
        console.error(`Error details:`, {
          message: errorMessage,
          endpoint: `${API_BASE}/api/jobs/${jobId}/cancel`,
        });
        throw error;
      }
    },
    [token]
  );

  // Listen for job creation events from other components
  useEffect(() => {
    const handleJobCreated = (event: CustomEvent<string>) => {
      const jobId = event.detail;
      console.log(`🎯 Job WebSocket: Received job creation event for ${jobId}, fetching immediately`);
      // Fetch the specific job immediately
      fetchJob(jobId);
      // Also refresh all jobs after a short delay to ensure we catch it
      setTimeout(() => {
        loadJobs();
      }, 500);
    };

    window.addEventListener("jobCreated" as any, handleJobCreated);
    return () => {
      window.removeEventListener("jobCreated" as any, handleJobCreated);
    };
  }, [fetchJob, loadJobs]);

  // Initialize on mount
  useEffect(() => {
    if (enabled && token) {
      loadJobs();
      connect();
      // Removed duplicate delayed poll - WebSocket will handle updates
    }

    return () => {
      disconnect();
    };
  }, [enabled, token, loadJobs, connect, disconnect]);

  // Get active jobs (running or pending)
  const activeJobs = Array.from(jobs.values()).filter(
    (job) => job.status === "running" || job.status === "pending"
  );

  // Poll for jobs ONLY when WebSocket is not connected (fallback mechanism)
  // When WebSocket is connected, rely on WebSocket messages for real-time updates
  useEffect(() => {
    // Clear existing poll interval
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }

    // Only poll when WebSocket is NOT connected (as a fallback)
    // When connected, WebSocket messages provide real-time updates
    if (enabled && token && !isConnected) {
      // Poll less frequently when disconnected - every 10 seconds
      // This is just a fallback to catch jobs if WebSocket fails
      const pollInterval = 10000; // 10 seconds
      console.log(
        `🔄 Job WebSocket: Starting fallback polling (interval: ${pollInterval}ms, connected: ${isConnected})`
      );

      pollIntervalRef.current = setInterval(() => {
        loadJobs();
      }, pollInterval);
    }

    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
    };
  }, [enabled, token, isConnected, loadJobs]);

  // Debug logging for active jobs
  useEffect(() => {
    if (jobs.size > 0 || activeJobs.length > 0) {
      console.log("📊 Job WebSocket: Job state update", {
        totalJobs: jobs.size,
        activeJobs: activeJobs.length,
        activeJobIds: activeJobs.map((j) => j.job_id),
        allJobStatuses: Array.from(jobs.values()).map((j) => ({
          id: j.job_id,
          status: j.status,
          description: j.description?.substring(0, 30),
        })),
      });
    }
  }, [jobs, activeJobs]);

  return {
    jobs: Array.from(jobs.values()),
    activeJobs,
    isConnected,
    cancelJob,
    refreshJobs: loadJobs,
    fetchJob, // Expose fetchJob so components can immediately fetch a job when created
  };
}



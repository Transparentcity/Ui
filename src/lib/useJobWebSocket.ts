import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { listJobs, getJob, cancelJob as cancelJobAPI, type Job as APIJob } from "./apiClient";

export interface Job {
  job_id: string;
  job_type?: string;
  status: "pending" | "running" | "completed" | "failed" | "cancelled";
  description: string;
  status_message?: string;
  progress: number;
  created_at: string;
  started_at?: string | null;
  completed_at?: string | null;
  error?: string;
  result?: any;
  job_metadata?: Record<string, any>;
}

interface JobUpdateMessage {
  type: "job_update";
  job_id: string;
  data: Job;
}

import { API_BASE } from "./apiBase";

/**
 * Utility function to notify the job WebSocket hook that a new job was created.
 * Components should call this immediately after receiving a job_id from an API response.
 * 
 * @param jobId - The job ID that was just created
 */
export function notifyJobCreated(jobId: string) {
  window.dispatchEvent(
    new CustomEvent("jobCreated", {
      detail: jobId,
    })
  );
}

// Max retries before giving up on WebSocket and using polling only
const MAX_WS_RETRIES = 2;
// WebSocket connection timeout (fail fast)
const WS_CONNECT_TIMEOUT_MS = 2000;

export function useJobWebSocket(token: string | null, enabled: boolean = true) {
  const [jobs, setJobs] = useState<Map<string, Job>>(new Map());
  const [isConnected, setIsConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const shouldReconnectRef = useRef(true);
  const isLoadingJobsRef = useRef(false);
  const tokenRef = useRef<string | null>(token);
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const isPollingRef = useRef<boolean>(false);
  const pollingDelayTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const wsRetryCountRef = useRef<number>(0);
  const wsGaveUpRef = useRef<boolean>(false);

  // Keep token ref in sync
  useEffect(() => {
    tokenRef.current = token;
  }, [token]);

  // Load initial jobs with deduplication
  const loadJobs = useCallback(async () => {
    // Prevent duplicate simultaneous requests
    if (isLoadingJobsRef.current) {
      return;
    }

    const currentToken = tokenRef.current;
    if (!currentToken) {
      return;
    }

    isLoadingJobsRef.current = true;
    try {
      // Use the apiClient function for consistency and better error handling
      const data = await listJobs(currentToken, 20);
      
      const jobsMap = new Map<string, Job>();
      let activeCount = 0;
      data.jobs?.forEach((job: APIJob) => {
        // Convert APIJob to Job format
        const jobData: Job = {
          job_id: job.job_id,
          job_type: job.job_type,
          status: job.status,
          description: job.description,
          status_message: job.status_message,
          progress: job.progress,
          created_at: job.created_at,
          started_at: job.started_at ?? undefined,
          completed_at: job.completed_at ?? undefined,
          error: job.error || job.error_message || undefined,
          result: job.result,
          job_metadata: job.job_metadata,
        };
        jobsMap.set(job.job_id, jobData);
        if (job.status === "running" || job.status === "pending") {
          activeCount++;
        }
      });
      console.log(`📥 Jobs loaded: ${jobsMap.size} total, ${activeCount} active`);
      setJobs(jobsMap);
    } catch (error) {
      // Silently handle expected errors (auth issues, backend unavailable)
      // These are non-critical - the jobs API is optional for CRM functionality
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (!errorMessage.includes('Authentication') && !errorMessage.includes('Failed to fetch')) {
        console.error("❌ Error loading jobs:", errorMessage);
      }
    } finally {
      isLoadingJobsRef.current = false;
    }
  }, []); // Remove token from deps, use ref instead

  // Track in-flight fetches to prevent duplicate requests
  const fetchingJobsRef = useRef<Set<string>>(new Set());
  
  // Fetch a specific job by ID immediately (for when we get job_id from API response)
  const fetchJob = useCallback(
    async (jobId: string) => {
      if (!token) {
        return;
      }

      // Prevent duplicate simultaneous fetches of the same job
      if (fetchingJobsRef.current.has(jobId)) {
        return;
      }

      fetchingJobsRef.current.add(jobId);
      
      try {
        // Use the apiClient function for consistency
        const apiJob = await getJob(jobId, token);
        
        // Convert APIJob to Job format
        const job: Job = {
          job_id: apiJob.job_id,
          job_type: apiJob.job_type,
          status: apiJob.status,
          description: apiJob.description,
          status_message: apiJob.status_message,
          progress: apiJob.progress,
          created_at: apiJob.created_at,
          started_at: apiJob.started_at ?? undefined,
          completed_at: apiJob.completed_at ?? undefined,
          error: apiJob.error || apiJob.error_message || undefined,
          result: apiJob.result,
          job_metadata: apiJob.job_metadata,
        };
        
        setJobs((prevJobs) => {
          const newJobs = new Map(prevJobs);
          const prevJob = newJobs.get(job.job_id);
          // Only log if status changed
          if (!prevJob || prevJob.status !== job.status) {
            console.log(`📊 Job ${jobId}: ${prevJob?.status || 'new'} → ${job.status}`);
          }
          newJobs.set(job.job_id, job);
          return newJobs;
        });

        // Broadcast to the rest of the UI (so views can update without polling).
        if (typeof window !== "undefined") {
          window.dispatchEvent(
            new CustomEvent("job:update", {
              detail: { job_id: job.job_id, data: job },
            })
          );
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        
        // If job returns 404 or 403 (not found or not authorized), remove from state to stop polling
        const isNotFound =
          errorMessage.includes('404') || errorMessage.includes('not found') || errorMessage.includes('Not found');
        const isUnauthorized =
          errorMessage.includes('403') || errorMessage.includes('Not authorized') || errorMessage.includes('not authorized');
        if (isNotFound || isUnauthorized) {
          setJobs((prevJobs) => {
            const newJobs = new Map(prevJobs);
            newJobs.delete(jobId);
            return newJobs;
          });
        } else {
          console.error(`❌ Error fetching job ${jobId}:`, errorMessage);
        }
      } finally {
        // Remove from in-flight set
        fetchingJobsRef.current.delete(jobId);
      }
    },
    [token]
  );

  // Connect WebSocket
  const connect = useCallback(() => {
    // Don't connect if we've already given up
    if (wsGaveUpRef.current) {
      return;
    }
    
    if (!token || !enabled || wsRef.current?.readyState === WebSocket.OPEN) {
      return;
    }

    // Check retry count
    if (wsRetryCountRef.current >= MAX_WS_RETRIES) {
      if (!wsGaveUpRef.current) {
        wsGaveUpRef.current = true;
        console.log("🔌 WebSocket: Max retries reached, using polling only");
      }
      return;
    }

    // Determine WebSocket URL
    let wsUrl: string;
    if (API_BASE.startsWith("http://") || API_BASE.startsWith("https://")) {
      const url = new URL(API_BASE);
      const protocol = url.protocol === "https:" ? "wss:" : "ws:";
      wsUrl = `${protocol}//${url.host}/api/jobs/ws`;
    } else {
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      wsUrl = `${protocol}//${window.location.host}/api/jobs/ws`;
    }

    // Only log on first attempt
    if (wsRetryCountRef.current === 0) {
      console.log("🔌 Connecting to job WebSocket:", wsUrl);
    }

    try {
      const ws = new WebSocket(wsUrl);

      // Fast timeout - fail quickly so we can fall back to polling
      const connectionTimeout = setTimeout(() => {
        if (ws.readyState !== WebSocket.OPEN && ws.readyState !== WebSocket.CLOSING && ws.readyState !== WebSocket.CLOSED) {
          ws.close(); // Force close to trigger onclose handler
        }
      }, WS_CONNECT_TIMEOUT_MS);
      
      ws.onopen = () => {
        clearTimeout(connectionTimeout);
        wsRetryCountRef.current = 0; // Reset retry count on successful connection
        console.log("✅ Job WebSocket connected");
        setIsConnected(true);
        // Clear any pending reconnection
        if (reconnectTimeoutRef.current) {
          clearTimeout(reconnectTimeoutRef.current);
          reconnectTimeoutRef.current = null;
        }
        // Clear delayed polling timeout if it exists
        if (pollingDelayTimeoutRef.current) {
          clearTimeout(pollingDelayTimeoutRef.current);
          pollingDelayTimeoutRef.current = null;
        }
        // Force stop polling immediately when WebSocket connects
        if (pollIntervalRef.current) {
          clearInterval(pollIntervalRef.current);
          pollIntervalRef.current = null;
          isPollingRef.current = false;
        }
      };

      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);

          if (message.type === "job_update") {
            const jobUpdate = message as JobUpdateMessage;

            if (typeof window !== "undefined") {
              window.dispatchEvent(
                new CustomEvent("job:update", {
                  detail: { job_id: jobUpdate.job_id, data: jobUpdate.data },
                })
              );
            }
            
            setJobs((prevJobs) => {
              const newJobs = new Map(prevJobs);
              const prevJob = newJobs.get(jobUpdate.job_id);
              // Only log status changes
              if (!prevJob || prevJob.status !== jobUpdate.data.status) {
                console.log(`📊 Job ${jobUpdate.job_id}: ${prevJob?.status || 'new'} → ${jobUpdate.data.status}`);
              }
              newJobs.set(jobUpdate.job_id, jobUpdate.data);
              return newJobs;
            });

            // Auto-remove completed jobs after 5 seconds
            if (
              jobUpdate.data.status === "completed" &&
              jobUpdate.data.progress === 100
            ) {
              setTimeout(() => {
                setJobs((prevJobs) => {
                  const newJobs = new Map(prevJobs);
                  newJobs.delete(jobUpdate.job_id);
                  return newJobs;
                });
              }, 5000);
            }
          } else if (message.type === "ping") {
            ws.send(JSON.stringify({ type: "pong" }));
          }
        } catch (error) {
          console.error("❌ Job WebSocket: Error parsing message:", error);
        }
      };

      ws.onclose = (event) => {
        clearTimeout(connectionTimeout);
        setIsConnected(false);
        wsRetryCountRef.current++;

        // Only retry if we haven't exceeded max retries
        if (shouldReconnectRef.current && enabled && wsRetryCountRef.current < MAX_WS_RETRIES) {
          const retryDelay = 1000 * wsRetryCountRef.current; // Increasing backoff
          reconnectTimeoutRef.current = setTimeout(() => {
            connect();
          }, retryDelay);
        } else if (wsRetryCountRef.current >= MAX_WS_RETRIES && !wsGaveUpRef.current) {
          wsGaveUpRef.current = true;
          console.log("🔌 WebSocket unavailable - using polling for job updates");
        }
      };

      ws.onerror = () => {
        // WebSocket error - will trigger onclose which handles retry logic
        setIsConnected(false);
      };

      wsRef.current = ws;
    } catch (error) {
      wsRetryCountRef.current++;
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
        await cancelJobAPI(jobId, token);
        console.log(`Job ${jobId} cancelled`);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        const statusCode = (error as any)?.status;
        
        // Handle graceful errors - if job is already cancelled/completed (400) or not found (404)
        if (statusCode === 400 || statusCode === 404) {
          setJobs((prevJobs) => {
            const newJobs = new Map(prevJobs);
            const existingJob = newJobs.get(jobId);
            if (existingJob && (existingJob.status === "running" || existingJob.status === "pending")) {
              newJobs.set(jobId, {
                ...existingJob,
                status: "cancelled" as const,
              });
            }
            return newJobs;
          });
          return;
        }
        
        console.error(`Error cancelling job ${jobId}:`, errorMessage);
        throw error;
      }
    },
    [token]
  );

  // Cancel all running/pending jobs
  const cancelAllJobs = useCallback(async () => {
    if (!token) return;

    const activeJobsList = Array.from(jobs.values()).filter(
      (job) => job.status === "running" || job.status === "pending"
    );

    if (activeJobsList.length === 0) return;

    console.log(`Cancelling ${activeJobsList.length} active jobs...`);
    await Promise.allSettled(
      activeJobsList.map((job) => cancelJob(job.job_id))
    );
    // Refresh from server so cancelled status is reflected; backend fix prevents
    // cancelled jobs from being resurrected to pending/running by late start_job.
    loadJobs();
  }, [token, jobs, cancelJob, loadJobs]);

  // Listen for job creation events from other components
  useEffect(() => {
    const handleJobCreated = (event: CustomEvent<string>) => {
      const jobId = event.detail;
      const currentWsState = wsRef.current?.readyState;
      const wsIsOpen = currentWsState === WebSocket.OPEN;
      const wsIsConnected = isConnected || wsIsOpen;
      
      // Fetch the job immediately to ensure UI shows new job right away
      fetchJob(jobId);
      
      // If WebSocket is not connected, also refresh all jobs after a short delay
      if (!wsIsConnected) {
        setTimeout(() => {
          loadJobs();
        }, 500);
      }
    };

    window.addEventListener("jobCreated" as any, handleJobCreated);
    return () => {
      window.removeEventListener("jobCreated" as any, handleJobCreated);
    };
  }, [fetchJob, loadJobs, isConnected]);

  // Initialize on mount - load jobs first (fast), then try WebSocket in background
  useEffect(() => {
    if (enabled && token) {
      // Load jobs immediately via REST API (fast, reliable)
      loadJobs();
      
      // Try WebSocket connection after a short delay so it doesn't block initial load
      // If WebSocket fails, polling fallback will kick in automatically
      const wsConnectDelay = setTimeout(() => {
        connect();
      }, 500);
      
      return () => {
        clearTimeout(wsConnectDelay);
        disconnect();
      };
    }

    return () => {
      disconnect();
    };
  }, [enabled, token, loadJobs, connect, disconnect]);

  // Get active jobs (running or pending) - memoize to prevent unnecessary re-renders
  const activeJobs = useMemo(() => {
    return Array.from(jobs.values()).filter(
      (job) => job.status === "running" || job.status === "pending"
    );
  }, [jobs]);
  
  // Track active job IDs for stable dependency in polling effect
  // Using useMemo ensures this string only changes when actual job IDs change
  const activeJobIds = useMemo(() => {
    return activeJobs.map(j => j.job_id).sort().join(',');
  }, [activeJobs]);

  // Polling fallback for when WebSocket is disconnected
  // Only poll when WebSocket is NOT connected - when connected, rely on WebSocket updates
  const lastPollRef = useRef<number>(0);
  
  useEffect(() => {
    // Check WebSocket state - don't poll if it's connected or connecting
    const wsState = wsRef.current?.readyState;
    const isWsOpen = wsState === WebSocket.OPEN;
    const isWsConnecting = wsState === WebSocket.CONNECTING;
    
    // ALWAYS clear polling if WebSocket is connected or connecting
    if (isConnected || isWsOpen) {
      if (pollingDelayTimeoutRef.current) {
        clearTimeout(pollingDelayTimeoutRef.current);
        pollingDelayTimeoutRef.current = null;
      }
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
        isPollingRef.current = false;
      }
      return;
    }
    
    // Don't start polling if WebSocket is connecting
    if (isWsConnecting) {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
        isPollingRef.current = false;
      }
      return;
    }
    
    // Only poll when WebSocket is disconnected AND there are active jobs
    if (!activeJobIds || !token) {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
        isPollingRef.current = false;
      }
      return;
    }
    
    // Don't start polling if already polling
    if (isPollingRef.current) {
      return;
    }
    
    const jobIdList = activeJobIds.split(',').filter(Boolean);
    
    // Start polling every 3 seconds when WebSocket is disconnected
    // This is a fallback to keep UI updated when WebSocket is unavailable
    const pollActiveJobs = async () => {
      // Double-check WebSocket status before polling
      const currentWsState = wsRef.current?.readyState;
      const isWsOpen = currentWsState === WebSocket.OPEN;
      const isWsConnecting = currentWsState === WebSocket.CONNECTING;
      
      if (isConnected || isWsOpen || isWsConnecting) {
        if (pollIntervalRef.current) {
          clearInterval(pollIntervalRef.current);
          pollIntervalRef.current = null;
          isPollingRef.current = false;
        }
        return;
      }
      
      const now = Date.now();
      // Debounce: don't poll more than once per 2 seconds
      if (now - lastPollRef.current < 2000) {
        return;
      }
      lastPollRef.current = now;
      
      // Note: currentWsState, isWsOpen, and isWsConnecting are already checked above
      // No need to check again here - the early return above handles it
      
      // Fetch each active job individually to get latest status
      for (const jobId of jobIdList) {
        // Check again before each fetch
        const checkWsState = wsRef.current?.readyState;
        if (isConnected || checkWsState === WebSocket.OPEN || checkWsState === WebSocket.CONNECTING) {
          if (pollIntervalRef.current) {
            clearInterval(pollIntervalRef.current);
            pollIntervalRef.current = null;
            isPollingRef.current = false;
          }
          return;
        }
        
        try {
          await fetchJob(jobId);
        } catch {
          // Silently ignore fetch errors during polling
        }
      }
    };
    
    // Mark as polling
    isPollingRef.current = true;
    
    // Clear any existing delayed polling timeout
    if (pollingDelayTimeoutRef.current) {
      clearTimeout(pollingDelayTimeoutRef.current);
      pollingDelayTimeoutRef.current = null;
    }
    
    // Wait for WebSocket to either connect or give up before starting polling
    // WebSocket has 2s timeout + 500ms initial delay, so wait ~3s total
    pollingDelayTimeoutRef.current = setTimeout(() => {
      const currentWsState = wsRef.current?.readyState;
      const currentIsConnected = isConnected;
      const currentIsOpen = currentWsState === WebSocket.OPEN;
      const currentIsConnecting = currentWsState === WebSocket.CONNECTING;
      
      // Don't start polling if WebSocket is connected or connecting
      if (currentIsConnected || currentIsOpen || currentIsConnecting) {
        isPollingRef.current = false;
        if (pollIntervalRef.current) {
          clearInterval(pollIntervalRef.current);
          pollIntervalRef.current = null;
        }
        return;
      }
      
      // Only start polling if WebSocket gave up or is closed
      if ((wsGaveUpRef.current || currentWsState === WebSocket.CLOSED || currentWsState === undefined) && !pollIntervalRef.current) {
        // Initial poll
        pollActiveJobs();
        
        // Poll every 5 seconds when WebSocket is unavailable
        pollIntervalRef.current = setInterval(pollActiveJobs, 5000);
      } else {
        isPollingRef.current = false;
      }
    }, 3000); // Wait for WebSocket connection attempt to complete
    
    return () => {
      if (pollingDelayTimeoutRef.current) {
        clearTimeout(pollingDelayTimeoutRef.current);
        pollingDelayTimeoutRef.current = null;
      }
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
        isPollingRef.current = false;
      }
    };
  }, [activeJobIds, token, isConnected, fetchJob]);

  return {
    jobs: Array.from(jobs.values()),
    activeJobs,
    isConnected,
    cancelJob,
    cancelAllJobs,
    refreshJobs: loadJobs,
    fetchJob, // Expose fetchJob so components can immediately fetch a job when created
  };
}



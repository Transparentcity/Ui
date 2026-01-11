import { useEffect, useRef, useState, useCallback } from "react";
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
  const isLoadingJobsRef = useRef(false);
  const tokenRef = useRef<string | null>(token);
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const isPollingRef = useRef<boolean>(false);
  const pollingDelayTimeoutRef = useRef<NodeJS.Timeout | null>(null);

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

  // Track in-flight fetches to prevent duplicate requests
  const fetchingJobsRef = useRef<Set<string>>(new Set());
  
  // Fetch a specific job by ID immediately (for when we get job_id from API response)
  const fetchJob = useCallback(
    async (jobId: string) => {
      if (!token) {
        console.log("⏸️ Job WebSocket: No token available, skipping job fetch");
        return;
      }

      // Prevent duplicate simultaneous fetches of the same job
      if (fetchingJobsRef.current.has(jobId)) {
        console.log(`⏸️ Job WebSocket: Already fetching job ${jobId}, skipping duplicate request`);
        return;
      }

      fetchingJobsRef.current.add(jobId);
      
      try {
        console.log(`🔍 Job WebSocket: Fetching job ${jobId} immediately`);
        
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
        console.error(`❌ Job WebSocket: Error fetching job ${jobId}:`, error);
        console.error(`❌ Error details:`, {
          message: errorMessage,
          endpoint: `${API_BASE}/api/jobs/${jobId}`,
        });
      } finally {
        // Remove from in-flight set
        fetchingJobsRef.current.delete(jobId);
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
    console.log("🔌 Current polling state:", {
      isPolling: isPollingRef.current,
      hasInterval: !!pollIntervalRef.current,
      isConnected,
    });

    try {
      const ws = new WebSocket(wsUrl);
      
      // Set connecting state immediately to prevent polling from starting
      // Note: We can't set isConnected=true yet, but we check readyState in polling

      // Add a timeout to detect if connection never establishes
      const connectionTimeout = setTimeout(() => {
        if (ws.readyState !== WebSocket.OPEN && ws.readyState !== WebSocket.CLOSING && ws.readyState !== WebSocket.CLOSED) {
          console.error("⏱️ WebSocket connection timeout - connection never established after 5 seconds", {
            readyState: ws.readyState,
            url: wsUrl,
            willUsePolling: true,
          });
          ws.close(); // Force close to trigger onclose handler
        }
      }, 5000); // 5 second timeout
      
      ws.onopen = () => {
        clearTimeout(connectionTimeout);
        console.log("✅ Job WebSocket connected - stopping all polling");
        setIsConnected(true);
        // Clear any pending reconnection
        if (reconnectTimeoutRef.current) {
          clearTimeout(reconnectTimeoutRef.current);
          reconnectTimeoutRef.current = null;
        }
        // Clear delayed polling timeout if it exists
        if (pollingDelayTimeoutRef.current) {
          console.log("🛑 Cancelling delayed polling start - WebSocket connected");
          clearTimeout(pollingDelayTimeoutRef.current);
          pollingDelayTimeoutRef.current = null;
        }
        // Force stop polling immediately when WebSocket connects
        if (pollIntervalRef.current) {
          console.log("🛑 Force stopping polling interval on WebSocket connect");
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
            console.log(`📨 Job WebSocket: Received update for job ${jobUpdate.job_id}:`, {
              status: jobUpdate.data.status,
              progress: jobUpdate.data.progress,
              description: jobUpdate.data.description?.substring(0, 50),
            });

            if (typeof window !== "undefined") {
              window.dispatchEvent(
                new CustomEvent("job:update", {
                  detail: { job_id: jobUpdate.job_id, data: jobUpdate.data },
                })
              );
            }
            
            setJobs((prevJobs) => {
              const newJobs = new Map(prevJobs);
              newJobs.set(jobUpdate.job_id, jobUpdate.data);
              const activeCount = Array.from(newJobs.values()).filter(
                (job) => job.status === "running" || job.status === "pending"
              ).length;
              console.log(`📊 Job WebSocket: Total jobs: ${newJobs.size}, Active: ${activeCount}`);
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
                  console.log(`🗑️ Job WebSocket: Auto-removed completed job ${jobUpdate.job_id}`);
                  return newJobs;
                });
              }, 5000);
            }
          } else if (message.type === "ping") {
            // Server sent ping, respond with pong to keep connection alive
            console.debug("💓 Job WebSocket: Received ping, sending pong");
            ws.send(JSON.stringify({ type: "pong" }));
          } else if (message.type === "pong") {
            // Server acknowledged our ping (if we ever send one)
            console.debug("💓 Job WebSocket: Received pong");
          } else {
            console.log("📨 Job WebSocket: Received unknown message type:", message.type);
          }
        } catch (error) {
          console.error("❌ Job WebSocket: Error parsing message:", error, "Raw data:", event.data);
        }
      };

      ws.onclose = (event) => {
        clearTimeout(connectionTimeout);
        // Log all close events to help debug
        console.warn("❌ Job WebSocket disconnected", {
          code: event.code,
          reason: event.reason || "No reason provided",
          wasClean: event.wasClean,
          codeMeaning: event.code === 1000 ? "Normal closure" :
                       event.code === 1001 ? "Going away" :
                       event.code === 1006 ? "Abnormal closure (connection failed)" :
                       event.code === 1002 ? "Protocol error" :
                       event.code === 1003 ? "Unsupported data" :
                       event.code === 1005 ? "No status code" :
                       event.code === 1007 ? "Invalid data" :
                       event.code === 1008 ? "Policy violation" :
                       event.code === 1009 ? "Message too big" :
                       event.code === 1010 ? "Extension error" :
                       event.code === 1011 ? "Internal error" :
                       event.code === 1012 ? "Service restart" :
                       event.code === 1013 ? "Try again later" :
                       event.code === 1014 ? "Bad gateway" :
                       event.code === 1015 ? "TLS handshake failed" :
                       `Unknown code ${event.code}`,
          willRetry: shouldReconnectRef.current && enabled,
          url: wsUrl,
        });
        setIsConnected(false);

        // Reconnect with exponential backoff, but faster for the first few retries
        // First retry: 1s, then 2s, then 5s, then 5s thereafter
        if (shouldReconnectRef.current && enabled) {
          const retryDelay = reconnectTimeoutRef.current ? 5000 : 1000;
          reconnectTimeoutRef.current = setTimeout(() => {
            console.log("🔄 Reconnecting job WebSocket...");
            connect();
          }, retryDelay);
        }
      };

      ws.onerror = (event) => {
        // WebSocket error events don't provide detailed error info
        // Check the readyState to see if connection failed
        const state = ws.readyState;
        console.error("❌ Job WebSocket connection error:", {
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
          error: event,
          willUsePolling: true,
          timestamp: new Date().toISOString(),
        });
        setIsConnected(false);
        // Don't stop polling here - let the polling effect handle it based on isConnected
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
        const statusCode = (error as any)?.status;
        
        // Handle graceful errors - if job is already cancelled/completed (400) or not found (404),
        // that's effectively the desired state, so we don't need to throw
        if (statusCode === 400 || statusCode === 404) {
          // Job is already in desired state (cancelled/completed) or doesn't exist
          console.log(`Job ${jobId} is already cancelled/completed or not found (status ${statusCode}) - treating as success`);
          // Update local state to reflect that job is no longer cancellable
          setJobs((prevJobs) => {
            const newJobs = new Map(prevJobs);
            const existingJob = newJobs.get(jobId);
            if (existingJob && (existingJob.status === "running" || existingJob.status === "pending")) {
              // Mark as cancelled if it was running/pending
              newJobs.set(jobId, {
                ...existingJob,
                status: "cancelled" as const,
              });
            }
            return newJobs;
          });
          return; // Don't throw - this is a successful outcome
        }
        
        // For other errors (403, 500, etc.), log and rethrow
        console.error(`Error cancelling job ${jobId}:`, error);
        console.error(`Error details:`, {
          message: errorMessage,
          statusCode,
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
      const currentWsState = wsRef.current?.readyState;
      const wsIsOpen = currentWsState === WebSocket.OPEN;
      const wsIsConnected = isConnected || wsIsOpen;
      
      console.log(`🎯 Job WebSocket: Received job creation event for ${jobId}`, {
        isConnected,
        wsState: currentWsState,
        wsIsOpen,
        wsIsConnected,
      });
      
      // ALWAYS fetch the job immediately to ensure UI shows new job right away
      // Even if WebSocket is connected, there may be a delay before the WS update arrives
      // This guarantees the user sees their new job when they open the jobs dropdown
      console.log(`🔄 Fetching job ${jobId} immediately to ensure UI is updated`);
      fetchJob(jobId);
      
      // If WebSocket is not connected, also refresh all jobs after a short delay
      if (!wsIsConnected) {
        console.log(`📥 WebSocket disconnected - also refreshing all jobs`);
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
  
  // Track active job IDs for stable dependency in polling effect
  const activeJobIds = activeJobs.map(j => j.job_id).sort().join(',');

  // Polling fallback for when WebSocket is disconnected
  // Only poll when WebSocket is NOT connected - when connected, rely on WebSocket updates
  const lastPollRef = useRef<number>(0);
  
  useEffect(() => {
    // Check WebSocket state - don't poll if it's connected or connecting
    const wsState = wsRef.current?.readyState;
    const isWsOpen = wsState === WebSocket.OPEN;
    const isWsConnecting = wsState === WebSocket.CONNECTING;
    const wsStateText = wsState === undefined ? "NO_WEBSOCKET" : 
                       wsState === WebSocket.CONNECTING ? "CONNECTING" :
                       wsState === WebSocket.OPEN ? "OPEN" :
                       wsState === WebSocket.CLOSING ? "CLOSING" : "CLOSED";
    
    console.log("🔍 Polling effect check:", {
      isConnected,
      wsState,
      wsStateText,
      isWsOpen,
      isWsConnecting,
      activeJobIds,
      hasToken: !!token,
      isPolling: isPollingRef.current,
      hasInterval: !!pollIntervalRef.current,
    });
    
    // ALWAYS clear polling if WebSocket is connected or connecting - we don't need polling when WebSocket works
    if (isConnected || isWsOpen) {
      // Clear delayed polling timeout
      if (pollingDelayTimeoutRef.current) {
        clearTimeout(pollingDelayTimeoutRef.current);
        pollingDelayTimeoutRef.current = null;
      }
      if (pollIntervalRef.current) {
        console.log("✅ WebSocket connected - stopping polling fallback immediately", {
          isConnected,
          wsState,
          wsStateText,
        });
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
        isPollingRef.current = false;
      }
      return;
    }
    
    // Don't start polling if WebSocket is in the process of connecting
    if (isWsConnecting) {
      console.log("⏳ WebSocket connecting - waiting before starting polling fallback");
      // Don't clear the delayed timeout - let it check again after 2s
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
        console.log("🛑 No active jobs or token - stopping polling");
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
        isPollingRef.current = false;
      }
      return;
    }
    
    // Don't start polling if already polling
    if (isPollingRef.current) {
      console.log("⏸️ Already polling - skipping");
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
        console.log("✅ WebSocket connected/connecting during poll - stopping polling immediately", {
          isConnected,
          wsState: currentWsState,
          wsStateText: currentWsState === WebSocket.OPEN ? "OPEN" : currentWsState === WebSocket.CONNECTING ? "CONNECTING" : currentWsState === WebSocket.CLOSING ? "CLOSING" : "CLOSED"
        });
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
      
      // Only log periodically to avoid console spam
      if (now % 10000 < 3000) {
        console.log(`🔄 Job polling fallback: Checking ${jobIdList.length} active jobs (WebSocket disconnected)`);
      }
      
      // Fetch each active job individually to get latest status
      for (const jobId of jobIdList) {
        // Check again before each fetch (double-check)
        const checkWsState = wsRef.current?.readyState;
        if (isConnected || checkWsState === WebSocket.OPEN || checkWsState === WebSocket.CONNECTING) {
          console.log("✅ WebSocket connected/connecting during job fetch - stopping polling");
          if (pollIntervalRef.current) {
            clearInterval(pollIntervalRef.current);
            pollIntervalRef.current = null;
            isPollingRef.current = false;
          }
          return;
        }
        
        try {
          await fetchJob(jobId);
        } catch (error) {
          console.debug(`Poll: Failed to fetch job ${jobId}:`, error);
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
    
    // Wait a bit before starting polling to give WebSocket a chance to connect
    // This prevents race conditions where polling starts before WebSocket connection attempt
    pollingDelayTimeoutRef.current = setTimeout(() => {
      // IMPORTANT: Check current state (not captured state) - use refs to get latest values
      // The isConnected state might have changed during the delay
      const currentWsState = wsRef.current?.readyState;
      const currentIsConnected = isConnected; // This is from closure, but we'll check wsState too
      const currentIsOpen = currentWsState === WebSocket.OPEN;
      const currentIsConnecting = currentWsState === WebSocket.CONNECTING;
      
      console.log("⏰ Delayed polling check after 2s:", {
        isConnected: currentIsConnected,
        currentWsState,
        currentIsOpen,
        currentIsConnecting,
        wsStateText: currentWsState === WebSocket.OPEN ? "OPEN" : 
                     currentWsState === WebSocket.CONNECTING ? "CONNECTING" :
                     currentWsState === WebSocket.CLOSING ? "CLOSING" :
                     currentWsState === WebSocket.CLOSED ? "CLOSED" : "NO_WEBSOCKET",
        hasActiveInterval: !!pollIntervalRef.current,
      });
      
      // CRITICAL: Don't start polling if WebSocket is connected or connecting
      if (currentIsConnected || currentIsOpen || currentIsConnecting) {
        console.log("✅ WebSocket connected/connecting while waiting to start polling - cancelling polling start");
        isPollingRef.current = false;
        // Make sure polling is stopped
        if (pollIntervalRef.current) {
          clearInterval(pollIntervalRef.current);
          pollIntervalRef.current = null;
        }
        return;
      }
      
      // Only start polling if WebSocket is definitely closed/failed AND we're not already polling
      if ((currentWsState === WebSocket.CLOSED || currentWsState === undefined) && !pollIntervalRef.current) {
        console.warn("⚠️ STARTING POLLING FALLBACK (WebSocket failed to connect or closed)", {
          activeJobs: jobIdList.length,
          jobIds: jobIdList,
          isConnected: currentIsConnected,
          wsState: currentWsState,
          wsStateText: currentWsState === WebSocket.CLOSED ? "CLOSED" : "NO_WEBSOCKET",
          reason: "WebSocket connection failed or closed after 2s wait",
        });
        
        // Initial poll
        pollActiveJobs();
        
        // Set up interval - poll every 3 seconds when WebSocket is disconnected
        pollIntervalRef.current = setInterval(pollActiveJobs, 3000);
      } else {
        if (pollIntervalRef.current) {
          console.log("⏸️ Polling already active, not starting duplicate");
        } else {
          console.log("⏸️ WebSocket in unexpected state, not starting polling:", {
            wsState: currentWsState,
            wsStateText: currentWsState === WebSocket.OPEN ? "OPEN" : 
                         currentWsState === WebSocket.CONNECTING ? "CONNECTING" :
                         currentWsState === WebSocket.CLOSING ? "CLOSING" : "UNKNOWN",
          });
        }
        isPollingRef.current = false;
      }
    }, 2000); // Wait 2 seconds before starting polling
    
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
    
    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
        isPollingRef.current = false;
      }
    };
  }, [activeJobIds, token, isConnected, fetchJob]);

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



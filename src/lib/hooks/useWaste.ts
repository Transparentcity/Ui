"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useAuth0 } from "@auth0/auth0-react"
import {
  assignWasteQueueItem,
  bulkDisposeWasteFindings,
  closeInvestigation,
  createInvestigationAction,
  createWasteDisposition,
  cancelJob,
  getJob,
  listJobs,
  getWasteDetectorAccuracy,
  getWasteDispositions,
  getWasteAnalysis,
  getWasteRunResult,
  getWasteEntityScores,
  getWasteInvestigation,
  getWasteInvestigations,
  getWasteReviewQueue,
  getWasteSummary,
  getWasteThresholds,
  listWasteRuns,
  runWasteAnalysis,
  syncWasteReviewQueue,
  updateWasteThresholds,
  type Job,
  type BulkDisposeWasteFindingsRequest,
  type CloseInvestigationRequest,
  type CreateInvestigationActionRequest,
  type CreateWasteDispositionRequest,
  type RunWasteAnalysisRequest,
  type SyncWasteReviewQueueRequest,
  type UpdateThresholdRequest,
  type WasteDetectorAccuracy,
  type WasteDisposition,
  type WasteEntityScoresPage,
  type WasteInvestigation,
  type WasteInvestigationsPage,
  type WasteReviewQueuePage,
  type WasteAnalyzeResponse,
  type WasteRun,
  type WasteRunJobResponse,
  type WasteSummaryResponse,
  type WasteThreshold,
} from "@/lib/apiClient"

/**
 * Fetch waste analysis findings with TanStack Query.
 *
 * The query is enabled by default (`enabled = true`) but callers can
 * disable it to defer loading (e.g. display cached localStorage first).
 * Call the returned `forceRefetch()` to run a fresh analysis with
 * `force_refresh=true`.
 */
export function useWasteAnalysis(
  category?: string,
  enabled: boolean = true,
) {
  const { getAccessTokenSilently, isAuthenticated } = useAuth0()
  const forceRefreshRef = useRef(false)

  const query = useQuery<WasteAnalyzeResponse>({
    queryKey: ["waste", "analysis", category ?? "all"],
    queryFn: async () => {
      const token = await getAccessTokenSilently()
      const shouldForce = forceRefreshRef.current
      forceRefreshRef.current = false
      return getWasteAnalysis(token, category, shouldForce)
    },
    enabled: isAuthenticated && enabled,
    staleTime: 10 * 60 * 1000, // 10 minutes — analysis is expensive
    gcTime: 30 * 60 * 1000, // keep in cache 30 min to avoid re-fetching on navigation
    retry: 1,
    refetchOnWindowFocus: false,
  })

  /** Trigger a fresh analysis with `force_refresh=true`. */
  const forceRefetch = useCallback(() => {
    forceRefreshRef.current = true
    return query.refetch()
  }, [query])

  return { ...query, forceRefetch }
}

/**
 * Track active waste analysis jobs with polling.
 *
 * On mount, checks for any pending/running waste_analysis_run job.
 * When `startJob` is called it POSTs to /run and begins polling.
 * Returns live job progress so the page can show a real progress bar.
 */
export function useActiveWasteJob(cityId: number | null) {
  const { getAccessTokenSilently, isAuthenticated } = useAuth0()
  const queryClient = useQueryClient()
  const [activeJob, setActiveJob] = useState<Job | null>(null)
  const [isStarting, setIsStarting] = useState(false)
  const [startError, setStartError] = useState<string | null>(null)
  const [retryCount, setRetryCount] = useState(0)
  const [lastDiagnostics, setLastDiagnostics] = useState<{
    lastProgress: number
    lastStatusMessage: string
    lastUpdateAt: string
    startedAt: string | null
    jobId: string
  } | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const retryCountRef = useRef(0)
  const lastProgressSnapshotRef = useRef<{ progress: number; statusMessage: string; updatedAt: number }>({
    progress: 0, statusMessage: "", updatedAt: Date.now(),
  })

  const MAX_AUTO_RETRIES = 1

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearTimeout(pollRef.current)
      pollRef.current = null
    }
  }, [])

  // Forward declaration — startNewJob needs pollJob and vice versa
  const startNewJobRef = useRef<((category?: string) => Promise<void>) | null>(null)

  const pollJob = useCallback(
    async (jobId: string) => {
      let shouldContinue = true
      try {
        const token = await getAccessTokenSilently()
        const job = await getJob(jobId, token)

        // Track the last known progress for diagnostics
        if (job.progress !== lastProgressSnapshotRef.current.progress ||
            job.status_message !== lastProgressSnapshotRef.current.statusMessage) {
          lastProgressSnapshotRef.current = {
            progress: job.progress ?? 0,
            statusMessage: job.status_message ?? "",
            updatedAt: Date.now(),
          }
        }

        // Detect stale jobs via two signals:
        // 1) Total age > 6 min (backend hard-kills at 5 min, so 6 = safe margin)
        // 2) Progress hasn't changed in 3 min (job is stuck even if young)
        const MAX_JOB_AGE_MS = 6 * 60 * 1000
        const PROGRESS_STALL_MS = 2.5 * 60 * 1000 // slightly under backend's 2-min detector timeout
        const createdAt = new Date(job.created_at).getTime()
        const jobAgeMs = Date.now() - createdAt
        const progressStallMs = Date.now() - lastProgressSnapshotRef.current.updatedAt
        const isActiveStatus = job.status === "running" || job.status === "pending"
        const isStale = isActiveStatus && (
          jobAgeMs > MAX_JOB_AGE_MS ||
          (progressStallMs > PROGRESS_STALL_MS && jobAgeMs > 60_000) // only after 1 min to avoid false positives on startup
        )

        if (isStale) {
          shouldContinue = false
          // Save diagnostics so the UI can show where it got stuck
          const snap = lastProgressSnapshotRef.current
          setLastDiagnostics({
            lastProgress: snap.progress,
            lastStatusMessage: snap.statusMessage,
            lastUpdateAt: new Date(snap.updatedAt).toISOString(),
            startedAt: job.started_at ?? null,
            jobId,
          })
          // Auto-retry if under the limit
          if (retryCountRef.current < MAX_AUTO_RETRIES && cityId && startNewJobRef.current) {
            retryCountRef.current += 1
            setRetryCount(retryCountRef.current)
            setActiveJob({
              ...job,
              status: "pending",
              status_message: `Previous attempt timed out — retrying (attempt ${retryCountRef.current + 1} of ${MAX_AUTO_RETRIES + 1})...`,
              progress: 0,
            })
            // Small delay before retrying to let the server settle
            await new Promise((r) => setTimeout(r, 2000))
            await startNewJobRef.current()
          } else {
            const ageMin = Math.round(jobAgeMs / 60_000)
            setActiveJob({
              ...job,
              status: "failed",
              error_message:
                `Analysis has been running for ${ageMin} minutes without completing` +
                (retryCountRef.current > 0 ? ` (after ${retryCountRef.current + 1} attempts)` : "") +
                `. The server may have restarted or a detector may be stuck. ` +
                `Job ID: ${jobId}`,
            })
          }
          return
        }

        setActiveJob(job)
        if (
          job.status === "completed" ||
          job.status === "failed" ||
          job.status === "cancelled"
        ) {
          shouldContinue = false
          // Refresh analysis data now that the job is done
          if (job.status === "completed") {
            retryCountRef.current = 0
            setRetryCount(0)
            setLastDiagnostics(null)
            queryClient.invalidateQueries({ queryKey: ["waste", "analysis"] })
            queryClient.invalidateQueries({ queryKey: ["waste", "persisted"] })
            queryClient.invalidateQueries({ queryKey: ["waste", "summary"] })
            queryClient.invalidateQueries({ queryKey: ["waste", "queue"] })
          }
        }
      } catch {
        // network blip — keep polling
      } finally {
        // Chain next poll with setTimeout to prevent overlapping requests
        if (shouldContinue && pollRef.current !== null) {
          pollRef.current = setTimeout(() => pollJob(jobId), 3000)
        }
      }
    },
    [getAccessTokenSilently, queryClient, cityId]
  )

  const startPolling = useCallback(
    (jobId: string) => {
      stopPolling()
      // Poll immediately, chain subsequent polls via setTimeout in pollJob
      pollRef.current = -1 as unknown as ReturnType<typeof setTimeout> // sentinel: polling active
      pollJob(jobId)
    },
    [pollJob, stopPolling]
  )

  // On mount, check for any active waste job
  useEffect(() => {
    if (!isAuthenticated) return
    let cancelled = false

    ;(async () => {
      try {
        const token = await getAccessTokenSilently()
        const result = await listJobs(token, 5, "running", undefined, "waste_analysis_run")
        const running = result.jobs?.[0]
        if (cancelled) return
        if (running) {
          setActiveJob(running)
          startPolling(running.job_id)
        } else {
          // Also check pending
          const pending = await listJobs(token, 5, "pending", undefined, "waste_analysis_run")
          if (cancelled) return
          const pendingJob = pending.jobs?.[0]
          if (pendingJob) {
            setActiveJob(pendingJob)
            startPolling(pendingJob.job_id)
          }
        }
      } catch {
        // ignore
      }
    })()

    return () => {
      cancelled = true
      stopPolling()
    }
  }, [isAuthenticated]) // eslint-disable-line react-hooks/exhaustive-deps

  /** Kick off a new waste analysis run and start polling it.
   *  Auto-retries up to 2 times on gateway errors (502/503/504) with backoff. */
  const startJob = useCallback(
    async (category?: string) => {
      if (!cityId) {
        console.error("[useActiveWasteJob] Cannot start job: cityId is null")
        setStartError("No city selected. Please wait for city data to load or reload the page.")
        return
      }
      setIsStarting(true)
      setStartError(null)

      const MAX_START_RETRIES = 2
      const RETRY_DELAYS = [3000, 6000] // backoff: 3s, 6s

      for (let attempt = 0; attempt <= MAX_START_RETRIES; attempt++) {
        try {
          const token = await getAccessTokenSilently()
          const result: WasteRunJobResponse = await runWasteAnalysis(token, {
            city_id: cityId,
            category,
            force_refresh: true,
            persist: true,
          })
          const jobId = result.job_id ?? result.existing_job_id
          if (jobId) {
            setActiveJob({
              job_id: jobId,
              job_type: "waste_analysis_run",
              status: "pending",
              description: "Waste analysis",
              progress: 0,
              created_at: new Date().toISOString(),
            })
            startPolling(jobId)
          } else {
            console.error("[useActiveWasteJob] No job_id in response:", result)
            setStartError("Server did not return a job ID. Check the backend logs.")
          }
          setIsStarting(false)
          return
        } catch (err) {
          const status = (err as { status?: number }).status
          const isGatewayError = status === 502 || status === 503 || status === 504
          if (isGatewayError && attempt < MAX_START_RETRIES) {
            console.warn(`[useActiveWasteJob] Attempt ${attempt + 1} failed with ${status}, retrying in ${RETRY_DELAYS[attempt]}ms...`)
            setActiveJob({
              job_id: `retry-${attempt}`,
              job_type: "waste_analysis_run",
              status: "pending",
              description: "Waste analysis",
              progress: 0,
              status_message: `Server returned ${status} — retrying (attempt ${attempt + 2} of ${MAX_START_RETRIES + 1})...`,
              created_at: new Date().toISOString(),
            })
            await new Promise((r) => setTimeout(r, RETRY_DELAYS[attempt]))
            continue
          }
          const msg = err instanceof Error ? err.message : String(err)
          console.error("[useActiveWasteJob] Failed to start job:", msg)
          setStartError(`Failed to start analysis: ${msg}`)
          setActiveJob(null)
          setIsStarting(false)
          return
        }
      }
      setIsStarting(false)
    },
    [cityId, getAccessTokenSilently, startPolling]
  )

  // Keep the ref in sync so pollJob's auto-retry can call startJob
  startNewJobRef.current = startJob

  /** User-initiated start resets retry counter and diagnostics */
  const startJobWithReset = useCallback(
    async (category?: string) => {
      retryCountRef.current = 0
      setRetryCount(0)
      setLastDiagnostics(null)
      setStartError(null)
      lastProgressSnapshotRef.current = { progress: 0, statusMessage: "", updatedAt: Date.now() }
      return startJob(category)
    },
    [startJob]
  )

  /** Cancel the active job and stop polling. */
  const cancelActiveJob = useCallback(async () => {
    if (!activeJob?.job_id) return
    stopPolling()
    try {
      const token = await getAccessTokenSilently()
      await cancelJob(activeJob.job_id, token)
    } catch {
      // best-effort
    }
    setActiveJob(null)
    retryCountRef.current = 0
    setRetryCount(0)
    setLastDiagnostics(null)
    setStartError(null)
  }, [activeJob?.job_id, getAccessTokenSilently, stopPolling])

  const isRunning =
    isStarting ||
    (activeJob != null &&
      (activeJob.status === "pending" || activeJob.status === "running"))

  return { activeJob, isRunning, isStarting, startJob: startJobWithReset, cancelJob: cancelActiveJob, startError, retryCount, lastDiagnostics }
}

/**
 * Fetch just the waste summary stats (for the stat bar).
 */
export function useWasteSummary() {
  const { getAccessTokenSilently, isAuthenticated } = useAuth0()

  return useQuery<WasteSummaryResponse>({
    queryKey: ["waste", "summary"],
    queryFn: async () => {
      const token = await getAccessTokenSilently()
      return getWasteSummary(token)
    },
    enabled: isAuthenticated,
    staleTime: 5 * 60 * 1000,
    retry: 1,
  })
}

export function useLatestWasteRun(
  cityId: number | null,
  category?: string,
  enabled: boolean = true
) {
  const { getAccessTokenSilently, isAuthenticated } = useAuth0()

  return useQuery<WasteRun | null>({
    queryKey: ["waste", "runs", "latest", cityId, category ?? ""],
    queryFn: async () => {
      if (!cityId) throw new Error("City ID required")
      const token = await getAccessTokenSilently()
      const runs = await listWasteRuns(token, cityId, category, 1)
      return runs.length > 0 ? runs[0] : null
    },
    enabled: isAuthenticated && !!cityId && enabled,
    staleTime: 60 * 1000,
    refetchOnWindowFocus: false,
  })
}

/**
 * Load the latest *completed* persisted run result from the database.
 * This is fast (DB read, no analysis) and gives the user instant data
 * even when a fresh analysis would time out.
 */
export function useLatestPersistedWasteResult(cityId: number | null) {
  const { getAccessTokenSilently, isAuthenticated } = useAuth0()

  return useQuery<WasteAnalyzeResponse | null>({
    queryKey: ["waste", "persisted", cityId],
    queryFn: async () => {
      if (!cityId) return null
      const token = await getAccessTokenSilently()
      // Find the latest completed run (filter server-side)
      const runs = await listWasteRuns(token, cityId, undefined, 1, "completed")
      const latestRun = runs[0]
      if (!latestRun) return null
      try {
        return await getWasteRunResult(token, Number(latestRun.id), cityId)
      } catch {
        return null
      }
    },
    enabled: isAuthenticated && !!cityId,
    staleTime: 10 * 60 * 1000, // 10 min — persisted data doesn't change often
    refetchOnWindowFocus: false,
  })
}

export function useWasteReviewQueue(params: {
  cityId: number | null
  status?: string
  priority?: string
  assignedTo?: string
  page?: number
  perPage?: number
  enabled?: boolean
}) {
  const { getAccessTokenSilently, isAuthenticated } = useAuth0()
  const enabled =
    isAuthenticated && !!params.cityId && (params.enabled ?? true)

  return useQuery<WasteReviewQueuePage>({
    queryKey: [
      "waste",
      "queue",
      params.cityId,
      params.status ?? "",
      params.priority ?? "",
      params.assignedTo ?? "",
      params.page ?? 1,
      params.perPage ?? 25,
    ],
    queryFn: async () => {
      if (!params.cityId) throw new Error("City ID required")
      const token = await getAccessTokenSilently()
      return getWasteReviewQueue(token, {
        city_id: params.cityId,
        status: params.status,
        priority: params.priority,
        assigned_to: params.assignedTo,
        page: params.page ?? 1,
        per_page: params.perPage ?? 25,
      })
    },
    enabled,
    staleTime: 30 * 1000,
    refetchOnWindowFocus: false,
  })
}

export function useWasteDetectorAccuracy(cityId: number | null, detectorKey?: string) {
  const { getAccessTokenSilently, isAuthenticated } = useAuth0()

  return useQuery<WasteDetectorAccuracy[]>({
    queryKey: ["waste", "accuracy", cityId, detectorKey ?? ""],
    queryFn: async () => {
      if (!cityId) throw new Error("City ID required")
      const token = await getAccessTokenSilently()
      return getWasteDetectorAccuracy(token, cityId, detectorKey)
    },
    enabled: isAuthenticated && !!cityId,
    staleTime: 60 * 1000,
    refetchOnWindowFocus: false,
  })
}

export function useWasteDispositions(
  findingId: number | null,
  cityId: number | null,
  enabled: boolean = true
) {
  const { getAccessTokenSilently, isAuthenticated } = useAuth0()
  return useQuery<WasteDisposition[]>({
    queryKey: ["waste", "dispositions", cityId, findingId],
    queryFn: async () => {
      if (!findingId || !cityId) throw new Error("Finding ID and city ID required")
      const token = await getAccessTokenSilently()
      return getWasteDispositions(token, findingId, cityId)
    },
    enabled: isAuthenticated && !!findingId && !!cityId && enabled,
    staleTime: 15 * 1000,
    refetchOnWindowFocus: false,
  })
}

export function useCreateWasteDisposition() {
  const { getAccessTokenSilently } = useAuth0()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (payload: {
      findingId: number
      data: CreateWasteDispositionRequest
    }) => {
      const token = await getAccessTokenSilently()
      return createWasteDisposition(token, payload.findingId, payload.data)
    },
    onSuccess: (_result, payload) => {
      queryClient.invalidateQueries({ queryKey: ["waste", "queue"] })
      queryClient.invalidateQueries({
        queryKey: ["waste", "accuracy", payload.data.city_id],
      })
      queryClient.invalidateQueries({
        queryKey: ["waste", "dispositions", payload.data.city_id, payload.findingId],
      })
    },
  })
}

export function useAssignWasteQueueItem() {
  const { getAccessTokenSilently } = useAuth0()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (payload: {
      itemId: string
      cityId: number
      assignedTo: string
    }) => {
      const token = await getAccessTokenSilently()
      return assignWasteQueueItem(token, payload.itemId, payload.cityId, {
        assigned_to: payload.assignedTo,
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["waste", "queue"] })
    },
  })
}

export function useBulkDisposeWasteFindings() {
  const { getAccessTokenSilently } = useAuth0()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (payload: BulkDisposeWasteFindingsRequest) => {
      const token = await getAccessTokenSilently()
      return bulkDisposeWasteFindings(token, payload)
    },
    onSuccess: (_res, payload) => {
      queryClient.invalidateQueries({ queryKey: ["waste", "queue"] })
      queryClient.invalidateQueries({
        queryKey: ["waste", "accuracy", payload.city_id],
      })
      for (const findingId of payload.finding_ids) {
        queryClient.invalidateQueries({
          queryKey: ["waste", "dispositions", payload.city_id, findingId],
        })
      }
    },
  })
}

export function useSyncWasteReviewQueue() {
  const { getAccessTokenSilently } = useAuth0()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (payload: SyncWasteReviewQueueRequest) => {
      const token = await getAccessTokenSilently()
      return syncWasteReviewQueue(token, payload)
    },
    onSuccess: (_res, payload) => {
      queryClient.invalidateQueries({ queryKey: ["waste", "queue"] })
      queryClient.invalidateQueries({
        queryKey: ["waste", "accuracy", payload.city_id],
      })
    },
  })
}

export function useRunWasteAnalysis() {
  const { getAccessTokenSilently } = useAuth0()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (payload: RunWasteAnalysisRequest) => {
      const token = await getAccessTokenSilently()
      return runWasteAnalysis(token, payload)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["waste", "analysis"] })
      queryClient.invalidateQueries({ queryKey: ["waste", "summary"] })
      queryClient.invalidateQueries({ queryKey: ["waste", "queue"] })
    },
  })
}

// ── Entity Scores ──────────────────────────────────────────────────────────

export function useWasteEntityScores(params: {
  cityId: number | null
  page?: number
  perPage?: number
  severityTier?: string
  entityType?: string
  sortBy?: string
  sortDir?: "asc" | "desc"
  enabled?: boolean
}) {
  const { getAccessTokenSilently, isAuthenticated } = useAuth0()
  const enabled =
    isAuthenticated && !!params.cityId && (params.enabled ?? true)

  return useQuery<WasteEntityScoresPage>({
    queryKey: [
      "waste",
      "scores",
      params.cityId,
      params.page ?? 1,
      params.perPage ?? 25,
      params.severityTier ?? "",
      params.entityType ?? "",
      params.sortBy ?? "",
      params.sortDir ?? "",
    ],
    queryFn: async () => {
      if (!params.cityId) throw new Error("City ID required")
      const token = await getAccessTokenSilently()
      return getWasteEntityScores(token, {
        city_id: params.cityId,
        page: params.page ?? 1,
        per_page: params.perPage ?? 25,
        severity_tier: params.severityTier,
        entity_type: params.entityType,
        sort_by: params.sortBy,
        sort_dir: params.sortDir,
      })
    },
    enabled,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  })
}

// ── Investigations ─────────────────────────────────────────────────────────

export function useWasteInvestigations(params: {
  cityId: number | null
  status?: string
  page?: number
  perPage?: number
  enabled?: boolean
}) {
  const { getAccessTokenSilently, isAuthenticated } = useAuth0()
  const enabled =
    isAuthenticated && !!params.cityId && (params.enabled ?? true)

  return useQuery<WasteInvestigationsPage>({
    queryKey: [
      "waste",
      "investigations",
      params.cityId,
      params.status ?? "",
      params.page ?? 1,
      params.perPage ?? 25,
    ],
    queryFn: async () => {
      if (!params.cityId) throw new Error("City ID required")
      const token = await getAccessTokenSilently()
      return getWasteInvestigations(token, {
        city_id: params.cityId,
        status: params.status,
        page: params.page,
        per_page: params.perPage,
      })
    },
    enabled,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  })
}

export function useWasteInvestigation(investigationId: string | null) {
  const { getAccessTokenSilently, isAuthenticated } = useAuth0()

  return useQuery<WasteInvestigation>({
    queryKey: ["waste", "investigation", investigationId],
    queryFn: async () => {
      if (!investigationId) throw new Error("Investigation ID required")
      const token = await getAccessTokenSilently()
      return getWasteInvestigation(token, investigationId)
    },
    enabled: isAuthenticated && !!investigationId,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  })
}

export function useCreateInvestigationAction() {
  const { getAccessTokenSilently } = useAuth0()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (payload: {
      investigationId: string
      data: CreateInvestigationActionRequest
    }) => {
      const token = await getAccessTokenSilently()
      return createInvestigationAction(
        token,
        payload.investigationId,
        payload.data
      )
    },
    onSuccess: (_res, payload) => {
      queryClient.invalidateQueries({
        queryKey: ["waste", "investigation", payload.investigationId],
      })
      queryClient.invalidateQueries({ queryKey: ["waste", "investigations"] })
    },
  })
}

export function useCloseInvestigation() {
  const { getAccessTokenSilently } = useAuth0()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (payload: {
      investigationId: string
      data: CloseInvestigationRequest
    }) => {
      const token = await getAccessTokenSilently()
      return closeInvestigation(token, payload.investigationId, payload.data)
    },
    onSuccess: (_res, payload) => {
      queryClient.invalidateQueries({
        queryKey: ["waste", "investigation", payload.investigationId],
      })
      queryClient.invalidateQueries({ queryKey: ["waste", "investigations"] })
    },
  })
}

// ── Thresholds ─────────────────────────────────────────────────────────────

export function useWasteThresholds(cityId: number | null) {
  const { getAccessTokenSilently, isAuthenticated } = useAuth0()

  return useQuery<WasteThreshold[]>({
    queryKey: ["waste", "thresholds", cityId],
    queryFn: async () => {
      if (!cityId) throw new Error("City ID required")
      const token = await getAccessTokenSilently()
      return getWasteThresholds(token, cityId)
    },
    enabled: isAuthenticated && !!cityId,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  })
}

export function useUpdateWasteThresholds() {
  const { getAccessTokenSilently } = useAuth0()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (payload: {
      cityId: number
      updates: UpdateThresholdRequest[]
    }) => {
      const token = await getAccessTokenSilently()
      return updateWasteThresholds(token, payload.cityId, payload.updates)
    },
    onSuccess: (_res, payload) => {
      queryClient.invalidateQueries({
        queryKey: ["waste", "thresholds", payload.cityId],
      })
    },
  })
}

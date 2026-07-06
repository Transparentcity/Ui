"use client"

import { useCallback, useRef } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useAuth0 } from "@auth0/auth0-react"
import {
  createWasteDisposition,
  getWasteDetectorAccuracy,
  getWasteAnalysis,
  getWasteRunResult,
  getWasteEntityScores,
  getWasteReviewQueue,
  getWasteCityMethodology,
  getWasteSystemMethodology,
  getWasteThresholds,
  listWasteRuns,
  updateWasteThresholds,
  type CreateWasteDispositionRequest,
  type UpdateThresholdRequest,
  type WasteDetectorAccuracy,
  type WasteEntityScoresPage,
  type WasteReviewQueuePage,
  type WasteAnalyzeResponse,
  type WasteRun,
  type WasteThreshold,
  type CityMethodologyResponse,
  type SystemMethodologyResponse,
} from "@/lib/apiClient"
import {
  mergePersistedRuns,
  type PersistedRunBundle,
} from "@/components/waste/waste-utils"
import { WASTE_CACHE_MAX_AGE } from "@/lib/wasteQueryPersister"

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
  cityId?: number,
) {
  const { getAccessTokenSilently, isAuthenticated } = useAuth0()
  const forceRefreshRef = useRef(false)

  const query = useQuery<WasteAnalyzeResponse>({
    queryKey: ["waste", "analysis", category ?? "all", cityId ?? "default"],
    queryFn: async () => {
      const token = await getAccessTokenSilently()
      const shouldForce = forceRefreshRef.current
      forceRefreshRef.current = false
      return getWasteAnalysis(token, category, shouldForce, cityId)
    },
    enabled: isAuthenticated && enabled,
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
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
 * Load persisted run results from the database, merging the last few
 * completed runs so that a single timed-out detector doesn't wipe out a
 * whole category from the UI.
 *
 * For each category, findings are taken from the most recent run that did
 * not record an error for that family. The newest run's data_freshness and
 * analysis_timestamp are used as the headline timestamp; `carriedOver`
 * reports any categories sourced from an older run.
 */
export function useLatestPersistedWasteResult(cityId: number | null) {
  const { getAccessTokenSilently, isAuthenticated } = useAuth0()

  return useQuery<WasteAnalyzeResponse | null>({
    queryKey: ["waste", "persisted", cityId],
    queryFn: async () => {
      if (!cityId) return null
      const token = await getAccessTokenSilently()
      // 10 completed runs ≈ 10 weeks of carry-over headroom: a detector
      // family has to fail that many consecutive runs before its category
      // can go blank. mergePersistedRuns is coverage-aware (it only trusts
      // a run for categories it actually ran), so category-scoped runs in
      // the window are harmless.
      const allRuns = await listWasteRuns(token, cityId, undefined, 10, "completed")
      if (allRuns.length === 0) return null

      // The run list already carries each run's errors (both the list and
      // the result endpoint read the same waste_runs.errors column, so
      // stopping on list-level errors can't diverge from what the merge
      // sees). Older runs only matter as carry-over sources when a newer
      // run errored, so stop fetching result payloads at the first full run
      // with no errors. In the common healthy case this fetches exactly one
      // result.
      const cleanFullIndex = allRuns.findIndex(
        (run) => run.category == null && (run.errors ?? []).length === 0,
      )
      const runs =
        cleanFullIndex >= 0 ? allRuns.slice(0, cleanFullIndex + 1) : allRuns

      const bundles = await Promise.all(
        runs.map(async (run) => {
          try {
            const response = await getWasteRunResult(token, Number(run.id), cityId)
            return {
              analysisTimestamp: response.analysis_timestamp ?? run.analysis_timestamp,
              errors: response.errors ?? run.errors ?? [],
              response,
              category: run.category,
            } satisfies PersistedRunBundle
          } catch {
            return null
          }
        })
      )

      const usable: PersistedRunBundle[] = bundles.filter(
        (b): b is Exclude<(typeof bundles)[number], null> => b !== null
      )
      // Runs exist but every result fetch failed: that's an outage, not a
      // first-run state. Throw so the query errors instead of returning the
      // null that consumers read as "no analysis has run yet".
      if (usable.length === 0) {
        throw new Error(
          `Failed to load results for ${runs.length} completed run(s)`,
        )
      }

      const merged = mergePersistedRuns(usable)
      return merged?.response ?? null
    },
    enabled: isAuthenticated && !!cityId,
    staleTime: 10 * 60 * 1000, // 10 min — persisted data doesn't change often
    // This query is persisted to IndexedDB (see wasteQueryPersister.ts);
    // its in-memory lifetime must be >= the persisted maxAge or an
    // in-memory GC would drop it from disk on the next persist write.
    gcTime: WASTE_CACHE_MAX_AGE,
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

/**
 * Record an auditor verdict (flag / dismiss) on a finding. Dispositions feed
 * detector precision, which in turn calibrates finding severity — this is
 * the learning loop, so every triage click makes the detectors sharper.
 */
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
      queryClient.invalidateQueries({
        queryKey: ["waste", "accuracy", payload.data.city_id],
      })
    },
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


// ── AI Auditor Review ─────────────────────────────────────────────────


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

export function useWasteCityMethodology(cityId: number | null) {
  const { getAccessTokenSilently, isAuthenticated } = useAuth0()

  return useQuery<CityMethodologyResponse>({
    queryKey: ["waste", "methodology", "city", cityId],
    queryFn: async () => {
      if (!cityId) throw new Error("City ID required")
      const token = await getAccessTokenSilently()
      return getWasteCityMethodology(token, cityId)
    },
    enabled: isAuthenticated && !!cityId,
    staleTime: 10 * 60 * 1000,
    retry: 1,
  })
}

export function useWasteSystemMethodology() {
  const { getAccessTokenSilently, isAuthenticated } = useAuth0()

  return useQuery<SystemMethodologyResponse>({
    queryKey: ["waste", "methodology", "system"],
    queryFn: async () => {
      const token = await getAccessTokenSilently()
      return getWasteSystemMethodology(token)
    },
    enabled: isAuthenticated,
    staleTime: 10 * 60 * 1000,
    retry: 1,
  })
}

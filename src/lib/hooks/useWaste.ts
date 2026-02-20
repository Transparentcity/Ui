"use client"

import { useCallback, useRef } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useAuth0 } from "@auth0/auth0-react"
import {
  assignWasteQueueItem,
  bulkDisposeWasteFindings,
  createWasteDisposition,
  getWasteDetectorAccuracy,
  getWasteDispositions,
  getWasteAnalysis,
  getWasteReviewQueue,
  getWasteSummary,
  listWasteRuns,
  runWasteAnalysis,
  syncWasteReviewQueue,
  type BulkDisposeWasteFindingsRequest,
  type CreateWasteDispositionRequest,
  type RunWasteAnalysisRequest,
  type SyncWasteReviewQueueRequest,
  type WasteDetectorAccuracy,
  type WasteDisposition,
  type WasteReviewQueuePage,
  type WasteAnalyzeResponse,
  type WasteRun,
  type WasteSummaryResponse,
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
  cityId?: number | null,
  persistOnForceRefresh: boolean = false
) {
  const { getAccessTokenSilently, isAuthenticated } = useAuth0()
  const forceRefreshRef = useRef(false)

  const query = useQuery<WasteAnalyzeResponse>({
    queryKey: ["waste", "analysis", category ?? "all", cityId ?? "none"],
    queryFn: async () => {
      const token = await getAccessTokenSilently()
      const shouldForce = forceRefreshRef.current
      forceRefreshRef.current = false
      if (shouldForce && persistOnForceRefresh && cityId) {
        const payload: RunWasteAnalysisRequest = {
          city_id: cityId,
          category,
          force_refresh: true,
          persist: true,
        }
        return runWasteAnalysis(token, payload)
      }
      return getWasteAnalysis(token, category, shouldForce)
    },
    enabled: isAuthenticated && enabled,
    staleTime: 5 * 60 * 1000, // 5 minutes
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

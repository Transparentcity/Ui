"use client"

import { useCallback, useRef } from "react"
import { useQuery } from "@tanstack/react-query"
import { useAuth0 } from "@auth0/auth0-react"
import {
  getWasteAnalysis,
  getWasteSummary,
  type WasteAnalyzeResponse,
  type WasteSummaryResponse,
} from "@/lib/apiClient"

/**
 * Fetch waste analysis findings with TanStack Query.
 *
 * The query is disabled by default (`enabled = false`) so the page can
 * display cached localStorage data first.  Call the returned
 * `forceRefetch()` to run a fresh analysis with `force_refresh=true`.
 */
export function useWasteAnalysis(
  category?: string,
  enabled: boolean = true
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

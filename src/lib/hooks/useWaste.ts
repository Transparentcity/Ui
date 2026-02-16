"use client"

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
 * Refetches on category change; stale after 5 minutes.
 */
export function useWasteAnalysis(
  category?: string,
  forceRefresh?: boolean,
  enabled: boolean = true
) {
  const { getAccessTokenSilently, isAuthenticated } = useAuth0()

  return useQuery<WasteAnalyzeResponse>({
    queryKey: ["waste", "analysis", category ?? "all", forceRefresh],
    queryFn: async () => {
      const token = await getAccessTokenSilently()
      return getWasteAnalysis(token, category, forceRefresh)
    },
    enabled: isAuthenticated && enabled,
    staleTime: 5 * 60 * 1000, // 5 minutes
    retry: 1,
  })
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

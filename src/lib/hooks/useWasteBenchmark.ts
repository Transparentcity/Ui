"use client"

import { useQuery } from "@tanstack/react-query"
import { useAuth0 } from "@auth0/auth0-react"
import {
  getWasteBenchmarkSummary,
  getWasteBenchmarkEntityRank,
  type BenchmarkSummaryResponse,
  type BenchmarkEntityRankResponse,
} from "@/lib/apiClient"

export function useWasteBenchmarkSummary(cityId: number | null) {
  const { getAccessTokenSilently, isAuthenticated } = useAuth0()

  return useQuery<BenchmarkSummaryResponse>({
    queryKey: ["waste", "benchmark", "summary", cityId],
    queryFn: async () => {
      if (!cityId) throw new Error("City ID required")
      const token = await getAccessTokenSilently()
      return getWasteBenchmarkSummary(token, cityId)
    },
    enabled: isAuthenticated && !!cityId,
    staleTime: 10 * 60 * 1000,
    retry: 1,
  })
}

export function useWasteBenchmarkEntityRank(
  cityId: number | null,
  entityType?: string
) {
  const { getAccessTokenSilently, isAuthenticated } = useAuth0()

  return useQuery<BenchmarkEntityRankResponse>({
    queryKey: ["waste", "benchmark", "entity-rank", cityId, entityType ?? ""],
    queryFn: async () => {
      if (!cityId) throw new Error("City ID required")
      const token = await getAccessTokenSilently()
      return getWasteBenchmarkEntityRank(token, cityId, entityType)
    },
    enabled: isAuthenticated && !!cityId,
    staleTime: 10 * 60 * 1000,
    retry: 1,
  })
}

"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth0 } from "@auth0/auth0-react";
import {
  runAnomalyDetection,
  listAnomalies,
  getAnomalyRun,
  getAnomalyResult,
  type RunAnomalyRequest,
  type RunAnomalyResponse,
  type ListAnomaliesResponse,
  type AnomalyResult,
} from "@/lib/apiClient";

// Re-export AnomalyResult type for consumers
export type { AnomalyResult };

// Query keys factory for anomalies
export const anomalyKeys = {
  all: ["anomalies"] as const,
  lists: () => [...anomalyKeys.all, "list"] as const,
  list: (filters?: Record<string, any>) => [...anomalyKeys.lists(), filters] as const,
  city: (cityId: number | null, filters?: Record<string, any>) => 
    [...anomalyKeys.all, "city", cityId, filters] as const,
  runs: () => [...anomalyKeys.all, "run"] as const,
  run: (runId: number) => [...anomalyKeys.runs(), runId] as const,
  details: () => [...anomalyKeys.all, "detail"] as const,
  detail: (resultId: number | null) => [...anomalyKeys.details(), resultId] as const,
};

/**
 * Hook to run anomaly detection for a metric.
 * Invalidates anomaly lists on success.
 */
export function useRunAnomalyDetection() {
  const { getAccessTokenSilently } = useAuth0();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: RunAnomalyRequest) => {
      const token = await getAccessTokenSilently();
      return runAnomalyDetection(payload, token);
    },
    onSuccess: (_, variables) => {
      // Invalidate anomaly lists for this metric
      queryClient.invalidateQueries({ queryKey: anomalyKeys.lists() });
      // Also invalidate metric time series since anomalies depend on it
      queryClient.invalidateQueries({ queryKey: ["metrics", "time-series", variables.metric_id] });
    },
  });
}

/**
 * Hook to list anomalies with optional filtering.
 * Cache time: 2 minutes
 */
export function useAnomalies(options?: { metric_id?: number; is_anomaly?: boolean | null; period_type?: string; limit?: number }) {
  const { getAccessTokenSilently } = useAuth0();

  return useQuery({
    queryKey: anomalyKeys.list(options),
    queryFn: async () => {
      const token = await getAccessTokenSilently();
      return listAnomalies(token, options);
    },
    staleTime: 2 * 60 * 1000, // 2 minutes
    enabled: true,
  });
}

/**
 * Hook to get anomaly run details.
 * Cache time: 5 minutes
 */
export function useAnomalyRun(runId: number | null) {
  const { getAccessTokenSilently } = useAuth0();

  return useQuery({
    queryKey: anomalyKeys.run(runId!),
    queryFn: async () => {
      if (!runId) throw new Error("Run ID is required");
      const token = await getAccessTokenSilently();
      return getAnomalyRun(runId, token);
    },
    enabled: !!runId,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

/**
 * Hook to get a single anomaly result detail.
 * Works for both authenticated and unauthenticated users (uses public endpoint if no token).
 * Cache time: 5 minutes
 */
export function useAnomalyDetail(resultId: number | null) {
  const { getAccessTokenSilently, isAuthenticated } = useAuth0();

  return useQuery({
    queryKey: anomalyKeys.detail(resultId),
    queryFn: async () => {
      if (!resultId) throw new Error("Result ID is required");
      
      // Try to get token, but don't fail if not authenticated (use public endpoint)
      let token: string | undefined;
      try {
        if (isAuthenticated) {
          token = await getAccessTokenSilently();
        }
      } catch {
        // User not authenticated, will use public endpoint
        token = undefined;
      }
      
      return getAnomalyResult(resultId, token);
    },
    enabled: !!resultId,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

/**
 * Hook to list anomalies for a specific city with optional filtering.
 * Cache time: 2 minutes
 * 
 * @param cityId - City ID to fetch anomalies for
 * @param options - Optional filtering options:
 *   - district: Filter by district (null = all districts, 0 = citywide only)
 *   - period_type: Filter by period type (day, week, month, year)
 *   - is_anomaly: Filter by flagged anomalies (true) or all (null)
 *   - limit: Maximum number of results to return
 */
export function useCityAnomalies(
  cityId: number | null,
  options?: {
    district?: number | null;
    period_type?: string;
    is_anomaly?: boolean | null;
    limit?: number;
  }
) {
  const { getAccessTokenSilently } = useAuth0();

  return useQuery({
    queryKey: anomalyKeys.city(cityId, options),
    queryFn: async () => {
      if (!cityId) throw new Error("City ID is required");
      const token = await getAccessTokenSilently();
      return listAnomalies(token, {
        city_id: cityId,
        district: options?.district ?? undefined,
        period_type: options?.period_type,
        is_anomaly: options?.is_anomaly ?? true,
        limit: options?.limit ?? 100,
      });
    },
    staleTime: 2 * 60 * 1000, // 2 minutes
    enabled: !!cityId,
  });
}


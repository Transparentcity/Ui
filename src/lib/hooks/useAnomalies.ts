"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth0 } from "@auth0/auth0-react";
import {
  runAnomalyDetection,
  listAnomalies,
  getAnomalyRun,
  getAnomalyResult,
  getAvailablePeriods,
  getAnomalyPlaceTypes,
  type RunAnomalyRequest,
  type RunAnomalyResponse,
  type ListAnomaliesResponse,
  type AnomalyResult,
  type AvailablePeriod,
  type AvailablePeriodsResponse,
  type AnomalyPlaceType,
} from "@/lib/apiClient";

// Re-export types for consumers
export type { AnomalyResult, AvailablePeriod };

// Query keys factory for anomalies
export const anomalyKeys = {
  all: ["anomalies"] as const,
  lists: () => [...anomalyKeys.all, "list"] as const,
  list: (filters?: Record<string, any>) => [...anomalyKeys.lists(), filters] as const,
  city: (cityId: number | null, filters?: Record<string, any>) => 
    [...anomalyKeys.all, "city", cityId, filters] as const,
  periods: (periodType: string, cityId?: number | null, district?: number | null) =>
    [...anomalyKeys.all, "periods", periodType, cityId, district] as const,
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
      // Invalidate all anomaly queries (list, city list, periods) so alerts panel refetches
      queryClient.invalidateQueries({ queryKey: anomalyKeys.all });
      // Also invalidate metric time series since anomalies depend on it
      queryClient.invalidateQueries({ queryKey: ["metrics", "time-series", variables.metric_id] });
    },
  });
}

/**
 * Hook to list anomalies with optional filtering.
 * Cache time: 2 minutes
 */
export function useAnomalies(options?: { 
  metric_id?: number; 
  is_anomaly?: boolean | null; 
  period_type?: string; 
  period_date?: string | null;
  limit?: number;
  city_id?: number;
  district?: number | null;
}) {
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
 *   - period_date: Filter by specific period date (e.g., "2025-01-13")
 *   - metric_id: Filter by metric ID
 */
export function useCityAnomalies(
  cityId: number | null,
  options?: {
    district?: number | null;
    period_type?: string;
    is_anomaly?: boolean | null;
    limit?: number;
    period_date?: string | null;
    metric_id?: number | null;
    group_field?: string | null;
    group_value?: string | null;
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
        limit: options?.limit ?? 200, // Backend max limit is 200
        period_date: options?.period_date ?? undefined,
        metric_id: options?.metric_id ?? undefined,
        group_field: options?.group_field ?? undefined,
        group_value: options?.group_value ?? undefined,
      });
    },
    staleTime: 2 * 60 * 1000, // 2 minutes
    enabled: !!cityId,
  });
}

/**
 * Hook to get available periods (weeks/months/etc) that have active anomaly runs.
 * Useful for populating a period selector dropdown.
 * Cache time: 5 minutes
 * 
 * @param periodType - Period type to query (day, week, month, year)
 * @param cityId - City ID to filter by
 * @param district - Optional district filter (null = all, 0 = citywide)
 * @param limit - Maximum number of periods to return (default 20)
 */
export function useAvailablePeriods(
  periodType: string,
  cityId: number | null,
  district?: number | null,
  limit?: number
) {
  const { getAccessTokenSilently } = useAuth0();

  return useQuery({
    queryKey: anomalyKeys.periods(periodType, cityId, district),
    queryFn: async () => {
      if (!cityId) throw new Error("City ID is required");
      const token = await getAccessTokenSilently();
      return getAvailablePeriods(token, {
        period_type: periodType,
        city_id: cityId,
        district: district ?? undefined,
        limit: limit ?? 20,
      });
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    enabled: !!cityId && !!periodType,
  });
}

/**
 * Hook to get anomaly place types for a city (shapefile-backed locations like neighborhoods).
 * Used to populate the Location selector with "Neighborhood: Noe Valley" etc.
 * Cache time: 5 minutes
 */
export function useAnomalyPlaceTypes(cityId: number | null) {
  const { getAccessTokenSilently } = useAuth0();

  return useQuery({
    queryKey: [...anomalyKeys.all, "place-types", cityId] as const,
    queryFn: async () => {
      if (!cityId) throw new Error("City ID is required");
      const token = await getAccessTokenSilently();
      return getAnomalyPlaceTypes(cityId, token);
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    enabled: !!cityId,
  });
}

export type { AnomalyPlaceType };


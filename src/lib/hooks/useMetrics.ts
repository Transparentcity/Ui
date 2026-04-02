"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth0 } from "@auth0/auth0-react";
import {
  listAdminMetrics,
  getAdminMetric,
  getAdminMetricsSummary,
  listAdminMetricCategories,
  listAdminMetricTypes,
  listAdminMetricCities,
  getAdminMetricTimeSeries,
  getAdminMetricTimeSeriesDetail,
  getAdminMetricCityStructure,
  createAdminMetric,
  updateAdminMetric,
  deleteAdminMetric,
  executeAdminMetric,
  validateMetricFreshness,
  flushMetricCompleteness,
  purgeAdminMetricData,
  clearCityMetricData,
  getMetricMapData,
  getCityMetricsForMap,
  getMetricComparison,
  getMetricComparisons,
  getStructuringNotes,
  getTemplateStructuringNotes,
  getBatchComparisons,
  getPlaceComparisonsBatch,
  type AdminMetricListItem,
  type AdminMetricDetail,
  type AdminMetricSummary,
  type AdminMetricCategory,
  type AdminMetricType,
  type AdminMetricCity,
  type AdminMetricTimeSeries,
  type AdminMetricTimeSeriesDetail,
  type CreateAdminMetricRequest,
  type UpdateAdminMetricRequest,
  type ExecuteAdminMetricRequest,
  type ValidateFreshnessRequest,
  type GetMapDataRequest,
  type MapData,
  type ComparisonType,
  type BatchComparisonsRequest,
  type PlaceComparisonsBatchRequest,
} from "@/lib/apiClient";

// Query keys factory for metrics
export const metricKeys = {
  all: ["metrics"] as const,
  lists: () => [...metricKeys.all, "list"] as const,
  list: (filters?: Record<string, any>) => [...metricKeys.lists(), filters] as const,
  details: () => [...metricKeys.all, "detail"] as const,
  detail: (id: number) => [...metricKeys.details(), id] as const,
  summary: () => [...metricKeys.all, "summary"] as const,
  categories: () => [...metricKeys.all, "categories"] as const,
  types: () => [...metricKeys.all, "types"] as const,
  cities: () => [...metricKeys.all, "cities"] as const,
  timeSeries: (id: number, options?: { exclude_group_fields?: boolean }) =>
    [...metricKeys.all, "time-series", id, options] as const,
  timeSeriesDetail: (metricId: number, chartId: number) =>
    [...metricKeys.all, "time-series-detail", metricId, chartId] as const,
  comparisons: (id: number, district?: number | null) =>
    [...metricKeys.all, "comparisons", id, district] as const,
  comparison: (id: number, type: ComparisonType, district?: number | null) =>
    [...metricKeys.all, "comparison", id, type, district] as const,
  batchComparisons: (request: BatchComparisonsRequest) =>
    [...metricKeys.all, "batch-comparisons", request] as const,
  placeBatchComparisons: (placeId: number, request: PlaceComparisonsBatchRequest) =>
    [...metricKeys.all, "place-batch-comparisons", placeId, request] as const,
  cityStructure: (id: number) => [...metricKeys.all, "city-structure", id] as const,
  mapData: (metricId: number, startDate?: string | null, endDate?: string | null, districts?: number[] | null) =>
    [...metricKeys.all, "map-data", metricId, startDate, endDate, districts] as const,
  cityMetricsForMap: (cityId: number) => [...metricKeys.all, "city-metrics-map", cityId] as const,
};

export interface UseMetricsOptions {
  limit?: number;
  search?: string;
  category?: string;
  metric_type?: string;
  is_active?: boolean;
  city_id?: number;
  /** Filter by last run status: failed, completed, cancelled, timeout, or never */
  last_execution_status?: string;
  /** Include record counts (slower). Omit or false for fast list load. */
  include_record_counts?: boolean;
  force_refresh?: boolean;
}

/**
 * Hook to fetch list of metrics with filtering options.
 * Cache time: 2 minutes (metrics change frequently)
 */
export function useMetrics(options: UseMetricsOptions = {}) {
  const { getAccessTokenSilently, isAuthenticated, isLoading } = useAuth0();

  return useQuery({
    queryKey: metricKeys.list(options),
    queryFn: async () => {
      const token = await getAccessTokenSilently();
      if (!token?.trim()) {
        throw new Error("Not authenticated: no access token. Log in and try again.");
      }
      return listAdminMetrics(token, options);
    },
    staleTime: 2 * 60 * 1000, // 2 minutes - metrics can change frequently
    enabled: !isLoading && !!isAuthenticated,
  });
}

/**
 * Hook to fetch a single metric by ID.
 * Cache time: 5 minutes
 */
export function useMetric(metricId: number | null) {
  const { getAccessTokenSilently } = useAuth0();

  return useQuery({
    queryKey: metricKeys.detail(metricId!),
    queryFn: async () => {
      if (!metricId) throw new Error("Metric ID is required");
      const token = await getAccessTokenSilently();
      if (!token?.trim()) {
        throw new Error("Not authenticated: no access token. Log in and try again.");
      }
      return getAdminMetric(metricId, token);
    },
    enabled: !!metricId,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

export function useStructuringNotes(metricId: number | null) {
  const { getAccessTokenSilently } = useAuth0();

  return useQuery({
    queryKey: ["structuringNotes", metricId],
    queryFn: async () => {
      if (!metricId) throw new Error("Metric ID is required");
      const token = await getAccessTokenSilently();
      return getStructuringNotes(metricId, token);
    },
    enabled: !!metricId,
    staleTime: 10 * 60 * 1000,
  });
}

export function useTemplateStructuringNotes(
  templateId: number | null,
  cityId: number | null,
) {
  const { getAccessTokenSilently } = useAuth0();

  return useQuery({
    queryKey: ["templateStructuringNotes", templateId, cityId],
    queryFn: async () => {
      if (!templateId || !cityId) throw new Error("Template ID and City ID required");
      const token = await getAccessTokenSilently();
      return getTemplateStructuringNotes(templateId, cityId, token);
    },
    enabled: !!templateId && !!cityId,
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Hook to fetch metrics summary (stats).
 * Cache time: 1 minute (summary changes frequently)
 */
export function useMetricsSummary() {
  const { getAccessTokenSilently, isAuthenticated, isLoading } = useAuth0();

  return useQuery({
    queryKey: metricKeys.summary(),
    queryFn: async () => {
      const token = await getAccessTokenSilently();
      if (!token?.trim()) {
        throw new Error("Not authenticated: no access token. Log in and try again.");
      }
      return getAdminMetricsSummary(token);
    },
    staleTime: 1 * 60 * 1000, // 1 minute
    enabled: !isLoading && !!isAuthenticated,
  });
}

/**
 * Hook to fetch metric categories.
 * Cache time: 10 minutes (categories change rarely)
 */
export function useMetricCategories() {
  const { getAccessTokenSilently, isAuthenticated, isLoading } = useAuth0();

  return useQuery({
    queryKey: metricKeys.categories(),
    queryFn: async () => {
      const token = await getAccessTokenSilently();
      if (!token?.trim()) {
        throw new Error("Not authenticated: no access token. Log in and try again.");
      }
      return listAdminMetricCategories(token);
    },
    staleTime: 10 * 60 * 1000, // 10 minutes
    enabled: !isLoading && !!isAuthenticated,
  });
}

/**
 * Hook to fetch metric types.
 * Cache time: 10 minutes (types change rarely)
 */
export function useMetricTypes() {
  const { getAccessTokenSilently, isAuthenticated, isLoading } = useAuth0();

  return useQuery({
    queryKey: metricKeys.types(),
    queryFn: async () => {
      const token = await getAccessTokenSilently();
      if (!token?.trim()) {
        throw new Error("Not authenticated: no access token. Log in and try again.");
      }
      return listAdminMetricTypes(token);
    },
    staleTime: 10 * 60 * 1000, // 10 minutes
    enabled: !isLoading && !!isAuthenticated,
  });
}

/**
 * Hook to fetch cities for metrics.
 * Cache time: 5 minutes
 */
export function useMetricCities() {
  const { getAccessTokenSilently, isAuthenticated, isLoading } = useAuth0();

  return useQuery({
    queryKey: metricKeys.cities(),
    queryFn: async () => {
      const token = await getAccessTokenSilently();
      if (!token?.trim()) {
        throw new Error("Not authenticated: no access token. Log in and try again.");
      }
      return listAdminMetricCities(token);
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    enabled: !isLoading && !!isAuthenticated,
  });
}

export interface UseMetricTimeSeriesOptions {
  /** If true, exclude time series that have a group_field (multi-series). Default false = include all. */
  exclude_group_fields?: boolean;
}

/**
 * Hook to fetch time series data for a metric.
 * Cache time: 5 minutes
 * Pass exclude_group_fields: false (default) to include group-field time series charts.
 */
export function useMetricTimeSeries(
  metricId: number | null,
  options?: UseMetricTimeSeriesOptions
) {
  const { getAccessTokenSilently } = useAuth0();

  return useQuery({
    queryKey: metricKeys.timeSeries(metricId!, options),
    queryFn: async () => {
      if (!metricId) throw new Error("Metric ID is required");
      const token = await getAccessTokenSilently();
      return getAdminMetricTimeSeries(metricId, token, options);
    },
    enabled: !!metricId,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

/**
 * Hook to fetch time series detail for a specific chart.
 * Cache time: 5 minutes
 */
export function useMetricTimeSeriesDetail(metricId: number | null, chartId: number | null) {
  const { getAccessTokenSilently } = useAuth0();

  return useQuery({
    queryKey: metricKeys.timeSeriesDetail(metricId!, chartId!),
    queryFn: async () => {
      if (!metricId || !chartId) throw new Error("Metric ID and Chart ID are required");
      const token = await getAccessTokenSilently();
      return getAdminMetricTimeSeriesDetail(metricId, chartId, token);
    },
    enabled: !!metricId && !!chartId,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

/**
 * Hook to fetch city structure for a metric.
 * Cache time: 10 minutes (structure changes rarely)
 */
export function useMetricCityStructure(metricId: number | null) {
  const { getAccessTokenSilently } = useAuth0();

  return useQuery({
    queryKey: metricKeys.cityStructure(metricId!),
    queryFn: async () => {
      if (!metricId) throw new Error("Metric ID is required");
      const token = await getAccessTokenSilently();
      return getAdminMetricCityStructure(metricId, token);
    },
    enabled: !!metricId,
    staleTime: 10 * 60 * 1000, // 10 minutes
  });
}

/**
 * Hook to create a new metric.
 * Invalidates metrics list on success.
 */
export function useCreateMetric() {
  const { getAccessTokenSilently } = useAuth0();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: CreateAdminMetricRequest) => {
      const token = await getAccessTokenSilently();
      return createAdminMetric(payload, token);
    },
    onSuccess: () => {
      // Invalidate metrics list and summary
      queryClient.invalidateQueries({ queryKey: metricKeys.lists() });
      queryClient.invalidateQueries({ queryKey: metricKeys.summary() });
    },
  });
}

/**
 * Hook to update a metric.
 * Invalidates the specific metric and metrics list on success.
 */
export function useUpdateMetric() {
  const { getAccessTokenSilently } = useAuth0();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ metricId, payload }: { metricId: number; payload: UpdateAdminMetricRequest }) => {
      const token = await getAccessTokenSilently();
      return updateAdminMetric(metricId, payload, token);
    },
    onSuccess: (_, variables) => {
      // Invalidate the specific metric and list
      queryClient.invalidateQueries({ queryKey: metricKeys.detail(variables.metricId) });
      queryClient.invalidateQueries({ queryKey: metricKeys.lists() });
      queryClient.invalidateQueries({ queryKey: metricKeys.summary() });
    },
  });
}

/**
 * Hook to delete a metric.
 * Invalidates metrics list and summary on success.
 */
export function useDeleteMetric() {
  const { getAccessTokenSilently } = useAuth0();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (metricId: number) => {
      const token = await getAccessTokenSilently();
      return deleteAdminMetric(metricId, token);
    },
    onSuccess: () => {
      // Invalidate metrics list and summary
      queryClient.invalidateQueries({ queryKey: metricKeys.lists() });
      queryClient.invalidateQueries({ queryKey: metricKeys.summary() });
    },
  });
}

/**
 * Hook to execute a metric.
 * Invalidates the metric and its time series on success.
 */
export function useExecuteMetric() {
  const { getAccessTokenSilently } = useAuth0();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ metricId, payload }: { metricId: number; payload: ExecuteAdminMetricRequest }) => {
      const token = await getAccessTokenSilently();
      return executeAdminMetric(metricId, payload, token);
    },
    onSuccess: (_, variables) => {
      // Invalidate the metric, its time series, and list
      queryClient.invalidateQueries({ queryKey: metricKeys.detail(variables.metricId) });
      queryClient.invalidateQueries({ queryKey: metricKeys.timeSeries(variables.metricId) });
      queryClient.invalidateQueries({ queryKey: metricKeys.lists() });
    },
  });
}

/**
 * Hook to validate metric freshness.
 * Invalidates the metric on success.
 */
export function useValidateMetricFreshness() {
  const { getAccessTokenSilently } = useAuth0();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ metricId, payload }: { metricId: number; payload: ValidateFreshnessRequest }) => {
      const token = await getAccessTokenSilently();
      return validateMetricFreshness(metricId, payload, token);
    },
    onSuccess: (_, variables) => {
      // Invalidate the metric to refresh freshness data
      queryClient.invalidateQueries({ queryKey: metricKeys.detail(variables.metricId) });
    },
  });
}

/**
 * Hook to flush/delete all completeness data for a metric.
 * Removes all period_completeness and metric_stability_patterns records.
 * Invalidates the metric on success.
 */
export function useFlushMetricCompleteness() {
  const { getAccessTokenSilently } = useAuth0();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ metricId }: { metricId: number }) => {
      const token = await getAccessTokenSilently();
      return flushMetricCompleteness(metricId, token);
    },
    onSuccess: (_, variables) => {
      // Invalidate the metric to refresh completeness data
      queryClient.invalidateQueries({ queryKey: metricKeys.detail(variables.metricId) });
    },
  });
}

/**
 * Hook to purge ALL data for a metric while keeping the metric definition.
 * Deletes time_series, time_series_metadata, saved_maps, anomaly_results,
 * anomaly_runs, period_completeness, and metric_stability_patterns.
 * WARNING: This is a destructive operation that cannot be undone!
 */
export function usePurgeMetricData() {
  const { getAccessTokenSilently } = useAuth0();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ metricId }: { metricId: number }) => {
      const token = await getAccessTokenSilently();
      return purgeAdminMetricData(metricId, token);
    },
    onSuccess: (_, variables) => {
      // Invalidate the metric and related queries to refresh all data
      queryClient.invalidateQueries({ queryKey: metricKeys.detail(variables.metricId) });
      queryClient.invalidateQueries({ queryKey: metricKeys.timeSeries(variables.metricId) });
      queryClient.invalidateQueries({ queryKey: metricKeys.lists() });
      queryClient.invalidateQueries({ queryKey: metricKeys.summary() });
    },
  });
}

/**
 * Hook to clear all city metric data (time series, anomalies, maps, feed stories, etc.)
 * for one city or all cities. Preserves metric definitions and users.
 * WARNING: Destructive and cannot be undone!
 */
export function useClearCityMetricData() {
  const { getAccessTokenSilently } = useAuth0();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ cityId }: { cityId: number | null }) => {
      const token = await getAccessTokenSilently();
      return clearCityMetricData(cityId, token);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: metricKeys.lists() });
      queryClient.invalidateQueries({ queryKey: metricKeys.summary() });
    },
  });
}

/**
 * Hook to fetch map data for a metric.
 * Cache time: 5 minutes (map data changes with date range)
 */
export function useMetricMapData(
  metricId: number | null,
  startDate: string | null = null,
  endDate: string | null = null
) {
  const { getAccessTokenSilently } = useAuth0();

  return useQuery({
    queryKey: metricKeys.mapData(metricId!, startDate, endDate),
    queryFn: async () => {
      if (!metricId) throw new Error("Metric ID is required");
      const token = await getAccessTokenSilently();
      const request: GetMapDataRequest = {
        metric_id: metricId,
        start_date: startDate,
        end_date: endDate,
      };
      const response = await getMetricMapData(request, token);
      if (response.status === "success" && response.map_data) {
        return response.map_data;
      }
      throw new Error(response.error || "Failed to load map data");
    },
    enabled: !!metricId,
    staleTime: 5 * 60 * 1000, // 5 minutes - map data is relatively stable
    gcTime: 10 * 60 * 1000, // 10 minutes - keep in cache for fast switching
  });
}

/**
 * Hook to fetch all metrics for a city (for map view).
 * Cache time: 2 minutes
 */
export function useCityMetricsForMap(cityId: number | null) {
  const { getAccessTokenSilently } = useAuth0();

  return useQuery({
    queryKey: metricKeys.cityMetricsForMap(cityId!),
    queryFn: async () => {
      if (!cityId) throw new Error("City ID is required");
      const token = await getAccessTokenSilently();
      const metrics = await getCityMetricsForMap(cityId, token);
      // Filter to only metrics that have map_query configured
      return metrics.filter((m) => m.map_query && m.map_query.trim().length > 0);
    },
    enabled: !!cityId,
    staleTime: 2 * 60 * 1000, // 2 minutes
    gcTime: 5 * 60 * 1000, // 5 minutes - keep in cache for fast switching
  });
}

/**
 * Hook to get a single comparison for a metric.
 */
export function useMetricComparison(
  metricId: number | null | undefined,
  comparisonType: ComparisonType,
  district?: number | null
) {
  const { getAccessTokenSilently } = useAuth0();

  return useQuery({
    queryKey: metricKeys.comparison(metricId || 0, comparisonType, district),
    queryFn: async () => {
      if (!metricId) throw new Error("Metric ID is required");
      const token = await getAccessTokenSilently();
      return getMetricComparison(metricId, comparisonType, district, token);
    },
    enabled: !!metricId,
    staleTime: 5 * 60 * 1000, // 5 minutes - comparisons update daily
    gcTime: 30 * 60 * 1000, // 30 minutes
  });
}

/**
 * Hook to get all comparisons for a metric.
 */
export function useMetricComparisons(
  metricId: number | null | undefined,
  district?: number | null,
  comparisonTypes?: ComparisonType[]
) {
  const { getAccessTokenSilently } = useAuth0();

  return useQuery({
    queryKey: metricKeys.comparisons(metricId || 0, district),
    queryFn: async () => {
      if (!metricId) throw new Error("Metric ID is required");
      const token = await getAccessTokenSilently();
      return getMetricComparisons(metricId, district, comparisonTypes, token);
    },
    enabled: !!metricId,
    staleTime: 5 * 60 * 1000, // 5 minutes - comparisons update daily
    gcTime: 30 * 60 * 1000, // 30 minutes
  });
}

/**
 * Hook to get comparisons for multiple metrics in batch (city/district).
 */
export function useBatchComparisons(request: BatchComparisonsRequest | null) {
  const { getAccessTokenSilently } = useAuth0();

  return useQuery({
    queryKey: metricKeys.batchComparisons(request || { metric_ids: [] }),
    queryFn: async () => {
      if (!request || !request.metric_ids || request.metric_ids.length === 0) {
        return {};
      }
      try {
        const token = await getAccessTokenSilently();
        return await getBatchComparisons(request, token);
      } catch (error) {
        console.error('Error fetching batch comparisons:', error);
        // Return empty object on error so fallback can work
        return {};
      }
    },
    enabled: !!request && !!request.metric_ids && request.metric_ids.length > 0,
    staleTime: 5 * 60 * 1000, // 5 minutes - comparisons update daily
    gcTime: 30 * 60 * 1000, // 30 minutes
    retry: 1, // Only retry once on failure
    retryDelay: 1000, // Wait 1 second before retry
  });
}

/**
 * Hook to get place comparisons for multiple metrics (same response shape as batch comparisons for dashboard parity).
 */
export function usePlaceBatchComparisons(
  placeId: number | null,
  request: PlaceComparisonsBatchRequest | null
) {
  const { getAccessTokenSilently } = useAuth0();

  return useQuery({
    queryKey: metricKeys.placeBatchComparisons(placeId ?? 0, request ?? { metric_ids: [] }),
    queryFn: async () => {
      if (!placeId || !request || !request.metric_ids || request.metric_ids.length === 0) {
        return {};
      }
      try {
        const token = await getAccessTokenSilently();
        return await getPlaceComparisonsBatch(placeId, request, token);
      } catch (error) {
        console.error('Error fetching place batch comparisons:', error);
        return {};
      }
    },
    enabled: !!placeId && !!request && !!request.metric_ids && request.metric_ids.length > 0,
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    retry: 1,
    retryDelay: 1000,
  });
}


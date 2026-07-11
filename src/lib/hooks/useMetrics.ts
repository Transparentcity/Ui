"use client";

import { useMemo } from "react";
import type { GetTokenSilentlyOptions } from "@auth0/auth0-react";
import { useAuth0 } from "@auth0/auth0-react";
import {
  type QueryClient,
  useMutation,
  useQueries,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { getAuth0ApiAudience } from "@/lib/auth0ApiAudience";
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
  type AdminTimeSeriesSummary,
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

/**
 * React Query key for coalescing `getAccessTokenSilently` across parallel
 * metrics-admin requests (avoids Auth0 races when many hooks mount at once).
 */
export const ADMIN_API_ACCESS_TOKEN_QUERY_KEY = [
  "auth0",
  "admin-api-access-token",
  getAuth0ApiAudience(),
] as const;

const _ADMIN_API_ACCESS_TOKEN_STALE_MS = 5000;

async function fetchCoalescedAdminApiAccessToken(
  queryClient: QueryClient,
  getAccessTokenSilently: (
    options?: GetTokenSilentlyOptions
  ) => Promise<string>
): Promise<string> {
  return queryClient.fetchQuery({
    queryKey: ADMIN_API_ACCESS_TOKEN_QUERY_KEY,
    queryFn: async () => {
      const token = await getAccessTokenSilently();
      if (!token?.trim()) {
        throw new Error("Not authenticated: no access token. Log in and try again.");
      }
      return token;
    },
    staleTime: _ADMIN_API_ACCESS_TOKEN_STALE_MS,
    gcTime: 60 * 1000,
  });
}

export interface UseMetricsOptions {
  limit?: number;
  search?: string;
  category?: string;
  metric_type?: string;
  is_active?: boolean;
  city_id?: number;
  /** Filter metrics instantiated from this template metric id. */
  template_id?: number;
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
export function useMetrics(
  options: UseMetricsOptions = {},
  queryOptions?: { enabled?: boolean }
) {
  const { getAccessTokenSilently, isAuthenticated, isLoading } = useAuth0();
  const queryClient = useQueryClient();

  return useQuery({
    queryKey: metricKeys.list(options),
    queryFn: async () => {
      const token = await fetchCoalescedAdminApiAccessToken(
        queryClient,
        getAccessTokenSilently
      );
      return listAdminMetrics(token, options);
    },
    staleTime: 2 * 60 * 1000, // 2 minutes - metrics can change frequently
    // Callers can additionally gate the query (e.g. until a city id resolves)
    // so we never fire a request with a placeholder/invalid filter.
    enabled:
      (queryOptions?.enabled ?? true) && !isLoading && !!isAuthenticated,
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
  const queryClient = useQueryClient();

  return useQuery({
    queryKey: metricKeys.summary(),
    queryFn: async () => {
      const token = await fetchCoalescedAdminApiAccessToken(
        queryClient,
        getAccessTokenSilently
      );
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
  const queryClient = useQueryClient();

  return useQuery({
    queryKey: metricKeys.categories(),
    queryFn: async () => {
      const token = await fetchCoalescedAdminApiAccessToken(
        queryClient,
        getAccessTokenSilently
      );
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
  const queryClient = useQueryClient();

  return useQuery({
    queryKey: metricKeys.types(),
    queryFn: async () => {
      const token = await fetchCoalescedAdminApiAccessToken(
        queryClient,
        getAccessTokenSilently
      );
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
  const queryClient = useQueryClient();

  return useQuery({
    queryKey: metricKeys.cities(),
    queryFn: async () => {
      const token = await fetchCoalescedAdminApiAccessToken(
        queryClient,
        getAccessTokenSilently
      );
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

/** Latest stored point (and the one before it) of a metric's base series. */
export interface WasteLatestValue {
  value: number | null;
  /** The point immediately before `value`, for a same-grain delta. */
  prior: number | null;
  /** Label of the latest point (year for annual series, else the raw period). */
  asOf: string | null;
  /** Grain of the series the value came from ("year" | "month" | ...). */
  period: string | null;
}

/**
 * Choose the base series to read a "latest value" from: an active chart with
 * no group field and at least one point. Prefer the coarsest populated grain
 * (waste metrics are annual) and, critically, ignore empty charts — this is
 * how the UI sidesteps the backend comparison bug where an empty finer-grained
 * chart nulls out the annual comparison.
 */
function pickPopulatedBaseChart(
  charts: AdminTimeSeriesSummary[] | undefined,
): AdminTimeSeriesSummary | null {
  const base = (charts ?? []).filter(
    (c) =>
      c.is_active &&
      (c.group_field == null || c.group_field === "") &&
      (c.data_point_count ?? 0) > 0,
  );
  if (base.length === 0) return null;
  const grainRank = (p: string): number =>
    ({ year: 0, month: 1, week: 2, day: 3 })[p] ?? 4;
  return [...base].sort(
    (a, b) =>
      grainRank(a.period_type) - grainRank(b.period_type) ||
      (b.data_point_count ?? 0) - (a.data_point_count ?? 0) ||
      (b.created_at ?? "").localeCompare(a.created_at ?? ""),
  )[0];
}

/**
 * Latest stored value (and the prior point) for each metric, read straight
 * from the time series rather than the precomputed-comparison table. Used as a
 * display fallback for the waste module when a metric has data but no computed
 * comparison. One two-step fetch per id (chart list -> base chart points),
 * cached; pass only the ids that actually need a fallback to keep it cheap.
 */
export function useWasteLatestValues(metricIds: number[]): {
  latestById: Record<number, WasteLatestValue>;
  isLoading: boolean;
} {
  const { getAccessTokenSilently } = useAuth0();
  const queryClient = useQueryClient();

  const results = useQueries({
    queries: metricIds.map((id) => ({
      queryKey: [...metricKeys.all, "waste-latest-value", id] as const,
      queryFn: async (): Promise<WasteLatestValue | null> => {
        const token = await fetchCoalescedAdminApiAccessToken(
          queryClient,
          getAccessTokenSilently,
        );
        const series = await getAdminMetricTimeSeries(id, token);
        const base = pickPopulatedBaseChart(series.time_series);
        if (!base) return null;
        const detail = await getAdminMetricTimeSeriesDetail(
          id,
          base.chart_id,
          token,
        );
        const points = (detail.data ?? [])
          .filter((p) => p.group_value == null || p.group_value === "")
          .filter(
            (p) =>
              typeof p.numeric_value === "number" &&
              Number.isFinite(p.numeric_value),
          )
          .sort((a, b) => a.time_period.localeCompare(b.time_period));
        if (points.length === 0) return null;
        const latest = points[points.length - 1];
        const prior = points.length >= 2 ? points[points.length - 2] : null;
        const asOf =
          base.period_type === "year"
            ? latest.time_period.slice(0, 4)
            : latest.time_period;
        return {
          value: latest.numeric_value,
          prior: prior ? prior.numeric_value : null,
          asOf,
          period: base.period_type ?? null,
        };
      },
      enabled: !!id,
      staleTime: 5 * 60 * 1000,
      gcTime: 30 * 60 * 1000,
      retry: 1,
    })),
  });

  // Stable identity while the underlying data is unchanged (useQueries returns
  // a fresh array each render), so downstream memos don't churn.
  const signature = metricIds
    .map((id, i) => {
      const d = results[i]?.data;
      return d ? `${id}:${d.value}:${d.prior}:${d.asOf}` : `${id}:∅`;
    })
    .join("|");

  return useMemo(() => {
    const latestById: Record<number, WasteLatestValue> = {};
    metricIds.forEach((id, i) => {
      const data = results[i]?.data;
      if (data) latestById[id] = data;
    });
    const isLoading = results.some((r) => r.isLoading);
    return { latestById, isLoading };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature]);
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

/**
 * Hook to get place-scoped comparisons for a single metric (metric detail modal).
 * Returns the same shape as public metric comparisons so the modal can share render paths.
 */
export function usePlaceMetricComparisons(
  placeId: number | null,
  metricId: number | null
) {
  const { getAccessTokenSilently } = useAuth0();

  return useQuery({
    queryKey: [
      ...metricKeys.placeBatchComparisons(placeId ?? 0, {
        metric_ids: metricId != null ? [metricId] : [],
      }),
      "single",
    ],
    queryFn: async () => {
      if (!placeId || metricId == null) {
        return { metric_id: metricId ?? 0, district: null, comparisons: {} };
      }
      const token = await getAccessTokenSilently();
      const batch = await getPlaceComparisonsBatch(
        placeId,
        {
          metric_ids: [metricId],
          comparison_types: ["ytd", "mtd", "mtd_prior_year"],
        },
        token
      );
      const comparisons = batch[metricId] ?? {};
      return {
        metric_id: metricId,
        district: null as number | null,
        comparisons,
      };
    },
    enabled: !!placeId && metricId != null,
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    retry: 1,
    retryDelay: 1000,
  });
}


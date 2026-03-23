"use client";

import { useMemo } from "react";
import { useQuery, useQueries, useQueryClient } from "@tanstack/react-query";
import { useAuth0 } from "@auth0/auth0-react";
import {
  getMetricMapData,
  type MapData,
  type GetMapDataRequest,
} from "@/lib/apiClient";

/**
 * Query keys factory for map layer data
 * Separate from metricKeys to allow independent cache management
 */
export const mapLayerKeys = {
  all: ["mapLayers"] as const,
  layer: (
    metricId: number,
    startDate?: string | null,
    endDate?: string | null,
    districts?: number[] | null,
    placeCircle?: { lat: number; lng: number; radius_m: number } | null
  ) =>
    [
      ...mapLayerKeys.all,
      "layer",
      metricId,
      startDate ?? null,
      endDate ?? null,
      districts ?? null,
      placeCircle ? `${placeCircle.lat},${placeCircle.lng},${placeCircle.radius_m}` : null,
    ] as const,
};

/**
 * Cache configuration for map layers
 * Map data changes infrequently, so we use long cache times to avoid re-fetching
 * when toggling layers on/off
 */
const MAP_LAYER_CACHE_CONFIG = {
  // Data is considered fresh for 15 minutes - won't refetch during this time
  staleTime: 15 * 60 * 1000,
  // Keep data in cache for 30 minutes even when unused
  gcTime: 30 * 60 * 1000,
  // Don't refetch on window focus for map layers
  refetchOnWindowFocus: false,
  // Don't refetch on reconnect
  refetchOnReconnect: false,
  // Retry once on failure
  retry: 1,
  retryDelay: 1000,
};

export interface MapLayerParams {
  metricId: number;
  startDate?: string | null;
  endDate?: string | null;
  districts?: number[] | null;
  /** When set (e.g. My Block), map data is limited to points within this radius of the center */
  placeCircle?: { lat: number; lng: number; radius_m: number } | null;
}

/**
 * Hook to fetch map layer data for a single metric.
 * Uses long cache times to avoid re-fetching when toggling layers.
 * 
 * @param params - Map layer parameters including metricId and optional filters
 * @param enabled - Whether to fetch data (default: true when metricId is valid)
 */
export function useMapLayerData(
  params: MapLayerParams | null,
  enabled: boolean = true
) {
  const { getAccessTokenSilently } = useAuth0();

  return useQuery({
    queryKey: params
      ? mapLayerKeys.layer(
          params.metricId,
          params.startDate,
          params.endDate,
          params.districts,
          params.placeCircle ?? null
        )
      : ["mapLayers", "disabled"],
    queryFn: async () => {
      if (!params) throw new Error("Params required");
      const token = await getAccessTokenSilently();
      const request: GetMapDataRequest = {
        metric_id: params.metricId,
        start_date: params.startDate ?? null,
        end_date: params.endDate ?? null,
        districts: params.districts,
        center_lat: params.placeCircle?.lat ?? null,
        center_lon: params.placeCircle?.lng ?? null,
        radius_m: params.placeCircle?.radius_m ?? null,
      };
      const response = await getMetricMapData(request, token);
      if (response.status === "success" && response.map_data) {
        return response.map_data;
      }
      throw new Error(response.error || "Failed to load map data");
    },
    enabled: enabled && !!params && !!params.metricId,
    ...MAP_LAYER_CACHE_CONFIG,
  });
}

/**
 * Hook to fetch map layer data for multiple metrics in parallel.
 * Uses React Query's useQueries for efficient batch loading with proper caching.
 * 
 * This is the main hook to use in CityMetricsMap for loading multiple layers.
 * When a layer is toggled off and back on, it will use cached data instead of refetching.
 * 
 * @param metricIds - Array of metric IDs to load
 * @param params - Common parameters for all metrics (date range, districts)
 * @param enabled - Whether to fetch data
 */
export function useMapLayersData(
  metricIds: number[],
  params: Omit<MapLayerParams, "metricId">,
  enabled: boolean = true
) {
  const { getAccessTokenSilently } = useAuth0();
  const queryClient = useQueryClient();

  const queries = useQueries({
    queries: metricIds.map((metricId) => ({
      queryKey: mapLayerKeys.layer(
        metricId,
        params.startDate,
        params.endDate,
        params.districts,
        params.placeCircle ?? null
      ),
      queryFn: async () => {
        const token = await getAccessTokenSilently();
        const request: GetMapDataRequest = {
          metric_id: metricId,
          start_date: params.startDate ?? null,
          end_date: params.endDate ?? null,
          districts: params.districts,
          center_lat: params.placeCircle?.lat ?? null,
          center_lon: params.placeCircle?.lng ?? null,
          radius_m: params.placeCircle?.radius_m ?? null,
        };
        const response = await getMetricMapData(request, token);
        if (response.status === "success" && response.map_data) {
          return response.map_data;
        }
        // Return null for metrics without map_query (not an error)
        if (response.error?.includes("map_query")) {
          return null;
        }
        throw new Error(response.error || `Failed to load map data for metric ${metricId}`);
      },
      enabled: enabled && metricId > 0,
      ...MAP_LAYER_CACHE_CONFIG,
    })),
  });

  // Aggregate the results using useMemo to prevent creating new objects on every render
  // This is critical to prevent infinite re-render loops in consuming components
  const aggregatedResults = useMemo(() => {
    const mapDataByMetricId: Record<number, MapData | null> = {};
    const loadingIds: number[] = [];
    const errorEntries: [number, string][] = [];

    queries.forEach((query, index) => {
      const metricId = metricIds[index];
      if (query.isLoading || query.isFetching) {
        loadingIds.push(metricId);
      }
      if (query.isError && query.error) {
        errorEntries.push([metricId, (query.error as Error).message]);
      }
      if (query.data) {
        mapDataByMetricId[metricId] = query.data;
      }
    });

    return {
      mapDataByMetricId,
      // Convert to sorted strings for stable comparison
      loadingIdsKey: loadingIds.sort().join(','),
      loadingIds,
      errorEntriesKey: errorEntries.map(([id, msg]) => `${id}:${msg}`).sort().join(','),
      errorEntries,
    };
  }, [queries, metricIds]);

  // Create stable Set and Map references that only change when the underlying data changes
  const loadingMetricIds = useMemo(() => {
    return new Set(aggregatedResults.loadingIds);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aggregatedResults.loadingIdsKey]);

  const errorMetricIds = useMemo(() => {
    return new Map(aggregatedResults.errorEntries);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aggregatedResults.errorEntriesKey]);

  return {
    mapDataByMetricId: aggregatedResults.mapDataByMetricId,
    loadingMetricIds,
    errorMetricIds,
    isLoading: queries.some((q) => q.isLoading),
    isFetching: queries.some((q) => q.isFetching),
    isError: queries.some((q) => q.isError),
    // Get cached data for a metric (useful for checking if data exists before toggling)
    getCachedMapData: (metricId: number) => {
      const cacheKey = mapLayerKeys.layer(
        metricId,
        params.startDate,
        params.endDate,
        params.districts
      );
      return queryClient.getQueryData<MapData>(cacheKey);
    },
    // Prefetch map data for a metric (useful for preloading on hover)
    prefetchMapData: async (metricId: number) => {
      const cacheKey = mapLayerKeys.layer(
        metricId,
        params.startDate,
        params.endDate,
        params.districts
      );
      // Only prefetch if not already in cache
      const existing = queryClient.getQueryData<MapData>(cacheKey);
      if (!existing) {
        try {
          const token = await getAccessTokenSilently();
          const request: GetMapDataRequest = {
            metric_id: metricId,
            start_date: params.startDate ?? null,
            end_date: params.endDate ?? null,
            districts: params.districts,
          };
          const response = await getMetricMapData(request, token);
          if (response.status === "success" && response.map_data) {
            queryClient.setQueryData(cacheKey, response.map_data);
          }
        } catch (err) {
          console.error(`Failed to prefetch map data for metric ${metricId}:`, err);
        }
      }
    },
    // Invalidate cache for specific metrics (use when data changes)
    invalidateMapData: (metricIdsToInvalidate?: number[]) => {
      const idsToInvalidate = metricIdsToInvalidate || metricIds;
      idsToInvalidate.forEach((metricId) => {
        queryClient.invalidateQueries({
          queryKey: mapLayerKeys.layer(
            metricId,
            params.startDate,
            params.endDate,
            params.districts
          ),
        });
      });
    },
  };
}

/**
 * Hook to get pre-cached map data without triggering a fetch.
 * Useful for checking if data is available before enabling a layer.
 * 
 * @param metricId - Metric ID to check
 * @param params - Parameters to match in cache
 */
export function useCachedMapLayerData(
  metricId: number | null,
  params: Omit<MapLayerParams, "metricId">
) {
  const queryClient = useQueryClient();

  if (!metricId) return null;

  const cacheKey = mapLayerKeys.layer(
    metricId,
    params.startDate,
    params.endDate,
    params.districts
  );
  
  return queryClient.getQueryData<MapData>(cacheKey);
}

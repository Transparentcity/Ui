"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth0 } from "@auth0/auth0-react";
import {
  getCity,
  getCityMetrics,
  getSavedCities,
  listCities,
  getCityStructure,
  getCityLeaders,
  getRepresentativeFollowerCounts,
  getMyRepresentativeFollows,
  followRepresentative,
  unfollowRepresentative,
  getCityShapefiles,
  getCityShapeLayers,
  updateShapeLayerInstance,
  saveCity,
  unsaveCity,
  type CityDetail,
  type SavedCity,
  type CityListItem,
  type CityStructureData,
  type CityLeader,
  type CityShapefile,
  type CityShapeLayerListItem,
  type UpdateShapeLayerInstanceRequest,
} from "@/lib/apiClient";

// Query keys factory for cities
export const cityKeys = {
  all: ["cities"] as const,
  lists: () => [...cityKeys.all, "list"] as const,
  list: (filters?: Record<string, any>) => [...cityKeys.lists(), filters] as const,
  details: () => [...cityKeys.all, "detail"] as const,
  detail: (id: number) => [...cityKeys.details(), id] as const,
  saved: () => [...cityKeys.all, "saved"] as const,
  structure: (id: number) => [...cityKeys.all, "structure", id] as const,
  leaders: (id: number) => [...cityKeys.all, "leaders", id] as const,
  representativeFollowerCounts: (id: number) =>
    [...cityKeys.all, "representativeFollowerCounts", id] as const,
  representativeFollows: (id: number) =>
    [...cityKeys.all, "representativeFollows", id] as const,
  shapefiles: (id: number) => [...cityKeys.all, "shapefiles", id] as const,
  shapeLayers: (id: number, includeGeometry?: boolean) =>
    [...cityKeys.all, "shapeLayers", id, includeGeometry] as const,
};

/**
 * Hook to fetch a single city by ID.
 * Loads city data without metrics first (faster), then loads metrics separately in parallel.
 * Cache time: 5 minutes (city data changes infrequently)
 */
export function useCity(cityId: number | null) {
  const { getAccessTokenSilently } = useAuth0();

  return useQuery({
    queryKey: cityKeys.detail(cityId!),
    queryFn: async () => {
      if (!cityId) throw new Error("City ID is required");
      const token = await getAccessTokenSilently();
      
      // Load city data without metrics first (faster)
      const cityPromise = getCity(cityId, token);
      
      // Load metrics in parallel (separate, optimized query)
      const metricsPromise = getCityMetrics(cityId, token);
      
      // Wait for both to complete and merge
      const [cityData, metrics] = await Promise.all([cityPromise, metricsPromise]);
      
      // Merge metrics into city data
      return {
        ...cityData,
        metrics: metrics || [],
      } as CityDetail;
    },
    enabled: !!cityId,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

/**
 * Hook to fetch list of cities.
 * Cache time: 5 minutes
 */
export function useCities(options?: { includeInactive?: boolean; limit?: number; offset?: number }) {
  const { getAccessTokenSilently } = useAuth0();

  return useQuery({
    queryKey: cityKeys.list(options),
    queryFn: async () => {
      const token = await getAccessTokenSilently();
      // Convert includeInactive to is_active parameter
      // includeInactive=true means is_active should be undefined (show all)
      // includeInactive=false means is_active should be true (show only active)
      const is_active = options?.includeInactive === false ? true : undefined;
      return listCities(token, undefined, undefined, is_active);
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

/**
 * Hook to fetch saved cities for the current user.
 * Cache time: 2 minutes (saved cities can change)
 */
export function useSavedCities() {
  const { getAccessTokenSilently } = useAuth0();

  return useQuery({
    queryKey: cityKeys.saved(),
    queryFn: async () => {
      const token = await getAccessTokenSilently();
      return getSavedCities(token);
    },
    staleTime: 2 * 60 * 1000, // 2 minutes
  });
}

/**
 * Hook to fetch city structure data.
 * Cache time: 10 minutes (structure changes rarely)
 */
export function useCityStructure(cityId: number | null) {
  const { getAccessTokenSilently } = useAuth0();

  return useQuery({
    queryKey: cityKeys.structure(cityId!),
    queryFn: async () => {
      if (!cityId) throw new Error("City ID is required");
      const token = await getAccessTokenSilently();
      return getCityStructure(cityId, token);
    },
    enabled: !!cityId,
    staleTime: 10 * 60 * 1000, // 10 minutes
  });
}

/**
 * Hook to fetch city leaders.
 * Cache time: 10 minutes (leaders change rarely)
 */
export function useCityLeaders(cityId: number | null) {
  const { getAccessTokenSilently } = useAuth0();

  return useQuery({
    queryKey: cityKeys.leaders(cityId!),
    queryFn: async () => {
      if (!cityId) throw new Error("City ID is required");
      const token = await getAccessTokenSilently();
      return getCityLeaders(cityId, token);
    },
    enabled: !!cityId,
    staleTime: 10 * 60 * 1000, // 10 minutes
  });
}

/**
 * Hook to fetch representative follower counts per district for a city.
 * Returns Record<string, number> keyed by district ("0"=mayor, "1"-"11"=districts).
 * On error or 404, data is {}. Cache time: 5 minutes.
 */
export function useRepresentativeFollowerCounts(cityId: number | null) {
  const { getAccessTokenSilently } = useAuth0();

  return useQuery({
    queryKey: cityKeys.representativeFollowerCounts(cityId!),
    queryFn: async (): Promise<Record<string, number>> => {
      if (!cityId) return {};
      const token = await getAccessTokenSilently();
      const list = await getRepresentativeFollowerCounts(cityId, token);
      const map: Record<string, number> = {};
      for (const r of list) {
        map[r.district || "0"] = r.follower_count;
      }
      return map;
    },
    enabled: !!cityId,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

/**
 * Hook to fetch which districts the current user follows for a city.
 * Returns Record<string, true> for followed districts. Cache: 2 minutes.
 */
export function useRepresentativeFollows(cityId: number | null) {
  const { getAccessTokenSilently } = useAuth0();

  return useQuery({
    queryKey: cityKeys.representativeFollows(cityId!),
    queryFn: async (): Promise<Record<string, boolean>> => {
      if (!cityId) return {};
      const token = await getAccessTokenSilently();
      const list = await getMyRepresentativeFollows(cityId, token);
      const map: Record<string, boolean> = {};
      for (const d of list) {
        map[String(d || "0")] = true;
      }
      return map;
    },
    enabled: !!cityId,
    staleTime: 2 * 60 * 1000,
  });
}

/**
 * Hook to follow a city+district. Optimistically +1 count; invalidates my-follows on success.
 * We do NOT invalidate representativeFollowerCounts on success so the optimistic +1 is not
 * overwritten by a refetch that can return 0 (e.g. if migration 037 is not yet applied or
 * backend has not yet reflected the new follow). The count will correct on next natural refetch.
 */
export function useFollowRepresentative(cityId: number | null) {
  const { getAccessTokenSilently } = useAuth0();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (district: string) => {
      if (!cityId) throw new Error("City ID required");
      const token = await getAccessTokenSilently();
      return followRepresentative(cityId, district, token);
    },
    onMutate: async (district) => {
      if (!cityId) return;
      await queryClient.cancelQueries({ queryKey: cityKeys.representativeFollowerCounts(cityId) });
      const prev = queryClient.getQueryData<Record<string, number>>(
        cityKeys.representativeFollowerCounts(cityId)
      );
      const d = String(district || "0");
      queryClient.setQueryData<Record<string, number>>(
        cityKeys.representativeFollowerCounts(cityId),
        (old) => ({ ...old, [d]: (old?.[d] ?? 0) + 1 })
      );
      return { prev };
    },
    onSuccess: (_data, _district) => {
      if (!cityId) return;
      queryClient.invalidateQueries({ queryKey: cityKeys.representativeFollows(cityId) });
    },
    onError: (_err, _district, ctx) => {
      if (cityId && ctx?.prev != null) {
        queryClient.setQueryData(
          cityKeys.representativeFollowerCounts(cityId),
          ctx.prev
        );
      }
    },
  });
}

/**
 * Hook to unfollow a city+district. Optimistically -1 count; invalidates my-follows on success.
 * We do NOT invalidate representativeFollowerCounts on success so the optimistic -1 is not
 * overwritten by a refetch; the count will correct on next natural refetch.
 */
export function useUnfollowRepresentative(cityId: number | null) {
  const { getAccessTokenSilently } = useAuth0();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (district: string) => {
      if (!cityId) throw new Error("City ID required");
      const token = await getAccessTokenSilently();
      return unfollowRepresentative(cityId, district, token);
    },
    onMutate: async (district) => {
      if (!cityId) return;
      await queryClient.cancelQueries({ queryKey: cityKeys.representativeFollowerCounts(cityId) });
      const prev = queryClient.getQueryData<Record<string, number>>(
        cityKeys.representativeFollowerCounts(cityId)
      );
      const d = String(district || "0");
      queryClient.setQueryData<Record<string, number>>(
        cityKeys.representativeFollowerCounts(cityId),
        (old) => {
          const v = (old?.[d] ?? 0) - 1;
          const next = { ...old, [d]: Math.max(0, v) };
          return next;
        }
      );
      return { prev };
    },
    onSuccess: (_data, _district) => {
      if (!cityId) return;
      queryClient.invalidateQueries({ queryKey: cityKeys.representativeFollows(cityId) });
    },
    onError: (_err, _district, ctx) => {
      if (cityId && ctx?.prev != null) {
        queryClient.setQueryData(
          cityKeys.representativeFollowerCounts(cityId),
          ctx.prev
        );
      }
    },
  });
}

/**
 * Hook to fetch city shapefiles.
 * Cache time: 10 minutes (shapefiles change rarely)
 */
export function useCityShapefiles(cityId: number | null) {
  const { getAccessTokenSilently } = useAuth0();

  return useQuery({
    queryKey: cityKeys.shapefiles(cityId!),
    queryFn: async () => {
      if (!cityId) throw new Error("City ID is required");
      const token = await getAccessTokenSilently();
      return getCityShapefiles(cityId, token);
    },
    enabled: !!cityId,
    staleTime: 10 * 60 * 1000, // 10 minutes
  });
}

/**
 * Hook to fetch city shape layers.
 * Cache time: 10 minutes
 */
export function useCityShapeLayers(cityId: number | null, includeGeometry: boolean = true) {
  const { getAccessTokenSilently } = useAuth0();

  return useQuery({
    queryKey: cityKeys.shapeLayers(cityId!, includeGeometry),
    queryFn: async () => {
      if (!cityId) throw new Error("City ID is required");
      const token = await getAccessTokenSilently();
      return getCityShapeLayers(cityId, token, includeGeometry);
    },
    enabled: !!cityId,
    staleTime: 10 * 60 * 1000, // 10 minutes
  });
}

/**
 * Hook to update a shape layer instance.
 * Invalidates shape layers cache on success.
 */
export function useUpdateShapeLayerInstance(cityId: number | null) {
  const { getAccessTokenSilently } = useAuth0();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ instanceId, updates }: { instanceId: number; updates: UpdateShapeLayerInstanceRequest }) => {
      if (!cityId) throw new Error("City ID is required");
      const token = await getAccessTokenSilently();
      return updateShapeLayerInstance(cityId, instanceId, updates, token);
    },
    onSuccess: () => {
      // Invalidate shape layers cache so it refetches
      queryClient.invalidateQueries({ queryKey: cityKeys.shapeLayers(cityId!, false) });
      queryClient.invalidateQueries({ queryKey: cityKeys.shapeLayers(cityId!, true) });
      queryClient.invalidateQueries({ queryKey: cityKeys.shapefiles(cityId!) });
      queryClient.invalidateQueries({ queryKey: cityKeys.structure(cityId!) });
    },
  });
}

/**
 * Hook to save a city for the current user.
 * Invalidates saved cities cache on success.
 */
export function useSaveCity() {
  const { getAccessTokenSilently } = useAuth0();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (cityId: number) => {
      const token = await getAccessTokenSilently();
      return saveCity(cityId, token);
    },
    onSuccess: async (data, cityId) => {
      // Invalidate saved cities cache so it refetches
      queryClient.invalidateQueries({ queryKey: cityKeys.saved() });
      
      // Track city saved event
      try {
        const { trackCitySaved } = await import("@/lib/analytics");
        // Get city name from cache if available
        const savedCities = queryClient.getQueryData<SavedCity[]>(cityKeys.saved());
        const city = savedCities?.find((c) => c.id === cityId);
        trackCitySaved(cityId, city?.display_name || city?.city_name || "Unknown");
      } catch (e) {
        // Analytics tracking failure shouldn't break the app
        console.error("Failed to track city saved event:", e);
      }
    },
  });
}

/**
 * Hook to unsave a city for the current user.
 * Invalidates saved cities cache on success.
 */
export function useUnsaveCity() {
  const { getAccessTokenSilently } = useAuth0();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (cityId: number) => {
      const token = await getAccessTokenSilently();
      return unsaveCity(cityId, token);
    },
    onSuccess: () => {
      // Invalidate saved cities cache so it refetches
      queryClient.invalidateQueries({ queryKey: cityKeys.saved() });
    },
  });
}


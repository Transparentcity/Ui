"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth0 } from "@auth0/auth0-react";
import { emitSavedCitiesChanged } from "@/lib/uiEvents";
import { getImpersonationCacheKey } from "@/lib/impersonation";
import {
  getCity,
  getCityMetrics,
  getSavedCities,
  getSavedDistricts,
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
  deleteShapeLayerInstance,
  saveCity,
  unsaveCity,
  type CityDetail,
  type SavedCity,
  type SavedDistrict,
  type CityListItem,
  type CityStructureData,
  type CityLeader,
  type CityShapefile,
  type CityShapeLayerListItem,
  type UpdateShapeLayerInstanceRequest,
} from "@/lib/apiClient";
import {
  getPublicCityDistricts,
  getCityBoundarySketch,
  type BoundarySketch,
} from "@/lib/publicApiClient";
import { listLeadersForClaim, type LeaderForClaim } from "@/lib/apiClient";

// Query keys factory for cities
export const cityKeys = {
  all: ["cities"] as const,
  lists: () => [...cityKeys.all, "list"] as const,
  list: (filters?: Record<string, any>) => [...cityKeys.lists(), filters] as const,
  details: () => [...cityKeys.all, "detail"] as const,
  detail: (id: number) => [...cityKeys.details(), id] as const,
  saved: () => [...cityKeys.all, "saved", getImpersonationCacheKey()] as const,
  savedDistricts: () =>
    [...cityKeys.all, "savedDistricts", getImpersonationCacheKey()] as const,
  structure: (id: number) => [...cityKeys.all, "structure", id] as const,
  leaders: (id: number) => [...cityKeys.all, "leaders", id] as const,
  representativeFollowerCounts: (id: number) =>
    [...cityKeys.all, "representativeFollowerCounts", id] as const,
  representativeFollows: (id: number) =>
    [...cityKeys.all, "representativeFollows", id, getImpersonationCacheKey()] as const,
  shapefiles: (id: number) => [...cityKeys.all, "shapefiles", id] as const,
  shapeLayers: (id: number, includeGeometry?: boolean) =>
    [...cityKeys.all, "shapeLayers", id, includeGeometry] as const,
  publicDistricts: (id: number) =>
    [...cityKeys.all, "publicDistricts", id] as const,
  leanLeaders: (id: number) => [...cityKeys.all, "leanLeaders", id] as const,
  boundarySketch: (id: number) => [...cityKeys.all, "boundarySketch", id] as const,
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
 * Cache time: 2 minutes (saved cities can change).
 * Pass options.enabled to defer until after critical data (e.g. city) has loaded so dashboard can show first.
 */
export function useSavedCities(options?: { enabled?: boolean }) {
  const { getAccessTokenSilently, isAuthenticated } = useAuth0();

  return useQuery({
    queryKey: cityKeys.saved(),
    queryFn: async () => {
      const token = await getAccessTokenSilently();
      return getSavedCities(token);
    },
    enabled: isAuthenticated && (options?.enabled !== false),
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
 * Hook to fetch district numbers that have metric data for a city (public API, no auth).
 * Used to show district nav when city has district-level data but no leaders in structure.
 */
export function usePublicCityDistricts(
  cityId: number | null,
  options?: { enabled?: boolean }
) {
  const enabled = options?.enabled !== undefined ? (!!cityId && options.enabled) : !!cityId;
  return useQuery({
    queryKey: cityKeys.publicDistricts(cityId!),
    queryFn: () => getPublicCityDistricts(cityId!),
    enabled,
    staleTime: 10 * 60 * 1000, // 10 minutes
  });
}

/**
 * Hook to fetch representative follower counts per district for a city.
 * Returns Record<string, number> keyed by district ("0"=mayor, "1"-"11"=districts).
 * On error or 404, data is {}. Cache time: 5 minutes.
 * Pass options.enabled to defer fetch (e.g. until city has loaded) to avoid blocking on slow connections.
 */
export function useRepresentativeFollowerCounts(
  cityId: number | null,
  options?: { enabled?: boolean }
) {
  const { getAccessTokenSilently } = useAuth0();
  const enabled = options?.enabled !== undefined ? (!!cityId && options.enabled) : !!cityId;

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
    enabled,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

/**
 * Hook to fetch which districts the current user follows for a city.
 * Returns Record<string, true> for followed districts. Cache: 2 minutes.
 * Pass options.enabled to defer fetch until after critical data has loaded.
 */
export function useRepresentativeFollows(
  cityId: number | null,
  options?: { enabled?: boolean }
) {
  const { getAccessTokenSilently } = useAuth0();
  const enabled = options?.enabled !== undefined ? (!!cityId && options.enabled) : !!cityId;

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
    enabled,
    staleTime: 2 * 60 * 1000,
  });
}

type RepresentativeFollowMutationCtx = {
  prevCounts?: Record<string, number>;
  prevFollows?: Record<string, boolean>;
};

/**
 * Hook to follow a city+district. Optimistically +1 count and mark district followed;
 * invalidates my-follows on success.
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
    onMutate: async (district): Promise<RepresentativeFollowMutationCtx> => {
      if (!cityId) return {};
      await queryClient.cancelQueries({ queryKey: cityKeys.representativeFollowerCounts(cityId) });
      await queryClient.cancelQueries({ queryKey: cityKeys.representativeFollows(cityId) });
      const prevCounts = queryClient.getQueryData<Record<string, number>>(
        cityKeys.representativeFollowerCounts(cityId)
      );
      const prevFollows = queryClient.getQueryData<Record<string, boolean>>(
        cityKeys.representativeFollows(cityId)
      );
      const d = String(district || "0");
      queryClient.setQueryData<Record<string, number>>(
        cityKeys.representativeFollowerCounts(cityId),
        (old) => ({ ...old, [d]: (old?.[d] ?? 0) + 1 })
      );
      queryClient.setQueryData<Record<string, boolean>>(
        cityKeys.representativeFollows(cityId),
        (old) => ({ ...(old ?? {}), [d]: true })
      );
      return { prevCounts, prevFollows };
    },
    onSuccess: (_data, _district) => {
      if (!cityId) return;
      queryClient.invalidateQueries({ queryKey: cityKeys.representativeFollows(cityId) });
      queryClient.invalidateQueries({ queryKey: cityKeys.saved() });
      queryClient.invalidateQueries({ queryKey: cityKeys.savedDistricts() });
      emitSavedCitiesChanged();
    },
    onError: (_err, district, ctx: RepresentativeFollowMutationCtx | undefined) => {
      if (!cityId || !ctx) return;
      if (ctx.prevCounts != null) {
        queryClient.setQueryData(
          cityKeys.representativeFollowerCounts(cityId),
          ctx.prevCounts
        );
      }
      const d = String(district || "0");
      if (ctx.prevFollows !== undefined) {
        queryClient.setQueryData(
          cityKeys.representativeFollows(cityId),
          ctx.prevFollows
        );
      } else {
        queryClient.setQueryData<Record<string, boolean>>(
          cityKeys.representativeFollows(cityId),
          (old) => {
            const next = { ...(old ?? {}) };
            delete next[d];
            return next;
          }
        );
      }
    },
  });
}

/**
 * Hook to unfollow a city+district. Optimistically -1 count and clear district from follows;
 * invalidates my-follows on success.
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
    onMutate: async (district): Promise<RepresentativeFollowMutationCtx> => {
      if (!cityId) return {};
      await queryClient.cancelQueries({ queryKey: cityKeys.representativeFollowerCounts(cityId) });
      await queryClient.cancelQueries({ queryKey: cityKeys.representativeFollows(cityId) });
      const prevCounts = queryClient.getQueryData<Record<string, number>>(
        cityKeys.representativeFollowerCounts(cityId)
      );
      const prevFollows = queryClient.getQueryData<Record<string, boolean>>(
        cityKeys.representativeFollows(cityId)
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
      queryClient.setQueryData<Record<string, boolean>>(
        cityKeys.representativeFollows(cityId),
        (old) => {
          const next = { ...(old ?? {}) };
          delete next[d];
          return next;
        }
      );
      return { prevCounts, prevFollows };
    },
    onSuccess: (_data, _district) => {
      if (!cityId) return;
      queryClient.invalidateQueries({ queryKey: cityKeys.representativeFollows(cityId) });
      queryClient.invalidateQueries({ queryKey: cityKeys.saved() });
      queryClient.invalidateQueries({ queryKey: cityKeys.savedDistricts() });
      emitSavedCitiesChanged();
    },
    onError: (_err, district, ctx: RepresentativeFollowMutationCtx | undefined) => {
      if (!cityId || !ctx) return;
      if (ctx.prevCounts != null) {
        queryClient.setQueryData(
          cityKeys.representativeFollowerCounts(cityId),
          ctx.prevCounts
        );
      }
      const d = String(district || "0");
      if (ctx.prevFollows !== undefined) {
        queryClient.setQueryData(
          cityKeys.representativeFollows(cityId),
          ctx.prevFollows
        );
      } else {
        queryClient.setQueryData<Record<string, boolean>>(
          cityKeys.representativeFollows(cityId),
          (old) => ({ ...(old ?? {}), [d]: true })
        );
      }
    },
  });
}

/**
 * Hook to fetch saved districts (My Districts) for the current user.
 * Returns list of followed city+district with display name and slug.
 */
export function useSavedDistricts() {
  const { getAccessTokenSilently } = useAuth0();

  return useQuery({
    queryKey: cityKeys.savedDistricts(),
    queryFn: async (): Promise<SavedDistrict[]> => {
      const token = await getAccessTokenSilently();
      return getSavedDistricts(token);
    },
    staleTime: 2 * 60 * 1000,
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
 * Hook to delete a shape layer instance.
 * Invalidates shape layers cache on success.
 */
export function useDeleteShapeLayerInstance(cityId: number | null) {
  const { getAccessTokenSilently } = useAuth0();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (instanceId: number) => {
      if (!cityId) throw new Error("City ID is required");
      const token = await getAccessTokenSilently();
      return deleteShapeLayerInstance(cityId, instanceId, token);
    },
    onSuccess: () => {
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
      queryClient.invalidateQueries({ queryKey: cityKeys.saved() });
      emitSavedCitiesChanged();

      try {
        const { trackCitySaved } = await import("@/lib/analytics");
        const savedCities = queryClient.getQueryData<SavedCity[]>(cityKeys.saved());
        const city = savedCities?.find((c) => c.id === cityId);
        trackCitySaved(cityId, city?.display_name || city?.city_name || "Unknown");
      } catch (e) {
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
      queryClient.invalidateQueries({ queryKey: cityKeys.saved() });
      emitSavedCitiesChanged();
    },
  });
}

/**
 * Lean leaders for the briefing header (public, no auth, fast).
 * Provides district rep + mayor immediately without waiting for the full city
 * structure. Data is long-cached since leaders rarely change.
 */
export function useLeanLeaders(
  cityId: number | null,
  options?: { enabled?: boolean }
) {
  return useQuery<LeaderForClaim[]>({
    queryKey: cityKeys.leanLeaders(cityId!),
    queryFn: () => listLeadersForClaim(cityId!),
    enabled: (options?.enabled ?? true) && !!cityId,
    staleTime: 1000 * 60 * 60,      // 1 hour
    gcTime: 1000 * 60 * 60 * 24,    // 24 hours
  });
}

/**
 * Simplified district boundary rings for the overview mini-map.
 * Public endpoint, heavily cached — district boundaries change very rarely.
 */
export function useBoundarySketch(
  cityId: number | null,
  options?: { enabled?: boolean }
) {
  return useQuery<BoundarySketch>({
    queryKey: cityKeys.boundarySketch(cityId!),
    queryFn: () => getCityBoundarySketch(cityId!),
    enabled: (options?.enabled ?? true) && !!cityId,
    staleTime: 1000 * 60 * 60 * 24,     // 24 hours
    gcTime: 1000 * 60 * 60 * 24 * 7,    // 7 days
  });
}


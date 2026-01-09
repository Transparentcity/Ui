"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth0 } from "@auth0/auth0-react";
import {
  getCityAdmin,
  getCityStats,
  getCityStructure,
  updateCity,
  updateCityStructure,
  refreshCityUrls,
  refreshCityMetadata,
  restructureCity,
  reloadQueryConfig,
  reloadAllGeographicQueryConfigs,
  reExtractLeaders,
  recreateStructureFromQueryConfigs,
  loadCityData,
  createCityLeader,
  updateCityLeader,
  deleteCityLeader,
  getAvailableModels,
  type CityAdminData,
  type CityStatsResponse,
  type CityStructureData,
  type UpdateCityRequest,
  type UpdateCityStructureRequest,
  type JobResponse,
  type ReloadAllGeographicResult,
  type LoadCityDataRequest,
  type LoadCityDataResponse,
  type CityLeader,
  type ModelGroupInfo,
  type RecreateStructureFromQueryConfigsResponse,
} from "@/lib/apiClient";

// Query keys factory for city admin
export const cityAdminKeys = {
  all: ["cityAdmin"] as const,
  details: () => [...cityAdminKeys.all, "detail"] as const,
  detail: (id: number) => [...cityAdminKeys.details(), id] as const,
  stats: (id: number) => [...cityAdminKeys.all, "stats", id] as const,
  structure: (id: number) => [...cityAdminKeys.all, "structure", id] as const,
  models: () => [...cityAdminKeys.all, "models"] as const,
};

/**
 * Hook to fetch city admin data by ID.
 * Cache time: 2 minutes (city admin data can change frequently)
 * @param cityId - City ID to fetch
 * @param initialData - Optional initial data to use (avoids unnecessary fetch)
 */
export function useCityAdmin(cityId: number | null, initialData?: any) {
  const { getAccessTokenSilently } = useAuth0();

  return useQuery({
    queryKey: cityAdminKeys.detail(cityId!),
    queryFn: async () => {
      if (!cityId) throw new Error("City ID is required");
      const token = await getAccessTokenSilently();
      return getCityAdmin(cityId, token);
    },
    enabled: !!cityId,
    staleTime: 2 * 60 * 1000, // 2 minutes
    initialData: initialData,
    // Only refetch if we don't have initial data
    refetchOnMount: !initialData,
  });
}

/**
 * Hook to fetch city stats.
 * Cache time: 2 minutes
 */
export function useCityStats(cityId: number | null) {
  const { getAccessTokenSilently } = useAuth0();

  return useQuery({
    queryKey: cityAdminKeys.stats(cityId!),
    queryFn: async () => {
      if (!cityId) throw new Error("City ID is required");
      const token = await getAccessTokenSilently();
      return getCityStats(cityId, token);
    },
    enabled: !!cityId,
    staleTime: 2 * 60 * 1000, // 2 minutes
  });
}

/**
 * Hook to fetch city structure data (admin version).
 * Cache time: 5 minutes (structure changes less frequently)
 * @param cityId - City ID to fetch
 * @param initialData - Optional initial data to use (avoids unnecessary fetch)
 */
export function useCityAdminStructure(cityId: number | null, initialData?: any) {
  const { getAccessTokenSilently } = useAuth0();

  return useQuery({
    queryKey: cityAdminKeys.structure(cityId!),
    queryFn: async () => {
      if (!cityId) throw new Error("City ID is required");
      const token = await getAccessTokenSilently();
      return getCityStructure(cityId, token);
    },
    enabled: !!cityId,
    staleTime: 5 * 60 * 1000, // 5 minutes
    initialData: initialData,
    // Only refetch if we don't have initial data
    refetchOnMount: !initialData,
  });
}

/**
 * Hook to fetch available AI models.
 * Cache time: 10 minutes (models change rarely)
 */
export function useAvailableModels() {
  const { getAccessTokenSilently } = useAuth0();

  return useQuery({
    queryKey: cityAdminKeys.models(),
    queryFn: async () => {
      const token = await getAccessTokenSilently();
      return getAvailableModels(token);
    },
    staleTime: 10 * 60 * 1000, // 10 minutes
  });
}

/**
 * Hook to update city data.
 * Invalidates city admin data and stats on success.
 */
export function useUpdateCity() {
  const { getAccessTokenSilently } = useAuth0();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ cityId, data }: { cityId: number; data: UpdateCityRequest }) => {
      const token = await getAccessTokenSilently();
      return updateCity(cityId, data, token);
    },
    onSuccess: (_, variables) => {
      // Invalidate city admin data and stats
      queryClient.invalidateQueries({ queryKey: cityAdminKeys.detail(variables.cityId) });
      queryClient.invalidateQueries({ queryKey: cityAdminKeys.stats(variables.cityId) });
      // Also invalidate the regular city data if it exists
      queryClient.invalidateQueries({ queryKey: ["cities", "detail", variables.cityId] });
    },
  });
}

/**
 * Hook to update city structure.
 * Invalidates city structure and admin data on success.
 */
export function useUpdateCityStructure() {
  const { getAccessTokenSilently } = useAuth0();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ cityId, data }: { cityId: number; data: UpdateCityStructureRequest }) => {
      const token = await getAccessTokenSilently();
      return updateCityStructure(cityId, data, token);
    },
    onSuccess: (_, variables) => {
      // Invalidate structure and admin data
      queryClient.invalidateQueries({ queryKey: cityAdminKeys.structure(variables.cityId) });
      queryClient.invalidateQueries({ queryKey: cityAdminKeys.detail(variables.cityId) });
      // Also invalidate the regular city structure if it exists
      queryClient.invalidateQueries({ queryKey: ["cities", "structure", variables.cityId] });
    },
  });
}

/**
 * Hook to refresh city URLs.
 * Returns a job response that can be monitored.
 */
export function useRefreshCityUrls() {
  const { getAccessTokenSilently } = useAuth0();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (cityId: number) => {
      const token = await getAccessTokenSilently();
      return refreshCityUrls(cityId, token);
    },
    onSuccess: (_, cityId) => {
      // Invalidate city admin data after a delay (to allow job to complete)
      // The component can manually refetch after job completion
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: cityAdminKeys.detail(cityId) });
      }, 2000);
    },
  });
}

/**
 * Hook to refresh city metadata.
 * Returns a job response that can be monitored.
 */
export function useRefreshCityMetadata() {
  const { getAccessTokenSilently } = useAuth0();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (cityId: number) => {
      const token = await getAccessTokenSilently();
      return refreshCityMetadata(cityId, token);
    },
    onSuccess: (_, cityId) => {
      // Invalidate city admin data after a delay
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: cityAdminKeys.detail(cityId) });
      }, 2000);
    },
  });
}

/**
 * Hook to load city data (with options for fetch_urls and fetch_metadata).
 * Returns a job response that can be monitored.
 */
export function useLoadCityData() {
  const { getAccessTokenSilently } = useAuth0();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ data }: { data: LoadCityDataRequest }) => {
      const token = await getAccessTokenSilently();
      return loadCityData(data, token);
    },
    onSuccess: (_, variables) => {
      // Invalidate city admin data for all affected cities
      variables.data.city_ids.forEach((cityId) => {
        setTimeout(() => {
          queryClient.invalidateQueries({ queryKey: cityAdminKeys.detail(cityId) });
        }, 2000);
      });
    },
  });
}

/**
 * Hook to restructure a city.
 * Returns a job response that can be monitored.
 */
export function useRestructureCity() {
  const { getAccessTokenSilently } = useAuth0();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ cityId, model }: { cityId: number; model?: string }) => {
      const token = await getAccessTokenSilently();
      return restructureCity(cityId, model, token);
    },
    onSuccess: (_, variables) => {
      // Invalidate structure and admin data after a delay
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: cityAdminKeys.structure(variables.cityId) });
        queryClient.invalidateQueries({ queryKey: cityAdminKeys.detail(variables.cityId) });
      }, 2000);
    },
  });
}

/**
 * Hook to reload a specific query config.
 * Invalidates city structure on success.
 */
export function useReloadQueryConfig() {
  const { getAccessTokenSilently } = useAuth0();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ cityId, configId }: { cityId: number; configId: number }) => {
      const token = await getAccessTokenSilently();
      return reloadQueryConfig(cityId, configId, token);
    },
    onSuccess: (_, variables) => {
      // Invalidate structure data to get updated query_output
      queryClient.invalidateQueries({ queryKey: cityAdminKeys.structure(variables.cityId) });
    },
  });
}

/**
 * Hook to reload all geographic query configs.
 * Invalidates city structure on success.
 */
export function useReloadAllGeographicQueryConfigs() {
  const { getAccessTokenSilently } = useAuth0();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (cityId: number) => {
      const token = await getAccessTokenSilently();
      return reloadAllGeographicQueryConfigs(cityId, token);
    },
    onSuccess: (_, cityId) => {
      // Invalidate structure data
      queryClient.invalidateQueries({ queryKey: cityAdminKeys.structure(cityId) });
    },
  });
}

/**
 * Hook to re-extract leaders from existing query configs.
 * Invalidates city structure on success.
 */
export function useReExtractLeaders() {
  const { getAccessTokenSilently } = useAuth0();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (cityId: number) => {
      const token = await getAccessTokenSilently();
      return reExtractLeaders(cityId, token);
    },
    onSuccess: (_, cityId) => {
      // Invalidate structure data to get updated leaders
      queryClient.invalidateQueries({ queryKey: cityAdminKeys.structure(cityId) });
    },
  });
}

/**
 * Hook to recreate structure from query configs.
 * Deletes existing structure data and re-downloads shapefiles and leaders.
 * Invalidates city structure and admin data on success.
 */
export function useRecreateStructureFromQueryConfigs() {
  const { getAccessTokenSilently } = useAuth0();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (cityId: number) => {
      const token = await getAccessTokenSilently();
      return recreateStructureFromQueryConfigs(cityId, token);
    },
    onSuccess: (_, cityId) => {
      // Invalidate structure and admin data to get updated structure
      queryClient.invalidateQueries({ queryKey: cityAdminKeys.structure(cityId) });
      queryClient.invalidateQueries({ queryKey: cityAdminKeys.detail(cityId) });
      // Also invalidate the regular city structure if it exists
      queryClient.invalidateQueries({ queryKey: ["cities", "structure", cityId] });
    },
  });
}

/**
 * Hook to create a city leader.
 * Invalidates city structure on success.
 */
export function useCreateCityLeader() {
  const { getAccessTokenSilently } = useAuth0();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ cityId, leader }: { cityId: number; leader: CityLeader }) => {
      const token = await getAccessTokenSilently();
      return createCityLeader(cityId, leader, token);
    },
    onSuccess: (_, variables) => {
      // Invalidate structure data to get updated leaders
      queryClient.invalidateQueries({ queryKey: cityAdminKeys.structure(variables.cityId) });
      // Also invalidate regular city leaders if it exists
      queryClient.invalidateQueries({ queryKey: ["cities", "leaders", variables.cityId] });
    },
  });
}

/**
 * Hook to update a city leader.
 * Invalidates city structure on success.
 */
export function useUpdateCityLeader() {
  const { getAccessTokenSilently } = useAuth0();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      cityId,
      leaderId,
      leader,
    }: {
      cityId: number;
      leaderId: number;
      leader: CityLeader;
    }) => {
      const token = await getAccessTokenSilently();
      return updateCityLeader(cityId, leaderId, leader, token);
    },
    onSuccess: (_, variables) => {
      // Invalidate structure data
      queryClient.invalidateQueries({ queryKey: cityAdminKeys.structure(variables.cityId) });
      // Also invalidate regular city leaders if it exists
      queryClient.invalidateQueries({ queryKey: ["cities", "leaders", variables.cityId] });
    },
  });
}

/**
 * Hook to delete a city leader.
 * Invalidates city structure on success.
 */
export function useDeleteCityLeader() {
  const { getAccessTokenSilently } = useAuth0();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ cityId, leaderId }: { cityId: number; leaderId: number }) => {
      const token = await getAccessTokenSilently();
      return deleteCityLeader(cityId, leaderId, token);
    },
    onSuccess: (_, variables) => {
      // Invalidate structure data
      queryClient.invalidateQueries({ queryKey: cityAdminKeys.structure(variables.cityId) });
      // Also invalidate regular city leaders if it exists
      queryClient.invalidateQueries({ queryKey: ["cities", "leaders", variables.cityId] });
    },
  });
}


"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth0 } from "@auth0/auth0-react";
import {
  getCity,
  getSavedCities,
  listCities,
  getCityStructure,
  getCityLeaders,
  getCityShapefiles,
  getCityShapeLayers,
  saveCity,
  unsaveCity,
  type CityDetail,
  type SavedCity,
  type CityListItem,
  type CityStructureData,
  type CityLeader,
  type CityShapefile,
  type CityShapeLayerListItem,
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
  shapefiles: (id: number) => [...cityKeys.all, "shapefiles", id] as const,
  shapeLayers: (id: number, includeGeometry?: boolean) =>
    [...cityKeys.all, "shapeLayers", id, includeGeometry] as const,
};

/**
 * Hook to fetch a single city by ID.
 * Cache time: 5 minutes (city data changes infrequently)
 */
export function useCity(cityId: number | null) {
  const { getAccessTokenSilently } = useAuth0();

  return useQuery({
    queryKey: cityKeys.detail(cityId!),
    queryFn: async () => {
      if (!cityId) throw new Error("City ID is required");
      const token = await getAccessTokenSilently();
      return getCity(cityId, token);
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
      return listCities(token, options?.includeInactive, options?.limit, options?.offset);
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
    onSuccess: () => {
      // Invalidate saved cities cache so it refetches
      queryClient.invalidateQueries({ queryKey: cityKeys.saved() });
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


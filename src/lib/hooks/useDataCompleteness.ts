"use client";

import { useQuery } from "@tanstack/react-query";
import { useAuth0 } from "@auth0/auth0-react";
import {
  listCities,
  listAdminMetricCities,
  listAdminMetrics,
  getAdminMetricsSummary,
  getCity,
  type CityListItem,
  type AdminMetricCity,
  type AdminMetricListItem,
  type AdminMetricSummary,
} from "@/lib/apiClient";

// Query keys factory
export const completenessKeys = {
  all: ["data-completeness"] as const,
  cities: () => [...completenessKeys.all, "cities"] as const,
  metricCities: () => [...completenessKeys.all, "metric-cities"] as const,
  metrics: () => [...completenessKeys.all, "metrics"] as const,
  summary: () => [...completenessKeys.all, "summary"] as const,
  cityDetail: (id: number) => [...completenessKeys.all, "city", id] as const,
};

export interface CompletenessData {
  cities: CityListItem[];
  metricCities: AdminMetricCity[];
  metrics: AdminMetricListItem[];
  summary: AdminMetricSummary | null;
  isLoading: boolean;
  isError: boolean;
}

export function useCompletenessData(): CompletenessData {
  const { getAccessTokenSilently, isAuthenticated, isLoading } = useAuth0();

  const authReady = !isLoading && !!isAuthenticated;

  const citiesQuery = useQuery({
    queryKey: completenessKeys.cities(),
    queryFn: async () => {
      const token = await getAccessTokenSilently();
      if (!token?.trim()) {
        throw new Error("Not authenticated: no access token. Log in and try again.");
      }
      return listCities(token);
    },
    staleTime: 5 * 60 * 1000,
    enabled: authReady,
  });

  const metricCitiesQuery = useQuery({
    queryKey: completenessKeys.metricCities(),
    queryFn: async () => {
      const token = await getAccessTokenSilently();
      if (!token?.trim()) {
        throw new Error("Not authenticated: no access token. Log in and try again.");
      }
      return listAdminMetricCities(token);
    },
    staleTime: 5 * 60 * 1000,
    enabled: authReady,
  });

  const metricsQuery = useQuery({
    queryKey: completenessKeys.metrics(),
    queryFn: async () => {
      const token = await getAccessTokenSilently();
      if (!token?.trim()) {
        throw new Error("Not authenticated: no access token. Log in and try again.");
      }
      return listAdminMetrics(token, { limit: 500 });
    },
    staleTime: 5 * 60 * 1000,
    enabled: authReady,
  });

  const summaryQuery = useQuery({
    queryKey: completenessKeys.summary(),
    queryFn: async () => {
      const token = await getAccessTokenSilently();
      if (!token?.trim()) {
        throw new Error("Not authenticated: no access token. Log in and try again.");
      }
      return getAdminMetricsSummary(token);
    },
    staleTime: 5 * 60 * 1000,
    enabled: authReady,
  });

  return {
    cities: citiesQuery.data ?? [],
    metricCities: metricCitiesQuery.data ?? [],
    metrics: metricsQuery.data ?? [],
    summary: summaryQuery.data ?? null,
    isLoading:
      citiesQuery.isLoading ||
      metricCitiesQuery.isLoading ||
      metricsQuery.isLoading,
    isError:
      citiesQuery.isError ||
      metricCitiesQuery.isError ||
      metricsQuery.isError,
  };
}

export function useCityDetail(cityId: number | null) {
  const { getAccessTokenSilently, isAuthenticated, isLoading } = useAuth0();

  return useQuery({
    queryKey: completenessKeys.cityDetail(cityId ?? 0),
    queryFn: async () => {
      const token = await getAccessTokenSilently();
      if (!token?.trim()) {
        throw new Error("Not authenticated: no access token. Log in and try again.");
      }
      return getCity(cityId!, token);
    },
    enabled: cityId !== null && !isLoading && !!isAuthenticated,
    staleTime: 5 * 60 * 1000,
  });
}

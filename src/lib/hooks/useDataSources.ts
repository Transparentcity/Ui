"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth0 } from "@auth0/auth0-react";

import {
  listWasteAdminDataSources,
  refreshWasteAdminDataSource,
  resetWasteAdminDataSource,
  runWasteAdminDataSourceHealthCheck,
  type WasteAdminDataSourceList,
} from "@/lib/api/dataSources";

const STALE_MED = 30_000;

export const dataSourceKeys = {
  all: ["waste-admin", "data-sources"] as const,
  list: () => [...dataSourceKeys.all, "list"] as const,
};

/**
 * Fetch the registered federal data adapters and their health/circuit state.
 * Authenticates with the Auth0 access token, like the rest of the waste admin.
 */
export function useWasteAdminDataSources() {
  const { getAccessTokenSilently, isAuthenticated } = useAuth0();
  return useQuery<WasteAdminDataSourceList>({
    queryKey: dataSourceKeys.list(),
    queryFn: async () => {
      const token = await getAccessTokenSilently();
      return listWasteAdminDataSources(token);
    },
    enabled: isAuthenticated,
    staleTime: STALE_MED,
    refetchOnWindowFocus: false,
  });
}

/** Refresh a single adapter, then refresh the cached list. */
export function useRefreshWasteAdminDataSource() {
  const { getAccessTokenSilently } = useAuth0();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (adapterKey: string) => {
      const token = await getAccessTokenSilently();
      return refreshWasteAdminDataSource(token, adapterKey);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: dataSourceKeys.list() });
    },
  });
}

/** Reset a single adapter's circuit breaker, then refresh the cached list. */
export function useResetWasteAdminDataSource() {
  const { getAccessTokenSilently } = useAuth0();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (adapterKey: string) => {
      const token = await getAccessTokenSilently();
      return resetWasteAdminDataSource(token, adapterKey);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: dataSourceKeys.list() });
    },
  });
}

/** Run a health check across all adapters, then refresh the cached list. */
export function useRunWasteAdminDataSourceHealthCheck() {
  const { getAccessTokenSilently } = useAuth0();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const token = await getAccessTokenSilently();
      return runWasteAdminDataSourceHealthCheck(token);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: dataSourceKeys.list() });
    },
  });
}

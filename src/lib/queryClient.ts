"use client";

import { QueryClient } from "@tanstack/react-query";

/**
 * Configured QueryClient for React Query.
 * 
 * Default options:
 * - staleTime: 5 minutes - Data is considered fresh for 5 minutes
 * - cacheTime: 10 minutes - Unused data stays in cache for 10 minutes
 * - refetchOnWindowFocus: false - Don't refetch when window regains focus
 * - refetchOnReconnect: true - Refetch when network reconnects
 * - retry: 1 - Retry failed requests once
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 minutes
      gcTime: 10 * 60 * 1000, // 10 minutes (formerly cacheTime)
      refetchOnWindowFocus: false,
      refetchOnReconnect: true,
      retry: 1,
      refetchOnMount: true,
    },
    mutations: {
      retry: 1,
    },
  },
});






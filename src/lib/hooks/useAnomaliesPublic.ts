"use client";

import { useQuery } from "@tanstack/react-query";
import {
  listAnomaliesPublic,
  type ListAnomaliesPublicResponse,
  type PublicAnomalyResult,
} from "@/lib/publicApiClient";

// Re-export types for consumers
export type { PublicAnomalyResult, ListAnomaliesPublicResponse };

// Query keys factory for public anomalies
export const anomalyPublicKeys = {
  all: ["anomalies-public"] as const,
  lists: () => [...anomalyPublicKeys.all, "list"] as const,
  list: (filters?: Record<string, unknown>) =>
    [...anomalyPublicKeys.lists(), filters] as const,
};

/**
 * Hook to list anomalies WITHOUT authentication.
 * Uses the /api/anomalies endpoint.
 * Useful for CRM pages and other contexts where Auth0 login is not required.
 * 
 * Cache time: 2 minutes
 */
export function useAnomaliesPublic(options?: { 
  metric_id?: number; 
  is_anomaly?: boolean | null; 
  period_type?: string; 
  period_date?: string | null;
  limit?: number;
  city_id?: number;
  district?: number | null;
}) {
  return useQuery({
    queryKey: anomalyPublicKeys.list(options),
    queryFn: () => listAnomaliesPublic(options),
    staleTime: 2 * 60 * 1000, // 2 minutes
    enabled: true,
  });
}

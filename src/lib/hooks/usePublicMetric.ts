"use client";

import { useQuery } from "@tanstack/react-query";
import {
  getPublicMetric,
  getPublicMetricComparisons,
  getPublicMetricTimeSeriesSummary,
  type PublicMetricDetail,
  type PublicMetricComparisons,
  type PublicTimeSeriesSummary,
} from "../publicApiClient";

/**
 * Hook to fetch public metric detail.
 */
export function usePublicMetric(metricId: number | null) {
  return useQuery<PublicMetricDetail>({
    queryKey: ["public-metric", metricId],
    queryFn: () => getPublicMetric(metricId!),
    enabled: metricId !== null,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

/**
 * Hook to fetch public metric comparisons (YTD, MTD, etc.).
 */
export function usePublicMetricComparisons(
  metricId: number | null,
  district?: number | null,
  comparisonTypes?: string
) {
  return useQuery<PublicMetricComparisons>({
    queryKey: ["public-metric-comparisons", metricId, district, comparisonTypes],
    queryFn: () =>
      getPublicMetricComparisons(metricId!, district, comparisonTypes),
    enabled: metricId !== null,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

/**
 * Hook to fetch public metric time series summary.
 */
export function usePublicMetricTimeSeriesSummary(metricId: number | null) {
  return useQuery<PublicTimeSeriesSummary>({
    queryKey: ["public-metric-time-series-summary", metricId],
    queryFn: () => getPublicMetricTimeSeriesSummary(metricId!),
    enabled: metricId !== null,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

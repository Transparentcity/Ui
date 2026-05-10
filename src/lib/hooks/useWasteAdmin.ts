"use client";

import { useQuery } from "@tanstack/react-query";
import { useAuth0 } from "@auth0/auth0-react";

import {
  getWasteAdminReadout,
  getWasteAdminReport,
  getWasteAdminSeymourFeed,
  listWasteAdminCities,
  listWasteAdminDetectors,
  listWasteAdminFindings,
  listWasteAdminReports,
  type WasteAdminCityRow,
  type WasteAdminDetectorRow,
  type WasteAdminFindingRow,
  type WasteAdminPeriod,
  type WasteAdminReadoutResponse,
  type WasteAdminReportDetail,
  type WasteAdminReportRow,
  type WasteAdminSeverityFilter,
  type WasteAdminSeymourFeed,
} from "@/lib/api/wasteAdmin";

const STALE_MED = 30_000;
const STALE_LONG = 5 * 60_000;

export function useWasteAdminCities() {
  const { getAccessTokenSilently, isAuthenticated } = useAuth0();
  return useQuery<WasteAdminCityRow[]>({
    queryKey: ["waste-admin", "cities"],
    queryFn: async () => {
      const token = await getAccessTokenSilently();
      return listWasteAdminCities(token);
    },
    enabled: isAuthenticated,
    staleTime: STALE_LONG,
    refetchOnWindowFocus: false,
  });
}

export function useWasteAdminDetectors(citySlug: string | null) {
  const { getAccessTokenSilently, isAuthenticated } = useAuth0();
  return useQuery<WasteAdminDetectorRow[]>({
    queryKey: ["waste-admin", "detectors", citySlug],
    queryFn: async () => {
      if (!citySlug) throw new Error("city required");
      const token = await getAccessTokenSilently();
      return listWasteAdminDetectors(token, citySlug);
    },
    enabled: isAuthenticated && !!citySlug,
    staleTime: STALE_LONG,
    refetchOnWindowFocus: false,
  });
}

export function useWasteAdminFindings(params: {
  citySlug: string | null;
  period?: WasteAdminPeriod;
  filter?: WasteAdminSeverityFilter;
  limit?: number;
}) {
  const { getAccessTokenSilently, isAuthenticated } = useAuth0();
  return useQuery<WasteAdminFindingRow[]>({
    queryKey: [
      "waste-admin",
      "findings",
      params.citySlug,
      params.period ?? "week",
      params.filter ?? "all",
      params.limit ?? 100,
    ],
    queryFn: async () => {
      if (!params.citySlug) throw new Error("city required");
      const token = await getAccessTokenSilently();
      return listWasteAdminFindings(token, {
        city: params.citySlug,
        period: params.period,
        filter: params.filter,
        limit: params.limit,
      });
    },
    enabled: isAuthenticated && !!params.citySlug,
    staleTime: STALE_MED,
    refetchOnWindowFocus: false,
  });
}

export function useWasteAdminReadout(citySlug: string | null) {
  const { getAccessTokenSilently, isAuthenticated } = useAuth0();
  return useQuery<WasteAdminReadoutResponse>({
    queryKey: ["waste-admin", "readout", citySlug],
    queryFn: async () => {
      if (!citySlug) throw new Error("city required");
      const token = await getAccessTokenSilently();
      return getWasteAdminReadout(token, citySlug);
    },
    enabled: isAuthenticated && !!citySlug,
    staleTime: STALE_MED,
    refetchOnWindowFocus: false,
  });
}

export function useWasteAdminReports(citySlug: string | null) {
  const { getAccessTokenSilently, isAuthenticated } = useAuth0();
  return useQuery<WasteAdminReportRow[]>({
    queryKey: ["waste-admin", "reports", citySlug],
    queryFn: async () => {
      if (!citySlug) throw new Error("city required");
      const token = await getAccessTokenSilently();
      return listWasteAdminReports(token, citySlug);
    },
    enabled: isAuthenticated && !!citySlug,
    staleTime: STALE_MED,
    refetchOnWindowFocus: false,
  });
}

export function useWasteAdminReport(slug: string | null, citySlug: string | null) {
  const { getAccessTokenSilently, isAuthenticated } = useAuth0();
  return useQuery<WasteAdminReportDetail>({
    queryKey: ["waste-admin", "report", slug, citySlug],
    queryFn: async () => {
      if (!slug || !citySlug) throw new Error("slug and city required");
      const token = await getAccessTokenSilently();
      return getWasteAdminReport(token, slug, citySlug);
    },
    enabled: isAuthenticated && !!slug && !!citySlug,
    staleTime: STALE_MED,
    refetchOnWindowFocus: false,
  });
}

export function useWasteAdminSeymourFeed(citySlug: string | null) {
  const { getAccessTokenSilently, isAuthenticated } = useAuth0();
  return useQuery<WasteAdminSeymourFeed>({
    queryKey: ["waste-admin", "seymour", citySlug],
    queryFn: async () => {
      if (!citySlug) throw new Error("city required");
      const token = await getAccessTokenSilently();
      return getWasteAdminSeymourFeed(token, citySlug);
    },
    enabled: isAuthenticated && !!citySlug,
    staleTime: STALE_MED,
    refetchOnWindowFocus: false,
  });
}

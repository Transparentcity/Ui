"use client";

import { useQuery } from "@tanstack/react-query";
import { useAuth0 } from "@auth0/auth0-react";
import { useImpersonationCacheKey } from "@/lib/impersonation";
import {
  getPublicCityMandates,
  type PublicCityMandate,
} from "@/lib/publicApiClient";

export type CityMandatesState =
  | { status: "idle"; mandates: PublicCityMandate[] }
  | { status: "loading"; mandates: PublicCityMandate[] }
  | { status: "ready"; mandates: PublicCityMandate[] }
  /** API answered 401/403: dark-launched and the viewer is not an admin. */
  | { status: "forbidden"; mandates: PublicCityMandate[] }
  | { status: "error"; mandates: PublicCityMandate[]; message: string };

const NONE: PublicCityMandate[] = [];

function httpStatus(err: unknown): number | undefined {
  return (err as { status?: number } | null)?.status;
}

/**
 * Fetch a city's legal mandates client-side, sending the Auth0 token when the
 * viewer is signed in (admins can see mandates before MANDATES_PUBLIC is set).
 * Pass `enabled: false` (or a null city) to skip the request.
 */
export function useCityMandates(
  cityId: number | null | undefined,
  { enabled = true }: { enabled?: boolean } = {}
): CityMandatesState {
  const { isAuthenticated, isLoading: authLoading, getAccessTokenSilently } = useAuth0();
  const identityKey = useImpersonationCacheKey();
  const active = enabled && cityId != null;

  const query = useQuery({
    queryKey: ["public", "city-mandates", cityId, isAuthenticated, identityKey],
    queryFn: async () => {
      let token: string | null = null;
      if (isAuthenticated) {
        try {
          token = await getAccessTokenSilently();
        } catch {
          token = null;
        }
      }
      return getPublicCityMandates(cityId as number, token);
    },
    enabled: active && !authLoading,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    retry: (count, err) => {
      const s = httpStatus(err);
      if (s === 401 || s === 403 || s === 404) return false;
      return count < 2;
    },
  });

  if (!active) return { status: "idle", mandates: NONE };
  if (query.data) return { status: "ready", mandates: query.data.mandates ?? NONE };
  if (query.isError) {
    const s = httpStatus(query.error);
    if (s === 401 || s === 403) return { status: "forbidden", mandates: NONE };
    return {
      status: "error",
      mandates: NONE,
      message: query.error instanceof Error ? query.error.message : "Failed to load mandates",
    };
  }
  return { status: "loading", mandates: NONE };
}

/**
 * When onboarding search hits a city we don't support yet, we still record the
 * user's real-world home intent in preferences (extra + home_location shape).
 */

export const REQUESTED_UNSUPPORTED_HOME_KEY = "requested_home_city_unsupported" as const;

export interface RequestedUnsupportedHome {
  city_name: string;
  state: string | null;
  country: string | null;
  recorded_at: string;
  source: "onboarding_city_search";
}

export function hasSupportedHomeCityId(
  extra: Record<string, unknown> | null | undefined
): boolean {
  const hl = extra?.home_location;
  if (!hl || typeof hl !== "object") return false;
  const id = (hl as { city_id?: unknown }).city_id;
  return id != null && id !== "" && Number.isFinite(Number(id));
}

/** Merge unsupported-home request into preferences `extra` (shallow merge on extra root). */
export function buildUnsupportedHomePreferenceExtra(
  currentExtra: Record<string, unknown> | null | undefined,
  cityName: string,
  state: string | null,
  country: string | null
): Record<string, unknown> {
  const base: Record<string, unknown> = { ...(currentExtra || {}) };
  const locationLabel = state ? `${cityName}, ${state}` : cityName;
  const payload: RequestedUnsupportedHome = {
    city_name: cityName,
    state,
    country,
    recorded_at: new Date().toISOString(),
    source: "onboarding_city_search",
  };
  base[REQUESTED_UNSUPPORTED_HOME_KEY] = payload;
  base.home_location = {
    city_id: null,
    location_label: locationLabel,
    unsupported_city_request: true,
  };
  return base;
}

export function parseRequestedUnsupportedHome(
  extra: Record<string, unknown> | null | undefined
): RequestedUnsupportedHome | null {
  const raw = extra?.[REQUESTED_UNSUPPORTED_HOME_KEY];
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const name = o.city_name;
  if (typeof name !== "string" || !name.trim()) return null;
  return {
    city_name: name.trim(),
    state: typeof o.state === "string" ? o.state : null,
    country: typeof o.country === "string" ? o.country : null,
    recorded_at: typeof o.recorded_at === "string" ? o.recorded_at : "",
    source: "onboarding_city_search",
  };
}

/** Strip unsupported-home bookkeeping when user picks a supported TransparentCity home. */
export function stripUnsupportedHomeRequest(
  extra: Record<string, unknown> | null | undefined
): Record<string, unknown> {
  const next: Record<string, unknown> = { ...(extra || {}) };
  delete next[REQUESTED_UNSUPPORTED_HOME_KEY];
  return next;
}

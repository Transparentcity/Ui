import type { UserPlace } from "@/lib/apiClient";

export interface HomePlaceLandingTarget {
  cityId: number;
  placeId: number;
}

function parsePositiveInt(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.trunc(n);
}

function homeLocationRecord(
  extra: Record<string, unknown> | null | undefined,
): Record<string, unknown> | null {
  const hl = extra?.home_location;
  if (!hl || typeof hl !== "object") return null;
  return hl as Record<string, unknown>;
}

function hasHomeCoordinates(h: Record<string, unknown>): boolean {
  const coords = h.coordinates;
  if (!coords || typeof coords !== "object") return false;
  const lat = (coords as { lat?: unknown }).lat;
  const lng = (coords as { lng?: unknown }).lng;
  return typeof lat === "number" && typeof lng === "number";
}

/**
 * Resolve the saved place a returning user should land on when opening /home.
 * Returns null when the user has no street-level / saved-place home configured.
 */
export function resolveHomePlaceLandingTarget(
  extra: Record<string, unknown> | null | undefined,
  userPlaces: UserPlace[],
): HomePlaceLandingTarget | null {
  const h = homeLocationRecord(extra);
  if (!h) return null;

  const cityId = parsePositiveInt(h.city_id);
  if (cityId == null) return null;

  const explicitPlaceId = parsePositiveInt(h.place_id);
  if (explicitPlaceId != null) {
    const matched = userPlaces.find((p) => p.id === explicitPlaceId);
    if (matched != null && matched.city_id !== cityId) return null;
    return { cityId, placeId: explicitPlaceId };
  }

  if (!hasHomeCoordinates(h)) return null;

  const cityPlaces = userPlaces.filter((p) => p.city_id === cityId);
  if (cityPlaces.length === 0) return null;
  if (cityPlaces.length === 1) {
    return { cityId, placeId: cityPlaces[0].id };
  }

  const coords = h.coordinates as { lat: number; lng: number };
  let best = cityPlaces[0];
  let bestDist = Infinity;
  for (const place of cityPlaces) {
    const dist =
      (place.lat - coords.lat) ** 2 + (place.lng - coords.lng) ** 2;
    if (dist < bestDist) {
      bestDist = dist;
      best = place;
    }
  }
  return { cityId, placeId: best.id };
}

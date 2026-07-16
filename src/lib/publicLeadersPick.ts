import type { PublicLeader } from "@/lib/publicApiClient";

/** Minimal leader shape shared by PublicLeader and CityLeader. */
export interface LeaderLike {
  name: string;
  title?: string | null;
  district?: number | null;
}

/** Sentinel for at-large council seats (e.g. Cincinnati). Not citywide (0) or null. */
export const AT_LARGE_DISTRICT = -1;

/** True only for explicit citywide scope (mayor / executive). */
export function isCitywideDistrict(d: number | null | undefined): boolean {
  return d === 0;
}

/**
 * Pick the citywide official (mayor/executive) from a leaders list.
 *
 * At-large council (district -1) and legacy null-district rows must not be
 * treated as citywide. Preference order:
 *   1. district === 0 with "mayor" in title
 *   2. district === 0 with executive-style title
 *   3. district === 0 (explicit citywide row)
 *   4. legacy null district with "mayor" in title only
 */
export function pickCitywideLeader<T extends LeaderLike>(leaders: T[]): T | null {
  const explicitCitywide = leaders.filter((l) => l.district === 0);
  const titled = (list: T[], needle: string) =>
    list.find((l) => (l.title || "").toLowerCase().includes(needle));

  const fromExplicit =
    titled(explicitCitywide, "mayor") ??
    titled(explicitCitywide, "executive") ??
    explicitCitywide[0];
  if (fromExplicit) return fromExplicit;

  // Legacy: mayor row stored with null district instead of 0
  const legacyNull = leaders.filter(
    (l) => l.district === null || l.district === undefined
  );
  return titled(legacyNull, "mayor") ?? titled(legacyNull, "executive") ?? null;
}

/**
 * Pick citywide mayor from public leaders (mirrors backend heuristics loosely).
 */
export function pickMayorFromPublicLeaders(leaders: PublicLeader[]): PublicLeader | null {
  return pickCitywideLeader(leaders);
}

/**
 * First leader tied to a numbered district (excludes citywide / null district rows).
 */
export function pickDistrictSupervisorFromPublicLeaders(
  leaders: PublicLeader[],
  district: number
): PublicLeader | null {
  if (district === 0 || Number.isNaN(district)) return null;
  const matches = leaders.filter((l) => l.district === district);
  return matches[0] ?? null;
}

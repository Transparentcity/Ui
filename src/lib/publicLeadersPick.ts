import type { PublicLeader } from "@/lib/publicApiClient";

/**
 * Pick citywide mayor from public leaders (mirrors backend heuristics loosely).
 */
export function pickMayorFromPublicLeaders(leaders: PublicLeader[]): PublicLeader | null {
  for (const L of leaders) {
    const d = L.district;
    const t = (L.title || "").toLowerCase();
    if ((d === null || d === 0) && t.includes("mayor")) {
      return L;
    }
  }
  for (const L of leaders) {
    const d = L.district;
    if (d === null || d === 0) {
      return L;
    }
  }
  return null;
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

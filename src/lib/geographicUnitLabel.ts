import type { CityDetail, CityLeader } from "@/lib/apiClient";

export type GeographicStructureLike = NonNullable<
  NonNullable<CityDetail["geographic_structures"]>[number]
>;

function primaryGeographicStructureIdFromLeaders(
  leaders: CityLeader[],
): number | null {
  const structureIdCounts = new Map<number, number>();
  for (const leader of leaders) {
    const gid = leader.geographic_structure_id;
    if (gid == null) continue;
    structureIdCounts.set(gid, (structureIdCounts.get(gid) || 0) + 1);
  }
  let primary: number | null = null;
  let maxCount = 0;
  structureIdCounts.forEach((count, structureId) => {
    if (count > maxCount) {
      maxCount = count;
      primary = structureId;
    }
  });
  return primary;
}

/**
 * User-facing subdivision label (e.g. Ward vs District) from city structure metadata
 * and leaders' geographic_structure_id.
 */
export function resolveGeographicUnitLabel(
  leaders: CityLeader[],
  geographicStructures?: GeographicStructureLike[] | null | undefined,
): string {
  const structures = geographicStructures?.filter(Boolean) ?? [];
  const primaryId = primaryGeographicStructureIdFromLeaders(leaders);

  let meta: GeographicStructureLike | undefined;
  if (primaryId != null) {
    meta = structures.find((s) => s.id === primaryId);
  }
  if (!meta && structures.length === 1) {
    meta = structures[0];
  }
  const blob = `${(meta?.structure_name ?? "").toLowerCase()} ${(meta?.structure_type ?? "").toLowerCase()}`;
  if (blob.includes("ward")) return "Ward";
  if (blob.includes("precinct")) return "Precinct";
  if (blob.includes("beat")) return "Beat";
  if (blob.includes("division")) return "Division";
  return "District";
}

export function pluralGeographicUnitLabel(unit: string): string {
  const lower = unit.toLowerCase();
  if (lower === "district") return "Districts";
  if (lower === "precinct") return "Precincts";
  if (lower === "beat") return "Beats";
  if (lower === "division") return "Divisions";
  if (lower === "ward") return "Wards";
  return `${unit}s`;
}

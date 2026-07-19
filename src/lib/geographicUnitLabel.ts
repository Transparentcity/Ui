import type { CityDetail, CityLeader } from "@/lib/apiClient";

export type GeographicStructureLike = NonNullable<
  NonNullable<CityDetail["geographic_structures"]>[number]
>;

/** Shape layer instance (minimal interface needed for label resolution). */
export type ShapeLayerInstanceLike = {
  id?: number;
  shapefile_name?: string;
  structure_type?: string;
  is_official_district_layer?: boolean;
};

/**
 * User-facing subdivision label (e.g. Ward vs District) from shape layers
 * (shape-layer-first) with a fallback to geographic structures.
 *
 * Priority:
 * 1. Shape layer flagged is_official_district_layer
 * 2. leaders' district_shape_layer_id plurality
 * 3. Legacy: leaders' geographic_structure_id plurality → geographic structures
 */
export function resolveGeographicUnitLabel(
  leaders: CityLeader[],
  geographicStructures?: GeographicStructureLike[] | null | undefined,
  shapeLayers?: ShapeLayerInstanceLike[] | null | undefined,
  officialDistrictShapeLayerId?: number | null,
): string {
  // 1. Use the official district shape layer if available
  let officialLayer: ShapeLayerInstanceLike | undefined;
  if (officialDistrictShapeLayerId != null && shapeLayers) {
    officialLayer = shapeLayers.find((sl) => sl.id === officialDistrictShapeLayerId);
  }
  if (!officialLayer && shapeLayers) {
    officialLayer = shapeLayers.find((sl) => sl.is_official_district_layer);
  }

  if (officialLayer) {
    const blob = `${(officialLayer.shapefile_name ?? "").toLowerCase()} ${(officialLayer.structure_type ?? "").toLowerCase()}`;
    if (blob.includes("ward")) return "Ward";
    if (blob.includes("precinct")) return "Precinct";
    if (blob.includes("beat")) return "Beat";
    if (blob.includes("division")) return "Division";
    // At-large cities use their neighborhoods layer as the official unit
    if (blob.includes("neighborhood") || blob.includes("subcommunit") || blob.includes("sna")) return "Neighborhood";
    // 'district' returns the default at the end
  }

  // 2. Leader plurality → district_shape_layer_id
  if (shapeLayers && leaders.length > 0) {
    const layerIdCounts = new Map<number, number>();
    for (const leader of leaders) {
      const lid = (leader as any).district_shape_layer_id as number | null | undefined;
      if (lid == null) continue;
      layerIdCounts.set(lid, (layerIdCounts.get(lid) || 0) + 1);
    }
    let primaryLayerId: number | null = null;
    let maxCount = 0;
    layerIdCounts.forEach((count, id) => {
      if (count > maxCount) { maxCount = count; primaryLayerId = id; }
    });
    if (primaryLayerId != null) {
      const layer = shapeLayers.find((sl) => sl.id === primaryLayerId);
      if (layer) {
        const blob = `${(layer.shapefile_name ?? "").toLowerCase()} ${(layer.structure_type ?? "").toLowerCase()}`;
        if (blob.includes("ward")) return "Ward";
        if (blob.includes("precinct")) return "Precinct";
        if (blob.includes("beat")) return "Beat";
        if (blob.includes("division")) return "Division";
      }
    }
  }

  // 3. Legacy: geographic_structure_id → geographic structures
  const structures = geographicStructures?.filter(Boolean) ?? [];
  if (structures.length > 0 && leaders.length > 0) {
    const structureIdCounts = new Map<number, number>();
    for (const leader of leaders) {
      const gid = leader.geographic_structure_id;
      if (gid == null) continue;
      structureIdCounts.set(gid, (structureIdCounts.get(gid) || 0) + 1);
    }
    let primaryId: number | null = null;
    let maxCount = 0;
    structureIdCounts.forEach((count, structureId) => {
      if (count > maxCount) { maxCount = count; primaryId = structureId; }
    });
    let meta: GeographicStructureLike | undefined;
    if (primaryId != null) meta = structures.find((s) => s.id === primaryId);
    if (!meta && structures.length === 1) meta = structures[0];
    const blob = `${(meta?.structure_name ?? "").toLowerCase()} ${(meta?.structure_type ?? "").toLowerCase()}`;
    if (blob.includes("ward")) return "Ward";
    if (blob.includes("precinct")) return "Precinct";
    if (blob.includes("beat")) return "Beat";
    if (blob.includes("division")) return "Division";
  }

  return "District";
}

export function pluralGeographicUnitLabel(unit: string): string {
  const lower = unit.toLowerCase();
  if (lower === "district") return "Districts";
  if (lower === "precinct") return "Precincts";
  if (lower === "beat") return "Beats";
  if (lower === "division") return "Divisions";
  if (lower === "ward") return "Wards";
  if (lower === "neighborhood") return "Neighborhoods";
  return `${unit}s`;
}

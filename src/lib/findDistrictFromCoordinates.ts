/**
 * Resolve district number from (lat, lng) for a given city using shapefiles.
 * Used by onboarding and Edit Home Location to add the district to My places.
 */

import {
  getCityStructure,
  getCityShapeLayers,
  getCityLeaders,
  type CityShapefile,
} from "@/lib/apiClient";

function pointInPolygon(point: [number, number], polygon: [number, number][]): boolean {
  const [x, y] = point;
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i];
    const [xj, yj] = polygon[j];
    if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) {
      inside = !inside;
    }
  }
  return inside;
}

/**
 * Pure point-in-polygon district lookup over already-loaded shapefiles.
 * Shapefiles matching `officialDistrictShapeLayerId` are checked first.
 * Falls back to the old `primaryGeographicStructureId` for backward compatibility.
 */
export function resolveDistrictFromShapefiles(
  lat: number,
  lng: number,
  shapefiles: CityShapefile[],
  primaryGeographicStructureId: number | null = null,
  officialDistrictShapeLayerId: number | null = null
): number | null {
  const point: [number, number] = [lng, lat];

  const primaryShapefiles: CityShapefile[] = [];
  const otherShapefiles: CityShapefile[] = [];
  shapefiles.forEach((shapefile) => {
    const isOfficial =
      officialDistrictShapeLayerId != null &&
      shapefile.id === officialDistrictShapeLayerId;
    const isLegacyPrimary =
      !isOfficial &&
      primaryGeographicStructureId != null &&
      (shapefile as any).geographic_structure_id === primaryGeographicStructureId;
    if (isOfficial || isLegacyPrimary) {
      primaryShapefiles.push(shapefile);
    } else {
      otherShapefiles.push(shapefile);
    }
  });

  const shapefilesToCheck = [...primaryShapefiles, ...otherShapefiles];

  for (const shapefile of shapefilesToCheck) {
    const geometryData = shapefile.geometry_data;
    if (!geometryData || geometryData.type !== "FeatureCollection") continue;

    for (const feature of geometryData.features) {
      if (!feature.geometry || !feature.geometry.coordinates) continue;
      let rings: [number, number][][] = [];
      if (feature.geometry.type === "Polygon") {
        rings = [feature.geometry.coordinates[0] as [number, number][]];
      } else if (feature.geometry.type === "MultiPolygon") {
        rings = feature.geometry.coordinates.map(
          (poly: unknown) => (poly as [number, number][][])[0] as [number, number][]
        );
      }
      for (const ring of rings) {
        if (pointInPolygon(point, ring)) {
          const identifier = feature.properties?.[shapefile.identifier_field || ""];
          if (identifier !== undefined && identifier !== null) {
            const districtNum =
              typeof identifier === "number"
                ? identifier
                : parseInt(String(identifier).replace(/\D/g, ""), 10);
            if (!isNaN(districtNum)) return districtNum;
          }
        }
      }
    }
  }
  return null;
}

/**
 * Get the official district shape layer ID from leaders (new) or
 * the most common geographic_structure_id (legacy fallback).
 */
export function primaryShapeLayerIdFromLeaders(
  leaders: Array<{ district_shape_layer_id?: number | null; geographic_structure_id?: number | null }> | null | undefined
): { shapeLayerId: number | null; geoStructureId: number | null } {
  if (!leaders || leaders.length === 0) return { shapeLayerId: null, geoStructureId: null };

  // New: count district_shape_layer_id
  const layerIdCounts = new Map<number, number>();
  leaders.forEach((leader) => {
    if (leader.district_shape_layer_id) {
      const count = layerIdCounts.get(leader.district_shape_layer_id) || 0;
      layerIdCounts.set(leader.district_shape_layer_id, count + 1);
    }
  });
  let shapeLayerId: number | null = null;
  let maxCount = 0;
  layerIdCounts.forEach((count, id) => {
    if (count > maxCount) {
      maxCount = count;
      shapeLayerId = id;
    }
  });

  // Legacy: count geographic_structure_id
  const structureIdCounts = new Map<number, number>();
  leaders.forEach((leader) => {
    if (leader.geographic_structure_id) {
      const count = structureIdCounts.get(leader.geographic_structure_id) || 0;
      structureIdCounts.set(leader.geographic_structure_id, count + 1);
    }
  });
  let geoStructureId: number | null = null;
  let geoMaxCount = 0;
  structureIdCounts.forEach((count, structureId) => {
    if (count > geoMaxCount) {
      geoMaxCount = count;
      geoStructureId = structureId;
    }
  });

  return { shapeLayerId, geoStructureId };
}

/** @deprecated Use primaryShapeLayerIdFromLeaders instead */
export function primaryStructureIdFromLeaders(
  leaders: Array<{ geographic_structure_id?: number | null }> | null | undefined
): number | null {
  const result = primaryShapeLayerIdFromLeaders(leaders);
  return result.geoStructureId;
}

export async function findDistrictFromCoordinates(
  lat: number,
  lng: number,
  cityId: number,
  token: string
): Promise<number | null> {
  try {
    const [cityStructure, shapeLayers] = await Promise.all([
      getCityStructure(cityId, token),
      getCityShapeLayers(cityId, token),
    ]);

    if (!cityStructure || !shapeLayers || shapeLayers.length === 0) {
      return null;
    }

    // Prefer official_district_shape_layer_id from city structure (new)
    let officialDistrictShapeLayerId: number | null =
      (cityStructure as any).official_district_shape_layer_id ?? null;

    let primaryGeographicStructureId: number | null = null;

    if (!officialDistrictShapeLayerId) {
      const leaders = await getCityLeaders(cityId, token);
      const { shapeLayerId, geoStructureId } = primaryShapeLayerIdFromLeaders(leaders);
      officialDistrictShapeLayerId = shapeLayerId;
      primaryGeographicStructureId = geoStructureId;

      if (!officialDistrictShapeLayerId && !primaryGeographicStructureId && cityStructure.geographic_structures) {
        const districtStructure = cityStructure.geographic_structures.find(
          (gs) =>
            gs.structure_name?.toLowerCase().includes("supervisor") ||
            gs.structure_name?.toLowerCase().includes("council") ||
            gs.structure_name?.toLowerCase().includes("ward")
        );
        if (districtStructure && districtStructure.id !== undefined) {
          primaryGeographicStructureId = districtStructure.id ?? null;
        }
      }
    }

    const shapefiles: CityShapefile[] = shapeLayers
      .map((layer) => layer.instance)
      .filter((instance): instance is CityShapefile => instance !== null);

    return resolveDistrictFromShapefiles(
      lat,
      lng,
      shapefiles,
      primaryGeographicStructureId,
      officialDistrictShapeLayerId
    );
  } catch (error) {
    console.error("Error finding district from coordinates:", error);
    return null;
  }
}

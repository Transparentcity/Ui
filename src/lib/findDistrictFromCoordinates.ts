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
import { resolveNeighborhoodIdFromProps } from "@/lib/atLargeCouncilNav";

const POSTAL_LAYER_RE = /\b(zip|zipcode|zip_code|postal|postcode|zcta)\b/i;
const ZIP_VALUE_RE = /^\d{5}(-\d{4})?$/;
const DISTRICT_LIKE_RE =
  /district|ward|precinct|council|supervisor|alder|neighborhood|sna/;

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

/** True for ZIP / postal / ZCTA boundary layers — never a council district. */
export function isPostalShapefile(shapefile: CityShapefile): boolean {
  const blob = [
    shapefile.shapefile_name,
    shapefile.structure_type,
    shapefile.identifier_field,
    shapefile.identifier_type,
  ]
    .filter(Boolean)
    .join(" ");
  return POSTAL_LAYER_RE.test(blob);
}

function isDistrictLikeShapefile(shapefile: CityShapefile): boolean {
  if (isPostalShapefile(shapefile)) return false;
  const blob = `${shapefile.shapefile_name ?? ""} ${shapefile.structure_type ?? ""}`;
  return DISTRICT_LIKE_RE.test(blob.toLowerCase());
}

/**
 * Parse a shapefile identifier into a council-district number.
 * Rejects US ZIP / ZIP+4 values so postal layers cannot become "District 94102".
 */
export function parseDistrictIdentifier(raw: unknown): number | null {
  if (raw === undefined || raw === null || typeof raw === "boolean") return null;
  const text = String(raw).trim();
  if (!text || ZIP_VALUE_RE.test(text)) return null;
  const districtNum =
    typeof raw === "number" && Number.isFinite(raw)
      ? Math.trunc(raw)
      : parseInt(text.replace(/\D/g, ""), 10);
  if (!Number.isFinite(districtNum) || Number.isNaN(districtNum)) return null;
  if (districtNum >= 10000 && districtNum <= 99999) return null;
  return districtNum;
}

/**
 * Pure point-in-polygon district lookup over already-loaded shapefiles.
 * Official / flagged district layers are checked first. ZIP / postal layers
 * are skipped so an address's postcode cannot be stored as the district.
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
  const districtLikeShapefiles: CityShapefile[] = [];
  shapefiles.forEach((shapefile) => {
    if (isPostalShapefile(shapefile)) return;
    const isOfficial =
      shapefile.is_official_district_layer === true ||
      (officialDistrictShapeLayerId != null &&
        shapefile.id === officialDistrictShapeLayerId);
    const isLegacyPrimary =
      !isOfficial &&
      primaryGeographicStructureId != null &&
      (shapefile as any).geographic_structure_id === primaryGeographicStructureId;
    if (isOfficial || isLegacyPrimary) {
      primaryShapefiles.push(shapefile);
    } else if (isDistrictLikeShapefile(shapefile)) {
      districtLikeShapefiles.push(shapefile);
    }
  });

  const shapefilesToCheck = [...primaryShapefiles, ...districtLikeShapefiles];

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
          const props = feature.properties ?? {};
          const identifier = props[shapefile.identifier_field || ""];
          const districtNum = parseDistrictIdentifier(identifier);
          if (districtNum != null) return districtNum;
          // Name-identified layers (e.g. Cincinnati SNA_NAME="North Avondale")
          // yield no digits above; fall back to the canonical numeric id the
          // backend derives (SNA_NUMBER etc.), shared with neighborhood nav.
          const fallbackId = resolveNeighborhoodIdFromProps(
            props as Record<string, unknown>,
            null,
          );
          if (fallbackId != null && fallbackId < 10000) return fallbackId;
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

    const shapefiles: CityShapefile[] = shapeLayers
      .filter((layer) => layer.template?.layer_key !== "zip_codes")
      .map((layer) => layer.instance)
      .filter((instance): instance is CityShapefile => instance !== null)
      .filter((instance) => !isPostalShapefile(instance));

    // Prefer official_district_shape_layer_id from city structure, then the
    // is_official_district_layer flag on the instance (structure API may omit it).
    let officialDistrictShapeLayerId: number | null =
      (cityStructure as any).official_district_shape_layer_id ??
      shapefiles.find((sf) => sf.is_official_district_layer)?.id ??
      null;

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

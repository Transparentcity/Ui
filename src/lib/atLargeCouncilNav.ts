/**
 * Navigation helpers for cities with at-large city council (e.g. Cincinnati).
 * Residents choose neighborhoods for local scope; council members are shown for
 * awareness only.
 */

import type { CityShapefile } from "@/lib/apiClient";
import { AT_LARGE_DISTRICT, type LeaderLike } from "@/lib/publicLeadersPick";

export interface NeighborhoodNavOption {
  id: number;
  name: string;
}

function pointInPolygon(point: [number, number], polygon: [number, number][]): boolean {
  const [x, y] = point;
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i];
    const [xj, yj] = polygon[j];
    if (((yi > y) !== (yj > y)) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

function parseGeometryData(geometryData: unknown): GeoJSON.FeatureCollection | null {
  if (!geometryData) return null;
  if (typeof geometryData === "string") {
    try {
      const parsed = JSON.parse(geometryData) as GeoJSON.FeatureCollection;
      return parsed?.type === "FeatureCollection" ? parsed : null;
    } catch {
      return null;
    }
  }
  const fc = geometryData as GeoJSON.FeatureCollection;
  return fc?.type === "FeatureCollection" ? fc : null;
}

function isNeighborhoodShapefile(shapefile: CityShapefile): boolean {
  const type = (shapefile.structure_type || "").toLowerCase();
  const name = (shapefile.shapefile_name || "").toLowerCase();
  return (
    type === "neighborhood" ||
    name.includes("neighborhood") ||
    name.includes("subcommunit") ||
    name.includes("sna")
  );
}

function resolveNeighborhoodNameFromProps(
  props: Record<string, unknown>,
  nameField: string,
): string {
  const candidates = [
    props[nameField],
    props.SNA_NAME,
    props.sna_name,
    props.neighborhood,
    props.NAME,
    props.name,
  ];
  for (const raw of candidates) {
    if (raw == null) continue;
    const text = String(raw).trim();
    if (text) return text;
  }
  return "";
}

function resolveNeighborhoodIdFromProps(
  props: Record<string, unknown>,
  numericField: string | null,
): number | null {
  const candidates: unknown[] = [];
  if (numericField) candidates.push(props[numericField]);
  candidates.push(props.SNA_NUMBER, props.sna_number, props.OBJECTID, props.FID, props.id);

  for (const raw of candidates) {
    if (raw == null || raw === "") continue;
    const parsed =
      typeof raw === "number"
        ? raw
        : parseInt(String(raw).replace(/\D/g, ""), 10);
    if (!Number.isNaN(parsed) && parsed > 0) return parsed;
  }
  return null;
}

function detectNumericIdField(
  shapefile: CityShapefile,
  sampleProps: Record<string, unknown> | undefined,
): string | null {
  if (!sampleProps) return null;
  for (const key of ["SNA_NUMBER", "sna_number", "OBJECTID", "FID", "id"]) {
    if (key in sampleProps) return key;
  }
  const idField = shapefile.identifier_field;
  if (idField && typeof sampleProps[idField] === "number") return idField;
  return null;
}

/** True when every council seat is at-large (no numbered district reps). */
export function isAtLargeCouncilCity(leaders: LeaderLike[]): boolean {
  const hasAtLarge = leaders.some((l) => l.district === AT_LARGE_DISTRICT);
  const hasNumberedReps = leaders.some(
    (l) => l.district != null && l.district > 0,
  );
  return hasAtLarge && !hasNumberedReps;
}

/** At-large councilmembers (informational; not navigation targets). */
export function getAtLargeCouncilMembers<T extends LeaderLike>(leaders: T[]): T[] {
  return leaders
    .filter((l) => l.district === AT_LARGE_DISTRICT)
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function extractNeighborhoodShapefiles(
  shapefiles: CityShapefile[],
): CityShapefile[] {
  return shapefiles.filter(isNeighborhoodShapefile);
}

/** Neighborhood options from active neighborhood shape layers (e.g. Cincinnati SNA). */
export function extractNeighborhoodOptions(
  shapefiles: CityShapefile[],
): NeighborhoodNavOption[] {
  const options: NeighborhoodNavOption[] = [];
  const seenIds = new Set<number>();
  const seenNames = new Set<string>();

  for (const shapefile of extractNeighborhoodShapefiles(shapefiles)) {
    const geometryData = parseGeometryData(shapefile.geometry_data);
    if (!geometryData?.features?.length) continue;

    const nameField = shapefile.identifier_field || "SNA_NAME";
    const numericField = detectNumericIdField(
      shapefile,
      geometryData.features[0]?.properties as Record<string, unknown> | undefined,
    );

    for (const feature of geometryData.features) {
      const props = (feature.properties || {}) as Record<string, unknown>;
      const name = resolveNeighborhoodNameFromProps(props, nameField);
      if (!name) continue;

      const id = resolveNeighborhoodIdFromProps(props, numericField);
      if (id == null || seenIds.has(id)) continue;

      const nameKey = name.toLowerCase();
      if (seenNames.has(nameKey)) continue;

      seenIds.add(id);
      seenNames.add(nameKey);
      options.push({ id, name });
    }
  }

  return options.sort((a, b) => a.name.localeCompare(b.name));
}

export function resolveNeighborhoodName(
  districtId: number,
  shapefiles: CityShapefile[],
): string | null {
  return (
    extractNeighborhoodOptions(shapefiles).find((o) => o.id === districtId)?.name ??
    null
  );
}

/** Point-in-polygon lookup against neighborhood layers; returns SNA id + name. */
export function findNeighborhoodFromPoint(
  lat: number,
  lng: number,
  shapefiles: CityShapefile[],
): NeighborhoodNavOption | null {
  const point: [number, number] = [lng, lat];

  for (const shapefile of extractNeighborhoodShapefiles(shapefiles)) {
    const geometryData = parseGeometryData(shapefile.geometry_data);
    if (!geometryData?.features?.length) continue;

    const nameField = shapefile.identifier_field || "SNA_NAME";
    const numericField = detectNumericIdField(
      shapefile,
      geometryData.features[0]?.properties as Record<string, unknown> | undefined,
    );

    for (const feature of geometryData.features) {
      const geometry = feature.geometry;
      if (!geometry) continue;

      let rings: [number, number][][] = [];
      if (geometry.type === "Polygon") {
        rings = [geometry.coordinates[0] as [number, number][]];
      } else if (geometry.type === "MultiPolygon") {
        rings = geometry.coordinates.map(
          (poly) => (poly as [number, number][][])[0] as [number, number][],
        );
      } else {
        continue;
      }

      for (const ring of rings) {
        if (!pointInPolygon(point, ring)) continue;
        const props = (feature.properties || {}) as Record<string, unknown>;
        const name = resolveNeighborhoodNameFromProps(props, nameField);
        const id = resolveNeighborhoodIdFromProps(props, numericField);
        if (name && id != null) return { id, name };
      }
    }
  }

  return null;
}

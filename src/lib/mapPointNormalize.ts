/**
 * Normalize point rows so each has numeric lat/lon (handles GeoJSON and common field names).
 */

import { isJunkWgs84LngLat } from "@/lib/mapCoordinateSanity";

export function normalizePointData(
  points: Array<Record<string, unknown>>
): Array<{ lat: number; lon: number; [key: string]: any }> {
  const toNum = (v: unknown): number | null => {
    if (typeof v === "number" && Number.isFinite(v)) return v;
    if (typeof v === "string" && v.trim() !== "") {
      const n = parseFloat(v);
      return Number.isFinite(n) ? n : null;
    }
    return null;
  };

  return points
    .map((p: Record<string, unknown>) => {
      let lat: number | null = null;
      let lon: number | null = null;

      const latDirect = toNum(p.lat);
      const lonDirect = toNum(p.lon ?? p.lng);
      if (latDirect != null && lonDirect != null) {
        lat = latDirect;
        lon = lonDirect;
      }

      if (lat == null || lon == null) {
        const geoJsonFields = ["intersection_point", "point", "location", "geometry", "geom"];
        for (const field of geoJsonFields) {
          const geoPoint = p[field] as { type?: string; coordinates?: unknown[] } | undefined;
          if (geoPoint && geoPoint.type === "Point" && Array.isArray(geoPoint.coordinates)) {
            const lngN = toNum(geoPoint.coordinates[0]);
            const latN = toNum(geoPoint.coordinates[1]);
            if (latN != null && lngN != null) {
              lat = latN;
              lon = lngN;
              break;
            }
          }
        }
      }

      if (lat == null || lon == null) {
        const la = toNum(p.latitude);
        const lo = toNum(p.longitude);
        if (la != null && lo != null) {
          lat = la;
          lon = lo;
        }
      }

      if (lat == null || lon == null) {
        return null;
      }

      if (isJunkWgs84LngLat(lon, lat)) {
        return null;
      }

      return { ...p, lat, lon };
    })
    .filter((p): p is { lat: number; lon: number; [key: string]: any } => p !== null);
}

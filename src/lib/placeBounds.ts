/**
 * Bounding box for a saved place when metrics filter with separate lat/lon columns.
 * Must match `get_place_radius_bounding_box` in
 * `transparentcity/services/place_metrics_service.py`.
 */
export function getPlaceRadiusBoundingBox(
  lat: number,
  lng: number,
  radiusMeters: number
): { latLo: number; latHi: number; lonLo: number; lonHi: number } {
  const deltaLat = radiusMeters / 111320.0;
  const cosLat = Math.max(0.01, Math.cos((lat * Math.PI) / 180));
  const deltaLon = radiusMeters / (111320.0 * cosLat);
  return {
    latLo: lat - deltaLat,
    latHi: lat + deltaLat,
    lonLo: lng - deltaLon,
    lonHi: lng + deltaLon,
  };
}

/** GeoJSON Polygon (lon, lat) ring, closed, for Mapbox fill layer. */
export function getPlaceRadiusBoundingBoxPolygon(
  lat: number,
  lng: number,
  radiusMeters: number
): { type: "Polygon"; coordinates: [number, number][][] } {
  const b = getPlaceRadiusBoundingBox(lat, lng, radiusMeters);
  const ring: [number, number][] = [
    [b.lonLo, b.latLo],
    [b.lonHi, b.latLo],
    [b.lonHi, b.latHi],
    [b.lonLo, b.latHi],
    [b.lonLo, b.latLo],
  ];
  return { type: "Polygon", coordinates: [ring] };
}

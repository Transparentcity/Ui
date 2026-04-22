/**
 * Drop placeholder WGS84 coordinates that are numerically valid but should not
 * appear on city maps or participate in fitBounds (e.g. (-1,-1), (0,0)).
 */

export function isJunkWgs84LngLat(lng: number, lat: number): boolean {
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) return true;
  if (Math.abs(lng) > 180 || Math.abs(lat) > 90) return true;
  if (lng === 0 && lat === 0) return true;
  if (lng === -1 && lat === -1) return true;
  if (lng === 0 && lat === -1) return true;
  if (lng === -1 && lat === 0) return true;
  return false;
}

/**
 * Parse and validate a lng/lat pair for map display. Returns null for junk,
 * non-finite values, or coordinates outside the WGS84 range.
 */
export function sanitizeMapDisplayLngLat(
  rawLng: unknown,
  rawLat: unknown,
): [number, number] | null {
  const lng = typeof rawLng === "number" ? rawLng : parseFloat(String(rawLng));
  const lat = typeof rawLat === "number" ? rawLat : parseFloat(String(rawLat));
  if (Number.isNaN(lng) || Number.isNaN(lat)) return null;
  if (isJunkWgs84LngLat(lng, lat)) return null;
  return [lng, lat];
}

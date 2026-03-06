/**
 * Build a Mapbox static map URL showing a point and optional radius circle.
 * Used for onboarding, sidebar city search, and official selector place save.
 */
export const DEFAULT_PLACE_RADIUS_M = 300;
export const DEFAULT_MAP_ZOOM = 13;

export function buildStaticMapUrl(
  lat: number,
  lng: number,
  radiusM: number,
  zoom: number = DEFAULT_MAP_ZOOM,
  width: number = 340,
  height: number = 160
): string | null {
  const token =
    typeof process !== "undefined" ? process.env.NEXT_PUBLIC_MAPBOX_TOKEN : undefined;
  if (!token) return null;

  const points = 32;
  const latDeg = radiusM / 111320;
  const cosLat = Math.max(Math.cos((lat * Math.PI) / 180), 1e-6);
  const lngDeg = radiusM / (111320 * cosLat);
  const coords: [number, number][] = [];
  for (let i = 0; i <= points; i++) {
    const a = (i / points) * 2 * Math.PI;
    coords.push([lng + lngDeg * Math.cos(a), lat + latDeg * Math.sin(a)]);
  }
  // Center dot: small circle polygon (~8m) so static API renders a dot, not a pin
  const dotRadiusM = 8;
  const dotLatDeg = dotRadiusM / 111320;
  const dotLngDeg = dotRadiusM / (111320 * cosLat);
  const dotCoords: [number, number][] = [];
  for (let i = 0; i <= points; i++) {
    const a = (i / points) * 2 * Math.PI;
    dotCoords.push([lng + dotLngDeg * Math.cos(a), lat + dotLatDeg * Math.sin(a)]);
  }
  const geojson = {
    type: "FeatureCollection" as const,
    features: [
      {
        type: "Feature" as const,
        geometry: { type: "Polygon" as const, coordinates: [[...coords, coords[0]]] },
        properties: {
          fill: "#ad35fa",
          "fill-opacity": 0.25,
          stroke: "#ad35fa",
          "stroke-width": 2,
        },
      },
      {
        type: "Feature" as const,
        geometry: { type: "Polygon" as const, coordinates: [[...dotCoords, dotCoords[0]]] },
        properties: {
          fill: "#ad35fa",
          "fill-opacity": 1,
          stroke: "#ad35fa",
          "stroke-width": 1,
        },
      },
    ],
  };
  const encoded = encodeURIComponent(JSON.stringify(geojson));
  const style = "mapbox/light-v11";
  return `https://api.mapbox.com/styles/v1/${style}/static/geojson(${encoded})/${lng},${lat},${zoom}/${width}x${height}@2x?access_token=${token}`;
}

/**
 * Build a Mapbox static map URL showing a point and optional radius circle.
 * Used for onboarding, sidebar city search, and official selector place save.
 */
export const DEFAULT_PLACE_RADIUS_M = 300;
export const DEFAULT_MAP_ZOOM = 13;

/** Zoom levels for initial map view by scope (no data loaded yet). */
export const INITIAL_ZOOM_CITYWIDE = 10;
export const INITIAL_ZOOM_DISTRICT = 12;
/** Block view default: zoomed out ~2 levels from close-up so more context is visible. */
export const INITIAL_ZOOM_BLOCK = 13;

/**
 * Default brand choropleth ramp (Mapbox fill from GeoJSON `color`).
 * Low is a very light lavender (#f6edff), not pure white, so polygons stay visible on light basemaps.
 */
export const CHOROPLETH_BRAND_LOW_RGB: [number, number, number] = [246, 237, 255];
/** Saturated end of the default ramp (#ad35fa). */
export const CHOROPLETH_BRAND_HIGH_RGB: [number, number, number] = [173, 53, 250];

/** Basemap style the choropleth colors are tuned for (matches Mapbox light-v11 / dark-v11). */
export type ChoroplethBasemapTheme = "light" | "dark";

export const CHOROPLETH_NO_DATA_LIGHT = "#e5e7eb";
/** No-data fill on dark basemap (subtle vs black land). */
export const CHOROPLETH_NO_DATA_DARK = "#475569";

/**
 * Dark basemap: same purple high as light mode; low is a cool light grey (not pure white)
 * so the ramp reads grey → purple on mapbox dark-v11.
 */
export const CHOROPLETH_DARK_LOW_RGB: [number, number, number] = [232, 232, 236];

export interface ChoroplethBrandRamp {
  low: [number, number, number];
  high: [number, number, number];
  noDataFill: string;
}

/**
 * Brand choropleth interpolation endpoints and no-data fill for the active Mapbox basemap.
 */
export function getChoroplethBrandRamp(
  basemapTheme: ChoroplethBasemapTheme
): ChoroplethBrandRamp {
  if (basemapTheme === "dark") {
    return {
      low: CHOROPLETH_DARK_LOW_RGB,
      high: CHOROPLETH_BRAND_HIGH_RGB,
      noDataFill: CHOROPLETH_NO_DATA_DARK,
    };
  }
  return {
    low: CHOROPLETH_BRAND_LOW_RGB,
    high: CHOROPLETH_BRAND_HIGH_RGB,
    noDataFill: CHOROPLETH_NO_DATA_LIGHT,
  };
}

/** Approximate US state centroids [lng, lat] for fast initial map center (city-level view). */
const US_STATE_CENTROIDS: Record<string, [number, number]> = {
  AL: [-86.9023, 32.3182],
  AK: [-153.4937, 64.2008],
  AZ: [-111.0937, 34.0489],
  AR: [-92.3731, 34.9697],
  CA: [-119.4179, 36.7783],
  CO: [-105.3111, 39.113],
  CT: [-72.7554, 41.6032],
  DE: [-75.5277, 38.9108],
  FL: [-81.5158, 27.6648],
  GA: [-83.6431, 32.1574],
  HI: [-155.5828, 19.8968],
  ID: [-114.742, 44.0682],
  IL: [-89.3985, 40.6331],
  IN: [-86.1349, 40.2672],
  IA: [-93.0977, 41.878],
  KS: [-98.4842, 38.5266],
  KY: [-84.2700, 37.6681],
  LA: [-91.9623, 31.1695],
  ME: [-69.4455, 45.2538],
  MD: [-76.6413, 39.0458],
  MA: [-71.3824, 42.4072],
  MI: [-84.5361, 43.3266],
  MN: [-94.6859, 46.7296],
  MS: [-89.3985, 32.3547],
  MO: [-91.8318, 37.9643],
  MT: [-110.3626, 46.8797],
  NE: [-99.9018, 41.4925],
  NV: [-116.4194, 38.8026],
  NH: [-71.5724, 43.1939],
  NJ: [-74.4057, 40.0583],
  NM: [-105.8701, 34.5199],
  NY: [-75.4999, 43.2994],
  NC: [-79.0193, 35.7596],
  ND: [-99.7840, 47.5515],
  OH: [-82.9071, 40.4173],
  OK: [-97.0929, 35.0078],
  OR: [-120.5542, 43.8041],
  PA: [-77.1945, 41.2033],
  RI: [-71.4774, 41.5801],
  SC: [-81.1637, 33.8361],
  SD: [-99.9018, 43.9695],
  TN: [-86.5804, 35.5175],
  TX: [-99.9018, 31.9686],
  UT: [-111.0937, 39.321],
  VT: [-72.5778, 44.5588],
  VA: [-78.6569, 37.4316],
  WA: [-120.7401, 47.7511],
  WV: [-80.4549, 38.5976],
  WI: [-89.6165, 43.7844],
  WY: [-107.2903, 43.076],
  DC: [-77.0369, 38.9072],
};

/** Default US center when state is unknown (continental US). */
const DEFAULT_US_CENTER: [number, number] = [-98.5795, 39.8283];

/** Full state name -> 2-letter code for initial map center. */
const US_STATE_FULL_TO_ABBR: Record<string, string> = {
  ALABAMA: "AL",
  ALASKA: "AK",
  ARIZONA: "AZ",
  ARKANSAS: "AR",
  CALIFORNIA: "CA",
  COLORADO: "CO",
  CONNECTICUT: "CT",
  DELAWARE: "DE",
  "DISTRICT OF COLUMBIA": "DC",
  FLORIDA: "FL",
  GEORGIA: "GA",
  HAWAII: "HI",
  IDAHO: "ID",
  ILLINOIS: "IL",
  INDIANA: "IN",
  IOWA: "IA",
  KANSAS: "KS",
  KENTUCKY: "KY",
  LOUISIANA: "LA",
  MAINE: "ME",
  MARYLAND: "MD",
  MASSACHUSETTS: "MA",
  MICHIGAN: "MI",
  MINNESOTA: "MN",
  MISSISSIPPI: "MS",
  MISSOURI: "MO",
  MONTANA: "MT",
  NEBRASKA: "NE",
  NEVADA: "NV",
  "NEW HAMPSHIRE": "NH",
  "NEW JERSEY": "NJ",
  "NEW MEXICO": "NM",
  "NEW YORK": "NY",
  "NORTH CAROLINA": "NC",
  "NORTH DAKOTA": "ND",
  OHIO: "OH",
  OKLAHOMA: "OK",
  OREGON: "OR",
  PENNSYLVANIA: "PA",
  "RHODE ISLAND": "RI",
  "SOUTH CAROLINA": "SC",
  "SOUTH DAKOTA": "SD",
  TENNESSEE: "TN",
  TEXAS: "TX",
  UTAH: "UT",
  VERMONT: "VT",
  VIRGINIA: "VA",
  WASHINGTON: "WA",
  "WEST VIRGINIA": "WV",
  WISCONSIN: "WI",
  WYOMING: "WY",
};

export interface InitialMapView {
  center: [number, number];
  zoom: number;
}

function getStateAbbr(state: string): string | null {
  const s = state.trim().toUpperCase();
  if (s.length === 2) return s;
  return US_STATE_FULL_TO_ABBR[s] ?? null;
}

/**
 * Return an initial map center and zoom from city info (no API/geometry).
 * Used to show the base map immediately; shapefile-based center can replace this later.
 */
export function getInitialMapView(city: {
  name?: string | null;
  state?: string | null;
  country?: string | null;
  latitude?: number | null;
  longitude?: number | null;
}): InitialMapView {
  if (
    city.latitude != null &&
    city.longitude != null &&
    Number.isFinite(city.latitude) &&
    Number.isFinite(city.longitude)
  ) {
    return { center: [city.longitude, city.latitude], zoom: INITIAL_ZOOM_CITYWIDE };
  }

  const state = (city.state || "").trim();
  const country = (city.country || "").trim();
  const isUS =
    !country ||
    country.toLowerCase() === "united states" ||
    country.toLowerCase() === "usa" ||
    country.toLowerCase() === "us";

  if (isUS && state) {
    const abbr = getStateAbbr(state);
    const center = abbr && US_STATE_CENTROIDS[abbr] ? US_STATE_CENTROIDS[abbr] : DEFAULT_US_CENTER;
    return { center, zoom: INITIAL_ZOOM_CITYWIDE };
  }

  return { center: DEFAULT_US_CENTER, zoom: 4 };
}

/**
 * Look up a property on an object by key, ignoring case.
 * Returns the value of the first key that matches case-insensitively,
 * or undefined if no match is found.
 */
export function getCaseInsensitiveProp(
  obj: Record<string, unknown>,
  key: string
): unknown {
  if (key in obj) return obj[key];
  const lower = key.toLowerCase();
  for (const k of Object.keys(obj)) {
    if (k.toLowerCase() === lower) return obj[k];
  }
  return undefined;
}

/**
 * Normalize a choropleth district identifier to a trimmed string suitable
 * for matching against shapefile feature properties.
 * Strips whitespace, leading zeros from purely numeric values, and lowercases.
 */
export function normalizeChoroplethDistrictKey(raw: unknown): string {
  if (raw == null) return "";
  const s = String(raw).trim();
  if (!s) return "";
  const numeric = Number(s);
  if (Number.isFinite(numeric)) {
    return Number.isInteger(numeric) ? String(numeric) : String(numeric);
  }
  return s.toLowerCase();
}

/**
 * Interpret a 2D position as WGS84 for Mapbox. GeoJSON uses [lng, lat]; some sources
 * store [lat, lng] or projected coordinates (invalid as lng/lat).
 * Prefer native order when valid; otherwise try swapped; otherwise return null.
 */
export function normalizeGeoJsonLngLatPair(
  a: number,
  b: number
): [number, number] | null {
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  const ok = (lng: number, lat: number) =>
    Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
  if (ok(a, b)) return [a, b];
  if (ok(b, a)) return [b, a];
  return null;
}

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

/**
 * Known city-hall pins for Workbench “Use city hall”.
 *
 * Mapbox often fails to resolve “City Hall, {city}” to the actual civic
 * building (e.g. returning a random street in the same city). Prefer these
 * curated coordinates when the selected city matches.
 */

export interface CityHallLocation {
  label: string;
  lat: number;
  lng: number;
  radius_m?: number;
}

/** Normalized city name → city hall. Keys are lowercased city names. */
export const KNOWN_CITY_HALLS: Record<string, CityHallLocation> = {
  "san francisco": {
    label: "San Francisco City Hall, 1 Dr Carlton B Goodlett Pl",
    lat: 37.7793,
    lng: -122.4192,
  },
  oakland: {
    label: "Oakland City Hall, 1 Frank H Ogawa Plaza",
    lat: 37.8051,
    lng: -122.2727,
  },
  chicago: {
    label: "Chicago City Hall, 121 N LaSalle St",
    lat: 41.8837,
    lng: -87.6315,
  },
  detroit: {
    label: "Detroit City Hall (Coleman A. Young Municipal Center)",
    lat: 42.3297,
    lng: -83.0446,
  },
  denver: {
    label: "Denver City and County Building, 1437 Bannock St",
    lat: 39.7393,
    lng: -104.989,
  },
  cincinnati: {
    label: "Cincinnati City Hall, 801 Plum St",
    lat: 39.1044,
    lng: -84.5187,
  },
  "new york city": {
    label: "New York City Hall, City Hall Park",
    lat: 40.7128,
    lng: -74.0061,
  },
  "new york": {
    label: "New York City Hall, City Hall Park",
    lat: 40.7128,
    lng: -74.0061,
  },
  austin: {
    label: "Austin City Hall, 301 W 2nd St",
    lat: 30.2645,
    lng: -97.747,
  },
  seattle: {
    label: "Seattle City Hall, 600 4th Ave",
    lat: 47.6038,
    lng: -122.3301,
  },
};

export function knownCityHallForCity(
  cityName: string | null | undefined
): CityHallLocation | null {
  const key = (cityName || "").trim().toLowerCase();
  if (!key) return null;
  return KNOWN_CITY_HALLS[key] ?? null;
}

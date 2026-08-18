/**
 * Shared utilities for location search across all components.
 * Provides consistent handling of city names, zipcodes, addresses, and GPS coordinates.
 */

export type GeocodeAddress = {
  city?: string;
  town?: string;
  village?: string;
  hamlet?: string;
  municipality?: string;
  county?: string;
  state?: string;
  country?: string;
  postcode?: string;
};

export type GeocodeResult = {
  lat: string;
  lon: string;
  display_name?: string;
  address?: GeocodeAddress;
  cityName?: string | null;
  stateName?: string | null;
  countryName?: string | null;
};

/**
 * Check if a query string looks like a US zipcode (5 digits, optionally with -4 extension).
 */
export function isLikelyZipcode(q: string): boolean {
  const s = q.trim();
  // US zipcode format: 5 digits optionally followed by -4 digits
  return /^\d{5}(-\d{4})?$/.test(s);
}

/**
 * Check if a query string looks like an address (contains both digits and letters, with spaces or commas).
 */
export function isLikelyAddress(q: string): boolean {
  const s = q.trim();
  if (s.length < 4) return false;
  const hasDigits = /\d/.test(s);
  const hasLetters = /[a-zA-Z]/.test(s);
  if (!hasDigits || !hasLetters) return false;
  return s.includes(" ") || s.includes(",");
}

/**
 * Check if a query is likely a geographic search (zipcode or address) rather than a city name.
 */
export function isGeographicQuery(q: string): boolean {
  return isLikelyZipcode(q) || isLikelyAddress(q);
}

/**
 * Format a zipcode query for better geocoding results.
 * Adds ", USA" to help Nominatim find the correct location.
 */
export function formatZipcodeForGeocoding(zipcode: string): string {
  const s = zipcode.trim();
  // For US zipcodes, add ", USA" to help Nominatim
  // For other countries, we could detect based on format, but for now assume US
  if (isLikelyZipcode(s)) {
    return `${s}, USA`;
  }
  return s;
}

/**
 * Extract city name from a geocode address result.
 * Tries multiple address fields in order of preference.
 */
export function extractCityName(addr?: GeocodeAddress): string | null {
  if (!addr) return null;
  return (
    addr.city ||
    addr.town ||
    addr.village ||
    addr.municipality ||
    addr.hamlet ||
    addr.county ||
    null
  );
}

export type AddressSuggestion = {
  place_name: string;
  lat: number;
  lon: number;
  cityName: string | null;
  stateName: string | null;
  countryName: string | null;
  /** From Mapbox suggest API — when missing, treated as non-precise (city-level). */
  place_types?: string[];
};

/**
 * Convert an address suggestion to a GeocodeResult for resolveCityFromGeocode.
 */
export function suggestionToGeocodeResult(s: AddressSuggestion): GeocodeResult {
  return {
    lat: String(s.lat),
    lon: String(s.lon),
    display_name: s.place_name,
    cityName: s.cityName,
    stateName: s.stateName,
    countryName: s.countryName,
  };
}

/** Geocoding sits in front of a blocking spinner, so it must fail fast. */
const GEOCODE_TIMEOUT_MS = 10000;
/** Autocomplete is fired per keystroke; a stale suggestion is worse than none. */
const SUGGEST_TIMEOUT_MS = 5000;

async function fetchWithTimeout(
  url: string,
  timeoutMs: number,
  label: string
): Promise<Response> {
  try {
    return await fetch(url, {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === "TimeoutError") {
      throw new Error(`${label} took too long. Please try again.`);
    }
    throw err;
  }
}

/**
 * Fetch address autocomplete suggestions for the given query.
 * Returns an empty array if query is too short, or on error.
 */
export async function fetchAddressSuggestions(
  query: string,
  options?: {
    types?: string;
    country?: string;
    /** Mapbox proximity bias as "lng,lat". */
    proximity?: string;
  }
): Promise<AddressSuggestion[]> {
  const q = query.trim();
  if (q.length < 2) return [];

  try {
    const params = new URLSearchParams({ q });
    if (options?.types) params.set("types", options.types);
    if (options?.country) params.set("country", options.country);
    if (options?.proximity) params.set("proximity", options.proximity);
    const res = await fetch(`/api/geocode/suggest?${params.toString()}`, {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(SUGGEST_TIMEOUT_MS),
    });
    if (!res.ok) return [];
    const data = (await res.json()) as { suggestions?: AddressSuggestion[] };
    return data.suggestions ?? [];
  } catch {
    return [];
  }
}

/**
 * Geocode a query string (zipcode, address, or city name).
 * Returns geocoded location data including city name, state, and coordinates.
 */
export async function geocodeQuery(query: string): Promise<GeocodeResult> {
  let formattedQuery = query.trim();
  
  // Format zipcodes for better geocoding
  if (isLikelyZipcode(formattedQuery)) {
    formattedQuery = formatZipcodeForGeocoding(formattedQuery);
  }

  const res = await fetchWithTimeout(
    `/api/geocode?q=${encodeURIComponent(formattedQuery)}`,
    GEOCODE_TIMEOUT_MS,
    "Geocoding"
  );

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    if (res.status === 404) {
      throw new Error("Location not found. Please try a different city name or ZIP code.");
    }
    throw new Error(text || `Geocoding failed (${res.status})`);
  }

  return (await res.json()) as GeocodeResult;
}

/**
 * Reverse geocode coordinates to get location data.
 * Returns geocoded location data including city name, state, and coordinates.
 */
export async function reverseGeocode(
  lat: number,
  lng: number
): Promise<GeocodeResult> {
  const res = await fetchWithTimeout(
    `/api/reverse-geocode?lat=${encodeURIComponent(String(lat))}&lng=${encodeURIComponent(String(lng))}`,
    GEOCODE_TIMEOUT_MS,
    "Reverse geocoding"
  );

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(text || `Reverse geocoding failed (${res.status})`);
  }

  return (await res.json()) as GeocodeResult;
}

/**
 * Get GPS location from browser.
 * Returns coordinates or throws an error.
 */
export async function getCurrentLocation(): Promise<{ lat: number; lng: number }> {
  if (!("geolocation" in navigator)) {
    throw new Error("Geolocation is not available in your browser.");
  }

  const position = await new Promise<GeolocationPosition>((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      timeout: 15000,
      maximumAge: 30000,
    });
  });

  return {
    lat: position.coords.latitude,
    lng: position.coords.longitude,
  };
}

/**
 * Resolve a city from geocode result by searching our city database.
 * Takes a geocode result and finds the matching city in our system.
 */
export async function resolveCityFromGeocode(
  geo: GeocodeResult,
  searchPublicCities: (query: string, limit: number) => Promise<any[]>
): Promise<{ city: any; coordinates: { lat: number; lng: number } | null }> {
  const cityName = geo.cityName || extractCityName(geo.address);
  const stateName = geo.stateName || geo.address?.state || null;

  if (!cityName) {
    throw new Error("Couldn't determine a city from that location.");
  }

  // Try searching with state first, then just city name
  const cityQuery = stateName ? `${cityName}, ${stateName}` : cityName;
  let cityResults = await searchPublicCities(cityQuery, 10);
  
  // If no results and we have state, try just the city name
  if (cityResults.length === 0 && stateName) {
    cityResults = await searchPublicCities(cityName, 10);
  }

  if (!cityResults.length) {
    throw new Error(`No matching city found for "${cityQuery}".`);
  }

  // Find best match - exact name match first, then first result
  const normalized = cityName.trim().toLowerCase();
  const best =
    cityResults.find(
      (c) => (c.name || "").trim().toLowerCase() === normalized
    ) || cityResults[0];

  // Extract coordinates if available
  const coordinates =
    geo.lat && geo.lon
      ? { lat: parseFloat(geo.lat), lng: parseFloat(geo.lon) }
      : null;

  return { city: best, coordinates };
}

/** Minimal city row shape for direct-match logic (avoids coupling to public API types). */
export type CitySearchListItem = {
  id: number;
  name: string;
  display_name: string;
  state?: string | null;
  emoji?: string | null;
};

function normalizeCitySearchText(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * True if the user's query is an exact match for this city's display name, name,
 * or "Name, ST" short form (case-insensitive).
 */
export function cityDisplayExactlyMatchesQuery(
  city: CitySearchListItem,
  query: string
): boolean {
  const q = normalizeCitySearchText(query);
  if (!q) return false;
  if (normalizeCitySearchText(city.display_name) === q) return true;
  if (normalizeCitySearchText(city.name) === q) return true;
  if (city.state) {
    const st = city.state.trim();
    const commaForm = normalizeCitySearchText(`${city.name}, ${st}`);
    if (commaForm === q) return true;
  }
  return false;
}

/**
 * When the API returns cities and the query uniquely identifies one row, return that city
 * so the UI can show a single row (icon + name) instead of the full autocomplete list.
 */
export function getDirectMatchDisplayCity(
  results: CitySearchListItem[],
  query: string
): CitySearchListItem | null {
  const q = normalizeCitySearchText(query);
  if (!q || results.length === 0) return null;

  const exactHits = results.filter((c) => cityDisplayExactlyMatchesQuery(c, query));
  if (exactHits.length === 1) {
    return exactHits[0] ?? null;
  }

  if (results.length === 1) {
    const only = results[0]!;
    const display = normalizeCitySearchText(only.display_name);
    const name = normalizeCitySearchText(only.name);
    if (display === q || name === q) return only;
    const firstSeg = normalizeCitySearchText(only.display_name.split(",")[0] ?? "");
    if (firstSeg === q) return only;
    if (display.startsWith(`${q},`) || display.startsWith(`${q} ,`)) return only;
  }

  return null;
}

const PRECISE_ADDRESS_PLACE_TYPES = new Set(["address", "poi", "street", "intersection"]);

/**
 * Mapbox-style suggestions: street-level and POIs need the place-naming flow;
 * coarse features (place, postcode only, etc.) can go straight to city/district navigation.
 */
export function isPreciseAddressSuggestion(s: AddressSuggestion): boolean {
  const types = s.place_types;
  if (!types || types.length === 0) return true;
  return types.some((t) => PRECISE_ADDRESS_PLACE_TYPES.has(t));
}

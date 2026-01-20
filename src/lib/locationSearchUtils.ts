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

  const res = await fetch(`/api/geocode?q=${encodeURIComponent(formattedQuery)}`, {
    method: "GET",
    headers: { Accept: "application/json" },
  });

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
  const res = await fetch(
    `/api/reverse-geocode?lat=${encodeURIComponent(String(lat))}&lng=${encodeURIComponent(String(lng))}`,
    {
      method: "GET",
      headers: { Accept: "application/json" },
    }
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
  let cityQuery = stateName ? `${cityName}, ${stateName}` : cityName;
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

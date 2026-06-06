// Waste-module city catalog. Mirrors data.jsx CITIES from the design handoff.
// Selected city flows through the ?city= search param.

export type WasteCity = {
  id: string;
  apiSlug: string;
  name: string;
  flag: string;
  state: string;
  launched: boolean;
  detectors?: number;
  findingsToday?: number;
  status: string;
};

// Only cities we currently have waste data for. apiSlug must match the public
// metrics sitemap slug so the metrics page can resolve the DB city id.
export const WASTE_CITIES: readonly WasteCity[] = [
  { id: "sf",  apiSlug: "san-francisco", name: "San Francisco", flag: "🌉", state: "CA", launched: true, detectors: 42, findingsToday: 7, status: "Live · Auditor's Office" },
  { id: "nyc", apiSlug: "new-york-city", name: "New York City", flag: "🗽", state: "NY", launched: true, status: "Live" },
  { id: "chi", apiSlug: "chicago",       name: "Chicago",       flag: "🏙️", state: "IL", launched: true, detectors: 38, findingsToday: 4, status: "Live · Inspector General" },
] as const;

export const DEFAULT_WASTE_CITY_ID = "sf";

export function getWasteCity(idOrSlug: string | null | undefined): WasteCity {
  const fallback = WASTE_CITIES.find(c => c.id === DEFAULT_WASTE_CITY_ID)!;
  if (!idOrSlug) return fallback;
  return (
    WASTE_CITIES.find(c => c.id === idOrSlug) ??
    WASTE_CITIES.find(c => c.apiSlug === idOrSlug) ??
    fallback
  );
}

// Resolve a city URL param (?city=sf or ?city=san-francisco) to the backend
// slug expected by /api/admin/waste/*. Unknown values pass through so a backend
// rename doesn't require a UI deploy to keep working.
export function getWasteApiSlug(idOrSlug: string | null | undefined): string {
  if (!idOrSlug) return getWasteCity(null).apiSlug;
  const byId = WASTE_CITIES.find(c => c.id === idOrSlug);
  if (byId) return byId.apiSlug;
  const bySlug = WASTE_CITIES.find(c => c.apiSlug === idOrSlug);
  if (bySlug) return bySlug.apiSlug;
  return idOrSlug;
}

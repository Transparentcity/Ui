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

export const WASTE_CITIES: readonly WasteCity[] = [
  { id: "sf",  apiSlug: "san-francisco", name: "San Francisco", flag: "🌉", state: "CA", launched: true,  detectors: 42, findingsToday: 7, status: "Live · Auditor's Office" },
  { id: "chi", apiSlug: "chicago",       name: "Chicago",       flag: "🏙️", state: "IL", launched: true,  detectors: 38, findingsToday: 4, status: "Live · Inspector General" },
  { id: "atx", apiSlug: "austin",        name: "Austin",        flag: "🤘", state: "TX", launched: true,  detectors: 9,  findingsToday: 1, status: "Onboarding · 9 of 42 detectors live" },
  { id: "nyc", apiSlug: "new-york",      name: "New York City", flag: "🗽", state: "NY", launched: false, status: "Rolling out · Q3 2026" },
  { id: "la",  apiSlug: "los-angeles",   name: "Los Angeles",   flag: "🌴", state: "CA", launched: false, status: "Rolling out · Q3 2026" },
  { id: "sea", apiSlug: "seattle",       name: "Seattle",       flag: "🌲", state: "WA", launched: false, status: "Rolling out · Q4 2026" },
  { id: "den", apiSlug: "denver",        name: "Denver",        flag: "⛰️", state: "CO", launched: false, status: "Rolling out · Q4 2026" },
  { id: "bos", apiSlug: "boston",        name: "Boston",        flag: "⚓", state: "MA", launched: false, status: "Rolling out · Q4 2026" },
  { id: "phi", apiSlug: "philadelphia",  name: "Philadelphia",  flag: "🔔", state: "PA", launched: false, status: "Rolling out · 2027" },
  { id: "phx", apiSlug: "phoenix",       name: "Phoenix",       flag: "🌵", state: "AZ", launched: false, status: "Rolling out · 2027" },
  { id: "atl", apiSlug: "atlanta",       name: "Atlanta",       flag: "🍑", state: "GA", launched: false, status: "Rolling out · 2027" },
  { id: "min", apiSlug: "minneapolis",   name: "Minneapolis",   flag: "🌾", state: "MN", launched: false, status: "Rolling out · 2027" },
  { id: "por", apiSlug: "portland",      name: "Portland",      flag: "🌹", state: "OR", launched: false, status: "Rolling out · 2027" },
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

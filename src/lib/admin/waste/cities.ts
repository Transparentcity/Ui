// Waste-module city catalog. Mirrors data.jsx CITIES from the design handoff.
// Selected city flows through the ?city= search param.

export type WasteCity = {
  id: string;
  apiSlug: string;
  name: string;
  flag: string;
  state: string;
  launched: boolean;
  status: string;
};

// Only cities the waste module is actually configured for in the backend.
// apiSlug must match the public metrics sitemap slug so the metrics page can
// resolve the DB city id. NYC is intentionally excluded: it has no waste
// dataset config and would fall back to SF data, so it must not be selectable.
export const WASTE_CITIES: readonly WasteCity[] = [
  { id: "sf",  apiSlug: "san-francisco", name: "San Francisco", flag: "🌉", state: "CA", launched: true, status: "Live · Auditor's Office" },
  { id: "chi", apiSlug: "chicago",       name: "Chicago",       flag: "🏙️", state: "IL", launched: true, status: "Live · Inspector General" },
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
// slug expected by /api/admin/waste/*. An unrecognized value (e.g. a stale
// ?city=nyc bookmark after NYC was removed) resolves to the same default city
// that getWasteCity falls back to, so the header label and the data query never
// disagree. Equivalent to getWasteCity(idOrSlug).apiSlug, written out for clarity.
export function getWasteApiSlug(idOrSlug: string | null | undefined): string {
  return getWasteCity(idOrSlug).apiSlug;
}

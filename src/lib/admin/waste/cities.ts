// Waste-module city catalog. Mirrors data.jsx CITIES from the design handoff.
// Selected city flows through the ?city= search param.

export type WasteCity = {
  id: string;
  name: string;
  flag: string;
  state: string;
  launched: boolean;
  detectors?: number;
  findingsToday?: number;
  status: string;
};

export const WASTE_CITIES: readonly WasteCity[] = [
  { id: "sf",  name: "San Francisco", flag: "🌉", state: "CA", launched: true,  detectors: 42, findingsToday: 7, status: "Live · Auditor's Office" },
  { id: "chi", name: "Chicago",       flag: "🏙️", state: "IL", launched: true,  detectors: 38, findingsToday: 4, status: "Live · Inspector General" },
  { id: "atx", name: "Austin",        flag: "🤘", state: "TX", launched: true,  detectors: 9,  findingsToday: 1, status: "Onboarding · 9 of 42 detectors live" },
  { id: "nyc", name: "New York City", flag: "🗽", state: "NY", launched: false, status: "Rolling out · Q3 2026" },
  { id: "la",  name: "Los Angeles",   flag: "🌴", state: "CA", launched: false, status: "Rolling out · Q3 2026" },
  { id: "sea", name: "Seattle",       flag: "🌲", state: "WA", launched: false, status: "Rolling out · Q4 2026" },
  { id: "den", name: "Denver",        flag: "⛰️", state: "CO", launched: false, status: "Rolling out · Q4 2026" },
  { id: "bos", name: "Boston",        flag: "⚓", state: "MA", launched: false, status: "Rolling out · Q4 2026" },
  { id: "phi", name: "Philadelphia",  flag: "🔔", state: "PA", launched: false, status: "Rolling out · 2027" },
  { id: "phx", name: "Phoenix",       flag: "🌵", state: "AZ", launched: false, status: "Rolling out · 2027" },
  { id: "atl", name: "Atlanta",       flag: "🍑", state: "GA", launched: false, status: "Rolling out · 2027" },
  { id: "min", name: "Minneapolis",   flag: "🌾", state: "MN", launched: false, status: "Rolling out · 2027" },
  { id: "por", name: "Portland",      flag: "🌹", state: "OR", launched: false, status: "Rolling out · 2027" },
] as const;

export const DEFAULT_WASTE_CITY_ID = "sf";

export function getWasteCity(id: string | null | undefined): WasteCity {
  if (!id) return WASTE_CITIES.find(c => c.id === DEFAULT_WASTE_CITY_ID)!;
  return WASTE_CITIES.find(c => c.id === id) ?? WASTE_CITIES.find(c => c.id === DEFAULT_WASTE_CITY_ID)!;
}

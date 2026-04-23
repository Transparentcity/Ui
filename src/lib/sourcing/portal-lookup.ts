// Maps city slug to its primary open data portal domain.
// All ten launch cities verified against official city documentation.

const PORTAL_MAP: Record<string, string> = {
  "austin":         "data.austintexas.gov",
  "chicago":        "data.cityofchicago.org",
  "cincinnati":     "data.cincinnati-oh.gov",
  "denver":         "denvergov.org/opendata",
  "detroit":        "data.detroitmi.gov",
  "new-york-city":  "data.cityofnewyork.us",
  "oakland":        "data.oaklandca.gov",
  "san-francisco":  "data.sfgov.org",
  "seattle":        "data.seattle.gov",
  "little-rock":    "data.littlerock.gov",
  "los-angeles":    "data.lacity.org",
};

export function derivePortal(citySlug: string): string | null {
  return PORTAL_MAP[citySlug] ?? null;
}

// Maps (category, citySlug) to the canonical agency name.
// Long forms used where short abbreviations collide across launch cities.

const AGENCY_MAP: Record<string, Record<string, string>> = {
  "police": {
    "austin":        "APD",
    "chicago":       "CPD",
    "cincinnati":    "Cincinnati Police",
    "denver":        "Denver Police",
    "detroit":       "Detroit Police",
    "new-york-city": "NYPD",
    "oakland":       "OPD",
    "san-francisco": "SFPD",
    "seattle":       "SPD",
    "little-rock":   "LRPD",
    "los-angeles":   "LAPD",
  },
  "city-hall": {
    "austin":        "City of Austin",
    "chicago":       "Chicago OBM",
    "cincinnati":    "Cincinnati OPDA",
    "denver":        "City of Denver",
    "detroit":       "Detroit OCFO",
    "new-york-city": "NYC OMB",
    "oakland":       "City of Oakland",
    "san-francisco": "SF Controller",
    "seattle":       "Seattle CBO",
    "little-rock":   "City of Little Rock",
    "los-angeles":   "LA CAO",
  },
  "transit": {
    "austin":        "CapMetro",
    "chicago":       "CTA",
    "cincinnati":    "SORTA",
    "denver":        "RTD",
    "detroit":       "DDOT",
    "new-york-city": "MTA",
    "oakland":       "AC Transit",
    "san-francisco": "SFMTA",
    "seattle":       "King County Metro",
    "little-rock":   "Rock Region METRO",
    "los-angeles":   "LA Metro",
  },
  "building-dept": {
    "austin":        "Austin DSD",
    "chicago":       "Chicago DOB",
    "cincinnati":    "Cincinnati B&I",
    "denver":        "Denver Planning",
    "detroit":       "Detroit BSEED",
    "new-york-city": "NYC DOB",
    "oakland":       "Oakland Planning",
    "san-francisco": "SF DBI",
    "seattle":       "Seattle SDCI",
    "little-rock":   "Little Rock Planning",
    "los-angeles":   "LADBS",
  },
  "fire": {
    "austin":        "AFD",
    "chicago":       "CFD",
    "cincinnati":    "Cincinnati Fire",
    "denver":        "Denver Fire",
    "detroit":       "DFD",
    "new-york-city": "FDNY",
    "oakland":       "Oakland Fire",
    "san-francisco": "SFFD",
    "seattle":       "Seattle Fire",
    "little-rock":   "LRFD",
    "los-angeles":   "LAFD",
  },
  "parks": {
    "austin":        "Austin PARD",
    "chicago":       "Chicago Park District",
    "cincinnati":    "Cincinnati Parks",
    "denver":        "Denver Parks & Rec",
    "detroit":       "Detroit GSD",
    "new-york-city": "NYC Parks",
    "oakland":       "Oakland OPRYD",
    "san-francisco": "SF Rec & Park",
    "seattle":       "Seattle Parks",
    "little-rock":   "Little Rock Parks",
    "los-angeles":   "LA Rec & Parks",
  },
  "311": {
    "austin":        "Austin 311",
    "chicago":       "Chicago 311",
    "cincinnati":    "Cincinnati 311",
    "denver":        "Denver 311",
    "detroit":       "Improve Detroit",
    "new-york-city": "NYC 311",
    "oakland":       "OAK 311",
    "san-francisco": "SF 311",
    "seattle":       "Find It Fix It",
    "little-rock":   "Little Rock 311",
    "los-angeles":   "MyLA311",
  },
  "elections": {
    "austin":        "Travis County Clerk",
    "chicago":       "Chicago BOEC",
    "cincinnati":    "Hamilton County BOE",
    "denver":        "Denver Elections",
    "detroit":       "Detroit Elections",
    "new-york-city": "NYC BOE",
    "oakland":       "Alameda County ROV",
    "san-francisco": "SF Elections",
    "seattle":       "King County Elections",
    "little-rock":   "Pulaski County Clerk",
    "los-angeles":   "LA County Registrar",
  },
};

export function deriveAgency(
  category: string,
  citySlug: string,
): string | null {
  return AGENCY_MAP[category]?.[citySlug] ?? null;
}

// Maps the enriched-story "actor" label (see src/lib/feed/mockFeedData.ts
// CATEGORY_MAP) to the category key used in AGENCY_MAP above. Actors without
// a corresponding agency category return null, which makes SourceLine fall
// back to portal-only rendering.
const ACTOR_TO_CATEGORY: Record<string, string> = {
  "Police":        "police",
  "Fire Dept":     "fire",
  "Transit":       "transit",
  "Building Dept": "building-dept",
  "Parks & Rec":   "parks",
  "311":           "311",
  "Public Works":  "311",
  "City Hall":     "city-hall",
  "Spending":      "city-hall",
  "Controller":    "city-hall",
};

export function normalizeCategory(input: string): string | null {
  if (!input) return null;
  if (AGENCY_MAP[input]) return input;
  return ACTOR_TO_CATEGORY[input] ?? null;
}

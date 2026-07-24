/**
 * Newsletter persona presets — capture-side only.
 *
 * These define the pills shown during onboarding and in Settings.
 * Prompt rendering from selected personas happens on the backend at
 * newsletter generation time (see newsletter_persona_instructions.py).
 *
 * The set is designed to (a) map cleanly onto the data domains the platform
 * actually tracks (crime/safety, housing/permits, transit, 311, spending,
 * business/inspections, parks/recreation) and (b) span diverse life situations
 * and values (renter ↔ owner, operator ↔ consumer, family ↔ individual,
 * resident ↔ watchdog). Placeholders are city-agnostic because the product is
 * live in many cities.
 */

export interface PersonaPreset {
  id: string;
  label: string;
  detailPlaceholder: string;
}

export interface PersonaSelection {
  id: string;
  detail: string;
}

export const NEWSLETTER_PERSONA_PRESETS: PersonaPreset[] = [
  {
    id: "commuter",
    label: "Commuter",
    detailPlaceholder: "e.g. I take transit downtown every weekday",
  },
  {
    id: "renter",
    label: "Renter",
    detailPlaceholder: "e.g. I rent and watch rents, evictions, and new housing",
  },
  {
    id: "homeowner",
    label: "Homeowner",
    detailPlaceholder: "e.g. I own my home and follow permits and property values",
  },
  {
    id: "parent-family",
    label: "Parent & family",
    detailPlaceholder: "e.g. I have young kids and use local parks and playgrounds",
  },
  {
    id: "safety-neighbor",
    label: "Safety-minded neighbor",
    detailPlaceholder: "e.g. I keep an eye on break-ins and street safety near my block",
  },
  {
    id: "small-business-owner",
    label: "Small business owner",
    detailPlaceholder: "e.g. I run a café and track permits and inspections",
  },
  {
    id: "local-explorer",
    label: "Local explorer",
    detailPlaceholder: "e.g. I love trying new restaurants and shops around town",
  },
  {
    id: "civic-watchdog",
    label: "Civic watchdog",
    detailPlaceholder: "e.g. I follow the city budget and hold officials accountable",
  },
];

export const MAX_PERSONA_SELECTIONS = 3;

/**
 * Legacy persona ids (pre-2026 persona set) mapped to their closest current
 * persona. Existing users have these ids stored in their saved preferences;
 * we migrate them on read so the Settings/onboarding UI shows the right pill
 * and future saves persist the new id. The backend keeps rendering the legacy
 * ids too (belt and suspenders) until every user has re-saved.
 */
export const LEGACY_PERSONA_ID_MAP: Record<string, string> = {
  "real-estate-owner": "homeowner",
  "crime-watcher": "safety-neighbor",
  "frequent-diner": "local-explorer",
  "frequent-shopper": "local-explorer",
  "elected-official": "civic-watchdog",
};

const VALID_PERSONA_IDS = new Set(NEWSLETTER_PERSONA_PRESETS.map((p) => p.id));

/**
 * Normalize a list of saved persona selections:
 *  - migrate legacy ids to their current equivalents,
 *  - drop ids we no longer recognize,
 *  - de-duplicate (e.g. frequent-diner + frequent-shopper → one local-explorer),
 *    keeping the first non-empty detail,
 *  - cap at MAX_PERSONA_SELECTIONS.
 */
export function normalizePersonaSelections(
  selections: PersonaSelection[]
): PersonaSelection[] {
  const byId = new Map<string, PersonaSelection>();

  for (const sel of selections) {
    const mappedId = LEGACY_PERSONA_ID_MAP[sel.id] ?? sel.id;
    if (!VALID_PERSONA_IDS.has(mappedId)) continue;

    const existing = byId.get(mappedId);
    if (!existing) {
      byId.set(mappedId, { id: mappedId, detail: sel.detail });
    } else if (!existing.detail && sel.detail) {
      existing.detail = sel.detail;
    }
  }

  return Array.from(byId.values()).slice(0, MAX_PERSONA_SELECTIONS);
}

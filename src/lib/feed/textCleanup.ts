/**
 * Frontend text cleanup for feed card descriptions.
 *
 * Transforms dry, data-dump descriptions into compelling news-style ledes
 * without changing the backend. The full original description remains
 * available for detail pages.
 */

// ── Month names for regex ──────────────────────────────────────────────────

const MONTHS =
  "january|february|march|april|may|june|july|august|september|october|november|december";

// ── Patterns to strip from the start of descriptions ───────────────────────

const LEADING_DATE_PATTERNS = [
  // "January 2026 recorded 291 motor vehicle thefts..."
  new RegExp(`^(?:${MONTHS})\\s+\\d{4}\\s+recorded\\s+`, "i"),
  // "In January 2026, ..." / "In the week of March 9, ..."
  new RegExp(`^in\\s+(?:the\\s+week\\s+of\\s+)?(?:${MONTHS})\\s+[\\d,]+[^.]*[.,]\\s*`, "i"),
  // "For the period ending March 9, ..."
  /^for\s+the\s+period\s+ending\s+[^.]+[.,]\s*/i,
  // "During the week of March 9, ..."
  /^during\s+the\s+(?:week|month|period)\s+of\s+[^.]+[.,]\s*/i,
  // "As of March 2026, ..."
  new RegExp(`^as\\s+of\\s+(?:${MONTHS})\\s+\\d{4}[^.]*[.,]\\s*`, "i"),
  // "This week, ..." / "This month, ..."
  /^this\s+(?:week|month|period),?\s*/i,
];

// ── Methodological boilerplate patterns ────────────────────────────────────

const BOILERPLATE_PATTERNS = [
  // "The 12-week average is 340 incidents per week."
  /\s*the\s+\d+-week\s+(?:rolling\s+)?average\s+(?:is|stands\s+at|was)\s+[\d,.]+\s+[^.]+\.\s*/gi,
  // "The 12-week rolling average stands at..."
  /\s*the\s+\d+-(?:week|month)\s+(?:rolling\s+)?(?:average|mean|median)\s+[^.]+\.\s*/gi,
];

// ── Overlap detection ──────────────────────────────────────────────────────

/**
 * Returns true if the first sentence of the description substantially
 * overlaps with the headline (i.e., restates the same information).
 */
function firstSentenceOverlapsHeadline(
  firstSentence: string,
  headline: string,
): boolean {
  // Normalize both strings: lowercase, strip punctuation, split into words
  const normalize = (s: string) =>
    s
      .toLowerCase()
      .replace(/[^\w\s]/g, "")
      .split(/\s+/)
      .filter((w) => w.length > 2); // ignore tiny words like "a", "in", "of"

  const headlineWords = new Set(normalize(headline));
  const sentenceWords = normalize(firstSentence);

  if (sentenceWords.length === 0) return false;

  const overlap = sentenceWords.filter((w) => headlineWords.has(w)).length;
  const overlapRatio = overlap / sentenceWords.length;

  // If more than 45% of the sentence's significant words appear in the headline,
  // it's probably restating the same thing
  return overlapRatio > 0.45;
}

// ── Metadata-only detection ──────────────────────────────────────────────────

/**
 * Returns true if the description is just metadata (dates, data freshness,
 * breadcrumb separators) with no actual narrative content.
 * Examples:
 *   "San Francisco · Bayview Hunters Point · Week of Feb 23, 2026"
 *   "Week of Feb 23, 2026 · Data fresh as of Mar 16"
 *   "San Francisco · City-wide · Data fresh as of Mar 16"
 */
function isMetadataOnly(desc: string): boolean {
  // Strip all metadata tokens and see if anything meaningful remains
  let stripped = desc;
  // Remove city names
  stripped = stripped.replace(/(?:San Francisco|Chicago|New York|Los Angeles|Seattle|Oakland|Portland|Denver|Austin|Miami|Boston|Philadelphia|Houston|Phoenix|San Diego|San Jose|Sacramento|Long Beach|Fresno|Atlanta|Charlotte|Nashville|Memphis|Baltimore|Milwaukee|Albuquerque|Tucson|Mesa|Kansas City|Omaha|Minneapolis|New Orleans|Arlington|Bakersfield|Tampa|Honolulu|Anaheim|Santa Ana|Riverside|Stockton|Henderson|St\.?\s*Paul|St\.?\s*Louis|Cincinnati|Pittsburgh|Anchorage|Raleigh|Virginia Beach|Lexington|Corpus Christi|Orlando|Irvine|Newark|Jersey City|Buffalo|Durham|Chula Vista)/gi, '');
  // Remove neighborhood/district labels
  stripped = stripped.replace(/(?:City-wide|District\s+\d+|Ward\s+\d+|D\d+)/gi, '');
  // Remove parenthetical neighborhood names like "(Marina/Pacific Heights)"
  stripped = stripped.replace(/\([^)]*\)/g, '');
  // Remove warning/emoji prefixes like "⚠️ Data has 10-day lag"
  stripped = stripped.replace(/data\s+has\s+\d+-day\s+lag/gi, '');
  // Remove "Data fresh as of ..." (BEFORE date patterns, so the date part is still intact)
  stripped = stripped.replace(/data\s+fresh\s+as\s+of\s+[\w\s,]+/gi, '');
  // Remove date patterns: "Week of Feb 23, 2026", "Mar 16", "February 2026"
  stripped = stripped.replace(/(?:week\s+of\s+)?(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\w*\.?\s+\d{1,2}(?:,?\s+\d{4})?/gi, '');
  stripped = stripped.replace(/(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\w*\.?\s+\d{4}/gi, '');
  // Remove separators, emoji, and whitespace
  stripped = stripped.replace(/[·•–—|/\-,.\s]/g, '');
  // Remove common emoji characters (warning signs, etc.)
  stripped = stripped.replace(/[\u{2600}-\u{27BF}\u{FE00}-\u{FE0F}\u{1F000}-\u{1FFFF}]/gu, '');

  // If what remains is short, it's metadata
  if (stripped.length < 10) return true;

  // Additional heuristic: if the original description has no sentence-ending
  // punctuation and no lowercase words (aside from prepositions/articles),
  // it's likely a breadcrumb like "Bayview Hunters Point · Week of Feb 23, 2026"
  if (!/[.!?]/.test(desc)) {
    // No sentence structure — check if it's just proper nouns + separators + dates
    const withoutDates = desc
      .replace(/(?:week\s+of\s+)?(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\w*\.?\s+\d{1,2}(?:,?\s+\d{4})?/gi, '')
      .replace(/(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\w*\.?\s+\d{4}/gi, '')
      .replace(/data\s+fresh\s+as\s+of\s+[\w\s,]+/gi, '')
      .replace(/(?:City-wide|District\s+\d+|Ward\s+\d+|D\d+)/gi, '')
      .replace(/[·•–—|\-,.\d\s]/g, ' ')
      .trim();
    const words = withoutDates.split(/\s+/).filter(w => w.length > 0);
    // If every remaining word starts with an uppercase letter (proper nouns/place names),
    // this is a metadata breadcrumb, not narrative content
    if (words.length > 0 && words.length <= 6 && words.every(w => /^[A-Z]/.test(w))) {
      return true;
    }
  }

  return false;
}

/**
 * Strip leading city name prefix from breadcrumb descriptions.
 */
function cleanMetadataBreadcrumb(desc: string, cityName?: string): string {
  let cleaned = desc;
  if (cityName) {
    const cityPrefix = new RegExp(`^${cityName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*[·•–—|]\\s*`, 'i');
    cleaned = cleaned.replace(cityPrefix, '');
  }
  cleaned = cleaned.replace(/^(?:San Francisco|Chicago|New York|Los Angeles|Seattle)\s*[·•–—|]\s*/i, '');
  return cleaned.trim();
}

// ── Strip geographic context already in card header ─────────────────────────

/**
 * Removes neighborhood, district, and ward references from the description
 * that are already displayed in the card header's neighborhood label.
 */
function stripRedundantGeography(
  desc: string,
  cityName?: string,
  neighborhoodLabel?: string,
): string {
  let cleaned = desc;

  // Strip "in [City Name]" mid-sentence (e.g., "Motor vehicle thefts in San Francisco dropped")
  if (cityName) {
    const esc = cityName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    cleaned = cleaned.replace(new RegExp(`\\bin\\s+${esc}\\b,?\\s*`, 'gi'), '');
    cleaned = cleaned.replace(new RegExp(`\\bof\\s+${esc}\\b,?\\s*`, 'gi'), '');
    cleaned = cleaned.replace(new RegExp(`\\b${esc}'s\\b`, 'gi'), '');
  }

  // Strip "in District X" / "in D6" / "in Ward X" patterns
  cleaned = cleaned.replace(/\bin\s+(?:District|Ward)\s+\d+\b,?\s*/gi, '');
  cleaned = cleaned.replace(/\bin\s+D\d+\b,?\s*/gi, '');

  // Extract neighborhood name from the label (e.g., "San Francisco · Bayview Hunters Point")
  // and strip "in [Neighborhood]" from the description
  if (neighborhoodLabel) {
    const parts = neighborhoodLabel.split(/\s*[·•–—|]\s*/);
    for (const part of parts) {
      const trimmed = part.trim();
      // Skip city name (already handled above), district labels like "D6", and "City-wide"
      if (!trimmed || trimmed === cityName || /^D\d+$/i.test(trimmed) || trimmed === 'City-wide') continue;
      const esc = trimmed.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      // Strip "in [Neighborhood]" pattern
      cleaned = cleaned.replace(new RegExp(`\\bin\\s+${esc}\\b,?\\s*`, 'gi'), '');
      // Strip standalone "[Neighborhood] —" or "[Neighborhood]:" prefix
      cleaned = cleaned.replace(new RegExp(`^${esc}\\s*[—–:\\-]\\s*`, 'i'), '');
    }
  }

  return cleaned;
}

// ── Main cleanup function ──────────────────────────────────────────────────

/**
 * Cleans a backend description for display on feed cards.
 *
 * - Detects metadata-only descriptions and returns empty string
 * - Strips leading date/methodology phrases
 * - Removes first sentence if it heavily overlaps with the headline
 * - Strips common methodological boilerplate
 * - Strips geographic context already shown in the card header
 * - Returns original text if no patterns match (safe fallback)
 *
 * The full original `description` should still be used on detail pages
 * where methodology context is appropriate.
 */
export function cleanDescription(
  description: string,
  headline: string,
  cityName?: string,
  neighborhoodLabel?: string,
): string {
  if (!description) return "";

  // If description is pure metadata breadcrumbs, return empty —
  // the card component should handle the fallback
  if (isMetadataOnly(description)) return "";

  let cleaned = description.trim();

  // 0. Clean up metadata breadcrumb prefix (strip city name already in card header)
  cleaned = cleanMetadataBreadcrumb(cleaned, cityName);

  // 1. Strip leading date phrases
  for (const pattern of LEADING_DATE_PATTERNS) {
    cleaned = cleaned.replace(pattern, "");
  }

  // 2. Check if the first sentence overlaps with the headline
  const firstDotIndex = cleaned.indexOf(".");
  if (firstDotIndex > 0 && firstDotIndex < cleaned.length - 1) {
    const firstSentence = cleaned.slice(0, firstDotIndex + 1);
    const rest = cleaned.slice(firstDotIndex + 1).trim();

    if (rest.length > 20 && firstSentenceOverlapsHeadline(firstSentence, headline)) {
      cleaned = rest;
    }
  }

  // 3. Strip methodological boilerplate
  for (const pattern of BOILERPLATE_PATTERNS) {
    cleaned = cleaned.replace(pattern, " ");
  }

  // 4. Strip geographic context already in card header
  cleaned = stripRedundantGeography(cleaned, cityName, neighborhoodLabel);

  // 5. Clean up whitespace
  cleaned = cleaned.replace(/\s+/g, " ").trim();

  // 6. Capitalize first letter if needed
  if (cleaned.length > 0 && /[a-z]/.test(cleaned[0])) {
    cleaned = cleaned[0].toUpperCase() + cleaned.slice(1);
  }

  // 7. If cleanup removed too much:
  //    - If original was short (< 80 chars), it was likely metadata — return empty
  //    - Otherwise fall back to original (narrative text that got over-cleaned)
  if (cleaned.length < 20) {
    const orig = description.trim();
    if (orig.length < 80) return "";
    return orig;
  }

  // 8. Trim at sentence boundary to avoid mid-sentence cutoff on cards
  // ~3 lines at ~55 chars/line ≈ 165 chars visible. Trim at last period before 200.
  if (cleaned.length > 200) {
    const cut = cleaned.lastIndexOf(".", 200);
    if (cut > 60) {
      cleaned = cleaned.slice(0, cut + 1);
    }
  }

  // 9. Ensure text ends at a sentence boundary (no trailing fragments)
  if (cleaned.length > 60 && !/[.!?]$/.test(cleaned)) {
    const lastDot = cleaned.lastIndexOf(".");
    if (lastDot > 60) {
      cleaned = cleaned.slice(0, lastDot + 1);
    } else {
      // No sentence boundary found — append ellipsis to signal continuation
      cleaned = cleaned.replace(/\s+$/, "") + "...";
    }
  }

  return cleaned;
}

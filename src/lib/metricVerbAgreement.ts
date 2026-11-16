/**
 * Picks "has" or "have" to agree with a metric name used as the subject of a
 * question heading, e.g. "How has drug crime changed?" vs
 * "How have violent crime incidents changed?".
 *
 * Metric names come from the backend and look like
 * "💊 Drug Crime Incidents", "🏗️ Building Permits Issued",
 * "⏱️ 911 Response Time — High Priority (Avg Minutes)" or "🏠 Burglary".
 * The grammatical head is the last word of the leading noun phrase, so we
 * drop parentheticals, anything after a dash or comma, trailing status
 * participles ("Issued", "Closed", ...) and prepositional tails ("... to
 * Close", "... in Pipeline") before checking whether that word is plural.
 */

const STATUS_PARTICIPLES = new Set([
  "approved",
  "closed",
  "completed",
  "demolished",
  "executed",
  "filed",
  "issued",
  "opened",
  "planted",
  "received",
  "removed",
  "reported",
  "resolved",
  "submitted",
  "tested",
]);

// Words that end the leading noun phrase ("still" covers "Contracts Still Active").
const PREPOSITIONS = new Set([
  "at",
  "by",
  "for",
  "from",
  "in",
  "of",
  "on",
  "over",
  "per",
  "still",
  "to",
  "under",
  "with",
  "within",
]);

const IRREGULAR_PLURALS = new Set(["children", "data", "people", "personnel", "police", "staff"]);

const SINGULAR_ENDING_IN_S = new Set(["news", "gas", "bus", "status", "analysis", "series"]);

function isPluralWord(word: string): boolean {
  const w = word.toLowerCase();
  if (IRREGULAR_PLURALS.has(w)) return true;
  if (SINGULAR_ENDING_IN_S.has(w)) return false;
  if (!w.endsWith("s")) return false;
  if (w.endsWith("ss") || w.endsWith("us") || w.endsWith("is")) return false;
  return w.length > 1;
}

export function metricHeadWord(metricName: string): string | null {
  const cleaned = metricName
    .replace(/\([^)]*\)/g, " ")
    .split(/\s[—–-]\s|[:,]/)[0];
  const words = cleaned
    .split(/[\s/&]+/)
    .map((w) => w.replace(/[^\p{L}\p{N}'-]/gu, ""))
    .filter((w) => /\p{L}/u.test(w));

  const phrase: string[] = [];
  for (const word of words) {
    const lower = word.toLowerCase();
    if (phrase.length > 0) {
      if (STATUS_PARTICIPLES.has(lower) || PREPOSITIONS.has(lower)) break;
      // "Schools Inspected", "Calls Answered": a past participle after a
      // plural noun is a trailing status, not part of the noun phrase.
      // ("Active Registered Businesses" keeps going: "Active" is not plural.)
      if (lower.endsWith("ed") && isPluralWord(phrase[phrase.length - 1])) break;
    }
    phrase.push(word);
  }
  return phrase.length > 0 ? phrase[phrase.length - 1] : null;
}

export function hasOrHave(metricName: string): "has" | "have" {
  const head = metricHeadWord(metricName);
  return head && isPluralWord(head) ? "have" : "has";
}

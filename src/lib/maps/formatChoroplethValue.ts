/**
 * Format a choropleth district value for display.
 *
 * Rate metrics are stored as plain numbers (32.9 meaning 32.9%), and their
 * item_noun is itself percentage wording like "% Closed". Rendering
 * "32.9 % Closed" reads as a count of something, so percentages get a bare
 * "%" suffix instead and everything else keeps "<value> <noun>".
 */

export type ChoroplethValueConfig = {
  aggregation_type?: string | null;
  item_noun?: string | null;
};

// Word boundaries matter: a bare /ratio/ matches "Registrations" and "Duration".
const PERCENTAGE_NOUN_PATTERN = /^%|\bpercent(age)?\b|\bratio\b/i;

/** Aggregations whose values are rates, not counts. */
const PERCENTAGE_AGG_TYPES = new Set(["RATIO"]);

/** True for nouns that already express a percentage rather than a countable thing. */
export function isPercentageNoun(noun?: string | null): boolean {
  const trimmed = noun?.trim() ?? "";
  return trimmed !== "" && PERCENTAGE_NOUN_PATTERN.test(trimmed);
}

export function isPercentageValued(mapConfig?: ChoroplethValueConfig | null): boolean {
  const aggType = String(mapConfig?.aggregation_type ?? "").toUpperCase();
  return PERCENTAGE_AGG_TYPES.has(aggType) || isPercentageNoun(mapConfig?.item_noun);
}

/** One decimal keeps rates legible without implying false precision. */
export function formatPercentValue(value: number): string {
  return `${value.toLocaleString(undefined, {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })}%`;
}

export function formatChoroplethValue(
  value: number | string | null | undefined,
  mapConfig?: ChoroplethValueConfig | null,
  options?: { fallback?: string; lowercaseNoun?: boolean }
): string {
  const fallback = options?.fallback ?? "No data";
  if (value === null || value === undefined || value === "") return fallback;

  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) return fallback;

  if (isPercentageValued(mapConfig)) return formatPercentValue(numeric);

  const rawNoun = String(mapConfig?.item_noun ?? "items").trim() || "items";
  const noun = options?.lowercaseNoun ? rawNoun.toLowerCase() : rawNoun;
  return `${numeric.toLocaleString()} ${noun}`;
}

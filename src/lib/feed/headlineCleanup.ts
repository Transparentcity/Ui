/**
 * Frontend headline cleanup for feed cards.
 *
 * Normalizes ALL-CAPS business names, fixes common formatting issues,
 * and improves generic template headlines — all without changing the backend.
 */

// ── Words that should stay uppercase ────────────────────────────────────────

const UPPERCASE_EXCEPTIONS = new Set([
  "LLC", "INC", "CORP", "LTD", "LP", "LLP", "PLC", "CO",
  "DBA", "NYC", "SF", "LA", "USA", "US", "UK", "EU",
  "PUC", "DA", "SFPD", "NYPD", "CPD", "EMS", "GOA",
  "YTD", "MTD", "QTD", "YOY",
  "RPD", "MTA", "BART", "MUNI",
  "II", "III", "IV",
]);

// Small words that should stay lowercase in title case (unless first/last)
const LOWERCASE_WORDS = new Set([
  "a", "an", "the", "and", "but", "or", "nor", "for", "yet", "so",
  "at", "by", "in", "of", "on", "to", "up", "as", "is", "it",
  "vs", "via", "per",
]);

/**
 * Convert an ALL-CAPS word to title case, respecting known acronyms.
 */
function titleCaseWord(word: string): string {
  const upper = word.toUpperCase();
  if (UPPERCASE_EXCEPTIONS.has(upper)) return upper;

  // If the word has internal punctuation (e.g., "O'HARE"), handle each part
  if (/['-]/.test(word)) {
    return word
      .split(/(?<=[-'])/)
      .map((part) => {
        if (part.length <= 1) return part;
        return part[0].toUpperCase() + part.slice(1).toLowerCase();
      })
      .join("");
  }

  return word[0].toUpperCase() + word.slice(1).toLowerCase();
}

/**
 * Detect if a token (contiguous non-space text) is ALL-CAPS and at least
 * 3 characters long (excluding trailing punctuation).
 */
function isAllCaps(token: string): boolean {
  const core = token.replace(/[^A-Za-z]/g, "");
  return core.length >= 3 && core === core.toUpperCase() && /[A-Z]/.test(core);
}

/**
 * Normalize ALL-CAPS segments in a headline to title case.
 *
 * If the ENTIRE headline is in normal mixed case, it's returned as-is.
 * Only words that are ALL-CAPS (3+ letters) get title-cased, unless they're
 * known acronyms.
 *
 * Examples:
 *   "FRIENDS HALAL MEAT SUPERMARKET Opens on Main St" →
 *   "Friends Halal Meat Supermarket Opens on Main St"
 *
 *   "PASTA PEOPLE LLC Brings Ice Cream to Flatbush Ave" →
 *   "Pasta People LLC Brings Ice Cream to Flatbush Ave"
 */
export function normalizeHeadlineCaps(headline: string): string {
  if (!headline) return headline;

  const tokens = headline.split(/(\s+)/); // preserve whitespace
  let capsCount = 0;
  let wordCount = 0;

  for (const token of tokens) {
    if (/^\s+$/.test(token)) continue;
    wordCount++;
    if (isAllCaps(token)) capsCount++;
  }

  // If no ALL-CAPS words, return as-is
  if (capsCount === 0) return headline;

  // If the ENTIRE headline is caps, do full title-case conversion
  if (capsCount === wordCount) {
    return tokens
      .map((token, i) => {
        if (/^\s+$/.test(token)) return token;
        const core = token.replace(/[^A-Za-z]/g, "");
        if (UPPERCASE_EXCEPTIONS.has(core.toUpperCase())) return token;
        const lower = core.toLowerCase();
        // Keep small words lowercase unless they're the first token
        if (i > 0 && LOWERCASE_WORDS.has(lower)) {
          return token.toLowerCase();
        }
        return titleCaseWord(token);
      })
      .join("");
  }

  // Partial caps: only convert ALL-CAPS tokens
  return tokens
    .map((token) => {
      if (/^\s+$/.test(token)) return token;
      if (!isAllCaps(token)) return token;
      return titleCaseWord(token);
    })
    .join("");
}

/**
 * Normalize a business name that may be in ALL-CAPS from raw license data.
 */
export function normalizeBusinessName(name: string): string {
  if (!name) return name;
  // Only normalize if the entire name is ALL-CAPS
  const core = name.replace(/[^A-Za-z]/g, "");
  if (core.length < 3 || core !== core.toUpperCase()) return name;
  return normalizeHeadlineCaps(name);
}

/**
 * Strip leading emoji from a headline.
 *
 * Many stories start with emoji (🚲, 🏚️, 📉, 🔥, 💰, etc.) which the card
 * header already shows via `type_icon`. Stripping avoids visual redundancy.
 */
export function stripLeadingEmoji(headline: string): string {
  if (!headline) return headline;
  // Match leading emoji + optional trailing space.
  // Covers most emoji: surrogate pairs, variation selectors, ZWJ sequences, skin tones.
  return headline
    .replace(
      /^(?:[\u{1F000}-\u{1FFFF}\u{2600}-\u{27BF}\u{FE00}-\u{FE0F}\u{200D}\u{20E3}\u{E0020}-\u{E007F}]+[\uFE0E\uFE0F]?\s*)+/gu,
      "",
    )
    .trim();
}

/**
 * Known context story fallback labels mapped to improved versions.
 * These are the `template.question` values that the backend falls back to
 * when AI headline generation fails for context stories.
 */
const CONTEXT_LABEL_REWRITES: Record<string, (cityName: string) => string> = {
  "your city's crime mix": (c) => `${c}'s Crime Mix: Where the Numbers Are Moving`,
  "safest and most dangerous neighborhoods": (c) => `${c}'s Safest and Most Active Neighborhoods`,
  "top 311 complaints": (c) => `${c}'s Top 311 Complaints This Month`,
  "your tax dollars": (c) => `Where ${c}'s Tax Dollars Are Going`,
  "building permit pace": (c) => `${c}'s Building Permit Pace Right Now`,
  "retail storefronts: opening or closing?": (c) => `${c} Storefronts: More Opening or Closing?`,
  "crime: up or down?": (c) => `${c} Crime: The Direction May Surprise You`,
  "this year vs. last year": (c) => `${c} This Year vs. Last Year`,
  "311 complaints by neighborhood": (c) => `${c}'s 311 Complaints by Neighborhood`,
};

/**
 * Improve generic context story headlines that are just fallback labels.
 *
 * When the backend's `ContextStoryService` fails to generate an AI headline,
 * it falls back to the template question (e.g., "Top 311 complaints").
 * This function detects those and rewrites them to include the city name.
 */
export function improveContextHeadline(headline: string, cityName?: string): string {
  if (!headline || !cityName) return headline;
  const key = headline.toLowerCase().trim();
  const rewriter = CONTEXT_LABEL_REWRITES[key];
  if (rewriter) return rewriter(cityName);
  return headline;
}

/**
 * Known generic/placeholder headlines the backend falls back to when
 * AI headline generation fails. Matched case-insensitively.
 */
const GENERIC_HEADLINES = new Set([
  "the fact",
  "the facts",
  "fact",
  "facts",
]);

/**
 * Returns true if the headline is a generic placeholder that should be replaced.
 */
export function isGenericHeadline(headline: string): boolean {
  if (!headline) return true;
  return GENERIC_HEADLINES.has(headline.trim().toLowerCase());
}

/**
 * Replace a generic placeholder headline ("The Fact", etc.) with a better one
 * derived from available story fields.
 *
 * Priority:
 *  1. Build from metadata (metric_name + pct_change)
 *  2. Extract the first sentence of summary
 *  3. Extract the first sentence of description
 *  4. Return the original headline (unchanged) as last resort
 */
export function improveGenericHeadline(
  headline: string,
  opts: {
    metadata?: Record<string, unknown> | null;
    summary?: string | null;
    description?: string | null;
    cityName?: string | null;
  },
): string {
  if (!isGenericHeadline(headline)) return headline;

  const meta = opts.metadata ?? {};

  // 1. Try to build from metric metadata
  const metricName = (meta.metric_name ?? meta.metric_label ?? meta.category) as string | undefined;
  const pct = (meta.pct_change ?? meta.trend_pct_change ?? meta.percent_change) as number | undefined;

  if (metricName) {
    const city = opts.cityName ?? "";
    if (pct != null && Math.abs(pct) >= 1) {
      const dir = pct > 0 ? "Up" : "Down";
      const absPct = Math.abs(Math.round(pct));
      const pctStr = absPct >= 100 ? `${Math.round(absPct / 100)}x` : `${absPct}%`;
      return city
        ? `${city}: ${metricName} ${dir} ${pctStr}`
        : `${metricName} ${dir} ${pctStr}`;
    }
    return city ? `${city}: ${metricName}` : metricName;
  }

  // 2. Try summary first sentence
  const summaryLine = extractFirstSentence(opts.summary);
  if (summaryLine) return summaryLine;

  // 3. Try description first sentence
  const descLine = extractFirstSentence(opts.description);
  if (descLine) return descLine;

  // 4. Give up — return original
  return headline;
}

/**
 * Extract the first sentence (up to ~120 chars) from a text block.
 * Returns null if the text is empty or too short to be useful.
 */
function extractFirstSentence(text?: string | null): string | null {
  if (!text || text.trim().length < 10) return null;
  const cleaned = text.trim().replace(/\s+/g, " ");
  // Match up to the first sentence-ending punctuation
  const match = cleaned.match(/^(.{10,120}?[.!?])(?:\s|$)/);
  if (match) return match[1];
  // No punctuation: take up to 100 chars at a word boundary
  if (cleaned.length <= 100) return cleaned;
  const truncated = cleaned.slice(0, 100).replace(/\s+\S*$/, "");
  return truncated.length >= 10 ? truncated + "\u2026" : null;
}

/**
 * For multi-metric cards with generic "District N This Week — N Metrics Moving"
 * headlines, synthesize a better headline from the metrics data when available.
 */
export function improveMultiMetricHeadline(
  headline: string,
  metrics?: Array<{ name?: string | null; direction?: string; pct?: string | number }> | null,
): string {
  // Only transform the generic template headline
  if (!headline || !/this week\s*[—–-]\s*\d+\s*metrics?\s*moving/i.test(headline)) {
    return headline;
  }

  if (!metrics || metrics.length === 0) return headline;

  // Extract the location prefix (e.g., "District 3", "Citywide", "City-wide")
  const prefixMatch = headline.match(/^(.+?)\s*this week/i);
  const prefix = prefixMatch ? prefixMatch[1].trim() : "";

  // Find the metric with the largest absolute percentage change
  let leadMetric: { name: string; direction: string; pct: number } | null = null;
  let maxAbs = 0;

  for (const m of metrics) {
    const rawPct = typeof m.pct === "number" ? m.pct : parseFloat(String(m.pct ?? "0")) || 0;
    const abs = Math.abs(rawPct);
    if (abs > maxAbs && m.name) {
      maxAbs = abs;
      leadMetric = {
        name: m.name,
        direction: m.direction ?? (rawPct >= 0 ? "up" : "down"),
        pct: rawPct,
      };
    }
  }

  if (!leadMetric || maxAbs < 1) return headline;

  // Format: "District 3 — Crime Incidents Up 15%, Plus 3 More Movers"
  const dir = leadMetric.direction === "up" ? "Up" : "Down";
  const pctStr = maxAbs <= 999 ? `${Math.round(maxAbs)}%` : `${Math.round(maxAbs / 100)}x`;
  const others = metrics.length - 1;
  const suffix = others > 0 ? ` + ${others} More` : "";

  return `${prefix} — ${leadMetric.name} ${dir} ${pctStr}${suffix}`;
}

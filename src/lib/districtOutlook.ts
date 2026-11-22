import {
  getPublicDistrictCrimeOutlook,
  type CrimeOutlookCall,
  type DistrictCrimeOutlook,
  type DistrictCrimeOutlookType,
} from "@/lib/publicApiClient";

/** District crime outlook is gated until launch (pairs with backend NEIGHBORHOOD_OUTLOOK). */
export function districtOutlookEnabled(): boolean {
  const raw = (process.env.NEXT_PUBLIC_NEIGHBORHOOD_OUTLOOK ?? "").trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes";
}

/**
 * Fetch the outlook for a district page. Never blocks or breaks the page:
 * returns null when the flag is off, on any error, or after `timeoutMs`.
 */
export async function loadDistrictCrimeOutlook(
  cityId: number,
  district: number,
  timeoutMs = 4000
): Promise<DistrictCrimeOutlook | null> {
  if (!districtOutlookEnabled()) return null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), timeoutMs);
  });
  try {
    return await Promise.race([
      getPublicDistrictCrimeOutlook(cityId, district).catch(() => null),
      timeout,
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTHS_LONG = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** "2026-11" -> "Nov 2026" (or "November 2026" with long=true, "November" with year=false). */
export function monthLabel(
  ym: string | undefined,
  opts: { long?: boolean; year?: boolean } = {}
): string {
  if (!ym) return "";
  const [y, m] = ym.split("-").map(Number);
  const name = (opts.long ? MONTHS_LONG : MONTHS)[m - 1] ?? ym;
  return opts.year === false ? name : `${name} ${y}`;
}

export const CALL_WORDS: Record<CrimeOutlookCall, string> = {
  fall: "Likely to fall",
  hold: "Likely to hold steady",
  rise: "Likely to rise",
};

/** How each crime type reads inside a sentence. */
const IN_SENTENCE: Record<string, string> = {
  car_breakins: "car break-ins",
  car_theft: "car theft",
  property: "overall property crime",
  burglary: "burglary",
  robbery: "robbery",
  shoplifting: "shoplifting",
  violent: "violent crime",
};

export function inSentence(t: Pick<DistrictCrimeOutlookType, "key" | "label">): string {
  return IN_SENTENCE[t.key] ?? t.label.toLowerCase();
}

export function joinWords(words: string[]): string {
  if (words.length <= 1) return words[0] ?? "";
  return `${words.slice(0, -1).join(", ")} and ${words[words.length - 1]}`;
}

export function shownTypes(o: DistrictCrimeOutlook): DistrictCrimeOutlookType[] {
  // A call, a record that clears the bar, and at least a quarter of history to chart.
  return o.crime_types.filter((t) => t.shown && t.call && t.counts.length >= 3);
}

export type HeadlinePart = { text: string; call: CrimeOutlookCall | null };

/**
 * News-style headline naming what is likely to change, as parts so the
 * call words can be colored. Rises lead, then falls, then holds. Returns
 * null when nothing clears the bar (the section is not rendered).
 */
export function buildHeadline(o: DistrictCrimeOutlook, placeName: string): HeadlinePart[] | null {
  const shown = shownTypes(o);
  if (shown.length === 0) return null;
  const through = monthLabel(o.window_end, { long: true, year: false });
  const order: CrimeOutlookCall[] = ["rise", "fall", "hold"];
  const groups = order
    .map((call) => ({ call, names: shown.filter((t) => t.call === call).map(inSentence) }))
    .filter((g) => g.names.length > 0);
  const parts: HeadlinePart[] = [];
  groups.forEach((g, i) => {
    let names = joinWords(g.names);
    if (i === 0) names = names.charAt(0).toUpperCase() + names.slice(1);
    if (i > 0) parts.push({ text: "; ", call: null });
    parts.push({ text: `${names} `, call: null });
    parts.push({ text: CALL_WORDS[g.call].toLowerCase(), call: g.call });
    if (i === 0) parts.push({ text: ` in ${placeName} through ${through}`, call: null });
  });
  return parts;
}

export function headlineText(parts: HeadlinePart[]): string {
  return parts.map((p) => p.text).join("");
}

/** Subhead: what the calls are based on and how often they have been right. */
export function buildSubhead(o: DistrictCrimeOutlook): string {
  const shown = shownTypes(o);
  if (shown.length === 0) return "";
  const pcts = shown.map((t) => recordPct(t.record));
  const lo = Math.min(...pcts);
  const hi = Math.max(...pcts);
  const range = lo === hi ? `${lo}%` : `${lo}% to ${hi}%`;
  return (
    `Based on each crime type's recent direction in this district or across San Francisco. ` +
    `Calls like these have been right ${range} of the time across all 11 districts, ` +
    `${monthLabel(o.record_start)} to ${monthLabel(o.record_end)}.`
  );
}

export const RULE_NOTES: Record<DistrictCrimeOutlookType["rule"], string> = {
  city_trend: "Follows the direction most San Francisco districts moved over the past year",
  momentum: "Follows this district's direction over its last three months",
};

/** Track record as a whole percent, rounded down (0.57 -> 57, not 56 from float error). */
export function recordPct(record: number): number {
  return Math.floor(record * 100 + 1e-9);
}

/** Monthly figures: one decimal under 10, whole numbers above. */
export function formatMonthly(x: number): string {
  return x < 10 ? x.toFixed(1) : Math.round(x).toLocaleString("en-US");
}

/** Change of the last 3 months against the 12-month average, for the details table. */
export function changeSummary(last3: number, avg12: number): {
  text: string;
  direction: "up" | "down" | "flat";
} {
  const diff = last3 - avg12;
  if (avg12 < 10) {
    const big = Math.abs(diff) >= 1;
    return {
      text: `${diff >= 0 ? "+" : "-"}${Math.abs(diff).toFixed(1)} a month`,
      direction: !big ? "flat" : diff < 0 ? "down" : "up",
    };
  }
  const pct = (diff / avg12) * 100;
  const rounded = Math.round(pct);
  return {
    text: `${rounded > 0 ? "+" : ""}${rounded}%`,
    direction: Math.abs(pct) <= 5 ? "flat" : pct < 0 ? "down" : "up",
  };
}

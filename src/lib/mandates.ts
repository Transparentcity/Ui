import type {
  MandateCompliance,
  MandateStandard,
} from "@/lib/publicApiClient";

/** Legal standards UI is gated until launch (scorecard page and metric panel). */
export function mandatesEnabled(): boolean {
  const raw = (process.env.NEXT_PUBLIC_MANDATES_ENABLED ?? "").trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes";
}

export type MandatePillKind =
  | "met"
  | "missed"
  | "behind_pace"
  | "at_risk"
  | "no_data"
  | "tracked";

export const MANDATE_PILL_LABELS: Record<MandatePillKind, string> = {
  met: "Meets standard",
  missed: "Missed",
  behind_pace: "Behind pace",
  at_risk: "At risk",
  no_data: "No recent data",
  tracked: "No legal target",
};

/** Scorecard order: what needs attention first, what has no target last. */
export const MANDATE_PILL_ORDER: MandatePillKind[] = [
  "missed",
  "behind_pace",
  "at_risk",
  "met",
  "no_data",
  "tracked",
];

/**
 * How many months old the latest data may be before it counts as stale.
 * Scorecard figures often lag a month or two, so this is deliberately loose.
 * A stale result keeps its real status; the card says when it was last
 * reported, so a known violation is never hidden behind "No recent data".
 */
const STALE_AFTER_MONTHS: Record<string, number> = {
  // State sources lag: Medi-Cal renewals publish about 6 months behind, so
  // allow one month of slack before calling a monthly series stale.
  month: 7,
  quarter: 9,
  year: 24,
};

function monthsBetween(fromIso: string, to: Date): number | null {
  const d = new Date(fromIso);
  if (Number.isNaN(d.getTime())) return null;
  return (
    (to.getUTCFullYear() - d.getUTCFullYear()) * 12 +
    (to.getUTCMonth() - d.getUTCMonth())
  );
}

/** True when the latest period is older than the grain's staleness window. */
export function mandateIsStale(
  compliance: MandateCompliance | null | undefined,
  grain: string | null | undefined,
  now: Date = new Date()
): boolean {
  if (!compliance?.latest_period) return false;
  const staleAfter = STALE_AFTER_MONTHS[grain ?? "month"] ?? STALE_AFTER_MONTHS.month;
  const age = monthsBetween(compliance.latest_period, now);
  return age != null && age > staleAfter;
}

/**
 * Status pill for a mandate.
 *
 * The backend reports met / missed / off_pace / tracked / no_data for the
 * latest period. "At risk" is derived here: the latest period meets the
 * standard but at least one of the last 12 evaluated periods missed it.
 * Staleness does not change the pill (see mandateIsStale).
 */
export function mandatePillKind(
  compliance: MandateCompliance | null | undefined
): MandatePillKind {
  if (!compliance || !compliance.latest_period) return "no_data";
  switch (compliance.latest_status) {
    case "met":
      return compliance.met_count_recent < compliance.evaluated_count_recent
        ? "at_risk"
        : "met";
    case "missed":
      return "missed";
    case "off_pace":
      return "behind_pace";
    case "tracked":
      return "tracked";
    default:
      return "no_data";
  }
}

/** Sort mandates for the scorecard: failures first, no-target last; stable within a group. */
export function sortMandatesForScorecard<T extends { standard: MandateStandard; compliance: MandateCompliance }>(
  mandates: T[]
): T[] {
  const rank = (m: T) =>
    MANDATE_PILL_ORDER.indexOf(mandatePillKind(m.compliance));
  return mandates
    .map((m, i) => ({ m, i, r: rank(m) }))
    .sort((a, b) => a.r - b.r || a.i - b.i)
    .map((x) => x.m);
}

export type MandateSummary = {
  counts: Partial<Record<MandatePillKind, number>>;
  /** One sentence with the headline, e.g. the longest-running miss. */
  lead: string | null;
};

/**
 * Headline for the top of the scorecard: how many standards sit in each
 * state, and the single most important fact (the longest-running failure,
 * or that every standard with a target is being met).
 */
export function summarizeMandates<T extends { standard: MandateStandard; metric_name: string; compliance: MandateCompliance }>(
  mandates: T[],
  cityName: string
): MandateSummary {
  const counts: Partial<Record<MandatePillKind, number>> = {};
  let worst: { title: string; kind: MandatePillKind; streak: number; grain: string } | null = null;
  for (const m of mandates) {
    const kind = mandatePillKind(m.compliance);
    counts[kind] = (counts[kind] ?? 0) + 1;
    if (kind === "missed" || kind === "behind_pace") {
      const streak = m.compliance.streak_length ?? 0;
      if (!worst || streak > worst.streak) {
        worst = {
          title: m.standard.title || m.metric_name,
          kind,
          streak,
          grain: m.standard.grain,
        };
      }
    }
  }
  const judged = mandates.length - (counts.tracked ?? 0) - (counts.no_data ?? 0);
  let lead: string | null = null;
  if (worst) {
    const n = worst.streak;
    const span = n > 1 ? ` for ${n} ${grainNoun(worst.grain, n)} running` : "";
    lead =
      worst.kind === "behind_pace"
        ? `${worst.title} has been behind the pace the law requires${span}.`
        : `${worst.title} has missed its standard${span}.`;
  } else if (judged > 0) {
    lead = `${cityName} is meeting every legal standard with a numeric target.`;
  }
  return { counts, lead };
}

function grainNoun(grain: string | null | undefined, n: number): string {
  const base = grain === "quarter" ? "quarter" : grain === "year" ? "year" : "month";
  return n === 1 ? base : `${base}s`;
}

/**
 * Streak sentence, e.g. "Missed 12 months running". Null when the streak is
 * not about compliance (tracked, no data) or is empty.
 */
export function mandateStreakText(
  compliance: MandateCompliance | null | undefined,
  grain: string | null | undefined
): string | null {
  if (!compliance) return null;
  const n = compliance.streak_length;
  if (!n || n < 1) return null;
  const verb =
    compliance.streak_status === "met"
      ? "Met"
      : compliance.streak_status === "missed"
        ? "Missed"
        : compliance.streak_status === "off_pace"
          ? "Behind pace for"
          : null;
  if (!verb) return null;
  if (n === 1) return `${verb} the latest ${grainNoun(grain, 1)}`;
  return `${verb} ${n} ${grainNoun(grain, n)} running`;
}

/**
 * Split a value into its number and unit for display, e.g. 1,047 + "people".
 * "%" stays attached to the number; a count of exactly 1 takes the singular
 * of a plural unit ("1 permit in violation").
 */
export function splitMandateValue(
  value: number | null | undefined,
  unit: string | null | undefined
): { number: string; unit: string | null } {
  if (value == null || Number.isNaN(value)) return { number: "No data", unit: null };
  if (unit === "%") return { number: formatMandateValue(value, unit), unit: null };
  const number = value.toLocaleString("en-US", { maximumFractionDigits: 1 });
  if (!unit) return { number, unit: null };
  if (value === 1) {
    const [head, ...rest] = unit.split(" ");
    const singular = head.endsWith("s") && head !== "people" ? head.slice(0, -1) : head;
    return { number, unit: [singular, ...rest].join(" ") };
  }
  return { number, unit };
}

/** Format a value in the standard's unit: "%" gets one decimal and a suffix. */
export function formatMandateValue(
  value: number | null | undefined,
  unit: string | null | undefined
): string {
  if (value == null || Number.isNaN(value)) return "No data";
  if (unit === "%") {
    return `${value.toLocaleString("en-US", {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    })}%`;
  }
  const num = value.toLocaleString("en-US", { maximumFractionDigits: 1 });
  return unit ? `${num} ${unit}` : num;
}

/** Compact target, e.g. "≥ 90.0%" or "≤ 1,562 people". Null when there is no numeric target. */
export function formatMandateTarget(standard: MandateStandard | null | undefined): string | null {
  if (!standard || standard.target == null || standard.operator === "tracked") return null;
  const sym =
    standard.operator === "<="
      ? "≤"
      : standard.operator === "=="
        ? "="
        : standard.operator === "pace"
        ? "On pace for"
        : "≥";
  return `${sym} ${formatMandateValue(standard.target, standard.unit)}`;
}

/**
 * Chart reference line for the standard's target. "pace" renders like ">=".
 * Null for tracked mandates or a missing target.
 */
export function mandateReferenceLine(
  standard: MandateStandard | null | undefined
): { y: number; label: string } | null {
  if (!standard || standard.target == null || standard.operator === "tracked") return null;
  return {
    y: standard.target,
    label: `Legal standard: ${formatMandateTarget(standard) ?? standard.target}`,
  };
}

/** Human period label, e.g. "Jun 2026" (month) or "2026" (year). */
export function formatMandatePeriod(
  iso: string | null | undefined,
  grain: string | null | undefined
): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  if (grain === "year") return String(d.getUTCFullYear());
  if (grain === "quarter") {
    return `Q${Math.floor(d.getUTCMonth() / 3) + 1} ${d.getUTCFullYear()}`;
  }
  return d.toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" });
}

/**
 * Whether a legal-standard metric's chart should drop the Year-to-Date view.
 * YTD sums each period, which is meaningless for a "%" standard (summed
 * percentages) or a level/average series (stock metrics). No aggregation
 * field reaches the UI yet, so measurement_type "stock" is the proxy for
 * averaged/level series.
 */
export function mandateChartDisablesYtd(
  standard: MandateStandard | null | undefined,
  measurementType?: string | null
): boolean {
  if (!standard) return false;
  return standard.unit === "%" || measurementType === "stock";
}

/** Category name the platform assigns to legal-standard metrics (backend value; do not rename). */
export const LEGAL_MANDATES_CATEGORY = "Legal mandates";

/** What readers see for that category. */
export const LEGAL_STANDARDS_LABEL = "Legal standards";

/** True for the legal-standards category, tolerant of case, spacing and snake_case. */
export function isLegalMandateCategory(category: string | null | undefined): boolean {
  if (!category) return false;
  return (
    category.trim().toLowerCase().replace(/[_\s]+/g, " ") ===
    LEGAL_MANDATES_CATEGORY.toLowerCase()
  );
}

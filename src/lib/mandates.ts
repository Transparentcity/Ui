import type {
  MandateCompliance,
  MandateStandard,
} from "@/lib/publicApiClient";

/** Legal mandates UI is gated until launch (scorecard page and metric panel). */
export function mandatesEnabled(): boolean {
  const raw = (process.env.NEXT_PUBLIC_MANDATES_ENABLED ?? "").trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes";
}

export type MandatePillKind = "met" | "missed" | "at_risk" | "no_data" | "tracked";

export const MANDATE_PILL_LABELS: Record<MandatePillKind, string> = {
  met: "Meets standard",
  missed: "Missed",
  at_risk: "At risk",
  no_data: "No recent data",
  tracked: "Tracked",
};

/**
 * How many periods old the latest data may be before the status reads
 * "No recent data". Scorecard figures often lag a month or two, so this is
 * deliberately loose; it exists to stop a years-old result reading as current.
 */
const STALE_AFTER_MONTHS: Record<string, number> = {
  // State sources lag: Medi-Cal renewals publish about 6 months behind.
  month: 6,
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

/**
 * Status pill for a mandate.
 *
 * The backend reports met / missed / tracked / no_data for the latest period.
 * Two states are derived here:
 * - "At risk": the latest period meets the standard but at least one of the
 *   last 12 evaluated periods missed it (met_count_recent < evaluated_count_recent).
 * - "No recent data": no periods, a latest status of no_data, or a latest
 *   period older than the grain's staleness window.
 */
export function mandatePillKind(
  compliance: MandateCompliance | null | undefined,
  grain: string | null | undefined,
  now: Date = new Date()
): MandatePillKind {
  if (!compliance || !compliance.latest_period) return "no_data";
  const staleAfter = STALE_AFTER_MONTHS[grain ?? "month"] ?? STALE_AFTER_MONTHS.month;
  const age = monthsBetween(compliance.latest_period, now);
  if (age != null && age > staleAfter) return "no_data";
  switch (compliance.latest_status) {
    case "met":
      return compliance.met_count_recent < compliance.evaluated_count_recent
        ? "at_risk"
        : "met";
    case "missed":
    case "off_pace":
      return "missed";
    case "tracked":
      return "tracked";
    default:
      return "no_data";
  }
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

/** Category name the platform assigns to legal-mandate metrics. */
export const LEGAL_MANDATES_CATEGORY = "Legal mandates";

/** True for the legal-mandates category, tolerant of case, spacing and snake_case. */
export function isLegalMandateCategory(category: string | null | undefined): boolean {
  if (!category) return false;
  return (
    category.trim().toLowerCase().replace(/[_\s]+/g, " ") ===
    LEGAL_MANDATES_CATEGORY.toLowerCase()
  );
}

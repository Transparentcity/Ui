/** Static config for the 12 metrics shown in the Cincinnati landing's Numbers
 * table. Maps each row to its source metric (by metric_key) plus presentation
 * (emoji, label, group). The `bad` field is computed at render time from the
 * sign of the YoY change and the metric's "good direction". */

export type RowConfig = {
  metricKey: string;
  group: string;
  emoji: string;
  label: string;
  /** Direction that's "good" for this metric.
   *  - "down": fewer is better (crime, complaints, time-to-permit)
   *  - "up":   more is better
   *  - "neutral": no value judgment (911 call volume, permit filings) */
  goodDirection: "up" | "down" | "neutral";
  /** Force a decimal-style display (used for the avg-days-to-permit row). */
  decimal?: boolean;
};

export const CINCY_ROW_CONFIG: RowConfig[] = [
  { metricKey: "cincinnati_violent_crime_fbi_type1",         group: "Crime",   emoji: "🚨", label: "Violent crime incidents",       goodDirection: "down" },
  { metricKey: "cincinnati_property_crime_incidents",        group: "Crime",   emoji: "📦", label: "Property crime incidents",      goodDirection: "down" },
  { metricKey: "cincinnati_homicides",                       group: "Crime",   emoji: "💀", label: "Homicides",                     goodDirection: "down" },
  { metricKey: "cincinnati_911_calls",                       group: "Safety",  emoji: "📞", label: "911 calls",                     goodDirection: "neutral" },
  { metricKey: "cincinnati_traffic_crashes",                 group: "Safety",  emoji: "🚗", label: "Traffic crashes",               goodDirection: "down" },
  { metricKey: "cincinnati_true_new_residential_construction_permits_filed", group: "Housing", emoji: "🏗️", label: "New residential permits filed", goodDirection: "neutral" },
  { metricKey: "cincinnati_avg_days_permit_new_residential_full_plan_review", group: "Housing", emoji: "⏱️", label: "Avg days to permit",            goodDirection: "down", decimal: true },
  { metricKey: "cincinnati_pothole_street_repair_311",       group: "311",     emoji: "🛣️", label: "Pothole & street repair",       goodDirection: "down" },
  { metricKey: "cincinnati_street_sidewalk_cleaning_311",    group: "311",     emoji: "🧹", label: "Street & sidewalk cleaning",    goodDirection: "neutral" },
  { metricKey: "cincinnati_311_graffiti",                    group: "311",     emoji: "🎨", label: "Graffiti removal",              goodDirection: "down" },
  { metricKey: "cincinnati_noise_complaints_311",            group: "311",     emoji: "🔊", label: "Noise complaints",              goodDirection: "down" },
  { metricKey: "cincinnati_311_abandoned_vehicle",           group: "311",     emoji: "🚙", label: "Abandoned vehicle complaints",  goodDirection: "down" },
];

export type LiveRow = {
  group: string;
  emoji: string;
  label: string;
  curr: string;
  change: string;
  delta: string;
  dir: "up" | "down";
  bad: boolean | null;
};

export type NumbersMeta = {
  /** ISO date string of the most recent current_period_end across all rows. */
  asOf: string | null;
};

function formatCount(n: number, decimal?: boolean): string {
  if (decimal) return n.toFixed(1);
  if (Math.abs(n) >= 1_000_000) return (n / 1_000_000).toFixed(1) + "m";
  if (Math.abs(n) >= 1_000) {
    const k = n / 1_000;
    return (k >= 100 ? Math.round(k).toString() : k.toFixed(1)) + "k";
  }
  return Math.round(n).toString();
}

function formatDelta(diff: number, decimal?: boolean): string {
  const sign = diff > 0 ? "+" : diff < 0 ? "−" : "";
  const abs = Math.abs(diff);
  if (decimal) return sign + abs.toFixed(1);
  if (abs >= 1_000) return sign + Math.round(abs).toLocaleString();
  return sign + Math.round(abs).toString();
}

function formatPercent(pct: number): string {
  const sign = pct > 0 ? "+" : pct < 0 ? "−" : "";
  const abs = Math.abs(pct);
  // Match design: integer percent rounding for big values.
  const rounded = abs >= 10 ? Math.round(abs) : Math.round(abs);
  return `${sign}${rounded}%`;
}

/** Take the static row config + a metric-key → comparison map and produce the
 * rendered rows. Skips any rows whose metric is missing from the response or
 * has no current/comparison value. */
export function buildLiveRows(
  byKey: Record<string, { curr: number | null; prev: number | null; end: string | null }>
): { rows: LiveRow[]; meta: NumbersMeta } {
  const rows: LiveRow[] = [];
  let asOf: string | null = null;

  for (const cfg of CINCY_ROW_CONFIG) {
    const entry = byKey[cfg.metricKey];
    if (!entry || entry.curr == null || entry.prev == null || entry.prev === 0) {
      continue;
    }
    const curr = entry.curr;
    const prev = entry.prev;
    const diff = curr - prev;
    const pct = (diff / prev) * 100;
    const dir: "up" | "down" = diff >= 0 ? "up" : "down";

    let bad: boolean | null;
    if (cfg.goodDirection === "neutral") {
      bad = null;
    } else if (cfg.goodDirection === "down") {
      bad = diff > 0 ? true : diff < 0 ? false : null;
    } else {
      bad = diff > 0 ? false : diff < 0 ? true : null;
    }

    rows.push({
      group: cfg.group,
      emoji: cfg.emoji,
      label: cfg.label,
      curr: formatCount(curr, cfg.decimal),
      change: formatPercent(pct),
      delta: formatDelta(diff, cfg.decimal),
      dir,
      bad,
    });

    if (entry.end && (!asOf || entry.end > asOf)) asOf = entry.end;
  }

  return { rows, meta: { asOf } };
}

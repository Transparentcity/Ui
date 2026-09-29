/**
 * Build a structured scale legend for continuous choropleth count ramps.
 *
 * This module is a pure helper — no React or DOM imports.
 * The returned descriptor drives the gradient-bar UI in the public map page.
 */

import type { ChoroplethValueConfig } from "./formatChoroplethValue";
import { formatChoroplethValue } from "./formatChoroplethValue";

// ── Types ─────────────────────────────────────────────────────────────────────

/** A gradient-scale legend for a continuous choropleth count or rate ramp. */
export type ScaleLegend = {
  /** Formatted minimum value label, e.g. "1 arrest". */
  minLabel: string;
  /** Formatted maximum value label, e.g. "415 arrests". */
  maxLabel: string;
  /** CSS color string for the low end of the ramp, e.g. "rgb(246,237,255)". */
  lowColor: string;
  /** CSS color string for the high end, e.g. "rgb(173,53,250)". */
  highColor: string;
  /**
   * True when at least one district had no data — renders a separate
   * "No data" swatch beneath the gradient bar.
   */
  hasNoData: boolean;
  /** Background color used for no-data polygons. */
  noDataColor: string;
  /**
   * Human-readable date range, e.g. "Sep 28, 2025 – Sep 27, 2026".
   * Null when start/end dates are unavailable.
   */
  dateRange: string | null;
  /**
   * True when every area shares the same value (renders a single swatch
   * instead of a gradient bar).
   */
  isSingleValue: boolean;
};

/** Inputs for {@link buildChoroplethScaleLegend}. */
export type ChoroplethScaleConfig = {
  minValue: number;
  maxValue: number;
  lowRgb: [number, number, number];
  highRgb: [number, number, number];
  noDataFill: string;
  /** True when at least one polygon feature has no data value. */
  hasNoData: boolean;
  mapConfig?: ChoroplethValueConfig | null;
  startDate?: string | null;
  endDate?: string | null;
};

// ── Internal date helpers ─────────────────────────────────────────────────────

function parseUtcDate(value: string): Date | null {
  const m = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return Number.isNaN(d.getTime()) ? null : d;
}

function fmtDate(d: Date, withYear: boolean): string {
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    ...(withYear ? { year: "numeric" } : {}),
    timeZone: "UTC",
  });
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Format a start/end date pair into a compact label for the scale legend.
 *
 * Examples:
 *   "2026-01-01" / "2026-09-27"  → "Jan 1 – Sep 27, 2026"
 *   "2025-09-28" / "2026-09-27"  → "Sep 28, 2025 – Sep 27, 2026"
 *   "2026-01-01" / null          → "From Jan 1, 2026"
 *   null         / "2026-09-27"  → "Through Sep 27, 2026"
 */
export function formatScaleDateRange(
  startDate?: string | null,
  endDate?: string | null,
): string | null {
  const hasStart = typeof startDate === "string" && startDate.trim().length > 0;
  const hasEnd = typeof endDate === "string" && endDate.trim().length > 0;
  if (!hasStart && !hasEnd) return null;

  const start = hasStart ? parseUtcDate(startDate as string) : null;
  const end = hasEnd ? parseUtcDate(endDate as string) : null;

  if (start && end) {
    const sameYear = start.getUTCFullYear() === end.getUTCFullYear();
    return `${fmtDate(start, !sameYear)} – ${fmtDate(end, true)}`;
  }
  if (start) return `From ${fmtDate(start, true)}`;
  if (end) return `Through ${fmtDate(end, true)}`;
  return null;
}

/**
 * Build a {@link ScaleLegend} from the parameters used to paint a choropleth.
 *
 * Pass the computed `minValue` / `maxValue` (already available after the
 * colour-value loop in `loadChoroplethMap`) rather than hard-coded "Low"/"High"
 * labels.
 */
export function buildChoroplethScaleLegend(
  config: ChoroplethScaleConfig,
): ScaleLegend {
  const {
    minValue,
    maxValue,
    lowRgb,
    highRgb,
    noDataFill,
    hasNoData,
    mapConfig,
    startDate,
    endDate,
  } = config;

  const minLabel = formatChoroplethValue(minValue, mapConfig, {
    fallback: String(minValue),
    lowercaseNoun: true,
  });
  const maxLabel = formatChoroplethValue(maxValue, mapConfig, {
    fallback: String(maxValue),
    lowercaseNoun: true,
  });

  return {
    minLabel,
    maxLabel,
    lowColor: `rgb(${lowRgb.join(",")})`,
    highColor: `rgb(${highRgb.join(",")})`,
    hasNoData,
    noDataColor: noDataFill,
    dateRange: formatScaleDateRange(startDate, endDate),
    isSingleValue: minValue === maxValue,
  };
}

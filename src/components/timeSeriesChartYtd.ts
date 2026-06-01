export type TimeSeriesPoint = {
  time_period: string;
  numeric_value: number;
};

/** Minimum category count before YTD multi-group charts switch to compact layout. */
export const DENSE_YTD_CATEGORY_THRESHOLD = 4;

export function countYtdCategories(groupKeys: string[]): number {
  const categories = new Set<string>();
  for (const key of groupKeys) {
    const category = key.includes("|") ? key.split("|")[0] : key;
    if (category) categories.add(category);
  }
  return categories.size;
}

export function isDenseMultiGroupYtd(
  periodType: string,
  groupKeys: string[],
): boolean {
  if (periodType !== "ytd") return false;
  return countYtdCategories(groupKeys) >= DENSE_YTD_CATEGORY_THRESHOLD;
}

/** Round up to a readable axis top (e.g. 3.2 → 4, 12 → 15). */
export function niceYAxisMax(maxValue: number): number {
  if (!Number.isFinite(maxValue) || maxValue <= 0) return 5;
  const padded = maxValue * 1.12;
  if (padded <= 8) return Math.max(1, Math.ceil(padded));
  const magnitude = 10 ** Math.floor(Math.log10(padded));
  const normalized = padded / magnitude;
  const nice =
    normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  return nice * magnitude;
}

export function truncateLabel(text: string, maxLen: number): string {
  const trimmed = text.trim();
  if (trimmed.length <= maxLen) return trimmed;
  return `${trimmed.slice(0, maxLen - 1)}…`;
}

export function formatYtdLegendLabel(
  category: string,
  year: string,
  compact: boolean,
): string {
  const shortYear = `'${year.slice(-2)}`;
  const label = truncateLabel(category, compact ? 24 : 40);
  if (compact) return `${label} · ${shortYear}`;
  return `${category} ${year}`;
}

export function formatYtdHoverLabel(
  category: string,
  year: string,
  compact: boolean,
  suffix = "",
): string {
  const base = compact
    ? `${truncateLabel(category, 32)} (${year})`
    : `${category} ${year}${suffix}`;
  return base;
}

export function getYtdSeriesLineColor(
  year: number,
  currentYear: number,
  categoryColor: string,
  compact: boolean,
): string {
  if (year === currentYear) return categoryColor;
  if (compact) return categoryColor;
  return "#888888";
}

export function getYtdAvgLineStyle(
  year: number,
  currentYear: number,
  categoryColor: string,
  compact: boolean,
): { color: string; width: number; dash?: string } {
  const color = getYtdSeriesLineColor(year, currentYear, categoryColor, compact);
  if (year === currentYear) {
    return { color, width: compact ? 2.25 : 2 };
  }
  if (compact) {
    return { color, width: 1.75, dash: "dash" };
  }
  return { color, width: 2 };
}

/** Max displayed value using the same 7-day trailing average as the chart. */
export function maxYtdSevenDayAverage(
  aggregatedByGroup: Map<string, TimeSeriesPoint[]>,
  options: { currentYear: number; showPriorYear: boolean },
): number {
  let max = 0;
  for (const [key, points] of aggregatedByGroup.entries()) {
    const yearStr = key.includes("|") ? key.split("|")[1] : key;
    const year = parseInt(yearStr, 10);
    if (!Number.isFinite(year)) continue;
    if (!options.showPriorYear && year < options.currentYear) continue;

    const y = points.map((p) => p.numeric_value ?? 0);
    for (let idx = 0; idx < y.length; idx++) {
      const start = Math.max(0, idx - 6);
      const window = y.slice(start, idx + 1);
      const avg = window.reduce((acc, v) => acc + v, 0) / window.length;
      if (avg > max) max = avg;
    }
  }
  return max;
}

export function trailingSevenDayAverage(values: number[]): number[] {
  return values.map((_, idx) => {
    const start = Math.max(0, idx - 6);
    const window = values.slice(start, idx + 1);
    return window.reduce((acc, v) => acc + v, 0) / window.length;
  });
}

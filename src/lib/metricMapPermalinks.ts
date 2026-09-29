import {
  formatMetricMapViewSpecKey,
  type MetricMapViewSpec,
} from "@/lib/metricMapEmbedViews";

export type MapPermalinkRange = {
  start: string;
  end: string;
};

export type DateRangeLike = {
  start: string | null;
  end: string | null;
};

export function completeDateRange(
  range?: DateRangeLike | null
): MapPermalinkRange | null {
  if (!range?.start || !range?.end) return null;
  return { start: range.start, end: range.end };
}

/** Match a year-compare panel to the current or prior period dates. */
export function permalinkRangeForYear(
  year: string,
  currentYear: number | null | undefined,
  comparisonYear: number | null | undefined,
  dateRange?: DateRangeLike | null,
  comparisonDateRange?: DateRangeLike | null
): MapPermalinkRange | null {
  if (currentYear != null && year === String(currentYear)) {
    return completeDateRange(dateRange);
  }
  if (comparisonYear != null && year === String(comparisonYear)) {
    return completeDateRange(comparisonDateRange);
  }
  return null;
}

export function metricMapPermalinkKey(
  viewSpec: MetricMapViewSpec,
  panelId: string
): string {
  return `${formatMetricMapViewSpecKey(viewSpec)}:${panelId}`;
}

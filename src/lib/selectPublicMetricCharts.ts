import type { PublicTimeSeriesSummaryItem } from "@/lib/publicApiClient";

/**
 * Citywide or district-specific base charts (no group_field) for a metric summary.
 */
export function getBaseChartCandidates(
  series: PublicTimeSeriesSummaryItem[],
  district: number | null
): PublicTimeSeriesSummaryItem[] {
  if (series.length === 0) {
    return [];
  }
  const targetDistrict = district ?? 0;
  const districtSeries = series.filter((item) => {
    const itemDistrict = item.district ?? 0;
    return itemDistrict === targetDistrict && !item.group_field;
  });
  return districtSeries.length > 0
    ? districtSeries
    : series.filter(
        (item) =>
          (item.district === 0 || item.district === null) && !item.group_field
      );
}

/**
 * Native yearly chart for the same district/citywide scope (if stored).
 */
export function findYearChartIdForDistrict(
  series: PublicTimeSeriesSummaryItem[],
  district: number | null
): number | null {
  const candidates = getBaseChartCandidates(series, district);
  if (candidates.length === 0) {
    return null;
  }
  const yearChart = candidates.find(
    (item) => item.period_type?.toLowerCase() === "year"
  );
  return yearChart?.chart_id ?? null;
}

/**
 * Pick chart IDs for public metric detail: a primary series for YTD/daily views
 * (prefer day → ytd → month) and an optional native yearly chart for annual totals.
 */
export function selectPublicMetricCharts(
  series: PublicTimeSeriesSummaryItem[],
  selectedDistrict: number | null
): { primaryChartId: number | null; yearChartId: number | null } {
  if (series.length === 0) {
    return { primaryChartId: null, yearChartId: null };
  }

  const candidates = getBaseChartCandidates(series, selectedDistrict);

  if (candidates.length === 0) {
    const fallback = series[0]?.chart_id ?? null;
    return { primaryChartId: fallback, yearChartId: null };
  }

  const yearChart = candidates.find(
    (item) => item.period_type?.toLowerCase() === "year"
  );
  const yearChartId = yearChart?.chart_id ?? null;

  const dayChart = candidates.find(
    (item) => item.period_type?.toLowerCase() === "day"
  );
  if (dayChart) {
    return {
      primaryChartId: dayChart.chart_id,
      yearChartId,
    };
  }

  const ytdChart = candidates.find(
    (item) => item.period_type?.toLowerCase() === "ytd"
  );
  if (ytdChart) {
    return {
      primaryChartId: ytdChart.chart_id,
      yearChartId,
    };
  }

  const monthChart = candidates.find(
    (item) => item.period_type?.toLowerCase() === "month"
  );
  if (monthChart) {
    return {
      primaryChartId: monthChart.chart_id,
      yearChartId,
    };
  }

  return {
    primaryChartId: candidates[0].chart_id,
    yearChartId,
  };
}

import type { DailyCompletenessResponse } from "@/lib/publicApiClient";

/**
 * Counts trailing calendar days (from most recent) that are still not stable
 * in daily completeness data — same signal as the YTD "incomplete" shading on
 * {@link TimeSeriesChart} when passed as `staleness_days`.
 */
export function computeReportingCompletenessStalenessDays(
  completenessDaily: DailyCompletenessResponse | null | undefined
): number | undefined {
  if (!completenessDaily?.data?.length) return undefined;
  const sorted = [...completenessDaily.data].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  );
  let lag = 0;
  for (const entry of sorted) {
    if (!entry.is_stable) {
      lag++;
    } else {
      break;
    }
  }
  return lag > 0 ? lag : undefined;
}

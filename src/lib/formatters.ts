/**
 * Shared formatting utilities for metric values and date ranges.
 */

/**
 * Format a raw backend category key for display.
 * "SERVICE_REQUESTS" → "Service Requests"
 * "Emergency_response" → "Emergency Response"
 */
export function formatCategoryName(raw: string): string {
  return raw
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Format a metric value based on its display unit.
 * - percentage: "49%"
 * - currency: "$10M"
 * - default: compact integers (100k, 10M) or comma-separated counts under 1k
 */
export function formatMetricValue(
  value: number | null | undefined,
  displayUnit?: string | null
): string {
  if (value === null || value === undefined) {
    return "No data";
  }

  if (displayUnit === "percentage") {
    return `${Math.round(value)}%`;
  }

  const absValue = Math.abs(value);
  const sign = value < 0 ? "-" : "";
  const formatWithSuffix = (scaled: number, suffix: string) =>
    `${Math.round(scaled)}${suffix}`;

  const compact =
    absValue >= 1e9
      ? formatWithSuffix(absValue / 1e9, "B")
      : absValue >= 1e6
        ? formatWithSuffix(absValue / 1e6, "M")
        : absValue >= 1e3
          ? formatWithSuffix(absValue / 1e3, "k")
          : Math.round(absValue).toLocaleString(undefined, {
              maximumFractionDigits: 0,
            });

  if (displayUnit === "currency") {
    return `${sign}$${compact}`;
  }

  return `${sign}${compact}`;
}

/**
 * Format a date range from string dates (e.g., "Jan 1 – Mar 15, 2026").
 * Uses UTC timezone to avoid off-by-one issues with server dates.
 * Accepts an optional loading/fallback string.
 */
export function formatDateRangeFromStrings(
  start: string | null | undefined,
  end: string | null | undefined,
  options?: { loading?: boolean; fallback?: string }
): string {
  const fallback = options?.fallback ?? "—";
  if (options?.loading) return "Loading...";
  if (!start || !end) return fallback;
  const startDate = new Date(start);
  const endDate = new Date(end);
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
    return fallback;
  }
  const startStr = startDate.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
  const endStr = endDate.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
  return `${startStr} – ${endStr}`;
}

/**
 * Format a period date range from string dates without year (e.g., "Jan 1 - Mar 15").
 * Uses UTC timezone. Returns null if inputs are missing/invalid.
 */
export function formatPeriodDate(
  start?: string | null,
  end?: string | null
): string | null {
  if (!start || !end) return null;
  try {
    const startDate = new Date(start);
    const endDate = new Date(end);
    const startStr = startDate.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      timeZone: "UTC",
    });
    const endStr = endDate.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      timeZone: "UTC",
    });
    return `${startStr} - ${endStr}`;
  } catch {
    return null;
  }
}

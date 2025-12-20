export type DateRangePreset = "all" | "last_week" | "last_month" | "custom";

export interface MetricDateRange {
  preset: DateRangePreset;
  start_date: string | null;
  end_date: string | null;
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/**
 * Format a Date as YYYY-MM-DD in local time.
 */
export function toIsoDateString(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

export function addDays(d: Date, days: number): Date {
  const next = new Date(d);
  next.setDate(next.getDate() + days);
  return next;
}

export function getPresetMetricDateRange(preset: DateRangePreset): MetricDateRange {
  if (preset === "all") {
    return { preset: "all", start_date: null, end_date: null };
  }

  const today = new Date();
  const end = toIsoDateString(today);

  if (preset === "last_week") {
    const start = toIsoDateString(addDays(today, -7));
    return { preset: "last_week", start_date: start, end_date: end };
  }

  if (preset === "last_month") {
    const start = toIsoDateString(addDays(today, -30));
    return { preset: "last_month", start_date: start, end_date: end };
  }

  return { preset: "custom", start_date: null, end_date: null };
}

export function normalizeMetricDateRange(range: MetricDateRange): MetricDateRange {
  const start = range.start_date || null;
  const end = range.end_date || null;

  if (!start && !end) {
    return {
      preset: range.preset === "custom" ? "all" : range.preset,
      start_date: null,
      end_date: null,
    };
  }

  if (start && end && start > end) {
    return { ...range, start_date: end, end_date: start, preset: "custom" };
  }

  return { ...range, start_date: start, end_date: end };
}

export function formatMetricDateRangeLabel(range: MetricDateRange): string {
  if (!range.start_date && !range.end_date) return "All time";
  if (range.preset === "last_week") return "Last week";
  if (range.preset === "last_month") return "Last month";
  if (range.start_date && range.end_date) return `${range.start_date} → ${range.end_date}`;
  if (range.start_date && !range.end_date) return `From ${range.start_date}`;
  if (!range.start_date && range.end_date) return `Until ${range.end_date}`;
  return "All time";
}

/**
 * Calculate default date range based on the most recent data date from metrics.
 * Returns a date range from one week before the most recent date to that date.
 * Uses most_recent_data_date if available, otherwise falls back to last_execution_at.
 * If no valid date is found, returns "all time" preset.
 */
export function getDefaultDateRangeFromMetrics(
  metrics?: Array<{ 
    most_recent_data_date?: string | null;
    last_execution_at?: string | null;
  }>
): MetricDateRange {
  if (!metrics || metrics.length === 0) {
    return getPresetMetricDateRange("all");
  }

  // Find the most recent date across all metrics
  // Prefer most_recent_data_date, but fall back to last_execution_at
  let mostRecentDate: Date | null = null;
  
  for (const metric of metrics) {
    // Try most_recent_data_date first
    let dateStr = metric.most_recent_data_date;
    
    // Fall back to last_execution_at if most_recent_data_date is not available
    if (!dateStr && metric.last_execution_at) {
      dateStr = metric.last_execution_at;
    }
    
    if (dateStr) {
      const date = new Date(dateStr);
      if (!isNaN(date.getTime())) {
        if (!mostRecentDate || date > mostRecentDate) {
          mostRecentDate = date;
        }
      }
    }
  }

  // If no valid date found, default to "all time"
  if (!mostRecentDate) {
    return getPresetMetricDateRange("all");
  }

  // Calculate one week before the most recent date
  const startDate = addDays(mostRecentDate, -7);
  const endDate = mostRecentDate;

  return {
    preset: "custom",
    start_date: toIsoDateString(startDate),
    end_date: toIsoDateString(endDate),
  };
}



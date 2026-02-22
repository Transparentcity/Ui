/**
 * Maps TransparentCity Platform API anomaly shape to CRM Anomaly shape.
 * Used when the UI fetches anomalies from the Platform API instead of direct DB.
 */

import type { Anomaly } from "@/lib/types"

/**
 * Permissive input type that accepts anomaly data from any API source
 * (authenticated or public endpoints).
 */
export interface AnomalyInput {
  id?: number | null;
  run_id?: number | null;
  metric_id: number;
  object_id?: string | null;
  object_name?: string | null;
  metric_name?: string | null;
  period_type: string;
  period_date?: string | null;
  group_field?: string | null;
  group_value?: string | null;
  district?: number | null;
  recent_mean?: number | null;
  comparison_mean?: number | null;
  stddev?: number | null;
  difference?: number | null;
  pct_change?: number | null;
  is_anomaly: boolean;
  chart_payload?: Record<string, any> | null;
  item_noun?: string | null;
  city_name?: string | null;
  greendirection?: string | null;
  created_at?: string | null;
  comparison_window?: { label?: string; size?: number; match_weekday?: boolean } | null;
}

/**
 * Derive district_label and is_citywide from Platform's district number.
 * Platform uses district (0 = citywide, 1-11 = district number).
 */
export function districtToLabel(district: number): { district_label: string; is_citywide: boolean } {
  const is_citywide = district === 0
  const district_label = is_citywide ? "Citywide" : `District ${district}`
  return { district_label, is_citywide }
}

/**
 * Calculate severity based on percentage change magnitude.
 * Higher magnitude = more severe anomaly.
 */
function calculateSeverity(pctChange: number | null | undefined): "critical" | "high" | "medium" | "low" {
  if (pctChange == null) return "medium"
  const magnitude = Math.abs(pctChange)
  if (magnitude >= 80) return "critical"
  if (magnitude >= 50) return "high"
  if (magnitude >= 25) return "medium"
  return "low"
}

/**
 * Format a number for display (round to reasonable precision).
 */
function formatNumber(n: number | null | undefined): string {
  if (n == null) return "N/A"
  if (Math.abs(n) >= 1000) return n.toLocaleString(undefined, { maximumFractionDigits: 0 })
  if (Math.abs(n) >= 10) return n.toFixed(1)
  return n.toFixed(2)
}

/**
 * Get period label from period_type.
 */
function getPeriodLabel(periodType: string | undefined): string {
  switch (periodType) {
    case "week": return "WEEKLY"
    case "month": return "MONTHLY"
    case "day": return "DAILY"
    case "year": return "YEARLY"
    default: return periodType?.toUpperCase() ?? "UNKNOWN"
  }
}

/**
 * Get the most recent period date from chart_payload.
 */
function getRecentPeriodDate(chartPayload: any): string | undefined {
  if (!chartPayload?.dates || !Array.isArray(chartPayload.dates) || chartPayload.dates.length === 0) {
    return undefined
  }
  return chartPayload.dates[chartPayload.dates.length - 1]
}

/**
 * Build a description string showing Recent vs Avg comparison.
 * Format: "This week: 264 requests vs 12-week avg of 133"
 */
function buildDescription(
  recentMean: number | null | undefined,
  comparisonMean: number | null | undefined,
  pctChange: number | null | undefined,
  periodType: string | undefined,
  itemNoun: string | null | undefined,
  comparisonWindow?: { size?: number } | null
): string {
  const unit = itemNoun ?? ""
  
  // Build readable period labels
  const windowSize = comparisonWindow?.size || 12
  const periodUnit = periodType === 'month' ? 'month' : 'week'
  const thisPeriod = periodType === 'month' ? 'This month' : 'This week'
  
  if (recentMean != null && comparisonMean != null) {
    const unitStr = unit ? ` ${unit}` : ''
    return `${thisPeriod}: ${formatNumber(recentMean)}${unitStr} vs ${windowSize}-${periodUnit} avg of ${formatNumber(comparisonMean)}`
  }
  
  if (pctChange != null) {
    const periodLabel = getPeriodLabel(periodType)
    return `${periodLabel}: ${pctChange > 0 ? "+" : ""}${pctChange.toFixed(1)}% change`
  }
  
  const periodLabel = getPeriodLabel(periodType)
  return `${periodLabel} anomaly detected`
}

/**
 * Build a stable, unique fingerprint for an anomaly.
 *
 * The API `id` field is NOT unique across anomalies (multiple anomalies can
 * share the same metric_id/run_id). We combine all identifying fields so
 * each anomaly gets a distinct key for React keys, ignore-lists, etc.
 *
 * FORMAT (v2): metric_id|period_type|district|group_field|group_value|period_date
 *
 * Do NOT change this format without also bumping the localStorage version
 * in anomalies-manager.tsx (IGNORED_ANOMALIES_VERSION).
 */
function anomalyFingerprint(api: AnomalyInput): string {
  return [
    api.metric_id,
    api.period_type ?? "",
    api.district ?? 0,
    api.group_field ?? "",
    api.group_value ?? "",
    api.period_date ?? "",
  ].join("|")
}

/**
 * Map a single Platform API AnomalyResult to CRM Anomaly shape.
 * Includes extra fields used by generate-emails (recent_mean, comparison_mean, metric_category).
 * 
 * NOTE: This creates CRM metadata structure but doesn't persist it to DB.
 * The crm_anomaly_metadata table should be populated separately via CRM actions.
 * 
 * Accepts both authenticated (AnomalyResult) and public (PublicAnomalyResult) API responses.
 */
export function mapApiAnomalyToCrm(api: AnomalyInput, uniqueId: string): Anomaly & {
  recent_mean?: number | null
  comparison_mean?: number | null
  metric_category?: string
  metric_name?: string
  data_source?: string
} {
  const { district_label, is_citywide } = districtToLabel(api.district ?? 0)
  const metricName = api.metric_name ?? api.object_name ?? undefined
  const severity = calculateSeverity(api.pct_change)
  const recentPeriodDate = getRecentPeriodDate(api.chart_payload)
  
  // Build a searchable title that includes the metric name and key info
  const titleParts: string[] = []
  if (metricName) titleParts.push(metricName)
  if (api.group_value) titleParts.push(`(${api.group_value})`)
  const title = titleParts.length > 0 ? titleParts.join(" ") : `Anomaly ${api.metric_id}`
  
  // Build description with comparison stats
  const description = buildDescription(
    api.recent_mean,
    api.comparison_mean,
    api.pct_change,
    api.period_type,
    api.item_noun,
    api.comparison_window
  )
  
  // Build CRM metadata object (not yet persisted to DB)
  const crm_metadata = {
    id: '', // Will be assigned by DB when persisted
    anomaly_id: api.id ?? 0,
    district_label,
    is_citywide,
    severity,
    crm_status: 'new' as const,
    notes: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }
  
  return {
    id: uniqueId,
    title,
    description,
    district: api.district ?? null,
    metric_id: api.metric_id,
    period_type: api.period_type,
    group_field: api.group_field ?? undefined,
    group_value: api.group_value ?? undefined,
    pct_change: api.pct_change ?? undefined,
    is_anomaly: api.is_anomaly,
    chart_payload: api.chart_payload ?? undefined,
    created_at: api.created_at ?? new Date().toISOString(),
    status: "new",
    anomaly_keywords: [],
    // CRM metadata
    crm_metadata,
    // Convenience accessors (for backward compatibility)
    district_label,
    is_citywide,
    severity,
    crm_status: 'new',
    // Extra fields for generate-emails
    recent_mean: api.recent_mean ?? null,
    comparison_mean: api.comparison_mean ?? null,
    metric_category: api.greendirection === "down" ? "negative" : api.greendirection === "up" ? "positive" : "general",
    metric_name: metricName,
    data_source: api.city_name ?? undefined,
    // Time period fields for emails
    period_date: (api as any).period_date ?? undefined,
    comparison_window: (api as any).comparison_window ?? undefined,
  }
}

/**
 * Map list of Platform API results to CRM Anomaly array.
 * Accepts both authenticated and public API responses.
 *
 * DEDUPLICATES: If the API returns two rows with the same fingerprint
 * we keep only the first one. This prevents duplicate React keys and
 * double-counted ignore toggles.
 */
export function mapApiAnomaliesToCrm(apiList: AnomalyInput[]): Anomaly[] {
  const seen = new Set<string>()
  const results: Anomaly[] = []

  for (const api of apiList) {
    const fp = anomalyFingerprint(api)
    if (seen.has(fp)) continue   // skip true duplicates
    seen.add(fp)
    results.push(mapApiAnomalyToCrm(api, fp))
  }

  return results
}

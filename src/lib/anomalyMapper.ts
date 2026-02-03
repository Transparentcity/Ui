/**
 * Maps TransparentCity Platform API anomaly shape to CRM Anomaly shape.
 * Used when the UI fetches anomalies from the Platform API instead of direct DB.
 */

import type { AnomalyResult } from "@/lib/apiClient"
import type { Anomaly } from "@/lib/types"

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
 */
function buildDescription(
  recentMean: number | null | undefined,
  comparisonMean: number | null | undefined,
  pctChange: number | null | undefined,
  periodType: string | undefined,
  itemNoun: string | null | undefined
): string {
  const periodLabel = getPeriodLabel(periodType)
  const unit = itemNoun ?? "units"
  
  if (recentMean != null && comparisonMean != null) {
    const changeDir = (pctChange ?? 0) > 0 ? "↑" : "↓"
    const pctStr = pctChange != null ? `${pctChange > 0 ? "+" : ""}${pctChange.toFixed(1)}%` : ""
    return `${periodLabel}: Recent: ${formatNumber(recentMean)} vs Avg of 12: ${formatNumber(comparisonMean)} ${unit} (${changeDir} ${pctStr})`
  }
  
  if (pctChange != null) {
    return `${periodLabel}: ${pctChange > 0 ? "+" : ""}${pctChange.toFixed(1)}% change`
  }
  
  return `${periodLabel} anomaly detected`
}

/**
 * Map a single Platform API AnomalyResult to CRM Anomaly shape.
 * Includes extra fields used by generate-emails (recent_mean, comparison_mean, metric_category).
 */
export function mapApiAnomalyToCrm(api: AnomalyResult): Anomaly & {
  recent_mean?: number | null
  comparison_mean?: number | null
  metric_category?: string
  metric_name?: string
  severity?: string
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
  const title = titleParts.length > 0 ? titleParts.join(" ") : `Anomaly #${api.id}`
  
  // Build description with comparison stats
  const description = buildDescription(
    api.recent_mean,
    api.comparison_mean,
    api.pct_change,
    api.period_type,
    api.item_noun
  )
  
  return {
    id: api.id ?? 0,
    title,
    description,
    district: api.district ?? null,
    district_label,
    is_citywide,
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
    recent_mean: api.recent_mean ?? null,
    comparison_mean: api.comparison_mean ?? null,
    metric_category: api.greendirection === "down" ? "negative" : api.greendirection === "up" ? "positive" : "general",
    metric_name: metricName,
    severity,
    data_source: api.city_name ?? undefined,
  }
}

/**
 * Map list of Platform API results to CRM Anomaly array.
 */
export function mapApiAnomaliesToCrm(apiList: AnomalyResult[]): Anomaly[] {
  return apiList.map(mapApiAnomalyToCrm)
}

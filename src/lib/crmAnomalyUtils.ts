import type { Anomaly } from "@/lib/types"

export interface CrmEmailAnomaly extends Anomaly {
  metric_name?: string
  period_date?: string
  recent_mean?: number | null
  comparison_mean?: number | null
  comparison_window?: {
    label?: string
    size?: number
    match_weekday?: boolean
  } | null
  metric_category?: string
}

/**
 * Keep only fields needed by send-queue/generation actions.
 * This reduces payload size and avoids duplicate mapping code.
 */
export function toSlimEmailAnomaly(anomaly: CrmEmailAnomaly): CrmEmailAnomaly {
  return {
    id: anomaly.id,
    anomaly_id: anomaly.anomaly_id,
    fingerprint: anomaly.fingerprint,
    title: anomaly.title,
    description: anomaly.description,
    district: anomaly.district,
    district_label: anomaly.district_label,
    is_citywide: anomaly.is_citywide,
    metric_id: anomaly.metric_id,
    metric_name: anomaly.metric_name,
    pct_change: anomaly.pct_change,
    severity: anomaly.severity,
    period_type: anomaly.period_type,
    period_date: anomaly.period_date,
    group_field: anomaly.group_field,
    group_value: anomaly.group_value,
    recent_mean: anomaly.recent_mean,
    comparison_mean: anomaly.comparison_mean,
    comparison_window: anomaly.comparison_window,
    metric_category: anomaly.metric_category,
    is_anomaly: anomaly.is_anomaly,
    created_at: anomaly.created_at,
  }
}

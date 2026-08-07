import { request } from "./request";

// Anomaly Detection API
export interface WindowConfig {
  label: string;
  size: number;
  match_weekday?: boolean;
}

export interface RunAnomalyRequest {
  metric_id: number;
  period_type?: string;
  district?: number;
  group_field?: string | null;
  threshold_stddev?: number;
  min_comparison_points?: number;
  recent_window?: WindowConfig | null;
  comparison_window?: WindowConfig | null;
  use_time_series_cache?: boolean;
}

export interface AnomalyResult {
  id?: number | null;
  run_id?: number | null;
  metric_id: number;
  object_id: string;
  object_name?: string | null;
  metric_name?: string | null;
  period_type: string;
  group_field?: string | null;
  group_value?: string | null;
  district: number;
  recent_mean?: number | null;
  comparison_mean?: number | null;
  stddev?: number | null;
  difference?: number | null;
  pct_change?: number | null;
  is_anomaly: boolean;
  run_is_active?: boolean;
  chart_payload?: Record<string, any> | null;
  item_noun?: string | null;
  city_name?: string | null;
  greendirection?: string | null;  // "up" or "down" - determines if increase is good or bad
  created_at?: string | null;
}

export interface RunAnomalyResponse {
  run_id: number;
  count: number;
  results: AnomalyResult[];
}

export interface ListAnomaliesResponse {
  results: AnomalyResult[];
  count: number;
}

export function runAnomalyDetection(
  payload: RunAnomalyRequest,
  token: string
): Promise<RunAnomalyResponse> {
  return request<RunAnomalyResponse>("/api/anomalies/run", "POST", payload, token);
}

export function listAnomalies(
  token: string,
  options?: {
    metric_id?: number;
    is_anomaly?: boolean | null;
    period_type?: string;
    limit?: number;
    city_id?: number;
    district?: number | null;
    period_date?: string | null;
    group_field?: string | null;
    group_value?: string | null;
  }
): Promise<ListAnomaliesResponse> {
  const params = new URLSearchParams();
  if (options?.city_id) params.append("city_id", options.city_id.toString());
  if (options?.metric_id) params.append("metric_id", options.metric_id.toString());
  // Only append is_anomaly if it's explicitly true or false (not null/undefined)
  // null means "all results" and should not be sent as a parameter
  if (options?.is_anomaly === true || options?.is_anomaly === false) {
    params.append("is_anomaly", options.is_anomaly.toString());
  }
  if (options?.period_type) params.append("period_type", options.period_type);
  if (options?.limit) params.append("limit", options.limit.toString());
  if (options?.district !== undefined && options?.district !== null) {
    params.append("district", options.district.toString());
  }
  if (options?.period_date) params.append("period_date", options.period_date);
  if (options?.group_field) params.append("group_field", options.group_field);
  if (options?.group_value) params.append("group_value", options.group_value);

  const query = params.toString();
  const path = `/api/anomalies${query ? `?${query}` : ""}`;
  return request<ListAnomaliesResponse>(path, "GET", undefined, token);
}

// Available periods for anomaly filtering
export interface AvailablePeriod {
  period_date: string;
  period_label: string;
  run_count: number;
  result_count: number;
  anomaly_count: number;
}

export interface AvailablePeriodsResponse {
  periods: AvailablePeriod[];
  count: number;
}

export function getAvailablePeriods(
  token: string,
  options: {
    period_type: string;
    city_id?: number;
    district?: number | null;
    limit?: number;
  }
): Promise<AvailablePeriodsResponse> {
  const params = new URLSearchParams();
  params.append("period_type", options.period_type);
  if (options.city_id) params.append("city_id", options.city_id.toString());
  if (options.district !== undefined && options.district !== null) {
    params.append("district", options.district.toString());
  }
  if (options.limit) params.append("limit", options.limit.toString());
  
  const query = params.toString();
  const path = `/api/anomalies/periods?${query}`;
  return request<AvailablePeriodsResponse>(path, "GET", undefined, token);
}

export function getAnomalyRun(runId: number, token: string): Promise<Record<string, unknown>> {
  return request<Record<string, unknown>>(`/api/anomalies/run/${runId}`, "GET", undefined, token);
}

export function getAnomalyResult(resultId: number, token?: string): Promise<AnomalyResult> {
  // Use public endpoint if no token provided (for logged-out users)
  const path = token 
    ? `/api/anomalies/result/${resultId}`
    : `/api/anomalies/public/result/${resultId}`;
  return request<AnomalyResult>(path, "GET", undefined, token);
}

// ============================================================================

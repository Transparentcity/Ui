import { request } from "./request";
import type { CityDetail, MetricRecordCounts } from "./cities";

// Metrics Admin API
export interface AdminMetricSummary {
  total_metrics: number;
  active_metrics: number;
  completed_metrics: number;
  failed_metrics: number;
  never_executed: number;
  total_categories: number;
}

export interface AdminMetricCategory {
  name: string;
  count: number;
}

export interface AdminMetricType {
  name: string;
  count: number;
}

export interface AdminMetricCity {
  id: number;
  name: string;
  state?: string | null;
  metric_count: number;
  display_name: string;
}

export interface MetricFreshnessSummary {
  update_frequency?: string | null;
  lag_days?: number | null;
  most_recent_data_date?: string | null;
  is_stale?: boolean | null;
  last_validation_date?: string | null;
  validation_confidence?: number | null;
}

export interface DataFreshnessMetadata {
  most_recent_data_date?: string;
  earliest_data_date?: string;
  date_grouping_level?: 'day' | 'month' | 'quarter' | 'year' | 'fiscal_year';
  detected_update_frequency?: 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'yearly' | 'irregular' | 'every_2_3_days' | 'biweekly';
  lag_days?: number;
  update_pattern?: 'regular' | 'irregular' | 'batch';
  last_validation_date?: string;
  validation_confidence?: number;
  sample_periods_analyzed?: number;
  gaps_detected?: Array<{
    start: string;
    end: string;
    gap_days: number;
  }>;
  date_range_analysis?: {
    total_days_covered: number;
    data_points_count: number;
    coverage_percentage: number;
  };
}

export type { MetricRecordCounts } from "./cities";

export interface AdminMetricListItem {
  id: number;
  metric_name: string;
  metric_key: string;
  category: string;
  subcategory?: string | null;
  is_active: boolean;
  last_execution_at?: string | null;
  last_execution_status?: string | null;
  record_counts?: MetricRecordCounts | null;
  metric_type?: string | null;
  data_source_type?: string | null;
  city_id?: number | null;
  city_name?: string | null;
  map_query?: string | null;
  template_id?: number | null;
  freshness?: MetricFreshnessSummary | null;
  most_recent_data_date?: string | null;
  earliest_data_date?: string | null;
}

export interface AdminMetricDetail {
  id: number;
  metric_name: string;
  metric_key: string;
  category: string;
  subcategory?: string | null;
  endpoint?: string | null;
  summary?: string | null;
  definition?: string | null;
  data_sf_url?: string | null;
  dataset_title?: string | null;
  dataset_category?: string | null;
  dataset_name?: string | null;  // Friendly name from datasets table
  show_on_dash: boolean;
  item_noun?: string;
  greendirection?: string;
  is_active: boolean;
  metric_type?: string | null;
  data_source_type?: string | null;
  source_url?: string | null;
  template_id?: number | null;
  metric_prompt?: string | null;
  structuring_notes?: Record<string, any> | null;
  metadata?: Record<string, any> | null;
  location_fields?: any[] | null;
  category_fields?: any[] | null;
  map_query?: string | null;
  map_filters?: Record<string, any> | null;
  map_config?: Record<string, any> | null;
  last_execution_at?: string | null;
  last_execution_status?: string | null;
  last_execution_error?: string | null;
  last_execution_job_id?: string | null;
  execution_count?: number | null;
  created_at?: string | null;
  updated_at?: string | null;
  city_name?: string | null;
  data_freshness_metadata?: DataFreshnessMetadata | null;
  most_recent_data_date?: string | null;
  earliest_data_date?: string | null;
}

export interface MapCacheInvalidateResponse {
  metric_id: number;
  deleted_count: number;
  period_type?: string | null;
  district?: number | null;
}

export interface ExecuteAdminMetricRequest {
  period_type?: string;
  start_date?: string | null;
  end_date?: string | null;
  districts?: number[] | null;
}

export interface ExecuteAdminMetricResponse {
  job_id: string;
  metric_id: number;
  status: string;
  message: string;
}

export interface CreateAdminMetricRequest {
  metric_name: string;
  metric_key: string;
  category: string;
  subcategory?: string | null;
  summary?: string | null;
  definition?: string | null;
  data_source_type?: string;
  endpoint?: string | null;
  source_url?: string | null;
  date_field: string;
  aggregation_type?: string;
  aggregation_field?: string | null;
  date_trunc_type?: string;
  where_conditions?: string[];
  supports_districts?: boolean;
  item_noun?: string;
  greendirection?: string;
  show_on_dash?: boolean;
  is_active?: boolean;
}

export interface UpdateAdminMetricRequest {
  metric_name?: string | null;
  category?: string | null;
  subcategory?: string | null;
  summary?: string | null;
  definition?: string | null;
  is_active?: boolean | null;
  show_on_dash?: boolean | null;
  greendirection?: string | null;
  item_noun?: string | null;
  template_id?: number | null;
  endpoint?: string | null;
  map_query?: string | null;
  map_filters?: Record<string, any> | null;
  map_config?: Record<string, any> | null;
  location_fields?: any[] | null;
  category_fields?: any[] | null;
}

export interface AdminMetricWriteResponse {
  metric_id?: number;
  metric_name?: string;
  metric_key?: string;
  deleted_metric_id?: number;
  deleted_metric_name?: string;
  deleted_metric_key?: string;
  message: string;
}

export interface AdminTimeSeriesSummary {
  chart_id: number;
  period_type: string;
  district: number;
  chart_title?: string | null;
  data_point_count?: number | null;
  created_at: string;
  is_active: boolean;
  group_field?: string | null;  // Add group_field to filter out multi-series charts
}

export interface AdminMetricTimeSeries {
  metric_id: number;
  metric_name: string;
  time_series: AdminTimeSeriesSummary[];
  count: number;
}

export interface AdminMetricTimeSeriesDetailPoint {
  time_period: string;
  numeric_value: number;
  group_value?: string | null;
}

export interface AdminMetricTimeSeriesDetail {
  chart_id?: number;
  count: number;
  metadata?: Record<string, any>;
  data: AdminMetricTimeSeriesDetailPoint[];
}

export function getAdminMetricsSummary(token: string): Promise<AdminMetricSummary> {
  return request<AdminMetricSummary>("/api/admin/metrics/stats/summary", "GET", undefined, token);
}

export function listAdminMetricCategories(token: string): Promise<AdminMetricCategory[]> {
  return request<{ categories: AdminMetricCategory[] }>(
    "/api/admin/metrics/categories/list",
    "GET",
    undefined,
    token
  ).then((r) => r.categories);
}

export function listAdminMetricTypes(token: string): Promise<AdminMetricType[]> {
  return request<{ types: AdminMetricType[] }>(
    "/api/admin/metrics/types/list",
    "GET",
    undefined,
    token
  ).then((r) => r.types);
}

export function listAdminMetricCities(token: string): Promise<AdminMetricCity[]> {
  return request<{ cities: AdminMetricCity[] }>(
    "/api/admin/metrics/cities/list",
    "GET",
    undefined,
    token
  ).then((r) => r.cities);
}

export function listAdminMetrics(
  token: string,
  options?: {
    limit?: number;
    search?: string;
    category?: string;
    metric_type?: string;
    is_active?: boolean;
    city_id?: number;
    force_refresh?: boolean;
  }
): Promise<AdminMetricListItem[]> {
  const params = new URLSearchParams();
  params.append("limit", (options?.limit || 100).toString());
  if (options?.search) params.append("search", options.search);
  if (options?.category) params.append("category", options.category);
  if (options?.metric_type) params.append("metric_type", options.metric_type);
  if (options?.is_active !== undefined) params.append("is_active", options.is_active.toString());
  if (options?.city_id !== undefined) params.append("city_id", options.city_id.toString());
  if (options?.force_refresh) params.append("_t", Date.now().toString());

  const query = params.toString();
  // Use a trailing slash so FastAPI doesn't issue a 307 redirect that drops
  // the Authorization header in the Next.js proxy layer on production.
  const path = `/api/admin/metrics/${query ? `?${query}` : ""}`;
  return request<AdminMetricListItem[]>(path, "GET", undefined, token);
}

export function getAdminMetric(metricId: number, token: string): Promise<AdminMetricDetail> {
  return request<AdminMetricDetail>(`/api/admin/metrics/${metricId}`, "GET", undefined, token);
}

/** Structured notes from the AI agent's metric instantiation workflow. */
export interface StructuringNotesResponse {
  metric_id: number;
  metric_name: string | null;
  metric_key: string | null;
  last_execution_status: string | null;
  last_execution_error: string | null;
  city_name: string | null;
  template_name: string | null;
  has_structured_notes: boolean;
  structuring_notes: Record<string, any>;
  data_freshness_metadata: Record<string, any> | null;
  most_recent_data_date: string | null;
}

export function getStructuringNotes(
  metricId: number,
  token: string
): Promise<StructuringNotesResponse> {
  return request<StructuringNotesResponse>(
    `/api/admin/metrics/${metricId}/structuring-notes`,
    "GET",
    undefined,
    token
  );
}

export function getTemplateStructuringNotes(
  templateId: number,
  cityId: number,
  token: string
): Promise<StructuringNotesResponse> {
  return request<StructuringNotesResponse>(
    `/api/admin/metrics/template-structuring-notes?template_id=${templateId}&city_id=${cityId}`,
    "GET",
    undefined,
    token
  );
}

export function executeAdminMetric(
  metricId: number,
  payload: ExecuteAdminMetricRequest,
  token: string
): Promise<ExecuteAdminMetricResponse> {
  return request<ExecuteAdminMetricResponse>(
    `/api/admin/metrics/${metricId}/execute`,
    "POST",
    payload,
    token
  );
}

export function createAdminMetric(
  payload: CreateAdminMetricRequest,
  token: string
): Promise<AdminMetricWriteResponse> {
  return request<AdminMetricWriteResponse>("/api/admin/metrics/", "POST", payload, token);
}

export function updateAdminMetric(
  metricId: number,
  payload: UpdateAdminMetricRequest,
  token: string
): Promise<AdminMetricWriteResponse> {
  return request<AdminMetricWriteResponse>(`/api/admin/metrics/${metricId}`, "PUT", payload, token);
}

export function deleteAdminMetric(metricId: number, token: string): Promise<AdminMetricWriteResponse> {
  return request<AdminMetricWriteResponse>(`/api/admin/metrics/${metricId}`, "DELETE", undefined, token);
}

export interface PurgeMetricDataResponse {
  metric_id: number;
  metric_name: string;
  deleted_time_series_data: number;
  deleted_time_series_metadata: number;
  deleted_saved_maps: number;
  deleted_anomaly_results: number;
  deleted_anomaly_runs: number;
  deleted_completeness_records: number;
  deleted_stability_patterns: number;
  deleted_comparisons: number;
  message: string;
}

export function purgeAdminMetricData(metricId: number, token: string): Promise<PurgeMetricDataResponse> {
  return request<PurgeMetricDataResponse>(`/api/admin/metrics/${metricId}/purge`, "DELETE", undefined, token);
}

export interface ClearCityMetricDataResponse {
  status: string;
  scope: "all" | "city";
  city_id: number | null;
  total_deleted: number;
  deleted: {
    feed_stories: number;
    research_items: number;
    research_reports: number;
    precomputed_metric_comparisons: number;
    anomaly_results: number;
    anomaly_runs: number;
    time_series_data: number;
    time_series_metadata: number;
    saved_maps: number;
    period_completeness: number;
    metric_stability_patterns: number;
  };
  message: string;
}

export function clearCityMetricData(
  cityId: number | null,
  token: string
): Promise<ClearCityMetricDataResponse> {
  return request<ClearCityMetricDataResponse>("/api/admin/data/clear-city-metric-data", "POST", { city_id: cityId }, token);
}

export function invalidateAdminMetricMapCache(
  metricId: number,
  options: { period_type?: string; district?: number | null } | undefined,
  token: string
): Promise<MapCacheInvalidateResponse> {
  const params = new URLSearchParams();
  if (options?.period_type) {
    params.append("period_type", options.period_type);
  }
  if (options?.district !== undefined && options?.district !== null) {
    params.append("district", String(options.district));
  }
  const query = params.toString();
  const path = `/api/admin/metrics/${metricId}/maps/cache${query ? `?${query}` : ""}`;
  return request<MapCacheInvalidateResponse>(path, "DELETE", undefined, token);
}

export function getAdminMetricTimeSeries(
  metricId: number, 
  token: string,
  options?: {
    district?: number | null;
    period_type?: string;
    exclude_group_fields?: boolean;
  }
): Promise<AdminMetricTimeSeries> {
  const params = new URLSearchParams();
  if (options?.district !== undefined && options?.district !== null) {
    params.append("district", options.district.toString());
  }
  if (options?.period_type) {
    params.append("period_type", options.period_type);
  }
  if (options?.exclude_group_fields !== undefined) {
    params.append("exclude_group_fields", options.exclude_group_fields.toString());
  }
  const query = params.toString();
  return request<AdminMetricTimeSeries>(
    `/api/admin/metrics/${metricId}/time-series${query ? `?${query}` : ""}`, 
    "GET", 
    undefined, 
    token
  );
}

export function getAdminMetricTimeSeriesDetail(
  metricId: number,
  chartId: number,
  token: string
): Promise<AdminMetricTimeSeriesDetail> {
  return request<AdminMetricTimeSeriesDetail>(
    `/api/admin/metrics/${metricId}/time-series/${chartId}`,
    "GET",
    undefined,
    token
  );
}

export function getAdminMetricCityStructure(metricId: number, token: string): Promise<any> {
  return request<any>(`/api/admin/metrics/${metricId}/city-structure`, "GET", undefined, token);
}

// Comparison types and interfaces
export type ComparisonType = "ytd" | "mtd" | "mtd_prior_year";

/** For derived metrics: A/B=C breakdown for transparency */
export interface CalculationBreakdown {
  formula: string;
  display_unit: string;
  numerator_metric_id: number;
  denominator_metric_id: number;
  numerator_name: string;
  denominator_name: string;
  current_period: {
    numerator_value: number | null;
    denominator_value: number | null;
    result: number | null;
  };
  comparison_period: {
    numerator_value: number | null;
    denominator_value: number | null;
    result: number | null;
  };
}

export interface ComparisonResponse {
  metric_id: number;
  district: number | null;
  comparison_type: ComparisonType;
  current_period_value: number | null;
  current_period_start: string;
  current_period_end: string;
  comparison_period_value: number | null;
  comparison_period_start: string;
  comparison_period_end: string;
  period_type: string;
  computed_at: string;
  is_precomputed: boolean;
  calculation_breakdown?: CalculationBreakdown | null;
}

export interface ComparisonsResponse {
  metric_id: number;
  district: number | null;
  comparisons: Record<ComparisonType, ComparisonResponse>;
}

export interface BatchComparisonsRequest {
  metric_ids: number[];
  district?: number | null;
  comparison_types?: ComparisonType[];
}

export interface BatchComparisonsResponse {
  [metricId: number]: Record<ComparisonType, ComparisonResponse>;
}

// Get single comparison for a metric
export function getMetricComparison(
  metricId: number,
  comparisonType: ComparisonType,
  district: number | null | undefined,
  token: string
): Promise<ComparisonResponse> {
  const params = district !== undefined && district !== null ? `?district=${district}` : "";
  return request<ComparisonResponse>(
    `/api/admin/metrics/${metricId}/comparison/${comparisonType}${params}`,
    "GET",
    undefined,
    token
  );
}

// Get all comparisons for a metric
export function getMetricComparisons(
  metricId: number,
  district: number | null | undefined,
  comparisonTypes: ComparisonType[] | undefined,
  token: string
): Promise<ComparisonsResponse> {
  const params = new URLSearchParams();
  if (district !== undefined && district !== null) {
    params.append("district", district.toString());
  }
  if (comparisonTypes && comparisonTypes.length > 0) {
    params.append("comparison_types", comparisonTypes.join(","));
  }
  const queryString = params.toString();
  const url = `/api/admin/metrics/${metricId}/comparisons${queryString ? `?${queryString}` : ""}`;
  return request<ComparisonsResponse>(url, "GET", undefined, token);
}

// Get comparisons for multiple metrics in batch
export function getBatchComparisons(
  batchRequest: BatchComparisonsRequest,
  token: string
): Promise<BatchComparisonsResponse> {
  return request<BatchComparisonsResponse>(
    "/api/admin/metrics/comparisons/batch",
    "POST",
    batchRequest,
    token
  );
}

export interface ValidateFreshnessRequest {
  days_to_analyze?: number;
  force_refresh?: boolean;
}

export interface ValidateFreshnessResponse {
  message: string;
  metric_id: number;
  validation_passed: boolean;
  warnings: string[];
  errors: string[];
  freshness_metadata?: DataFreshnessMetadata;
  details?: Record<string, any>;
  skipped?: boolean;
  last_validation_date?: string;
}

export function validateMetricFreshness(
  metricId: number,
  payload: ValidateFreshnessRequest,
  token: string
): Promise<ValidateFreshnessResponse> {
  return request<ValidateFreshnessResponse>(
    `/api/admin/metrics/${metricId}/validate-freshness`,
    "POST",
    payload,
    token
  );
}

export interface FlushCompletenessResponse {
  metric_id: number;
  deleted_records: number;
  deleted_patterns: number;
  message: string;
}

export function flushMetricCompleteness(
  metricId: number,
  token: string
): Promise<FlushCompletenessResponse> {
  return request<FlushCompletenessResponse>(
    `/api/admin/metrics/${metricId}/completeness`,
    "DELETE",
    undefined,
    token
  );
}

export interface MetricsByFrequencyResponse {
  grouped_by_frequency: Record<string, Array<{
    id: number;
    metric_name: string;
    metric_key: string;
    category: string;
    most_recent_data_date?: string | null;
    lag_days?: number | null;
    date_grouping_level?: string | null;
    last_execution_at?: string | null;
    is_active: boolean;
  }>>;
  total_metrics: number;
  frequencies: string[];
  summary: {
    stale_metrics: number;
    metrics_needing_validation: number;
  };
}

export function listMetricsByUpdateFrequency(
  token: string,
  options?: {
    update_frequency?: string;
    max_lag_days?: number;
    include_stale?: boolean;
    min_confidence?: number;
  }
): Promise<MetricsByFrequencyResponse> {
  const params = new URLSearchParams();
  if (options?.update_frequency) params.append("update_frequency", options.update_frequency);
  if (options?.max_lag_days !== undefined) params.append("max_lag_days", options.max_lag_days.toString());
  if (options?.include_stale) params.append("include_stale", "true");
  if (options?.min_confidence !== undefined) params.append("min_confidence", options.min_confidence.toString());
  
  const query = params.toString();
  const path = `/api/admin/metrics/by-update-frequency${query ? `?${query}` : ""}`;
  return request<MetricsByFrequencyResponse>(path, "GET", undefined, token);
}

// Map Data API
export interface MapDataPoint {
  lat: number;
  lon: number;
  [key: string]: any; // Additional properties from the data
}

export interface MapData {
  id?: number;
  title: string;
  type?: string;
  location_data: MapDataPoint[] | string; // JSON string or array
  metadata?: string | Record<string, any>; // JSON string or object
  created_at?: string;
  published_url?: string;
  chart_id?: number;
  metric_id: string | number;
  active?: boolean;
  /** Backend map config: default_view, available_views, aggregations, center (plan: map loading optimization). */
  map_config?: Record<string, any>;
}

export interface GetMapDataRequest {
  metric_id: number;
  start_date?: string | null;
  end_date?: string | null;
  districts?: number[] | null;
}

export interface GetMapDataResponse {
  status: string;
  map_data?: MapData;
  location_data?: MapDataPoint[];
  error?: string;
}

export function getMetricMapData(
  payload: GetMapDataRequest,
  token: string
): Promise<GetMapDataResponse> {
  // Build request body, only including districts if it has a value
  const body: any = {
    start_date: payload.start_date,
    end_date: payload.end_date,
  };
  
  // Only include districts if it's not null/undefined and has values
  if (payload.districts && payload.districts.length > 0) {
    body.districts = payload.districts;
  }

  return request<GetMapDataResponse>(
    `/api/admin/metrics/${payload.metric_id}/map-data`,
    "POST",
    body,
    token
  ).catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    return { status: "error", error: message };
  });
}

// Get all metrics for a city (for map view)
export function getCityMetricsForMap(
  cityId: number,
  token: string
): Promise<AdminMetricListItem[]> {
  // Use the public city metrics endpoint instead of admin endpoint
  return request<AdminMetricListItem[]>(
    `/api/cities/${cityId}/metrics?is_active=true&limit=500`,
    "GET",
    undefined,
    token
  );
}

// Get city metrics for dashboard (simpler format, faster query)
// Maps the response to match CityDetail.metrics format
// Note: The endpoint already filters by show_on_dash = TRUE internally
export function getCityMetrics(
  cityId: number,
  token: string
): Promise<CityDetail['metrics']> {
  return request<any[]>(
    `/api/cities/${cityId}/metrics?is_active=true&limit=500`,
    "GET",
    undefined,
    token
  )
    .then((metrics) => {
      // Map CityMetricListItem to CityDetail.metrics format
      return (metrics || []).map((m) => ({
        id: m.id,
        metric_name: m.metric_name,
        metric_key: m.metric_key,
        category: m.category,
        subcategory: m.subcategory,
        last_execution_status: m.last_execution_status,
        last_execution_at: m.last_execution_at,
        most_recent_data_date: m.most_recent_data_date,
        greendirection: m.greendirection, // "up" or "down" - determines if increase is good or bad
        display_unit: m.display_unit, // "percentage", "currency", etc. - for formatting values
      }));
    })
    .catch(() => []); // Return empty array on error
}

/** Metric item with show_on_dash for customize-metrics UI (all_metrics=true). */
export interface CityMetricForCustomize {
  id: number;
  metric_name: string;
  metric_key: string;
  category: string;
  subcategory?: string | null;
  show_on_dash: boolean;
}

// Get all metrics for a city with show_on_dash (for customize metrics dialog)
export function getCityMetricsForCustomize(
  cityId: number,
  token: string
): Promise<CityMetricForCustomize[]> {
  return request<CityMetricForCustomize[]>(
    `/api/cities/${cityId}/metrics?is_active=true&limit=500&all_metrics=true`,
    "GET",
    undefined,
    token
  ).then((metrics) =>
    (metrics || []).map((m) => ({
      id: m.id,
      metric_name: m.metric_name,
      metric_key: m.metric_key,
      category: m.category,
      subcategory: m.subcategory ?? null,
      show_on_dash: m.show_on_dash === true,
    }))
  );
}


// METRIC ORDERING API
// ============================================================================

export interface MetricOrderingItem {
  id?: number;
  city_id?: number;
  category_name: string;
  category_order: number;
  subcategory_name?: string | null;  // Optional subcategory override
  metric_id: number | null;
  metric_order: number;
  metric_name?: string;
}

export interface MetricOrderingResponse {
  city_id: number;
  orderings: MetricOrderingItem[];
  /** True when from GET /api/admin/me/metric-ordering and user saved their own ordering. */
  is_personal_order?: boolean;
}

export interface SaveMetricOrderingRequest {
  orderings: MetricOrderingItem[];
}

// Get metric ordering for a city
export function getCityMetricOrdering(
  cityId: number,
  token: string
): Promise<MetricOrderingResponse> {
  return request<MetricOrderingResponse>(
    `/api/cities/${cityId}/metric-ordering`,
    "GET",
    undefined,
    token
  );
}

// Save metric ordering for a city
export function saveCityMetricOrdering(
  cityId: number,
  orderings: MetricOrderingItem[],
  token: string
): Promise<{ success: boolean; message: string; count: number }> {
  return request<{ success: boolean; message: string; count: number }>(
    `/api/cities/${cityId}/metric-ordering`,
    "PUT",
    { orderings },
    token
  );
}

// Reset metric ordering for a city (removes all custom orderings)
export function resetCityMetricOrdering(
  cityId: number,
  token: string
): Promise<{ success: boolean; message: string; deleted_count: number }> {
  return request<{ success: boolean; message: string; deleted_count: number }>(
    `/api/cities/${cityId}/metric-ordering`,
    "DELETE",
    undefined,
    token
  );
}

// ============================================================================
// USER METRIC ORDERING (per-user dashboard order)
// ============================================================================

// Same shape as MetricOrderingResponse; GET /api/admin/me/metric-ordering/{city_id}
export function getUserMetricOrdering(
  cityId: number,
  token: string
): Promise<MetricOrderingResponse> {
  return request<MetricOrderingResponse>(
    `/api/admin/me/metric-ordering/${cityId}`,
    "GET",
    undefined,
    token
  );
}

export function saveUserMetricOrdering(
  cityId: number,
  orderings: MetricOrderingItem[],
  token: string
): Promise<{ success: boolean; message: string; count: number }> {
  return request<{ success: boolean; message: string; count: number }>(
    `/api/admin/me/metric-ordering/${cityId}`,
    "PUT",
    { orderings },
    token
  );
}

export function resetUserMetricOrdering(
  cityId: number,
  token: string
): Promise<{ success: boolean; message: string; deleted_count: number }> {
  return request<{ success: boolean; message: string; deleted_count: number }>(
    `/api/admin/me/metric-ordering/${cityId}`,
    "DELETE",
    undefined,
    token
  );
}


// ============================================================================
// BATCH METRIC EXECUTION API
// ============================================================================

export interface BatchExecuteMetricsRequest {
  city_id: number;
  metric_ids?: number[] | null;
  period_type?: "day" | "week" | "month" | "year" | null;
  start_date?: string | null;
  end_date?: string | null;
  max_concurrent?: number;
  schedule_key?: string | null;
}

export interface BatchExecuteMetricsResponse {
  job_id: string | null;
  message: string;
  total_metrics: number;
  city_id: number;
  city_name?: string | null;
  start_date?: string | null;
  end_date?: string | null;
}

// Execute multiple metrics for a city in batch
export function batchExecuteMetrics(
  options: BatchExecuteMetricsRequest,
  token: string
): Promise<BatchExecuteMetricsResponse> {
  return request<BatchExecuteMetricsResponse>(
    "/api/admin/metrics/batch-execute",
    "POST",
    options,
    token
  );
}

// ============================================================================
// HELPER: Get default date range for batch execution
// ============================================================================

/**
 * Get the default date range for batch metric execution.
 * Default: January 1 of 2 years ago to today.
 * Example: If today is Jan 9, 2026, returns { startDate: "2024-01-01", endDate: "2026-01-09" }
 */
export function getDefaultBatchDateRange(): { startDate: string; endDate: string } {
  const today = new Date();
  const startYear = today.getFullYear() - 2;
  const startDate = `${startYear}-01-01`;
  const endDate = today.toISOString().split("T")[0];
  return { startDate, endDate };
}

// ============================================================================
// HELPER: Get default start date for execute modal by period type
// ============================================================================

/**
 * Get the default start date (Jan 1 of N years ago) for the execute metric modal.
 * - Daily / Weekly: 2 years (e.g. Jan 1, 2024 for 2026)
 * - Monthly / YTD: 5 years
 * - Annual: 10 years
 */
export function getDefaultExecuteStartDateByPeriod(periodType: string): string {
  const year = new Date().getFullYear();
  let yearsAgo: number;
  switch (periodType) {
    case "day":
    case "week":
      yearsAgo = 2;
      break;
    case "month":
    case "ytd":
      yearsAgo = 5;
      break;
    case "year":
      yearsAgo = 10;
      break;
    default:
      yearsAgo = 2;
  }
  const startYear = year - yearsAgo;
  return `${startYear}-01-01`;
}

// ============================================================================

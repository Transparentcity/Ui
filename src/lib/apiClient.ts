import { API_BASE } from "./apiBase";

type HttpMethod = "GET" | "POST" | "PUT" | "DELETE";

// Request deduplication cache for getSavedCities
const savedCitiesCache: {
  promise: Promise<any[]> | null;
  timestamp: number;
  token: string | null;
} = {
  promise: null,
  timestamp: 0,
  token: null,
};

const SAVED_CITIES_CACHE_TTL = 5000; // 5 seconds cache

// City data cache for getCity (using any to avoid forward reference issues)
const cityDataCache: {
  [cityId: number]: {
    data: any | null;
    promise: Promise<any> | null;
    timestamp: number;
    token: string | null;
  };
} = {};

const cityStructureCache: {
  [cityId: number]: {
    data: any | null;
    promise: Promise<any> | null;
    timestamp: number;
    token: string | null;
  };
} = {};

const cityAdminCache: {
  [cityId: number]: {
    data: any | null;
    promise: Promise<any> | null;
    timestamp: number;
    token: string | null;
  };
} = {};

const CITY_DATA_CACHE_TTL = 30000; // 30 seconds cache
const CITY_STRUCTURE_CACHE_TTL = 120000; // 2 minutes cache (structure changes less frequently)
const CITY_ADMIN_CACHE_TTL = 60000; // 1 minute cache

async function request<T>(
  path: string,
  method: HttpMethod = "GET",
  body?: any,
  token?: string
): Promise<T> {
  const url = `${API_BASE}${path}`;

  const headers: HeadersInit = {
    "Accept": "application/json",
  };

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  if (body && method !== "GET") {
    headers["Content-Type"] = "application/json";
  }

  const res = await fetch(url, {
    method,
    credentials: "include",
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    const error = new Error(`API ${method} ${path} failed: ${res.status} ${text}`);
    // Attach status code to error for better error handling
    (error as any).status = res.status;
    (error as any).statusText = res.statusText;
    throw error;
  }

  return (await res.json()) as T;
}

export interface RedisStatus {
  connected: boolean;
  type: "redis" | "memory" | "unknown";
  error?: string | null;
}

export interface HealthResponse {
  status: string;
  version?: string;
  mcp_tools?: number;
  tool_groups?: number;
  redis?: RedisStatus;
  timestamp?: string;
}

export function getHealth(): Promise<HealthResponse> {
  return request<HealthResponse>("/health");
}

// City Admin API
export interface CityAdminData {
  id: number;
  name: string;
  city_name?: string;
  state?: string;
  country?: string;
  population?: number;
  main_domain?: string;
  main_portal_url?: string;
  all_portal_urls?: string[];
  is_active: boolean;
  datasets_count?: number;
  vector_db_points?: number;
  vector_db_size_mb?: number;
  last_fetch_at?: string;
  last_fetch_status?: string;
  last_fetch_error?: string;
  structure_status?: string;
  metrics?: any[];
  geographic_structures?: any[];
  governance_structures?: any[];
}

export interface CityStructureData {
  city_id?: number;
  status?: string;
  geographic_structures?: Array<{
    id?: number;
    structure_name?: string;
    structure_type?: string;
    identifier_field?: string;
    shapefile_url?: string | null;
    shapefile_storage_path?: string | null;
  }>;
  governance_structures?: any[];
  leaders?: any[];
  query_configs?: Array<{
    id?: number;
    structure_type?: string;
    structure_name?: string;
    endpoint?: string;
    query?: string;
    identifier_field?: string;
    query_output?: any[];
  }>;
  shapefiles?: any[];
  mappings?: any[];
  district_field?: string | null;
  district_fields?: string[];
}

export interface CityStatsResponse {
  city_id: number;
  city_name: string;
  state?: string | null;
  country?: string | null;
  domain?: string | null;
  total_datasets: number;
  datasets_by_category: Record<string, number>;
  last_fetch_at?: string | null;
  last_fetch_status?: string | null;
  is_active: boolean;
  vector_db: {
    point_count?: number;
    size_mb?: number;
    error?: string;
  };
}

export interface UpdateCityRequest {
  city_name?: string | null;
  state?: string | null;
  country?: string | null;
  population?: number | null;
  main_domain?: string | null;
  main_portal_url?: string | null;
  all_portal_urls?: string[];
  is_active?: boolean;
}

export interface UpdateCityStructureRequest {
  city_id: number;
  geographic_structures: any[];
  governance_structures: any[];
  leaders?: any[];
  query_configs?: any[];
  mappings?: any[];
  district_fields?: string[];
}

export interface JobResponse {
  job_id: string;
  status?: string;
}

export function getCityAdmin(cityId: number, token: string): Promise<CityAdminData> {
  const now = Date.now();
  const cacheKey = cityId;
  const cached = cityAdminCache[cacheKey];

  // Return cached data if valid
  if (
    cached?.data &&
    cached.token === token &&
    (now - cached.timestamp) < CITY_ADMIN_CACHE_TTL
  ) {
    return Promise.resolve(cached.data);
  }

  // Return existing promise if request is in flight
  if (
    cached?.promise &&
    cached.token === token &&
    (now - cached.timestamp) < CITY_ADMIN_CACHE_TTL
  ) {
    return cached.promise;
  }

  // Create new request and cache it
  const promise = request<CityAdminData>(`/api/admin/cities/${cityId}`, "GET", undefined, token)
    .then((data: CityAdminData) => {
      // Cache the result
      if (cityAdminCache[cacheKey]?.promise === promise) {
        cityAdminCache[cacheKey] = {
          data,
          promise: null,
          timestamp: now,
          token,
        };
      }
      return data;
    })
    .catch((error) => {
      // Clear cache on error to allow retry
      if (cityAdminCache[cacheKey]?.promise === promise) {
        delete cityAdminCache[cacheKey];
      }
      throw error;
    });

  // Cache the promise
  cityAdminCache[cacheKey] = {
    data: null,
    promise,
    timestamp: now,
    token,
  };

  return promise;
}

export function getCityStats(cityId: number, token: string): Promise<CityStatsResponse> {
  return request<CityStatsResponse>(
    `/api/admin/cities/${cityId}/stats`,
    "GET",
    undefined,
    token
  );
}

export function updateCity(
  cityId: number,
  data: UpdateCityRequest,
  token: string
): Promise<CityAdminData> {
  return request<CityAdminData>(`/api/admin/cities/${cityId}`, "PUT", data, token);
}

export function getCityStructure(cityId: number, token: string): Promise<CityStructureData> {
  const now = Date.now();
  const cacheKey = cityId;
  const cached = cityStructureCache[cacheKey];

  // Return cached data if valid
  if (
    cached?.data &&
    cached.token === token &&
    (now - cached.timestamp) < CITY_STRUCTURE_CACHE_TTL
  ) {
    return Promise.resolve(cached.data);
  }

  // Return existing promise if request is in flight
  if (
    cached?.promise &&
    cached.token === token &&
    (now - cached.timestamp) < CITY_STRUCTURE_CACHE_TTL
  ) {
    return cached.promise;
  }

  // Create new request and cache it
  // Try the main cities endpoint first, fallback to template-metrics endpoint
  const promise = request<CityStructureData>(
    `/api/cities/${cityId}/structure`,
    "GET",
    undefined,
    token
  ).catch(() => {
    // Fallback to template-metrics endpoint if main endpoint fails
    return request<CityStructureData>(
      `/api/template-metrics/cities/${cityId}/structure`,
      "GET",
      undefined,
      token
    );
  }).then((data: CityStructureData) => {
    // Cache the result
    if (cityStructureCache[cacheKey]?.promise === promise) {
      cityStructureCache[cacheKey] = {
        data,
        promise: null,
        timestamp: now,
        token,
      };
    }
    return data;
  }).catch((error) => {
    // Clear cache on error to allow retry
    if (cityStructureCache[cacheKey]?.promise === promise) {
      delete cityStructureCache[cacheKey];
    }
    throw error;
  });

  // Cache the promise
  cityStructureCache[cacheKey] = {
    data: null,
    promise,
    timestamp: now,
    token,
  };

  return promise;
}

export interface StructureCityMetricsRequest {
  skip_portal_discovery?: boolean;
  skip_dataset_fetching?: boolean;
  skip_structuring?: boolean;
  skip_metric_instantiation?: boolean;
}

export interface StructureCityMetricsResult {
  success: boolean;
  phases_completed: string[];
  datasets_discovered: number;
  datasets_fetched: number;
  templates_total: number;
  templates_instantiated: number;
  templates_failed: number;
  errors: string[];
  token_usage: Record<string, number>;
  estimated_cost_usd: number;
}

export function structureCityMetrics(
  cityId: number,
  params: StructureCityMetricsRequest,
  token: string
): Promise<StructureCityMetricsResult> {
  return request<StructureCityMetricsResult>(
    `/api/admin/cities/${cityId}/structure-metrics`,
    "POST",
    {
      skip_portal_discovery: params.skip_portal_discovery ?? false,
      skip_dataset_fetching: params.skip_dataset_fetching ?? false,
      skip_structuring: params.skip_structuring ?? false,
      skip_metric_instantiation: params.skip_metric_instantiation ?? false,
    },
    token
  );
}

export function updateCityStructure(
  cityId: number,
  data: UpdateCityStructureRequest,
  token: string
): Promise<CityStructureData> {
  return request<CityStructureData>(
    `/api/template-metrics/cities/${cityId}/structure`,
    "POST",
    data,
    token
  );
}

export function refreshCityUrls(cityId: number, token: string): Promise<JobResponse> {
  return request<JobResponse>(
    "/api/admin/cities/load-data",
    "POST",
    {
      city_ids: [cityId],
      fetch_urls: true,
      fetch_metadata: false,
      refresh: false,
    },
    token
  );
}

export function refreshCityMetadata(cityId: number, token: string): Promise<JobResponse> {
  return request<JobResponse>(
    "/api/admin/cities/load-data",
    "POST",
    {
      city_ids: [cityId],
      fetch_urls: false,
      fetch_metadata: true,
      refresh: false,
    },
    token
  );
}

export function restructureCity(cityId: number, model?: string, token?: string): Promise<JobResponse> {
  const body = model ? { model } : undefined;
  return request<JobResponse>(
    `/api/template-metrics/cities/${cityId}/structure/restructure`,
    "POST",
    body,
    token
  );
}

export function reloadQueryConfig(
  cityId: number,
  configId: number,
  token: string
): Promise<{ status: string; message: string; config_id: number; query_output: any[]; record_count: number; shapefile_id?: number | null }> {
  return request<{ status: string; message: string; config_id: number; query_output: any[]; record_count: number; shapefile_id?: number | null }>(
    `/api/template-metrics/cities/${cityId}/structure/query-configs/${configId}/reload`,
    "POST",
    undefined,
    token
  );
}

export interface ReloadAllGeographicResult {
  config_id: number;
  structure_name: string;
  status: string;
  record_count?: number;
  shapefile_id?: number | null;
  error?: string;
}

export function reExtractLeaders(
  cityId: number,
  token: string
): Promise<{ message: string; structures_created: any; leaders_count: number; structure: any }> {
  return request<{ message: string; structures_created: any; leaders_count: number; structure: any }>(
    `/api/template-metrics/cities/${cityId}/structure/leaders/re-extract`,
    "POST",
    undefined,
    token
  );
}

export function reloadAllGeographicQueryConfigs(
  cityId: number,
  token: string
): Promise<{ status: string; message: string; total_configs: number; reloaded: number; shapefiles_created: number; results: ReloadAllGeographicResult[] }> {
  return request<{ status: string; message: string; total_configs: number; reloaded: number; shapefiles_created: number; results: ReloadAllGeographicResult[] }>(
    `/api/template-metrics/cities/${cityId}/structure/query-configs/reload-all-geographic`,
    "POST",
    undefined,
    token
  );
}

export interface RecreateStructureFromQueryConfigsResponse {
  status: string;
  message: string;
  city_id: number;
  city_name: string;
  deleted: {
    shapefiles: number;
    leaders: number;
    geographic_structures: number;
    governance_structures: number;
    mappings: number;
  };
  geographic_reload: {
    status: string;
    message: string;
    shapefiles_created: number;
  };
  leaders_reload: {
    status: string;
    message: string;
    leaders_created: number;
  };
}

export function recreateStructureFromQueryConfigs(
  cityId: number,
  token: string
): Promise<RecreateStructureFromQueryConfigsResponse> {
  return request<RecreateStructureFromQueryConfigsResponse>(
    `/api/template-metrics/cities/${cityId}/structure/recreate-from-query-configs`,
    "POST",
    undefined,
    token
  );
}

export interface CityListItem {
  city_id: number;
  city_name: string;
  state?: string;
  country?: string;
  emoji?: string;
  population?: number | string;
  main_domain?: string;
  main_portal_url?: string;
  all_portal_urls?: string[];
  datasets_count?: number;
  last_fetch_at?: string;
  last_fetch_status?: string;
  last_fetch_error?: string;
  vector_db_points?: number | null;
  vector_db_size_mb?: number | null;
  structure_status?: string;
  is_active?: boolean;
}

export function listCities(
  token: string,
  state?: string,
  country?: string,
  is_active?: boolean
): Promise<CityListItem[]> {
  const params = new URLSearchParams();
  if (state) params.append("state", state);
  if (country) params.append("country", country);
  if (is_active !== undefined) params.append("is_active", is_active.toString());
  
  const query = params.toString();
  const path = `/api/admin/cities${query ? `?${query}` : ""}`;
  return request<CityListItem[]>(path, "GET", undefined, token);
}

export interface LoadCityDataRequest {
  city_ids: number[];
  fetch_urls?: boolean;
  fetch_metadata?: boolean;
  refresh?: boolean;
}

export interface LoadCityDataResponse {
  job_id: string;
  status: string;
  message: string;
  cities_processed: number;
  datasets_found: number;
  datasets_indexed: number;
}

export function loadCityData(
  data: LoadCityDataRequest,
  token: string
): Promise<LoadCityDataResponse> {
  return request<LoadCityDataResponse>(
    "/api/admin/cities/load-data",
    "POST",
    data,
    token
  );
}

export interface BatchAnalyzeRequest {
  city_ids: number[];
}

export function batchAnalyzeCities(
  payload: BatchAnalyzeRequest,
  token: string
): Promise<JobResponse> {
  return request<JobResponse>(
    "/api/cities/structure/batch-analyze",
    "POST",
    payload,
    token
  );
}

// User Permissions API
export interface UserPermissions {
  user_id: number;
  email: string;
  role: string;
  permissions: string[];
  is_admin: boolean;
  city_lead_city_ids?: number[];
  is_city_lead?: boolean;
}

export function getMyPermissions(token: string): Promise<UserPermissions> {
  return request<UserPermissions>("/api/admin/me/permissions", "GET", undefined, token);
}

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

export interface MetricRecordCounts {
  active_charts: number;
  inactive_charts: number;
  active_data_points: number;
  inactive_data_points: number;
  anomaly_runs: number;
  anomaly_results: number;
  saved_maps: number;
  total_active: number;
  total_inactive: number;
}

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
  const path = `/api/admin/metrics/${query ? `?${query}` : ""}`;
  return request<AdminMetricListItem[]>(path, "GET", undefined, token);
}

export function getAdminMetric(metricId: number, token: string): Promise<AdminMetricDetail> {
  return request<AdminMetricDetail>(`/api/admin/metrics/${metricId}`, "GET", undefined, token);
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

// Chat API
export interface ChatMessageRequest {
  message: string;
  session_id?: string | null;
  model_key?: string;
  tool_groups?: string[];
}

export interface ChatMessageResponse {
  response: string;
  session_id: string;
  tool_calls: any[];
  execution_time_ms: number;
  success: boolean;
}

export interface SessionSummary {
  session_id: string;
  title: string;
  model_key?: string;
  message_count: number;
  last_message_at?: string;
  created_at: string;
  is_active: boolean;
}

export interface SessionDetail {
  session_id: string;
  title: string;
  model_key?: string;
  tool_groups: string[];
  messages: any[];
  tool_calls: any[];
  intermediate_steps: any[];
  total_execution_time_ms: number;
  total_tokens_used: number;
  llm_call_count: number;
  message_count: number;
  created_at: string;
  last_message_at?: string;
}

export interface SessionStats {
  session_id: string;
  total_tokens_used: number;
  llm_call_count: number;
  total_execution_time_ms: number;
  model_key: string;
  last_message_at: string | null;
  created_at: string;
  estimated_cost_usd?: number;  // Real-time cost estimate from streaming
}

export interface ModelInfo {
  key: string;
  name: string;
  provider: string;
  context_window: number;
  input_price: number;
  output_price: number;
  is_available: boolean;
}

export interface ModelGroupInfo {
  label: string;
  emoji: string;
  models: ModelInfo[];
}

export interface TokenUsageData {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  session_total_tokens: number;
  session_prompt_tokens: number;
  session_completion_tokens: number;
  llm_call_count: number;
  estimated_cost_usd: number;
}

export interface StreamEvent {
  type: string;
  content?: string;
  tool_id?: string;
  tool_name?: string;
  arguments?: any;
  response?: any;
  success?: boolean;
  title?: string;
  // Token usage fields (present when type === "token_usage")
  token_usage?: TokenUsageData;
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
  session_total_tokens?: number;
  session_prompt_tokens?: number;
  session_completion_tokens?: number;
  llm_call_count?: number;
  estimated_cost_usd?: number;
}

export function sendChatMessage(
  payload: ChatMessageRequest,
  token: string
): Promise<ChatMessageResponse> {
  return request<ChatMessageResponse>(
    "/api/chat/message",
    "POST",
    payload,
    token
  );
}

export function createNewSession(
  model_key: string = "claude-sonnet-4.5",
  tool_groups?: string[],
  token?: string
): Promise<SessionSummary> {
  const params = new URLSearchParams();
  params.append("model_key", model_key);
  if (tool_groups) {
    tool_groups.forEach((g) => params.append("tool_groups", g));
  }
  const query = params.toString();
  const path = `/api/chat/new${query ? `?${query}` : ""}`;
  return request<SessionSummary>(path, "POST", undefined, token);
}

export function listSessions(
  limit: number = 20,
  offset: number = 0,
  token: string
): Promise<SessionSummary[]> {
  const params = new URLSearchParams();
  params.append("limit", limit.toString());
  params.append("offset", offset.toString());
  const query = params.toString();
  const path = `/api/chat/sessions${query ? `?${query}` : ""}`;
  return request<SessionSummary[]>(path, "GET", undefined, token);
}

export function listJobSessions(
  limit: number = 50,
  offset: number = 0,
  token: string
): Promise<SessionSummary[]> {
  const params = new URLSearchParams();
  params.append("limit", limit.toString());
  params.append("offset", offset.toString());
  const query = params.toString();
  const path = `/api/chat/sessions/jobs${query ? `?${query}` : ""}`;
  return request<SessionSummary[]>(path, "GET", undefined, token);
}

export function getSession(
  sessionId: string,
  token: string
): Promise<SessionDetail> {
  return request<SessionDetail>(
    `/api/chat/sessions/${sessionId}`,
    "GET",
    undefined,
    token
  );
}

export function getSessionStats(
  sessionId: string,
  token: string
): Promise<SessionStats> {
  // Use getSession and extract stats from it
  return getSession(sessionId, token).then((session) => ({
    session_id: session.session_id,
    total_tokens_used: session.total_tokens_used,
    llm_call_count: session.llm_call_count,
    total_execution_time_ms: session.total_execution_time_ms,
    model_key: session.model_key || "",
    last_message_at: session.last_message_at || null,
    created_at: session.created_at,
  }));
}

export function deleteSession(
  sessionId: string,
  token: string
): Promise<{ message: string; session_id: string }> {
  return request<{ message: string; session_id: string }>(
    `/api/chat/sessions/${sessionId}`,
    "DELETE",
    undefined,
    token
  );
}

export function updateSessionTitle(
  sessionId: string,
  title: string,
  token: string
): Promise<{ message: string; session_id: string; title: string }> {
  return request<{ message: string; session_id: string; title: string }>(
    `/api/chat/sessions/${sessionId}/title`,
    "PUT",
    { title },
    token
  );
}

export function toggleSessionPublic(
  sessionId: string,
  isPublic: boolean,
  token: string
): Promise<{ success: boolean; message: string; public_url?: string }> {
  return request<{ success: boolean; message: string; public_url?: string }>(
    `/api/chat/sessions/${sessionId}/toggle-public`,
    "PUT",
    { is_public: isPublic },
    token
  );
}

export function getPublicSession(shortHash: string): Promise<SessionDetail> {
  return request<SessionDetail>(`/api/chat/public/${shortHash}`);
}

export function getAvailableModels(token?: string): Promise<ModelGroupInfo[]> {
  return request<ModelGroupInfo[]>("/api/chat/models", "GET", undefined, token);
}

// Jobs API
export interface Job {
  job_id: string;
  job_type: string;
  status: "pending" | "running" | "completed" | "failed" | "cancelled";
  description: string;
  status_message?: string;
  progress: number;
  created_at: string;
  started_at?: string | null;
  completed_at?: string | null;
  duration_seconds?: number | null;
  error_message?: string | null;
  error?: string;
  logs?: string[];
  result?: any;
  job_metadata?: Record<string, any>;
  user_id?: string | null;
}

export interface JobsListResponse {
  jobs: Job[];
  total: number;
}

export async function listJobs(
  token: string,
  limit: number = 20,
  status?: string,
  job_id?: string
): Promise<JobsListResponse> {
  const params = new URLSearchParams();
  params.append("limit", limit.toString());
  if (status) params.append("status", status);
  if (job_id) params.append("job_id", job_id);
  
  const query = params.toString();
  const path = `/api/jobs${query ? `?${query}` : ""}`;
  
  try {
    return await request<JobsListResponse>(path, "GET", undefined, token);
  } catch (error) {
    // Return empty result if jobs API is unavailable
    // This makes the jobs system optional for CRM-only usage
    return { jobs: [], total: 0 };
  }
}

export function getJob(jobId: string, token: string): Promise<Job> {
  return request<Job>(`/api/jobs/${jobId}`, "GET", undefined, token);
}

export function cancelJob(jobId: string, token: string): Promise<{ message: string; job_id: string }> {
  return request<{ message: string; job_id: string }>(
    `/api/jobs/${jobId}/cancel`,
    "POST",
    undefined,
    token
  );
}

export interface JobStats {
  total: number;
  by_status: Record<string, number>;
  by_type: Record<string, number>;
  active_count: number;
  completed_count: number;
  failed_count: number;
}

export function getJobStats(token: string): Promise<{ status: string; stats: JobStats }> {
  return request<{ status: string; stats: JobStats }>("/api/jobs/stats", "GET", undefined, token);
}

export interface ScheduledJobRunSummary {
  job_id: string;
  status: "pending" | "running" | "completed" | "failed" | "cancelled";
  created_at?: string | null;
  completed_at?: string | null;
  city_id?: number | null;
  city_name?: string | null;
  metrics_total?: number | null;
  metrics_completed?: number | null;
  metrics_failed?: number | null;
  period_type?: string | null;
  city_count?: number | null;
  cities_succeeded?: number | null;
  cities_failed?: number | null;
  datasets_found?: number | null;
  datasets_indexed?: number | null;
  // Database cleanup fields
  time_series_deleted?: number | null;
  anomalies_deleted?: number | null;
  retention_days?: number | null;
  remove_all_inactive?: boolean | null;
}

export interface ScheduledJobSummary {
  key: string;
  label: string;
  cadence: string;
  description: string;
  last_run?: ScheduledJobRunSummary | null;
  recent_runs: ScheduledJobRunSummary[];
}

export function getScheduledJobSummary(token: string): Promise<ScheduledJobSummary[]> {
  return request<{ status: string; schedules: ScheduledJobSummary[] }>(
    "/api/jobs/schedules/summary",
    "GET",
    undefined,
    token
  ).then((res) => res.schedules);
}

export type CustomScheduleStatus = "active" | "paused" | "disabled";
export type CustomScheduleType =
  | "once"
  | "hourly"
  | "daily"
  | "weekly"
  | "monthly"
  | "cron";

export interface CustomScheduledJob {
  id: number;
  name: string;
  description?: string | null;
  job_type: string;
  job_config: Record<string, any>;
  schedule_type: CustomScheduleType;
  cron_expression?: string | null;
  schedule_hour?: number | null;
  schedule_minute?: number | null;
  schedule_day_of_week?: number | null;
  schedule_day_of_month?: number | null;
  timezone?: string | null;
  max_retries?: number | null;
  retry_delay_seconds?: number | null;
  timeout_seconds?: number | null;
  max_concurrent_cities?: number | null;
  per_city_concurrency?: number | null;
  status: CustomScheduleStatus;
  last_run_at?: string | null;
  last_run_status?: string | null;
  last_run_job_id?: string | null;
  next_run_at?: string | null;
  run_count?: number | null;
  failure_count?: number | null;
  created_by?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  schedule_description?: string | null;
}

export interface ScheduledJobsAllResponse {
  system_schedules: Array<{
    key: string;
    name: string;
    description: string;
    cadence: string;
    type: "system";
    is_system: true;
    status: "active";
    last_run?: any;
    recent_runs?: any[];
  }>;
  custom_schedules: CustomScheduledJob[];
  total_count: number;
}

export function getAllScheduledJobs(token: string): Promise<ScheduledJobsAllResponse> {
  return request<ScheduledJobsAllResponse>("/api/jobs/schedules/all", "GET", undefined, token);
}

export interface UpdateCustomScheduledJobRequest {
  name?: string;
  description?: string | null;
  job_type?: string;
  job_config?: Record<string, any>;
  schedule_type?: CustomScheduleType;
  cron_expression?: string | null;
  schedule_hour?: number | null;
  schedule_minute?: number | null;
  schedule_day_of_week?: number | null;
  schedule_day_of_month?: number | null;
  timezone?: string | null;
  max_retries?: number | null;
  retry_delay_seconds?: number | null;
  timeout_seconds?: number | null;
  max_concurrent_cities?: number | null;
  per_city_concurrency?: number | null;
  status?: CustomScheduleStatus;
}

export function updateCustomScheduledJob(
  jobId: number,
  payload: UpdateCustomScheduledJobRequest,
  token: string
): Promise<any> {
  return request(`/api/jobs/schedules/custom/${jobId}`, "PUT", payload, token);
}

export function pauseCustomScheduledJob(jobId: number, token: string): Promise<any> {
  return request(`/api/jobs/schedules/custom/${jobId}/pause`, "POST", {}, token);
}

export function resumeCustomScheduledJob(jobId: number, token: string): Promise<any> {
  return request(`/api/jobs/schedules/custom/${jobId}/resume`, "POST", {}, token);
}

export function runCustomScheduledJob(jobId: number, token: string): Promise<any> {
  return request(`/api/jobs/schedules/custom/${jobId}/run`, "POST", {}, token);
}

export interface RunScheduleRequest {
  schedule_key: string;
  max_concurrent_cities?: number;
  per_city_concurrency?: number;
  /** For database_cleanup only: removes ALL inactive records regardless of age */
  remove_all_inactive?: boolean;
}

export interface RunScheduleResponse {
  status: string;
  result: {
    schedule_key: string;
    cities: number;
    results: Array<{
      job_id?: string;
      city_id: number;
      city_name: string;
      status: string;
    }>;
  };
}

export function runSchedule(
  scheduleRequest: RunScheduleRequest,
  token: string
): Promise<RunScheduleResponse> {
  return request<RunScheduleResponse>(
    "/api/jobs/schedules/run",
    "POST",
    scheduleRequest,
    token
  );
}

export async function sendChatMessageStream(
  request: ChatMessageRequest,
  token: string,
  onEvent: (event: StreamEvent) => void,
  abortSignal?: AbortSignal
): Promise<void> {
  const url = `${API_BASE}/api/chat/message/stream`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      Accept: "text/event-stream",
    },
    body: JSON.stringify(request),
    signal: abortSignal, // Use provided abort signal if available
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    console.error("❌ Stream request failed:", response.status, text);
    throw new Error(`Stream request failed: ${response.status} ${text}`);
  }

  const reader = response.body?.getReader();
  if (!reader) {
    console.error("❌ No response body reader available");
    throw new Error("No response body reader available");
  }

  const decoder = new TextDecoder();
  let buffer = "";
  let eventCount = 0;
  let lastActivity = Date.now();
  const MAX_IDLE_TIME = 120000; // 2 minutes
  const HEARTBEAT_CHECK_INTERVAL = 30000; // Check every 30 seconds

  // Set up heartbeat checker
  const heartbeatChecker = setInterval(() => {
    const now = Date.now();
    if (now - lastActivity > MAX_IDLE_TIME) {
      console.warn("⚠️ Stream idle timeout, closing connection");
      clearInterval(heartbeatChecker);
      reader.cancel();
    }
  }, HEARTBEAT_CHECK_INTERVAL);

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        clearInterval(heartbeatChecker);
        break;
      }

      lastActivity = Date.now(); // Update activity timestamp
      buffer += decoder.decode(value, { stream: true });
      
      // Handle multiple SSE events in buffer (split by double newline)
      const events = buffer.split("\n\n");
      buffer = events.pop() || ""; // Keep incomplete event in buffer

      for (const eventBlock of events) {
        if (eventBlock.trim() === "") continue;
        
        // Parse SSE event (format: "data: {...}\n" or just "data: {...}")
        const lines = eventBlock.split("\n");
        for (const line of lines) {
          if (line.trim() === "") continue;
          
          if (line.startsWith("data: ")) {
            try {
              const jsonStr = line.slice(6);
              const data = JSON.parse(jsonStr);
              
              // Skip heartbeat events (they're just for keeping connection alive)
              if (data.type === "heartbeat") {
                continue;
              }
              
              eventCount++;
              onEvent(data);
            } catch (e) {
              console.error("❌ Failed to parse SSE event:", e, "Line:", line);
            }
          }
        }
      }
    }
  } catch (error) {
    console.error("❌ Stream error:", error);
    
    // Check if this is an abort error (expected when user cancels)
    const isAbortError = 
      error instanceof Error && 
      (error.name === "AbortError" || error.message.includes("aborted") || error.message.includes("cancelled"));
    
    if (isAbortError) {
      // Don't send error event for user-initiated cancellations
      clearInterval(heartbeatChecker);
      return; // Exit gracefully without throwing
    }
    
    // For other errors, send error event to callback if possible
    try {
      onEvent({
        type: "error",
        content: error instanceof Error ? error.message : String(error),
      });
    } catch (callbackError) {
      console.error("❌ Failed to send error event to callback:", callbackError);
    }
    clearInterval(heartbeatChecker);
    throw error;
  } finally {
    clearInterval(heartbeatChecker);
    try {
      reader.releaseLock();
    } catch (releaseError) {
      console.warn("⚠️ Failed to release reader lock:", releaseError);
    }
  }
}

// City Detail API
export interface CityDetail {
  id: number;
  name: string;
  state?: string | null;
  country?: string | null;
  emoji?: string | null;
  population?: string | null;
  main_domain?: string | null;
  main_portal_url?: string | null;
  all_portal_urls?: string[] | null;
  datasets_count: number;
  is_active: boolean;
  structure_status?: string | null;
  geographic_structures?: Array<{
    structure_name?: string;
    structure_type?: string;
    identifier_field?: string;
  }>;
  governance_structures?: Array<{
    body_name?: string;
    structure_type?: string;
    selection_method?: string;
  }>;
  metrics?: Array<{
    id: number;
    metric_name: string;
    metric_key: string;
    category?: string;
    subcategory?: string;
    last_execution_status?: string;
    last_execution_at?: string | null;
    most_recent_data_date?: string | null;
    greendirection?: string; // "up" or "down" - determines if increase is good or bad
  }>;
}

export function getCity(cityId: number, token: string): Promise<CityDetail> {
  const now = Date.now();
  const cacheKey = cityId;
  const cached = cityDataCache[cacheKey];

  // Return cached data if valid
  if (
    cached?.data &&
    cached.token === token &&
    (now - cached.timestamp) < CITY_DATA_CACHE_TTL
  ) {
    return Promise.resolve(cached.data);
  }

  // Return existing promise if request is in flight
  if (
    cached?.promise &&
    cached.token === token &&
    (now - cached.timestamp) < CITY_DATA_CACHE_TTL
  ) {
    return cached.promise;
  }

  // Create new request and cache it
  // Load without metrics initially for faster response - metrics can be loaded separately
  const promise = request<CityDetail>(`/api/cities/${cityId}?include_metrics=false`, "GET", undefined, token)
    .then((data: CityDetail) => {
      // Cache the result
      if (cityDataCache[cacheKey]?.promise === promise) {
        cityDataCache[cacheKey] = {
          data,
          promise: null,
          timestamp: now,
          token,
        };
      }
      return data;
    })
    .catch((error) => {
      // Clear cache on error to allow retry
      if (cityDataCache[cacheKey]?.promise === promise) {
        delete cityDataCache[cacheKey];
      }
      throw error;
    });

  // Cache the promise
  cityDataCache[cacheKey] = {
    data: null,
    promise,
    timestamp: now,
    token,
  };

  return promise;
}

// Clear city data cache (call this when city data might have changed)
export function clearCityDataCache(cityId?: number): void {
  if (cityId !== undefined) {
    delete cityDataCache[cityId];
  } else {
    // Clear all city data cache
    Object.keys(cityDataCache).forEach((key) => {
      delete cityDataCache[Number(key)];
    });
  }
}

// Clear city structure cache (call this when structure data might have changed)
export function clearCityStructureCache(cityId?: number): void {
  if (cityId !== undefined) {
    delete cityStructureCache[cityId];
  } else {
    // Clear all city structure cache
    Object.keys(cityStructureCache).forEach((key) => {
      delete cityStructureCache[Number(key)];
    });
  }
}

// Clear city admin cache (call this when admin data might have changed)
export function clearCityAdminCache(cityId?: number): void {
  if (cityId !== undefined) {
    delete cityAdminCache[cityId];
  } else {
    // Clear all city admin cache
    Object.keys(cityAdminCache).forEach((key) => {
      delete cityAdminCache[Number(key)];
    });
  }
}

// Clear all city-related caches for a city
export function clearAllCityCaches(cityId?: number): void {
  clearCityDataCache(cityId);
  clearCityStructureCache(cityId);
  clearCityAdminCache(cityId);
}

// Prefetch city data (for hover prefetching)
export function prefetchCity(cityId: number, token: string): void {
  // Only prefetch if not already cached or in-flight
  const now = Date.now();
  const cacheKey = cityId;
  const cached = cityDataCache[cacheKey];

  if (
    cached &&
    cached.token === token &&
    (now - cached.timestamp) < CITY_DATA_CACHE_TTL
  ) {
    // Already cached or in-flight, skip
    return;
  }

  // Trigger prefetch (don't await, fire and forget)
  getCity(cityId, token).catch(() => {
    // Silently fail on prefetch errors
  });
}

// City Leaders API
export interface CityLeader {
  id?: number;
  city_id: number;
  name: string;
  title: string;
  district?: number | null;
  governance_structure_id?: number | null;
  geographic_structure_id?: number | null;
  metadata?: Record<string, any>;
  created_at?: string;
  updated_at?: string;
}

export function getCityLeaders(cityId: number, token: string): Promise<CityLeader[]> {
  return request<any>(`/api/cities/${cityId}/structure`, "GET", undefined, token)
    .then((data: any) => {
      // Handle nested structure response
      if (data.leaders && Array.isArray(data.leaders)) return data.leaders;
      if (Array.isArray(data)) return data;
      return [];
    })
    .catch(() => []); // Return empty array if endpoint fails
}

export type RepresentativeFollowerCountItem = { district: string; follower_count: number };

export function getRepresentativeFollowerCounts(
  cityId: number,
  token: string
): Promise<RepresentativeFollowerCountItem[]> {
  return request<RepresentativeFollowerCountItem[]>(
    `/api/newsletter/representative-follower-counts?city_id=${cityId}`,
    "GET",
    undefined,
    token
  ).catch(() => []); // Return [] if endpoint fails or table does not exist
}

export function getMyRepresentativeFollows(
  cityId: number,
  token: string
): Promise<string[]> {
  return request<string[]>(
    `/api/newsletter/my-follows?city_id=${cityId}`,
    "GET",
    undefined,
    token
  ).catch(() => []);
}

export function followRepresentative(
  cityId: number,
  district: string,
  token: string
): Promise<{ followed: boolean; city_id: number; district: string }> {
  return request(`/api/newsletter/follow`, "POST", { city_id: cityId, district }, token);
}

export function unfollowRepresentative(
  cityId: number,
  district: string,
  token: string
): Promise<{ followed: boolean; city_id: number; district: string }> {
  return request(
    `/api/newsletter/follow?city_id=${cityId}&district=${encodeURIComponent(district)}`,
    "DELETE",
    undefined,
    token
  );
}

export function createCityLeader(
  cityId: number,
  leader: CityLeader,
  token: string
): Promise<{ message: string; id: number }> {
  return request<{ message: string; id: number }>(
    `/api/template-metrics/cities/${cityId}/structure/leaders`,
    "POST",
    leader,
    token
  );
}

export function updateCityLeader(
  cityId: number,
  leaderId: number,
  leader: CityLeader,
  token: string
): Promise<{ message: string; id: number }> {
  return request<{ message: string; id: number }>(
    `/api/template-metrics/cities/${cityId}/structure/leaders/${leaderId}`,
    "PUT",
    leader,
    token
  );
}

export function deleteCityLeader(
  cityId: number,
  leaderId: number,
  token: string
): Promise<{ message: string }> {
  return request<{ message: string }>(
    `/api/template-metrics/cities/${cityId}/structure/leaders/${leaderId}`,
    "DELETE",
    undefined,
    token
  );
}

// City Shapefiles API
export interface CityShapefile {
  id: number;
  city_id: number;
  geographic_structure_id?: number | null;
  template_layer_id?: number | null;
  shapefile_name: string;
  structure_type: string;
  geometry_data: any; // GeoJSON FeatureCollection
  geometry_type?: string | null;
  source_endpoint?: string | null;
  source_query?: string | null;
  source_url?: string | null;
  feature_count?: number | null;
  identifier_field?: string | null;
  status?: "active" | "disabled" | "needs_refresh";
  render_order?: number | null;
  style_overrides_json?: Record<string, any> | null;
  metadata?: Record<string, any>;
  created_at?: string;
  updated_at?: string;
  last_fetched_at?: string | null;
}

// Shape Layers API (templates + city instances)
export interface TemplateShapeLayer {
  id: number;
  layer_key: string;
  default_display_name: string;
  category: string;
  icon?: string | null;
  geometry_kind: string;
  default_identifier_field?: string | null;
  default_style_json?: Record<string, any>;
  source_strategy: string;
  source_defaults_json?: Record<string, any>;
  is_active?: boolean;
  metadata?: Record<string, any>;
  created_at?: string;
  updated_at?: string;
}

export interface CityShapeLayerInstance extends CityShapefile {
  // Reuse CityShapefile fields (city_shapefiles row)
}

export interface CityShapeLayerListItem {
  template: TemplateShapeLayer | null;
  instance: CityShapeLayerInstance | null;
}

export function getCityShapeLayers(
  cityId: number,
  token: string,
  includeGeometry: boolean = true
): Promise<CityShapeLayerListItem[]> {
  const params = new URLSearchParams();
  params.set("include_geometry", includeGeometry ? "true" : "false");
  return request<CityShapeLayerListItem[]>(
    `/api/shape-layers/cities/${cityId}?${params.toString()}`,
    "GET",
    undefined,
    token
  );
}


export function getCityShapefiles(cityId: number, token: string): Promise<CityShapefile[]> {
  return request<any>(`/api/cities/${cityId}/structure`, "GET", undefined, token)
    .then((data: any) => {
      if (data && data.shapefiles && Array.isArray(data.shapefiles)) return data.shapefiles;
      if (Array.isArray(data)) return data;
      return [];
    })
    .catch((err) => {
      console.error("Error fetching shapefiles:", err);
      console.error("Error details:", err.message, err.stack);
      return []; // Return empty array if endpoint fails
    });
}

// Saved Cities API
export interface SavedCity {
  id: number;
  display_name: string;
  emoji?: string | null;
  city_name?: string;
  state?: string;
  country?: string;
}

export function getSavedCities(token: string): Promise<SavedCity[]> {
  const now = Date.now();
  
  // Check if we have a valid cached promise for the same token
  if (
    savedCitiesCache.promise &&
    savedCitiesCache.token === token &&
    (now - savedCitiesCache.timestamp) < SAVED_CITIES_CACHE_TTL
  ) {
    return savedCitiesCache.promise as Promise<SavedCity[]>;
  }
  
  // Create new request and cache it
  const promise = request<SavedCity[]>("/api/cities/saved", "GET", undefined, token);
  savedCitiesCache.promise = promise;
  savedCitiesCache.timestamp = now;
  savedCitiesCache.token = token;
  
  // Clear cache on error to allow retry
  promise.catch(() => {
    if (savedCitiesCache.promise === promise) {
      savedCitiesCache.promise = null;
      savedCitiesCache.timestamp = 0;
    }
  });
  
  return promise;
}

// Clear the saved cities cache (call this when cities are saved/unsaved)
export function clearSavedCitiesCache(): void {
  savedCitiesCache.promise = null;
  savedCitiesCache.timestamp = 0;
  savedCitiesCache.token = null;
}

export function saveCity(cityId: number, token: string): Promise<{ message: string; city_id: number }> {
  clearSavedCitiesCache(); // Clear cache when saving
  return request<{ message: string; city_id: number }>(
    `/api/cities/${cityId}/save`,
    "POST",
    undefined,
    token
  );
}

export function unsaveCity(cityId: number, token: string): Promise<{ message: string; city_id: number }> {
  clearSavedCitiesCache(); // Clear cache when unsaving
  return request<{ message: string; city_id: number }>(
    `/api/cities/${cityId}/save`,
    "DELETE",
    undefined,
    token
  );
}

// Datasets Admin API
export interface DatasetStats {
  total_datasets: number;
  datasets_by_status: {
    success: number;
    pending: number;
    error: number;
  };
}

export interface DatasetCategory {
  name: string;
  count: number;
}

export interface Dataset {
  id: number;
  dataset_id: string;
  title?: string;
  description?: string;
  city_name?: string;
  category?: string;
  publishing_department?: string;
  update_frequency?: string;
  row_count?: number;
  file_size_bytes?: number;
  fetch_status: "success" | "pending" | "error";
  last_updated_date?: string;
  url?: string;
}

export function getDatasetStats(token: string): Promise<DatasetStats> {
  return request<DatasetStats>("/api/admin/stats", "GET", undefined, token);
}

export function getDatasetCategories(token: string): Promise<DatasetCategory[]> {
  return request<DatasetCategory[]>("/api/admin/datasets/categories/list", "GET", undefined, token);
}

export function listDatasets(
  token: string,
  options?: {
    limit?: number;
    search?: string;
    category?: string;
    fetch_status?: string;
    city_id?: number;
  }
): Promise<Dataset[]> {
  const params = new URLSearchParams();
  if (options?.limit) params.append("limit", options.limit.toString());
  if (options?.search) params.append("search", options.search);
  if (options?.category) params.append("category", options.category);
  if (options?.fetch_status) params.append("fetch_status", options.fetch_status);
  if (options?.city_id) params.append("city_id", options.city_id.toString());
  
  const query = params.toString();
  const path = `/api/admin/datasets${query ? `?${query}` : ""}`;
  return request<Dataset[]>(path, "GET", undefined, token);
}

export function getDataset(datasetId: number, token: string): Promise<Dataset> {
  return request<Dataset>(`/api/admin/datasets/${datasetId}`, "GET", undefined, token);
}

// User Management API
export interface User {
  id: number;
  auth0_id: string;
  email: string;
  name: string | null;
  role: string;
  is_active: boolean;
  created_at: string;
  last_login_at: string | null;
  city_lead_city_ids?: number[];
  is_city_lead?: boolean;
}

export interface UserUpdateRequest {
  role?: "admin" | "analyst" | "viewer";
  is_active?: boolean;
  custom_permissions?: string[];
}

export interface UserStats {
  total_users: number;
  active_users: number;
  admin_count: number;
  analyst_count: number;
  viewer_count: number;
  city_lead_count?: number;
  users_by_role: Record<string, number>;
  total_cities: number;
  active_cities: number;
  total_countries: number;
  total_datasets: number;
  datasets_by_status: Record<string, number>;
  database_size?: string | null;
}

export function listUsers(
  token: string,
  options?: {
    role?: string;
    is_active?: boolean;
    is_city_lead?: boolean;
    skip?: number;
    limit?: number;
  }
): Promise<User[]> {
  const params = new URLSearchParams();
  if (options?.role) params.append("role", options.role);
  if (options?.is_active !== undefined) params.append("is_active", options.is_active.toString());
  if (options?.is_city_lead !== undefined) params.append("is_city_lead", options.is_city_lead.toString());
  if (options?.skip) params.append("skip", options.skip.toString());
  if (options?.limit) params.append("limit", options.limit.toString());
  
  const query = params.toString();
  const path = `/api/admin/users${query ? `?${query}` : ""}`;
  return request<User[]>(path, "GET", undefined, token);
}

export function getUserCityLeads(
  userId: number,
  token: string
): Promise<{ user_id: number; city_ids: number[] }> {
  return request<{ user_id: number; city_ids: number[] }>(
    `/api/admin/users/${userId}/city-leads`,
    "GET",
    undefined,
    token
  );
}

export function setUserCityLeads(
  userId: number,
  cityIds: number[],
  token: string
): Promise<{ status: string; user_id: number; city_ids: number[] }> {
  return request<{ status: string; user_id: number; city_ids: number[] }>(
    `/api/admin/users/${userId}/city-leads`,
    "PUT",
    { city_ids: cityIds },
    token
  );
}

export function getUser(userId: number, token: string): Promise<User> {
  return request<User>(`/api/admin/users/${userId}`, "GET", undefined, token);
}

export function updateUser(
  userId: number,
  data: UserUpdateRequest,
  token: string
): Promise<User> {
  return request<User>(`/api/admin/users/${userId}`, "PUT", data, token);
}

export function getUserByEmail(email: string, token: string): Promise<User> {
  return request<User>(`/api/admin/users/by-email/${encodeURIComponent(email)}`, "GET", undefined, token);
}

export function makeUserAdmin(userId: number, token: string): Promise<{ message: string; user_id: number }> {
  return request<{ message: string; user_id: number }>(
    `/api/admin/users/${userId}/make-admin`,
    "POST",
    undefined,
    token
  );
}

export function getUserStats(token: string): Promise<UserStats> {
  return request<UserStats>("/api/admin/stats", "GET", undefined, token);
}

export interface TableSizeInfo {
  table_name: string;
  size: string;
  size_bytes: number;
  row_count: number;
  inactive_rows: number;
}

export interface DatabaseSizeResponse {
  total_database_size: string;
  total_database_size_bytes: number;
  total_size_with_indexes: string;
  total_size_with_indexes_bytes: number;
  indexes_size: string;
  indexes_size_bytes: number;
  tables: TableSizeInfo[];
  timestamp: string;
  note?: string;
}

export function getDatabaseSize(token: string): Promise<DatabaseSizeResponse> {
  return request<DatabaseSizeResponse>("/api/admin/database/size", "GET", undefined, token);
}

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

export function getAnomalyRun(runId: number, token: string): Promise<Record<string, any>> {
  return request<Record<string, any>>(`/api/anomalies/run/${runId}`, "GET", undefined, token);
}

export function getAnomalyResult(resultId: number, token?: string): Promise<AnomalyResult> {
  // Use public endpoint if no token provided (for logged-out users)
  const path = token 
    ? `/api/anomalies/result/${resultId}`
    : `/api/anomalies/public/result/${resultId}`;
  return request<AnomalyResult>(path, "GET", undefined, token);
}

// ============================================================================
// FEED STORIES API
// ============================================================================

export interface FeedStory {
  id: number;
  story_type: string;
  city_id: number;
  district: number;
  research_report_id: number;
  newsletter_frequency?: string | null;
  newsletter_period_start?: string | null;
  headline: string;
  description: string;
  summary?: string | null;
  primary_visualization?: Record<string, any> | null;
  visualization_type?: string | null;
  visualization_ref_id?: number | null;
  detail_url: string;
  related_urls?: Array<Record<string, any>>;
  view_count: number;
  click_count: number;
  share_count: number;
  priority_score: number;
  is_featured: boolean;
  status: string;
  story_date: string;
  published_at?: string | null;
  metadata?: Record<string, any>;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface FeedStoriesResponse {
  stories: FeedStory[];
  count: number;
}

export interface FeedStoryResponse {
  story: FeedStory;
}

export interface EngagementRequest {
  action: "view" | "click" | "share";
}

export interface EngagementResponse {
  success: boolean;
  message: string;
}

export function listFeedStories(
  token: string,
  options?: {
    city_id?: number;
    district?: number | null;
    newsletter_frequency?: string | null;
    research_report_id?: number;
    limit?: number;
    order_by?: string;
  }
): Promise<FeedStoriesResponse> {
  const params = new URLSearchParams();
  if (options?.city_id) params.append("city_id", options.city_id.toString());
  if (options?.district !== undefined && options?.district !== null) {
    params.append("district", options.district.toString());
  }
  if (options?.newsletter_frequency) {
    params.append("newsletter_frequency", options.newsletter_frequency);
  }
  if (options?.research_report_id) {
    params.append("research_report_id", options.research_report_id.toString());
  }
  if (options?.limit) params.append("limit", options.limit.toString());
  if (options?.order_by) params.append("order_by", options.order_by);

  const query = params.toString();
  const path = `/api/feed${query ? `?${query}` : ""}`;
  return request<FeedStoriesResponse>(path, "GET", undefined, token);
}

export function getFeedStory(storyId: number, token: string): Promise<FeedStoryResponse> {
  return request<FeedStoryResponse>(`/api/feed/story/${storyId}`, "GET", undefined, token);
}

export function trackFeedEngagement(
  storyId: number,
  action: "view" | "click" | "share",
  token: string
): Promise<EngagementResponse> {
  return request<EngagementResponse>(
    `/api/feed/story/${storyId}/engage`,
    "POST",
    { action },
    token
  );
}

// Public feed endpoints (no auth required)
export function listPublicFeedStories(
  options?: {
    city_id?: number;
    district?: number | null;
    newsletter_frequency?: string | null;
    limit?: number;
    order_by?: string;
  }
): Promise<FeedStoriesResponse> {
  const params = new URLSearchParams();
  if (options?.city_id) params.append("city_id", options.city_id.toString());
  if (options?.district !== undefined && options?.district !== null) {
    params.append("district", options.district.toString());
  }
  if (options?.newsletter_frequency) {
    params.append("newsletter_frequency", options.newsletter_frequency);
  }
  if (options?.limit) params.append("limit", options.limit.toString());
  if (options?.order_by) params.append("order_by", options.order_by);

  const query = params.toString();
  const path = `/api/feed/public${query ? `?${query}` : ""}`;
  return request<FeedStoriesResponse>(path, "GET", undefined);
}

export function getPublicFeedStory(storyId: number): Promise<FeedStoryResponse> {
  return request<FeedStoryResponse>(`/api/feed/public/story/${storyId}`, "GET", undefined);
}

export interface GenerateFeedStoriesRequest {
  city_id?: number;
  district?: number;
  newsletter_frequency?: string;
  story_count?: number;
}

export interface GenerateFeedStoriesResponse {
  success: boolean;
  message: string;
  report_id: number;
  stories_created: number;
  story_ids: number[];
  city_id: number;
  district: number;
  frequency: string;
}

export function generateFeedStoriesFromResearch(
  reportId: number,
  options: GenerateFeedStoriesRequest,
  token: string
): Promise<GenerateFeedStoriesResponse> {
  const params = new URLSearchParams();
  if (options.city_id) params.append("city_id", options.city_id.toString());
  if (options.district !== undefined) params.append("district", options.district.toString());
  if (options.newsletter_frequency) params.append("newsletter_frequency", options.newsletter_frequency);
  if (options.story_count) params.append("story_count", options.story_count.toString());
  
  const query = params.toString();
  const path = `/api/feed/generate-from-research/${reportId}${query ? `?${query}` : ""}`;
  return request<GenerateFeedStoriesResponse>(path, "POST", undefined, token);
}

// ============================================================================
// NEWSLETTER REPORTS API
// ============================================================================

export interface NewsletterReport {
  id: number;
  short_hash: string;
  title: string;
  city_id: number | null;
  district: string | null;
  frequency: string | null;
  newsletter_period_start: string | null;
  final_report_html: string | null;
  social_summary: string | null;
  created_at: string | null;
  public_url: string;
}

export function listNewsletterReports(
  cityId: number,
  options?: {
    district?: number | null;
    frequency?: string | null;
    limit?: number;
  },
  token?: string
): Promise<NewsletterReport[]> {
  const params = new URLSearchParams();
  params.append("city_id", cityId.toString());
  if (options?.district !== undefined && options?.district !== null) {
    params.append("district", options.district.toString());
  }
  if (options?.frequency) {
    params.append("frequency", options.frequency);
  }
  if (options?.limit) {
    params.append("limit", options.limit.toString());
  }
  
  const query = params.toString();
  const path = `/api/newsletter/reports${query ? `?${query}` : ""}`;
  return request<NewsletterReport[]>(path, "GET", undefined, token);
}

// Research API
export interface ResearchReport {
  id: number;
  short_hash: string;
  title: string;
  original_prompt: string;
  city_id?: number | null;
  district?: string | null;
  status: string;
  max_iterations: number;
  max_subquestions: number;
  current_iteration: number;
  agenda?: Record<string, any> | null;
  final_report_html?: string | null;
  model_key?: string | null;
  session_id?: string | null;
  job_id?: string | null;
  estimated_cost_usd?: number | null;
  actual_cost_usd?: number | null;
  total_items: number;
  completed_items: number;
  progress_percent: number;
  is_public: boolean;
  view_count: number;
  user_id?: string | null;
  error_message?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface ResearchItem {
  id?: number;
  report_id: number;
  item_id: string;
  research_question: string;
  reason?: string | null;
  priority?: number;
  iteration_number?: number;
  added_by?: string;
  status: string;
  result?: string | null;
  session_id?: string | null;
  error_message?: string | null;
  metadata?: Record<string, any>;
  started_at?: string | null;
  completed_at?: string | null;
  created_at?: string | null;
}

export interface ResearchItemsResponse {
  report_id: number;
  total_items: number;
  items: ResearchItem[];
}

export interface CreateResearchRequest {
  prompt: string;
  city_id?: number | null;
  district?: string | null;
  max_iterations?: number;
  max_subquestions?: number;
  model_key?: string;
  require_agenda_approval?: boolean;
  enable_web_search?: boolean;
  // Newsletter metadata fields (optional) - set these to create a newsletter report
  is_newsletter?: boolean;
  newsletter_frequency?: "weekly" | "monthly" | null;
}

export interface CreateResearchResponse {
  report_id: number;
  short_hash: string;
  public_url: string;
  estimated_cost: Record<string, any>;
  status: string;
  message: string;
  job_id?: string;
}

export interface ResearchListResponse {
  reports: ResearchReport[];
  total: number;
  limit: number;
  offset: number;
  current_user_id?: string | null;
}

export function createResearch(
  payload: CreateResearchRequest,
  token: string
): Promise<CreateResearchResponse> {
  return request<CreateResearchResponse>("/api/research/create", "POST", payload, token);
}

export function getResearch(reportId: number, token: string): Promise<ResearchReport> {
  return request<ResearchReport>(`/api/research/${reportId}`, "GET", undefined, token);
}

export function getResearchItems(
  reportId: number,
  token: string
): Promise<ResearchItemsResponse> {
  return request<ResearchItemsResponse>(
    `/api/research/${reportId}/items`,
    "GET",
    undefined,
    token
  );
}

export function runResearchFromAgenda(
  reportId: number,
  token: string
): Promise<{ status: string; job_id: string; report_id: number; message: string }> {
  return request<{ status: string; job_id: string; report_id: number; message: string }>(
    `/api/research/${reportId}/run`,
    "POST",
    undefined,
    token
  );
}

export function cancelResearch(
  reportId: number,
  token: string
): Promise<{ status: string; job_id: string; report_id: number }> {
  return request<{ status: string; job_id: string; report_id: number }>(
    `/api/research/${reportId}/cancel`,
    "POST",
    undefined,
    token
  );
}

export function getResearchByHash(hash: string): Promise<ResearchReport> {
  // Use public endpoint - fetch directly without auth credentials
  // Try public endpoint first, fallback to regular endpoint if needed
  return fetch(`${API_BASE}/api/research/public/by-hash/${hash}`, {
    method: "GET",
    headers: {
      "Accept": "application/json",
    },
    credentials: "omit", // Don't send cookies/auth for public endpoint
  }).then(async (res) => {
    // If public endpoint doesn't exist (404), try the regular endpoint
    if (res.status === 404) {
      return fetch(`${API_BASE}/api/research/by-hash/${hash}`, {
        method: "GET",
        headers: {
          "Accept": "application/json",
        },
        credentials: "omit", // Don't send cookies/auth
      }).then(async (res2) => {
        if (!res2.ok) {
          const text = await res2.text().catch(() => "");
          const error = new Error(`Failed to fetch research: ${res2.status} ${text}`);
          (error as any).status = res2.status;
          (error as any).statusText = res2.statusText;
          throw error;
        }
        return res2.json() as Promise<ResearchReport>;
      });
    }
    
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      const error = new Error(`Failed to fetch research: ${res.status} ${text}`);
      (error as any).status = res.status;
      (error as any).statusText = res.statusText;
      throw error;
    }
    return res.json() as Promise<ResearchReport>;
  });
}

export function listResearch(
  token: string,
  options?: {
    city_id?: number;
    status_filter?: string;
    limit?: number;
    offset?: number;
  }
): Promise<ResearchListResponse> {
  const params = new URLSearchParams();
  if (options?.city_id) params.append("city_id", options.city_id.toString());
  if (options?.status_filter) params.append("status_filter", options.status_filter);
  if (options?.limit) params.append("limit", options.limit.toString());
  if (options?.offset) params.append("offset", options.offset.toString());
  
  const query = params.toString();
  const path = `/api/research/reports${query ? `?${query}` : ""}`;
  return request<ResearchListResponse>(path, "GET", undefined, token);
}

export function publishResearch(
  reportId: number,
  isPublic: boolean,
  token: string
): Promise<{ success: boolean; message: string; public_url?: string }> {
  return request<{ success: boolean; message: string; public_url?: string }>(
    `/api/research/${reportId}/publish`,
    "POST",
    { is_public: isPublic },
    token
  );
}

export function deleteResearch(
  reportId: number,
  token: string
): Promise<void> {
  return fetch(`${API_BASE}/api/research/${reportId}`, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    },
  }).then((res) => {
    if (!res.ok && res.status !== 204) {
      throw new Error(`Failed to delete research (${res.status})`);
    }
    // DELETE returns 204 No Content
    return;
  });
}

export interface RegenerateResearchRequest {
  model_key?: string;
}

export interface RegenerateResearchResponse {
  status: string;
  job_id: string;
  message: string;
}

export function regenerateResearch(
  reportId: number,
  reqData: RegenerateResearchRequest,
  token: string
): Promise<RegenerateResearchResponse> {
  return request<RegenerateResearchResponse>(
    `/api/research/${reportId}/regenerate`,
    "POST",
    reqData,
    token
  );
}

export interface ResynthesizeResearchRequest {
  model_key?: string;
}

export interface ResynthesizeResearchResponse {
  status: string;
  job_id: string;
  message: string;
}

export function resynthesizeResearch(
  reportId: number,
  reqData: ResynthesizeResearchRequest,
  token: string
): Promise<ResynthesizeResearchResponse> {
  return request<ResynthesizeResearchResponse>(
    `/api/research/${reportId}/resynthesize`,
    "POST",
    reqData,
    token
  );
}

export interface UpdateResearchTitleRequest {
  title: string;
}

export interface UpdateResearchTitleResponse {
  success: boolean;
  message: string;
  report_id: number;
  title: string;
}

export function updateResearchTitle(
  reportId: number,
  title: string,
  token: string
): Promise<UpdateResearchTitleResponse> {
  return request<UpdateResearchTitleResponse>(
    `/api/research/${reportId}/title`,
    "PUT",
    { title },
    token
  );
}

// ============================================================================
// SAVED MAPS API
// ============================================================================

export interface SavedMap {
  id: number;
  short_hash: string;
  title: string;
  description: string | null;
  map_type: string;
  location_data: Array<{ lat: number; lon: number; [key: string]: any }>;
  map_config: Record<string, any>;
  bounds: [[number, number], [number, number]] | null;
  center: { lat: number; lng: number; zoom: number } | null;
  city_id: number | null;
  metric_id: number | null;
  query_source: string | null;
  is_public: boolean;
  view_count: number;
  user_id: string | null;
  created_at: string;
  updated_at: string;
  public_url?: string | null;
}

export interface MapListItem {
  id: number;
  short_hash: string;
  title: string;
  description: string | null;
  map_type: string;
  city_id: number | null;
  city_name: string | null;
  metric_id: number | null;
  is_public: boolean;
  view_count: number;
  user_id: string | null;
  created_at: string;
  point_count: number;
  public_url?: string | null;
}

export interface MapListResponse {
  maps: MapListItem[];
  total: number;
  limit: number;
  offset: number;
}

export interface CreateMapRequest {
  title: string;
  description?: string;
  map_type: string;
  location_data: Array<{ lat: number; lon: number; [key: string]: any }>;
  map_config?: Record<string, any>;
  bounds?: [[number, number], [number, number]];
  center?: { lat: number; lng: number; zoom: number };
  city_id?: number;
  metric_id?: number;
  query_source?: string;
  is_public?: boolean;
}

export interface UpdateMapRequest {
  title?: string;
  description?: string;
  is_public?: boolean;
  map_config?: Record<string, any>;
}

export interface MapStatsResponse {
  total_maps: number;
  public_maps: number;
  private_maps: number;
  total_views: number;
  maps_by_type: Record<string, number>;
  maps_by_city: Record<string, number>;
  top_viewed: MapListItem[];
}

// Create a new saved map
export function createMap(mapData: CreateMapRequest, token: string): Promise<SavedMap> {
  return request<SavedMap>("/api/maps", "POST", mapData, token);
}

// List user's maps
export function listMyMaps(
  token: string,
  options?: {
    city_id?: number;
    is_public?: boolean;
    map_type?: string;
    limit?: number;
    offset?: number;
  }
): Promise<MapListResponse> {
  const params = new URLSearchParams();
  if (options?.city_id) params.append("city_id", options.city_id.toString());
  if (options?.is_public !== undefined) params.append("is_public", String(options.is_public));
  if (options?.map_type) params.append("map_type", options.map_type);
  if (options?.limit) params.append("limit", options.limit.toString());
  if (options?.offset) params.append("offset", options.offset.toString());
  
  const query = params.toString();
  const path = `/api/maps${query ? `?${query}` : ""}`;
  return request<MapListResponse>(path, "GET", undefined, token);
}

// Get a specific map by ID
export function getMapById(mapId: number, token: string): Promise<SavedMap> {
  return request<SavedMap>(`/api/maps/${mapId}`, "GET", undefined, token);
}

// Cache for public maps by hash
const publicMapCache: {
  [hash: string]: {
    data: SavedMap | null;
    promise: Promise<SavedMap> | null;
    timestamp: number;
  };
} = {};

const PUBLIC_MAP_CACHE_TTL = 60000; // 1 minute cache

// Get a public map by hash (no auth required) - with caching
export function getPublicMap(hash: string): Promise<SavedMap> {
  const now = Date.now();
  const cached = publicMapCache[hash];
  
  // Return cached data if valid
  if (cached?.data && (now - cached.timestamp) < PUBLIC_MAP_CACHE_TTL) {
    return Promise.resolve(cached.data);
  }
  
  // Return in-flight promise if one exists
  if (cached?.promise && (now - cached.timestamp) < PUBLIC_MAP_CACHE_TTL) {
    return cached.promise;
  }
  
  // Create new request and cache the promise
  const promise = request<SavedMap>(`/api/maps/public/${hash}`, "GET", undefined)
    .then((data) => {
      publicMapCache[hash] = { data, promise: null, timestamp: Date.now() };
      return data;
    })
    .catch((err) => {
      // Clear cache on error
      delete publicMapCache[hash];
      throw err;
    });
  
  publicMapCache[hash] = { data: null, promise, timestamp: now };
  return promise;
}

/** Lazy-load choropleth view data for an alternative shape layer (no auth required). */
export function getMapView(
  hash: string,
  shapeLayerId: number
): Promise<{ aggregation: { identifier_field: string; display_name: string; rows: Array<Record<string, unknown>> }; shape_layer_instance_id: number }> {
  return request(`/api/maps/public/${hash}/view/${shapeLayerId}`, "GET", undefined);
}

// Update a map
export function updateMap(mapId: number, data: UpdateMapRequest, token: string): Promise<SavedMap> {
  return request<SavedMap>(`/api/maps/${mapId}`, "PUT", data, token);
}

// Delete a map
export function deleteMap(mapId: number, token: string): Promise<void> {
  return fetch(`${API_BASE}/api/maps/${mapId}`, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    },
  }).then((res) => {
    if (!res.ok && res.status !== 204) {
      throw new Error(`Failed to delete map (${res.status})`);
    }
    return;
  });
}

// Publish or unpublish a map
export function publishMap(
  mapId: number,
  isPublic: boolean,
  token: string
): Promise<SavedMap> {
  return request<SavedMap>(
    `/api/maps/${mapId}/publish`,
    "POST",
    { is_public: isPublic },
    token
  );
}

// Admin: List all maps
export function adminListMaps(
  token: string,
  options?: {
    user_id?: string;
    city_id?: number;
    is_public?: boolean;
    map_type?: string;
    metric_id?: number;
    limit?: number;
    offset?: number;
  }
): Promise<MapListResponse> {
  const params = new URLSearchParams();
  if (options?.user_id) params.append("user_id", options.user_id);
  if (options?.city_id) params.append("city_id", options.city_id.toString());
  if (options?.is_public !== undefined) params.append("is_public", String(options.is_public));
  if (options?.map_type) params.append("map_type", options.map_type);
  if (options?.metric_id) params.append("metric_id", options.metric_id.toString());
  if (options?.limit) params.append("limit", options.limit.toString());
  if (options?.offset) params.append("offset", options.offset.toString());
  
  const query = params.toString();
  const path = `/api/admin/maps${query ? `?${query}` : ""}`;
  return request<MapListResponse>(path, "GET", undefined, token);
}

// Admin: Get maps for a specific metric
export function getAdminMetricMaps(
  metricId: number,
  token: string,
  options?: {
    limit?: number;
    offset?: number;
  }
): Promise<MapListResponse> {
  return adminListMaps(token, {
    metric_id: metricId,
    limit: options?.limit ?? 100,
    offset: options?.offset ?? 0,
  });
}

// Admin: Get map stats
export function adminGetMapStats(token: string, cityId?: number): Promise<MapStatsResponse> {
  const params = new URLSearchParams();
  if (cityId) params.append("city_id", cityId.toString());
  
  const query = params.toString();
  const path = `/api/admin/maps/stats${query ? `?${query}` : ""}`;
  return request<MapStatsResponse>(path, "GET", undefined, token);
}

// Admin: Bulk delete maps
export function adminBulkDeleteMaps(
  mapIds: number[],
  token: string
): Promise<{ success: boolean; affected_count: number; message: string }> {
  return request<{ success: boolean; affected_count: number; message: string }>(
    "/api/admin/maps/bulk",
    "DELETE",
    { map_ids: mapIds },
    token
  );
}

// Admin: Bulk publish/unpublish maps
export function adminBulkPublishMaps(
  mapIds: number[],
  isPublic: boolean,
  token: string
): Promise<{ success: boolean; affected_count: number; message: string }> {
  return request<{ success: boolean; affected_count: number; message: string }>(
    "/api/admin/maps/bulk/publish",
    "PUT",
    { map_ids: mapIds, is_public: isPublic },
    token
  );
}

// ============================================================================
// USER PREFERENCES API
// ============================================================================

export interface UserPreferences {
  has_completed_onboarding: boolean;
  theme?: string | null;
  extra?: Record<string, any> | null;
}

export interface UserPreferencesUpdateRequest {
  has_completed_onboarding?: boolean;
  theme?: string;
  extra?: Record<string, any>;
}

export interface CityLeadInterestRequest {
  city_name: string;
  state?: string | null;
  country?: string | null;
}

export interface CityLeadInterestResponse {
  success: boolean;
  message: string;
  interest_id?: number | null;
}

// Get current user's preferences
export function getUserPreferences(token: string): Promise<UserPreferences> {
  return request<UserPreferences>("/api/admin/me/preferences", "GET", undefined, token);
}

// Update current user's preferences
export function updateUserPreferences(
  data: UserPreferencesUpdateRequest,
  token: string
): Promise<UserPreferences> {
  return request<UserPreferences>("/api/admin/me/preferences", "PUT", data, token);
}

// Submit interest in a city that doesn't have data yet
export function submitCityLeadInterest(
  data: CityLeadInterestRequest,
  token: string
): Promise<CityLeadInterestResponse> {
  return request<CityLeadInterestResponse>("/api/admin/cities/lead-interest", "POST", data, token);
}

// ============================================================================
// METRIC ORDERING API
// ============================================================================

export interface MetricOrderingItem {
  id?: number;
  city_id?: number;
  category_name: string;
  category_order: number;
  metric_id: number | null;
  metric_order: number;
  metric_name?: string;
}

export interface MetricOrderingResponse {
  city_id: number;
  orderings: MetricOrderingItem[];
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
// BATCH METRIC EXECUTION API
// ============================================================================

export interface BatchExecuteMetricsRequest {
  city_id: number;
  metric_ids?: number[] | null;
  period_type?: "day" | "month" | "year" | null;
  start_date?: string | null;
  end_date?: string | null;
  max_concurrent?: number;
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

// Force rebuild - all exports are defined above


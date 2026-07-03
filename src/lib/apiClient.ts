/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-empty-object-type */
import { getApiBaseUrl } from "./apiBase";
import { getImpersonationCacheKey, getImpersonationUserId } from "./impersonation";

type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

// Request deduplication cache for getSavedCities
const savedCitiesCache: {
  promise: Promise<any[]> | null;
  timestamp: number;
  token: string | null;
  identityKey: string | null;
} = {
  promise: null,
  timestamp: 0,
  token: null,
  identityKey: null,
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
  const url = `${getApiBaseUrl()}${path}`;
  const impersonationUserId = getImpersonationUserId();

  const headers: HeadersInit = {
    "Accept": "application/json",
  };

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  if (impersonationUserId != null) {
    headers["X-Impersonate-User-Id"] = String(impersonationUserId);
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

  if (res.status === 204 || res.status === 205) {
    return undefined as T;
  }

  const contentLength = res.headers.get("content-length");
  if (contentLength === "0") {
    return undefined as T;
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
  /** e.g. socrata, arcgis, ckan — from extra_metadata or URL inference */
  portal_type?: string | null;
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
  census_place_geoid?: string | null;
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
  census_place_geoid?: string | null;
  main_domain?: string | null;
  main_portal_url?: string | null;
  all_portal_urls?: string[];
  is_active?: boolean;
  is_launched?: boolean;
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
  most_recent_period_total: number | null;
}

export interface MetricRecordCountsResponse {
  city_id: number;
  counts: Record<number, MetricRecordCounts>;
}

export function getMetricRecordCounts(cityId: number, token: string): Promise<MetricRecordCountsResponse> {
  return request<MetricRecordCountsResponse>(
    `/api/admin/cities/${cityId}/metrics/record-counts`,
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

export interface DeleteCityResponse {
  deleted: boolean;
  city_id: number;
  message: string;
  details?: Record<string, unknown>;
}

export function deleteCity(
  cityId: number,
  token: string
): Promise<DeleteCityResponse> {
  return request<DeleteCityResponse>(
    `/api/admin/cities/${cityId}`,
    "DELETE",
    undefined,
    token
  );
}

// --- Population by district (admin) ---

export interface PopulationSourceConfig {
  id: number;
  city_id: number;
  source_type: string;
  source_url?: string | null;
  socrata_dataset_id?: string | null;
  socrata_domain?: string | null;
  source_name?: string | null;
  source_attribution_url?: string | null;
  refresh_mode: string;
  refresh_interval_hours?: number | null;
  last_refreshed_at?: string | null;
  last_refresh_status?: string | null;
  last_refresh_error?: string | null;
  config?: Record<string, unknown>;
  population_metric_id?: number | null;
  created_at?: string | null;
  updated_at?: string | null;
}

/** GET population source: full config when configured, or { configured: false } when no source. */
export type PopulationSourceGetResponse = (PopulationSourceConfig & { configured: true }) | { configured: false };

export interface PopulationRefreshResult {
  success: boolean;
  rows_written?: number;
  source_name?: string;
  source_url?: string | null;
  error?: string;
}

export function getPopulationSource(cityId: number, token: string): Promise<PopulationSourceGetResponse> {
  return request<PopulationSourceGetResponse>(`/api/admin/population/sources/${cityId}`, "GET", undefined, token);
}

export function refreshPopulation(cityId: number, token: string): Promise<PopulationRefreshResult> {
  return request<PopulationRefreshResult>(`/api/admin/population/refresh/${cityId}`, "POST", undefined, token);
}

export interface PopulationSyncResult {
  success: boolean;
  charts_updated?: number;
  metric_id?: number;
  districts?: number;
  error?: string;
  message?: string;
  /** When true, no dashboard metric was updated; city population row may still be synced */
  metric_sync_skipped?: boolean;
  city_population?: number | null;
  city_population_updated?: boolean;
}

export function syncPopulationToMetric(cityId: number, token: string): Promise<PopulationSyncResult> {
  return request<PopulationSyncResult>(`/api/admin/population/sync/${cityId}`, "POST", undefined, token);
}

export interface RefreshAllAcsResult {
  refreshed: Array<{ city_id: number; city_name?: string; rows_written?: number; charts_updated?: number }>;
  errors: Array<{ city_id: number; city_name?: string; error: string }>;
  refreshed_count: number;
  error_count: number;
}

export function refreshAllAcs(
  token: string,
  params?: { sync_to_metric_after?: boolean; city_ids?: number[] }
): Promise<RefreshAllAcsResult> {
  const sp = new URLSearchParams();
  if (params?.sync_to_metric_after !== false) sp.set("sync_to_metric_after", "true");
  if (params?.city_ids?.length) params.city_ids.forEach((id) => sp.append("city_ids", String(id)));
  const search = sp.toString() ? `?${sp.toString()}` : "";
  return request<RefreshAllAcsResult>(`/api/admin/population/refresh-all-acs${search}`, "POST", undefined, token);
}

export interface LookupCensusGeoidResult {
  city_id: number;
  city_name?: string;
  state?: string | null;
  census_place_geoid: string | null;
  updated?: boolean;
  message?: string;
}

export function lookupCensusGeoid(
  cityId: number,
  token: string,
  params?: { update_city?: boolean; ensure_acs_source?: boolean; census_api_key?: string }
): Promise<LookupCensusGeoidResult> {
  const sp = new URLSearchParams();
  if (params?.update_city) sp.set("update_city", "true");
  if (params?.ensure_acs_source) sp.set("ensure_acs_source", "true");
  if (params?.census_api_key) sp.set("census_api_key", params.census_api_key);
  const q = sp.toString() ? `?${sp.toString()}` : "";
  return request<LookupCensusGeoidResult>(`/api/admin/population/lookup-census-geoid/${cityId}${q}`, "POST", undefined, token);
}

export interface PopulationMetricIdResult {
  population_metric_id: number;
}

export function getPopulationMetricId(cityId: number, token: string): Promise<PopulationMetricIdResult> {
  return request<PopulationMetricIdResult>(`/api/admin/population/sources/${cityId}/metric-id`, "GET", undefined, token);
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

/** Template instantiation status for one template in a city */
export interface TemplateInstantiationStatusItem {
  template_id: number;
  template_name: string;
  status: "instantiated" | "not_instantiated";
  metric_id?: number | null;
  /** Display category from the platform template metric */
  category?: string | null;
  subcategory?: string | null;
  /** Slug derived from category (stable ordering / filters) */
  category_slug?: string | null;
}

/** Response for GET template-instantiation-status */
export interface TemplateInstantiationStatusResponse {
  city_id: number;
  templates: TemplateInstantiationStatusItem[];
}

export function getTemplateInstantiationStatus(
  cityId: number,
  token: string
): Promise<TemplateInstantiationStatusResponse> {
  return request<TemplateInstantiationStatusResponse>(
    `/api/admin/cities/${cityId}/template-instantiation-status`,
    "GET",
    undefined,
    token
  );
}

/** Optional body for template instantiation (single or all). */
export interface InstantiateTemplateRequest {
  model_key?: string | null;
  only_missing?: boolean;
}

export function instantiateSingleTemplate(
  cityId: number,
  templateId: number,
  token: string,
  body?: InstantiateTemplateRequest
): Promise<JobResponse> {
  return request<JobResponse>(
    `/api/admin/cities/${cityId}/instantiate-template/${templateId}`,
    "POST",
    body ?? undefined,
    token
  );
}

export function instantiateAllTemplates(
  cityId: number,
  token: string,
  body?: InstantiateTemplateRequest
): Promise<JobResponse> {
  return request<JobResponse>(
    `/api/admin/cities/${cityId}/instantiate-all-templates`,
    "POST",
    body ?? undefined,
    token
  );
}

export interface StructureMetricsBatchRequest {
  city_ids: number[];
  template_ids?: number[] | null;
  model_key?: string | null;
  only_missing?: boolean;
}

export function startStructureMetricsBatch(
  payload: StructureMetricsBatchRequest,
  token: string
): Promise<JobResponse> {
  return request<JobResponse>(
    "/api/admin/structure-metrics-batch",
    "POST",
    payload,
    token
  );
}

export interface StructureMetricsLastRunSummary {
  success?: boolean | null;
  last_run_at?: string | null;
  model_key?: string | null;
  errors?: string[] | null;
  opportunities?: string[] | null;
}

export function getStructureMetricsLastRuns(
  cityIds: number[],
  token: string
): Promise<Record<string, StructureMetricsLastRunSummary>> {
  if (cityIds.length === 0) return Promise.resolve({});
  const query = new URLSearchParams({ city_ids: cityIds.join(",") });
  return request<Record<string, StructureMetricsLastRunSummary>>(
    `/api/admin/structure-metrics-last-runs?${query}`,
    "GET",
    undefined,
    token
  );
}

export interface CityDataDashboardStats {
  total_metrics: number;
  cities_with_metrics_count: number;
}

export function getCityDataDashboardStats(
  token: string
): Promise<CityDataDashboardStats> {
  return request<CityDataDashboardStats>(
    "/api/admin/city-data-dashboard-stats",
    "GET",
    undefined,
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
      fetch_metadata: true,
      refresh: true,
    },
    token
  );
}

/** Metadata-only load; refresh must stay false — backend refresh deletes DB rows before fetch. */
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

export interface PortalMatchSignal {
  name: string;
  score: number;
  desc: string;
}

export interface PortalMatchCandidate {
  url: string;
  hostname_score: number;
  total_score: number;
  source: "existing_url" | "heuristic" | "web_search" | string;
  signals: PortalMatchSignal[];
  probe_status: "success" | "not_found" | "blocked_403" | "error" | "unprobed" | string;
  api_format: string | null;
  winning_endpoint: string | null;
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
  /** complete | partial | not_started */
  structure_status?: string;
  /** District field name(s) identified during city structure analysis */
  district_fields?: string[];
  is_active?: boolean;
  is_launched?: boolean;
  population_source_type?: string | null;
  population_source_name?: string | null;
  population_data_year?: number | null;
  portal_type?: string | null;
  /** Set by "Determine Portal Type" job: matched | review_needed | unresolved */
  portal_match_status?: string | null;
  /** Set by "Determine Portal Type" job: high | medium | low */
  portal_match_confidence?: string | null;
  /** Top candidate origins from last matcher run, for review_needed cities */
  portal_match_candidates?: PortalMatchCandidate[] | null;
  template_metrics_attempted?: number;
  template_metrics_instantiated?: number;
  template_metrics_missing?: number;
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

/**
 * Accept a candidate from the portal matcher review queue as the city's canonical portal.
 * Sets main_portal_url, main_domain, portal_type, and clears the review badge.
 */
export function acceptPortalMatch(
  cityId: number,
  candidateUrl: string,
  candidateApiFormat: string | null | undefined,
  token: string
): Promise<{ city_id: number; accepted_url: string; status: string }> {
  return request(
    `/api/admin/cities/${cityId}/accept-portal-match`,
    "POST",
    { candidate_url: candidateUrl, candidate_api_format: candidateApiFormat ?? null },
    token
  );
}

/**
 * Start async job: per city, optionally discover open-data portal if missing,
 * probe catalog API for platform type, set extra_metadata.portal_type.
 * Does not merge catalog rows into the DB (use load-data for that).
 */
export function determinePortalTypes(
  cityIds: number[],
  token: string
): Promise<LoadCityDataResponse> {
  return request<LoadCityDataResponse>(
    "/api/admin/cities/determine-portal-types",
    "POST",
    { city_ids: cityIds },
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
  session_user_id?: number;
  email: string;
  role: string;
  permissions: string[];
  is_admin: boolean;
  is_impersonating?: boolean;
  impersonated_by_db_user_id?: number | null;
  impersonated_by_email?: string | null;
  city_lead_city_ids?: number[];
  is_city_lead?: boolean;
}

export function getMyPermissions(token: string): Promise<UserPermissions> {
  return request<UserPermissions>("/api/admin/me/permissions", "GET", undefined, token);
}

export interface SeoPreviewImagePatchResponse {
  metadata: Record<string, unknown>;
  data: unknown[];
  count: number;
  sibling_chart_ids?: Record<string, number> | null;
}

export function patchTimeSeriesSeoPreviewImage(
  chartId: number,
  body: { seo_og_image_url: string | null },
  token: string
): Promise<SeoPreviewImagePatchResponse> {
  return request<SeoPreviewImagePatchResponse>(
    `/api/time-series/${chartId}/seo-preview-image`,
    "PATCH",
    body,
    token
  );
}

export function patchMapSeoPreviewImage(
  mapId: number,
  body: { seo_og_image_url: string | null },
  token: string
): Promise<Record<string, unknown>> {
  return request<Record<string, unknown>>(
    `/api/maps/${mapId}/seo-preview-image`,
    "PATCH",
    body,
    token
  );
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
  time_series_count?: number;
  changed_since_last_run?: boolean | null;
  has_location_fields?: boolean;
  has_category_fields?: boolean;
  has_map_fields?: boolean;
  supports_districts?: boolean;
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

/** Response from metrics import API. */
export interface AdminMetricsImportResponse {
  message: string;
  metrics_imported: number;
  orderings_imported: number;
}

/**
 * Export metrics (and city ordering) as JSON; returns blob for download.
 * Optionally filter by city_id (export only that city's metrics + deps).
 */
export async function exportAdminMetrics(
  token: string,
  options?: { city_id?: number }
): Promise<Blob> {
  const query = options?.city_id != null ? `?city_id=${options.city_id}` : "";
  const res = await fetch(`${getApiBaseUrl()}/api/admin/metrics/export${query}`, {
    method: "GET",
    credentials: "include",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Export failed: ${res.status} ${text}`);
  }
  return res.blob();
}

/**
 * Import metrics from a JSON file (from Export). Optionally remap all city_id to target_city_id.
 */
export async function importAdminMetrics(
  token: string,
  file: File,
  options?: { target_city_id?: number }
): Promise<AdminMetricsImportResponse> {
  const form = new FormData();
  form.append("file", file);
  const query =
    options?.target_city_id != null
      ? `?target_city_id=${options.target_city_id}`
      : "";
  const res = await fetch(`${getApiBaseUrl()}/api/admin/metrics/import${query}`, {
    method: "POST",
    credentials: "include",
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Import failed: ${res.status} ${text}`);
  }
  return res.json();
}

/** Full platform metadata bundle (cities, structure, leaders, jobs, metrics). */
export async function exportAdminPlatformMetadata(
  token: string,
  options?: { city_id?: number; include_shapefile_geometry?: boolean }
): Promise<Blob> {
  const params = new URLSearchParams();
  if (options?.city_id != null) params.set("city_id", String(options.city_id));
  if (options?.include_shapefile_geometry === true) {
    params.set("include_shapefile_geometry", "true");
  }
  const q = params.toString();
  const res = await fetch(
    `${getApiBaseUrl()}/api/admin/metrics/metadata-bundle/export${q ? `?${q}` : ""}`,
    {
      method: "GET",
      credentials: "include",
      headers: { Authorization: `Bearer ${token}` },
    }
  );
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Platform export failed: ${res.status} ${text}`);
  }
  return res.blob();
}

export interface AdminPlatformMetadataImportResponse {
  message: string;
  counts: Record<string, number>;
}

export async function importAdminPlatformMetadata(
  token: string,
  file: File,
  options?: { target_city_id?: number }
): Promise<AdminPlatformMetadataImportResponse> {
  const form = new FormData();
  form.append("file", file);
  const query =
    options?.target_city_id != null
      ? `?target_city_id=${options.target_city_id}`
      : "";
  const res = await fetch(
    `${getApiBaseUrl()}/api/admin/metrics/metadata-bundle/import${query}`,
    {
      method: "POST",
      credentials: "include",
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    }
  );
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Platform import failed: ${res.status} ${text}`);
  }
  return res.json();
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
    /** Metrics whose template_id matches (e.g. all cities' metrics from a template). */
    template_id?: number;
    /** Filter by last run status: failed, completed, cancelled, timeout, or never */
    last_execution_status?: string;
    /** Include record counts (slower). Default false for fast list load. */
    include_record_counts?: boolean;
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
  if (options?.template_id !== undefined) params.append("template_id", options.template_id.toString());
  if (options?.last_execution_status) params.append("last_execution_status", options.last_execution_status);
  if (options?.include_record_counts === true) params.append("include_record_counts", "true");
  if (options?.force_refresh) params.append("_t", Date.now().toString());

  const query = params.toString();
  // No trailing slash before `?`: Vercel 308-strips `/api/admin/metrics/` →
  // `/api/admin/metrics`, then the API 307 to api.* drops Authorization.
  const path = `/api/admin/metrics${query ? `?${query}` : ""}`;
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
  return request<AdminMetricWriteResponse>("/api/admin/metrics", "POST", payload, token);
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

/** Merge-patch specific keys into a metric's metadata JSON without touching other keys. */
export function patchMetricMetadata(
  metricId: number,
  patch: Record<string, unknown>,
  token: string
): Promise<AdminMetricWriteResponse> {
  return request<AdminMetricWriteResponse>(
    `/api/admin/metrics/${metricId}/metadata-patch`,
    "PATCH",
    { patch },
    token
  );
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
  /**
   * When set (e.g. saved My place), spatial filter matches saved-place metrics: lat/lon metrics use
   * the same bounding box as the purple map overlay; point-geometry metrics use a geodesic circle.
   */
  center_lat?: number | null;
  center_lon?: number | null;
  radius_m?: number | null;
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
  const body: any = {
    start_date: payload.start_date,
    end_date: payload.end_date,
  };
  if (payload.districts && payload.districts.length > 0) {
    body.districts = payload.districts;
  }
  if (payload.center_lat != null && payload.center_lon != null && payload.radius_m != null && payload.radius_m > 0) {
    body.center_lat = payload.center_lat;
    body.center_lon = payload.center_lon;
    body.radius_m = payload.radius_m;
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
  total_prompt_tokens?: number;
  total_completion_tokens?: number;
  estimated_cost_usd?: number;
  llm_call_count: number;
  message_count: number;
  created_at: string;
  last_message_at?: string;
}

export interface SessionStats {
  session_id: string;
  total_tokens_used: number;
  total_prompt_tokens?: number;
  total_completion_tokens?: number;
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
  model_key: string = "claude-sonnet-4.6",
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
    total_prompt_tokens: session.total_prompt_tokens ?? 0,
    total_completion_tokens: session.total_completion_tokens ?? 0,
    llm_call_count: session.llm_call_count,
    total_execution_time_ms: session.total_execution_time_ms,
    model_key: session.model_key || "",
    last_message_at: session.last_message_at || null,
    created_at: session.created_at,
    estimated_cost_usd: session.estimated_cost_usd ?? 0,
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
  job_id?: string,
  job_type?: string,
  schedule_key?: string
): Promise<JobsListResponse> {
  const params = new URLSearchParams();
  params.append("limit", limit.toString());
  if (status) params.append("job_status", status);
  if (job_id) params.append("job_id", job_id);
  if (job_type) params.append("job_type", job_type);
  if (schedule_key) params.append("schedule_key", schedule_key);

  const query = params.toString();
  const path = `/api/jobs${query ? `?${query}` : ""}`;

  try {
    return await request<JobsListResponse>(path, "GET", undefined, token);
  } catch {
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

/** City Health dashboard: execution + data freshness per schedule */
export interface CityFreshness {
  total_metrics: number;
  fresh_daily: number;
  fresh_weekly: number;
  fresh_monthly: number;
  fresh_annual: number;
  no_data: number;
  newest_data_date: string | null;
  oldest_data_date: string | null;
}

export type FreshnessMetricBucket = "no_data" | "current" | "slightly_stale" | "stale";

export interface CityFreshnessMetricRow {
  metric_id: number;
  metric_name: string;
  most_recent_data_date: string | null;
  days_old: number | null;
  bucket: FreshnessMetricBucket;
  last_execution_at: string | null;
  last_execution_status: string | null;
  /** Active time_series_metadata rows for this metric */
  charts: number;
  /** Metric category */
  category?: string | null;
  /** Template this metric was instantiated from */
  template_id?: number | null;
  template_name?: string | null;
  /** Full metadata JSON — used for reviewed flag and other ad-hoc fields */
  metadata?: Record<string, unknown> | null;
  /** District column in map_config / location_fields heuristic */
  has_district_field?: boolean;
  /** District configured, has data date, last run success/completed */
  district_working?: boolean;
  /** map_query or map_config map_query / lat+lon */
  has_map_fields?: boolean;
  /** Point column or lat/lon — usable for saved-place filtering */
  has_precise_location?: boolean;
  /** Whether metric appears on the public city dashboard */
  show_on_dash?: boolean;
}

/** City governance / geo / metric wiring (city-health API structure block) */
export interface CityScheduleStructureCounts {
  elected_officials: number;
  geographic_structures: number;
  shape_layers: number;
}

export interface CityScheduleStructureSummary {
  elected_officials: boolean;
  geographic_structures: boolean;
  shape_layers: boolean;
  population_defined: boolean;
  city_district_fields: boolean;
  counts: CityScheduleStructureCounts;
  metrics_total: number;
  metrics_with_district_field: number;
  metrics_district_working: number;
  metrics_with_map_fields: number;
}

export interface CityScheduleRun {
  job_id: string;
  status: "pending" | "running" | "completed" | "failed" | "cancelled";
  created_at: string | null;
  updated_at: string | null;
  completed_at: string | null;
  duration_seconds: number | null;
  metrics_total: number | null;
  metrics_completed: number | null;
  metrics_failed: number | null;
  failed_metric_names: string[];
  is_overdue: boolean;
}

export interface CityScheduleSlot {
  last_run: CityScheduleRun | null;
  recent_runs: CityScheduleRun[];
  is_overdue: boolean;
}

export interface CityScheduleHealth {
  city_id: number;
  city_name: string;
  is_launched: boolean;
  freshness: CityFreshness;
  freshness_metrics: CityFreshnessMetricRow[];
  schedules: Record<string, CityScheduleSlot>;
  structure?: CityScheduleStructureSummary;
}

export interface CityScheduleHealthResponse {
  status: string;
  cities: CityScheduleHealth[];
}

export function getCityScheduleHealth(
  token: string,
  options?: { scheduleKey?: string; daysBack?: number }
): Promise<CityScheduleHealthResponse> {
  const params = new URLSearchParams();
  if (options?.scheduleKey) params.set("schedule_key", options.scheduleKey);
  if (options?.daysBack != null) params.set("days_back", String(options.daysBack));
  const q = params.toString();
  return request<CityScheduleHealthResponse>(
    `/api/jobs/schedules/city-health${q ? `?${q}` : ""}`,
    "GET",
    undefined,
    token
  );
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
  custom_schedules: CustomScheduledJob[];
  total_count: number;
}

export function getAllScheduledJobs(token: string): Promise<ScheduledJobsAllResponse> {
  return request<ScheduledJobsAllResponse>("/api/jobs/schedules/all", "GET", undefined, token);
}

export interface PlaceRefreshLastRunResponse {
  last_run_at: string | null;
}

/** When the personalized place refresh job last ran; for dashboard display. */
export function getPlaceRefreshLastRun(token: string): Promise<PlaceRefreshLastRunResponse> {
  return request<PlaceRefreshLastRunResponse>("/api/jobs/place-refresh-last-run", "GET", undefined, token);
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

export function runCustomScheduledJobForCurrentUser(jobId: number, token: string): Promise<any> {
  return request(`/api/jobs/schedules/custom/${jobId}/run`, "POST", { use_current_user: true }, token);
}

async function _executeChatStream(
  url: string,
  request: ChatMessageRequest,
  token: string,
  onEvent: (event: StreamEvent) => void,
  abortSignal?: AbortSignal
): Promise<{ eventCount: number }> {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      Accept: "text/event-stream",
    },
    body: JSON.stringify(request),
    signal: abortSignal,
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
  const MAX_IDLE_TIME = 180000; // 3 minutes (backend sends heartbeats every 15s)
  const HEARTBEAT_CHECK_INTERVAL = 30000;

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

      lastActivity = Date.now();
      buffer += decoder.decode(value, { stream: true });

      const events = buffer.split("\n\n");
      buffer = events.pop() || "";

      for (const eventBlock of events) {
        if (eventBlock.trim() === "") continue;

        const lines = eventBlock.split("\n");
        for (const line of lines) {
          if (line.trim() === "") continue;

          if (line.startsWith("data: ")) {
            try {
              const jsonStr = line.slice(6);
              const data = JSON.parse(jsonStr);

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
  } finally {
    clearInterval(heartbeatChecker);
    try {
      reader.releaseLock();
    } catch {
      // Reader may already be released
    }
  }

  return { eventCount };
}

const MAX_STREAM_RETRIES = 2;
const RETRY_BASE_DELAY_MS = 1500;

export async function sendChatMessageStream(
  request: ChatMessageRequest,
  token: string,
  onEvent: (event: StreamEvent) => void,
  abortSignal?: AbortSignal
): Promise<void> {
  const url = `${getApiBaseUrl()}/api/chat/message/stream`;

  let lastError: unknown = null;

  for (let attempt = 0; attempt <= MAX_STREAM_RETRIES; attempt++) {
    if (abortSignal?.aborted) return;

    try {
      await _executeChatStream(
        url,
        request,
        token,
        onEvent,
        abortSignal
      );

      // Stream completed normally (reader.read() returned done)
      return;
    } catch (error) {
      lastError = error;

      const isAbortError =
        error instanceof Error &&
        (error.name === "AbortError" ||
          error.message.includes("aborted") ||
          error.message.includes("cancelled"));

      if (isAbortError) {
        return;
      }

      // Only retry on network-level errors (not HTTP 4xx/5xx which are already handled)
      const isNetworkError =
        error instanceof TypeError ||
        (error instanceof Error &&
          (error.message.toLowerCase().includes("network") ||
            error.message.toLowerCase().includes("failed to fetch") ||
            error.message.toLowerCase().includes("load failed") ||
            error.message.toLowerCase().includes("connection") ||
            error.message.toLowerCase().includes("terminated")));

      if (!isNetworkError || attempt >= MAX_STREAM_RETRIES) {
        break;
      }

      const delay = RETRY_BASE_DELAY_MS * Math.pow(2, attempt);
      console.warn(
        `⚠️ Stream network error (attempt ${attempt + 1}/${MAX_STREAM_RETRIES + 1}), retrying in ${delay}ms...`,
        error
      );

      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  // All retries exhausted -- forward the error
  if (lastError) {
    try {
      onEvent({
        type: "error",
        content:
          lastError instanceof Error
            ? lastError.message
            : String(lastError),
      });
    } catch {
      // Callback may have been cleaned up
    }
    throw lastError;
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
  latitude?: number | null;
  longitude?: number | null;
  main_domain?: string | null;
  main_portal_url?: string | null;
  all_portal_urls?: string[] | null;
  datasets_count: number;
  is_active: boolean;
  is_launched?: boolean;
  structure_status?: string | null;
  geographic_structures?: Array<{
    id?: number;
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

export function subscribeNewsletter(
  cityId: number,
  district: string,
  frequency: "weekly" | "monthly",
  email: string,
  token: string
): Promise<{ subscribed: boolean; city_id: number; district: string; frequency: string; email: string }> {
  return request(
    `/api/newsletter/subscribe`,
    "POST",
    { city_id: cityId, district, frequency, email },
    token
  );
}

export function unsubscribeNewsletter(
  cityId: number,
  district: string,
  frequency: "weekly" | "monthly",
  email: string,
  token: string
): Promise<{ subscribed: boolean; city_id: number; district: string; frequency: string; email: string }> {
  return request(
    `/api/newsletter/unsubscribe`,
    "POST",
    { city_id: cityId, district, frequency, email },
    token
  );
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
  identifier_field_aliases?: string[];
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

export interface UpdateShapeLayerInstanceRequest {
  identifier_field?: string;
  identifier_field_aliases?: string[];
  status?: "active" | "disabled" | "needs_refresh";
  render_order?: number;
  style_overrides_json?: Record<string, any>;
  shapefile_name?: string;
}

export interface UpdateShapeLayerInstanceResponse {
  city_id: number;
  instance_id: number;
  updated: boolean;
  layer: CityShapeLayerListItem | null;
}

export function updateShapeLayerInstance(
  cityId: number,
  instanceId: number,
  updates: UpdateShapeLayerInstanceRequest,
  token: string
): Promise<UpdateShapeLayerInstanceResponse> {
  return request<UpdateShapeLayerInstanceResponse>(
    `/api/shape-layers/cities/${cityId}/instances/${instanceId}`,
    "PUT",
    updates,
    token
  );
}

export interface DeleteShapeLayerInstanceResponse {
  city_id: number;
  instance_id: number;
  deleted: boolean;
}

export function deleteShapeLayerInstance(
  cityId: number,
  instanceId: number,
  token: string
): Promise<DeleteShapeLayerInstanceResponse> {
  return request<DeleteShapeLayerInstanceResponse>(
    `/api/shape-layers/cities/${cityId}/instances/${instanceId}`,
    "DELETE",
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
      return [];
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
  const identityKey = getImpersonationCacheKey();
  
  // Check if we have a valid cached promise for the same token
  if (
    savedCitiesCache.promise &&
    savedCitiesCache.token === token &&
    savedCitiesCache.identityKey === identityKey &&
    (now - savedCitiesCache.timestamp) < SAVED_CITIES_CACHE_TTL
  ) {
    return savedCitiesCache.promise as Promise<SavedCity[]>;
  }
  
  // Create new request and cache it
  const promise = request<SavedCity[]>("/api/cities/saved", "GET", undefined, token);
  savedCitiesCache.promise = promise;
  savedCitiesCache.timestamp = now;
  savedCitiesCache.token = token;
  savedCitiesCache.identityKey = identityKey;
  
  // Clear cache on error to allow retry
  promise.catch(() => {
    if (savedCitiesCache.promise === promise) {
      savedCitiesCache.promise = null;
      savedCitiesCache.timestamp = 0;
      savedCitiesCache.identityKey = null;
    }
  });
  
  return promise;
}

// Clear the saved cities cache (call this when cities are saved/unsaved)
export function clearSavedCitiesCache(): void {
  savedCitiesCache.promise = null;
  savedCitiesCache.timestamp = 0;
  savedCitiesCache.token = null;
  savedCitiesCache.identityKey = null;
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

// Saved Districts (My Districts) API - followed representatives
export interface SavedDistrict {
  city_id: number;
  district: string;
  display_name: string;
  city_name: string;
}

export function getSavedDistricts(token: string): Promise<SavedDistrict[]> {
  return request<SavedDistrict[]>("/api/cities/saved-districts", "GET", undefined, token);
}

// ---------------------------------------------------------------------------
// User Places (saved places / My place) API
// ---------------------------------------------------------------------------

export interface UserPlace {
  id: number;
  user_id: string;
  city_id: number;
  label: string;
  lat: number;
  lng: number;
  radius_m: number;
  created_at: string | null;
  updated_at: string | null;
}

/** Response from listMyPlaces; includes batch place-refresh time to avoid a separate API call. */
export interface ListMyPlacesResponse {
  places: UserPlace[];
  place_refresh_last_run_at: string | null;
}

export interface PlaceTimeSeriesPoint {
  metric_id: number;
  period_type: string;
  time_period: string;
  value: number;
  updated_at: string | null;
}

export interface PlaceAnomaly {
  id: number;
  metric_id: number;
  object_id: string;
  object_name: string | null;
  period_type: string;
  time_period: string | null;
  recent_mean: number | null;
  comparison_mean: number | null;
  stddev: number | null;
  difference: number | null;
  pct_change: number | null;
  is_anomaly: boolean;
  chart_payload: Record<string, unknown> | null;
  created_at: string | null;
}

export function listMyPlaces(
  token: string,
  options?: { city_id?: number }
): Promise<ListMyPlacesResponse> {
  const query = options?.city_id != null ? `?city_id=${options.city_id}` : "";
  return request<ListMyPlacesResponse>(`/api/users/me/places${query}`, "GET", undefined, token);
}

export function createPlace(
  token: string,
  body: { city_id: number; label: string; lat: number; lng: number; radius_m?: number }
): Promise<UserPlace> {
  return request<UserPlace>("/api/users/me/places", "POST", body, token);
}

export function getPlace(placeId: number, token: string): Promise<UserPlace> {
  return request<UserPlace>(`/api/users/me/places/${placeId}`, "GET", undefined, token);
}

export function updatePlace(
  placeId: number,
  token: string,
  body: { label?: string; lat?: number; lng?: number; radius_m?: number }
): Promise<UserPlace> {
  return request<UserPlace>(`/api/users/me/places/${placeId}`, "PATCH", body, token);
}

export function deletePlace(placeId: number, token: string): Promise<void> {
  return request<void>(`/api/users/me/places/${placeId}`, "DELETE", undefined, token);
}

export function getPlaceMetrics(
  placeId: number,
  token: string
): Promise<{ place_id: number; time_series: PlaceTimeSeriesPoint[] }> {
  return request(`/api/users/me/places/${placeId}/metrics`, "GET", undefined, token);
}

export function getPlaceAnomalies(
  placeId: number,
  token: string
): Promise<{ place_id: number; anomalies: PlaceAnomaly[] }> {
  return request(`/api/users/me/places/${placeId}/anomalies`, "GET", undefined, token);
}

export function runPlaceMetricsAndAnomalies(
  placeId: number,
  token: string
): Promise<{
  place_id: number;
  metrics: { ok: boolean; metrics_run?: number; error?: string };
  anomalies: { ok: boolean; anomalies_written?: number; error?: string };
}> {
  return request(`/api/users/me/places/${placeId}/run`, "POST", undefined, token);
}

/** Start place metrics + anomalies refresh as a background job. Returns job_id; poll getJob until completed/failed. */
export function runPlaceMetricsAndAnomaliesAsJob(
  placeId: number,
  token: string,
  body?: { district?: number | null; weekly_newsletter?: boolean | null }
): Promise<{ job_id: string; message: string }> {
  const payload: Record<string, unknown> = {};
  if (body?.district != null && body.district > 0) {
    payload.district = body.district;
  }
  if (body?.weekly_newsletter != null) {
    payload.weekly_newsletter = body.weekly_newsletter;
  }
  return request<{ job_id: string; message: string }>(
    `/api/users/me/places/${placeId}/run-as-job`,
    "POST",
    Object.keys(payload).length ? payload : {},
    token
  );
}

/**
 * Trigger the personalized onboarding welcome email (email 1) for all sign-up types.
 * Covers city, district, place-level, and unsupported/unlaunched cities.
 * Idempotent — safe to call even if the email was already sent.
 */
export function sendOnboardingWelcomeEmail(
  token: string,
  opts: {
    city_id?: number | null;
    district?: number | null;
    place_id?: number | null;
    weekly_newsletter?: boolean | null;
    scope?: "place" | "district" | "city" | "unsupported" | null;
    unsupported_city_name?: string | null;
    unsupported_state?: string | null;
    unsupported_country?: string | null;
  }
): Promise<{ success: boolean }> {
  const payload: Record<string, unknown> = {};
  if (opts.city_id != null && opts.city_id > 0) payload.city_id = opts.city_id;
  if (opts.district != null && opts.district > 0) payload.district = opts.district;
  if (opts.place_id != null && opts.place_id > 0) payload.place_id = opts.place_id;
  if (opts.weekly_newsletter != null) payload.weekly_newsletter = opts.weekly_newsletter;
  if (opts.scope != null) payload.scope = opts.scope;
  if (opts.unsupported_city_name) payload.unsupported_city_name = opts.unsupported_city_name;
  if (opts.unsupported_state) payload.unsupported_state = opts.unsupported_state;
  if (opts.unsupported_country) payload.unsupported_country = opts.unsupported_country;
  return request<{ success: boolean }>("/api/user/onboarding-welcome-email", "POST", payload, token);
}

/** Fetch the user's DB profile (includes picture, first_name, last_name). */
export interface DbUserProfile {
  picture?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  onboarding_complete?: boolean;
  user_role_type?: string;
  has_places?: boolean;
}

export function getDbUserProfile(token: string): Promise<DbUserProfile> {
  return request<DbUserProfile>("/api/user/profile", "GET", undefined, token);
}

/** Update the user's first name and last name. */
export function updateUserProfile(
  token: string,
  opts: { first_name?: string | null; last_name?: string | null }
): Promise<{ success: boolean; first_name?: string; last_name?: string; name?: string; picture?: string }> {
  const payload: Record<string, unknown> = {};
  if (opts.first_name !== undefined) payload.first_name = opts.first_name ?? "";
  if (opts.last_name !== undefined) payload.last_name = opts.last_name ?? "";
  return request("/api/user/me/profile", "PATCH", payload, token);
}

/** Upload a profile avatar image (max 2 MB, jpeg/png/webp). */
export async function uploadAvatar(
  token: string,
  file: File
): Promise<{ success: boolean; picture_url: string }> {
  const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "";
  const form = new FormData();
  form.append("file", file);
  const res = await fetch(`${API_BASE}/api/user/me/avatar`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Avatar upload failed (${res.status}): ${text}`);
  }
  return res.json();
}

/** Admin-only: force-resend the onboarding welcome email to the signed-in admin. */
export function resendWelcomeEmail(token: string): Promise<{
  success: boolean;
  detail?: string;
  email_type?: "place" | "city";
  to_email?: string;
  place_id?: number;
  city_id?: number;
}> {
  return request("/api/user/resend-welcome-email", "POST", undefined, token);
}

/** Same request shape as batch comparisons for city/district; used for place dashboard parity. */
export interface PlaceComparisonsBatchRequest {
  metric_ids: number[];
  comparison_types?: ComparisonType[];
}

/** Same response shape as BatchComparisonsResponse so dashboard can use one code path. */
export function getPlaceComparisonsBatch(
  placeId: number,
  requestBody: PlaceComparisonsBatchRequest,
  token: string
): Promise<BatchComparisonsResponse> {
  return request<BatchComparisonsResponse>(
    `/api/users/me/places/${placeId}/comparisons/batch`,
    "POST",
    requestBody,
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
  /** Portal / dataset landing page */
  url?: string;
  /** API or canonical resource URL (e.g. CKAN /dataset/.../resource/{uuid}, Socrata /resource/id.json) */
  api_url?: string | null;
  /** File or remote service URL from CKAN resource (often COSAGIS/ArcGIS), distinct from api_url */
  source_data_url?: string | null;
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

// Claim (elected official verification) API
export interface LeaderForClaim {
  id: number;
  city_id: number;
  name: string;
  title: string;
  district: number | null;
}

export interface ClaimResponse {
  id: number;
  user_id: number;
  leader_id: number;
  status: string;
  requested_at: string;
  reviewed_at: string | null;
  verification_notes: string | null;
  leader_name: string | null;
  leader_title: string | null;
  leader_district: number | null;
  city_id: number | null;
}

export function listLeadersForClaim(cityId: number): Promise<LeaderForClaim[]> {
  return request<LeaderForClaim[]>(`/api/claim/leaders?city_id=${cityId}`);
}

export function createClaim(leaderId: number, token: string): Promise<ClaimResponse> {
  return request<ClaimResponse>("/api/claim", "POST", { leader_id: leaderId }, token);
}

export function getMyClaims(token: string): Promise<ClaimResponse[]> {
  return request<ClaimResponse[]>("/api/claim/me", "GET", undefined, token);
}

export interface AdminClaimResponse {
  id: number;
  user_id: number;
  user_email: string | null;
  leader_id: number;
  leader_name: string;
  leader_title: string;
  leader_district: number | null;
  city_id: number;
  status: string;
  requested_at: string;
  reviewed_at: string | null;
  reviewed_by: number | null;
  verification_notes: string | null;
}

export function listAdminClaims(token: string, statusFilter?: string): Promise<AdminClaimResponse[]> {
  const q = statusFilter ? `?status_filter=${encodeURIComponent(statusFilter)}` : "";
  return request<AdminClaimResponse[]>(`/api/admin/claims${q}`, "GET", undefined, token);
}

export function updateAdminClaim(
  claimId: number,
  body: { status: "approved" | "rejected"; verification_notes?: string },
  token: string
): Promise<AdminClaimResponse> {
  return request<AdminClaimResponse>(`/api/admin/claims/${claimId}`, "PATCH", body, token);
}

// Inbound Email (Seymour's inbox) - Admin only
export interface InboundEmailListItem {
  id: number;
  from_email: string;
  from_name: string | null;
  to_email: string;
  subject: string | null;
  body_preview: string;
  status: string;
  spam_score: number | null;
  retry_count: number;
  received_at: string | null;
  processed_at: string | null;
  responded_at: string | null;
  error_message: string | null;
}

export interface InboundEmailListResponse {
  emails: InboundEmailListItem[];
  total: number;
  limit: number;
  offset: number;
}

export interface InboundEmailDetail {
  id: number;
  from_email: string;
  from_name: string | null;
  to_email: string;
  subject: string | null;
  body_plain: string | null;
  body_html: string | null;
  message_id: string | null;
  in_reply_to: string | null;
  attachments_count: number;
  spam_score: number | null;
  status: string;
  response_text: string | null;
  responded_at: string | null;
  error_message: string | null;
  retry_count: number;
  received_at: string | null;
  processed_at: string | null;
}

export function listInboundEmails(
  token: string,
  options?: { status?: string; limit?: number; offset?: number }
): Promise<InboundEmailListResponse> {
  const params = new URLSearchParams();
  if (options?.status) params.append("status", options.status);
  if (options?.limit != null) params.append("limit", String(options.limit));
  if (options?.offset != null) params.append("offset", String(options.offset));
  const query = params.toString();
  return request<InboundEmailListResponse>(
    `/api/admin/inbound-email/${query ? `?${query}` : ""}`,
    "GET",
    undefined,
    token
  );
}

export function getInboundEmail(emailId: number, token: string): Promise<InboundEmailDetail> {
  return request<InboundEmailDetail>(`/api/admin/inbound-email/${emailId}`, "GET", undefined, token);
}

// Seymour's outbox (outbound emails + newsletter sends)
export interface OutboundEmailListItem {
  id: number | string;
  to_email: string;
  subject: string;
  body_preview: string | null;
  prompt_text: string | null;
  source: string;
  user_id: number | null;
  city_id: number | null;
  created_at: string | null;
  type?: "outbound_email" | "newsletter_send";
  intended_email?: string | null;
  job_id?: string | null;
  session_id?: string | null;
  status?: string;
}

export interface OutboundEmailDetail {
  id: number;
  to_email: string;
  from_email: string | null;
  subject: string;
  body_html: string | null;
  body_plain: string | null;
  prompt_text: string | null;
  source: string;
  user_id: number | null;
  city_id: number | null;
  created_at: string | null;
}

export interface OutboundEmailListResponse {
  emails: OutboundEmailListItem[];
  total: number;
  limit: number;
  offset: number;
}

export function listOutboundEmails(
  token: string,
  options?: { limit?: number; offset?: number }
): Promise<OutboundEmailListResponse> {
  const params = new URLSearchParams();
  if (options?.limit != null) params.append("limit", String(options.limit));
  if (options?.offset != null) params.append("offset", String(options.offset));
  const query = params.toString();
  return request<OutboundEmailListResponse>(
    `/api/admin/outbound-email${query ? `?${query}` : ""}`,
    "GET",
    undefined,
    token
  );
}

export function getOutboundEmail(emailId: number, token: string): Promise<OutboundEmailDetail> {
  return request<OutboundEmailDetail>(`/api/admin/outbound-email/${emailId}`, "GET", undefined, token);
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
  government_verified?: boolean;
  government_pending_verification?: boolean;
  government_email?: string | null;
  government_user_type?: string | null;
  government_leader_id?: number | null;
  government_leader_name?: string | null;
  government_city_id?: number | null;
  government_district?: number | null;
  custom_email_prompt?: string | null;
  is_gift_recipient?: boolean;
  gift_info?: {
    from_name?: string | null;
    from_email?: string | null;
    place_label?: string | null;
    sent_at?: string | null;
    clicked_at?: string | null;
  } | null;
  gifts_sent_count?: number;
  gift_quota?: number;
}

export interface UpdateUserGovernmentStatusRequest {
  government_verified: boolean;
  government_email?: string | null;
  government_user_type?: "staff" | "elected_official" | null;
  government_leader_id?: number | null;
}

export interface UserUpdateRequest {
  role?: "admin" | "analyst" | "viewer";
  is_active?: boolean;
  custom_permissions?: string[];
  custom_email_prompt?: string | null;
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
  gift_subscriptions_sent?: number;
  gift_email_clicks?: number;
  gift_accounts_onboarded?: number;
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

export interface NewsletterSubscription {
  city_id: number;
  district: string;
  frequency: string;
}

export function getUserNewsletterSubscriptions(
  userId: number,
  token: string
): Promise<{ user_id: number; subscriptions: NewsletterSubscription[] }> {
  return request<{ user_id: number; subscriptions: NewsletterSubscription[] }>(
    `/api/admin/users/${userId}/newsletter-subscriptions`,
    "GET",
    undefined,
    token
  );
}

export function setUserNewsletterSubscriptions(
  userId: number,
  subscriptions: NewsletterSubscription[],
  token: string
): Promise<{
  status: string;
  user_id: number;
  subscriptions: NewsletterSubscription[];
  added: number;
  removed: number;
}> {
  return request(
    `/api/admin/users/${userId}/newsletter-subscriptions`,
    "PUT",
    { subscriptions },
    token
  );
}

/** Admin: one user's email prefs, home location, and newsletter_subscribers rows. */
export interface AdminUserNewsletterOverview {
  user_id: number;
  email: string | null;
  name: string | null;
  communication_preferences: Record<string, unknown>;
  /** Self-service text from profile / communication_preferences. */
  newsletter_description: string;
  /**
   * Admin-saved personal instructions (``users.custom_email_prompt``).
   * Weekly sends prefer this over ``newsletter_description`` when both are set.
   */
  custom_email_prompt?: string | null;
  newsletter_frequency: "weekly" | "monthly";
  home_location: { city_id?: number; district?: number | string | null } | null;
  subscriptions: NewsletterSubscription[];
  /** All rows in ``user_places`` for this user (saved places / My place pins and other pins). */
  saved_places_count?: number;
}

export function getAdminUserNewsletterOverview(
  userId: number,
  token: string
): Promise<AdminUserNewsletterOverview> {
  return request<AdminUserNewsletterOverview>(
    `/api/admin/users/${userId}/newsletter-overview`,
    "GET",
    undefined,
    token
  );
}

export interface AdminNewsletterHistoryItem {
  id: number | string;
  to_email: string;
  subject: string;
  source: string;
  user_id: number | null;
  city_id: number | null;
  created_at: string | null;
  type: "outbound_email" | "newsletter_send";
  status?: string;
  job_id?: string | null;
  session_id?: string | null;
  /** ID of the matching newsletter_pending_sends row, when the body is stored there. */
  pending_send_id?: number | null;
  /** LLM token usage pulled from the matching pending_send row, when available. */
  llm_usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number } | null;
}

export function getAdminUserNewsletterSendHistory(
  userId: number,
  token: string,
  options?: { limit?: number }
): Promise<{ user_id: number; email: string | null; items: AdminNewsletterHistoryItem[]; count: number }> {
  const params = new URLSearchParams();
  if (options?.limit != null) params.append("limit", String(options.limit));
  const q = params.toString();
  return request(
    `/api/admin/users/${userId}/newsletter-send-history${q ? `?${q}` : ""}`,
    "GET",
    undefined,
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

export function updateUserGovernmentStatus(
  userId: number,
  data: UpdateUserGovernmentStatusRequest,
  token: string
): Promise<User> {
  return request<User>(
    `/api/admin/users/${userId}/government-status`,
    "PATCH",
    data,
    token
  );
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

export function adminSetGiftQuota(
  userId: number,
  extraQuota: number,
  token: string
): Promise<User> {
  return request<User>(`/api/admin/users/${userId}/gift-quota`, "PATCH", { extra_quota: extraQuota }, token);
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
  /** False when the parent detection run was superseded by a newer run */
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

export interface AnomalyPlaceType {
  group_field: string;
  label: string;
  places: string[];
}

export interface AnomalyPlaceTypesResponse {
  place_types: AnomalyPlaceType[];
}

export function getAnomalyPlaceTypes(
  cityId: number,
  token: string
): Promise<AnomalyPlaceTypesResponse> {
  const params = new URLSearchParams();
  params.append("city_id", cityId.toString());
  return request<AnomalyPlaceTypesResponse>(
    `/api/anomalies/place-types?${params.toString()}`,
    "GET",
    undefined,
    token
  );
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
  city_name?: string | null;
  city_emoji?: string | null;
  district: number;
  /** When set, this card is tagged for a saved place (user_places.id) for place filters. */
  user_place_id?: number | null;
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
  /** Optional path to static image for feed card (e.g. /api/feed/public/story-image/{hash}). */
  image_url?: string | null;
  /**
   * Short alt text for the story image (screenreader-friendly).
   * Falls back to story headline when not set.
   */
  image_alt?: string | null;
  /**
   * Longer caption for the story image. Sourced from chart/anomaly/map metadata.
   * Rendered as visible fallback text when the image cannot be loaded.
   */
  image_caption?: string | null;
  /** Call-to-action label, e.g. "Read full report", "View metric", "View anomaly details". Defaults to "Read full report". */
  cta_label?: string | null;
  related_urls?: Array<Record<string, any>>;
  view_count: number;
  click_count: number;
  share_count: number;
  applaud_count: number;
  escalate_count: number;
  investigate_count: number;
  /** @deprecated Use applaud_count */
  like_count?: number;
  /** @deprecated Use escalate_count */
  comment_count?: number;
  priority_score: number;
  is_featured: boolean;
  status: string;
  story_date: string;
  published_at?: string | null;
  metadata?: Record<string, any>;
  created_at?: string | null;
  updated_at?: string | null;
  /** Current user's AI feedback (thumbs up/down); only when authenticated. */
  user_ai_feedback?: "up" | "down" | null;
  short_hash?: string | null;
  public_url?: string | null;
  /** Server-computed canonical URL path (e.g. /c/san-francisco/stories/abc123). Present on all active stories. */
  canonical_path?: string | null;
  /** Long-form HTML for the canonical public story page (feed-producer stories). */
  article_html?: string | null;
}

export interface FeedStoriesResponse {
  stories: FeedStory[];
  count: number;
  total_count?: number;
}

export interface FeedStoryResponse {
  story: FeedStory;
}

export interface EngagementRequest {
  action: "view" | "click" | "share" | "like";
}

export interface EngagementResponse {
  success: boolean;
  message: string;
}

export interface FeedStoryComment {
  id: number;
  feed_story_id: number;
  user_id: number | null;
  author_name: string | null;
  body: string;
  created_at: string | null;
}

export interface FeedStoryCommentsResponse {
  comments: FeedStoryComment[];
  count: number;
}

export interface FeedStoryCommentCreate {
  body: string;
  author_name?: string | null;
}

export function listFeedStoryComments(storyId: number, limit?: number): Promise<FeedStoryCommentsResponse> {
  const params = new URLSearchParams();
  if (limit != null) params.append("limit", limit.toString());
  const query = params.toString();
  return request<FeedStoryCommentsResponse>(
    `/api/feed/story/${storyId}/comments${query ? `?${query}` : ""}`,
    "GET",
    undefined
  );
}

export function addFeedStoryComment(
  storyId: number,
  body: FeedStoryCommentCreate,
  token?: string
): Promise<FeedStoryResponse> {
  return request<FeedStoryResponse>(
    `/api/feed/story/${storyId}/comments`,
    "POST",
    body,
    token
  );
}

export function listFeedStories(
  token: string,
  options?: {
    city_id?: number;
    district?: number | null;
    scope?: "city_wide" | "district_only" | null;
    newsletter_frequency?: string | null;
    research_report_id?: number;
    /** Filter by feed story category (e.g. 'personal_newsletter'). */
    category?: string | null;
    limit?: number;
    offset?: number;
    order_by?: string;
    /** When true and no city_id, return all active stories (ignore subscription/follows). Use for "All Cities" view. */
    all_cities?: boolean;
    /** With all_cities, include saved-place-scoped rows for staff (feed admin). */
    include_staff_saved_place_stories?: boolean;
    story_type?: string | null;
    /** Saved place (user_places.id); API verifies ownership. */
    user_place_id?: number | null;
    /** When true, only stories for any of the user's saved places (auth only). */
    only_my_saved_places?: boolean;
  }
): Promise<FeedStoriesResponse> {
  const params = new URLSearchParams();
  if (options?.city_id) params.append("city_id", options.city_id.toString());
  if (options?.district !== undefined && options?.district !== null) {
    params.append("district", options.district.toString());
  }
  if (options?.scope) params.append("scope", options.scope);
  if (options?.newsletter_frequency) {
    params.append("newsletter_frequency", options.newsletter_frequency);
  }
  if (options?.research_report_id) {
    params.append("research_report_id", options.research_report_id.toString());
  }
  if (options?.category) params.append("category", options.category);
  if (options?.limit) params.append("limit", options.limit.toString());
  if (options?.offset != null) params.append("offset", String(options.offset));
  if (options?.order_by) params.append("order_by", options.order_by);
  if (options?.all_cities) params.append("all_cities", "true");
  if (options?.include_staff_saved_place_stories) {
    params.append("include_staff_saved_place_stories", "true");
  }
  if (options?.story_type) params.append("story_type", options.story_type);
  if (options?.user_place_id != null) {
    params.append("user_place_id", String(options.user_place_id));
  }
  if (options?.only_my_saved_places) {
    params.append("only_my_saved_places", "true");
  }

  const query = params.toString();
  const path = `/api/feed${query ? `?${query}` : ""}`;
  return request<FeedStoriesResponse>(path, "GET", undefined, token);
}

/** A (city, district) place that has at least one active feed story (for filter UI). */
export interface FeedPlace {
  city_id: number;
  city_name: string;
  city_emoji: string;
  district: number;
  label: string;
  district_term?: string;
}

export interface FeedPlacesResponse {
  places: FeedPlace[];
  cities_with_metrics_count?: number;
}

export function listFeedPlaces(token: string): Promise<FeedPlacesResponse> {
  return request<FeedPlacesResponse>(`/api/feed/places`, "GET", undefined, token);
}

export function getFeedStory(storyId: number, token: string): Promise<FeedStoryResponse> {
  return request<FeedStoryResponse>(`/api/feed/story/${storyId}`, "GET", undefined, token);
}

export function trackFeedEngagement(
  storyId: number,
  action: "view" | "click" | "share" | "like",
  token: string
): Promise<EngagementResponse> {
  return request<EngagementResponse>(
    `/api/feed/story/${storyId}/engage`,
    "POST",
    { action },
    token
  );
}

/** Remove saved-place scope so the story is readable on public story URLs. */
export function publishPlaceFeedStoryForSharing(
  storyId: number,
  token: string
): Promise<FeedStoryResponse> {
  return request<FeedStoryResponse>(
    `/api/feed/story/${storyId}/publish-public`,
    "POST",
    {},
    token
  );
}

/** Re-attach saved-place scope after sharing (uses metadata from publish-public). */
export function restorePlaceScopeOnFeedStory(
  storyId: number,
  token: string
): Promise<FeedStoryResponse> {
  return request<FeedStoryResponse>(
    `/api/feed/story/${storyId}/restore-place-scope`,
    "POST",
    {},
    token
  );
}

// Escalate a feed story to the user's District Supervisor
export interface EscalateStoryResponse {
  success: boolean;
  message: string;
  escalate_count: number;
}

export function escalateStory(
  storyId: number,
  token: string,
  comment?: string,
  includeName?: boolean,
): Promise<EscalateStoryResponse> {
  return request<EscalateStoryResponse>(
    `/api/feed/public/story/${storyId}/escalate`,
    "POST",
    { comment: comment || "", include_name: includeName ?? true },
    token,
  );
}

// Applaud a feed story (positive sentiment signal)
export interface ApplaudStoryResponse {
  success: boolean;
  message: string;
  applaud_count: number;
}

export function applaudStory(
  storyId: number,
  token?: string,
): Promise<ApplaudStoryResponse> {
  return request<ApplaudStoryResponse>(
    `/api/feed/public/story/${storyId}/applaud`,
    "POST",
    {},
    token,
  );
}

// Investigate a feed story (official research queue)
export interface InvestigateStoryResponse {
  success: boolean;
  message: string;
  investigate_count: number;
}

export function investigateStory(
  storyId: number,
  token: string,
  notes?: string,
): Promise<InvestigateStoryResponse> {
  return request<InvestigateStoryResponse>(
    `/api/feed/story/${storyId}/investigate`,
    "POST",
    { notes: notes || null },
    token,
  );
}

/** Set AI feedback (thumbs up/down) for a story. Requires auth. */
export function setFeedStoryFeedback(
  storyId: number,
  feedback: "up" | "down",
  token: string
): Promise<EngagementResponse> {
  return request<EngagementResponse>(
    `/api/feed/story/${storyId}/feedback`,
    "POST",
    { feedback },
    token
  );
}

/** Hide story from current user's feed. Other users still see it. Requires auth. */
export function hideFeedStory(storyId: number, token: string): Promise<EngagementResponse> {
  return request<EngagementResponse>(
    `/api/feed/story/${storyId}/hide`,
    "POST",
    undefined,
    token
  );
}

// ── Research Queue (officials) ──────────────────────────────────────────────

export interface ResearchQueueItem {
  id: number;
  story_id: number;
  headline: string | null;
  story_type: string | null;
  city_id: number | null;
  district: number | null;
  status: "queued" | "in_progress" | "resolved";
  notes: string | null;
  added_at: string | null;
}

export interface ResearchQueueListResponse {
  items: ResearchQueueItem[];
  total: number;
}

export function listResearchQueue(
  token: string,
  params?: { status?: string; limit?: number; offset?: number }
): Promise<ResearchQueueListResponse> {
  const qs = new URLSearchParams();
  if (params?.status) qs.set("status", params.status);
  if (params?.limit) qs.set("limit", String(params.limit));
  if (params?.offset) qs.set("offset", String(params.offset));
  const query = qs.toString();
  return request<ResearchQueueListResponse>(
    `/api/feed/research-queue${query ? `?${query}` : ""}`,
    "GET",
    undefined,
    token
  );
}

export function updateResearchQueueItem(
  token: string,
  queueId: number,
  body: { status?: string; notes?: string }
): Promise<ResearchQueueItem> {
  return request<ResearchQueueItem>(
    `/api/feed/research-queue/${queueId}`,
    "PUT",
    body,
    token
  );
}

export function deleteResearchQueueItem(
  token: string,
  queueId: number
): Promise<{ success: boolean; message: string }> {
  return request<{ success: boolean; message: string }>(
    `/api/feed/research-queue/${queueId}`,
    "DELETE",
    undefined,
    token
  );
}

// Daily Constituent Report
export interface DailyReportPreview {
  subject: string;
  html: string;
  escalation_count: number;
  applause_count: number;
  flag_count: number;
}

export function previewDailyReport(
  token: string,
  params?: { city_id?: number; city_name?: string; days?: number }
): Promise<DailyReportPreview> {
  const query = new URLSearchParams();
  if (params?.city_id) query.set("city_id", String(params.city_id));
  if (params?.city_name) query.set("city_name", params.city_name);
  if (params?.days) query.set("days", String(params.days));
  return request<DailyReportPreview>(
    `/api/signals/daily-report/preview${query.toString() ? `?${query}` : ""}`,
    "GET",
    undefined,
    token
  );
}

export interface DailyReportSendResult {
  sent_count: number;
  failed_count: number;
  report_date: string;
}

export function generateDailyReport(
  token: string,
  params?: { city_id?: number; city_name?: string; days?: number }
): Promise<DailyReportSendResult> {
  const query = new URLSearchParams();
  if (params?.city_id) query.set("city_id", String(params.city_id));
  if (params?.city_name) query.set("city_name", params.city_name);
  if (params?.days) query.set("days", String(params.days));
  return request<DailyReportSendResult>(
    `/api/signals/daily-report/generate${query.toString() ? `?${query}` : ""}`,
    "POST",
    undefined,
    token
  );
}

// Admin feed delete (requires admin)
export interface DeleteFeedStoryResponse {
  success: boolean;
  message: string;
  deleted: number;
}

export interface DeleteFeedStoriesByCityResponse {
  success: boolean;
  message: string;
  deleted: number;
  city_id: number;
  district?: number | null;
}

export function deleteFeedStory(storyId: number, token: string): Promise<DeleteFeedStoryResponse> {
  return request<DeleteFeedStoryResponse>(
    `/api/feed/admin/story/${storyId}`,
    "DELETE",
    undefined,
    token
  );
}

export function deleteFeedStoriesByCity(
  cityId: number,
  token: string,
  district?: number | null
): Promise<DeleteFeedStoriesByCityResponse> {
  const params = new URLSearchParams();
  if (district !== undefined && district !== null) {
    params.append("district", district.toString());
  }
  const query = params.toString();
  const path = `/api/feed/admin/by-city/${cityId}${query ? `?${query}` : ""}`;
  return request<DeleteFeedStoriesByCityResponse>(path, "DELETE", undefined, token);
}

/** Cities that have at least one active feed story (for admin dropdown). */
export interface CityWithFeedStories {
  city_id: number;
  city_name: string;
  state?: string | null;
  story_count: number;
}

export function listCitiesWithFeedStories(token: string): Promise<CityWithFeedStories[]> {
  return request<CityWithFeedStories[]>(`/api/feed/admin/cities-with-stories`, "GET", undefined, token);
}

// Public feed endpoints (no auth required)
export function listPublicFeedStories(
  options?: {
    city_id?: number;
    district?: number | null;
    scope?: "city_wide" | "district_only" | null;
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
  if (options?.scope) params.append("scope", options.scope);
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

export function listPublicFeedPlaces(): Promise<FeedPlacesResponse> {
  return request<FeedPlacesResponse>(`/api/feed/public/places`, "GET", undefined);
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
  /** Seymour job session tied to this research report, when present. */
  session_id?: string | null;
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
  max_iterations?: number;
  max_subquestions?: number;
  current_iteration?: number;
  scoping_questions?: { narrative?: string; questions?: string[]; options_if_helpful?: Record<string, string[]> } | null;
  scope_answers?: Record<string, any> | null;
  scoped_focus?: string | null;
  agenda?: Record<string, any> | null;
  final_report_html?: string | null;
  model_key?: string | null;
  session_id?: string | null;
  synthesis_session_id?: string | null;
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
  one_shot?: boolean;
  require_scoping?: boolean;
  model_key?: string;
  require_agenda_approval?: boolean;
  enable_web_search?: boolean;
  max_iterations?: number;
  max_subquestions?: number;
  is_newsletter?: boolean;
  newsletter_frequency?: "weekly" | "monthly" | null;
  generate_feed_stories?: boolean;
  feed_story_count?: number;
  feed_story_frequency?: string | null;
  feed_story_category?: string | null;
  use_low_cost_model?: boolean;
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

/** Generate sample newsletter via email one-shot (same pipeline as weekly send; logs outbox and sends when configured). */
export interface GenerateSampleNewsletterRequest {
  /** City ID for this environment. Omit when using city_slug. */
  city_id?: number | null;
  /** City slug (e.g. "san-francisco") so newsletter works when IDs differ (e.g. local vs prod). */
  city_slug?: string | null;
  district?: number | null;
  frequency?: string;
  prompt_override?: string | null;
  /** @deprecated No longer used — all generation is Seymour. Accepted by server but ignored. */
  generation_mode?: string;
  /** Optional model key from /api/chat/models; omit for server default. */
  seymour_model_key?: string | null;
}

export interface GenerateSampleNewsletterResponse {
  html: string;
  title: string;
}

export function generateSampleNewsletter(
  payload: GenerateSampleNewsletterRequest,
  token: string
): Promise<GenerateSampleNewsletterResponse> {
  return request<GenerateSampleNewsletterResponse>(
    "/api/newsletter/generate-sample",
    "POST",
    payload,
    token
  );
}

/** Admin: run generate-sample for a target user (their inbox + outbox user_id). */
export function adminGenerateSampleNewsletterForUser(
  userId: number,
  payload: GenerateSampleNewsletterRequest,
  token: string
): Promise<GenerateSampleNewsletterResponse & { user_id: number }> {
  return request<GenerateSampleNewsletterResponse & { user_id: number }>(
    `/api/admin/users/${userId}/generate-sample-newsletter`,
    "POST",
    payload,
    token
  );
}

/** Admin: enqueue background job to generate a draft into newsletter_pending_sends. */
export function adminQueueNewsletterPendingForUser(
  userId: number,
  payload: GenerateSampleNewsletterRequest,
  token: string
): Promise<{ job_id: string }> {
  return request<{ job_id: string }>(
    `/api/admin/users/${userId}/queue-newsletter-pending`,
    "POST",
    payload,
    token
  );
}

/** Weekly job output queued for admin send (no body in list). */
export interface NewsletterPendingListItem {
  id: number;
  job_id: string;
  user_id: number | null;
  recipient_email: string;
  subject: string;
  generation_mode: string;
  city_id: number | null;
  /** Seymour job session created for this draft — usable for reviewing how it was produced. */
  session_id: string | null;
  /** Target district string ("0" = citywide). */
  district: string | null;
  /** Generation path: "shared_city_district" | "personalized_custom" | "personalized_place". */
  draft_type: string | null;
  created_at: string | null;
  sent_at: string | null;
  archived_at: string | null;
  send_error: string | null;
  /** Public permalink for shared newsletter drafts when an edition exists. */
  public_url?: string | null;
  /** True when the user has custom_email_prompt or newsletter_description (current profile). */
  has_custom_instructions?: boolean;
  /** True when the user has ≥1 user_places row (same rule as weekly personalized cohort). */
  has_saved_place?: boolean;
  /** LLM token usage from Seymour / curation; null when not captured. */
  llm_usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
    cost_usd?: number | null;
    model_key?: string | null;
  } | null;
}

export function listNewsletterPending(
  token: string,
  options?: { unsent_only?: boolean; sent_only?: boolean; limit?: number }
): Promise<{ items: NewsletterPendingListItem[]; count: number }> {
  const params = new URLSearchParams();
  if (options?.unsent_only === false) params.append("unsent_only", "false");
  if (options?.sent_only) params.append("sent_only", "true");
  if (options?.limit != null) params.append("limit", String(options.limit));
  const q = params.toString();
  return request<{ items: NewsletterPendingListItem[]; count: number }>(
    `/api/admin/newsletter-pending${q ? `?${q}` : ""}`,
    "GET",
    undefined,
    token
  );
}

export function getNewsletterPendingDetail(
  pendingId: number,
  token: string
): Promise<NewsletterPendingListItem & { body_html: string; email_html?: string; unsubscribe_url: string | null }> {
  return request(
    `/api/admin/newsletter-pending/${pendingId}`,
    "GET",
    undefined,
    token
  );
}

export function sendNewsletterPendingBatch(
  ids: number[],
  token: string
): Promise<{
  sent: number;
  failed: number;
  skipped: number;
  details: Array<{ id: number; status: string; reason?: string }>;
}> {
  return request(`/api/admin/newsletter-pending/send`, "POST", { ids }, token);
}

export function deleteNewsletterPendingBatch(
  ids: number[],
  token: string,
  options?: { fromArchive?: boolean }
): Promise<{ deleted: number }> {
  return request(
    `/api/admin/newsletter-pending/delete`,
    "POST",
    { ids, from_archive: options?.fromArchive === true },
    token
  );
}

export function deleteNewsletterSendsBatch(
  ids: number[],
  token: string
): Promise<{ deleted: number }> {
  return request(`/api/admin/newsletter-sends/delete`, "POST", { ids }, token);
}

export function archiveNewsletterPendingBatch(
  ids: number[],
  token: string
): Promise<{ archived: number }> {
  return request(`/api/admin/newsletter-pending/archive`, "POST", { ids }, token);
}

/** One row from the newsletter_sends audit log (every email the system has dispatched). */
export interface NewsletterSendItem {
  id: number;
  to_email: string;
  subject: string | null;
  source: string;
  status: string;
  city_id: number | null;
  job_id: string | null;
  session_id: string | null;
  sent_at: string | null;
  /** True when this send originated from the admin pending-review queue. */
  via_queue: boolean;
  /** ID of the matching newsletter_pending_sends row; use getNewsletterPendingDetail to fetch body. */
  pending_send_id?: number | null;
  /** LLM token usage pulled from the matching pending_send row, when available. */
  llm_usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
    cost_usd?: number | null;
    model_key?: string | null;
  } | null;
}

export function listNewsletterSends(
  token: string,
  options?: { limit?: number; city_id?: number }
): Promise<{ items: NewsletterSendItem[]; count: number }> {
  const params = new URLSearchParams();
  if (options?.limit != null) params.append("limit", String(options.limit));
  if (options?.city_id != null) params.append("city_id", String(options.city_id));
  const q = params.toString();
  return request<{ items: NewsletterSendItem[]; count: number }>(
    `/api/admin/newsletter-sends${q ? `?${q}` : ""}`,
    "GET",
    undefined,
    token
  );
}

export interface NewsletterGenerationPreviewLlmPlan {
  pipeline_frequency: string;
  personalized_seymour_sessions: number;
  shared_seymour_sessions: number;
  total_seymour_sessions: number;
  recipients_personalized: number;
  recipients_shared_edition: number;
  routing_summary: string;
}

/** Subscribers not counted in the pipeline for this frequency (see ``exclusion_summary_note``). */
export interface NewsletterGenerationExclusionSummary {
  distinct_emails_any_city?: number;
  distinct_emails_with_launched_city_row?: number;
  excluded_no_or_inactive_user_on_launched_city?: number;
  excluded_inactive_user_only?: number;
  distinct_emails_only_non_launched_cities?: number;
  included_distinct_emails?: number;
  excluded_from_pipeline_launched_cohort?: number;
  exclusion_summary_note?: string;
  /** Total active platform users (excluding test accounts). */
  total_active_users?: number;
  /** Active users with no newsletter subscription for this frequency. */
  users_without_any_subscription?: number;
}

/** Rough USD estimate for planned Seymour sessions (server default model). */
export interface NewsletterGenerationCostEstimateUsd {
  model_key: string;
  personalized_seymour_sessions: number;
  shared_seymour_sessions: number;
  total_seymour_sessions: number;
  personalized_estimated_usd: number;
  shared_estimated_usd: number;
  total_estimated_usd: number;
  total_low_estimate_usd: number;
  total_high_estimate_usd: number;
  per_session_input_tokens: number;
  per_session_output_tokens: number;
  methodology: string;
}

export interface NewsletterGenerationPreview {
  frequency?: string;
  /** Distinct subscribers in the cohort (same count as total_weekly_recipients). */
  total_pipeline_recipients?: number;
  total_weekly_recipients: number;
  /** Subscribers who will get one personalized Seymour run each. */
  personalized_recipients: number;
  /** Subscribers who will receive a shared newsletter draft. */
  shared_recipients: number;
  /** Number of shared city/district groups that will each run Seymour once. */
  shared_city_district_groups_planned: number;
  personalized_llm_calls_planned: number;
  shared_llm_calls_planned: number;
  total_llm_calls_planned: number;
  llm_generation_plan?: NewsletterGenerationPreviewLlmPlan;
  cost_estimate_usd?: NewsletterGenerationCostEstimateUsd | null;
  exclusion_summary?: NewsletterGenerationExclusionSummary;
  /** Persisted override on the active ``weekly_newsletter`` custom job, if any. */
  saved_newsletter_seymour_model_key?: string | null;
  /** Model key used for the cost estimate for this response. */
  model_key_used_for_estimate?: string;
  /** Total active platform users (excluding test accounts). */
  total_active_users?: number;
  /** Active users with no newsletter subscription for this frequency. */
  users_without_any_subscription?: number;
  /** Per-city shared grouping breakdown for the next run (sorted by most recipients first). */
  shared_groups_per_city: Array<{
    city_id: number;
    city_name: string;
    shared_groups: number;
    districts: number[];
    shared_recipients: number;
    /** Per-district breakdown sorted by most recipients first. */
    group_details?: Array<{ district: number; recipients: number }>;
  }>;
}

export function getNewsletterGenerationPreview(
  token: string,
  options?: { frequency?: "weekly" | "monthly"; model_key?: string }
): Promise<NewsletterGenerationPreview> {
  const params = new URLSearchParams();
  if (options?.frequency) params.append("frequency", options.frequency);
  if (options?.model_key?.trim()) params.append("model_key", options.model_key.trim());
  const q = params.toString();
  return request<NewsletterGenerationPreview>(
    `/api/admin/newsletter-generation-preview${q ? `?${q}` : ""}`,
    "GET",
    undefined,
    token
  );
}

export function putNewsletterWeeklySeymourModel(
  modelKey: string,
  token: string
): Promise<{ status: string; custom_job_id: number; newsletter_seymour_model_key: string | null }> {
  return request("/api/admin/newsletter-weekly-seymour-model", "PUT", { model_key: modelKey }, token);
}

export function adminGenerateSharedNewsletter(
  payload: {
    city_id: number;
    district?: number | null;
    frequency?: string;
    /** Optional Seymour model key from /api/chat/models; omit for saved weekly default. */
    model_key?: string | null;
  },
  token: string
): Promise<{ job_id: string }> {
  return request("/api/admin/newsletter-shared-generate", "POST", payload, token);
}

/** Stored shared (non-personalized) LLM newsletter editions — `newsletter_editions` table. */
export interface NewsletterEditionAdminItem {
  id: number;
  city_id: number;
  district: number;
  edition_date: string | null;
  short_hash: string | null;
  city_slug: string | null;
  city_name: string | null;
  summary_headline: string | null;
  created_at: string | null;
}

export function listNewsletterEditionsAdmin(
  token: string,
  options?: { limit?: number }
): Promise<{ items: NewsletterEditionAdminItem[]; count: number }> {
  const params = new URLSearchParams();
  if (options?.limit != null) params.set("limit", String(options.limit));
  const q = params.toString();
  return request<{ items: NewsletterEditionAdminItem[]; count: number }>(
    `/api/admin/newsletter-editions${q ? `?${q}` : ""}`,
    "GET",
    undefined,
    token
  );
}

export function deleteNewsletterEditionsBatch(
  ids: number[],
  token: string
): Promise<{ deleted: number }> {
  return request(`/api/admin/newsletter-editions/delete`, "POST", { ids }, token);
}

/** Manual run of a system schedule (e.g. weekly_newsletter). */
export function runScheduleJob(
  token: string,
  payload: {
    schedule_key: string;
    max_concurrent_cities?: number;
    per_city_concurrency?: number;
    remove_all_inactive?: boolean;
    /** When true with weekly_newsletter, queue drafts instead of sending. */
    queue_newsletters?: boolean;
  }
): Promise<{ status: string; result: Record<string, unknown> }> {
  return request("/api/jobs/schedules/run", "POST", payload, token);
}

export interface NewsletterPromptsResponse {
  shared_newsletter_prompt: string;
  personalized_newsletter_prompt: string;
  shared_is_default: boolean;
  personalized_is_default: boolean;
  default_shared_prompt: string;
  default_personalized_prompt: string;
  custom_job_id: number | null;
  /** Canonical model key stored on the weekly job for Seymour newsletter generation. */
  newsletter_seymour_model_key?: string | null;
}

export function getNewsletterPrompts(token: string): Promise<NewsletterPromptsResponse> {
  return request<NewsletterPromptsResponse>("/api/admin/newsletter-prompts", "GET", undefined, token);
}

export function updateNewsletterPrompts(
  payload: { shared_newsletter_prompt?: string; personalized_newsletter_prompt?: string },
  token: string
): Promise<{ status: string; custom_job_id: number | null }> {
  return request("/api/admin/newsletter-prompts", "PUT", payload, token);
}

/**
 * Admin: Run the standard weekly generation pipeline for one user and queue
 * the result in newsletter_pending_sends (no immediate send).
 */
export function adminGenerateNewsletterForUser(
  userId: number,
  token: string,
  options?: { model_key?: string }
): Promise<{
  status: string;
  user_id: number;
  pending_id: number | null;
  subject: string | null;
  draft_type: string | null;
  session_id: string | null;
}> {
  return request(
    `/api/admin/users/${userId}/generate-newsletter`,
    "POST",
    options?.model_key ? { model_key: options.model_key } : {},
    token
  );
}

/** Per-user unsent pending newsletter drafts. */
export function getUserNewsletterPending(
  userId: number,
  token: string,
  options?: { unsent_only?: boolean; limit?: number }
): Promise<{ user_id: number; email: string | null; items: NewsletterPendingListItem[]; count: number }> {
  const params = new URLSearchParams();
  if (options?.unsent_only === false) params.append("unsent_only", "false");
  if (options?.limit != null) params.append("limit", String(options.limit));
  const q = params.toString();
  return request(
    `/api/admin/users/${userId}/newsletter-pending${q ? `?${q}` : ""}`,
    "GET",
    undefined,
    token
  );
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

export function submitScopeAnswers(
  reportId: number,
  body: { answers: string[]; scoped_focus_text?: string | null },
  token: string
): Promise<{ status: string; report_id: number; message: string }> {
  return request<{ status: string; report_id: number; message: string }>(
    `/api/research/${reportId}/scope-answers`,
    "POST",
    body,
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
  // The backend exposes /api/research/by-hash/{hash} as a public endpoint
  // (no auth required, but report must be marked public).
  // Note: /api/research/public/by-hash/ does NOT exist on the backend, and
  // a Next.js filesystem route at /api/research/public/ intercepts it before
  // the rewrite proxy can forward it, causing a 404.
  return fetch(`${getApiBaseUrl()}/api/research/by-hash/${hash}`, {
    method: "GET",
    headers: {
      "Accept": "application/json",
    },
    credentials: "omit",
  }).then(async (res) => {
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
  return fetch(`${getApiBaseUrl()}/api/research/${reportId}`, {
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
  return fetch(`${getApiBaseUrl()}/api/maps/${mapId}`, {
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
// GOVERNMENT VERIFICATION API (claim profile / government service onboarding)
// ============================================================================

export interface ClaimContext {
  city_id?: number | null;
  district?: number | null;
  leader_id?: number | null;
}

export interface GovernmentVerificationStatus {
  government_verified: boolean;
  government_pending_verification?: boolean;
  government_email?: string | null;
  claim_context?: ClaimContext | null;
}

export function getGovernmentVerificationStatus(
  token: string
): Promise<GovernmentVerificationStatus> {
  return request<GovernmentVerificationStatus>(
    "/api/admin/me/government-verification",
    "GET",
    undefined,
    token
  );
}

export function sendGovernmentVerificationCode(
  email: string,
  token: string
): Promise<{ status: string; message: string; dev_code?: string }> {
  return request<{ status: string; message: string; dev_code?: string }>(
    "/api/admin/me/government-verification/send-code",
    "POST",
    { email },
    token
  );
}

export function verifyGovernmentCode(
  code: string,
  token: string
): Promise<{ status: string; message: string; government_email?: string }> {
  return request<{ status: string; message: string; government_email?: string }>(
    "/api/admin/me/government-verification/verify",
    "POST",
    { code },
    token
  );
}

/** Set or clear government verification (for preview/testing). Does not validate email domain. */
export function updateGovernmentVerification(
  government_verified: boolean,
  government_email: string | undefined,
  token: string
): Promise<GovernmentVerificationStatus> {
  return request<GovernmentVerificationStatus>(
    "/api/admin/me/government-verification",
    "PATCH",
    { government_verified, government_email: government_email || undefined },
    token
  );
}

// Record signup intent (source, claim context) for analytics and onboarding branching
export interface SignupIntentPayload {
  source: string;
  cityName?: string | null;
  roleInterest?: string | null;
  timestamp?: string | null;
  claim_context?: ClaimContext | null;
}

export function recordSignupIntent(
  payload: SignupIntentPayload,
  token: string
): Promise<{ status: string }> {
  return request<{ status: string }>("/api/users/signup-intent", "POST", payload, token);
}

// ============================================================================
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
  /**
   * From GET /api/admin/me/metric-ordering/{cityId} only: true if the user saved their own
   * metric subset/order; false if these rows are the city default (show all dashboard metrics).
   */
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
// WASTE DETECTION
// ============================================================================

export interface WasteFinding {
  id: string;
  category: "payroll" | "contracts" | "infrastructure" | "integrity" | "influence" | "confirmed";
  subcategory: string;
  severity: "critical" | "high" | "medium" | "low" | "info";
  entity: string;
  metric: string;
  metricDetail: string;
  amount: number | null;
  amountForAggregate?: number | null;
  capApplied?: number | null;
  description: string;
  tool: string;
  confidence: "High" | "Medium" | "Low";
  confidence_reason: string | null;
  confidence_score: number;
  estimated_dollar_impact: number | null;
  corroboration_count: number;
  data_completeness: number;
  priority_score: number;
  is_partial_data: boolean;
  truncated_total: number | null;
  caveat: string | null;
  narrative: string | null;
  headline: string | null;
  signal_tier: "primary" | "supporting" | null;
  finding_report: string | null;
  is_new?: boolean;
  fiscal_year?: number | null;
  department?: string | null;
  convergence_details?: {
    triangle_legs?: string[];
    triangle_legs_present?: string[];
    convergence_score?: number;
    composite_risk?: number;
    convergence_multiplier?: number;
    domains?: string[];
    domains_flagged?: number;
    domain_risks?: Record<string, number>;
    finding_count?: number;
  } | null;
  is_recurring?: boolean;
  recurrence_count?: number;
  consolidated_into?: string | null;
  supporting_findings?: string[] | null;
}

export interface WasteDataFreshness {
  dataset_name: string;
  data_as_of: string | null;
  data_loaded_at: string | null;
  rows_fetched: number;
  is_partial_year: boolean;
  stale: boolean;
  stale_reason: string | null;
}

export interface WasteCategorySummary {
  category: string;
  finding_count: number;
  critical_count: number;
  high_count: number;
  medium_count: number;
  total_amount: number | null;
  records_analyzed: number;
}

export interface WasteSummaryResponse {
  total_findings: number;
  critical_count: number;
  estimated_exposure: number | null;
  gross_exposure: number | null;
  net_exposure: number | null;
  departments_affected: number;
  categories: WasteCategorySummary[];
  suppressed_below_materiality?: number;
  suppressed_below_confidence?: number;
}

/**
 * Structured per-detector error returned by the backend waste analyze
 * endpoint. New UIs should prefer this over the legacy freeform `errors`
 * string list since `error_type`, `family`, and `retryable` come from the
 * source instead of being regex-inferred from a message.
 */
export interface WasteDetectorError {
  family: string | null;
  detector: string | null;
  error_type: string;
  stage: string;
  message: string;
  retryable: boolean;
}

export interface WasteAnalyzeResponse {
  findings: WasteFinding[];
  summary: WasteSummaryResponse;
  cached: boolean;
  analysis_timestamp: string | null;
  errors: string[];
  detector_errors?: WasteDetectorError[];
  data_freshness: WasteDataFreshness[];
  /**
   * Client-only field: when findings are merged across multiple persisted
   * runs (because the most recent run had timeouts for some categories),
   * this lists the categories whose findings came from an older run.
   * Not sent by the backend.
   */
  carried_over_categories?: {
    category: string;
    analysis_timestamp: string | null;
    reason: string;
  }[];
}

export interface WasteRunJobResponse {
  job_id: string;
  existing_job_id?: string;
  status: string;
  message?: string;
}

export type WasteDispositionType =
  | "confirmed_fraud"
  | "confirmed_waste"
  | "policy_violation"
  | "data_error"
  | "false_positive"
  | "under_investigation"
  | "inconclusive";

export interface WasteDisposition {
  id: string;
  finding_id: number;
  entity_id: string | null;
  city_id: number;
  disposition: WasteDispositionType;
  auditor_id: string;
  notes: string | null;
  evidence_links: string[];
  created_at: string | null;
}

export interface WasteDetectorAccuracy {
  id: string;
  detector_key: string;
  city_id: number;
  total_findings: number;
  confirmed_count: number;
  false_positive_count: number;
  precision_rate: number;
  updated_at: string | null;
}

export interface WasteScoreDistribution {
  total_entities: number;
  mean: number;
  p50: number;
  p90: number;
  p95: number;
  p99: number;
  max_score: number;
}

export interface WasteSaturationStats {
  count_gte_95: number;
  pct_gte_95: number;
  count_eq_100: number;
  pct_eq_100: number;
}

export interface WasteDetectorPrecisionSnapshot {
  detector_key: string;
  total_findings: number;
  confirmed_count: number;
  false_positive_count: number;
  precision_rate: number;
  confirmed_case_hits: number;
  confirmed_case_hit_rate: number;
  updated_at: string | null;
}

export interface WasteTrustMetricsResponse {
  city_id: number;
  generated_at: string;
  saturation: WasteSaturationStats;
  score_distribution: WasteScoreDistribution;
  confirmed_case_total_findings: number;
  detector_precision: WasteDetectorPrecisionSnapshot[];
}

export interface WasteTrustReportRequest {
  city_id: number;
  lookback_days?: number;
}

export interface WasteThresholdChangeSummary {
  detector_key: string;
  threshold_field: string;
  old_value: number;
  new_value: number;
  modified_at: string | null;
}

export interface WasteWeightDeltaSummary {
  detector_key: string;
  base_weight: number;
  adjusted_weight: number;
  delta_pct: number;
}

export interface WastePolicyLaneSummary {
  total_detectors: number;
  policy_controlled_detectors: number;
  lanes: Record<string, number>;
}

export interface WasteEvaluationSnapshotItem {
  id: string;
  title: string;
  expected_outcome: string;
  status: "on_track" | "needs_review" | "manual_review";
  detector_families: string[];
  evidence: string[];
}

export interface WasteTrustReportResponse {
  city_id: number;
  lookback_days: number;
  generated_at: string;
  trust_metrics: WasteTrustMetricsResponse;
  threshold_changes: WasteThresholdChangeSummary[];
  policy_lane_summary: WastePolicyLaneSummary;
  evaluation_snapshot: WasteEvaluationSnapshotItem[];
  top_weight_deltas: WasteWeightDeltaSummary[];
}

export interface LatestWasteTrustReportResponse {
  job_id: string | null;
  report: WasteTrustReportResponse | null;
}

export interface WasteDepartmentRiskProfile {
  id: string | null;
  city_id: number;
  department_name: string;
  department_match_name: string;
  procurement_risk: number;
  payroll_risk: number;
  infrastructure_risk: number;
  influence_risk: number;
  integrity_risk: number;
  domains_flagged: number;
  convergence_multiplier: number;
  composite_risk: number;
  opportunity_score: number;
  pressure_score: number;
  capability_score: number;
  triangle_legs_present: number;
  finding_count: number;
  finding_ids: string[];
  top_finding_summary: string | null;
  last_scored_at: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface WasteDepartmentRiskPage {
  city_id: number;
  generated_at: string;
  items: WasteDepartmentRiskProfile[];
  page: number;
  per_page: number;
  total: number;
  has_next: boolean;
}

export interface WasteReviewQueueItem {
  id: string;
  finding_id: number;
  city_id: number;
  status: "pending" | "assigned" | "disposed";
  priority: "low" | "medium" | "high" | "critical";
  assigned_to: string | null;
  finding_detector_key: string | null;
  finding_category: string | null;
  finding_subcategory: string | null;
  finding_entity_name: string | null;
  finding_severity: string | null;
  finding_description: string | null;
  finding_created_at: string | null;
  composite_score: number | null;
  severity_tier: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface WasteReviewQueuePage {
  items: WasteReviewQueueItem[];
  page: number;
  per_page: number;
  total: number;
}

export interface CreateWasteDispositionRequest {
  city_id: number;
  disposition: WasteDispositionType;
  notes?: string;
  evidence_links?: string[];
}

export interface AssignWasteQueueItemRequest {
  assigned_to: string;
}

export interface BulkDisposeWasteFindingsRequest {
  city_id: number;
  finding_ids: number[];
  disposition: WasteDispositionType;
  notes?: string;
}

export interface RunWasteAnalysisRequest {
  city_id: number;
  category?: string;
  force_refresh?: boolean;
  persist?: boolean;
}

export interface WasteRun {
  id: number;
  city_id: number;
  category: string | null;
  status: string;
  is_active: boolean;
  analysis_timestamp: string | null;
  job_id: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string | null;
  updated_at: string | null;
  run_config: Record<string, unknown>;
  errors: string[];
}

export interface SyncWasteReviewQueueRequest {
  city_id: number;
  run_id?: number;
}

export interface SyncWasteReviewQueueResponse {
  city_id: number;
  run_id: number | null;
  processed: number;
  inserted: number;
  updated: number;
  reopened: number;
}

export function getWasteAnalysis(
  token: string,
  category?: string,
  forceRefresh?: boolean,
  cityId?: number
): Promise<WasteAnalyzeResponse> {
  const params = new URLSearchParams();
  if (category) params.append("category", category);
  if (forceRefresh) params.append("force_refresh", "true");
  if (cityId != null) params.append("city_id", String(cityId));
  const query = params.toString();
  const path = `/api/waste/analyze${query ? `?${query}` : ""}`;
  return request<WasteAnalyzeResponse>(path, "GET", undefined, token);
}

export function runWasteAnalysis(
  token: string,
  payload: RunWasteAnalysisRequest
): Promise<WasteRunJobResponse> {
  return request<WasteRunJobResponse>("/api/waste/run", "POST", payload, token);
}

export function getWasteSummary(
  token: string,
  cityId?: number
): Promise<WasteSummaryResponse> {
  const params = new URLSearchParams();
  if (cityId != null) params.append("city_id", String(cityId));
  const query = params.toString();
  return request<WasteSummaryResponse>(`/api/waste/summary${query ? `?${query}` : ""}`, "GET", undefined, token);
}

export function getWasteRunResult(
  token: string,
  runId: number,
  cityId: number
): Promise<WasteAnalyzeResponse> {
  const query = new URLSearchParams({ city_id: String(cityId) });
  return request<WasteAnalyzeResponse>(
    `/api/waste/runs/${runId}/result?${query.toString()}`,
    "GET",
    undefined,
    token
  );
}

export function listWasteRuns(
  token: string,
  cityId: number,
  category?: string,
  limit: number = 1,
  status?: string
): Promise<WasteRun[]> {
  const query = new URLSearchParams();
  query.set("city_id", String(cityId));
  query.set("limit", String(limit));
  if (category) query.set("category", category);
  if (status) query.set("status", status);
  return request<WasteRun[]>(
    `/api/waste/runs?${query.toString()}`,
    "GET",
    undefined,
    token
  );
}

export function getWasteReviewQueue(
  token: string,
  params: {
    city_id: number;
    status?: string;
    priority?: string;
    assigned_to?: string;
    page?: number;
    per_page?: number;
  }
): Promise<WasteReviewQueuePage> {
  const query = new URLSearchParams();
  query.set("city_id", String(params.city_id));
  if (params.status) query.set("status", params.status);
  if (params.priority) query.set("priority", params.priority);
  if (params.assigned_to) query.set("assigned_to", params.assigned_to);
  if (params.page) query.set("page", String(params.page));
  if (params.per_page) query.set("per_page", String(params.per_page));
  return request<WasteReviewQueuePage>(
    `/api/waste/queue?${query.toString()}`,
    "GET",
    undefined,
    token
  );
}

export function assignWasteQueueItem(
  token: string,
  itemId: string,
  cityId: number,
  payload: AssignWasteQueueItemRequest
): Promise<WasteReviewQueueItem> {
  const query = new URLSearchParams({ city_id: String(cityId) });
  return request<WasteReviewQueueItem>(
    `/api/waste/queue/${itemId}/assign?${query.toString()}`,
    "PUT",
    payload,
    token
  );
}

export function createWasteDisposition(
  token: string,
  findingId: number,
  payload: CreateWasteDispositionRequest
): Promise<WasteDisposition> {
  return request<WasteDisposition>(
    `/api/waste/findings/${findingId}/dispositions`,
    "POST",
    payload,
    token
  );
}

export function getWasteDispositions(
  token: string,
  findingId: number,
  cityId: number
): Promise<WasteDisposition[]> {
  const query = new URLSearchParams({ city_id: String(cityId) });
  return request<WasteDisposition[]>(
    `/api/waste/findings/${findingId}/dispositions?${query.toString()}`,
    "GET",
    undefined,
    token
  );
}

export function getWasteDetectorAccuracy(
  token: string,
  cityId: number,
  detectorKey?: string
): Promise<WasteDetectorAccuracy[]> {
  const query = new URLSearchParams({ city_id: String(cityId) });
  if (detectorKey) query.set("detector_key", detectorKey);
  return request<WasteDetectorAccuracy[]>(
    `/api/waste/accuracy?${query.toString()}`,
    "GET",
    undefined,
    token
  );
}

export function bulkDisposeWasteFindings(
  token: string,
  payload: BulkDisposeWasteFindingsRequest
): Promise<WasteDisposition[]> {
  return request<WasteDisposition[]>(
    "/api/waste/queue/bulk-dispose",
    "POST",
    payload,
    token
  );
}

export function syncWasteReviewQueue(
  token: string,
  payload: SyncWasteReviewQueueRequest
): Promise<SyncWasteReviewQueueResponse> {
  return request<SyncWasteReviewQueueResponse>(
    "/api/waste/queue/sync",
    "POST",
    payload,
    token
  );
}

export async function exportWasteFindings(
  token: string,
  category: string,
  format: "csv" | "json" | "xlsx",
  cityId?: number
): Promise<Blob> {
  const params = new URLSearchParams({ format });
  if (cityId != null) params.append("city_id", String(cityId));
  const url = `${getApiBaseUrl()}/api/waste/export/${category}?${params.toString()}`;
  const res = await fetch(url, {
    method: "GET",
    credentials: "include",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  if (!res.ok) {
    throw new Error(`Export failed: ${res.status}`);
  }
  return res.blob();
}

export async function exportAuditorReport(
  token: string,
  category: string = "all",
  cityId?: number
): Promise<Blob> {
  const params = new URLSearchParams({ category });
  if (cityId != null) params.append("city_id", String(cityId));
  const url = `${getApiBaseUrl()}/api/waste/export-report?${params.toString()}`;
  const res = await fetch(url, {
    method: "GET",
    credentials: "include",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  if (!res.ok) {
    throw new Error(`Auditor report export failed: ${res.status}`);
  }
  return res.blob();
}

// Force rebuild - all exports are defined above

// ============================================================================
// WASTE ENTITY SCORES
// ============================================================================

export interface WasteEntityScoreSignal {
  detector_key: string;
  weight: number;
  confidence_score: number;
  contribution: number;
  finding_id: number | null;
  severity: string;
  decay_multiplier: number;
  watchlist_multiplier: number;
  run_id: number | null;
}

export interface WasteEntityScore {
  id: string;
  entity_name: string;
  entity_match_name: string;
  entity_type: string;
  city_id: number;
  composite_score: number;
  severity_tier: "critical" | "high" | "medium" | "low" | "info";
  signal_count: number;
  top_detector: string | null;
  top_finding_id: number | null;
  signals: WasteEntityScoreSignal[];
  last_scored_at: string | null;
  decay_factor: number;
  score_delta: number | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface WasteEntityScoresPage {
  items: WasteEntityScore[];
  page: number;
  per_page: number;
  total: number;
  has_next: boolean;
}

export function getWasteEntityScores(
  token: string,
  params: {
    city_id: number;
    page?: number;
    per_page?: number;
    severity_tier?: string;
    entity_type?: string;
    sort_by?: string;
    sort_dir?: "asc" | "desc";
  }
): Promise<WasteEntityScoresPage> {
  const query = new URLSearchParams();
  query.set("city_id", String(params.city_id));
  if (params.page) query.set("page", String(params.page));
  if (params.per_page) query.set("per_page", String(params.per_page));
  if (params.severity_tier) query.set("severity_tier", params.severity_tier);
  if (params.entity_type) query.set("entity_type", params.entity_type);
  if (params.sort_by) query.set("sort_by", params.sort_by);
  if (params.sort_dir) query.set("sort_dir", params.sort_dir);
  return request<WasteEntityScoresPage>(
    `/api/waste/scores?${query.toString()}`,
    "GET",
    undefined,
    token
  );
}

export function getWasteTrustMetrics(
  token: string,
  params: {
    city_id: number;
    detector_precision_limit?: number;
    detector_precision_min_findings?: number;
  }
): Promise<WasteTrustMetricsResponse> {
  const query = new URLSearchParams();
  query.set("city_id", String(params.city_id));
  if (params.detector_precision_limit != null) {
    query.set("detector_precision_limit", String(params.detector_precision_limit));
  }
  if (params.detector_precision_min_findings != null) {
    query.set(
      "detector_precision_min_findings",
      String(params.detector_precision_min_findings)
    );
  }
  return request<WasteTrustMetricsResponse>(
    `/api/waste/scores/trust/metrics?${query.toString()}`,
    "GET",
    undefined,
    token
  );
}

export function getWasteDepartmentRisk(
  token: string,
  params: {
    city_id: number;
    min_score?: number;
    min_domains?: number;
    page?: number;
    per_page?: number;
  }
): Promise<WasteDepartmentRiskPage> {
  const query = new URLSearchParams();
  query.set("city_id", String(params.city_id));
  if (params.min_score != null) query.set("min_score", String(params.min_score));
  if (params.min_domains != null) {
    query.set("min_domains", String(params.min_domains));
  }
  if (params.page != null) query.set("page", String(params.page));
  if (params.per_page != null) query.set("per_page", String(params.per_page));
  return request<WasteDepartmentRiskPage>(
    `/api/waste/department-risk?${query.toString()}`,
    "GET",
    undefined,
    token
  );
}

export function generateWasteTrustReport(
  token: string,
  payload: WasteTrustReportRequest
): Promise<WasteRunJobResponse> {
  return request<WasteRunJobResponse>(
    "/api/waste/scores/trust/report",
    "POST",
    payload,
    token
  );
}

export function getLatestWasteTrustReport(
  token: string,
  cityId: number
): Promise<LatestWasteTrustReportResponse> {
  return request<LatestWasteTrustReportResponse>(
    `/api/waste/scores/trust/report/latest?city_id=${cityId}`,
    "GET",
    undefined,
    token
  );
}

// ============================================================================
// WASTE INVESTIGATIONS
// ============================================================================

export interface WasteInvestigationAction {
  id: string;
  investigation_id: string;
  action_type: "document_request" | "interview" | "site_visit" | "subpoena" | "referral" | "note" | "evidence_collected" | "ai_auditor_review";
  title: string;
  description: string;
  status: "pending" | "in_progress" | "completed" | "cancelled";
  assigned_to: string | null;
  target_department: string | null;
  due_date: string | null;
  completed_at: string | null;
  response_notes: string | null;
  attachments: string[];
  created_at: string | null;
  created_by: string | null;
}

export interface WasteInvestigation {
  id: string;
  city_id: number;
  title: string;
  status: "open" | "in_progress" | "pending_response" | "closed";
  lead_auditor_id: string | null;
  finding_id: number | null;
  finding: Record<string, unknown> | null;
  entity_score: Record<string, unknown> | null;
  final_disposition: WasteDispositionType | null;
  actions: WasteInvestigationAction[];
  dispositions: Record<string, unknown>[];
  opened_at: string | null;
  closed_at: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface WasteInvestigationsPage {
  items: WasteInvestigation[];
  page: number;
  per_page: number;
  total: number;
  has_next: boolean;
}

export interface CreateInvestigationActionRequest {
  action_type: WasteInvestigationAction["action_type"];
  title: string;
  description: string;
  assigned_to?: string;
  target_department?: string;
  due_date?: string;
}

export interface CloseInvestigationRequest {
  final_disposition: WasteDispositionType;
  notes?: string;
}

export function getWasteInvestigations(
  token: string,
  params: {
    city_id: number;
    status?: string;
    page?: number;
    per_page?: number;
  }
): Promise<WasteInvestigationsPage> {
  const query = new URLSearchParams();
  query.set("city_id", String(params.city_id));
  if (params.status) query.set("status", params.status);
  if (params.page) query.set("page", String(params.page));
  if (params.per_page) query.set("per_page", String(params.per_page));
  return request<WasteInvestigationsPage>(
    `/api/waste/investigations?${query.toString()}`,
    "GET",
    undefined,
    token
  );
}

export function getWasteInvestigation(
  token: string,
  investigationId: string
): Promise<WasteInvestigation> {
  return request<WasteInvestigation>(
    `/api/waste/investigations/${investigationId}`,
    "GET",
    undefined,
    token
  );
}

export function createInvestigationAction(
  token: string,
  investigationId: string,
  payload: CreateInvestigationActionRequest
): Promise<WasteInvestigationAction> {
  return request<WasteInvestigationAction>(
    `/api/waste/investigations/${investigationId}/actions`,
    "POST",
    payload,
    token
  );
}

export function closeInvestigation(
  token: string,
  investigationId: string,
  payload: CloseInvestigationRequest
): Promise<WasteInvestigation> {
  return request<WasteInvestigation>(
    `/api/waste/investigations/${investigationId}/close`,
    "POST",
    payload,
    token
  );
}

export function exportInvestigationEvidence(
  token: string,
  investigationId: string
): Promise<Blob> {
  const url = `${getApiBaseUrl()}/api/waste/investigations/${investigationId}/export`;
  return fetch(url, {
    method: "GET",
    credentials: "include",
    headers: { Authorization: `Bearer ${token}` },
  }).then((res) => {
    if (!res.ok) throw new Error(`Evidence export failed: ${res.status}`);
    return res.blob();
  });
}

// ============================================================================
// AI AUDITOR REVIEW
// ============================================================================

export interface AIAuditorStepResult {
  step_number: number;
  step_name: string;
  status: "pending" | "running" | "completed" | "failed";
  reasoning: string;
  sources: string[];
  duration_seconds: number;
}

export interface AIAuditorReport {
  entity_name: string;
  city_name: string;
  classification: "false_positive" | "likely_false_positive" | "inconclusive" | "corroborated_concern" | "confirmed";
  confidence: "high" | "moderate" | "low";
  summary: string;
  steps: AIAuditorStepResult[];
  sources: string[];
  estimated_human_hours: number;
  actual_ai_seconds: number;
  recommended_actions: string[];
  created_at: string;
}

export interface RunAIAuditorReviewRequest {
  finding_id: number;
  city_id: number;
}

export interface RunAIAuditorReviewResponse {
  investigation_id: string;
  report: AIAuditorReport;
}

export function runAIAuditorReview(
  token: string,
  payload: RunAIAuditorReviewRequest
): Promise<RunAIAuditorReviewResponse> {
  return request<RunAIAuditorReviewResponse>(
    `/api/waste/ai-auditor-review`,
    "POST",
    payload,
    token
  );
}

// ============================================================================
// WASTE THRESHOLDS
// ============================================================================

export interface WasteThreshold {
  id: string;
  detector_key: string;
  detector_name: string;
  category: "vendor" | "payroll" | "infrastructure" | "nonprofit";
  city_id: number;
  field_label: string;
  current_value: number;
  default_value: number;
  min_value: number;
  max_value: number;
  updated_at: string | null;
}

export interface UpdateThresholdRequest {
  detector_key: string;
  value: number;
}

export function getWasteThresholds(
  token: string,
  cityId: number
): Promise<WasteThreshold[]> {
  const query = new URLSearchParams({ city_id: String(cityId) });
  return request<WasteThreshold[]>(
    `/api/waste/thresholds?${query.toString()}`,
    "GET",
    undefined,
    token
  );
}

export function updateWasteThresholds(
  token: string,
  cityId: number,
  updates: UpdateThresholdRequest[]
): Promise<WasteThreshold[]> {
  return request<WasteThreshold[]>(
    "/api/waste/thresholds",
    "PUT",
    { city_id: cityId, updates },
    token
  );
}

// ============================================================================
// WASTE BENCHMARK
// ============================================================================

export interface BenchmarkSummaryCity {
  city_id: number;
  city_name: string;
  total_findings: number;
  critical_count: number;
  high_count: number;
  estimated_exposure: number | null;
}

export interface BenchmarkSummaryResponse {
  selected_city: BenchmarkSummaryCity;
  all_cities: BenchmarkSummaryCity[];
  rank_by_exposure: number;
  rank_by_findings: number;
  total_tracked_cities: number;
}

export interface BenchmarkEntityRankItem {
  city_id: number;
  city_name: string;
  entity_name: string;
  entity_type: string;
  composite_score: number;
}

export interface BenchmarkEntityRankResponse {
  city_id: number;
  top_entities: BenchmarkEntityRankItem[];
  city_rank: number;
  city_max_score: number;
  total_tracked_cities: number;
}

export function getWasteBenchmarkSummary(
  token: string,
  cityId: number
): Promise<BenchmarkSummaryResponse> {
  const query = new URLSearchParams({ city_id: String(cityId) });
  return request<BenchmarkSummaryResponse>(
    `/api/waste/benchmark/summary?${query.toString()}`,
    "GET",
    undefined,
    token
  );
}

export function getWasteBenchmarkEntityRank(
  token: string,
  cityId: number,
  entityType?: string
): Promise<BenchmarkEntityRankResponse> {
  const query = new URLSearchParams({ city_id: String(cityId) });
  if (entityType) query.set("entity_type", entityType);
  return request<BenchmarkEntityRankResponse>(
    `/api/waste/benchmark/entity-rank?${query.toString()}`,
    "GET",
    undefined,
    token
  );
}

// ============================================================================
// WASTE METHODOLOGY
// ============================================================================

export interface MethodologyDatasetInfo {
  logical_name: string;
  display_name: string;
  socrata_id: string | null;
  available: boolean;
  portal_url: string | null;
  detectors_enabled: string[];
  column_mappings: Record<string, string>;
}

export interface MethodologyBudgetYearInfo {
  fiscal_year: string;
  socrata_id: string;
  portal_url: string;
}

export interface DataGapInfo {
  id: string;
  title: string;
  gap_type: string;
  priority: string;
  description: string;
  detectors_blocked: string[];
  new_detectors_enabled: string[];
  public_records_request: string;
}

export interface CityReviewNoteInfo {
  id: string;
  title: string;
  lane: string;
  detector_families: string[];
  summary: string;
  operator_guidance: string;
}

export interface MetadataWorkstreamInfo {
  id: string;
  title: string;
  scope: string;
  detector_families: string[];
  required_metadata: string[];
  why_blocked: string;
  recommended_sources: string[];
}

export interface EvalExpectationInfo {
  id: string;
  title: string;
  scope: string;
  expected_outcome: string;
  detector_families: string[];
  rationale: string;
  pass_criteria: string[];
}

export interface CityMethodologyResponse {
  city_id: number;
  city_key: string;
  domain: string;
  fiscal_year_start_month: number;
  fiscal_year_label: string;
  datasets: MethodologyDatasetInfo[];
  missing_datasets: MethodologyDatasetInfo[];
  budget_year_datasets: MethodologyBudgetYearInfo[];
  methodology_notes: Record<string, string>;
  city_review_notes: CityReviewNoteInfo[];
  metadata_workstreams: MetadataWorkstreamInfo[];
  eval_expectations: EvalExpectationInfo[];
  data_gaps: DataGapInfo[];
  total_detectors_available: number;
  total_detectors_skipped: number;
}

export interface SystemCityOverview {
  city_id: number;
  city_key: string;
  domain: string;
  datasets_available: number;
  datasets_missing: number;
  detector_coverage_pct: number;
}

export interface SystemLearningInfo {
  id: string;
  title: string;
  discovered_city: string;
  affected_detectors: string[];
  description: string;
  resolution: string;
  universal: boolean;
}

export interface SystemRequirementInfo {
  id: string;
  dataset_name: string;
  why_needed: string;
  detectors_enabled: string[];
  alternatives: string[];
}

export interface SystemMethodologyResponse {
  cities: SystemCityOverview[];
  learnings: SystemLearningInfo[];
  requirements: SystemRequirementInfo[];
}

export function getWasteCityMethodology(
  token: string,
  cityId: number
): Promise<CityMethodologyResponse> {
  const query = new URLSearchParams({ city_id: String(cityId) });
  return request<CityMethodologyResponse>(
    `/api/waste/methodology?${query.toString()}`,
    "GET",
    undefined,
    token
  );
}

export function getWasteSystemMethodology(
  token: string
): Promise<SystemMethodologyResponse> {
  return request<SystemMethodologyResponse>(
    "/api/waste/methodology/system",
    "GET",
    undefined,
    token
  );
}

// ============================================================================
// CHAT JOBS API
// ============================================================================

export interface ChatJobResponse {
  job_id: string;
  status: string;
  message: string;
  session_id: string;
}

export function createChatJob(
  payload: ChatMessageRequest,
  token: string
): Promise<ChatJobResponse> {
  return request<ChatJobResponse>("/api/chat/jobs", "POST", payload, token);
}

// ============================================================================
// COST COMPARISON API
// ============================================================================

export interface CostCityResult {
  cost: number;
  volume: number | null;
  budget: number | null;
  quality_value: string | null;
  quality_label: string | null;
  cost_basis_label: string;
  source_name: string;
  source_url: string | null;
  source_year: string;
  government_level: string;
  is_estimate: boolean;
}

export interface CostMetricResult {
  metric_key: string;
  label: string;
  short_label: string;
  category: string;
  icon: string;
  unit: string;
  tier: string;
  city_a: CostCityResult;
  city_b: CostCityResult;
  ratio: number;
  rpp_adjusted_ratio: number;
  methodology_note: string;
  caveats: string[];
}

export interface CostCategoryGroup {
  category: string;
  label: string;
  metrics: CostMetricResult[];
}

export interface CostBasketResponse {
  city_a_name: string;
  city_b_name: string;
  city_a_id: number;
  city_b_id: number;
  categories: CostCategoryGroup[];
  basket_index: number;
  rpp_adjusted_basket_index: number;
  more_expensive_city: string;
  biggest_gap_metric: string;
  biggest_gap_ratio: number;
  metrics_available: number;
  data_freshness: string;
}

export function getCostBasket(
  token: string,
  cityAId?: number,
  cityBId?: number
): Promise<CostBasketResponse> {
  const params = new URLSearchParams();
  if (cityAId != null) params.append("city_a", String(cityAId));
  if (cityBId != null) params.append("city_b", String(cityBId));
  const query = params.toString();
  return request<CostBasketResponse>(
    `/api/comparison/cost-basket${query ? `?${query}` : ""}`,
    "GET",
    undefined,
    token
  );
}

export function getCostMetricDetail(
  token: string,
  metricKey: string,
  cityAId?: number,
  cityBId?: number
): Promise<CostMetricResult> {
  const params = new URLSearchParams();
  if (cityAId != null) params.append("city_a", String(cityAId));
  if (cityBId != null) params.append("city_b", String(cityBId));
  const query = params.toString();
  return request<CostMetricResult>(
    `/api/comparison/cost-basket/${metricKey}${query ? `?${query}` : ""}`,
    "GET",
    undefined,
    token
  );
}

// ============================================================================
// SIGNUP FUNNEL ANALYTICS
// ============================================================================

export interface SignupFunnelEventPayload {
  event_name: string;
  funnel_session_id?: string | null;
  city_id?: number | null;
  city_slug?: string | null;
  city_name?: string | null;
  district?: number | null;
  signup_intent?: string | null;
  source_surface?: string | null;
  landing_path?: string | null;
  referrer?: string | null;
  utm_source?: string | null;
  utm_medium?: string | null;
  utm_campaign?: string | null;
  metadata?: Record<string, unknown> | null;
}

// ============================================================================
// PRODUCT ANALYTICS (first-party event log)
// ============================================================================

export interface ProductEventFunnelRow {
  date: string;
  page_views: number;
  signup_starts: number;
  signup_completes: number;
}

/** Landing attribution row (utm_source, referrer host, or buckets). */
export interface ProductEventFunnelLandingSource {
  source: string;
  count: number;
  share: number | null;
}

export interface ProductEventFunnel {
  date_from: string;
  date_to: string;
  total_page_views: number;
  total_signup_starts: number;
  total_signup_completes: number;
  conversion_rate: number | null;
  daily: ProductEventFunnelRow[];
  /** Present when platform exposes `/product-analytics/funnel` landing attribution. */
  landing_sources?: ProductEventFunnelLandingSource[];
}

export function getProductEventFunnel(
  token: string,
  options?: { days?: number; date_from?: string; date_to?: string; city_id?: number }
): Promise<ProductEventFunnel> {
  const params = new URLSearchParams();
  if (options?.days != null) params.append("days", String(options.days));
  if (options?.date_from) params.append("date_from", options.date_from);
  if (options?.date_to) params.append("date_to", options.date_to);
  if (options?.city_id != null) params.append("city_id", String(options.city_id));
  const qs = params.toString();
  return request<ProductEventFunnel>(
    `/api/admin/product-analytics/funnel${qs ? `?${qs}` : ""}`,
    "GET",
    undefined,
    token
  );
}

// ============================================================================
// ONBOARDING STEP FUNNEL
// ============================================================================

export interface OnboardingFunnelDailyCount {
  date: string;
  count: number;
}

export interface OnboardingFunnelStep {
  step: string;
  label: string;
  total: number;
  daily: OnboardingFunnelDailyCount[];
}

export interface OnboardingFunnel {
  date_from: string;
  date_to: string;
  steps: OnboardingFunnelStep[];
}

export function getOnboardingFunnel(
  token: string,
  options?: { days?: number; date_from?: string; date_to?: string; city_id?: number }
): Promise<OnboardingFunnel> {
  const params = new URLSearchParams();
  if (options?.days != null) params.append("days", String(options.days));
  if (options?.date_from) params.append("date_from", options.date_from);
  if (options?.date_to) params.append("date_to", options.date_to);
  if (options?.city_id != null) params.append("city_id", String(options.city_id));
  const qs = params.toString();
  return request<OnboardingFunnel>(
    `/api/admin/product-analytics/onboarding-funnel${qs ? `?${qs}` : ""}`,
    "GET",
    undefined,
    token
  );
}

// ============================================================================
// PRODUCT ANALYTICS OVERVIEW (unified admin dashboard)
// ============================================================================

export interface ProductAnalyticsActiveUsers {
  date_from: string;
  date_to: string;
  dau_logged_in: number;
  wau_logged_in: number;
  mau_logged_in: number;
  dau_visitors: number;
  wau_visitors: number;
  mau_visitors: number;
  retention_d7_rate: number | null;
  retention_d28_rate: number | null;
  daily_logged_in: OnboardingFunnelDailyCount[];
  daily_visitors: OnboardingFunnelDailyCount[];
  daily_dau: OnboardingFunnelDailyCount[];
  daily_wau: OnboardingFunnelDailyCount[];
  daily_mau: OnboardingFunnelDailyCount[];
  daily_visitor_dau: OnboardingFunnelDailyCount[];
  daily_visitor_wau: OnboardingFunnelDailyCount[];
  daily_visitor_mau: OnboardingFunnelDailyCount[];
}

export interface ProductAnalyticsGrowthDay {
  date: string;
  new: number;
  returning: number;
  resurrecting: number;
  dormant: number;
}

export interface ProductAnalyticsRetentionLagCell {
  lag: number;
  count: number;
  rate: number | null;
}

export interface ProductAnalyticsRetentionLagRow {
  date: string;
  active: number;
  cells: ProductAnalyticsRetentionLagCell[];
}

export interface ProductAnalyticsRetentionLagTable {
  date_from: string;
  date_to: string;
  rows: ProductAnalyticsRetentionLagRow[];
}

export interface RetentionLagCellUser {
  first_name: string | null;
  last_name: string | null;
  name: string | null;
}

export interface RetentionLagCellUsersResponse {
  date: string;
  lag: number;
  users: RetentionLagCellUser[];
}

export function getRetentionLagCellUsers(
  token: string,
  date: string,
  lag: number
): Promise<RetentionLagCellUsersResponse> {
  return request<RetentionLagCellUsersResponse>(
    `/api/admin/product-analytics/retention-lag/cell-users?date=${encodeURIComponent(date)}&lag=${lag}`,
    "GET",
    undefined,
    token
  );
}

export interface RetentionLagActiveDayUsersResponse {
  date: string;
  users: RetentionLagCellUser[];
}

export function getRetentionLagActiveDayUsers(
  token: string,
  date: string
): Promise<RetentionLagActiveDayUsersResponse> {
  return request<RetentionLagActiveDayUsersResponse>(
    `/api/admin/product-analytics/retention-lag/active-day-users?date=${encodeURIComponent(date)}`,
    "GET",
    undefined,
    token
  );
}

export interface ProductAnalyticsLandingMatrixRow {
  source: string;
  total: number;
  counts: number[];
}

export interface ProductAnalyticsLandingMatrix {
  date_from: string;
  date_to: string;
  granularity: string;
  period_labels: string[];
  rows: ProductAnalyticsLandingMatrixRow[];
}

export interface ProductAnalyticsFeatureUsage {
  event_name: string;
  count: number;
  unique_users: number;
  unique_sessions: number;
}

export interface ProductAnalyticsIntegrationHealth {
  first_party_events_24h: number;
  signup_events_24h: number;
  token_usage_24h: number;
  ga4_configured: boolean;
  ga4_available: boolean;
  ga4_sessions_7d: number | null;
  langsmith_configured: boolean;
  langsmith_project: string | null;
  analytics_note: string;
}

export interface ProductAnalyticsRetentionCohort {
  cohort_week: string;
  cohort_size: number;
  rates: (number | null)[];
  counts: (number | null)[];
}

export interface ProductAnalyticsRetentionMatrix {
  date_from: string;
  date_to: string;
  period_labels: string[];
  cohorts: ProductAnalyticsRetentionCohort[];
}

export interface ProductAnalyticsOverview {
  active_users: ProductAnalyticsActiveUsers;
  growth_window_days: number;
  growth_accounting: ProductAnalyticsGrowthDay[];
  retention_lag: ProductAnalyticsRetentionLagTable;
  retention_matrix: ProductAnalyticsRetentionMatrix;
  feature_usage: ProductAnalyticsFeatureUsage[];
  feature_usage_logged_in: ProductAnalyticsFeatureUsage[];
  feature_usage_logged_out?: ProductAnalyticsFeatureUsage[];
  integration_health: ProductAnalyticsIntegrationHealth;
  landing_sources: ProductEventFunnelLandingSource[];
  landing_matrix: ProductAnalyticsLandingMatrix | null;
  total_page_views: number;
  total_signup_starts: number;
  total_signup_completes: number;
}

export function getProductAnalyticsOverview(
  token: string,
  options?: { days?: number }
): Promise<ProductAnalyticsOverview> {
  const params = new URLSearchParams();
  if (options?.days != null) params.append("days", String(options.days));
  const qs = params.toString();
  return request<ProductAnalyticsOverview>(
    `/api/admin/product-analytics/overview${qs ? `?${qs}` : ""}`,
    "GET",
    undefined,
    token
  );
}

export interface TokenUsageDailyRow {
  date: string;
  tokens: number;
  cost_usd: number;
  calls: number;
}

export interface TokenUsageSourceSubRow {
  user: string;
  calls: number;
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  cost_usd: number;
}

export interface TokenUsageSourceRow {
  source: string;
  calls: number;
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  cost_usd: number;
  sub_rows?: TokenUsageSourceSubRow[];
}

export interface TokenUsageDailySeries {
  date_from: string;
  date_to: string;
  days: number;
  total_tokens: number;
  total_cost_usd: number;
  llm_call_count: number;
  by_model: Record<string, { input_tokens: number; output_tokens: number; cost_usd: number; calls: number }>;
  by_source: TokenUsageSourceRow[];
  daily: TokenUsageDailyRow[];
}

export function getTokenUsageDailySeries(
  token: string,
  options?: { days?: number }
): Promise<TokenUsageDailySeries> {
  const params = new URLSearchParams();
  if (options?.days != null) params.append("days", String(options.days));
  const qs = params.toString();
  return request<TokenUsageDailySeries>(
    `/api/admin/token-usage/daily-series${qs ? `?${qs}` : ""}`,
    "GET",
    undefined,
    token
  );
}

/** Fire-and-forget: record a signup funnel event (no auth required). */
export function recordSignupFunnelEvent(
  payload: SignupFunnelEventPayload,
  token?: string
): Promise<void> {
  return request<void>(
    "/api/public/signup-funnel-event",
    "POST",
    payload,
    token
  );
}

export interface DailyFunnelRow {
  date: string;
  landings: number | null;
  bounce_rate: number | null;
  signup_starts: number;
  signup_completes: number;
}

export interface CityFunnelRow {
  city_id: number | null;
  city_slug: string | null;
  city_name: string | null;
  signup_starts: number;
  signup_completes: number;
}

export interface DistrictFunnelRow {
  city_id: number | null;
  city_name: string | null;
  district: number | null;
  signup_starts: number;
  signup_completes: number;
}

export interface SignupFunnelSummary {
  date_from: string;
  date_to: string;
  total_landings: number | null;
  avg_bounce_rate: number | null;
  total_signup_starts: number;
  total_signup_completes: number;
  conversion_rate: number | null;
  daily: DailyFunnelRow[];
  by_city: CityFunnelRow[];
  by_district: DistrictFunnelRow[];
  ga4_available: boolean;
  /** Distinct emails with ≥1 active weekly subscription (launched cities). Snapshot, not date-scoped. */
  newsletter_distinct_active_subscribers?: number;
  /** Recipients returned by the weekly pipeline (matched user row). Snapshot. */
  newsletter_weekly_pipeline_recipients?: number;
  /** Weekly routing: saved place → personalized edition. */
  newsletter_personalized_saved_place?: number;
  /** Weekly routing: no saved place → shared city/district edition. */
  newsletter_shared_city_district_edition?: number;
  /** Subscribers with a saved place and non-empty newsletter instructions. */
  newsletter_saved_place_and_instructions?: number;
  newsletter_metrics_available?: boolean;
  /** Distinct users (active, non-test) with ≥1 signup_complete in date range; same city filter as funnel. */
  newsletter_funnel_cohort_completers?: number;
  /** Cohort users with ≥1 active weekly subscription on a launched city (city_id filter applies to subscription when drilling). */
  newsletter_funnel_weekly_subscribers?: number;
  /** Among weekly subscribers in cohort: saved place (personalized send path). */
  newsletter_funnel_weekly_with_saved_place?: number;
  /** Among weekly subscribers in cohort: no saved place (shared edition path). */
  newsletter_funnel_weekly_shared_only?: number;
  /** Among cohort: weekly + saved place + custom instructions (prompt or description). */
  newsletter_funnel_weekly_saved_place_and_instructions?: number;
  newsletter_funnel_cohort_available?: boolean;
}

export function getSignupFunnelSummary(
  token: string,
  options?: {
    days?: number;
    date_from?: string;
    date_to?: string;
    city_id?: number;
  }
): Promise<SignupFunnelSummary> {
  const params = new URLSearchParams();
  if (options?.days != null) params.append("days", String(options.days));
  if (options?.date_from) params.append("date_from", options.date_from);
  if (options?.date_to) params.append("date_to", options.date_to);
  if (options?.city_id != null) params.append("city_id", String(options.city_id));
  const qs = params.toString();
  return request<SignupFunnelSummary>(
    `/api/admin/signup-analytics/summary${qs ? `?${qs}` : ""}`,
    "GET",
    undefined,
    token
  );
}

// =============================================================================
// Inbox
// =============================================================================

export type InboxItemScope = "place" | "district" | "city";
export type InboxItemType = "edition" | "pending";

export interface InboxItem {
  id: string;
  type: InboxItemType;
  subject: string;
  preview: string;
  cover_image_url: string | null;
  sent_at: string;
  is_read: boolean;
  is_private: boolean;
  scope: InboxItemScope;
  city_id: number;
  city_name: string;
  city_slug: string | null;
  city_emoji: string | null;
  district: string | null;
  district_label: string | null;
  place_id: number | null;
  place_name: string | null;
  public_url: string | null;
}

export interface InboxListResponse {
  items: InboxItem[];
  unread_count: number;
}

export interface InboxDetailResponse {
  id: string;
  type: InboxItemType;
  subject: string;
  sent_at: string;
  body_html: string;
  city_id: number;
  city_name: string;
  city_slug: string | null;
  district: string | null;
  public_url: string | null;
  place_id: number | null;
  place_name: string | null;
}

export function listInbox(
  token: string,
  opts?: { limit?: number; offset?: number }
): Promise<InboxListResponse> {
  const params = new URLSearchParams();
  if (opts?.limit != null) params.append("limit", String(opts.limit));
  if (opts?.offset != null) params.append("offset", String(opts.offset));
  const qs = params.toString();
  return request<InboxListResponse>(
    `/api/newsletter/inbox${qs ? `?${qs}` : ""}`,
    "GET",
    undefined,
    token
  );
}

export function getInboxItem(
  token: string,
  id: string
): Promise<InboxDetailResponse> {
  return request<InboxDetailResponse>(
    `/api/newsletter/inbox/${encodeURIComponent(id)}`,
    "GET",
    undefined,
    token
  );
}

export function markInboxRead(
  token: string,
  id: string
): Promise<{ ok: boolean; item_id: string }> {
  return request<{ ok: boolean; item_id: string }>(
    `/api/newsletter/inbox/${encodeURIComponent(id)}/read`,
    "POST",
    undefined,
    token
  );
}

export function markAllInboxRead(
  token: string,
  itemIds: string[]
): Promise<{ ok: boolean; marked_count: number }> {
  return request<{ ok: boolean; marked_count: number }>(
    "/api/newsletter/inbox/read-all",
    "POST",
    { item_ids: itemIds },
    token
  );
}

// ---------------------------------------------------------------------------
// Gift Subscriptions
// ---------------------------------------------------------------------------

export interface GiftSentItem {
  recipient_email: string;
  recipient_name: string | null;
  place_label: string;
  city_id: number;
  district: string | null;
  sent_at: string | null;
  clicked_at: string | null;
}

export interface SendGiftRequest {
  recipient_email: string;
  recipient_name?: string | null;
  city_id: number;
  district?: string | null;
  place_label: string;
  lat?: number | null;
  lng?: number | null;
  custom_prompt?: string | null;
}

export interface SendGiftResponse {
  gifts_sent: number;
  gifts_remaining: number;
}

export function sendGift(
  token: string,
  body: SendGiftRequest
): Promise<SendGiftResponse> {
  return request<SendGiftResponse>("/api/gift/send", "POST", body, token);
}

export interface MyGiftsResponse {
  gifts: GiftSentItem[];
  gifts_remaining: number;
}

export function getMyGifts(token: string): Promise<MyGiftsResponse> {
  return request<MyGiftsResponse>("/api/gift/my-gifts", "GET", undefined, token);
}

export interface GiftMetaResponse {
  recipient_email: string;
  recipient_name: string | null;
  gifter_display: string;
  place_label: string | null;
  city_id: number | null;
  city_name: string | null;
  already_activated: boolean;
  trial_ends_at: string | null;
}

export function getGiftMeta(token: string): Promise<GiftMetaResponse> {
  return fetch(`${getApiBaseUrl()}/api/gift/meta/${encodeURIComponent(token)}`, {
    method: "GET",
    headers: { Accept: "application/json" },
    credentials: "omit",
  }).then(async (res) => {
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      const err = new Error(`Gift meta fetch failed: ${res.status} ${text}`);
      (err as any).status = res.status;
      throw err;
    }
    return res.json() as Promise<GiftMetaResponse>;
  });
}

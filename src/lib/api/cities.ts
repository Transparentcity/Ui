import { request } from "./request";

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

export interface PopulationRefreshResult {
  success: boolean;
  rows_written?: number;
  source_name?: string;
  source_url?: string | null;
  error?: string;
}

export function getPopulationSource(cityId: number, token: string): Promise<PopulationSourceConfig> {
  return request<PopulationSourceConfig>(`/api/admin/population/sources/${cityId}`, "GET", undefined, token);
}

export function refreshPopulation(cityId: number, token: string): Promise<PopulationRefreshResult> {
  return request<PopulationRefreshResult>(`/api/admin/population/refresh/${cityId}`, "POST", undefined, token);
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

// Saved Districts (My Districts) API - followed representatives
export interface SavedDistrict {
  city_id: number;
  district: string;
  display_name: string;
  slug: string;
}

export function getSavedDistricts(token: string): Promise<SavedDistrict[]> {
  return request<SavedDistrict[]>("/api/cities/saved-districts", "GET", undefined, token);
}


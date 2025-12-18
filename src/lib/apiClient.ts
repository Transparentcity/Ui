const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8001";

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
    throw new Error(`API ${method} ${path} failed: ${res.status} ${text}`);
  }

  return (await res.json()) as T;
}

export interface HealthResponse {
  status: string;
  version?: string;
  mcp_tools?: number;
  tool_groups?: number;
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
}

export interface JobResponse {
  job_id: string;
  status?: string;
}

export function getCityAdmin(cityId: number, token: string): Promise<CityAdminData> {
  return request<CityAdminData>(`/api/admin/cities/${cityId}`, "GET", undefined, token);
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
  // Try the main cities endpoint first, fallback to template-metrics endpoint
  return request<CityStructureData>(
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
  });
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

export interface AdminMetricListItem {
  id: number;
  metric_name: string;
  metric_key: string;
  category: string;
  subcategory?: string | null;
  is_active: boolean;
  last_execution_at?: string | null;
  last_execution_status?: string | null;
  execution_count?: number | null;
  metric_type?: string | null;
  data_source_type?: string | null;
  city_id?: number | null;
  city_name?: string | null;
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
  last_execution_at?: string | null;
  last_execution_status?: string | null;
  last_execution_error?: string | null;
  last_execution_job_id?: string | null;
  execution_count?: number | null;
  created_at?: string | null;
  updated_at?: string | null;
  city_name?: string | null;
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

export function getAdminMetricTimeSeries(metricId: number, token: string): Promise<AdminMetricTimeSeries> {
  return request<AdminMetricTimeSeries>(`/api/admin/metrics/${metricId}/time-series`, "GET", undefined, token);
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
  message_count: number;
  created_at: string;
  last_message_at?: string;
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

export interface StreamEvent {
  type: string;
  content?: string;
  tool_id?: string;
  tool_name?: string;
  arguments?: any;
  response?: any;
  success?: boolean;
  title?: string;
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
  model_key: string = "gpt-5",
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

export function listJobs(
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
  return request<JobsListResponse>(path, "GET", undefined, token);
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

export async function sendChatMessageStream(
  request: ChatMessageRequest,
  token: string,
  onEvent: (event: StreamEvent) => void
): Promise<void> {
  const url = `${API_BASE}/api/chat/message/stream`;

  console.log("🔄 Starting stream request to:", url);
  console.log("📤 Request payload:", request);

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      Accept: "text/event-stream",
    },
    body: JSON.stringify(request),
  });

  console.log("📥 Response status:", response.status, response.statusText);

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

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        console.log(`✅ Stream completed. Processed ${eventCount} events.`);
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (line.trim() === "") continue; // Skip empty lines
        
        if (line.startsWith("data: ")) {
          try {
            const jsonStr = line.slice(6);
            const data = JSON.parse(jsonStr);
            eventCount++;
            console.log(`📨 Event ${eventCount}:`, data.type, data.content?.substring(0, 50) || "");
            onEvent(data);
          } catch (e) {
            console.error("❌ Failed to parse SSE event:", e, "Line:", line);
          }
        } else if (line.trim() !== "") {
          // Log non-data lines for debugging
          console.log("📝 Non-data line:", line.substring(0, 100));
        }
      }
    }
  } catch (error) {
    console.error("❌ Stream error:", error);
    throw error;
  } finally {
    reader.releaseLock();
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
  }>;
}

export function getCity(cityId: number, token: string): Promise<CityDetail> {
  return request<CityDetail>(`/api/cities/${cityId}`, "GET", undefined, token);
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
  shapefile_name: string;
  structure_type: string;
  geometry_data: any; // GeoJSON FeatureCollection
  geometry_type?: string | null;
  source_endpoint?: string | null;
  source_query?: string | null;
  source_url?: string | null;
  feature_count?: number | null;
  identifier_field?: string | null;
  metadata?: Record<string, any>;
  created_at?: string;
  updated_at?: string;
  last_fetched_at?: string | null;
}


export function getCityShapefiles(cityId: number, token: string): Promise<CityShapefile[]> {
  console.log("getCityShapefiles called for cityId:", cityId);
  return request<any>(`/api/cities/${cityId}/structure`, "GET", undefined, token)
    .then((data: any) => {
      console.log("getCityShapefiles response:", data);
      console.log("Response keys:", data ? Object.keys(data) : "null/undefined");
      // Handle nested structure response
      if (data && data.shapefiles && Array.isArray(data.shapefiles)) {
        console.log("Found shapefiles in response:", data.shapefiles.length);
        return data.shapefiles;
      }
      if (Array.isArray(data)) {
        console.log("Response is array:", data.length);
        return data;
      }
      console.warn("No shapefiles found in response structure. Full response:", JSON.stringify(data, null, 2));
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
    skip?: number;
    limit?: number;
  }
): Promise<User[]> {
  const params = new URLSearchParams();
  if (options?.role) params.append("role", options.role);
  if (options?.is_active !== undefined) params.append("is_active", options.is_active.toString());
  if (options?.skip) params.append("skip", options.skip.toString());
  if (options?.limit) params.append("limit", options.limit.toString());
  
  const query = params.toString();
  const path = `/api/admin/users${query ? `?${query}` : ""}`;
  return request<User[]>(path, "GET", undefined, token);
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


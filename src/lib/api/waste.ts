import { request, API_BASE } from "./request";

// WASTE DETECTION
// ============================================================================

export interface WasteFinding {
  id: string;
  category: "payroll" | "contracts" | "infrastructure" | "integrity" | "influence" | "confirmed" | "convergence";
  subcategory: string;
  severity: "critical" | "high" | "medium" | "low" | "info";
  entity: string;
  department?: string | null;
  metric: string;
  metricDetail: string;
  amount: number | null;
  description: string;
  tool: string;
  confidence: "High" | "Medium" | "Low" | null;
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
  finding_report: string | null;
  is_new?: boolean;
  fiscal_year?: number | null;
  convergence_details?: ConvergenceDetails | null;
  headline?: string | null;
  signal_tier?: "primary" | "supporting" | null;
  consolidated_into?: string | null;
  supporting_findings?: string[] | null;
}

export interface ConvergenceDetails {
  domain_risks: Record<string, number>;
  domains_flagged: number;
  convergence_multiplier: number;
  composite_risk: number;
  triangle_legs: string[];
  triangle_legs_present: number;
  finding_count: number;
}

export interface WasteDataFreshness {
  dataset_name: string;
  data_as_of: string | null;
  data_loaded_at: string | null;
  rows_fetched: number;
  is_partial: boolean;
  is_partial_year: boolean;
  stale: boolean;
  stale_reason: string | null;
  note?: string | null;
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
}

/**
 * Structured per-detector error returned by the backend. New code should
 * read `detector_errors` rather than parsing `errors` strings via regex.
 *
 * `error_type` values match the backend `DetectorError` model:
 * timeout | no_data | data_fetch | data_fetch_partial | family_error |
 * post_processing | invalid_category | internal
 *
 * `stage` values: prefetch | detectors | post | orchestrator
 *
 * `retryable` indicates whether re-running the analysis is likely to help
 * (timeouts, network issues) versus a config/data bug that needs a human.
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
  run_id?: number | null;
  persisted?: boolean;
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
  // 45s timeout for the direct analysis endpoint (longer since it does the work inline)
  return request<WasteAnalyzeResponse>(path, "GET", undefined, token, {
    timeoutMs: 45_000,
  });
}

export interface WasteRunJobResponse {
  job_id: string;
  existing_job_id?: string;
  status: string;
  message?: string;
}

export function runWasteAnalysis(
  token: string,
  payload: RunWasteAnalysisRequest
): Promise<WasteRunJobResponse> {
  // 30s timeout: if the server hasn't accepted the job by then, let retry logic kick in
  return request<WasteRunJobResponse>("/api/waste/run", "POST", payload, token, {
    timeoutMs: 30_000,
  });
}

export function getWasteSummary(
  token: string,
  cityId?: number
): Promise<WasteSummaryResponse> {
  const params = new URLSearchParams();
  if (cityId != null) params.append("city_id", String(cityId));
  const query = params.toString();
  const path = `/api/waste/summary${query ? `?${query}` : ""}`;
  return request<WasteSummaryResponse>(path, "GET", undefined, token);
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
  format: "csv" | "json" | "xlsx"
): Promise<Blob> {
  const url = `${API_BASE}/api/waste/export/${category}?format=${format}`;
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
  category: string = "all"
): Promise<Blob> {
  const url = `${API_BASE}/api/waste/export-report?category=${encodeURIComponent(category)}`;
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

// ============================================================================
// WASTE INVESTIGATIONS
// ============================================================================

export interface WasteInvestigationAction {
  id: string;
  investigation_id: string;
  action_type: "document_request" | "interview" | "site_visit" | "subpoena" | "referral" | "note" | "evidence_collected";
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

export interface WasteInvestigationFindingSummary {
  id: number;
  detector_key: string;
  category: string;
  subcategory: string | null;
  severity: string;
  entity_name: string;
  description: string | null;
  narrative: string | null;
}

export interface WasteInvestigationEntityScoreSummary {
  id: string;
  composite_score: number;
  severity_tier: string;
}

export interface WasteInvestigationDisposition {
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

export interface WasteInvestigation {
  id: string;
  city_id: number;
  title: string;
  status: "open" | "in_progress" | "pending_response" | "closed";
  lead_auditor_id: string | null;
  finding_id: number | null;
  finding: WasteInvestigationFindingSummary | null;
  entity_score: WasteInvestigationEntityScoreSummary | null;
  final_disposition: WasteDispositionType | null;
  actions: WasteInvestigationAction[];
  dispositions: WasteInvestigationDisposition[];
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
  const url = `${API_BASE}/api/waste/investigations/${investigationId}/export`;
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

import { request, API_BASE } from "./request";

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
  max_iterations?: number;
  max_subquestions?: number;
  model_key?: string;
  require_agenda_approval?: boolean;
  enable_web_search?: boolean;
  // Newsletter metadata fields (optional) - set these to create a newsletter report
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

/** Generate sample newsletter via email one-shot (no research report, no email sent). */
export interface GenerateSampleNewsletterRequest {
  /** City ID for this environment. Omit when using city_slug. */
  city_id?: number | null;
  /** City slug (e.g. "san-francisco") so newsletter works when IDs differ (e.g. local vs prod). */
  city_slug?: string | null;
  district?: number | null;
  frequency?: string;
  prompt_override?: string | null;
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

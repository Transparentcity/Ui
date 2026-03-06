import { request } from "./request";

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
  job_type?: string
): Promise<JobsListResponse> {
  const params = new URLSearchParams();
  params.append("limit", limit.toString());
  if (status) params.append("job_status", status);
  if (job_id) params.append("job_id", job_id);
  if (job_type) params.append("job_type", job_type);
  
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

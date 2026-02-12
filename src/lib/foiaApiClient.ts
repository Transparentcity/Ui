/**
 * FOIA API Client
 *
 * Wraps all HTTP calls to the backend /api/foia and /api/admin/foia endpoints.
 * Uses the same API_BASE as the rest of the platform.
 */

import { API_BASE } from "./apiBase"
import type {
  FoiaRequest,
  FoiaMessage,
  FoiaAttachment,
  FoiaTask,
  FoiaRequestEvent,
  DatasetInstance,
  FoiaRequestTemplate,
  CityFoiaProfile,
  CityDatasetTarget,
  FoiaDashboardSummary,
  PaginatedResponse,
  FoiaCityDepartment,
  FoiaRequesterProfile,
  FoiaSubmissionAttempt,
} from "./foia/types"

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const url = `${API_BASE}${path}`
  const res = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
  })
  if (!res.ok) {
    const body = await res.text().catch(() => "")
    throw new Error(`FOIA API ${res.status}: ${body || res.statusText}`)
  }
  return res.json() as Promise<T>
}

function qs(params: Record<string, string | number | undefined | null>): string {
  const parts: string[] = []
  for (const [k, v] of Object.entries(params)) {
    if (v != null && v !== "") parts.push(`${k}=${encodeURIComponent(v)}`)
  }
  return parts.length ? `?${parts.join("&")}` : ""
}

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------

export function getFoiaDashboard(): Promise<FoiaDashboardSummary> {
  return apiFetch("/api/foia/dashboard")
}

// ---------------------------------------------------------------------------
// Requests
// ---------------------------------------------------------------------------

export function listFoiaRequests(params: {
  status?: string
  city_id?: number
  dataset_id?: string
  q?: string
  page?: number
  page_size?: number
} = {}): Promise<PaginatedResponse<FoiaRequest>> {
  return apiFetch(`/api/foia/requests${qs(params as Record<string, string | number>)}`)
}

export function getFoiaRequest(id: number): Promise<FoiaRequest> {
  return apiFetch(`/api/foia/requests/${id}`)
}

export function createFoiaRequest(data: Partial<FoiaRequest>): Promise<FoiaRequest> {
  return apiFetch("/api/foia/requests", { method: "POST", body: JSON.stringify(data) })
}

export function updateFoiaRequest(id: number, data: Partial<FoiaRequest>): Promise<FoiaRequest> {
  return apiFetch(`/api/foia/requests/${id}`, { method: "PUT", body: JSON.stringify(data) })
}

export function submitFoiaRequest(id: number): Promise<FoiaRequest> {
  return apiFetch(`/api/foia/requests/${id}/submit`, { method: "POST" })
}

export function rewriteFoiaRequest(id: number, data: Partial<FoiaRequest>): Promise<FoiaRequest> {
  return apiFetch(`/api/foia/requests/${id}/rewrite`, { method: "POST", body: JSON.stringify(data) })
}

export function changeFoiaRequestStatus(
  id: number,
  status: string,
  actor?: string,
  notes?: string
): Promise<FoiaRequest> {
  return apiFetch(`/api/foia/requests/${id}/status`, {
    method: "POST",
    body: JSON.stringify({ status, actor: actor ?? "admin", notes }),
  })
}

export function listFoiaRequestEvents(requestId: number): Promise<FoiaRequestEvent[]> {
  return apiFetch(`/api/foia/requests/${requestId}/events`)
}

// ---------------------------------------------------------------------------
// Messages & Attachments
// ---------------------------------------------------------------------------

export function listFoiaMessages(requestId: number): Promise<FoiaMessage[]> {
  return apiFetch(`/api/foia/requests/${requestId}/messages`)
}

export function listFoiaAttachments(requestId: number): Promise<FoiaAttachment[]> {
  return apiFetch(`/api/foia/requests/${requestId}/attachments`)
}

export function createFoiaMessage(requestId: number, data: Partial<FoiaMessage>): Promise<FoiaMessage> {
  return apiFetch(`/api/foia/requests/${requestId}/messages`, {
    method: "POST",
    body: JSON.stringify(data),
  })
}

export function createFoiaAttachment(requestId: number, data: Partial<FoiaAttachment>): Promise<FoiaAttachment> {
  return apiFetch(`/api/foia/requests/${requestId}/attachments`, {
    method: "POST",
    body: JSON.stringify(data),
  })
}

export function getFoiaAttachment(id: number): Promise<FoiaAttachment> {
  return apiFetch(`/api/foia/attachments/${id}`)
}

// ---------------------------------------------------------------------------
// Tasks
// ---------------------------------------------------------------------------

export function listFoiaTasks(params: {
  status?: string
  type?: string
  assigned_to?: string
  city_id?: number
} = {}): Promise<FoiaTask[]> {
  return apiFetch(`/api/foia/tasks${qs(params as Record<string, string | number>)}`)
}

export function createFoiaTask(data: Partial<FoiaTask>): Promise<FoiaTask> {
  return apiFetch("/api/foia/tasks", { method: "POST", body: JSON.stringify(data) })
}

export function assignFoiaTask(taskId: number, assignedTo: string): Promise<FoiaTask> {
  return apiFetch(`/api/foia/tasks/${taskId}/assign`, {
    method: "POST",
    body: JSON.stringify({ assigned_to: assignedTo }),
  })
}

export function completeFoiaTask(taskId: number): Promise<FoiaTask> {
  return apiFetch(`/api/foia/tasks/${taskId}/complete`, { method: "POST" })
}

// ---------------------------------------------------------------------------
// Dataset Instances
// ---------------------------------------------------------------------------

export function listDatasetInstances(params: {
  city_id?: number
  dataset_id?: string
  status?: string
} = {}): Promise<DatasetInstance[]> {
  return apiFetch(`/api/foia/dataset-instances${qs(params as Record<string, string | number>)}`)
}

export function createDatasetInstance(data: Partial<DatasetInstance>): Promise<DatasetInstance> {
  return apiFetch("/api/foia/dataset-instances", { method: "POST", body: JSON.stringify(data) })
}

export function getDatasetInstance(id: number): Promise<DatasetInstance> {
  return apiFetch(`/api/foia/dataset-instances/${id}`)
}

export function updateDatasetInstance(
  id: number,
  data: Partial<Pick<DatasetInstance, "status" | "review_notes">>
): Promise<DatasetInstance> {
  return apiFetch(`/api/foia/dataset-instances/${id}`, {
    method: "PUT",
    body: JSON.stringify(data),
  })
}

// ---------------------------------------------------------------------------
// City Profile lookup (for form auto-populate)
// ---------------------------------------------------------------------------

export function getCityFoiaProfileAndTargets(
  cityId: number
): Promise<{ profile: CityFoiaProfile | null; dataset_targets: CityDatasetTarget[] }> {
  return apiFetch(`/api/foia/cities/${cityId}/profile`)
}

export function listCityFoiaDepartments(cityId: number): Promise<FoiaCityDepartment[]> {
  return apiFetch(`/api/foia/cities/${cityId}/departments`)
}

export function suggestCityFoiaDepartment(
  cityId: number,
  data: { title?: string; request_description?: string }
): Promise<{
  department_id: number | null
  department_name: string | null
  reason: string
  used_ai: boolean
  warning: string | null
}> {
  return apiFetch(`/api/foia/cities/${cityId}/departments/suggest`, {
    method: "POST",
    body: JSON.stringify(data),
  })
}

export function composeCityFoiaRequestBlock(
  cityId: number,
  data: {
    primary_department_id?: number
    additional_department_ids?: number[]
    coordination_note?: string
    title?: string
    request_description?: string
    fee_waiver?: boolean
  }
): Promise<{ block: string; used_ai: boolean; warning: string | null }> {
  return apiFetch(`/api/foia/cities/${cityId}/compose-request-block`, {
    method: "POST",
    body: JSON.stringify(data),
  })
}

// ---------------------------------------------------------------------------
// AI Draft
// ---------------------------------------------------------------------------

export function aiDraftFoiaRequest(
  requestId: number,
  mode: "draft_request" | "draft_followup" | "draft_rewrite" = "draft_request",
  additionalContext?: string
): Promise<{ draft: string; mode: string; saved_as_message: boolean }> {
  return apiFetch(`/api/foia/requests/${requestId}/ai-draft`, {
    method: "POST",
    body: JSON.stringify({ mode, additional_context: additionalContext }),
  })
}

export function listFoiaSubmissionAttempts(requestId: number): Promise<FoiaSubmissionAttempt[]> {
  return apiFetch(`/api/foia/requests/${requestId}/submission-attempts`)
}

export function markFoiaExternallyFiled(
  requestId: number,
  data: { external_confirmation_id: string; screenshot_uri?: string }
): Promise<FoiaSubmissionAttempt> {
  return apiFetch(`/api/foia/requests/${requestId}/externally-filed`, {
    method: "POST",
    body: JSON.stringify(data),
  })
}

// ---------------------------------------------------------------------------
// Admin: Requester profile (org-wide)
// ---------------------------------------------------------------------------

export function getRequesterProfile(): Promise<FoiaRequesterProfile> {
  return apiFetch("/api/admin/foia/requester-profile")
}

export function updateRequesterProfile(
  data: Partial<FoiaRequesterProfile>
): Promise<FoiaRequesterProfile> {
  return apiFetch("/api/admin/foia/requester-profile", {
    method: "PUT",
    body: JSON.stringify(data),
  })
}

// ---------------------------------------------------------------------------
// Admin: City Profiles
// ---------------------------------------------------------------------------

export function getCityFoiaProfile(cityId: number): Promise<CityFoiaProfile> {
  return apiFetch(`/api/admin/foia/cities/${cityId}/profile`)
}

export function updateCityFoiaProfile(cityId: number, data: Partial<CityFoiaProfile>): Promise<CityFoiaProfile> {
  return apiFetch(`/api/admin/foia/cities/${cityId}/profile`, {
    method: "PUT",
    body: JSON.stringify(data),
  })
}

// ---------------------------------------------------------------------------
// Admin: City Departments
// ---------------------------------------------------------------------------

export function listAdminCityDepartments(cityId: number): Promise<FoiaCityDepartment[]> {
  return apiFetch(`/api/admin/foia/cities/${cityId}/departments`)
}

export function createCityDepartment(
  cityId: number,
  data: Partial<FoiaCityDepartment>
): Promise<FoiaCityDepartment> {
  return apiFetch(`/api/admin/foia/cities/${cityId}/departments`, {
    method: "POST",
    body: JSON.stringify(data),
  })
}

export function updateCityDepartment(
  departmentId: number,
  data: Partial<FoiaCityDepartment>
): Promise<FoiaCityDepartment> {
  return apiFetch(`/api/admin/foia/departments/${departmentId}`, {
    method: "PUT",
    body: JSON.stringify(data),
  })
}

export function deleteCityDepartment(departmentId: number): Promise<{ deleted: boolean }> {
  return apiFetch(`/api/admin/foia/departments/${departmentId}`, { method: "DELETE" })
}

// ---------------------------------------------------------------------------
// Admin: Dataset Targets
// ---------------------------------------------------------------------------

export function getCityDatasetTargets(cityId: number): Promise<CityDatasetTarget[]> {
  return apiFetch(`/api/admin/foia/cities/${cityId}/dataset-targets`)
}

export function updateCityDatasetTargets(
  cityId: number,
  targets: Partial<CityDatasetTarget>[]
): Promise<CityDatasetTarget[]> {
  return apiFetch(`/api/admin/foia/cities/${cityId}/dataset-targets`, {
    method: "PUT",
    body: JSON.stringify({ targets }),
  })
}

// ---------------------------------------------------------------------------
// Admin: Templates
// ---------------------------------------------------------------------------

export function listFoiaTemplates(): Promise<FoiaRequestTemplate[]> {
  return apiFetch("/api/admin/foia/templates")
}

export function createFoiaTemplate(data: Partial<FoiaRequestTemplate>): Promise<FoiaRequestTemplate> {
  return apiFetch("/api/admin/foia/templates", { method: "POST", body: JSON.stringify(data) })
}

export function updateFoiaTemplate(
  id: number,
  data: Partial<FoiaRequestTemplate>
): Promise<FoiaRequestTemplate> {
  return apiFetch(`/api/admin/foia/templates/${id}`, { method: "PUT", body: JSON.stringify(data) })
}

export function deleteFoiaTemplate(id: number): Promise<{ deleted: boolean }> {
  return apiFetch(`/api/admin/foia/templates/${id}`, { method: "DELETE" })
}

// ---------------------------------------------------------------------------
// Admin: Metrics
// ---------------------------------------------------------------------------

export function getFoiaMetricsSummary(): Promise<FoiaDashboardSummary> {
  return apiFetch("/api/admin/foia/metrics/summary")
}

export function getCityFoiaMetrics(cityId: number): Promise<Record<string, unknown>> {
  return apiFetch(`/api/admin/foia/cities/${cityId}/metrics`)
}

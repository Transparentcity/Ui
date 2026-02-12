"use server"

/**
 * Server actions for FOIA mutations.
 *
 * These call the backend FOIA API and revalidate the relevant paths so
 * Next.js caches are invalidated after writes.
 */

import { revalidatePath } from "next/cache"
import { API_BASE } from "@/lib/apiBase"

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function apiRequest<T = unknown>(
  method: "POST" | "PUT" | "DELETE",
  path: string,
  body?: unknown
): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) {
    const text = await res.text().catch(() => "")
    throw new Error(`FOIA API ${res.status}: ${text || res.statusText}`)
  }
  if (method === "DELETE") return undefined as T
  return res.json() as Promise<T>
}

// ---------------------------------------------------------------------------
// Requests
// ---------------------------------------------------------------------------

export async function createFoiaRequest(data: {
  city_id: number
  dataset_type_id: string
  title?: string
  request_description?: string
  department_id?: number
  requester_profile_id?: number
  requester_email_override?: string
  case_or_cad_number?: string
  portal_fields?: Record<string, unknown>
  coverage_start?: string
  coverage_end?: string
  requested_fields?: string[]
  format_requested?: string
  assigned_to?: string
  submission_url?: string
  submission_email_address?: string
}) {
  const result = await apiRequest("POST", "/api/foia/requests", data)
  revalidatePath("/foia")
  revalidatePath("/foia/requests")
  return result
}

export async function submitFoiaRequest(requestId: number) {
  const result = await apiRequest("POST", `/api/foia/requests/${requestId}/submit`)
  revalidatePath("/foia")
  revalidatePath("/foia/requests")
  revalidatePath(`/foia/requests/${requestId}`)
  return result
}

export async function rewriteFoiaRequest(
  requestId: number,
  data: {
    coverage_start?: string
    coverage_end?: string
    requested_fields?: string[]
    format_requested?: string
    incomplete_reason?: string
  }
) {
  const result = await apiRequest("POST", `/api/foia/requests/${requestId}/rewrite`, data)
  revalidatePath("/foia")
  revalidatePath("/foia/requests")
  return result
}

export async function updateRequestStatus(
  requestId: number,
  status: string,
  actor?: string,
  notes?: string
) {
  const result = await apiRequest("POST", `/api/foia/requests/${requestId}/status`, {
    status,
    actor: actor ?? "admin",
    notes,
  })
  revalidatePath("/foia")
  revalidatePath("/foia/requests")
  revalidatePath(`/foia/requests/${requestId}`)
  return result
}

// ---------------------------------------------------------------------------
// Messages
// ---------------------------------------------------------------------------

export async function createFoiaMessage(
  requestId: number,
  data: {
    direction: string
    classification?: string
    subject?: string
    body?: string
    sender?: string
    recipient?: string
    sender_name?: string
    sender_email?: string
    sender_phone?: string
    sender_title?: string
    notes?: string
    email_snippet?: string
    channel?: string
    response_action_required?: string
  }
) {
  const result = await apiRequest("POST", `/api/foia/requests/${requestId}/messages`, data)
  revalidatePath(`/foia/requests/${requestId}`)
  revalidatePath("/foia/messages")
  return result
}

// ---------------------------------------------------------------------------
// Attachments
// ---------------------------------------------------------------------------

export async function uploadFoiaAttachment(
  requestId: number,
  data: {
    filename: string
    file_type?: string
    file_size_bytes?: number
    uri: string
    message_id?: number
  }
) {
  const result = await apiRequest("POST", `/api/foia/requests/${requestId}/attachments`, data)
  revalidatePath(`/foia/requests/${requestId}`)
  revalidatePath("/foia/data-review")
  return result
}

export async function uploadFoiaFile(
  requestId: number,
  formData: FormData,
) {
  const res = await fetch(`${API_BASE}/api/foia/requests/${requestId}/upload`, {
    method: "POST",
    body: formData,
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Upload failed: ${text}`)
  }
  revalidatePath(`/foia/requests/${requestId}`)
  revalidatePath("/foia/data-review")
  return res.json()
}

// ---------------------------------------------------------------------------
// Tasks
// ---------------------------------------------------------------------------

export async function createFoiaTask(data: {
  request_id?: number
  city_id?: number
  type: string
  title: string
  description?: string
  assigned_to?: string
  due_at?: string
}) {
  const result = await apiRequest("POST", "/api/foia/tasks", data)
  revalidatePath("/foia")
  revalidatePath("/foia/tasks")
  return result
}

export async function assignFoiaTask(taskId: number, assignedTo: string) {
  const result = await apiRequest("POST", `/api/foia/tasks/${taskId}/assign`, {
    assigned_to: assignedTo,
  })
  revalidatePath("/foia/tasks")
  return result
}

export async function completeFoiaTask(taskId: number) {
  const result = await apiRequest("POST", `/api/foia/tasks/${taskId}/complete`)
  revalidatePath("/foia")
  revalidatePath("/foia/tasks")
  revalidatePath("/foia/messages")
  return result
}

// ---------------------------------------------------------------------------
// AI Draft (follow-up / rewrite)
// ---------------------------------------------------------------------------

export async function aiDraftFollowUp(
  requestId: number,
  mode: "draft_request" | "draft_followup" | "draft_rewrite" = "draft_followup",
  additionalContext?: string
): Promise<{ draft: string; mode: string; saved_as_message: boolean }> {
  const result = await apiRequest<{ draft: string; mode: string; saved_as_message: boolean }>(
    "POST",
    `/api/foia/requests/${requestId}/ai-draft`,
    { mode, additional_context: additionalContext }
  )
  revalidatePath(`/foia/requests/${requestId}`)
  revalidatePath("/foia/messages")
  return result
}

// ---------------------------------------------------------------------------
// Dataset Instances
// ---------------------------------------------------------------------------

export async function createDatasetInstance(data: {
  city_id: number
  dataset_type_id: string
  request_id?: number
  attachment_id?: number
  status?: string
  row_count?: number
  coverage_start?: string
  coverage_end?: string
  completeness_score?: number
  field_mapping?: Record<string, string>
}) {
  const result = await apiRequest("POST", "/api/foia/dataset-instances", data)
  revalidatePath("/foia/data-review")
  return result
}

// ---------------------------------------------------------------------------
// Admin: City Profile
// ---------------------------------------------------------------------------

export async function updateCityFoiaProfile(
  cityId: number,
  data: Record<string, unknown>
) {
  const result = await apiRequest("PUT", `/api/admin/foia/cities/${cityId}/profile`, data)
  revalidatePath(`/foia/cities/${cityId}`)
  return result
}

export async function updateCityDatasetTargets(
  cityId: number,
  targets: Array<{ dataset_type_id: string; status: string; refresh_cadence_days?: number; notes?: string }>
) {
  const result = await apiRequest("PUT", `/api/admin/foia/cities/${cityId}/dataset-targets`, {
    targets,
  })
  revalidatePath(`/foia/cities/${cityId}`)
  return result
}

// ---------------------------------------------------------------------------
// Admin: Templates
// ---------------------------------------------------------------------------

export async function createFoiaTemplate(data: {
  name: string
  dataset_type_id?: string
  jurisdiction_type?: string
  subject_template: string
  body_template: string
  notes?: string
}) {
  const result = await apiRequest("POST", "/api/admin/foia/templates", data)
  revalidatePath("/foia/templates")
  return result
}

export async function updateFoiaTemplate(
  templateId: number,
  data: Record<string, unknown>
) {
  const result = await apiRequest("PUT", `/api/admin/foia/templates/${templateId}`, data)
  revalidatePath("/foia/templates")
  return result
}

export async function deleteFoiaTemplate(templateId: number) {
  await apiRequest("DELETE", `/api/admin/foia/templates/${templateId}`)
  revalidatePath("/foia/templates")
}

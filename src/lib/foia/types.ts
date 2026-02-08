// FOIA Module Types - matching the backend object model

export type RequestStatus =
  | "draft"
  | "submitted"
  | "submitted_unacknowledged"
  | "acknowledged"
  | "clarification_requested"
  | "partially_fulfilled"
  | "fee_requested"
  | "extension_claimed"
  | "denied"
  | "fulfilled"
  | "closed_incomplete"

export type SubmissionMethod = "email" | "web" | "fax" | "mail" | "portal"

export type MessageClassification =
  | "clarification"
  | "fee_notice"
  | "denial"
  | "data_delivery"
  | "reroute"
  | "follow_up"
  | "initial_request"
  | "acknowledgment"

export type TaskType =
  | "review_rewrite"
  | "approve_follow_up"
  | "portal_submission"
  | "review_data_completeness"
  | "mapping_needed"
  | "review_delivery"

export type TaskStatus = "pending" | "assigned" | "in_progress" | "completed" | "cancelled"

export type DatasetTargetStatus = "targeted" | "optional" | "out_of_scope" | "potentially_obtainable"

// Core objects

export interface City {
  id: number
  name: string
  state: string
  population?: number
}

export interface CityFoiaProfile {
  id: number
  city_id: number
  city?: City
  submission_method: SubmissionMethod
  contact_name?: string
  contact_email?: string
  contact_phone?: string
  portal_url?: string
  required_fields: string[]
  statute_name: string
  default_response_days: number
  observed_ack_latency_days?: number
  common_deflections: string[]
  notes?: string
  created_at: string
  updated_at: string
}

export interface CityDatasetTarget {
  id: number
  city_id: number
  dataset_type_id: string
  status: DatasetTargetStatus
  refresh_cadence_days?: number
  last_received_at?: string
  notes?: string
  created_at: string
  updated_at: string
}

export interface FoiaRequest {
  id: number
  city_id: number
  city?: City
  dataset_type_id: string
  coverage_start: string
  coverage_end: string
  requested_fields: string[]
  format_requested: string
  status: RequestStatus
  submitted_at?: string
  acknowledged_at?: string
  deadline_at?: string
  next_followup_at?: string
  agency_request_number?: string
  request_version: number
  parent_request_id?: number
  assigned_to?: string
  created_at: string
  updated_at: string
}

export interface FoiaMessage {
  id: number
  request_id: number
  direction: "inbound" | "outbound"
  classification: MessageClassification
  subject: string
  body: string
  sender?: string
  recipient?: string
  sent_at?: string
  created_at: string
}

export interface FoiaAttachment {
  id: number
  request_id: number
  message_id?: number
  filename: string
  file_type: string
  file_size_bytes: number
  uri: string
  metadata?: Record<string, unknown>
  uploaded_at: string
}

export interface FoiaTask {
  id: number
  request_id?: number
  city_id?: number
  type: TaskType
  status: TaskStatus
  title: string
  description: string
  assigned_to?: string
  due_at?: string
  completed_at?: string
  created_at: string
  updated_at: string
}

export interface FoiaRequestEvent {
  id: number
  request_id: number
  from_status?: RequestStatus
  to_status: RequestStatus
  actor: string
  notes?: string
  metadata?: Record<string, unknown>
  created_at: string
}

export interface DatasetInstance {
  id: number
  city_id: number
  city?: City
  dataset_type_id: string
  request_id?: number
  attachment_id?: number
  status: "pending_review" | "accepted" | "rejected" | "needs_mapping"
  row_count?: number
  coverage_start?: string
  coverage_end?: string
  completeness_score?: number
  field_mapping?: Record<string, string>
  created_at: string
  updated_at: string
}

export interface FoiaRequestTemplate {
  id: number
  name: string
  dataset_type_id?: string
  jurisdiction_type?: string
  subject_template: string
  body_template: string
  notes?: string
  created_at: string
  updated_at: string
}

export interface CompletenessSnapshot {
  city_id: number
  city?: City
  total_targets: number
  fulfilled_targets: number
  partial_targets: number
  completeness_pct: number
  potential_completeness_pct: number
  last_computed_at: string
}

export interface FoiaDashboardSummary {
  total_requests: number
  open_requests: number
  unacknowledged: number
  awaiting_review: number
  tasks_due: number
  overdue_requests: number
  completeness_by_city: CompletenessSnapshot[]
}

export interface PaginatedResponse<T> {
  items: T[]
  total: number
  page: number
  page_size: number
}

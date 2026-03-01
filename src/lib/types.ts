/**
 * Prospect (Government Official) for CRM outreach
 * 
 * The `jurisdiction` field is critical for anomaly matching:
 * - Should match district format (e.g., "D5", "District 11", "Mission")
 * - Used to automatically match anomalies by geographic area
 */
export interface Prospect {
  id: string
  name: string
  title: string | null
  department: string | null
  organization: string | null
  email: string | null
  phone: string | null
  jurisdiction: string | null       // District/area for matching anomalies (e.g., "D5", "District 11")
  city_id: number | null            // Platform city ID for anomaly matching (e.g., 57260 = San Francisco)
  city_name: string | null          // Display name of the city (denormalized for convenience)
  priority: number                  // 1=highest, 5=lowest
  status: 'active' | 'inactive' | 'unsubscribed'
  notes: string | null
  created_at: string
  updated_at: string
  // Join table data (populated when fetching with joins)
  prospect_keywords?: Array<{
    keyword_id: string
    keyword?: Keyword
  }>
}

// Alias for backwards compatibility
export type Contact = Prospect

export interface Keyword {
  id: string
  name: string
  description: string | null
  category: string | null
  created_at: string
}

export interface ProspectKeyword {
  id: string
  prospect_id: string
  keyword_id: string
  created_at: string
}

// Alias for backwards compatibility
export type ContactKeyword = ProspectKeyword

export interface Template {
  id: string
  name: string
  subject: string | null
  body: string
  channel: 'email' | 'sms'
  category: string | null
  created_at: string
  updated_at: string
}

export interface Campaign {
  id: string
  name: string
  description: string | null
  template_id: string | null
  status: 'draft' | 'scheduled' | 'active' | 'paused' | 'completed'
  scheduled_at: string | null
  started_at: string | null
  completed_at: string | null
  created_at: string
  updated_at: string
}

export interface Message {
  id: string
  contact_id: string
  campaign_id: string | null
  template_id: string | null
  channel: 'email' | 'sms'
  subject: string | null
  body: string
  status: 'pending' | 'sent' | 'delivered' | 'failed' | 'bounced'
  sent_at: string | null
  delivered_at: string | null
  external_id: string | null
  created_at: string
}

export interface Response {
  id: string
  message_id: string | null
  contact_id: string
  channel: 'email' | 'sms' | 'phone' | 'other'
  content: string | null
  sentiment: 'positive' | 'neutral' | 'negative' | 'needs_followup' | null
  priority: number
  status: 'new' | 'reviewed' | 'actioned' | 'archived'
  action_required: boolean
  action_notes: string | null
  responded_at: string
  reviewed_at: string | null
  created_at: string
}

export interface Followup {
  id: string
  contact_id: string
  response_id: string | null
  title: string
  description: string | null
  due_date: string
  status: 'pending' | 'completed' | 'cancelled' | 'overdue'
  priority: number
  completed_at: string | null
  created_at: string
}

/**
 * CRM-specific metadata for anomalies
 * Stored in the `crm_anomaly_metadata` table - separate from core anomaly_results
 */
export interface CrmAnomalyMetadata {
  id: string                        // UUID primary key
  anomaly_id: number                // References anomaly_results.id (INTEGER/SERIAL)
  district_label: string | null     // CRM district label for matching (e.g., "D5", "District 11")
  is_citywide: boolean              // true = relevant to all contacts regardless of district
  severity: 'low' | 'medium' | 'high' | 'critical'
  crm_status: 'new' | 'sent' | 'acknowledged' | 'resolved'  // CRM workflow status
  notes: string | null              // Internal CRM notes
  created_at: string
  updated_at: string
}

/**
 * Anomaly type for CRM integration
 * 
 * NOTE: This interfaces with the `anomaly_results` table from TransparentCity Platform.
 * The core anomaly_results table is NOT modified - CRM data is stored separately.
 * 
 * ARCHITECTURE:
 * - Core fields come from anomaly_results (owned by Platform)
 * - CRM-specific data comes from crm_anomaly_metadata table (optional join)
 * - The `id` field is INTEGER (SERIAL) in the database
 */
export interface Anomaly {
  id: string | number               // SERIAL in database (integer), but can be string in JS
  title?: string                    // Optional - may not exist in anomaly_results
  description?: string | null
  data_source?: string | null
  district?: number | null          // Backend INTEGER column (0 = citywide, 1-11 = district)
  status?: string                   // Original status from anomaly_results
  metadata?: Record<string, unknown> | null
  created_at: string
  updated_at?: string
  // Backend anomaly_results fields
  metric_id?: number
  group_field?: string              // e.g., "priority_final"
  group_value?: string              // e.g., "C"
  period_type?: string              // e.g., "month"
  period_date?: string | null       // Optional date for the period (backend-dependent)
  comparison_window?: string | null // Optional window label/description (backend-dependent)
  pct_change?: number               // Percentage change
  is_anomaly?: boolean
  chart_payload?: {
    subtitle?: string
    dates?: string[]
    values?: number[]
    [key: string]: unknown
  }
  // CRM metadata (populated via join to crm_anomaly_metadata table)
  crm_metadata?: CrmAnomalyMetadata
  // Convenience accessors (for backward compatibility - read from crm_metadata if available)
  district_label?: string | null
  is_citywide?: boolean
  severity?: 'low' | 'medium' | 'high' | 'critical'
  crm_status?: 'new' | 'sent' | 'acknowledged' | 'resolved'
  // Join table data (populated when fetching with joins)
  anomaly_keywords?: Array<{
    keyword_id: string
    keyword?: Keyword
  }>
}

// Extended types with relationships
export interface ContactWithKeywords extends Contact {
  keywords?: Keyword[]
}

// Dynamic Template System Types

export interface TemplateVariation {
  id: string
  template_id: string
  variation_key: string
  variations: string[]
  created_at: string
  updated_at: string
}

export interface SubjectVariation {
  id: string
  template_id: string
  subject: string
  weight: number
  created_at: string
}

export interface SendQueueItem {
  id: string
  campaign_id: string | null
  prospect_id: string
  template_id: string | null
  anomaly_result_id?: number | null
  channel: 'email' | 'sms'
  personalized_subject: string | null
  personalized_body: string | null
  anomaly_snippet: string | null
  chart_url?: string | null
  variation_seed: number | null
  priority: number
  status: 'pending_review' | 'queued' | 'processing' | 'sent' | 'failed' | 'cancelled' | 'discarded'
  scheduled_for: string | null
  sent_at: string | null
  error_message: string | null
  created_at: string
  prospect?: Contact
}

export interface ThrottleSettings {
  id: string
  campaign_id: string
  emails_per_minute: number
  emails_per_hour: number
  emails_per_day: number
  min_delay_seconds: number
  max_delay_seconds: number
  randomize_delay: boolean
  active_hours_start: number
  active_hours_end: number
  active_days: string[]
  respect_timezone: boolean
  created_at: string
  updated_at: string
}

export interface ToneProfile {
  id: string
  name: string
  description: string | null
  formality_level: number
  urgency_level: number
  warmth_level: number
  settings: Record<string, unknown>
  created_at: string
}

// Variation slot markers used in templates
export type VariationSlot = 
  | 'greeting' 
  | 'opening' 
  | 'body_intro' 
  | 'call_to_action' 
  | 'closing' 
  | 'signature'
  | 'anomaly_intro'

// Extended template with variations
export interface TemplateWithVariations extends Template {
  variations?: TemplateVariation[]
  subject_variations?: SubjectVariation[]
  tone_profile?: ToneProfile | null
  variation_enabled?: boolean
}


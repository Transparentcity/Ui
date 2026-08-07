import { request } from "./request";

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

// Seymour's outbox (outbound emails)

export interface OutboundEmailListItem {
  id: number;
  to_email: string;
  subject: string;
  body_preview: string;
  prompt_text: string | null;
  source: string;
  user_id: number | null;
  city_id: number | null;
  created_at: string | null;
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
  government_email?: string | null;
  government_user_type?: string | null;
  government_leader_id?: number | null;
  government_leader_name?: string | null;
  government_city_id?: number | null;
  government_district?: number | null;
  custom_email_prompt?: string | null;
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
}

export function listUsers(
  token: string,
  options?: {
    role?: string;
    is_active?: boolean;
    is_city_lead?: boolean;
    source?: string;
    user_role_type?: string;
    government_status?: string;
    q?: string;
    page?: number;
    page_size?: number;
    skip?: number;
    limit?: number;
  }
): Promise<{
  items: User[];
  total: number;
  page: number;
  page_size: number;
  pages: number;
}> {
  const params = new URLSearchParams();
  if (options?.role) params.append("role", options.role);
  if (options?.is_active !== undefined) params.append("is_active", options.is_active.toString());
  if (options?.is_city_lead !== undefined) params.append("is_city_lead", options.is_city_lead.toString());
  if (options?.source) params.append("source", options.source);
  if (options?.user_role_type) params.append("user_role_type", options.user_role_type);
  if (options?.government_status) params.append("government_status", options.government_status);
  if (options?.q?.trim()) params.append("q", options.q.trim());
  if (options?.page !== undefined) params.append("page", options.page.toString());
  if (options?.page_size !== undefined) params.append("page_size", options.page_size.toString());
  if (options?.skip !== undefined) params.append("skip", options.skip.toString());
  if (options?.limit !== undefined) params.append("limit", options.limit.toString());
  
  const query = params.toString();
  const path = `/api/admin/users${query ? `?${query}` : ""}`;
  return request<{
    items: User[];
    total: number;
    page: number;
    page_size: number;
    pages: number;
  }>(path, "GET", undefined, token);
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

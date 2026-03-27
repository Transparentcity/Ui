import { request } from "./request";

// FEED STORIES API
// ============================================================================

export interface FeedStory {
  id: number;
  story_type: string;
  city_id: number;
  city_name?: string | null;
  city_emoji?: string | null;
  district: number;
  research_report_id: number;
  newsletter_frequency?: string | null;
  newsletter_period_start?: string | null;
  headline: string;
  description: string;
  summary?: string | null;
  primary_visualization?: Record<string, any> | null;
  visualization_type?: string | null;
  visualization_ref_id?: number | null;
  detail_url: string;
  /** Call-to-action label, e.g. "Read full report", "View metric", "View anomaly details". Defaults to "Read full report". */
  cta_label?: string | null;
  related_urls?: Array<Record<string, any>>;
  view_count: number;
  click_count: number;
  share_count: number;
  applaud_count?: number;
  escalate_count?: number;
  investigate_count?: number;
  /** @deprecated Use applaud_count. Kept for backward compat with pre-074 API responses. */
  like_count?: number;
  /** @deprecated Use escalate_count. Kept for backward compat with pre-074 API responses. */
  comment_count?: number;
  priority_score: number;
  is_featured: boolean;
  status: string;
  story_date: string;
  published_at?: string | null;
  metadata?: Record<string, any>;
  created_at?: string | null;
  updated_at?: string | null;
  /** Current user's AI feedback (thumbs up/down); only when authenticated. */
  user_ai_feedback?: "up" | "down" | null;
  short_hash?: string | null;
  public_url?: string | null;
  /** Long-form HTML for the canonical public story page (feed-producer stories). */
  article_html?: string | null;
}

export interface FeedStoriesResponse {
  stories: FeedStory[];
  count: number;
}

export interface FeedStoryResponse {
  story: FeedStory;
}

export interface EngagementRequest {
  action: "view" | "click" | "share";
}

export interface EngagementResponse {
  success: boolean;
  message: string;
}

export function listFeedStories(
  token: string,
  options?: {
    city_id?: number;
    district?: number | null;
    scope?: "city_wide" | "district_only" | null;
    newsletter_frequency?: string | null;
    research_report_id?: number;
    /** Filter by feed story category (e.g. 'personal_newsletter'). */
    category?: string | null;
    limit?: number;
    order_by?: string;
    /** When true and no city_id, return all active stories (ignore subscription/follows). Use for "All Cities" view. */
    all_cities?: boolean;
    /** Filter by story type (e.g. 'off_the_charts', 'alert', 'trend'). */
    story_type?: string | null;
  }
): Promise<FeedStoriesResponse> {
  const params = new URLSearchParams();
  if (options?.city_id) params.append("city_id", options.city_id.toString());
  if (options?.district !== undefined && options?.district !== null) {
    params.append("district", options.district.toString());
  }
  if (options?.scope) params.append("scope", options.scope);
  if (options?.newsletter_frequency) {
    params.append("newsletter_frequency", options.newsletter_frequency);
  }
  if (options?.research_report_id) {
    params.append("research_report_id", options.research_report_id.toString());
  }
  if (options?.category) params.append("category", options.category);
  if (options?.limit) params.append("limit", options.limit.toString());
  if (options?.order_by) params.append("order_by", options.order_by);
  if (options?.all_cities) params.append("all_cities", "true");
  if (options?.story_type) params.append("story_type", options.story_type);

  const query = params.toString();
  const path = `/api/feed${query ? `?${query}` : ""}`;
  return request<FeedStoriesResponse>(path, "GET", undefined, token);
}

/** A (city, district) place that has at least one active feed story (for filter UI). */
export interface FeedPlace {
  city_id: number;
  city_name: string;
  city_emoji: string;
  district: number;
  label: string;
  district_term?: string;
}

export interface FeedPlacesResponse {
  places: FeedPlace[];
  cities_with_metrics_count?: number;
}

export function listFeedPlaces(token: string): Promise<FeedPlacesResponse> {
  return request<FeedPlacesResponse>(`/api/feed/places`, "GET", undefined, token);
}

export function getFeedStory(storyId: number, token: string): Promise<FeedStoryResponse> {
  return request<FeedStoryResponse>(`/api/feed/story/${storyId}`, "GET", undefined, token);
}

export function trackFeedEngagement(
  storyId: number,
  action: "view" | "click" | "share" | "like",
  token: string
): Promise<EngagementResponse> {
  return request<EngagementResponse>(
    `/api/feed/story/${storyId}/engage`,
    "POST",
    { action },
    token
  );
}

/** Set AI feedback (thumbs up/down) for a story. Requires auth. */
export function setFeedStoryFeedback(
  storyId: number,
  feedback: "up" | "down",
  token: string
): Promise<EngagementResponse> {
  return request<EngagementResponse>(
    `/api/feed/story/${storyId}/feedback`,
    "POST",
    { feedback },
    token
  );
}

/** Hide story from current user's feed. Other users still see it. Requires auth. */
export function hideFeedStory(storyId: number, token: string): Promise<EngagementResponse> {
  return request<EngagementResponse>(
    `/api/feed/story/${storyId}/hide`,
    "POST",
    undefined,
    token
  );
}

// Admin feed delete (requires admin)
export interface DeleteFeedStoryResponse {
  success: boolean;
  message: string;
  deleted: number;
}

export interface DeleteFeedStoriesByCityResponse {
  success: boolean;
  message: string;
  deleted: number;
  city_id: number;
  district?: number | null;
}

export function deleteFeedStory(storyId: number, token: string): Promise<DeleteFeedStoryResponse> {
  return request<DeleteFeedStoryResponse>(
    `/api/feed/admin/story/${storyId}`,
    "DELETE",
    undefined,
    token
  );
}

export function deleteFeedStoriesByCity(
  cityId: number,
  token: string,
  district?: number | null
): Promise<DeleteFeedStoriesByCityResponse> {
  const params = new URLSearchParams();
  if (district !== undefined && district !== null) {
    params.append("district", district.toString());
  }
  const query = params.toString();
  const path = `/api/feed/admin/by-city/${cityId}${query ? `?${query}` : ""}`;
  return request<DeleteFeedStoriesByCityResponse>(path, "DELETE", undefined, token);
}

/** Cities that have at least one active feed story (for admin dropdown). */
export interface CityWithFeedStories {
  city_id: number;
  city_name: string;
  state?: string | null;
  story_count: number;
}

export function listCitiesWithFeedStories(token: string): Promise<CityWithFeedStories[]> {
  return request<CityWithFeedStories[]>(`/api/feed/admin/cities-with-stories`, "GET", undefined, token);
}

// Public feed endpoints (no auth required)
export function listPublicFeedStories(
  options?: {
    city_id?: number;
    district?: number | null;
    scope?: "city_wide" | "district_only" | null;
    newsletter_frequency?: string | null;
    limit?: number;
    order_by?: string;
    story_type?: string | null;
  }
): Promise<FeedStoriesResponse> {
  const params = new URLSearchParams();
  if (options?.city_id) params.append("city_id", options.city_id.toString());
  if (options?.district !== undefined && options?.district !== null) {
    params.append("district", options.district.toString());
  }
  if (options?.scope) params.append("scope", options.scope);
  if (options?.newsletter_frequency) {
    params.append("newsletter_frequency", options.newsletter_frequency);
  }
  if (options?.limit) params.append("limit", options.limit.toString());
  if (options?.order_by) params.append("order_by", options.order_by);
  if (options?.story_type) params.append("story_type", options.story_type);

  const query = params.toString();
  const path = `/api/feed/public${query ? `?${query}` : ""}`;
  return request<FeedStoriesResponse>(path, "GET", undefined);
}

export function getPublicFeedStory(storyId: number): Promise<FeedStoryResponse> {
  return request<FeedStoryResponse>(`/api/feed/public/story/${storyId}`, "GET", undefined);
}

export function getPublicFeedStoryByHash(hash: string): Promise<FeedStoryResponse> {
  return request<FeedStoryResponse>(`/api/feed/public/story/by-hash/${hash}`, "GET", undefined);
}

export function listPublicFeedPlaces(): Promise<FeedPlacesResponse> {
  return request<FeedPlacesResponse>(`/api/feed/public/places`, "GET", undefined);
}

export interface GenerateFeedStoriesRequest {
  city_id?: number;
  district?: number;
  newsletter_frequency?: string;
  story_count?: number;
}

export interface GenerateFeedStoriesResponse {
  success: boolean;
  message: string;
  report_id: number;
  stories_created: number;
  story_ids: number[];
  city_id: number;
  district: number;
  frequency: string;
}

export function generateFeedStoriesFromResearch(
  reportId: number,
  options: GenerateFeedStoriesRequest,
  token: string
): Promise<GenerateFeedStoriesResponse> {
  const params = new URLSearchParams();
  if (options.city_id) params.append("city_id", options.city_id.toString());
  if (options.district !== undefined) params.append("district", options.district.toString());
  if (options.newsletter_frequency) params.append("newsletter_frequency", options.newsletter_frequency);
  if (options.story_count) params.append("story_count", options.story_count.toString());
  
  const query = params.toString();
  const path = `/api/feed/generate-from-research/${reportId}${query ? `?${query}` : ""}`;
  return request<GenerateFeedStoriesResponse>(path, "POST", undefined, token);
}

// ============================================================================

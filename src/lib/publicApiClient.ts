import { getApiBaseUrl } from "./apiBase";

/** Browser and SSR/ISR: same-origin /api/* via Next rewrites in production. */
function resolvePublicApiBaseUrl(): string {
  return getApiBaseUrl();
}

// ============================================================================
// REQUEST DEDUPLICATION CACHE
// Prevents duplicate API calls that can happen with React.StrictMode or
// rapid component re-renders
// ============================================================================

interface CacheEntry<T> {
  data: T | null;
  promise: Promise<T> | null;
  timestamp: number;
}

const requestCache: Map<string, CacheEntry<unknown>> = new Map();
const CACHE_TTL_MS = 30000; // 30 second cache for public endpoints

function getCachedOrFetch<T>(
  cacheKey: string,
  fetchFn: () => Promise<T>,
  ttlMs: number = CACHE_TTL_MS
): Promise<T> {
  const now = Date.now();
  const cached = requestCache.get(cacheKey);
  
  // Return cached data if valid
  if (cached?.data && (now - cached.timestamp) < ttlMs) {
    return Promise.resolve(cached.data as T);
  }
  
  // Return in-flight promise if one exists
  if (cached?.promise && (now - cached.timestamp) < ttlMs) {
    return cached.promise as Promise<T>;
  }
  
  // Create new request and cache the promise
  const promise = fetchFn().then((data) => {
    requestCache.set(cacheKey, { data, promise: null, timestamp: Date.now() });
    return data;
  }).catch((err) => {
    // Clear cache on error
    requestCache.delete(cacheKey);
    throw err;
  });
  
  requestCache.set(cacheKey, { data: null, promise, timestamp: now });
  return promise;
}

async function requestPublic<T>(
  path: string,
  options?: { next?: { revalidate?: number | false; tags?: string[] } }
): Promise<T> {
  const url = `${resolvePublicApiBaseUrl()}${path}`;

  try {
    const res = await fetch(url, {
      method: "GET",
      // Public endpoints should not require cookies/auth headers.
      // Omitting credentials avoids cross-origin credential/CORS failures.
      credentials: "omit",
      headers: {
        Accept: "application/json",
      },
      // Cache public API responses for 1 hour, matching page-level ISR revalidation.
      // Callers may override (e.g. metric-ordering uses tags for on-demand bust).
      next: options?.next ?? { revalidate: 3600 },
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      let errorMessage: string;
      if (res.status === 502 || res.status === 503 || res.status === 504) {
        errorMessage =
          res.status === 502
            ? "The cities service is temporarily unavailable (bad gateway). Please try again in a few minutes."
            : res.status === 503
              ? "The cities service is temporarily unavailable. Please try again in a few minutes."
              : "The cities service took too long to respond. Please try again.";
      } else if (text) {
        try {
          const errorJson = JSON.parse(text);
          const detail = errorJson.message ?? errorJson.detail;
          errorMessage = typeof detail === "string" ? detail : `API GET ${path} failed: ${res.status}`;
        } catch {
          errorMessage = `API GET ${path} failed: ${res.status}`;
        }
      } else {
        errorMessage = `API GET ${path} failed: ${res.status}`;
      }
      const err = new Error(errorMessage) as Error & { status?: number };
      err.status = res.status;
      throw err;
    }

    return (await res.json()) as T;
  } catch (error) {
    // Handle network errors, CORS errors, and other fetch failures
    if (error instanceof TypeError && error.message.includes("fetch")) {
      // Network error - API might be unreachable
      throw new Error(
        `Failed to connect to API at ${resolvePublicApiBaseUrl()}. Please check if the API server is running and accessible.`
      );
    }
    // Re-throw if it's already an Error we created
    if (error instanceof Error) {
      throw error;
    }
    // Unknown error
    throw new Error(`Unexpected error fetching ${path}: ${String(error)}`);
  }
}

async function requestPublicPost<T>(
  path: string,
  body: object,
  fetchOptions?: { cache?: RequestCache }
): Promise<T> {
  const url = `${resolvePublicApiBaseUrl()}${path}`;
  try {
    const res = await fetch(url, {
      method: "POST",
      // Public endpoints should not require cookies/auth headers.
      credentials: "omit",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      ...(fetchOptions?.cache != null ? { cache: fetchOptions.cache } : {}),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      let errorMessage: string;
      if (res.status === 502 || res.status === 503 || res.status === 504) {
        errorMessage =
          res.status === 502
            ? "The service is temporarily unavailable (bad gateway). Please try again in a few minutes."
            : res.status === 503
              ? "The service is temporarily unavailable. Please try again in a few minutes."
              : "The service took too long to respond. Please try again.";
      } else if (text) {
        try {
          const errorJson = JSON.parse(text);
          const detail = errorJson.message ?? errorJson.detail;
          errorMessage = typeof detail === "string" ? detail : `API POST ${path} failed: ${res.status}`;
        } catch {
          errorMessage = `API POST ${path} failed: ${res.status}`;
        }
      } else {
        errorMessage = `API POST ${path} failed: ${res.status}`;
      }
      const err = new Error(errorMessage) as Error & { status?: number };
      err.status = res.status;
      throw err;
    }
    return (await res.json()) as T;
  } catch (error) {
    if (error instanceof TypeError && error.message.includes("fetch")) {
      throw new Error(
        `Failed to connect to API at ${resolvePublicApiBaseUrl()}. Please check if the API server is running and accessible.`
      );
    }
    if (error instanceof Error) throw error;
    throw new Error(`Unexpected error fetching ${path}: ${String(error)}`);
  }
}

export type PublicCitySitemapItem = {
  id: number;
  name: string;
  slug?: string;
  state?: string | null;
  country?: string | null;
  emoji?: string | null;
  datasets_count: number;
  is_launched?: boolean;
};

export function listPublicCitiesForSitemap(): Promise<PublicCitySitemapItem[]> {
  return requestPublic<PublicCitySitemapItem[]>("/api/public/cities/sitemap");
}

// Public city detail with metrics (for logged-out city page dashboard)
export type PublicCityMetricItem = {
  id: number;
  metric_name: string;
  metric_key: string;
  category: string;
  subcategory?: string | null;
  show_on_dash?: boolean;
  /** "up" = increase is good (green); "down" = decrease is good. From API; defaults in UI if absent. */
  greendirection?: string | null;
  /** "flow" (event counts per period) or "stock" (point-in-time level). Defaults to "flow". */
  measurement_type?: "flow" | "stock";
};

export type PublicCityDetail = {
  id: number;
  name: string;
  state?: string | null;
  country?: string | null;
  emoji?: string | null;
  main_domain?: string | null;
  main_portal_url?: string | null;
  all_portal_urls?: string[] | null;
  metrics: PublicCityMetricItem[];
  mayor?: { name: string } | null;
  mayor_subscriber_count?: number;
  is_launched?: boolean;
  official_district_shape_layer_id?: number | null;
  geographic_unit_label?: string | null;
  geographic_unit_label_plural?: string | null;
  navigation_mode?: string | null;
  geographic_structures?: Array<{
    min_value?: number | null;
    max_value?: number | null;
  }>;
};

export function getPublicCityDetail(
  cityId: number,
  options?: { includeMetrics?: boolean }
): Promise<PublicCityDetail> {
  const includeMetrics = options?.includeMetrics ?? true;
  return requestPublic<PublicCityDetail>(
    `/api/public/cities/${cityId}?include_metrics=${includeMetrics ? "true" : "false"}`
  );
}

// Public city metric ordering (admin-defined default order, no auth required)
export type PublicMetricOrderingItem = {
  metric_id: number | null;
  category_name: string;
  category_order: number;
  metric_order: number;
  subcategory_name?: string | null;
  metric_name?: string | null;
};

export type PublicMetricOrderingResponse = {
  city_id: number;
  orderings: PublicMetricOrderingItem[];
};

export function getPublicCityMetricOrdering(
  cityId: number
): Promise<PublicMetricOrderingResponse> {
  // Tagged so admin Display Settings save can revalidateTag immediately.
  return requestPublic<PublicMetricOrderingResponse>(
    `/api/public/cities/${cityId}/metric-ordering`,
    {
      next: {
        revalidate: 3600,
        tags: [`city-metric-ordering-${cityId}`],
      },
    }
  );
}

// Public maps for a city (filtered by city_id)
export type PublicMapListItem = {
  id: number;
  short_hash: string;
  title: string;
  city_name?: string | null;
};

export function listPublicMapsForCity(cityId: number): Promise<PublicMapListItem[]> {
  return requestPublic<{ maps: PublicMapListItem[] }>(
    `/api/maps/public?city_id=${cityId}&limit=20`
  ).then((r) => r.maps || []);
}

// Public leaders for a city (claim flow; used to show district reps on city pages)
export type PublicLeader = {
  id: number;
  city_id: number;
  name: string;
  title: string;
  district: number | null;
};

export function getPublicLeadersForCity(cityId: number): Promise<PublicLeader[]> {
  return requestPublic<PublicLeader[]>(`/api/claim/leaders?city_id=${cityId}`);
}

// Representative follower counts per district (public, for follow buttons)
export type PublicRepresentativeFollowerCount = {
  district: string;
  follower_count: number;
};

export function getPublicRepresentativeFollowerCounts(
  cityId: number
): Promise<PublicRepresentativeFollowerCount[]> {
  return requestPublic<PublicRepresentativeFollowerCount[]>(
    `/api/public/cities/${cityId}/representative-follower-counts`
  );
}

/** District numbers that have metric data for this city (for district links/dashboards). */
export function getPublicCityDistricts(cityId: number): Promise<number[]> {
  return requestPublic<number[]>(`/api/public/cities/${cityId}/districts`);
}

export type PublicCitySubdivision = {
  id: number;
  name: string;
};

export type PublicCitySubdivisionsResponse = {
  city_id: number;
  unit_label: string;
  unit_label_plural: string;
  navigation_mode: "district" | "neighborhood" | string;
  official_district_shape_layer_id?: number | null;
  subdivisions: PublicCitySubdivision[];
};

/** Named subdivisions (districts, neighborhoods, wards) for public navigation. */
export function getPublicCitySubdivisions(
  cityId: number,
): Promise<PublicCitySubdivisionsResponse> {
  return requestPublic<PublicCitySubdivisionsResponse>(
    `/api/public/cities/${cityId}/subdivisions`,
  );
}

// ---------------------------------------------------------------------------
// Boundary sketch — simplified district rings for the overview mini-map
// ---------------------------------------------------------------------------

export interface BoundarySketchDistrict {
  district_id: number;
  /** Outer coordinate rings [[lng, lat], …]. One per polygon part. */
  rings: [number, number][][];
}

export interface BoundarySketchBbox {
  min_lng: number;
  min_lat: number;
  max_lng: number;
  max_lat: number;
}

export interface BoundarySketch {
  districts: BoundarySketchDistrict[];
  /** Whole-city boundary (union of districts) — outer rings [[lng, lat], …]. */
  outline?: [number, number][][] | null;
  bbox: BoundarySketchBbox | null;
}

export function getCityBoundarySketch(cityId: number): Promise<BoundarySketch> {
  return requestPublic<BoundarySketch>(`/api/public/cities/${cityId}/boundary-sketch`);
}

// ---------------------------------------------------------------------------
// Shared Week Replay permalinks (/w/{hash})
// ---------------------------------------------------------------------------

export interface PublicWeekReplay {
  status: string;
  short_hash: string;
  title: string;
  city_id: number;
  city_name: string;
  city_slug: string;
  scope_district: number | null;
  scope_place: { lat: number; lng: number; radius_m: number } | null;
  created_at: string | null;
  events: import("./weekReplay").WeekEvent[];
  key_events: import("./weekReplay").WeekKeyEvent[];
  group_counts: Record<string, number>;
  total_before_cap: number;
  window: { start: string; end: string };
}

export function getPublicWeekReplay(shortHash: string): Promise<PublicWeekReplay> {
  return requestPublic<PublicWeekReplay>(
    `/api/public/week-replay/${encodeURIComponent(shortHash)}`,
    // Snapshots are immutable; cache aggressively.
    { next: { revalidate: 3600 } }
  );
}

/** Absolute URL of a shared replay's poster image (OG unfurls / downloads). */
export function publicWeekReplayPosterUrl(shortHash: string): string {
  return `${resolvePublicApiBaseUrl()}/api/public/week-replay/${encodeURIComponent(shortHash)}/poster.png`;
}

// Public feed stories (e.g. for district elected-official pages)
export type PublicFeedStory = {
  id: number;
  story_type: string;
  city_id: number;
  city_name?: string | null;
  city_emoji?: string | null;
  district: number;
  /** Seymour job provenance; rendered only after an admin permission check. */
  job_session_id?: string | null;
  job_model_key?: string | null;
  headline: string;
  description: string;
  summary?: string | null;
  detail_url: string;
  /** Call-to-action label, e.g. "Read full report", "View metric". Defaults to "Read full report". */
  cta_label?: string | null;
  story_date: string;
  published_at?: string | null;
  short_hash?: string | null;
  public_url?: string | null;
  /** Long-form HTML for the canonical public story page (feed-producer stories). */
  article_html?: string | null;
  image_url?: string | null;
  /**
   * Short alt text for the story image (screenreader-friendly).
   * Falls back to story headline when not explicitly set.
   */
  image_alt?: string | null;
  /**
   * Longer caption displayed below the story image.
   * Sourced from chart/map/anomaly metadata. Shown as visible fallback text
   * when the image cannot be rendered.
   */
  image_caption?: string | null;
  primary_visualization?: Record<string, unknown> | null;
  visualization_type?: string | null;
  /** Story metadata JSONB (provenance: prompt_source, scheduled_job_name, …). */
  metadata?: Record<string, unknown> | null;
};

export type PublicFeedStoriesResponse = {
  stories: PublicFeedStory[];
  count: number;
};

export function listPublicFeedStories(options?: {
  city_id?: number;
  district?: number | null;
  limit?: number;
  /** Pagination offset for the public feed list (paired with `limit`). */
  offset?: number;
  order_by?: string;
}): Promise<PublicFeedStoriesResponse> {
  const params = new URLSearchParams();
  if (options?.city_id != null) params.set("city_id", String(options.city_id));
  if (options?.district != null) params.set("district", String(options.district));
  if (options?.limit != null) params.set("limit", String(options.limit));
  if (options?.offset != null) params.set("offset", String(options.offset));
  if (options?.order_by) params.set("order_by", options.order_by);
  const query = params.toString();
  return requestPublic<PublicFeedStoriesResponse>(
    `/api/feed/public${query ? `?${query}` : ""}`
  );
}

export type PublicFeedStoryResponse = {
  story: PublicFeedStory;
};

/** Fetch a single feed story by its public short_hash. Use for SSR canonical pages. */
export function getPublicFeedStoryByHash(hash: string): Promise<PublicFeedStoryResponse> {
  return requestPublic<PublicFeedStoryResponse>(`/api/feed/public/story/by-hash/${hash}`);
}

export type PublicCitySearchResult = {
  id: number;
  name: string;
  state?: string | null;
  country?: string | null;
  emoji?: string | null;
  display_name: string;
};

function isUnitedStates(value: string | null | undefined): boolean {
  if (!value) return false;
  const v = value.trim().toLowerCase();
  // Handle various US country name formats
  return (
    v === "united states" ||
    v === "united states of america" ||
    v === "us" ||
    v === "usa" ||
    v === "u.s." ||
    v === "u.s.a." ||
    v === "united states of america (usa)" ||
    v.startsWith("united states")
  );
}

function sortUsCitiesFirst<T extends { country?: string | null; display_name?: string; name?: string }>(items: T[]): T[] {
  // Sort US cities first, then all other cities
  // Within each group, sort alphabetically by city name
  return [...items].sort((a, b) => {
    const aUs = isUnitedStates(a.country);
    const bUs = isUnitedStates(b.country);
    
    // If one is US and the other isn't, US comes first
    if (aUs !== bUs) {
      return aUs ? -1 : 1;
    }
    
    // Within the same group (both US or both not US), sort alphabetically by city name
    const aName = (a.display_name || a.name || "").toLowerCase();
    const bName = (b.display_name || b.name || "").toLowerCase();
    return aName.localeCompare(bName);
  });
}

export function searchPublicCities(
  query: string,
  limit: number = 10,
): Promise<PublicCitySearchResult[]> {
  const params = new URLSearchParams();
  params.set("q", query);
  params.set("limit", String(limit));
  return requestPublic<PublicCitySearchResult[]>(
    `/api/public/cities/search?${params.toString()}`,
  ).then(sortUsCitiesFirst);
}

// Public maps for sitemap
export type PublicMapSitemapItem = {
  id: number;
  short_hash: string;
  title: string;
  city_name: string | null;
};

export function listPublicMapsForSitemap(): Promise<PublicMapSitemapItem[]> {
  return requestPublic<{ maps: PublicMapSitemapItem[] }>(
    "/api/maps/public?limit=100"
  ).then((response) => response.maps || []);
}

// Public metrics for sitemap
export type PublicMetricSitemapItem = {
  metric_key: string;
  metric_name: string;
  category: string;
  /** Name-derived URL segment; matches `slug` on `/api/public/cities/sitemap`. */
  city_slug: string;
};

export function listPublicMetricsForSitemap(): Promise<PublicMetricSitemapItem[]> {
  return requestPublic<PublicMetricSitemapItem[]>("/api/public/metrics/sitemap");
}

// City-district pairs for sitemap (district supervisor pages)
export type PublicCityDistrictSitemapItem = {
  /** Name-derived URL segment; matches `slug` on `/api/public/cities/sitemap`. */
  city_slug: string;
  district: number;
  representative_name?: string | null;
  representative_slug?: string | null;
};

export function listPublicCityDistrictsForSitemap(): Promise<PublicCityDistrictSitemapItem[]> {
  return requestPublic<PublicCityDistrictSitemapItem[]>("/api/public/cities/districts/sitemap");
}

// Public metric endpoints
export type PublicMetricDetail = {
  id: number;
  metric_name: string;
  metric_key: string;
  category: string;
  subcategory: string | null;
  city_id?: number | null;
  endpoint: string | null;
  summary: string | null;
  definition: string | null;
  data_sf_url: string | null;
  dataset_title: string | null;
  dataset_category: string | null;
  dataset_name: string | null;  // Friendly name from datasets table
  show_on_dash: boolean;
  item_noun: string;
  greendirection: string;
  is_active: boolean;
  metric_type: string | null;
  /** "flow" (event counts per period, default) or "stock" (point-in-time level/inventory) */
  measurement_type: "flow" | "stock";
  data_source_type: string | null;
  source_url: string | null;
  template_id: number | null;
  metric_prompt: string | null;
  structuring_notes: Record<string, unknown> | null;
  metadata: Record<string, unknown> | null;
  location_fields: Array<Record<string, unknown>> | null;
  category_fields: Array<Record<string, unknown>> | null;
  map_query: string | null;
  map_filters: Record<string, unknown> | null;
  map_config: Record<string, unknown> | null;
  last_execution_at: string | null;
  last_execution_status: string | null;
  last_execution_error: string | null;
  last_execution_job_id: string | null;
  execution_count: number | null;
  created_at: string | null;
  updated_at: string | null;
  data_freshness_metadata: Record<string, unknown> | null;
  most_recent_data_date: string | null;
  earliest_data_date: string | null;
  city_name?: string | null;
};

/** For derived metrics: shows A/B=C formula with component values for transparency */
export type CalculationBreakdown = {
  formula: string;
  display_unit: string;
  numerator_metric_id: number;
  denominator_metric_id: number;
  numerator_name: string;
  denominator_name: string;
  current_period: {
    numerator_value: number | null;
    denominator_value: number | null;
    result: number | null;
  };
  comparison_period: {
    numerator_value: number | null;
    denominator_value: number | null;
    result: number | null;
  };
};

export type PublicMetricComparison = {
  metric_id: number;
  district: number | null;
  comparison_type: string;
  current_period_value: number | null;
  current_period_start: string | null;
  current_period_end: string | null;
  comparison_period_value: number | null;
  comparison_period_start: string | null;
  comparison_period_end: string | null;
  period_type: string;
  computed_at: string | null;
  is_precomputed: boolean;
  /** For derived metrics: A/B=C breakdown so users see exactly how the rate was calculated */
  calculation_breakdown?: CalculationBreakdown | null;
};

export type PublicMetricComparisons = {
  metric_id: number;
  district: number | null;
  comparisons: Record<string, PublicMetricComparison>;
};

export type PublicTimeSeriesSummaryItem = {
  chart_id: number;
  chart_title: string | null;
  period_type: string | null;
  district: number | null;
  data_point_count: number | null;
  created_at: string | null;
  group_field?: string | null;
};

export type PublicTimeSeriesSummary = {
  metric_id: number;
  metric_name: string;
  count: number;
  time_series: PublicTimeSeriesSummaryItem[];
};

export function getPublicMetric(metricId: number): Promise<PublicMetricDetail> {
  return requestPublic<PublicMetricDetail>(`/api/public/metrics/${metricId}`);
}

export function getPublicMetricByKey(metricKey: string): Promise<PublicMetricDetail> {
  return requestPublic<PublicMetricDetail>(`/api/public/metrics/key/${metricKey}`);
}

export function getPublicMetricComparisons(
  metricId: number,
  district?: number | null,
  comparisonTypes?: string
): Promise<PublicMetricComparisons> {
  const params = new URLSearchParams();
  // For citywide, pass district=0 explicitly (backend treats 0 and null as citywide)
  // For specific districts, pass the district number
  if (district !== undefined && district !== null && district > 0) {
    params.set("district", String(district));
  } else {
    // Explicitly pass district=0 for citywide to ensure backend matches correctly
    params.set("district", "0");
  }
  if (comparisonTypes) {
    params.set("comparison_types", comparisonTypes);
  }
  const query = params.toString();
  const path = `/api/public/metrics/${metricId}/comparisons?${query}`;
  const cacheKey = `metric-comparisons:${metricId}:${district || 0}:${comparisonTypes || ''}`;
  
  return getCachedOrFetch(cacheKey, () => requestPublic<PublicMetricComparisons>(path), 120000); // 2 minute cache
}

export type PublicBatchComparisonsRequest = {
  metric_ids: number[];
  district?: number | null;
  comparison_types?: string[] | null;
};

/** Backend returns Record<metric_id, Record<comparison_type, PublicMetricComparison>> */
type PublicBatchComparisonsRaw = Record<
  number,
  Record<string, PublicMetricComparison>
>;

/**
 * Fetch precomputed comparisons for multiple metrics in one request.
 * Use this for city and category dashboards instead of one call per metric.
 */
export function getPublicMetricComparisonsBatch(
  request: PublicBatchComparisonsRequest
): Promise<Record<number, PublicMetricComparisons>> {
  if (!request.metric_ids?.length) {
    return Promise.resolve({});
  }
  const cacheKey = `metric-comparisons-batch:${request.metric_ids.join(",")}:${request.district ?? 0}:${(request.comparison_types ?? ["ytd"]).join(",")}`;
  // No TTL / no fetch cache: comparisons change when metrics re-run; ISR pages
  // used to serve stale YTD for up to revalidate seconds without this.
  return getCachedOrFetch(
    cacheKey,
    async () => {
      const raw = await requestPublicPost<PublicBatchComparisonsRaw>(
        "/api/public/metrics/comparisons/batch",
        {
          metric_ids: request.metric_ids,
          district: request.district ?? 0,
          comparison_types: request.comparison_types ?? ["ytd"],
        },
        { cache: "no-store" }
      );
      const result: Record<number, PublicMetricComparisons> = {};
      for (const [idStr, comps] of Object.entries(raw)) {
        const metricId = Number(idStr);
        const compDict = comps as Record<string, PublicMetricComparison>;
        const first = Object.values(compDict)[0];
        result[metricId] = {
          metric_id: metricId,
          district: first?.district ?? null,
          comparisons: compDict,
        };
      }
      return result;
    },
    0
  );
}

export function getPublicMetricTimeSeriesSummary(
  metricId: number
): Promise<PublicTimeSeriesSummary> {
  const path = `/api/public/metrics/${metricId}/time-series/summary`;
  const cacheKey = `metric-ts-summary:${metricId}`;
  
  return getCachedOrFetch(cacheKey, () => requestPublic<PublicTimeSeriesSummary>(path), 120000); // 2 minute cache
}

/** Single time series chart data (public endpoint: GET /api/time-series/public/{chart_id}) */
export type PublicTimeSeriesChartPoint = {
  time_period: string;
  numeric_value: number;
  group_value?: string | null;
};

export type PublicTimeSeriesChartResponse = {
  count: number;
  /** Same metric/district/group_field: native chart IDs per stored period_type (day/week/month/year). */
  sibling_chart_ids?: Record<string, number> | null;
  metadata?: {
    chart_id?: number;
    object_id?: string;
    object_name?: string;
    chart_title?: string;
    caption?: string;
    period_type?: string;
    district?: number | null;
    [key: string]: unknown;
  };
  data: PublicTimeSeriesChartPoint[];
};

export function getPublicTimeSeriesChart(chartId: number): Promise<PublicTimeSeriesChartResponse> {
  const path = `/api/time-series/public/${chartId}`;
  const cacheKey = `metric-ts-chart:${chartId}`;
  return getCachedOrFetch(cacheKey, () => requestPublic<PublicTimeSeriesChartResponse>(path), 120000);
}

// Category breakdown (direct query — accurate for COUNT_DISTINCT metrics)
export type CategoryBreakdownItem = {
  group_value: string;
  count: number;
  percent: number | null;
};

export type CategoryBreakdownFieldResult = {
  field_name: string;
  display_name: string;
  items: CategoryBreakdownItem[];
  total: number;
};

export type CategoryBreakdownResponse = {
  metric_id: number;
  metric_name: string;
  period_start: string;
  period_end: string;
  district?: number | null;
  fields: CategoryBreakdownFieldResult[];
};

export function getPublicMetricCategoryBreakdown(
  metricId: number,
  startDate?: string | null,
  endDate?: string | null,
  district?: number | null,
): Promise<CategoryBreakdownResponse> {
  const params = new URLSearchParams();
  if (startDate) params.set("start_date", startDate);
  if (endDate) params.set("end_date", endDate);
  if (district != null && district > 0) params.set("district", String(district));
  const qs = params.toString();
  const path = `/api/public/metrics/${metricId}/category-breakdown${qs ? `?${qs}` : ""}`;
  const cacheKey = `metric-cat-breakdown:${metricId}:${startDate ?? ""}:${endDate ?? ""}:${district ?? ""}`;
  return getCachedOrFetch(cacheKey, () => requestPublic<CategoryBreakdownResponse>(path), 120000);
}

// Period completeness information
export type PeriodCompletenessInfo = {
  period_type: string;
  is_stable: boolean;
  completeness_pct?: number | null;
  days_to_stabilize?: number | null;
  sample_size?: number | null;
  avg_days_to_stabilize?: number | null;
  total_periods_tracked?: number | null;
  stable_periods_count?: number | null;
  unstable_periods_count?: number | null;
  periods_needed_for_pattern?: number | null;
  min_stable_periods_required?: number;
};

export type MetricCompletenessResponse = {
  metric_id: number;
  period_types: PeriodCompletenessInfo[];
  has_data: boolean;
};

export function getPublicMetricCompleteness(
  metricId: number
): Promise<MetricCompletenessResponse> {
  return requestPublic<MetricCompletenessResponse>(
    `/api/time-series/public/metric/${metricId}/completeness`
  );
}

// Completeness statistics
export type CompletenessStatisticsResponse = {
  metric_id: number;
  total_checks: number;
  total_runs: number;
  total_changes: number;
  recent_changes: number;
  max_change_magnitude_pct?: number | null;
  avg_change_magnitude_pct?: number | null;
  stable_periods_count: number;
  unstable_periods_count: number;
  avg_stable_days?: number | null;
  last_check_date?: string | null;
  periods_checked_today: number;
  periods_checked_this_week: number;
};

export function getPublicMetricCompletenessStats(
  metricId: number,
  district?: number | null
): Promise<CompletenessStatisticsResponse> {
  const districtQuery =
    district !== undefined && district !== null && district > 0
      ? `?district=${district}`
      : "";
  return requestPublic<CompletenessStatisticsResponse>(
    `/api/time-series/public/metric/${metricId}/completeness/stats${districtQuery}`
  );
}

// Daily completeness data
export type DailyCompletenessDataPoint = {
  date: string;
  is_stable: boolean;
  count_changed: boolean;
  count_at_last_check?: number | null;
  count_at_first_seen?: number | null;
  count_current?: number | null;
};

export type DailyCompletenessResponse = {
  metric_id: number;
  period_type: string;
  data: DailyCompletenessDataPoint[];
};

export function getPublicMetricCompletenessDaily(
  metricId: number,
  periodType: string = "day",
  days: number = 90,
  district?: number | null
): Promise<DailyCompletenessResponse> {
  const districtQuery =
    district !== undefined && district !== null && district > 0
      ? `&district=${district}`
      : "";
  return requestPublic<DailyCompletenessResponse>(
    `/api/time-series/public/metric/${metricId}/completeness/daily?period_type=${periodType}&days=${days}${districtQuery}`
  );
}

// District comparisons for choropleth map
export type PublicDistrictComparison = {
  district: number | string;
  current_value: number | null;
  comparison_value: number | null;
  change_percent: number | null;
  change_absolute: number | null;
};

export type PublicDistrictComparisonsResponse = {
  metric_id: number;
  metric_name: string;
  comparison_type: string;
  districts: PublicDistrictComparison[];
  min_value: number | null;
  max_value: number | null;
};

export function getPublicMetricDistrictComparisons(
  metricId: number,
  comparisonType: string = "ytd",
  /** ISO date string (YYYY-MM-DD or full ISO) from the already-loaded citywide
   *  comparison. When provided the backend anchors district rows to the same
   *  period window so totals are directly comparable to the headline numbers. */
  currentPeriodEnd?: string | null
): Promise<PublicDistrictComparisonsResponse> {
  const params = new URLSearchParams({ comparison_type: comparisonType });
  if (currentPeriodEnd) {
    // Send just the date part so the backend comparison is unambiguous
    params.set("current_period_end", currentPeriodEnd.slice(0, 10));
  }
  return requestPublic<PublicDistrictComparisonsResponse>(
    `/api/public/metrics/${metricId}/district-comparisons?${params.toString()}`
  );
}

// Shapefile geometry for choropleth map
export type PublicShapefileResponse = {
  city_id: number;
  structure_type: string;
  feature_count: number;
  geometry: GeoJSON.FeatureCollection;
  /** Property name in each feature for district/ward ID (e.g. "ward", "supervisor_district") */
  identifier_field?: string | null;
  /** City's district field names; match feature properties using the first one present (empty if city not configured) */
  district_field_names?: string[];
};

export function getPublicMetricShapefile(
  metricId: number
): Promise<PublicShapefileResponse> {
  return requestPublic<PublicShapefileResponse>(
    `/api/public/metrics/${metricId}/shapefile`
  );
}

// Map data for metric detail page (legacy - saved maps)
export type PublicMapResponse = {
  map_hash: string;
  map_url: string;
  map_type: string;
  location_data_count: number;
  period_type: string;
};

export function getPublicMetricMap(
  metricId: number,
  periodType: string = "ytd",
  district?: number | null
): Promise<PublicMapResponse> {
  const params = new URLSearchParams();
  params.set("period_type", periodType);
  if (district !== undefined && district !== null && district > 0) {
    params.set("district", String(district));
  }
  const path = `/api/public/metrics/${metricId}/map?${params.toString()}`;
  const cacheKey = `metric-map:${metricId}:${periodType}:${district || 0}`;
  
  return getCachedOrFetch(cacheKey, () => requestPublic<PublicMapResponse>(path), 60000); // 1 minute cache
}

// =============================================================================
// Dynamic Map Preview (for embedded metric maps - no database save)
// =============================================================================

export type MapPreviewRequest = {
  start_date: string;
  end_date: string;
  district?: number | null;
  period_type?: string;
  // Optional comparison period for dual-layer display
  comparison_start_date?: string | null;
  comparison_end_date?: string | null;
  // Optional group filtering (for anomalies specific to a group value)
  group_field?: string | null;
  group_value?: string | null;
};

export type MapPreviewResponse = {
  map_type: string;
  location_data: Array<{
    count?: number
    value?: number
    lat: number
    lon: number
    lng?: number
    latitude?: number
    longitude?: number
    [key: string]: unknown
  }>;
  map_config: Record<string, unknown>;
  bounds?: [[number, number], [number, number]] | null;
  center?: { lat: number; lng: number; zoom: number } | null;
  city_id?: number | null;
  metric_id: number;
  title: string;
  description?: string | null;
  location_data_count: number;
  /** True when the backend hit its fetch limit — actual total is higher than location_data_count. */
  limit_hit?: boolean;
  // Comparison period data (optional - for dual-layer display)
  comparison_location_data?: Array<{
    count?: number
    value?: number
    lat: number
    lon: number
    lng?: number
    latitude?: number
    longitude?: number
    [key: string]: unknown
  }> | null;
  comparison_location_data_count?: number | null;
};

const MAP_PREVIEW_CLIENT_TTL_MS = 15 * 60 * 1000;

type MapPreviewCacheEntry = {
  data: MapPreviewResponse | null;
  promise: Promise<MapPreviewResponse> | null;
  timestamp: number;
};

/** Session-scoped map-preview cache (metric detail reopen / period toggles). */
const mapPreviewClientCache = new Map<string, MapPreviewCacheEntry>();

function mapPreviewCacheKey(metricId: number, request: MapPreviewRequest): string {
  return [
    metricId,
    request.start_date,
    request.end_date,
    request.district ?? 0,
    request.period_type ?? "ytd",
    request.comparison_start_date ?? "",
    request.comparison_end_date ?? "",
    request.group_field ?? "",
    request.group_value ?? "",
  ].join("|");
}

/**
 * Generate map data dynamically for embedding (no database save).
 * This is the preferred method for embedded maps in metric detail pages.
 */
export async function getMetricMapPreview(
  metricId: number,
  request: MapPreviewRequest
): Promise<MapPreviewResponse> {
  const key = mapPreviewCacheKey(metricId, request);
  const now = Date.now();
  const cached = mapPreviewClientCache.get(key);
  if (cached?.data && now - cached.timestamp < MAP_PREVIEW_CLIENT_TTL_MS) {
    return cached.data;
  }
  if (cached?.promise && now - cached.timestamp < MAP_PREVIEW_CLIENT_TTL_MS) {
    return cached.promise;
  }

  const url = `${resolvePublicApiBaseUrl()}/api/public/metrics/${metricId}/map-preview`;

  const promise = (async (): Promise<MapPreviewResponse> => {
    const res = await fetch(url, {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(request),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      let errorMessage = `Map preview failed: ${res.status}`;
      if (text) {
        try {
          const errorJson = JSON.parse(text);
          errorMessage = errorJson.detail || errorJson.message || errorMessage;
        } catch {
          errorMessage = `${errorMessage} - ${text.substring(0, 200)}`;
        }
      }
      const err = new Error(errorMessage) as Error & { status?: number };
      err.status = res.status;
      throw err;
    }

    return res.json();
  })();

  mapPreviewClientCache.set(key, { data: null, promise, timestamp: now });

  try {
    const data = await promise;
    mapPreviewClientCache.set(key, { data, promise: null, timestamp: Date.now() });
    return data;
  } catch (err) {
    mapPreviewClientCache.delete(key);
    throw err;
  }
}

export type MapSaveResponse = {
  map_hash: string;
  map_url: string;
  map_id: number;
};

/**
 * Save a map to the database (called when user clicks "View full map").
 * Returns the hash/URL for navigation to the full map page.
 */
export async function saveMetricMap(
  metricId: number,
  request: MapPreviewRequest
): Promise<MapSaveResponse> {
  const url = `${resolvePublicApiBaseUrl()}/api/public/metrics/${metricId}/map-save`;
  
  const res = await fetch(url, {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(request),
  });
  
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    let errorMessage = `Map save failed: ${res.status}`;
    if (text) {
      try {
        const errorJson = JSON.parse(text);
        errorMessage = errorJson.detail || errorJson.message || errorMessage;
      } catch {
        errorMessage = `${errorMessage} - ${text.substring(0, 200)}`;
      }
    }
    throw new Error(errorMessage);
  }
  
  return res.json();
}

// ============================================================================
// Delta Map Save (district choropleth showing % change)
// ============================================================================

export type DeltaMapSaveRequest = {
  start_date: string;
  end_date: string;
  comparison_start_date: string;
  comparison_end_date: string;
  period_type?: string;
};

/**
 * Save a delta (change) map to the database.
 * Called when the user clicks "View full map" on the embedded delta map.
 * Returns a permanent URL; the map is NOT saved on every page load.
 */
export async function saveDeltaMap(
  metricId: number,
  request: DeltaMapSaveRequest
): Promise<MapSaveResponse> {
  const url = `${resolvePublicApiBaseUrl()}/api/public/metrics/${metricId}/delta-map-save`;

  const res = await fetch(url, {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(request),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    let errorMessage = `Delta map save failed: ${res.status}`;
    if (text) {
      try {
        const errorJson = JSON.parse(text);
        errorMessage = errorJson.detail || errorJson.message || errorMessage;
      } catch {
        errorMessage = `${errorMessage} - ${text.substring(0, 200)}`;
      }
    }
    throw new Error(errorMessage);
  }

  return res.json();
}

// ============================================================================
// ANOMALIES (PUBLIC - NO AUTH REQUIRED)
// ============================================================================

export interface PublicAnomalyResult {
  id: number;
  run_id: number;
  metric_id: number;
  city_id: number;
  district: number;
  period_type: string;
  period_date: string;
  period_label: string | null;
  pct_change: number;
  z_score: number | null;
  recent_mean: number;
  comparison_mean: number;
  is_anomaly: boolean;
  severity: string;
  data_source: string | null;
  group_field: string | null;
  group_value: string | null;
  title: string | null;
  description: string | null;
  chart_payload: Record<string, unknown> | null;
  created_at: string;
  // Additional fields returned by API and used by anomaly mapper
  object_id?: string | null;
  object_name?: string | null;
  metric_name?: string | null;
  item_noun?: string | null;
  greendirection?: string | null;
  city_name?: string | null;
  // Window configuration - tells us how many periods the comparison covers
  comparison_window?: { label?: string; size?: number; match_weekday?: boolean } | null;
  recent_window?: { label?: string; size?: number; match_weekday?: boolean } | null;
}

export interface ListAnomaliesPublicResponse {
  results: PublicAnomalyResult[];
  count: number;
}

/**
 * List anomalies without authentication.
 * Uses the /api/anomalies endpoint.
 */
export async function listAnomaliesPublic(options?: {
  metric_id?: number;
  is_anomaly?: boolean | null;
  period_type?: string;
  limit?: number;
  city_id?: number;
  district?: number | null;
  period_date?: string | null;
}): Promise<ListAnomaliesPublicResponse> {
  const params = new URLSearchParams();
  if (options?.city_id) params.append("city_id", options.city_id.toString());
  if (options?.metric_id) params.append("metric_id", options.metric_id.toString());
  if (options?.is_anomaly === true || options?.is_anomaly === false) {
    params.append("is_anomaly", options.is_anomaly.toString());
  }
  if (options?.period_type) params.append("period_type", options.period_type);
  if (options?.limit) params.append("limit", options.limit.toString());
  if (options?.district !== undefined && options?.district !== null) {
    params.append("district", options.district.toString());
  }
  if (options?.period_date) params.append("period_date", options.period_date);

  const query = params.toString();
  const path = `/api/anomalies${query ? `?${query}` : ""}`;
  
  return requestPublic<ListAnomaliesPublicResponse>(path);
}

// ============================================================================
// CAUSAL METRIC CHAINS (PUBLIC - NO AUTH REQUIRED)
// ============================================================================

export interface ChainStageValue {
  metric_id: number;
  metric_name: string;
  metric_key: string;
  display_order: number;
  measurement_type: string;
  current_value: number | null;
  prior_value: number | null;
  absolute_change: number | null;
  percent_change: number | null;
  conversion_rate_current: number | null;
  conversion_rate_prior: number | null;
  conversion_rate_change: number | null;
  divergence_flag: boolean;
  divergence_note: string | null;
  most_recent_data_date: string | null;
}

export interface ChainResponse {
  chain_key: string;
  chain_name: string;
  comparison_type: string;
  district: number | null;
  stages: ChainStageValue[];
  has_divergence: boolean;
}

export interface AttributionTerm {
  term: string;
  label: string;
  value: number;
  percent_of_change: number | null;
}

export interface CategoryAttribution {
  category_value: string;
  upstream_current: number | null;
  upstream_prior: number | null;
  rate_current: number | null;
  rate_prior: number | null;
  volume_contribution: number;
  rate_contribution: number;
  interaction: number;
}

export interface ChainDecomposition {
  source_metric_id: number;
  target_metric_id: number;
  relationship_type: string;
  category_field: string | null;
  terms: AttributionTerm[];
  category_breakdown: CategoryAttribution[];
  attribution_suppressed: boolean;
  suppression_reason: string | null;
}

export interface ChainDecompositionResponse {
  chain_key: string;
  chain_name: string;
  comparison_type: string;
  district: number | null;
  focus_metric_id: number;
  edges: ChainDecomposition[];
}

export async function getMetricChain(
  metricId: number,
  options?: {
    comparisonType?: string;
    district?: number | null;
  }
): Promise<ChainResponse | null> {
  const params = new URLSearchParams();
  if (options?.comparisonType) params.append("comparison_type", options.comparisonType);
  if (options?.district !== undefined && options?.district !== null) {
    params.append("district", options.district.toString());
  }
  const query = params.toString();
  const path = `/api/public/metrics/${metricId}/chain${query ? `?${query}` : ""}`;
  try {
    return await requestPublic<ChainResponse>(path);
  } catch {
    return null;
  }
}

export async function getMetricChainDecomposition(
  metricId: number,
  options?: {
    comparisonType?: string;
    district?: number | null;
  }
): Promise<ChainDecompositionResponse | null> {
  const params = new URLSearchParams();
  if (options?.comparisonType) params.append("comparison_type", options.comparisonType);
  if (options?.district !== undefined && options?.district !== null) {
    params.append("district", options.district.toString());
  }
  const query = params.toString();
  const path = `/api/public/metrics/${metricId}/chain/decomposition${query ? `?${query}` : ""}`;
  try {
    return await requestPublic<ChainDecompositionResponse>(path);
  } catch {
    return null;
  }
}


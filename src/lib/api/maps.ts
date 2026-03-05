import { request, API_BASE } from "./request";

// SAVED MAPS API
// ============================================================================

export interface SavedMap {
  id: number;
  short_hash: string;
  title: string;
  description: string | null;
  map_type: string;
  location_data: Array<{ lat: number; lon: number; [key: string]: any }>;
  map_config: Record<string, any>;
  bounds: [[number, number], [number, number]] | null;
  center: { lat: number; lng: number; zoom: number } | null;
  city_id: number | null;
  metric_id: number | null;
  query_source: string | null;
  is_public: boolean;
  view_count: number;
  user_id: string | null;
  created_at: string;
  updated_at: string;
  public_url?: string | null;
}

export interface MapListItem {
  id: number;
  short_hash: string;
  title: string;
  description: string | null;
  map_type: string;
  city_id: number | null;
  city_name: string | null;
  metric_id: number | null;
  is_public: boolean;
  view_count: number;
  user_id: string | null;
  created_at: string;
  point_count: number;
  public_url?: string | null;
}

export interface MapListResponse {
  maps: MapListItem[];
  total: number;
  limit: number;
  offset: number;
}

export interface CreateMapRequest {
  title: string;
  description?: string;
  map_type: string;
  location_data: Array<{ lat: number; lon: number; [key: string]: any }>;
  map_config?: Record<string, any>;
  bounds?: [[number, number], [number, number]];
  center?: { lat: number; lng: number; zoom: number };
  city_id?: number;
  metric_id?: number;
  query_source?: string;
  is_public?: boolean;
}

export interface UpdateMapRequest {
  title?: string;
  description?: string;
  is_public?: boolean;
  map_config?: Record<string, any>;
}

export interface MapStatsResponse {
  total_maps: number;
  public_maps: number;
  private_maps: number;
  total_views: number;
  maps_by_type: Record<string, number>;
  maps_by_city: Record<string, number>;
  top_viewed: MapListItem[];
}

// Create a new saved map
export function createMap(mapData: CreateMapRequest, token: string): Promise<SavedMap> {
  return request<SavedMap>("/api/maps", "POST", mapData, token);
}

// List user's maps
export function listMyMaps(
  token: string,
  options?: {
    city_id?: number;
    is_public?: boolean;
    map_type?: string;
    limit?: number;
    offset?: number;
  }
): Promise<MapListResponse> {
  const params = new URLSearchParams();
  if (options?.city_id) params.append("city_id", options.city_id.toString());
  if (options?.is_public !== undefined) params.append("is_public", String(options.is_public));
  if (options?.map_type) params.append("map_type", options.map_type);
  if (options?.limit) params.append("limit", options.limit.toString());
  if (options?.offset) params.append("offset", options.offset.toString());
  
  const query = params.toString();
  const path = `/api/maps${query ? `?${query}` : ""}`;
  return request<MapListResponse>(path, "GET", undefined, token);
}

// Get a specific map by ID
export function getMapById(mapId: number, token: string): Promise<SavedMap> {
  return request<SavedMap>(`/api/maps/${mapId}`, "GET", undefined, token);
}

// Cache for public maps by hash
const publicMapCache: {
  [hash: string]: {
    data: SavedMap | null;
    promise: Promise<SavedMap> | null;
    timestamp: number;
  };
} = {};

const PUBLIC_MAP_CACHE_TTL = 60000; // 1 minute cache

// Get a public map by hash (no auth required) - with caching
export function getPublicMap(hash: string): Promise<SavedMap> {
  const now = Date.now();
  const cached = publicMapCache[hash];
  
  // Return cached data if valid
  if (cached?.data && (now - cached.timestamp) < PUBLIC_MAP_CACHE_TTL) {
    return Promise.resolve(cached.data);
  }
  
  // Return in-flight promise if one exists
  if (cached?.promise && (now - cached.timestamp) < PUBLIC_MAP_CACHE_TTL) {
    return cached.promise;
  }
  
  // Create new request and cache the promise
  const promise = request<SavedMap>(`/api/maps/public/${hash}`, "GET", undefined)
    .then((data) => {
      publicMapCache[hash] = { data, promise: null, timestamp: Date.now() };
      return data;
    })
    .catch((err) => {
      // Clear cache on error
      delete publicMapCache[hash];
      throw err;
    });
  
  publicMapCache[hash] = { data: null, promise, timestamp: now };
  return promise;
}

/** Lazy-load choropleth view data for an alternative shape layer (no auth required). */
export function getMapView(
  hash: string,
  shapeLayerId: number
): Promise<{ aggregation: { identifier_field: string; display_name: string; rows: Array<Record<string, unknown>> }; shape_layer_instance_id: number }> {
  return request(`/api/maps/public/${hash}/view/${shapeLayerId}`, "GET", undefined);
}

// Update a map
export function updateMap(mapId: number, data: UpdateMapRequest, token: string): Promise<SavedMap> {
  return request<SavedMap>(`/api/maps/${mapId}`, "PUT", data, token);
}

// Delete a map
export function deleteMap(mapId: number, token: string): Promise<void> {
  return fetch(`${API_BASE}/api/maps/${mapId}`, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    },
  }).then((res) => {
    if (!res.ok && res.status !== 204) {
      throw new Error(`Failed to delete map (${res.status})`);
    }
    return;
  });
}

// Publish or unpublish a map
export function publishMap(
  mapId: number,
  isPublic: boolean,
  token: string
): Promise<SavedMap> {
  return request<SavedMap>(
    `/api/maps/${mapId}/publish`,
    "POST",
    { is_public: isPublic },
    token
  );
}

// Admin: List all maps
export function adminListMaps(
  token: string,
  options?: {
    user_id?: string;
    city_id?: number;
    is_public?: boolean;
    map_type?: string;
    metric_id?: number;
    limit?: number;
    offset?: number;
  }
): Promise<MapListResponse> {
  const params = new URLSearchParams();
  if (options?.user_id) params.append("user_id", options.user_id);
  if (options?.city_id) params.append("city_id", options.city_id.toString());
  if (options?.is_public !== undefined) params.append("is_public", String(options.is_public));
  if (options?.map_type) params.append("map_type", options.map_type);
  if (options?.metric_id) params.append("metric_id", options.metric_id.toString());
  if (options?.limit) params.append("limit", options.limit.toString());
  if (options?.offset) params.append("offset", options.offset.toString());
  
  const query = params.toString();
  const path = `/api/admin/maps${query ? `?${query}` : ""}`;
  return request<MapListResponse>(path, "GET", undefined, token);
}

// Admin: Get maps for a specific metric
export function getAdminMetricMaps(
  metricId: number,
  token: string,
  options?: {
    limit?: number;
    offset?: number;
  }
): Promise<MapListResponse> {
  return adminListMaps(token, {
    metric_id: metricId,
    limit: options?.limit ?? 100,
    offset: options?.offset ?? 0,
  });
}

// Admin: Get map stats
export function adminGetMapStats(token: string, cityId?: number): Promise<MapStatsResponse> {
  const params = new URLSearchParams();
  if (cityId) params.append("city_id", cityId.toString());
  
  const query = params.toString();
  const path = `/api/admin/maps/stats${query ? `?${query}` : ""}`;
  return request<MapStatsResponse>(path, "GET", undefined, token);
}

// Admin: Bulk delete maps
export function adminBulkDeleteMaps(
  mapIds: number[],
  token: string
): Promise<{ success: boolean; affected_count: number; message: string }> {
  return request<{ success: boolean; affected_count: number; message: string }>(
    "/api/admin/maps/bulk",
    "DELETE",
    { map_ids: mapIds },
    token
  );
}

// Admin: Bulk publish/unpublish maps
export function adminBulkPublishMaps(
  mapIds: number[],
  isPublic: boolean,
  token: string
): Promise<{ success: boolean; affected_count: number; message: string }> {
  return request<{ success: boolean; affected_count: number; message: string }>(
    "/api/admin/maps/bulk/publish",
    "PUT",
    { map_ids: mapIds, is_public: isPublic },
    token
  );
}

// ============================================================================

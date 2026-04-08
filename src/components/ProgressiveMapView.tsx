"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import type { SavedMap } from "@/lib/apiClient";
import { getMapView } from "@/lib/apiClient";
import { API_BASE } from "@/lib/apiBase";
import Loader from "./Loader";
import MapLayerPanel from "./MapLayerPanel";
import "./ProgressiveMapView.css";

interface ProgressiveMapViewProps {
  mapData: SavedMap;
  mapHash: string;
  height?: number;
  onError?: (error: string) => void;
  /** Optional comparison period points - rendered as grey dots behind current period */
  comparisonLocationData?: Array<Record<string, any>>;
}

interface ShapeLayer {
  shape_layer_instance_id: number;
  identifier_field: string;
  shape_identifier_field?: string;
  display_name: string;
  layer_key?: string;
  category?: string;
  is_city_district?: boolean;
}

interface DefaultView {
  type: "points" | "choropleth";
  shape_layer_instance_id?: number | null;
  identifier_field?: string | null;
  display_name?: string | null;
}

interface AvailableView {
  type: "points" | "choropleth";
  point_count?: number;
  shape_layer_instance_id?: number;
  identifier_field?: string;
  display_name?: string;
  row_count?: number;
  is_default?: boolean;
  is_city_district?: boolean;
}

// Stable empty arrays to avoid new reference every render (prevents useEffect loops)
const EMPTY_AVAILABLE_VIEWS: AvailableView[] = [];
const EMPTY_SHAPE_LAYERS: ShapeLayer[] = [];

interface Aggregation {
  identifier_field: string;
  display_name: string;
  rows: Array<{ district: string; value: number; [key: string]: any }>;
}

// Maximum number of points to render on the map
// Beyond this limit, point rendering is disabled for performance reasons
const MAX_POINTS_LIMIT = 5000;

// ============================================================================
// REQUEST CACHING - Prevent duplicate network requests
// ============================================================================

interface CacheEntry<T> {
  data: T | null;
  promise: Promise<T> | null;
  timestamp: number;
}

const CACHE_TTL_MS = 60000; // 1 minute cache

// Cache for city structure data
const cityStructureCache: Record<number, CacheEntry<any>> = {};

// Cache for shape layers data  
const shapeLayersCache: Record<number, CacheEntry<any[]>> = {};

// Cache for shape layer geometry
const shapeGeometryCache: Record<number, CacheEntry<any>> = {};

async function fetchWithCache<T>(
  cacheKey: number,
  cache: Record<number, CacheEntry<T>>,
  fetchFn: () => Promise<T>
): Promise<T> {
  const now = Date.now();
  const cached = cache[cacheKey];
  
  // Return cached data if valid
  if (cached?.data && (now - cached.timestamp) < CACHE_TTL_MS) {
    return cached.data;
  }
  
  // Return in-flight promise if one exists
  if (cached?.promise && (now - cached.timestamp) < CACHE_TTL_MS) {
    return cached.promise;
  }
  
  // Create new request and cache the promise
  const promise = fetchFn().then((data) => {
    cache[cacheKey] = { data, promise: null, timestamp: Date.now() };
    return data;
  }).catch((err) => {
    // Clear cache on error
    delete cache[cacheKey];
    throw err;
  });
  
  cache[cacheKey] = { data: null, promise, timestamp: now };
  return promise;
}

async function getCachedCityStructure(cityId: number): Promise<any> {
  return fetchWithCache(cityId, cityStructureCache, async () => {
    const response = await fetch(`/api/cities/${cityId}/structure`);
    if (!response.ok) {
      throw new Error(`Failed to fetch city structure: ${response.status}`);
    }
    return response.json();
  });
}

async function getCachedShapeLayers(cityId: number): Promise<any[]> {
  return fetchWithCache(cityId, shapeLayersCache, async () => {
    const response = await fetch(`/api/shape-layers/cities/${cityId}`);
    if (!response.ok) {
      throw new Error(`Failed to fetch shape layers: ${response.status}`);
    }
    const data = await response.json();
    return Array.isArray(data) ? data : (data.layers || data.shape_layers || data.data || []);
  });
}

async function getCachedShapeGeometry(instanceId: number): Promise<any> {
  return fetchWithCache(instanceId, shapeGeometryCache, async () => {
    const response = await fetch(
      `${API_BASE}/api/shape-layers/public/instances/${instanceId}?include_geometry=true`
    );
    if (!response.ok) {
      throw new Error(`Failed to fetch shape geometry: ${response.status}`);
    }
    return response.json();
  });
}

/**
 * Normalize point data to ensure lat/lon fields exist.
 * Handles various coordinate formats:
 * - Direct lat/lon fields
 * - GeoJSON Point format (intersection_point, point, location, geometry)
 * - Separate latitude/longitude fields
 */
function normalizePointData(points: Array<Record<string, any>>): Array<{ lat: number; lon: number; [key: string]: any }> {
  return points
    .map((p: any) => {
      // Already has lat/lon
      if (typeof p.lat === 'number' && typeof p.lon === 'number') {
        return p;
      }
      
      // Try to extract from GeoJSON Point format
      const geoJsonFields = ['intersection_point', 'point', 'location', 'geometry', 'geom'];
      for (const field of geoJsonFields) {
        const geoPoint = p[field];
        if (geoPoint && geoPoint.type === 'Point' && Array.isArray(geoPoint.coordinates)) {
          const [lng, lat] = geoPoint.coordinates;
          if (typeof lat === 'number' && typeof lng === 'number' && !isNaN(lat) && !isNaN(lng)) {
            return { ...p, lat, lon: lng };
          }
        }
      }
      
      // Try latitude/longitude fields
      if (typeof p.latitude === 'number' && typeof p.longitude === 'number') {
        return { ...p, lat: p.latitude, lon: p.longitude };
      }
      
      // Try lng instead of lon
      if (typeof p.lat === 'number' && typeof p.lng === 'number') {
        return { ...p, lon: p.lng };
      }
      
      // Could not extract coordinates
      return null;
    })
    .filter((p): p is { lat: number; lon: number; [key: string]: any } => 
      p !== null && 
      typeof p.lat === 'number' && 
      typeof p.lon === 'number' &&
      !isNaN(p.lat) && 
      !isNaN(p.lon) &&
      isFinite(p.lat) &&
      isFinite(p.lon)
    );
}

export default function ProgressiveMapView({
  mapData,
  mapHash,
  height = 400,
  onError,
  comparisonLocationData,
}: ProgressiveMapViewProps) {
  const [selectedShapeLayer, setSelectedShapeLayer] = useState<string | null>(null);
  const [points, setPoints] = useState<Array<{ lat: number; lon: number; [key: string]: any }> | null>(null);
  const [loadingPoints, setLoadingPoints] = useState(false);
  const [selectedDistrictId, setSelectedDistrictId] = useState<string | null>(null);
  const [showPoints, setShowPoints] = useState(false); // Default to false for embedded maps - choropleth is the primary view
  const [mapboxLoaded, setMapboxLoaded] = useState(false);
  const [availableShapeLayers, setAvailableShapeLayers] = useState<ShapeLayer[]>([]);
  const [lazyLoadedAggregations, setLazyLoadedAggregations] = useState<Record<string, Aggregation>>({});
  const [loadingLazyView, setLoadingLazyView] = useState(false);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);

  // Backend-provided default view and available views (single load, no discovery)
  const defaultView = mapData.map_config?.default_view as DefaultView | undefined;
  const availableViews = (mapData.map_config?.available_views ?? EMPTY_AVAILABLE_VIEWS) as AvailableView[];
  const metricDistrictField = (mapData.map_config?.district_field || mapData.map_config?.metricDistrictField) as string | undefined;
  const locationDataCount = mapData.location_data?.length || 0;
  const aggregations = mapData.map_config?.aggregations || {};

  // Build availableShapeLayers from available_views (choropleth entries) or fall back to available_shape_layers
  const shapeLayersFromConfig = mapData.map_config?.available_shape_layers as ShapeLayer[] | undefined;
  const initialShapeLayers = useMemo<ShapeLayer[]>(() => {
    if (availableViews.length > 0) {
      return availableViews
        .filter((v): v is AvailableView & { shape_layer_instance_id: number; identifier_field: string; display_name: string } =>
          v.type === "choropleth" && v.shape_layer_instance_id != null && v.identifier_field != null)
        .map((v) => ({
          shape_layer_instance_id: v.shape_layer_instance_id!,
          identifier_field: v.identifier_field!,
          display_name: v.display_name ?? String(v.shape_layer_instance_id),
          is_city_district: v.is_city_district,
        }));
    }
    return shapeLayersFromConfig?.length ? shapeLayersFromConfig : EMPTY_SHAPE_LAYERS;
  }, [availableViews, shapeLayersFromConfig]);

  // Initial view from default_view (backend decides); with few points always show points so dots are visible.
  // Use 1000 so that "Last month" and similar bounded ranges (often a few hundred points) show points by default.
  const initialViewRef = useRef(false);
  useEffect(() => {
    if (initialViewRef.current) return;
    initialViewRef.current = true;
    const fewPoints = locationDataCount <= 1000;
    if (defaultView) {
      if (defaultView.type === "points" || fewPoints) {
        setShowPoints(true);
        setSelectedShapeLayer(null);
      } else if (defaultView.type === "choropleth" && defaultView.shape_layer_instance_id != null) {
        setShowPoints(false);
        setSelectedShapeLayer(String(defaultView.shape_layer_instance_id));
      }
    } else if (shapeLayersFromConfig?.length && locationDataCount > 1000) {
      const first = shapeLayersFromConfig[0];
      setShowPoints(false);
      setSelectedShapeLayer(String(first.shape_layer_instance_id));
    } else if (locationDataCount > 0 && locationDataCount <= MAX_POINTS_LIMIT) {
      setShowPoints(true);
      setSelectedShapeLayer(null);
    }
  }, [defaultView, shapeLayersFromConfig, locationDataCount]);

  // Sync from prop-derived list only when content actually changes (avoid loop from new array refs)
  useEffect(() => {
    setAvailableShapeLayers((prev) => {
      if (prev.length !== initialShapeLayers.length) return initialShapeLayers;
      const same = initialShapeLayers.every(
        (s, i) => prev[i]?.shape_layer_instance_id === s.shape_layer_instance_id
      );
      return same ? prev : initialShapeLayers;
    });
  }, [initialShapeLayers]);

  console.log(`[ProgressiveMapView] Map config:`, {
    mapType: mapData.map_type,
    hasAggregations: Object.keys(aggregations).length > 0,
    aggregationKeys: Object.keys(aggregations),
    availableShapeLayersCount: availableShapeLayers.length,
    availableShapeLayers: availableShapeLayers,
    mapConfig: mapData.map_config
  });

  // Merged aggregations (map_config + lazy-loaded when user selects alternative view)
  const effectiveAggregations = useMemo(
    () => ({ ...aggregations, ...lazyLoadedAggregations }),
    [aggregations, lazyLoadedAggregations]
  );
  const hasAggregations = Object.keys(effectiveAggregations).length > 0;
  const isPointMap = mapData.map_type === "point" && !hasAggregations;

  // Lazy-load choropleth view when user selects a shape layer that has no aggregation yet
  useEffect(() => {
    if (!selectedShapeLayer || !mapHash) return;
    const id = selectedShapeLayer;
    if (aggregations[id] || lazyLoadedAggregations[id]) return;
    setLoadingLazyView(true);
    getMapView(mapHash, Number(id))
      .then((data) => {
        setLazyLoadedAggregations((prev) => ({
          ...prev,
          [id]: data.aggregation as Aggregation,
        }));
      })
      .catch((err) => {
        console.error("[ProgressiveMapView] Failed to load view:", err);
        onError?.(err instanceof Error ? err.message : "Failed to load view");
      })
      .finally(() => setLoadingLazyView(false));
  }, [selectedShapeLayer, mapHash, aggregations, lazyLoadedAggregations, onError]);

  // Automatically load points from location_data for point maps.
  // Sync whenever location_data changes (e.g. user switches to "Last month") so points update.
  useEffect(() => {
    if (!isPointMap || !mapData.location_data || !Array.isArray(mapData.location_data) || mapData.location_data.length === 0) {
      if (isPointMap && (!mapData.location_data || mapData.location_data.length === 0)) {
        setPoints(null);
      }
      return;
    }
    const validLocationData = normalizePointData(mapData.location_data);
    if (validLocationData.length > 0) {
      setPoints(validLocationData);
      setShowPoints(true);
    } else {
      setPoints(null);
    }
  }, [isPointMap, mapData.location_data]);

  // Automatically fetch and show points if location_data has items (for choropleth maps with data)
  useEffect(() => {
    // Only auto-fetch for choropleth maps (hasAggregations) that have location_data
    // Point maps already use location_data directly, so skip those
    // Wait for map to be loaded before auto-showing points
    if (!mapboxLoaded || !mapInstanceRef.current || isPointMap) {
      return;
    }

    if (hasAggregations && mapData.location_data && Array.isArray(mapData.location_data) && mapData.location_data.length > 0) {
      // Normalize point data to extract lat/lon from various formats (including GeoJSON)
      const validLocationData = normalizePointData(mapData.location_data);

      if (validLocationData.length > 0 && points === null) {
        // Use location_data directly if it has valid points
        console.log(`[ProgressiveMapView] Using ${validLocationData.length} points from location_data for choropleth map (normalized from ${mapData.location_data.length})`);
        setPoints(validLocationData);
        // Don't auto-show points for choropleth maps - let user toggle them
      } else if (points === null && !loadingPoints && validLocationData.length === 0) {
        // location_data doesn't have valid points, fetch from API
        console.log(`[ProgressiveMapView] location_data has ${mapData.location_data.length} items but no valid points, fetching from API`);
        fetchPoints().catch((err) => {
          console.error("Auto-fetch points failed:", err);
        });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasAggregations, isPointMap, mapData.location_data, mapboxLoaded]);

  // Load Mapbox
  useEffect(() => {
    if (typeof window === "undefined") return;
    
    if ((window as any).mapboxgl) {
      Promise.resolve().then(() => setMapboxLoaded(true));
      return;
    }
    
    const cssLink = document.createElement("link");
    cssLink.rel = "stylesheet";
    cssLink.href = "https://api.mapbox.com/mapbox-gl-js/v3.0.0/mapbox-gl.css";
    document.head.appendChild(cssLink);
    
    const script = document.createElement("script");
    script.src = "https://api.mapbox.com/mapbox-gl-js/v3.0.0/mapbox-gl.js";
    script.async = true;
    script.onload = () => setMapboxLoaded(true);
    document.head.appendChild(script);
  }, []);

  // Fetch points on demand
  const fetchPoints = async () => {
    if (points !== null) {
      // Already loaded
      return;
    }

    setLoadingPoints(true);
    try {
      const response = await fetch(`${API_BASE}/api/maps/public/${mapHash}/points`);
      if (!response.ok) {
        throw new Error(`Failed to fetch points: ${response.status}`);
      }
      const data = await response.json();
      setPoints(data.points || []);
    } catch (err) {
      console.error("Error fetching points:", err);
      setPoints([]); // Recover so fetchPoints can be retried
      onError?.(err instanceof Error ? err.message : "Failed to fetch points");
    } finally {
      setLoadingPoints(false);
    }
  };

  // Render map - only initialize once
  useEffect(() => {
    if (!mapboxLoaded || !mapContainerRef.current) return;
    
    // Don't re-initialize if map already exists
    if (mapInstanceRef.current) {
      return;
    }

    const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || "";
    if (!MAPBOX_TOKEN) {
      onError?.("Mapbox token not configured");
      return;
    }

    const mapboxgl = (window as any).mapboxgl;
    if (!mapboxgl) {
      onError?.("Mapbox GL not loaded");
      return;
    }

    const container = mapContainerRef.current;
    if (!container || container.offsetWidth === 0 || container.offsetHeight === 0) {
      return;
    }

    try {
      mapboxgl.accessToken = MAPBOX_TOKEN;

      // Default center: use map center, or midpoint of bounds, or neutral US center (not city-specific)
      const bounds = mapData.bounds;
      let initialCenter: [number, number];
      if (mapData.center) {
        initialCenter = [mapData.center.lng, mapData.center.lat];
      } else if (bounds && bounds.length === 2) {
        const [[swLng, swLat], [neLng, neLat]] = bounds;
        initialCenter = [(swLng + neLng) / 2, (swLat + neLat) / 2];
      } else {
        initialCenter = [-98.5795, 39.8283]; // Continental US center (neutral fallback when backend sends no center/bounds)
      }

      const baseZoom = mapData.center?.zoom || 11;
      const embeddedZoom = Math.max(baseZoom - 1, 10);

      const map = new mapboxgl.Map({
        container: container,
        style: "mapbox://styles/mapbox/light-v11",
        center: initialCenter,
        zoom: embeddedZoom,
        attributionControl: false,
        scrollZoom: false, // Disable scroll zoom for embedded maps
      });

      mapInstanceRef.current = map;

      map.addControl(
        new mapboxgl.NavigationControl({ showCompass: false }),
        "bottom-right"
      );

      map.on("load", async () => {
        setTimeout(async () => {
          try {
            if (bounds && bounds.length === 2) {
              try {
                map.fitBounds(bounds as [[number, number], [number, number]], {
                  padding: 50,
                  maxZoom: 14,
                  duration: 0,
                });
              } catch (fitErr) {
                console.warn("fitBounds failed, using initial center:", fitErr);
              }
            }
            if (isPointMap) {
              loadPointMap(map);
            }
          } catch (err) {
            console.error("Error loading map layers:", err);
            onError?.(`Failed to load map layers: ${err instanceof Error ? err.message : String(err)}`);
          }
        }, 100);
      });

      map.on("error", (e: any) => {
        console.error("Mapbox error:", e);
        onError?.(`Map error: ${e?.error?.message || e?.message || String(e)}`);
      });
    } catch (err) {
      console.error("Error initializing map:", err);
      onError?.(`Failed to initialize map: ${err instanceof Error ? err.message : String(err)}`);
    }

    return () => {
      if (mapInstanceRef.current) {
        try {
          mapInstanceRef.current.remove();
        } catch {
          // ignore cleanup errors
        }
        mapInstanceRef.current = null;
      }
    };
    // Only depend on mapboxLoaded and mapData.center - don't re-initialize when shape layers change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapboxLoaded]);

  // Load choropleth when shape layer is selected (default_view or user selection)
  useEffect(() => {
    if (!mapInstanceRef.current || !mapboxLoaded) return;
    if (!selectedShapeLayer) return;
    if (showPoints) setShowPoints(false);
    
    // Remove any existing points layer when loading choropleth
    try {
      if (mapInstanceRef.current.getLayer("points-layer")) {
        mapInstanceRef.current.removeLayer("points-layer");
      }
      if (mapInstanceRef.current.getSource("points-source")) {
        mapInstanceRef.current.removeSource("points-source");
      }
    } catch {
      // ignore cleanup errors
    }
    
    // Can load choropleth if we have:
    // 1. Pre-computed aggregations, OR
    // 2. Location data that we can compute aggregations from, OR
    // 3. Points data that we can compute aggregations from
    const canComputeAggregations = !!(
      (mapData.location_data && Array.isArray(mapData.location_data) && mapData.location_data.length > 0) ||
      (points && points.length > 0)
    );
    const canLoadChoropleth = hasAggregations || canComputeAggregations;
    
    if (canLoadChoropleth && effectiveAggregations[selectedShapeLayer]) {
      const timeoutId = setTimeout(() => {
        try {
          loadChoroplethMap(mapInstanceRef.current, selectedShapeLayer);
        } catch (err) {
          console.error("Error loading choropleth:", err);
        }
      }, 100);
      
      return () => clearTimeout(timeoutId);
    }
  }, [selectedShapeLayer, hasAggregations, mapboxLoaded, mapData.location_data, points, effectiveAggregations]);

  // Update points display when showPoints or selectedDistrictId changes
  useEffect(() => {
    if (!mapInstanceRef.current || !showPoints || !points || points.length === 0) {
      // Remove points layer if hidden
      if (mapInstanceRef.current && !showPoints) {
        try {
          if (mapInstanceRef.current.getLayer("points-layer")) {
            mapInstanceRef.current.removeLayer("points-layer");
          }
          if (mapInstanceRef.current.getSource("points-source")) {
            mapInstanceRef.current.removeSource("points-source");
          }
        } catch {
          // ignore cleanup errors
        }
      }
      return;
    }

    // Wait for map to be fully loaded (check if choropleth layers exist if it's a choropleth map)
    if (hasAggregations && selectedShapeLayer) {
      // For choropleth maps, ensure choropleth layers are loaded before adding points
      try {
        if (!mapInstanceRef.current.getLayer("choropleth-fill")) {
          console.log("[ProgressiveMapView] Waiting for choropleth to load before showing points");
          return;
        }
      } catch (e) {
        console.log("[ProgressiveMapView] Error checking choropleth layer, map may not be ready:", e);
        return;
      }
    }

    console.log(`[ProgressiveMapView] Rendering ${points.length} points (showPoints=${showPoints}, selectedDistrictId=${selectedDistrictId})`);

    // Filter points by selected district
    const filteredPoints = selectedDistrictId
      ? points.filter((p: any) => {
          if (!selectedShapeLayer) return true;
          const aggregation = effectiveAggregations[selectedShapeLayer];
          if (!aggregation) return true;
          const identifierField = aggregation.identifier_field;
          const pointDistrictId = String(p[identifierField] || p.supervisor_district || p.district || "");
          return pointDistrictId === selectedDistrictId;
        })
      : points;

    // Filter out invalid points (missing lat/lon)
    const validFilteredPoints = filteredPoints.filter((p: any) => 
      p && 
      typeof p.lat === 'number' && 
      typeof p.lon === 'number' &&
      !isNaN(p.lat) && 
      !isNaN(p.lon) &&
      isFinite(p.lat) &&
      isFinite(p.lon)
    );

    if (validFilteredPoints.length > 0) {
      console.log(`[ProgressiveMapView] Adding ${validFilteredPoints.length} valid points to map`);
      addPointsLayer(mapInstanceRef.current, validFilteredPoints);
    } else {
      console.log(`[ProgressiveMapView] No valid points to display (filtered from ${points.length} total)`);
    }
  }, [showPoints, selectedDistrictId, points, selectedShapeLayer, effectiveAggregations, hasAggregations]);

  // Compute aggregations from points for a given shape layer
  // Uses metricDistrictField if available, falling back to identifierField and common district fields
  const computeAggregationForShapeLayer = (
    points: Array<{ lat: number; lon: number; [key: string]: any }>,
    identifierField: string
  ): Aggregation => {
    const aggregationMap = new Map<string, number>();
    
    console.log(`[ProgressiveMapView] computeAggregationForShapeLayer: identifierField=${identifierField}, metricDistrictField=${metricDistrictField}`);
    console.log(`[ProgressiveMapView] Sample point keys:`, points[0] ? Object.keys(points[0]) : []);
    
    points.forEach((point: any) => {
      // Try to get district ID from point data:
      // 1. First check metric's district_field (highest priority - explicitly configured)
      // 2. Then check the shape layer's identifier_field
      // 3. Then fall back to common district field names
      const id = String(
        (metricDistrictField && point[metricDistrictField]) ||
        point[identifierField] || 
        point.supervisor_district || 
        point.district || 
        point.district_id ||
        ""
      );
      if (id && id !== "null" && id !== "undefined" && id !== "") {
        const current = aggregationMap.get(id) || 0;
        aggregationMap.set(id, current + 1);
      }
    });
    
    console.log(`[ProgressiveMapView] Aggregation computed: ${aggregationMap.size} unique districts`);
    console.log(`[ProgressiveMapView] District IDs found:`, Array.from(aggregationMap.keys()).slice(0, 10));
    
    const rows = Array.from(aggregationMap.entries()).map(([id, count]) => ({
      district: id,
      [identifierField]: id,
      // Also store with metric's district field if different
      ...(metricDistrictField && metricDistrictField !== identifierField ? { [metricDistrictField]: id } : {}),
      value: count,
      count: count,
    }));
    
    return {
      identifier_field: identifierField,
      display_name: identifierField,
      rows,
    };
  };

  const loadChoroplethMap = async (mapInstance: any, shapeLayerId: string) => {
    try {
      const aggSource = effectiveAggregations;
      console.log(`[ProgressiveMapView] loadChoroplethMap called for shapeLayerId: ${shapeLayerId}`);
      console.log(`[ProgressiveMapView] Available aggregations keys:`, Object.keys(aggSource));
      console.log(`[ProgressiveMapView] Available shape layers:`, availableShapeLayers.map(sl => ({ id: sl.shape_layer_instance_id, name: sl.display_name, field: sl.identifier_field })));
      
      // Try to find aggregation - it might be keyed by shape_layer_instance_id as string or number
      let aggregation = aggSource[shapeLayerId] as Aggregation | undefined;
      if (!aggregation) {
        const shapeLayerIdNum = Number(shapeLayerId);
        if (!isNaN(shapeLayerIdNum)) {
          aggregation = aggSource[String(shapeLayerIdNum)] as Aggregation | undefined;
        }
      }
      if (!aggregation && Object.keys(aggSource).length > 0) {
        const firstKey = Object.keys(aggSource)[0];
        console.log(`[ProgressiveMapView] Trying first aggregation key: ${firstKey}`);
        aggregation = aggSource[firstKey] as Aggregation | undefined;
      }
      
      // If aggregation doesn't exist for this shape layer, try to compute it from points or location_data
      if (!aggregation) {
        const shapeLayer = availableShapeLayers.find(
          (sl) => String(sl.shape_layer_instance_id) === shapeLayerId
        );
        
        if (shapeLayer) {
          // Try to compute from points first
          if (points && points.length > 0) {
            console.log(`[ProgressiveMapView] Computing aggregation for shape layer ${shapeLayerId} from ${points.length} points`);
            aggregation = computeAggregationForShapeLayer(points, shapeLayer.identifier_field);
          } 
          // Fall back to location_data if points aren't available
          else if (mapData.location_data && Array.isArray(mapData.location_data) && mapData.location_data.length > 0) {
            console.log(`[ProgressiveMapView] Computing aggregation for shape layer ${shapeLayerId} from ${mapData.location_data.length} location_data items`);
            const validLocationData = mapData.location_data.filter((p: any) => 
              p && 
              typeof p.lat === 'number' && 
              typeof p.lon === 'number'
            );
            if (validLocationData.length > 0) {
              aggregation = computeAggregationForShapeLayer(validLocationData, shapeLayer.identifier_field);
            }
          }
        }
      }
      
      if (!aggregation) {
        console.warn(`[ProgressiveMapView] No aggregation available for shape layer ${shapeLayerId}`);
        console.warn(`[ProgressiveMapView] Points available: ${points?.length || 0}, location_data available: ${mapData.location_data?.length || 0}`);
        return;
      }
      
      console.log(`[ProgressiveMapView] Using aggregation with ${aggregation.rows.length} rows`);

      const shapeLayer = availableShapeLayers.find(
        (sl) => String(sl.shape_layer_instance_id) === shapeLayerId
      );
      if (!shapeLayer) return;

      const shapeLayerInstanceId = shapeLayer.shape_layer_instance_id;
      const identifierField = shapeLayer.identifier_field;

      // Fetch shape geometry (with caching)
      let shapeLayerData: any;
      try {
        shapeLayerData = await getCachedShapeGeometry(shapeLayerInstanceId);
      } catch (err) {
        console.error("Failed to fetch shape layer:", err);
        return;
      }
      if (!shapeLayerData?.instance?.geometry_data) {
        console.error("No geometry data in shape layer");
        return;
      }

      const geometryData = shapeLayerData.instance.geometry_data;

      // Create lookup map from aggregation rows
      // Store both string and number versions of district IDs for flexible matching
      const districtDataMap = new Map();
      console.log(`[ProgressiveMapView] Building districtDataMap from ${aggregation.rows.length} aggregation rows`);
      console.log(`[ProgressiveMapView] Using identifierField: ${identifierField}`);
      console.log(`[ProgressiveMapView] Sample aggregation row:`, aggregation.rows[0]);
      
      aggregation.rows.forEach((row: any) => {
        // Try multiple ways to get the district ID from the aggregation row
        // The row should have: district, [identifierField], count, value
        const districtId = String(
          row[identifierField] || 
          row.district || 
          row.supervisor_district ||
          row.district_id ||
          ""
        ).trim();
        
        if (districtId && districtId !== "null" && districtId !== "undefined" && districtId !== "") {
          // Normalize: convert numeric strings to consistent format
          let normalizedId = districtId;
          const districtIdNum = Number(districtId);
          if (!isNaN(districtIdNum) && isFinite(districtIdNum)) {
            // Normalize numeric IDs (e.g., "1.0" -> "1")
            normalizedId = String(Math.floor(districtIdNum));
          }
          
          // Store with normalized string key
          districtDataMap.set(normalizedId, row);
          
          // Also store with number key if it's a valid number
          if (!isNaN(districtIdNum) && isFinite(districtIdNum)) {
            districtDataMap.set(districtIdNum, row);
            districtDataMap.set(Math.floor(districtIdNum), row);
            // Also store as "District X" format
            districtDataMap.set(`District ${normalizedId}`, row);
            districtDataMap.set(`district ${normalizedId}`, row);
          }
          
          // Store original format too in case shape layer uses it
          if (districtId !== normalizedId) {
            districtDataMap.set(districtId, row);
          }
        }
      });
      
      console.log(`[ProgressiveMapView] districtDataMap has ${districtDataMap.size} entries`);
      console.log(`[ProgressiveMapView] Sample keys:`, Array.from(districtDataMap.keys()).slice(0, 5));

      const valueField = "value";
      const values = Array.from(districtDataMap.values())
        .map((item: any) => Number(item[valueField] || item.count || 0))
        .filter((v: number) => !isNaN(v) && isFinite(v));
      const minValue = values.length > 0 ? Math.min(...values) : 0;
      const maxValue = values.length > 0 ? Math.max(...values) : 1;

      const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
      const clamp01 = (t: number) => Math.max(0, Math.min(1, t));
      const blendRgb = (from: [number, number, number], to: [number, number, number], t: number) => {
        const tt = clamp01(t);
        return [
          Math.round(lerp(from[0], to[0], tt)),
          Math.round(lerp(from[1], to[1], tt)),
          Math.round(lerp(from[2], to[2], tt)),
        ] as [number, number, number];
      };

      const CHORO_LOW: [number, number, number] = [255, 255, 255];
      const CHORO_HIGH: [number, number, number] = [173, 53, 250];

      console.log(`[ProgressiveMapView] Processing ${geometryData.features.length} shape features`);
      console.log(`[ProgressiveMapView] Sample feature properties:`, geometryData.features[0]?.properties);
      
      // Get the shape layer's identifier field from the API (this is the field used in GeoJSON properties)
      const apiIdentifierField = shapeLayerData.instance.identifier_field;
      // Also get the shape_identifier_field from our stored shape layer config
      const shapeIdentifierField = shapeLayer.shape_identifier_field || apiIdentifierField;
      
      console.log(`[ProgressiveMapView] Field mapping:`, {
        dataField: identifierField, // Field in our point/location data
        shapeField: shapeIdentifierField, // Field in shape layer GeoJSON
        apiField: apiIdentifierField, // Field from API response
        metricField: metricDistrictField, // Field from metric config
      });
      
      const features = geometryData.features.map((feature: any) => {
        // Try multiple ways to get district ID from shape layer properties
        const props = feature.properties || {};
        
        // Priority for reading from shape layer properties:
        // 1. API's identifier_field (authoritative)
        // 2. Shape identifier field we discovered
        // 3. Common district field names
        const districtIdRaw = 
          props[apiIdentifierField] ||
          props[shapeIdentifierField] ||
          props[identifierField] ||
          props.district ||
          props.district_id ||
          props.supervisor_district ||
          props.sup_dist_num ||
          props.name ||
          props.label ||
          "";
        
        // Normalize the district ID
        let districtId = String(districtIdRaw).trim();
        const districtIdNum = Number(districtId);
        if (!isNaN(districtIdNum) && isFinite(districtIdNum)) {
          // Normalize numeric IDs
          districtId = String(Math.floor(districtIdNum));
        }

        // Try multiple lookup strategies
        let districtData = districtDataMap.get(districtId);
        if (!districtData && districtIdRaw) {
          // Try with original format
          districtData = districtDataMap.get(String(districtIdRaw).trim());
        }
        if (!districtData && !isNaN(districtIdNum) && isFinite(districtIdNum)) {
          // Try as number
          districtData = districtDataMap.get(districtIdNum) || 
                        districtDataMap.get(Math.floor(districtIdNum));
        }
        if (!districtData) {
          // Try "District X" format
          districtData = districtDataMap.get(`District ${districtId}`) || 
                        districtDataMap.get(`district ${districtId}`);
        }
        if (!districtData && districtIdRaw) {
          // Try "District X" with original format
          districtData = districtDataMap.get(`District ${String(districtIdRaw).trim()}`) || 
                        districtDataMap.get(`district ${String(districtIdRaw).trim()}`);
        }
        
        const value = districtData ? Number(districtData[valueField] || districtData.count || 0) : null;
        
        if (!districtData && districtId) {
          console.log(`[ProgressiveMapView] No data found for districtId: "${districtId}" (raw: "${districtIdRaw}")`);
          console.log(`[ProgressiveMapView] Available keys in districtDataMap:`, Array.from(districtDataMap.keys()).slice(0, 10));
          console.log(`[ProgressiveMapView] Feature properties:`, Object.keys(props));
          console.log(`[ProgressiveMapView] Tried identifier fields: ${identifierField}, ${apiIdentifierField}`);
        }

        let color = "#e5e7eb"; // Default gray for no data
        if (value !== null && !isNaN(value) && isFinite(value)) {
          const normalized = clamp01((value - minValue) / (maxValue - minValue || 1));
          const [r, g, b] = blendRgb(CHORO_LOW, CHORO_HIGH, normalized);
          color = `rgb(${r}, ${g}, ${b})`;
        }

        return {
          ...feature,
          properties: {
            ...feature.properties,
            ...districtData,
            // Must be last: aggregation rows often include unrelated fields
            // (e.g. crime 'color') that would overwrite Mapbox fill-color.
            district_id: districtId,
            value: value,
            color: color,
          },
        };
      });

      // Wait for style to load if not already loaded
      if (!mapInstance.isStyleLoaded()) {
        console.log("[ProgressiveMapView] Style not loaded, waiting for load event before adding choropleth");
        await new Promise<void>((resolve) => {
          mapInstance.once('load', () => {
            console.log("[ProgressiveMapView] Style now loaded, proceeding with choropleth");
            resolve();
          });
        });
      }

      // Remove existing layers
      try {
        if (mapInstance.getLayer("choropleth-fill")) {
          mapInstance.removeLayer("choropleth-fill");
        }
        if (mapInstance.getLayer("choropleth-outline")) {
          mapInstance.removeLayer("choropleth-outline");
        }
        if (mapInstance.getSource("choropleth-shapes")) {
          mapInstance.removeSource("choropleth-shapes");
        }
      } catch {
        // ignore cleanup errors
      }

      mapInstance.addSource("choropleth-shapes", {
        type: "geojson",
        data: {
          type: "FeatureCollection",
          features: features,
        },
      });

      // Check if points layer exists - choropleth should always render BELOW points
      // The beforeId parameter inserts the new layer below the specified layer
      const pointsLayerExists = mapInstance.getLayer("points-layer");
      const beforeLayerId = pointsLayerExists ? "points-layer" : undefined;

      mapInstance.addLayer({
        id: "choropleth-fill",
        type: "fill",
        source: "choropleth-shapes",
        paint: {
          "fill-color": ["get", "color"],
          "fill-opacity": 0.7,
        },
      }, beforeLayerId);

      mapInstance.addLayer({
        id: "choropleth-outline",
        type: "line",
        source: "choropleth-shapes",
        paint: {
          "line-color": "#ffffff",
          "line-width": 0.75,
        },
      }, beforeLayerId);

      // Don't fit to shape layer bounds - respect the map's initial center and zoom
      // from mapData.center which is typically set to show the city at an appropriate zoom level.
      // Fitting to shape layer bounds (like supervisor districts) can zoom all the way out
      // if the shape layer extends beyond the city boundaries.

      // Click handler for progressive display
      mapInstance.off("click", "choropleth-fill");
      mapInstance.on("click", "choropleth-fill", async (e: any) => {
        if (!e.features || e.features.length === 0) return;
        const feature = e.features[0];
        const districtId = feature.properties.district_id || feature.properties.district || "";
        
        if (!districtId) return;

        setSelectedDistrictId(districtId);
        
        // Fetch points if not already loaded
        if (points === null) {
          await fetchPoints();
        }
        
        // Show points
        setShowPoints(true);
      });

      // Hover tooltip
      const popup = new (window as any).mapboxgl.Popup({
        closeButton: false,
        closeOnClick: false,
      });

      mapInstance.off("mouseenter", "choropleth-fill");
      mapInstance.off("mouseleave", "choropleth-fill");
      
      const itemNoun = (mapData.map_config?.item_noun as string) || "items";
      mapInstance.on("mouseenter", "choropleth-fill", (e: any) => {
        if (!e.features || e.features.length === 0) return;
        const feature = e.features[0];
        const props = feature.properties;
        const districtId = props.district_id || props.district || "Unknown";
        const value = props.value !== null && props.value !== undefined ? props.value.toLocaleString() : "No data";

        popup
          .setLngLat(e.lngLat)
          .setHTML(`<div class="map-popup"><strong>${shapeLayer.display_name} ${districtId}</strong><br/>${value} ${itemNoun}</div>`)
          .addTo(mapInstance);
      });

      mapInstance.on("mouseleave", "choropleth-fill", () => {
        popup.remove();
      });
    } catch (err) {
      console.error("Error loading choropleth map:", err);
    }
  };

  const loadPointMap = (mapInstance: any) => {
    if (!mapData.location_data || !Array.isArray(mapData.location_data)) return;
    const pointData = mapData.location_data.filter((p: any) => p.lat && p.lon);
    if (pointData.length === 0) return;
    addPointsLayer(mapInstance, pointData);
  };

  const itemNoun = (mapData.map_config?.item_noun as string) || "items";
  const itemNounCap = itemNoun.charAt(0).toUpperCase() + itemNoun.slice(1);

  const addPointsLayer = (mapInstance: any, pointData: Array<{ lat: number; lon: number; [key: string]: any }>) => {
    console.log(`[ProgressiveMapView] addPointsLayer called with ${pointData.length} points`);
    
    // Aggregate points at identical locations to show count-scaled markers
    const locationMap = new Map<string, { points: any[]; lat: number; lon: number }>();
    
    pointData.forEach((point: any) => {
      // Round to 6 decimal places for grouping (about 0.1 meter precision)
      const key = `${point.lat.toFixed(6)},${point.lon.toFixed(6)}`;
      if (!locationMap.has(key)) {
        locationMap.set(key, { points: [], lat: point.lat, lon: point.lon });
      }
      locationMap.get(key)!.points.push(point);
    });
    
    // Create features with count property for scaling
    const aggregatedFeatures = Array.from(locationMap.entries()).map(([key, data], index) => {
      const count = data.points.length;
      // Use the first point's properties, but add count
      const firstPoint = data.points[0];
      return {
        type: "Feature" as const,
        geometry: {
          type: "Point" as const,
          coordinates: [data.lon, data.lat],
        },
        properties: {
          id: index,
          count,
          // Include all points data for popup (when count > 1)
          allPoints: count > 1 ? data.points : undefined,
          ...firstPoint,
        },
      };
    });
    
    console.log(`[ProgressiveMapView] Aggregated ${pointData.length} points into ${aggregatedFeatures.length} unique locations`);
    
    const geojsonData = {
      type: "FeatureCollection" as const,
      features: aggregatedFeatures,
    };

    // Helper function to actually add the layers
    const doAddPointsLayer = () => {
      try {
        // Remove existing points layer
        if (mapInstance.getLayer("points-layer")) {
          console.log("[ProgressiveMapView] Removing existing points-layer");
          mapInstance.removeLayer("points-layer");
        }
        if (mapInstance.getSource("points-source")) {
          console.log("[ProgressiveMapView] Removing existing points-source");
          mapInstance.removeSource("points-source");
        }

        console.log("[ProgressiveMapView] Adding points-source with", geojsonData.features.length, "features");
        mapInstance.addSource("points-source", {
          type: "geojson",
          data: geojsonData,
        });

        const seriesField = mapData.map_config?.series_field as string | undefined;
        const seriesColors = mapData.map_config?.series_colors as Record<string, string> | undefined;
        const circleColor = (() => {
          if (seriesField && seriesColors && Object.keys(seriesColors).length > 0) {
            const matchExpr: any[] = ["match", ["to-string", ["get", seriesField]]];
            for (const [label, color] of Object.entries(seriesColors)) {
              matchExpr.push(String(label), String(color));
            }
            matchExpr.push("#ad35fa");
            return matchExpr;
          }
          return "#ad35fa";
        })();

        console.log("[ProgressiveMapView] Adding points-layer");
        mapInstance.addLayer({
          id: "points-layer",
          type: "circle",
          source: "points-source",
          paint: {
            // Scale radius based on point count at location
            // Base radius 6, scales up with sqrt of count for better visual balance
            "circle-radius": [
              "interpolate",
              ["linear"],
              ["get", "count"],
              1, 6,      // 1 point = radius 6
              2, 9,      // 2 points = radius 9
              3, 11,     // 3 points = radius 11
              5, 14,     // 5 points = radius 14
              10, 18,    // 10 points = radius 18
              20, 22,    // 20+ points = radius 22
            ],
            "circle-color": circleColor,
            "circle-stroke-color": "#fff",
            // Scale stroke width slightly with size
            "circle-stroke-width": [
              "interpolate",
              ["linear"],
              ["get", "count"],
              1, 1,
              5, 1.5,
              10, 2,
            ],
            "circle-opacity": 0.85,
          },
        });
        
        // Add click handler for points
        mapInstance.off("click", "points-layer");
        mapInstance.on("click", "points-layer", (e: any) => {
          if (!e.features || e.features.length === 0) return;
          const feature = e.features[0];
          const props = feature.properties || {};
          const count = props.count || 1;
          console.log("[ProgressiveMapView] Point clicked:", props);
          
          // Build popup content
          let popupContent = `<div class="map-popup" style="max-height:300px;overflow-y:auto;">`;
          
          if (count > 1) {
            popupContent += `<strong style="color:#ad35fa;">${count} incidents at this location</strong><hr style="margin:8px 0;border-color:#eee;"/>`;
            
            // Try to parse allPoints if it was stored as string
            let allPoints = props.allPoints;
            if (typeof allPoints === 'string') {
              try { allPoints = JSON.parse(allPoints); } catch { allPoints = null; }
            }
            
            if (allPoints && Array.isArray(allPoints)) {
              allPoints.forEach((pt: any, i: number) => {
                const desc = pt.incident_description || pt.description || `Incident ${i + 1}`;
                const date = pt.incident_date ? new Date(pt.incident_date).toLocaleDateString() : '';
                popupContent += `<div style="margin-bottom:6px;padding-bottom:6px;border-bottom:1px solid #eee;">
                  <strong>${desc}</strong>${date ? `<br/><small style="color:#666;">${date}</small>` : ''}
                </div>`;
              });
            }
          } else {
            const desc = props.incident_description || props.description || itemNounCap;
            const date = props.incident_date ? new Date(props.incident_date).toLocaleDateString() : '';
            popupContent += `<strong>${desc}</strong>${date ? `<br/><small style="color:#666;">${date}</small>` : ''}`;
          }
          
          popupContent += `</div>`;
          
          // Show popup with point info
          const clickPopup = new (window as any).mapboxgl.Popup({ maxWidth: '300px' })
            .setLngLat(e.lngLat)
            .setHTML(popupContent)
            .addTo(mapInstance);
        });
        
        // Add hover handler for points
        mapInstance.off("mouseenter", "points-layer");
        mapInstance.off("mouseleave", "points-layer");
        
        const popup = new (window as any).mapboxgl.Popup({
          closeButton: false,
          closeOnClick: false,
        });
        
        mapInstance.on("mouseenter", "points-layer", (e: any) => {
          mapInstance.getCanvas().style.cursor = "pointer";
          if (!e.features || e.features.length === 0) return;
          const feature = e.features[0];
          const props = feature.properties || {};
          const count = props.count || 1;
          const displayText = props.incident_description || props.description || itemNounCap;
          
          // Show count badge if multiple points at same location
          const countBadge = count > 1 
            ? `<span style="background:#ad35fa;color:white;padding:2px 6px;border-radius:10px;font-size:11px;margin-left:6px;">${count} ${itemNoun}</span>` 
            : '';
          
          popup
            .setLngLat(e.lngLat)
            .setHTML(`<div class="map-popup">${displayText}${countBadge}</div>`)
            .addTo(mapInstance);
        });
        
        mapInstance.on("mouseleave", "points-layer", () => {
          mapInstance.getCanvas().style.cursor = "";
          popup.remove();
        });
        
        console.log("[ProgressiveMapView] Points layer added successfully");
      } catch (err) {
        console.error("[ProgressiveMapView] Error adding point layers:", err);
      }
    };

    // Check if style is loaded before adding layers
    if (mapInstance.isStyleLoaded()) {
      doAddPointsLayer();
    } else {
      console.log("[ProgressiveMapView] Style not loaded yet, waiting for 'load' event before adding points");
      mapInstance.once('load', doAddPointsLayer);
    }
  };

  // Add comparison period points as grey dots (rendered below current period points)
  const addComparisonPointsLayer = (mapInstance: any, pointData: Array<{ lat: number; lon: number; [key: string]: any }>) => {
    console.log(`[ProgressiveMapView] addComparisonPointsLayer called with ${pointData.length} comparison points`);
    
    // Aggregate points at identical locations
    const locationMap = new Map<string, { points: any[]; lat: number; lon: number }>();
    
    pointData.forEach((point: any) => {
      const key = `${point.lat.toFixed(6)},${point.lon.toFixed(6)}`;
      if (!locationMap.has(key)) {
        locationMap.set(key, { points: [], lat: point.lat, lon: point.lon });
      }
      locationMap.get(key)!.points.push(point);
    });
    
    const aggregatedFeatures = Array.from(locationMap.entries()).map(([key, data], index) => {
      const count = data.points.length;
      const firstPoint = data.points[0];
      return {
        type: "Feature" as const,
        geometry: {
          type: "Point" as const,
          coordinates: [data.lon, data.lat],
        },
        properties: {
          id: index,
          count,
          ...firstPoint,
        },
      };
    });
    
    const geojsonData = {
      type: "FeatureCollection" as const,
      features: aggregatedFeatures,
    };

    const doAddComparisonLayer = () => {
      try {
        // Remove existing comparison layer
        if (mapInstance.getLayer("comparison-points-layer")) {
          mapInstance.removeLayer("comparison-points-layer");
        }
        if (mapInstance.getSource("comparison-points-source")) {
          mapInstance.removeSource("comparison-points-source");
        }

        mapInstance.addSource("comparison-points-source", {
          type: "geojson",
          data: geojsonData,
        });

        // Check if points-layer exists before using it as beforeId
        // This ensures we don't get "Layer with id 'points-layer' does not exist" error
        const pointsLayerExists = mapInstance.getLayer("points-layer");
        const beforeLayerId = pointsLayerExists ? "points-layer" : undefined;

        // Add comparison layer BEFORE the main points layer (so it renders below)
        // Use a grey color and slightly smaller radius
        mapInstance.addLayer({
          id: "comparison-points-layer",
          type: "circle",
          source: "comparison-points-source",
          paint: {
            "circle-radius": [
              "interpolate",
              ["linear"],
              ["get", "count"],
              1, 5,      // Slightly smaller than main points
              2, 7,
              3, 9,
              5, 12,
              10, 15,
              20, 18,
            ],
            "circle-color": "#9ca3af", // Grey color for comparison period
            "circle-stroke-color": "#fff",
            "circle-stroke-width": [
              "interpolate",
              ["linear"],
              ["get", "count"],
              1, 0.5,
              5, 1,
              10, 1.5,
            ],
            "circle-opacity": 0.6, // More transparent than current period
          },
        }, beforeLayerId); // Insert below points-layer if it exists
        
        console.log("[ProgressiveMapView] Comparison points layer added successfully");
      } catch (err) {
        console.error("[ProgressiveMapView] Error adding comparison points layer:", err);
      }
    };

    if (mapInstance.isStyleLoaded()) {
      doAddComparisonLayer();
    } else {
      mapInstance.once('load', doAddComparisonLayer);
    }
  };

  // Effect to render comparison points when available
  // Only render comparison points for point maps - choropleth shows recent period only
  useEffect(() => {
    if (!mapInstanceRef.current || !mapboxLoaded) return;
    
    // Don't show comparison points in choropleth mode - choropleth shows recent period only
    const isChoroplethMode = defaultView?.type === "choropleth" || hasAggregations;
    
    if (!comparisonLocationData || comparisonLocationData.length === 0 || isChoroplethMode) {
      // Remove comparison layer if no data or in choropleth mode
      try {
        if (mapInstanceRef.current.getLayer("comparison-points-layer")) {
          mapInstanceRef.current.removeLayer("comparison-points-layer");
        }
        if (mapInstanceRef.current.getSource("comparison-points-source")) {
          mapInstanceRef.current.removeSource("comparison-points-source");
        }
      } catch {
        // ignore cleanup errors
      }
      if (isChoroplethMode && comparisonLocationData && comparisonLocationData.length > 0) {
        console.log(`[ProgressiveMapView] Skipping comparison points in choropleth mode - showing recent period only`);
      }
      return;
    }
    
    // Normalize comparison points to extract lat/lon from various formats (including GeoJSON)
    const validComparisonPoints = normalizePointData(comparisonLocationData);
    
    if (validComparisonPoints.length > 0) {
      console.log(`[ProgressiveMapView] Rendering ${validComparisonPoints.length} comparison points (normalized from ${comparisonLocationData.length})`);
      addComparisonPointsLayer(mapInstanceRef.current, validComparisonPoints);
    } else {
      console.log(`[ProgressiveMapView] No valid comparison points found after normalization. Sample data:`, comparisonLocationData[0]);
    }
  }, [comparisonLocationData, mapboxLoaded, defaultView, hasAggregations]);

  // Legacy addPoints function - delegates to addPointsLayer
  const addPoints = (mapInstance: any) => {
    if (!mapData.location_data || !Array.isArray(mapData.location_data)) return;
    const pointData = mapData.location_data.filter((p: any) => p.lat && p.lon);
    if (pointData.length === 0) return;
    addPointsLayer(mapInstance, pointData);
  };


  // Allow showing points whenever we have location data (user can switch from choropleth to points)
  // When point count > 1000 we show a small warning but still allow it
  const canShowDots = !!(
    mapData.location_data &&
    Array.isArray(mapData.location_data) &&
    locationDataCount > 0
  );
  const isShowingManyPoints = showPoints && locationDataCount > 1000;

  return (
    <div className="progressive-map-view" style={{ position: "relative" }}>
      <div className="map-container-wrapper" style={{ position: "relative" }}>
        <MapLayerPanel
          availableShapeLayers={availableShapeLayers}
          availableViews={availableViews.length > 0 ? availableViews : undefined}
          selectedShapeLayer={selectedShapeLayer}
          loadingViewId={loadingLazyView && selectedShapeLayer ? selectedShapeLayer : null}
          onShapeLayerSelect={(shapeLayerId) => {
            // Set the shape layer (empty string clears it)
            setSelectedShapeLayer(shapeLayerId || null);
            setSelectedDistrictId(null); // Reset district selection when switching shape layers
            // Hide points when selecting a shape layer
            if (shapeLayerId && showPoints) {
              setShowPoints(false);
            }
          }}
          showDots={showPoints}
          onToggleDots={() => {
            const newShowPoints = !showPoints;
            setShowPoints(newShowPoints);
            
            // When showing points, clear shape layer selection and remove choropleth
            if (newShowPoints && selectedShapeLayer) {
              setSelectedShapeLayer(null);
              setSelectedDistrictId(null);
              
              // Remove choropleth layers
              if (mapInstanceRef.current) {
                try {
                  if (mapInstanceRef.current.getLayer("choropleth-fill")) {
                    mapInstanceRef.current.removeLayer("choropleth-fill");
                  }
                  if (mapInstanceRef.current.getLayer("choropleth-outline")) {
                    mapInstanceRef.current.removeLayer("choropleth-outline");
                  }
                  if (mapInstanceRef.current.getSource("choropleth-shapes")) {
                    mapInstanceRef.current.removeSource("choropleth-shapes");
                  }
                } catch {
                  // ignore cleanup errors
                }
              }
            }
          }}
          canShowDots={canShowDots}
        />

        {(loadingPoints || loadingLazyView) && (
          <div className="points-loading">
            <Loader size="sm" color="dark" />
            <span>{loadingLazyView ? "Loading view..." : "Loading points..."}</span>
          </div>
        )}

        {isShowingManyPoints && (
          <div className="points-many-warning" role="status">
            Showing many points may be slow.
          </div>
        )}

        <div ref={mapContainerRef} className="map-container" style={{ height }} />
        {!mapboxLoaded && (
          <div className="map-loading">
            <Loader size="md" color="dark" />
            <span>Loading Mapbox...</span>
          </div>
        )}
      </div>
    </div>
  );
}

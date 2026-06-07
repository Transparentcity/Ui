"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import type { SavedMap } from "@/lib/apiClient";
import { getMapView } from "@/lib/apiClient";
import { API_BASE } from "@/lib/apiBase";
import {
  getCaseInsensitiveProp,
  getChoroplethBrandRamp,
  getInitialMapView,
  normalizeChoroplethDistrictKey,
  type ChoroplethBasemapTheme,
} from "@/lib/mapUtils";
import { normalizePointData } from "@/lib/mapPointNormalize";
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
  /** Match app theme: dark uses mapbox dark-v11 and a darker choropleth ramp */
  mapBasemapTheme?: ChoroplethBasemapTheme;
  /**
   * When set (e.g. metric detail embed), hides the layer panel and locks the map to one mode.
   * Format: `"points"` or `"choro:<shape_layer_instance_id>"` from `formatMetricMapViewSpecKey`.
   */
  lockedViewKey?: string | null;
}

interface ShapeLayer {
  shape_layer_instance_id: number;
  identifier_field: string;
  /** Metric column used to join rows to shapes (when different from identifier_field). */
  data_field?: string;
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

/** ProgressiveMapView fallback center when backend sends no bounds (matches map init default). */
const CONTINENTAL_US_FALLBACK_LNG = -98.5795;
const CONTINENTAL_US_FALLBACK_LAT = 39.8283;

function isContinentalUsFallbackView(
  bounds: [[number, number], [number, number]] | null | undefined,
  center: { lat?: number; lng?: number; zoom?: number } | null | undefined
): boolean {
  if (bounds && bounds.length === 2) return false;
  if (
    !center ||
    typeof center.lat !== "number" ||
    typeof center.lng !== "number" ||
    !Number.isFinite(center.lat) ||
    !Number.isFinite(center.lng)
  ) {
    return true;
  }
  return (
    Math.abs(center.lng - CONTINENTAL_US_FALLBACK_LNG) < 1.5 &&
    Math.abs(center.lat - CONTINENTAL_US_FALLBACK_LAT) < 1.5
  );
}

/** Bounding box [[sw_lng, sw_lat], [ne_lng, ne_lat]] from choropleth polygons. */
function getBoundsFromPolygonFeatures(
  features: Array<{ geometry?: GeoJSON.Geometry }>
): [[number, number], [number, number]] | null {
  let minLng = Infinity;
  let minLat = Infinity;
  let maxLng = -Infinity;
  let maxLat = -Infinity;
  const addPoint = (lng: number, lat: number) => {
    minLng = Math.min(minLng, lng);
    minLat = Math.min(minLat, lat);
    maxLng = Math.max(maxLng, lng);
    maxLat = Math.max(maxLat, lat);
  };
  for (const f of features) {
    const geom = f?.geometry;
    if (!geom) continue;
    if (geom.type === "Polygon") {
      for (const ring of geom.coordinates) {
        for (const pos of ring) {
          if (pos.length >= 2) addPoint(pos[0], pos[1]);
        }
      }
    } else if (geom.type === "MultiPolygon") {
      for (const polygon of geom.coordinates) {
        for (const ring of polygon) {
          for (const pos of ring) {
            if (pos.length >= 2) addPoint(pos[0], pos[1]);
          }
        }
      }
    }
  }
  if (minLng === Infinity || minLat === Infinity) return null;
  return [
    [minLng, minLat],
    [maxLng, maxLat],
  ];
}

interface Aggregation {
  identifier_field: string;
  /** Metric column used to key rows (may differ from identifier_field, e.g. "analysis_neighborhood" vs "nhood"). */
  data_field?: string;
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

type AggregatedPointFeature = {
  type: "Feature";
  geometry: { type: "Point"; coordinates: [number, number] };
  properties: Record<string, any>;
};

/**
 * Merge rows that share the same ~1e-6° map cell into one circle (count scales radius).
 * When map_config has series_field + series_colors, only rows with the same series
 * value merge; different categories at the same address are offset slightly so every
 * color stays visible (matches backend point-map PNG / static overlay).
 */
function buildAggregatedPointFeatures(
  pointData: Array<{ lat: number; lon: number; [key: string]: any }>,
  mapConfig: Record<string, any> | undefined,
): AggregatedPointFeature[] {
  const seriesField = mapConfig?.series_field as string | undefined;
  const seriesColors = mapConfig?.series_colors as Record<string, string> | undefined;
  const hasSeriesColor = !!(
    seriesField &&
    seriesColors &&
    Object.keys(seriesColors).length > 0
  );

  const bucketMap = new Map<
    string,
    { points: any[]; lat: number; lon: number; locKey: string }
  >();

  for (const point of pointData) {
    const locKey = `${point.lat.toFixed(6)},${point.lon.toFixed(6)}`;
    const key =
      hasSeriesColor && seriesField
        ? `${locKey}|${
            point[seriesField] === null || point[seriesField] === undefined
              ? ""
              : String(point[seriesField])
          }`
        : locKey;
    if (!bucketMap.has(key)) {
      bucketMap.set(key, {
        points: [],
        lat: point.lat,
        lon: point.lon,
        locKey,
      });
    }
    bucketMap.get(key)!.points.push(point);
  }

  const byLoc = new Map<
    string,
    Array<{ key: string; data: { points: any[]; lat: number; lon: number; locKey: string } }>
  >();
  for (const [key, data] of bucketMap) {
    const loc = hasSeriesColor ? data.locKey : key;
    if (!byLoc.has(loc)) byLoc.set(loc, []);
    byLoc.get(loc)!.push({ key, data });
  }

  const features: AggregatedPointFeature[] = [];
  let index = 0;
  const sortedLocs = Array.from(byLoc.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  for (const [, group] of sortedLocs) {
    group.sort((a, b) => String(a.key).localeCompare(String(b.key)));
    const n = group.length;
    const baseLat = group[0]!.data.lat;
    const baseLon = group[0]!.data.lon;
    for (let i = 0; i < group.length; i += 1) {
      const { data } = group[i]!;
      const count = data.points.length;
      const firstPoint = data.points[0]!;
      let lat = data.lat;
      let lon = data.lon;
      if (hasSeriesColor && n > 1) {
        const theta = (2 * Math.PI * i) / n;
        const r = 0.0002 * (1 + 0.15 * (n - 1));
        lat = baseLat + r * Math.sin(theta);
        lon =
          baseLon +
          (r * Math.cos(theta)) /
            Math.max(Math.cos((baseLat * Math.PI) / 180), 0.2);
      }
      features.push({
        type: "Feature" as const,
        geometry: { type: "Point" as const, coordinates: [lon, lat] },
        properties: {
          id: index,
          count,
          allPoints: count > 1 ? data.points : undefined,
          ...firstPoint,
        },
      });
      index += 1;
    }
  }
  return features;
}

export default function ProgressiveMapView({
  mapData,
  mapHash,
  height = 400,
  onError,
  comparisonLocationData,
  mapBasemapTheme = "light",
  lockedViewKey = null,
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
  const savedPlaceMarkerRef = useRef<any>(null);

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
          data_field: (v as { data_field?: string }).data_field,
          display_name: v.display_name ?? String(v.shape_layer_instance_id),
          is_city_district: v.is_city_district,
        }));
    }
    return shapeLayersFromConfig?.length ? shapeLayersFromConfig : EMPTY_SHAPE_LAYERS;
  }, [availableViews, shapeLayersFromConfig]);

  // Initial view from default_view (backend decides); with few points always show points so dots are visible.
  // Use 1000 so that "Last month" and similar bounded ranges (often a few hundred points) show points by default.
  // Map preview (embedded metric maps) often has available_views + aggregations but omits available_shape_layers;
  // the old branch only read shapeLayersFromConfig, so we fell through to "many points => show dots".
  const initialViewRef = useRef(false);
  useEffect(() => {
    if (lockedViewKey) {
      initialViewRef.current = true;
      if (lockedViewKey === "points") {
        setShowPoints(true);
        setSelectedShapeLayer(null);
      } else if (lockedViewKey.startsWith("choro:")) {
        setShowPoints(false);
        setSelectedShapeLayer(lockedViewKey.slice("choro:".length));
      }
      return;
    }
    if (initialViewRef.current) return;
    initialViewRef.current = true;
    const fewPoints = locationDataCount <= 1000;
    const aggregationKeys = Object.keys(aggregations);

    const aggRowCount = (shapeLayerId: string): number => {
      const rows = (aggregations[shapeLayerId] as { rows?: unknown[] } | undefined)?.rows;
      return Array.isArray(rows) ? rows.length : 0;
    };

    /** Choropleth layer id when we have aggregation rows (row_count on views is sometimes omitted). */
    const resolveChoroShapeLayerId = (): string | null => {
      if (aggregationKeys.length === 0) return null;

      const viewHasUsableRows = (v: AvailableView): boolean => {
        if (v.type !== "choropleth" || v.shape_layer_instance_id == null) return false;
        const sid = String(v.shape_layer_instance_id);
        if (!aggregationKeys.includes(sid)) return false;
        const meta = v.row_count;
        return (meta != null && meta > 0) || aggRowCount(sid) > 0;
      };

      const fromCity = availableViews.find(
        (v) => viewHasUsableRows(v) && v.is_city_district
      );
      if (fromCity?.shape_layer_instance_id != null) {
        return String(fromCity.shape_layer_instance_id);
      }
      const fromViews = availableViews.find((v) => viewHasUsableRows(v));
      if (fromViews?.shape_layer_instance_id != null) {
        return String(fromViews.shape_layer_instance_id);
      }

      for (const sl of initialShapeLayers) {
        const sid = String(sl.shape_layer_instance_id);
        if (aggregationKeys.includes(sid) && aggRowCount(sid) > 0) return sid;
      }
      for (const sl of shapeLayersFromConfig ?? []) {
        const sid = String(sl.shape_layer_instance_id);
        if (aggregationKeys.includes(sid) && aggRowCount(sid) > 0) return sid;
      }
      return null;
    };

    const choroLayerId = resolveChoroShapeLayerId();
    const preferChoroOverPoints =
      choroLayerId != null &&
      !fewPoints &&
      locationDataCount > 1000 &&
      aggregationKeys.length > 0;

    if (defaultView?.type === "choropleth" && defaultView.shape_layer_instance_id != null) {
      setShowPoints(false);
      setSelectedShapeLayer(String(defaultView.shape_layer_instance_id));
      return;
    }

    if (
      preferChoroOverPoints &&
      (defaultView == null || defaultView.type === "points")
    ) {
      setShowPoints(false);
      setSelectedShapeLayer(choroLayerId);
      return;
    }

    if (defaultView) {
      if (defaultView.type === "points" || fewPoints) {
        setShowPoints(true);
        setSelectedShapeLayer(null);
      } else if (defaultView.type === "choropleth" && defaultView.shape_layer_instance_id != null) {
        setShowPoints(false);
        setSelectedShapeLayer(String(defaultView.shape_layer_instance_id));
      }
      return;
    }

    if (initialShapeLayers.length > 0 && locationDataCount > 1000) {
      setShowPoints(false);
      setSelectedShapeLayer(String(initialShapeLayers[0].shape_layer_instance_id));
      return;
    }
    if (shapeLayersFromConfig?.length && locationDataCount > 1000) {
      const first = shapeLayersFromConfig[0];
      setShowPoints(false);
      setSelectedShapeLayer(String(first.shape_layer_instance_id));
      return;
    }
    if (locationDataCount > 0 && locationDataCount <= MAX_POINTS_LIMIT) {
      setShowPoints(true);
      setSelectedShapeLayer(null);
    }
  }, [
    lockedViewKey,
    defaultView,
    shapeLayersFromConfig,
    locationDataCount,
    aggregations,
    availableViews,
    initialShapeLayers,
  ]);

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
        setPoints(validLocationData);
        // Don't auto-show points for choropleth maps - let user toggle them
      } else if (points === null && !loadingPoints && validLocationData.length === 0) {
        // Choropleth rows (no lat/lon): only saved maps can lazy-load points via API.
        // Preview/embed has no mapHash — avoid /public//points 404 noise.
        if (!mapHash?.trim()) {
          setPoints([]);
        } else {
          fetchPoints().catch((err) => {
            console.error("Auto-fetch points failed:", err);
          });
        }
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

  // Fetch points on demand (saved public maps only; choropleth-only maps may 404)
  const fetchPoints = async () => {
    if (points !== null) {
      return;
    }
    if (!mapHash?.trim()) {
      setPoints([]);
      return;
    }

    setLoadingPoints(true);
    try {
      const response = await fetch(`${API_BASE}/api/maps/public/${mapHash}/points`);
      if (response.status === 404) {
        setPoints([]);
        return;
      }
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

    let cancelled = false;
    let layoutAttempts = 0;
    const MAX_LAYOUT_ATTEMPTS = 40;

    const startInit = () => {
      const container = mapContainerRef.current;
      if (!container || cancelled) {
        return;
      }
      if (container.offsetWidth === 0 || container.offsetHeight === 0) {
        layoutAttempts += 1;
        if (layoutAttempts >= MAX_LAYOUT_ATTEMPTS) {
          return;
        }
        requestAnimationFrame(startInit);
        return;
      }

    (async () => {
      try {
        mapboxgl.accessToken = MAPBOX_TOKEN;

        const bounds = mapData.bounds;
        let initialCenter: [number, number];
        let embeddedZoom: number;
        if (mapData.center) {
          initialCenter = [mapData.center.lng, mapData.center.lat];
          embeddedZoom = Math.max((mapData.center.zoom ?? 11) - 1, 10);
        } else if (bounds && bounds.length === 2) {
          const [[swLng, swLat], [neLng, neLat]] = bounds;
          initialCenter = [(swLng + neLng) / 2, (swLat + neLat) / 2];
          embeddedZoom = 11;
        } else {
          initialCenter = [-98.5795, 39.8283];
          embeddedZoom = 10;
        }

        const isDistrictMap =
          mapData.map_type === "choropleth" || mapData.map_type === "delta";
        const hasPointCoords =
          Array.isArray(mapData.location_data) &&
          normalizePointData(mapData.location_data).length > 0;
        if (
          mapData.city_id &&
          isDistrictMap &&
          !mapData.center &&
          !bounds &&
          !hasPointCoords
        ) {
          try {
            const res = await fetch(
              `/api/public/cities/${mapData.city_id}?include_metrics=false`
            );
            if (res.ok) {
              const city = await res.json();
              const lat = city.latitude ?? city.lat;
              const lng = city.longitude ?? city.lng ?? city.lon;
              if (
                lat != null &&
                lng != null &&
                Number.isFinite(Number(lat)) &&
                Number.isFinite(Number(lng))
              ) {
                initialCenter = [Number(lng), Number(lat)];
                embeddedZoom = 10;
              } else {
                const iv = getInitialMapView({
                  name: city.name,
                  state: city.state,
                  country: city.country,
                });
                initialCenter = iv.center;
                embeddedZoom = iv.zoom;
              }
            }
          } catch {
            /* keep fallback */
          }
        }

        if (cancelled || mapInstanceRef.current) {
          return;
        }

        const map = new mapboxgl.Map({
          container,
          style:
            mapBasemapTheme === "dark"
              ? "mapbox://styles/mapbox/dark-v11"
              : "mapbox://styles/mapbox/light-v11",
          center: initialCenter,
          zoom: embeddedZoom,
          attributionControl: false,
          scrollZoom: false,
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
            addSavedPlaceOverlay(map);
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
        onError?.(
          `Failed to initialize map: ${err instanceof Error ? err.message : String(err)}`
        );
      }
    })();
    };

    startInit();

    return () => {
      cancelled = true;
      if (savedPlaceMarkerRef.current) {
        try { savedPlaceMarkerRef.current.remove(); } catch { /* ignore */ }
        savedPlaceMarkerRef.current = null;
      }
      if (mapInstanceRef.current) {
        try {
          mapInstanceRef.current.remove();
        } catch {
          // ignore cleanup errors
        }
        mapInstanceRef.current = null;
      }
    };
    // Remount when basemap theme changes so style and choropleth colors stay aligned
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapboxLoaded, mapBasemapTheme]);

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
  }, [
    selectedShapeLayer,
    hasAggregations,
    mapboxLoaded,
    mapData.location_data,
    points,
    effectiveAggregations,
    mapBasemapTheme,
    initialShapeLayers,
    shapeLayersFromConfig,
  ]);

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
          return;
        }
      } catch (e) {
        return;
      }
    }


    // Filter points by selected district.
    // Use data_field (the Socrata column the points actually carry) if it differs from
    // identifier_field (the GeoJSON property). Both come from the shape layer DB record.
    const filteredPoints = selectedDistrictId
      ? points.filter((p: any) => {
          if (!selectedShapeLayer) return true;
          const aggregation = effectiveAggregations[selectedShapeLayer];
          if (!aggregation) return true;
          const dataField = (aggregation as any).data_field?.trim();
          const idField = aggregation.identifier_field;
          const pointDistrictId = String(
            (dataField && p[dataField]) || p[idField] || ""
          );
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
      addPointsLayer(mapInstanceRef.current, validFilteredPoints);
    } else {
    }
  }, [showPoints, selectedDistrictId, points, selectedShapeLayer, effectiveAggregations, hasAggregations]);

  // Compute aggregations from points for a given shape layer
  // Uses metricDistrictField if available, falling back to identifierField and common district fields
  const computeAggregationForShapeLayer = (
    points: Array<{ lat: number; lon: number; [key: string]: any }>,
    identifierField: string
  ): Aggregation => {
    const aggregationMap = new Map<string, number>();
    
    
    points.forEach((point: any) => {
      // identifierField here is joinFieldForCompute = data_field || identifier_field,
      // both sourced from the shape layer DB record. No hardcoded names needed.
      const id = String(
        (metricDistrictField && point[metricDistrictField]) ||
        point[identifierField] ||
        ""
      );
      if (id && id !== "null" && id !== "undefined" && id !== "") {
        const current = aggregationMap.get(id) || 0;
        aggregationMap.set(id, current + 1);
      }
    });
    
    
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
      const findShapeLayerMeta = (id: string): ShapeLayer | undefined => {
        const sid = String(id);
        return (
          initialShapeLayers.find((sl) => String(sl.shape_layer_instance_id) === sid) ||
          shapeLayersFromConfig?.find((sl) => String(sl.shape_layer_instance_id) === sid)
        );
      };

      const aggSource = effectiveAggregations;

      // Try to find aggregation - keyed by shape_layer_instance_id as string
      let aggregation = aggSource[shapeLayerId] as Aggregation | undefined;
      if (!aggregation) {
        const shapeLayerIdNum = Number(shapeLayerId);
        if (!isNaN(shapeLayerIdNum)) {
          aggregation = aggSource[String(shapeLayerIdNum)] as Aggregation | undefined;
        }
      }

      const shapeMetaEarly = findShapeLayerMeta(shapeLayerId);
      const joinFieldForCompute =
        shapeMetaEarly?.data_field?.trim() || shapeMetaEarly?.identifier_field;

      // If aggregation doesn't exist for this shape layer, try to compute it from points or location_data
      if (!aggregation) {
        if (shapeMetaEarly && joinFieldForCompute) {
          if (points && points.length > 0) {
            aggregation = computeAggregationForShapeLayer(points, joinFieldForCompute);
          } else if (
            mapData.location_data &&
            Array.isArray(mapData.location_data) &&
            mapData.location_data.length > 0
          ) {
            const validLocationData = normalizePointData(mapData.location_data);
            if (validLocationData.length > 0) {
              aggregation = computeAggregationForShapeLayer(
                validLocationData,
                joinFieldForCompute
              );
            }
          }
        }
      }

      if (!aggregation) {
        console.warn(`[ProgressiveMapView] No aggregation available for shape layer ${shapeLayerId}`);
        console.warn(
          `[ProgressiveMapView] Points available: ${points?.length || 0}, location_data available: ${mapData.location_data?.length || 0}`
        );
        return;
      }

      const shapeLayer = findShapeLayerMeta(shapeLayerId);
      if (!shapeLayer) {
        console.warn(
          `[ProgressiveMapView] No shape layer metadata for id ${shapeLayerId} (initialShapeLayers=${initialShapeLayers.length})`
        );
        return;
      }

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

      // Create lookup map from aggregation rows (case-insensitive keys; never "NaN" for text ids)
      const districtDataMap = new Map<string | number, any>();

      const districtFieldCfg =
        typeof mapData.map_config?.district_field === "string"
          ? mapData.map_config.district_field.trim()
          : "";

      const addRowUnderKeys = (row: any, raw: unknown) => {
        const norm = normalizeChoroplethDistrictKey(raw);
        if (!norm) return;
        districtDataMap.set(norm, row);
        const n = Number(norm);
        if (!Number.isNaN(n) && Number.isFinite(n)) {
          const f = Math.floor(n);
          districtDataMap.set(n, row);
          districtDataMap.set(f, row);
          districtDataMap.set(`District ${f}`, row);
          districtDataMap.set(`district ${f}`, row);
        }
        const rawStr = String(raw).trim();
        if (rawStr && rawStr !== norm) districtDataMap.set(rawStr, row);
      };

      // The aggregation row key may differ from the shape layer's identifier_field.
      // Example: rows keyed by "analysis_neighborhood" (the Socrata field) while the
      // shape layer's GeoJSON identifier_field is "nhood". We must try data_field first
      // so those rows can be found even when identifier_field has no match.
      const aggDataField = aggregation.data_field?.trim();

      aggregation.rows.forEach((row: any) => {
        const rowObj = row as Record<string, unknown>;
        const cands: unknown[] = [];
        if (districtFieldCfg) {
          cands.push(
            rowObj[districtFieldCfg],
            getCaseInsensitiveProp(rowObj, districtFieldCfg)
          );
        }
        // Try data_field (the Socrata column used to key the aggregation rows) first,
        // then identifier_field (the GeoJSON property name from the shape layer DB record).
        // Both are sourced from the database — no hardcoded city/field names needed here.
        if (aggDataField && aggDataField !== identifierField) {
          cands.push(
            rowObj[aggDataField],
            getCaseInsensitiveProp(rowObj, aggDataField)
          );
        }
        cands.push(getCaseInsensitiveProp(rowObj, identifierField));
        for (const raw of cands) {
          if (raw == null || String(raw).trim() === "") continue;
          addRowUnderKeys(row, raw);
        }
      });


      const valueField = "value";
      const rowNumericValue = (item: any) => {
        const o = item as Record<string, unknown>;
        const v =
          getCaseInsensitiveProp(o, "value") ??
          getCaseInsensitiveProp(o, "count") ??
          o.value ??
          o.count ??
          0;
        return Number(v);
      };
      const values = aggregation.rows
        .map((item: any) => rowNumericValue(item))
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

      const choroRamp = getChoroplethBrandRamp(mapBasemapTheme);
      const CHORO_LOW = choroRamp.low;
      const CHORO_HIGH = choroRamp.high;

      
      // Get the shape layer's identifier field from the API (this is the field used in GeoJSON properties)
      const apiIdentifierField = shapeLayerData.instance.identifier_field;
      // Also get the shape_identifier_field from our stored shape layer config
      const shapeIdentifierField = shapeLayer.shape_identifier_field || apiIdentifierField;
      
      
      const lookupDistrictData = (raw: unknown) => {
        if (raw == null) return undefined;
        const norm = normalizeChoroplethDistrictKey(raw);
        if (norm) {
          let d = districtDataMap.get(norm);
          if (d) return d;
          const n = Number(norm);
          if (!Number.isNaN(n) && Number.isFinite(n)) {
            d =
              districtDataMap.get(n) ??
              districtDataMap.get(Math.floor(n)) ??
              districtDataMap.get(`District ${Math.floor(n)}`) ??
              districtDataMap.get(`district ${Math.floor(n)}`);
            if (d) return d;
          }
        }
        const s = String(raw).trim();
        return s ? districtDataMap.get(s) : undefined;
      };

      const features = geometryData.features.map((feature: any) => {
        const props = feature.properties || {};

        // Use the DB-stored identifier_field from the shape layer API as the definitive
        // GeoJSON property key. No hardcoded city-specific field names.
        const districtIdRaw =
          getCaseInsensitiveProp(props, apiIdentifierField) ??
          getCaseInsensitiveProp(props, shapeIdentifierField) ??
          getCaseInsensitiveProp(props, identifierField) ??
          props.name ??
          props.label ??
          "";

        const districtId = normalizeChoroplethDistrictKey(districtIdRaw);
        let districtData =
          lookupDistrictData(districtIdRaw) ?? lookupDistrictData(districtId);

        const value = districtData ? rowNumericValue(districtData) : null;
        
        if (!districtData && String(districtIdRaw).trim()) {
        }

        let color = choroRamp.noDataFill;
        if (value !== null && !isNaN(value) && isFinite(value)) {
          const normalized = clamp01((value - minValue) / (maxValue - minValue || 1));
          const [r, g, b] = blendRgb(CHORO_LOW, CHORO_HIGH, normalized);
          color = `rgb(${r}, ${g}, ${b})`;
        }

        const districtLabel =
          districtId || String(districtIdRaw).trim() || "";

        return {
          ...feature,
          properties: {
            ...feature.properties,
            ...(districtData || {}),
            // Must be last: aggregation rows often include unrelated fields (e.g. crime
            // "color") that would overwrite Mapbox fill-color if spread after these.
            district_id: districtLabel,
            value: value,
            color: color,
          },
        };
      });

      // Wait for style to load if not already loaded
      if (!mapInstance.isStyleLoaded()) {
        await new Promise<void>((resolve) => {
          mapInstance.once('load', () => {
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
          "line-color": mapBasemapTheme === "dark" ? "#ffffff" : "#000000",
          "line-width": 0.75,
          "line-opacity": mapBasemapTheme === "dark" ? 0.8 : 0.55,
        },
      }, beforeLayerId);

      // When preview/embed has no bounds or still uses the continental-US fallback center,
      // frame the map on district polygons so Austin (etc.) does not appear as Kansas.
      if (isContinentalUsFallbackView(mapData.bounds ?? undefined, mapData.center ?? undefined)) {
        const shapeBounds = getBoundsFromPolygonFeatures(features);
        if (shapeBounds) {
          try {
            mapInstance.fitBounds(shapeBounds, { padding: 50, maxZoom: 12, duration: 0 });
          } catch (e) {
            console.warn("[ProgressiveMapView] choropleth fitBounds failed:", e);
          }
        }
      }

      // Click handler for progressive display
      mapInstance.off("click", "choropleth-fill");
      mapInstance.on("click", "choropleth-fill", async (e: any) => {
        if (!e.features || e.features.length === 0) return;
        const feature = e.features[0];
        const districtId = feature.properties.district_id || "";
        
        if (!districtId) return;

        setSelectedDistrictId(districtId);

        if (points === null) {
          if (mapHash?.trim()) {
            await fetchPoints();
          } else {
            const normalized = normalizePointData(mapData.location_data || []);
            setPoints(normalized.length > 0 ? normalized : []);
          }
        }

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
        const districtId = props.district_id || "Unknown";
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
    const pointData = normalizePointData(mapData.location_data);
    if (pointData.length === 0) return;
    addPointsLayer(mapInstance, pointData);
  };

  const addSavedPlaceOverlay = (mapInstance: any) => {
    const overlay = (mapData.map_config as any)?.saved_place_overlay;
    if (!overlay || overlay.kind !== "saved_place_circle") return;

    const { circles_geojson, center_lat, center_lon, label } = overlay;
    if (!circles_geojson || center_lat == null || center_lon == null) return;

    // Boundary fill + dashed outline
    try {
      if (mapInstance.getLayer("saved-place-fill")) mapInstance.removeLayer("saved-place-fill");
      if (mapInstance.getLayer("saved-place-outline")) mapInstance.removeLayer("saved-place-outline");
      if (mapInstance.getSource("saved-place-area")) mapInstance.removeSource("saved-place-area");

      mapInstance.addSource("saved-place-area", { type: "geojson", data: circles_geojson });

      mapInstance.addLayer({
        id: "saved-place-fill",
        type: "fill",
        source: "saved-place-area",
        paint: { "fill-color": "#ad35fa", "fill-opacity": 0.08 },
      });

      mapInstance.addLayer({
        id: "saved-place-outline",
        type: "line",
        source: "saved-place-area",
        paint: { "line-color": "#ad35fa", "line-width": 2, "line-dasharray": [3, 2] },
      });
    } catch (err) {
      console.error("[ProgressiveMapView] Error adding saved place boundary:", err);
    }

    // Center pin with label
    try {
      if (savedPlaceMarkerRef.current) {
        savedPlaceMarkerRef.current.remove();
        savedPlaceMarkerRef.current = null;
      }

      const el = document.createElement("div");
      el.className = "saved-place-marker";
      el.innerHTML = `<div class="saved-place-marker__pin"></div><div class="saved-place-marker__label">${String(label || "My place")}</div>`;

      savedPlaceMarkerRef.current = new (window as any).mapboxgl.Marker({ element: el, anchor: "bottom" })
        .setLngLat([center_lon, center_lat])
        .addTo(mapInstance);
    } catch (err) {
      console.error("[ProgressiveMapView] Error adding saved place marker:", err);
    }
  };

  const itemNoun = (mapData.map_config?.item_noun as string) || "items";
  const itemNounCap = itemNoun.charAt(0).toUpperCase() + itemNoun.slice(1);

  const addPointsLayer = (mapInstance: any, pointData: Array<{ lat: number; lon: number; [key: string]: any }>) => {
    const aggregatedFeatures = buildAggregatedPointFeatures(
      pointData,
      mapData.map_config as Record<string, any> | undefined,
    );

    const geojsonData = {
      type: "FeatureCollection" as const,
      features: aggregatedFeatures,
    };

    // Helper function to actually add the layers
    const doAddPointsLayer = () => {
      try {
        // Remove existing points layer
        if (mapInstance.getLayer("points-layer")) {
          mapInstance.removeLayer("points-layer");
        }
        if (mapInstance.getSource("points-source")) {
          mapInstance.removeSource("points-source");
        }

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
        
      } catch (err) {
        console.error("[ProgressiveMapView] Error adding point layers:", err);
      }
    };

    // Check if style is loaded before adding layers
    if (mapInstance.isStyleLoaded()) {
      doAddPointsLayer();
    } else {
      mapInstance.once('load', doAddPointsLayer);
    }
  };

  // Add comparison period points as grey dots (rendered below current period points)
  const addComparisonPointsLayer = (mapInstance: any, pointData: Array<{ lat: number; lon: number; [key: string]: any }>) => {
    const aggregatedFeatures = buildAggregatedPointFeatures(
      pointData,
      mapData.map_config as Record<string, any> | undefined,
    );

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
      }
      return;
    }
    
    // Normalize comparison points to extract lat/lon from various formats (including GeoJSON)
    const validComparisonPoints = normalizePointData(comparisonLocationData);
    
    if (validComparisonPoints.length > 0) {
      addComparisonPointsLayer(mapInstanceRef.current, validComparisonPoints);
    } else {
    }
  }, [comparisonLocationData, mapboxLoaded, defaultView, hasAggregations]);

  // Legacy addPoints function - delegates to addPointsLayer
  const addPoints = (mapInstance: any) => {
    if (!mapData.location_data || !Array.isArray(mapData.location_data)) return;
    const pointData = normalizePointData(mapData.location_data);
    if (pointData.length === 0) return;
    addPointsLayer(mapInstance, pointData);
  };


  // Dots need coordinates. Preview/embed often has district rows only — no mapHash means no points API.
  const canShowDots = useMemo(() => {
    if (!mapData.location_data || !Array.isArray(mapData.location_data) || mapData.location_data.length === 0) {
      return false;
    }
    if (mapHash?.trim()) {
      return true;
    }
    return normalizePointData(mapData.location_data).length > 0;
  }, [mapData.location_data, mapHash]);
  const isShowingManyPoints = showPoints && locationDataCount > 1000;

  return (
    <div className="progressive-map-view" style={{ position: "relative" }}>
      <div className="map-container-wrapper" style={{ position: "relative" }}>
        {!lockedViewKey && (
          <MapLayerPanel
            availableShapeLayers={availableShapeLayers}
            availableViews={availableViews.length > 0 ? availableViews : undefined}
            selectedShapeLayer={selectedShapeLayer}
            loadingViewId={loadingLazyView && selectedShapeLayer ? selectedShapeLayer : null}
            reverseToggleArrowDirection
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
        )}

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

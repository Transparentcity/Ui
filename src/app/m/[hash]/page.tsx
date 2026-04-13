"use client";

import { useState, useEffect, useRef } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { useAuth0 } from "@auth0/auth0-react";
import { useTheme } from "@/contexts/ThemeContext";
import { getPublicCityDetail } from "@/lib/publicApiClient";
import Loader from "@/components/Loader";
// Icon mapping for different shape layer types
const getLayerIcon = (layerKey?: string, category?: string, displayName?: string): string => {
  const key = (layerKey || "").toLowerCase();
  const cat = (category || "").toLowerCase();
  const name = (displayName || "").toLowerCase();

  // District/ward icons
  if (key.includes("district") || key.includes("ward") || name.includes("district") || name.includes("ward")) {
    return "🗺️"; // Map icon for districts/wards
  }
  
  // Neighborhood icons
  if (key.includes("neighborhood") || name.includes("neighborhood")) {
    return "🏘️"; // Houses icon for neighborhoods
  }
  
  // Police district icons
  if (key.includes("police") || name.includes("police")) {
    return "🚔"; // Police car icon
  }
  
  // Census tract
  if (key.includes("census") || name.includes("census")) {
    return "📊"; // Chart icon
  }
  
  // Zip code
  if (key.includes("zip") || name.includes("zip")) {
    return "📮"; // Mailbox icon
  }
  
  // Default icon
  return "📍"; // Location pin
};
import "./styles.css";
import MapLayerPanel from "@/components/MapLayerPanel";
import {
  DELTA_MAP_NEUTRAL_DARK_HEX,
  getDeltaMapFillColor,
} from "@/lib/deltaMapColors";
import {
  getCaseInsensitiveProp,
  getChoroplethBrandRamp,
  getInitialMapView,
  normalizeChoroplethDistrictKey,
  normalizeGeoJsonLngLatPair,
} from "@/lib/mapUtils";

// Types for the map data
interface MapCenter {
  lat: number;
  lng: number;
  zoom: number;
}

interface MapDataPoint {
  lat: number;
  lon: number;
  [key: string]: any;
}

interface SavedMap {
  id: number;
  short_hash: string;
  title: string;
  description: string | null;
  map_type: string;
  location_data: MapDataPoint[];
  map_config: Record<string, any>;
  bounds: [[number, number], [number, number]] | null;
  center: MapCenter | null;
  city_id: number | null;
  city_name?: string | null;
  metric_id: number | null;
  is_public: boolean;
  view_count: number;
  created_at: string;
}

// Single palette for multi-layer map dots and layer panel swatches (keep in sync)
const MULTI_LAYER_COLORS = ["#2563eb", "#dc2626", "#16a34a", "#ca8a04", "#9333ea", "#0d9488", "#e11d48", "#0891b2"];

const CHOROPLETH_FILL_OPACITY = 0.7;
/** Slightly higher so delta fills read clearly against light Mapbox basemaps. */
const DELTA_CHOROPLETH_FILL_OPACITY = 0.88;

// Fetch public map data (no auth required).
// Use /api so Next.js rewrites to the backend in both dev and prod (avoids CORS,
// consistent behavior on direct load and in-app nav). Backend: GET /api/maps/public/:hash.
function getPublicMapUrl(hash: string): string {
  return `/api/maps/public/${hash}`;
}

async function getPublicMap(hash: string): Promise<SavedMap> {
  const url = getPublicMapUrl(hash);
  const response = await fetch(url);

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Map not found: ${response.status}`);
  }

  return response.json();
}

/**
 * Mapbox rejects addSource/addLayer until the style is loaded. Long async work
 * (e.g. fetching GeoJSON) often finishes after a style swap or during initial load.
 * Polls as well as listening for events — if style.load/load already fired before we
 * subscribed, listeners alone would never resolve.
 */
function waitForMapStyleLoaded(mapInstance: any): Promise<void> {
  return new Promise((resolve) => {
    if (!mapInstance || typeof mapInstance.isStyleLoaded !== "function") {
      resolve();
      return;
    }
    if (mapInstance.isStyleLoaded()) {
      resolve();
      return;
    }
    let settled = false;
    let pollId: ReturnType<typeof setInterval> | undefined;

    const cleanupListeners = () => {
      mapInstance.off("style.load", onMaybeReady);
      mapInstance.off("styledata", onMaybeReady);
      mapInstance.off("load", onMaybeReady);
    };

    const settleOk = () => {
      if (settled) return;
      if (!mapInstance.isStyleLoaded()) return;
      settled = true;
      if (pollId != null) window.clearInterval(pollId);
      window.clearTimeout(tid);
      cleanupListeners();
      resolve();
    };

    const onMaybeReady = () => settleOk();

    mapInstance.on("style.load", onMaybeReady);
    mapInstance.on("styledata", onMaybeReady);
    mapInstance.on("load", onMaybeReady);
    pollId = window.setInterval(() => settleOk(), 50);

    const tid = window.setTimeout(() => {
      if (settled) return;
      settled = true;
      if (pollId != null) window.clearInterval(pollId);
      cleanupListeners();
      console.warn(
        "[PublicMapPage] waitForMapStyleLoaded timed out; choropleth may fail"
      );
      resolve();
    }, 20000);
  });
}

function collectGeometryLngLats(
  geometry: { type?: string; coordinates?: any } | null | undefined,
  out: Array<[number, number]>
): void {
  if (!geometry || !geometry.type) return;
  const coords = geometry.coordinates;
  switch (geometry.type) {
    case "Point":
      if (Array.isArray(coords) && coords.length >= 2) {
        out.push([Number(coords[0]), Number(coords[1])]);
      }
      return;
    case "MultiPoint":
    case "LineString":
      if (Array.isArray(coords)) {
        coords.forEach((c: any) => {
          if (Array.isArray(c) && c.length >= 2) {
            out.push([Number(c[0]), Number(c[1])]);
          }
        });
      }
      return;
    case "MultiLineString":
    case "Polygon":
      if (Array.isArray(coords)) {
        coords.forEach((ring: any) => {
          if (Array.isArray(ring)) {
            ring.forEach((c: any) => {
              if (Array.isArray(c) && c.length >= 2) {
                out.push([Number(c[0]), Number(c[1])]);
              }
            });
          }
        });
      }
      return;
    case "MultiPolygon":
      if (Array.isArray(coords)) {
        coords.forEach((poly: any) => {
          if (Array.isArray(poly)) {
            poly.forEach((ring: any) => {
              if (Array.isArray(ring)) {
                ring.forEach((c: any) => {
                  if (Array.isArray(c) && c.length >= 2) {
                    out.push([Number(c[0]), Number(c[1])]);
                  }
                });
              }
            });
          }
        });
      }
      return;
    case "GeometryCollection":
      if (Array.isArray((geometry as any).geometries)) {
        (geometry as any).geometries.forEach((g: any) =>
          collectGeometryLngLats(g, out)
        );
      }
      return;
    default:
      return;
  }
}

function fitMapToGeoJsonFeatures(
  mapInstance: any,
  features: Array<{ geometry?: { type?: string; coordinates?: any } }>
): void {
  const mapboxgl = (window as any).mapboxgl;
  if (!mapInstance || !mapboxgl?.LngLatBounds || !Array.isArray(features)) return;

  const raw: Array<[number, number]> = [];
  features.forEach((feature) => collectGeometryLngLats(feature?.geometry, raw));
  const points: Array<[number, number]> = [];
  for (const [x, y] of raw) {
    const n = normalizeGeoJsonLngLatPair(x, y);
    if (n) points.push(n);
  }
  if (!points.length) return;

  try {
    const bounds = new mapboxgl.LngLatBounds(points[0], points[0]);
    points.slice(1).forEach((p) => bounds.extend(p));

    if (!bounds.isEmpty()) {
      mapInstance.fitBounds(bounds, {
        padding: 50,
        maxZoom: 12,
        duration: 0,
      });
    }
  } catch (err) {
    console.warn(
      "[PublicMapPage] fitMapToGeoJsonFeatures: could not fit bounds (invalid coordinates?)",
      err
    );
  }
}

/** Aggregation block stored under map_config.aggregations[shapeLayerInstanceId]. */
type ChoroplethAggBlock = {
  rows?: Record<string, unknown>[];
  identifier_field?: string;
  data_field?: string;
  display_name?: string;
};

const CHOROPLETH_ROW_META_KEYS = new Set([
  "count",
  "value",
  "delta",
  "delta_pct",
  "sample_data",
  "count_current",
  "count_comparison",
  "color",
  "objectid",
  "object_id",
  "fid",
  "globalid",
  "shape_length",
  "shape_area",
  "lat",
  "lon",
  "latitude",
  "longitude",
]);

function inferNumericDistrictKeyFromRow(row: Record<string, unknown>): string | null {
  const ordered = [
    "supervisor_district",
    "sup_dist_num",
    "council_district",
    "district_id",
  ];
  for (const k of ordered) {
    const v = getCaseInsensitiveProp(row, k);
    if (v != null && /^\d+$/.test(String(v).trim())) return k;
  }
  for (const key of Object.keys(row)) {
    if (CHOROPLETH_ROW_META_KEYS.has(key.toLowerCase()) || key.startsWith("_")) {
      continue;
    }
    const v = row[key];
    if (v != null && /^\d+$/.test(String(v).trim())) return key;
  }
  return null;
}

function inferDataDistrictFieldForChoropleth(
  mapData: SavedMap,
  aggregation: ChoroplethAggBlock | undefined
): string {
  const configured =
    typeof mapData.map_config?.district_field === "string"
      ? mapData.map_config.district_field.trim()
      : "";
  const r0 = aggregation?.rows?.[0] as Record<string, unknown> | undefined;
  if (configured && r0) {
    const v = getCaseInsensitiveProp(r0, configured);
    if (v != null && String(v).trim() !== "") {
      return configured;
    }
  }
  const inferred = r0 ? inferNumericDistrictKeyFromRow(r0) : null;
  if (inferred) return inferred;
  return configured || "supervisor_district";
}

/**
 * District column on aggregation rows (and point rollups) for joining to GeoJSON.
 * Prefer explicit aliases from the saved map: per-shape `data_field` in
 * `available_shape_layers`, then `aggregations[id].data_field` (set when the map
 * was generated — the true metric↔shape pairing). Only then fall back to
 * map_config.district_field / row-shape inference.
 */
function resolveChoroplethDataDistrictField(
  mapData: SavedMap,
  aggregation: ChoroplethAggBlock | undefined,
  shapeLayerInstanceId: string | number | null | undefined
): string {
  const r0 = aggregation?.rows?.[0] as Record<string, unknown> | undefined;
  const tryField = (field: string): boolean => {
    const t = field.trim();
    if (!t || !r0) return false;
    const v = getCaseInsensitiveProp(r0, t);
    return v != null && String(v).trim() !== "";
  };

  const layers = (mapData.map_config?.available_shape_layers || []) as Array<{
    shape_layer_instance_id?: number | string;
    data_field?: string;
  }>;
  const layerEntry =
    shapeLayerInstanceId != null && shapeLayerInstanceId !== ""
      ? layers.find(
          (sl) =>
            String(sl.shape_layer_instance_id) === String(shapeLayerInstanceId)
        )
      : undefined;
  const configDf =
    typeof layerEntry?.data_field === "string"
      ? layerEntry.data_field.trim()
      : "";

  const aggDf =
    typeof aggregation?.data_field === "string"
      ? aggregation.data_field.trim()
      : "";

  if (!r0) {
    if (configDf) return configDf;
    if (aggDf) return aggDf;
    return inferDataDistrictFieldForChoropleth(mapData, aggregation);
  }

  if (configDf && tryField(configDf)) return configDf;
  if (aggDf && tryField(aggDf)) return aggDf;
  return inferDataDistrictFieldForChoropleth(mapData, aggregation);
}

/** True if rows carry a district / ward field (including metric district_field and ArcGIS-style columns). */
function savedMapRowsHaveGeographicIds(
  mapData: SavedMap,
  locationData: MapDataPoint[] | undefined
): boolean {
  if (!locationData?.length) return false;
  const df =
    typeof mapData.map_config?.district_field === "string"
      ? mapData.map_config.district_field.trim()
      : "";
  return locationData.some((point: any) => {
    if (df) {
      const v =
        point[df] ??
        getCaseInsensitiveProp(point as Record<string, unknown>, df);
      if (v != null && String(v).trim() !== "") return true;
    }
    const keys = [
      "supervisor_district",
      "district",
      "district_id",
      "council_district",
      "ward",
      "precinct",
      "sup_dist_num",
    ];
    return keys.some(
      (k) => point[k] != null && String(point[k]).trim() !== ""
    );
  });
}

/**
 * Prefer supervisor / numeric district shape layers over police "district" name polygons
 * when map_config.district_field or aggregation rows use numeric IDs.
 */
function pickChoroplethShapeLayerInstanceId(
  map: SavedMap,
  aggregations: Record<string, ChoroplethAggBlock>
): string | null {
  const df =
    typeof map.map_config?.district_field === "string"
      ? map.map_config.district_field.trim()
      : "";
  const layers = (map.map_config?.available_shape_layers || []) as Array<{
    shape_layer_instance_id?: number | string;
    data_field?: string;
    identifier_field?: string;
  }>;

  if (df && layers.length) {
    const sl = layers.find(
      (x) => x.data_field === df || x.identifier_field === df
    );
    if (sl?.shape_layer_instance_id != null) {
      return String(sl.shape_layer_instance_id);
    }
  }

  const keys = Object.keys(aggregations || {});
  if (!keys.length) {
    const firstLayer = layers[0]?.shape_layer_instance_id;
    return firstLayer != null ? String(firstLayer) : null;
  }

  const score = (k: string): number => {
    const agg = aggregations[k];
    const r0 = agg?.rows?.[0] as Record<string, unknown> | undefined;
    if (!r0) return -999;
    if (df && r0[df] != null && /^\d+$/.test(String(r0[df]).trim())) return 100;
    if (
      r0.supervisor_district != null &&
      /^\d+$/.test(String(r0.supervisor_district).trim())
    ) {
      return 90;
    }
    if (r0.sup_dist_num != null && /^\d+$/.test(String(r0.sup_dist_num).trim())) {
      return 88;
    }
    const idf = agg?.identifier_field;
    if (idf && r0[idf] != null && /^\d+$/.test(String(r0[idf]).trim())) return 40;
    if (
      idf === "district" &&
      r0[idf] != null &&
      !/^\d+$/.test(String(r0[idf]).trim())
    ) {
      return -50;
    }
    return 0;
  };

  keys.sort((a, b) => score(b) - score(a));
  return keys[0];
}

function pickChoroplethAggregationKey(
  map: SavedMap,
  aggregations: Record<string, ChoroplethAggBlock>,
  preferredShapeLayerId?: string | null
): string | null {
  const keys = Object.keys(aggregations || {});
  if (!keys.length) return null;

  if (
    preferredShapeLayerId &&
    aggregations[String(preferredShapeLayerId)]?.rows?.length
  ) {
    return String(preferredShapeLayerId);
  }

  const configured =
    typeof map.map_config?.district_field === "string"
      ? map.map_config.district_field.trim()
      : "";

  const score = (k: string): number => {
    const agg = aggregations[k];
    const row = agg?.rows?.[0] as Record<string, unknown> | undefined;
    if (!row) return -999;
    if (
      configured &&
      row[configured] != null &&
      /^\d+$/.test(String(row[configured]).trim())
    ) {
      return 120;
    }
    if (
      agg?.data_field === configured ||
      agg?.identifier_field === configured
    ) {
      return 110;
    }
    if (
      row.supervisor_district != null &&
      /^\d+$/.test(String(row.supervisor_district).trim())
    ) {
      return 100;
    }
    if (
      row.sup_dist_num != null &&
      /^\d+$/.test(String(row.sup_dist_num).trim())
    ) {
      return 95;
    }
    if (
      agg?.identifier_field === "district" &&
      row.district != null &&
      !/^\d+$/.test(String(row.district).trim())
    ) {
      return -50;
    }
    return 0;
  };

  keys.sort((a, b) => score(b) - score(a));
  return keys[0];
}

export default function PublicMapPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const hash = params.hash as string;
  const isEmbedded = searchParams.get("embedded") === "true";
  const isThumbnail = searchParams.get("thumbnail") === "true";
  const { theme } = useTheme();
  const { loginWithRedirect, isAuthenticated } = useAuth0();
  
  const [map, setMap] = useState<SavedMap | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mapboxLoaded, setMapboxLoaded] = useState(false);
  const [showShareSheet, setShowShareSheet] = useState(false);
  const [dotsDistrictId, setDotsDistrictId] = useState<string | null>(null);
  const [legend, setLegend] = useState<{
    title: string;
    items: Array<{ label: string; color: string }>;
  } | null>(null);
  const [districtPanel, setDistrictPanel] = useState<{
    districtId: string;
    districtName?: string | null;
    count: number | null;
    canHideDots: boolean;
  } | null>(null);
  const [resolvedCityName, setResolvedCityName] = useState<string | null>(null);
  const [resolvedCityState, setResolvedCityState] = useState<string | null>(null);
  const [selectedShapeLayer, setSelectedShapeLayer] = useState<string | null>(null);
  const [showPoints, setShowPoints] = useState(false);
  /** For multi-layer maps: visibility per layer index (all true by default). */
  const [multiLayerVisibility, setMultiLayerVisibility] = useState<Record<number, boolean>>({});
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const dotsDistrictIdRef = useRef<string | null>(null);
  const multiLayerVisibilityRef = useRef<Record<number, boolean>>({});
  /** Avoid setStyle on mount — map ctor already applied this theme; redundant setStyle wipes custom layers. */
  const lastAppliedBasemapThemeRef = useRef<string | null>(null);
  /** Bumps on each choropleth load so stale async completions skip addSource after newer runs. */
  const choroplethLoadGenRef = useRef(0);

  useEffect(() => {
    dotsDistrictIdRef.current = dotsDistrictId;
  }, [dotsDistrictId]);
  useEffect(() => {
    multiLayerVisibilityRef.current = multiLayerVisibility;
  }, [multiLayerVisibility]);
  
  // Fetch map data
  useEffect(() => {
    if (hash) {
      getPublicMap(hash)
        .then(setMap)
        .catch(err => {
          console.error("Failed to load map:", err);
          setError(err.message || "Map not found or private");
        })
        .finally(() => setLoading(false));
    }
  }, [hash]);

  // Initialize view from backend default_view (points vs choropleth) so few-point maps show points, not analysis neighborhoods
  const lastAppliedMapRef = useRef<string | null>(null);
  useEffect(() => {
    if (!map) return;
    const mapKey = map.short_hash || String(map.id);
    if (lastAppliedMapRef.current === mapKey) return;
    lastAppliedMapRef.current = mapKey;
    const locationCount = map.location_data?.length ?? 0;
    const dv = map.map_config?.default_view as { type?: string; shape_layer_instance_id?: number } | undefined;
    // Choropleth and delta maps are never point maps — skip the low-count heuristic entirely.
    const isDistrictMap = map.map_type === "choropleth" || map.map_type === "delta";
    const preferPoints = !isDistrictMap && locationCount <= 100;
    if (!isDistrictMap && (dv?.type === "points" || preferPoints)) {
      setShowPoints(true);
      setSelectedShapeLayer(null);
    } else if (dv?.type === "choropleth" && dv.shape_layer_instance_id != null) {
      setShowPoints(false);
      setSelectedShapeLayer(String(dv.shape_layer_instance_id));
    }
  }, [map?.short_hash, map?.id, map?.map_config?.default_view, map?.location_data?.length]);

  // Initialize multi-layer visibility when map is multi_layer (all layers visible)
  useEffect(() => {
    if (!map || map.map_type !== "multi_layer") return;
    const layers = map.map_config?.layer_maps as any[] | undefined;
    if (!layers?.length) return;
    setMultiLayerVisibility((prev) => {
      const next = { ...prev };
      layers.forEach((_, i) => {
        if (next[i] === undefined) next[i] = true;
      });
      return next;
    });
  }, [map?.short_hash, map?.map_type, map?.map_config?.layer_maps]);

  // Sync multi-layer visibility toggles to map layer visibility
  useEffect(() => {
    if (!map || map.map_type !== "multi_layer" || !mapInstanceRef.current) return;
    const layers = map.map_config?.layer_maps as any[] | undefined;
    if (!layers?.length) return;
    const mapInstance = mapInstanceRef.current;
    layers.forEach((_, i) => {
      const layerId = `multi-layer-${i}`;
      if (mapInstance.getLayer(layerId)) {
        mapInstance.setLayoutProperty(
          layerId,
          "visibility",
          multiLayerVisibility[i] !== false ? "visible" : "none"
        );
      }
    });
  }, [map?.short_hash, map?.map_type, multiLayerVisibility]);

  // Resolve city name and state for the public map header (light city detail, no metrics list)
  useEffect(() => {
    if (!map?.city_id) {
      setResolvedCityName(null);
      setResolvedCityState(null);
      return;
    }
    getPublicCityDetail(map.city_id, { includeMetrics: false })
      .then((c) => {
        setResolvedCityName(map.city_name ?? c.name ?? null);
        const st = c.state?.trim();
        setResolvedCityState(st ? st : null);
      })
      .catch(() => {
        setResolvedCityName(map.city_name ?? null);
        setResolvedCityState(null);
      });
  }, [map?.city_id, map?.city_name]);
  
  // Load Mapbox script
  useEffect(() => {
    if (typeof window === "undefined") return;
    
    // Check if Mapbox is already loaded
    if ((window as any).mapboxgl) {
      // Mapbox already loaded - schedule state update to avoid setState in effect
      Promise.resolve().then(() => setMapboxLoaded(true));
      return;
    }
    
    // Load Mapbox CSS
    const cssLink = document.createElement("link");
    cssLink.rel = "stylesheet";
    cssLink.href = "https://api.mapbox.com/mapbox-gl-js/v3.0.0/mapbox-gl.css";
    document.head.appendChild(cssLink);
    
    // Load Mapbox JS
    const script = document.createElement("script");
    script.src = "https://api.mapbox.com/mapbox-gl-js/v3.0.0/mapbox-gl.js";
    script.async = true;
    script.onload = () => setMapboxLoaded(true);
    document.head.appendChild(script);
  }, []);

  const clearLegend = () => setLegend(null);

  // Total count and item_noun for caption (choropleth: sum of aggregation values; point: location_data.length; multi_layer: sum of layer counts)
  const getMapDisplayCount = (m: SavedMap | null): { count: number; itemNoun: string } | null => {
    if (!m) return null;
    const itemNoun = (m.map_config?.item_noun as string) || "items";
    const locRows = m.location_data;
    if (
      (m.map_type === "choropleth" || m.map_type === "delta") &&
      Array.isArray(locRows) &&
      locRows.length > 0
    ) {
      return {
        count: locRows.length,
        itemNoun: (m.map_config?.choropleth_area_noun as string) || "districts",
      };
    }
    if (m.map_type === "multi_layer") {
      const layerMaps = m.map_config?.layer_maps as Array<{ location_data?: any[] }> | undefined;
      if (Array.isArray(layerMaps) && layerMaps.length > 0) {
        const total = layerMaps.reduce((sum, layer) => sum + (layer.location_data?.length ?? 0), 0);
        if (total > 0) return { count: total, itemNoun: "points" };
      }
      return null;
    }
    const aggregations = m.map_config?.aggregations as Record<string, { rows?: Array<{ value?: number; count?: number }> }> | undefined;
    if (aggregations && typeof aggregations === "object") {
      for (const key of Object.keys(aggregations)) {
        const agg = aggregations[key];
        const rows = agg?.rows;
        if (Array.isArray(rows) && rows.length > 0) {
          const total = rows.reduce(
            (sum, row) => sum + (Number(row?.value ?? row?.count ?? 0) || 0),
            0
          );
          if (total > 0) return { count: total, itemNoun };
        }
      }
    }
    const loc = m.location_data;
    if (Array.isArray(loc) && loc.length > 0) return { count: loc.length, itemNoun };
    return null;
  };

  const setLegendFromSeries = (
    seriesField: string,
    seriesValues: any,
    seriesColors: any
  ) => {
    if (!seriesField || !seriesColors) return;
    const values: string[] = Array.isArray(seriesValues)
      ? seriesValues.map(String)
      : Object.keys(seriesColors).map(String);
    const items = values
      .filter((v) => !!seriesColors[v])
      .map((v) => ({ label: v, color: String(seriesColors[v]) }));
    if (items.length === 0) return;
    setLegend({ title: seriesField, items });
  };

  const removeDotsLayer = (mapInstance: any) => {
    if (mapInstance.getLayer("district-dots")) {
      mapInstance.removeLayer("district-dots");
    }
    if (mapInstance.getSource("district-dots")) {
      mapInstance.removeSource("district-dots");
    }
    // Restore choropleth styling (if present)
    if (mapInstance.getLayer("choropleth-fill")) {
      const baseOp =
        map?.map_type === "delta"
          ? DELTA_CHOROPLETH_FILL_OPACITY
          : CHOROPLETH_FILL_OPACITY;
      mapInstance.setPaintProperty("choropleth-fill", "fill-opacity", baseOp);
    }
    if (mapInstance.getLayer("choropleth-outline")) {
      mapInstance.setPaintProperty("choropleth-outline", "line-width", 1);
    }
  };

  const closeDistrictPanel = () => setDistrictPanel(null);

  const addDotsForDistrict = (mapInstance: any, mapData: SavedMap, districtId: string) => {
    const dotPoints = mapData.map_config?.dot_location_data;
    const districtField =
      mapData.map_config?.dot_district_field ||
      mapData.map_config?.district_field ||
      "district";

    if (!Array.isArray(dotPoints) || dotPoints.length === 0) return;

    const filtered = dotPoints.filter((p: any) => {
      const v = p?.[districtField] ?? p?.district ?? p?.district_id;
      return String(v) === String(districtId);
    });

    removeDotsLayer(mapInstance);

    // Filter for valid coordinates (handle both lat/lon and latitude/longitude)
    const validFilteredPoints = filtered.filter((point: any) => {
      const lat = point.lat ?? point.latitude;
      const lon = point.lon ?? point.longitude;
      return lat != null && lon != null && 
             !isNaN(Number(lat)) && !isNaN(Number(lon)) &&
             isFinite(Number(lat)) && isFinite(Number(lon));
    }).map((point: any) => ({
      ...point,
      lat: point.lat ?? point.latitude,
      lon: point.lon ?? point.longitude,
    }));
    
    const geojsonData = {
      type: "FeatureCollection" as const,
      features: validFilteredPoints.map((point: any, index: number) => ({
        type: "Feature" as const,
        geometry: {
          type: "Point" as const,
          coordinates: [point.lon, point.lat],
        },
        properties: {
          id: index,
          ...point,
        },
      })),
    };

    mapInstance.addSource("district-dots", {
      type: "geojson",
      data: geojsonData,
    });

    const seriesField = mapData.map_config?.dot_series_field;
    const seriesColors = mapData.map_config?.dot_series_colors;
    const seriesValues = mapData.map_config?.dot_series_values;

    // Build Mapbox 'match' expression for categorical coloring
    const colorExpr: any[] = ["case", ["==", 1, 1], "#ad35fa"];
    if (seriesField && seriesColors) {
      const matchExpr: any[] = ["match", ["to-string", ["get", seriesField]]];
      for (const [label, color] of Object.entries(seriesColors)) {
        matchExpr.push(String(label), String(color));
      }
      matchExpr.push("#ad35fa");
      colorExpr.splice(0, colorExpr.length, ...matchExpr);
      setLegendFromSeries(seriesField, seriesValues, seriesColors);
    } else {
      clearLegend();
    }

    mapInstance.addLayer({
      id: "district-dots",
      type: "circle",
      source: "district-dots",
      paint: {
        "circle-radius": 5,
        "circle-color": colorExpr,
        "circle-stroke-color": "#fff",
        "circle-stroke-width": 1,
        "circle-opacity": 0.85,
      },
    });

    // Dim selected district fill (if present) so dots stand out
    if (mapInstance.getLayer("choropleth-fill")) {
      const baseOp =
        mapData.map_type === "delta"
          ? DELTA_CHOROPLETH_FILL_OPACITY
          : CHOROPLETH_FILL_OPACITY;
      mapInstance.setPaintProperty("choropleth-fill", "fill-opacity", [
        "case",
        ["==", ["get", "district_id"], String(districtId)],
        0.05,
        baseOp,
      ]);
    }
    if (mapInstance.getLayer("choropleth-outline")) {
      mapInstance.setPaintProperty("choropleth-outline", "line-width", [
        "case",
        ["==", ["get", "district_id"], String(districtId)],
        3,
        1,
      ]);
    }

    // Point popup (use item_noun for count/value labels)
    const displayInfo = getMapDisplayCount(map);
    const itemNounLabel = displayInfo ? displayInfo.itemNoun.charAt(0).toUpperCase() + displayInfo.itemNoun.slice(1) : null;
    mapInstance.on("click", "district-dots", (e: any) => {
      if (!e.features || e.features.length === 0) return;
      const feature = e.features[0];
      const props = feature.properties;
      let content = "<div class='map-popup'>";
      for (const [key, value] of Object.entries(props)) {
        if (key !== "id" && key !== "lat" && key !== "lon" && value) {
          const label = itemNounLabel && (key === "count" || key === "value") ? itemNounLabel : key;
          content += `<p><strong>${label}:</strong> ${value}</p>`;
        }
      }
      content += "</div>";
      new (window as any).mapboxgl.Popup().setLngLat(e.lngLat).setHTML(content).addTo(mapInstance);
    });
  };
  
  // Get available shape layers from map config
  const [availableShapeLayers, setAvailableShapeLayers] = useState<any[]>(map?.map_config?.available_shape_layers || []);
  const aggregations = map?.map_config?.aggregations || {};
  
  // Discover shape layers that match fields in location_data
  useEffect(() => {
    if (!map || !map.city_id || !map.location_data || map.location_data.length === 0) {
      return;
    }
    
    // Get all unique field names from location_data
    const locationDataFields = new Set<string>();
    map.location_data.forEach((point: any) => {
      Object.keys(point).forEach(key => {
        if (key !== 'lat' && key !== 'lon' && key !== 'latitude' && key !== 'longitude') {
          locationDataFields.add(key);
        }
      });
    });

    // If we already have shape layers from map_config, use those
      if (map.map_config?.available_shape_layers && map.map_config.available_shape_layers.length > 0) {
      setAvailableShapeLayers(map.map_config.available_shape_layers);
      // Auto-select the default shape layer for choropleth/delta maps
      if (!selectedShapeLayer) {
        const defaultView = map.map_config?.default_view as { type?: string; shape_layer_instance_id?: number | string } | undefined;
        const isDistrictMap =
          map.map_type === "choropleth" || map.map_type === "delta";
        const preferPoints =
          !isDistrictMap &&
          (defaultView?.type === "points" || (map.location_data?.length ?? 0) <= 100);
        if (!preferPoints) {
          const agg = (map.map_config?.aggregations || {}) as Record<
            string,
            ChoroplethAggBlock
          >;
          const picked = pickChoroplethShapeLayerInstanceId(map, agg);
          const defaultLayerId =
            picked ||
            defaultView?.shape_layer_instance_id ||
            map.map_config.available_shape_layers[0]?.shape_layer_instance_id;
          if (defaultLayerId) {
            setSelectedShapeLayer(String(defaultLayerId));
          }
        }
      }
      return;
    }
    
    // Otherwise, fetch shape layers for the city and match them to location_data fields
    const discoverMatchingShapeLayers = async () => {
      try {
        // Common district field names that might be used in shape layers or location_data
        const commonDistrictFieldNames = ['supervisor_district', 'district', 'ward', 'sup_dist_num', 'district_id', 'council_district', 'nhood', 'neighborhood'];
        
        // First, fetch city structure to get district fields mapping
        let districtFields: string[] = [];
        try {
          const cityStructureResponse = await fetch(`/api/cities/${map.city_id}/structure`);
          if (cityStructureResponse.ok) {
            const cityStructure = await cityStructureResponse.json();
            // Try different possible locations for district_fields
            districtFields = cityStructure.district_fields || 
                            cityStructure.districtFields ||
                            (cityStructure.location_fields?.filter((f: any) => 
                              typeof f === 'string' ? f.includes('district') || f.includes('ward') : 
                              (f.fieldName?.includes('district') || f.fieldName?.includes('ward') || f.name?.includes('district') || f.name?.includes('ward'))
                            ).map((f: any) => typeof f === 'string' ? f : (f.fieldName || f.name))) ||
                            [];
          } else {
            const errorText = await cityStructureResponse.text();
            console.warn(`[PublicMapPage] Failed to fetch city structure: ${cityStructureResponse.status}`, errorText);
          }
        } catch (err) {
          console.warn(`[PublicMapPage] Failed to fetch city structure:`, err);
        }
        
        // Fallback: if district_fields is empty, check location_data for common district field names
        // Also include common aliases that might be used in shape layers
        if (districtFields.length === 0) {
          const foundDistrictFields = commonDistrictFieldNames.filter(field => 
            map.location_data.some((point: any) => 
              point[field] !== undefined && 
              point[field] !== null &&
              point[field] !== ""
            )
          );
          if (foundDistrictFields.length > 0) {
            districtFields = foundDistrictFields;
          }
        }
        
        // Also check if any shape layer identifier_fields are district-related, even if not in location_data
        // This helps match shape layers that use different field names (e.g., sup_dist_num vs supervisor_district)
        const hasAnyDistrictFieldInData = commonDistrictFieldNames.some(field =>
          map.location_data.some((point: any) => 
            point[field] !== undefined && 
            point[field] !== null &&
            point[field] !== ""
          )
        );
        const cityLayersResponse = await fetch(`/api/shape-layers/cities/${map.city_id}`);
        
        if (!cityLayersResponse.ok) {
          const errorText = await cityLayersResponse.text();
          console.warn(`[PublicMapPage] Failed to fetch city shape layers: ${cityLayersResponse.status}`, errorText);
          return;
        }
        
        const cityLayersData = await cityLayersResponse.json();
        const layers = Array.isArray(cityLayersData) ? cityLayersData : (cityLayersData.layers || cityLayersData.shape_layers || cityLayersData.data || []);
        // Get all unique field names from location_data
        const locationDataFields = new Set<string>();
        map.location_data.forEach((point: any) => {
          Object.keys(point).forEach(key => {
            if (key !== 'lat' && key !== 'lon' && key !== 'latitude' && key !== 'longitude') {
              locationDataFields.add(key);
            }
          });
        });

        // For each shape layer, check if we can get its identifier_field
        // and see if it matches any field in location_data OR any district field from city structure
        const matchingLayers: any[] = [];
        
        for (const layer of layers) {
          try {
            // Handle API response structure: {template: {...}, instance: {...}} or {template: {...}, instance: null}
            const instance = layer.instance || layer;
            const template = layer.template || {};
            
            // Get instance ID from various possible locations
            const instanceId = instance?.id || 
                              instance?.shape_layer_instance_id || 
                              layer.shape_layer_instance_id || 
                              layer.id || 
                              layer.instance_id;
            
            if (!instanceId) {
              continue;
            }
            
            // Get identifier_field from instance or template
            const identifierField = instance?.identifier_field || 
                                   template?.default_identifier_field ||
                                   layer.identifier_field ||
                                   layer.default_identifier_field;
            
            if (!identifierField) {
              continue;
            }
            // Check if identifier_field matches:
            // 1. Direct match in location_data fields
            // 2. Match in city structure district_fields (meaning it's a related district field)
            // 3. identifier_field is a known district-related field name AND location_data has any district field
            const hasDirectMatch = locationDataFields.has(identifierField);
            const isDistrictField = districtFields.includes(identifierField);
            const hasRelatedDistrictField = districtFields.some(df => locationDataFields.has(df));
            const isKnownDistrictFieldName = commonDistrictFieldNames.includes(identifierField);

            // Match if:
            // - Direct field match in location_data, OR
            // - identifier_field is in district_fields AND location_data has any district field, OR
            // - identifier_field is a known district field name AND location_data has any district field
            const matches = hasDirectMatch || 
                           (isDistrictField && hasRelatedDistrictField) ||
                           (isKnownDistrictFieldName && hasAnyDistrictFieldInData);
            
            if (matches) {
              // Find the actual field name in location_data to use for aggregation
              // Prefer direct match, otherwise use the first district field found in location_data
              const fieldToUse = hasDirectMatch 
                ? identifierField 
                : districtFields.find(df => locationDataFields.has(df)) || identifierField;
              matchingLayers.push({
                shape_layer_instance_id: instanceId,
                identifier_field: fieldToUse, // Use the field that exists in location_data
                display_name: template?.default_display_name || 
                             instance?.structure_type ||
                             layer.display_name || 
                             'Shape Layer',
                layer_key: template?.layer_key || layer.layer_key,
                category: template?.category || layer.category,
              });
            }
          } catch (err) {
            console.error(`[PublicMapPage] Error checking shape layer:`, err, layer);
          }
        }
        
        if (matchingLayers.length > 0) {
          setAvailableShapeLayers(matchingLayers);
          // Auto-select first matching layer only when default view is not points (so point maps stay as points)
          const defaultView = map?.map_config?.default_view as { type?: string } | undefined;
          const locationCount = map?.location_data?.length ?? 0;
          const isDistrictMap =
            map.map_type === "choropleth" || map.map_type === "delta";
          const preferPoints =
            !isDistrictMap &&
            (defaultView?.type === "points" || locationCount <= 100);
          if (!selectedShapeLayer && !preferPoints) {
            setSelectedShapeLayer(String(matchingLayers[0].shape_layer_instance_id));
          }
        } else {
        }
      } catch (err) {
        console.error(`[PublicMapPage] Error discovering shape layers:`, err);
      }
    };
    
    discoverMatchingShapeLayers();
  }, [map, selectedShapeLayer]);

  // Helper function to compute aggregations from points for a shape layer
  const computeAggregationForShapeLayer = (
    points: MapDataPoint[],
    identifierField: string
  ): Map<string, Record<string, number>> => {
    const aggregationMap = new Map<string, Record<string, number>>();
    
    points.forEach((point: any) => {
      const id = String(point[identifierField] || point.district || point.supervisor_district || "");
      if (id && id !== "null" && id !== "undefined") {
        const prev = aggregationMap.get(id) || { count: 0 };
        prev.count = (prev.count || 0) + 1;
        aggregationMap.set(id, prev);
      }
    });
    
    return aggregationMap;
  };

  // Helper function to load choropleth map with district shapes
  const loadChoroplethMap = async (mapInstance: any, mapData: SavedMap, shapeLayerId?: string | null) => {
    try {
      // Validate mapInstance
      if (!mapInstance || typeof mapInstance.getLayer !== 'function') {
        console.error("[PublicMapPage] Invalid mapInstance provided to loadChoroplethMap");
        return;
      }

      choroplethLoadGenRef.current += 1;
      const loadGen = choroplethLoadGenRef.current;

      // Layer panel passes "" when clearing shape selection (show dots). Empty string is falsy
      // and must not fall through to map_config — otherwise we reload choropleth and race the map.
      if (shapeLayerId === "") {
        try {
          if (mapInstance.getLayer?.("choropleth-fill")) {
            mapInstance.removeLayer("choropleth-fill");
          }
          if (mapInstance.getLayer?.("choropleth-outline")) {
            mapInstance.removeLayer("choropleth-outline");
          }
          if (mapInstance.getSource?.("choropleth-shapes")) {
            mapInstance.removeSource("choropleth-shapes");
          }
        } catch (err) {
          console.warn("[PublicMapPage] Error removing choropleth for cleared selection:", err);
        }
        return;
      }
      
      const aggMap = (mapData.map_config?.aggregations || {}) as Record<
        string,
        ChoroplethAggBlock
      >;
      const configuredDf =
        typeof mapData.map_config?.district_field === "string"
          ? mapData.map_config.district_field.trim()
          : "";

      // Use provided shapeLayerId or resolve it from map_config (checked in priority order)
      let targetShapeLayerId: string | number | null | undefined =
        shapeLayerId ||
        mapData.map_config?.shape_layer_instance_id ||
        mapData.map_config?.default_view?.shape_layer_instance_id ||
        mapData.map_config?.available_shape_layers?.[0]?.shape_layer_instance_id ||
        (Object.keys(aggMap).length ? Object.keys(aggMap)[0] : null);

      if (!targetShapeLayerId && availableShapeLayers.length > 0) {
        targetShapeLayerId = availableShapeLayers[0].shape_layer_instance_id;
      }

      const preferredId = pickChoroplethShapeLayerInstanceId(mapData, aggMap);
      if (preferredId && String(targetShapeLayerId) !== String(preferredId)) {
        console.warn(
          `[PublicMapPage] Switching shape layer ${targetShapeLayerId} -> ${preferredId} to match district field ${configuredDf || "(inferred)"}`
        );
        targetShapeLayerId = preferredId;
        setSelectedShapeLayer(String(preferredId));
      }

      if (!targetShapeLayerId) {
        console.error("[PublicMapPage] No shape_layer_instance_id available");
        return;
      }
      // Find the shape layer from discovered layers
      let shapeLayer = availableShapeLayers.find(
        (sl: any) => String(sl.shape_layer_instance_id) === String(targetShapeLayerId)
      );
      
      // If not found in discovered layers, try to get info from the API
      if (!shapeLayer) {
        try {
          const response = await fetch(`/api/shape-layers/public/instances/${targetShapeLayerId}?include_geometry=false`);
          if (response.ok) {
            const data = await response.json();
            shapeLayer = {
              shape_layer_instance_id: data.instance.id,
              identifier_field: data.instance.identifier_field || data.template?.default_identifier_field,
              display_name: data.template?.default_display_name || data.instance.structure_type || 'Shape Layer',
              layer_key: data.template?.layer_key,
              category: data.template?.category,
            };
          }
        } catch (err) {
          console.error(`[PublicMapPage] Failed to fetch shape layer from API:`, err);
        }
      }
      
      if (!shapeLayer) {
        console.error(`[PublicMapPage] Shape layer ${targetShapeLayerId} not found`);
        return;
      }

      if (!mapData.city_id) {
        console.error("[PublicMapPage] No city_id in map data");
        return;
      }

      // Use Next.js rewrite path (works in both dev and prod via next.config.ts)
      // Backend: GET /api/shape-layers/public/instances/:instance_id
      const shapeUrl = `/api/shape-layers/public/instances/${targetShapeLayerId}?include_geometry=true`;
      const response = await fetch(shapeUrl);
      
      if (!response.ok) {
        console.error("Failed to fetch shape layer instance:", response.statusText);
        const errorText = await response.text();
        console.error("Error details:", errorText);
        return;
      }
      
      const shapeLayerData = await response.json();
      if (!shapeLayerData?.instance?.geometry_data) {
        console.error("Shape layer instance has no geometry data. Response:", shapeLayerData);
        return;
      }
      
      const geometryData = shapeLayerData.instance.geometry_data;

      const shapeGeoPropertyField =
        shapeLayerData.instance.identifier_field ||
        shapeLayer.identifier_field ||
        "district";

      const aggregationKey =
        pickChoroplethAggregationKey(
          mapData,
          aggMap,
          String(targetShapeLayerId)
        ) || String(targetShapeLayerId);
      const aggregation =
        aggregations[aggregationKey] || aggregations[Number(aggregationKey)];

      const dataDistrictField = resolveChoroplethDataDistrictField(
        mapData,
        aggregation,
        targetShapeLayerId
      );
      if (String(aggregationKey) !== String(targetShapeLayerId)) {
      }
      // Build district -> value map
      const districtDataMap = new Map<string, Record<string, number>>();
      
      if (aggregation && aggregation.rows) {
        // Use pre-computed aggregation
        aggregation.rows.forEach((row: any) => {
          const rowRec = row as Record<string, unknown>;
          const rawDistrict =
            row[dataDistrictField] ??
            getCaseInsensitiveProp(rowRec, dataDistrictField) ??
            (aggregation.identifier_field
              ? row[aggregation.identifier_field] ??
                getCaseInsensitiveProp(rowRec, String(aggregation.identifier_field))
              : undefined) ??
            row.supervisor_district ??
            row.sup_dist_num ??
            row.district ??
            "";
          const normalizedId = normalizeChoroplethDistrictKey(rawDistrict);
          if (!normalizedId) return;
          const entry = {
            count: row.count ?? row.value ?? 0,
            value: row.value ?? row.count ?? 0,
            // Delta-specific fields (present only for delta maps)
            delta: row.delta ?? null,
            delta_pct: row.delta_pct ?? null,
            count_current: row.count_current ?? null,
            count_comparison: row.count_comparison ?? null,
          };
          districtDataMap.set(normalizedId, entry);
          const rawStr = String(rawDistrict).trim();
          if (rawStr && rawStr !== normalizedId) {
            districtDataMap.set(rawStr, entry);
          }
          const districtIdNum = Number(normalizedId);
          if (!isNaN(districtIdNum) && isFinite(districtIdNum)) {
            districtDataMap.set(String(districtIdNum), entry);
            districtDataMap.set(`District ${districtIdNum}`, entry);
            districtDataMap.set(`district ${districtIdNum}`, entry);
          }
        });
      } else {
        // Compute aggregation from location_data
        const valueField = mapData.map_config.value_field || "count";
        const isCountAgg = valueField === "count";

        mapData.location_data.forEach((item: any) => {
          const itemRec = item as Record<string, unknown>;
          const rawDistrict =
            item[dataDistrictField] ??
            getCaseInsensitiveProp(itemRec, dataDistrictField) ??
            item.supervisor_district ??
            item.sup_dist_num ??
            item[shapeGeoPropertyField] ??
            getCaseInsensitiveProp(itemRec, String(shapeGeoPropertyField)) ??
            item.district ??
            "";
          const normalizedId = normalizeChoroplethDistrictKey(rawDistrict);
          if (!normalizedId) return;

          const prev = districtDataMap.get(normalizedId) || { count: 0, value: 0 };
          if (isCountAgg) {
            prev.count = (prev.count || 0) + 1;
            prev.value = prev.count;
          } else {
            prev.value = (prev.value || 0) + (Number(item[valueField]) || 0);
            prev.count = prev.value;
          }
          districtDataMap.set(normalizedId, prev);
          const rawStr = String(rawDistrict).trim();
          if (rawStr && rawStr !== normalizedId) {
            districtDataMap.set(rawStr, prev);
          }
          const districtIdNum = Number(normalizedId);
          if (!isNaN(districtIdNum) && isFinite(districtIdNum)) {
            districtDataMap.set(String(districtIdNum), prev);
          }
        });
      }// ── Determine if this is a delta (red/green) or regular choropleth ──────────
      const isDeltaMap =
        mapData.map_type === "delta" ||
        mapData.map_config?.delta_palette === "red_green";
      const greenDirection: "up" | "down" =
        (mapData.map_config?.greendirection as "up" | "down") ?? "down";

      // ── Extract per-district color value ──────────────────────────────────────
      // For delta maps the colour is driven by delta_pct (same field as DeltaMapView).
      // For regular choropleths it's the raw count/value.
      const colorValues = Array.from(districtDataMap.entries()).map(
        ([, item]: [string, any]) =>
          isDeltaMap
            ? Number(item.delta_pct ?? item.delta ?? item.value ?? 0)
            : Number(item.value || item.count || 0)
      ).filter((v: number) => !isNaN(v) && isFinite(v));

      const minValue = colorValues.length > 0 ? Math.min(...colorValues) : 0;
      const maxValue = colorValues.length > 0 ? Math.max(...colorValues) : 1;

      console.log(`[PublicMapPage] ${isDeltaMap ? "Delta" : "Choropleth"} value range: ${minValue} to ${maxValue}`);

      const basemapTheme = theme === "dark" ? "dark" : "light";
      const choroRamp = getChoroplethBrandRamp(basemapTheme);
      // ── Color helpers ─────────────────────────────────────────────────────────
      const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
      const clamp01 = (t: number) => Math.max(0, Math.min(1, t));
      const blendRgb = (
        from: [number, number, number],
        to: [number, number, number],
        t: number
      ) => {
        const tt = clamp01(t);
        return [
          Math.round(lerp(from[0], to[0], tt)),
          Math.round(lerp(from[1], to[1], tt)),
          Math.round(lerp(from[2], to[2], tt)),
        ] as [number, number, number];
      };

      const CHORO_LOW = choroRamp.low;
      const CHORO_HIGH = choroRamp.high;

      console.log(`[PublicMapPage] Processing ${geometryData.features.length} shape features`);
      console.log(`[PublicMapPage] Sample feature properties:`, geometryData.features[0]?.properties);
      // ── Merge district data with shape features ───────────────────────────────
      const features = geometryData.features.map((feature: any) => {
        const props = feature.properties || {};
        const propsRec = props as Record<string, unknown>;
        // Join polygons using the shape layer's identifier_field first (e.g. district_number).
        // Data rows use map_config / aggregation keys (e.g. council_district). GeoJSON often
        // repeats the metric field name with wrong/empty values; prefer the canonical shape key.
        const districtIdRaw =
          (shapeGeoPropertyField &&
            getCaseInsensitiveProp(propsRec, String(shapeGeoPropertyField))) ??
          (dataDistrictField && getCaseInsensitiveProp(propsRec, dataDistrictField)) ??
          props.supervisor_district ??
          props.sup_dist_num ??
          props.district_id ??
          props.district ??
          props.name ??
          props.label ??
          "";

        const districtId = normalizeChoroplethDistrictKey(districtIdRaw);
        const districtIdNum = Number(districtId);

        // Try multiple lookup strategies
        let districtData = districtDataMap.get(districtId);
        if (!districtData && districtIdRaw != null && districtIdRaw !== "") {
          districtData = districtDataMap.get(String(districtIdRaw).trim());
        }
        if (!districtData && !isNaN(districtIdNum) && isFinite(districtIdNum)) {
          districtData =
            districtDataMap.get(String(districtIdNum)) ||
            districtDataMap.get(String(Math.floor(districtIdNum)));
        }

        const value = districtData
          ? Number(districtData.value || districtData.count || 0)
          : null;

        if (!districtData && districtId) {}

        // ── Compute fill colour ────────────────────────────────────────────────
        let color = choroRamp.noDataFill;
        if (isDeltaMap) {
          const changePct = districtData
            ? Number(districtData.delta_pct ?? districtData.delta ?? districtData.value ?? null)
            : null;
          color = getDeltaMapFillColor(
            Number.isFinite(changePct as number) ? (changePct as number) : null,
            greenDirection,
            basemapTheme
          );
        } else if (value !== null && !isNaN(value)) {
          const normalized = clamp01((value - minValue) / (maxValue - minValue || 1));
          const [r, g, b] = blendRgb(CHORO_LOW, CHORO_HIGH, normalized);
          color = `rgb(${r}, ${g}, ${b})`;
        }

        return {
          ...feature,
          properties: {
            ...feature.properties,
            district_id: districtId,
            value,
            color,
            ...(districtData ?? {}),
          },
        };
      });
      await waitForMapStyleLoaded(mapInstance);
      if (loadGen !== choroplethLoadGenRef.current) {
        return;
      }
      if (!mapInstance || typeof mapInstance.addSource !== "function") {
        return;
      }
      // After async fetch, style may still be transitioning (e.g. concurrent setStyle); poll briefly.
      const styleWaitDeadline = Date.now() + 10000;
      while (
        typeof mapInstance.isStyleLoaded === "function" &&
        !mapInstance.isStyleLoaded() &&
        Date.now() < styleWaitDeadline
      ) {
        await new Promise((r) => window.setTimeout(r, 50));
      }
      if (
        typeof mapInstance.isStyleLoaded === "function" &&
        !mapInstance.isStyleLoaded()
      ) {
        console.warn(
          "[PublicMapPage] Style not loaded after wait; skipping choropleth addSource"
        );
        return;
      }

      if (loadGen !== choroplethLoadGenRef.current) {
        return;
      }

      // Remove existing layers if they exist
      try {
        if (mapInstance.getLayer && mapInstance.getLayer("choropleth-fill")) {
          mapInstance.removeLayer("choropleth-fill");
        }
        if (mapInstance.getLayer && mapInstance.getLayer("choropleth-outline")) {
          mapInstance.removeLayer("choropleth-outline");
        }
        if (mapInstance.getSource && mapInstance.getSource("choropleth-shapes")) {
          mapInstance.removeSource("choropleth-shapes");
        }
      } catch (err) {
        console.warn("[PublicMapPage] Error removing existing choropleth layers:", err);
        // Continue anyway - layers might not exist yet
      }
      
      // Add choropleth source and layer
      try {
        mapInstance.addSource("choropleth-shapes", {
          type: "geojson",
          data: {
            type: "FeatureCollection",
            features: features,
          },
        });
        mapInstance.addLayer({
          id: "choropleth-fill",
          type: "fill",
          source: "choropleth-shapes",
          paint: {
            "fill-color": ["get", "color"],
            "fill-opacity": isDeltaMap
              ? DELTA_CHOROPLETH_FILL_OPACITY
              : CHOROPLETH_FILL_OPACITY,
          },
        });
        // Use theme-aware outline color
        const outlineColor = theme === "dark" ? "#ffffff" : "#000000";
        mapInstance.addLayer({
          id: "choropleth-outline",
          type: "line",
          source: "choropleth-shapes",
          paint: {
            "line-color": outlineColor,
            "line-width": 1,
            "line-opacity": theme === "dark" ? 0.8 : 0.6,
          },
        });
        // For district maps, prefer the selected shape layer's geometry bounds over any
        // saved point bounds so the map opens framed around the actual polygons.
        fitMapToGeoJsonFeatures(mapInstance, features);

        // ── Legend ─────────────────────────────────────────────────────────────
        if (isDeltaMap) {
          const goodColor = greenDirection === "down" ? "#22c55e" : "#ef4444";
          const badColor  = greenDirection === "down" ? "#ef4444" : "#22c55e";
          const goodLabel = greenDirection === "down" ? "Decreased (better)" : "Increased (better)";
          const badLabel  = greenDirection === "down" ? "Increased (worse)"  : "Decreased (worse)";
          setLegend({
            title: "Change vs prior period",
            items: [
              { label: goodLabel, color: goodColor },
              {
                label: "No change",
                color:
                  basemapTheme === "dark"
                    ? DELTA_MAP_NEUTRAL_DARK_HEX
                    : "#f5f5f5",
              },
              { label: badLabel, color: badColor },
            ],
          });
        } else {
          setLegend({
            title: "Count",
            items: [
              { label: "Low",  color: `rgb(${CHORO_LOW.join(",")})` },
              { label: "High", color: `rgb(${CHORO_HIGH.join(",")})` },
            ],
          });
        }

        // Add popup on click
        mapInstance.on("click", "choropleth-fill", (e: any) => {
          if (!e.features || e.features.length === 0) return;

          const feature = e.features[0];
          const props = feature.properties;
          const districtId = String(props.district_id || "");
          const canToggleDots = !!(mapData.map_config?.dot_location_data && districtId);

          if (isDeltaMap) {
            // Delta map: show a styled popup directly (no side-panel)
            const formatNum = (v: any) =>
              v != null && !isNaN(Number(v))
                ? Number(v).toLocaleString(undefined, { maximumFractionDigits: 0 })
                : "—";
            const formatPct = (v: any) => {
              if (v == null || isNaN(Number(v))) return "—";
              const n = Number(v);
              const sign = n > 0 ? "+" : "";
              return `${sign}${Math.round(n)}%`;
            };
            const changePct = props.delta_pct ?? props.delta ?? null;
            const isIncrease = Number(changePct) > 5;
            const isDecrease = Number(changePct) < -5;
            const changeColor =
              isIncrease
                ? greenDirection === "down" ? "#ef4444" : "#22c55e"
                : isDecrease
                ? greenDirection === "down" ? "#22c55e" : "#ef4444"
                : "#666";

            const districtLabel = districtId
              ? `District ${districtId}`
              : String(props.name || props.label || "District");

            new (window as any).mapboxgl.Popup({ closeButton: true, closeOnClick: true })
              .setLngLat(e.lngLat)
              .setHTML(
                `<div style="font-family:'IBM Plex Sans',sans-serif;font-size:13px;min-width:160px">
                  <div style="font-weight:600;margin-bottom:6px">${districtLabel}</div>
                  <div style="color:#666">Last period: ${formatNum(props.count_comparison)}</div>
                  <div style="color:#666">This period: ${formatNum(props.count_current ?? props.count)}</div>
                  <div style="color:${changeColor};font-weight:600;margin-top:4px">
                    Change: ${formatPct(changePct)}
                    ${props.delta != null ? `(${Number(props.delta) >= 0 ? "+" : ""}${formatNum(props.delta)})` : ""}
                  </div>
                </div>`
              )
              .addTo(mapInstance);
          } else {
            setDistrictPanel({
              districtId: districtId || "District",
              districtName:
                String(
                  props.name ||
                    props.district_name ||
                    props.label ||
                    props.neighborhood ||
                    props.area_name ||
                    ""
                ) || null,
              count:
                props.count !== undefined
                  ? Number(props.count)
                  : props.value !== undefined
                    ? Number(props.value)
                    : null,
              canHideDots: canToggleDots,
            });

            if (canToggleDots) {
              addDotsForDistrict(mapInstance, mapData, districtId);
              setDotsDistrictId(districtId);
            }
          }
        });
        
        // Change cursor on hover
        mapInstance.on("mouseenter", "choropleth-fill", () => {
          mapInstance.getCanvas().style.cursor = "pointer";
        });
        mapInstance.on("mouseleave", "choropleth-fill", () => {
          mapInstance.getCanvas().style.cursor = "";
        });
        
      } catch (error) {
        console.error("Error adding choropleth layers:", error);
      }
    } catch (error) {
      console.error("Error loading choropleth map:", error);
    }
  };
  
  // Initialize map when both data and Mapbox are ready
  useEffect(() => {
    if (!map || !mapboxLoaded || !mapContainerRef.current) return;
    if (mapInstanceRef.current) return; // Already initialized

    const mapboxgl = (window as any).mapboxgl;
    const mapboxToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;

    if (!mapboxToken) {
      setError("Mapbox token not configured");
      return;
    }

    mapboxgl.accessToken = mapboxToken;

    let cancelled = false;

    (async () => {
      // Calculate center and zoom
      let center: [number, number];
      let zoom: number;
      if (map.center) {
        center = [map.center.lng, map.center.lat];
        zoom = map.center.zoom ?? 11;
      } else if (map.bounds) {
        center = [
          (map.bounds[0][0] + map.bounds[1][0]) / 2,
          (map.bounds[0][1] + map.bounds[1][1]) / 2,
        ];
        zoom = 11;
      } else {
        const pts =
          map.location_data?.filter(
            (p: any) =>
              (p.lat != null || p.latitude != null) &&
              (p.lon != null || p.lng != null || p.longitude != null) &&
              isFinite(Number(p.lat ?? p.latitude)) &&
              isFinite(Number(p.lon ?? p.lng ?? p.longitude))
          ) ?? [];
        if (pts.length > 0) {
          const avgLat =
            pts.reduce(
              (s: number, p: any) => s + Number(p.lat ?? p.latitude),
              0
            ) / pts.length;
          const avgLon =
            pts.reduce(
              (s: number, p: any) => s + Number(p.lon ?? p.lng ?? p.longitude),
              0
            ) / pts.length;
          center = [avgLon, avgLat];
          zoom = 11;
        } else {
          center = [0, 20];
          zoom = 11;
        }
      }

      const isDistrictMap =
        map.map_type === "choropleth" || map.map_type === "delta";
      const needsCityCenter =
        map.city_id &&
        isDistrictMap &&
        !map.center &&
        !map.bounds &&
        ((center[0] === 0 && center[1] === 20) ||
          !map.location_data?.some(
            (p: any) =>
              (p.lat != null || p.latitude != null) &&
              (p.lon != null || p.lng != null || p.longitude != null)
          ));

      if (needsCityCenter) {
        try {
          const res = await fetch(
            `/api/public/cities/${map.city_id}?include_metrics=false`
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
              center = [Number(lng), Number(lat)];
              zoom = 10;
            } else {
              const iv = getInitialMapView({
                name: city.name,
                state: city.state,
                country: city.country,
              });
              center = iv.center;
              zoom = iv.zoom;
            }
          }
        } catch {
          /* keep prior center */
        }
      }

      if (cancelled || !mapContainerRef.current || mapInstanceRef.current) return;

      // Use dark or light map style based on theme
      const mapStyle =
        theme === "dark"
          ? "mapbox://styles/mapbox/dark-v11"
          : "mapbox://styles/mapbox/light-v11";

      const mapInstance = new mapboxgl.Map({
        container: mapContainerRef.current,
        style: mapStyle,
        center: center,
        zoom: zoom,
      });

      mapInstanceRef.current = mapInstance;
      lastAppliedBasemapThemeRef.current = theme;

      mapInstance.on("load", async () => {
      const layerMaps = map.map_config?.layer_maps as Array<{ title?: string; location_data?: any[]; map_type?: string }> | undefined;
      const isMultiLayer = map.map_type === "multi_layer" && layerMaps && layerMaps.length > 0;
      if (!isMultiLayer && (!map.location_data || map.location_data.length === 0)) {
        return;
      }

      const locationDataCount = map.location_data?.length || 0;
      const hasAggregations = !!(map.map_config?.aggregations && Object.keys(map.map_config.aggregations).length > 0);
      const hasAvailableShapeLayers = !!(map.map_config?.available_shape_layers && map.map_config.available_shape_layers.length > 0);
      
      // For point maps, we can still render choropleth if we have:
      // 1. City ID (to fetch shape layers)
      // 2. Location data with geographic identifiers (supervisor_district, etc.)
      // 3. At least some data points
      const hasGeographicIdentifiers = savedMapRowsHaveGeographicIds(
        map,
        map.location_data
      );
      
      // Use choropleth if:
      // 1. Map type is choropleth OR we have aggregations OR discovered shape layers OR (point map with geographic identifiers)
      // 2. We have discovered shape layers or aggregations or can discover them
      // 3. We have city_id
      // 4. We have enough data points (or aggregations exist)
      const hasDiscoveredShapeLayers = availableShapeLayers.length > 0;
      const hasShapeLayerInConfig = !!map.map_config?.shape_layer_instance_id;
      const canDiscoverShapeLayers = map.city_id && hasGeographicIdentifiers;
      const defaultView = map.map_config?.default_view as { type?: string } | undefined;
      // Choropleth and delta maps are NEVER point maps, regardless of how few rows are stored
      // (delta maps only have 1 row per district, so locationDataCount is always small).
      const isExplicitDistrictMap = map.map_type === "choropleth" || map.map_type === "delta";
      // Prefer points when backend says so or when very few points (so dots are visible),
      // but never for explicit choropleth/delta maps.
      const defaultIsPoints =
        !isExplicitDistrictMap &&
        (defaultView?.type === "points" || locationDataCount <= 100);
      /** Layer panel selection must show choropleth even when default_view is points (map remount uses this path). */
      const choroplethExplicitlyChosen = !!selectedShapeLayer;

      // Determine if we should use choropleth - respect backend default_view so few-point maps show points.
      // Also respect an explicit points toggle so turning dots back on does not get auto-undone.
      const pointsViewSelected = showPoints && !selectedShapeLayer;
      // If backend says default is points (e.g. small dataset), don't default to choropleth
      const definitelyUseChoropleth =
        (!defaultIsPoints || choroplethExplicitlyChosen) &&
        (map.map_type === "choropleth" ||
          map.map_type === "delta" ||
          hasAggregations ||
          hasDiscoveredShapeLayers ||
          hasShapeLayerInConfig);
      const mightUseChoropleth =
        (!defaultIsPoints || choroplethExplicitlyChosen) &&
        canDiscoverShapeLayers &&
        map.map_type === "point" &&
        hasGeographicIdentifiers;
      // Only use choropleth if we definitely should, OR if we might and shape layers are already discovered
      const shouldUseChoropleth =
        !pointsViewSelected &&
        (
          definitelyUseChoropleth ||
          (
            mightUseChoropleth &&
            hasDiscoveredShapeLayers &&
            map.city_id &&
            (locationDataCount >= 100 || hasAggregations)
          )
        );// Handle choropleth maps with district shapes
      // Only render if we have discovered shape layers or aggregations
      // Wait a bit for shape layers to be discovered if they're being fetched
      if (shouldUseChoropleth) {
        // Ensure points are hidden when choropleth is selected
        if (showPoints) {
          setShowPoints(false);
        }
        
        // Auto-select first shape layer if available and none selected
        let shapeLayerToUse = selectedShapeLayer;
        if (!shapeLayerToUse && availableShapeLayers.length > 0) {
          shapeLayerToUse = String(availableShapeLayers[0].shape_layer_instance_id);
          setSelectedShapeLayer(shapeLayerToUse);
        } else if (!shapeLayerToUse && map.map_config?.shape_layer_instance_id) {
          shapeLayerToUse = String(map.map_config.shape_layer_instance_id);
          setSelectedShapeLayer(shapeLayerToUse);
        }
        
        if (availableShapeLayers.length > 0 || hasAggregations || shapeLayerToUse) {
          if (mapInstance && typeof mapInstance.getLayer === 'function') {
            await loadChoroplethMap(mapInstance, map, shapeLayerToUse || null);
          } else {
            console.warn("[PublicMapPage] Map instance not ready, skipping choropleth load");
          }
        } else if (mightUseChoropleth && !hasDiscoveredShapeLayers) {
          // Shape layers are being discovered asynchronously, they'll trigger a re-render
          // For now, show points as fallback until shape layers are discovered
          // The shape layer discovery effect will switch to choropleth when ready
        }
      } else if (map.map_type === "multi_layer" && layerMaps?.length) {
        // Multi-layer: one point layer per child map (from map_config.layer_maps, expanded by API)
        clearLegend();
        const allBounds: Array<[[number, number], [number, number]]> = [];
        layerMaps.forEach((layer: any, layerIndex: number) => {
          const locData = layer.location_data || [];
          const validPoints = locData.filter((point: any) => {
            const lat = point.lat ?? point.latitude;
            const lon = point.lon ?? point.longitude;
            return lat != null && lon != null && !isNaN(Number(lat)) && !isNaN(Number(lon)) && isFinite(Number(lat)) && isFinite(Number(lon));
          }).map((point: any) => ({
            ...point,
            lat: point.lat ?? point.latitude,
            lon: point.lon ?? point.longitude,
          }));
          if (validPoints.length === 0) return;
          const sourceId = `multi-layer-${layerIndex}-source`;
          const layerId = `multi-layer-${layerIndex}`;
          const geojson = {
            type: "FeatureCollection" as const,
            features: validPoints.map((point: any, i: number) => ({
              type: "Feature" as const,
              geometry: { type: "Point" as const, coordinates: [point.lon, point.lat] },
              properties: { id: i, ...point },
            })),
          };
          mapInstance.addSource(sourceId, { type: "geojson", data: geojson });
          const color = MULTI_LAYER_COLORS[layerIndex % MULTI_LAYER_COLORS.length];
          mapInstance.addLayer({
            id: layerId,
            type: "circle",
            source: sourceId,
            paint: {
              "circle-radius": 6,
              "circle-color": color,
              "circle-stroke-color": "#fff",
              "circle-stroke-width": 1,
              "circle-opacity": 0.8,
            },
          });
          const lngs = validPoints.map((p: any) => p.lon);
          const lats = validPoints.map((p: any) => p.lat);
          if (lngs.length && lats.length) {
            allBounds.push([[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]]);
          }
          mapInstance.on("click", layerId, (e: any) => {
            if (!e.features?.length) return;
            const props = e.features[0].properties;
            let content = "<div class='map-popup'>";
            const title = layer.title || `Layer ${layerIndex + 1}`;
            content += `<p><strong>${title}</strong></p>`;
            for (const [k, v] of Object.entries(props)) {
              if (k !== "id" && v != null) content += `<p><strong>${k}:</strong> ${String(v)}</p>`;
            }
            content += "</div>";
            new mapboxgl.Popup().setLngLat(e.lngLat).setHTML(content).addTo(mapInstance);
          });
          mapInstance.on("mouseenter", layerId, () => { mapInstance.getCanvas().style.cursor = "pointer"; });
          mapInstance.on("mouseleave", layerId, () => { mapInstance.getCanvas().style.cursor = ""; });
        });
        if (map.bounds && map.bounds.length >= 2) {
          mapInstance.fitBounds(map.bounds, { padding: 50, maxZoom: 15 });
        } else if (allBounds.length > 0) {
          const allLngs = allBounds.flatMap((b) => [b[0][0], b[1][0]]);
          const allLats = allBounds.flatMap((b) => [b[0][1], b[1][1]]);
          mapInstance.fitBounds([[Math.min(...allLngs), Math.min(...allLats)], [Math.max(...allLngs), Math.max(...allLats)]], { padding: 50, maxZoom: 15 });
        }
      } else if (map.map_type === "heatmap") {
        // Heatmap layer - filter for valid coordinates
        const validPoints = map.location_data.filter((point: any) => {
          const lat = point.lat ?? point.latitude;
          const lon = point.lon ?? point.longitude;
          return lat != null && lon != null && 
                 !isNaN(Number(lat)) && !isNaN(Number(lon)) &&
                 isFinite(Number(lat)) && isFinite(Number(lon));
        }).map((point: any) => ({
          ...point,
          lat: point.lat ?? point.latitude,
          lon: point.lon ?? point.longitude,
        }));
        
        const geojsonData = {
          type: "FeatureCollection" as const,
          features: validPoints.map((point: any, index: number) => ({
            type: "Feature" as const,
            geometry: {
              type: "Point" as const,
              coordinates: [point.lon, point.lat],
            },
            properties: {
              id: index,
              ...point,
            },
          })),
        };
        
        mapInstance.addSource("map-points", {
          type: "geojson",
          data: geojsonData,
        });
        
        mapInstance.addLayer({
          id: "map-heatmap",
          type: "heatmap",
          source: "map-points",
          paint: {
            "heatmap-weight": 1,
            "heatmap-intensity": 1,
            "heatmap-radius": 15,
            "heatmap-opacity": 0,
          },
        });
        
        const wantHeatmapVisible = !isExplicitDistrictMap && (defaultIsPoints || isEmbedded) && !selectedShapeLayer && !shouldUseChoropleth && !mightUseChoropleth;
        setShowPoints(wantHeatmapVisible);
        
        if (mapInstance.getLayer("map-heatmap")) {
          if (wantHeatmapVisible) {
            mapInstance.setLayoutProperty("map-heatmap", "visibility", "visible");
            mapInstance.setPaintProperty("map-heatmap", "heatmap-opacity", 0.8);
          } else {
            mapInstance.setLayoutProperty("map-heatmap", "visibility", "none");
            mapInstance.setPaintProperty("map-heatmap", "heatmap-opacity", 0);
          }
        }
      } else {
        // Point layer - filter for valid coordinates (handle both lat/lon and latitude/longitude)
        const validPoints = map.location_data.filter((point: any) => {
          const lat = point.lat ?? point.latitude;
          const lon = point.lon ?? point.longitude;
          return lat != null && lon != null && 
                 !isNaN(Number(lat)) && !isNaN(Number(lon)) &&
                 isFinite(Number(lat)) && isFinite(Number(lon));
        }).map((point: any) => ({
          ...point,
          lat: point.lat ?? point.latitude,
          lon: point.lon ?? point.longitude,
        }));// Group points by exact location to detect overlaps
        const locationMap = new Map<string, number[]>();
        validPoints.forEach((point: any, index: number) => {
          const key = `${point.lat},${point.lon}`;
          if (!locationMap.has(key)) {
            locationMap.set(key, []);
          }
          locationMap.get(key)!.push(index);
        });
        
        // Add small random offset for overlapping points (so they're all visible)
        const geojsonData = {
          type: "FeatureCollection" as const,
          features: validPoints.map((point: any, index: number) => {
            const key = `${point.lat},${point.lon}`;
            const indicesAtLocation = locationMap.get(key) || [];
            const positionInGroup = indicesAtLocation.indexOf(index);
            const totalAtLocation = indicesAtLocation.length;
            
            // Add small random offset if multiple points at same location
            // Offset is deterministic based on index to avoid jitter on re-render
            let latOffset = 0;
            let lonOffset = 0;
            if (totalAtLocation > 1) {
              // Spread points in a small circle around the original location
              const angle = (positionInGroup / totalAtLocation) * Math.PI * 2;
              const radius = 0.0001; // ~11 meters
              latOffset = Math.cos(angle) * radius;
              lonOffset = Math.sin(angle) * radius;
            }
            
            return {
              type: "Feature" as const,
              geometry: {
                type: "Point" as const,
                coordinates: [point.lon + lonOffset, point.lat + latOffset],
              },
              properties: {
                id: index,
                ...point,
                _overlap_count: totalAtLocation, // Track how many points overlap
              },
            };
          }),
        };
        
        mapInstance.addSource("map-points", {
          type: "geojson",
          data: geojsonData,
        });
        
        mapInstance.addLayer({
          id: "map-points",
          type: "circle",
          source: "map-points",
          paint: {
            "circle-radius": 6,
            "circle-color": (() => {
              const seriesField = map.map_config?.series_field;
              const seriesColors = map.map_config?.series_colors;
              if (seriesField && seriesColors) {
                const matchExpr: any[] = ["match", ["to-string", ["get", seriesField]]];
                for (const [label, color] of Object.entries(seriesColors)) {
                  matchExpr.push(String(label), String(color));
                }
                matchExpr.push("#ad35fa");
                // Update legend (best-effort)
                setLegendFromSeries(seriesField, map.map_config?.series_values, seriesColors);
                return matchExpr;
              }
              clearLegend();
              return "#ad35fa";
            })(),
            "circle-stroke-color": "#fff",
            "circle-stroke-width": 1,
            "circle-opacity": 0,
          },
        });
        
        // Set initial visibility from map config (defaultIsPoints), not from showPoints state,
        // since this callback runs async and may see stale showPoints. Sync state after.
        // Choropleth/delta maps never show the dot layer.
        const wantPointsVisible = !isExplicitDistrictMap && (defaultIsPoints || isEmbedded) && !selectedShapeLayer && !shouldUseChoropleth && !mightUseChoropleth;
        setShowPoints(wantPointsVisible);
        
        if (mapInstance.getLayer("map-points")) {
          if (wantPointsVisible) {
            mapInstance.setLayoutProperty("map-points", "visibility", "visible");
            mapInstance.setPaintProperty("map-points", "circle-opacity", 0.8);
          } else {
            mapInstance.setLayoutProperty("map-points", "visibility", "none");
            mapInstance.setPaintProperty("map-points", "circle-opacity", 0);
          }
        }
        
        // Add popup on click (use item_noun for count/value labels)
        const displayInfo = getMapDisplayCount(map);
        const itemNounLabel = displayInfo ? displayInfo.itemNoun.charAt(0).toUpperCase() + displayInfo.itemNoun.slice(1) : null;
        mapInstance.on("click", "map-points", (e: any) => {
          if (!e.features || e.features.length === 0) return;
          
          const feature = e.features[0];
          const props = feature.properties;
          
          // Build popup content
          let content = "<div class='map-popup'>";
          for (const [key, value] of Object.entries(props)) {
            if (key !== "id" && key !== "lat" && key !== "lon" && value) {
              const label = itemNounLabel && (key === "count" || key === "value") ? itemNounLabel : key;
              content += `<p><strong>${label}:</strong> ${value}</p>`;
            }
          }
          content += "</div>";
          
          new mapboxgl.Popup()
            .setLngLat(e.lngLat)
            .setHTML(content)
            .addTo(mapInstance);
        });
        
        // Change cursor on hover
        mapInstance.on("mouseenter", "map-points", () => {
          mapInstance.getCanvas().style.cursor = "pointer";
        });
        mapInstance.on("mouseleave", "map-points", () => {
          mapInstance.getCanvas().style.cursor = "";
        });
      }
      
      // Fit bounds if available
      if (map.bounds) {
        mapInstance.fitBounds(map.bounds, {
          padding: 50,
          maxZoom: 15,
        });
      }
      });
    })();

    return () => {
      cancelled = true;
      lastAppliedBasemapThemeRef.current = null;
      if (mapInstanceRef.current) {
        try {
          mapInstanceRef.current.remove();
        } catch {
          /* ignore */
        }
        mapInstanceRef.current = null;
      }
    };
  }, [map, mapboxLoaded, theme, selectedShapeLayer, isEmbedded, showPoints]);
  
  // Trigger choropleth rendering when shape layers are discovered
  useEffect(() => {
    if (!map || !mapInstanceRef.current || !mapboxLoaded) return;

    const locationDataCount = map.location_data?.length || 0;
    const defaultView = map.map_config?.default_view as { type?: string } | undefined;
    const isDistrictMap =
      map.map_type === "choropleth" || map.map_type === "delta";
    const preferPoints =
      !isDistrictMap &&
      (defaultView?.type === "points" || locationDataCount <= 100);

    // When we should show points (few points, backend default, or explicit user choice),
    // do NOT switch to choropleth when shape layers appear later — unless a shape layer is already selected.
    if ((preferPoints && !selectedShapeLayer) || showPoints) {
      return;
    }

    // Auto-select first shape layer if available and none selected
    let shapeLayerToUse = selectedShapeLayer;
    if (!shapeLayerToUse && availableShapeLayers.length > 0) {
      shapeLayerToUse = String(availableShapeLayers[0].shape_layer_instance_id);
      setSelectedShapeLayer(shapeLayerToUse);
    } else if (!shapeLayerToUse && map.map_config?.shape_layer_instance_id) {
      shapeLayerToUse = String(map.map_config.shape_layer_instance_id);
      setSelectedShapeLayer(shapeLayerToUse);
    }

    if (availableShapeLayers.length === 0 && !shapeLayerToUse) {
      // No shape layers available - check if we should show points instead
      const hasAggregations = !!(map.map_config?.aggregations && Object.keys(map.map_config.aggregations).length > 0);
      const definitelyUseChoropleth =
        map.map_type === "choropleth" ||
        map.map_type === "delta" ||
        hasAggregations;
      
      // Only auto-show points if NOT using choropleth and we're in embedded mode or explicitly enabled
      // Don't show points if we're still waiting for shape layer discovery
      if (!definitelyUseChoropleth && map.map_type === "point" && map.location_data && map.location_data.length > 0) {
        const validPoints = map.location_data.filter((point: any) => {
          const lat = point.lat ?? point.latitude;
          const lon = point.lon ?? point.longitude;
          return lat != null && lon != null;
        });
        if (validPoints.length > 0 && (isEmbedded || showPoints) && !selectedShapeLayer) {
          setShowPoints(true);
        }
      }
      return;
    }
    
    if (!shapeLayerToUse) return;

    // Check if choropleth layers already exist
    if (mapInstanceRef.current.getLayer("choropleth-fill")) {
      return; // Already rendered
    }

    // Check if we should render choropleth
    const hasAggregations = !!(map.map_config?.aggregations && Object.keys(map.map_config.aggregations).length > 0);
    const hasGeographicIdentifiers = savedMapRowsHaveGeographicIds(
      map,
      map.location_data
    );
    
    const shouldUseChoropleth =
      !showPoints &&
      (map.map_type === "choropleth" ||
        map.map_type === "delta" ||
        hasAggregations ||
        (map.map_type === "point" && hasGeographicIdentifiers)) &&
      map.city_id &&
      (locationDataCount >= 100 ||
        hasAggregations ||
        map.map_type === "choropleth" ||
        map.map_type === "delta");
    
    if (shouldUseChoropleth && mapInstanceRef.current) {
      // Ensure points are hidden when choropleth is loaded
      if (showPoints) {
        setShowPoints(false);
      }
      loadChoroplethMap(mapInstanceRef.current, map, shapeLayerToUse);
    }
  }, [availableShapeLayers, selectedShapeLayer, map, mapboxLoaded, isEmbedded, showPoints]);
  
  // Update map style when theme changes
  useEffect(() => {
    if (mapInstanceRef.current && mapboxLoaded && map) {
      if (lastAppliedBasemapThemeRef.current === theme) {
        return;
      }
      lastAppliedBasemapThemeRef.current = theme;
      const newStyle = theme === "dark"
        ? "mapbox://styles/mapbox/dark-v11"
        : "mapbox://styles/mapbox/light-v11";
      mapInstanceRef.current.setStyle(newStyle);
      
      // Reload choropleth or multi-layer layers after style loads
      mapInstanceRef.current.once("style.load", async () => {
        const layerMapsForStyle = map.map_config?.layer_maps as any[] | undefined;
        const isMultiLayer = map.map_type === "multi_layer" && layerMapsForStyle?.length;
        if (isMultiLayer && mapInstanceRef.current) {
          const vis = multiLayerVisibilityRef.current;
          layerMapsForStyle.forEach((layer: any, layerIndex: number) => {
            const locData = layer.location_data || [];
            const validPoints = locData.filter((point: any) => {
              const lat = point.lat ?? point.latitude;
              const lon = point.lon ?? point.longitude;
              return lat != null && lon != null && !isNaN(Number(lat)) && !isNaN(Number(lon)) && isFinite(Number(lat)) && isFinite(Number(lon));
            }).map((point: any) => ({
              ...point,
              lat: point.lat ?? point.latitude,
              lon: point.lon ?? point.longitude,
            }));
            if (validPoints.length === 0) return;
            const sourceId = `multi-layer-${layerIndex}-source`;
            const layerId = `multi-layer-${layerIndex}`;
            const geojson = {
              type: "FeatureCollection" as const,
              features: validPoints.map((point: any, i: number) => ({
                type: "Feature" as const,
                geometry: { type: "Point" as const, coordinates: [point.lon, point.lat] },
                properties: { id: i, ...point },
              })),
            };
            mapInstanceRef.current!.addSource(sourceId, { type: "geojson", data: geojson });
            const color = MULTI_LAYER_COLORS[layerIndex % MULTI_LAYER_COLORS.length];
            mapInstanceRef.current!.addLayer({
              id: layerId,
              type: "circle",
              source: sourceId,
              paint: {
                "circle-radius": 6,
                "circle-color": color,
                "circle-stroke-color": "#fff",
                "circle-stroke-width": 1,
                "circle-opacity": 0.8,
              },
            });
            mapInstanceRef.current!.setLayoutProperty(layerId, "visibility", vis[layerIndex] !== false ? "visible" : "none");
            const mapboxgl = (window as any).mapboxgl;
            mapInstanceRef.current!.on("click", layerId, (e: any) => {
              if (!e.features?.length) return;
              const props = e.features[0].properties;
              let content = "<div class='map-popup'>";
              const title = layer.title || `Layer ${layerIndex + 1}`;
              content += `<p><strong>${title}</strong></p>`;
              for (const [k, v] of Object.entries(props)) {
                if (k !== "id" && v != null) content += `<p><strong>${k}:</strong> ${String(v)}</p>`;
              }
              content += "</div>";
              new mapboxgl.Popup().setLngLat(e.lngLat).setHTML(content).addTo(mapInstanceRef.current!);
            });
            mapInstanceRef.current!.on("mouseenter", layerId, () => { mapInstanceRef.current!.getCanvas().style.cursor = "pointer"; });
            mapInstanceRef.current!.on("mouseleave", layerId, () => { mapInstanceRef.current!.getCanvas().style.cursor = ""; });
          });
          return;
        }
        const locationDataCount = map.location_data?.length || 0;
        const hasAggregations = map.map_config?.aggregations && Object.keys(map.map_config.aggregations).length > 0;
        const hasAvailableShapeLayers = map.map_config?.available_shape_layers && map.map_config.available_shape_layers.length > 0;
        const isDistrictMap =
          map.map_type === "choropleth" || map.map_type === "delta";
        const shouldUseChoropleth =
          !showPoints &&
          (map.map_type === "choropleth" ||
            map.map_type === "delta" ||
            hasAggregations ||
            hasAvailableShapeLayers) &&
          (map.map_config?.shape_layer_instance_id ||
            hasAvailableShapeLayers ||
            hasAggregations) &&
          map.city_id &&
          (locationDataCount >= 1000 ||
            hasAggregations ||
            isDistrictMap);
        
        if (shouldUseChoropleth && mapInstanceRef.current) {
          await loadChoroplethMap(mapInstanceRef.current, map, selectedShapeLayer);
        } else if (mapInstanceRef.current?.getLayer?.("choropleth-outline")) {
          const outlineColor = theme === "dark" ? "#ffffff" : "#000000";
          mapInstanceRef.current.setPaintProperty("choropleth-outline", "line-color", outlineColor);
          mapInstanceRef.current.setPaintProperty("choropleth-outline", "line-opacity", theme === "dark" ? 0.8 : 0.6);
        }
      });
    }
  }, [theme, mapboxLoaded, map, selectedShapeLayer, showPoints]);
  
  // Toggle points visibility - mutually exclusive with shape layers
  useEffect(() => {
    if (!mapInstanceRef.current || !mapboxLoaded) return;
    
    const mapInstance = mapInstanceRef.current;
    
    // If a shape layer is selected, hide points
    if (selectedShapeLayer && showPoints) {
      setShowPoints(false);
      return;
    }
    
    // Toggle map-points layer
    if (mapInstance.getLayer("map-points")) {
      if (showPoints && !selectedShapeLayer) {
        mapInstance.setLayoutProperty("map-points", "visibility", "visible");
        mapInstance.setPaintProperty("map-points", "circle-opacity", 0.8);
      } else {
        mapInstance.setLayoutProperty("map-points", "visibility", "none");
        mapInstance.setPaintProperty("map-points", "circle-opacity", 0);
      }
    }
    
    // Toggle map-heatmap layer
    if (mapInstance.getLayer("map-heatmap")) {
      if (showPoints && !selectedShapeLayer) {
        mapInstance.setLayoutProperty("map-heatmap", "visibility", "visible");
        mapInstance.setPaintProperty("map-heatmap", "heatmap-opacity", 0.8);
      } else {
        mapInstance.setLayoutProperty("map-heatmap", "visibility", "none");
        mapInstance.setPaintProperty("map-heatmap", "heatmap-opacity", 0);
      }
    }
  }, [showPoints, selectedShapeLayer, mapboxLoaded]);
  
  if (loading) {
    return (
      <div className={`public-map-page loading ${isEmbedded || isThumbnail ? "embedded" : ""} ${isThumbnail ? "thumbnail" : ""}`}>
        <div className="tc-loading-state tc-loading-state--stacked">
          <Loader size="md" color="dark" />
          {!isThumbnail && <span>Loading map…</span>}
        </div>
      </div>
    );
  }
  
  if (error) {
    if (isThumbnail) return <div className="public-map-page embedded thumbnail" />;
    return (
      <div className={`public-map-page ${isEmbedded ? "embedded" : ""}`}>
        <div className="error-container">
          <h1>Map Not Available</h1>
          <p>{error}</p>
          {!isEmbedded && <p>This map may be private or the link may be incorrect.</p>}
        </div>
      </div>
    );
  }
  
  if (!map) {
    if (isThumbnail) return <div className="public-map-page embedded thumbnail" />;
    return <div className={`public-map-page ${isEmbedded ? "embedded" : ""}`}>Map not found</div>;
  }

  // Thumbnail mode — map only, no chrome, for feed card previews
  if (isThumbnail) {
    return (
      <div className="public-map-page embedded thumbnail">
        <div className="map-container-wrapper embedded-map-wrapper">
          <div className="map-container embedded-map" ref={mapContainerRef} />
          {legend && legend.items.length > 0 && map.map_type !== "multi_layer" && (
            <div className="map-legend map-legend-thumbnail" aria-label="Map legend">
              <div className="map-legend-items">
                {legend.items.map((item) => (
                  <div key={item.label} className="map-legend-item">
                    <span
                      className="map-legend-swatch"
                      style={{ backgroundColor: item.color }}
                    />
                    <span className="map-legend-label">{item.label}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Embedded mode - minimal UI, just the map with a small header
  if (isEmbedded) {
    return (
      <div className="public-map-page embedded">
        <div className="embedded-header">
          <a href="/" className="embedded-brand">
            <div className="logo-corners-small">
              <svg
                viewBox="0 0 100 100"
                xmlns="http://www.w3.org/2000/svg"
                style={{ overflow: "visible" }}
              >
                <defs>
                  <mask
                    id="logo-mask-bl-embed"
                    x="-400"
                    y="-400"
                    width="1200"
                    height="1200"
                    maskUnits="userSpaceOnUse"
                    maskContentUnits="userSpaceOnUse"
                  >
                    <rect
                      x="-400"
                      y="-400"
                      width="1200"
                      height="1200"
                      fill="white"
                    />
                    <rect
                      x="8.333"
                      y="8.333"
                      width="83.333"
                      height="83.333"
                      rx="3"
                      ry="3"
                      fill="black"
                    />
                    <rect
                      x="16.666"
                      y="-33.333"
                      width="66.666"
                      height="166.666"
                      fill="black"
                      transform="rotate(-45 50 50)"
                    />
                    <rect
                      x="50"
                      y="-400"
                      width="1200"
                      height="1200"
                      fill="black"
                      transform="rotate(-45 50 50)"
                    />
                  </mask>
                  <mask
                    id="logo-mask-tr-embed"
                    x="-400"
                    y="-400"
                    width="1200"
                    height="1200"
                    maskUnits="userSpaceOnUse"
                    maskContentUnits="userSpaceOnUse"
                  >
                    <rect
                      x="-400"
                      y="-400"
                      width="1200"
                      height="1200"
                      fill="white"
                    />
                    <rect
                      x="8.333"
                      y="8.333"
                      width="83.333"
                      height="83.333"
                      rx="3"
                      ry="3"
                      fill="black"
                    />
                    <rect
                      x="16.666"
                      y="-33.333"
                      width="66.666"
                      height="166.666"
                      fill="black"
                      transform="rotate(-45 50 50)"
                    />
                    <rect
                      x="-1150"
                      y="-400"
                      width="1200"
                      height="1200"
                      fill="black"
                      transform="rotate(-45 50 50)"
                    />
                  </mask>
                </defs>
                <rect
                  className="brace"
                  x="0"
                  y="0"
                  width="100"
                  height="100"
                  rx="3"
                  ry="3"
                  mask="url(#logo-mask-bl-embed)"
                  fill="#ffffff"
                  transform="translate(23.5%, -23.5%)"
                />
                <rect
                  className="brace"
                  x="0"
                  y="0"
                  width="100"
                  height="100"
                  rx="3"
                  ry="3"
                  mask="url(#logo-mask-tr-embed)"
                  fill="#ffffff"
                  transform="translate(-23.5%, 23.5%)"
                />
              </svg>
            </div>
            <span className="brand-text-small">
              <span className="brand-transparent">transparent</span>
              <span className="brand-city">.city</span>
            </span>
          </a>
          <div className="embedded-meta">
            <span>
              {(() => {
                const d = getMapDisplayCount(map);
                if (d) return `${d.count.toLocaleString()} ${d.itemNoun}`;
                return "—";
              })()}
            </span>
            <a
              href={`/m/${hash}`}
              target="_blank"
              rel="noopener noreferrer"
              className="embedded-link"
            >
              Open full view ↗
            </a>
          </div>
        </div>
        <div className="map-container-wrapper embedded-map-wrapper">
          {map.map_type === "multi_layer" && (map.map_config?.layer_maps as any[])?.length > 0 ? (
            <div className="multi-layer-panel" role="region" aria-label="Map layers">
              <div className="multi-layer-panel-title">Layers</div>
              {(map.map_config.layer_maps as any[]).map((layer: any, i: number) => (
                <label key={i} className="multi-layer-panel-item">
                  <input
                    type="checkbox"
                    checked={multiLayerVisibility[i] !== false}
                    onChange={() => setMultiLayerVisibility((prev) => ({ ...prev, [i]: !prev[i] }))}
                    aria-label={`Toggle ${layer.title || `Layer ${i + 1}`}`}
                  />
                  <span
                    className="multi-layer-panel-swatch"
                    style={{ backgroundColor: MULTI_LAYER_COLORS[i % MULTI_LAYER_COLORS.length] }}
                    aria-hidden
                  />
                  <span>{layer.title || `Layer ${i + 1}`}</span>
                </label>
              ))}
            </div>
          ) : (
            <MapLayerPanel
              availableShapeLayers={availableShapeLayers.length > 0 ? availableShapeLayers : 
                (map?.map_config?.shape_layer_instance_id ? [{
                  shape_layer_instance_id: map.map_config.shape_layer_instance_id,
                  identifier_field: map.map_config.district_field || "supervisor_district",
                  display_name: "Districts",
                  layer_key: "supervisor_districts",
                  category: "government",
                }] : [])
              }
              selectedShapeLayer={selectedShapeLayer}
              onShapeLayerSelect={(shapeLayerId) => {
                setSelectedShapeLayer(shapeLayerId);
                if (showPoints) setShowPoints(false);
                if (mapInstanceRef.current && map) {
                  loadChoroplethMap(mapInstanceRef.current, map, shapeLayerId);
                }
              }}
              showDots={showPoints && !selectedShapeLayer}
              onToggleDots={() => {
                if (!showPoints && selectedShapeLayer) setSelectedShapeLayer(null);
                setShowPoints(!showPoints);
              }}
              canShowDots={
                (map.map_type !== "choropleth" && map.map_type !== "delta") &&
                !!(map.location_data && map.location_data.length > 0)
              }
            />
          )}
          <div className="map-container embedded-map" ref={mapContainerRef} />
          {legend && legend.items.length > 0 && map.map_type !== "multi_layer" && (
            <div className="map-legend" aria-label="Map legend">
              <div className="map-legend-title">{legend.title}</div>
              <div className="map-legend-items">
                {legend.items.map((item) => (
                  <div key={item.label} className="map-legend-item">
                    <span
                      className="map-legend-swatch"
                      style={{ backgroundColor: item.color }}
                    />
                    <span className="map-legend-label">{item.label}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {districtPanel && (
            <div className="map-bottom-panel" role="region" aria-label="District details">
              <div className="map-bottom-panel-header">
                <div className="map-bottom-panel-title">
                  District {districtPanel.districtId}
                  {districtPanel.districtName ? ` — ${districtPanel.districtName}` : ""}
                </div>
                <div className="map-bottom-panel-actions">
                  {districtPanel.canHideDots && dotsDistrictId && (
                    <button
                      type="button"
                      className="map-bottom-panel-action"
                      onClick={() => {
                        if (mapInstanceRef.current) removeDotsLayer(mapInstanceRef.current);
                        setDotsDistrictId(null);
                        clearLegend();
                      }}
                    >
                      Hide dots
                    </button>
                  )}
                  <button type="button" className="map-bottom-panel-close" onClick={closeDistrictPanel}>
                    ✕
                  </button>
                </div>
              </div>
              <div className="map-bottom-panel-body">
                <div className="map-bottom-panel-count">
                  <div className="label">
                    {(() => {
                      const d = getMapDisplayCount(map);
                      return d ? d.itemNoun.charAt(0).toUpperCase() + d.itemNoun.slice(1) : "Count";
                    })()}
                  </div>
                  <div className="value">
                    {districtPanel.count !== null && !Number.isNaN(districtPanel.count)
                      ? districtPanel.count.toLocaleString()
                      : "—"}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }
  
  // Share functionality
  const handleShare = async () => {
    const url = window.location.href;
    const title = map.title;
    const text = map.description || `Check out this map: ${title}`;

    // Try Web Share API first (mobile/modern browsers)
    if (navigator.share) {
      try {
        await navigator.share({
          title,
          text,
          url,
        });
        return;
      } catch (err) {
        // User cancelled or error - fall through to fallback
      }
    }

    // Fallback: show share sheet or copy to clipboard
    setShowShareSheet(true);
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(window.location.href);
    setShowShareSheet(false);
    // Could show a toast notification here
  };

  return (
    <div className="public-map-page">
      <header className="map-header">
        <a href="/" className="brand">
          <div className="logo-corners">
            <svg
              viewBox="0 0 100 100"
              xmlns="http://www.w3.org/2000/svg"
              style={{ overflow: "visible" }}
            >
              <defs>
                <mask
                  id="logo-mask-bl"
                  x="-400"
                  y="-400"
                  width="1200"
                  height="1200"
                  maskUnits="userSpaceOnUse"
                  maskContentUnits="userSpaceOnUse"
                >
                  <rect
                    x="-400"
                    y="-400"
                    width="1200"
                    height="1200"
                    fill="white"
                  />
                  <rect
                    x="8.333"
                    y="8.333"
                    width="83.333"
                    height="83.333"
                    rx="3"
                    ry="3"
                    fill="black"
                  />
                  <rect
                    x="16.666"
                    y="-33.333"
                    width="66.666"
                    height="166.666"
                    fill="black"
                    transform="rotate(-45 50 50)"
                  />
                  <rect
                    x="50"
                    y="-400"
                    width="1200"
                    height="1200"
                    fill="black"
                    transform="rotate(-45 50 50)"
                  />
                </mask>
                <mask
                  id="logo-mask-tr"
                  x="-400"
                  y="-400"
                  width="1200"
                  height="1200"
                  maskUnits="userSpaceOnUse"
                  maskContentUnits="userSpaceOnUse"
                >
                  <rect
                    x="-400"
                    y="-400"
                    width="1200"
                    height="1200"
                    fill="white"
                  />
                  <rect
                    x="8.333"
                    y="8.333"
                    width="83.333"
                    height="83.333"
                    rx="3"
                    ry="3"
                    fill="black"
                  />
                  <rect
                    x="16.666"
                    y="-33.333"
                    width="66.666"
                    height="166.666"
                    fill="black"
                    transform="rotate(-45 50 50)"
                  />
                  <rect
                    x="-1150"
                    y="-400"
                    width="1200"
                    height="1200"
                    fill="black"
                    transform="rotate(-45 50 50)"
                  />
                </mask>
              </defs>
              <rect
                className="brace"
                x="0"
                y="0"
                width="100"
                height="100"
                rx="3"
                ry="3"
                mask="url(#logo-mask-bl)"
                fill="#1f2937"
                transform="translate(23.5%, -23.5%)"
              />
              <rect
                className="brace"
                x="0"
                y="0"
                width="100"
                height="100"
                rx="3"
                ry="3"
                mask="url(#logo-mask-tr)"
                fill="#1f2937"
                transform="translate(-23.5%, 23.5%)"
              />
            </svg>
          </div>
          <span className="brand-text">
            <span className="brand-transparent">transparent</span>
            <span className="brand-city">.city</span>
          </span>
        </a>
        <div className="header-right">
          <button
            onClick={handleShare}
            className="share-button-header"
            aria-label="Share this map"
            title="Share this map"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"></path>
              <polyline points="16 6 12 2 8 6"></polyline>
              <line x1="12" y1="2" x2="12" y2="15"></line>
            </svg>
            Share
          </button>
        </div>
      </header>
      
      <article className="map-article">
        <div className="map-info">
          {(map.city_name || resolvedCityName) && (
            <p className="map-city-line">
              <span className="map-city-name">{map.city_name || resolvedCityName}</span>
              {resolvedCityState ? (
                <span className="map-city-state">, {resolvedCityState}</span>
              ) : null}
            </p>
          )}
          <h1 className="map-title">{map.title}</h1>
          {map.description && (
            <p className="map-description">{map.description}</p>
          )}
          <div className="map-meta">
            <span>
              {(() => {
                const d = getMapDisplayCount(map);
                if (d) return `${d.count.toLocaleString()} ${d.itemNoun}`;
                return "—";
              })()}
            </span>
            <span> • </span>
            <span>Created {new Date(map.created_at).toLocaleDateString()}</span>
          </div>
        </div>

        <div className="map-container-wrapper">
          {map.map_type === "multi_layer" && (map.map_config?.layer_maps as any[])?.length > 0 ? (
            <div className="multi-layer-panel" role="region" aria-label="Map layers">
              <div className="multi-layer-panel-title">Layers</div>
              {(map.map_config.layer_maps as any[]).map((layer: any, i: number) => (
                <label key={i} className="multi-layer-panel-item">
                  <input
                    type="checkbox"
                    checked={multiLayerVisibility[i] !== false}
                    onChange={() => setMultiLayerVisibility((prev) => ({ ...prev, [i]: !prev[i] }))}
                    aria-label={`Toggle ${layer.title || `Layer ${i + 1}`}`}
                  />
                  <span
                    className="multi-layer-panel-swatch"
                    style={{ backgroundColor: MULTI_LAYER_COLORS[i % MULTI_LAYER_COLORS.length] }}
                    aria-hidden
                  />
                  <span>{layer.title || `Layer ${i + 1}`}</span>
                </label>
              ))}
            </div>
          ) : (
            <MapLayerPanel
              availableShapeLayers={availableShapeLayers.length > 0 ? availableShapeLayers : 
                (map?.map_config?.shape_layer_instance_id ? [{
                  shape_layer_instance_id: map.map_config.shape_layer_instance_id,
                  identifier_field: map.map_config.district_field || "supervisor_district",
                  display_name: "Districts",
                  layer_key: "supervisor_districts",
                  category: "government",
                }] : [])
              }
              selectedShapeLayer={selectedShapeLayer}
              onShapeLayerSelect={(shapeLayerId) => {
                setSelectedShapeLayer(shapeLayerId);
                if (showPoints) setShowPoints(false);
                if (mapInstanceRef.current && map) {
                  loadChoroplethMap(mapInstanceRef.current, map, shapeLayerId);
                }
              }}
              showDots={showPoints && !selectedShapeLayer}
              onToggleDots={() => {
                if (!showPoints && selectedShapeLayer) setSelectedShapeLayer(null);
                setShowPoints(!showPoints);
              }}
              canShowDots={
                (map.map_type !== "choropleth" && map.map_type !== "delta") &&
                !!(map.location_data && map.location_data.length > 0)
              }
            />
          )}
          <div className="map-container" ref={mapContainerRef} />
          {legend && legend.items.length > 0 && map.map_type !== "multi_layer" && (
            <div className="map-legend" aria-label="Map legend">
              <div className="map-legend-title">{legend.title}</div>
              <div className="map-legend-items">
                {legend.items.map((item) => (
                  <div key={item.label} className="map-legend-item">
                    <span
                      className="map-legend-swatch"
                      style={{ backgroundColor: item.color }}
                    />
                    <span className="map-legend-label">{item.label}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {districtPanel && (
            <div className="map-bottom-panel" role="region" aria-label="District details">
              <div className="map-bottom-panel-header">
                <div className="map-bottom-panel-title">
                  District {districtPanel.districtId}
                  {districtPanel.districtName ? ` — ${districtPanel.districtName}` : ""}
                </div>
                <div className="map-bottom-panel-actions">
                  {districtPanel.canHideDots && dotsDistrictId && (
                    <button
                      type="button"
                      className="map-bottom-panel-action"
                      onClick={() => {
                        if (mapInstanceRef.current) removeDotsLayer(mapInstanceRef.current);
                        setDotsDistrictId(null);
                        clearLegend();
                      }}
                    >
                      Hide dots
                    </button>
                  )}
                  <button type="button" className="map-bottom-panel-close" onClick={closeDistrictPanel}>
                    ✕
                  </button>
                </div>
              </div>
              <div className="map-bottom-panel-body">
                <div className="map-bottom-panel-count">
                  <div className="label">
                    {(() => {
                      const d = getMapDisplayCount(map);
                      return d ? d.itemNoun.charAt(0).toUpperCase() + d.itemNoun.slice(1) : "Count";
                    })()}
                  </div>
                  <div className="value">
                    {districtPanel.count !== null && !Number.isNaN(districtPanel.count)
                      ? districtPanel.count.toLocaleString()
                      : "—"}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
        
        <footer className="map-footer">
          {showShareSheet && (
              <div 
                className="share-sheet"
                onClick={(e) => {
                  if (e.target === e.currentTarget) {
                    setShowShareSheet(false);
                  }
                }}
              >
                <div className="share-sheet-content" onClick={(e) => e.stopPropagation()}>
                  <h4>Share this map</h4>
                  <div className="share-options">
                    <button
                      onClick={copyToClipboard}
                      className="share-option"
                    >
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                      </svg>
                      <span>Copy Link</span>
                    </button>
                    <button
                      onClick={() => {
                        const url = encodeURIComponent(window.location.href);
                        const text = encodeURIComponent(`Check out this map: ${map.title}`);
                        window.open(`https://www.linkedin.com/sharing/share-offsite/?url=${url}`, "_blank");
                        setShowShareSheet(false);
                      }}
                      className="share-option"
                    >
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
                      </svg>
                      <span>LinkedIn</span>
                    </button>
                    <button
                      onClick={() => {
                        const url = encodeURIComponent(window.location.href);
                        window.open(`mailto:?subject=${encodeURIComponent(map.title)}&body=${encodeURIComponent(`Check out this map: ${url}`)}`, "_blank");
                        setShowShareSheet(false);
                      }}
                      className="share-option"
                    >
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path>
                        <polyline points="22,6 12,13 2,6"></polyline>
                      </svg>
                      <span>Email</span>
                    </button>
                  </div>
                  <button
                    onClick={() => setShowShareSheet(false)}
                    className="share-sheet-close"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          
          {!isAuthenticated && (
            <div className="cta-section">
              <h3>Sign up now</h3>
              <p>
                Get updates, maps, and block-level context about your city and neighborhood.
              </p>
              <button
                type="button"
                className="cta-button"
                onClick={() => {
                  if (typeof window !== "undefined") {
                    window.localStorage.setItem("transparentcity.signup_intent", "subscriber");
                  }
                  loginWithRedirect({
                    authorizationParams: { screen_hint: "signup" },
                    appState: { returnTo: "/home" },
                  });
                }}
              >
                Sign up
              </button>
            </div>
          )}
        </footer>
      </article>
    </div>
  );
}


"use client";

import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { useAuth0 } from "@auth0/auth0-react";
import { useTheme } from "@/contexts/ThemeContext";
import { useQueryClient } from "@tanstack/react-query";
import {
  type MapData,
  type MapDataPoint,
  type AdminMetricListItem,
  type GetMapDataRequest,
  getMetricMapData,
  getCityStructure,
  type CityStructureData,
} from "@/lib/apiClient";
import { useCityMetricsForMap } from "@/lib/hooks/useMetrics";
import { useCityAdminStructure, useUserMetricOrdering } from "@/lib/hooks/useCityAdmin";
import { useMapLayersData } from "@/lib/hooks/useMapLayers";
import type { MetricDateRange } from "@/lib/dateRange";
import Loader from "@/components/Loader";
import MapTimeline from "@/components/MapTimeline";
import MediaGallery, { type MediaViewMode } from "@/components/MediaGallery";
import { extractMediaFromPoint, extractMediaFromPoints, type MediaItem } from "@/lib/mediaUtils";
import { prepareGalleryOpen } from "@/lib/mediaPreload";
import "./CityMetricsMap.css";
import { getStableColorForKey, LAYER_COLOR_PALETTE } from "@/lib/layerColors";
import {
  getOrderForTemplate,
  getCategoryDisplayName,
  getTemplateConfig,
  type GroupedMetric,
} from "@/lib/metricTemplateConfig";
import type { AnomalyResult } from "@/lib/hooks/useAnomalies";
import { CHOROPLETH_DARK_LOW_RGB } from "@/lib/mapUtils";
import { isJunkWgs84LngLat } from "@/lib/mapCoordinateSanity";

// Brand purple color for anomaly mode
const ANOMALY_MODE_COLOR = "#AD35FA";

type MapBoundsBox = {
  sw: [number, number];
  ne: [number, number];
};

const WEB_MERCATOR_MAX = 20037508.342789244;

function parseShapeGeometryData(rawGeometryData: any): any | null {
  if (!rawGeometryData) return null;
  if (typeof rawGeometryData === "string") {
    try {
      return JSON.parse(rawGeometryData);
    } catch {
      return null;
    }
  }
  return rawGeometryData;
}

function mercatorToLngLat(x: number, y: number): [number, number] {
  const lng = (x / WEB_MERCATOR_MAX) * 180;
  let lat = (y / WEB_MERCATOR_MAX) * 180;
  lat =
    (180 / Math.PI) *
    (2 * Math.atan(Math.exp((lat * Math.PI) / 180)) - Math.PI / 2);
  return [lng, lat];
}

function normalizeCoordinatePair(
  rawLng: unknown,
  rawLat: unknown,
): [number, number] | null {
  const lng =
    typeof rawLng === "number" ? rawLng : parseFloat(String(rawLng));
  const lat =
    typeof rawLat === "number" ? rawLat : parseFloat(String(rawLat));

  if (
    Number.isNaN(lng) ||
    Number.isNaN(lat) ||
    !Number.isFinite(lng) ||
    !Number.isFinite(lat)
  ) {
    return null;
  }

  if (Math.abs(lng) <= 180 && Math.abs(lat) <= 90) {
    return [lng, lat];
  }

  if (Math.abs(lng) <= WEB_MERCATOR_MAX && Math.abs(lat) <= WEB_MERCATOR_MAX) {
    const [normalizedLng, normalizedLat] = mercatorToLngLat(lng, lat);
    if (Math.abs(normalizedLng) <= 180 && Math.abs(normalizedLat) <= 90) {
      return [normalizedLng, normalizedLat];
    }
  }

  return null;
}

/** WGS84 pair for map circles and bounds; rejects placeholder sentinels after mercator normalization. */
function normalizeMapPointForDisplay(
  rawLng: unknown,
  rawLat: unknown,
): [number, number] | null {
  const pair = normalizeCoordinatePair(rawLng, rawLat);
  if (!pair) return null;
  if (isJunkWgs84LngLat(pair[0], pair[1])) return null;
  return pair;
}

function isValidBoundsBox(bounds: MapBoundsBox | null | undefined): bounds is MapBoundsBox {
  if (!bounds) return false;
  const { sw, ne } = bounds;
  const pairs = [sw, ne];
  return pairs.every(
    (pair) =>
      Array.isArray(pair) &&
      pair.length >= 2 &&
      Number.isFinite(pair[0]) &&
      Number.isFinite(pair[1]) &&
      Math.abs(pair[0]) <= 180 &&
      Math.abs(pair[1]) <= 90,
  );
}

function extendBoundsWithFeatureGeometry(
  bounds: MapBoundsBox,
  geometry: any,
): boolean {
  if (!geometry?.coordinates) return false;

  let changed = false;
  const extendCoord = (coord: [number, number]) => {
    const [lng, lat] = coord;
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) return;
    bounds.sw[0] = Math.min(bounds.sw[0], lng);
    bounds.sw[1] = Math.min(bounds.sw[1], lat);
    bounds.ne[0] = Math.max(bounds.ne[0], lng);
    bounds.ne[1] = Math.max(bounds.ne[1], lat);
    changed = true;
  };

  if (geometry.type === "Polygon") {
    geometry.coordinates?.[0]?.forEach(extendCoord);
  } else if (geometry.type === "MultiPolygon") {
    geometry.coordinates?.forEach((polygon: any) => {
      polygon?.[0]?.forEach(extendCoord);
    });
  }

  return changed;
}

function buildFeatureBounds(feature: any): MapBoundsBox | null {
  const bounds: MapBoundsBox = {
    sw: [Infinity, Infinity],
    ne: [-Infinity, -Infinity],
  };

  return extendBoundsWithFeatureGeometry(bounds, feature?.geometry) ? bounds : null;
}

function buildShapefileBounds(shapefiles: any[]): MapBoundsBox | null {
  const bounds: MapBoundsBox = {
    sw: [Infinity, Infinity],
    ne: [-Infinity, -Infinity],
  };
  let hasBounds = false;

  shapefiles.forEach((shapefile) => {
    const geometryData = parseShapeGeometryData(shapefile?.geometry_data);
    if (!geometryData || geometryData.type !== "FeatureCollection") return;

    geometryData.features?.forEach((feature: any) => {
      hasBounds = extendBoundsWithFeatureGeometry(bounds, feature?.geometry) || hasBounds;
    });
  });

  return hasBounds ? bounds : null;
}

/** True when the row has usable point geometry for circle layers (lat/lon or GeoJSON-style coords). */
function mapPointHasCoordinates(item: unknown): boolean {
  if (!item || typeof item !== "object") return false;
  const row = item as Record<string, unknown>;
  if (row.lon !== undefined && row.lat !== undefined) {
    if (normalizeMapPointForDisplay(row.lon, row.lat)) {
      return true;
    }
  }
  const loc = row.location as { coordinates?: unknown } | undefined;
  if (loc?.coordinates && Array.isArray(loc.coordinates) && loc.coordinates.length >= 2) {
    const coords = loc.coordinates as unknown[];
    if (normalizeMapPointForDisplay(coords[0], coords[1])) {
      return true;
    }
  }
  if (row.coordinates && Array.isArray(row.coordinates) && row.coordinates.length >= 2) {
    const coords = row.coordinates as unknown[];
    if (normalizeMapPointForDisplay(coords[0], coords[1])) {
      return true;
    }
  }
  return false;
}

function coerceDistrictIdentifier(value: unknown): number | string | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Number.isInteger(value) ? value : parseInt(String(value), 10);
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const parsed = parseInt(trimmed, 10);
    return Number.isNaN(parsed) ? trimmed : parsed;
  }
  return null;
}

function boundsExceedScope(
  candidateBounds: MapBoundsBox,
  scopeBounds: MapBoundsBox,
): boolean {
  return (
    candidateBounds.sw[0] < scopeBounds.sw[0] ||
    candidateBounds.sw[1] < scopeBounds.sw[1] ||
    candidateBounds.ne[0] > scopeBounds.ne[0] ||
    candidateBounds.ne[1] > scopeBounds.ne[1]
  );
}

function getClampedBounds(
  candidateBounds: MapBoundsBox | null,
  scopeBounds: MapBoundsBox | null,
): MapBoundsBox | null {
  if (!candidateBounds) return scopeBounds;
  if (!scopeBounds) return candidateBounds;
  return boundsExceedScope(candidateBounds, scopeBounds)
    ? scopeBounds
    : candidateBounds;
}

interface CityMetricsMapProps {
  cityId: number;
  isActive?: boolean;
  mapInstanceRef?: React.MutableRefObject<any>; // Reference to existing map instance
  /**
   * Incrementing counter from the parent when the Mapbox style is reloaded.
   * Mapbox clears all custom sources/layers on style changes (e.g., theme toggle),
   * so we use this to trigger re-hydration of metric layers even if `maps` didn't change.
   */
  mapStyleVersion?: number;
  metricDateRange?: MetricDateRange;
  shapeLayers?: Array<{
    instance_id: number;
    label: string;
    icon?: string | null;
    color?: string;
  }>;
  enabledShapeLayerInstanceIds?: Set<number>;
  setEnabledShapeLayerInstanceIds?: React.Dispatch<React.SetStateAction<Set<number>>>;
  gpsLocation?: { lat: number; lng: number } | null; // GPS coordinates - when set, prevents dynamic zooming
  selectedDistrict?: number | null; // Selected district number for filtering data
  /** When set (My place), map data requests are limited to points within this radius of the center */
  placeCircle?: { lat: number; lng: number; radius_m: number } | null;
  /** Label for the place marker on the map. */
  placeLabel?: string | null;
  selectedAnomaly?: AnomalyResult | null; // Currently selected anomaly for anomaly mode
  onAnomalyClear?: () => void; // Callback to clear anomaly selection
}

export default function CityMetricsMap({
  cityId,
  isActive = true,
  mapInstanceRef: externalMapInstanceRef,
  mapStyleVersion,
  metricDateRange,
  shapeLayers = [],
  enabledShapeLayerInstanceIds,
  setEnabledShapeLayerInstanceIds,
  gpsLocation,
  selectedDistrict,
  placeCircle = null,
  placeLabel,
  selectedAnomaly,
  onAnomalyClear,
}: CityMetricsMapProps) {
  const { getAccessTokenSilently } = useAuth0();
  const { theme } = useTheme();
  const internalMapInstanceRef = useRef<any>(null);
  const mapInstanceRef = externalMapInstanceRef || internalMapInstanceRef;
  const [availableMetrics, setAvailableMetrics] = useState<AdminMetricListItem[]>([]);
  const [selectedMetricIds, setSelectedMetricIds] = useState<Set<string>>(new Set());
  const [maps, setMaps] = useState<MapData[]>([]);
  const [loadingMaps, setLoadingMaps] = useState<Set<string>>(new Set());
  const loadingMapsRef = useRef<Set<string>>(new Set());
  const [visibleLayers, setVisibleLayers] = useState<Set<string>>(new Set());
  const [hiddenLayers, setHiddenLayers] = useState<Set<string>>(new Set());
  const [isPanelOpen, setIsPanelOpen] = useState(true); // Open (popped out) by default
  const [error, setError] = useState<string | null>(null);
  const [selectedTimelineDate, setSelectedTimelineDate] = useState<string | null>(null);
  const [isTimelinePlaying, setIsTimelinePlaying] = useState(false);
  const currentAnimationDateRef = useRef<string | null>(null); // Track current date during animation
  const panelRef = useRef<HTMLDivElement | null>(null);
  const layerSelectorScrollRef = useRef<HTMLDivElement | null>(null);
  
  // Media gallery state
  const [mediaItems, setMediaItems] = useState<MediaItem[]>([]);
  const [currentMediaIndex, setCurrentMediaIndex] = useState(0);
  const [mediaViewMode, setMediaViewMode] = useState<MediaViewMode>("split");
  const [showMediaGallery, setShowMediaGallery] = useState(false);
  
  // Dock-style label state for hover/touch
  const [hoveredItemId, setHoveredItemId] = useState<string | null>(null);
  const [hoveredItemLabel, setHoveredItemLabel] = useState<string>("");
  const [hoveredItemRect, setHoveredItemRect] = useState<DOMRect | null>(null);
  const dockLabelTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Point click details shown in bottom panel (no floating popup)
  const [selectedPointDetails, setSelectedPointDetails] = useState<string | null>(null);

  // Anomaly mode state
  const [anomalyModeMap, setAnomalyModeMap] = useState<MapData | null>(null);
  const [anomalyModeLoading, setAnomalyModeLoading] = useState(false);
  const isAnomalyMode = selectedAnomaly !== null && selectedAnomaly !== undefined;

  // Track if we've set default metrics to avoid re-enabling them
  const defaultMetricsSetRef = useRef(false);
  const blockDefaultsSetRef = useRef(false);
  const previousCityIdRef = useRef<number | null>(null);
  const previousPlaceCircleRef = useRef<boolean>(false);
  // Track whether we've already fit to initial data bounds for the current place/city load
  const hasFitInitialBoundsRef = useRef(false);

  // Load metric ordering to match dashboard order and visible metric selection.
  // This is user-scoped and falls back to city ordering when no user override exists.
  const orderingQuery = useUserMetricOrdering(cityId && isActive ? cityId : null);
  const orderingData = orderingQuery.data;

  const orderedMetricIds = useMemo(() => {
    if (!orderingData?.orderings?.length) return null;
    if (orderingData.is_personal_order !== true) return null;
    return new Set(
      orderingData.orderings
        .map((ordering) => ordering.metric_id)
        .filter((metricId): metricId is number => metricId != null)
    );
  }, [orderingData]);

  const activeVisibleMetrics = useMemo(() => {
    const activeMetrics = availableMetrics.filter((metric) => metric.is_active);
    if (!orderedMetricIds || orderedMetricIds.size === 0) {
      return activeMetrics;
    }
    return activeMetrics.filter((metric) => orderedMetricIds.has(metric.id));
  }, [availableMetrics, orderedMetricIds]);

  // Metrics with working map/location (map_query) — used in saved-place mode to limit nav to layers that can show points
  const metricsWithMapCapability = useMemo(() => {
    return activeVisibleMetrics.filter((m) => {
      const hasMapQuery = m.map_query != null && String(m.map_query).trim().length > 0;
      return hasMapQuery || m.has_map_fields === true;
    });
  }, [activeVisibleMetrics]);

  // When a saved place is selected (placeCircle), the layer selector only shows chosen metrics
  // that can actually render at place level. Other scopes use the same chosen metric set.
  const metricsForLayerSelector = useMemo(() => {
    if (placeCircle && metricsWithMapCapability.length > 0) {
      return metricsWithMapCapability;
    }
    return activeVisibleMetrics;
  }, [activeVisibleMetrics, placeCircle, metricsWithMapCapability]);

  // Load available metrics for this city using React Query
  const metricsQuery = useCityMetricsForMap(cityId && isActive ? cityId : null);
  
  // Load city structure for district information
  const structureQuery = useCityAdminStructure(cityId && isActive ? cityId : null);
  
  // Convert selected metric IDs to numbers for the hook
  const selectedMetricIdsArray = useMemo(() => {
    return Array.from(selectedMetricIds)
      .map((id) => parseInt(id, 10))
      .filter((id) => !isNaN(id));
  }, [selectedMetricIds]);
  
  // Get districts array for React Query hook
  const districtsForQuery = useMemo((): number[] | null => {
    if (selectedDistrict === null || selectedDistrict === undefined || selectedDistrict === 0) {
      return null;
    }
    return [selectedDistrict];
  }, [selectedDistrict]);
  
  // Use React Query hook to load map data with caching
  // This hook caches data for 15 minutes and keeps it in memory for 30 minutes
  // When layers are toggled off and back on, cached data is used instead of re-fetching
  const mapLayersQuery = useMapLayersData(
    selectedMetricIdsArray,
    {
      startDate: metricDateRange?.start_date ?? null,
      endDate: metricDateRange?.end_date ?? null,
      districts: districtsForQuery,
      placeCircle: placeCircle ?? null,
    },
    isActive && !isAnomalyMode // Don't fetch when in anomaly mode
  );
  
  // Sync React Query data to local maps state for backwards compatibility with existing rendering code.
  // MapData may include map_config.default_view and map_config.available_views (map loading optimization plan).
  useEffect(() => {
    if (!mapLayersQuery.mapDataByMetricId) return;
    
    const newMaps: MapData[] = [];
    Object.entries(mapLayersQuery.mapDataByMetricId).forEach(([metricIdStr, mapData]) => {
      if (mapData) {
        newMaps.push(mapData);
      }
    });
    
    // Only update if data has actually changed to prevent unnecessary re-renders
    setMaps((prevMaps) => {
      const prevIds = new Set(prevMaps.map((m) => String(m.metric_id)));
      const newIds = new Set(newMaps.map((m) => String(m.metric_id)));
      
      // Check if the sets are the same
      if (prevIds.size === newIds.size && [...prevIds].every((id) => newIds.has(id))) {
        // Check if any data has changed
        let hasChanged = false;
        for (const newMap of newMaps) {
          const prevMap = prevMaps.find((m) => String(m.metric_id) === String(newMap.metric_id));
          if (!prevMap || JSON.stringify(prevMap.location_data) !== JSON.stringify(newMap.location_data)) {
            hasChanged = true;
            break;
          }
        }
        if (!hasChanged) return prevMaps;
      }
      
      return newMaps;
    });
  }, [mapLayersQuery.mapDataByMetricId]);
  
  // Update loading maps state from React Query (convert number to string)
  // Only update if the actual content has changed to prevent unnecessary re-renders
  useEffect(() => {
    setLoadingMaps((prevLoadingMaps) => {
      // Convert query's loading IDs to strings
      const newLoadingIds = Array.from(mapLayersQuery.loadingMetricIds).map(String).sort();
      const prevLoadingIds = Array.from(prevLoadingMaps).sort();
      
      // Only create new Set if content has actually changed
      if (
        newLoadingIds.length === prevLoadingIds.length &&
        newLoadingIds.every((id, i) => id === prevLoadingIds[i])
      ) {
        return prevLoadingMaps; // Return same reference to prevent re-render
      }
      
      return new Set(newLoadingIds);
    });
  }, [mapLayersQuery.loadingMetricIds]);
  
  useEffect(() => {
    if (metricsQuery.data) {
      setAvailableMetrics(metricsQuery.data);
    }
    if (metricsQuery.error) {
      setError(metricsQuery.error.message || "Failed to load metrics");
    }
  }, [metricsQuery.data, metricsQuery.error]);

  const removeMetricLayerFromMap = useCallback((map: any, metricIdStr: string) => {
    const layerId = `metric-layer-${metricIdStr}`;
    const strokeLayerId = `${layerId}-stroke`;
    const sourceId = `metric-source-${metricIdStr}`;
    
    // Remove all layers that use this source before removing the source
    // For choropleth mode, there are two layers: fill and stroke
    try {
      if (map.getLayer && map.getLayer(strokeLayerId)) {
        map.removeLayer(strokeLayerId);
      }
    } catch (e) {
      // ignore
    }
    try {
      if (map.getLayer && map.getLayer(layerId)) {
        map.removeLayer(layerId);
      }
    } catch (e) {
      // ignore
    }
    
    // Now safe to remove the source after all layers are removed
    try {
      if (map.getSource && map.getSource(sourceId)) {
        map.removeSource(sourceId);
      }
    } catch (e) {
      // ignore
    }
  }, []);

  // Reset map layers and state when city changes
  useEffect(() => {
    if (previousCityIdRef.current !== null && previousCityIdRef.current !== cityId) {
      // Store current state before clearing
      const currentMaps = maps;
      const currentSelectedIds = selectedMetricIds;
      
      // Clear selected metrics
      setSelectedMetricIds(new Set());
      
      // Clear map data
      setMaps([]);
      
      // Clear loading states
      setLoadingMaps(new Set());
      loadingMapsRef.current.clear();
      
      // Clear visible/hidden layers
      setVisibleLayers(new Set());
      setHiddenLayers(new Set());
      
      // Reset timeline
      setSelectedTimelineDate(null);
      setIsTimelinePlaying(false);
      currentAnimationDateRef.current = null;
      
      // Reset default/block metrics flags so new city gets correct layer defaults
      defaultMetricsSetRef.current = false;
      blockDefaultsSetRef.current = false;
      previousPlaceCircleRef.current = false;
      hasFitInitialBoundsRef.current = false;

      // Remove all metric layers from map
      if (mapInstanceRef.current) {
        const map = mapInstanceRef.current;
        // Get all metric layer IDs and remove them
        const allMetricIds = new Set<string>();
        currentMaps.forEach((m) => allMetricIds.add(String(m.metric_id)));
        currentSelectedIds.forEach((id) => allMetricIds.add(id));
        
        allMetricIds.forEach((id) => {
          removeMetricLayerFromMap(map, id);
        });
        
        // Reset map bounds - let parent CityMapView handle recentering
        // The map will be recentered when the new city's shapefiles load
      }
    }
    
    previousCityIdRef.current = cityId;
  }, [cityId, mapInstanceRef, maps, selectedMetricIds, removeMetricLayerFromMap]);

  // Stable key for placeCircle so effect doesn't re-run when parent passes a new object with same values
  const placeCircleKey = placeCircle
    ? `${placeCircle.lat},${placeCircle.lng},${placeCircle.radius_m}`
    : null;
  // Stable key for map-capable metric ids so effect doesn't re-run when array reference changes
  const mapCapableIdsKey = useMemo(
    () =>
      metricsWithMapCapability
        .map((m) => m.id)
        .sort((a, b) => a - b)
        .join(","),
    [metricsWithMapCapability]
  );
  const layerSelectorMetricIdsKey = useMemo(
    () =>
      metricsForLayerSelector
        .map((metric) => metric.id)
        .sort((a, b) => a - b)
        .join(","),
    [metricsForLayerSelector]
  );
  // Compute sorted metrics and position-based color mapping (needed for default layer selection)
  // This ensures each metric gets a unique, stable color based on its position in the list
  // Colors remain the same whether the metric is toggled on or off
  const metricColorMapping = useMemo(() => {
    // Build ordering map from dashboard ordering data (same logic as panel building)
    const orderingMap = new Map<number, { categoryOrder: number; metricOrder: number; categoryName: string }>();
    if (orderingData?.orderings) {
      orderingData.orderings.forEach((o) => {
        if (o.metric_id) {
          orderingMap.set(o.metric_id, {
            categoryOrder: o.category_order,
            metricOrder: o.metric_order,
            categoryName: o.category_name,
          });
        }
      });
    }

    // When a saved place is selected, use only metrics with working location columns; otherwise all active (same as panel)
    const filteredMetrics = metricsForLayerSelector;

    // Sort metrics using dashboard ordering, then fall back to template order
    const sortedMetrics = [...filteredMetrics].sort((a, b) => {
      const orderA = orderingMap.get(a.id);
      const orderB = orderingMap.get(b.id);

      // If both have dashboard ordering, use that
      if (orderA && orderB) {
        if (orderA.categoryOrder !== orderB.categoryOrder) {
          return orderA.categoryOrder - orderB.categoryOrder;
        }
        return orderA.metricOrder - orderB.metricOrder;
      }

      // If only one has ordering, prioritize the one with ordering
      if (orderA) return -1;
      if (orderB) return 1;

      // Fall back to template order for metrics without dashboard ordering
      const templateOrderA = getOrderForTemplate(a.template_id);
      const templateOrderB = getOrderForTemplate(b.template_id);
      if (templateOrderA !== templateOrderB) {
        return templateOrderA - templateOrderB;
      }

      // Final fallback: alphabetical by name
      return (a.metric_name || "").localeCompare(b.metric_name || "");
    });

    // Create position-based color mapping: metric ID -> position index
    const positionMap = new Map<string, number>();
    sortedMetrics.forEach((metric, index) => {
      positionMap.set(String(metric.id), index % LAYER_COLOR_PALETTE.length);
    });

    // First metric in user's sorted list that has map capability (map_query or has_map_fields)
    const hasMapCapability = (m: AdminMetricListItem) => {
      const hasMapQuery = m.map_query != null && String(m.map_query).trim().length > 0;
      return hasMapQuery || m.has_map_fields === true;
    };
    const firstMapCapableMetricId =
      sortedMetrics.find(hasMapCapability)?.id ?? null;

    return { positionMap, orderingMap, sortedMetrics, firstMapCapableMetricId };
  }, [metricsForLayerSelector, orderingData]);

  // Get color index for a metric based on its position in the sorted list
  // This ensures each metric gets a unique color that remains stable
  // whether the metric is toggled on or off
  const getColorIndexForMetric = useCallback((metricOrId: AdminMetricListItem | string): number => {
    const metricId = typeof metricOrId === "string" ? metricOrId : String(metricOrId.id);
    // Use position-based color if available, otherwise fall back to modulo of ID
    const positionColor = metricColorMapping.positionMap.get(metricId);
    if (positionColor !== undefined) {
      return positionColor;
    }
    // Fallback for metrics not in the sorted list (shouldn't happen normally)
    return parseInt(metricId, 10) % LAYER_COLOR_PALETTE.length;
  }, [metricColorMapping.positionMap]);

  // Default layer selection:
  // - My place (placeCircle): all map-capable metrics on.
  // - Citywide/District: only the first metric in the user's sorted list that has a map query (map capability).
  useEffect(() => {
    if (orderingQuery.isLoading) {
      return;
    }

    if (placeCircle) {
      if (metricsForLayerSelector.length > 0) {
        const newIds = new Set(metricsForLayerSelector.map((m) => String(m.id)));
        setSelectedMetricIds((prev) => {
          if (prev.size !== newIds.size || [...prev].some((id) => !newIds.has(id))) {
            return newIds;
          }
          return prev;
        });
        setHiddenLayers((prev) => (prev.size > 0 ? new Set() : prev));
        blockDefaultsSetRef.current = true;
      } else {
        setSelectedMetricIds((prev) => (prev.size > 0 ? new Set() : prev));
        setHiddenLayers((prev) => (prev.size > 0 ? new Set() : prev));
      }
      previousPlaceCircleRef.current = true;
      return;
    }

    // Citywide or District view: default to a single metric — the first in the user's sorted list that has a map query.
    blockDefaultsSetRef.current = false;
    const shouldApplyCityDefault =
      previousPlaceCircleRef.current || !defaultMetricsSetRef.current;
    previousPlaceCircleRef.current = false;

    if (!shouldApplyCityDefault || availableMetrics.length === 0) {
      return;
    }

    const firstMapCapableId = metricColorMapping.firstMapCapableMetricId;
    const nextDefaultIds =
      firstMapCapableId != null
        ? new Set([String(firstMapCapableId)])
        : new Set<string>();

    setSelectedMetricIds((prev) => {
      if (prev.size !== nextDefaultIds.size || [...prev].some((id) => !nextDefaultIds.has(id))) {
        return nextDefaultIds;
      }
      return prev;
    });
    setHiddenLayers((prev) => (prev.size > 0 ? new Set() : prev));
    defaultMetricsSetRef.current = true;
  }, [
    availableMetrics,
    placeCircleKey,
    layerSelectorMetricIdsKey,
    placeCircle,
    metricsForLayerSelector,
    orderingQuery.isLoading,
    metricColorMapping.firstMapCapableMetricId,
  ]);

  // Note: React Query now handles tracking loaded/attempted metrics via its cache
  // The useMapLayersData hook provides automatic caching with 15-minute staleTime
  // and 30-minute gcTime, so toggling layers on/off uses cached data

  // Helper to extract date from feature properties
  const getDateFromFeature = useCallback((feature: any): Date | null => {
    const props = feature.properties || {};
    
    // First check if we stored the date directly
    if (props._featureDate) {
      const date = new Date(props._featureDate);
      if (!isNaN(date.getTime())) return date;
    }
    
    const dateFields = [
      "incident_datetime",
      "date",
      "opened",
      "timestamp",
      "datetime",
      "time_period",
      "period_date",
      "created_at",
      "occurred",
      "incident_date",
      "report_datetime",
      "date_issued",
      "date_filed",
    ];
    
    for (const field of dateFields) {
      const value = props[field];
      if (value) {
        const date = typeof value === "string" ? new Date(value) : value;
        if (date instanceof Date && !isNaN(date.getTime())) {
          return date;
        }
      }
    }
    
    // Check dates field (for aggregated points)
    if (props.dates) {
      const dateStr = typeof props.dates === "string" ? props.dates.split(",")[0].trim() : null;
      if (dateStr) {
        const date = new Date(dateStr);
        if (!isNaN(date.getTime())) return date;
      }
    }
    
    return null;
  }, []);

  // Calculate opacity and color based on selected date and 7-day fade tail
  const calculateFeatureStyle = useCallback((feature: any, selectedDate: string | null, isPlaying: boolean): { opacity: number; useGrey: boolean } => {
    if (!selectedDate) {
      return { opacity: 0.8, useGrey: false }; // Default opacity when no date selected
    }
    
    const featureDate = getDateFromFeature(feature);
    if (!featureDate) {
      return { opacity: 0.0, useGrey: false }; // Hide features without dates
    }
    
    const selectedDateObj = new Date(selectedDate);
    const featureDateKey = featureDate.toISOString().split("T")[0];
    const selectedDateKey = selectedDateObj.toISOString().split("T")[0];
    
    // Calculate days difference
    const daysDiff = Math.floor((featureDate.getTime() - selectedDateObj.getTime()) / (1000 * 60 * 60 * 24));
    
    // Exact match - full opacity, original color
    if (featureDateKey === selectedDateKey) {
      return { opacity: 1.0, useGrey: false };
    }
    
    // If playing, show 7-day fade tail with greying
    if (isPlaying) {
      // Within 7 days before - fade out smoothly to transparent
      if (daysDiff < 0 && daysDiff >= -7) {
        const fadeProgress = (7 + daysDiff) / 7; // 1.0 (current) to 0.0 (7 days ago)
        // Smooth fade from full opacity to completely transparent
        // Ensure opacity never goes above what it should be for the current date
        return {
          opacity: Math.max(0, fadeProgress), // Fade from 1.0 to 0.0, ensure non-negative
          useGrey: daysDiff < -3, // Start greying after 3 days
        };
      }
      // Older than 7 days - completely transparent
      if (daysDiff < -7) {
        return { opacity: 0.0, useGrey: true };
      }
      // Future dates - always transparent during animation
      if (daysDiff > 0) {
        return { opacity: 0.0, useGrey: false };
      }
    } else {
      // When not playing, only show exact match (others are transparent)
      return { opacity: featureDateKey === selectedDateKey ? 1.0 : 0.0, useGrey: false };
    }
    
    // Default: transparent
    return { opacity: 0.0, useGrey: false };
  }, [getDateFromFeature]);

  // Keep a ref copy of loadingMaps to avoid stale-closure checks in callbacks
  useEffect(() => {
    loadingMapsRef.current = loadingMaps;
  }, [loadingMaps]);

  const dateKey = `${metricDateRange?.start_date || ""}|${metricDateRange?.end_date || ""}`;

  // When date range changes, remove existing metric layers from map (React Query will handle refetching)
  useEffect(() => {
    if (mapInstanceRef.current) {
      const map = mapInstanceRef.current;
      const idsToRemove = new Set<string>();
      selectedMetricIds.forEach((id) => idsToRemove.add(id));
      maps.forEach((m) => idsToRemove.add(String(m.metric_id)));
      idsToRemove.forEach((id) => removeMetricLayerFromMap(map, id));
    }
    // React Query's cache key includes date range, so it will automatically fetch new data
    // when the date range changes (cache miss for new date range)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateKey]);

  const queryClient = useQueryClient();

  // When district changes, remove metric layers from map (React Query handles data by cache key)
  useEffect(() => {
    if (!mapInstanceRef.current) return;
    
    // Remove layers - React Query will provide new data automatically via cache key change
    selectedMetricIds.forEach((metricIdStr) => {
      removeMetricLayerFromMap(mapInstanceRef.current, metricIdStr);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDistrict]);

  // When switching saved-place scope and citywide, remove metric layers so new data (different placeCircle) loads cleanly
  useEffect(() => {
    if (!mapInstanceRef.current) return;
    const map = mapInstanceRef.current;
    const idsToRemove = new Set<string>();
    selectedMetricIds.forEach((id) => idsToRemove.add(id));
    maps.forEach((m) => idsToRemove.add(String(m.metric_id)));
    idsToRemove.forEach((id) => removeMetricLayerFromMap(map, id));
    // React Query cache key includes placeCircle, so citywide vs saved-place data will refetch automatically
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [placeCircleKey]);

  // Helper to convert ISO week format (2025-W02) to start/end dates
  const parseISOWeekToDateRange = useCallback((isoWeek: string): { start: Date; end: Date } | null => {
    const match = isoWeek.match(/^(\d{4})-W(\d{2})$/);
    if (!match) return null;
    
    const year = parseInt(match[1], 10);
    const weekNum = parseInt(match[2], 10);
    
    // Calculate the Monday of the given ISO week
    // Jan 4 is always in week 1
    const jan4 = new Date(year, 0, 4);
    const jan4Day = jan4.getDay() || 7; // Convert Sunday (0) to 7
    const week1Monday = new Date(year, 0, 4 - jan4Day + 1);
    
    const weekStart = new Date(week1Monday);
    weekStart.setDate(weekStart.getDate() + (weekNum - 1) * 7);
    
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 6);
    
    return { start: weekStart, end: weekEnd };
  }, []);

  // Helper to expand a date string to a range based on period type
  const expandDateToRange = useCallback((dateStr: string, periodType: string): { start: Date; end: Date } | null => {
    // Check for ISO week format first
    if (dateStr.includes("-W")) {
      return parseISOWeekToDateRange(dateStr);
    }
    
    // Parse as regular date
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return null;
    
    if (periodType === "week") {
      // Expand to full week (Monday to Sunday)
      const day = date.getDay();
      const diff = date.getDate() - day + (day === 0 ? -6 : 1); // Adjust when day is Sunday
      const monday = new Date(date);
      monday.setDate(diff);
      const sunday = new Date(monday);
      sunday.setDate(sunday.getDate() + 6);
      return { start: monday, end: sunday };
    } else if (periodType === "month") {
      // Expand to full month
      const monthStart = new Date(date.getFullYear(), date.getMonth(), 1);
      const monthEnd = new Date(date.getFullYear(), date.getMonth() + 1, 0);
      return { start: monthStart, end: monthEnd };
    } else {
      // Day or unknown - use the date as-is
      return { start: date, end: date };
    }
  }, [parseISOWeekToDateRange]);

  // Anomaly mode: Load map data for the anomaly's metric filtered to the recent period
  useEffect(() => {
    if (!selectedAnomaly || !isActive) {
      // Clear anomaly mode data when exiting anomaly mode
      setAnomalyModeMap(null);
      return;
    }

    // Extract the recent period date range from the anomaly's chart_payload
    const chartPayload = selectedAnomaly.chart_payload;
    if (!chartPayload || !chartPayload.dates || !chartPayload.periods) {
      setAnomalyModeMap(null);
      return;
    }

    const dates = chartPayload.dates as string[];
    const periods = chartPayload.periods as string[];
    const periodType = selectedAnomaly.period_type || "week";

    // Collect all "recent" period dates and expand them based on period type
    let minDate: Date | null = null;
    let maxDate: Date | null = null;
    
    dates.forEach((dateStr, idx) => {
      if (periods[idx] === "recent") {
        const range = expandDateToRange(dateStr, periodType);
        if (range) {
          if (!minDate || range.start < minDate) {
            minDate = range.start;
          }
          if (!maxDate || range.end > maxDate) {
            maxDate = range.end;
          }
        }
      }
    });

    if (!minDate || !maxDate) {
      setAnomalyModeMap(null);
      return;
    }

    const finalMinDate: Date = minDate;
    const finalMaxDate: Date = maxDate;

    // Format dates for API (YYYY-MM-DD)
    const formatDateForAPI = (d: Date): string => {
      return d.toISOString().split('T')[0];
    };
    
    const startDate = formatDateForAPI(finalMinDate);
    const endDate = formatDateForAPI(finalMaxDate);

    const loadAnomalyMapData = async () => {
      setAnomalyModeLoading(true);
      try {
        const token = await getAccessTokenSilently();
        
        // Build request payload with the recent period date range
        const requestPayload: GetMapDataRequest = {
          metric_id: selectedAnomaly.metric_id,
          start_date: startDate,
          end_date: endDate,
        };
        
        // Add district filter if the anomaly has a specific district (not citywide)
        if (selectedAnomaly.district !== null && selectedAnomaly.district !== 0) {
          requestPayload.districts = [selectedAnomaly.district];
        }

        const response = await getMetricMapData(requestPayload, token);

        if (response.status === "success" && response.map_data) {
          // Parse location_data if it's a string
          let locationData = response.map_data.location_data;
          if (typeof locationData === "string") {
            try {
              locationData = JSON.parse(locationData);
            } catch {
              // ignore parse errors, use as-is
            }
          }

          // Filter points by group_field/group_value if the anomaly has grouping
          // This is critical - anomalies might be for specific categories (e.g., "Violent Crimes")
          // but the API returns all points for the metric
          const groupField = selectedAnomaly.group_field;
          const groupValue = selectedAnomaly.group_value;
          
          if (groupField && groupValue && Array.isArray(locationData)) {
            locationData = locationData.filter((point: MapDataPoint) => {
              const pointValue = point[groupField];
              // Support both exact match and case-insensitive match
              if (pointValue === groupValue) return true;
              if (typeof pointValue === "string" && typeof groupValue === "string") {
                return pointValue.toLowerCase() === groupValue.toLowerCase();
              }
              return false;
            });
          }

          // Create a modified map_data with the filtered location_data (preserve map_config for default_view/available_views)
          const filteredMapData: MapData = {
            ...response.map_data,
            location_data: locationData,
          };
          
          setAnomalyModeMap(filteredMapData);
        } else {
          setAnomalyModeMap(null);
        }
      } catch (err: any) {
        console.error("[Anomaly Mode] Error loading map data:", err);
        setAnomalyModeMap(null);
      } finally {
        setAnomalyModeLoading(false);
      }
    };

    loadAnomalyMapData();
  }, [selectedAnomaly, isActive, getAccessTokenSilently, expandDateToRange]);

  // Anomaly mode: Hide regular layers and show anomaly layer when in anomaly mode
  useEffect(() => {
    if (!mapInstanceRef.current || !isActive) return;
    
    const map = mapInstanceRef.current;
    const isLoaded = map.isStyleLoaded && map.isStyleLoaded();
    if (!isLoaded) return;

    if (isAnomalyMode) {
      // Hide all regular metric layers
      maps.forEach((mapData) => {
        const layerId = `metric-layer-${mapData.metric_id}`;
        const strokeLayerId = `${layerId}-stroke`;
        
        if (map.getLayer(layerId)) {
          map.setLayoutProperty(layerId, "visibility", "none");
        }
        if (map.getLayer(strokeLayerId)) {
          map.setLayoutProperty(strokeLayerId, "visibility", "none");
        }
      });

      // Add/update anomaly mode layer
      if (anomalyModeMap) {
        const anomalyLayerId = "anomaly-mode-layer";
        const anomalySourceId = "anomaly-mode-source";

        // Parse location data
        let locationData: MapDataPoint[] = [];
        if (typeof anomalyModeMap.location_data === "string") {
          try {
            locationData = JSON.parse(anomalyModeMap.location_data);
          } catch {
            // ignore parse errors
          }
        } else if (Array.isArray(anomalyModeMap.location_data)) {
          locationData = anomalyModeMap.location_data;
        }

        // Convert to GeoJSON features
        const features: any[] = [];
        let minLng = 180, maxLng = -180, minLat = 90, maxLat = -90;
        let hasValidBounds = false;

        locationData.forEach((item: any) => {
          let coordinates: [number, number] | null = null;
          
          if (item.lon !== undefined && item.lat !== undefined) {
            coordinates = normalizeMapPointForDisplay(item.lon, item.lat);
          } else if (item.location?.coordinates) {
            const coords = item.location.coordinates;
            if (Array.isArray(coords) && coords.length >= 2) {
              coordinates = normalizeMapPointForDisplay(coords[0], coords[1]);
            }
          } else if (item.coordinates && Array.isArray(item.coordinates)) {
            const coords = item.coordinates;
            if (coords.length >= 2) {
              coordinates = normalizeMapPointForDisplay(coords[0], coords[1]);
            }
          }

          if (coordinates) {
            // Update bounds
            if (coordinates[0] < minLng) minLng = coordinates[0];
            if (coordinates[0] > maxLng) maxLng = coordinates[0];
            if (coordinates[1] < minLat) minLat = coordinates[1];
            if (coordinates[1] > maxLat) maxLat = coordinates[1];
            hasValidBounds = true;

            features.push({
              type: "Feature",
              properties: {
                ...item,
                color: ANOMALY_MODE_COLOR,
              },
              geometry: { type: "Point", coordinates },
            });
          }
        });

        // Remove existing anomaly layer/source if they exist
        if (map.getLayer(anomalyLayerId)) {
          map.removeLayer(anomalyLayerId);
        }
        if (map.getSource(anomalySourceId)) {
          map.removeSource(anomalySourceId);
        }

        // Add source and layer
        map.addSource(anomalySourceId, {
          type: "geojson",
          data: {
            type: "FeatureCollection",
            features,
          },
        });

        map.addLayer({
          id: anomalyLayerId,
          type: "circle",
          source: anomalySourceId,
          paint: {
            "circle-radius": 5,
            "circle-color": ANOMALY_MODE_COLOR,
            "circle-stroke-color": "#ffffff",
            "circle-stroke-width": 1.5,
            "circle-opacity": 0.9,
          },
        });

        // Fit map to anomaly data bounds
        if (hasValidBounds && (window as any).mapboxgl) {
          try {
            const fittedBounds = getClampedBounds(
              { sw: [minLng, minLat], ne: [maxLng, maxLat] },
              scopeBoundaryBounds,
            );
            if (fittedBounds) {
              const bounds = new (window as any).mapboxgl.LngLatBounds();
              bounds.extend(fittedBounds.sw);
              bounds.extend(fittedBounds.ne);
              map.fitBounds(bounds, {
                padding: 50,
                maxZoom: 15,
                duration: 500,
              });
            }
          } catch {
            // ignore bounds fitting errors
          }
        }

        // Add click handler for anomaly points
        map.on("click", anomalyLayerId, (e: any) => {
          const clickedFeatures = map.queryRenderedFeatures(e.point, {
            layers: [anomalyLayerId],
          });
          if (clickedFeatures.length > 0) {
            const props = clickedFeatures[0].properties || {};
            
            // Build popup HTML
            let popupHTML = `<div><strong>Anomaly Data Point</strong>`;
            
            // Show key properties
            const excludedFields = new Set(['color', 'lon', 'lat', 'coordinates', 'location']);
            const entries = Object.entries(props)
              .filter(([key]) => !excludedFields.has(key) && !key.startsWith('_'))
              .slice(0, 8); // Limit to 8 fields
            
            entries.forEach(([key, value]) => {
              if (value !== null && value !== undefined && value !== '') {
                const displayKey = key.charAt(0).toUpperCase() + key.slice(1).replace(/_/g, ' ');
                popupHTML += `<br/><strong>${displayKey}:</strong> ${value}`;
              }
            });
            
            popupHTML += `</div>`;
            setSelectedPointDetails(popupHTML);
          }
        });

        map.on("mouseenter", anomalyLayerId, () => {
          map.getCanvas().style.cursor = "pointer";
        });
        map.on("mouseleave", anomalyLayerId, () => {
          map.getCanvas().style.cursor = "";
        });
      }
    } else {
      // Exiting anomaly mode - remove anomaly layer and restore regular layers
      const anomalyLayerId = "anomaly-mode-layer";
      const anomalySourceId = "anomaly-mode-source";
      
      if (map.getLayer(anomalyLayerId)) {
        map.removeLayer(anomalyLayerId);
      }
      if (map.getSource(anomalySourceId)) {
        map.removeSource(anomalySourceId);
      }

      // Restore visibility of regular metric layers
      maps.forEach((mapData) => {
        const uniqueId = String(mapData.metric_id);
        const layerId = `metric-layer-${uniqueId}`;
        const strokeLayerId = `${layerId}-stroke`;
        const isSelected = selectedMetricIds.has(uniqueId);
        const shouldBeVisible = isSelected && !hiddenLayers.has(uniqueId);
        
        if (map.getLayer(layerId)) {
          map.setLayoutProperty(layerId, "visibility", shouldBeVisible ? "visible" : "none");
        }
        if (map.getLayer(strokeLayerId)) {
          map.setLayoutProperty(strokeLayerId, "visibility", shouldBeVisible ? "visible" : "none");
        }
      });
    }
  }, [isAnomalyMode, anomalyModeMap, maps, selectedMetricIds, hiddenLayers, isActive, mapInstanceRef]);

  // Process map features from location data
  const mapFeatures = useMemo(() => {
    if (!maps || maps.length === 0) return [];

    return maps.map((mapData) => {
      try {
        let locationData: MapDataPoint[] = [];
        
        // Parse location data
        if (typeof mapData.location_data === "string") {
          try {
            const parsed = JSON.parse(mapData.location_data);
            locationData = Array.isArray(parsed) ? parsed : [];
          } catch {
            return null;
          }
        } else if (Array.isArray(mapData.location_data)) {
          locationData = mapData.location_data;
        }

        const pointCount = locationData.length;

        // Use choropleth rendering if:
        // 1. Auto-detect: many individual points that would be illegible as dots, OR
        // 2. Explicit: the map was created/saved with map_type="choropleth" or "delta",
        //    which means the location_data is already pre-aggregated to one row per district
        //    (few rows with `district` + `count` but no lat/lon coordinates).
        const explicitMapType = (mapData.type as string | undefined) ||
          (mapData.map_config?.map_type as string | undefined) ||
          (mapData.map_config?.default_view?.type as string | undefined);
        const isExplicitChoropleth =
          explicitMapType === "choropleth" || explicitMapType === "delta";

        const mapCfg = mapData.map_config && typeof mapData.map_config === "object"
          ? (mapData.map_config as Record<string, unknown>)
          : {};
        const shapeLayerWiring =
          mapCfg.default_view != null &&
          typeof mapCfg.default_view === "object" &&
          (mapCfg.default_view as { shape_layer_instance_id?: unknown }).shape_layer_instance_id != null;
        const hasAvailableShapeLayers =
          Array.isArray(mapCfg.available_shape_layers) && mapCfg.available_shape_layers.length > 0;

        // Also detect pre-aggregated district data heuristically: rows have a count
        // and at least one district-like identifier field but no lat/lon coordinates.
        // Note: we no longer rely on a generic "district" key — the backend now stores
        // the actual field name (e.g. "supervisor_district") directly in each row.
        const firstRow = locationData[0] as any;
        const configuredDistrictField =
          (mapData.map_config?.district_field as string | undefined) ||
          (mapData.map_config?.identifier_field as string | undefined) ||
          undefined;
        const DISTRICT_LIKE_FIELDS = [
          'district', 'supervisor_district', 'sup_dist_num', 'council_district',
          'ward', 'precinct', 'neighborhood', 'zone', 'borough',
        ];
        const rowHasDistrictLikeField = (row: any) =>
          DISTRICT_LIKE_FIELDS.some((f) => row?.[f] !== undefined) ||
          (configuredDistrictField ? row?.[configuredDistrictField] !== undefined : false);
        const hasDistrictLikeField =
          locationData.some((row: any) => rowHasDistrictLikeField(row));

        const anyRowHasPointGeometry = locationData.some((row) => mapPointHasCoordinates(row));

        const hasNumericMeasure = (row: any) =>
          row?.count !== undefined ||
          row?.value !== undefined ||
          row?.total !== undefined;

        const isPreAggregatedDistrict =
          pointCount > 0 &&
          pointCount <= 500 &&
          hasNumericMeasure(firstRow) &&
          hasDistrictLikeField &&
          !mapPointHasCoordinates(firstRow);

        // District-tabular metrics: map query / data has no point geometry but rows tie to
        // districts; city shape wiring (structure) supplies boundaries in addLayersToMap.
        const shouldUseDistrictChoroplethNoGeometry =
          pointCount > 0 && !anyRowHasPointGeometry && hasDistrictLikeField;

        // Only use choropleth when we can plausibly aggregate by district.
        // Otherwise, keep point rendering as a safe fallback to avoid empty layers.
        const canAutoAggregateByDistrict = hasDistrictLikeField;
        const shouldAutoUseChoropleth = pointCount > 1000 && canAutoAggregateByDistrict;
        const explicitChoroplethWithShapeWiring =
          isExplicitChoropleth &&
          (shapeLayerWiring || hasAvailableShapeLayers) &&
          (hasDistrictLikeField ||
            (typeof mapCfg.district_field === "string" && String(mapCfg.district_field).trim().length > 0));
        const shouldExplicitlyUseChoropleth =
          (isExplicitChoropleth && canAutoAggregateByDistrict) || explicitChoroplethWithShapeWiring;
        const useChoropleth =
          shouldAutoUseChoropleth ||
          shouldExplicitlyUseChoropleth ||
          isPreAggregatedDistrict ||
          shouldUseDistrictChoroplethNoGeometry;

        if (locationData.length === 0) {
          return {
            mapData,
            uniqueId: String(mapData.metric_id),
            colorIndex: getColorIndexForMetric(String(mapData.metric_id)),
            layerColor: LAYER_COLOR_PALETTE[getColorIndexForMetric(String(mapData.metric_id)) % LAYER_COLOR_PALETTE.length],
            features: [],
            bounds: null,
            hasData: false,
            pointCount: 0,
            useChoropleth: false,
          };
        }

        // If using choropleth, we'll handle it differently
        if (useChoropleth) {
          return {
            mapData,
            uniqueId: String(mapData.metric_id),
            colorIndex: getColorIndexForMetric(String(mapData.metric_id)),
            layerColor: LAYER_COLOR_PALETTE[getColorIndexForMetric(String(mapData.metric_id)) % LAYER_COLOR_PALETTE.length],
            features: [],
            bounds: null,
            hasData: true,
            pointCount,
            useChoropleth: true,
            locationData, // Keep raw data for choropleth processing
          };
        }

        // Aggregate overlapping points
        const pointGroups = new Map<string, any[]>();
        
        locationData.forEach((item: any) => {
          let coordinates: [number, number] | null = null;
          
          if (item.lon !== undefined && item.lat !== undefined) {
            coordinates = normalizeMapPointForDisplay(item.lon, item.lat);
          } else if (item.location?.coordinates) {
            const coords = item.location.coordinates;
            if (Array.isArray(coords) && coords.length >= 2) {
              coordinates = normalizeMapPointForDisplay(coords[0], coords[1]);
            }
          } else if (item.coordinates && Array.isArray(item.coordinates)) {
            const coords = item.coordinates;
            if (coords.length >= 2) {
              coordinates = normalizeMapPointForDisplay(coords[0], coords[1]);
            }
          }

          if (coordinates) {
            const latRounded = Math.round(coordinates[1] * 1000000) / 1000000;
            const lonRounded = Math.round(coordinates[0] * 1000000) / 1000000;
            const coordKey = `${latRounded},${lonRounded}`;
            
            if (!pointGroups.has(coordKey)) {
              pointGroups.set(coordKey, []);
            }
            pointGroups.get(coordKey)!.push({ ...item, coordinates });
          }
        });

        // Convert to GeoJSON features
        const features: any[] = [];
        let minLng = 180, maxLng = -180, minLat = 90, maxLat = -90;
        let hasValidBounds = false;

        pointGroups.forEach((points, coordKey) => {
          const [latStr, lonStr] = coordKey.split(",");
          const lat = parseFloat(latStr);
          const lon = parseFloat(lonStr);
          const coordinates: [number, number] = [lon, lat];
          
          if (lon < minLng) minLng = lon;
          if (lon > maxLng) maxLng = lon;
          if (lat < minLat) minLat = lat;
          if (lat > maxLat) maxLat = lat;
          hasValidBounds = true;

          if (points.length === 1) {
            const item = points[0];
            const featureDate = getDateFromFeature({ properties: item });
            // Check if this point has media
            const mediaItems = extractMediaFromPoint(item, coordinates);
            const hasMedia = mediaItems.length > 0;
            features.push({
              type: "Feature",
              properties: {
                title: item.title || item.name || "Point",
                description: item.description || "",
                value: item.value || 1,
                count: 1,
                color: LAYER_COLOR_PALETTE[getColorIndexForMetric(String(mapData.metric_id)) % LAYER_COLOR_PALETTE.length],
                mapTitle: mapData.title,
                mapId: String(mapData.metric_id),
                _featureDate: featureDate ? featureDate.toISOString() : null,
                hasMedia, // Flag indicating this point has media
                ...item, // Include all other properties
              },
              geometry: { type: "Point", coordinates },
            });
          } else {
            // Aggregate multiple points
            const count = points.length;
            const scale = Math.min(0.4 + (Math.log(count) * 0.2), 1.5);
            
            // Collect unique categories and dates from aggregated points
            const categoryFields = new Map<string, Set<string>>();
            const dateFields = new Set<string>();
            const allFields: Record<string, any> = {};
            
            // Collect all unique values for each field
            points.forEach((item: any) => {
              Object.keys(item).forEach((key) => {
                // Skip coordinate-related fields
                if (['lon', 'lat', 'coordinates', 'location'].includes(key)) {
                  return;
                }
                
                const value = item[key];
                if (value === null || value === undefined || value === '') {
                  return;
                }
                
                // Track category-like fields (non-numeric, non-date strings)
                if (typeof value === 'string' && value.length > 0) {
                  // Check if it looks like a date
                  const datePattern = /^\d{4}-\d{2}-\d{2}/;
                  if (datePattern.test(value)) {
                    dateFields.add(value);
                  } else {
                    // Likely a category field
                    if (!categoryFields.has(key)) {
                      categoryFields.set(key, new Set());
                    }
                    categoryFields.get(key)!.add(value);
                  }
                }
                
                // Store all fields (for non-category/date fields)
                if (!allFields[key]) {
                  allFields[key] = value;
                }
              });
            });
            
            // Get earliest date from aggregated points for timeline
            let earliestDate: Date | null = null;
            points.forEach((item: any) => {
              const date = getDateFromFeature({ properties: item });
              if (date && (!earliestDate || date < earliestDate)) {
                earliestDate = date;
              }
            });
            
            // Build aggregated properties
            const featureDateStr = earliestDate ? (earliestDate as Date).toISOString() : null;
            const aggregatedProps: Record<string, any> = {
              title: `${count} points at this location`,
              description: `Aggregated data from ${count} points`,
              value: count,
              count,
              scale,
              color: LAYER_COLOR_PALETTE[getColorIndexForMetric(String(mapData.metric_id)) % LAYER_COLOR_PALETTE.length],
              mapTitle: mapData.title,
              mapId: String(mapData.metric_id),
              _isAggregated: true,
              _featureDate: featureDateStr,
            };
            
            // Add category summaries
            if (categoryFields.size > 0) {
              categoryFields.forEach((values, fieldName) => {
                const uniqueValues = Array.from(values);
                if (uniqueValues.length <= 5) {
                  aggregatedProps[`${fieldName}_categories`] = uniqueValues.join(', ');
                } else {
                  aggregatedProps[`${fieldName}_categories`] = `${uniqueValues.slice(0, 3).join(', ')} and ${uniqueValues.length - 3} more`;
                }
                aggregatedProps[`${fieldName}_count`] = uniqueValues.length;
              });
            }
            
            // Add date summaries
            if (dateFields.size > 0) {
              const sortedDates = Array.from(dateFields).sort();
              if (sortedDates.length === 1) {
                aggregatedProps.dates = sortedDates[0];
              } else if (sortedDates.length <= 3) {
                aggregatedProps.dates = sortedDates.join(', ');
              } else {
                aggregatedProps.dates = `${sortedDates[0]} to ${sortedDates[sortedDates.length - 1]}`;
                aggregatedProps.date_count = sortedDates.length;
              }
            }
            
            // Include all other fields from the first point (as representative)
            Object.assign(aggregatedProps, allFields);
            
            // Check if any of the aggregated points have media
            let hasMedia = false;
            for (const point of points) {
              const mediaItems = extractMediaFromPoint(point, coordinates);
              if (mediaItems.length > 0) {
                hasMedia = true;
                break;
              }
            }
            aggregatedProps.hasMedia = hasMedia;
            
            features.push({
              type: "Feature",
              properties: aggregatedProps,
              geometry: { type: "Point", coordinates },
            });
          }
        });

        return {
          mapData,
          uniqueId: String(mapData.metric_id),
          colorIndex: getColorIndexForMetric(String(mapData.metric_id)),
          layerColor: LAYER_COLOR_PALETTE[getColorIndexForMetric(String(mapData.metric_id)) % LAYER_COLOR_PALETTE.length],
          features,
          bounds: hasValidBounds ? { sw: [minLng, minLat], ne: [maxLng, maxLat] } : null,
          hasData: true,
          pointCount,
          useChoropleth: false,
        };
      } catch (err) {
        console.error("Error processing map data:", err);
        return null;
      }
    }).filter(Boolean) as any[];
  }, [maps, getColorIndexForMetric, getDateFromFeature]);

  // Helper to find district field from city structure
  const findDistrictField = useCallback((structureData: CityStructureData | undefined): { field: string; shapefile: any; districtFields: string[] } | null => {
    if (!structureData) return null;

    // Common geographic structure keywords (ordered by priority for district-based data)
    const districtKeywords = [
      'district', 'council', 'ward', 'precinct', 'borough', 
      'community', 'neighborhood', 'zone', 'region', 'area'
    ];
    
    // Helper to check if a string contains any district-related keyword
    const containsDistrictKeyword = (str: string | undefined | null): boolean => {
      if (!str) return false;
      const lower = str.toLowerCase();
      return districtKeywords.some(kw => lower.includes(kw));
    };

    // Get all district field names from city structure (including district_fields list)
    const districtFields: string[] = [];
    if (structureData.district_fields && Array.isArray(structureData.district_fields)) {
      districtFields.push(...structureData.district_fields);
    }
    if (structureData.district_field && !districtFields.includes(structureData.district_field)) {
      districtFields.push(structureData.district_field);
    }

    // Look for geographic structures with district-related names
    const districtStructure = structureData.geographic_structures?.find(
      (gs) => containsDistrictKeyword(gs.structure_name) ||
              containsDistrictKeyword(gs.structure_type)
    );

    if (districtStructure && districtStructure.identifier_field) {
      // Add identifier_field to district fields if not already present
      if (!districtFields.includes(districtStructure.identifier_field)) {
        districtFields.push(districtStructure.identifier_field);
      }
      
      // Find matching shapefile
      const shapefile = structureData.shapefiles?.find(
        (sf) => sf.geographic_structure_id === districtStructure.id
      );

      if (shapefile) {
        return {
          field: districtStructure.identifier_field,
          shapefile,
          districtFields,
        };
      }
    }

    // Fallback: look for query configs with district fields
    const districtQueryConfig = structureData.query_configs?.find(
      (qc) => containsDistrictKeyword(qc.identifier_field) ||
              containsDistrictKeyword(qc.structure_type)
    );

    if (districtQueryConfig && districtQueryConfig.identifier_field) {
      // Add identifier_field to district fields if not already present
      if (!districtFields.includes(districtQueryConfig.identifier_field)) {
        districtFields.push(districtQueryConfig.identifier_field);
      }
      
      // Find matching shapefile
      const shapefile = structureData.shapefiles?.find(
        (sf) => sf.structure_type === districtQueryConfig.structure_type
      );

      if (shapefile) {
        return {
          field: districtQueryConfig.identifier_field,
          shapefile,
          districtFields,
        };
      }
    }

    // If we have district fields but no shapefile, still return the fields for matching
    if (districtFields.length > 0) {
      // Try to find any shapefile that might work
      const shapefile = structureData.shapefiles?.find(
        (sf) => containsDistrictKeyword(sf.structure_type)
      );
      
      if (shapefile) {
        return {
          field: districtFields[0],
          shapefile,
          districtFields,
        };
      }
    }

    return null;
  }, []);

  const scopeBoundaryBounds = useMemo((): MapBoundsBox | null => {
    const structureData = structureQuery.data;
    const shapefiles = Array.isArray(structureData?.shapefiles)
      ? structureData.shapefiles
      : [];
    if (shapefiles.length === 0) return null;

    const districtInfo = findDistrictField(structureData);
    const preferredShapefiles =
      districtInfo?.shapefile != null ? [districtInfo.shapefile] : shapefiles;

    if (selectedDistrict != null && selectedDistrict !== 0) {
      const normalizedSelectedDistrict = coerceDistrictIdentifier(selectedDistrict);
      const searchSets = [
        preferredShapefiles,
        shapefiles.filter((shapefile: { id?: number; geometry_data?: unknown; identifier_field?: string | null }) => !preferredShapefiles.includes(shapefile)),
      ];

      for (const shapefileSet of searchSets) {
        for (const shapefile of shapefileSet) {
          const geometryData = parseShapeGeometryData(shapefile?.geometry_data);
          if (!geometryData || geometryData.type !== "FeatureCollection") continue;

          for (const feature of geometryData.features || []) {
            const rawIdentifier =
              shapefile?.identifier_field != null
                ? feature?.properties?.[shapefile.identifier_field]
                : null;
            const normalizedIdentifier = coerceDistrictIdentifier(rawIdentifier);

            if (
              normalizedIdentifier != null &&
              normalizedSelectedDistrict != null &&
              normalizedIdentifier === normalizedSelectedDistrict
            ) {
              const featureBounds = buildFeatureBounds(feature);
              if (featureBounds) return featureBounds;
            }
          }
        }
      }
    }

    return buildShapefileBounds(preferredShapefiles) ?? buildShapefileBounds(shapefiles);
  }, [structureQuery.data, selectedDistrict, findDistrictField]);

  // Collect all features for timeline (must be before any conditional returns)
  const allFeatures = useMemo(() => {
    return mapFeatures.flatMap((featureData) => featureData.features || []);
  }, [mapFeatures]);

  // Handle timeline date selection - update both state and ref (must be before conditional returns)
  const handleTimelineDateSelect = useCallback((date: string | null) => {
    setSelectedTimelineDate(date);
    currentAnimationDateRef.current = date;
  }, []);

  // Handle animation state change - clear ref when stopping (must be before conditional returns)
  const handleAnimationStateChange = useCallback((isPlaying: boolean) => {
    setIsTimelinePlaying(isPlaying);
    if (!isPlaying) {
      currentAnimationDateRef.current = null;
    }
  }, []);

  // Update layer opacity and color based on timeline date
  const updateLayerOpacity = useCallback((map: any) => {
    if (!mapInstanceRef.current) return;
    
    mapFeatures.forEach((featureData: any) => {
      const { uniqueId, features, layerColor, useChoropleth } = featureData;
      const layerId = `metric-layer-${uniqueId}`;
      const sourceId = `metric-source-${uniqueId}`;
      
      if (!map.getLayer(layerId) || !map.getSource(sourceId)) return;
      
      // Skip choropleth layers (fill/line) - they don't support opacity transitions the same way
      if (useChoropleth) return;
      
      // Use ref date during animation to avoid state update delays
      const dateToUse = isTimelinePlaying && currentAnimationDateRef.current 
        ? currentAnimationDateRef.current 
        : selectedTimelineDate;
      
      // Update features with opacity and color based on selected date
      const updatedFeatures = features.map((feature: any) => {
        const style = calculateFeatureStyle(feature, dateToUse, isTimelinePlaying);
        const originalColor = feature.properties.color || layerColor;
        return {
          ...feature,
          properties: {
            ...feature.properties,
            _opacity: style.opacity,
            _useGrey: style.useGrey,
            _originalColor: originalColor,
          },
        };
      });
      
      // Update source data
      const source = map.getSource(sourceId);
      if (source && source.type === "geojson") {
        (source as any).setData({
          type: "FeatureCollection",
          features: updatedFeatures,
        });
      }
      
      // Update layer paint to use opacity and color properties with smooth transitions
      // Only update circle layers (skip fill/line choropleth layers)
      const layer = map.getLayer(layerId);
      if (layer) {
        try {
          // Only process circle layers (choropleth layers are fill/line and don't need this)
          if (layer.type !== 'circle') return;
          
          // Set transition duration - shorter when playing for more immediate updates
          // Use 0 duration for dots that should disappear immediately to prevent flash
          const transitionDuration = isTimelinePlaying ? 50 : 150;
          map.setPaintProperty(layerId, "circle-opacity-transition", {
            duration: transitionDuration, // Faster transition during animation
          });
          
          map.setPaintProperty(layerId, "circle-opacity", [
            "case",
            ["has", "_opacity"],
            ["get", "_opacity"],
            0, // Default opacity
          ]);
          
          // Update color - use grey if _useGrey is true, otherwise use original color
          // Only apply grey color if opacity is above 0 to prevent black flash
          map.setPaintProperty(layerId, "circle-color-transition", {
            duration: transitionDuration, // Match opacity transition
          });
          
          map.setPaintProperty(layerId, "circle-color", [
            "case",
            // If opacity is 0, use original color (won't be visible anyway)
            ["<", ["case", ["has", "_opacity"], ["get", "_opacity"], 0.8], 0.01],
            [
              "case",
              ["has", "_originalColor"],
              ["get", "_originalColor"],
              ["case", ["has", "color"], ["get", "color"], layerColor],
            ],
            // Otherwise, use grey if _useGrey is true
            [
              "case",
              ["get", "_useGrey"],
              "#808080", // Grey color for older dots
              [
                "case",
                ["has", "_originalColor"],
                ["get", "_originalColor"],
                ["case", ["has", "color"], ["get", "color"], layerColor],
              ],
            ],
          ]);
        } catch {
          // skip if layer type check fails or layer doesn't support these properties
        }
      }
    });
  }, [mapFeatures, selectedTimelineDate, isTimelinePlaying, calculateFeatureStyle]);

  // Add layers to map
  const addLayersToMap = useCallback((map: any) => {
    if (!maps || maps.length === 0) return;

    let bounds: any = null;
    let hasValidBounds = false;

    try {
      if ((window as any).mapboxgl && (window as any).mapboxgl.LngLatBounds) {
        bounds = new (window as any).mapboxgl.LngLatBounds();
      } else {
        console.error("MapboxGL LngLatBounds not available");
        return;
      }
    } catch (err) {
      console.error("Error creating LngLatBounds:", err);
      return;
    }

    mapFeatures.forEach((featureData: any) => {
      const { uniqueId, layerColor, features, bounds: layerBoundsData, hasData, useChoropleth, locationData } = featureData;
      
      if (!hasData) return;

      const layerId = `metric-layer-${uniqueId}`;
      const sourceId = `metric-source-${uniqueId}`;
      
      // Determine visibility
      const metricIdStr = String(featureData.mapData.metric_id);
      const isSelected = selectedMetricIds.has(metricIdStr);
      const isVisible = isSelected && !hiddenLayers.has(uniqueId);

      // Handle choropleth mode for >1000 points
      if (useChoropleth && locationData) {
        const districtInfo = findDistrictField(structureQuery.data);

        if (districtInfo && districtInfo.shapefile) {
          // Try to find district field - check city's district_fields list first, then common patterns
          // Extended list to handle various city naming conventions
          const possibleDistrictFields = [
            ...(districtInfo.districtFields || []), // Use city's district_fields list
            districtInfo.field,
            // Common district field names
            'district',
            'council_district',
            'council_dist',
            'cncldist',
            'supervisor_district',
            'sup_dist_num',
            'district_id',
            'district_num',
            'district_number',
            // Ward variants
            'ward',
            'ward_id',
            'ward_num',
            'ward_number',
            // Precinct variants  
            'precinct',
            'precinct_id',
            'pct',
            // Borough (NYC)
            'borough',
            'boro',
            'boro_nm',
            // Community board (NYC)
            'community_board',
            'cb',
            'cb_num',
            // Generic
            'geo_id',
            'area_id',
            'region_id',
            'zone_id',
          ];
          
          let actualDistrictField: string | null = null;
          for (const fieldName of possibleDistrictFields) {
            if (locationData.length > 0 && locationData[0][fieldName] !== undefined && locationData[0][fieldName] !== null) {
              actualDistrictField = fieldName;
              break;
            }
          }

          if (!actualDistrictField) return;
          
          // Process choropleth data
          const districtCounts = new Map<string, number>();
          
          locationData.forEach((item: any) => {
            const districtValue = item[actualDistrictField!];
            if (districtValue !== null && districtValue !== undefined) {
              // Normalize district value (handle numeric vs string, float vs int)
              const normalizedValue = String(Number(districtValue)); // Convert "1.0" -> "1", "1" -> "1"
              
              // Check if data is already aggregated (has count or value field)
              // If so, use that count instead of counting occurrences
              const itemCount = item.count !== undefined ? item.count : 
                               item.value !== undefined ? item.value : 1;
              
              districtCounts.set(normalizedValue, (districtCounts.get(normalizedValue) || 0) + itemCount);
              // Also store original string version for fallback matching
              const originalKey = String(districtValue);
              if (originalKey !== normalizedValue) {
                districtCounts.set(originalKey, (districtCounts.get(originalKey) || 0) + itemCount);
              }
            }
          });

          let geometryData = districtInfo.shapefile.geometry_data;
          if (!geometryData) return;
          
          if (typeof geometryData === 'string') {
            try {
              geometryData = JSON.parse(geometryData);
            } catch (e) {
              console.error("Failed to parse shapefile geometry:", e);
              return;
            }
          }

          if (geometryData && geometryData.features) {
            // Merge district data with boundaries
            // Try to match district IDs - check city's district_fields list first, then common patterns
            // Extended list to handle various city naming conventions
            const possibleIdFields = [
              ...(districtInfo.districtFields || []), // Use city's district_fields list
              districtInfo.field,
              districtInfo.shapefile.identifier_field, // Use shapefile's configured identifier field
              // Common district field names
              'district',
              'council_district',
              'council_dist',
              'cncldist',
              'supervisor_district',
              'sup_dist_num',
              'district_id',
              'district_num',
              'district_number',
              // Ward variants
              'ward',
              'ward_id',
              'ward_num',
              'ward_number',
              // Precinct variants  
              'precinct',
              'precinct_id',
              'pct',
              // Borough (NYC)
              'borough',
              'boro',
              'boro_nm',
              // Community board (NYC)
              'community_board',
              'cb',
              'cb_num',
              // Generic
              'geo_id',
              'area_id',
              'region_id',
              'zone_id',
              'id',
              'ID',
              'name',
              'NAME',
            ].filter(Boolean);
            
            // Find the ID field in the shapefile first
            let actualIdField: string | null = null;
            if (geometryData.features.length > 0) {
              for (const fieldName of possibleIdFields) {
                if (geometryData.features[0].properties[fieldName] !== undefined) {
                  actualIdField = fieldName;
                  break;
                }
              }
            }

            if (!actualIdField) return;

            const counts = Array.from(districtCounts.values());
            const minValue = counts.length > 0 ? Math.min(...counts) : 0;
            const maxValue = counts.length > 0 ? Math.max(...counts) : 0;

            // Helper function to convert hex to RGB
            const hexToRgb = (hex: string): [number, number, number] => {
              const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
              return result
                ? [
                    parseInt(result[1], 16),
                    parseInt(result[2], 16),
                    parseInt(result[3], 16),
                  ]
                : [173, 53, 250]; // Fallback to purple if parsing fails
            };

            const choroplethFeatures = geometryData.features.map((feature: any) => {
              const districtId = feature.properties[actualIdField!];
              // Normalize district ID for matching (handle numeric vs string, float vs int)
              const normalizedDistrictId = districtId !== null && districtId !== undefined 
                ? String(Number(districtId)) // Convert to number then string to normalize "1.0" -> "1"
                : null;
              const count = normalizedDistrictId 
                ? (districtCounts.get(normalizedDistrictId) || districtCounts.get(String(districtId)) || 0)
                : 0;
              
              const isDarkBasemap = theme === "dark";
              let calculatedColor = isDarkBasemap ? "#475569" : "#e0e0e0";
              if (count > 0 && maxValue > 0) {
                const ratio = Math.max(0, Math.min(1, (count - minValue) / (maxValue - minValue || 1)));
                const metricColor = hexToRgb(layerColor);
                // Light: near-white anchor; dark: same cool grey as brand choropleth low (not pure white).
                const blendAnchor: [number, number, number] = isDarkBasemap
                  ? CHOROPLETH_DARK_LOW_RGB
                  : [255, 255, 255];
                const lightMetricColor = [
                  Math.round(metricColor[0] + (blendAnchor[0] - metricColor[0]) * 0.85),
                  Math.round(metricColor[1] + (blendAnchor[1] - metricColor[1]) * 0.85),
                  Math.round(metricColor[2] + (blendAnchor[2] - metricColor[2]) * 0.85),
                ];
                const r = Math.round(
                  lightMetricColor[0] + (metricColor[0] - lightMetricColor[0]) * ratio
                );
                const g = Math.round(
                  lightMetricColor[1] + (metricColor[1] - lightMetricColor[1]) * ratio
                );
                const b = Math.round(
                  lightMetricColor[2] + (metricColor[2] - lightMetricColor[2]) * ratio
                );
                calculatedColor = `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
              }

              return {
                ...feature,
                properties: {
                  ...feature.properties,
                  value: count,
                  color: calculatedColor,
                }
              };
            });

            // Remove existing layer if it exists
            if (map.getLayer(layerId)) {
              map.removeLayer(layerId);
            }
            if (map.getLayer(`${layerId}-stroke`)) {
              map.removeLayer(`${layerId}-stroke`);
            }
            if (map.getSource(sourceId)) {
              map.removeSource(sourceId);
            }

            // Add choropleth source and layers
            map.addSource(sourceId, {
              type: 'geojson',
              data: {
                type: 'FeatureCollection',
                features: choroplethFeatures
              }
            });

            // Find the first point/circle layer to insert choropleth below it
            // Choropleth (fill) layers should always render BELOW point (circle) layers
            let firstPointLayerId: string | undefined = undefined;
            const allLayers = map.getStyle()?.layers || [];
            for (const layer of allLayers) {
              if (layer.type === 'circle' && layer.id.startsWith('metric-layer-')) {
                firstPointLayerId = layer.id;
                break;
              }
            }

            // Add fill layer (below any point layers)
            map.addLayer({
              id: layerId,
              type: 'fill',
              source: sourceId,
              layout: {
                visibility: isVisible ? 'visible' : 'none',
              },
              paint: {
                'fill-color': ['get', 'color'],
                'fill-opacity': 0.7 // Slightly more visible
              }
            }, firstPointLayerId);
            

            // Add stroke layer (also below point layers, after fill so it's on top of fill)
            map.addLayer({
              id: `${layerId}-stroke`,
              type: 'line',
              source: sourceId,
              layout: {
                visibility: isVisible ? 'visible' : 'none',
              },
              paint: {
                'line-color': theme === "dark" ? "#e2e8f0" : "#666666",
                'line-width': 0.5,
                'line-opacity': theme === "dark" ? 0.65 : 0.8,
              },
            }, firstPointLayerId);

            // Add click handler
            const clickHandlerIdField = actualIdField || districtInfo.field;
            const leaders = structureQuery.data?.leaders || [];
            map.on('click', layerId, (e: any) => {
              const features = map.queryRenderedFeatures(e.point, { layers: [layerId] });
              if (features.length > 0) {
                const props = features[0].properties;
                const districtIdentifier = props[clickHandlerIdField];
                
                // Convert district identifier to number for comparison
                let districtNumber: number | null = null;
                if (typeof districtIdentifier === "number") {
                  districtNumber = districtIdentifier;
                } else if (typeof districtIdentifier === "string") {
                  const parsed = parseInt(districtIdentifier, 10);
                  if (!isNaN(parsed)) {
                    districtNumber = parsed;
                  }
                }
                
                // Find matching leader
                let matchingLeader: any = null;
                if (districtNumber !== null) {
                  // First, try matching by geographic_structure_id if both exist (preferred method)
                  if (districtInfo.shapefile?.geographic_structure_id) {
                    matchingLeader = leaders.find((leader: any) => {
                      return leader.district === districtNumber && 
                             leader.geographic_structure_id === districtInfo.shapefile.geographic_structure_id;
                    });
                  }
                  
                  // If no match found, try matching by district alone (fallback)
                  if (!matchingLeader) {
                    matchingLeader = leaders.find((leader: any) => {
                      return leader.district === districtNumber;
                    });
                  }
                }
                
                // Get item_noun from metric metadata (fallback to 'items' if not available)
                const metricId = featureData.mapData?.metric_id;
                const metric = availableMetrics.find((m: any) => m.id === metricId);
                // AdminMetricListItem doesn't have item_noun, use default
                const itemNoun = 'items';
                const countValue = props.value || 0;
                const countText = `${countValue} ${itemNoun}`;
                
                // Build unified popup HTML
                let popupHTML = '<div>';
                
                if (matchingLeader) {
                  // Show leader name and title, district number, and count
                  const leaderName = matchingLeader.name || 'Unknown';
                  const leaderTitle = matchingLeader.title || '';
                  const nameAndTitle = leaderTitle 
                    ? `${leaderName}, ${leaderTitle}`
                    : leaderName;
                  
                  popupHTML += `<strong>${nameAndTitle}</strong><br/>`;
                  
                  if (districtNumber !== null) {
                    popupHTML += `District ${districtNumber}<br/>`;
                  }
                  
                  popupHTML += countText;
                } else {
                  // Fallback: show district identifier and count if no leader found
                  const districtDisplay = districtNumber !== null 
                    ? `District ${districtNumber}` 
                    : (districtIdentifier || 'District');
                  popupHTML += `<strong>${districtDisplay}</strong><br/>${countText}`;
                }
                
                popupHTML += '</div>';
                setSelectedPointDetails(popupHTML);
              }
            });

            return; // Skip point layer rendering
          }
        }
      }
      
      // Update bounds for point layers
      if (layerBoundsData && layerBoundsData.sw && layerBoundsData.ne && bounds) {
        try {
          const sw = Array.isArray(layerBoundsData.sw) ? layerBoundsData.sw : [layerBoundsData.sw.lng, layerBoundsData.sw.lat];
          const ne = Array.isArray(layerBoundsData.ne) ? layerBoundsData.ne : [layerBoundsData.ne.lng, layerBoundsData.ne.lat];
          
          if (
            sw.length >= 2 &&
            ne.length >= 2 &&
            !isNaN(sw[0]) &&
            !isNaN(sw[1]) &&
            !isNaN(ne[0]) &&
            !isNaN(ne[1]) &&
            isFinite(sw[0]) &&
            isFinite(sw[1]) &&
            isFinite(ne[0]) &&
            isFinite(ne[1]) &&
            Math.abs(sw[0]) <= 180 &&
            Math.abs(sw[1]) <= 90 &&
            Math.abs(ne[0]) <= 180 &&
            Math.abs(ne[1]) <= 90
          ) {
            bounds.extend(sw);
            bounds.extend(ne);
            hasValidBounds = true;
          }
        } catch (e) {
          console.warn("Error extending bounds", e);
        }
      }

      // Check if source exists
      const source = map.getSource(sourceId);
      if (source) {
        if (source.type === "geojson") {
          (source as any).setData({
            type: "FeatureCollection",
            features: features,
          });
        }
        if (map.getLayer(layerId)) {
          map.setLayoutProperty(layerId, "visibility", isVisible ? "visible" : "none");
          // Only update circle-specific paint properties when the layer is actually a circle layer
          // (it could be a fill layer if the metric was previously rendered as choropleth)
          if ((map.getLayer(layerId) as any)?.type === "circle") {
            map.setPaintProperty(layerId, "circle-stroke-color", [
              "case",
              ["boolean", ["get", "hasMedia"], false],
              "#FFD700", // Gold - unique color not used by any series
              "#ffffff"  // White for points without media
            ]);
            map.setPaintProperty(layerId, "circle-stroke-width", [
              "case",
              ["boolean", ["get", "hasMedia"], false],
              2,  // Thicker stroke for points with media
              1   // Normal stroke for points without media
            ]);
          }
        }
      } else {
        map.addSource(sourceId, {
          type: "geojson",
          data: {
            type: "FeatureCollection",
            features: features,
          },
        });
        
        map.addLayer({
          id: layerId,
          type: "circle",
          source: sourceId,
          layout: {
            visibility: isVisible ? "visible" : "none",
          },
          paint: {
            "circle-radius": ["case", ["has", "scale"], ["max", ["*", ["get", "scale"], 15], 4], 6],
            "circle-color": ["case", ["has", "color"], ["get", "color"], layerColor],
            // Use unique gold color for points with media (not in any series palette)
            "circle-stroke-color": [
              "case",
              ["boolean", ["get", "hasMedia"], false],
              "#FFD700", // Gold - unique color not used by any series
              "#ffffff"  // White for points without media
            ],
            // Slightly thicker stroke for points with media
            "circle-stroke-width": [
              "case",
              ["boolean", ["get", "hasMedia"], false],
              2,  // Thicker stroke for points with media
              1   // Normal stroke for points without media
            ],
            "circle-opacity": [
              "case",
              ["has", "_opacity"],
              ["get", "_opacity"],
              0.8, // Default opacity
            ],
            "circle-stroke-opacity": [
              "case",
              ["has", "_opacity"],
              ["get", "_opacity"],
              1, // Default stroke opacity
            ],
          },
        });
        
        map.on("mouseenter", layerId, () => {
          map.getCanvas().style.cursor = "pointer";
        });
        map.on("mouseleave", layerId, () => {
          map.getCanvas().style.cursor = "";
        });
        
        map.on("click", layerId, (e: any) => {
          const features = map.queryRenderedFeatures(e.point, {
            layers: [layerId],
          });
          if (features.length > 0) {
            const feature = features[0];
            const props = feature.properties || {};
            const coordinates: [number, number] = [e.lngLat.lng, e.lngLat.lat];
            
            // Only open the gallery when the clicked point itself carries a
            // photo; a click on a photo-less point should show its popup, not
            // jump into other points' media.
            const clickedMedia = extractMediaFromPoint(props, coordinates);
            if (clickedMedia.length > 0) {
              // Include media from all points in this layer so the user can
              // navigate photo to photo.
              const allMedia: MediaItem[] = [...clickedMedia];
              try {
                const allSourceFeatures = map.querySourceFeatures(sourceId);
                (allSourceFeatures || []).forEach((f: any) => {
                  const fProps = f.properties || {};
                  const fCoords: [number, number] | undefined = f.geometry?.coordinates
                    ? [f.geometry.coordinates[0], f.geometry.coordinates[1]]
                    : undefined;
                  if (fCoords) {
                    allMedia.push(...extractMediaFromPoint(fProps, fCoords));
                  }
                });
              } catch (err) {
                console.warn("Error querying source features:", err);
              }

              // Remove duplicates by URL
              const uniqueMedia = Array.from(
                new Map(allMedia.map((item) => [item.url, item])).values()
              );
              const { items, startIndex } = prepareGalleryOpen(
                uniqueMedia,
                clickedMedia[0].url
              );
              if (items.length > 0) {
                setMediaItems(items);
                setCurrentMediaIndex(startIndex);
                setMediaViewMode("split");
                setShowMediaGallery(true);
                return; // Don't show popup if we have media
              }
            }
            
            // Fields to exclude (only internal rendering properties)
            // Note: underscore-prefixed fields (e.g., _opacity, _useGrey, _originalColor) are filtered separately
            const excludedFields = new Set([
              'color',
              'mapTitle',
              'mapId',
              'scale',
              'lon',
              'lat',
              'coordinates',
              'location'
            ]);
            
            // Build popup HTML with all fields from map query
            let popupHTML = `<div><strong>${props.mapTitle || "Metric"}</strong>`;
            
            // Check if this is an aggregated point
            const isAggregated = props._isAggregated || (props.count && props.count > 1 && props.title?.includes('points at this location'));
            
            if (isAggregated) {
              // For aggregated points, show count first
              popupHTML += `<br/><strong>Count:</strong> ${props.count || 'N/A'}`;
              
              // Show category summaries if available
              Object.keys(props).forEach((key) => {
                if (key.endsWith('_categories') && !excludedFields.has(key)) {
                  const fieldName = key.replace('_categories', '');
                  const displayKey = fieldName.charAt(0).toUpperCase() + fieldName.slice(1).replace(/_/g, ' ');
                  popupHTML += `<br/><strong>${displayKey} (${props[`${fieldName}_count`] || 'N/A'}):</strong> ${props[key]}`;
                }
              });
              
              // Show date summaries if available
              if (props.dates) {
                popupHTML += `<br/><strong>Dates:</strong> ${props.dates}`;
                if (props.date_count) {
                  popupHTML += ` (${props.date_count} unique dates)`;
                }
              }
            }
            
            // Show all properties except excluded ones
            const fieldEntries = Object.entries(props)
              .filter(([key]) => {
                // Exclude internal fields
                if (excludedFields.has(key)) return false;
                // Exclude underscore-prefixed metadata fields (e.g., _opacity, _useGrey, _originalColor)
                if (key.startsWith('_')) return false;
                // For aggregated points, skip fields we already showed
                if (isAggregated) {
                  if (key === 'count' || key === 'title' || key === 'description' || 
                      key.endsWith('_categories') || key.endsWith('_count') || 
                      key === 'dates' || key === 'date_count') {
                    return false;
                  }
                }
                return true;
              })
              .sort(([a], [b]) => {
                // Prioritize common fields
                const priority: Record<string, number> = {
                  'title': 1,
                  'name': 2,
                  'description': 3,
                  'value': 4,
                  'count': 5
                };
                const aPriority = priority[a] || 99;
                const bPriority = priority[b] || 99;
                return aPriority - bPriority;
              });
            
            fieldEntries.forEach(([key, value]) => {
              if (value !== null && value !== undefined && value !== '') {
                const displayKey = key.charAt(0).toUpperCase() + key.slice(1).replace(/_/g, ' ');
                let displayValue: string;
                if (typeof value === 'object') {
                  displayValue = JSON.stringify(value);
                } else {
                  displayValue = String(value);
                }
                popupHTML += `<br/><strong>${displayKey}:</strong> ${displayValue}`;
              }
            });
            
            popupHTML += `</div>`;
            setSelectedPointDetails(popupHTML);
          }
        });
      }
    });

    // Fit map to bounds on initial load only — skip if GPS is active or already fit once
    if (hasValidBounds && bounds && !gpsLocation && !hasFitInitialBoundsRef.current) {
      try {
        const boundsArray = bounds.toArray();
        if (boundsArray && boundsArray.length >= 2) {
          const [sw, ne] = boundsArray;
          if (sw && ne && 
              !isNaN(sw[0]) && !isNaN(sw[1]) && !isNaN(ne[0]) && !isNaN(ne[1]) &&
              isFinite(sw[0]) && isFinite(sw[1]) && isFinite(ne[0]) && isFinite(ne[1])) {
            const fittedBounds = getClampedBounds(
              { sw: [sw[0], sw[1]], ne: [ne[0], ne[1]] },
              scopeBoundaryBounds,
            );
            if (isValidBoundsBox(fittedBounds)) {
              const boundsToFit = new (window as any).mapboxgl.LngLatBounds();
              boundsToFit.extend(fittedBounds.sw);
              boundsToFit.extend(fittedBounds.ne);
              map.fitBounds(boundsToFit, {
                padding: 50,
                maxZoom: 15,
              });
              hasFitInitialBoundsRef.current = true;
            }
          }
        }
      } catch (err) {
        console.error("Error fitting bounds:", err);
      }
    }
    
    // Update opacity after adding layers
    updateLayerOpacity(map);
  }, [
    maps,
    mapFeatures,
    selectedMetricIds,
    hiddenLayers,
    updateLayerOpacity,
    structureQuery.data,
    findDistrictField,
    availableMetrics,
    gpsLocation,
    scopeBoundaryBounds,
    theme,
  ]);

  // Update layers when maps change or district (citywide vs specific) changes
  // Re-running when selectedDistrict changes ensures dots re-appear for citywide after the "remove on district change" effect runs
  useEffect(() => {
    if (!mapInstanceRef.current || !isActive) return;

    const map = mapInstanceRef.current;
    const isLoaded = map.isStyleLoaded && map.isStyleLoaded();

    if (isLoaded) {
      addLayersToMap(map);
    } else {
      map.once("load", () => {
        addLayersToMap(map);
      });
    }
  }, [maps, mapFeatures, isActive, mapInstanceRef, addLayersToMap, mapStyleVersion, selectedDistrict]);

  // Keep metric fill + choropleth stroke visibility in sync with selection / hiddenLayers
  useEffect(() => {
    if (!mapInstanceRef.current || !isActive) return;
    
    const map = mapInstanceRef.current;
    const isLoaded = map.isStyleLoaded && map.isStyleLoaded();
    
    if (!isLoaded) return;
    
    maps.forEach((mapData) => {
      const uniqueId = String(mapData.metric_id);
      const layerId = `metric-layer-${uniqueId}`;
      const strokeLayerId = `${layerId}-stroke`;
      const metricIdStr = String(mapData.metric_id);
      const isSelected = selectedMetricIds.has(metricIdStr);
      const shouldBeVisible = isSelected && !hiddenLayers.has(uniqueId);
      const targetVisibility = shouldBeVisible ? "visible" : "none";

      for (const id of [layerId, strokeLayerId]) {
        if (!map.getLayer(id)) continue;
        const currentVisibility = map.getLayoutProperty(id, "visibility");
        if (currentVisibility !== targetVisibility) {
          map.setLayoutProperty(id, "visibility", targetVisibility);
        }
      }
    });
  }, [selectedMetricIds, hiddenLayers, maps, isActive, mapInstanceRef]);

  // Update layer opacity when timeline date changes
  useEffect(() => {
    if (!mapInstanceRef.current || !isActive) return;
    
    const map = mapInstanceRef.current;
    const isLoaded = map.isStyleLoaded && map.isStyleLoaded();
    
    if (!isLoaded) return;
    
    updateLayerOpacity(map);
  }, [selectedTimelineDate, isTimelinePlaying, isActive, mapInstanceRef, updateLayerOpacity]);

  const toggleLayer = (uniqueId: string) => {
    // Use the same visibility logic as the rest of the component
    // uniqueId is the same as metricId (String(metric.id))
    const metricId = uniqueId;
    const isSelected = selectedMetricIds.has(metricId);
    const isCurrentlyVisible = isSelected && !hiddenLayers.has(uniqueId);
    const map = mapInstanceRef.current;
    const layerId = `metric-layer-${uniqueId}`;
    const strokeLayerId = `${layerId}-stroke`;

    const applyVisibility = (visible: boolean) => {
      if (!map) return;
      const v = visible ? "visible" : "none";
      if (map.getLayer(layerId)) {
        map.setLayoutProperty(layerId, "visibility", v);
      }
      if (map.getLayer(strokeLayerId)) {
        map.setLayoutProperty(strokeLayerId, "visibility", v);
      }
    };

    if (isCurrentlyVisible) {
      // Hide the layer by adding it to hiddenLayers
      setHiddenLayers((prev) => new Set(prev).add(uniqueId));
      applyVisibility(false);
    } else {
      // Show the layer by removing it from hiddenLayers
      setHiddenLayers((prev) => {
        const updated = new Set(prev);
        updated.delete(uniqueId);
        return updated;
      });
      applyVisibility(true);
    }
  };

  const handleMetricToggle = (metricId: string) => {
    setHiddenLayers((prev) => {
      const next = new Set(prev);
      next.delete(metricId);
      return next;
    });
    setSelectedMetricIds((prev) => {
      const updated = new Set(prev);
      if (updated.has(metricId)) {
        updated.delete(metricId);
        // Remove map layer from the map (data stays in React Query cache for fast re-enable)
        if (mapInstanceRef.current) {
          removeMetricLayerFromMap(mapInstanceRef.current, metricId);
        }
        // Note: We don't clear the maps state here because React Query keeps the data cached
        // When the metric is toggled back on, the cached data will be used immediately
      } else {
        updated.add(metricId);
        // React Query hook will automatically provide cached data or fetch if needed
      }
      return updated;
    });
  };

  // Turn all map metrics on or off (only affects metrics shown in the layer selector)
  const allMetricIdsInSelector = useMemo(
    () => new Set(metricColorMapping.sortedMetrics.map((m) => String(m.id))),
    [metricColorMapping.sortedMetrics]
  );
  const handleAllMetricsOn = useCallback(() => {
    setSelectedMetricIds(new Set(allMetricIdsInSelector));
    setHiddenLayers(new Set());
  }, [allMetricIdsInSelector]);
  const handleAllMetricsOff = useCallback(() => {
    if (mapInstanceRef.current) {
      selectedMetricIds.forEach((id) =>
        removeMetricLayerFromMap(mapInstanceRef.current, id)
      );
    }
    setSelectedMetricIds(new Set());
    setHiddenLayers(new Set());
  }, [selectedMetricIds, removeMetricLayerFromMap]);

  // Turn all metrics in a category on or off (by metric id list from that category)
  const handleCategoryOn = useCallback((metricIds: string[]) => {
    const idSet = new Set(metricIds);
    setSelectedMetricIds((prev) => {
      const next = new Set(prev);
      idSet.forEach((id) => next.add(id));
      return next;
    });
    setHiddenLayers((prev) => {
      const next = new Set(prev);
      idSet.forEach((id) => next.delete(id));
      return next;
    });
  }, []);
  const handleCategoryOff = useCallback(
    (metricIds: string[]) => {
      if (mapInstanceRef.current) {
        metricIds.forEach((id) =>
          removeMetricLayerFromMap(mapInstanceRef.current, id)
        );
      }
      setSelectedMetricIds((prev) => {
        const next = new Set(prev);
        metricIds.forEach((id) => next.delete(id));
        return next;
      });
      setHiddenLayers((prev) => {
        const next = new Set(prev);
        metricIds.forEach((id) => next.delete(id));
        return next;
      });
    },
    [removeMetricLayerFromMap]
  );

  // Dock-style label handlers for hover/touch reveal
  const showDockLabel = useCallback((itemId: string, label: string, element: HTMLElement) => {
    // Clear any existing timeout
    if (dockLabelTimeoutRef.current) {
      clearTimeout(dockLabelTimeoutRef.current);
      dockLabelTimeoutRef.current = null;
    }
    
    const rect = element.getBoundingClientRect();
    setHoveredItemId(itemId);
    setHoveredItemLabel(label);
    setHoveredItemRect(rect);
  }, []);

  const hideDockLabel = useCallback(() => {
    // Add a small delay to prevent flickering when moving between items
    dockLabelTimeoutRef.current = setTimeout(() => {
      setHoveredItemId(null);
      setHoveredItemLabel("");
      setHoveredItemRect(null);
    }, 100);
  }, []);

  // Handle touch move for sliding reveal effect
  const handleTouchMove = useCallback((e: React.TouchEvent<HTMLDivElement>) => {
    const touch = e.touches[0];
    if (!touch) return;
    
    // Find element under touch point
    const element = document.elementFromPoint(touch.clientX, touch.clientY);
    if (!element) {
      hideDockLabel();
      return;
    }
    
    // Check if it's a dock item (has data-dock-id and data-dock-label attributes)
    const dockItem = element.closest('[data-dock-id]') as HTMLElement | null;
    if (dockItem) {
      const itemId = dockItem.getAttribute('data-dock-id');
      const itemLabel = dockItem.getAttribute('data-dock-label');
      if (itemId && itemLabel) {
        showDockLabel(itemId, itemLabel, dockItem);
      }
    } else {
      hideDockLabel();
    }
  }, [showDockLabel, hideDockLabel]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (dockLabelTimeoutRef.current) {
        clearTimeout(dockLabelTimeoutRef.current);
      }
    };
  }, []);

  // Sort shape layers so enabled ones appear at the top (must be before any early return to keep hook order stable)
  const sortedShapeLayers = useMemo(
    () =>
      [...shapeLayers].sort((a, b) => {
        const aEnabled = enabledShapeLayerInstanceIds?.has(a.instance_id) ?? false;
        const bEnabled = enabledShapeLayerInstanceIds?.has(b.instance_id) ?? false;
        if (aEnabled && !bEnabled) return -1;
        if (!aEnabled && bEnabled) return 1;
        return 0;
      }),
    [shapeLayers, enabledShapeLayerInstanceIds]
  );

  if (!isActive) return null;

  // Use pre-computed sorted metrics and ordering map from metricColorMapping
  // This ensures consistent position-based colors whether metrics are on or off
  const { sortedMetrics, orderingMap } = metricColorMapping;

  // Group sorted metrics by category for display with headers
  // Uses position-based color indices for unique, stable colors per metric
  const groupedMetrics: GroupedMetric[] = [];
  const categoryGroups = new Map<string, GroupedMetric>();
  
  for (let i = 0; i < sortedMetrics.length; i++) {
    const metric = sortedMetrics[i];
    const ordering = orderingMap.get(metric.id);
    const category = ordering?.categoryName || metric.category || "other";
    
    if (!categoryGroups.has(category)) {
      const group: GroupedMetric = {
        category,
        categoryDisplayName: getCategoryDisplayName(category),
        metrics: [],
      };
      categoryGroups.set(category, group);
      groupedMetrics.push(group);
    }
    
    const group = categoryGroups.get(category)!;
    // Use position-based color index for unique colors per position
    const colorIndex = i % LAYER_COLOR_PALETTE.length;
    
    group.metrics.push({
      id: metric.id,
      metric_name: metric.metric_name || "",
      template_id: metric.template_id,
      category,
      subcategory: metric.subcategory || undefined,
      order: ordering?.metricOrder ?? getOrderForTemplate(metric.template_id),
      colorIndex,
      color: LAYER_COLOR_PALETTE[colorIndex],
    });
  }

  // Keep metrics in their original order within each group; do not sort selected to top

  // Only show panel if there are any metric layers or shape layers to display
  const hasMetricLayers = sortedMetrics.length > 0;
  // Flatten grouped metrics for emoji view (maintains order)
  const flatMetricsForEmoji = groupedMetrics.flatMap((group) => group.metrics);
  const hasShapeLayers = shapeLayers.length > 0;
  if (!hasMetricLayers && !hasShapeLayers) return null;

  return (
    <div className="city-metrics-map">
      {/* Map points loading overlay: re-zoom happens immediately; show animation while points reload */}
      {loadingMaps.size > 0 && !isAnomalyMode && (
        <div className="city-metrics-map-loading-overlay" aria-live="polite" aria-busy="true">
          <div className="city-metrics-map-loading-pulse" />
          <div className="city-metrics-map-loading-content">
            <Loader size="sm" color="purple" />
            <span>Loading points…</span>
          </div>
        </div>
      )}
      {/* Timeline Component - hidden in anomaly mode */}
      {!isAnomalyMode && (
        <MapTimeline
          features={allFeatures}
          onDateSelect={handleTimelineDateSelect}
          onAnimationStateChange={handleAnimationStateChange}
        />
      )}

      {/* Point details (from map point click) - full-width bottom panel (same as gallery/311 media) */}
      {selectedPointDetails && (
        <div className="city-metrics-map-point-details">
          <div className="city-metrics-map-point-details-header">
            <span className="city-metrics-map-point-details-title">Point details</span>
            <button
              type="button"
              className="city-metrics-map-point-details-close"
              onClick={() => setSelectedPointDetails(null)}
              aria-label="Close point details"
            >
              ×
            </button>
          </div>
          <div
            className="city-metrics-map-point-details-content"
            dangerouslySetInnerHTML={{ __html: selectedPointDetails }}
          />
        </div>
      )}

      {/* Anomaly Mode Loading Indicator */}
      {isAnomalyMode && anomalyModeLoading && (
        <div
          style={{
            position: "absolute",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            zIndex: 1001,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "12px",
          }}
        >
          <Loader size="lg" color="purple" />
          <span
            style={{
              color: "white",
              fontSize: "0.85rem",
              background: "rgba(0, 0, 0, 0.6)",
              padding: "6px 12px",
              borderRadius: "12px",
              backdropFilter: "blur(4px)",
            }}
          >
            Loading anomaly data...
          </span>
        </div>
      )}
      
      {/* Anomaly Mode Indicator - subtle pill at bottom center */}
      {isAnomalyMode && (
        <div
          className="anomaly-mode-indicator"
          style={{
            position: "absolute",
            bottom: "24px",
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 1000,
            background: "rgba(0, 0, 0, 0.7)",
            backdropFilter: "blur(8px)",
            color: "white",
            padding: "8px 16px",
            borderRadius: "20px",
            display: "flex",
            alignItems: "center",
            gap: "10px",
            boxShadow: "0 2px 12px rgba(0,0,0,0.3)",
            fontSize: "0.8rem",
          }}
        >
          {/* Purple dot indicator */}
          <div
            style={{
              width: "8px",
              height: "8px",
              borderRadius: "50%",
              background: ANOMALY_MODE_COLOR,
              flexShrink: 0,
            }}
          />
          <span style={{ opacity: 0.9 }}>
            {anomalyModeLoading ? "Loading..." : (
              selectedAnomaly?.metric_name || selectedAnomaly?.object_name || `Metric ${selectedAnomaly?.metric_id}`
            )}
          </span>
          <button
            onClick={() => onAnomalyClear?.()}
            style={{
              background: "transparent",
              border: "none",
              color: "rgba(255,255,255,0.7)",
              cursor: "pointer",
              fontSize: "1rem",
              padding: "0 2px",
              lineHeight: 1,
              display: "flex",
              alignItems: "center",
            }}
            title="Exit Anomaly Mode"
          >
            ✕
          </button>
        </div>
      )}
      
      {/* Map Layers Panel - Right side - hidden in anomaly mode */}
      {!isAnomalyMode && (
      <div
        ref={panelRef}
        className={`city-metrics-map-panel ${isPanelOpen ? "open" : "closed"}`}
      >
        <div
          className="city-metrics-map-panel-header"
          onClick={() => setIsPanelOpen(!isPanelOpen)}
        >
          <button
            className="city-metrics-map-panel-toggle"
            onClick={(e) => {
              e.stopPropagation();
              setIsPanelOpen(!isPanelOpen);
            }}
          >
            {isPanelOpen ? "→" : "←"}
          </button>
          {isPanelOpen && (
            <>
              <span className="city-metrics-map-panel-title">Layers</span>
              <button
                className="city-metrics-map-panel-close"
                onClick={(e) => {
                  e.stopPropagation();
                  setIsPanelOpen(false);
                }}
              >
                ×
              </button>
            </>
          )}
        </div>

        {/* Emoji-only view when panel is closed */}
        {!isPanelOpen && (
          <div
            className="city-metrics-map-emoji-list"
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              padding: "8px 0",
              gap: "8px",
              flex: 1,
              overflowY: "auto",
              overflowX: "hidden",
              minHeight: 0,
            }}
            onTouchMove={handleTouchMove}
            onTouchEnd={hideDockLabel}
            onTouchCancel={hideDockLabel}
          >
            {flatMetricsForEmoji.map((metric) => {
              const metricId = String(metric.id);
              const isSelected = selectedMetricIds.has(metricId);
              const isLoading = loadingMaps.has(metricId);
              const layerColor = metric.color;
              const uniqueId = metricId;
              const isVisible = isSelected && !hiddenLayers.has(uniqueId);
              const metricMapData = mapFeatures.find((mf) => String(mf.mapData.metric_id) === metricId);
              const pointCount = metricMapData?.pointCount ?? 0;
              const hasNoPoints = isSelected && !isLoading && pointCount === 0;
              
              // Extract first character/emoji from metric name
              const metricName = metric.metric_name || "";
              let emojiIcon = "?";
              if (metricName && metricName.length > 0) {
                const firstChar = Array.from(metricName.trim())[0] as string | undefined;
                if (firstChar) {
                  emojiIcon = /[a-zA-Z]/.test(firstChar) ? firstChar.toUpperCase() : firstChar;
                }
              }

              return (
                <button
                  key={`emoji-${metric.id}`}
                  data-dock-id={`metric-${metricId}`}
                  data-dock-label={metric.metric_name || "Metric"}
                  data-no-points={hasNoPoints ? "true" : undefined}
                  onClick={(e) => {
                    e.stopPropagation();
                    hideDockLabel();
                    if (isVisible) {
                      // Hide on map but keep metric selected (avoids remove/re-add race with Mapbox)
                      toggleLayer(uniqueId);
                    } else if (isSelected) {
                      // If hidden but still selected, show it again (remove from hiddenLayers)
                      toggleLayer(uniqueId);
                    } else {
                      // If not selected, select it
                      handleMetricToggle(metricId);
                    }
                  }}
                  style={{
                    width: "36px",
                    height: "36px",
                    background: isVisible && hasNoPoints ? "#888" : isVisible && !hasNoPoints ? layerColor : "transparent",
                    border: isVisible && hasNoPoints ? "2px solid #888" : isVisible && !hasNoPoints ? `2px solid ${layerColor}` : `2px solid ${theme === "dark" ? "rgba(255, 255, 255, 0.15)" : "rgba(0, 0, 0, 0.15)"}`,
                    borderRadius: "50%",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    padding: 0,
                    position: "relative",
                    transition: "all 0.2s ease, transform 0.15s ease",
                    opacity: hasNoPoints ? 0.7 : isVisible ? 1 : 0.3,
                    flexShrink: 0,
                    color: isVisible ? "#fff" : (theme === "dark" ? "rgba(255, 255, 255, 0.6)" : "rgba(0, 0, 0, 0.6)"),
                    fontSize: "1.2rem",
                    fontWeight: "normal",
                    fontFamily: "Apple Color Emoji, Segoe UI Emoji, Noto Color Emoji, sans-serif",
                    lineHeight: 1,
                    transform: hoveredItemId === `metric-${metricId}` ? "scale(1.2)" : "scale(1)",
                  }}
                  title={hasNoPoints ? `${metric.metric_name || "Metric"} (no points in range)` : (metric.metric_name || "Metric")}
                  onMouseEnter={(e) => {
                    showDockLabel(`metric-${metricId}`, metric.metric_name || "Metric", e.currentTarget);
                    if (!isVisible) {
                      e.currentTarget.style.opacity = "0.8";
                    }
                  }}
                  onMouseLeave={(e) => {
                    hideDockLabel();
                    if (!isVisible) {
                      e.currentTarget.style.opacity = "0.5";
                    }
                  }}
                  onTouchStart={(e) => {
                    showDockLabel(`metric-${metricId}`, metric.metric_name || "Metric", e.currentTarget);
                  }}
                >
                  {isLoading ? (
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <Loader size="sm" color="purple" />
                    </div>
                  ) : (
                    emojiIcon
                  )}
                </button>
              );
            })}

            {/* Shapes (emoji-only) */}
            {sortedShapeLayers.map((layer) => {
              const isVisible = !!enabledShapeLayerInstanceIds?.has(layer.instance_id);
              const layerColor = layer.color || "#ad35fa";

              let emojiIcon = "⬛";
              if (layer.icon) {
                emojiIcon = layer.icon;
              } else if (layer.label) {
                const firstChar = Array.from(layer.label.trim())[0] as string | undefined;
                if (firstChar) {
                  emojiIcon = /[a-zA-Z]/.test(firstChar) ? firstChar.toUpperCase() : firstChar;
                }
              }

              return (
                <button
                  key={`shape-emoji-${layer.instance_id}`}
                  data-dock-id={`shape-${layer.instance_id}`}
                  data-dock-label={layer.label}
                  onClick={(e) => {
                    e.stopPropagation();
                    hideDockLabel();
                    if (!setEnabledShapeLayerInstanceIds) return;
                    setEnabledShapeLayerInstanceIds((prev) => {
                      const next = new Set(prev);
                      if (next.has(layer.instance_id)) next.delete(layer.instance_id);
                      else next.add(layer.instance_id);
                      return next;
                    });
                  }}
                  style={{
                    width: "36px",
                    height: "36px",
                    background: isVisible ? layerColor : "transparent",
                    border: isVisible
                      ? `2px solid ${layerColor}`
                      : `2px solid ${
                          theme === "dark"
                            ? "rgba(255, 255, 255, 0.15)"
                            : "rgba(0, 0, 0, 0.15)"
                        }`,
                    borderRadius: "50%",
                    cursor: setEnabledShapeLayerInstanceIds ? "pointer" : "default",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    padding: 0,
                    transition: "all 0.2s ease, transform 0.15s ease",
                    opacity: isVisible ? 1 : 0.3,
                    flexShrink: 0,
                    color: isVisible
                      ? "#fff"
                      : theme === "dark"
                        ? "rgba(255, 255, 255, 0.6)"
                        : "rgba(0, 0, 0, 0.6)",
                    fontSize: "1.2rem",
                    fontFamily:
                      "Apple Color Emoji, Segoe UI Emoji, Noto Color Emoji, sans-serif",
                    lineHeight: 1,
                    transform: hoveredItemId === `shape-${layer.instance_id}` ? "scale(1.2)" : "scale(1)",
                  }}
                  title={layer.label}
                  onMouseEnter={(e) => {
                    showDockLabel(`shape-${layer.instance_id}`, layer.label, e.currentTarget);
                  }}
                  onMouseLeave={hideDockLabel}
                  onTouchStart={(e) => {
                    showDockLabel(`shape-${layer.instance_id}`, layer.label, e.currentTarget);
                  }}
                >
                  {emojiIcon}
                </button>
              );
            })}
          </div>
        )}

        {/* Full list view when panel is open */}
        {isPanelOpen && (
          <div
            ref={layerSelectorScrollRef}
            className="city-metrics-map-layers-selector"
          >
            {hasMetricLayers && (
              <>
                <div className="city-metrics-map-layers-toolbar">
                  <button
                    type="button"
                    className="city-metrics-map-toolbar-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleAllMetricsOn();
                    }}
                  >
                    All on
                  </button>
                  <button
                    type="button"
                    className="city-metrics-map-toolbar-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleAllMetricsOff();
                    }}
                  >
                    All off
                  </button>
                </div>
                {groupedMetrics.map((group) => {
                  const categoryMetricIds = group.metrics.map((m) => String(m.id));
                  return (
                  <div key={group.category}>
                    {/* Category Header with On/Off for category */}
                    <div
                      className="city-metrics-map-category-header"
                      style={{
                        marginTop: group.category === groupedMetrics[0].category ? "0" : "16px",
                      }}
                    >
                      <span
                        style={{
                          fontSize: "0.85rem",
                          opacity: 0.8,
                          fontWeight: 600,
                          textTransform: "capitalize",
                        }}
                      >
                        {group.categoryDisplayName}
                      </span>
                      <div className="city-metrics-map-category-actions">
                        <button
                          type="button"
                          className="city-metrics-map-category-btn"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleCategoryOn(categoryMetricIds);
                          }}
                          title={`Turn all ${group.categoryDisplayName} metrics on`}
                        >
                          On
                        </button>
                        <button
                          type="button"
                          className="city-metrics-map-category-btn"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleCategoryOff(categoryMetricIds);
                          }}
                          title={`Turn all ${group.categoryDisplayName} metrics off`}
                        >
                          Off
                        </button>
                      </div>
                    </div>
                    {/* Metrics in this category */}
                    {group.metrics.map((metric) => {
                      const metricId = String(metric.id);
                      const isSelected = selectedMetricIds.has(metricId);
                      const isLoading = loadingMaps.has(metricId);
                      const layerColor = metric.color;
                      const uniqueId = metricId;
                      const isVisible = isSelected && !hiddenLayers.has(uniqueId);
                      
                      // Get point count for this metric (only when selected and loaded)
                      const metricMapData = mapFeatures.find((mf) => String(mf.mapData.metric_id) === metricId);
                      const pointCount = metricMapData?.pointCount || 0;
                      const hasNoPoints = isSelected && !isLoading && pointCount === 0;

                      return (
                        <div
                          key={metric.id}
                          className={`city-metrics-map-layer-item${hasNoPoints ? " no-points" : ""}`}
                        >
                          <span
                            className="city-metrics-map-layer-name"
                            onClick={() => handleMetricToggle(metricId)}
                          >
                            {isLoading && (
                              <span style={{ display: "inline-flex", alignItems: "center", marginRight: "6px" }}>
                                <Loader size="sm" color="purple" />
                              </span>
                            )}
                            {metric.metric_name}
                            <span className="city-metrics-map-layer-count">
                              ({pointCount > 0 ? pointCount.toLocaleString() : "0"})
                            </span>
                          </span>
                          <label className="city-metrics-map-toggle-switch">
                            <input
                              type="checkbox"
                              checked={isVisible}
                              onChange={() => {
                                if (isVisible) {
                                  // Hide on map but keep metric selected (avoids remove/re-add race with Mapbox)
                                  toggleLayer(uniqueId);
                                } else if (isSelected) {
                                  // If hidden but still selected, show it again (remove from hiddenLayers)
                                  toggleLayer(uniqueId);
                                } else {
                                  // If not selected, select it
                                  handleMetricToggle(metricId);
                                }
                              }}
                            />
                            <span
                              className="city-metrics-map-slider"
                              style={{
                                backgroundColor: hasNoPoints
                                  ? "#888"
                                  : isVisible
                                    ? layerColor
                                    : "#ccc",
                              }}
                            />
                          </label>
                        </div>
                      );
                    })}
                  </div>
                  );
                })}
              </>
            )}

            {/* Shapes below metrics */}
            {hasShapeLayers && (
              <div style={{ marginTop: "14px" }}>
                <div
                  style={{
                    fontSize: "0.85rem",
                    opacity: 0.8,
                    marginBottom: "8px",
                    fontWeight: 600,
                  }}
                >
                  Shapes
                </div>
                {sortedShapeLayers.map((layer) => {
                  const checked = !!enabledShapeLayerInstanceIds?.has(layer.instance_id);
                  const canToggle = !!setEnabledShapeLayerInstanceIds;
                  const layerColor = layer.color || getStableColorForKey(`shape:${layer.instance_id}`);
                  return (
                    <div
                      key={`shape-${layer.instance_id}`}
                      className="city-metrics-map-layer-item"
                    >
                      <span className="city-metrics-map-layer-name">
                        {layer.icon ? `${layer.icon} ` : ""}
                        {layer.label}
                      </span>
                      <label className="city-metrics-map-toggle-switch">
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={!canToggle}
                          onChange={() => {
                            if (!setEnabledShapeLayerInstanceIds) return;
                            setEnabledShapeLayerInstanceIds((prev) => {
                              const next = new Set(prev);
                              if (next.has(layer.instance_id)) next.delete(layer.instance_id);
                              else next.add(layer.instance_id);
                              return next;
                            });
                          }}
                        />
                        <span
                          className="city-metrics-map-slider"
                          style={{
                            backgroundColor: checked ? layerColor : "#ccc",
                          }}
                        />
                      </label>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
      )}
      
      {/* Media Gallery */}
      {showMediaGallery && mediaItems.length > 0 && (
        <MediaGallery
          mediaItems={mediaItems}
          currentIndex={currentMediaIndex}
          onIndexChange={setCurrentMediaIndex}
          onClose={() => {
            setShowMediaGallery(false);
            setMediaItems([]);
            setCurrentMediaIndex(0);
          }}
          viewMode={mediaViewMode}
          onViewModeChange={setMediaViewMode}
          mapInstanceRef={mapInstanceRef}
          onNavigateToLocation={(coordinates) => {
            if (mapInstanceRef.current) {
              const map = mapInstanceRef.current;
              map.flyTo({
                center: coordinates,
                zoom: Math.max(map.getZoom(), 15),
                duration: 500,
              });
            }
          }}
        />
      )}
      
      {/* Dock-style floating label - always below the hovered item (same as narrow/mobile) for readability */}
      {hoveredItemId && hoveredItemRect && (
        <div
          className="city-metrics-map-dock-label"
          style={{
            position: "fixed",
            top: `${hoveredItemRect.bottom + 8}px`,
            left: `${hoveredItemRect.left}px`,
            background: theme === "dark" 
              ? "rgba(30, 30, 30, 0.95)" 
              : "rgba(255, 255, 255, 0.95)",
            backdropFilter: "blur(10px)",
            padding: "8px 14px",
            borderRadius: "8px",
            boxShadow: theme === "dark"
              ? "0 4px 20px rgba(0, 0, 0, 0.5)"
              : "0 4px 20px rgba(0, 0, 0, 0.15)",
            color: "var(--text-primary)",
            fontSize: "0.85rem",
            fontWeight: 500,
            whiteSpace: "nowrap",
            zIndex: 16000,
            pointerEvents: "none",
            animation: "dockLabelFadeIn 0.15s ease-out",
            maxWidth: "250px",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {hoveredItemLabel}
        </div>
      )}
    </div>
  );
}


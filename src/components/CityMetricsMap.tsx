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
import { useCityMetricsForMap, metricKeys } from "@/lib/hooks/useMetrics";
import { useCityAdminStructure } from "@/lib/hooks/useCityAdmin";
import type { MetricDateRange } from "@/lib/dateRange";
import Loader from "@/components/Loader";
import MapTimeline from "@/components/MapTimeline";
import MediaGallery, { type MediaViewMode } from "@/components/MediaGallery";
import { extractMediaFromPoint, extractMediaFromPoints, type MediaItem } from "@/lib/mediaUtils";
import "./CityMetricsMap.css";
import { getStableColorForKey, getStableColorIndexForKey, LAYER_COLOR_PALETTE } from "@/lib/layerColors";
import {
  sortAndGroupMetrics,
  getColorIndexForTemplate,
  getColorForTemplate,
  getOrderForTemplate,
  getCategoryDisplayName,
  type GroupedMetric,
} from "@/lib/metricTemplateConfig";

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
  const [isPanelOpen, setIsPanelOpen] = useState(true);
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

  // Track if we've set default metrics to avoid re-enabling them
  const defaultMetricsSetRef = useRef(false);
  const previousCityIdRef = useRef<number | null>(null);

  // Load available metrics for this city using React Query
  const metricsQuery = useCityMetricsForMap(cityId && isActive ? cityId : null);
  
  // Load city structure for district information
  const structureQuery = useCityAdminStructure(cityId && isActive ? cityId : null);
  
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
      // City has changed - reset everything
      console.log(`[CityMetricsMap] City changed from ${previousCityIdRef.current} to ${cityId}, resetting map layers`);
      
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
      attemptedLoadsRef.current.clear();
      loadedMetricsRef.current.clear();
      
      // Clear visible/hidden layers
      setVisibleLayers(new Set());
      setHiddenLayers(new Set());
      
      // Reset timeline
      setSelectedTimelineDate(null);
      setIsTimelinePlaying(false);
      currentAnimationDateRef.current = null;
      
      // Reset default metrics flag
      defaultMetricsSetRef.current = false;
      
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

  // Auto-enable metrics with template_id 18 (Violent Crime) or 44 (Property Crime) by default
  useEffect(() => {
    // Only set defaults once when metrics are loaded and we haven't set them yet
    if (defaultMetricsSetRef.current || availableMetrics.length === 0) {
      return;
    }

    // Find metrics with template_id 18 or 44
    const defaultTemplateIds = [18, 44];
    const metricsToEnable = availableMetrics.filter(
      (m) => m.template_id && defaultTemplateIds.includes(m.template_id)
    );

    if (metricsToEnable.length > 0) {
      setSelectedMetricIds((prev) => {
        const updated = new Set(prev);
        metricsToEnable.forEach((metric) => {
          updated.add(String(metric.id));
        });
        return updated;
      });
      defaultMetricsSetRef.current = true;
      console.log(
        `Auto-enabled ${metricsToEnable.length} default crime metrics (templates 18 and/or 44):`,
        metricsToEnable.map((m) => ({ id: m.id, name: m.metric_name, template_id: m.template_id }))
      );
    }
  }, [availableMetrics]);

  // Get color index for a metric based on metric_id (each metric gets unique color)
  // This ensures that even metrics sharing the same template_id get different colors
  // Can accept either a metric object or a metric ID string
  const getColorIndexForMetric = useCallback((metricOrId: AdminMetricListItem | string): number => {
    // Always use metric_id for color assignment to ensure unique colors per metric
    const metricId = typeof metricOrId === "string" ? metricOrId : String(metricOrId.id);
    return getStableColorIndexForKey(`metric:${metricId}`);
  }, []);

  // Track which metrics we've attempted to load to prevent infinite loops
  // Key format: "metricId:district" (e.g., "123:5" for metric 123, district 5, or "123:null" for no district)
  const attemptedLoadsRef = useRef<Set<string>>(new Set());
  // Track which metrics have successfully loaded map data (keyed by metricId:district)
  const loadedMetricsRef = useRef<Set<string>>(new Set());

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

  // When date range changes, clear caches and remove existing metric layers so data reloads.
  useEffect(() => {
    attemptedLoadsRef.current.clear();
    loadedMetricsRef.current.clear();
    setLoadingMaps(new Set());

    if (mapInstanceRef.current) {
      const map = mapInstanceRef.current;
      const idsToRemove = new Set<string>();
      selectedMetricIds.forEach((id) => idsToRemove.add(id));
      maps.forEach((m) => idsToRemove.add(String(m.metric_id)));
      idsToRemove.forEach((id) => removeMetricLayerFromMap(map, id));
    }

    setMaps([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateKey]);

  const queryClient = useQueryClient();

  // Load map data for a metric (using React Query cache for fast switching)
  const loadMapData = useCallback(async (metricId: number) => {
    const metricIdStr = String(metricId);
    
    // Create a unique key that includes both metric ID and district
    // This ensures we reload data when district changes, even for the same metric
    const districtKey = selectedDistrict !== null && selectedDistrict !== 0 
      ? String(selectedDistrict) 
      : "null";
    const loadKey = `${metricIdStr}:${districtKey}`;
    
    // Prevent duplicate loads
    if (loadingMapsRef.current.has(metricIdStr) || attemptedLoadsRef.current.has(loadKey)) {
      return;
    }

    // Check if we already have map data for this metric+district combination
    if (loadedMetricsRef.current.has(loadKey)) {
      return;
    }

    // Check React Query cache first
    const districts: number[] | null = (selectedDistrict !== null && selectedDistrict !== 0 && typeof selectedDistrict === 'number')
      ? [selectedDistrict]
      : null;
    const cacheKey = metricKeys.mapData(
      metricId,
      metricDateRange?.start_date ?? null,
      metricDateRange?.end_date ?? null,
      districts
    );
    const cachedData = queryClient.getQueryData<MapData>(cacheKey);
    
    if (cachedData) {
      // Use cached data immediately
      loadedMetricsRef.current.add(loadKey);
      setMaps((prev) => {
        const filtered = prev.filter((m) => String(m.metric_id) !== metricIdStr);
        return [...filtered, cachedData];
      });
      return;
    }

    // Mark as attempted and loading
    attemptedLoadsRef.current.add(loadKey);
    setLoadingMaps((prev) => new Set(prev).add(metricIdStr));

    try {
      const token = await getAccessTokenSilently();
      // Build request payload - always include districts if we have a valid district number
      const requestPayload: any = {
        metric_id: metricId,
        start_date: metricDateRange?.start_date ?? null,
        end_date: metricDateRange?.end_date ?? null,
      };
      
      // Add districts parameter to WHERE clause if we have a valid district number (not null, not 0)
      // District 0 is citywide, so we don't filter by district in that case
      if (selectedDistrict !== null && selectedDistrict !== 0) {
        requestPayload.districts = [selectedDistrict];
      }
      
      const request: GetMapDataRequest = requestPayload;
      const response = await getMetricMapData(request, token);

      if (response.status === "success" && response.map_data) {
        // Cache the data in React Query for fast switching
        queryClient.setQueryData(cacheKey, response.map_data);
        
        loadedMetricsRef.current.add(loadKey);
        setMaps((prev) => {
          const filtered = prev.filter((m) => String(m.metric_id) !== metricIdStr);
          return [...filtered, response.map_data!];
        });
      } else if (response.status === "error") {
        // If metric doesn't have map_query, don't retry
        console.log(`Metric ${metricId} does not have map_query configured:`, response.error);
        // Keep it in attemptedLoadsRef so we don't retry
      }
    } catch (err: any) {
      console.error(`Error loading map data for metric ${metricId}:`, err);
      // On error, remove from attempted loads so we can retry later if needed
      attemptedLoadsRef.current.delete(loadKey);
    } finally {
      setLoadingMaps((prev) => {
        const updated = new Set(prev);
        updated.delete(metricIdStr);
        return updated;
      });
    }
  }, [getAccessTokenSilently, metricDateRange?.start_date, metricDateRange?.end_date, selectedDistrict, queryClient]);

  // Load map data when metrics are selected
  useEffect(() => {
    if (!isActive || !mapInstanceRef.current) return;

    selectedMetricIds.forEach((metricIdStr) => {
      const metricId = parseInt(metricIdStr, 10);
      if (!isNaN(metricId)) {
        // Create load key that includes district to check if this specific metric+district combo is loaded
        const districtKey = selectedDistrict !== null && selectedDistrict !== 0 
          ? String(selectedDistrict) 
          : "null";
        const loadKey = `${metricIdStr}:${districtKey}`;
        
        // Check if we already have map data for this metric+district combination
        const hasMapData = loadedMetricsRef.current.has(loadKey);
        const isAlreadyLoading = loadingMaps.has(metricIdStr);
        const hasAttempted = attemptedLoadsRef.current.has(loadKey);
        
        if (!hasMapData && !isAlreadyLoading && !hasAttempted) {
          loadMapData(metricId);
        }
      }
    });
  }, [selectedMetricIds, selectedDistrict, isActive, mapInstanceRef, loadMapData, loadingMaps]);

  // Reload map data when district changes (to apply district filter)
  useEffect(() => {
    if (!isActive || !mapInstanceRef.current) return;
    
    // When district changes, clear all loaded metrics for this district combination and reload them
    // This ensures we get fresh data filtered by the new district
    selectedMetricIds.forEach((metricIdStr) => {
      const metricId = parseInt(metricIdStr, 10);
      if (!isNaN(metricId)) {
        // Clear all load keys for this metric (for any district)
        // We need to clear all because the district key format changed
        const keysToDelete: string[] = [];
        loadedMetricsRef.current.forEach((key) => {
          if (key.startsWith(`${metricIdStr}:`)) {
            keysToDelete.push(key);
          }
        });
        keysToDelete.forEach((key) => loadedMetricsRef.current.delete(key));
        
        attemptedLoadsRef.current.forEach((key) => {
          if (key.startsWith(`${metricIdStr}:`)) {
            attemptedLoadsRef.current.delete(key);
          }
        });
        
        // Remove from maps state so it will be reloaded
        setMaps((prev) => prev.filter((m) => String(m.metric_id) !== metricIdStr));
        
        // Remove metric layer from map
        if (mapInstanceRef.current) {
          removeMetricLayerFromMap(mapInstanceRef.current, metricIdStr);
        }
        
        // Trigger reload with new district filter
        loadMapData(metricId);
      }
    });
  }, [selectedDistrict, isActive, mapInstanceRef, loadMapData, selectedMetricIds, removeMetricLayerFromMap]);

  // Reset attempted loads when selectedMetricIds changes (user selects different metrics)
  useEffect(() => {
    // Clear attempted loads and loaded metrics for metrics that are no longer selected
    // Note: load keys are now in format "metricId:district", so we need to check the prefix
    attemptedLoadsRef.current.forEach((loadKey) => {
      const metricIdStr = loadKey.split(':')[0];
      if (!selectedMetricIds.has(metricIdStr)) {
        attemptedLoadsRef.current.delete(loadKey);
        loadedMetricsRef.current.delete(loadKey);
      }
    });
  }, [selectedMetricIds]);

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
          } catch (e) {
            console.warn(`Failed to parse location data for map ${mapData.id}:`, e);
            return null;
          }
        } else if (Array.isArray(mapData.location_data)) {
          locationData = mapData.location_data;
        }

        const pointCount = locationData.length;
        const useChoropleth = pointCount > 1000;

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
            const lon = typeof item.lon === "number" ? item.lon : parseFloat(String(item.lon));
            const lat = typeof item.lat === "number" ? item.lat : parseFloat(String(item.lat));
            if (!isNaN(lat) && !isNaN(lon) && isFinite(lat) && isFinite(lon)) {
              coordinates = [lon, lat];
            }
          } else if (item.location?.coordinates) {
            const coords = item.location.coordinates;
            if (Array.isArray(coords) && coords.length >= 2) {
              const lon = typeof coords[0] === "number" ? coords[0] : parseFloat(String(coords[0]));
              const lat = typeof coords[1] === "number" ? coords[1] : parseFloat(String(coords[1]));
              if (!isNaN(lat) && !isNaN(lon) && isFinite(lat) && isFinite(lon)) {
                coordinates = [lon, lat];
              }
            }
          } else if (item.coordinates && Array.isArray(item.coordinates)) {
            const coords = item.coordinates;
            if (coords.length >= 2) {
              const lon = typeof coords[0] === "number" ? coords[0] : parseFloat(String(coords[0]));
              const lat = typeof coords[1] === "number" ? coords[1] : parseFloat(String(coords[1]));
              if (!isNaN(lat) && !isNaN(lon) && isFinite(lat) && isFinite(lon)) {
                coordinates = [lon, lat];
              }
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
        } catch (err) {
          // Silently skip if layer type check fails or layer doesn't support these properties
          console.warn(`Skipping opacity update for layer ${layerId}:`, err);
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
        
        // Debug logging to understand why choropleth might not render
        if (!structureQuery.data) {
          console.warn('Choropleth: No city structure data available');
        } else if (!districtInfo) {
          console.warn('Choropleth: findDistrictField returned null. Structure data:', {
            hasGeographicStructures: !!structureQuery.data?.geographic_structures?.length,
            hasShapefiles: !!structureQuery.data?.shapefiles?.length,
            hasQueryConfigs: !!structureQuery.data?.query_configs?.length,
            districtFields: structureQuery.data?.district_fields,
          });
        } else if (!districtInfo.shapefile) {
          console.warn('Choropleth: District info found but no shapefile. districtInfo:', districtInfo);
        }
        
        if (districtInfo && districtInfo.shapefile) {
          // Debug: Log available fields from first point
          if (locationData.length > 0) {
            console.log('Choropleth: First point fields:', Object.keys(locationData[0]));
            console.log('Choropleth: Looking for district field:', districtInfo.field);
            console.log('Choropleth: First point district value:', locationData[0][districtInfo.field]);
          }
          
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
              console.log('Choropleth: Found district field:', fieldName);
              break;
            }
          }
          
          if (!actualDistrictField) {
            console.warn('Choropleth: No district field found in location data. Available fields:', 
              locationData.length > 0 ? Object.keys(locationData[0]) : []);
            // Fall back to requesting district-aggregated data from API
            return; // Skip choropleth rendering for now
          }
          
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
          
            console.log('Choropleth: District counts:', Array.from(districtCounts.entries()).slice(0, 10));
            console.log('Choropleth: Total districts with data:', districtCounts.size);

          // Get shapefile geometry
          let geometryData = districtInfo.shapefile.geometry_data;
          
          // Check if geometry_data exists
          if (!geometryData) {
            console.warn('Choropleth: Shapefile has no geometry_data. Shapefile:', {
              id: districtInfo.shapefile.id,
              shapefile_name: districtInfo.shapefile.shapefile_name,
              structure_type: districtInfo.shapefile.structure_type,
            });
            return; // Skip choropleth rendering
          }
          
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
                  console.log('Choropleth: Found ID field in shapefile:', fieldName);
                  break;
                }
              }
            }
            
            if (!actualIdField) {
              console.warn('Choropleth: No ID field found in shapefile. Available properties:', 
                geometryData.features.length > 0 ? Object.keys(geometryData.features[0].properties) : []);
              return; // Skip choropleth rendering
            }
            
            // Calculate min/max for color scaling
            const counts = Array.from(districtCounts.values());
            const minValue = counts.length > 0 ? Math.min(...counts) : 0;
            const maxValue = counts.length > 0 ? Math.max(...counts) : 0;
            
            console.log('Choropleth: Value range:', { minValue, maxValue, totalFeatures: geometryData.features.length });
            
            // Count how many features will have data (now that actualIdField is determined)
            let featuresWithData = 0;
            geometryData.features.forEach((feature: any) => {
              const districtId = feature.properties[actualIdField!];
              const normalizedDistrictId = districtId !== null && districtId !== undefined 
                ? String(Number(districtId))
                : null;
              if (normalizedDistrictId && districtCounts.has(normalizedDistrictId)) {
                featuresWithData++;
              }
            });
            console.log('Choropleth: Features with matching data:', featuresWithData, 'out of', geometryData.features.length);
            
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
              
              // Calculate color using the metric's assigned color (from layerColor) to white gradient
              // Use a darker default for no data so it's visible
              let calculatedColor = '#e0e0e0'; // Slightly darker default for no data
              if (count > 0 && maxValue > 0) {
                // Ensure ratio is between 0 and 1
                const ratio = Math.max(0, Math.min(1, (count - minValue) / (maxValue - minValue || 1)));
                // Use the metric's assigned color instead of hardcoded purple
                const metricColor = hexToRgb(layerColor);
                const white = [255, 255, 255];
                // Create a lighter version of the metric color (90% towards white)
                const lightMetricColor = [
                  Math.round(metricColor[0] + (white[0] - metricColor[0]) * 0.85),
                  Math.round(metricColor[1] + (white[1] - metricColor[1]) * 0.85),
                  Math.round(metricColor[2] + (white[2] - metricColor[2]) * 0.85)
                ];
                
                // Interpolate between light color (min) and full metric color (max)
                const r = Math.round(lightMetricColor[0] + (metricColor[0] - lightMetricColor[0]) * ratio);
                const g = Math.round(lightMetricColor[1] + (metricColor[1] - lightMetricColor[1]) * ratio);
                const b = Math.round(lightMetricColor[2] + (metricColor[2] - lightMetricColor[2]) * ratio);
                
                calculatedColor = `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
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

            // Add fill layer
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
            });
            
            console.log('Choropleth: Added fill layer', layerId, 'with visibility', isVisible ? 'visible' : 'none', 'and', choroplethFeatures.length, 'features');

            // Add stroke layer
            map.addLayer({
              id: `${layerId}-stroke`,
              type: 'line',
              source: sourceId,
              layout: {
                visibility: isVisible ? 'visible' : 'none',
              },
              paint: {
                'line-color': '#666666',
                'line-width': 0.5,
                'line-opacity': 0.8
              }
            });

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
                
                const popup = new (window as any).mapboxgl.Popup()
                  .setLngLat(e.lngLat)
                  .setHTML(popupHTML)
                  .addTo(map);
                
                // Fix accessibility issue with popup close button
                setTimeout(() => {
                  const closeButton = document.querySelector('.mapboxgl-popup-close-button');
                  if (closeButton && closeButton.hasAttribute('aria-hidden')) {
                    closeButton.removeAttribute('aria-hidden');
                  }
                }, 10);
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
          
          if (sw.length >= 2 && ne.length >= 2 &&
              !isNaN(sw[0]) && !isNaN(sw[1]) && !isNaN(ne[0]) && !isNaN(ne[1]) &&
              isFinite(sw[0]) && isFinite(sw[1]) && isFinite(ne[0]) && isFinite(ne[1])) {
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
          // Update paint properties to ensure media indicators are shown
          map.setPaintProperty(layerId, "circle-stroke-color", [
            "case",
            ["get", "hasMedia"],
            "#FFD700", // Gold - unique color not used by any series
            "#ffffff"  // White for points without media
          ]);
          map.setPaintProperty(layerId, "circle-stroke-width", [
            "case",
            ["get", "hasMedia"],
            2,  // Thicker stroke for points with media (reduced from 3)
            1   // Normal stroke for points without media
          ]);
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
              ["get", "hasMedia"],
              "#FFD700", // Gold - unique color not used by any series
              "#ffffff"  // White for points without media
            ],
            // Slightly thicker stroke for points with media
            "circle-stroke-width": [
              "case",
              ["get", "hasMedia"],
              2,  // Thicker stroke for points with media (reduced from 3)
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
            
            // Collect ALL media from ALL points in this layer (not just clicked point)
            const allMedia: MediaItem[] = [];
            
            // Get all features from the source for this layer using public API
            try {
              const allSourceFeatures = map.querySourceFeatures(sourceId);
              if (allSourceFeatures && allSourceFeatures.length > 0) {
              // Extract media from all features in this layer
              allSourceFeatures.forEach((f: any) => {
                const fProps = f.properties || {};
                const fCoords: [number, number] | undefined = f.geometry?.coordinates 
                  ? [f.geometry.coordinates[0], f.geometry.coordinates[1]]
                  : undefined;
                // Only extract media if coordinates are valid
                if (fCoords) {
                  const media = extractMediaFromPoint(fProps, fCoords);
                  allMedia.push(...media);
                }
              });
              }
            } catch (err) {
              console.warn("Error querying source features:", err);
            }
            
            // If no media found from source, try clicked feature as fallback
            if (allMedia.length === 0) {
              const clickedMedia = extractMediaFromPoint(props, coordinates);
              allMedia.push(...clickedMedia);
            }
            
            // If media found, show gallery with all media from this layer
            if (allMedia.length > 0) {
              // Remove duplicates by URL
              const uniqueMedia = Array.from(
                new Map(allMedia.map((item) => [item.url, item])).values()
              );
              
              // Find the index of the clicked point's media (if any)
              let startIndex = 0;
              const clickedMedia = extractMediaFromPoint(props, coordinates);
              if (clickedMedia.length > 0 && clickedMedia[0].url) {
                const clickedUrl = clickedMedia[0].url;
                const foundIndex = uniqueMedia.findIndex(item => item.url === clickedUrl);
                if (foundIndex >= 0) {
                  startIndex = foundIndex;
                }
              }
              
              setMediaItems(uniqueMedia);
              setCurrentMediaIndex(startIndex);
              setMediaViewMode("split");
              setShowMediaGallery(true);
              return; // Don't show popup if we have media
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
            
            const popup = new (window as any).mapboxgl.Popup({
              anchor: 'bottom',
              offset: [0, -10],
              closeButton: true,
              closeOnClick: true,
              className: 'custom-metric-popup'
            })
              .setLngLat(e.lngLat)
              .setHTML(popupHTML)
              .addTo(map);
            
            // Fix accessibility issue with popup close button
            // Mapbox sets aria-hidden="true" on the close button, which causes accessibility errors
            setTimeout(() => {
              const closeButton = document.querySelector('.mapboxgl-popup-close-button');
              if (closeButton && closeButton.hasAttribute('aria-hidden')) {
                closeButton.removeAttribute('aria-hidden');
              }
            }, 10);
          }
        });
      }
    });

    // Fit map to bounds if we have valid bounds
    // Skip dynamic zooming if GPS is active - keep map centered on GPS location
    if (hasValidBounds && bounds && !gpsLocation) {
      try {
        const boundsArray = bounds.toArray();
        if (boundsArray && boundsArray.length >= 2) {
          const [sw, ne] = boundsArray;
          if (sw && ne && 
              !isNaN(sw[0]) && !isNaN(sw[1]) && !isNaN(ne[0]) && !isNaN(ne[1]) &&
              isFinite(sw[0]) && isFinite(sw[1]) && isFinite(ne[0]) && isFinite(ne[1])) {
            map.fitBounds(bounds, {
              padding: 50,
              maxZoom: 15,
            });
          }
        }
      } catch (err) {
        console.error("Error fitting bounds:", err);
      }
    }
    
    // Update opacity after adding layers
    updateLayerOpacity(map);
  }, [maps, mapFeatures, selectedMetricIds, hiddenLayers, updateLayerOpacity, structureQuery.data, findDistrictField, availableMetrics, gpsLocation]);

  // Update layers when maps change
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
  }, [maps, mapFeatures, isActive, mapInstanceRef, addLayersToMap, mapStyleVersion]);

  // Update layer visibility when visibleLayers changes
  useEffect(() => {
    if (!mapInstanceRef.current || !isActive) return;
    
    const map = mapInstanceRef.current;
    const isLoaded = map.isStyleLoaded && map.isStyleLoaded();
    
    if (!isLoaded) return;
    
    maps.forEach((mapData) => {
      const uniqueId = String(mapData.metric_id);
      const layerId = `metric-layer-${uniqueId}`;
      const metricIdStr = String(mapData.metric_id);
      const isSelected = selectedMetricIds.has(metricIdStr);
      const shouldBeVisible = isSelected && !hiddenLayers.has(uniqueId);
      
      if (map.getLayer(layerId)) {
        const currentVisibility = map.getLayoutProperty(layerId, "visibility");
        const targetVisibility = shouldBeVisible ? "visible" : "none";
        
        if (currentVisibility !== targetVisibility) {
          map.setLayoutProperty(layerId, "visibility", targetVisibility);
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
    
    if (isCurrentlyVisible) {
      // Hide the layer by adding it to hiddenLayers
      setHiddenLayers((prev) => new Set(prev).add(uniqueId));
      if (mapInstanceRef.current) {
        const layerId = `metric-layer-${uniqueId}`;
        if (mapInstanceRef.current.getLayer(layerId)) {
          mapInstanceRef.current.setLayoutProperty(layerId, "visibility", "none");
        }
      }
    } else {
      // Show the layer by removing it from hiddenLayers
      setHiddenLayers((prev) => {
        const updated = new Set(prev);
        updated.delete(uniqueId);
        return updated;
      });
      if (mapInstanceRef.current) {
        const layerId = `metric-layer-${uniqueId}`;
        if (mapInstanceRef.current.getLayer(layerId)) {
          mapInstanceRef.current.setLayoutProperty(layerId, "visibility", "visible");
        }
      }
    }
  };

  const handleMetricToggle = (metricId: string) => {
    setSelectedMetricIds((prev) => {
      const updated = new Set(prev);
      if (updated.has(metricId)) {
        updated.delete(metricId);
        // Remove map data for this metric
        setMaps((prevMaps) => prevMaps.filter((m) => String(m.metric_id) !== metricId));
        
        // Clear all load keys for this metric (for all districts)
        const keysToDelete: string[] = [];
        loadedMetricsRef.current.forEach((key) => {
          if (key.startsWith(`${metricId}:`)) {
            keysToDelete.push(key);
          }
        });
        keysToDelete.forEach((key) => {
          loadedMetricsRef.current.delete(key);
          attemptedLoadsRef.current.delete(key);
        });
        
        if (mapInstanceRef.current) {
          removeMetricLayerFromMap(mapInstanceRef.current, metricId);
        }
      } else {
        updated.add(metricId);
      }
      return updated;
    });
  };

  if (!isActive) return null;

  // Filter and sort metrics by template order
  const filteredMetrics = availableMetrics.filter((metric) => {
    // Only show active metrics
    return metric.is_active;
  });

  // Group metrics by category for display with headers
  const groupedMetrics = sortAndGroupMetrics(
    filteredMetrics.map((m) => ({
      id: m.id,
      metric_name: m.metric_name || "",
      template_id: m.template_id,
      category: m.category || "other",
      subcategory: m.subcategory || null,
    }))
  );

  // Only show panel if there are any metric layers or shape layers to display
  const hasMetricLayers = filteredMetrics.length > 0;
  // Flatten grouped metrics for emoji view (maintains order)
  const flatMetricsForEmoji = groupedMetrics.flatMap((group) => group.metrics);
  const hasShapeLayers = shapeLayers.length > 0;
  if (!hasMetricLayers && !hasShapeLayers) return null;

  return (
    <div className="city-metrics-map">
      {/* Timeline Component */}
      <MapTimeline
        features={allFeatures}
        onDateSelect={handleTimelineDateSelect}
        onAnimationStateChange={handleAnimationStateChange}
      />
      
      {/* Map Layers Panel - Right side */}
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
          >
            {flatMetricsForEmoji.map((metric) => {
              const metricId = String(metric.id);
              const isSelected = selectedMetricIds.has(metricId);
              const isLoading = loadingMaps.has(metricId);
              const layerColor = metric.color;
              const uniqueId = metricId;
              const isVisible = isSelected && !hiddenLayers.has(uniqueId);
              
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
                  onClick={(e) => {
                    e.stopPropagation();
                    if (isVisible) {
                      // If visible, deselect the metric (remove from selectedMetricIds)
                      handleMetricToggle(metricId);
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
                    background: isVisible ? layerColor : "transparent",
                    border: isVisible ? `2px solid ${layerColor}` : `2px solid ${theme === "dark" ? "rgba(255, 255, 255, 0.15)" : "rgba(0, 0, 0, 0.15)"}`,
                    borderRadius: "50%",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    padding: 0,
                    position: "relative",
                    transition: "all 0.2s ease",
                    opacity: isVisible ? 1 : 0.3,
                    flexShrink: 0,
                    color: isVisible ? "#fff" : (theme === "dark" ? "rgba(255, 255, 255, 0.6)" : "rgba(0, 0, 0, 0.6)"),
                    fontSize: "1.2rem",
                    fontWeight: "normal",
                    fontFamily: "Apple Color Emoji, Segoe UI Emoji, Noto Color Emoji, sans-serif",
                    lineHeight: 1,
                  }}
                  title={metric.metric_name || "Metric"}
                  onMouseEnter={(e) => {
                    if (!isVisible) {
                      e.currentTarget.style.opacity = "0.8";
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isVisible) {
                      e.currentTarget.style.opacity = "0.5";
                    }
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
            {shapeLayers.map((layer) => {
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
                  onClick={(e) => {
                    e.stopPropagation();
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
                    transition: "all 0.2s ease",
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
                  }}
                  title={layer.label}
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
                {groupedMetrics.map((group) => (
                  <div key={group.category}>
                    {/* Category Header */}
                    <div
                      style={{
                        fontSize: "0.85rem",
                        opacity: 0.8,
                        marginTop: group.category === groupedMetrics[0].category ? "0" : "16px",
                        marginBottom: "8px",
                        fontWeight: 600,
                        textTransform: "capitalize",
                      }}
                    >
                      {group.categoryDisplayName}
                    </div>
                    {/* Metrics in this category */}
                    {group.metrics.map((metric) => {
                      const metricId = String(metric.id);
                      const isSelected = selectedMetricIds.has(metricId);
                      const isLoading = loadingMaps.has(metricId);
                      const layerColor = metric.color;
                      const uniqueId = metricId;
                      const isVisible = isSelected && !hiddenLayers.has(uniqueId);
                      
                      // Get point count for this metric
                      const metricMapData = mapFeatures.find((mf) => String(mf.mapData.metric_id) === metricId);
                      const pointCount = metricMapData?.pointCount || 0;

                      return (
                        <div key={metric.id} className="city-metrics-map-layer-item">
                          <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
                            <span
                              className="city-metrics-map-layer-name"
                              onClick={() => handleMetricToggle(metricId)}
                            >
                              {isLoading && (
                                <span style={{ display: "inline-flex", alignItems: "center", marginRight: "8px" }}>
                                  <Loader size="sm" color="purple" />
                                </span>
                              )}
                              {metric.metric_name}
                            </span>
                            {pointCount > 0 && (
                              <span
                                style={{
                                  fontSize: "0.7rem",
                                  color: "var(--text-secondary)",
                                  opacity: 0.7,
                                  marginTop: "2px",
                                  marginLeft: "0",
                                }}
                              >
                                {pointCount.toLocaleString()} {pointCount === 1 ? "point" : "points"}
                                {pointCount > 1000 && " (choropleth)"}
                              </span>
                            )}
                          </div>
                          <label className="city-metrics-map-toggle-switch">
                            <input
                              type="checkbox"
                              checked={isVisible}
                              onChange={() => {
                                if (isVisible) {
                                  // If visible, deselect the metric (remove from selectedMetricIds)
                                  handleMetricToggle(metricId);
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
                                backgroundColor: isVisible ? layerColor : "#ccc",
                              }}
                            />
                          </label>
                        </div>
                      );
                    })}
                  </div>
                ))}
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
                {shapeLayers.map((layer) => {
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
    </div>
  );
}


"use client";

import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { useAuth0 } from "@auth0/auth0-react";
import { useTheme } from "@/contexts/ThemeContext";
import {
  getMetricMapData,
  getCityMetricsForMap,
  type MapData,
  type MapDataPoint,
  type AdminMetricListItem,
  type GetMapDataRequest,
} from "@/lib/apiClient";
import type { MetricDateRange } from "@/lib/dateRange";
import Loader from "@/components/Loader";
import MapTimeline from "@/components/MapTimeline";
import "./CityMetricsMap.css";
import { getStableColorForKey, getStableColorIndexForKey, LAYER_COLOR_PALETTE } from "@/lib/layerColors";

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

  // Track if we've set default metrics to avoid re-enabling them
  const defaultMetricsSetRef = useRef(false);

  // Load available metrics for this city
  useEffect(() => {
    if (!cityId || !isActive) return;

    const loadMetrics = async () => {
      try {
        const token = await getAccessTokenSilently();
        const metrics = await getCityMetricsForMap(cityId, token);
        // Filter to only metrics that have map_query configured
        const metricsWithMap = metrics.filter(
          (m) => m.map_query && m.map_query.trim().length > 0
        );
        setAvailableMetrics(metricsWithMap);
        
        // Reset default metrics flag when city changes
        if (defaultMetricsSetRef.current) {
          defaultMetricsSetRef.current = false;
        }
      } catch (err: any) {
        console.error("Error loading metrics:", err);
        setError(err.message || "Failed to load metrics");
      }
    };

    loadMetrics();
  }, [cityId, isActive, getAccessTokenSilently]);

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

  // Get color index for a metric based on a stable key (no reassignment on toggle)
  const getColorIndexForMetric = useCallback((metricId: string): number => {
    return getStableColorIndexForKey(`metric:${metricId}`);
  }, []);

  // Track which metrics we've attempted to load to prevent infinite loops
  const attemptedLoadsRef = useRef<Set<string>>(new Set());
  // Track which metrics have successfully loaded map data
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

  const removeMetricLayerFromMap = useCallback((map: any, metricIdStr: string) => {
    const layerId = `metric-layer-${metricIdStr}`;
    const sourceId = `metric-source-${metricIdStr}`;
    try {
      if (map.getLayer && map.getLayer(layerId)) {
        map.removeLayer(layerId);
      }
    } catch (e) {
      // ignore
    }
    try {
      if (map.getSource && map.getSource(sourceId)) {
        map.removeSource(sourceId);
      }
    } catch (e) {
      // ignore
    }
  }, []);

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

  // Load map data for a metric
  const loadMapData = useCallback(async (metricId: number) => {
    const metricIdStr = String(metricId);
    
    // Prevent duplicate loads
    if (loadingMapsRef.current.has(metricIdStr) || attemptedLoadsRef.current.has(metricIdStr)) {
      return;
    }

    // Check if we already have map data
    if (loadedMetricsRef.current.has(metricIdStr)) {
      return;
    }

    // Mark as attempted
    attemptedLoadsRef.current.add(metricIdStr);
    setLoadingMaps((prev) => new Set(prev).add(metricIdStr));

    try {
      const token = await getAccessTokenSilently();
      const request: GetMapDataRequest = {
        metric_id: metricId,
        start_date: metricDateRange?.start_date ?? null,
        end_date: metricDateRange?.end_date ?? null,
      };
      const response = await getMetricMapData(request, token);

      if (response.status === "success" && response.map_data) {
        loadedMetricsRef.current.add(metricIdStr);
        setMaps((prev) => {
          // Remove existing map for this metric if any
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
      attemptedLoadsRef.current.delete(metricIdStr);
    } finally {
      setLoadingMaps((prev) => {
        const updated = new Set(prev);
        updated.delete(metricIdStr);
        return updated;
      });
    }
  }, [getAccessTokenSilently, metricDateRange?.start_date, metricDateRange?.end_date]);

  // Load map data when metrics are selected
  useEffect(() => {
    if (!isActive || !mapInstanceRef.current) return;

    selectedMetricIds.forEach((metricIdStr) => {
      const metricId = parseInt(metricIdStr, 10);
      if (!isNaN(metricId)) {
        // Check if we already have map data for this metric
        const hasMapData = loadedMetricsRef.current.has(metricIdStr);
        const isAlreadyLoading = loadingMaps.has(metricIdStr);
        const hasAttempted = attemptedLoadsRef.current.has(metricIdStr);
        
        if (!hasMapData && !isAlreadyLoading && !hasAttempted) {
          loadMapData(metricId);
        }
      }
    });
  }, [selectedMetricIds, isActive, mapInstanceRef, loadMapData]);

  // Reset attempted loads when selectedMetricIds changes (user selects different metrics)
  useEffect(() => {
    // Clear attempted loads and loaded metrics for metrics that are no longer selected
    attemptedLoadsRef.current.forEach((metricIdStr) => {
      if (!selectedMetricIds.has(metricIdStr)) {
        attemptedLoadsRef.current.delete(metricIdStr);
        loadedMetricsRef.current.delete(metricIdStr);
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

        if (locationData.length === 0) {
          return {
            mapData,
            uniqueId: String(mapData.metric_id),
            colorIndex: getColorIndexForMetric(String(mapData.metric_id)),
            layerColor: LAYER_COLOR_PALETTE[getColorIndexForMetric(String(mapData.metric_id)) % LAYER_COLOR_PALETTE.length],
            features: [],
            bounds: null,
            hasData: false,
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
        };
      } catch (err) {
        console.error("Error processing map data:", err);
        return null;
      }
    }).filter(Boolean) as any[];
  }, [maps, getColorIndexForMetric, getDateFromFeature]);

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
      const { uniqueId, features, layerColor } = featureData;
      const layerId = `metric-layer-${uniqueId}`;
      const sourceId = `metric-source-${uniqueId}`;
      
      if (!map.getLayer(layerId) || !map.getSource(sourceId)) return;
      
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
      if (map.getLayer(layerId)) {
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
      const { uniqueId, layerColor, features, bounds: layerBoundsData, hasData } = featureData;
      
      if (!hasData) return;

      const layerId = `metric-layer-${uniqueId}`;
      const sourceId = `metric-source-${uniqueId}`;
      
      // Update bounds
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

      // Determine visibility
      const metricIdStr = String(featureData.mapData.metric_id);
      const isSelected = selectedMetricIds.has(metricIdStr);
      const isVisible = isSelected && !hiddenLayers.has(uniqueId);

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
            "circle-stroke-color": "#ffffff",
            "circle-stroke-width": 1,
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
            
            // Fields to exclude (only internal rendering properties)
            const excludedFields = new Set([
              'color',
              'mapTitle',
              'mapId',
              'scale',
              'lon',
              'lat',
              'coordinates',
              'location',
              '_isAggregated' // Internal flag
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
    if (hasValidBounds && bounds) {
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
  }, [maps, mapFeatures, selectedMetricIds, hiddenLayers, updateLayerOpacity]);

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
    const newVisibleLayers = new Set(visibleLayers);
    const isCurrentlyVisible = newVisibleLayers.has(uniqueId);
    
    if (isCurrentlyVisible) {
      newVisibleLayers.delete(uniqueId);
      setHiddenLayers((prev) => new Set(prev).add(uniqueId));
      if (mapInstanceRef.current) {
        const layerId = `metric-layer-${uniqueId}`;
        if (mapInstanceRef.current.getLayer(layerId)) {
          mapInstanceRef.current.setLayoutProperty(layerId, "visibility", "none");
        }
      }
    } else {
      newVisibleLayers.add(uniqueId);
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
    setVisibleLayers(newVisibleLayers);
  };

  const handleMetricToggle = (metricId: string) => {
    setSelectedMetricIds((prev) => {
      const updated = new Set(prev);
      if (updated.has(metricId)) {
        updated.delete(metricId);
        // Remove map data for this metric
        setMaps((prevMaps) => prevMaps.filter((m) => String(m.metric_id) !== metricId));
        attemptedLoadsRef.current.delete(metricId);
        loadedMetricsRef.current.delete(metricId);
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

  const filteredMetrics = availableMetrics
    .filter((metric) => {
      // Only show active metrics
      return metric.is_active;
    })
    .sort((a, b) => {
      // Sort by category, then by name
      if (a.category !== b.category) {
        return (a.category || "").localeCompare(b.category || "");
      }
      return (a.metric_name || "").localeCompare(b.metric_name || "");
    });

  // Only show panel if there are any metric layers or shape layers to display
  const hasMetricLayers = filteredMetrics.length > 0;
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
            {filteredMetrics.map((metric) => {
              const metricId = String(metric.id);
              const isSelected = selectedMetricIds.has(metricId);
              const isLoading = loadingMaps.has(metricId);
              const colorIndex = getColorIndexForMetric(metricId);
              const layerColor = LAYER_COLOR_PALETTE[colorIndex % LAYER_COLOR_PALETTE.length];
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
                    if (isSelected) {
                      toggleLayer(uniqueId);
                    } else {
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
              <div
                style={{
                  fontSize: "0.85rem",
                  opacity: 0.8,
                  marginBottom: "8px",
                  fontWeight: 600,
                }}
              >
                Metrics
              </div>
            )}
            {filteredMetrics.map((metric) => {
              const metricId = String(metric.id);
              const isSelected = selectedMetricIds.has(metricId);
              const isLoading = loadingMaps.has(metricId);
              const colorIndex = getColorIndexForMetric(metricId);
              const layerColor = LAYER_COLOR_PALETTE[colorIndex % LAYER_COLOR_PALETTE.length];
              const uniqueId = metricId;
              const isVisible = isSelected && !hiddenLayers.has(uniqueId);

              return (
                <div key={metric.id} className="city-metrics-map-layer-item">
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
                  <label className="city-metrics-map-toggle-switch">
                    <input
                      type="checkbox"
                      checked={isVisible}
                      onChange={() => {
                        if (isSelected) {
                          toggleLayer(uniqueId);
                        } else {
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
    </div>
  );
}


"use client";

import { useState, useEffect, useRef } from "react";
import type { SavedMap } from "@/lib/apiClient";
import { API_BASE } from "@/lib/apiBase";
import Loader from "./Loader";
import MapLayerPanel from "./MapLayerPanel";
import "./ProgressiveMapView.css";

interface ProgressiveMapViewProps {
  mapData: SavedMap;
  mapHash: string;
  height?: number;
  onError?: (error: string) => void;
}

interface ShapeLayer {
  shape_layer_instance_id: number;
  identifier_field: string;
  display_name: string;
  layer_key?: string;
  category?: string;
}

interface Aggregation {
  identifier_field: string;
  display_name: string;
  rows: Array<{ district: string; value: number; [key: string]: any }>;
}

export default function ProgressiveMapView({
  mapData,
  mapHash,
  height = 400,
  onError,
}: ProgressiveMapViewProps) {
  const [selectedShapeLayer, setSelectedShapeLayer] = useState<string | null>(null);
  const [points, setPoints] = useState<Array<{ lat: number; lon: number; [key: string]: any }> | null>(null);
  const [loadingPoints, setLoadingPoints] = useState(false);
  const [selectedDistrictId, setSelectedDistrictId] = useState<string | null>(null);
  const [showPoints, setShowPoints] = useState(true);
  const [mapboxLoaded, setMapboxLoaded] = useState(false);
  const [availableShapeLayers, setAvailableShapeLayers] = useState<ShapeLayer[]>([]);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const shapeLayersDiscoveredRef = useRef(false);

  // Get aggregations from map_config
  const aggregations = mapData.map_config?.aggregations || {};
  
  // Discover shape layers that match fields in location_data
  useEffect(() => {
    // Prevent multiple discoveries
    if (shapeLayersDiscoveredRef.current) {
      return;
    }
    
    if (!mapData.city_id || !mapData.location_data || mapData.location_data.length === 0) {
      return;
    }
    
    // Get all unique field names from location_data
    const locationDataFields = new Set<string>();
    mapData.location_data.forEach((point: any) => {
      Object.keys(point).forEach(key => {
        if (key !== 'lat' && key !== 'lon' && key !== 'latitude' && key !== 'longitude') {
          locationDataFields.add(key);
        }
      });
    });
    
    console.log(`[ProgressiveMapView] Location data fields:`, Array.from(locationDataFields));
    
    // If we already have shape layers from map_config, use those
    if (mapData.map_config?.available_shape_layers && mapData.map_config.available_shape_layers.length > 0) {
      console.log(`[ProgressiveMapView] Using shape layers from map_config`);
      setAvailableShapeLayers(mapData.map_config.available_shape_layers);
      shapeLayersDiscoveredRef.current = true;
      return;
    }
    
    // Otherwise, fetch shape layers for the city and match them to location_data fields
    const discoverMatchingShapeLayers = async () => {
      try {
        // Common district field names that might be used in shape layers or location_data
        const commonDistrictFieldNames = ['supervisor_district', 'district', 'ward', 'sup_dist_num', 'district_id', 'council_district', 'nhood', 'neighborhood'];
        
        // First, fetch city structure to get district fields mapping
        console.log(`[ProgressiveMapView] Fetching city structure for city ${mapData.city_id}`);
        let districtFields: string[] = [];
        try {
          const cityStructureResponse = await fetch(`/api/cities/${mapData.city_id}/structure`);
          if (cityStructureResponse.ok) {
            const cityStructure = await cityStructureResponse.json();
            console.log(`[ProgressiveMapView] City structure response:`, cityStructure);
            // Try different possible locations for district_fields
            districtFields = cityStructure.district_fields || 
                            cityStructure.districtFields ||
                            (cityStructure.location_fields?.filter((f: any) => 
                              typeof f === 'string' ? f.includes('district') || f.includes('ward') : 
                              (f.fieldName?.includes('district') || f.fieldName?.includes('ward') || f.name?.includes('district') || f.name?.includes('ward'))
                            ).map((f: any) => typeof f === 'string' ? f : (f.fieldName || f.name))) ||
                            [];
            console.log(`[ProgressiveMapView] City structure district_fields:`, districtFields);
          } else {
            const errorText = await cityStructureResponse.text();
            console.warn(`[ProgressiveMapView] Failed to fetch city structure: ${cityStructureResponse.status}`, errorText);
          }
        } catch (err) {
          console.warn(`[ProgressiveMapView] Failed to fetch city structure:`, err);
        }
        
        // Fallback: if district_fields is empty, check location_data for common district field names
        // Also include common aliases that might be used in shape layers
        if (districtFields.length === 0) {
          const foundDistrictFields = commonDistrictFieldNames.filter(field => 
            mapData.location_data.some((point: any) => 
              point[field] !== undefined && 
              point[field] !== null &&
              point[field] !== ""
            )
          );
          if (foundDistrictFields.length > 0) {
            console.log(`[ProgressiveMapView] Using fallback district fields from location_data:`, foundDistrictFields);
            districtFields = foundDistrictFields;
          }
        }
        
        // Also check if any shape layer identifier_fields are district-related, even if not in location_data
        // This helps match shape layers that use different field names (e.g., sup_dist_num vs supervisor_district)
        const hasAnyDistrictFieldInData = commonDistrictFieldNames.some(field =>
          mapData.location_data.some((point: any) => 
            point[field] !== undefined && 
            point[field] !== null &&
            point[field] !== ""
          )
        );
        
        console.log(`[ProgressiveMapView] Fetching shape layers for city ${mapData.city_id}`);
        const cityLayersResponse = await fetch(`/api/shape-layers/cities/${mapData.city_id}`);
        
        if (!cityLayersResponse.ok) {
          const errorText = await cityLayersResponse.text();
          console.warn(`[ProgressiveMapView] Failed to fetch city shape layers: ${cityLayersResponse.status}`, errorText);
          return;
        }
        
        const cityLayersData = await cityLayersResponse.json();
        console.log(`[ProgressiveMapView] City shape layers API response:`, cityLayersData);
        
        const layers = Array.isArray(cityLayersData) ? cityLayersData : (cityLayersData.layers || cityLayersData.shape_layers || cityLayersData.data || []);
        
        console.log(`[ProgressiveMapView] Found ${layers.length} shape layers for city`, layers);
        
        // Get all unique field names from location_data
        const locationDataFields = new Set<string>();
        mapData.location_data.forEach((point: any) => {
          Object.keys(point).forEach(key => {
            if (key !== 'lat' && key !== 'lon' && key !== 'latitude' && key !== 'longitude') {
              locationDataFields.add(key);
            }
          });
        });
        console.log(`[ProgressiveMapView] Location data fields:`, Array.from(locationDataFields));
        
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
              console.log(`[ProgressiveMapView] Skipping layer without ID:`, layer);
              continue;
            }
            
            // Get identifier_field from instance or template
            const identifierField = instance?.identifier_field || 
                                   template?.default_identifier_field ||
                                   layer.identifier_field ||
                                   layer.default_identifier_field;
            
            if (!identifierField) {
              console.log(`[ProgressiveMapView] No identifier_field found for instance ${instanceId}`);
              continue;
            }
            
            console.log(`[ProgressiveMapView] Checking shape layer instance ${instanceId} with identifier_field "${identifierField}"`);
            
            // Check if identifier_field matches:
            // 1. Direct match in location_data fields
            // 2. Match in city structure district_fields (meaning it's a related district field)
            // 3. identifier_field is a known district-related field name AND location_data has any district field
            const hasDirectMatch = locationDataFields.has(identifierField);
            const isDistrictField = districtFields.includes(identifierField);
            const hasRelatedDistrictField = districtFields.some(df => locationDataFields.has(df));
            const isKnownDistrictFieldName = commonDistrictFieldNames.includes(identifierField);
            
            console.log(`[ProgressiveMapView] Match check for "${identifierField}":`, {
              hasDirectMatch,
              isDistrictField,
              hasRelatedDistrictField,
              isKnownDistrictFieldName,
              hasAnyDistrictFieldInData,
              districtFields,
              locationDataFields: Array.from(locationDataFields)
            });
            
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
              
              console.log(`[ProgressiveMapView] ✅ Found matching shape layer: ${instanceId} (identifier_field: ${identifierField}, using field: ${fieldToUse})`);
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
            } else {
              console.log(`[ProgressiveMapView] ❌ No match for field "${identifierField}"`);
            }
          } catch (err) {
            console.error(`[ProgressiveMapView] Error checking shape layer:`, err, layer);
          }
        }
        
        if (matchingLayers.length > 0) {
          console.log(`[ProgressiveMapView] Found ${matchingLayers.length} matching shape layers`);
          setAvailableShapeLayers(matchingLayers);
          shapeLayersDiscoveredRef.current = true;
          
        } else {
          console.log(`[ProgressiveMapView] No matching shape layers found`);
          shapeLayersDiscoveredRef.current = true; // Mark as discovered even if no matches
        }
      } catch (err) {
        console.error(`[ProgressiveMapView] Error discovering shape layers:`, err);
        shapeLayersDiscoveredRef.current = true; // Mark as discovered even on error
      }
    };
    
    discoverMatchingShapeLayers();
  }, [mapData.city_id, mapData.location_data, mapData.map_config]); // Removed selectedShapeLayer from dependencies

  console.log(`[ProgressiveMapView] Map config:`, {
    mapType: mapData.map_type,
    hasAggregations: Object.keys(aggregations).length > 0,
    aggregationKeys: Object.keys(aggregations),
    availableShapeLayersCount: availableShapeLayers.length,
    availableShapeLayers: availableShapeLayers,
    mapConfig: mapData.map_config
  });

  // Determine if we have aggregations (choropleth) or just points
  const hasAggregations = Object.keys(aggregations).length > 0;
  const isPointMap = mapData.map_type === "point" && !hasAggregations;

  // Automatically load points from location_data for point maps
  useEffect(() => {
    // For point maps, load points immediately from location_data
    if (isPointMap && mapData.location_data && Array.isArray(mapData.location_data) && mapData.location_data.length > 0 && points === null) {
      const validLocationData = mapData.location_data.filter((p: any) => 
        p && 
        typeof p.lat === 'number' && 
        typeof p.lon === 'number' &&
        !isNaN(p.lat) && 
        !isNaN(p.lon) &&
        isFinite(p.lat) &&
        isFinite(p.lon)
      );

      if (validLocationData.length > 0) {
        console.log(`[ProgressiveMapView] Loading ${validLocationData.length} points from location_data for point map`);
        setPoints(validLocationData);
        setShowPoints(true);
      }
    }
  }, [isPointMap, mapData.location_data, points]);

  // Automatically fetch and show points if location_data has items (for choropleth maps with data)
  useEffect(() => {
    // Only auto-fetch for choropleth maps (hasAggregations) that have location_data
    // Point maps already use location_data directly, so skip those
    // Wait for map to be loaded before auto-showing points
    if (!mapboxLoaded || !mapInstanceRef.current || isPointMap) {
      return;
    }

    if (hasAggregations && mapData.location_data && Array.isArray(mapData.location_data) && mapData.location_data.length > 0) {
      // Check if location_data has valid points with lat/lon
      const validLocationData = mapData.location_data.filter((p: any) => 
        p && 
        typeof p.lat === 'number' && 
        typeof p.lon === 'number' &&
        !isNaN(p.lat) && 
        !isNaN(p.lon) &&
        isFinite(p.lat) &&
        isFinite(p.lon)
      );

      if (validLocationData.length > 0 && points === null) {
        // Use location_data directly if it has valid points
        console.log(`[ProgressiveMapView] Using ${validLocationData.length} points from location_data for choropleth map`);
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

      const map = new mapboxgl.Map({
        container: container,
        style: "mapbox://styles/mapbox/light-v11",
        center: mapData.center ? [mapData.center.lng, mapData.center.lat] : [-122.4194, 37.7749],
        zoom: mapData.center?.zoom || 11,
        attributionControl: false,
      });

      mapInstanceRef.current = map;

      map.on("load", async () => {
        setTimeout(async () => {
          try {
            // For point maps, load points immediately
            if (isPointMap) {
              loadPointMap(map);
            }
            // For choropleth maps, wait for shape layer to be selected
            // This will be handled by the useEffect that watches selectedShapeLayer
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

  // Load choropleth when shape layer is selected
  useEffect(() => {
    if (!mapInstanceRef.current || !mapboxLoaded) return;
    if (!selectedShapeLayer) return;
    
    // Can load choropleth if we have:
    // 1. Pre-computed aggregations, OR
    // 2. Location data that we can compute aggregations from, OR
    // 3. Points data that we can compute aggregations from
    const canComputeAggregations = !!(
      (mapData.location_data && Array.isArray(mapData.location_data) && mapData.location_data.length > 0) ||
      (points && points.length > 0)
    );
    const canLoadChoropleth = hasAggregations || canComputeAggregations;
    
    if (canLoadChoropleth) {
      // Wait a bit to ensure map is ready
      const timeoutId = setTimeout(() => {
        try {
          loadChoroplethMap(mapInstanceRef.current, selectedShapeLayer);
        } catch (err) {
          console.error("Error loading choropleth:", err);
        }
      }, 100);
      
      return () => clearTimeout(timeoutId);
    }
  }, [selectedShapeLayer, hasAggregations, mapboxLoaded, mapData.location_data, points]);

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
          const aggregation = aggregations[selectedShapeLayer];
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
  }, [showPoints, selectedDistrictId, points, selectedShapeLayer, aggregations, hasAggregations]);

  // Compute aggregations from points for a given shape layer
  const computeAggregationForShapeLayer = (
    points: Array<{ lat: number; lon: number; [key: string]: any }>,
    identifierField: string
  ): Aggregation => {
    const aggregationMap = new Map<string, number>();
    
    points.forEach((point: any) => {
      const id = String(point[identifierField] || point.district || point.supervisor_district || "");
      if (id && id !== "null" && id !== "undefined") {
        const current = aggregationMap.get(id) || 0;
        aggregationMap.set(id, current + 1);
      }
    });
    
    const rows = Array.from(aggregationMap.entries()).map(([id, count]) => ({
      district: id,
      [identifierField]: id,
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
      console.log(`[ProgressiveMapView] loadChoroplethMap called for shapeLayerId: ${shapeLayerId}`);
      console.log(`[ProgressiveMapView] Available aggregations keys:`, Object.keys(aggregations));
      console.log(`[ProgressiveMapView] Available shape layers:`, availableShapeLayers.map(sl => ({ id: sl.shape_layer_instance_id, name: sl.display_name, field: sl.identifier_field })));
      console.log(`[ProgressiveMapView] Full aggregations object:`, aggregations);
      
      // Try to find aggregation - it might be keyed by shape_layer_instance_id as string or number
      let aggregation = aggregations[shapeLayerId] as Aggregation | undefined;
      if (!aggregation) {
        // Try with number key
        const shapeLayerIdNum = Number(shapeLayerId);
        if (!isNaN(shapeLayerIdNum)) {
          aggregation = aggregations[shapeLayerIdNum] as Aggregation | undefined;
        }
      }
      // If still not found, try the first available aggregation (might be keyed differently)
      if (!aggregation && Object.keys(aggregations).length > 0) {
        const firstKey = Object.keys(aggregations)[0];
        console.log(`[ProgressiveMapView] Trying first aggregation key: ${firstKey}`);
        aggregation = aggregations[firstKey] as Aggregation | undefined;
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

      const apiBase = API_BASE;
      const shapeLayerInstanceId = shapeLayer.shape_layer_instance_id;
      const identifierField = shapeLayer.identifier_field;

      // Fetch shape geometry
      const response = await fetch(
        `${apiBase}/api/shape-layers/public/instances/${shapeLayerInstanceId}?include_geometry=true`
      );

      if (!response.ok) {
        console.error("Failed to fetch shape layer");
        return;
      }

      const shapeLayerData = await response.json();
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
      
      const features = geometryData.features.map((feature: any) => {
        // Try multiple ways to get district ID from shape layer properties
        const props = feature.properties || {};
        const apiIdentifierField = shapeLayerData.instance.identifier_field;
        
        // Try all possible identifier fields
        const districtIdRaw = 
          props[identifierField] ||
          props[apiIdentifierField] ||
          props.district ||
          props.district_id ||
          props.supervisor_district ||
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
            district_id: districtId,
            value: value,
            color: color,
            ...districtData,
          },
        };
      });

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

      mapInstance.addLayer({
        id: "choropleth-fill",
        type: "fill",
        source: "choropleth-shapes",
        paint: {
          "fill-color": ["get", "color"],
          "fill-opacity": 0.7,
        },
      });

      mapInstance.addLayer({
        id: "choropleth-outline",
        type: "line",
        source: "choropleth-shapes",
        paint: {
          "line-color": "#ffffff",
          "line-width": 1.5,
        },
      });

      // Fit to bounds
      const bounds = new (window as any).mapboxgl.LngLatBounds();
      features.forEach((feature: any) => {
        if (feature.geometry.type === "Polygon") {
          feature.geometry.coordinates[0].forEach((coord: number[]) => {
            bounds.extend(coord as [number, number]);
          });
        } else if (feature.geometry.type === "MultiPolygon") {
          feature.geometry.coordinates.forEach((polygon: number[][][]) => {
            polygon[0].forEach((coord: number[]) => {
              bounds.extend(coord as [number, number]);
            });
          });
        }
      });

      if (features.length > 0) {
        mapInstance.fitBounds(bounds, { padding: 20 });
      }

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
      
      mapInstance.on("mouseenter", "choropleth-fill", (e: any) => {
        if (!e.features || e.features.length === 0) return;
        const feature = e.features[0];
        const props = feature.properties;
        const districtId = props.district_id || props.district || "Unknown";
        const value = props.value !== null && props.value !== undefined ? props.value.toLocaleString() : "No data";

        popup
          .setLngLat(e.lngLat)
          .setHTML(`<div class="map-popup"><strong>${shapeLayer.display_name} ${districtId}</strong><br/>${value}</div>`)
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

  const addPointsLayer = (mapInstance: any, pointData: Array<{ lat: number; lon: number; [key: string]: any }>) => {
    console.log(`[ProgressiveMapView] addPointsLayer called with ${pointData.length} points`);
    
    const geojsonData = {
      type: "FeatureCollection" as const,
      features: pointData.map((point: any, index: number) => ({
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

      console.log("[ProgressiveMapView] Adding points-layer");
      mapInstance.addLayer({
        id: "points-layer",
        type: "circle",
        source: "points-source",
        paint: {
          "circle-radius": 5,
          "circle-color": "#ad35fa",
          "circle-stroke-color": "#fff",
          "circle-stroke-width": 1,
          "circle-opacity": 0.85,
        },
      });
      
      // Add click handler for points
      mapInstance.off("click", "points-layer");
      mapInstance.on("click", "points-layer", (e: any) => {
        if (!e.features || e.features.length === 0) return;
        const feature = e.features[0];
        const props = feature.properties || {};
        console.log("[ProgressiveMapView] Point clicked:", props);
        
        // Show popup with point info
        const popup = new (window as any).mapboxgl.Popup()
          .setLngLat(e.lngLat)
          .setHTML(`<div class="map-popup"><strong>Point Details</strong><br/>${JSON.stringify(props, null, 2).slice(0, 200)}</div>`)
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
        const displayText = props.incident_description || props.description || "Point";
        popup
          .setLngLat(e.lngLat)
          .setHTML(`<div class="map-popup">${displayText}</div>`)
          .addTo(mapInstance);
      });
      
      mapInstance.on("mouseleave", "points-layer", () => {
        mapInstance.getCanvas().style.cursor = "";
        popup.remove();
      });
      
      console.log("[ProgressiveMapView] Points layer added successfully");

      // Fit to bounds - only if we have valid points
      const validPoints = pointData.filter((point: any) => 
        point && 
        typeof point.lon === 'number' && 
        typeof point.lat === 'number' &&
        !isNaN(point.lon) && 
        !isNaN(point.lat) &&
        isFinite(point.lon) &&
        isFinite(point.lat)
      );

      if (validPoints.length > 0) {
        const bounds = new (window as any).mapboxgl.LngLatBounds();
        validPoints.forEach((point: any) => {
          bounds.extend([point.lon, point.lat]);
        });
        
        // Check if bounds are valid before fitting
        if (bounds.getNorth() !== bounds.getSouth() || bounds.getEast() !== bounds.getWest()) {
          mapInstance.fitBounds(bounds, { padding: 20 });
        } else if (validPoints.length === 1) {
          mapInstance.setCenter([validPoints[0].lon, validPoints[0].lat]);
          mapInstance.setZoom(15);
        }
      }
    } catch (err) {
      console.error("Error adding point layers:", err);
    }
  };

  // Check if we have any location data that can be shown as points
  const canShowDots = !!(mapData.location_data && Array.isArray(mapData.location_data) && mapData.location_data.length > 0);

  return (
    <div className="progressive-map-view" style={{ position: "relative" }}>
      <div className="map-container-wrapper" style={{ position: "relative" }}>
        <MapLayerPanel
          availableShapeLayers={availableShapeLayers}
          selectedShapeLayer={selectedShapeLayer}
          onShapeLayerSelect={(shapeLayerId) => {
            // Set the shape layer (empty string clears it)
            setSelectedShapeLayer(shapeLayerId || null);
            setSelectedDistrictId(null); // Reset district selection when switching shape layers
          }}
          showDots={showPoints}
          onToggleDots={() => {
            setShowPoints(!showPoints);
          }}
          canShowDots={canShowDots}
        />

        {loadingPoints && (
          <div className="points-loading">
            <Loader size="sm" color="dark" />
            <span>Loading points...</span>
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

"use client";

import { useState, useEffect, useRef } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { useTheme } from "@/contexts/ThemeContext";
import { getPublicCityDetail } from "@/lib/publicApiClient";
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

export default function PublicMapPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const hash = params.hash as string;
  const isEmbedded = searchParams.get("embedded") === "true";
  const { theme } = useTheme();
  
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
  const [selectedShapeLayer, setSelectedShapeLayer] = useState<string | null>(null);
  const [showPoints, setShowPoints] = useState(false);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const dotsDistrictIdRef = useRef<string | null>(null);

  useEffect(() => {
    dotsDistrictIdRef.current = dotsDistrictId;
  }, [dotsDistrictId]);
  
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

  // Resolve city name when map has city_id but API did not return city_name
  useEffect(() => {
    if (!map?.city_id) {
      setResolvedCityName(null);
      return;
    }
    if (map.city_name) {
      setResolvedCityName(map.city_name);
      return;
    }
    getPublicCityDetail(map.city_id)
      .then((c) => setResolvedCityName(c.name))
      .catch(() => setResolvedCityName(null));
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
      mapInstance.setPaintProperty("choropleth-fill", "fill-opacity", 0.7);
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
      mapInstance.setPaintProperty("choropleth-fill", "fill-opacity", [
        "case",
        ["==", ["get", "district_id"], String(districtId)],
        0.05,
        0.7,
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

    // Point popup
    mapInstance.on("click", "district-dots", (e: any) => {
      if (!e.features || e.features.length === 0) return;
      const feature = e.features[0];
      const props = feature.properties;
      let content = "<div class='map-popup'>";
      for (const [key, value] of Object.entries(props)) {
        if (key !== "id" && key !== "lat" && key !== "lon" && value) {
          content += `<p><strong>${key}:</strong> ${value}</p>`;
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
    
    console.log(`[PublicMapPage] Location data fields:`, Array.from(locationDataFields));
    
    // If we already have shape layers from map_config, use those
    if (map.map_config?.available_shape_layers && map.map_config.available_shape_layers.length > 0) {
      console.log(`[PublicMapPage] Using shape layers from map_config`);
      setAvailableShapeLayers(map.map_config.available_shape_layers);
      return;
    }
    
    // Otherwise, fetch shape layers for the city and match them to location_data fields
    const discoverMatchingShapeLayers = async () => {
      try {
        // Common district field names that might be used in shape layers or location_data
        const commonDistrictFieldNames = ['supervisor_district', 'district', 'ward', 'sup_dist_num', 'district_id', 'council_district', 'nhood', 'neighborhood'];
        
        // First, fetch city structure to get district fields mapping
        console.log(`[PublicMapPage] Fetching city structure for city ${map.city_id}`);
        let districtFields: string[] = [];
        try {
          const cityStructureResponse = await fetch(`/api/cities/${map.city_id}/structure`);
          if (cityStructureResponse.ok) {
            const cityStructure = await cityStructureResponse.json();
            console.log(`[PublicMapPage] City structure response:`, cityStructure);
            // Try different possible locations for district_fields
            districtFields = cityStructure.district_fields || 
                            cityStructure.districtFields ||
                            (cityStructure.location_fields?.filter((f: any) => 
                              typeof f === 'string' ? f.includes('district') || f.includes('ward') : 
                              (f.fieldName?.includes('district') || f.fieldName?.includes('ward') || f.name?.includes('district') || f.name?.includes('ward'))
                            ).map((f: any) => typeof f === 'string' ? f : (f.fieldName || f.name))) ||
                            [];
            console.log(`[PublicMapPage] City structure district_fields:`, districtFields);
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
            console.log(`[PublicMapPage] Using fallback district fields from location_data:`, foundDistrictFields);
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
        
        console.log(`[PublicMapPage] Fetching shape layers for city ${map.city_id}`);
        const cityLayersResponse = await fetch(`/api/shape-layers/cities/${map.city_id}`);
        
        if (!cityLayersResponse.ok) {
          const errorText = await cityLayersResponse.text();
          console.warn(`[PublicMapPage] Failed to fetch city shape layers: ${cityLayersResponse.status}`, errorText);
          return;
        }
        
        const cityLayersData = await cityLayersResponse.json();
        console.log(`[PublicMapPage] City shape layers API response:`, cityLayersData);
        
        const layers = Array.isArray(cityLayersData) ? cityLayersData : (cityLayersData.layers || cityLayersData.shape_layers || cityLayersData.data || []);
        
        console.log(`[PublicMapPage] Found ${layers.length} shape layers for city`, layers);
        
        // Get all unique field names from location_data
        const locationDataFields = new Set<string>();
        map.location_data.forEach((point: any) => {
          Object.keys(point).forEach(key => {
            if (key !== 'lat' && key !== 'lon' && key !== 'latitude' && key !== 'longitude') {
              locationDataFields.add(key);
            }
          });
        });
        console.log(`[PublicMapPage] Location data fields:`, Array.from(locationDataFields));
        
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
              console.log(`[PublicMapPage] Skipping layer without ID:`, layer);
              continue;
            }
            
            // Get identifier_field from instance or template
            const identifierField = instance?.identifier_field || 
                                   template?.default_identifier_field ||
                                   layer.identifier_field ||
                                   layer.default_identifier_field;
            
            if (!identifierField) {
              console.log(`[PublicMapPage] No identifier_field found for instance ${instanceId}`);
              continue;
            }
            
            console.log(`[PublicMapPage] Checking shape layer instance ${instanceId} with identifier_field "${identifierField}"`);
            
            // Check if identifier_field matches:
            // 1. Direct match in location_data fields
            // 2. Match in city structure district_fields (meaning it's a related district field)
            // 3. identifier_field is a known district-related field name AND location_data has any district field
            const hasDirectMatch = locationDataFields.has(identifierField);
            const isDistrictField = districtFields.includes(identifierField);
            const hasRelatedDistrictField = districtFields.some(df => locationDataFields.has(df));
            const isKnownDistrictFieldName = commonDistrictFieldNames.includes(identifierField);
            
            console.log(`[PublicMapPage] Match check for "${identifierField}":`, {
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
              
              console.log(`[PublicMapPage] ✅ Found matching shape layer: ${instanceId} (identifier_field: ${identifierField}, using field: ${fieldToUse})`);
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
              console.log(`[PublicMapPage] ❌ No match for field "${identifierField}"`);
            }
          } catch (err) {
            console.error(`[PublicMapPage] Error checking shape layer:`, err, layer);
          }
        }
        
        if (matchingLayers.length > 0) {
          console.log(`[PublicMapPage] Found ${matchingLayers.length} matching shape layers`);
          setAvailableShapeLayers(matchingLayers);
          
          // Auto-select first matching layer if none selected
          if (!selectedShapeLayer) {
            setSelectedShapeLayer(String(matchingLayers[0].shape_layer_instance_id));
          }
        } else {
          console.log(`[PublicMapPage] No matching shape layers found`);
        }
      } catch (err) {
        console.error(`[PublicMapPage] Error discovering shape layers:`, err);
      }
    };
    
    discoverMatchingShapeLayers();
  }, [map, selectedShapeLayer]);
  
  console.log(`[PublicMapPage] Map config:`, {
    mapType: map?.map_type,
    hasAggregations: Object.keys(aggregations).length > 0,
    aggregationKeys: Object.keys(aggregations),
    availableShapeLayersCount: availableShapeLayers.length,
    availableShapeLayers: availableShapeLayers,
    shapeLayerInstanceId: map?.map_config?.shape_layer_instance_id
  });

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
      
      // Use provided shapeLayerId or fall back to first available shape layer
      let targetShapeLayerId = shapeLayerId || mapData.map_config?.shape_layer_instance_id;
      
      // If still no shape layer ID, use first available discovered layer
      if (!targetShapeLayerId && availableShapeLayers.length > 0) {
        targetShapeLayerId = availableShapeLayers[0].shape_layer_instance_id;
        console.log(`[PublicMapPage] Using first available discovered shape layer: ${targetShapeLayerId}`);
      }
      
      if (!targetShapeLayerId) {
        console.error("[PublicMapPage] No shape_layer_instance_id available");
        return;
      }
      
      console.log(`[PublicMapPage] loadChoroplethMap called with shapeLayerId: ${targetShapeLayerId}`);
      
      // Find the shape layer from discovered layers
      let shapeLayer = availableShapeLayers.find(
        (sl: any) => String(sl.shape_layer_instance_id) === String(targetShapeLayerId)
      );
      
      // If not found in discovered layers, try to get info from the API
      if (!shapeLayer) {
        console.log(`[PublicMapPage] Shape layer ${targetShapeLayerId} not in discovered layers, fetching from API`);
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
            console.log(`[PublicMapPage] Fetched shape layer from API:`, shapeLayer);
          }
        } catch (err) {
          console.error(`[PublicMapPage] Failed to fetch shape layer from API:`, err);
        }
      }
      
      if (!shapeLayer) {
        console.error(`[PublicMapPage] Shape layer ${targetShapeLayerId} not found`);
        return;
      }
      
      const identifierField = shapeLayer.identifier_field || mapData.map_config?.district_field || "supervisor_district";
      const districtField = identifierField; // Use identifierField for consistency
      
      console.log(`[PublicMapPage] Using identifierField: ${identifierField} for shape layer ${targetShapeLayerId}`);

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
      
      console.log("Shape layer data received:", {
        hasInstance: !!shapeLayerData?.instance,
        hasGeometry: !!shapeLayerData?.instance?.geometry_data,
        instanceId: shapeLayerData?.instance?.id,
        identifierField: shapeLayerData?.instance?.identifier_field
      });
      
      if (!shapeLayerData?.instance?.geometry_data) {
        console.error("Shape layer instance has no geometry data. Response:", shapeLayerData);
        return;
      }
      
      const geometryData = shapeLayerData.instance.geometry_data;
      // Use the identifierField from the shape layer we found
      // The API response also has identifier_field which we can use as fallback

      console.log("Geometry data loaded:", {
        type: geometryData?.type,
        featureCount: geometryData?.features?.length,
        identifierField
      });

      // Check if we have pre-computed aggregations for this shape layer
      const aggregationKey = String(targetShapeLayerId);
      let aggregation = aggregations[aggregationKey] || aggregations[Number(targetShapeLayerId)];
      
      console.log(`[PublicMapPage] Looking for aggregation with key: ${aggregationKey}`);
      console.log(`[PublicMapPage] Found aggregation:`, aggregation ? `Yes (${aggregation.rows?.length || 0} rows)` : 'No');
      
      // Build district -> value map
      const districtDataMap = new Map<string, Record<string, number>>();
      
      if (aggregation && aggregation.rows) {
        // Use pre-computed aggregation
        console.log(`[PublicMapPage] Using pre-computed aggregation with ${aggregation.rows.length} rows`);
        console.log(`[PublicMapPage] Sample aggregation row:`, aggregation.rows[0]);
        console.log(`[PublicMapPage] Aggregation identifier_field:`, aggregation.identifier_field);
        aggregation.rows.forEach((row: any) => {
          // Try multiple ways to get district ID from aggregation row
          const districtId = String(
            row[identifierField] || 
            row[aggregation.identifier_field] ||
            row.district || 
            row.supervisor_district ||
            ""
          ).trim();
          if (districtId && districtId !== "null" && districtId !== "undefined") {
            const normalizedId = String(Math.floor(Number(districtId))) || districtId;
            districtDataMap.set(normalizedId, {
              count: row.count || row.value || 0,
              value: row.value || row.count || 0,
            });
            // Also store with number key as string
            const districtIdNum = Number(normalizedId);
            if (!isNaN(districtIdNum)) {
              districtDataMap.set(String(districtIdNum), {
                count: row.count || row.value || 0,
                value: row.value || row.count || 0,
              });
            }
          }
        });
      } else {
        // Compute aggregation from location_data
        console.log(`[PublicMapPage] Computing aggregation from ${mapData.location_data.length} location_data items`);
        const valueField = mapData.map_config.value_field || "count";
        const isCountAgg = valueField === "count";

        mapData.location_data.forEach((item: any) => {
          // Use the identifierField from the selected shape layer
          const districtId = String(
            item[identifierField] || item[districtField] || item.district || ""
          ).trim();
          if (!districtId || districtId === "null" || districtId === "undefined") return;
          
          const normalizedId = String(Math.floor(Number(districtId))) || districtId;
          const prev = districtDataMap.get(normalizedId) || { count: 0, value: 0 };
          if (isCountAgg) {
            prev.count = (prev.count || 0) + 1;
            prev.value = prev.count;
          } else {
            prev.value = (prev.value || 0) + (Number(item[valueField]) || 0);
            prev.count = prev.value;
          }
          districtDataMap.set(normalizedId, prev);
          
          // Also store with number key as string
          const districtIdNum = Number(normalizedId);
          if (!isNaN(districtIdNum)) {
            districtDataMap.set(String(districtIdNum), prev);
          }
        });
      }
      
      console.log(`[PublicMapPage] districtDataMap has ${districtDataMap.size} entries`);
      console.log(`[PublicMapPage] Sample keys:`, Array.from(districtDataMap.keys()).slice(0, 5));

      // Calculate min/max for color scaling
      const values = Array.from(districtDataMap.values())
        .map((item: any) => Number(item.value || item.count || 0))
        .filter((v: number) => !isNaN(v) && isFinite(v));
      const minValue = values.length > 0 ? Math.min(...values) : 0;
      const maxValue = values.length > 0 ? Math.max(...values) : 1;
      
      console.log(`[PublicMapPage] Value range: ${minValue} to ${maxValue} (${values.length} districts with data)`);
      
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

      // White -> brand purple gradient
      const CHORO_LOW: [number, number, number] = [255, 255, 255];
      const CHORO_HIGH: [number, number, number] = [173, 53, 250]; // #ad35fa

      console.log(`[PublicMapPage] Processing ${geometryData.features.length} shape features`);
      console.log(`[PublicMapPage] Sample feature properties:`, geometryData.features[0]?.properties);
      
      // Merge district data with shape features
      const features = geometryData.features.map((feature: any) => {
        const props = feature.properties || {};
        // Try multiple field names to find the identifier
        // Prefer the identifierField from our shape layer config, then API response, then common alternatives
        const apiIdentifierField = shapeLayerData.instance.identifier_field;
        const districtIdRaw = 
          props[identifierField] || 
          (apiIdentifierField && props[apiIdentifierField]) ||
          props[districtField] ||
          props.district ||
          props.district_id ||
          props.supervisor_district ||
          props.name ||
          props.label ||
          "";
        
        // Normalize district ID
        let districtId = String(districtIdRaw).trim();
        const districtIdNum = Number(districtId);
        if (!isNaN(districtIdNum) && isFinite(districtIdNum)) {
          districtId = String(Math.floor(districtIdNum));
        }
        
        // Try multiple lookup strategies
        let districtData = districtDataMap.get(districtId);
        if (!districtData && districtIdRaw) {
          districtData = districtDataMap.get(String(districtIdRaw).trim());
        }
        if (!districtData && !isNaN(districtIdNum) && isFinite(districtIdNum)) {
          districtData = districtDataMap.get(String(districtIdNum)) || districtDataMap.get(String(Math.floor(districtIdNum)));
        }
        
        const value = districtData ? Number(districtData.value || districtData.count || 0) : null;
        
        if (!districtData && districtId) {
          console.log(`[PublicMapPage] No data found for districtId: "${districtId}" (raw: "${districtIdRaw}")`);
          console.log(`[PublicMapPage] Available keys:`, Array.from(districtDataMap.keys()).slice(0, 10));
        }
        
        // Calculate color (white -> brand purple)
        let color = "#e5e7eb"; // light gray for "no data"
        if (value !== null && !isNaN(value)) {
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
      
      console.log("Adding choropleth layers with", features.length, "features");
      
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
        
        console.log("Choropleth source added successfully");
        
        mapInstance.addLayer({
          id: "choropleth-fill",
          type: "fill",
          source: "choropleth-shapes",
          paint: {
            "fill-color": ["get", "color"],
            "fill-opacity": 0.7,
          },
        });
        
        console.log("Choropleth fill layer added");
        
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
        
        console.log("Choropleth outline layer added");
        
        // Add popup on click
        mapInstance.on("click", "choropleth-fill", (e: any) => {
          if (!e.features || e.features.length === 0) return;
          
          const feature = e.features[0];
          const props = feature.properties;

          const districtId = String(props.district_id || "");

          const canToggleDots = !!(mapData.map_config?.dot_location_data && districtId);

          setDistrictPanel({
            districtId: districtId || "District",
            districtName: String(
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

          // If dot mode is available, reveal dots for this district by default
          // and (by definition) hide dots everywhere else.
          if (canToggleDots) {
            addDotsForDistrict(mapInstance, mapData, districtId);
            setDotsDistrictId(districtId);
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
    
    // Calculate center and zoom
    const center: [number, number] = map.center 
      ? [map.center.lng, map.center.lat]
      : [-122.4194, 37.7749]; // Default to SF
    const zoom = map.center?.zoom || 11;
    
    // Use dark or light map style based on theme
    const mapStyle = theme === "dark" 
      ? "mapbox://styles/mapbox/dark-v11"
      : "mapbox://styles/mapbox/light-v11";
    
    const mapInstance = new mapboxgl.Map({
      container: mapContainerRef.current,
      style: mapStyle,
      center: center,
      zoom: zoom,
    });
    
    mapInstanceRef.current = mapInstance;
    
    mapInstance.on("load", async () => {
      if (!map.location_data || map.location_data.length === 0) {
        console.log("No location data available");
        return;
      }
      
      const locationDataCount = map.location_data?.length || 0;
      const hasAggregations = !!(map.map_config?.aggregations && Object.keys(map.map_config.aggregations).length > 0);
      const hasAvailableShapeLayers = !!(map.map_config?.available_shape_layers && map.map_config.available_shape_layers.length > 0);
      
      // For point maps, we can still render choropleth if we have:
      // 1. City ID (to fetch shape layers)
      // 2. Location data with geographic identifiers (supervisor_district, etc.)
      // 3. At least some data points
      const hasGeographicIdentifiers = !!(map.location_data?.some((point: any) => 
        point.supervisor_district !== undefined || 
        point.supervisor_district !== null ||
        point.district !== undefined ||
        point.district !== null ||
        point.district_id !== undefined ||
        point.district_id !== null
      ));
      
      // Use choropleth if:
      // 1. Map type is choropleth OR we have aggregations OR discovered shape layers OR (point map with geographic identifiers)
      // 2. We have discovered shape layers or aggregations or can discover them
      // 3. We have city_id
      // 4. We have enough data points (or aggregations exist)
      const hasDiscoveredShapeLayers = availableShapeLayers.length > 0;
      const hasShapeLayerInConfig = !!map.map_config?.shape_layer_instance_id;
      const canDiscoverShapeLayers = map.city_id && hasGeographicIdentifiers;
      
      // Determine if we should use choropleth - be more conservative to avoid race conditions
      // If we have aggregations or shape layer config, definitely use choropleth
      // If we can discover shape layers (city_id + geographic identifiers), only use choropleth if already discovered
      const definitelyUseChoropleth = map.map_type === "choropleth" || hasAggregations || hasDiscoveredShapeLayers || hasShapeLayerInConfig;
      const mightUseChoropleth = canDiscoverShapeLayers && map.map_type === "point" && hasGeographicIdentifiers;
      // Only use choropleth if we definitely should, OR if we might and shape layers are already discovered
      const shouldUseChoropleth = definitelyUseChoropleth || (mightUseChoropleth && hasDiscoveredShapeLayers && map.city_id && (locationDataCount >= 100 || hasAggregations));
      
      console.log("Map loaded, checking map type:", {
        mapType: map.map_type,
        locationDataCount,
        shouldUseChoropleth,
        hasAggregations,
        hasAvailableShapeLayers,
        hasGeographicIdentifiers,
        hasDiscoveredShapeLayers,
        hasShapeLayerInConfig,
        canDiscoverShapeLayers,
        aggregationKeys: hasAggregations ? Object.keys(map.map_config!.aggregations) : [],
        availableShapeLayersCount: hasAvailableShapeLayers ? map.map_config!.available_shape_layers.length : 0,
        hasShapeLayerId: !!map.map_config?.shape_layer_instance_id,
        shapeLayerId: map.map_config?.shape_layer_instance_id,
        hasCityId: !!map.city_id,
        cityId: map.city_id,
        mapConfig: map.map_config,
        sampleLocationData: map.location_data?.[0]
      });
      
      // Handle choropleth maps with district shapes
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
          console.log("[PublicMapPage] Loading choropleth map with shapes", { shapeLayerToUse, availableShapeLayersCount: availableShapeLayers.length });
          if (mapInstance && typeof mapInstance.getLayer === 'function') {
            await loadChoroplethMap(mapInstance, map, shapeLayerToUse || null);
          } else {
            console.warn("[PublicMapPage] Map instance not ready, skipping choropleth load");
          }
        } else if (mightUseChoropleth && !hasDiscoveredShapeLayers) {
          console.log("[PublicMapPage] Waiting for shape layers to be discovered...");
          // Shape layers are being discovered asynchronously, they'll trigger a re-render
          // For now, show points as fallback until shape layers are discovered
          // The shape layer discovery effect will switch to choropleth when ready
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
            "heatmap-opacity": (showPoints && !selectedShapeLayer) ? 0.8 : 0,
          },
        });
        
        // For heatmap maps, only auto-show if NOT using choropleth and NOT waiting for shape layers
        const shouldAutoShowHeatmap = (isEmbedded || showPoints) && !selectedShapeLayer && !shouldUseChoropleth && !mightUseChoropleth;
        if (shouldAutoShowHeatmap) {
          setShowPoints(true);
        }
        
        // Set initial visibility based on showPoints and selectedShapeLayer
        if (mapInstance.getLayer("map-heatmap")) {
          if (shouldAutoShowHeatmap) {
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
        }));
        console.log("Rendering point layer:", {
          totalLocationData: map.location_data?.length || 0,
          validPointsCount: validPoints.length,
          points: validPoints.map((p: any) => ({ lat: p.lat, lon: p.lon })),
          invalidPoints: map.location_data.length - validPoints.length
        });
        
        // Group points by exact location to detect overlaps
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
            "circle-opacity": (showPoints && !selectedShapeLayer) ? 0.8 : 0,
          },
        });
        
        // Set initial visibility based on showPoints and selectedShapeLayer
        // For point maps, only auto-show points if NOT using choropleth and NOT waiting for shape layers
        // Don't auto-show if we're waiting for shape layers to be discovered (mightUseChoropleth)
        const shouldAutoShowPoints = (isEmbedded || showPoints) && !selectedShapeLayer && !shouldUseChoropleth && !mightUseChoropleth;
        if (shouldAutoShowPoints) {
          setShowPoints(true);
        }
        
        // Set initial visibility
        if (mapInstance.getLayer("map-points")) {
          if (shouldAutoShowPoints) {
            mapInstance.setLayoutProperty("map-points", "visibility", "visible");
            mapInstance.setPaintProperty("map-points", "circle-opacity", 0.8);
          } else {
            mapInstance.setLayoutProperty("map-points", "visibility", "none");
            mapInstance.setPaintProperty("map-points", "circle-opacity", 0);
          }
        }
        
        // Add popup on click
        mapInstance.on("click", "map-points", (e: any) => {
          if (!e.features || e.features.length === 0) return;
          
          const feature = e.features[0];
          const props = feature.properties;
          
          // Build popup content
          let content = "<div class='map-popup'>";
          for (const [key, value] of Object.entries(props)) {
            if (key !== "id" && key !== "lat" && key !== "lon" && value) {
              content += `<p><strong>${key}:</strong> ${value}</p>`;
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
    
    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, [map, mapboxLoaded, theme, selectedShapeLayer, isEmbedded]);
  
  // Trigger choropleth rendering when shape layers are discovered
  useEffect(() => {
    if (!map || !mapInstanceRef.current || !mapboxLoaded) return;
    
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
      const definitelyUseChoropleth = map.map_type === "choropleth" || hasAggregations;
      
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
    const locationDataCount = map.location_data?.length || 0;
    const hasAggregations = !!(map.map_config?.aggregations && Object.keys(map.map_config.aggregations).length > 0);
    const hasGeographicIdentifiers = !!(map.location_data?.some((point: any) => 
      point.supervisor_district !== undefined || 
      point.supervisor_district !== null ||
      point.district !== undefined ||
      point.district !== null ||
      point.district_id !== undefined ||
      point.district_id !== null
    ));
    
    const shouldUseChoropleth = 
      (map.map_type === "choropleth" || hasAggregations || (map.map_type === "point" && hasGeographicIdentifiers)) && 
      map.city_id &&
      (locationDataCount >= 100 || hasAggregations);
    
    if (shouldUseChoropleth && mapInstanceRef.current) {
      console.log("[PublicMapPage] Shape layers discovered, loading choropleth", { shapeLayerToUse });
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
      const newStyle = theme === "dark"
        ? "mapbox://styles/mapbox/dark-v11"
        : "mapbox://styles/mapbox/light-v11";
      mapInstanceRef.current.setStyle(newStyle);
      
      // Reload choropleth layers after style loads
      mapInstanceRef.current.once("style.load", async () => {
        const locationDataCount = map.location_data?.length || 0;
        const hasAggregations = map.map_config?.aggregations && Object.keys(map.map_config.aggregations).length > 0;
        const hasAvailableShapeLayers = map.map_config?.available_shape_layers && map.map_config.available_shape_layers.length > 0;
        const shouldUseChoropleth = 
          (map.map_type === "choropleth" || hasAggregations || hasAvailableShapeLayers) && 
          (map.map_config?.shape_layer_instance_id || hasAvailableShapeLayers) && 
          map.city_id &&
          (locationDataCount >= 1000 || hasAggregations);
        
        if (shouldUseChoropleth && mapInstanceRef.current) {
          console.log("Reloading choropleth layers after style change");
          await loadChoroplethMap(mapInstanceRef.current, map, selectedShapeLayer);
        } else if (mapInstanceRef.current && mapInstanceRef.current.getLayer && mapInstanceRef.current.getLayer("choropleth-outline")) {
          // Just update outline color if layers already exist
          const outlineColor = theme === "dark" ? "#ffffff" : "#000000";
          mapInstanceRef.current.setPaintProperty("choropleth-outline", "line-color", outlineColor);
          mapInstanceRef.current.setPaintProperty("choropleth-outline", "line-opacity", theme === "dark" ? 0.8 : 0.6);
        }
      });
    }
  }, [theme, mapboxLoaded, map, selectedShapeLayer]);
  
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
      <div className={`public-map-page loading ${isEmbedded ? "embedded" : ""}`}>
        <div className="loading-spinner">Loading map...</div>
      </div>
    );
  }
  
  if (error) {
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
    return <div className={`public-map-page ${isEmbedded ? "embedded" : ""}`}>Map not found</div>;
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
            <span>{map.location_data?.length || 0} locations</span>
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
              // Hide points when selecting a shape layer
              if (showPoints) {
                setShowPoints(false);
              }
              if (mapInstanceRef.current && map) {
                loadChoroplethMap(mapInstanceRef.current, map, shapeLayerId);
              }
            }}
            showDots={showPoints && !selectedShapeLayer}
            onToggleDots={() => {
              // Clear shape layer selection when showing points
              if (!showPoints && selectedShapeLayer) {
                setSelectedShapeLayer(null);
              }
              setShowPoints(!showPoints);
            }}
            canShowDots={!!(map.location_data && map.location_data.length > 0)}
          />
          <div className="map-container embedded-map" ref={mapContainerRef} />
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
                  <div className="label">Count</div>
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
            <p className="map-city-name">{map.city_name || resolvedCityName}</p>
          )}
          <h1 className="map-title">{map.title}</h1>
          {map.description && (
            <p className="map-description">{map.description}</p>
          )}
          <div className="map-meta">
            <span>{map.location_data?.length || 0} locations</span>
            <span> • </span>
            <span>Created {new Date(map.created_at).toLocaleDateString()}</span>
          </div>
        </div>

        <div className="map-container-wrapper">
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
              // Hide points when selecting a shape layer
              if (showPoints) {
                setShowPoints(false);
              }
              if (mapInstanceRef.current && map) {
                loadChoroplethMap(mapInstanceRef.current, map, shapeLayerId);
              }
            }}
            showDots={showPoints && !selectedShapeLayer}
            onToggleDots={() => {
              // Clear shape layer selection when showing points
              if (!showPoints && selectedShapeLayer) {
                setSelectedShapeLayer(null);
              }
              setShowPoints(!showPoints);
            }}
            canShowDots={!!(map.location_data && map.location_data.length > 0)}
          />
          <div className="map-container" ref={mapContainerRef} />
          {legend && legend.items.length > 0 && (
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
                  <div className="label">Count</div>
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
          
          <div className="cta-section">
            <h3>Sign up now</h3>
            <p>
              Get updates, maps, and content about your city and neighborhood.
            </p>
            <a href="/" className="cta-button">
              Sign up
            </a>
          </div>
        </footer>
      </article>
    </div>
  );
}


"use client";

import { useState, useEffect, useRef } from "react";
import type { SavedMap } from "@/lib/apiClient";
import { API_BASE } from "@/lib/apiBase";
import Loader from "./Loader";
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
  const [showPoints, setShowPoints] = useState(false);
  const [mapboxLoaded, setMapboxLoaded] = useState(false);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);

  // Get available shape layers from map_config
  const aggregations = mapData.map_config?.aggregations || {};
  const availableShapeLayers: ShapeLayer[] = mapData.map_config?.available_shape_layers || [];

  // Determine if we have aggregations (choropleth) or just points
  const hasAggregations = Object.keys(aggregations).length > 0;
  const isPointMap = mapData.map_type === "point" && !hasAggregations;

  // Initialize selected shape layer to first available
  useEffect(() => {
    if (hasAggregations && availableShapeLayers.length > 0 && !selectedShapeLayer) {
      setSelectedShapeLayer(String(availableShapeLayers[0].shape_layer_instance_id));
    }
  }, [hasAggregations, availableShapeLayers, selectedShapeLayer]);

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

  // Render map
  useEffect(() => {
    if (!mapboxLoaded || !mapContainerRef.current) return;

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

    // Clean up previous map instance
    if (mapInstanceRef.current) {
      try {
        mapInstanceRef.current.remove();
      } catch {
        // ignore cleanup errors
      }
      mapInstanceRef.current = null;
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

      map.on("load", () => {
        setTimeout(() => {
          try {
            if (hasAggregations && selectedShapeLayer) {
              loadChoroplethMap(map, selectedShapeLayer);
            } else if (isPointMap) {
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
  }, [mapboxLoaded, mapData, hasAggregations, isPointMap, selectedShapeLayer]);

  // Update choropleth when shape layer changes
  useEffect(() => {
    if (!mapInstanceRef.current || !hasAggregations || !selectedShapeLayer) return;
    
    try {
      loadChoroplethMap(mapInstanceRef.current, selectedShapeLayer);
    } catch (err) {
      console.error("Error updating choropleth:", err);
    }
  }, [selectedShapeLayer, hasAggregations]);

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
      addPointsLayer(mapInstanceRef.current, validFilteredPoints);
    }
  }, [showPoints, selectedDistrictId, points, selectedShapeLayer, aggregations]);

  const loadChoroplethMap = async (mapInstance: any, shapeLayerId: string) => {
    try {
      const aggregation = aggregations[shapeLayerId] as Aggregation | undefined;
      if (!aggregation) return;

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
      aggregation.rows.forEach((row: any) => {
        const districtId = String(row.district || row[identifierField] || "");
        if (districtId && districtId !== "null" && districtId !== "undefined") {
          // Store with string key
          districtDataMap.set(districtId, row);
          // Also store with number key if it's a valid number
          const districtIdNum = Number(districtId);
          if (!isNaN(districtIdNum) && isFinite(districtIdNum)) {
            districtDataMap.set(districtIdNum, row);
          }
        }
      });

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

      const features = geometryData.features.map((feature: any) => {
        // Try multiple ways to get district ID from shape layer properties
        const districtId = String(
          feature.properties[identifierField] ||
          feature.properties.district ||
          feature.properties.district_id ||
          feature.properties.supervisor_district ||
          ""
        );

        const districtData = districtDataMap.get(districtId);
        const value = districtData ? Number(districtData[valueField] || districtData.count || 0) : null;

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
        mapInstance.removeLayer("points-layer");
      }
      if (mapInstance.getSource("points-source")) {
        mapInstance.removeSource("points-source");
      }

      mapInstance.addSource("points-source", {
        type: "geojson",
        data: geojsonData,
      });

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

  return (
    <div className="progressive-map-view">
      {hasAggregations && availableShapeLayers.length > 1 && (
        <div className="shape-layer-selector">
          <label>View by:</label>
          <select
            value={selectedShapeLayer || ""}
            onChange={(e) => setSelectedShapeLayer(e.target.value)}
          >
            {availableShapeLayers.map((layer) => (
              <option key={layer.shape_layer_instance_id} value={String(layer.shape_layer_instance_id)}>
                {layer.display_name}
              </option>
            ))}
          </select>
        </div>
      )}
      
      {showPoints && (
        <div className="points-controls">
          <button onClick={() => setShowPoints(false)}>Hide Points</button>
          {selectedDistrictId && (
            <span className="selected-district">
              Showing points for {availableShapeLayers.find(sl => String(sl.shape_layer_instance_id) === selectedShapeLayer)?.display_name || "District"} {selectedDistrictId}
            </span>
          )}
        </div>
      )}

      {loadingPoints && (
        <div className="points-loading">
          <Loader size="sm" color="purple" />
          <span>Loading points...</span>
        </div>
      )}

      <div ref={mapContainerRef} className="map-container" style={{ height }} />
      {!mapboxLoaded && (
        <div className="map-loading">
          <Loader size="md" color="purple" />
          <span>Loading Mapbox...</span>
        </div>
      )}
    </div>
  );
}

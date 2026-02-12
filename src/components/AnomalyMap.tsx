"use client";

import { useState, useEffect, useRef } from "react";
import { getMetricMapPreview, type MapPreviewResponse } from "@/lib/publicApiClient";
import "./AnomalyMap.css";

// Mapbox access token
const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || "";

interface AnomalyMapProps {
  /** Metric ID to fetch map data for */
  metricId: number;
  /** Start date for the map data (YYYY-MM-DD format) */
  startDate: string;
  /** End date for the map data (YYYY-MM-DD format) */
  endDate: string;
  /** Optional district filter (0 or undefined = citywide) */
  district?: number;
  /** Optional group field name to filter by (e.g., 'disposition') */
  groupField?: string;
  /** Optional group value to filter for (e.g., 'GOA') */
  groupValue?: string;
  /** Optional height in pixels (default: 300) */
  height?: number;
  /** Optional callback when map data is loaded */
  onLoad?: (data: { location_data_count: number; period_start: string; period_end: string }) => void;
  /** Hide the built-in header (use external header) */
  hideHeader?: boolean;
}

/**
 * AnomalyMap - A simple point map showing location data for a metric's date range.
 * 
 * Uses the existing getMetricMapPreview API (same as metric detail pages).
 */
export default function AnomalyMap({
  metricId,
  startDate,
  endDate,
  district,
  groupField,
  groupValue,
  height = 300,
  onLoad,
  hideHeader = false,
}: AnomalyMapProps) {
  const [mapData, setMapData] = useState<MapPreviewResponse | null>(null);
  const [actualItemCount, setActualItemCount] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mapboxLoaded, setMapboxLoaded] = useState(false);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  
  // Store callback in ref to avoid triggering re-fetches
  const onLoadRef = useRef(onLoad);
  useEffect(() => { onLoadRef.current = onLoad; }, [onLoad]);

  // Load Mapbox GL JS
  useEffect(() => {
    if (typeof window === "undefined") return;
    
    // Check if already loaded
    if ((window as any).mapboxgl) {
      setMapboxLoaded(true);
      return;
    }

    // Load Mapbox GL CSS
    const cssLink = document.createElement("link");
    cssLink.href = "https://api.mapbox.com/mapbox-gl-js/v3.0.0/mapbox-gl.css";
    cssLink.rel = "stylesheet";
    document.head.appendChild(cssLink);

    // Load Mapbox GL JS
    const script = document.createElement("script");
    script.src = "https://api.mapbox.com/mapbox-gl-js/v3.0.0/mapbox-gl.js";
    script.async = true;
    script.onload = () => setMapboxLoaded(true);
    script.onerror = () => {
      setError("Failed to load map library");
    };
    document.head.appendChild(script);
  }, []);

  // Fetch map preview using existing metric map-preview endpoint
  useEffect(() => {
    if (!metricId || !startDate || !endDate) {
      setLoading(false);
      return;
    }

    let mounted = true;

    const fetchMapPreview = async () => {
      try {
        setLoading(true);
        setError(null);
        
        const response = await getMetricMapPreview(metricId, {
          start_date: startDate,
          end_date: endDate,
          district: district && district !== 0 ? district : undefined,
          period_type: "custom", // Custom date range for anomaly
          group_field: groupField || undefined,
          group_value: groupValue || undefined,
        });
        
        if (mounted) {
          setMapData(response);
          
          // Calculate actual item count - if data is aggregated by district,
          // sum the 'count' or 'value' fields, otherwise use location_data_count
          let itemCount = response.location_data_count;
          if (response.location_data && response.location_data.length > 0) {
            const firstItem = response.location_data[0];
            // Check if this is aggregated data (has count/value field)
            if ('count' in firstItem || 'value' in firstItem) {
              itemCount = response.location_data.reduce((sum, item) => {
                return sum + (item.count || item.value || 0);
              }, 0);
            }
          }
          setActualItemCount(itemCount);
          
          onLoadRef.current?.({
            location_data_count: itemCount,
            period_start: startDate,
            period_end: endDate,
          });
        }
      } catch (err: any) {
        if (mounted) {
          const errorMessage = err.message || "Failed to load map data";
          // Don't show error for "no map_query" - just hide the map
          if (errorMessage.includes("map_query") || errorMessage.includes("not available") || err.status === 404) {
            setError("unavailable");
          } else {
            setError(errorMessage);
          }
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    };

    fetchMapPreview();
    
    return () => {
      mounted = false;
    };
  }, [metricId, startDate, endDate, district, groupField, groupValue]);

  // Initialize map when both Mapbox and data are ready
  useEffect(() => {
    if (!mapboxLoaded || !mapData || !mapContainerRef.current) return;
    const overlay = (mapData as any)?.map_config?.custom_dimension_overlay;
    const circlesGeojson = overlay?.circles_geojson;
    const hasCircles =
      circlesGeojson &&
      circlesGeojson.type === "FeatureCollection" &&
      Array.isArray(circlesGeojson.features) &&
      circlesGeojson.features.length > 0;

    const hasPoints =
      Array.isArray(mapData.location_data) &&
      mapData.location_data.some((p) => p.lat && (p.lon || p.lng));

    if (!hasPoints && !hasCircles) return;

    const mapboxgl = (window as any).mapboxgl;
    if (!mapboxgl) return;

    mapboxgl.accessToken = MAPBOX_TOKEN;

    // Cleanup previous map instance
    if (mapInstanceRef.current) {
      mapInstanceRef.current.remove();
      mapInstanceRef.current = null;
    }

    // Calculate bounds from data if not provided
    let bounds = mapData.bounds;
    let center = mapData.center;

    if (!bounds && mapData.location_data.length > 0) {
      const lats = mapData.location_data.map((p) => p.lat).filter(Boolean);
      const lons = mapData.location_data.map((p) => p.lon || p.lng).filter(Boolean);
      
      if (lats.length > 0 && lons.length > 0) {
        bounds = [
          [Math.min(...lons), Math.min(...lats)],
          [Math.max(...lons), Math.max(...lats)],
        ];
      }
    }

    // Fallback bounds from circle overlay if we have circles but no point-derived bounds
    if (!bounds && hasCircles) {
      try {
        const coords: Array<[number, number]> = [];
        for (const f of circlesGeojson.features) {
          const geom = f?.geometry;
          if (geom?.type === "Polygon" && Array.isArray(geom.coordinates?.[0])) {
            for (const c of geom.coordinates[0]) {
              if (Array.isArray(c) && c.length >= 2) {
                coords.push([c[0], c[1]]);
              }
            }
          }
        }
        if (coords.length > 0) {
          const lons = coords.map((c) => c[0]);
          const lats = coords.map((c) => c[1]);
          bounds = [
            [Math.min(...lons), Math.min(...lats)],
            [Math.max(...lons), Math.max(...lats)],
          ];
        }
      } catch {
        // ignore
      }
    }

    // Create map
    const map = new mapboxgl.Map({
      container: mapContainerRef.current,
      style: "mapbox://styles/mapbox/light-v11",
      center: center ? [center.lng, center.lat] : [-122.4194, 37.7749], // Default to SF
      zoom: center?.zoom || 11,
      attributionControl: false,
    });

    mapInstanceRef.current = map;

    map.on("load", () => {
      // Custom location dimension overlay (e.g. hotspot circles)
      const overlay = (mapData as any)?.map_config?.custom_dimension_overlay;
      const circlesGeojson = overlay?.circles_geojson;
      if (circlesGeojson && circlesGeojson.type === "FeatureCollection") {
        map.addSource("custom-dimension-circles", {
          type: "geojson",
          data: circlesGeojson,
        });

        // Fill (light) under points
        map.addLayer({
          id: "custom-dimension-circles-fill",
          type: "fill",
          source: "custom-dimension-circles",
          paint: {
            "fill-color": "#ad35fa",
            "fill-opacity": 0.08,
          },
        });

        // Outline under points
        map.addLayer({
          id: "custom-dimension-circles-line",
          type: "line",
          source: "custom-dimension-circles",
          paint: {
            "line-color": "#ad35fa",
            "line-width": 2,
            "line-opacity": 0.7,
          },
        });
      }

      // Add source for points
      map.addSource("anomaly-points", {
        type: "geojson",
        data: {
          type: "FeatureCollection",
          features: mapData.location_data
            .filter((p) => p.lat && (p.lon || p.lng))
            .map((point) => ({
              type: "Feature",
              geometry: {
                type: "Point",
                coordinates: [point.lon || point.lng, point.lat],
              },
              properties: point,
            })),
        },
      });

      // Add point layer with brand color
      map.addLayer({
        id: "anomaly-points-layer",
        type: "circle",
        source: "anomaly-points",
        paint: {
          "circle-radius": 5,
          "circle-color": "#ad35fa", // Brand primary color
          "circle-opacity": 0.7,
          "circle-stroke-width": 1,
          "circle-stroke-color": "#ffffff",
          "circle-stroke-opacity": 0.9,
        },
      });

      // Fit to bounds
      if (bounds) {
        map.fitBounds(bounds as any, {
          padding: 40,
          maxZoom: 14,
          duration: 0,
        });
      }
    });

    // Add navigation control
    map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), "top-right");

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, [mapboxLoaded, mapData]);

  // Don't render if map is unavailable (no map_query)
  if (error === "unavailable") {
    return null;
  }

  // Show loading state
  if (loading) {
    return (
      <div className="anomaly-map-container" style={{ height }}>
        <div className="anomaly-map-loading">
          <div className="anomaly-map-spinner" />
          <span>Loading map...</span>
        </div>
      </div>
    );
  }

  // Show error state
  if (error) {
    return (
      <div className="anomaly-map-container" style={{ height }}>
        <div className="anomaly-map-error">
          <span>Map unavailable</span>
        </div>
      </div>
    );
  }

  // No data - don't render
  const overlay = (mapData as any)?.map_config?.custom_dimension_overlay;
  const circlesGeojson = overlay?.circles_geojson;
  const hasCircles =
    circlesGeojson &&
    circlesGeojson.type === "FeatureCollection" &&
    Array.isArray(circlesGeojson.features) &&
    circlesGeojson.features.length > 0;

  if (!mapData || ((!mapData.location_data || mapData.location_data.length === 0) && !hasCircles)) {
    return null;
  }

  // Format date range for display
  const formatDate = (dateStr: string | null | undefined) => {
    if (!dateStr) return "";
    const date = new Date(dateStr);
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  };

  const dateRangeText = `${formatDate(startDate)} - ${formatDate(endDate)}`;

  return (
    <div className={`anomaly-map-wrapper ${hideHeader ? "no-header" : ""}`}>
      {!hideHeader && (
        <div className="anomaly-map-header">
          <span className="anomaly-map-title">Location Map</span>
          <span className="anomaly-map-count">
            {actualItemCount.toLocaleString()} location{actualItemCount !== 1 ? "s" : ""}
            {dateRangeText && ` • ${dateRangeText}`}
          </span>
        </div>
      )}
      <div
        ref={mapContainerRef}
        className="anomaly-map-container"
        style={{ height }}
      />
    </div>
  );
}

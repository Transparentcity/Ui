"use client";

import { useState, useEffect, useRef } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { useTheme } from "@/contexts/ThemeContext";
import "./styles.css";

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
  metric_id: number | null;
  is_public: boolean;
  view_count: number;
  created_at: string;
}

// Fetch public map data (no auth required)
async function getPublicMap(hash: string): Promise<SavedMap> {
  const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8001";
  const response = await fetch(`${apiBase}/api/maps/public/${hash}`);
  
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
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  
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
  
  // Load Mapbox script
  useEffect(() => {
    if (typeof window !== "undefined" && !(window as any).mapboxgl) {
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
    } else if ((window as any).mapboxgl) {
      setMapboxLoaded(true);
    }
  }, []);
  
  // Helper function to load choropleth map with district shapes
  const loadChoroplethMap = async (mapInstance: any, mapData: SavedMap) => {
    try {
      const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8001";
      const shapeLayerId = mapData.map_config?.shape_layer_instance_id;
      const districtField = mapData.map_config?.district_field || "supervisor_district";
      
      console.log("Loading choropleth map:", {
        shapeLayerId,
        districtField,
        cityId: mapData.city_id,
        mapType: mapData.map_type,
        mapConfig: mapData.map_config
      });
      
      if (!shapeLayerId) {
        console.error("No shape_layer_instance_id in map_config. Map config:", mapData.map_config);
        return;
      }
      
      if (!mapData.city_id) {
        console.error("No city_id in map data");
        return;
      }
      
      // Fetch shape layer instance directly using public endpoint
      const response = await fetch(
        `${apiBase}/api/shape-layers/public/instances/${shapeLayerId}?include_geometry=true`
      );
      
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
      const identifierField = shapeLayerData.instance.identifier_field || districtField;
      
      console.log("Geometry data loaded:", {
        type: geometryData?.type,
        featureCount: geometryData?.features?.length,
        identifierField
      });
      
      // Create lookup map from location_data
      const districtDataMap = new Map();
      mapData.location_data.forEach((item: any) => {
        const districtId = String(item[districtField] || item.district || item[identifierField] || "");
        if (districtId) {
          districtDataMap.set(districtId, item);
        }
      });
      
      // Find the value field (series_field or first numeric field)
      const valueField = mapData.map_config.series_field || 
        Object.keys(mapData.location_data[0] || {}).find(
          (key) => key !== districtField && key !== "district" && 
          typeof mapData.location_data[0]?.[key] === "number"
        ) || "value";
      
      // Calculate min/max for color scaling
      const values = Array.from(districtDataMap.values())
        .map((item: any) => Number(item[valueField]))
        .filter((v: number) => !isNaN(v) && isFinite(v));
      const minValue = values.length > 0 ? Math.min(...values) : 0;
      const maxValue = values.length > 0 ? Math.max(...values) : 1;
      
      // Merge district data with shape features
      const features = geometryData.features.map((feature: any) => {
        const districtId = String(
          feature.properties[identifierField] || 
          feature.properties[districtField] ||
          feature.properties.district ||
          ""
        );
        
        const districtData = districtDataMap.get(districtId);
        const value = districtData ? Number(districtData[valueField]) : null;
        
        // Calculate color (sequential palette)
        let color = "#cccccc"; // Default gray for no data
        if (value !== null && !isNaN(value)) {
          const normalized = (value - minValue) / (maxValue - minValue || 1);
          // Use brand purple sequential palette
          const r = Math.floor(102 + normalized * 153); // 102-255
          const g = Math.floor(126 - normalized * 126); // 126-0
          const b = Math.floor(230 - normalized * 30);  // 230-200
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
      if (mapInstance.getLayer("choropleth-fill")) {
        mapInstance.removeLayer("choropleth-fill");
      }
      if (mapInstance.getLayer("choropleth-outline")) {
        mapInstance.removeLayer("choropleth-outline");
      }
      if (mapInstance.getSource("choropleth-shapes")) {
        mapInstance.removeSource("choropleth-shapes");
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
          
          let content = "<div class='map-popup'>";
          content += `<h3>${props.district_id || "District"}</h3>`;
          if (props.value !== null && props.value !== undefined) {
            content += `<p><strong>${valueField}:</strong> ${props.value.toLocaleString()}</p>`;
          }
          for (const [key, value] of Object.entries(props)) {
            if (!["id", "color", "district_id"].includes(key) && value !== null && value !== undefined) {
              content += `<p><strong>${key}:</strong> ${value}</p>`;
            }
          }
          content += "</div>";
          
          new (window as any).mapboxgl.Popup()
            .setLngLat(e.lngLat)
            .setHTML(content)
            .addTo(mapInstance);
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
      
      console.log("Map loaded, checking map type:", {
        mapType: map.map_type,
        hasShapeLayerId: !!map.map_config?.shape_layer_instance_id,
        shapeLayerId: map.map_config?.shape_layer_instance_id,
        hasCityId: !!map.city_id,
        cityId: map.city_id,
        mapConfig: map.map_config
      });
      
      // Handle choropleth maps with district shapes
      if (map.map_type === "choropleth" && map.map_config?.shape_layer_instance_id && map.city_id) {
        console.log("Loading choropleth map with shapes");
        await loadChoroplethMap(mapInstance, map);
      } else if (map.map_type === "heatmap") {
        // Heatmap layer
        const geojsonData = {
          type: "FeatureCollection" as const,
          features: map.location_data
            .filter((point: any) => point.lat && point.lon)
            .map((point: any, index: number) => ({
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
            "heatmap-opacity": 0.8,
          },
        });
      } else {
        // Point layer
        const geojsonData = {
          type: "FeatureCollection" as const,
          features: map.location_data
            .filter((point: any) => point.lat && point.lon)
            .map((point: any, index: number) => ({
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
          id: "map-points",
          type: "circle",
          source: "map-points",
          paint: {
            "circle-radius": 6,
            "circle-color": "#ad35fa",
            "circle-stroke-color": "#fff",
            "circle-stroke-width": 1,
            "circle-opacity": 0.8,
          },
        });
        
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
  }, [map, mapboxLoaded, theme]);
  
  // Update map style when theme changes
  useEffect(() => {
    if (mapInstanceRef.current && mapboxLoaded && map) {
      const newStyle = theme === "dark"
        ? "mapbox://styles/mapbox/dark-v11"
        : "mapbox://styles/mapbox/light-v11";
      mapInstanceRef.current.setStyle(newStyle);
      
      // Reload choropleth layers after style loads
      mapInstanceRef.current.once("style.load", async () => {
        if (map.map_type === "choropleth" && map.map_config?.shape_layer_instance_id && map.city_id) {
          console.log("Reloading choropleth layers after style change");
          await loadChoroplethMap(mapInstanceRef.current, map);
        } else if (mapInstanceRef.current.getLayer("choropleth-outline")) {
          // Just update outline color if layers already exist
          const outlineColor = theme === "dark" ? "#ffffff" : "#000000";
          mapInstanceRef.current.setPaintProperty("choropleth-outline", "line-color", outlineColor);
          mapInstanceRef.current.setPaintProperty("choropleth-outline", "line-opacity", theme === "dark" ? 0.8 : 0.6);
        }
      });
    }
  }, [theme, mapboxLoaded, map]);
  
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
        <div className="map-container embedded-map" ref={mapContainerRef} />
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
        
        <div className="map-container" ref={mapContainerRef} />
        
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
            <h3>Explore More Civic Data</h3>
            <p>
              Create interactive maps and analyze public data for any city.
            </p>
            <a href="/" className="cta-button">
              Visit TransparentCity
            </a>
          </div>
        </footer>
      </article>
    </div>
  );
}


"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useAuth0 } from "@auth0/auth0-react";
import {
  getCity,
  getCityStructure,
  getCityShapeLayers,
  type CityLeader,
  type CityShapefile,
  type CityDetail,
  type CityStructureData,
  type CityShapeLayerListItem,
} from "@/lib/apiClient";
import { useTheme } from "@/contexts/ThemeContext";
import Loader from "./Loader";
import CityMetricsMap from "./CityMetricsMap";
import "./CityMapView.css";
import { LAYER_COLOR_PALETTE } from "@/lib/layerColors";
import type { MetricDateRange } from "@/lib/dateRange";

// Helper function to zoom map to a GPS location with 150m radius
function zoomToGPSLocation(map: any, lat: number, lng: number) {
  // 150 meters in degrees (approximate, varies slightly by latitude)
  // At equator: 1 degree ≈ 111km, so 150m ≈ 0.00135 degrees
  // We'll use a slightly larger value to account for latitude variation
  const radiusInDegrees = 0.0015; // ~150m radius
  
  // Create bounding box around the GPS point
  const bounds = [
    [lng - radiusInDegrees, lat - radiusInDegrees], // Southwest corner
    [lng + radiusInDegrees, lat + radiusInDegrees], // Northeast corner
  ] as [[number, number], [number, number]];
  
  // Use fitBounds to zoom to the bounding box with padding
  map.fitBounds(bounds, {
    padding: { top: 20, bottom: 20, left: 20, right: 20 },
    maxZoom: 18, // Don't zoom in too close
    duration: 1000, // Smooth animation
  });
}

interface CityMapViewProps {
  cityId: number;
  isAdmin?: boolean;
  cityData?: CityDetail | null; // Optional city data to avoid duplicate API calls
  metricDateRange?: MetricDateRange;
  gpsLocation?: { lat: number; lng: number } | null; // GPS coordinates to zoom to
}

export default function CityMapView({
  cityId,
  isAdmin = false,
  cityData: propCityData,
  metricDateRange,
  gpsLocation,
}: CityMapViewProps) {
  const { getAccessTokenSilently } = useAuth0();
  const { theme } = useTheme();
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<any>(null);
  const mapCityIdRef = useRef<number | null>(null);
  const loadingRef = useRef<{ cityId: number | null; inProgress: boolean }>({ cityId: null, inProgress: false });
  const [loading, setLoading] = useState(!propCityData); // Don't show loading if cityData is provided
  const [error, setError] = useState<string | null>(null);
  const [cityData, setCityData] = useState<CityDetail | null>(propCityData || null);
  const [cityStructure, setCityStructure] = useState<CityStructureData | null>(null);
  const [leaders, setLeaders] = useState<CityLeader[]>([]);
  const [shapefiles, setShapefiles] = useState<CityShapefile[]>([]);
  const [shapeLayers, setShapeLayers] = useState<CityShapeLayerListItem[]>([]);
  const [enabledLayerInstanceIds, setEnabledLayerInstanceIds] = useState<Set<number>>(new Set());
  const [mapCenter, setMapCenter] = useState<[number, number] | null>(null);
  const [mapZoom, setMapZoom] = useState<number>(11);
  const [structureDataReady, setStructureDataReady] = useState(false);
  const [defaultStructureSet, setDefaultStructureSet] = useState(false);
  const [mapStyleVersion, setMapStyleVersion] = useState(0);

  // Keep latest state accessible to Mapbox event handlers (which outlive renders).
  const shapefilesRef = useRef<CityShapefile[]>([]);
  const updateMapWithEnabledLayersRef = useRef<(map: any) => void>(() => {});
  
  // Update cityData when prop changes
  useEffect(() => {
    if (propCityData) {
      setCityData(propCityData);
    }
  }, [propCityData]);

  useEffect(() => {
    shapefilesRef.current = shapefiles;
  }, [shapefiles]);


  // Load city data, leaders, and shapefiles
  useEffect(() => {
    let cancelled = false;

    // Prevent duplicate calls for the same cityId
    if (loadingRef.current.cityId === cityId && loadingRef.current.inProgress) {
      return;
    }
    
        // Reset loading ref when cityId changes
    if (loadingRef.current.cityId !== cityId) {
      loadingRef.current = { cityId, inProgress: false };
      // Reset structure data ready state when city changes
      setStructureDataReady(false);
    }
    
    loadingRef.current.inProgress = true;

    const loadData = async () => {
      try {
        // Only show loading if we don't have cityData yet
        if (!propCityData && !cityData) {
          setLoading(true);
        }
        setError(null);
        const token = await getAccessTokenSilently();

        if (cancelled) return;

        console.log("Loading data for cityId:", cityId, "isAdmin:", isAdmin, "hasPropCityData:", !!propCityData, "hasCityData:", !!cityData);

        // Only fetch city data if not provided as prop
        const cityPromise = (propCityData || cityData)
          ? Promise.resolve(propCityData || cityData)
          : getCity(cityId, token);

        // Load city data first for faster initial render
        const city = await cityPromise;

        if (cancelled) return;

        // Set city data immediately so UI can render
        setCityData(city);

        // Load structure data in background (heavy operation)
        // For non-admin users, we still need elected officials for map labels/popups
        let structureData = null;
        try {
          structureData = await getCityStructure(cityId, token).catch((err) => {
            console.error("Failed to load city structure:", err);
            return null;
          });
        } catch (err) {
          console.error("Error loading city structure:", err);
        }

        if (cancelled) return;

        // Extract leaders from structure data (used for popups and defaults)
        const leadersData = structureData?.leaders || [];
        let layersData: CityShapeLayerListItem[] = [];
        try {
          layersData = await getCityShapeLayers(cityId, token, true);
        } catch (err) {
          console.error("Failed to load city shape layers:", err);
          layersData = [];
        }

        const shapefilesData: CityShapefile[] = layersData
          .map((l) => l.instance)
          .filter((i): i is CityShapefile => !!i);

        // Default enabled set: instances with status=active and geometry present
        const defaultEnabled = new Set<number>();
        shapefilesData.forEach((sf) => {
          const status = (sf as any).status || "active";
          if (status === "active" && sf.geometry_data) {
            defaultEnabled.add(sf.id);
          }
        });

        console.log("Loaded data - city:", city?.name, "leaders:", leadersData.length, "shapefiles:", shapefilesData.length);
        console.log("Shapefiles details:", shapefilesData.map((sf: any) => ({
          id: sf.id,
          shapefile_name: sf.shapefile_name,
          structure_type: sf.structure_type,
          feature_count: sf.feature_count
        })));
        console.log("City structure:", structureData);
        console.log("Geographic structures:", structureData?.geographic_structures?.length || 0);
        console.log("Query configs:", structureData?.query_configs?.length || 0);
        
        if (shapefilesData.length === 0 && isAdmin) {
          const geoStructures = structureData?.geographic_structures || [];
          const queryConfigs = structureData?.query_configs || [];
          const structuresWithUrls = geoStructures.filter((gs: any) => gs.shapefile_url);
          const configsWithEndpoints = queryConfigs.filter((qc: any) => qc.endpoint);
          
          console.warn("⚠️ No shape layer instances loaded for admin user.");
          console.warn(`  Geographic structures: ${geoStructures.length}`);
          console.warn(`  Structures with shapefile_url: ${structuresWithUrls.length}`);
          console.warn(`  Query configs: ${queryConfigs.length}`);
          console.warn(`  Configs with endpoints: ${configsWithEndpoints.length}`);
        }
        
        // Calculate map center from shapefiles BEFORE updating state
        // This ensures we have the center ready when map initializes
        let calculatedCenter: [number, number] | null = null;
        let calculatedZoom = 11;
        
        const enabledForBounds = shapefilesData.filter((sf) =>
          defaultEnabled.has(sf.id)
        );

        if (enabledForBounds.length > 0) {
          // Calculate center from shapefiles
          let minLng = 180;
          let maxLng = -180;
          let minLat = 90;
          let maxLat = -90;
          let hasBounds = false;

          enabledForBounds.forEach((shapefile) => {
            const geometryData = shapefile.geometry_data;
            if (geometryData && geometryData.type === "FeatureCollection") {
              geometryData.features.forEach((feature: any) => {
                if (feature.geometry && feature.geometry.coordinates) {
                  const coords = feature.geometry.coordinates;
                  if (feature.geometry.type === "Polygon") {
                    coords[0].forEach((coord: [number, number]) => {
                      minLng = Math.min(minLng, coord[0]);
                      maxLng = Math.max(maxLng, coord[0]);
                      minLat = Math.min(minLat, coord[1]);
                      maxLat = Math.max(maxLat, coord[1]);
                      hasBounds = true;
                    });
                  } else if (feature.geometry.type === "MultiPolygon") {
                    coords.forEach((polygon: any) => {
                      polygon[0].forEach((coord: [number, number]) => {
                        minLng = Math.min(minLng, coord[0]);
                        maxLng = Math.max(maxLng, coord[0]);
                        minLat = Math.min(minLat, coord[1]);
                        maxLat = Math.max(maxLat, coord[1]);
                        hasBounds = true;
                      });
                    });
                  }
                }
              });
            }
          });

          if (hasBounds) {
            const centerLng = (minLng + maxLng) / 2;
            const centerLat = (minLat + maxLat) / 2;
            calculatedCenter = [centerLng, centerLat];
            
            // Calculate appropriate zoom level based on bounds
            const lngDiff = maxLng - minLng;
            const latDiff = maxLat - minLat;
            const maxDiff = Math.max(lngDiff, latDiff);
            
            if (maxDiff > 1) calculatedZoom = 8;
            else if (maxDiff > 0.5) calculatedZoom = 9;
            else if (maxDiff > 0.2) calculatedZoom = 10;
            else if (maxDiff > 0.1) calculatedZoom = 11;
            else calculatedZoom = 12;
          }
        }

        // Batch all state updates together to minimize re-renders
        // Update structure-related state and map center in one batch
        setCityStructure(structureData);
        setLeaders(leadersData);
        setShapefiles(shapefilesData);
        setShapeLayers(layersData);
        setEnabledLayerInstanceIds(defaultEnabled);
        
        if (calculatedCenter) {
          setMapCenter(calculatedCenter);
          setMapZoom(calculatedZoom);
        } else {
          // No shapefiles available - use a reasonable default center
          // For US cities, use center of US; for others, we'll need city coordinates
          // This allows map to initialize even without shapefiles
          const defaultCenter: [number, number] = city?.country === "United States" || !city?.country
            ? [-98.5795, 39.8283] // Center of US
            : [-98.5795, 39.8283]; // Generic default (could be improved with city coordinates)
          setMapCenter(defaultCenter);
          setMapZoom(10); // Reasonable default zoom
        }
        
        // Mark structure data as ready - this allows map to initialize
        setStructureDataReady(true);
        
        // Reset default structure flag when city changes
        setDefaultStructureSet(false);
      } catch (err: any) {
        if (cancelled) return;
        console.error("Error loading city data:", err);
        setError(err.message || "Failed to load city data");
      } finally {
        if (!cancelled) {
          setLoading(false);
          loadingRef.current.inProgress = false;
        }
      }
    };

    loadData();

    return () => {
      cancelled = true;
      loadingRef.current.inProgress = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cityId, isAdmin]); // Only depend on cityId and isAdmin - propCityData is handled separately

  // Initialize Mapbox map - wait for structure data to be ready
  // This ensures we have the correct center before initializing
  useEffect(() => {
    if (!mapContainerRef.current || loading || !structureDataReady) return;

    const loadMapbox = async () => {
      try {
        // IMPORTANT:
        // Do not recreate the Mapbox instance just because a layer toggle changed.
        // Recreating the map clears all custom layers/sources (including metric "dots"),
        // and the metric component does not automatically re-add them on ref.current changes.
        if (mapInstanceRef.current && mapCityIdRef.current === cityId) {
          return;
        }

        // If we have a map from a previous city, remove it before creating a new one.
        if (mapInstanceRef.current && mapCityIdRef.current !== cityId) {
          try {
            mapInstanceRef.current.remove();
          } catch (err) {
            console.warn("Error removing previous map instance:", err);
          } finally {
            mapInstanceRef.current = null;
            mapCityIdRef.current = null;
          }
        }

        // Check if Mapbox is already loaded
        if (typeof window !== "undefined" && (window as any).mapboxgl) {
          initializeMap();
          return;
        }

        // Load Mapbox GL JS CSS
        const link = document.createElement("link");
        link.href = "https://api.mapbox.com/mapbox-gl-js/v2.15.0/mapbox-gl.css";
        link.rel = "stylesheet";
        document.head.appendChild(link);

        // Load Mapbox GL JS
        const script = document.createElement("script");
        script.src = "https://api.mapbox.com/mapbox-gl-js/v2.15.0/mapbox-gl.js";
        script.onload = () => {
          initializeMap();
        };
        script.onerror = () => {
          setError("Failed to load Mapbox GL JS");
        };
        document.head.appendChild(script);
      } catch (err) {
        console.error("Error loading Mapbox:", err);
        setError("Failed to initialize map");
      }
    };

    const initializeMap = () => {
      if (!mapContainerRef.current) return;

      const mapboxgl = (window as any).mapboxgl;
      if (!mapboxgl) {
        setError("Mapbox GL JS not available");
        return;
      }

      // Get Mapbox token from environment variable
      // In Next.js, NEXT_PUBLIC_ prefixed vars are available at build time
      const mapboxToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
      
      if (!mapboxToken) {
        setError("Mapbox token not configured. Please set NEXT_PUBLIC_MAPBOX_TOKEN in your .env file.");
        return;
      }

      mapboxgl.accessToken = mapboxToken;

      // Use calculated center from shapefiles, or default center
      // mapCenter should always be set by now (either from shapefiles or default)
      if (!mapCenter) {
        console.log("Waiting for map center calculation...");
        return;
      }
      
      const center: [number, number] = mapCenter;
      const zoom = mapZoom;

      // Determine map style based on theme
      const mapStyle = theme === "dark" 
        ? "mapbox://styles/mapbox/dark-v11"
        : "mapbox://styles/mapbox/light-v11";

      // Create map
      const map = new mapboxgl.Map({
        container: mapContainerRef.current,
        style: mapStyle,
        center: center,
        zoom: zoom,
      });

      mapInstanceRef.current = map;
      mapCityIdRef.current = cityId;

      map.on("load", () => {
        console.log(
          "Map loaded - shapefiles:",
          shapefilesRef.current.length,
          "enabled:",
          enabledLayerInstanceIds.size
        );
        if (shapefilesRef.current.length > 0) {
          updateMapWithEnabledLayersRef.current(map);
        }
        // Signal to child components that the map style is ready (initial load).
        setMapStyleVersion((v) => v + 1);
        
        // Zoom to GPS location if provided
        if (gpsLocation) {
          zoomToGPSLocation(map, gpsLocation.lat, gpsLocation.lng);
        }
      });

      // IMPORTANT: setStyle() clears custom layers/sources; re-hydrate after style reload.
      map.on("style.load", () => {
        try {
          if (shapefilesRef.current.length > 0) {
            updateMapWithEnabledLayersRef.current(map);
          }
        } finally {
          setMapStyleVersion((v) => v + 1);
        }
      });
    };

    loadMapbox();
  }, [loading, structureDataReady, mapCenter, mapZoom, cityId, theme]);

  // Cleanup map on unmount (only)
  useEffect(() => {
    return () => {
      if (mapInstanceRef.current) {
        try {
          mapInstanceRef.current.remove();
        } catch (err) {
          console.warn("Error removing map on unmount:", err);
        } finally {
          mapInstanceRef.current = null;
          mapCityIdRef.current = null;
        }
      }
    };
  }, []);

  // Zoom to GPS location when provided (after map is loaded)
  useEffect(() => {
    if (!mapInstanceRef.current || !gpsLocation) return;
    
    const map = mapInstanceRef.current;
    // Wait for map to be fully loaded
    if (map.loaded()) {
      zoomToGPSLocation(map, gpsLocation.lat, gpsLocation.lng);
    } else {
      map.once("load", () => {
        zoomToGPSLocation(map, gpsLocation.lat, gpsLocation.lng);
      });
    }
  }, [gpsLocation]);

  // Update map style when theme changes
  useEffect(() => {
    if (!mapInstanceRef.current) return;

    const map = mapInstanceRef.current;
    const mapStyle = theme === "dark" 
      ? "mapbox://styles/mapbox/dark-v11"
      : "mapbox://styles/mapbox/light-v11";

    // Update map style when theme changes
    // Mapbox will handle optimization internally
    if (map.loaded()) {
      map.setStyle(mapStyle);
    } else {
      // If map isn't loaded yet, wait for it
      map.once("load", () => {
        map.setStyle(mapStyle);
      });
    }
  }, [theme]);

  const getCategoryRank = (category?: string | null): number => {
    const c = (category || "").toLowerCase();
    if (c === "governance") return 0;
    if (c === "neighborhood") return 1;
    if (c === "planning") return 2;
    return 3;
  };

  const getGovernanceTypeRank = (structureType?: string | null): number => {
    const t = (structureType || "").toLowerCase();
    if (t === "district") return 0;
    if (t === "ward") return 1;
    if (t === "precinct") return 2;
    return 99;
  };

  const getOrderedShapeLayerItems = () => {
    const items = shapeLayers
      .map((l) => ({
        template: l.template,
        instance: l.instance as any,
      }))
      .filter((x) => !!x.instance && !!x.instance.geometry_data)
      .map((x) => ({
        instance_id: x.instance.id as number,
        label:
          x.instance.shapefile_name ||
          x.template?.default_display_name ||
          `Layer ${x.instance.id}`,
        icon: x.template?.icon || null,
        category: x.template?.category || null,
        structure_type: x.instance.structure_type || null,
        render_order: x.instance.render_order ?? null,
      }))
      .sort((a, b) => {
        const ar = getCategoryRank(a.category);
        const br = getCategoryRank(b.category);
        if (ar !== br) return ar - br;

        // Ensure the primary governance boundary sits first within governance
        if (ar === 0) {
          const at = getGovernanceTypeRank(a.structure_type);
          const bt = getGovernanceTypeRank(b.structure_type);
          if (at !== bt) return at - bt;
        }

        const ao = a.render_order ?? 999999;
        const bo = b.render_order ?? 999999;
        if (ao !== bo) return ao - bo;
        return (a.label || "").localeCompare(b.label || "");
      });

    // Assign palette colors by position in the *full* ordered list (stable on/off)
    return items.map((item, idx) => ({
      ...item,
      color: LAYER_COLOR_PALETTE[idx % LAYER_COLOR_PALETTE.length],
      color_index: idx % LAYER_COLOR_PALETTE.length,
    }));
  };

  // Remove all shapefile layers from map
  const removeAllShapefileLayers = useCallback((map: any, shapefilesToRemove?: CityShapefile[]) => {
    const filesToRemove = shapefilesToRemove || shapefiles;
    console.log("removeAllShapefileLayers - removing", filesToRemove.length, "shapefiles");
    
    filesToRemove.forEach((shapefile) => {
      const layerId = `shapefile-layer-${shapefile.id}`;
      const outlineLayerId = `${layerId}-outline`;
      const sourceId = `shapefile-${shapefile.id}`;

      try {
        if (map.getLayer(layerId)) {
          map.removeLayer(layerId);
        }
        if (map.getLayer(outlineLayerId)) {
          map.removeLayer(outlineLayerId);
        }
        if (map.getSource(sourceId)) {
          map.removeSource(sourceId);
        }
      } catch (err) {
        console.warn("Error removing layer/source:", err);
      }
    });
  }, [shapefiles]);

  // Add a single shapefile to the map
  const addShapefileToMap = useCallback((map: any, shapefile: CityShapefile, assignedColor: string) => {
    const sourceId = `shapefile-${shapefile.id}`;
    const layerId = `shapefile-layer-${shapefile.id}`;
    const outlineLayerId = `${layerId}-outline`;

    console.log("addShapefileToMap:", { sourceId, layerId, shapefileId: shapefile.id, shapefileName: shapefile.shapefile_name });

    // Remove existing layer and source if they exist
    if (map.getLayer(layerId)) {
      map.removeLayer(layerId);
    }
    if (map.getLayer(outlineLayerId)) {
      map.removeLayer(outlineLayerId);
    }
    if (map.getSource(sourceId)) {
      map.removeSource(sourceId);
    }

    // Add source
    try {
      let geometryData = shapefile.geometry_data;
      
      // Handle case where geometry_data might be a string
      if (typeof geometryData === 'string') {
        try {
          geometryData = JSON.parse(geometryData);
        } catch (e) {
          console.error("Failed to parse geometry_data as JSON:", e);
          return;
        }
      }

      console.log("Geometry data type:", typeof geometryData, "has type property:", geometryData?.type);

      if (geometryData && geometryData.type === "FeatureCollection") {
        console.log("Adding GeoJSON source with", geometryData.features?.length || 0, "features");
        
        map.addSource(sourceId, {
          type: "geojson",
          data: geometryData,
        });

        const styleOverrides = (shapefile as any).style_overrides_json || {};
        // Enforce palette colors for consistency across UI + map.
        // Only allow non-color overrides (opacity/line width).
        const fillColor = assignedColor;
        const fillOpacity = styleOverrides["fill-opacity"] ?? styleOverrides.fillOpacity ?? 0.3;
        const lineColor = assignedColor;
        const lineWidth = styleOverrides["line-width"] ?? styleOverrides.lineWidth ?? 2;

        // Add fill layer
        map.addLayer({
          id: layerId,
          type: "fill",
          source: sourceId,
          paint: {
            "fill-color": fillColor,
            "fill-opacity": fillOpacity,
          },
        });

        console.log("Added fill layer:", layerId);

        // Add outline layer
        map.addLayer({
          id: outlineLayerId,
          type: "line",
          source: sourceId,
          paint: {
            "line-color": lineColor,
            "line-width": lineWidth,
          },
        });

        console.log("Added outline layer:", outlineLayerId);

        // Add hover effect
        map.on("mouseenter", layerId, () => {
          map.getCanvas().style.cursor = "pointer";
        });

        map.on("mouseleave", layerId, () => {
          map.getCanvas().style.cursor = "";
        });

        // Add click handler to show shapefile info
        map.on("click", layerId, (e: any) => {
          const features = map.queryRenderedFeatures(e.point, {
            layers: [layerId],
          });
          if (features.length > 0) {
            const feature = features[0];
            const props = feature.properties || {};
            const identifier = props[shapefile.identifier_field || ""] || "N/A";
            
            // Find matching leader for this district
            let leaderName = "";
            // Convert identifier to number for comparison
            let districtNumber: number | null = null;
            if (typeof identifier === "number") {
              districtNumber = identifier;
            } else if (typeof identifier === "string") {
              const parsed = parseInt(identifier, 10);
              if (!isNaN(parsed)) {
                districtNumber = parsed;
              }
            }
            
            // Try to find matching leader
            if (districtNumber !== null) {
              let matchingLeader = null;
              
              // First, try matching by geographic_structure_id if both exist (preferred method)
              if (shapefile.geographic_structure_id) {
                matchingLeader = leaders.find((leader) => {
                  return leader.district === districtNumber && 
                         leader.geographic_structure_id === shapefile.geographic_structure_id;
                });
              }
              
              // If no match found and geographic_structure_id method didn't work, try matching by district alone (fallback)
              if (!matchingLeader) {
                matchingLeader = leaders.find((leader) => {
                  return leader.district === districtNumber;
                });
              }
              
              if (matchingLeader) {
                leaderName = matchingLeader.name;
              }
            }
            
            // Build popup HTML
            let popupHTML = `<div><strong>${shapefile.shapefile_name}</strong><br/>Type: ${shapefile.structure_type}<br/>${shapefile.identifier_field ? `${shapefile.identifier_field}: ${identifier}` : ""}`;
            
            if (leaderName) {
              popupHTML += `<br/>Elected Official: ${leaderName}`;
            }
            
            popupHTML += `</div>`;
            
            const popup = new (window as any).mapboxgl.Popup()
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
      } else {
        console.warn("Geometry data is not a FeatureCollection:", geometryData?.type || "unknown");
      }
    } catch (err) {
      console.error(`Error adding shapefile ${shapefile.id} to map:`, err);
    }
  }, [leaders]);

  // Fit map to shapefile bounds
  const fitMapToShapefiles = useCallback((map: any, shapefilesToFit: CityShapefile[]) => {
    if (shapefilesToFit.length === 0) return;

    const bounds = new (window as any).mapboxgl.LngLatBounds();
    let hasBounds = false;

    shapefilesToFit.forEach((shapefile) => {
      const geometryData = shapefile.geometry_data;
      if (geometryData && geometryData.type === "FeatureCollection") {
        geometryData.features.forEach((feature: any) => {
          if (feature.geometry && feature.geometry.coordinates) {
            const coords = feature.geometry.coordinates;
            if (feature.geometry.type === "Polygon") {
              coords[0].forEach((coord: [number, number]) => {
                bounds.extend(coord);
                hasBounds = true;
              });
            } else if (feature.geometry.type === "MultiPolygon") {
              coords.forEach((polygon: any) => {
                polygon[0].forEach((coord: [number, number]) => {
                  bounds.extend(coord);
                  hasBounds = true;
                });
              });
            }
          }
        });
      }
    });

    if (hasBounds) {
      map.fitBounds(bounds, { padding: 50 });
    }
  }, []);

  const updateMapWithEnabledLayers = useCallback((map: any) => {
    const ordered = getOrderedShapeLayerItems();
    const colorById = new Map<number, string>();
    ordered.forEach((o) => colorById.set(o.instance_id, o.color));

    const enabled = ordered
      .filter((o) => enabledLayerInstanceIds.has(o.instance_id))
      .map((o) => ({
        shapefile: shapefiles.find((sf) => sf.id === o.instance_id),
        color: o.color,
      }))
      .filter((x): x is { shapefile: CityShapefile; color: string } => !!x.shapefile);

    // Remove existing layers for all shapefiles (keeps logic simple and robust)
    removeAllShapefileLayers(map, shapefiles);

    enabled.forEach((entry) => addShapefileToMap(map, entry.shapefile, entry.color));
    fitMapToShapefiles(map, enabled.map((e) => e.shapefile));
  }, [shapefiles, enabledLayerInstanceIds, removeAllShapefileLayers, addShapefileToMap, fitMapToShapefiles]);
  // Keep this ref updated synchronously to avoid a race where Mapbox "load" fires
  // before a useEffect runs.
  updateMapWithEnabledLayersRef.current = updateMapWithEnabledLayers;

  // Update map when enabled layers change
  useEffect(() => {
    if (!mapInstanceRef.current) {
      console.log("Map instance not ready yet");
      return;
    }
    
    if (!mapInstanceRef.current.loaded()) {
      console.log("Map not loaded yet, waiting...");
      // Wait for map to load
      const checkMapLoaded = setInterval(() => {
        if (mapInstanceRef.current && mapInstanceRef.current.loaded()) {
          clearInterval(checkMapLoaded);
          updateMapWithEnabledLayers(mapInstanceRef.current);
        }
      }, 100);
      
      return () => clearInterval(checkMapLoaded);
    }

    updateMapWithEnabledLayers(mapInstanceRef.current);
  }, [enabledLayerInstanceIds, shapefiles, removeAllShapefileLayers, updateMapWithEnabledLayers]);

  const availableShapeLayerInstances = getOrderedShapeLayerItems().map((x) => ({
    instance_id: x.instance_id,
    label: x.label,
    icon: x.icon,
    color: x.color,
  }));

  if (loading) {
    return (
      <div className="city-map-view-loading" style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "12px", padding: "40px" }}>
        <Loader size="sm" color="dark" />
        <span>Loading map...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="city-map-view-error">
        <div>Error: {error}</div>
      </div>
    );
  }

  // Set default enabled layers based on leaders' geographic_structure_id (best effort)
  useEffect(() => {
    // Only set default once when data is ready and not already set
    if (defaultStructureSet || !structureDataReady || shapefiles.length === 0 || leaders.length === 0) {
      return;
    }

    // Find the most common geographic_structure_id among leaders
    const structureIdCounts = new Map<number, number>();
    leaders.forEach((leader) => {
      if (leader.geographic_structure_id) {
        const count = structureIdCounts.get(leader.geographic_structure_id) || 0;
        structureIdCounts.set(leader.geographic_structure_id, count + 1);
      }
    });

    if (structureIdCounts.size === 0) {
      return;
    }

    // Find the most common geographic_structure_id
    let mostCommonStructureId: number | null = null;
    let maxCount = 0;
    structureIdCounts.forEach((count, structureId) => {
      if (count > maxCount) {
        maxCount = count;
        mostCommonStructureId = structureId;
      }
    });

    if (mostCommonStructureId) {
      const matching = shapefiles.filter(
        (sf) => sf.geographic_structure_id === mostCommonStructureId
      );

      if (matching.length > 0) {
        setEnabledLayerInstanceIds((prev) => {
          const next = new Set(prev);
          matching.forEach((m) => next.add(m.id));
          return next;
        });
        setDefaultStructureSet(true);
        console.log("Enabled default layers based on leaders");
      }
    }
  }, [structureDataReady, shapefiles, leaders, defaultStructureSet]);

  return (
    <div className="city-map-view">
      {/* Map container - full screen */}
      <div className="city-map-container">
        <div ref={mapContainerRef} className="map-container" />
        
        {/* City Metrics Map Component */}
        <CityMetricsMap
          cityId={cityId}
          isActive={!loading && structureDataReady}
          mapInstanceRef={mapInstanceRef}
          mapStyleVersion={mapStyleVersion}
          shapeLayers={availableShapeLayerInstances}
          enabledShapeLayerInstanceIds={enabledLayerInstanceIds}
          setEnabledShapeLayerInstanceIds={setEnabledLayerInstanceIds}
          metricDateRange={metricDateRange}
        />
      </div>
    </div>
  );
}

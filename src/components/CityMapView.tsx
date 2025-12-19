"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useAuth0 } from "@auth0/auth0-react";
import {
  getCity,
  getCityLeaders,
  getCityShapefiles,
  getCityStructure,
  type CityLeader,
  type CityShapefile,
  type CityDetail,
  type CityStructureData,
} from "@/lib/apiClient";
import { useTheme } from "@/contexts/ThemeContext";
import Loader from "./Loader";
import "./CityMapView.css";

interface CityMapViewProps {
  cityId: number;
  isAdmin?: boolean;
  cityData?: CityDetail | null; // Optional city data to avoid duplicate API calls
}

interface GeographicStructure {
  id?: number;
  structure_name?: string;
  structure_type?: string;
  identifier_field?: string;
}

export default function CityMapView({ cityId, isAdmin = false, cityData: propCityData }: CityMapViewProps) {
  const { getAccessTokenSilently } = useAuth0();
  const { theme } = useTheme();
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<any>(null);
  const loadingRef = useRef<{ cityId: number | null; inProgress: boolean }>({ cityId: null, inProgress: false });
  const [loading, setLoading] = useState(!propCityData); // Don't show loading if cityData is provided
  const [error, setError] = useState<string | null>(null);
  const [cityData, setCityData] = useState<CityDetail | null>(propCityData || null);
  const [cityStructure, setCityStructure] = useState<CityStructureData | null>(null);
  const [leaders, setLeaders] = useState<CityLeader[]>([]);
  const [shapefiles, setShapefiles] = useState<CityShapefile[]>([]);
  const [selectedLeaderId, setSelectedLeaderId] = useState<string | null>(null);
  const [selectedGeographicStructure, setSelectedGeographicStructure] = useState<string | null>(null);
  const [mapCenter, setMapCenter] = useState<[number, number] | null>(null);
  const [mapZoom, setMapZoom] = useState<number>(11);
  const [structureDataReady, setStructureDataReady] = useState(false);
  const [defaultStructureSet, setDefaultStructureSet] = useState(false);
  
  // Update cityData when prop changes
  useEffect(() => {
    if (propCityData) {
      setCityData(propCityData);
    }
  }, [propCityData]);


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
        // For non-admin users, we still need leaders for the dropdown
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

        // Extract leaders and shapefiles from structure data
        const leadersData = structureData?.leaders || [];
        const shapefilesData = structureData?.shapefiles || [];

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
          
          console.warn("⚠️ No shapefiles loaded for admin user.");
          console.warn(`  Geographic structures: ${geoStructures.length}`);
          console.warn(`  Structures with shapefile_url: ${structuresWithUrls.length}`);
          console.warn(`  Query configs: ${queryConfigs.length}`);
          console.warn(`  Configs with endpoints: ${configsWithEndpoints.length}`);
        }
        
        // Calculate map center from shapefiles BEFORE updating state
        // This ensures we have the center ready when map initializes
        let calculatedCenter: [number, number] | null = null;
        let calculatedZoom = 11;
        
        if (shapefilesData.length > 0) {
          // Calculate center from shapefiles
          let minLng = 180;
          let maxLng = -180;
          let minLat = 90;
          let maxLat = -90;
          let hasBounds = false;

          shapefilesData.forEach((shapefile) => {
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

      map.on("load", () => {
        console.log("Map loaded, isAdmin:", isAdmin, "selectedStructure:", selectedGeographicStructure, "shapefiles:", shapefiles.length);
        // If we have shapefiles and a selected structure, add them
        if (isAdmin && selectedGeographicStructure && shapefiles.length > 0) {
          console.log("Map loaded with structure selected, updating map");
          updateMapWithSelectedStructure(map, selectedGeographicStructure);
        } else {
          console.log("Map loaded but not updating - isAdmin:", isAdmin, "hasSelection:", !!selectedGeographicStructure, "hasShapefiles:", shapefiles.length > 0);
        }
      });
    };

    loadMapbox();

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, [loading, structureDataReady, mapCenter, mapZoom, isAdmin, selectedGeographicStructure, shapefiles, theme]);

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

  // Get color for shapefile based on index
  const getShapefileColor = (index: number): string => {
    const colors = [
      "#ad35fa", // Bright purple
      "#FF6B5A", // Warm coral
      "#4ECDC4", // Turquoise
      "#FFE66D", // Yellow
      "#95E1D3", // Mint
      "#F38181", // Pink
      "#AA96DA", // Lavender
      "#FCBAD3", // Light pink
    ];
    return colors[index % colors.length];
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
  const addShapefileToMap = useCallback((map: any, shapefile: CityShapefile, index: number) => {
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

        // Add fill layer
        map.addLayer({
          id: layerId,
          type: "fill",
          source: sourceId,
          paint: {
            "fill-color": getShapefileColor(index),
            "fill-opacity": 0.3,
          },
        });

        console.log("Added fill layer:", layerId);

        // Add outline layer
        map.addLayer({
          id: outlineLayerId,
          type: "line",
          source: sourceId,
          paint: {
            "line-color": getShapefileColor(index),
            "line-width": 2,
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
              popupHTML += `<br/>Leader: ${leaderName}`;
            }
            
            popupHTML += `</div>`;
            
            new (window as any).mapboxgl.Popup()
              .setLngLat(e.lngLat)
              .setHTML(popupHTML)
              .addTo(map);
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

  // Update map with selected geographic structure
  const updateMapWithSelectedStructure = useCallback((map: any, selectedValue: string) => {
    console.log("updateMapWithSelectedStructure called with:", selectedValue);
    console.log("Available shapefiles:", shapefiles.map(sf => ({ id: sf.id, name: sf.shapefile_name, type: sf.structure_type })));
    
    // Remove existing shapefile layers first (use current shapefiles state)
    removeAllShapefileLayers(map, shapefiles);

    // Find shapefiles matching the selected value
    // The value is shapefile_name (from dropdown), so match by name or structure_type as fallback
    const matchingShapefiles = shapefiles.filter(
      (sf) => sf.shapefile_name === selectedValue || sf.structure_type === selectedValue
    );

    console.log("Matching shapefiles:", matchingShapefiles.length, matchingShapefiles.map(sf => ({ id: sf.id, name: sf.shapefile_name, type: sf.structure_type })));

    if (matchingShapefiles.length === 0) {
      console.warn("No shapefiles found matching:", selectedValue);
      console.warn("Available shapefiles:", shapefiles.map(sf => ({ name: sf.shapefile_name, type: sf.structure_type })));
      // Show a message that this structure needs to be reloaded
      alert(`No shapefile data available for "${selectedValue}".\n\nPlease go to the Admin tab and click "Re-load All" for geographic structures to fetch and store the shapefile data.`);
      return;
    }

    // Add all matching shapefiles
    matchingShapefiles.forEach((shapefile, index) => {
      console.log("Adding shapefile to map:", shapefile.shapefile_name, "index:", index);
      addShapefileToMap(map, shapefile, index);
    });

    // Fit map to bounds of selected shapefiles
    fitMapToShapefiles(map, matchingShapefiles);
  }, [shapefiles, removeAllShapefileLayers, addShapefileToMap, fitMapToShapefiles]);

  // Function to center map on a leader's district
  const centerMapOnLeaderDistrict = useCallback((leaderId: string) => {
    if (!mapInstanceRef.current || !mapInstanceRef.current.loaded()) {
      return;
    }

    // Find the selected leader
    const leader = leaders.find((l) => String(l.id) === leaderId);
    if (!leader) {
      console.warn("Leader not found:", leaderId);
      return;
    }

    // Check if leader has a district
    if (leader.district === null || leader.district === undefined) {
      console.log("Leader has no district, cannot center map");
      return;
    }

    // Try to find matching shapefile - first by geographic_structure_id, then by district match
    let matchingShapefile = null;
    let districtFeature = null;

    // First, try matching by geographic_structure_id if both exist (preferred method)
    if (leader.geographic_structure_id) {
      matchingShapefile = shapefiles.find(
        (sf) => sf.geographic_structure_id === leader.geographic_structure_id
      );
    }

    // If no match found, try to find any shapefile that contains the district (fallback)
    if (!matchingShapefile) {
      // Search through all shapefiles to find one that contains this district
      for (const shapefile of shapefiles) {
        const geometryData = shapefile.geometry_data;
        if (!geometryData || geometryData.type !== "FeatureCollection") {
          continue;
        }

        const identifierField = shapefile.identifier_field || "district";
        
        // Try to find the district feature in this shapefile
        const feature = geometryData.features.find((feature: any) => {
          const props = feature.properties || {};
          const districtValue = props[identifierField];
          
          // Handle both string and number comparisons
          if (typeof districtValue === "number") {
            return districtValue === leader.district;
          } else if (typeof districtValue === "string") {
            // Try to parse as number
            const parsed = parseInt(districtValue, 10);
            if (!isNaN(parsed)) {
              return parsed === leader.district;
            }
            // Also try direct string comparison
            return districtValue === String(leader.district);
          }
          return false;
        });

        if (feature && feature.geometry) {
          matchingShapefile = shapefile;
          districtFeature = feature;
          break;
        }
      }
    } else {
      // We found a shapefile by geographic_structure_id, now find the district feature
      const geometryData = matchingShapefile.geometry_data;
      if (!geometryData || geometryData.type !== "FeatureCollection") {
        console.warn("Invalid geometry data for shapefile:", matchingShapefile.id);
        return;
      }

      const identifierField = matchingShapefile.identifier_field || "district";
      
      districtFeature = geometryData.features.find((feature: any) => {
        const props = feature.properties || {};
        const districtValue = props[identifierField];
        
        // Handle both string and number comparisons
        if (typeof districtValue === "number") {
          return districtValue === leader.district;
        } else if (typeof districtValue === "string") {
          // Try to parse as number
          const parsed = parseInt(districtValue, 10);
          if (!isNaN(parsed)) {
            return parsed === leader.district;
          }
          // Also try direct string comparison
          return districtValue === String(leader.district);
        }
        return false;
      });
    }

    if (!matchingShapefile) {
      console.warn("No shapefile found containing district", leader.district);
      return;
    }

    if (!districtFeature || !districtFeature.geometry) {
      console.warn(
        `No feature found for district ${leader.district} in shapefile ${matchingShapefile.shapefile_name}`
      );
      return;
    }

    // Calculate bounds for the district feature
    const bounds = new (window as any).mapboxgl.LngLatBounds();
    const coords = districtFeature.geometry.coordinates;

    if (districtFeature.geometry.type === "Polygon") {
      coords[0].forEach((coord: [number, number]) => {
        bounds.extend(coord);
      });
    } else if (districtFeature.geometry.type === "MultiPolygon") {
      coords.forEach((polygon: any) => {
        polygon[0].forEach((coord: [number, number]) => {
          bounds.extend(coord);
        });
      });
    } else {
      console.warn("Unsupported geometry type:", districtFeature.geometry.type);
      return;
    }

    // Fit map to the district bounds with padding
    mapInstanceRef.current.fitBounds(bounds, {
      padding: 50,
      duration: 1000, // Smooth animation
    });

    console.log(`Centered map on ${leader.name}'s District ${leader.district}`);
  }, [leaders, shapefiles]);

  // Center map on selected leader's district and show their geographic structure
  useEffect(() => {
    // If no leader is selected, don't do anything
    if (!selectedLeaderId) {
      return;
    }

    // Find the selected leader
    const leader = leaders.find((l) => String(l.id) === selectedLeaderId);
    if (!leader) {
      return;
    }

    // If leader has a geographic_structure_id, automatically select and display that structure (for all users)
    if (leader.geographic_structure_id) {
      const matchingShapefile = shapefiles.find(
        (sf) => sf.geographic_structure_id === leader.geographic_structure_id
      );
      
      if (matchingShapefile && matchingShapefile.shapefile_name) {
        // Only update if it's different to avoid infinite loops
        if (selectedGeographicStructure !== matchingShapefile.shapefile_name) {
          setSelectedGeographicStructure(matchingShapefile.shapefile_name);
        }
      }
    }

    // Center map on the district (will wait for map to be ready)
    if (!mapInstanceRef.current) {
      return;
    }

    if (!mapInstanceRef.current.loaded()) {
      // Wait for map to load
      const checkMapLoaded = setInterval(() => {
        if (mapInstanceRef.current && mapInstanceRef.current.loaded()) {
          clearInterval(checkMapLoaded);
          // Retry centering after map loads
          if (selectedLeaderId) {
            centerMapOnLeaderDistrict(selectedLeaderId);
          }
        }
      }, 100);
      
      return () => clearInterval(checkMapLoaded);
    }

    centerMapOnLeaderDistrict(selectedLeaderId);
  }, [selectedLeaderId, shapefiles, leaders, selectedGeographicStructure, centerMapOnLeaderDistrict]);

  // Update map when geographic structure selection changes
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
          // Trigger update after map loads
          if (selectedGeographicStructure && shapefiles.length > 0) {
            console.log("Map now loaded, updating with structure");
            updateMapWithSelectedStructure(mapInstanceRef.current, selectedGeographicStructure);
          }
        }
      }, 100);
      
      return () => clearInterval(checkMapLoaded);
    }
    
    // Display geographic structure if selected (for all users, not just admin)
    // Only allow manual selection in admin mode, but auto-display when leader is selected
    if (!selectedGeographicStructure) {
      // Remove all shapefile layers if no selection
      console.log("Removing shapefiles - no selectedStructure");
      removeAllShapefileLayers(mapInstanceRef.current);
      return;
    }

    if (shapefiles.length === 0) {
      console.warn("No shapefiles available to display for structure:", selectedGeographicStructure);
      return;
    }

    console.log("Updating map with structure:", selectedGeographicStructure, "shapefiles:", shapefiles.length);
    updateMapWithSelectedStructure(mapInstanceRef.current, selectedGeographicStructure);
  }, [selectedGeographicStructure, shapefiles, removeAllShapefileLayers, updateMapWithSelectedStructure]);

  // Get unique geographic structure types from shapefiles
  const getAvailableGeographicStructures = (): GeographicStructure[] => {
    console.log("getAvailableGeographicStructures - cityStructure:", cityStructure?.geographic_structures?.length || 0, "cityData:", cityData?.geographic_structures?.length || 0, "shapefiles:", shapefiles.length, "query_configs:", cityStructure?.query_configs?.length || 0);
    
    // Build list from shapefiles - use shapefile_name as unique identifier
    // Multiple shapefiles can have the same structure_type, so we need to show all of them
    const shapefileStructures: GeographicStructure[] = [];
    const seenNames = new Set<string>();
    
    console.log("Processing shapefiles:", shapefiles.map(sf => ({
      id: sf.id,
      shapefile_name: sf.shapefile_name,
      structure_type: sf.structure_type,
      has_name: !!sf.shapefile_name,
      has_type: !!sf.structure_type
    })));
    
    shapefiles.forEach((sf) => {
      // Check if shapefile has required fields
      if (!sf.shapefile_name) {
        console.warn("Shapefile missing shapefile_name:", sf);
        return;
      }
      if (!sf.structure_type) {
        console.warn("Shapefile missing structure_type:", sf);
        return;
      }
      
      // Use shapefile_name as the unique key to avoid duplicates
      const key = sf.shapefile_name.toLowerCase().trim();
      if (!seenNames.has(key)) {
        seenNames.add(key);
        shapefileStructures.push({
          id: sf.id,
          structure_name: sf.shapefile_name,
          structure_type: sf.structure_type,
          identifier_field: sf.identifier_field || undefined,
        });
        console.log("Added shapefile to dropdown:", sf.shapefile_name, "type:", sf.structure_type);
      } else {
        console.log("Skipping duplicate shapefile:", sf.shapefile_name);
      }
    });
    
    // Also check query configs for geographic structures that don't have shapefiles yet
    // This ensures we show all available structures, even if they haven't been converted to shapefiles
    const queryConfigStructures: GeographicStructure[] = [];
    if (cityStructure?.query_configs) {
      cityStructure.query_configs
        .filter((qc: any) => qc.structure_type === "geographic")
        .forEach((qc: any) => {
          // Check if this query config already has a shapefile
          const hasShapefile = shapefileStructures.some(
            (sf) => sf.structure_name?.toLowerCase() === qc.structure_name?.toLowerCase()
          );
          
          if (!hasShapefile) {
            // Try to determine structure_type from identifier_field or use a default
            let structureType = "district";
            if (qc.identifier_field) {
              const idField = qc.identifier_field.toLowerCase();
              if (idField.includes("district")) structureType = "district";
              else if (idField.includes("neighborhood")) structureType = "neighborhood";
              else if (idField.includes("precinct")) structureType = "precinct";
              else if (idField.includes("ward")) structureType = "ward";
            }
            
            queryConfigStructures.push({
              structure_name: qc.structure_name || structureType,
              structure_type: structureType,
              identifier_field: qc.identifier_field,
            });
            console.log("Added query config without shapefile to dropdown:", qc.structure_name);
          }
        });
    }
    
    // Combine shapefiles and query configs (shapefiles first, then query configs without shapefiles)
    const allStructures = [...shapefileStructures, ...queryConfigStructures];
    
    if (allStructures.length > 0) {
      console.log("Using geographic structures (shapefiles + query configs):", allStructures);
      return allStructures;
    }
    
    // Last resort: use geographic_structures from cityStructure
    if (cityStructure?.geographic_structures && cityStructure.geographic_structures.length > 0) {
      console.log("Using geographic structures from cityStructure:", cityStructure.geographic_structures);
      return cityStructure.geographic_structures.map((gs) => ({
        id: gs.id,
        structure_name: gs.structure_name,
        structure_type: gs.structure_type,
        identifier_field: gs.identifier_field,
      }));
    }
    
    // Final fallback: use cityData
    if (cityData?.geographic_structures && cityData.geographic_structures.length > 0) {
      console.log("Using geographic structures from cityData:", cityData.geographic_structures);
      return cityData.geographic_structures;
    }
    
    console.log("No geographic structures found");
    return [];
  };

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

  // Set default geographic structure based on leaders' geographic_structure_id
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
      // Find the shapefile matching this structure ID
      const matchingShapefile = shapefiles.find(
        (sf) => sf.geographic_structure_id === mostCommonStructureId
      );

      if (matchingShapefile && matchingShapefile.shapefile_name) {
        setSelectedGeographicStructure(matchingShapefile.shapefile_name);
        setDefaultStructureSet(true);
        console.log("Set default geographic structure to:", matchingShapefile.shapefile_name, "based on leaders");
      }
    }
  }, [structureDataReady, shapefiles, leaders, defaultStructureSet]);

  const geographicStructures = getAvailableGeographicStructures();

  return (
    <div className="city-map-view">
      {/* Map container - full screen */}
      <div className="city-map-container">
        <div ref={mapContainerRef} className="map-container" />
        
        {/* Controls overlay - positioned on top of map */}
        <div className="city-map-controls-overlay">
          <div className="city-map-controls">
            {/* Leader dropdown */}
            {leaders.length > 0 && (
              <div className="leader-dropdown-container">
                <label htmlFor="leader-select">Leader:</label>
                <select
                  id="leader-select"
                  value={selectedLeaderId || ""}
                  onChange={(e) => setSelectedLeaderId(e.target.value || null)}
                  className="leader-select"
                >
                  <option value="">All Leaders</option>
                  {leaders.map((leader) => (
                    <option key={leader.id} value={String(leader.id)}>
                      {leader.name} - {leader.title}
                      {leader.district !== null && leader.district !== undefined
                        ? ` (District ${leader.district})`
                        : ""}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Geographic Structure dropdown (Admin only) */}
            {isAdmin && geographicStructures.length > 0 && (
              <div className="geographic-structure-dropdown-container">
                <label htmlFor="geographic-structure-select">Geographic Structure:</label>
                <select
                  id="geographic-structure-select"
                  value={selectedGeographicStructure || ""}
                  onChange={(e) => setSelectedGeographicStructure(e.target.value || null)}
                  className="geographic-structure-select"
                >
                  <option value="">Select a structure...</option>
                  {geographicStructures.map((structure, index) => {
                    // Use shapefile_name as value if available, otherwise use structure_type
                    // This ensures each shapefile is uniquely identifiable
                    const value = structure.structure_name || structure.structure_type || "";
                    const hasShapefile = shapefiles.some(
                      (sf) => sf.shapefile_name?.toLowerCase() === structure.structure_name?.toLowerCase()
                    );
                    const displayName = hasShapefile 
                      ? structure.structure_name || structure.structure_type || "Unknown"
                      : `${structure.structure_name || structure.structure_type || "Unknown"} (needs reload)`;
                    return (
                      <option
                        key={structure.id || index}
                        value={value}
                      >
                        {displayName}
                      </option>
                    );
                  })}
                </select>
              </div>
            )}
          </div>
        </div>
        
        {/* Message when no shapefiles available but structure is selected */}
        {isAdmin && selectedGeographicStructure && shapefiles.length === 0 && (
          <div className="no-shapefiles-message">
            <div className="no-shapefiles-content">
              <p><strong>No shapefiles available</strong></p>
              <p>
                The geographic structure "{geographicStructures.find(s => s.structure_type === selectedGeographicStructure)?.structure_name || selectedGeographicStructure}" 
                is configured, but no shapefile data has been fetched and stored yet.
              </p>
              {cityStructure && (
                <>
                  {(() => {
                    const selectedStruct = cityStructure.geographic_structures?.find(
                      (gs) => gs.structure_type === selectedGeographicStructure
                    );
                    const queryConfig = cityStructure.query_configs?.find(
                      (qc) => qc.structure_type === "geographic" && qc.structure_name?.toLowerCase().includes(selectedGeographicStructure.toLowerCase())
                    );
                    
                    if (selectedStruct?.shapefile_url) {
                      return (
                        <p className="no-shapefiles-hint">
                          This structure has a shapefile URL configured: <code>{selectedStruct.shapefile_url}</code>
                          <br />
                          Use the "fetch_and_store_shapefile" tool to fetch and store the shapefile data.
                        </p>
                      );
                    } else if (queryConfig?.endpoint) {
                      return (
                        <p className="no-shapefiles-hint">
                          This structure has a query config with endpoint: <code>{queryConfig.endpoint}</code>
                          <br />
                          Use the "fetch_and_store_shapefile" tool with this endpoint to fetch and store the shapefile data.
                        </p>
                      );
                    } else {
                      return (
                        <p className="no-shapefiles-hint">
                          Shapefiles need to be fetched and stored in the database before they can be displayed on the map.
                          <br />
                          Check the City Structure tab in Admin to see available geographic structures and their configuration.
                        </p>
                      );
                    }
                  })()}
                  <p className="no-shapefiles-stats">
                    Total geographic structures: {cityStructure.geographic_structures?.length || 0} | 
                    Stored shapefiles: {shapefiles.length} | 
                    Query configs: {cityStructure.query_configs?.length || 0}
                  </p>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

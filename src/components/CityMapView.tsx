"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
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
import { LAYER_COLOR_PALETTE, type LayerColor } from "@/lib/layerColors";
import { getInitialMapView, INITIAL_ZOOM_CITYWIDE } from "@/lib/mapUtils";
import {
  getPlaceRadiusBoundingBox,
  getPlaceRadiusBoundingBoxPolygon,
} from "@/lib/placeBounds";
import type { MetricDateRange } from "@/lib/dateRange";
import type { AnomalyResult } from "@/lib/hooks/useAnomalies";

/** Mapbox expects [lng, lat]; lat must be -90..90, lng -180..180. Returns a valid center or fallback. */
const FALLBACK_MAP_CENTER: [number, number] = [-98.5795, 39.8283];

function isValidLngLat(center: [number, number]): boolean {
  const [lng, lat] = center;
  return (
    typeof lng === "number" &&
    !Number.isNaN(lng) &&
    lng >= -180 &&
    lng <= 180 &&
    typeof lat === "number" &&
    !Number.isNaN(lat) &&
    lat >= -90 &&
    lat <= 90
  );
}

function getValidMapCenter(center: [number, number] | null): [number, number] {
  return center && isValidLngLat(center) ? center : FALLBACK_MAP_CENTER;
}

// Helper function to check if a point is inside a polygon (ray casting algorithm)
function pointInPolygon(point: [number, number], polygon: [number, number][]): boolean {
  const [x, y] = point;
  let inside = false;
  
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i];
    const [xj, yj] = polygon[j];
    
    if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) {
      inside = !inside;
    }
  }
  
  return inside;
}

// Find which district contains the GPS point
// Prioritizes shapefiles that match the primary geographic structure (used by leaders)
function findDistrictContainingPoint(
  lat: number, 
  lng: number, 
  shapefiles: CityShapefile[],
  cityStructure?: CityStructureData | null,
  leaders?: CityLeader[]
): { shapefile: CityShapefile; feature: any; identifier: string | number } | null {
  const point: [number, number] = [lng, lat];
  
  // Find the primary geographic structure (the one used by most leaders)
  let primaryGeographicStructureId: number | null = null;
  
  if (cityStructure && leaders && leaders.length > 0) {
    // Count which geographic_structure_id is used by most leaders
    const structureIdCounts = new Map<number, number>();
    leaders.forEach((leader) => {
      if (leader.geographic_structure_id) {
        const count = structureIdCounts.get(leader.geographic_structure_id) || 0;
        structureIdCounts.set(leader.geographic_structure_id, count + 1);
      }
    });
    
    // Find the most common geographic_structure_id
    let maxCount = 0;
    structureIdCounts.forEach((count, structureId) => {
      if (count > maxCount) {
        maxCount = count;
        primaryGeographicStructureId = structureId;
      }
    });
    
    // If no clear winner, try to find by name (supervisor, council, etc.)
    if (!primaryGeographicStructureId && cityStructure.geographic_structures) {
      const districtStructure = cityStructure.geographic_structures.find(
        (gs) => gs.structure_name?.toLowerCase().includes('supervisor') ||
                gs.structure_name?.toLowerCase().includes('council') ||
                gs.structure_name?.toLowerCase().includes('ward') ||
                gs.structure_type?.toLowerCase().includes('supervisor') ||
                gs.structure_type?.toLowerCase().includes('council')
      );
      if (districtStructure && districtStructure.id !== undefined) {
        primaryGeographicStructureId = districtStructure.id;
      }
    }
  }
  
  // Separate shapefiles into primary (matching primary structure) and others
  const primaryShapefiles: CityShapefile[] = [];
  const otherShapefiles: CityShapefile[] = [];
  
  shapefiles.forEach((shapefile) => {
    if (primaryGeographicStructureId && shapefile.geographic_structure_id === primaryGeographicStructureId) {
      primaryShapefiles.push(shapefile);
    } else {
      otherShapefiles.push(shapefile);
    }
  });
  
  // Check primary shapefiles first
  const shapefilesToCheck = [...primaryShapefiles, ...otherShapefiles];
  
  for (const shapefile of shapefilesToCheck) {
    const geometryData = shapefile.geometry_data;
    if (!geometryData || geometryData.type !== "FeatureCollection") continue;
    
    for (const feature of geometryData.features) {
      if (!feature.geometry || !feature.geometry.coordinates) continue;
      
      let rings: [number, number][][] = [];
      
      if (feature.geometry.type === "Polygon") {
        rings = [feature.geometry.coordinates[0] as [number, number][]];
      } else if (feature.geometry.type === "MultiPolygon") {
        // Check each polygon in the multipolygon
        rings = feature.geometry.coordinates.map((poly: any) => poly[0] as [number, number][]);
      }
      
      for (const ring of rings) {
        if (pointInPolygon(point, ring)) {
          const identifier = feature.properties?.[shapefile.identifier_field || ""] || "Unknown";
          return { shapefile, feature, identifier };
        }
      }
    }
  }
  
  return null;
}

// Helper function to add GPS location marker to map
function addGPSMarker(map: any, lat: number, lng: number, markerRef: React.MutableRefObject<any>, label?: string | null) {
  const mapboxgl = (window as any).mapboxgl;
  if (!mapboxgl) return;
  
  // Remove existing marker if any
  if (markerRef.current) {
    markerRef.current.remove();
    markerRef.current = null;
  }
  
  // Create a custom marker element (blue pulsing dot with optional label)
  const el = document.createElement("div");
  el.className = "gps-location-marker";
  el.innerHTML = `
    <div class="gps-marker-pulse"></div>
    <div class="gps-marker-dot"></div>
    ${label ? `<div class="gps-marker-label">${label.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</div>` : ""}
  `;
  
  // Create and add the marker
  const marker = new mapboxgl.Marker({
    element: el,
    anchor: "center",
  })
    .setLngLat([lng, lat])
    .addTo(map);
  
  markerRef.current = marker;
  return marker;
}

/** My Block overlay: lat/lon bounding box (same geometry as place metrics + map pin filter). */
const PLACE_RADIUS_SOURCE_ID = "place-radius-source";
const PLACE_RADIUS_LAYER_ID = "place-radius-fill";

function addPlaceRadiusCircle(
  map: any,
  lat: number,
  lng: number,
  radiusMeters: number
): void {
  const polygon = getPlaceRadiusBoundingBoxPolygon(lat, lng, radiusMeters);
  const geojson = { type: "Feature", properties: {}, geometry: polygon };

  // Prefer updating existing source data in-place to avoid remove/re-add race conditions.
  const existingSource = map.getSource(PLACE_RADIUS_SOURCE_ID);
  if (existingSource) {
    existingSource.setData(geojson);
    return;
  }

  // Source doesn't exist yet — clean up any orphaned layer then add fresh.
  try {
    if (map.getLayer(PLACE_RADIUS_LAYER_ID)) map.removeLayer(PLACE_RADIUS_LAYER_ID);
  } catch { /* ignore */ }

  map.addSource(PLACE_RADIUS_SOURCE_ID, { type: "geojson", data: geojson });
  map.addLayer({
    id: PLACE_RADIUS_LAYER_ID,
    type: "fill",
    source: PLACE_RADIUS_SOURCE_ID,
    paint: {
      "fill-color": "#ad35fa",
      "fill-opacity": 0.15,
      "fill-outline-color": "#ad35fa",
    },
  });
}

function removePlaceRadiusCircle(map: any): void {
  try {
    if (map.getLayer(PLACE_RADIUS_LAYER_ID)) map.removeLayer(PLACE_RADIUS_LAYER_ID);
    if (map.getSource(PLACE_RADIUS_SOURCE_ID)) map.removeSource(PLACE_RADIUS_SOURCE_ID);
  } catch {
    // ignore
  }
}

// Helper function to zoom map to a GPS location - zooms in close by default
function zoomToGPSLocation(
  map: any,
  lat: number,
  lng: number,
  radiusMeters?: number | null
) {
  // Default close-up zoom when no place radius is provided.
  let zoom = 18;
  if (radiusMeters != null && Number.isFinite(radiusMeters) && radiusMeters > 0) {
    const latRad = (lat * Math.PI) / 180;
    const containerWidth =
      map?.getContainer?.()?.clientWidth && map.getContainer().clientWidth > 0
        ? map.getContainer().clientWidth
        : 1024;
    const targetDiameterPx = Math.max(220, Math.min(containerWidth * 0.7, 720));
    const b = getPlaceRadiusBoundingBox(lat, lng, radiusMeters);
    const latSpan = Math.max(1e-8, b.latHi - b.latLo);
    const lonSpan = Math.max(1e-8, b.lonHi - b.lonLo);
    const diagMetersApprox = Math.sqrt(
      (latSpan * 111320) ** 2 + (lonSpan * 111320 * Math.cos(latRad)) ** 2
    );
    const diameterMeters = diagMetersApprox * 1.35;
    const metersPerPixel = diameterMeters / targetDiameterPx;
    const computed =
      Math.log2((156543.03392 * Math.cos(latRad)) / Math.max(metersPerPixel, 0.0001));
    zoom = Math.max(9, Math.min(19, computed - 2));
  }
  map.flyTo({
    center: [lng, lat],
    zoom,
    duration: 0, // Recenter ASAP
    essential: true,
  });
}

/** Fit the map to the My Block bounding box (preferred over center+zoom when radius is set). */
function zoomToPlaceBoundingBox(map: any, lat: number, lng: number, radiusMeters: number) {
  const mapboxgl = (window as any).mapboxgl;
  const b = getPlaceRadiusBoundingBox(lat, lng, radiusMeters);
  if (mapboxgl?.LngLatBounds) {
    const bounds = new mapboxgl.LngLatBounds();
    bounds.extend([b.lonLo, b.latLo]);
    bounds.extend([b.lonHi, b.latHi]);
    map.fitBounds(bounds, {
      padding: { top: 88, bottom: 88, left: 48, right: 48 },
      duration: 0,
      maxZoom: 19,
      essential: true,
    });
    return;
  }
  zoomToGPSLocation(map, lat, lng, radiusMeters);
}

// Zoom to district bounds containing GPS location
// If district is found, zoom to show it, but still prioritize close-up view
function zoomToDistrictWithGPS(
  map: any,
  lat: number,
  lng: number,
  feature: any
) {
  const mapboxgl = (window as any).mapboxgl;
  if (!mapboxgl || !feature?.geometry?.coordinates) {
    // Fallback to direct zoom if no valid feature
    zoomToGPSLocation(map, lat, lng);
    return;
  }
  
  const bounds = new mapboxgl.LngLatBounds();
  let hasBounds = false;
  
  const addCoords = (coords: [number, number][]) => {
    coords.forEach((coord) => {
      bounds.extend(coord);
      hasBounds = true;
    });
  };
  
  if (feature.geometry.type === "Polygon") {
    addCoords(feature.geometry.coordinates[0]);
  } else if (feature.geometry.type === "MultiPolygon") {
    feature.geometry.coordinates.forEach((poly: any) => {
      addCoords(poly[0]);
    });
  }
  
  if (hasBounds) {
    // Zoom to district but allow higher zoom levels for closer view
    // This ensures we see the district context but can still zoom in close
    map.fitBounds(bounds, {
      padding: { top: 100, bottom: 100, left: 50, right: 50 },
      maxZoom: 18,
      duration: 0, // Recenter ASAP
    });
  } else {
    // Fallback to direct GPS zoom if bounds couldn't be calculated
    zoomToGPSLocation(map, lat, lng);
  }
}

interface CityMapViewProps {
  cityId: number;
  isAdmin?: boolean;
  cityData?: CityDetail | null; // Optional city data to avoid duplicate API calls
  metricDateRange?: MetricDateRange;
  gpsLocation?: { lat: number; lng: number } | null; // GPS coordinates to zoom to
  selectedPlaceRadiusM?: number | null;
  /** Label shown on the blue location marker (e.g. the saved place name). */
  placeLabel?: string | null;
  selectedDistrict?: number | null; // Selected district number
  onDistrictChange?: (district: number | null) => void; // Callback when district changes
  onDataReady?: (data: { leaders: CityLeader[]; shapefiles: CityShapefile[] }) => void; // Callback when leaders and shapefiles are loaded
  selectedAnomaly?: AnomalyResult | null; // Currently selected anomaly for anomaly mode
  onAnomalyClear?: () => void; // Callback to clear anomaly selection
}

export default function CityMapView({
  cityId,
  isAdmin = false,
  cityData: propCityData,
  metricDateRange,
  gpsLocation,
  selectedPlaceRadiusM,
  placeLabel,
  selectedDistrict,
  onDistrictChange,
  onDataReady,
  selectedAnomaly,
  onAnomalyClear,
}: CityMapViewProps) {
  const { getAccessTokenSilently } = useAuth0();
  const { theme } = useTheme();
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<any>(null);
  const mapCityIdRef = useRef<number | null>(null);
  const loadingRef = useRef<{ cityId: number | null; inProgress: boolean }>({ cityId: null, inProgress: false });
  const [loading, setLoading] = useState(true); // Always show loading initially to hide old map
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
  const cityStructureRef = useRef<CityStructureData | null>(null);
  const leadersRef = useRef<CityLeader[]>([]);
  const updateMapWithEnabledLayersRef = useRef<(map: any) => void>(() => {});
  const gpsMarkerRef = useRef<any>(null);
  const gpsLocationRef = useRef<{ lat: number; lng: number } | null>(null);
  const selectedPlaceRadiusMRef = useRef<number | null>(null);
  const placeLabelRef = useRef<string | null | undefined>(null);

  gpsLocationRef.current = gpsLocation ?? null;
  selectedPlaceRadiusMRef.current = selectedPlaceRadiusM ?? null;
  placeLabelRef.current = placeLabel;

  const placeCircle = useMemo(() => {
    if (!gpsLocation || selectedPlaceRadiusM == null || selectedPlaceRadiusM <= 0) return null;
    return { lat: gpsLocation.lat, lng: gpsLocation.lng, radius_m: selectedPlaceRadiusM };
  }, [gpsLocation, selectedPlaceRadiusM]);

  // Update cityData when prop changes
  useEffect(() => {
    if (propCityData) {
      setCityData(propCityData);
    }
  }, [propCityData]);

  useEffect(() => {
    shapefilesRef.current = shapefiles;
  }, [shapefiles]);
  
  useEffect(() => {
    cityStructureRef.current = cityStructure;
  }, [cityStructure]);
  
  useEffect(() => {
    leadersRef.current = leaders;
  }, [leaders]);


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
      // Clear map center so we don't use old city's center
      setMapCenter(null);
      // Show loading immediately when city changes to hide old map
      setLoading(true);
    }
    
    loadingRef.current.inProgress = true;

    const loadData = async () => {
      try {
        // Always show loading when starting to load (hides old map)
        setLoading(true);
        setError(null);
        const token = await getAccessTokenSilently();

        if (cancelled) return;

        // Only fetch city data if not provided as prop
        const cityPromise = (propCityData || cityData)
          ? Promise.resolve(propCityData || cityData)
          : getCity(cityId, token);

        // Load city data first for faster initial render
        const city = await cityPromise;

        if (cancelled) return;

        // Set city data immediately so UI can render
        setCityData(city);

        // Show base map immediately with city-based center (no geometry required).
        // Structure and shapefiles will load in background and we'll recenter when ready.
        if (city) {
          const initialView = getInitialMapView(city);
          setMapCenter(initialView.center);
          setMapZoom(initialView.zoom);
        }
        setLoading(false);

        // Load structure and shapefiles in background for bounds/center and layers.
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

        // Default enabled set: empty by default (admins can manually enable layers)
        // For non-admins, shape layers won't be shown at all
        const defaultEnabled = new Set<number>();

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
        // Use enabled layers if available, otherwise use all shapefiles to center on the city
        let calculatedCenter: [number, number] | null = null;
        let calculatedZoom = 11;
        
        const enabledForBounds = shapefilesData.filter((sf) =>
          defaultEnabled.has(sf.id)
        );
        
        // If no layers are enabled, use all available shapefiles to center on the city
        const shapefilesForBounds = enabledForBounds.length > 0 
          ? enabledForBounds 
          : shapefilesData;

        if (shapefilesForBounds.length > 0) {
          // Calculate center from shapefiles
          let minLng = 180;
          let maxLng = -180;
          let minLat = 90;
          let maxLat = -90;
          let hasBounds = false;

          shapefilesForBounds.forEach((shapefile) => {
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
        
        // Notify parent component that data is ready
        if (onDataReady) {
          onDataReady({
            leaders: leadersData,
            shapefiles: shapefilesData,
          });
        }
        
        // Update map center/zoom with calculated values from shapefiles.
        // Skip the flyTo if GPS/place location is already set — the map is already
        // at the right block-level position and we don't want to zoom back out to city.
        if (calculatedCenter && isValidLngLat(calculatedCenter)) {
          setMapCenter(calculatedCenter);
          setMapZoom(calculatedZoom);
          if (mapInstanceRef.current?.loaded() && !gpsLocationRef.current) {
            mapInstanceRef.current.flyTo({
              center: calculatedCenter,
              zoom: calculatedZoom,
              duration: 0, // Recenter ASAP
            });
          }
        } else {
          const fallback = city
            ? getInitialMapView(city)
            : { center: [-98.5795, 39.8283] as [number, number], zoom: INITIAL_ZOOM_CITYWIDE };
          setMapCenter(fallback.center);
          setMapZoom(fallback.zoom);
        }

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

  // Initialize Mapbox map as soon as we have a container and initial center (no data required).
  useEffect(() => {
    if (!mapContainerRef.current || loading || !mapCenter) return;

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

      // If GPS/place location is already known (e.g. from initialPlaceGps), start the map
      // there immediately instead of at the city center so there is no jarring snap later.
      const initialGps = gpsLocationRef.current;
      const initialRadius = selectedPlaceRadiusMRef.current;
      let initialCenter: [number, number];
      let initialZoom: number;
      if (initialGps) {
        initialCenter = [initialGps.lng, initialGps.lat];
        // Mirror the zoom calculation in zoomToGPSLocation
        if (initialRadius != null && Number.isFinite(initialRadius) && initialRadius > 0) {
          const latRad = (initialGps.lat * Math.PI) / 180;
          const containerWidth = mapContainerRef.current?.clientWidth || 1024;
          const targetDiameterPx = Math.max(220, Math.min(containerWidth * 0.7, 720));
          const diameterMeters = initialRadius * 2 * 1.5;
          const metersPerPixel = diameterMeters / targetDiameterPx;
          const computed = Math.log2((156543.03392 * Math.cos(latRad)) / Math.max(metersPerPixel, 0.0001));
          initialZoom = Math.max(9, Math.min(19, computed - 2));
        } else {
          initialZoom = 18;
        }
      } else {
        initialCenter = getValidMapCenter(mapCenter);
        initialZoom = mapZoom;
      }

      // Determine map style based on theme
      const mapStyle = theme === "dark" 
        ? "mapbox://styles/mapbox/dark-v11"
        : "mapbox://styles/mapbox/light-v11";

      // Create map
      const map = new mapboxgl.Map({
        container: mapContainerRef.current,
        style: mapStyle,
        center: initialCenter,
        zoom: initialZoom,
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
        // This triggers a re-render which fires the gpsLocation/placeCircle useLayoutEffects
        // to add the GPS marker, radius circle, and zoom — no need to duplicate that here.
        setMapStyleVersion((v) => v + 1);

        // Only zoom if the map was NOT already initialized at the GPS location.
        // If initialGps was set, the map started there already; otherwise zoom now.
        const loc = gpsLocationRef.current;
        const radius = selectedPlaceRadiusMRef.current;
        if (loc && !initialGps) {
          zoomToGPSLocation(map, loc.lat, loc.lng, radius);
        }
      });

      // IMPORTANT: setStyle() clears custom layers/sources; re-hydrate after style reload.
      map.on("style.load", () => {
        try {
          if (shapefilesRef.current.length > 0) {
            updateMapWithEnabledLayersRef.current(map);
          }
          const loc = gpsLocationRef.current;
          const radius = selectedPlaceRadiusMRef.current;
          if (loc && radius != null && radius > 0) {
            addPlaceRadiusCircle(map, loc.lat, loc.lng, radius);
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

  // Resize map when container becomes visible (e.g. tab switch from display:none).
  // Mapbox needs explicit resize() to recalculate canvas after container size changes.
  useEffect(() => {
    const container = mapContainerRef.current;
    if (!container) return;
    const observer = new ResizeObserver(() => {
      if (mapInstanceRef.current) {
        try { mapInstanceRef.current.resize(); } catch { /* ignore if map not ready */ }
      }
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  // Handle GPS location: add marker, My Block bounding box overlay, find district, zoom.
  // useLayoutEffect so we re-zoom immediately when map refresh starts (before paint).
  useLayoutEffect(() => {
    if (!mapInstanceRef.current) return;

    const map = mapInstanceRef.current;

    // If GPS location is null, remove marker and place extent overlay
    if (!gpsLocation) {
      if (gpsMarkerRef.current) {
        gpsMarkerRef.current.remove();
        gpsMarkerRef.current = null;
      }
      removePlaceRadiusCircle(map);
      // Only zoom to city default when no district is selected (e.g. citywide).
      // When switching from My Block to a district, let the district zoom effect handle recentering.
      if (selectedDistrict != null && selectedDistrict !== 0) {
        return;
      }
      if (mapCenter && mapZoom !== null) {
        const center = getValidMapCenter(mapCenter);
        map.flyTo({
          center,
          zoom: mapZoom,
          duration: 0, // Recenter ASAP
          essential: true,
        });
      }
      return;
    }

    const lat = gpsLocation.lat;
    const lng = gpsLocation.lng;
    const radiusM = selectedPlaceRadiusM ?? null;

    const handleGPSLocation = () => {
      addGPSMarker(map, lat, lng, gpsMarkerRef, placeLabelRef.current);

      // My Block: show bounding box (same as place metrics lat/lon filter), fit map to box
      if (radiusM != null && radiusM > 0) {
        try {
          addPlaceRadiusCircle(map, lat, lng, radiusM);
        } catch {
          /* continue to zoom even if overlay update fails */
        }
        zoomToPlaceBoundingBox(map, lat, lng, radiusM);
        return;
      }

      removePlaceRadiusCircle(map);

      const district = findDistrictContainingPoint(
        lat,
        lng,
        shapefilesRef.current,
        cityStructureRef.current,
        leadersRef.current
      );

      if (district) {
        console.log("GPS location is in district:", district.identifier, "shapefile:", district.shapefile.shapefile_name);
        let districtNum: number | null = null;
        if (typeof district.identifier === "number") {
          districtNum = district.identifier;
        } else if (typeof district.identifier === "string") {
          const parsed = parseInt(district.identifier, 10);
          if (!isNaN(parsed)) {
            districtNum = parsed;
          }
        }
        if (districtNum !== null && onDistrictChange) {
          onDistrictChange(districtNum);
        }
        zoomToDistrictWithGPS(map, lat, lng, district.feature);
      } else {
        console.log("GPS location is not within any known district - zooming to location");
        zoomToGPSLocation(map, lat, lng, radiusM);
      }
    };

    if (map.loaded()) {
      handleGPSLocation();
    } else {
      map.once("load", () => {
        handleGPSLocation();
      });
    }
  }, [gpsLocation, mapCenter, mapZoom, selectedPlaceRadiusM, selectedDistrict]);

  const placeCircleKey = placeCircle
    ? `${placeCircle.lat},${placeCircle.lng},${placeCircle.radius_m},${placeLabel ?? ""}`
    : null;
  // When My Block is selected (placeCircle set), re-zoom to center immediately when map refresh starts.
  useLayoutEffect(() => {
    if (!placeCircleKey || !placeCircle || !mapInstanceRef.current) return;
    const map = mapInstanceRef.current;
    const { lat, lng, radius_m } = placeCircle;
    const runZoom = () => {
      if (!mapInstanceRef.current) return;
      const m = mapInstanceRef.current;
      addGPSMarker(m, lat, lng, gpsMarkerRef, placeLabelRef.current);
      try {
        addPlaceRadiusCircle(m, lat, lng, radius_m);
      } catch {
        /* continue to zoom even if overlay update fails */
      }
      zoomToPlaceBoundingBox(m, lat, lng, radius_m);
    };
    if (map.loaded()) {
      runZoom();
    } else {
      map.once("load", runZoom);
    }
  }, [placeCircleKey, placeCircle]);
  
  // Cleanup GPS marker on unmount
  useEffect(() => {
    return () => {
      if (gpsMarkerRef.current) {
        gpsMarkerRef.current.remove();
        gpsMarkerRef.current = null;
      }
    };
  }, []);

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
        color: o.color as LayerColor,
      }))
      .filter((x): x is { shapefile: CityShapefile; color: LayerColor } => !!x.shapefile);

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
    if (!mapInstanceRef.current) return;

    if (!mapInstanceRef.current.loaded()) {
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

  // When switching to city (district 0 or null), re-zoom to city default immediately so the map doesn't wait for points to load.
  useLayoutEffect(() => {
    const isCitywide = selectedDistrict === null || selectedDistrict === 0;
    if (!isCitywide || placeCircleKey || !mapInstanceRef.current?.loaded()) return;
    if (!mapCenter || mapZoom == null) return;

    const map = mapInstanceRef.current;
    const center = getValidMapCenter(mapCenter);
    map.flyTo({
      center,
      zoom: mapZoom,
      duration: 0, // Recenter ASAP
      essential: true,
    });
  }, [selectedDistrict, placeCircleKey, mapCenter, mapZoom]);

  // Zoom to selected district when it changes (skip district 0 which is citywide).
  // Re-zoom immediately when map refresh starts so the view updates before points load.
  useLayoutEffect(() => {
    if (!mapInstanceRef.current || !mapInstanceRef.current.loaded() || selectedDistrict === null || selectedDistrict === 0) {
      return;
    }
    if (placeCircleKey) {
      return;
    }

    const map = mapInstanceRef.current;
    const mapboxgl = (window as any).mapboxgl;
    if (!mapboxgl) return;

    // Find the district feature in shapefiles and fit bounds synchronously
    let districtFeature: any = null;

    for (const shapefile of shapefiles) {
      let geometryData = shapefile.geometry_data;

      if (typeof geometryData === "string") {
        try {
          geometryData = JSON.parse(geometryData);
        } catch (e) {
          continue;
        }
      }
      if (!geometryData || geometryData.type !== "FeatureCollection") continue;

      for (const feature of geometryData.features) {
        const identifier = feature.properties?.[shapefile.identifier_field || ""];
        let districtNum: number | null = null;
        if (typeof identifier === "number") districtNum = identifier;
        else if (typeof identifier === "string") {
          const parsed = parseInt(identifier, 10);
          if (!isNaN(parsed)) districtNum = parsed;
        }
        if (districtNum === selectedDistrict) {
          districtFeature = feature;
          break;
        }
      }
      if (districtFeature) break;
    }

    if (districtFeature?.geometry?.coordinates) {
      const bounds = new mapboxgl.LngLatBounds();
      const coords = districtFeature.geometry.coordinates;
      if (districtFeature.geometry.type === "Polygon") {
        coords[0].forEach((coord: [number, number]) => bounds.extend(coord));
      } else if (districtFeature.geometry.type === "MultiPolygon") {
        coords.forEach((polygon: any) => polygon[0].forEach((coord: [number, number]) => bounds.extend(coord)));
      }
      map.fitBounds(bounds, {
        padding: { top: 100, bottom: 100, left: 50, right: 50 },
        maxZoom: 14,
        duration: 0, // Recenter ASAP
      });
    }
  }, [selectedDistrict, shapefiles, placeCircleKey]);

  // Only show shape layers for admins; non-admins won't see them at all
  const availableShapeLayerInstances = isAdmin
    ? getOrderedShapeLayerItems().map((x) => ({
        instance_id: x.instance_id,
        label: x.label,
        icon: x.icon,
        color: x.color,
      }))
    : [];

  // Don't return early - show loading overlay instead to hide old map

  if (error) {
    return (
      <div className="city-map-view-error">
        <div>Error: {error}</div>
      </div>
    );
  }

  // Disabled: Set default enabled layers based on leaders' geographic_structure_id
  // By default, no shape layers are activated in map mode - users must manually enable them
  // useEffect(() => {
  //   // Only set default once when data is ready and not already set
  //   if (defaultStructureSet || !structureDataReady || shapefiles.length === 0 || leaders.length === 0) {
  //     return;
  //   }

  //   // Find the most common geographic_structure_id among leaders
  //   const structureIdCounts = new Map<number, number>();
  //   leaders.forEach((leader) => {
  //     if (leader.geographic_structure_id) {
  //       const count = structureIdCounts.get(leader.geographic_structure_id) || 0;
  //       structureIdCounts.set(leader.geographic_structure_id, count + 1);
  //     }
  //   });

  //   if (structureIdCounts.size === 0) {
  //     return;
  //   }

  //   // Find the most common geographic_structure_id
  //   let mostCommonStructureId: number | null = null;
  //   let maxCount = 0;
  //   structureIdCounts.forEach((count, structureId) => {
  //     if (count > maxCount) {
  //       maxCount = count;
  //       mostCommonStructureId = structureId;
  //     }
  //   });

  //   if (mostCommonStructureId) {
  //     const matching = shapefiles.filter(
  //       (sf) => sf.geographic_structure_id === mostCommonStructureId
  //     );

  //     if (matching.length > 0) {
  //       setEnabledLayerInstanceIds((prev) => {
  //         const next = new Set(prev);
  //         matching.forEach((m) => next.add(m.id));
  //         return next;
  //       });
  //       setDefaultStructureSet(true);
  //       console.log("Enabled default layers based on leaders");
  //     }
  //   }
  // }, [structureDataReady, shapefiles, leaders, defaultStructureSet]);

  return (
    <div className="city-map-view">
      {/* Map container - full screen */}
      <div className="city-map-container" style={{ position: "relative", width: "100%", height: "100%" }}>
        {/* Loading overlay - covers map while loading to hide old city */}
        {loading && (
          <div 
            className="city-map-view-loading-overlay" 
            style={{ 
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              display: "flex", 
              alignItems: "center", 
              justifyContent: "center", 
              gap: "12px", 
              backgroundColor: "var(--bg-primary, #ffffff)",
              zIndex: 1000,
            }}
          >
            <Loader size="sm" color="dark" />
            <span>Loading map...</span>
          </div>
        )}
        
        {/* Map container - hidden behind loading overlay when loading */}
        <div 
          ref={mapContainerRef} 
          className="map-container" 
          style={{ 
            width: "100%", 
            height: "100%",
            opacity: loading ? 0 : 1,
            transition: "opacity 0.3s ease-in-out"
          }} 
        />
        
        {/* City Metrics Map Component - only render when not loading */}
        {!loading && (
          <CityMetricsMap
          cityId={cityId}
          isActive={!loading && structureDataReady}
          mapInstanceRef={mapInstanceRef}
          mapStyleVersion={mapStyleVersion}
          shapeLayers={availableShapeLayerInstances}
          enabledShapeLayerInstanceIds={enabledLayerInstanceIds}
          setEnabledShapeLayerInstanceIds={setEnabledLayerInstanceIds}
          metricDateRange={metricDateRange}
          gpsLocation={gpsLocation}
          selectedDistrict={selectedDistrict}
          placeCircle={placeCircle}
          placeLabel={placeLabel}
          selectedAnomaly={selectedAnomaly}
          onAnomalyClear={onAnomalyClear}
          />
        )}
      </div>
    </div>
  );
}

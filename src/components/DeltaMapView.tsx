"use client";

import React, { useEffect, useRef, useState, useMemo } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import {
  getPublicMetricDistrictComparisons,
  getPublicMetricShapefile,
  type PublicDistrictComparisonsResponse,
  type PublicShapefileResponse,
} from "@/lib/publicApiClient";
import Loader from "./Loader";
import "./DeltaMapView.css";

// Mapbox access token
mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || "";

/** Compute [[sw_lng, sw_lat], [ne_lng, ne_lat]] from a GeoJSON FeatureCollection. */
function getBoundsFromGeoJson(
  fc: GeoJSON.FeatureCollection
): [[number, number], [number, number]] | null {
  let minLng = Infinity;
  let minLat = Infinity;
  let maxLng = -Infinity;
  let maxLat = -Infinity;
  const addPoint = (lng: number, lat: number) => {
    minLng = Math.min(minLng, lng);
    minLat = Math.min(minLat, lat);
    maxLng = Math.max(maxLng, lng);
    maxLat = Math.max(maxLat, lat);
  };
  for (const f of fc.features) {
    const geom = f?.geometry;
    if (!geom) continue;
    if (geom.type === "Polygon") {
      for (const ring of geom.coordinates) {
        for (const pos of ring) {
          if (pos.length >= 2) addPoint(pos[0], pos[1]);
        }
      }
    } else if (geom.type === "MultiPolygon") {
      for (const polygon of geom.coordinates) {
        for (const ring of polygon) {
          for (const pos of ring) {
            if (pos.length >= 2) addPoint(pos[0], pos[1]);
          }
        }
      }
    }
  }
  if (minLng === Infinity || minLat === Infinity) return null;
  return [
    [minLng, minLat],
    [maxLng, maxLat],
  ];
}

interface DeltaMapViewProps {
  metricId: number;
  comparisonType: "ytd" | "mtd" | "mtd_prior_year";
  greenDirection?: "up" | "down" | null;
  height?: number;
  cityCenter?: [number, number]; // [lng, lat]
  cityZoom?: number;
}

export default function DeltaMapView({
  metricId,
  comparisonType,
  greenDirection = "down",
  height = 350,
  cityCenter, // Caller can pass; when omitted we fit to shape bounds so no city-specific default
  cityZoom = 11,
}: DeltaMapViewProps) {
  // Neutral fallback when no center provided (map will fit to shape bounds once loaded)
  const initialCenter: [number, number] = cityCenter ?? [-98.5795, 39.8283];
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [districtData, setDistrictData] = useState<PublicDistrictComparisonsResponse | null>(null);
  const [shapeData, setShapeData] = useState<PublicShapefileResponse | null>(null);

  // Fetch data
  useEffect(() => {
    let mounted = true;
    setLoading(true);
    setError(null);

    Promise.all([
      getPublicMetricDistrictComparisons(metricId, comparisonType),
      getPublicMetricShapefile(metricId),
    ])
      .then(([districts, shape]) => {
        if (mounted) {
          setDistrictData(districts);
          setShapeData(shape);
        }
      })
      .catch((err) => {
        if (mounted) {
          console.error("[DeltaMapView] Error fetching data:", err);
          setError(err instanceof Error ? err.message : "Failed to load map data");
        }
      })
      .finally(() => {
        if (mounted) {
          setLoading(false);
        }
      });

    return () => {
      mounted = false;
    };
  }, [metricId, comparisonType]);

  // Build feature collection with change data
  const geoJsonWithData = useMemo(() => {
    if (!shapeData?.geometry || !districtData?.districts) return null;

    // Create a map from district number to change data (support string and number keys)
    const districtMap = new Map<string | number, typeof districtData.districts[0]>();
    for (const d of districtData.districts) {
      districtMap.set(d.district, d);
      districtMap.set(String(d.district), d);
      districtMap.set(`District ${d.district}`, d);
      districtMap.set(`district ${d.district}`, d);
    }

    const districtFieldNames = shapeData.district_field_names ?? [];

    // Enrich features with change data
    const features = shapeData.geometry.features.map((feature) => {
      const props = feature.properties || {};
      // Use the city's district field names: first property present wins
      let districtId: string | number | undefined;
      for (const key of districtFieldNames) {
        if (props[key] != null) {
          districtId = props[key] as string | number;
          break;
        }
      }

      const data =
        districtId === undefined
          ? undefined
          : districtMap.get(districtId as string | number) ||
            districtMap.get(String(districtId)) ||
            (typeof districtId === "string" && /^\d+$/.test(districtId)
              ? districtMap.get(Number(districtId))
              : undefined);

      return {
        ...feature,
        properties: {
          ...props,
          _change_percent: data?.change_percent ?? null,
          _current_value: data?.current_value ?? null,
          _comparison_value: data?.comparison_value ?? null,
          _district: data?.district ?? districtId,
        },
      };
    });

    return {
      type: "FeatureCollection" as const,
      features,
    };
  }, [shapeData, districtData]);

  // Get color for a change percent value
  const getColorForChange = (
    changePercent: number | null,
    greenDir: "up" | "down" | null
  ): string => {
    if (changePercent === null) return "#e0e0e0"; // Gray for no data

    const absChange = Math.abs(changePercent);

    // Near zero = white/light gray
    if (absChange <= 5) return "#f5f5f5";

    // Determine if increase is good or bad
    const increaseIsGood = greenDir === "up";
    const isIncrease = changePercent > 0;
    const isGood = increaseIsGood ? isIncrease : !isIncrease;

    // Scale intensity based on magnitude (5-200% range for full color)
    // Use a logarithmic-ish scale for better spread
    const intensity = Math.min(1, (absChange - 5) / 195);

    if (isGood) {
      // Green gradient: #f5f5f5 -> #15803d (green-700)
      const r = Math.round(245 - intensity * (245 - 21));
      const g = Math.round(245 - intensity * (245 - 128));
      const b = Math.round(245 - intensity * (245 - 61));
      return `rgb(${r}, ${g}, ${b})`;
    } else {
      // Red gradient: #f5f5f5 -> #991b1b (red-800)
      const r = Math.round(245 - intensity * (245 - 153));
      const g = Math.round(245 - intensity * (245 - 27));
      const b = Math.round(245 - intensity * (245 - 27));
      return `rgb(${r}, ${g}, ${b})`;
    }
  };

  // Initialize map and add layers
  useEffect(() => {
    if (!mapContainer.current || !geoJsonWithData || mapRef.current) return;

    const map = new mapboxgl.Map({
      container: mapContainer.current,
      style: "mapbox://styles/mapbox/light-v11",
      center: initialCenter,
      zoom: cityZoom,
      scrollZoom: false,
      attributionControl: false,
    });

    mapRef.current = map;

    // Add zoom controls in the bottom-right corner
    map.addControl(
      new mapboxgl.NavigationControl({ showCompass: false }),
      "bottom-right"
    );

    map.on("load", () => {
      // Add source
      map.addSource("delta-districts", {
        type: "geojson",
        data: geoJsonWithData,
      });

      // Build fill-color expression
      const features = geoJsonWithData.features;
      const fillColorStops: (string | number | null)[] = [];

      for (const feature of features) {
        const changePercent = feature.properties._change_percent;
        const color = getColorForChange(changePercent, greenDirection);
        fillColorStops.push(changePercent, color);
      }

      // Add fill layer with data-driven colors
      // Extended range with more stops for better differentiation
      map.addLayer({
        id: "delta-districts-fill",
        type: "fill",
        source: "delta-districts",
        paint: {
          "fill-color": [
            "case",
            ["==", ["get", "_change_percent"], null],
            "#e0e0e0",
            [
              "interpolate",
              ["linear"],
              ["get", "_change_percent"],
              // Negative values (decrease)
              -200,
              greenDirection === "down" ? "#15803d" : "#991b1b", // Very dark green/red
              -100,
              greenDirection === "down" ? "#16a34a" : "#b91c1c", // Dark green/red
              -50,
              greenDirection === "down" ? "#22c55e" : "#dc2626", // Medium green/red
              -25,
              greenDirection === "down" ? "#4ade80" : "#ef4444", // Light-medium green/red
              -10,
              greenDirection === "down" ? "#86efac" : "#f87171", // Light green/red
              -5,
              greenDirection === "down" ? "#bbf7d0" : "#fecaca", // Very light green/red
              0,
              "#f5f5f5", // Neutral
              // Positive values (increase)
              5,
              greenDirection === "down" ? "#fecaca" : "#bbf7d0", // Very light red/green
              10,
              greenDirection === "down" ? "#f87171" : "#86efac", // Light red/green
              25,
              greenDirection === "down" ? "#ef4444" : "#4ade80", // Light-medium red/green
              50,
              greenDirection === "down" ? "#dc2626" : "#22c55e", // Medium red/green
              100,
              greenDirection === "down" ? "#b91c1c" : "#16a34a", // Dark red/green
              200,
              greenDirection === "down" ? "#991b1b" : "#15803d", // Very dark red/green
            ],
          ],
          "fill-opacity": 0.8,
        },
      });

      // Add outline layer
      map.addLayer({
        id: "delta-districts-outline",
        type: "line",
        source: "delta-districts",
        paint: {
          "line-color": "#666666",
          "line-width": 1,
          "line-opacity": 0.5,
        },
      });

      // Frame map on district shapes so it shows the correct city (not a fixed center)
      const bounds = getBoundsFromGeoJson(geoJsonWithData);
      if (bounds) {
        try {
          map.fitBounds(bounds, { padding: 50, maxZoom: 12, duration: 0 });
        } catch (e) {
          console.warn("[DeltaMapView] fitBounds failed:", e);
        }
      }

      // Add hover popup
      const popup = new mapboxgl.Popup({
        closeButton: false,
        closeOnClick: false,
      });

      map.on("mouseenter", "delta-districts-fill", () => {
        map.getCanvas().style.cursor = "pointer";
      });

      map.on("mouseleave", "delta-districts-fill", () => {
        map.getCanvas().style.cursor = "";
        popup.remove();
      });

      map.on("mousemove", "delta-districts-fill", (e) => {
        if (!e.features || e.features.length === 0) return;

        const feature = e.features[0];
        const props = feature.properties || {};
        const district = (props._district as string) || "Unknown";
        const changePercent = (props._change_percent as number | null) ?? null;
        const currentValue = (props._current_value as number | null) ?? null;
        const comparisonValue = (props._comparison_value as number | null) ?? null;

        const formatValue = (val: number | null): string => {
          if (val === null) return "—";
          return val.toLocaleString(undefined, { maximumFractionDigits: 0 });
        };

        const formatPercent = (val: number | null): string => {
          if (val === null) return "—";
          const sign = val > 0 ? "+" : "";
          return `${sign}${Math.round(val)}%`;
        };

        const changeColor =
          changePercent === null
            ? "#666"
            : changePercent > 5
            ? greenDirection === "down"
              ? "#ef4444"
              : "#22c55e"
            : changePercent < -5
            ? greenDirection === "down"
              ? "#22c55e"
              : "#ef4444"
            : "#666";

        popup
          .setLngLat(e.lngLat)
          .setHTML(
            `<div style="font-family: 'IBM Plex Sans', sans-serif; font-size: 13px;">
              <div style="font-weight: 600; margin-bottom: 4px;">District ${district}</div>
              <div style="color: #666;">Last Year: ${formatValue(comparisonValue)}</div>
              <div style="color: #666;">This Year: ${formatValue(currentValue)}</div>
              <div style="color: ${changeColor}; font-weight: 600;">
                Change: ${formatPercent(changePercent)}
              </div>
            </div>`
          )
          .addTo(map);
      });
    });

    // Cleanup
    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [geoJsonWithData, initialCenter, cityZoom, greenDirection]);

  // Labels for period comparison
  const periodLabel = useMemo(() => {
    const labels: Record<string, string> = {
      ytd: "last year",
      mtd: "last month",
      mtd_prior_year: "same period last year",
    };
    return labels[comparisonType] || "the previous period";
  }, [comparisonType]);

  if (loading) {
    return (
      <div className="delta-map-container loading" style={{ height }}>
        <Loader size="sm" color="dark" />
        <span>Loading change map...</span>
      </div>
    );
  }

  if (error) {
    console.error("[DeltaMapView] Error loading data:", error);
    return (
      <div className="delta-map-container error" style={{ height }}>
        <p>Unable to load change map: {error}</p>
      </div>
    );
  }

  if (!districtData || districtData.districts.length === 0) {
    console.log("[DeltaMapView] No district data available for metric", metricId);
    return (
      <div className="delta-map-container" style={{ height, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#666' }}>
        <p>District comparison data not available for this metric.</p>
      </div>
    );
  }

  return (
    <div className="delta-map-wrapper">
      <div
        ref={mapContainer}
        className="delta-map-container"
        style={{ height }}
      />
      <div className="delta-map-legend">
        <div className="legend-item">
          <span
            className="legend-color"
            style={{ backgroundColor: greenDirection === "down" ? "#4ade80" : "#f87171" }}
          />
          <span className="legend-label">
            {greenDirection === "down" ? "Decreased" : "Increased"}
          </span>
        </div>
        <div className="legend-item">
          <span className="legend-color" style={{ backgroundColor: "#f5f5f5" }} />
          <span className="legend-label">No change</span>
        </div>
        <div className="legend-item">
          <span
            className="legend-color"
            style={{ backgroundColor: greenDirection === "down" ? "#f87171" : "#4ade80" }}
          />
          <span className="legend-label">
            {greenDirection === "down" ? "Increased" : "Decreased"}
          </span>
        </div>
      </div>
    </div>
  );
}

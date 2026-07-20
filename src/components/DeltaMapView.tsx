"use client";

import React, { useCallback, useEffect, useRef, useState, useMemo } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import {
  getPublicMetricDistrictComparisons,
  getPublicMetricShapefile,
  saveDeltaMap,
  type PublicDistrictComparisonsResponse,
  type PublicShapefileResponse,
} from "@/lib/publicApiClient";
import { useTheme } from "@/contexts/ThemeContext";
import {
  DELTA_MAP_NEUTRAL_DARK_HEX,
  getDeltaMapFillColor,
  type DeltaBasemapTheme,
} from "@/lib/deltaMapColors";
import {
  CHOROPLETH_FIT_MAX_ZOOM_CITYWIDE,
  CHOROPLETH_FIT_PADDING,
  choroplethDistrictKeyAliases,
} from "@/lib/mapUtils";
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

/**
 * Read district id from feature properties using city district_field names and
 * the shapefile's identifier_field (GeoJSON column). Case-insensitive fallback
 * for sources that normalize property keys differently than city config.
 */
function resolveDistrictIdFromFeatureProps(
  props: Record<string, unknown>,
  candidateKeys: string[]
): string | number | undefined {
  for (const key of candidateKeys) {
    if (key && props[key] != null) {
      return props[key] as string | number;
    }
  }
  const lowerToActual = new Map(
    Object.keys(props).map((k) => [k.toLowerCase(), k] as const)
  );
  for (const key of candidateKeys) {
    if (!key) continue;
    const actual = lowerToActual.get(key.toLowerCase());
    if (actual != null && props[actual] != null) {
      return props[actual] as string | number;
    }
  }
  return undefined;
}

interface DeltaMapViewProps {
  metricId: number;
  comparisonType: "ytd" | "mtd" | "mtd_prior_year";
  greenDirection?: "up" | "down" | null;
  height?: number;
  cityCenter?: [number, number]; // [lng, lat]
  cityZoom?: number;
  /** Current period dates — required to enable "View full map" save. */
  dateRange?: { start: string | null; end: string | null };
  /** Comparison period dates — required to enable "View full map" save. */
  comparisonDateRange?: { start: string | null; end: string | null };
  /** Show "View full map" link (default: true). Requires dateRange + comparisonDateRange. */
  showLink?: boolean;
  /** Anchor district API rows to the same period end as the headline comparison (optional). */
  currentPeriodEnd?: string | null;
  /**
   * When set, skips network fetch (caller already loaded district rows + shapefile).
   */
  prefetched?: {
    districtComparisons: PublicDistrictComparisonsResponse;
    shapefile: PublicShapefileResponse;
  };
}

export default function DeltaMapView({
  metricId,
  comparisonType,
  greenDirection = "down",
  height = 350,
  cityCenter, // Caller can pass; when omitted we fit to shape bounds so no city-specific default
  cityZoom = 11,
  dateRange,
  comparisonDateRange,
  showLink = true,
  currentPeriodEnd,
  prefetched,
}: DeltaMapViewProps) {
  const { theme } = useTheme();
  const basemapTheme: DeltaBasemapTheme = theme === "dark" ? "dark" : "light";

  // Neutral fallback when no center provided (map will fit to shape bounds once loaded)
  const initialCenter: [number, number] = cityCenter ?? [-98.5795, 39.8283];
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const [loading, setLoading] = useState(!prefetched);
  const [error, setError] = useState<string | null>(null);
  const [districtData, setDistrictData] = useState<PublicDistrictComparisonsResponse | null>(
    prefetched?.districtComparisons ?? null
  );
  const [shapeData, setShapeData] = useState<PublicShapefileResponse | null>(
    prefetched?.shapefile ?? null
  );
  const [savingMap, setSavingMap] = useState(false);

  const canShowLink =
    showLink &&
    !!dateRange?.start &&
    !!dateRange?.end &&
    !!comparisonDateRange?.start &&
    !!comparisonDateRange?.end;

  const handleViewFullMap = useCallback(async () => {
    if (!canShowLink) return;
    try {
      setSavingMap(true);
      const response = await saveDeltaMap(metricId, {
        start_date: dateRange!.start!,
        end_date: dateRange!.end!,
        comparison_start_date: comparisonDateRange!.start!,
        comparison_end_date: comparisonDateRange!.end!,
        period_type: comparisonType,
      });
      window.open(response.map_url, "_blank", "noopener,noreferrer");
    } catch (err) {
      console.error("[DeltaMapView] Failed to save map:", err);
      setError(err instanceof Error ? err.message : "Failed to save map");
    } finally {
      setSavingMap(false);
    }
  }, [canShowLink, metricId, dateRange, comparisonDateRange, comparisonType]);

  // Fetch data (skipped when prefetched bundle is supplied)
  useEffect(() => {
    if (prefetched?.districtComparisons && prefetched?.shapefile) {
      queueMicrotask(() => {
        setDistrictData(prefetched.districtComparisons);
        setShapeData(prefetched.shapefile);
        setLoading(false);
        setError(null);
      });
      return;
    }

    let mounted = true;
    setLoading(true);
    setError(null);

    Promise.all([
      getPublicMetricDistrictComparisons(
        metricId,
        comparisonType,
        currentPeriodEnd ?? undefined
      ),
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
  }, [metricId, comparisonType, currentPeriodEnd, prefetched]);

  // Build feature collection with change data
  const geoJsonWithData = useMemo(() => {
    if (!shapeData?.geometry || !districtData?.districts) return null;

    // Join on normalized keys (case-insensitive, numeric-suffix aliases) so
    // e.g. API "AVONDALE" matches shapefile "Avondale" and "CCD1" matches "1".
    const districtMap = new Map<string, typeof districtData.districts[0]>();
    for (const d of districtData.districts) {
      for (const key of choroplethDistrictKeyAliases(d.district)) {
        districtMap.set(key, d);
      }
    }
    const lookupDistrict = (id: string | number) => {
      for (const key of choroplethDistrictKeyAliases(id)) {
        const hit = districtMap.get(key);
        if (hit) return hit;
      }
      return undefined;
    };

    const districtFieldNames = [
      ...new Set(
        [
          ...(shapeData.district_field_names ?? []),
          ...(shapeData.identifier_field ? [shapeData.identifier_field] : []),
        ].filter((k): k is string => Boolean(k && String(k).trim()))
      ),
    ];

    // Enrich features with change data
    const features = shapeData.geometry.features.map((feature) => {
      const props = (feature.properties || {}) as Record<string, unknown>;
      const districtId = resolveDistrictIdFromFeatureProps(
        props,
        districtFieldNames
      );

      const data =
        districtId === undefined ? undefined : lookupDistrict(districtId);

      const changePctRaw = data?.change_percent;
      const changePct =
        changePctRaw != null && Number.isFinite(Number(changePctRaw))
          ? Number(changePctRaw)
          : null;

      return {
        ...feature,
        properties: {
          ...props,
          _change_percent: changePct,
          _fill_color: getDeltaMapFillColor(changePct, greenDirection, basemapTheme),
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
  }, [shapeData, districtData, greenDirection, basemapTheme]);

  // Initialize map and add layers (rebuild when data or basemap theme changes)
  useEffect(() => {
    if (!mapContainer.current || !geoJsonWithData) return;

    if (mapRef.current) {
      try {
        mapRef.current.remove();
      } catch {
        /* ignore */
      }
      mapRef.current = null;
    }

    const mapStyle =
      basemapTheme === "dark"
        ? "mapbox://styles/mapbox/dark-v11"
        : "mapbox://styles/mapbox/light-v11";

    const map = new mapboxgl.Map({
      container: mapContainer.current,
      style: mapStyle,
      center: initialCenter,
      zoom: cityZoom,
      scrollZoom: false,
      attributionControl: false,
    });

    mapRef.current = map;

    const outlineColor = basemapTheme === "dark" ? "#ffffff" : "#666666";
    const outlineOpacity = basemapTheme === "dark" ? 0.55 : 0.5;

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

      map.addLayer({
        id: "delta-districts-fill",
        type: "fill",
        source: "delta-districts",
        paint: {
          "fill-color": ["get", "_fill_color"],
          "fill-opacity": 0.88,
        },
      });

      // Add outline layer
      map.addLayer({
        id: "delta-districts-outline",
        type: "line",
        source: "delta-districts",
        paint: {
          "line-color": outlineColor,
          "line-width": 1,
          "line-opacity": outlineOpacity,
        },
      });

      // Frame map on district shapes so it shows the correct city (not a fixed center)
      const bounds = getBoundsFromGeoJson(geoJsonWithData);
      if (bounds) {
        try {
          map.fitBounds(bounds, {
            padding: CHOROPLETH_FIT_PADDING,
            maxZoom: CHOROPLETH_FIT_MAX_ZOOM_CITYWIDE,
            duration: 0,
          });
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
        const district = (props._district as string | number) || "Unknown";
        const areaLabel =
          typeof district === "string" && /[a-zA-Z]/.test(district)
            ? district
            : `District ${district}`;
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
            ? basemapTheme === "dark"
              ? "#94a3b8"
              : "#666"
            : changePercent > 5
              ? greenDirection === "down"
                ? "#ef4444"
                : "#22c55e"
              : changePercent < -5
                ? greenDirection === "down"
                  ? "#22c55e"
                  : "#ef4444"
                : basemapTheme === "dark"
                  ? "#94a3b8"
                  : "#666";

        const muted = basemapTheme === "dark" ? "#94a3b8" : "#666";
        const titleColor = basemapTheme === "dark" ? "#f8fafc" : "#111827";

        popup
          .setLngLat(e.lngLat)
          .setHTML(
            `<div style="font-family: 'IBM Plex Sans', sans-serif; font-size: 13px; color: ${titleColor};">
              <div style="font-weight: 600; margin-bottom: 4px;">${areaLabel}</div>
              <div style="color: ${muted};">Last Year: ${formatValue(comparisonValue)}</div>
              <div style="color: ${muted};">This Year: ${formatValue(currentValue)}</div>
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
  }, [geoJsonWithData, initialCenter, cityZoom, greenDirection, basemapTheme]);

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
    return null;
  }

  if (!districtData || districtData.districts.length === 0) {
    return null;
  }

  if (!shapeData?.geometry || shapeData.geometry.type !== "FeatureCollection") {
    return null;
  }
  if (!Array.isArray(shapeData.geometry.features) || shapeData.geometry.features.length === 0) {
    return null;
  }

  return (
    <div
      className={`delta-map-wrapper${basemapTheme === "dark" ? " delta-map-wrapper--dark" : ""}`}
    >
      <div
        ref={mapContainer}
        className="delta-map-container"
        style={{ height }}
      />
      <div className="delta-map-legend">
        <div className="legend-item">
          <span
            className="legend-color"
            style={{
              backgroundColor: greenDirection === "down" ? "#22c55e" : "#ef4444",
            }}
          />
          <span className="legend-label">
            {greenDirection === "down" ? "Decreased" : "Increased"}
          </span>
        </div>
        <div className="legend-item">
          <span
            className="legend-color"
            style={{
              backgroundColor:
                basemapTheme === "dark"
                  ? DELTA_MAP_NEUTRAL_DARK_HEX
                  : "#f5f5f5",
              border:
                basemapTheme === "dark"
                  ? "1px solid rgba(255, 255, 255, 0.2)"
                  : undefined,
            }}
          />
          <span className="legend-label">No change</span>
        </div>
        <div className="legend-item">
          <span
            className="legend-color"
            style={{
              backgroundColor: greenDirection === "down" ? "#ef4444" : "#22c55e",
            }}
          />
          <span className="legend-label">
            {greenDirection === "down" ? "Increased" : "Decreased"}
          </span>
        </div>
      </div>
      {canShowLink && (
        <div className="map-link-row">
          <button
            onClick={handleViewFullMap}
            disabled={savingMap}
            className="map-link"
            style={{
              background: "none",
              border: "none",
              cursor: savingMap ? "wait" : "pointer",
              padding: 0,
              font: "inherit",
              color: "inherit",
              textDecoration: "underline",
            }}
          >
            {savingMap ? "Opening..." : "View full map"}{" "}
            <i className="fas fa-external-link-alt" />
          </button>
        </div>
      )}
    </div>
  );
}

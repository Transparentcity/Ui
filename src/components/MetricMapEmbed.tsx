"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useAuth0 } from "@auth0/auth0-react";
import { useTheme } from "@/contexts/ThemeContext";
import { formatDateRangeFromStrings } from "@/lib/formatters";
import { getMetricMapPreview, saveMetricMap, type MapPreviewResponse } from "@/lib/publicApiClient";
import { getMetricMapData, type MapData, type SavedMap } from "@/lib/apiClient";
import ProgressiveMapView from "./ProgressiveMapView";
import Loader from "./Loader";
import {
  computeMetricMapEmbedViewSpecs,
  formatMetricMapViewSpecKey,
  type MetricMapViewSpec,
} from "@/lib/metricMapEmbedViews";
import { getMapCaptionTotalCount } from "@/lib/metricMapCaptionTotal";
import {
  getPlaceRadiusBoundingBox,
  getPlaceRadiusBoundingBoxPolygon,
} from "@/lib/placeBounds";
import "./MetricMapEmbed.css";

interface MetricMapEmbedProps {
  metricId: number;
  selectedPeriod: "ytd" | "mtd" | "mtd_prior_year";
  height?: number;
  showLink?: boolean;
  showPeriodSelector?: boolean;
  onPeriodChange?: (period: string) => void;
  district?: number | null;
  /** When set, fetch authenticated map-data filtered to this place circle. */
  placeCircle?: { lat: number; lng: number; radius_m: number } | null;
  /** Label for the place pin overlay (matches CityMapView). */
  placeLabel?: string | null;
  metricName?: string;
  itemNoun?: string;
  dateRange?: { start: string | null; end: string | null };
  comparisonDateRange?: { start: string | null; end: string | null };
  valueField?: string | null;
  /**
   * Known true total for the period (e.g. from comparison data). When supplied
   * this is always shown in the caption instead of the (potentially truncated)
   * point count returned by the map API.
   */
  knownTotal?: number | null;
  /**
   * Called once after the API responds and the only renderable view would be a
   * truncated point sample (limit hit, no choropleth available). The parent can
   * use this to collapse the surrounding section entirely.
   */
  onMapUnavailable?: () => void;
}

// ─── Map-layer subtitle helpers ──────────────────────────────────────────────

/**
 * Drop a trailing plain "s" to singularize civic nouns.
 * "Districts" → "District", "Wards" → "Ward", "Neighborhoods" → "Neighborhood"
 * Leaves "ss"-endings and short words alone.
 */
function singularizeLastWord(label: string): string {
  const words = label.trim().split(/\s+/);
  if (words.length === 0) return label;
  const last = words[words.length - 1];
  const singular =
    last.length > 3 && last.endsWith("s") && !last.endsWith("ss")
      ? last.slice(0, -1)
      : last;
  return [...words.slice(0, -1), singular].join(" ");
}

/**
 * Build a human-readable subtitle that explains *how* the map is broken down.
 *   primary choropleth  → "By Supervisor District"
 *   secondary choropleth → "Also by Analysis Neighborhood"
 *
 * Leading city abbreviations (2–4 uppercase letters like "SF", "NYC") are
 * stripped so "SF Analysis Neighborhoods" becomes "analysis neighborhood".
 */
function buildLayerSubtitle(
  rawLabel: string,
  kind: "points" | "choropleth",
  isSecondary = false
): string {
  if (kind !== "choropleth") return "";

  // Singularize last word first, then strip a leading 2-4-char city abbreviation
  // and lowercase the whole thing.
  const singularLabel = singularizeLastWord(rawLabel)
    .replace(/^[A-Z]{2,4}\s+/, "") // strip "SF ", "NYC ", etc.
    .toLowerCase();

  return isSecondary ? `Also by ${singularLabel}` : `By ${singularLabel}`;
}

// Convert MapPreviewResponse to SavedMap format for ProgressiveMapView
function previewToSavedMap(preview: MapPreviewResponse): SavedMap {
  return {
    id: 0,
    short_hash: "",
    title: preview.title,
    description: preview.description ?? null,
    map_type: preview.map_type as "point" | "choropleth" | "symbol" | "heatmap" | "multi_layer",
    location_data: preview.location_data as Array<{ lat: number; lon: number; [key: string]: any }>,
    map_config: preview.map_config,
    bounds: preview.bounds ?? null,
    center: preview.center ?? null,
    city_id: preview.city_id ?? null,
    metric_id: preview.metric_id,
    query_source: null,
    is_public: false,
    view_count: 0,
    user_id: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

/**
 * Convert authenticated map-data into SavedMap for ProgressiveMapView.
 * For place scope: force a points map centered on the place bbox (same as CityMapView),
 * strip choropleth aggregations that would hide dots, and attach saved_place_overlay.
 */
function mapDataToSavedMap(
  mapData: MapData,
  metricId: number,
  placeCircle?: { lat: number; lng: number; radius_m: number } | null,
  placeLabel?: string | null
): SavedMap {
  const locationData = Array.isArray(mapData.location_data)
    ? (mapData.location_data as Array<{ lat: number; lon: number; [key: string]: any }>)
    : [];
  const rawConfig =
    typeof mapData.map_config === "object" && mapData.map_config
      ? mapData.map_config
      : typeof mapData.metadata === "object" && mapData.metadata
        ? (mapData.metadata as Record<string, any>)
        : {};

  const isPlace =
    placeCircle != null &&
    Number.isFinite(placeCircle.lat) &&
    Number.isFinite(placeCircle.lng) &&
    placeCircle.radius_m > 0;

  let bounds: [[number, number], [number, number]] | null = null;
  let center: { lat: number; lng: number; zoom: number } | null = null;
  let mapConfig: Record<string, any> = { ...rawConfig };

  if (isPlace && placeCircle) {
    const b = getPlaceRadiusBoundingBox(
      placeCircle.lat,
      placeCircle.lng,
      placeCircle.radius_m
    );
    bounds = [
      [b.lonLo, b.latLo],
      [b.lonHi, b.latHi],
    ];
    center = { lat: placeCircle.lat, lng: placeCircle.lng, zoom: 15 };
    const label = placeLabel?.trim() || "My place";
    // Place dashboard always shows pins in the place bbox — drop choropleth
    // config so ProgressiveMapView treats this as a point map (isPointMap).
    mapConfig = {
      item_noun: rawConfig.item_noun,
      start_date: rawConfig.start_date,
      end_date: rawConfig.end_date,
      default_view: { type: "points" },
      saved_place_overlay: {
        kind: "saved_place_circle",
        label,
        center_lat: placeCircle.lat,
        center_lon: placeCircle.lng,
        radius_m: placeCircle.radius_m,
        circles_geojson: {
          type: "FeatureCollection",
          features: [
            {
              type: "Feature",
              properties: { name: label },
              geometry: getPlaceRadiusBoundingBoxPolygon(
                placeCircle.lat,
                placeCircle.lng,
                placeCircle.radius_m
              ),
            },
          ],
        },
      },
    };
  }

  return {
    id: typeof mapData.id === "number" ? mapData.id : 0,
    short_hash: "",
    title: mapData.title || "Map",
    description: null,
    map_type: isPlace ? "point" : ((mapData.type as SavedMap["map_type"]) || "point"),
    location_data: locationData,
    map_config: mapConfig,
    bounds,
    center,
    city_id: null,
    metric_id: metricId,
    query_source: null,
    is_public: false,
    view_count: 0,
    user_id: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

// ─── Secondary map: click-to-load (avoids competing Mapbox contexts) ─────────

interface SecondaryMapProps {
  mapData: SavedMap;
  spec: MetricMapViewSpec;
  height: number;
  basemapTheme: "dark" | "light";
  metricId: number;
}

function SecondaryMapSection({
  mapData,
  spec,
  height,
  basemapTheme,
  metricId,
}: SecondaryMapProps) {
  // Click-to-load: a second Mapbox GL context + full GeoJSON download contends
  // with the primary choropleth. Only mount when the user asks for it.
  const [expanded, setExpanded] = useState(false);

  const subtitle = buildLayerSubtitle(spec.label, spec.kind, true);

  return (
    <div className="metric-map-secondary-section">
      {subtitle && <div className="metric-map-secondary-label">{subtitle}</div>}
      {expanded ? (
        <ProgressiveMapView
          key={`metric-map-secondary-${metricId}-${formatMetricMapViewSpecKey(spec)}`}
          mapData={mapData}
          mapHash=""
          height={height}
          onError={() => {/* silently ignore secondary map errors */}}
          mapBasemapTheme={basemapTheme}
          lockedViewKey={formatMetricMapViewSpecKey(spec)}
        />
      ) : (
        <button
          type="button"
          className="metric-map-secondary-load"
          onClick={() => setExpanded(true)}
        >
          {subtitle ? `Load map — ${subtitle.toLowerCase()}` : "Load alternate map"}
        </button>
      )}
    </div>
  );
}

// ─── Main component ──────────────────────────────────────────────────────────

export default function MetricMapEmbed({
  metricId,
  selectedPeriod,
  height = 400,
  showLink = true,
  showPeriodSelector = false,
  onPeriodChange,
  district,
  placeCircle = null,
  placeLabel = null,
  metricName,
  itemNoun = "items",
  dateRange,
  comparisonDateRange,
  valueField,
  knownTotal,
  onMapUnavailable,
}: MetricMapEmbedProps) {
  const { theme } = useTheme();
  const { getAccessTokenSilently } = useAuth0();
  const mapBasemapTheme = theme === "dark" ? "dark" : "light";
  const isPlaceScope = !!(
    placeCircle &&
    placeCircle.lat != null &&
    placeCircle.lng != null &&
    placeCircle.radius_m > 0
  );

  const [mapData, setMapData] = useState<SavedMap | null>(null);
  const [comparisonLocationData, setComparisonLocationData] = useState<Array<Record<string, any>> | null>(null);
  const [limitHit, setLimitHit] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mapNotAvailable, setMapNotAvailable] = useState(false);
  const [savingMap, setSavingMap] = useState(false);

  // ── Lazy loading: only fetch once the container enters the viewport ─────────
  const containerRef = useRef<HTMLDivElement>(null);
  const [hasEnteredViewport, setHasEnteredViewport] = useState(false);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setHasEnteredViewport(true);
          observer.disconnect();
        }
      },
      { rootMargin: "400px" } // start loading 400px before it enters the visible area
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Reset map state when navigating to a different metric/scope.
  useEffect(() => {
    setMapData(null);
    setComparisonLocationData(null);
    setLimitHit(false);
    setMapNotAvailable(false);
    setError(null);
    setLoading(true);
  }, [metricId, district, isPlaceScope, placeCircle?.lat, placeCircle?.lng, placeCircle?.radius_m]);

  // ── Fetch map preview (deferred until in viewport) ───────────────────────────
  useEffect(() => {
    if (!hasEnteredViewport) return;

    let mounted = true;

    // Keep the previous map mounted while refetching so Mapbox GL is not torn
    // down on every period/date change (expensive tiles + geometry reloads).
    setMapNotAvailable(false);
    setError(null);

    if (!dateRange?.start || !dateRange?.end) {
      setLoading(false);
      setMapData(null);
      setComparisonLocationData(null);
      setLimitHit(false);
      return;
    }

    async function fetchMapPreview() {
      try {
        setLoading(true);

        if (isPlaceScope && placeCircle) {
          const token = await getAccessTokenSilently();
          const response = await getMetricMapData(
            {
              metric_id: metricId,
              start_date: dateRange!.start!,
              end_date: dateRange!.end!,
              center_lat: placeCircle.lat,
              center_lon: placeCircle.lng,
              radius_m: placeCircle.radius_m,
            },
            token
          );
          if (!mounted) return;
          if (response.status === "success" && response.map_data) {
            setMapData(
              mapDataToSavedMap(response.map_data, metricId, placeCircle, placeLabel)
            );
            setComparisonLocationData(null);
            setLimitHit(false);
          } else {
            const errMsg = response.error || "Failed to load place map";
            if (errMsg.includes("map_query")) {
              setMapNotAvailable(true);
              setError(null);
              setMapData(null);
            } else {
              setError(errMsg);
            }
          }
          return;
        }

        const response = await getMetricMapPreview(metricId, {
          start_date: dateRange!.start!,
          end_date: dateRange!.end!,
          district: district || undefined,
          period_type: selectedPeriod,
          comparison_start_date: comparisonDateRange?.start || undefined,
          comparison_end_date: comparisonDateRange?.end || undefined,
        });

        if (mounted) {
          setMapData(previewToSavedMap(response));
          setLimitHit(response.limit_hit ?? false);

          if (response.comparison_location_data && response.comparison_location_data.length > 0) {
            setComparisonLocationData(response.comparison_location_data);
          } else {
            setComparisonLocationData(null);
          }
        }
      } catch (err) {
        if (mounted) {
          const is404 =
            (err as any)?.status === 404 ||
            (err instanceof Error &&
              (err.message.includes("404") ||
                err.message.includes("not available") ||
                err.message.includes("no map_query")));

          if (is404) {
            setMapNotAvailable(true);
            setError(null);
            setMapData(null);
          } else {
            setError(err instanceof Error ? err.message : "Failed to load map");
          }
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    }

    fetchMapPreview();
    return () => {
      mounted = false;
    };
  }, [
    hasEnteredViewport,
    metricId,
    selectedPeriod,
    district,
    isPlaceScope,
    placeCircle?.lat,
    placeCircle?.lng,
    placeCircle?.radius_m,
    placeLabel,
    dateRange?.start,
    dateRange?.end,
    comparisonDateRange?.start,
    comparisonDateRange?.end,
    getAccessTokenSilently,
  ]);

  // ── Handle "View full map" ────────────────────────────────────────────────────
  const handleViewFullMap = useCallback(async () => {
    if (!dateRange?.start || !dateRange?.end || isPlaceScope) return;

    try {
      setSavingMap(true);

      const response = await saveMetricMap(metricId, {
        start_date: dateRange.start,
        end_date: dateRange.end,
        district: district || undefined,
        period_type: selectedPeriod,
      });

      window.open(response.map_url, "_blank", "noopener,noreferrer");
    } catch (err) {
      console.error("Failed to save map:", err);
      setError(err instanceof Error ? err.message : "Failed to save map");
    } finally {
      setSavingMap(false);
    }
  }, [metricId, selectedPeriod, district, dateRange, isPlaceScope]);

  // ── Caption builder ───────────────────────────────────────────────────────────
  const formatDateRange = (start: string | null | undefined, end: string | null | undefined): string =>
    formatDateRangeFromStrings(start, end, { fallback: "" });

  const buildCaption = (): string => {
    if (!metricName) return "";

    // Determine the date range string
    let dateRangeStr = "";
    if (mapData?.map_config?.start_date && mapData?.map_config?.end_date) {
      dateRangeStr = formatDateRange(
        mapData.map_config.start_date as string,
        mapData.map_config.end_date as string
      );
    } else if (dateRange?.start && dateRange?.end) {
      dateRangeStr = formatDateRange(dateRange.start, dateRange.end);
    }
    if (!dateRangeStr) return "";

    // Resolve total count:
    //   1. knownTotal (authoritative — from comparison API)
    //   2. choropleth aggregation sum
    //   3. location_data row count (may be capped at 5 k)
    let totalCount: number | null = null;
    if (knownTotal != null && knownTotal > 0) {
      totalCount = knownTotal;
    } else if (mapData) {
      totalCount = getMapCaptionTotalCount(mapData, { valueField });
    }

    if (totalCount === null) return "";

    const locationLabel =
      isPlaceScope
        ? "near this place"
        : district && district > 0
          ? `in District ${district}`
          : "citywide";
    const displayItemNoun = (mapData?.map_config?.item_noun as string | undefined) || itemNoun;

    return `There ${totalCount === 1 ? "was" : "were"} ${totalCount.toLocaleString()} ${metricName.toLowerCase()} ${displayItemNoun.toLowerCase()} ${locationLabel} from ${dateRangeStr}.`;
  };

  const periodButtonLabels = {
    ytd: "Year-to-Date",
    mtd: "Month-to-Date",
    mtd_prior_year: "Month-to-Date (Prior Year)",
  };

  const getYearFromDate = (dateStr: string | null | undefined): number | null => {
    if (!dateStr) return null;
    try {
      const date = new Date(dateStr);
      if (isNaN(date.getTime())) return null;
      return date.getFullYear();
    } catch {
      return null;
    }
  };

  const currentYear = getYearFromDate(dateRange?.start);
  const comparisonYear = getYearFromDate(comparisonDateRange?.start);
  const hasComparison = comparisonLocationData && comparisonLocationData.length > 0;

  const embedViewSpecs = useMemo(
    () => (mapData ? computeMetricMapEmbedViewSpecs(mapData) : null),
    [mapData]
  );

  // When the backend hit the 5k row limit and the only renderable view is a raw
  // point sample, suppress point maps entirely. If a choropleth exists, promote
  // it to primary; otherwise the section produces nothing useful.
  // Place scope always uses pins (same as CityMapView / CityMetricsMap).
  const effectiveSpecs = useMemo(() => {
    if (isPlaceScope && mapData) {
      return {
        primary: { kind: "points" as const, label: "Location pins" },
        secondary: [] as MetricMapViewSpec[],
      };
    }
    if (!embedViewSpecs) return null;
    if (!limitHit) return embedViewSpecs;

    const primaryIsPoints = embedViewSpecs.primary.kind === "points";

    if (!primaryIsPoints) {
      // Primary is already a choropleth/delta — just strip any secondary point maps.
      return {
        primary: embedViewSpecs.primary,
        secondary: embedViewSpecs.secondary.filter((s) => s.kind !== "points"),
      };
    }

    // Primary is a point map that's maxing out.  Try to promote a choropleth.
    const firstChoropleth = embedViewSpecs.secondary.find(
      (s) => s.kind === "choropleth"
    );
    if (firstChoropleth) {
      return {
        primary: firstChoropleth,
        secondary: embedViewSpecs.secondary.filter(
          (s) => s !== firstChoropleth && s.kind !== "points"
        ),
      };
    }

    // Nothing useful to render.
    return null;
  }, [isPlaceScope, mapData, embedViewSpecs, limitHit]);

  // Don't produce a caption when the map itself is being suppressed.
  const caption =
    limitHit && effectiveSpecs === null ? "" : buildCaption();

  // Notify parent once we know the map section has nothing to show.
  const onMapUnavailableFired = useRef(false);
  useEffect(() => {
    if (
      !loading &&
      mapData &&
      limitHit &&
      effectiveSpecs === null &&
      !onMapUnavailableFired.current
    ) {
      onMapUnavailableFired.current = true;
      onMapUnavailable?.();
    }
  }, [loading, mapData, limitHit, effectiveSpecs, onMapUnavailable]);

  // Secondary map height: 75 % of primary (but not smaller than 200 px)
  const secondaryHeight = Math.max(200, Math.round(height * 0.75));

  // ── Early-exit renders ────────────────────────────────────────────────────────

  if (!dateRange?.start || !dateRange?.end) {
    return (
      <div className="metric-map-embed" ref={containerRef} style={{ minHeight: height }}>
        <div className="map-not-available">
          <p>Map data requires date range information.</p>
        </div>
      </div>
    );
  }

  // Before entering viewport, show a pulsing placeholder at full height
  if (!hasEnteredViewport) {
    return (
      <div className="metric-map-embed" ref={containerRef}>
        <div className="map-placeholder" style={{ height }} />
      </div>
    );
  }

  if (loading) {
    return (
      <div className="metric-map-embed" ref={containerRef} style={{ minHeight: height }}>
        <div className="map-loading" style={{ minHeight: height }}>
          <Loader size="md" color="dark" />
          <span>Loading map…</span>
        </div>
      </div>
    );
  }

  if (mapNotAvailable) {
    return (
      <div className="metric-map-embed" ref={containerRef} style={{ minHeight: height }}>
        <div className="map-not-available">
          <p>Map data is not available for this metric.</p>
        </div>
      </div>
    );
  }

  // Data loaded but the only view would be a truncated point sample — nothing useful to render.
  // The onMapUnavailable callback already notified the parent to collapse its section.
  if (!loading && mapData && limitHit && effectiveSpecs === null) {
    return null;
  }

  if (error) {
    return (
      <div className="metric-map-embed" ref={containerRef} style={{ minHeight: height }}>
        <div className="map-error">{error}</div>
      </div>
    );
  }

  // ── Full render ───────────────────────────────────────────────────────────────

  return (
    <div className="metric-map-embed" ref={containerRef}>
      {showPeriodSelector && (
        <div className="map-period-selector">
          {(["ytd", "mtd", "mtd_prior_year"] as const).map((period) => (
            <button
              key={period}
              className={`period-button ${selectedPeriod === period ? "active" : ""}`}
              onClick={() => onPeriodChange?.(period)}
            >
              {periodButtonLabels[period]}
            </button>
          ))}
        </div>
      )}

      {/* ── Primary map ── */}
      {mapData && effectiveSpecs ? (
        <>
          {effectiveSpecs.primary.kind === "choropleth" && (
            <div className="metric-map-primary-shape-label">
              {buildLayerSubtitle(effectiveSpecs.primary.label, effectiveSpecs.primary.kind, false)}
            </div>
          )}
          <ProgressiveMapView
            // Stable key: reuse the Mapbox GL instance across period/date
            // refreshes; ProgressiveMapView already reloads choropleth layers
            // when mapData / aggregations change.
            key={`metric-map-primary-${metricId}-${formatMetricMapViewSpecKey(effectiveSpecs.primary)}`}
            mapData={mapData}
            mapHash=""
            height={height}
            onError={setError}
            comparisonLocationData={comparisonLocationData || undefined}
            mapBasemapTheme={mapBasemapTheme}
            lockedViewKey={formatMetricMapViewSpecKey(effectiveSpecs.primary)}
          />
        </>
      ) : (
        <div className="map-container-wrapper">
          <div className="map-container" style={{ height }} />
          {loading && (
            <div className="map-loading">
              <Loader size="md" color="dark" />
              <span>Loading map…</span>
            </div>
          )}
        </div>
      )}

      {/* ── Point map legend ── */}
      {mapData && (() => {
        const defaultView = mapData.map_config?.default_view;
        const hasAggregations = !!(mapData.map_config?.aggregations && Object.keys(mapData.map_config.aggregations).length > 0);
        const isPointMode =
          defaultView?.type === "points" || (mapData.map_type === "point" && !hasAggregations);

        const seriesField = mapData.map_config?.series_field as string | undefined;
        const seriesColors = mapData.map_config?.series_colors as Record<string, string> | undefined;
        const seriesValues = mapData.map_config?.series_values as string[] | undefined;
        const hasSeriesLegend = !!(seriesField && seriesColors && Object.keys(seriesColors).length > 0);
        const seriesLabels = hasSeriesLegend
          ? (Array.isArray(seriesValues) ? seriesValues : Object.keys(seriesColors)).filter(
              (v) => seriesColors![v]
            )
          : [];

        const showLegend = isPointMode || (mapData.map_type === "point" && hasSeriesLegend);
        if (!showLegend) return null;

        return (
          <div className="map-legend-wrapper">
            {(hasComparison || !hasSeriesLegend) && (
              <div className="map-legend">
                <div className="map-legend-item">
                  <span className="map-legend-dot map-legend-dot-current" />
                  <span className="map-legend-label">
                    {currentYear ? `${currentYear}` : "Current"}
                  </span>
                </div>
                {hasComparison && (
                  <div className="map-legend-item">
                    <span className="map-legend-dot map-legend-dot-comparison" />
                    <span className="map-legend-label">
                      {comparisonYear ? `${comparisonYear}` : "Prior period"}
                    </span>
                  </div>
                )}
              </div>
            )}
            {hasSeriesLegend && seriesLabels.length > 0 && (
              <div className="map-legend map-legend-series">
                {seriesLabels.map((label) => (
                  <div key={String(label)} className="map-legend-item">
                    <span
                      className="map-legend-dot map-legend-dot-series"
                      style={{ backgroundColor: seriesColors![label] ?? "#ad35fa" }}
                    />
                    <span className="map-legend-label">{label}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })()}

      {/* ── Caption ── */}
      {caption && <div className="map-caption">{caption}</div>}

      {/* ── View full map link ── */}
      {showLink && mapData && (
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
            {savingMap ? "Opening…" : "View full map"} <i className="fas fa-external-link-alt" />
          </button>
        </div>
      )}

      {/* ── Secondary maps (additional shape layers) ── */}
      {mapData && effectiveSpecs && effectiveSpecs.secondary.length > 0 && (
        <div className="metric-map-secondary-maps">
          {effectiveSpecs.secondary.map((secondarySpec) => (
            <SecondaryMapSection
              key={formatMetricMapViewSpecKey(secondarySpec)}
              mapData={mapData}
              spec={secondarySpec}
              height={secondaryHeight}
              basemapTheme={mapBasemapTheme}
              metricId={metricId}
            />
          ))}
        </div>
      )}
    </div>
  );
}

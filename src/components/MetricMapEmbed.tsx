"use client";

import { useState, useEffect, useCallback } from "react";
import { getMetricMapPreview, saveMetricMap, type MapPreviewResponse } from "@/lib/publicApiClient";
import type { SavedMap } from "@/lib/apiClient";
import ProgressiveMapView from "./ProgressiveMapView";
import Loader from "./Loader";
import "./MetricMapEmbed.css";

interface MetricMapEmbedProps {
  metricId: number;
  selectedPeriod: "ytd" | "mtd" | "mtd_prior_year";
  height?: number;
  showLink?: boolean;
  showPeriodSelector?: boolean;
  onPeriodChange?: (period: string) => void;
  district?: number | null; // District to filter by (null/0 = citywide)
  metricName?: string; // Metric name for caption
  itemNoun?: string; // Item noun (e.g., "incidents", "cases") for caption
  dateRange?: { start: string | null; end: string | null }; // Date range from comparison data
  comparisonDateRange?: { start: string | null; end: string | null }; // Comparison period dates (shown as grey dots behind)
}

// Convert MapPreviewResponse to SavedMap format for ProgressiveMapView
function previewToSavedMap(preview: MapPreviewResponse): SavedMap {
  return {
    id: 0, // Not saved yet
    short_hash: "", // No hash yet
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

export default function MetricMapEmbed({
  metricId,
  selectedPeriod,
  height = 400,
  showLink = true,
  showPeriodSelector = false,
  onPeriodChange,
  district,
  metricName,
  itemNoun = "items",
  dateRange,
  comparisonDateRange,
}: MetricMapEmbedProps) {
  const [mapData, setMapData] = useState<SavedMap | null>(null);
  const [comparisonLocationData, setComparisonLocationData] = useState<Array<Record<string, any>> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mapNotAvailable, setMapNotAvailable] = useState(false);
  const [savingMap, setSavingMap] = useState(false);

  // Fetch map preview dynamically (no database save)
  useEffect(() => {
    let mounted = true;
    
    // Reset state when inputs change
    setMapData(null);
    setComparisonLocationData(null);
    setMapNotAvailable(false);
    setError(null);
    
    // Need date range to generate map
    if (!dateRange?.start || !dateRange?.end) {
      setLoading(false);
      return;
    }
    
    async function fetchMapPreview() {
      try {
        setLoading(true);
        
        // Include comparison dates if provided
        const response = await getMetricMapPreview(metricId, {
          start_date: dateRange!.start!,
          end_date: dateRange!.end!,
          district: district || undefined,
          period_type: selectedPeriod,
          comparison_start_date: comparisonDateRange?.start || undefined,
          comparison_end_date: comparisonDateRange?.end || undefined,
        });
        
        if (mounted) {
          // Convert to SavedMap format for ProgressiveMapView
          setMapData(previewToSavedMap(response));
          
          // Store comparison data if returned
          if (response.comparison_location_data && response.comparison_location_data.length > 0) {
            setComparisonLocationData(response.comparison_location_data);
          }
        }
      } catch (err) {
        if (mounted) {
          // Check if it's a 404 (map not available for this metric)
          const is404 = (err as any)?.status === 404 || 
                       (err instanceof Error && (
                         err.message.includes("404") || 
                         err.message.includes("not available") ||
                         err.message.includes("no map_query")
                       ));
          
          if (is404) {
            setMapNotAvailable(true);
            setError(null);
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
  }, [metricId, selectedPeriod, district, dateRange?.start, dateRange?.end, comparisonDateRange?.start, comparisonDateRange?.end]);

  // Handle "View full map" click - save map then navigate
  const handleViewFullMap = useCallback(async () => {
    if (!dateRange?.start || !dateRange?.end) return;
    
    try {
      setSavingMap(true);
      
      const response = await saveMetricMap(metricId, {
        start_date: dateRange.start,
        end_date: dateRange.end,
        district: district || undefined,
        period_type: selectedPeriod,
      });
      
      // Navigate to the full map page
      window.open(response.map_url, "_blank", "noopener,noreferrer");
    } catch (err) {
      console.error("Failed to save map:", err);
      setError(err instanceof Error ? err.message : "Failed to save map");
    } finally {
      setSavingMap(false);
    }
  }, [metricId, selectedPeriod, district, dateRange]);

  const periodButtonLabels = {
    ytd: "Year-to-Date",
    mtd: "Month-to-Date",
    mtd_prior_year: "Month-to-Date (Prior Year)",
  };

  // Get year from date string for legend
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

  // Build legend labels based on period type and dates
  const currentYear = getYearFromDate(dateRange?.start);
  const comparisonYear = getYearFromDate(comparisonDateRange?.start);
  const hasComparison = comparisonLocationData && comparisonLocationData.length > 0;

  // Format date range for caption
  const formatDateRange = (start: string | null | undefined, end: string | null | undefined): string => {
    if (!start || !end) return "";
    try {
      const startDate = new Date(start);
      const endDate = new Date(end);
      if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) return "";
      
      const startStr = startDate.toLocaleDateString("en-US", { month: "short", day: "numeric" });
      const endStr = endDate.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
      
      // If same year, don't repeat year
      if (startDate.getFullYear() === endDate.getFullYear()) {
        return `${startStr} – ${endDate.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`;
      }
      return `${startStr} – ${endStr}`;
    } catch {
      return "";
    }
  };

  // Total count for caption: use sum of values (YTD-style), not number of districts/points
  const getTotalCount = (): number | null => {
    if (!mapData) return null;
    const aggregations = mapData.map_config?.aggregations as Record<string, { rows?: Array<{ value?: number; count?: number }> }> | undefined;
    if (aggregations && typeof aggregations === "object") {
      const keys = Object.keys(aggregations);
      for (const key of keys) {
        const agg = aggregations[key];
        const rows = agg?.rows;
        if (Array.isArray(rows) && rows.length > 0) {
          const total = rows.reduce(
            (sum, row) => sum + (Number(row?.value ?? row?.count ?? 0) || 0),
            0
          );
          if (total > 0) return total;
        }
      }
    }
    const loc = mapData.location_data;
    if (Array.isArray(loc) && loc.length > 0) {
      const first = loc[0] as Record<string, unknown>;
      if (first && (typeof first.value === "number" || typeof first.count === "number")) {
        const total = loc.reduce(
          (sum, p: Record<string, unknown>) =>
            sum + (Number((p as any)?.value ?? (p as any)?.count ?? 0) || 0),
          0
        );
        if (total > 0) return total;
      }
      // Point map: each row is one incident
      return loc.length;
    }
    return null;
  };

  // Build caption text
  const buildCaption = (): string => {
    if (!mapData || !metricName) return "";
    
    const totalCount = getTotalCount();
    const locationLabel = district && district > 0 ? `District ${district}` : "citywide";
    
    // Try to get date range from map metadata first, then from props
    let dateRangeStr = "";
    if (mapData.map_config?.start_date && mapData.map_config?.end_date) {
      dateRangeStr = formatDateRange(mapData.map_config.start_date, mapData.map_config.end_date);
    } else if (dateRange?.start && dateRange?.end) {
      dateRangeStr = formatDateRange(dateRange.start, dateRange.end);
    }
    
    if (!dateRangeStr) return "";
    
    if (totalCount === null) return "";
    
    // Use item_noun from map_config if available
    const displayItemNoun = mapData.map_config?.item_noun || itemNoun;
    
    return `There ${totalCount === 1 ? "was" : "were"} ${totalCount.toLocaleString()} ${metricName.toLowerCase()} ${displayItemNoun.toLowerCase()} ${district && district > 0 ? `in ${locationLabel}` : `citywide`} from ${dateRangeStr}.`;
  };

  const caption = buildCaption();

  // If no date range provided, show message
  if (!dateRange?.start || !dateRange?.end) {
    return (
      <div className="metric-map-embed" style={{ height }}>
        <div className="map-not-available">
          <p>Map data requires date range information.</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="metric-map-embed" style={{ height }}>
        <div className="map-loading">
          <Loader size="md" color="dark" />
          <span>Loading map...</span>
        </div>
      </div>
    );
  }

  if (mapNotAvailable) {
    return (
      <div className="metric-map-embed" style={{ height }}>
        <div className="map-not-available">
          <p>Map data is not available for this metric.</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="metric-map-embed" style={{ height }}>
        <div className="map-error">{error}</div>
      </div>
    );
  }

  return (
    <div className="metric-map-embed">
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
      {mapData ? (
        <ProgressiveMapView
          mapData={mapData}
          mapHash="" // No hash for preview mode - points are already in mapData
          height={height}
          onError={setError}
          comparisonLocationData={comparisonLocationData || undefined}
        />
      ) : (
        <div className="map-container-wrapper">
          <div className="map-container" style={{ height }} />
          {loading && (
            <div className="map-loading">
              <Loader size="md" color="dark" />
              <span>Loading map...</span>
            </div>
          )}
        </div>
      )}
      {/* Legend: period (current vs comparison) and/or series field colors - only for point maps */}
      {mapData && (() => {
        const defaultView = mapData.map_config?.default_view;
        const isPointMode = defaultView?.type === "points" ||
          (mapData.map_type === "point" && !(mapData.map_config?.aggregations && Object.keys(mapData.map_config.aggregations).length > 0));
        if (!isPointMode) return null;

        const seriesField = mapData.map_config?.series_field as string | undefined;
        const seriesColors = mapData.map_config?.series_colors as Record<string, string> | undefined;
        const seriesValues = mapData.map_config?.series_values as string[] | undefined;
        const hasSeriesLegend = !!(seriesField && seriesColors && Object.keys(seriesColors).length > 0);
        const seriesLabels = hasSeriesLegend
          ? (Array.isArray(seriesValues) ? seriesValues : Object.keys(seriesColors)).filter((v) => seriesColors[v])
          : [];

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
                      style={{ backgroundColor: seriesColors[label] ?? "#ad35fa" }}
                    />
                    <span className="map-legend-label">{label}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })()}
      {caption && (
        <div className="map-caption">
          {caption}
        </div>
      )}
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
              textDecoration: "underline"
            }}
          >
            {savingMap ? "Opening..." : "View full map"} <i className="fas fa-external-link-alt" />
          </button>
        </div>
      )}
    </div>
  );
}

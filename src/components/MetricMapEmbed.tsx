"use client";

import { useState, useEffect } from "react";
import { getPublicMetricMap } from "@/lib/publicApiClient";
import { getPublicMap } from "@/lib/apiClient";
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
  dateRange?: { start: string | null; end: string | null }; // Date range for caption
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
}: MetricMapEmbedProps) {
  const [mapHash, setMapHash] = useState<string | null>(null);
  const [mapData, setMapData] = useState<SavedMap | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);


  // Track if map is not available (404 or missing map_query)
  const [mapNotAvailable, setMapNotAvailable] = useState(false);
  
  // Fetch map hash for current period with timeout
  useEffect(() => {
    let mounted = true;
    let timeoutId: NodeJS.Timeout | null = null;
    
    // Reset map data when period changes
    setMapData(null);
    setMapNotAvailable(false);
    
    async function fetchMapHash() {
      try {
        setLoading(true);
        setError(null);
        
        // Add timeout for map hash fetch (5 seconds)
        const controller = new AbortController();
        timeoutId = setTimeout(() => {
          controller.abort();
        }, 5000);
        
        const response = await getPublicMetricMap(metricId, selectedPeriod, district);
        
        if (timeoutId) {
          clearTimeout(timeoutId);
          timeoutId = null;
        }
        
        if (mounted) {
          setMapHash(response.map_hash);
        }
      } catch (err) {
        if (mounted) {
          // Check if it's a timeout
          if (err instanceof Error && err.name === 'AbortError') {
            setMapNotAvailable(true);
            setError(null);
            return;
          }
          
          // Check if it's a 404 (map not available) vs other error
          const is404 = (err as any)?.status === 404 || 
                       (err instanceof Error && (
                         err.message.includes("404") || 
                         err.message.includes("not available") ||
                         err.message.includes("does not have a map_query")
                       ));
          
          if (is404) {
            setMapNotAvailable(true);
            setError(null); // Don't show error for missing map
          } else {
            setError(err instanceof Error ? err.message : "Failed to load map");
          }
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
        if (timeoutId) {
          clearTimeout(timeoutId);
        }
      }
    }
    
    fetchMapHash();
    return () => {
      mounted = false;
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
  }, [metricId, selectedPeriod, district]);

  // Fetch map data when hash is available (with timeout)
  useEffect(() => {
    if (!mapHash) return;
    const hash = mapHash;

    let mounted = true;
    let timeoutId: NodeJS.Timeout | null = null;

    async function fetchMapData() {
      try {
        // Add timeout for map data fetch (8 seconds - it can be larger)
        const controller = new AbortController();
        timeoutId = setTimeout(() => {
          controller.abort();
        }, 8000);
        
        const data = await getPublicMap(hash);
        
        if (timeoutId) {
          clearTimeout(timeoutId);
          timeoutId = null;
        }
        
        if (mounted) {
          setMapData(data);
        }
      } catch (err) {
        if (mounted) {
          // On timeout or error, show "not available" instead of error
          if (err instanceof Error && err.name === 'AbortError') {
            setMapNotAvailable(true);
          } else {
            setError(err instanceof Error ? err.message : "Failed to load map data");
          }
        }
      }
    }

    fetchMapData();
    return () => {
      mounted = false;
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
  }, [mapHash]);


  const periodButtonLabels = {
    ytd: "Year-to-Date",
    mtd: "Month-to-Date",
    mtd_prior_year: "Month-to-Date (Prior Year)",
  };

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
    
    return `There ${totalCount === 1 ? "was" : "were"} ${totalCount.toLocaleString()} ${metricName.toLowerCase()} ${itemNoun.toLowerCase()} ${district && district > 0 ? `in ${locationLabel}` : `citywide`} from ${dateRangeStr}.`;
  };

  const caption = buildCaption();

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
      {mapData && mapHash ? (
        <ProgressiveMapView
          mapData={mapData}
          mapHash={mapHash}
          height={height}
          onError={setError}
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
      {caption && (
        <div className="map-caption">
          {caption}
        </div>
      )}
      {showLink && mapHash && (
        <div className="map-link-row">
          <a href={`/m/${mapHash}`} target="_blank" rel="noopener noreferrer" className="map-link">
            View full map <i className="fas fa-external-link-alt" />
          </a>
        </div>
      )}
    </div>
  );
}

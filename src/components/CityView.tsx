"use client";

import React, { useEffect, useState, useMemo, useRef, useCallback } from "react";
import CityDataAdmin from "@/components/CityDataAdmin";
import CityMapView from "@/components/CityMapView";
import CityHeader from "@/components/CityHeader";
import MetricDateRangeSelector from "@/components/MetricDateRangeSelector";
import DistrictNavigation from "@/components/DistrictNavigation";
import AnomaliesTabPanel from "@/components/AnomaliesTabPanel";
import NewslettersTabPanel from "@/components/NewslettersTabPanel";
import { useCity, useSavedCities, useSaveCity, useUnsaveCity, useCityLeaders, useRepresentativeFollowerCounts } from "@/lib/hooks/useCities";
import type { CityLeader } from "@/lib/apiClient";
import { useCityMetricOrdering } from "@/lib/hooks/useCityAdmin";
import { emitSavedCitiesChanged, SAVED_CITIES_CHANGED_EVENT } from "@/lib/uiEvents";
import { getPresetMetricDateRange, getDefaultDateRangeFromMetrics, type MetricDateRange } from "@/lib/dateRange";
import type { AnomalyResult } from "@/lib/hooks/useAnomalies";
import { useAuth0 } from "@auth0/auth0-react";
import { getAdminMetricTimeSeries, getAdminMetricTimeSeriesDetail, type BatchComparisonsResponse, type ComparisonType, type ComparisonResponse } from "@/lib/apiClient";
import { useMetricComparisons, useBatchComparisons } from "@/lib/hooks/useMetrics";
import Loader from "@/components/Loader";
import { MetricLink } from "@/components/MetricLink";
import MetricDetailModal from "@/components/MetricDetailModal";
import { slugify } from "@/lib/utils";
import "./CityView.css";

interface CityViewProps {
  cityId: number;
  isAdmin: boolean;
  gpsLocation?: { lat: number; lng: number } | null; // GPS coordinates to zoom to
  initialDistrict?: number | null; // Initial district to select when loading
}

type TabType = "map" | "dashboard" | "anomalies" | "newsletters" | "admin";

interface MetricWithYTD {
  id: number;
  metric_name: string;
  metric_key?: string;
  category?: string | null;
  subcategory?: string | null; // Subcategory within the main category
  most_recent_data_date?: string | null;
  freshness?: any;
  ytdLastYear?: number | null;
  ytdThisYear?: number | null;
  ytdLoading?: boolean;
  sparklineData?: SparklineDataPoint[];
  dateRangeStart?: Date;
  dateRangeEnd?: Date;
  greendirection?: string; // "up" or "down" - determines if increase is good or bad
  currentPeriodStart?: Date;
  currentPeriodEnd?: Date;
  comparisonPeriodStart?: Date;
  comparisonPeriodEnd?: Date;
  computedAt?: string; // When the comparison was last computed
  maxDataDate?: string; // Most recent data point date
  display_unit?: string | null; // "percentage", "currency", "count", etc.
}

/**
 * Format a metric value based on its display unit.
 * - percentage: Show as "49%" (rounded to nearest percent)
 * - currency: Show with $ prefix
 * - default: Show as locale string (e.g., "1,234")
 */
function formatMetricValue(
  value: number | null | undefined,
  displayUnit?: string | null
): string {
  if (value === null || value === undefined) {
    return "No data";
  }

  if (displayUnit === "percentage") {
    // For percentages, round to nearest percent
    return `${Math.round(value)}%`;
  }

  const absValue = Math.abs(value);
  const sign = value < 0 ? "-" : "";
  const formatWithSuffix = (scaled: number, suffix: string) =>
    `${scaled.toFixed(1).replace(/\.0$/, "")}${suffix}`;

  const compact =
    absValue >= 1e9
      ? formatWithSuffix(absValue / 1e9, "B")
      : absValue >= 1e6
        ? formatWithSuffix(absValue / 1e6, "M")
        : absValue >= 1e3
          ? formatWithSuffix(absValue / 1e3, "k")
          : `${Math.round(absValue * 10) / 10}`;

  if (displayUnit === "currency") {
    return `${sign}$${compact}`;
  }

  return `${sign}${compact}`;
}

interface DashboardMetricsSectionProps {
  metrics: any[];
  cityId: number;
  cityName?: string; // City name for generating slug
  selectedDistrict?: number | null; // District to filter charts by (defaults to 0 for citywide)
  leaders?: CityLeader[]; // City leaders for official selector
  shapefiles?: any[]; // Shapefiles for GPS location detection
  onDistrictChange?: (district: number | null) => void; // Callback when district is changed
  onGPSLocation?: (location: { lat: number; lng: number } | null) => void; // Callback when GPS location is set
  onMetricClick?: (metricId: number, district?: number | null) => void; // Callback when metric is clicked (for modal)
  leaderFollowerCounts?: Record<string, number>; // Follower counts per district ("0"=mayor) for Official Selector
}

// Time series data point for sparkline
interface SparklineDataPoint {
  day: number; // day of year
  value: number;
  year: number; // calendar year
}

// Helper function to parse date strings consistently as local dates
// This avoids timezone issues when parsing "YYYY-MM-DD" strings.
// When JavaScript parses "2025-01-01" with new Date(), it treats it as UTC midnight,
// which appears as Dec 31 in local time zones. By parsing manually, we get correct values.
function parseLocalDate(dateStr: string): { year: number; month: number; day: number } {
  const parts = dateStr.split("T")[0].split("-");
  return {
    year: parseInt(parts[0], 10),
    month: parseInt(parts[1], 10) - 1, // JS months are 0-indexed
    day: parseInt(parts[2], 10),
  };
}

// Format date range in human-readable format (e.g., "Jan 1 - Jan 9 2026")
function formatDateRange(startDate: Date, endDate: Date): string {
  const startMonth = startDate.toLocaleDateString("en-US", { month: "short" });
  const endMonth = endDate.toLocaleDateString("en-US", { month: "short" });
  const startDay = startDate.getDate();
  const endDay = endDate.getDate();
  const year = endDate.getFullYear();
  
  if (startMonth === endMonth) {
    return `${startMonth} ${startDay} - ${endDay}, ${year}`;
  }
  return `${startMonth} ${startDay} - ${endMonth} ${endDay}, ${year}`;
}

// Calculate 7-day trailing average
function calculate7DayAverage(data: SparklineDataPoint[]): SparklineDataPoint[] {
  if (data.length === 0) return [];
  
  // Sort by day
  const sorted = [...data].sort((a, b) => a.day - b.day);
  
  return sorted.map((point, idx) => {
    const start = Math.max(0, idx - 6);
    const window = sorted.slice(start, idx + 1);
    const avg = window.reduce((sum, p) => sum + p.value, 0) / window.length;
    return { day: point.day, value: avg, year: point.year };
  });
}

// YTD Sparkline component - shows two years with daily data (light) and 7-day trailing average (dark)
// Memoized to prevent unnecessary re-renders
const YTDSparkline = React.memo(function YTDSparkline({ 
  data, 
  width = "100%", 
  height = 100,
  currentYear,
  priorYear,
}: { 
  data: SparklineDataPoint[]; 
  width?: string | number; 
  height?: number;
  currentYear: number;
  priorYear: number;
}) {
  const [visibleYears, setVisibleYears] = useState<Set<number>>(new Set([currentYear, priorYear]));
  const containerRef = useRef<HTMLDivElement>(null);
  const [svgWidth, setSvgWidth] = useState(400); // Default fallback width

  // Update SVG width when container resizes
  useEffect(() => {
    if (!containerRef.current) return;
    
    const updateWidth = () => {
      if (containerRef.current) {
        setSvgWidth(containerRef.current.offsetWidth);
      }
    };
    
    // Use ResizeObserver for better performance
    const resizeObserver = new ResizeObserver(updateWidth);
    resizeObserver.observe(containerRef.current);
    
    // Initial update
    updateWidth();
    
    return () => {
      resizeObserver.disconnect();
    };
  }, []);

  if (!data || data.length === 0) {
    return (
      <div style={{ width, height, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <span style={{ fontSize: "10px", color: "var(--text-secondary)" }}>No data</span>
      </div>
    );
  }

  // Separate data by year
  const currentYearData = data.filter(d => d.year === currentYear).sort((a, b) => a.day - b.day);
  const priorYearData = data.filter(d => d.year === priorYear).sort((a, b) => a.day - b.day);

  // Calculate 7-day averages
  const currentYearAvg = calculate7DayAverage(currentYearData);
  const priorYearAvg = calculate7DayAverage(priorYearData);

  // If not enough data for either year, show simple message
  if (currentYearAvg.length < 2 && priorYearAvg.length < 2) {
    return (
      <div style={{ width, height, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <span style={{ fontSize: "10px", color: "var(--text-secondary)" }}>Insufficient data</span>
      </div>
    );
  }

  // Use actual width from container or fallback
  const actualWidth = svgWidth || (typeof width === 'number' ? width : 400);

  // Find global min/max across both years for consistent scaling (include both daily and average)
  const allDailyValues = [...currentYearData, ...priorYearData].map(d => d.value);
  const allAvgValues = [...currentYearAvg, ...priorYearAvg].map(d => d.value);
  const allValues = [...allDailyValues, ...allAvgValues];
  const minVal = Math.min(...allValues);
  const maxVal = Math.max(...allValues);
  const range = maxVal - minVal || 1;

  // Find the max day across both years to normalize x-axis
  const maxDay = Math.max(
    currentYearData.length > 0 ? Math.max(...currentYearData.map(d => d.day)) : 0,
    priorYearData.length > 0 ? Math.max(...priorYearData.map(d => d.day)) : 0,
    currentYearAvg.length > 0 ? Math.max(...currentYearAvg.map(d => d.day)) : 0,
    priorYearAvg.length > 0 ? Math.max(...priorYearAvg.map(d => d.day)) : 0
  );

  // Chart dimensions
  const padding = { top: 8, right: 8, bottom: 20, left: 8 };
  const chartWidth = actualWidth - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;

  // Function to create path for a dataset
  const createPath = (yearData: SparklineDataPoint[]): string => {
    if (yearData.length < 2) return '';
    
    const points = yearData.map((d) => {
      // Map day of year (1-365) to x position (using maxDay for consistent scale)
      const x = padding.left + (d.day / maxDay) * chartWidth;
      const y = padding.top + chartHeight - ((d.value - minVal) / range) * chartHeight;
      return { x, y };
    });
    
    return points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
  };

  // Create paths for daily data (light) and 7-day average (dark)
  const currentYearDailyPath = createPath(currentYearData);
  const priorYearDailyPath = createPath(priorYearData);
  const currentYearAvgPath = createPath(currentYearAvg);
  const priorYearAvgPath = createPath(priorYearAvg);

  // Get end points for dots (on the 7-day average line)
  const currentYearLastPoint = currentYearAvg.length > 0 ? {
    x: padding.left + (currentYearAvg[currentYearAvg.length - 1].day / maxDay) * chartWidth,
    y: padding.top + chartHeight - ((currentYearAvg[currentYearAvg.length - 1].value - minVal) / range) * chartHeight
  } : null;

  // Month labels at bottom
  const monthLabels = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'];
  const monthDays = [1, 32, 60, 91, 121, 152, 182, 213, 244, 274, 305, 335];

  // Toggle year visibility
  const toggleYear = (year: number) => {
    setVisibleYears(prev => {
      const next = new Set(prev);
      if (next.has(year)) {
        next.delete(year);
      } else {
        next.add(year);
      }
      return next;
    });
  };

  const isCurrentYearVisible = visibleYears.has(currentYear);
  const isPriorYearVisible = visibleYears.has(priorYear);

  return (
    <div 
      ref={containerRef}
      style={{ width: "100%", display: "flex", flexDirection: "column", gap: "6px" }}
    >
      <svg 
        width="100%" 
        height={height} 
        style={{ display: "block", cursor: "pointer" }}
        viewBox={`0 0 ${actualWidth} ${height}`}
        preserveAspectRatio="none"
      >
        {/* Prior year daily data (light grey, opacity 0.25) - clickable */}
        {priorYearDailyPath && isPriorYearVisible && (
          <path 
            d={priorYearDailyPath} 
            fill="none" 
            stroke="#9ca3af" 
            strokeWidth={1}
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity={0.25}
            style={{ cursor: "pointer" }}
            onClick={() => toggleYear(priorYear)}
          />
        )}
        
        {/* Current year daily data (light purple, opacity 0.25) - clickable */}
        {currentYearDailyPath && isCurrentYearVisible && (
          <path 
            d={currentYearDailyPath} 
            fill="none" 
            stroke="#ad35fa" 
            strokeWidth={1}
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity={0.25}
            style={{ cursor: "pointer" }}
            onClick={() => toggleYear(currentYear)}
          />
        )}

        {/* Prior year 7-day average (darker grey, width 2) - clickable */}
        {priorYearAvgPath && isPriorYearVisible && (
          <path 
            d={priorYearAvgPath} 
            fill="none" 
            stroke="#9ca3af" 
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity={0.7}
            style={{ cursor: "pointer" }}
            onClick={() => toggleYear(priorYear)}
          />
        )}
        
        {/* Current year 7-day average (darker purple, width 2) - clickable */}
        {currentYearAvgPath && isCurrentYearVisible && (
          <path 
            d={currentYearAvgPath} 
            fill="none" 
            stroke="#ad35fa" 
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ cursor: "pointer" }}
            onClick={() => toggleYear(currentYear)}
          />
        )}
        
        {/* Current year end dot */}
        {currentYearLastPoint && isCurrentYearVisible && (
          <circle 
            cx={currentYearLastPoint.x} 
            cy={currentYearLastPoint.y} 
            r={3} 
            fill="#ad35fa"
            style={{ cursor: "pointer" }}
            onClick={() => toggleYear(currentYear)}
          />
        )}

        {/* Month labels */}
        {monthLabels.map((label, i) => {
          const x = padding.left + (monthDays[i] / 365) * chartWidth;
          // Only show labels that fit
          if (x < padding.left || x > actualWidth - padding.right - 4) return null;
          return (
            <text
              key={label + i}
              x={x}
              y={height - 4}
              fontSize="8"
              fill="var(--text-tertiary)"
              textAnchor="middle"
            >
              {label}
            </text>
          );
        })}
      </svg>

      {/* Legend - one entry per year that toggles both daily and moving average */}
      <div style={{ 
        display: "flex", 
        gap: "16px", 
        fontSize: "11px",
        alignItems: "center",
        justifyContent: "center"
      }}>
        {/* Prior year legend - clickable */}
        <div
          onClick={() => toggleYear(priorYear)}
          style={{ 
            display: "flex", 
            alignItems: "center", 
            gap: "6px", 
            cursor: "pointer",
            userSelect: "none",
            opacity: isPriorYearVisible ? 1 : 0.4,
            transition: "opacity 0.2s"
          }}
        >
          <div 
            style={{ 
              width: "24px", 
              height: "3px", 
              backgroundColor: "#9ca3af",
              borderRadius: "2px"
            }} 
          />
          <span style={{ color: "var(--text-primary)", fontWeight: 500 }}>{priorYear}</span>
        </div>

        {/* Current year legend - clickable */}
        <div
          onClick={() => toggleYear(currentYear)}
          style={{ 
            display: "flex", 
            alignItems: "center", 
            gap: "6px", 
            cursor: "pointer",
            userSelect: "none",
            opacity: isCurrentYearVisible ? 1 : 0.4,
            transition: "opacity 0.2s"
          }}
        >
          <div 
            style={{ 
              width: "24px", 
              height: "3px", 
              backgroundColor: "#ad35fa",
              borderRadius: "2px"
            }} 
          />
          <span style={{ color: "var(--text-primary)", fontWeight: 500 }}>{currentYear}</span>
        </div>
      </div>
    </div>
  );
}, (prevProps, nextProps) => {
  // Custom comparison function for memoization
  return (
    prevProps.data === nextProps.data &&
    prevProps.currentYear === nextProps.currentYear &&
    prevProps.priorYear === nextProps.priorYear &&
    prevProps.width === nextProps.width &&
    prevProps.height === nextProps.height
  );
});

function DashboardMetricsSection({ metrics, cityId, cityName, selectedDistrict = 0, leaders: propLeaders = [], shapefiles = [], onDistrictChange, onGPSLocation, onMetricClick, leaderFollowerCounts }: DashboardMetricsSectionProps) {
  const { getAccessTokenSilently } = useAuth0();
  
  // New state for explicit period selection
  type CurrentPeriodType = 'this_year' | 'this_month';
  type ComparisonPeriodType = 'last_year' | 'last_month';
  
  const [currentPeriodType, setCurrentPeriodType] = useState<CurrentPeriodType>('this_year');
  const [comparisonPeriodType, setComparisonPeriodType] = useState<ComparisonPeriodType>('last_year');
  
  // Derive ComparisonType from the two selections
  const selectedComparisonType = useMemo<ComparisonType>(() => {
    if (currentPeriodType === 'this_year' && comparisonPeriodType === 'last_year') {
      return 'ytd';
    } else if (currentPeriodType === 'this_month' && comparisonPeriodType === 'last_month') {
      return 'mtd';
    } else if (currentPeriodType === 'this_month' && comparisonPeriodType === 'last_year') {
      return 'mtd_prior_year';
    } else {
      // Fallback: this_year + last_month doesn't make sense, default to ytd
      // This shouldn't happen with proper validation, but handle gracefully
      return 'ytd';
    }
  }, [currentPeriodType, comparisonPeriodType]);
  const [ytdData, setYtdData] = useState<Record<number, { 
    lastYear: number | null; 
    thisYear: number | null; 
    loading: boolean;
    dataYear?: number;  // The year of the most recent data
    priorYear?: number; // The comparison year
    sparklineData?: SparklineDataPoint[]; // Time series data for sparkline (both years)
    dateRangeStart?: Date; // Start of current period
    dateRangeEnd?: Date; // End of current period (most recent data date)
    comparisonPeriodStart?: Date; // Start of comparison period (last year)
    comparisonPeriodEnd?: Date; // End of comparison period (last year)
    computedAt?: string; // When the comparison was last computed
    maxDataDate?: string; // Most recent data point date
  }>>({});
  const [loadingMetrics, setLoadingMetrics] = useState<Set<number>>(new Set());
  
  // Fetch leaders directly as backup if not passed via props
  const { data: fetchedLeaders } = useCityLeaders(cityId);
  
  // Use prop leaders if available, otherwise fallback to fetched leaders
  const leaders = propLeaders.length > 0 ? propLeaders : (fetchedLeaders || []);
  
  // Use selectedDistrict, defaulting to 0 (citywide) if not provided
  const district = selectedDistrict ?? 0;
  
  // Fetch metric ordering for this city
  const { data: orderingData } = useCityMetricOrdering(cityId);

  // Build ordering map from saved ordering data
  const orderingMap = useMemo(() => {
    const map = new Map<number, { categoryOrder: number; metricOrder: number; categoryName: string }>();
    if (orderingData?.orderings) {
      orderingData.orderings.forEach((o) => {
        if (o.metric_id) {
          map.set(o.metric_id, {
            categoryOrder: o.category_order,
            metricOrder: o.metric_order,
            categoryName: o.category_name,
          });
        }
      });
    }
    return map;
  }, [orderingData]);

  // Group and sort metrics by category using saved ordering
  const groupedMetrics = useMemo(() => {
    const grouped: Record<string, { metrics: MetricWithYTD[]; categoryOrder: number }> = {};
    
    metrics.forEach((metric) => {
      const ordering = orderingMap.get(metric.id);
      const category = ordering?.categoryName || metric.category || "Uncategorized";
      const categoryOrder = ordering?.categoryOrder ?? 1000;
      const metricOrder = ordering?.metricOrder ?? 1000;
      
      if (!grouped[category]) {
        grouped[category] = { metrics: [], categoryOrder };
      }
      // Update category order to match any metric in it (they should all have the same)
      grouped[category].categoryOrder = Math.min(grouped[category].categoryOrder, categoryOrder);
      
      grouped[category].metrics.push({
        id: metric.id,
        metric_name: metric.metric_name,
        category: metric.category,
        subcategory: metric.subcategory || null,
        most_recent_data_date: metric.most_recent_data_date,
        freshness: (metric as any).freshness,
        ytdLastYear: ytdData[metric.id]?.lastYear ?? null,
        ytdThisYear: ytdData[metric.id]?.thisYear ?? null,
        ytdLoading: ytdData[metric.id]?.loading ?? false,
        sparklineData: ytdData[metric.id]?.sparklineData ?? [],
        dateRangeStart: ytdData[metric.id]?.dateRangeStart,
        dateRangeEnd: ytdData[metric.id]?.dateRangeEnd,
        greendirection: metric.greendirection || "down", // Default: lower is better (e.g., crime)
        currentPeriodStart: ytdData[metric.id]?.dateRangeStart,
        currentPeriodEnd: ytdData[metric.id]?.dateRangeEnd,
        comparisonPeriodStart: ytdData[metric.id]?.comparisonPeriodStart,
        comparisonPeriodEnd: ytdData[metric.id]?.comparisonPeriodEnd,
        computedAt: ytdData[metric.id]?.computedAt,
        maxDataDate: metric.most_recent_data_date || ytdData[metric.id]?.maxDataDate || undefined,
        display_unit: (metric as any).display_unit || null, // "percentage", "currency", etc.
        metricOrder, // Store for sorting
      } as MetricWithYTD & { metricOrder: number });
    });

    // Sort categories by their order, then alphabetically
    const sortedCategories = Object.keys(grouped).sort((a, b) => {
      const orderA = grouped[a].categoryOrder;
      const orderB = grouped[b].categoryOrder;
      if (orderA !== orderB) return orderA - orderB;
      return a.localeCompare(b);
    });
    
    // Sort metrics within each category by their metric order, then by name
    const result: Record<string, MetricWithYTD[]> = {};
    sortedCategories.forEach((category) => {
      result[category] = grouped[category].metrics.sort((a, b) => {
        const orderA = (a as any).metricOrder ?? 1000;
        const orderB = (b as any).metricOrder ?? 1000;
        if (orderA !== orderB) return orderA - orderB;
        return a.metric_name.localeCompare(b.metric_name);
      });
    });

    return { grouped: result, sortedCategories };
  }, [metrics, ytdData, orderingMap]);

  // Fetch precomputed comparisons for all metrics using batch endpoint
  const metricIds = useMemo(() => 
    metrics.map((m) => m.id).filter((id): id is number => !!id),
    [metrics]
  );
  
  const { 
    data: batchComparisons, 
    isLoading: comparisonsLoading,
    isError: comparisonsError,
    error: comparisonsErrorDetail
  } = useBatchComparisons(
    metricIds.length > 0
      ? {
          metric_ids: metricIds,
          // Send null for citywide (district=0), backend stores citywide as district=NULL
          district: district === 0 ? null : district,
          comparison_types: [selectedComparisonType],
        }
      : null
  );

  // Load sparkline data for metrics (still need time series for sparklines)
  const loadSparklineData = useCallback(async (metricId: number) => {
    const token = await getAccessTokenSilently();
    const now = new Date();
    const currentYear = now.getFullYear();
    const priorYear = currentYear - 1;
    
    try {
      // Request only base charts (no group_field) for the selected district
      // Backend will filter by district and exclude group_field charts
      let timeSeries = await getAdminMetricTimeSeries(metricId, token, {
        district: district,
        exclude_group_fields: true  // Only get base charts, not group field charts
      });
      
      // If no chart found for selected district, fallback to citywide
      if (timeSeries.time_series.length === 0 && district !== 0) {
        timeSeries = await getAdminMetricTimeSeries(metricId, token, {
          district: 0,
          exclude_group_fields: true
        });
      }
      
      // Sort by period_type preference (prefer day for YTD sparklines)
      const activeSeries = timeSeries.time_series
        .sort((a, b) => {
          const periodPriority: Record<string, number> = { day: 0, week: 1, month: 2, year: 3 };
          const aPriority = periodPriority[a.period_type] ?? 99;
          const bPriority = periodPriority[b.period_type] ?? 99;
          return aPriority - bPriority;
        })[0];

      if (!activeSeries) return [];

      const detail = await getAdminMetricTimeSeriesDetail(metricId, activeSeries.chart_id, token);
      if (!detail.data || detail.data.length === 0) return [];

      const sparklineData: SparklineDataPoint[] = [];
      detail.data.forEach((point) => {
        const parsed = parseLocalDate(point.time_period);
        if (parsed.year === currentYear || parsed.year === priorYear) {
          const startOfYear = new Date(parsed.year, 0, 1);
          const pointDate = new Date(parsed.year, parsed.month, parsed.day);
          const dayOfYear = Math.floor((pointDate.getTime() - startOfYear.getTime()) / (1000 * 60 * 60 * 24)) + 1;
          sparklineData.push({ day: dayOfYear, value: point.numeric_value, year: parsed.year });
        }
      });
      return sparklineData;
    } catch (error) {
      console.error(`Error loading sparkline data for metric ${metricId}:`, error);
      return [];
    }
  }, [getAccessTokenSilently, district]);

  // Fallback: Calculate YTD on-demand if precomputed not available
  const calculateYTD = useCallback(async (metricId: number) => {
    const token = await getAccessTokenSilently();
    const now = new Date();
    const currentYear = now.getFullYear();
    const priorYear = currentYear - 1;
    
    setYtdData((prev) => ({
      ...prev,
      [metricId]: { ...prev[metricId], loading: true },
    }));

    try {
      // Request only base charts (no group_field) for the selected district
      // Backend will filter by district and exclude group_field charts
      let timeSeries = await getAdminMetricTimeSeries(metricId, token, {
        district: district,
        exclude_group_fields: true  // Only get base charts, not group field charts
      });
      
      // If no chart found for selected district, fallback to citywide
      if (timeSeries.time_series.length === 0 && district !== 0) {
        timeSeries = await getAdminMetricTimeSeries(metricId, token, {
          district: 0,
          exclude_group_fields: true
        });
      }
      
      // Sort by period_type preference (prefer day for YTD sparklines)
      const activeSeries = timeSeries.time_series
        .sort((a, b) => {
          const periodPriority: Record<string, number> = { day: 0, week: 1, month: 2, year: 3 };
          const aPriority = periodPriority[a.period_type] ?? 99;
          const bPriority = periodPriority[b.period_type] ?? 99;
          return aPriority - bPriority;
        })[0];

      if (!activeSeries) {
        setYtdData((prev) => ({
          ...prev,
          [metricId]: { lastYear: null, thisYear: null, loading: false, dataYear: currentYear, priorYear },
        }));
        return;
      }

      const detail = await getAdminMetricTimeSeriesDetail(metricId, activeSeries.chart_id, token);
      if (!detail.data || detail.data.length === 0) {
        setYtdData((prev) => ({
          ...prev,
          [metricId]: { lastYear: null, thisYear: null, loading: false, dataYear: currentYear, priorYear },
        }));
        return;
      }

      // Build sparkline data
      const sparklineData: SparklineDataPoint[] = [];
      detail.data.forEach((point) => {
        const parsed = parseLocalDate(point.time_period);
        if (parsed.year === currentYear || parsed.year === priorYear) {
          const startOfYear = new Date(parsed.year, 0, 1);
          const pointDate = new Date(parsed.year, parsed.month, parsed.day);
          const dayOfYear = Math.floor((pointDate.getTime() - startOfYear.getTime()) / (1000 * 60 * 60 * 24)) + 1;
          sparklineData.push({ day: dayOfYear, value: point.numeric_value, year: parsed.year });
        }
      });

      // Find most recent data point
      let mostRecentInCurrentYear = { year: 0, month: 0, day: 0 };
      detail.data.forEach((point) => {
        const parsed = parseLocalDate(point.time_period);
        if (parsed.year !== currentYear) return;
        if (
          parsed.month > mostRecentInCurrentYear.month ||
          (parsed.month === mostRecentInCurrentYear.month && parsed.day > mostRecentInCurrentYear.day)
        ) {
          mostRecentInCurrentYear = parsed;
        }
      });

      const hasCurrentYearData = mostRecentInCurrentYear.year === currentYear || mostRecentInCurrentYear.month > 0 || mostRecentInCurrentYear.day > 0;
      if (!hasCurrentYearData) {
        setYtdData((prev) => ({
          ...prev,
          [metricId]: { lastYear: null, thisYear: null, loading: false, dataYear: currentYear, priorYear, sparklineData: [] },
        }));
        return;
      }

      const cutoffMonth = mostRecentInCurrentYear.month;
      const cutoffDay = mostRecentInCurrentYear.day;
      const periodType = activeSeries.period_type;

      let thisYearYTD = 0;
      let lastYearYTD = 0;

      if (periodType === "month" || periodType === "year") {
        thisYearYTD = detail.data
          .filter((point) => {
            const parsed = parseLocalDate(point.time_period);
            return parsed.year === currentYear && parsed.month <= cutoffMonth;
          })
          .reduce((sum, point) => sum + point.numeric_value, 0);

        lastYearYTD = detail.data
          .filter((point) => {
            const parsed = parseLocalDate(point.time_period);
            return parsed.year === priorYear && parsed.month <= cutoffMonth;
          })
          .reduce((sum, point) => sum + point.numeric_value, 0);
      } else {
        thisYearYTD = detail.data
          .filter((point) => {
            const parsed = parseLocalDate(point.time_period);
            if (parsed.year !== currentYear) return false;
            if (parsed.month < cutoffMonth) return true;
            return parsed.month === cutoffMonth && parsed.day <= cutoffDay;
          })
          .reduce((sum, point) => sum + point.numeric_value, 0);

        lastYearYTD = detail.data
          .filter((point) => {
            const parsed = parseLocalDate(point.time_period);
            if (parsed.year !== priorYear) return false;
            if (parsed.month < cutoffMonth) return true;
            return parsed.month === cutoffMonth && parsed.day <= cutoffDay;
          })
          .reduce((sum, point) => sum + point.numeric_value, 0);
      }

      const dateRangeStart = new Date(currentYear, 0, 1);
      const dateRangeEnd = new Date(currentYear, cutoffMonth, cutoffDay);

      setYtdData((prev) => ({
        ...prev,
        [metricId]: {
          lastYear: lastYearYTD || null,
          thisYear: thisYearYTD || null,
          loading: false,
          dataYear: currentYear,
          priorYear,
          sparklineData,
          dateRangeStart,
          dateRangeEnd,
          maxDataDate: dateRangeEnd.toISOString().split("T")[0],
        },
      }));
    } catch (error) {
      console.error(`Error calculating YTD for metric ${metricId}:`, error);
      setYtdData((prev) => ({
        ...prev,
        [metricId]: { lastYear: null, thisYear: null, loading: false, dataYear: currentYear, priorYear, sparklineData: [] },
      }));
    }
  }, [getAccessTokenSilently, district]);

  // Lazy load metrics - only load first 4 initially, then load more as needed
  const [visibleMetricIds, setVisibleMetricIds] = useState<Set<number>>(new Set());
  const metricRefs = useRef<Map<number, HTMLElement>>(new Map());
  
  // Update metric refs from data attributes (since MetricLink renders as <a> which doesn't support ref)
  useEffect(() => {
    const metricElements = document.querySelectorAll('[data-metric-id]');
    metricRefs.current.clear();
    metricElements.forEach((el) => {
      const metricId = parseInt(el.getAttribute('data-metric-id') || '0', 10);
      if (metricId > 0) {
        metricRefs.current.set(metricId, el as HTMLElement);
      }
    });
  }, [metrics.map(m => m.id).join(',')]);

  // Intersection Observer for lazy loading
  useEffect(() => {
    if (metricIds.length === 0) {
      setVisibleMetricIds(new Set());
      return;
    }

    // Initially load first 4 metrics only
    const initialMetrics = metricIds.slice(0, 4);
    setVisibleMetricIds(new Set(initialMetrics));

    let observer: IntersectionObserver | null = null;

    // Set up observer after a brief delay to ensure refs are set
    const timeoutId = setTimeout(() => {
      observer = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              const metricId = parseInt(entry.target.getAttribute('data-metric-id') || '0', 10);
              if (metricId && metricIds.includes(metricId)) {
                setVisibleMetricIds((prev) => {
                  // Only add if not already in the set
                  if (prev.has(metricId)) return prev;
                  return new Set([...prev, metricId]);
                });
              }
            }
          });
        },
        {
          rootMargin: '200px', // Start loading 200px before visible
          threshold: 0.1,
        }
      );

      // Observe all metric cards - query by data attribute since refs are set via useEffect
      const metricElements = document.querySelectorAll('[data-metric-id]');
      metricElements.forEach((el) => {
        observer!.observe(el);
      });
    }, 100);

    return () => {
      clearTimeout(timeoutId);
      if (observer) {
        observer.disconnect();
      }
    };
  }, [metricIds.join(',')]);

  // Load YTD data only for visible metrics (FALLBACK ONLY - batch comparisons are preferred)
  // Only use this fallback if batch comparisons fail or are unavailable
  useEffect(() => {
    if (visibleMetricIds.size === 0) return;
    
    // Skip individual calculations if we have batch comparison data or it's loading
    if (batchComparisons || comparisonsLoading) return;
    
    // Only calculate individually if batch comparisons failed
    if (!comparisonsError) return;

    const metricsToCalculate = Array.from(visibleMetricIds).filter((id) => {
      const existing = ytdData[id];
      return !existing || existing.loading === undefined;
    });

    if (metricsToCalculate.length === 0) return;

    // Batch load - limit concurrent requests
    const BATCH_SIZE = 4;
    const batches: number[][] = [];
    for (let i = 0; i < metricsToCalculate.length; i += BATCH_SIZE) {
      batches.push(metricsToCalculate.slice(i, i + BATCH_SIZE));
    }

    // Load batches with slight delay between batches
    batches.forEach((batch, batchIndex) => {
      setTimeout(() => {
        batch.forEach((metricId) => {
          calculateYTD(metricId);
        });
      }, batchIndex * 100); // 100ms delay between batches
    });
  }, [visibleMetricIds, calculateYTD, batchComparisons, comparisonsLoading, comparisonsError]);

  // Clear data when district or comparison type changes so we reload with the correct data
  useEffect(() => {
    setYtdData({});
    setVisibleMetricIds(new Set());
  }, [district, selectedComparisonType]);

  // If batch comparisons become available, use them to update the data
  // Note: Only depend on batchComparisons and selectedComparisonType
  // district is not needed because batchComparisons is already filtered for the current district
  useEffect(() => {
    if (!batchComparisons || Object.keys(batchComparisons).length === 0) return;

    const now = new Date();
    const currentYear = now.getFullYear();
    const priorYear = currentYear - 1;
    
    const updates: Record<number, Partial<typeof ytdData[number]>> = {};
    
    Object.entries(batchComparisons).forEach(([metricIdStr, comparisons]) => {
      const metricId = parseInt(metricIdStr, 10);
      const comparisonsTyped = comparisons as Record<ComparisonType, ComparisonResponse>;
      const comparison = comparisonsTyped[selectedComparisonType];
      
      if (comparison) {
        updates[metricId] = {
          lastYear: comparison.comparison_period_value ?? null,
          thisYear: comparison.current_period_value ?? null,
          loading: false,
          dataYear: currentYear,
          priorYear,
          dateRangeStart: comparison.current_period_start ? new Date(comparison.current_period_start) : undefined,
          dateRangeEnd: comparison.current_period_end ? new Date(comparison.current_period_end) : undefined,
          comparisonPeriodStart: comparison.comparison_period_start ? new Date(comparison.comparison_period_start) : undefined,
          comparisonPeriodEnd: comparison.comparison_period_end ? new Date(comparison.comparison_period_end) : undefined,
          computedAt: comparison.computed_at,
          maxDataDate: comparison.current_period_end, // Use current period end as the max data date
          sparklineData: ytdData[metricId]?.sparklineData || [], // Preserve existing sparkline data
        };
      }
    });
    
    if (Object.keys(updates).length > 0) {
      setYtdData((prev) => {
        const updated = { ...prev };
        Object.entries(updates).forEach(([metricIdStr, data]) => {
          const metricId = parseInt(metricIdStr, 10);
          updated[metricId] = { ...prev[metricId], ...data };
        });
        return updated;
      });
    }
  }, [batchComparisons, selectedComparisonType]);

  // Determine the most common years from loaded data for column headers
  // Always display current calendar year vs prior year
  const displayYears = useMemo(() => {
    const now = new Date();
    return { dataYear: now.getFullYear(), priorYear: now.getFullYear() - 1 };
  }, []);

  // Helper to format date as "Jan 1 - Jan 12"
  const formatPeriodDate = (start?: Date, end?: Date) => {
    if (!start || !end) return null;
    const startStr = start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const endStr = end.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    return `${startStr} - ${endStr}`;
  };

  // Find the currently selected leader based on district
  const selectedLeader = useMemo(() => {
    if (!leaders || leaders.length === 0) return null;
    
    // For citywide (district = 0 or null), find leader with no district (Mayor, etc.)
    if (district === 0 || district === null) {
      return leaders.find(l => l.district === null || l.district === undefined || l.district === 0) || null;
    }
    
    // For specific district, find the matching leader
    return leaders.find(l => l.district === district) || null;
  }, [leaders, district]);

  // Build the dashboard title based on selected leader
  const dashboardTitle = useMemo(() => {
    if (selectedLeader) {
      const districtText = selectedLeader.district 
        ? `District ${selectedLeader.district}` 
        : "Citywide";
      return `${selectedLeader.title}: ${selectedLeader.name} - ${districtText} Dashboard`;
    }
    if (district === 0 || district === null) {
      return "Citywide Dashboard";
    }
    return `District ${district} Dashboard`;
  }, [selectedLeader, district]);

  // Get label for comparison type
  const getComparisonTypeLabel = (type: ComparisonType): string => {
    switch (type) {
      case 'ytd':
        return 'YTD';
      case 'mtd':
        return 'MTD';
      case 'mtd_prior_year':
        return 'MTD vs Prior';
      default:
        return type;
    }
  };

  // Get column headers based on comparison type
  const getColumnHeaders = useMemo(() => {
    const now = new Date();
    const currentYear = now.getFullYear();
    const priorYear = currentYear - 1;
    const currentMonth = now.toLocaleDateString('en-US', { month: 'short' });
    
    // Get prior month
    const priorMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const priorMonth = priorMonthDate.toLocaleDateString('en-US', { month: 'short' });
    const priorMonthYear = priorMonthDate.getFullYear();
    
    switch (selectedComparisonType) {
      case 'ytd':
        return {
          current: `${currentYear} YTD`,
          comparison: `${priorYear} YTD`,
        };
      case 'mtd':
        return {
          current: `${currentMonth} ${currentYear}`,
          comparison: `${priorMonth} ${priorMonthYear}`,
        };
      case 'mtd_prior_year':
        return {
          current: `${currentMonth} ${currentYear}`,
          comparison: `${currentMonth} ${priorYear}`,
        };
      default:
        return {
          current: `${currentYear}`,
          comparison: `${priorYear}`,
        };
    }
  }, [selectedComparisonType]);

  // Get the most recent computed date from all metrics (from batch comparison API)
  const lastComputedAt = useMemo(() => {
    const computedTimes = Object.values(ytdData)
      .map(d => d.computedAt)
      .filter((t): t is string => !!t);
    
    if (computedTimes.length === 0) return null;
    
    // Get the most recent timestamp
    const mostRecent = computedTimes.sort((a, b) => 
      new Date(b).getTime() - new Date(a).getTime()
    )[0];
    
    try {
      const date = new Date(mostRecent);
      // Format to user's local timezone - date only
      return date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric'
      });
    } catch {
      return null;
    }
  }, [ytdData]);

  // Get labels for dropdown options with dates
  const currentPeriodOptions = useMemo(() => {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.toLocaleDateString('en-US', { month: 'short' });
    return [
      { value: 'this_year' as CurrentPeriodType, label: `this year (${currentYear})` },
      { value: 'this_month' as CurrentPeriodType, label: `this month (${currentMonth} ${currentYear})` },
    ];
  }, []);

  const comparisonPeriodOptions = useMemo(() => {
    const now = new Date();
    const lastYear = now.getFullYear() - 1;
    const lastMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastMonth = lastMonthDate.toLocaleDateString('en-US', { month: 'short' });
    const lastMonthYear = lastMonthDate.getFullYear();
    return [
      { value: 'last_year' as ComparisonPeriodType, label: `last year (${lastYear})` },
      { value: 'last_month' as ComparisonPeriodType, label: `last month (${lastMonth} ${lastMonthYear})` },
    ];
  }, []);

  if (!metrics || metrics.length === 0) {
    return (
      <div className="dashboard-section">
        <h2>Metrics</h2>
        <div className="ytd-placeholder">
          <p>No metrics defined for this city.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="dashboard-section">
      {/* Official Selector Header - Using DistrictNavigation Component */}
      <div className="dashboard-header">
        {leaders && leaders.length > 0 && onDistrictChange ? (
          <div className="dashboard-district-navigation">
            <DistrictNavigation
              selectedDistrict={district}
              leaders={leaders}
              shapefiles={shapefiles}
              onDistrictSelect={(newDistrict) => {
                onDistrictChange(newDistrict);
              }}
              onGPSLocation={onGPSLocation}
              leaderFollowerCounts={leaderFollowerCounts}
              cityId={cityId}
              publicPagePath={cityName ? `/c/${slugify(cityName)}` : undefined}
            />
          </div>
        ) : (
          <h2 className="dashboard-title">{dashboardTitle}</h2>
        )}
      </div>

      {/* Comparison Type Selector */}
      <div className="dashboard-comparison-selector">
        <div className="comparison-selector-content">
          <span className="comparison-selector-label">Comparing data so far</span>
          <select
            className="comparison-selector-dropdown"
            value={currentPeriodType}
            onChange={(e) => {
              const newCurrent = e.target.value as CurrentPeriodType;
              setCurrentPeriodType(newCurrent);
              // Auto-adjust comparison period if needed to maintain valid combination
              // this_year can only compare with last_year
              if (newCurrent === 'this_year' && comparisonPeriodType === 'last_month') {
                setComparisonPeriodType('last_year');
              }
            }}
            aria-label="Select current period"
          >
            {currentPeriodOptions.map(option => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <span className="comparison-selector-label">with</span>
          <select
            className="comparison-selector-dropdown"
            value={comparisonPeriodType}
            onChange={(e) => {
              const newComparison = e.target.value as ComparisonPeriodType;
              setComparisonPeriodType(newComparison);
              // Auto-adjust current period if needed to maintain valid combination
              // last_month can only compare with this_month
              if (currentPeriodType === 'this_year' && newComparison === 'last_month') {
                setCurrentPeriodType('this_month');
              }
            }}
            aria-label="Select comparison period"
          >
            {comparisonPeriodOptions.map(option => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </div>
      
      <div className="metrics-table-container">
        {groupedMetrics.sortedCategories.map((category) => {
          // Filter metrics with valid data
          const metricsWithData = groupedMetrics.grouped[category].filter((metric) => {
            return (metric.ytdThisYear !== null && metric.ytdThisYear !== undefined) ||
                   (metric.ytdLastYear !== null && metric.ytdLastYear !== undefined);
          });
          
          // Skip empty categories
          if (metricsWithData.length === 0) return null;
          
          // Group metrics by subcategory within this category
          const subcategoryGroups: { subcategory: string | null; metrics: typeof metricsWithData }[] = [];
          const subcategoryMap = new Map<string | null, typeof metricsWithData>();
          
          metricsWithData.forEach((metric) => {
            const subcat = metric.subcategory || null;
            if (!subcategoryMap.has(subcat)) {
              subcategoryMap.set(subcat, []);
            }
            subcategoryMap.get(subcat)!.push(metric);
          });
          
          // Convert to array and sort (null subcategory first, then alphabetically)
          subcategoryMap.forEach((metrics, subcategory) => {
            subcategoryGroups.push({ subcategory, metrics });
          });
          subcategoryGroups.sort((a, b) => {
            if (a.subcategory === null && b.subcategory === null) return 0;
            if (a.subcategory === null) return -1;
            if (b.subcategory === null) return 1;
            return a.subcategory.localeCompare(b.subcategory);
          });
          
          // Determine if we should show subcategory headers
          // Show if there's more than one subcategory OR if there's exactly one non-null subcategory
          const hasMultipleSubcategories = subcategoryGroups.length > 1;
          const hasSingleNamedSubcategory = subcategoryGroups.length === 1 && subcategoryGroups[0].subcategory !== null;
          const showSubcategoryHeaders = hasMultipleSubcategories || hasSingleNamedSubcategory;
          
          return (
            <div key={category} className="metrics-category-section">
              {/* Table header row */}
              <div className="metrics-table-header">
                <div className="metric-col metric-col-name">{category}</div>
                <div className="metric-col metric-col-value">{getColumnHeaders.comparison}</div>
                <div className="metric-col metric-col-value">{getColumnHeaders.current}</div>
                <div className="metric-col metric-col-change">Change</div>
              </div>
              
              {/* Metric rows grouped by subcategory */}
              <div className="metrics-table-body">
                {subcategoryGroups.map((group) => (
                  <React.Fragment key={group.subcategory || 'uncategorized'}>
                    {/* Subcategory header - only show if we have subcategories to display */}
                    {showSubcategoryHeaders && group.subcategory && (
                      <div className="metrics-subcategory-header">
                        <span className="metrics-subcategory-title">{group.subcategory}</span>
                      </div>
                    )}
                    
                    {group.metrics.map((metric) => {
                      // Calculate delta and absolute difference
                      const hasValidData = metric.ytdThisYear !== null && metric.ytdLastYear !== null && 
                        metric.ytdThisYear !== undefined && metric.ytdLastYear !== undefined;
                      
                      const absoluteDiff = hasValidData ? metric.ytdThisYear! - metric.ytdLastYear! : null;
                      const percentDelta = hasValidData && metric.ytdLastYear !== 0
                        ? ((metric.ytdThisYear! - metric.ytdLastYear!) / metric.ytdLastYear!) * 100
                        : null;
                      
                      // Determine if this is "good" or "bad" based on greendirection
                      // greendirection="up" means increase is good (green), decrease is bad (red)
                      // greendirection="down" means decrease is good (green), increase is bad (red)
                      const isIncrease = absoluteDiff !== null && absoluteDiff > 0;
                      const isDecrease = absoluteDiff !== null && absoluteDiff < 0;
                      const isGood = metric.greendirection === "up" ? isIncrease : isDecrease;
                      const isBad = metric.greendirection === "up" ? isDecrease : isIncrease;
                      
                      // Don't color the change if percent change is between -5% and 5%
                      const isSmallChange = percentDelta !== null && Math.abs(percentDelta) <= 5;
                      const changeColorClass = isSmallChange ? 'neutral' : (isGood ? 'good' : isBad ? 'bad' : 'neutral');
                      
                      // Format date ranges for each period
                      const currentPeriodDates = formatPeriodDate(metric.currentPeriodStart, metric.currentPeriodEnd);
                      const comparisonPeriodDates = formatPeriodDate(metric.comparisonPeriodStart, metric.comparisonPeriodEnd);

                      // Format metadata dates (only max data date now, computed is at dashboard level)
                      const formatMetadataDate = (dateStr?: string) => {
                        if (!dateStr) return null;
                        try {
                          const date = new Date(dateStr);
                          return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
                        } catch {
                          return null;
                        }
                      };

                      const maxDataDateFormatted = formatMetadataDate(metric.maxDataDate);
                      const citySlug = cityName ? slugify(cityName) : `city-${cityId}`;

                      return (
                        <MetricLink
                          key={metric.id}
                          metricId={metric.id}
                          metricKey={metric.metric_key}
                          citySlug={citySlug}
                          className="metrics-table-row metrics-table-row-clickable"
                          prefetch={false}
                          mode="modal"
                          district={district}
                          onModalOpen={onMetricClick}
                          {...{ "data-metric-id": metric.id.toString() }}
                        >
                          {/* Metric name column */}
                          <div className="metric-col metric-col-name">
                            <div style={{ display: 'flex', flexDirection: 'column' }}>
                              <span className="metric-name">{metric.metric_name}</span>
                              {maxDataDateFormatted && (
                                <div className="metric-metadata">
                                  <span title="Data through this date">
                                    Through: {maxDataDateFormatted}
                                  </span>
                                </div>
                              )}
                            </div>
                          </div>
                          
                          {/* Last year value column */}
                          <div className="metric-col metric-col-value">
                            {metric.ytdLoading ? (
                              <Loader size="sm" color="dark" />
                            ) : (
                              <>
                                <span className="metric-date-label">{comparisonPeriodDates || `Jan 1 - Jan ${displayYears.priorYear}`}</span>
                                <span className="metric-value">
                                  {formatMetricValue(metric.ytdLastYear, metric.display_unit)}
                                </span>
                              </>
                            )}
                          </div>
                          
                          {/* This year value column */}
                          <div className="metric-col metric-col-value">
                            {metric.ytdLoading ? (
                              <Loader size="sm" color="dark" />
                            ) : (
                              <>
                                <span className="metric-date-label">{currentPeriodDates || `Jan 1 - Jan ${displayYears.dataYear}`}</span>
                                <span className="metric-value">
                                  {formatMetricValue(metric.ytdThisYear, metric.display_unit)}
                                </span>
                              </>
                            )}
                          </div>
                          
                          {/* Change column */}
                          <div className="metric-col metric-col-change">
                            {metric.ytdLoading ? (
                              <Loader size="sm" color="dark" />
                            ) : hasValidData ? (
                              <div className={`change-indicator ${changeColorClass}`}>
                                <span className="change-arrow">
                                  {isIncrease ? "↑" : isDecrease ? "↓" : "—"}
                                </span>
                                <div className="change-values">
                                  {metric.display_unit === "percentage" ? (
                                    // For percentage metrics, show percentage point change only
                                    <span className="change-absolute">
                                      {absoluteDiff !== null ? (absoluteDiff > 0 ? "+" : "") + absoluteDiff.toFixed(1) + " pts" : "—"}
                                    </span>
                                  ) : (
                                    // For count/other metrics, show absolute and percent change
                                    <>
                                      <span className="change-absolute">
                                        {absoluteDiff !== null ? (absoluteDiff > 0 ? "+" : "") + Math.round(absoluteDiff).toLocaleString() : "—"}
                                      </span>
                                      <span className="change-percent">
                                        {percentDelta !== null ? (percentDelta > 0 ? "+" : "") + Math.round(percentDelta) + "%" : "—"}
                                      </span>
                                    </>
                                  )}
                                </div>
                              </div>
                            ) : (
                              <span className="change-na">—</span>
                            )}
                          </div>
                        </MetricLink>
                      );
                    })}
                  </React.Fragment>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function CityView({ cityId, isAdmin, gpsLocation, initialDistrict }: CityViewProps) {
  const [activeTab, setActiveTab] = useState<TabType>("dashboard"); // Default to dashboard tab
  const [saving, setSaving] = useState(false);
  const [headerVisible, setHeaderVisible] = useState(true);
  const [lastScrollY, setLastScrollY] = useState(0);
  const [metricDateRange, setMetricDateRange] = useState<MetricDateRange>(
    getPresetMetricDateRange("last_week")
  );
  // Use initialDistrict if provided, otherwise default to 0 (mayor/citywide)
  const [selectedDistrict, setSelectedDistrict] = useState<number | null>(initialDistrict ?? 0);
  const [districtGPSLocation, setDistrictGPSLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [mapLeaders, setMapLeaders] = useState<any[]>([]);
  const [mapShapefiles, setMapShapefiles] = useState<any[]>([]);
  const [selectedAnomaly, setSelectedAnomaly] = useState<AnomalyResult | null>(null);
  const [selectedMetricId, setSelectedMetricId] = useState<number | null>(null);
  const [selectedMetricDistrict, setSelectedMetricDistrict] = useState<number | null>(null);
  const mapTabRef = useRef<HTMLDivElement | null>(null);
  const [isCityDataReady, setIsCityDataReady] = useState(false);
  const previousCityIdRef = useRef<number | null>(null);

  // Anomaly selection handler - accepts null to clear selection
  const handleAnomalySelect = useCallback((anomaly: AnomalyResult | null) => {
    setSelectedAnomaly(anomaly);
    // If selecting an anomaly and not on map tab, switch to it
    if (anomaly && activeTab !== "map") {
      setActiveTab("map");
    }
  }, [activeTab]);

  // Use React Query hooks for data fetching - these handle caching automatically
  const { data: cityData, isLoading: loadingCity, error: cityError } = useCity(cityId);
  const { data: savedCities = [], isLoading: loadingSaved } = useSavedCities();
  const { data: leaderFollowerCounts } = useRepresentativeFollowerCounts(cityId);
  
  // Mutations for save/unsave
  const saveCityMutation = useSaveCity();
  const unsaveCityMutation = useUnsaveCity();

  // Determine if current city is saved
  const isCitySaved = useMemo(() => {
    return savedCities.some((city) => city.id === cityId);
  }, [savedCities, cityId]);

  // Set default date range when city data loads
  // Default to "last week" for Map Panel instead of calculating from metrics
  useEffect(() => {
    if (cityData?.metrics && cityData.metrics.length > 0) {
      // Use "last week" preset instead of calculating custom date range
      setMetricDateRange(getPresetMetricDateRange("last_week"));
    } else {
      // Reset to "last week" when switching cities or if no metrics
      setMetricDateRange(getPresetMetricDateRange("last_week"));
    }
  }, [cityData?.metrics, cityId]);

  // Clear old city data immediately when cityId changes
  useEffect(() => {
    if (previousCityIdRef.current !== null && previousCityIdRef.current !== cityId) {
      // City is switching - clear old data immediately
      setMapLeaders([]);
      setMapShapefiles([]);
      setIsCityDataReady(false);
      setSelectedDistrict(initialDistrict ?? 0);
      setDistrictGPSLocation(null);
    }
    previousCityIdRef.current = cityId;
  }, [cityId, initialDistrict]);

  // Update selected district when cityId or initialDistrict changes
  useEffect(() => {
    if (initialDistrict !== undefined) {
      setSelectedDistrict(initialDistrict ?? 0);
    }
  }, [cityId, initialDistrict]);

  // Listen for saved cities changes (from other components)
  useEffect(() => {
    const handleSavedCitiesChanged = () => {
      // React Query will automatically refetch saved cities when cache is invalidated
      // No manual refetch needed
    };

    window.addEventListener(SAVED_CITIES_CHANGED_EVENT, handleSavedCitiesChanged);
    return () => {
      window.removeEventListener(SAVED_CITIES_CHANGED_EVENT, handleSavedCitiesChanged);
    };
  }, []);

  // Handle scroll to hide/show header on mobile in map view
  useEffect(() => {
    if (activeTab !== "map" || !mapTabRef.current) return;

    const handleScroll = () => {
      // Only apply scroll behavior on narrow screens (mobile)
      if (window.innerWidth > 768) {
        setHeaderVisible(true);
        return;
      }

      const currentScrollY = window.scrollY;
      const scrollThreshold = 10; // Small threshold to prevent jitter

      if (currentScrollY > lastScrollY && currentScrollY > scrollThreshold) {
        // Scrolling down - hide header
        setHeaderVisible(false);
      } else if (currentScrollY < lastScrollY) {
        // Scrolling up - show header
        setHeaderVisible(true);
      }

      setLastScrollY(currentScrollY);
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", handleScroll);
    };
  }, [activeTab, lastScrollY]);

  const handleToggleSave = async () => {
    try {
      setSaving(true);
      
      if (isCitySaved) {
        await unsaveCityMutation.mutateAsync(cityId);
      } else {
        await saveCityMutation.mutateAsync(cityId);
      }
      
      // Emit event for other components (React Query cache invalidation handles the rest)
      emitSavedCitiesChanged();
    } catch (err: any) {
      console.error("Error toggling save city:", err);
      alert("Failed to update saved status. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const loading = loadingCity || loadingSaved;
  const error = cityError ? (cityError as Error).message : null;

  if (loading) {
    return (
      <div className="city-view-loading" style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "12px", padding: "40px" }}>
        <Loader size="sm" color="dark" />
        <span>Loading city data...</span>
      </div>
    );
  }

  if (error && !cityData) {
    return (
      <div className="city-view-error">
        <p>Error loading city data: {error}</p>
        <button onClick={() => window.location.reload()} className="retry-button">
          Retry
        </button>
      </div>
    );
  }

  if (!cityData) {
    return null;
  }

  return (
    <div className={`city-view ${activeTab === "map" ? "map-view-active" : "tab-view-active"}`}>
      {/* Map Tab - Full Screen with Overlays */}
      {activeTab === "map" && (
        <div 
          ref={mapTabRef}
          className={`tab-content active map-tab-fullscreen ${headerVisible ? "header-visible" : "header-hidden"}`}
          id="map-tab"
        >
          <CityMapView
            cityId={cityId}
            isAdmin={isAdmin}
            cityData={cityData}
            metricDateRange={metricDateRange}
            gpsLocation={districtGPSLocation || gpsLocation}
            selectedDistrict={selectedDistrict}
            onDistrictChange={setSelectedDistrict}
            onDataReady={(data) => {
              setMapLeaders(data.leaders);
              setMapShapefiles(data.shapefiles);
              setIsCityDataReady(true);
            }}
            selectedAnomaly={selectedAnomaly}
            onAnomalyClear={() => setSelectedAnomaly(null)}
          />
          
          {/* Header Overlay */}
          <CityHeader
            emoji={cityData.emoji || undefined}
            name={cityData.name}
            isCitySaved={isCitySaved}
            saving={saving}
            onToggleSave={handleToggleSave}
            metricDateRange={metricDateRange}
            onMetricDateRangeChange={setMetricDateRange}
            variant="overlay"
            visible={headerVisible}
            showDateRange={false}
            cityId={cityId}
            selectedDistrict={selectedDistrict}
            selectedAnomaly={selectedAnomaly}
            onAnomalySelect={handleAnomalySelect}
            mapOnly={true}
          />

          {/* Tabs Overlay */}
          <div className={`tabs-container-overlay ${headerVisible ? "visible" : "hidden"}`}>
            <button
              className="tab-btn active"
              onClick={() => setActiveTab("map")}
            >
              Map
            </button>
            <button
              className="tab-btn"
              onClick={() => setActiveTab("dashboard")}
            >
              Dashboard
            </button>
            <button
              className="tab-btn"
              onClick={() => setActiveTab("anomalies")}
            >
              Alerts
            </button>
            {isAdmin && (
              <button
                className="tab-btn"
                onClick={() => setActiveTab("admin")}
              >
                Admin
              </button>
            )}
          </div>

          {/* District Navigation - Above Date Range - Only show when data is ready */}
          {isCityDataReady && mapLeaders.length > 0 && (
            <div className={`map-district-navigation-overlay ${headerVisible ? "visible" : "hidden"}`}>
              <DistrictNavigation
                selectedDistrict={selectedDistrict}
                leaders={mapLeaders}
                shapefiles={mapShapefiles}
                onDistrictSelect={(district) => {
                  setSelectedDistrict(district);
                  setDistrictGPSLocation(null); // Clear GPS when manually selecting district
                }}
                onGPSLocation={(location) => {
                  setDistrictGPSLocation(location);
                }}
                leaderFollowerCounts={leaderFollowerCounts}
                cityId={cityId}
                publicPagePath={cityData?.name ? `/c/${slugify(cityData.name)}` : undefined}
              />
            </div>
          )}

          {/* Date Range Selector - Top Left, below district navigation */}
          <div className={`map-date-range-overlay ${headerVisible ? "visible" : "hidden"}`}>
            <MetricDateRangeSelector
              value={metricDateRange}
              onChange={setMetricDateRange}
            />
          </div>
        </div>
      )}

      {/* Non-Map Tabs - Full Width Layout with Attached Header */}
      {activeTab !== "map" && (
        <div className={`tab-content-wrapper ${activeTab === "dashboard" ? "dashboard-tab" : activeTab === "anomalies" ? "anomalies-tab" : activeTab === "newsletters" ? "newsletters-tab" : "admin-tab"}`}>
          {/* Header - Attached to top */}
          <CityHeader
            emoji={cityData.emoji || undefined}
            name={cityData.name}
            isCitySaved={isCitySaved}
            saving={saving}
            onToggleSave={handleToggleSave}
            metricDateRange={metricDateRange}
            onMetricDateRangeChange={setMetricDateRange}
            variant="overlay"
            visible={true}
            showDateRange={false}
            cityId={cityId}
            selectedDistrict={selectedDistrict}
            selectedAnomaly={selectedAnomaly}
            onAnomalySelect={handleAnomalySelect}
          />

          {/* Tabs - Below header */}
          <div className="tabs-container-overlay">
            <button
              className="tab-btn"
              onClick={() => setActiveTab("map")}
            >
              Map
            </button>
            <button
              className={`tab-btn ${activeTab === "dashboard" ? "active" : ""}`}
              onClick={() => setActiveTab("dashboard")}
            >
              Dashboard
            </button>
            <button
              className={`tab-btn ${activeTab === "anomalies" ? "active" : ""}`}
              onClick={() => setActiveTab("anomalies")}
            >
              Alerts
            </button>
            <button
              className={`tab-btn ${activeTab === "newsletters" ? "active" : ""}`}
              onClick={() => setActiveTab("newsletters")}
            >
              Newsletters
            </button>
            {isAdmin && (
              <button
                className={`tab-btn ${activeTab === "admin" ? "active" : ""}`}
                onClick={() => setActiveTab("admin")}
              >
                Admin
              </button>
            )}
          </div>

          {/* Tab Content */}
          <div className={`tab-content active ${activeTab}-content`}>
            {activeTab === "dashboard" && (
              <DashboardMetricsSection 
                metrics={cityData.metrics || []} 
                cityId={cityId}
                cityName={cityData.name}
                selectedDistrict={selectedDistrict}
                leaders={isCityDataReady ? mapLeaders : []}
                shapefiles={isCityDataReady ? mapShapefiles : []}
                onDistrictChange={setSelectedDistrict}
                onGPSLocation={setDistrictGPSLocation}
                onMetricClick={(metricId: number, district?: number | null) => {
                  setSelectedMetricId(metricId);
                  setSelectedMetricDistrict(district ?? selectedDistrict);
                }}
                leaderFollowerCounts={leaderFollowerCounts}
              />
            )}

            {activeTab === "anomalies" && (
              <div className="anomalies-section">
                <AnomaliesTabPanel
                  cityId={cityId}
                  cityName={cityData.name}
                  initialDistrict={selectedDistrict}
                  onMetricClick={(metricId, district) => {
                  setSelectedMetricId(metricId);
                  setSelectedMetricDistrict(district ?? selectedDistrict);
                }}
                />
              </div>
            )}

            {activeTab === "newsletters" && (
              <div className="newsletters-section">
                <NewslettersTabPanel
                  cityId={cityId}
                  cityName={cityData.name}
                  initialDistrict={selectedDistrict}
                />
              </div>
            )}

            {activeTab === "admin" && isAdmin && (
              <div className="admin-section">
                <CityDataAdmin cityId={cityId} embedded />
              </div>
            )}
          </div>
        </div>
      )}

      {/* Metric Detail Modal */}
      {cityData && (
        <MetricDetailModal
          metricId={selectedMetricId}
          cityName={cityData.name}
          isOpen={selectedMetricId !== null}
          onClose={() => {
            setSelectedMetricId(null);
            setSelectedMetricDistrict(null);
          }}
          district={selectedMetricDistrict}
        />
      )}
    </div>
  );
}

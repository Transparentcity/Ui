"use client";

import React, { useEffect, useState, useMemo, useRef, useCallback } from "react";
import CityDataAdmin from "@/components/CityDataAdmin";
import CityMapView from "@/components/CityMapView";
import CityHeader from "@/components/CityHeader";
import MetricDateRangeSelector from "@/components/MetricDateRangeSelector";
import DistrictNavigation from "@/components/DistrictNavigation";
import AnomaliesTabPanel from "@/components/AnomaliesTabPanel";
import { useCity, useSavedCities, useSaveCity, useUnsaveCity, useCityLeaders, useRepresentativeFollowerCounts, usePublicCityDistricts, useRepresentativeFollows, useFollowRepresentative, useUnfollowRepresentative, useLeanLeaders, useBoundarySketch } from "@/lib/hooks/useCities";
import type { CityLeader } from "@/lib/apiClient";
import {
  listMyPlaces,
  getPlaceMetrics,
  runPlaceMetricsAndAnomaliesAsJob,
  getJob,
  getCityStructure,
  getCityShapeLayers,
  type Job,
  type PlaceTimeSeriesPoint,
} from "@/lib/apiClient";
import { useUserMetricOrdering } from "@/lib/hooks/useCityAdmin";
import { emitSavedCitiesChanged, SAVED_CITIES_CHANGED_EVENT } from "@/lib/uiEvents";
import { getPresetMetricDateRange, type MetricDateRange } from "@/lib/dateRange";
// AnomalyResult import removed – anomalies section hidden
import { useAuth0 } from "@auth0/auth0-react";
import { getAdminMetricTimeSeries, getAdminMetricTimeSeriesDetail, type BatchComparisonsResponse, type ComparisonType, type ComparisonResponse } from "@/lib/apiClient";
import { useMetricComparisons, useBatchComparisons, usePlaceBatchComparisons } from "@/lib/hooks/useMetrics";
import { toast } from "sonner";
import Loader from "@/components/Loader";
import { MetricLink } from "@/components/MetricLink";
import MetricDetailModal from "@/components/MetricDetailModal";
import UserMetricOrderDialog from "@/components/UserMetricOrderDialog";
import BriefingHome from "@/components/BriefingHome";
import { resolveGeographicUnitLabel } from "@/lib/geographicUnitLabel";
import { pickCitywideLeader } from "@/lib/publicLeadersPick";
import {
  resolveDistrictFromShapefiles,
  primaryStructureIdFromLeaders,
} from "@/lib/findDistrictFromCoordinates";
import { slugify } from "@/lib/utils";
import { formatMetricValue } from "@/lib/formatters";
import "./CityView.css";

export type CityViewSection = "briefing" | "full_dashboard" | "map" | "alerts";

const SECTION_LABELS: Record<CityViewSection, string> = {
  briefing: "Overview",
  full_dashboard: "All metrics",
  map: "Map",
  alerts: "Alerts",
};

function getVisibleCityViewSections(
  isAdmin: boolean,
  canAccessMap: boolean,
): CityViewSection[] {
  // Regular users only get the briefing overview (no tab bar); the full
  // metrics table is reachable via the "All metrics" header toggle.
  if (!isAdmin) return ["briefing"];
  const sections: CityViewSection[] = ["briefing", "full_dashboard"];
  if (canAccessMap) sections.push("map");
  sections.push("alerts");
  return sections;
}

function resolveCityViewSection(
  section: CityViewSection | "dashboard" | null | undefined,
  isAdmin: boolean,
  canAccessMap: boolean,
): CityViewSection {
  if (!section || section === "briefing") return "briefing";
  // Legacy alias from older nav shortcuts.
  if (section === "dashboard") return isAdmin ? "full_dashboard" : "briefing";
  if (!isAdmin) return "briefing";
  if (section === "map" && !canAccessMap) return "briefing";
  return section;
}

interface CityViewProps {
  cityId: number;
  isAdmin: boolean;
  /** Global platform admin (not city-lead elevation). Map in place mode requires this. */
  isGlobalAdmin?: boolean;
  gpsLocation?: { lat: number; lng: number } | null;
  initialDistrict?: number | null;
  /** When set, select this saved place in the dashboard scope (e.g. from sidebar My Places). */
  initialPlaceId?: number | null;
  /** Pre-loaded label for the initial place so the name renders immediately before listMyPlaces resolves. */
  initialPlaceLabel?: string | null;
  /** Pre-loaded GPS coordinates for the initial place so the map can start at block level immediately,
   *  without waiting for the userPlaces API call to complete. */
  initialPlaceGps?: { lat: number; lng: number; radius_m: number } | null;
  /** When set to this cityId, open the Find Your District modal (e.g. from Search Cities). */
  requestOpenDistrictModal?: number | null;
  onClearDistrictModalRequest?: () => void;
  /** Called when the Official Selector selection changes so the left nav can stay in sync. */
  onOfficialSelectionChange?: (selection: { district: number | null; placeId: number | null }) => void;
  /** When this matches the selected place, run place metrics job once before loading dashboard data (new save). */
  bootstrapPlaceMetricsForPlaceId?: number | null;
  /** Called after bootstrap job finishes (or errors) so parent can clear {@link bootstrapPlaceMetricsForPlaceId}. */
  onConsumePlaceMetricsBootstrap?: () => void;
  /** Notify parent to set bootstrap id when user saves a new place from the city header (DistrictNavigation). */
  onRequestPlaceMetricsBootstrap?: (placeId: number) => void;
  /** When set, scroll to this section on mount (e.g. from sidebar Dashboard shortcut). */
  initialSection?: CityViewSection | "dashboard" | null;
  /** Called when user selects a different city from the city switcher, passing the new city id and current tab. */
  onCityChange?: (cityId: number, section: CityViewSection) => void;
  /** Label of a place whose metrics are still being computed (onboarding); shows the "your place is loading" banner on the citywide briefing. */
  pendingPlaceLabel?: string | null;
  /** When true (email/external dashboard deep link), land on the briefing with
   *  the "All metrics" tab selected. Consumed via {@link onConsumeOpenAllMetrics}. */
  openAllMetrics?: boolean;
  onConsumeOpenAllMetrics?: () => void;
}

interface MetricWithYTD {
  id: number;
  metric_name: string;
  metric_key?: string;
  category?: string | null;
  subcategory?: string | null; // Subcategory within the main category (metrics table: subcategory)
  sub_category?: string | null; // Alternate key some APIs may return
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
  /** True when metric has no current-year data; current column shows "No data", comparison shows last available year. */
  stale?: boolean;
  /** When stale: actual end date of comparison data (ISO); if before aligned period end, show as cut-off. */
  staleComparisonDataEnd?: string;
  /** For derived metrics: A/B=C breakdown for tooltip (hover shows formula) */
  calculationBreakdown?: import("@/lib/apiClient").CalculationBreakdown | null;
}

/** Minimal place for Official Selector "My place" scope */
interface UserPlaceForSelector {
  id: number;
  label: string;
  city_id: number;
  radius_m?: number;
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
  onMetricClick?: (
    metricId: number,
    district?: number | null,
    placeId?: number | null
  ) => void; // Callback when metric is clicked (for modal)
  leaderFollowerCounts?: Record<string, number>; // Follower counts per district ("0"=mayor) for Official Selector
  newsletterQueriesEnabled?: boolean; // When false, defers newsletter/follow API calls (slow-connection UX)
  /** User's saved places for "My places" in the official selector */
  userPlaces?: UserPlaceForSelector[];
  selectedPlaceId?: number | null;
  onPlaceSelect?: (placeId: number | null) => void;
  /** Called after user saves a new place from the location dialog; parent should refetch places. */
  onPlaceSaved?: () => void;
  /** When this value changes and is > 0, open the Find Your District modal (e.g. from Search Cities). */
  openDistrictTrigger?: number;
  /** When set and equals selectedPlaceId, run metrics job before first fetch (smooth new-place experience). */
  bootstrapPlaceMetricsForPlaceId?: number | null;
  onConsumePlaceMetricsBootstrap?: () => void;
  /** ISO timestamp of the last place-level data refresh, shown as "Last updated" next to Metrics heading */
  lastRefreshAt?: string | null;
  /** Ward vs District (and similar) for dashboard scope labels next to comparison selectors. */
  geographicUnitLabel?: string;
  /** Called when the user clicks "Edit" on the customized metrics banner. */
  onEditMetrics?: () => void;
  /** Called with true when a place metrics job starts, false when it finishes. */
  onJobRunningChange?: (running: boolean) => void;
  /** Comparison period shared with the briefing "What moved" toggle. */
  comparisonType: ComparisonType;
  onComparisonTypeChange: (type: ComparisonType) => void;
}

// Time series data point for sparkline
interface SparklineDataPoint {
  day: number; // day of year
  value: number;
  year: number; // calendar year
}

function isValidSparklineDataPoint(
  point: SparklineDataPoint | null | undefined,
): point is SparklineDataPoint {
  return (
    point != null &&
    Number.isFinite(point.day) &&
    Number.isFinite(point.value) &&
    Number.isFinite(point.year)
  );
}

function placeMetricsJobProgressFromJob(job: Job): {
  status: Job["status"];
  progress: number;
  statusMessage: string;
} {
  const progress =
    typeof job.progress === "number" && Number.isFinite(job.progress)
      ? Math.min(100, Math.max(0, job.progress))
      : 0;
  const statusMessage =
    (job.status_message && job.status_message.trim()) ||
    (job.status === "pending"
      ? "Waiting to start…"
      : job.status === "running"
        ? "Working…"
        : "Updating…");
  return { status: job.status, progress, statusMessage };
}

/** Poll background job until terminal state or timeout; respects `isCancelled` between iterations. */
async function pollPlaceMetricsJobUntilDone(
  jobId: string,
  token: string,
  isCancelled: () => boolean,
  onProgress?: (job: Job) => void
): Promise<void> {
  const pollIntervalMs = 2000;
  const maxWaitMs = 300000;
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    if (isCancelled()) return;
    const job = await getJob(jobId, token);
    onProgress?.(job);
    if (
      job.status === "completed" ||
      job.status === "failed" ||
      job.status === "cancelled"
    ) {
      break;
    }
    await new Promise((r) => setTimeout(r, pollIntervalMs));
  }
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
  // Use UTC timezone to avoid off-by-one date issues with server dates
  const startMonth = startDate.toLocaleDateString("en-US", { month: "short", timeZone: "UTC" });
  const endMonth = endDate.toLocaleDateString("en-US", { month: "short", timeZone: "UTC" });
  const startDay = startDate.getUTCDate();
  const endDay = endDate.getUTCDate();
  const year = endDate.getUTCFullYear();
  
  if (startMonth === endMonth) {
    return `${startMonth} ${startDay} - ${endDay}, ${year}`;
  }
  return `${startMonth} ${startDay} - ${endMonth} ${endDay}, ${year}`;
}

// Calculate 7-day trailing average
function calculate7DayAverage(data: SparklineDataPoint[]): SparklineDataPoint[] {
  const safeData = Array.isArray(data) ? data.filter(isValidSparklineDataPoint) : [];
  if (safeData.length === 0) return [];
  
  // Sort by day
  const sorted = [...safeData].sort((a, b) => a.day - b.day);
  
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

  const safeData = data.filter(isValidSparklineDataPoint);
  if (safeData.length === 0) {
    return (
      <div style={{ width, height, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <span style={{ fontSize: "10px", color: "var(--text-secondary)" }}>No data</span>
      </div>
    );
  }

  // Separate data by year
  const currentYearData = safeData
    .filter((d) => d.year === currentYear)
    .sort((a, b) => a.day - b.day);
  const priorYearData = safeData
    .filter((d) => d.year === priorYear)
    .sort((a, b) => a.day - b.day);

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

function DashboardMetricsSection({ metrics, cityId, cityName, selectedDistrict = 0, leaders: propLeaders = [], shapefiles = [], onDistrictChange, onGPSLocation, onMetricClick, leaderFollowerCounts, newsletterQueriesEnabled, userPlaces = [], selectedPlaceId = null, onPlaceSelect, onPlaceSaved, openDistrictTrigger, bootstrapPlaceMetricsForPlaceId = null, onConsumePlaceMetricsBootstrap, lastRefreshAt = null, geographicUnitLabel = "District", onEditMetrics, onJobRunningChange, comparisonType, onComparisonTypeChange }: DashboardMetricsSectionProps) {
  const { getAccessTokenSilently } = useAuth0();

  // Block (place) scope: metrics for selected place
  const [placeTimeSeries, setPlaceTimeSeries] = useState<PlaceTimeSeriesPoint[]>([]);
  const [placeDataLoading, setPlaceDataLoading] = useState(false);
  const [placeRunLoading, setPlaceRunLoading] = useState(false);
  /** Live job status while a place metrics refresh is running (server-driven message + progress). */
  const [placeJobProgress, setPlaceJobProgress] = useState<{
    status: Job["status"];
    progress: number;
    statusMessage: string;
  } | null>(null);
  const selectedPlace = selectedPlaceId != null ? userPlaces.find((p) => p.id === selectedPlaceId) : null;

  const bootstrapTargetRef = useRef<number | null>(null);
  bootstrapTargetRef.current = bootstrapPlaceMetricsForPlaceId;
  const onBootstrapCompleteRef = useRef(onConsumePlaceMetricsBootstrap);
  onBootstrapCompleteRef.current = onConsumePlaceMetricsBootstrap;

  useEffect(() => {
    if (!selectedPlaceId || !getAccessTokenSilently) return;
    let cancelled = false;
    const runBootstrap =
      bootstrapTargetRef.current != null &&
      bootstrapTargetRef.current === selectedPlaceId;

    setPlaceDataLoading(true);
    if (runBootstrap) {
      setPlaceRunLoading(true);
      setPlaceJobProgress({
        status: "pending",
        progress: 0,
        statusMessage: "Computing metrics for your place…",
      });
    }

    let didConsumeBootstrap = false;
    const finishBootstrapOnce = () => {
      if (!runBootstrap || cancelled || didConsumeBootstrap) return;
      didConsumeBootstrap = true;
      onBootstrapCompleteRef.current?.();
    };

    getAccessTokenSilently()
      .then(async (token) => {
        if (runBootstrap) {
          try {
            const { job_id } = await runPlaceMetricsAndAnomaliesAsJob(
              selectedPlaceId,
              token
            );
            await pollPlaceMetricsJobUntilDone(
              job_id,
              token,
              () => cancelled,
              (job) => {
                if (cancelled) return;
                setPlaceJobProgress(placeMetricsJobProgressFromJob(job));
              }
            );
          } catch {
            // Still attempt to load whatever exists
          } finally {
            finishBootstrapOnce();
          }
        }
        if (cancelled) return;
        const metricsRes = await getPlaceMetrics(selectedPlaceId, token);
        if (cancelled) return;
        setPlaceTimeSeries(metricsRes?.time_series ?? []);
      })
      .catch(() => {
        if (!cancelled) {
          setPlaceTimeSeries([]);
        }
        finishBootstrapOnce();
      })
      .finally(() => {
        setPlaceJobProgress(null);
        if (!cancelled) {
          setPlaceDataLoading(false);
          setPlaceRunLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [selectedPlaceId, getAccessTokenSilently]);

  /** Refresh metrics for a single place only (the one passed in). */
  const refreshPlaceData = useCallback(
    async (placeId: number) => {
      if (!placeId || !getAccessTokenSilently) return;
      setPlaceRunLoading(true);
      setPlaceJobProgress({
        status: "pending",
        progress: 0,
        statusMessage:
          "Starting refresh… The numbers below are still from your last completed run until this job finishes.",
      });
      try {
        const token = await getAccessTokenSilently();
        const { job_id } = await runPlaceMetricsAndAnomaliesAsJob(placeId, token);
        await pollPlaceMetricsJobUntilDone(
          job_id,
          token,
          () => false,
          (job) => {
            setPlaceJobProgress(placeMetricsJobProgressFromJob(job));
          }
        );
        // Only update state if we're still viewing this place (user didn't switch)
        if (selectedPlaceId !== placeId) return;
        const metricsRes = await getPlaceMetrics(placeId, token);
        if (selectedPlaceId !== placeId) return;
        setPlaceTimeSeries(metricsRes?.time_series ?? []);
      } finally {
        setPlaceRunLoading(false);
        setPlaceJobProgress(null);
      }
    },
    [selectedPlaceId, getAccessTokenSilently]
  );

  // Notify parent whenever the place job starts or stops
  const onJobRunningChangeRef = useRef(onJobRunningChange);
  onJobRunningChangeRef.current = onJobRunningChange;
  useEffect(() => {
    onJobRunningChangeRef.current?.(placeRunLoading);
  }, [placeRunLoading]);

  // Comparison period is owned by the parent (shared with "What moved").
  const selectedComparisonType = comparisonType;

  // Category filter for the metrics table. "all" shows every category.
  const CATEGORY_ALL = "all";
  const [categoryFilter, setCategoryFilter] = useState<string>(CATEGORY_ALL);
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
  /** True when no current-year data; current column shows "No data", comparison shows last available year. */
  stale?: boolean;
  /** When stale: actual end date of comparison data (ISO); if before aligned period end, show as cut-off. */
  staleComparisonDataEnd?: string;
  /** For derived metrics: A/B=C breakdown for tooltip transparency */
  calculationBreakdown?: import("@/lib/apiClient").CalculationBreakdown | null;
  }>>({});
  const [loadingMetrics, setLoadingMetrics] = useState<Set<number>>(new Set());
  
  // Fetch leaders directly as backup if not passed via props
  const { data: fetchedLeaders } = useCityLeaders(cityId);
  
  // Use prop leaders if available, otherwise fallback to fetched leaders
  const leaders = propLeaders.length > 0 ? propLeaders : (fetchedLeaders || []);
  
  // Use selectedDistrict, defaulting to 0 (citywide) if not provided
  const district = selectedDistrict ?? 0;
  
  // Fetch metric ordering (user override or city-level fallback)
  const orderingQuery = useUserMetricOrdering(cityId);
  const orderingData = orderingQuery.data;

  // Build ordering map from saved ordering data (includes subcategory for display when set)
  const orderingMap = useMemo(() => {
    const map = new Map<number, { categoryOrder: number; metricOrder: number; categoryName: string; subcategoryName: string | null }>();
    if (orderingData?.orderings) {
      orderingData.orderings.forEach((o) => {
        if (o.metric_id) {
          map.set(o.metric_id, {
            categoryOrder: o.category_order,
            metricOrder: o.metric_order,
            categoryName: o.category_name,
            subcategoryName: o.subcategory_name ?? null,
          });
        }
      });
    }
    return map;
  }, [orderingData]);

  // Only restrict to the ordering list when the user explicitly saved a personal dashboard
  // (matches public /c pages). City default ordering is for sort/categories only — new metrics
  // still appear like they do when logged out.
  // New metrics (not yet in the user's saved ordering) are always appended so users
  // don't miss metrics that were added after they last saved their preferences.
  const metricsToShow = useMemo(() => {
    // Avoid a brief "all metrics then filtered metrics" flash while user ordering is loading.
    if (orderingQuery.isLoading) return [];
    if (!orderingData?.orderings?.length) return metrics;
    if (orderingData.is_personal_order !== true) return metrics;
    const ids = new Set(orderingData.orderings.map((o) => o.metric_id).filter(Boolean));
    const orderedMetrics = metrics.filter((m) => ids.has(m.id));
    // Append any metrics added since the user last saved (show_on_dash !== false means admin enabled them)
    const newMetrics = metrics.filter((m) => !ids.has(m.id) && (m as any).show_on_dash !== false);
    return [...orderedMetrics, ...newMetrics];
  }, [metrics, orderingData, orderingQuery.isLoading]);

  // True whenever the user has explicitly saved a personal ordering (even if all metrics are showing).
  const isPersonalSubsetApplied = useMemo(() => {
    if (!orderingData?.orderings?.length) return false;
    return orderingData.is_personal_order === true;
  }, [orderingData]);

  // Group and sort metrics by category using saved ordering
  const groupedMetrics = useMemo(() => {
    const grouped: Record<string, { metrics: MetricWithYTD[]; categoryOrder: number }> = {};
    
    metricsToShow.forEach((metric) => {
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
        subcategory: (() => {
          const fromOrdering = ordering?.subcategoryName;
          if (fromOrdering != null && String(fromOrdering).trim()) return fromOrdering.trim();
          const fromMetric = metric.subcategory ?? (metric as MetricWithYTD).sub_category ?? null;
          return (fromMetric != null && String(fromMetric).trim()) ? String(fromMetric).trim() : null;
        })(),
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
        // For stale metrics, Through date must be last actual data date (from comparison); list API most_recent_data_date can be wrong (e.g. "yesterday" in current year)
        maxDataDate: (ytdData[metric.id]?.stale ? ytdData[metric.id]?.maxDataDate : null) ?? metric.most_recent_data_date ?? ytdData[metric.id]?.maxDataDate ?? undefined,
        display_unit: (metric as any).display_unit || null, // "percentage", "currency", etc.
        stale: ytdData[metric.id]?.stale ?? false,
        staleComparisonDataEnd: ytdData[metric.id]?.staleComparisonDataEnd,
        calculationBreakdown: ytdData[metric.id]?.calculationBreakdown,
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
  }, [metricsToShow, ytdData, orderingMap]);

  // Category dropdown options (in table order).
  const categoryOptions = groupedMetrics.sortedCategories;

  // Active filter; falls back to "all" when the saved selection no longer exists.
  const activeCategoryFilter = useMemo(() => {
    if (categoryFilter === CATEGORY_ALL) return null;
    return categoryOptions.includes(categoryFilter) ? categoryFilter : null;
  }, [categoryFilter, categoryOptions]);

  // Fetch precomputed comparisons for all metrics (city/district vs place)
  const metricIds = useMemo(() => 
    metricsToShow.map((m) => m.id).filter((id): id is number => !!id),
    [metricsToShow]
  );
  const batchRequest = useMemo(() => {
    if (selectedPlaceId || metricIds.length === 0) return null;
    return {
      metric_ids: metricIds,
      district: district === 0 ? null : district,
      comparison_types: [selectedComparisonType],
    };
  }, [selectedPlaceId, metricIds, district, selectedComparisonType]);
  const placeRequest = useMemo(() => {
    if (!selectedPlaceId || metricIds.length === 0) return null;
    return { metric_ids: metricIds, comparison_types: [selectedComparisonType] };
  }, [selectedPlaceId, metricIds, selectedComparisonType]);

  const {
    data: batchComparisons,
    isLoading: comparisonsLoading,
  } = useBatchComparisons(batchRequest);

  const {
    data: placeComparisons,
    isLoading: placeComparisonsLoading,
  } = usePlaceBatchComparisons(selectedPlaceId ?? null, placeRequest);

  const isPlaceScope = !!selectedPlaceId;
  const comparisonsData = isPlaceScope ? placeComparisons : batchComparisons;
  const comparisonsLoadingState = isPlaceScope ? placeComparisonsLoading : comparisonsLoading;

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
        if (!point?.time_period || !Number.isFinite(point.numeric_value)) {
          return;
        }
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
        if (!point?.time_period || !Number.isFinite(point.numeric_value)) {
          return;
        }
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
        // No current year data: find last available year and show its YTD/MTD so we don't misrepresent 2025 as 2026
        let lastAvailable = { year: 0, month: 0, day: 0 };
        detail.data.forEach((point) => {
          const parsed = parseLocalDate(point.time_period);
          if (
            parsed.year > lastAvailable.year ||
            (parsed.year === lastAvailable.year && parsed.month > lastAvailable.month) ||
            (parsed.year === lastAvailable.year && parsed.month === lastAvailable.month && parsed.day > lastAvailable.day)
          ) {
            lastAvailable = parsed;
          }
        });
        if (lastAvailable.year > 0) {
          const cutoffMonth = lastAvailable.month;
          const cutoffDay = lastAvailable.day;
          const periodType = activeSeries.period_type;
          let lastAvailableYTD = 0;
          if (periodType === "month" || periodType === "year") {
            lastAvailableYTD = detail.data
              .filter((point) => {
                const parsed = parseLocalDate(point.time_period);
                return parsed.year === lastAvailable.year && parsed.month <= cutoffMonth;
              })
              .reduce((sum, point) => sum + point.numeric_value, 0);
          } else {
            lastAvailableYTD = detail.data
              .filter((point) => {
                const parsed = parseLocalDate(point.time_period);
                if (parsed.year !== lastAvailable.year) return false;
                if (parsed.month < cutoffMonth) return true;
                return parsed.month === cutoffMonth && parsed.day <= cutoffDay;
              })
              .reduce((sum, point) => sum + point.numeric_value, 0);
          }
          const rangeStart = new Date(lastAvailable.year, 0, 1);
          const rangeEnd = new Date(lastAvailable.year, cutoffMonth, cutoffDay);
          const now = new Date();
          const currentPeriodStart = new Date(currentYear, 0, 1);
          const currentPeriodEnd = new Date(currentYear, now.getMonth(), now.getDate());
          setYtdData((prev) => ({
            ...prev,
            [metricId]: {
              lastYear: lastAvailableYTD || null,
              thisYear: null,
              loading: false,
              dataYear: currentYear,
              priorYear: lastAvailable.year - 1,
              dateRangeStart: currentPeriodStart,
              dateRangeEnd: currentPeriodEnd,
              comparisonPeriodStart: rangeStart,
              comparisonPeriodEnd: rangeEnd,
              maxDataDate: rangeEnd.toISOString().split("T")[0],
              stale: true,
              staleComparisonDataEnd: rangeEnd.toISOString().split("T")[0],
              sparklineData,
            },
          }));
        } else {
          setYtdData((prev) => ({
            ...prev,
            [metricId]: { lastYear: null, thisYear: null, loading: false, dataYear: currentYear, priorYear, sparklineData: [], stale: true },
          }));
        }
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

    if (comparisonsLoadingState) return;

    // Precomputed batch returns {} when there are no rows; {} is truthy in JS, so we must
    // check keys — otherwise we never fall back to on-demand YTD from time series.
    const batchHasRows =
      comparisonsData != null && Object.keys(comparisonsData).length > 0;
    if (batchHasRows) return;

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
  }, [
    visibleMetricIds,
    calculateYTD,
    comparisonsData,
    comparisonsLoadingState,
    isPlaceScope,
  ]);

  // Clear data when district, place, or comparison type changes so we reload with the correct data
  useEffect(() => {
    setYtdData({});
    setVisibleMetricIds(new Set());
  }, [district, selectedComparisonType, selectedPlaceId]);

  // If batch or place comparisons become available, merge into ytdData (same shape for dashboard parity)
  // For metrics with no current-year data (stale), shift: show "No data" for this year and last available year in comparison column with correct year label
  useEffect(() => {
    if (!comparisonsData || Object.keys(comparisonsData).length === 0) return;

    const now = new Date();
    const currentYear = now.getFullYear();
    const priorYear = currentYear - 1;
    
    const updates: Record<number, Partial<typeof ytdData[number]>> = {};
    
    Object.entries(comparisonsData).forEach(([metricIdStr, comparisons]) => {
      const metricId = parseInt(metricIdStr, 10);
      const comparisonsTyped = comparisons as Record<ComparisonType, ComparisonResponse>;
      const comparison = comparisonsTyped[selectedComparisonType];
      
      if (comparison) {
        const currentPeriodEndYear = comparison.current_period_end
          ? parseLocalDate(comparison.current_period_end).year
          : currentYear;
        const hasCurrentYearData = currentPeriodEndYear >= currentYear;
        const stale = !hasCurrentYearData;

        if (stale) {
          // No current-year data: current column = "Jan 1 - today 2026" with No data; comparison column = actual period the value covers so label and value match
          const now = new Date();
          const currentPeriodStart = new Date(currentYear, 0, 1);
          const currentPeriodEnd = new Date(currentYear, now.getMonth(), now.getDate());
          // Use the API's actual period for the comparison value so we don't show "Jan 1 - Jan 28" with a full-year count (e.g. dataset that started in March)
          const comparisonPeriodStart = comparison.current_period_start ? new Date(comparison.current_period_start) : undefined;
          const comparisonPeriodEnd = comparison.current_period_end ? new Date(comparison.current_period_end) : undefined;
          updates[metricId] = {
            lastYear: comparison.current_period_value ?? null,
            thisYear: null,
            loading: false,
            dataYear: currentYear,
            priorYear: currentPeriodEndYear - 1,
            dateRangeStart: currentPeriodStart,
            dateRangeEnd: currentPeriodEnd,
            comparisonPeriodStart,
            comparisonPeriodEnd,
            computedAt: comparison.computed_at,
            maxDataDate: comparison.current_period_end,
            stale: true,
            staleComparisonDataEnd: comparison.current_period_end ?? undefined,
            sparklineData: ytdData[metricId]?.sparklineData || [],
            calculationBreakdown: comparison.calculation_breakdown ?? undefined,
          };
        } else {
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
            maxDataDate: comparison.current_period_end,
            sparklineData: ytdData[metricId]?.sparklineData || [],
            calculationBreakdown: comparison.calculation_breakdown ?? undefined,
          };
        }
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
  }, [comparisonsData, selectedComparisonType]);

  // Determine the most common years from loaded data for column headers
  // Always display current calendar year vs prior year
  const displayYears = useMemo(() => {
    const now = new Date();
    return { dataYear: now.getFullYear(), priorYear: now.getFullYear() - 1 };
  }, []);

  // Helper to format date as "Jan 1 - Jan 12" (no year)
  const formatPeriodDate = (start?: Date, end?: Date) => {
    if (!start || !end) return null;
    const startStr = start.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
    const endStr = end.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
    return `${startStr} - ${endStr}`;
  };

  // Format period with year for apples-to-apples labels: "Jan 1 - Jan 5 2026"
  const formatPeriodDateWithYear = (start?: Date, end?: Date) => {
    if (!start || !end) return null;
    const startStr = start.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
    const endStr = end.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
    const year = end.getFullYear();
    return `${startStr} - ${endStr} ${year}`;
  };

  // Find the currently selected leader based on district
  const selectedLeader = useMemo(() => {
    if (!leaders || leaders.length === 0) return null;
    
    // For citywide (district = 0 or null), pick the mayor/executive — not just the
    // first null-district row (at-large councilmembers also have district=null).
    if (district === 0 || district === null) {
      return pickCitywideLeader(leaders);
    }
    
    // For specific district, find the matching leader
    return leaders.find(l => l.district === district) || null;
  }, [leaders, district]);

  // Build the dashboard title based on selected leader or place
  const dashboardTitle = useMemo(() => {
    if (selectedPlaceId && selectedPlace) {
      return "My Place personalized dashboard";
    }
    if (selectedLeader) {
      const districtText = selectedLeader.district
        ? `${geographicUnitLabel} ${selectedLeader.district}`
        : "Citywide";
      return `${selectedLeader.title}: ${selectedLeader.name} - ${districtText} Dashboard`;
    }
    if (district === 0 || district === null) {
      return "Citywide Dashboard";
    }
    return `${geographicUnitLabel} ${district} Dashboard`;
  }, [selectedPlaceId, selectedPlace, selectedLeader, district, geographicUnitLabel]);

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

  if (!metrics || metrics.length === 0) {
    return (
      <div className="dashboard-section">
        <h2 className="city-view-section-title">
          Metrics
          {lastRefreshAt && (
            <span className="city-view-dashboard-last-refresh">
              {" "}Last updated {new Date(lastRefreshAt).toLocaleDateString(undefined, { dateStyle: "medium" })}
            </span>
          )}
        </h2>
        <div className="ytd-placeholder">
          <p>No metrics defined for this city.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="dashboard-section">
      {/* Single row: context label (place/scope is set in sticky header), Compare dropdowns (middle), Customize (right) */}
      <div className="dashboard-header dashboard-header-single-row">
        <div className="dashboard-header-left">
          <span className="dashboard-scope-label" aria-hidden="true">
            {selectedPlaceId && selectedPlace
              ? "My Place"
              : district === 0 || district === null
                ? "Citywide"
                : `${geographicUnitLabel} ${district}`}
          </span>
        </div>
        <div className="dashboard-header-compare">
          <div
            className="dashboard-period-toggle"
            role="radiogroup"
            aria-label="Comparison period"
          >
            {([
              { value: "ytd" as ComparisonType, label: "YTD" },
              { value: "mtd" as ComparisonType, label: "MTD" },
            ]).map((opt) => (
              <button
                key={opt.value}
                type="button"
                role="radio"
                aria-checked={selectedComparisonType === opt.value}
                className={`dashboard-period-btn${selectedComparisonType === opt.value ? " dashboard-period-btn-active" : ""}`}
                onClick={() => onComparisonTypeChange(opt.value)}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
        {categoryOptions.length > 0 && (
          <select
            className="comparison-selector-dropdown dashboard-category-select"
            value={activeCategoryFilter ?? CATEGORY_ALL}
            onChange={(e) => setCategoryFilter(e.target.value)}
            aria-label="Filter by category"
          >
            <option value={CATEGORY_ALL}>All</option>
            {categoryOptions.map((category) => (
              <option key={category} value={category}>
                {category}
              </option>
            ))}
          </select>
        )}
        {selectedPlaceId && selectedPlace && (
          <div className="dashboard-header-block-actions">
            <button
              type="button"
              className="dashboard-header-customize-btn dashboard-header-refresh-place-btn"
              onClick={() => refreshPlaceData(selectedPlaceId!)}
              disabled={placeRunLoading || placeDataLoading}
              aria-busy={placeRunLoading}
              aria-label={
                placeRunLoading
                  ? "Refreshing place metrics, please wait"
                  : "Refresh metrics for this place"
              }
            >
              {placeRunLoading ? (
                <span className="dashboard-header-refresh-place-btn-inner">
                  <Loader size="sm" color="dark" />
                  <span>Refreshing…</span>
                </span>
              ) : (
                "Refresh metrics for this place"
              )}
            </button>
          </div>
        )}
      </div>

      <div className="metrics-table-container" role="table" aria-label="City metrics year-to-date comparison">
        {orderingQuery.isLoading ? (
          <div className="dashboard-metrics-loading tc-loading-state" style={{ padding: "48px 24px" }}>
            <Loader size="sm" color="dark" />
            <span>Loading dashboard preferences…</span>
          </div>
        ) : selectedPlaceId && selectedPlace && placeDataLoading && !comparisonsData ? (
          <div className="dashboard-metrics-loading tc-loading-state" style={{ padding: "48px 24px" }}>
            <Loader size="sm" color="dark" />
            <span>
              {bootstrapPlaceMetricsForPlaceId === selectedPlaceId &&
              placeRunLoading
                ? "Computing metrics for your place…"
                : "Loading personalized dashboard…"}
            </span>
          </div>
        ) : selectedPlaceId && selectedPlace && !placeDataLoading && !comparisonsLoadingState && (!comparisonsData || Object.keys(comparisonsData).length === 0) ? (
          <div className="block-dashboard-empty block-dashboard-empty--dark">
            {placeRunLoading && placeJobProgress ? (
              <div
                className="place-refresh-job-banner place-refresh-job-banner--stacked"
                role="status"
                aria-live="polite"
                aria-busy="true"
              >
                <Loader size="sm" color="white" />
                <div className="place-refresh-job-banner__body">
                  <div className="place-refresh-job-banner__title">
                    Refreshing metrics for My Place
                  </div>
                  <div className="place-refresh-job-banner__message">
                    {placeJobProgress.statusMessage}
                  </div>
                  <div className="place-refresh-job-banner__hint">
                    When the job completes, metrics will load here automatically.
                  </div>
                  <div
                    className="place-refresh-job-banner__track"
                    role="progressbar"
                    aria-valuenow={placeJobProgress.progress}
                    aria-valuemin={0}
                    aria-valuemax={100}
                  >
                    <div
                      className="place-refresh-job-banner__fill"
                      style={{ width: `${placeJobProgress.progress}%` }}
                    />
                  </div>
                </div>
              </div>
            ) : placeRunLoading ? (
              <p className="block-dashboard-empty-message">Refreshing metrics…</p>
            ) : (
              <>
                <p className="block-dashboard-empty-message">No data yet — refresh metrics for this place.</p>
                <button
                  type="button"
                  className="dashboard-header-customize-btn"
                  onClick={() => refreshPlaceData(selectedPlaceId!)}
                  disabled={placeRunLoading}
                >
                  Refresh metrics for this place
                </button>
              </>
            )}
          </div>
        ) : comparisonsLoadingState ? (
          <div className="dashboard-metrics-loading tc-loading-state" style={{ padding: "48px 24px" }}>
            <Loader size="sm" color="dark" />
            <span>Loading metrics…</span>
          </div>
        ) : (
        <>
        {selectedPlaceId &&
          placeRunLoading &&
          placeJobProgress &&
          comparisonsData &&
          Object.keys(comparisonsData).length > 0 && (
            <div
              className="place-refresh-job-banner"
              role="status"
              aria-live="polite"
              aria-busy="true"
            >
              <Loader size="sm" color="dark" />
              <div className="place-refresh-job-banner__body">
                <div className="place-refresh-job-banner__title">
                  Refreshing metrics for My Place
                </div>
                <div className="place-refresh-job-banner__message">
                  {placeJobProgress.statusMessage}
                </div>
                <div className="place-refresh-job-banner__hint">
                  The table still shows your previous results until this run completes.
                </div>
                <div
                  className="place-refresh-job-banner__track"
                  role="progressbar"
                  aria-valuenow={placeJobProgress.progress}
                  aria-valuemin={0}
                  aria-valuemax={100}
                >
                  <div
                    className="place-refresh-job-banner__fill"
                    style={{ width: `${placeJobProgress.progress}%` }}
                  />
                </div>
              </div>
            </div>
          )}
        {isPersonalSubsetApplied && !selectedPlaceId && (
          <div
            style={{
              marginBottom: 12,
              padding: "8px 10px",
              fontSize: 12,
              borderRadius: 8,
              background: "var(--surface-muted, rgba(0,0,0,0.04))",
              color: "var(--text-secondary, #4b5563)",
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <span>
              Showing your customized dashboard metrics ({metricsToShow.length} of {metrics.length}).
            </span>
            <button
              type="button"
              onClick={() => onEditMetrics?.()}
              style={{
                marginLeft: "auto",
                fontSize: 11,
                padding: "2px 10px",
                borderRadius: 5,
                border: "1px solid var(--border-muted, #d1d5db)",
                background: "var(--surface-base, #fff)",
                color: "var(--text-secondary, #4b5563)",
                cursor: "pointer",
                flexShrink: 0,
              }}
            >
              Edit
            </button>
          </div>
        )}
        {groupedMetrics.sortedCategories.map((category) => {
          if (activeCategoryFilter && activeCategoryFilter !== category) {
            return null;
          }
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
            const raw = metric.subcategory ?? metric.sub_category ?? null;
            const subcat = (raw != null && String(raw).trim()) ? String(raw).trim() : null;
            if (!subcategoryMap.has(subcat)) {
              subcategoryMap.set(subcat, []);
            }
            subcategoryMap.get(subcat)!.push(metric);
          });
          
          // Convert to array and sort subcategory bands like MetricOrderEditor /
          // CityDashboardSection: min(metric_order) within the band, then name.
          subcategoryMap.forEach((metrics, subcategory) => {
            subcategoryGroups.push({ subcategory, metrics });
          });
          subcategoryGroups.sort((a, b) => {
            const minOrder = (g: (typeof subcategoryGroups)[0]) => {
              if (g.metrics.length === 0) return 1000;
              return Math.min(
                ...g.metrics.map((m) => (m as MetricWithYTD & { metricOrder?: number }).metricOrder ?? 1000)
              );
            };
            const oa = minOrder(a);
            const ob = minOrder(b);
            if (oa !== ob) return oa - ob;
            if (a.subcategory === null && b.subcategory === null) return 0;
            if (a.subcategory === null) return -1;
            if (b.subcategory === null) return 1;
            return String(a.subcategory).localeCompare(String(b.subcategory));
          });
          
          // Determine if we should show subcategory headers
          // Show if there's more than one subcategory OR if there's exactly one non-null subcategory
          const hasMultipleSubcategories = subcategoryGroups.length > 1;
          const hasSingleNamedSubcategory = subcategoryGroups.length === 1 && subcategoryGroups[0].subcategory !== null;
          const showSubcategoryHeaders = hasMultipleSubcategories || hasSingleNamedSubcategory;
          
          return (
            <div key={category} className="metrics-category-section">
              {/* Table header row */}
              <div className="metrics-table-header" role="row">
                <div className="metric-col metric-col-name" role="columnheader">{category}</div>
                <div className="metric-col metric-col-value" role="columnheader">{getColumnHeaders.comparison}</div>
                <div className="metric-col metric-col-value" role="columnheader">{getColumnHeaders.current}</div>
                <div className="metric-col metric-col-change" role="columnheader">Change</div>
              </div>
              
              {/* Metric rows grouped by subcategory */}
              <div className="metrics-table-body">
                {subcategoryGroups.map((group) => (
                  <React.Fragment key={group.subcategory || 'uncategorized'}>
                    {showSubcategoryHeaders && group.subcategory && (
                      <div className="metrics-subcategory-header">
                        <span className="metrics-subcategory-title">{group.subcategory}</span>
                      </div>
                    )}
                    {group.metrics.map((metric) => {
                      // Stale = no current-year data; we show last available year in comparison column and "No data" for current
                      const isStale = metric.stale === true;
                      const hasValidData = !isStale &&
                        metric.ytdThisYear !== null && metric.ytdLastYear !== null &&
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
                          // Use UTC timezone to avoid off-by-one date issues with server dates
                          return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
                        } catch {
                          return null;
                        }
                      };

                      const maxDataDateFormatted = formatMetadataDate(metric.maxDataDate);
                      const citySlug = cityName ? slugify(cityName) : `city-${cityId}`;

                      const b = metric.calculationBreakdown;
                      const fmt = (n: number | null) => n != null ? n.toLocaleString(undefined, { maximumFractionDigits: 0 }) : "—";
                      const isPct = b?.display_unit === "percentage";
                      const fmtResult = (r: number | null) => r != null ? (isPct ? r.toFixed(1) + "%" : fmt(r)) : "—";

                      return (
                        <MetricLink
                          key={metric.id}
                          metricId={metric.id}
                          metricKey={metric.metric_key}
                          citySlug={citySlug}
                          className="metrics-table-row metrics-table-row-clickable"
                          role="row"
                          prefetch={false}
                          mode="modal"
                          district={selectedPlaceId ? null : district}
                          placeId={selectedPlaceId}
                          onModalOpen={onMetricClick}
                          {...{ "data-metric-id": metric.id.toString() }}
                        >
                          {/* Metric name column */}
                          <div className="metric-col metric-col-name">
                            <span className="metric-name">{metric.metric_name}</span>
                          </div>
                          
                          {/* Comparison column: apples-to-apples period (e.g. Jan 1 - Jan 5 2025); cut-off styling when data ends mid-window */}
                          <div className="metric-col metric-col-value metric-col-hoverable">
                            {b && (
                              <div className="metric-col-tooltip" aria-hidden>
                                <div className="metric-col-tooltip-inner">
                                  {b.numerator_name} ({fmt(b.comparison_period.numerator_value)}) ÷ {b.denominator_name} ({fmt(b.comparison_period.denominator_value)})
                                  {isPct && " × 100"} = <strong>{fmtResult(b.comparison_period.result)}</strong>
                                </div>
                              </div>
                            )}
                            {metric.ytdLoading ? (
                              <Loader size="sm" color="dark" />
                            ) : (
                              <>
                                <span className="metric-date-label">
                                  {metric.stale && metric.staleComparisonDataEnd && metric.comparisonPeriodEnd ? (() => {
                                    const actualEnd = new Date(metric.staleComparisonDataEnd);
                                    const alignedEnd = metric.comparisonPeriodEnd;
                                    const isCutOff = actualEnd.getTime() < alignedEnd.getTime();
                                    const labelWithYear = formatPeriodDateWithYear(metric.comparisonPeriodStart, isCutOff ? actualEnd : alignedEnd);
                                    if (isCutOff && labelWithYear) {
                                      const endStr = actualEnd.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
                                      const startStr = metric.comparisonPeriodStart!.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
                                      return <>{startStr} – <span className="metric-date-cutoff" title="Data ends here; period window is longer">{endStr}</span></>;
                                    }
                                    return <>{labelWithYear || `Jan 1 - Jan ${displayYears.priorYear}`}</>;
                                  })() : (formatPeriodDateWithYear(metric.comparisonPeriodStart, metric.comparisonPeriodEnd) || comparisonPeriodDates || `Jan 1 - Jan ${displayYears.priorYear}`)}
                                </span>
                                <span className="metric-value">
                                  {formatMetricValue(metric.ytdLastYear, metric.display_unit)}
                                </span>
                              </>
                            )}
                          </div>
                          
                          {/* Current year value column: apples-to-apples (e.g. Jan 1 - Jan 5 2026) or "No data" when stale */}
                          <div className="metric-col metric-col-value metric-col-hoverable">
                            {b && (
                              <div className="metric-col-tooltip" aria-hidden>
                                <div className="metric-col-tooltip-inner">
                                  {b.numerator_name} ({fmt(b.current_period.numerator_value)}) ÷ {b.denominator_name} ({fmt(b.current_period.denominator_value)})
                                  {isPct && " × 100"} = <strong>{fmtResult(b.current_period.result)}</strong>
                                </div>
                              </div>
                            )}
                            {metric.ytdLoading ? (
                              <Loader size="sm" color="dark" />
                            ) : (
                              <>
                                <span className="metric-date-label">{formatPeriodDateWithYear(metric.currentPeriodStart, metric.currentPeriodEnd) || currentPeriodDates || `Jan 1 - Jan ${displayYears.dataYear}`}</span>
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
                                    // For count/other metrics: percent above, amount below (like headers over dates)
                                    <>
                                      <span className="change-percent">
                                        {percentDelta !== null ? (percentDelta > 0 ? "+" : "") + Math.round(percentDelta) + "%" : "—"}
                                      </span>
                                      <span className="change-absolute">
                                        {absoluteDiff !== null ? (absoluteDiff > 0 ? "+" : "") + Math.round(absoluteDiff).toLocaleString() : "—"}
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
        </>
        )}
      </div>
    </div>
  );
}

export default function CityView({
  cityId,
  isAdmin,
  isGlobalAdmin = false,
  gpsLocation,
  initialDistrict,
  initialPlaceId,
  initialPlaceLabel,
  initialPlaceGps,
  requestOpenDistrictModal,
  onClearDistrictModalRequest,
  onOfficialSelectionChange,
  bootstrapPlaceMetricsForPlaceId = null,
  onConsumePlaceMetricsBootstrap,
  onRequestPlaceMetricsBootstrap,
  initialSection,
  onCityChange,
  pendingPlaceLabel = null,
  openAllMetrics = false,
  onConsumeOpenAllMetrics,
}: CityViewProps) {
  const [adminDrawerOpen, setAdminDrawerOpen] = useState(false);
  // alertsSectionVisible removed – anomalies section hidden
  const [openDistrictTrigger, setOpenDistrictTrigger] = useState(0);
  const [saving, setSaving] = useState(false);
  const [metricDateRange, setMetricDateRange] = useState<MetricDateRange>(
    getPresetMetricDateRange("ytd")
  );
  // Use initialDistrict if provided, otherwise default to 0 (mayor/citywide)
  // When initialPlaceId is set (saved place), we use place scope so district is 0 and place is set from the start to avoid flashing "Citywide".
  const [selectedDistrict, setSelectedDistrict] = useState<number | null>(
    initialPlaceId != null ? 0 : (initialDistrict !== undefined && initialDistrict !== null ? initialDistrict : 0)
  );
  const [selectedPlaceId, setSelectedPlaceId] = useState<number | null>(initialPlaceId ?? null);
  // Pre-seed with the label passed from the parent so the name renders immediately
  // before listMyPlaces resolves. The real API response replaces this on load.
  const [userPlaces, setUserPlaces] = useState<{ id: number; label: string; city_id: number; lat?: number; lng?: number; radius_m?: number; district?: number | null }[]>(() => {
    if (initialPlaceId && initialPlaceLabel) {
      return [{ id: initialPlaceId, label: initialPlaceLabel, city_id: cityId }];
    }
    return [];
  });
  // Map tab: city leads may use it citywide/district, but not in place mode.
  // Global admins may use it in all scopes.
  const canAccessMap =
    isAdmin && (selectedPlaceId == null || isGlobalAdmin);
  const visibleSections = useMemo(
    () => getVisibleCityViewSections(isAdmin, canAccessMap),
    [isAdmin, canAccessMap],
  );
  const [placesRefreshKey, setPlacesRefreshKey] = useState(0);
  const [districtGPSLocation, setDistrictGPSLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [mapLeaders, setMapLeaders] = useState<any[]>([]);
  const [mapShapefiles, setMapShapefiles] = useState<any[]>([]);
  // selectedAnomaly removed – anomalies section hidden
  const [selectedMetricId, setSelectedMetricId] = useState<number | null>(null);
  const [selectedMetricDistrict, setSelectedMetricDistrict] = useState<number | null>(null);
  const [selectedMetricPlaceId, setSelectedMetricPlaceId] = useState<number | null>(null);
  const [userOrderDialogOpen, setUserOrderDialogOpen] = useState(false);
  const [lastPlaceRefreshAt, setLastPlaceRefreshAt] = useState<string | null>(null);
  const [isPlaceJobRunning, setIsPlaceJobRunning] = useState(false);
  const mapSectionRef = useRef<HTMLDivElement | null>(null);
  const dashboardSectionRef = useRef<HTMLDivElement | null>(null);
  const [activeSection, setActiveSection] = useState<CityViewSection>(() =>
    resolveCityViewSection(
      initialSection,
      isAdmin,
      isAdmin && (initialPlaceId == null || isGlobalAdmin),
    ),
  );
  // Lazy-mount map only after the Map tab is opened (avoids map-data storms on dashboard/place views).
  const [mapTabMounted, setMapTabMounted] = useState<boolean>(() => {
    const canMap = isAdmin && (initialPlaceId == null || isGlobalAdmin);
    return initialSection === "map" && canMap;
  });
  const [alertsTabMounted, setAlertsTabMounted] = useState<boolean>(
    initialSection === "alerts" && isAdmin,
  );
  // Legacy full dashboard: lazy-mounted the first time it's needed (admin
  // "All metrics" tab, briefing "All metrics" header toggle, or place scope,
  // which relies on its place-metrics bootstrap/job wiring).
  const [fullDashboardMounted, setFullDashboardMounted] = useState<boolean>(
    () =>
      openAllMetrics ||
      initialPlaceId != null ||
      resolveCityViewSection(
        initialSection,
        isAdmin,
        isAdmin && (initialPlaceId == null || isGlobalAdmin),
      ) === "full_dashboard",
  );
  const [browseAllExpanded, setBrowseAllExpanded] = useState(openAllMetrics);
  // Email/external dashboard deep links land on the overview with the
  // "All metrics" tab selected. Consume the flag so later manual navigation
  // (sidebar, city switcher) doesn't re-trigger it.
  useEffect(() => {
    if (openAllMetrics) {
      setBrowseAllExpanded(true);
      onConsumeOpenAllMetrics?.();
    }
  }, [openAllMetrics, onConsumeOpenAllMetrics]);
  // Briefing movers period: YTD by default (toggleable to MTD).
  const [briefingComparisonType, setBriefingComparisonType] =
    useState<ComparisonType>("ytd");
  const [isCityDataReady, setIsCityDataReady] = useState(false);
  const previousCityIdRef = useRef<number | null>(null);
  useEffect(() => {
    if (requestOpenDistrictModal != null && requestOpenDistrictModal === cityId) {
      setOpenDistrictTrigger((t) => t + 1);
      onClearDistrictModalRequest?.();
    }
  }, [requestOpenDistrictModal, cityId, onClearDistrictModalRequest]);

  // Use React Query hooks for data fetching - dashboard first: city + metrics, then non-critical data
  const { data: cityData, isLoading: loadingCity, error: cityError, isSuccess: cityLoaded } = useCity(cityId);
  // Defer saved cities until after city has loaded so dashboard can show first
  const { data: savedCities = [], isLoading: loadingSaved } = useSavedCities({ enabled: cityLoaded });
  // Defer newsletter/follower requests until city has loaded to avoid blocking on slow connections
  const { data: leaderFollowerCounts } = useRepresentativeFollowerCounts(cityId, { enabled: cityLoaded });
  const { data: followedDistricts = {} } = useRepresentativeFollows(cityId ?? null, { enabled: cityLoaded });
  const followMutation = useFollowRepresentative(cityId ?? null);
  const unfollowMutation = useUnfollowRepresentative(cityId ?? null);
  const { data: publicCityDistricts = [] } = usePublicCityDistricts(cityId, { enabled: !!cityId && cityLoaded });

  // Fast lean leaders (public, no auth) — available before the heavy structure/shapefile load.
  const { data: leanLeaders = [] } = useLeanLeaders(cityId, { enabled: !!cityId });

  // Simplified boundary sketch for the hero mini-map (public, 24h cache).
  const { data: boundarySketch = null } = useBoundarySketch(cityId, { enabled: !!cityId });

  const geographicUnitLabel = useMemo(
    () => resolveGeographicUnitLabel(mapLeaders, cityData?.geographic_structures),
    [mapLeaders, cityData?.geographic_structures],
  );

  // ── Briefing data: one batch comparisons call for the current scope ──
  const briefingMetrics = useMemo(
    () => (cityData?.metrics ?? []) as any[],
    [cityData?.metrics],
  );
  const briefingMetricIds = useMemo(
    () => briefingMetrics.map((m) => m.id).filter((id): id is number => !!id),
    [briefingMetrics],
  );
  const briefingBatchRequest = useMemo(() => {
    if (selectedPlaceId != null || briefingMetricIds.length === 0) return null;
    const d = selectedDistrict ?? 0;
    return {
      metric_ids: briefingMetricIds,
      district: d === 0 ? null : d,
      comparison_types: [briefingComparisonType],
    };
  }, [selectedPlaceId, briefingMetricIds, selectedDistrict, briefingComparisonType]);
  const briefingPlaceRequest = useMemo(() => {
    if (selectedPlaceId == null || briefingMetricIds.length === 0) return null;
    return {
      metric_ids: briefingMetricIds,
      comparison_types: [briefingComparisonType],
    };
  }, [selectedPlaceId, briefingMetricIds, briefingComparisonType]);
  const { data: briefingBatchComparisons, isLoading: briefingBatchLoading } =
    useBatchComparisons(briefingBatchRequest);
  const {
    data: briefingPlaceComparisons,
    isLoading: briefingPlaceLoading,
  } = usePlaceBatchComparisons(selectedPlaceId ?? null, briefingPlaceRequest);
  const briefingComparisonsMap = (
    selectedPlaceId != null ? briefingPlaceComparisons : briefingBatchComparisons
  ) as Record<number, Record<ComparisonType, ComparisonResponse>> | undefined;
  const briefingComparisonsLoading =
    selectedPlaceId != null ? briefingPlaceLoading : briefingBatchLoading;

  // District containing the selected place.
  // Fast path: use the district persisted server-side on the place row.
  // Fallback: client-side point-in-polygon (for places saved before migration).
  const briefingPlaceDistrict = useMemo(() => {
    if (selectedPlaceId == null) return null;
    const place = userPlaces.find((p) => p.id === selectedPlaceId);
    if (place?.district != null) return place.district;
    const lat = place?.lat ?? initialPlaceGps?.lat;
    const lng = place?.lng ?? initialPlaceGps?.lng;
    if (lat == null || lng == null || mapShapefiles.length === 0) return null;
    return resolveDistrictFromShapefiles(
      lat,
      lng,
      mapShapefiles,
      primaryStructureIdFromLeaders(mapLeaders),
    );
  }, [selectedPlaceId, userPlaces, initialPlaceGps, mapShapefiles, mapLeaders]);

  // When city has district-level data but no leaders in structure (e.g. Chicago, Oakland), build synthetic leaders so district nav still shows
  const syntheticLeadersFromDistricts = useMemo((): CityLeader[] => {
    if (!cityId || !Array.isArray(publicCityDistricts) || publicCityDistricts.length === 0) {
      return [];
    }

    const hasAtLargeCouncil = mapLeaders.some((l) => l.district === -1);
    const hasNumberedReps = mapLeaders.some((l) => l.district != null && l.district > 0);
    // At-large council cities already list each member; metric district ids are unrelated.
    if (hasAtLargeCouncil && !hasNumberedReps) return [];

    const structures = cityData?.geographic_structures;
    const ranges =
      structures
        ?.filter((s) => s.min_value != null && s.max_value != null)
        .map((s) => ({ min: s.min_value as number, max: s.max_value as number })) ?? [];
    const bounded =
      ranges.length > 0
        ? publicCityDistricts.filter((d) => ranges.some((r) => d >= r.min && d <= r.max))
        : publicCityDistricts;

    return bounded
      .slice()
      .sort((a, b) => a - b)
      .map((d) => ({
        city_id: cityId,
        name: `${geographicUnitLabel} ${d}`,
        title: geographicUnitLabel,
        district: d,
      }));
  }, [cityId, publicCityDistricts, geographicUnitLabel, mapLeaders, cityData?.geographic_structures]);

  /**
   * Official selector options: city structure leaders (mayor + named council), plus any
   * district numbers that have metric precomputes but are missing from structure — e.g. Oakland
   * with only a mayor row in `leaders` would otherwise hide District 1–7 even when data exists.
   */
  const effectiveLeaders = useMemo(() => {
    if (syntheticLeadersFromDistricts.length === 0) {
      return mapLeaders;
    }
    if (mapLeaders.length === 0) {
      return syntheticLeadersFromDistricts;
    }
    const mapDistricts = new Set(
      mapLeaders.map((l) =>
        l.district === null || l.district === undefined || l.district === 0 ? 0 : l.district,
      ),
    );
    const extras = syntheticLeadersFromDistricts.filter(
      (s) => s.district != null && !mapDistricts.has(s.district),
    );
    if (extras.length === 0) {
      return mapLeaders;
    }
    return [...mapLeaders, ...extras].sort((a, b) => {
      const da = a.district === null || a.district === undefined ? 0 : a.district;
      const db = b.district === null || b.district === undefined ? 0 : b.district;
      return da - db;
    });
  }, [mapLeaders, syntheticLeadersFromDistricts]);

  /**
   * Leaders for the briefing header: uses lean public leaders (fast, no auth)
   * until the full city structure loads, then switches to mapLeaders.
   * `effectiveLeaders` (which may lag) continues to be used for the scope
   * selector and map tab which need the full data.
   */
  const briefingEffectiveLeaders = useMemo(() => {
    const base = mapLeaders.length > 0 ? mapLeaders : (leanLeaders as CityLeader[]);
    if (syntheticLeadersFromDistricts.length === 0) return base;
    if (base.length === 0) return syntheticLeadersFromDistricts;
    const baseDistricts = new Set(
      base.map((l) => (l.district === null || l.district === undefined ? 0 : l.district)),
    );
    const extras = syntheticLeadersFromDistricts.filter(
      (s) => s.district != null && !baseDistricts.has(s.district),
    );
    if (extras.length === 0) return base;
    return [...base, ...extras].sort((a, b) => {
      const da = a.district === null || a.district === undefined ? 0 : a.district;
      const db = b.district === null || b.district === undefined ? 0 : b.district;
      return da - db;
    });
  }, [mapLeaders, leanLeaders, syntheticLeadersFromDistricts]);

  // Compute mayor subtitle for the hero header (e.g. "Mayor: Daniel Lurie")
  const heroSubtitle = useMemo(() => {
    const mayor = pickCitywideLeader(effectiveLeaders);
    if (mayor?.name) {
      const title = mayor.title?.toLowerCase().includes("mayor") ? "Mayor" : (mayor.title || "Mayor");
      return `${title}: ${mayor.name}`;
    }
    return undefined;
  }, [effectiveLeaders]);

  // Mutations for save/unsave
  const saveCityMutation = useSaveCity();
  const unsaveCityMutation = useUnsaveCity();

  // Auth for user places (My places)
  const { getAccessTokenSilently, isAuthenticated } = useAuth0();
  useEffect(() => {
    if (!cityId || !cityLoaded || !isAuthenticated) {
      setUserPlaces([]);
      return;
    }
    let cancelled = false;
    getAccessTokenSilently()
      .then((token) => listMyPlaces(token, { city_id: cityId }))
      .then((res) => {
        if (!cancelled) {
          setUserPlaces(
            res.places.map((p) => ({
              id: p.id,
              label: p.label,
              city_id: p.city_id,
              lat: p.lat,
              lng: p.lng,
              radius_m: p.radius_m,
              district: p.district ?? null,
            }))
          );
          setLastPlaceRefreshAt(res.place_refresh_last_run_at ?? null);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setUserPlaces([]);
          setLastPlaceRefreshAt(null);
        }
      });
    return () => { cancelled = true; };
  }, [cityId, cityLoaded, isAuthenticated, getAccessTokenSilently, placesRefreshKey]);

  // Determine if current city is saved (still used for sidebar/onboarding, not header)
  const isCitySaved = useMemo(() => {
    return savedCities.some((city) => city.id === cityId);
  }, [savedCities, cityId]);

  // Follow state for header: current selected district (0 = citywide)
  const headerDistrictStr = String(selectedDistrict ?? 0);
  const isFollowed = !!(followedDistricts[headerDistrictStr]);
  const followPending = followMutation.isPending || unfollowMutation.isPending;
  const headerFollowerCount = leaderFollowerCounts?.[headerDistrictStr];
  const handleHeaderFollowToggle = useCallback(() => {
    if (followPending) return;
    const label =
      headerDistrictStr === "0"
        ? cityData?.name || "this city"
        : `${geographicUnitLabel} ${headerDistrictStr}`;
    if (isFollowed) {
      unfollowMutation.mutate(headerDistrictStr, {
        onSuccess: () => toast.success(`Unfollowed ${label}`),
      });
    } else {
      followMutation.mutate(headerDistrictStr, {
        onSuccess: () =>
          toast.success(`Following ${label}`, {
            description: "You'll get weekly updates",
          }),
      });
    }
  }, [
    followPending,
    isFollowed,
    unfollowMutation,
    followMutation,
    headerDistrictStr,
    cityData?.name,
    geographicUnitLabel,
  ]);

  /** District follow sits beside the official selector; keep a single Follow control (not duplicated in the hero). */
  const followInlineWithDistrictSelector = useMemo(() => {
    const d = selectedDistrict ?? 0;
    return d > 0 && selectedPlaceId == null;
  }, [selectedDistrict, selectedPlaceId]);

  // Month-to-date on the map when opening a newly saved place (Search Cities / bootstrap job).
  useEffect(() => {
    if (
      bootstrapPlaceMetricsForPlaceId != null &&
      initialPlaceId != null &&
      bootstrapPlaceMetricsForPlaceId === initialPlaceId
    ) {
      setMetricDateRange(getPresetMetricDateRange("mtd"));
    }
  }, [bootstrapPlaceMetricsForPlaceId, initialPlaceId]);

  // Clear old city data immediately when cityId changes
  useEffect(() => {
    if (previousCityIdRef.current !== null && previousCityIdRef.current !== cityId) {
      // City is switching - clear old data immediately
      setMapLeaders([]);
      setMapShapefiles([]);
      setIsCityDataReady(false);
      setSelectedDistrict(initialDistrict ?? 0);
      setDistrictGPSLocation(null);
      setMetricDateRange(getPresetMetricDateRange("ytd"));
    }
    previousCityIdRef.current = cityId;
  }, [cityId, initialDistrict]);

  // Update selected district when cityId or initialDistrict changes
  useEffect(() => {
    if (initialDistrict !== undefined) {
      // If initialDistrict is explicitly null, use 0 (citywide); otherwise use the provided value
      setSelectedDistrict(initialDistrict !== null ? initialDistrict : 0);
    }
  }, [cityId, initialDistrict]);

  // When initialPlaceId changes (e.g. from sidebar): select that place, or clear place when switching to a district
  useEffect(() => {
    if (initialPlaceId != null) {
      setSelectedPlaceId(initialPlaceId);
      setSelectedDistrict(0); // Place scope; district nav shows "My place" etc.
    } else {
      // User clicked a district in the sidebar (initialPlaceId was set to null) — clear place so district selection sticks
      setSelectedPlaceId(null);
    }
  }, [cityId, initialPlaceId]);

  // Sync Official Selector selection to parent so the left nav can highlight the matching item
  useEffect(() => {
    onOfficialSelectionChange?.({
      district: selectedDistrict,
      placeId: selectedPlaceId,
    });
  }, [selectedDistrict, selectedPlaceId, onOfficialSelectionChange]);

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

  // Sync activeSection when initialSection prop changes (e.g. sidebar Dashboard/Map shortcut)
  useEffect(() => {
    if (initialSection) {
      setActiveSection(
        resolveCityViewSection(initialSection, isAdmin, canAccessMap),
      );
    }
  }, [initialSection, isAdmin, canAccessMap]);

  useEffect(() => {
    if (!isAdmin && activeSection !== "briefing") {
      setActiveSection("briefing");
      return;
    }
    // Place mode for non-global-admins: leave the map tab and unmount it.
    if (!canAccessMap && activeSection === "map") {
      setActiveSection("briefing");
    }
  }, [isAdmin, canAccessMap, activeSection]);

  useEffect(() => {
    if (!canAccessMap) {
      setMapTabMounted(false);
    }
  }, [canAccessMap]);

  // Load leaders/shapefiles for district navigation when the map is not mounted.
  // (Map tab used to always mount for admins and supply this via onDataReady.)
  useEffect(() => {
    if (mapTabMounted || !cityLoaded || !cityId) return;

    let cancelled = false;

    const loadNavData = async () => {
      try {
        const token = await getAccessTokenSilently();
        const structureData = await getCityStructure(cityId, token).catch(() => null);
        if (cancelled) return;

        let layersData: Awaited<ReturnType<typeof getCityShapeLayers>> = [];
        try {
          layersData = await getCityShapeLayers(cityId, token, true);
        } catch {
          layersData = [];
        }
        if (cancelled) return;

        const shapefilesData = layersData
          .map((layer) => layer.instance)
          .filter((instance): instance is NonNullable<typeof instance> => !!instance);

        setMapLeaders(structureData?.leaders || []);
        setMapShapefiles(shapefilesData);
        setIsCityDataReady(true);
      } catch {
        if (!cancelled) {
          setMapLeaders([]);
          setMapShapefiles([]);
          setIsCityDataReady(true);
        }
      }
    };

    void loadNavData();
    return () => {
      cancelled = true;
    };
  }, [mapTabMounted, cityLoaded, cityId, getAccessTokenSilently]);

  // When switching to the Map tab, Mapbox needs a resize event to recalculate
  // its canvas dimensions (the container was display:none while hidden).
  useEffect(() => {
    if (activeSection === "map") {
      // Small delay so the display:none is removed before resize fires
      const timer = requestAnimationFrame(() => {
        window.dispatchEvent(new Event("resize"));
      });
      return () => cancelAnimationFrame(timer);
    }
  }, [activeSection]);

  // Lazy-mount the Map tab only once the admin opens it, so map-data and
  // structure queries do not run while the user is on Dashboard / place views.
  useEffect(() => {
    if (activeSection === "map" && canAccessMap && !mapTabMounted) {
      setMapTabMounted(true);
    }
  }, [activeSection, canAccessMap, mapTabMounted]);

  // Lazy-mount the Alerts tab only once the admin first opens it, so its
  // queries don't fire for users who never visit the tab.
  useEffect(() => {
    if (activeSection === "alerts" && !alertsTabMounted) {
      setAlertsTabMounted(true);
    }
  }, [activeSection, alertsTabMounted]);

  // Lazy-mount the legacy full dashboard when first needed: the admin
  // "All metrics" tab, the briefing "All metrics" header toggle, or place
  // scope (place metrics bootstrap/job polling lives inside it).
  useEffect(() => {
    if (
      !fullDashboardMounted &&
      (activeSection === "full_dashboard" ||
        browseAllExpanded ||
        selectedPlaceId != null)
    ) {
      setFullDashboardMounted(true);
    }
  }, [activeSection, browseAllExpanded, selectedPlaceId, fullDashboardMounted]);

  // Close admin drawer on Escape
  useEffect(() => {
    if (!adminDrawerOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setAdminDrawerOpen(false);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [adminDrawerOpen]);

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

  // Only show full loading when we have no data yet (initial load). If we have cached city data, keep showing it during refetch to avoid "load → disappear → re-load" flash.
  const loading = loadingCity && !cityData;
  const error = cityError ? (cityError as Error).message : null;

  if (loading) {
    return (
      <div className="city-view-loading tc-loading-state" style={{ padding: "40px" }}>
        <Loader size="sm" color="dark" />
        <span>Loading dashboard…</span>
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

  /** Official/place selector — rendered as the header bar on legacy admin
   *  tabs, or bar-less (modal only) on the briefing where the hero card is
   *  the trigger. */
  const renderDistrictNavigation = (hideBar: boolean) => (
    <DistrictNavigation
      selectedDistrict={selectedDistrict}
      leaders={effectiveLeaders}
      shapefiles={mapShapefiles}
      onDistrictSelect={(district) => {
        setSelectedDistrict(district);
        setSelectedPlaceId(null);
        setDistrictGPSLocation(null);
      }}
      onGPSLocation={(location) => setDistrictGPSLocation(location)}
      leaderFollowerCounts={leaderFollowerCounts}
      cityId={cityId}
      newsletterQueriesEnabled={cityLoaded}
      onDistrictFollowToggle={
        followInlineWithDistrictSelector ? handleHeaderFollowToggle : undefined
      }
      isDistrictFollowed={isFollowed}
      districtFollowPending={followPending}
      districtFollowerCount={headerFollowerCount}
      userPlaces={userPlaces}
      selectedPlaceId={selectedPlaceId}
      onPlaceSelect={(id) => {
        setSelectedPlaceId(id);
        if (id != null) {
          setSelectedDistrict(null);
        }
      }}
      onPlaceSaved={(place) => {
        setPlacesRefreshKey((k) => k + 1);
        onRequestPlaceMetricsBootstrap?.(place.id);
      }}
      openTrigger={openDistrictTrigger}
      hideTriggerBar={hideBar}
      placeRefreshLastRunAt={lastPlaceRefreshAt}
      geographicStructures={cityData.geographic_structures}
    />
  );

  const isBriefingActive = activeSection === "briefing";

  /** Legacy full dashboard ("All metrics"): rendered inline when the
   *  briefing header toggle selects it, or as the admin tab panel.
   *  Single element so the place metrics bootstrap/job wiring inside
   *  DashboardMetricsSection never mounts twice. */
  const fullDashboardVisible =
    activeSection === "full_dashboard" ||
    (activeSection === "briefing" && browseAllExpanded);
  const fullDashboardInline = activeSection === "briefing";
  const fullDashboardEl = !fullDashboardMounted ? null : (
        <section
          ref={dashboardSectionRef}
          className={`city-view-dashboard-section city-view-tab-content${fullDashboardInline ? " city-view-dashboard-section--inline" : ""}${!fullDashboardVisible ? " city-view-tab-hidden" : ""}`}
          id="dashboard-section"
          aria-label="All metrics"
          role="tabpanel"
          aria-hidden={!fullDashboardVisible}
        >
          {/* Place job running: replace dashboard with billboard-style indicator */}
          {isPlaceJobRunning && selectedPlaceId != null && fullDashboardVisible && (
              <div className="city-view-place-job-billboard" role="status" aria-live="polite">
                <Loader size="sm" color="purple" className="city-view-place-job-billboard__loader" />
                <div className="city-view-place-job-billboard__body">
                  <p className="city-view-place-job-billboard__title">
                    Building your My Place dashboard
                  </p>
                  <p className="city-view-place-job-billboard__text">
                    Pulling public data for My Place. Prior newsletters below. New edition every Sunday.
                  </p>
                </div>
              </div>
          )}

          {/* DashboardMetricsSection stays mounted while job runs so polling continues */}
          <div style={isPlaceJobRunning && selectedPlaceId != null ? { display: "none" } : undefined}>
            <DashboardMetricsSection
              metrics={cityData.metrics || []}
              cityId={cityId}
              cityName={cityData.name}
              selectedDistrict={selectedDistrict}
              leaders={isCityDataReady ? effectiveLeaders : []}
              shapefiles={isCityDataReady ? mapShapefiles : []}
              onDistrictChange={(d) => {
                setSelectedDistrict(d);
                setSelectedPlaceId(null);
              }}
              onGPSLocation={setDistrictGPSLocation}
              onMetricClick={(metricId: number, district?: number | null, placeId?: number | null) => {
                const resolvedPlaceId = placeId ?? selectedPlaceId;
                setSelectedMetricId(metricId);
                setSelectedMetricPlaceId(resolvedPlaceId);
                setSelectedMetricDistrict(
                  resolvedPlaceId != null ? null : (district ?? selectedDistrict)
                );
              }}
              leaderFollowerCounts={leaderFollowerCounts}
              newsletterQueriesEnabled={cityLoaded}
              userPlaces={userPlaces}
              selectedPlaceId={selectedPlaceId}
              onPlaceSelect={(id) => {
                setSelectedPlaceId(id);
                if (id != null) {
                  setSelectedDistrict(null);
                }
              }}
              onPlaceSaved={() => setPlacesRefreshKey((k) => k + 1)}
              openDistrictTrigger={openDistrictTrigger}
              bootstrapPlaceMetricsForPlaceId={bootstrapPlaceMetricsForPlaceId}
              onConsumePlaceMetricsBootstrap={onConsumePlaceMetricsBootstrap}
              lastRefreshAt={lastPlaceRefreshAt}
              geographicUnitLabel={geographicUnitLabel}
              onEditMetrics={() => setUserOrderDialogOpen(true)}
              onJobRunningChange={setIsPlaceJobRunning}
              comparisonType={briefingComparisonType}
              onComparisonTypeChange={setBriefingComparisonType}
            />
          </div>
        </section>
  );

  return (
    <div className="city-view city-view-single-page">
      {/* Scrollable body: everything scrolls as a single page. On the briefing
          the hero card is the page header; legacy admin tabs keep the old
          city header + selector bar. */}
      <main id="main-content" className="city-view-scroll-body">
        {/* Legacy header (city name, follow, admin) — only on non-briefing tabs */}
        {!isBriefingActive && (
        <div className="city-view-hero-header">
          <CityHeader
            emoji={cityData.emoji || undefined}
            name={cityData.name}
            subtitle={undefined}
            metricDateRange={metricDateRange}
            onMetricDateRangeChange={setMetricDateRange}
            variant="overlay"
            visible={true}
            showDateRange={false}
            cityId={cityId}
            selectedDistrict={selectedDistrict}
            districtUnitLabel={geographicUnitLabel}
            isFollowed={isFollowed}
            followPending={followPending}
            followerCount={headerFollowerCount}
            onFollowToggle={
              followInlineWithDistrictSelector ? undefined : handleHeaderFollowToggle
            }
            showAdminIcon={isAdmin}
            onAdminClick={() => setAdminDrawerOpen(true)}
            followedCities={savedCities.filter((c) => c.id !== cityId)}
            onCityChange={onCityChange ? (id) => onCityChange(id, activeSection) : undefined}
          />
        </div>
        )}

        {/* Sticky bar: tabs (admins). Selector bar only on legacy tabs — on the
            briefing the hero card opens the selector modal instead. */}
        {(visibleSections.length > 1 || !isBriefingActive) && (
        <header className="city-view-sticky-header">
          {/* Tab nav: Overview | All metrics | Map | Alerts (all but Overview admin only) */}
          {visibleSections.length > 1 ? (
            <nav className="city-view-tab-nav" aria-label="City view tabs" role="tablist">
              {visibleSections.map((s) => (
                <button
                  key={s}
                  type="button"
                  className={`city-view-tab-btn${activeSection === s ? " city-view-tab-btn-active" : ""}`}
                  onClick={() => setActiveSection(s)}
                  aria-selected={activeSection === s}
                  role="tab"
                >
                  {SECTION_LABELS[s]}
                </button>
              ))}
            </nav>
          ) : null}
          {/* Show DistrictNavigation bar only on legacy tabs, when there are districts or a place */}
          {!isBriefingActive && isCityDataReady && effectiveLeaders.length > 0 && (effectiveLeaders.some(l => {
            const d = l.district;
            return d != null && d > 0;
          }) || selectedPlaceId != null) ? (
            <div className="city-view-place-selector-row">
              {renderDistrictNavigation(false)}
            </div>
          ) : null}
        </header>
        )}
        {(() => {
          const selectedPlace =
            selectedPlaceId != null
              ? userPlaces.find((p) => p.id === selectedPlaceId)
              : null;
          const selectedPlaceGps =
            selectedPlace?.lat != null && selectedPlace?.lng != null
              ? { lat: selectedPlace.lat, lng: selectedPlace.lng }
              : selectedPlaceId != null && initialPlaceGps != null
                ? { lat: initialPlaceGps.lat, lng: initialPlaceGps.lng }
                : undefined;
          const selectedPlaceRadiusM =
            selectedPlace?.radius_m ??
            (selectedPlaceId != null ? initialPlaceGps?.radius_m : undefined);

          return (
            <>
        {/* Map tab: only for users with map access; content mounts on first open and
            stays mounted but inactive (no map-data calls) while another tab is selected.
            Place mode is global-admin only — city leads do not mount the map there. */}
        {canAccessMap ? (
          <section
            ref={mapSectionRef}
            className={`city-view-map-section city-view-tab-content${activeSection !== "map" ? " city-view-tab-hidden" : ""}`}
            id="map-section"
            aria-label="Map"
            role="tabpanel"
            aria-hidden={activeSection !== "map"}
          >
            {mapTabMounted ? (
              <>
                <div className="city-view-map-date-overlay">
                  <MetricDateRangeSelector
                    value={metricDateRange}
                    onChange={setMetricDateRange}
                  />
                </div>
                <CityMapView
                  cityId={cityId}
                  isAdmin={isAdmin}
                  isActive={activeSection === "map"}
                  cityData={cityData}
                  metricDateRange={metricDateRange}
                  gpsLocation={
                    selectedPlaceId != null
                      ? selectedPlaceGps ?? ((districtGPSLocation || gpsLocation) ?? undefined)
                      : selectedDistrict != null && selectedDistrict !== 0
                        ? undefined
                        : (districtGPSLocation || gpsLocation) ?? undefined
                  }
                  selectedPlaceRadiusM={selectedPlaceId != null ? selectedPlaceRadiusM : undefined}
                  placeLabel={selectedPlaceId != null ? (userPlaces.find((p) => p.id === selectedPlaceId)?.label ?? null) : null}
                  selectedDistrict={selectedDistrict}
                  onDistrictChange={setSelectedDistrict}
                  onDataReady={(data) => {
                    setMapLeaders(data.leaders);
                    setMapShapefiles(data.shapefiles);
                    setIsCityDataReady(true);
                  }}
                />
              </>
            ) : null}
          </section>
        ) : null}

        {/* Briefing (Overview) — the default fast path for everyone */}
        <section
          className={`city-view-briefing-section city-view-tab-content${activeSection !== "briefing" ? " city-view-tab-hidden" : ""}`}
          id="briefing-section"
          aria-label="Overview"
          role="tabpanel"
          aria-hidden={activeSection !== "briefing"}
        >
          {/* Place job running (e.g. newly saved place): show billboard above the briefing */}
          {isPlaceJobRunning && selectedPlaceId != null && (
            <div className="city-view-place-job-billboard" role="status" aria-live="polite">
              <Loader size="sm" color="purple" className="city-view-place-job-billboard__loader" />
              <div className="city-view-place-job-billboard__body">
                <p className="city-view-place-job-billboard__title">
                  Building your My Place dashboard
                </p>
                <p className="city-view-place-job-billboard__text">
                  Pulling public data for My Place. Prior newsletters below. New edition every Sunday.
                </p>
              </div>
            </div>
          )}
          <BriefingHome
            cityId={cityId}
            scopeLabel={
              selectedPlaceId != null
                ? selectedPlace?.label ?? initialPlaceLabel ?? "My place"
                : (selectedDistrict ?? 0) > 0
                  ? `${geographicUnitLabel} ${selectedDistrict}`
                  : cityData.name
            }
            scopeContext={
              selectedPlaceId != null
                ? `${cityData.name}${selectedPlaceRadiusM ? ` · ${selectedPlaceRadiusM}m` : ""}`
                : (selectedDistrict ?? 0) > 0
                  ? cityData.name
                  : heroSubtitle ?? null
            }
            selectedDistrict={selectedDistrict}
            selectedPlaceId={selectedPlaceId}
            placeDistrict={briefingPlaceDistrict}
            sketch={boundarySketch}
            placeLat={selectedPlaceId != null ? (userPlaces.find((p) => p.id === selectedPlaceId)?.lat ?? null) : null}
            placeLng={selectedPlaceId != null ? (userPlaces.find((p) => p.id === selectedPlaceId)?.lng ?? null) : null}
            placeRadiusM={selectedPlaceId != null ? (userPlaces.find((p) => p.id === selectedPlaceId)?.radius_m ?? null) : null}
            metrics={briefingMetrics}
            comparisonsMap={briefingComparisonsMap ?? {}}
            comparisonsLoading={briefingComparisonsLoading}
            comparisonType={briefingComparisonType}
            onComparisonTypeChange={setBriefingComparisonType}
            leaders={briefingEffectiveLeaders}
            isFollowing={isFollowed}
            followPending={followPending}
            onFollowToggle={handleHeaderFollowToggle}
            cityEmoji={cityData.emoji ?? null}
            geographicUnitLabel={geographicUnitLabel}
            onOpenScopeSelector={() => setOpenDistrictTrigger((t) => t + 1)}
            placeLoadingLabel={selectedPlaceId == null ? pendingPlaceLabel : null}
            onMetricClick={(metricId: number) => {
              setSelectedMetricId(metricId);
              setSelectedMetricPlaceId(selectedPlaceId);
              setSelectedMetricDistrict(selectedPlaceId != null ? null : selectedDistrict);
            }}
            browseAllExpanded={browseAllExpanded}
            onBrowseAllChange={setBrowseAllExpanded}
            onDistrictSelect={(d) => {
              setSelectedDistrict(d);
              setSelectedPlaceId(null);
            }}
            fullDashboardSlot={isBriefingActive ? fullDashboardEl : null}
          />
          {/* Selector modal (bar-less) — the hero card above triggers it */}
          {isBriefingActive && renderDistrictNavigation(true)}
        </section>

        {/* Legacy full dashboard as the admin "All metrics" tab panel. On the
            briefing it renders inline via fullDashboardSlot instead. */}
        {!isBriefingActive && fullDashboardEl}

        {/* Alerts tab content (admin only) – lazy-mounted the first time the tab is opened */}
        {isAdmin && (
          <section
            className={`city-view-alerts-section city-view-tab-content${activeSection !== "alerts" ? " city-view-tab-hidden" : ""}`}
            id="alerts-section"
            aria-label="Alerts"
            role="tabpanel"
            aria-hidden={activeSection !== "alerts"}
          >
            {alertsTabMounted ? (
              <AnomaliesTabPanel
                cityId={cityId}
                cityName={cityData.name}
                metrics={cityData.metrics || []}
                initialDistrict={selectedDistrict}
                selectedPlaceId={selectedPlaceId}
                userPlaces={userPlaces}
                hideSectionTitle
                onMetricClick={(metricId, district) => {
                  setSelectedMetricId(metricId);
                  setSelectedMetricPlaceId(selectedPlaceId);
                  setSelectedMetricDistrict(
                    selectedPlaceId != null ? null : (district ?? selectedDistrict)
                  );
                }}
              />
            ) : (
              <div className="city-view-alerts-placeholder">
                <div className="city-view-alerts-placeholder-loading">
                  <Loader size="sm" color="dark" />
                  <span>Loading…</span>
                </div>
              </div>
            )}
          </section>
        )}
            </>
          );
        })()}
      </main>

      {/* Admin drawer - slide-over with CityDataAdmin */}
      {adminDrawerOpen && (
        <div className="city-view-admin-drawer-overlay" aria-modal="true" role="dialog">
          <button
            type="button"
            className="city-view-admin-drawer-backdrop"
            onClick={() => setAdminDrawerOpen(false)}
            aria-label="Close admin panel"
            tabIndex={0}
          />
          <div className="city-view-admin-drawer-panel">
            <div className="city-view-admin-drawer-header">
              <h2 className="city-view-admin-drawer-title">City data admin</h2>
              <button
                type="button"
                className="city-view-admin-drawer-close"
                onClick={() => setAdminDrawerOpen(false)}
                aria-label="Close admin panel"
              >
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="city-view-admin-drawer-content">
              <CityDataAdmin cityId={cityId} embedded />
            </div>
          </div>
        </div>
      )}

      {/* User metric order dialog (customize dashboard order) */}
      {cityData && (
        <UserMetricOrderDialog
          cityId={cityId}
          cityName={cityData.name}
          metrics={(cityData.metrics || []).map((m) => ({
            id: m.id,
            metric_name: m.metric_name,
            category: m.category ?? undefined,
            subcategory: m.subcategory ?? null,
            sub_category: m.subcategory ?? null,
          }))}
          open={userOrderDialogOpen}
          onClose={() => setUserOrderDialogOpen(false)}
        />
      )}

      {/* Metric Detail Modal */}
      {cityData && (() => {
        const metricPlace =
          selectedMetricPlaceId != null
            ? userPlaces.find((p) => p.id === selectedMetricPlaceId) ?? null
            : null;
        return (
          <MetricDetailModal
            metricId={selectedMetricId}
            cityName={cityData.name}
            citySlug={slugify(cityData.name)}
            isOpen={selectedMetricId !== null}
            onClose={() => {
              setSelectedMetricId(null);
              setSelectedMetricDistrict(null);
              setSelectedMetricPlaceId(null);
            }}
            district={selectedMetricDistrict}
            placeId={selectedMetricPlaceId}
            placeLabel={metricPlace?.label ?? null}
            placeLat={metricPlace?.lat ?? null}
            placeLng={metricPlace?.lng ?? null}
            placeRadiusM={metricPlace?.radius_m ?? null}
          />
        );
      })()}
    </div>
  );
}

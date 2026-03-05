"use client";

import React, { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { useTheme } from "@/contexts/ThemeContext";
import styles from "./TimeSeriesChart.module.css";

// Dynamically import Plotly to avoid SSR issues
const Plot = dynamic(
  () => import("react-plotly.js"),
  { ssr: false }
) as React.ComponentType<import("react-plotly.js").PlotParams>;

export type PeriodType = "day" | "week" | "month" | "year" | "ytd";

export interface TimeSeriesDataPoint {
  time_period: string;
  numeric_value: number;
  group_value?: string | null;
}

// Extended type for internal processing with parsed dates
type TimeSeriesDataPointWithDate = TimeSeriesDataPoint & { date: Date };

// Info about excluded partial periods
export interface PartialPeriodInfo {
  excludedStart?: string;
  excludedEnd?: string;
  periodType: PeriodType;
}

export interface TimeSeriesChartProps {
  data: TimeSeriesDataPoint[];
  metadata?: {
    chart_title?: string;
    caption?: string;
    y_axis_label?: string;
    object_name?: string;
    field_name?: string;
    period_type?: string; // Source data period type (day, week, month, year)
    district?: number | null; // District number (0 = citywide)
  };
  height?: number;
  defaultPeriod?: PeriodType;
  fullBleed?: boolean; // If true, removes border/padding for edge-to-edge display
  hidePeriodSelector?: boolean; // If true, hides the period selector
  showExternalTitle?: boolean; // If true, shows title above chart instead of inside
  onPeriodChange?: (period: PeriodType) => void; // Callback when period selector changes
}

/**
 * Color palette matching map mode - ColorBrewer Set3 with brand primary as first color
 */
const SERIES_COLORS = [
  "#ad35fa", // Brand primary (purple)
  "#8dd3c7", // Teal
  "#ffffb3", // Yellow
  "#bebada", // Lavender
  "#fb8072", // Coral
  "#80b1d3", // Light blue
  "#fdb462", // Orange
  "#b3de69", // Light green
  "#fccde5", // Pink
  "#d9d9d9", // Light gray
  "#bc80bd", // Purple
  "#ccebc5", // Mint green
];

/**
 * Get ISO year and week for a date (handles year boundaries correctly).
 * Returns {isoYear, isoWeek} where isoYear is the ISO year (may differ from calendar year).
 */
function getISOYearAndWeek(date: Date): { isoYear: number; isoWeek: number } {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const isoWeek = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  const isoYear = d.getUTCFullYear();
  return { isoYear, isoWeek };
}

/**
 * Get day of year (1-366) for a date.
 */
function getDayOfYear(date: Date): number {
  const startOfYear = new Date(date.getFullYear(), 0, 1);
  return Math.floor((date.getTime() - startOfYear.getTime()) / (1000 * 60 * 60 * 24)) + 1;
}

/**
 * Get the number of days in a month.
 */
function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

/**
 * Compute the period key for today so we can reliably identify in-progress periods.
 */
function getCurrentPeriodKey(periodType: PeriodType): string | null {
  const now = new Date();
  if (periodType === "day") {
    const y = now.getFullYear();
    const m = (now.getMonth() + 1).toString().padStart(2, "0");
    const d = now.getDate().toString().padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  if (periodType === "week") {
    const { isoYear, isoWeek } = getISOYearAndWeek(now);
    return `${isoYear}-W${isoWeek.toString().padStart(2, "0")}`;
  }
  if (periodType === "month") {
    return `${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, "0")}`;
  }
  if (periodType === "year") {
    return now.getFullYear().toString();
  }
  return null;
}

/**
 * Identifies and filters out partial periods from the start and end of aggregated data.
 * Returns the filtered data and info about what was excluded.
 *
 * Uses two complementary checks:
 *   1. Calendar check – the current in-progress period is always partial.
 *   2. Data-boundary check – the first/last raw-data date may sit inside a
 *      period boundary (e.g. data starts mid-week).
 */
function filterPartialPeriods(
  aggregatedByGroup: Map<string, TimeSeriesDataPoint[]>,
  periodType: PeriodType,
  originalData: TimeSeriesDataPoint[]
): { filtered: Map<string, TimeSeriesDataPoint[]>; partialInfo: PartialPeriodInfo | null } {
  if (periodType === "ytd") {
    return { filtered: aggregatedByGroup, partialInfo: null };
  }

  let excludedStart: string | undefined;
  let excludedEnd: string | undefined;
  let startPeriodToExclude: string | undefined;
  let endPeriodToExclude: string | undefined;

  // --- Calendar check: always exclude the current in-progress period at the end ---
  const currentPeriodKey = getCurrentPeriodKey(periodType);
  if (currentPeriodKey) {
    let hasCurrentPeriod = false;
    for (const points of aggregatedByGroup.values()) {
      if (points.some((p) => p.time_period === currentPeriodKey)) {
        hasCurrentPeriod = true;
        break;
      }
    }
    if (hasCurrentPeriod) {
      endPeriodToExclude = currentPeriodKey;
      const now = new Date();
      if (periodType === "day") {
        excludedEnd = `Today in progress (${now.toLocaleDateString("en-US", { month: "short", day: "numeric" })})`;
      } else if (periodType === "week") {
        const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
        excludedEnd = `Current week in progress (through ${dayNames[now.getDay()]} ${now.toLocaleDateString("en-US", { month: "short", day: "numeric" })})`;
      } else if (periodType === "month") {
        excludedEnd = `Current month in progress (${now.toLocaleDateString("en-US", { month: "long", year: "numeric" })})`;
      } else if (periodType === "year") {
        excludedEnd = `Current year in progress (${now.getFullYear()})`;
      }
    }
  }

  // --- Data-boundary check: first period may be partial if data starts mid-period ---
  const dates = originalData
    .map((p) => {
      // Parse as local date parts to avoid UTC timezone shift
      const match = p.time_period.match(/^(\d{4})-(\d{2})-(\d{2})/);
      if (match) {
        return new Date(parseInt(match[1]), parseInt(match[2]) - 1, parseInt(match[3]));
      }
      const d = new Date(p.time_period);
      return isNaN(d.getTime()) ? null : d;
    })
    .filter((d): d is Date => d !== null)
    .sort((a, b) => a.getTime() - b.getTime());

  if (dates.length > 0) {
    const firstDate = dates[0];

    if (periodType === "week") {
      const firstDayOfWeek = firstDate.getDay();
      if (firstDayOfWeek !== 1) { // 1 = Monday
        const { isoYear, isoWeek } = getISOYearAndWeek(firstDate);
        startPeriodToExclude = `${isoYear}-W${isoWeek.toString().padStart(2, "0")}`;
        const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
        excludedStart = `Partial week starting ${dayNames[firstDayOfWeek]} ${firstDate.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`;
      }
    } else if (periodType === "month") {
      if (firstDate.getDate() !== 1) {
        const year = firstDate.getFullYear();
        const month = firstDate.getMonth() + 1;
        startPeriodToExclude = `${year}-${month.toString().padStart(2, "0")}`;
        excludedStart = `Partial ${firstDate.toLocaleDateString("en-US", { month: "long", year: "numeric" })} (starts day ${firstDate.getDate()})`;
      }
    } else if (periodType === "year") {
      if (firstDate.getMonth() !== 0 || firstDate.getDate() !== 1) {
        startPeriodToExclude = firstDate.getFullYear().toString();
        excludedStart = `Partial ${firstDate.getFullYear()} (starts ${firstDate.toLocaleDateString("en-US", { month: "short", day: "numeric" })})`;
      }
    }
  }

  if (!startPeriodToExclude && !endPeriodToExclude) {
    return { filtered: aggregatedByGroup, partialInfo: null };
  }

  const filtered = new Map<string, TimeSeriesDataPoint[]>();

  for (const [groupValue, points] of aggregatedByGroup.entries()) {
    const filteredPoints = points.filter((point) => {
      if (startPeriodToExclude && point.time_period === startPeriodToExclude) {
        return false;
      }
      if (endPeriodToExclude && point.time_period === endPeriodToExclude) {
        return false;
      }
      return true;
    });

    if (filteredPoints.length > 0) {
      filtered.set(groupValue, filteredPoints);
    }
  }

  const partialInfo: PartialPeriodInfo = {
    excludedStart,
    excludedEnd,
    periodType,
  };

  return { filtered, partialInfo };
}

/**
 * Aggregates daily data points by the specified period type, preserving group values.
 * Returns data grouped by both time period and group_value.
 * For YTD, returns data grouped by year with day-of-year values.
 */
function aggregateDataByGroup(
  data: TimeSeriesDataPoint[],
  periodType: PeriodType
): Map<string, TimeSeriesDataPoint[]> {
  // Parse dates as LOCAL dates to avoid UTC timezone shift
  // (new Date("2026-02-16") is UTC midnight which displays as Feb 15 in US timezones)
  const dataWithDates = data
    .map((point) => {
      let date: Date;
      if (typeof point.time_period === 'string') {
        const ymd = point.time_period.match(/^(\d{4})-(\d{2})-(\d{2})/);
        if (ymd) {
          date = new Date(parseInt(ymd[1]), parseInt(ymd[2]) - 1, parseInt(ymd[3]));
        } else {
          date = new Date(point.time_period);
        }
      } else {
        date = new Date(point.time_period);
      }
      
      if (isNaN(date.getTime())) {
        console.warn(`Failed to parse date: ${point.time_period}`);
        return null;
      }
      return { ...point, date };
    })
    .filter((p): p is TimeSeriesDataPointWithDate => p !== null);

  if (dataWithDates.length === 0) {
    console.warn('TimeSeriesChart: No valid dates found in data', data);
    return new Map();
  }

  // Sort by date
  dataWithDates.sort((a, b) => a.date.getTime() - b.date.getTime());

  // Special handling for YTD - group by year and use day-of-year
  if (periodType === "ytd") {
    // Check if we have group values (like supervisor_district)
    const hasOriginalGroups = dataWithDates.some(p => p.group_value);
    
    if (hasOriginalGroups) {
      // If we have groups, group by original group_value first, then by year
      const groupedByOriginalGroup = new Map<string, Map<string, TimeSeriesDataPointWithDate[]>>();
      
      for (const point of dataWithDates) {
        const originalGroup = point.group_value || "";
        const year = point.date.getFullYear().toString();
        
        if (!groupedByOriginalGroup.has(originalGroup)) {
          groupedByOriginalGroup.set(originalGroup, new Map());
        }
        const groupYears = groupedByOriginalGroup.get(originalGroup)!;
        
        if (!groupYears.has(year)) {
          groupYears.set(year, []);
        }
        groupYears.get(year)!.push(point);
      }
      
      // For YTD with groups, we want to show each group as a separate series
      // Each series will have multiple years compared
      const aggregatedByGroup = new Map<string, TimeSeriesDataPoint[]>();
      
      for (const [originalGroup, yearGroups] of groupedByOriginalGroup.entries()) {
        for (const [year, points] of yearGroups.entries()) {
          // Group by day-of-year within each year+group combination
          const dayGroups = new Map<number, TimeSeriesDataPointWithDate[]>();
          
          // TypeScript needs explicit type here
          const typedPoints: TimeSeriesDataPointWithDate[] = points;
          for (const point of typedPoints) {
            const dayOfYear = getDayOfYear(point.date);
            
            if (!dayGroups.has(dayOfYear)) {
              dayGroups.set(dayOfYear, []);
            }
            dayGroups.get(dayOfYear)!.push(point);
          }
          
          // Aggregate by day-of-year
          for (const [dayOfYear, dayPoints] of dayGroups.entries()) {
            const sum = dayPoints.reduce((acc, p) => acc + (p.numeric_value || 0), 0);
            const avg = sum / dayPoints.length;
            
            // For YTD with groups, combine original group and year: "GroupName|Year"
            const finalGroupValue = `${originalGroup}|${year}`;
            
            if (!aggregatedByGroup.has(finalGroupValue)) {
              aggregatedByGroup.set(finalGroupValue, []);
            }
            
            aggregatedByGroup.get(finalGroupValue)!.push({
              time_period: dayOfYear.toString(), // Day of year (1-366)
              numeric_value: avg,
              group_value: year, // Store year in group_value for trace identification
            });
          }
        }
      }
      
      // Sort each group's data by day of year
      for (const points of aggregatedByGroup.values()) {
        points.sort((a, b) => {
          const dayA = parseInt(a.time_period);
          const dayB = parseInt(b.time_period);
          return dayA - dayB;
        });
      }
      
      return aggregatedByGroup;
    } else {
      // No original groups - just group by year
      const groupedByYear = new Map<string, TimeSeriesDataPointWithDate[]>();
      
      for (const point of dataWithDates) {
        const year = point.date.getFullYear().toString();
        
        if (!groupedByYear.has(year)) {
          groupedByYear.set(year, []);
        }
        groupedByYear.get(year)!.push(point);
      }
      
      // For YTD without groups, show multiple years compared
      const aggregatedByGroup = new Map<string, TimeSeriesDataPoint[]>();
      
      for (const [year, points] of groupedByYear.entries()) {
        // Group by day-of-year within each year
        const dayGroups = new Map<number, TimeSeriesDataPointWithDate[]>();
        
        // TypeScript needs explicit type here
        const typedPoints: TimeSeriesDataPointWithDate[] = points;
        for (const point of typedPoints) {
          const dayOfYear = getDayOfYear(point.date);
          
          if (!dayGroups.has(dayOfYear)) {
            dayGroups.set(dayOfYear, []);
          }
          dayGroups.get(dayOfYear)!.push(point);
        }
        
        // Aggregate by day-of-year
        for (const [dayOfYear, dayPoints] of dayGroups.entries()) {
          const sum = dayPoints.reduce((acc, p) => acc + (p.numeric_value || 0), 0);
          const avg = sum / dayPoints.length;
          
          // Use year as the group key
          if (!aggregatedByGroup.has(year)) {
            aggregatedByGroup.set(year, []);
          }
          
          aggregatedByGroup.get(year)!.push({
            time_period: dayOfYear.toString(), // Day of year (1-366)
            numeric_value: avg,
            group_value: year, // Store year in group_value for trace identification
          });
        }
      }
      
      // Sort each group's data by day of year
      for (const points of aggregatedByGroup.values()) {
        points.sort((a, b) => {
          const dayA = parseInt(a.time_period);
          const dayB = parseInt(b.time_period);
          return dayA - dayB;
        });
      }
      
      return aggregatedByGroup;
    }
  }

  // For non-YTD periods, use standard aggregation
  // Group by period AND group_value
  const grouped = new Map<string, TimeSeriesDataPointWithDate[]>();

  for (const point of dataWithDates) {
    let timeKey: string;

    if (periodType === "day") {
      timeKey = point.date.toISOString().split("T")[0];
    } else if (periodType === "week") {
      // ISO week format: YYYY-WXX - use ISO year to handle year boundaries correctly
      const { isoYear, isoWeek } = getISOYearAndWeek(point.date);
      timeKey = `${isoYear}-W${isoWeek.toString().padStart(2, "0")}`;
    } else if (periodType === "month") {
      // YYYY-MM format
      const year = point.date.getFullYear();
      const month = point.date.getMonth() + 1;
      timeKey = `${year}-${month.toString().padStart(2, "0")}`;
    } else if (periodType === "year") {
      // YYYY format
      timeKey = point.date.getFullYear().toString();
    } else {
      timeKey = point.date.toISOString().split("T")[0];
    }

    const groupValue = point.group_value || "";
    const key = `${timeKey}|${groupValue}`;

    if (!grouped.has(key)) {
      grouped.set(key, []);
    }
    grouped.get(key)!.push(point);
  }

  // Aggregate values by time period and group
  const aggregatedByGroup = new Map<string, TimeSeriesDataPoint[]>();

  for (const [key, points] of grouped.entries()) {
    const [timePeriod, groupValue] = key.split("|");
    // Aggregate by summing values so weekly/monthly views show totals
    const aggregatedValue = points.reduce(
      (acc, p) => acc + (p.numeric_value || 0),
      0
    );

    const aggregatedPoint: TimeSeriesDataPoint = {
      time_period: timePeriod,
      numeric_value: aggregatedValue,
      group_value: groupValue || null,
    };

    if (!aggregatedByGroup.has(groupValue)) {
      aggregatedByGroup.set(groupValue, []);
    }
    aggregatedByGroup.get(groupValue)!.push(aggregatedPoint);
  }

  // Sort each group's data by time period
  for (const points of aggregatedByGroup.values()) {
    points.sort((a, b) => {
      // Handle ISO week format for proper sorting
      if (a.time_period.includes("W") && b.time_period.includes("W")) {
        const [yearA, weekA] = a.time_period.split("-W").map(Number);
        const [yearB, weekB] = b.time_period.split("-W").map(Number);
        if (yearA !== yearB) return yearA - yearB;
        return weekA - weekB;
      }
      // Handle date strings
      const dateA = new Date(a.time_period);
      const dateB = new Date(b.time_period);
      return dateA.getTime() - dateB.getTime();
    });
  }

  return aggregatedByGroup;
}


/**
 * Format date for display based on period type.
 */
function formatDateLabel(dateStr: string, periodType: PeriodType): string {
  try {
    if (periodType === "week" && dateStr.includes("W")) {
      // ISO week format: YYYY-WXX
      return dateStr;
    } else if (periodType === "month" && dateStr.match(/^\d{4}-\d{2}$/)) {
      // YYYY-MM format - show full date with day (1st of month)
      const [year, month] = dateStr.split("-");
      const date = new Date(parseInt(year), parseInt(month) - 1, 1);
      return date.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
    } else if (periodType === "year") {
      return dateStr;
    } else {
      // Day format: YYYY-MM-DD
      const date = new Date(dateStr);
      if (isNaN(date.getTime())) return dateStr;
      return date.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
    }
  } catch {
    return dateStr;
  }
}

export default function TimeSeriesChart({
  data,
  metadata,
  height = 400,
  defaultPeriod = "month",
  fullBleed = false,
  hidePeriodSelector = false,
  showExternalTitle = false,
  onPeriodChange,
}: TimeSeriesChartProps) {
  const { theme } = useTheme();
  
  // Use explicitly passed defaultPeriod first (e.g., "ytd" from modal)
  // Only fall back to metadata.period_type if no explicit default was provided
  const effectiveDefaultPeriod = defaultPeriod !== "month" 
    ? defaultPeriod  // Explicit override (not the default value)
    : (metadata?.period_type?.toLowerCase() as PeriodType) || defaultPeriod;
  const [periodType, setPeriodType] = useState<PeriodType>(effectiveDefaultPeriod);
  const [showPartialInfo, setShowPartialInfo] = useState(false);
  // Default to stacked when chart has multiple categories; one-click toggle to "by series"
  const [stackedView, setStackedView] = useState(true);

  const handlePeriodChange = (newPeriod: PeriodType) => {
    setPeriodType(newPeriod);
    onPeriodChange?.(newPeriod);
    setShowPartialInfo(false); // Reset disclosure when period changes
  };

  // Aggregate data by group and filter out partial periods
  const { aggregatedByGroup, partialPeriodInfo } = useMemo(() => {
    const rawAggregated = aggregateDataByGroup(data, periodType);
    const { filtered, partialInfo } = filterPartialPeriods(rawAggregated, periodType, data);
    return { aggregatedByGroup: filtered, partialPeriodInfo: partialInfo };
  }, [data, periodType]);

  // Check if we have group values
  const hasGroups = useMemo(() => {
    if (aggregatedByGroup.size === 0) return false;
    // Check if any group value is not empty
    for (const groupValue of aggregatedByGroup.keys()) {
      if (groupValue && groupValue !== "") return true;
    }
    return false;
  }, [aggregatedByGroup]);

  // Prepare traces for Plotly - one trace per group
  const traces = useMemo(() => {
    if (aggregatedByGroup.size === 0) {
      return [];
    }

    const traces: Partial<import("plotly.js").Data>[] = [];

    // Special handling for YTD - compare years by day-of-year
    if (periodType === "ytd") {
      const currentYear = new Date().getFullYear();
      
      // Check if we have original groups (like supervisor_district)
      const hasOriginalGroups = Array.from(aggregatedByGroup.keys()).some(key => key.includes("|"));
      
      if (hasOriginalGroups) {
        // Group by original group value, then by year
        const groupedByOriginalGroup = new Map<string, Map<string, TimeSeriesDataPoint[]>>();
        
        for (const [key, points] of aggregatedByGroup.entries()) {
          const [originalGroup, year] = key.split("|");
          if (!groupedByOriginalGroup.has(originalGroup)) {
            groupedByOriginalGroup.set(originalGroup, new Map());
          }
          groupedByOriginalGroup.get(originalGroup)!.set(year, points);
        }
        
        // Create traces for each original group
        let colorIndex = 0;
        for (const [originalGroup, yearGroups] of groupedByOriginalGroup.entries()) {
          const groupColor = SERIES_COLORS[colorIndex % SERIES_COLORS.length];
          colorIndex++;
          
          // Sort years descending
          const sortedYears = Array.from(yearGroups.keys()).sort((a, b) => parseInt(b) - parseInt(a));
          const limitedYears = sortedYears.filter((yearStr) => {
            const year = parseInt(yearStr);
            return year === currentYear || year === currentYear - 1;
          });
          
          for (const yearStr of limitedYears) {
            const points = yearGroups.get(yearStr)!;
            if (points.length === 0) continue;
            
            const year = parseInt(yearStr);
            const x = points.map((point) => parseInt(point.time_period));
            const y = points.map((point) => point.numeric_value);
            
            // Check if data is sparse
            const uniqueDays = new Set(x).size;
            const isSparseData = uniqueDays <= 12;
            
            if (isSparseData) {
              traces.push({
                x,
                y,
                type: "scatter",
                mode: "lines+markers",
                name: `${originalGroup} ${yearStr}`,
                line: { color: groupColor, width: 2 },
                marker: { color: groupColor, size: 5 },
                showlegend: true,
                hovertemplate: `${originalGroup} ${yearStr}<br>%{customdata}<br>%{y:,.0f}<extra></extra>`,
                customdata: x.map((dayOfYear) => {
                  const date = new Date(year, 0, dayOfYear);
                  return date.toLocaleDateString("en-US", { month: "long", year: "numeric" });
                }),
              });
            } else {
              // 7-day trailing average
              const avg7 = y.map((_, idx) => {
                const start = Math.max(0, idx - 6);
                const window = y.slice(start, idx + 1);
                const sum = window.reduce((acc, v) => acc + v, 0);
                return sum / window.length;
              });
              
              // Raw daily (faint)
              traces.push({
                x,
                y,
                type: "scatter",
                mode: "lines",
                name: `${originalGroup} ${yearStr}`,
                line: { color: groupColor, width: 0.75 },
                opacity: 0.2,
                showlegend: false,
                hoverinfo: "skip",
              });
              
              // 7-day average (primary)
              traces.push({
                x,
                y: avg7,
                type: "scatter",
                mode: "lines",
                name: `${originalGroup} ${yearStr} 7-Day Avg`,
                line: { color: groupColor, width: 2 },
                showlegend: true,
                hovertemplate: `${originalGroup} ${yearStr} 7-Day Avg<br>%{customdata}<br>%{y:,.0f}<extra></extra>`,
                customdata: x.map((dayOfYear) => {
                  const date = new Date(year, 0, dayOfYear);
                  return date.toLocaleDateString("en-US", { month: "long", day: "numeric" });
                }),
              });
            }
          }
        }
      } else {
        // No original groups - just compare years
        const groupValues = Array.from(aggregatedByGroup.keys()).sort((a, b) => {
          const yearA = parseInt(a) || 0;
          const yearB = parseInt(b) || 0;
          return yearB - yearA;
        });

        const limitedYears = groupValues.filter((yearStr) => {
          const year = parseInt(yearStr) || 0;
          return year === currentYear || year === currentYear - 1;
        });

        limitedYears.forEach((yearStr) => {
          const points = aggregatedByGroup.get(yearStr)!;
          if (points.length === 0) return;

          const year = parseInt(yearStr);
          const x = points.map((point) => parseInt(point.time_period));
          const y = points.map((point) => point.numeric_value);

          // Check if data is sparse
          const uniqueDays = new Set(x).size;
          const isSparseData = uniqueDays <= 12;

          // Choose color based on year - use purple for current year, grey for previous
          const isCurrentYear = year === currentYear;
          const lineColor = isCurrentYear ? "#ad35fa" : "#888888";

          if (isSparseData) {
            traces.push({
              x,
              y,
              type: "scatter",
              mode: "lines+markers",
              name: yearStr,
              line: { color: lineColor, width: 2 },
              marker: { color: lineColor, size: 5 },
              showlegend: true,
              hovertemplate: `${yearStr}<br>%{customdata}<br>%{y:,.0f}<extra></extra>`,
              customdata: x.map((dayOfYear) => {
                const date = new Date(year, 0, dayOfYear);
                return date.toLocaleDateString("en-US", { month: "long", year: "numeric" });
              }),
            });
          } else {
            // 7-day trailing average
            const avg7 = y.map((_, idx) => {
              const start = Math.max(0, idx - 6);
              const window = y.slice(start, idx + 1);
              const sum = window.reduce((acc, v) => acc + v, 0);
              return sum / window.length;
            });

            // Raw daily values – faint for context
            traces.push({
              x,
              y,
              type: "scatter",
              mode: "lines",
              name: yearStr,
              line: { color: lineColor, width: 0.75 },
              opacity: 0.2,
              showlegend: false,
              hoverinfo: "skip",
            });

            // 7-day trailing average – primary focus
            traces.push({
              x,
              y: avg7,
              type: "scatter",
              mode: "lines",
              name: `${yearStr} 7-Day Avg`,
              line: { color: lineColor, width: 2 },
              showlegend: true,
              hovertemplate: `${yearStr} 7-Day Avg<br>%{customdata}<br>%{y:,.0f}<extra></extra>`,
              customdata: x.map((dayOfYear) => {
                const date = new Date(year, 0, dayOfYear);
                return date.toLocaleDateString("en-US", { month: "long", day: "numeric" });
              }),
            });
          }
        });
      }
    } else {
      // Regular period types (day, week, month, year)
      const groupValues = Array.from(aggregatedByGroup.keys()).sort();

      if (stackedView && hasGroups && groupValues.length > 1) {
        // Stacked area: align all groups to same time periods, then stack with fill: 'tonexty'
        const periodToValue = new Map<string, Map<string, number>>();
        const allPeriodsSet = new Set<string>();
        for (const gv of groupValues) {
          const points = aggregatedByGroup.get(gv)!;
          const map = new Map<string, number>();
          periodToValue.set(gv, map);
          for (const p of points) {
            map.set(p.time_period, p.numeric_value || 0);
            allPeriodsSet.add(p.time_period);
          }
        }
        const sortedPeriods = Array.from(allPeriodsSet).sort((a, b) => {
          if (a.includes("W") && b.includes("W")) {
            const [yA, wA] = a.split("-W").map(Number);
            const [yB, wB] = b.split("-W").map(Number);
            if (yA !== yB) return yA - yB;
            return wA - wB;
          }
          return new Date(a).getTime() - new Date(b).getTime();
        });

        const toDate = (timePeriod: string) => {
          if (periodType === "week" && timePeriod.includes("W")) {
            const [year, week] = timePeriod.split("-W");
            return getDateFromISOWeek(parseInt(year), parseInt(week));
          }
          if (periodType === "month" && timePeriod.match(/^\d{4}-\d{2}$/)) {
            const [year, month] = timePeriod.split("-");
            return new Date(parseInt(year), parseInt(month) - 1, 1);
          }
          if (periodType === "year") return new Date(parseInt(timePeriod), 0, 1);
          return new Date(timePeriod);
        };
        const xDates = sortedPeriods.map(toDate);
        const dateFormat = periodType === "month" ? "%b %d, %Y" 
          : periodType === "year" ? "%Y" 
          : periodType === "week" ? "Week of %b %d, %Y"
          : "%b %d, %Y";

        let cumulativeY: number[] = sortedPeriods.map(() => 0);
        groupValues.forEach((groupValue, index) => {
          const map = periodToValue.get(groupValue)!;
          const rawY = sortedPeriods.map((t) => map.get(t) ?? 0);
          cumulativeY = cumulativeY.map((c, i) => c + rawY[i]);
          const colorIndex = index % SERIES_COLORS.length;
          const color = SERIES_COLORS[colorIndex];
          const seriesName = groupValue || metadata?.chart_title || metadata?.object_name || "Time Series";
          const isFirst = index === 0;
          traces.push({
            x: xDates,
            y: cumulativeY,
            customdata: rawY,
            type: "scatter",
            mode: "lines",
            name: seriesName,
            fill: isFirst ? "tozeroy" : "tonexty",
            line: { color, width: 0 },
            fillcolor: color,
            hovertemplate: `${seriesName}<br>%{x|${dateFormat}}<br>%{customdata:,.0f}<extra></extra>`,
          });
        });
      } else {
        // Multiple series (grouped lines) or single series
        groupValues.forEach((groupValue, index) => {
          const points = aggregatedByGroup.get(groupValue)!;
          if (points.length === 0) return;

          const x = points.map((point) => {
            if (periodType === "week" && point.time_period.includes("W")) {
              const [year, week] = point.time_period.split("-W");
              return getDateFromISOWeek(parseInt(year), parseInt(week));
            } else if (periodType === "month" && point.time_period.match(/^\d{4}-\d{2}$/)) {
              const [year, month] = point.time_period.split("-");
              return new Date(parseInt(year), parseInt(month) - 1, 1);
            } else if (periodType === "year") {
              return new Date(parseInt(point.time_period), 0, 1);
            } else {
              return new Date(point.time_period);
            }
          });

          const y = points.map((point) => point.numeric_value);

          const colorIndex = index % SERIES_COLORS.length;
          const color = SERIES_COLORS[colorIndex];

          const seriesName = hasGroups && groupValue
            ? groupValue
            : metadata?.chart_title || metadata?.object_name || "Time Series";

          const hoverPrefix = hasGroups && groupValue ? `${groupValue}<br>` : "";
          const dateFormat = periodType === "month" ? "%b %d, %Y" 
            : periodType === "year" ? "%Y" 
            : periodType === "week" ? "Week of %b %d, %Y"
            : "%b %d, %Y";

          traces.push({
            x,
            y,
            type: "scatter",
            mode: "lines+markers",
            name: seriesName,
            line: {
              color,
              width: 2,
            },
            marker: {
              color,
              size: 6,
            },
            hovertemplate: `${hoverPrefix}%{x|${dateFormat}}<br>%{y:,.0f}<extra></extra>`,
          });
        });
      }
    }

    return traces;
  }, [aggregatedByGroup, periodType, hasGroups, metadata, stackedView]);

  const chartTitleText =
    metadata?.chart_title ||
    metadata?.object_name ||
    metadata?.field_name ||
    "Time Series";
  
  // Hide internal title when showing external title
  const chartTitle = showExternalTitle ? "" : chartTitleText;

  const yAxisLabel = metadata?.y_axis_label || metadata?.field_name || "Value";
  
  // Get period type label for external title
  const periodTypeLabel = {
    day: "Daily",
    week: "Weekly", 
    month: "Monthly",
    year: "Annual",
    ytd: "Year-to-Date"
  }[periodType] || periodType;
  
  // Get district label for external title
  const districtLabel = metadata?.district === 0 || metadata?.district === null 
    ? "Citywide" 
    : metadata?.district 
      ? `District ${metadata.district}` 
      : null;

  // Calculate maximum Y value for Y-axis range (stacked: max period total; otherwise max single value)
  const maxYValue = useMemo(() => {
    if (stackedView && hasGroups && periodType !== "ytd") {
      const groupValues = Array.from(aggregatedByGroup.keys()).sort();
      if (groupValues.length <= 1) {
        let m = 0;
        for (const points of aggregatedByGroup.values()) {
          for (const p of points) if ((p.numeric_value || 0) > m) m = p.numeric_value || 0;
        }
        return m > 0 ? m * 1.1 : 10;
      }
      const periodSums = new Map<string, number>();
      for (const gv of groupValues) {
        for (const p of aggregatedByGroup.get(gv)!) {
          const v = p.numeric_value || 0;
          periodSums.set(p.time_period, (periodSums.get(p.time_period) || 0) + v);
        }
      }
      let max = 0;
      for (const sum of periodSums.values()) if (sum > max) max = sum;
      return max > 0 ? max * 1.1 : 10;
    }
    let max = 0;
    for (const points of aggregatedByGroup.values()) {
      for (const point of points) {
        if (point.numeric_value > max) {
          max = point.numeric_value;
        }
      }
    }
    return max > 0 ? max * 1.1 : 10;
  }, [aggregatedByGroup, stackedView, hasGroups, periodType]);

  // Use lighter, more visible colors in dark mode
  const textColor = theme === "dark" ? "#f1f5f9" : "#222222";
  const axisLineColor = theme === "dark" ? "#475569" : "#e5e7eb";
  const gridColor = theme === "dark" ? "rgba(203, 213, 225, 0.3)" : "rgba(232, 233, 235, 0.5)";
  const gridColorLight = theme === "dark" ? "rgba(203, 213, 225, 0.2)" : "rgba(232, 233, 235, 0.3)";
  const hoverBgColor = theme === "dark" ? "#1e293b" : "#FFFFFF";
  const hoverTextColor = theme === "dark" ? "#f1f5f9" : "#222222";
  const legendBgColor = theme === "dark" ? "rgba(30, 41, 59, 0.8)" : "rgba(246, 241, 234, 0.7)";

  const layout = useMemo(() => {
    // Special layout for YTD charts
    if (periodType === "ytd") {
      // Calculate the actual range from the data for YTD charts
      const allDayValues: number[] = [];
      for (const points of aggregatedByGroup.values()) {
        for (const point of points) {
          const dayOfYear = parseInt(point.time_period);
          if (!isNaN(dayOfYear) && dayOfYear >= 1 && dayOfYear <= 366) {
            allDayValues.push(dayOfYear);
          }
        }
      }
      
      const minDay = allDayValues.length > 0 ? Math.min(...allDayValues) : 1;
      const maxDay = allDayValues.length > 0 ? Math.max(...allDayValues) : 365;
      
      return {
        title: {
          text: chartTitle,
          font: {
            family: "Inter, Arial, sans-serif",
            size: 14,
            color: textColor,
          },
          y: 0.98,
          x: 0.02,
          xanchor: "left",
          pad: { t: 10, b: 10 },
        },
        xaxis: {
          title: {
            text: "",
            font: {
              family: "IBM Plex Sans, Arial, sans-serif",
              size: 10,
              color: textColor,
            },
            standoff: 30,
          },
          showgrid: true,
          gridcolor: gridColorLight,
          tickfont: {
            family: "IBM Plex Sans, Arial, sans-serif",
            size: 9,
            color: textColor,
          },
          tickmode: "array" as const,
          tickvals: [1, 32, 60, 91, 121, 152, 182, 213, 244, 274, 305, 335], // Approximate start of each month
          ticktext: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
          range: [minDay, maxDay + 10], // Use actual data range with small padding
          showline: true,
          linecolor: axisLineColor,
          linewidth: 1,
          ticklen: 3,
          tickcolor: textColor,
          rangeslider: { visible: false },
        },
        yaxis: {
          title: {
            text: yAxisLabel,
            font: {
              family: "IBM Plex Sans, Arial, sans-serif",
              size: 10,
              color: textColor,
            },
            standoff: 15,
          },
          showgrid: true,
          gridcolor: gridColor,
          zeroline: false,
          range: [0, maxYValue],
          tickfont: {
            family: "IBM Plex Sans, Arial, sans-serif",
            size: 9,
            color: textColor,
          },
        },
        showlegend: true,
        legend: {
          orientation: "h" as const,
          x: 0.5,
          y: -0.18,
          xanchor: "center" as const,
          yanchor: "top" as const,
          font: {
            family: "IBM Plex Sans, Arial, sans-serif",
            size: 10,
            color: textColor,
          },
          bgcolor: "transparent",
          bordercolor: "transparent",
          borderwidth: 0,
          itemsizing: "constant" as const,
          itemwidth: 30,
        },
        margin: {
          t: 55,
          b: 95,
          l: 50,
          r: 45,
        },
        paper_bgcolor: "transparent",
        plot_bgcolor: "transparent",
        hovermode: "closest" as const,
        hoverlabel: {
          bgcolor: hoverBgColor,
          bordercolor: "var(--brand-primary, #ad35fa)",
          font: {
            family: "IBM Plex Sans, Arial, sans-serif",
            size: 9,
            color: hoverTextColor,
          },
        },
        height,
      };
    }
    
    // Calculate total data points across all groups for tick interval decision
    let totalDataPoints = 0;
    for (const points of aggregatedByGroup.values()) {
      totalDataPoints = Math.max(totalDataPoints, points.length);
    }
    
    // Regular layout for other period types
    const tickInterval = getTickInterval(periodType, totalDataPoints);
    
    return {
      title: {
        text: chartTitle,
        font: {
          family: "Inter, Arial, sans-serif",
          size: 14,
          color: textColor,
        },
        x: 0.5,
        xanchor: "center",
      },
      xaxis: {
        title: "",
        showgrid: true,
        gridcolor: gridColor,
        tickfont: {
          family: "IBM Plex Sans, Arial, sans-serif",
          size: 10,
          color: textColor,
        },
        tickformat: getTickFormat(periodType),
        ...(tickInterval && { dtick: tickInterval }),
        showline: true,
        linecolor: axisLineColor,
        linewidth: 1,
        tickcolor: textColor,
      },
      yaxis: {
        title: {
          text: yAxisLabel,
          font: {
            family: "IBM Plex Sans, Arial, sans-serif",
            size: 10,
            color: textColor,
          },
        },
        showgrid: true,
        gridcolor: gridColor,
        range: [0, maxYValue],
        tickfont: {
          family: "IBM Plex Sans, Arial, sans-serif",
          size: 10,
          color: textColor,
        },
        showline: true,
        linecolor: axisLineColor,
        linewidth: 1,
        tickcolor: textColor,
      },
      margin: { 
        t: 50, 
        b: hasGroups && traces.length > 1 ? 80 : 50, // More space for legend
        l: 60, 
        r: 30 
      },
      paper_bgcolor: "transparent",
      plot_bgcolor: "transparent",
      hovermode: "closest" as const,
      hoverlabel: {
        bgcolor: hoverBgColor,
        bordercolor: "var(--brand-primary, #ad35fa)",
        font: {
          family: "IBM Plex Sans, Arial, sans-serif",
          size: 10,
          color: hoverTextColor,
        },
      },
      showlegend: hasGroups && traces.length > 1,
      legend: {
        orientation: "h" as const,
        x: 0.5,
        y: -0.1,
        xanchor: "center" as const,
        yanchor: "top" as const,
        font: {
          family: "IBM Plex Sans, Arial, sans-serif",
          size: 10,
          color: textColor,
        },
        bgcolor: legendBgColor,
      },
      height,
    };
  }, [chartTitle, yAxisLabel, periodType, height, hasGroups, traces.length, maxYValue, aggregatedByGroup, theme, textColor, axisLineColor, gridColor, hoverBgColor, hoverTextColor, legendBgColor]);

  const config = {
    responsive: true,
    displayModeBar: false,
  };

  if (traces.length === 0) {
    // Check if we have any data at all
    const hasAnyData = data.length > 0;
    
    return (
      <div className={styles.container}>
        {!hidePeriodSelector && (
          <div className={styles.controlsRow}>
            <div className={styles.periodSelector}>
              <label>Period:</label>
              <select
                value={periodType}
                onChange={(e) => handlePeriodChange(e.target.value as PeriodType)}
                className={styles.select}
              >
                <option value="day">Day</option>
                <option value="week">Week</option>
                <option value="month">Month</option>
                <option value="year">Year</option>
                <option value="ytd">Year-to-Date</option>
              </select>
            </div>
          </div>
        )}
        <div className={styles.emptyState}>
          {hasAnyData 
            ? `No data available for ${periodType === "ytd" ? "the current year (YTD)" : `the selected period (${periodType})`}. Try selecting a different period.`
            : "No data available to display."}
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      {showExternalTitle && (
        <div className={styles.externalTitle}>
          <div className={styles.externalTitleMain}>{chartTitleText}</div>
          <div className={styles.externalTitleSub}>
            {districtLabel && <span>{districtLabel}</span>}
            {districtLabel && <span className={styles.titleSeparator}>•</span>}
            <span>{periodTypeLabel}</span>
          </div>
        </div>
      )}
      {!hidePeriodSelector && (
        <div className={styles.controlsRow}>
          <div className={styles.periodSelector}>
            <label>Period:</label>
            <select
              value={periodType}
              onChange={(e) => handlePeriodChange(e.target.value as PeriodType)}
              className={styles.select}
            >
              <option value="day">Day</option>
              <option value="week">Week</option>
              <option value="month">Month</option>
              <option value="year">Year</option>
              <option value="ytd">Year-to-Date</option>
            </select>
          </div>
          {hasGroups && periodType !== "ytd" && (
            <div className={styles.viewToggle}>
              <span className={styles.viewToggleLabel}>View:</span>
              <button
                type="button"
                className={stackedView ? styles.viewToggleActive : styles.viewToggleBtn}
                onClick={() => setStackedView(true)}
                aria-pressed={stackedView}
              >
                Stacked
              </button>
              <button
                type="button"
                className={!stackedView ? styles.viewToggleActive : styles.viewToggleBtn}
                onClick={() => setStackedView(false)}
                aria-pressed={!stackedView}
              >
                By series
              </button>
            </div>
          )}
        </div>
      )}
      {metadata?.caption && (
        <div className={styles.caption}>{metadata.caption}</div>
      )}
      <div className={fullBleed ? styles.chartWrapperFullBleed : styles.chartWrapper}>
        <Plot
          data={traces}
          layout={layout}
          config={config}
          style={{ width: "100%", height: `${height}px` }}
        />
      </div>
      {partialPeriodInfo && (partialPeriodInfo.excludedStart || partialPeriodInfo.excludedEnd) && (
        <div className={styles.partialPeriodNotice}>
          <button
            className={styles.partialPeriodToggle}
            onClick={() => setShowPartialInfo(!showPartialInfo)}
            aria-expanded={showPartialInfo}
          >
            <span className={styles.partialPeriodIcon}>ⓘ</span>
            <span className={styles.partialPeriodLabel}>Partial periods excluded</span>
            <span className={`${styles.partialPeriodChevron} ${showPartialInfo ? styles.expanded : ''}`}>›</span>
          </button>
          {showPartialInfo && (
            <div className={styles.partialPeriodDetails}>
              {partialPeriodInfo.excludedStart && (
                <div className={styles.partialPeriodItem}>
                  <span className={styles.partialPeriodBullet}>•</span>
                  {partialPeriodInfo.excludedStart}
                </div>
              )}
              {partialPeriodInfo.excludedEnd && (
                <div className={styles.partialPeriodItem}>
                  <span className={styles.partialPeriodBullet}>•</span>
                  {partialPeriodInfo.excludedEnd}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Get date from ISO week number and year.
 * Uses proper ISO week calculation to handle year boundaries correctly.
 */
function getDateFromISOWeek(isoYear: number, isoWeek: number): Date {
  // Create a date for January 4th of the ISO year (always in week 1)
  const jan4 = new Date(isoYear, 0, 4);
  const jan4Day = jan4.getDay() || 7; // Convert Sunday (0) to 7
  
  // Calculate the first Monday of the year (ISO week starts on Monday)
  const daysToMonday = (8 - jan4Day) % 7;
  const firstMonday = new Date(jan4);
  firstMonday.setDate(jan4.getDate() + daysToMonday);
  
  // Calculate the target date by adding weeks
  const targetDate = new Date(firstMonday);
  targetDate.setDate(firstMonday.getDate() + (isoWeek - 1) * 7);
  
  return targetDate;
}

/**
 * Get tick format for x-axis based on period type.
 */
function getTickFormat(periodType: PeriodType): string {
  switch (periodType) {
    case "day":
    case "ytd":
      return "%b %d, %Y";
    case "week":
      return "%b %d, %Y";
    case "month":
      return "%b %d, %Y";
    case "year":
      return "%Y";
    default:
      return "%b %d, %Y";
  }
}

/**
 * Get tick interval (dtick) for x-axis based on period type and data range.
 * Returns appropriate dtick value for Plotly's date axis.
 */
function getTickInterval(periodType: PeriodType, dataPointCount: number): string | number | undefined {
  switch (periodType) {
    case "day":
      // For daily data, show ticks every 7 days if many points, otherwise every day
      if (dataPointCount > 60) return "M1"; // Monthly ticks for long ranges
      if (dataPointCount > 14) return 7 * 24 * 60 * 60 * 1000; // Weekly (in ms)
      return 24 * 60 * 60 * 1000; // Daily (in ms)
    case "week":
      // For weekly data, show ticks every 4 weeks if many points
      if (dataPointCount > 26) return "M1"; // Monthly ticks
      return 4 * 7 * 24 * 60 * 60 * 1000; // Every 4 weeks (in ms)
    case "month":
      // For monthly data, show every month or every 3 months for long ranges
      if (dataPointCount > 24) return "M3"; // Quarterly
      return "M1"; // Monthly
    case "year":
      // For yearly data, show every year
      return "M12"; // Yearly
    default:
      return undefined;
  }
}


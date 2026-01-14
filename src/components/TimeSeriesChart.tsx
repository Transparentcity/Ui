"use client";

import React, { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { useTheme } from "@/contexts/ThemeContext";
import styles from "./TimeSeriesChart.module.css";

// Dynamically import Plotly to avoid SSR issues
const Plot = dynamic(
  () => import("react-plotly.js"),
  { ssr: false }
) as React.ComponentType<any>;

export type PeriodType = "day" | "week" | "month" | "year" | "ytd";

export interface TimeSeriesDataPoint {
  time_period: string;
  numeric_value: number;
  group_value?: string | null;
}

// Extended type for internal processing with parsed dates
type TimeSeriesDataPointWithDate = TimeSeriesDataPoint & { date: Date };

export interface TimeSeriesChartProps {
  data: TimeSeriesDataPoint[];
  metadata?: {
    chart_title?: string;
    caption?: string;
    y_axis_label?: string;
    object_name?: string;
    field_name?: string;
  };
  height?: number;
  defaultPeriod?: PeriodType;
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
 * Aggregates daily data points by the specified period type, preserving group values.
 * Returns data grouped by both time period and group_value.
 * For YTD, returns data grouped by year with day-of-year values.
 */
function aggregateDataByGroup(
  data: TimeSeriesDataPoint[],
  periodType: PeriodType
): Map<string, TimeSeriesDataPoint[]> {
  // Parse dates and create Date objects
  const dataWithDates = data
    .map((point) => {
      // Try parsing the date - handle ISO strings and other formats
      let date: Date;
      if (typeof point.time_period === 'string') {
        // Handle ISO date strings (YYYY-MM-DD)
        if (point.time_period.match(/^\d{4}-\d{2}-\d{2}/)) {
          date = new Date(point.time_period);
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
      // YYYY-MM format
      const [year, month] = dateStr.split("-");
      const monthNames = [
        "Jan",
        "Feb",
        "Mar",
        "Apr",
        "May",
        "Jun",
        "Jul",
        "Aug",
        "Sep",
        "Oct",
        "Nov",
        "Dec",
      ];
      return `${monthNames[parseInt(month) - 1]} ${year}`;
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
}: TimeSeriesChartProps) {
  const { theme } = useTheme();
  const [periodType, setPeriodType] = useState<PeriodType>(defaultPeriod);

  // Aggregate data by group
  const aggregatedByGroup = useMemo(() => {
    return aggregateDataByGroup(data, periodType);
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

    const traces: any[] = [];

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
          
          for (const yearStr of sortedYears) {
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
                line: { color: groupColor, width: 3 },
                marker: { color: groupColor, size: 6 },
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
                line: { color: groupColor, width: 1 },
                opacity: 0.25,
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
                line: { color: groupColor, width: 3 },
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

        groupValues.forEach((yearStr) => {
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
              line: { color: lineColor, width: 3 },
              marker: { color: lineColor, size: 6 },
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
              line: { color: lineColor, width: 1 },
              opacity: 0.25,
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
              line: { color: lineColor, width: 3 },
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

      groupValues.forEach((groupValue, index) => {
        const points = aggregatedByGroup.get(groupValue)!;
        if (points.length === 0) return;

        const x = points.map((point) => {
          // Convert time_period to Date for proper x-axis handling
          if (periodType === "week" && point.time_period.includes("W")) {
            // Parse ISO week: YYYY-WXX
            const [year, week] = point.time_period.split("-W");
            return getDateFromISOWeek(parseInt(year), parseInt(week));
          } else if (periodType === "month" && point.time_period.match(/^\d{4}-\d{2}$/)) {
            // YYYY-MM format
            const [year, month] = point.time_period.split("-");
            return new Date(parseInt(year), parseInt(month) - 1, 1);
          } else if (periodType === "year") {
            return new Date(parseInt(point.time_period), 0, 1);
          } else {
            return new Date(point.time_period);
          }
        });

        const y = points.map((point) => point.numeric_value);

        // Get color for this series (cycle through palette)
        const colorIndex = index % SERIES_COLORS.length;
        const color = SERIES_COLORS[colorIndex];

        // Series name: use group value if available, otherwise use default
        const seriesName = hasGroups && groupValue
          ? groupValue
          : metadata?.chart_title || metadata?.object_name || "Time Series";

        // Build hover template with group value included
        const hoverPrefix = hasGroups && groupValue ? `${groupValue}<br>` : "";
        const dateFormat = periodType === "month" ? "%b %Y" 
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

    return traces;
  }, [aggregatedByGroup, periodType, hasGroups, metadata]);

  const chartTitle =
    metadata?.chart_title ||
    metadata?.object_name ||
    metadata?.field_name ||
    "Time Series";

  const yAxisLabel = metadata?.y_axis_label || metadata?.field_name || "Value";

  // Calculate maximum Y value from all data points for Y-axis range
  const maxYValue = useMemo(() => {
    let max = 0;
    for (const points of aggregatedByGroup.values()) {
      for (const point of points) {
        if (point.numeric_value > max) {
          max = point.numeric_value;
        }
      }
    }
    // Add 10% padding at the top, but ensure minimum range
    return max > 0 ? max * 1.1 : 10;
  }, [aggregatedByGroup]);

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
          y: -0.02,
          xanchor: "center" as const,
          yanchor: "top" as const,
          font: {
            family: "IBM Plex Sans, Arial, sans-serif",
            size: 8,
            color: textColor,
          },
          bgcolor: "transparent",
          bordercolor: "transparent",
          borderwidth: 0,
          itemsizing: "constant" as const,
          itemwidth: 20,
        },
        margin: {
          t: 55,
          b: 80,
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
    
    // Regular layout for other period types
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
        <div className={styles.periodSelector}>
          <label>Period:</label>
          <select
            value={periodType}
            onChange={(e) => setPeriodType(e.target.value as PeriodType)}
            className={styles.select}
          >
            <option value="day">Day</option>
            <option value="week">Week</option>
            <option value="month">Month</option>
            <option value="year">Year</option>
            <option value="ytd">Year-to-Date</option>
          </select>
        </div>
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
      <div className={styles.periodSelector}>
        <label>Period:</label>
        <select
          value={periodType}
          onChange={(e) => setPeriodType(e.target.value as PeriodType)}
          className={styles.select}
        >
          <option value="day">Day</option>
          <option value="week">Week</option>
          <option value="month">Month</option>
          <option value="year">Year</option>
          <option value="ytd">Year-to-Date</option>
        </select>
      </div>
      {metadata?.caption && (
        <div className={styles.caption}>{metadata.caption}</div>
      )}
      <div className={styles.chartWrapper}>
        <Plot
          data={traces}
          layout={layout}
          config={config}
          style={{ width: "100%", height: `${height}px` }}
        />
      </div>
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
      return "%b %Y";
    case "year":
      return "%Y";
    default:
      return "%b %d, %Y";
  }
}


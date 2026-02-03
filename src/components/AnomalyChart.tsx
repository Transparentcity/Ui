"use client";

import React, { useMemo } from "react";
import dynamic from "next/dynamic";
import { useTheme } from "@/contexts/ThemeContext";
import styles from "./AnomalyChart.module.css";

// Dynamically import Plotly to avoid SSR issues
const Plot = dynamic(
  () => import("react-plotly.js"),
  { ssr: false }
);

export interface AnomalyChartData {
  dates: string[];
  values: number[];
  periods: ("recent" | "comparison")[];
}

export interface AnomalyMetadata {
  object_name?: string;
  field_name?: string;
  y_axis_label?: string;
  period_type?: string;
  group_field_name?: string;
  group_value?: string;
  chart_title?: string;
  caption?: string;
  city_name?: string;
  district?: number;
  /** "Citywide" or "District N" from chart_payload.subtitle */
  subtitle?: string;
}

export interface AnomalyChartProps {
  chartData: AnomalyChartData;
  anomaly: {
    comparison_mean: number;
    recent_mean: number;
    std_dev: number;
    percent_change: number;
    period_type: string;
  };
  metadata?: AnomalyMetadata;
  height?: number;
}

/**
 * Parse date string to Date object, handling various formats.
 * Uses UTC to avoid timezone issues that can cause month labels to shift.
 */
function parseDate(dateStr: string): Date | null {
  try {
    // Handle ISO week format: YYYY-WXX
    if (dateStr.includes("W") && dateStr.includes("-")) {
      const [yearPart, weekPart] = dateStr.split("-");
      const year = parseInt(yearPart);
      const weekNum = parseInt(weekPart.replace("W", ""));

      // Create a date for the first day of the year in UTC
      const jan1 = new Date(Date.UTC(year, 0, 1));

      // Find the first Monday of the year (ISO week starts on Monday)
      const daysUntilMonday = (7 - jan1.getUTCDay()) % 7;
      const firstMonday = new Date(
        jan1.getTime() + daysUntilMonday * 24 * 60 * 60 * 1000
      );

      // Calculate the target date by adding weeks
      return new Date(
        firstMonday.getTime() + (weekNum - 1) * 7 * 24 * 60 * 60 * 1000
      );
    }

    // Handle regular date formats
    const dateParts = dateStr.split("-");
    const year = parseInt(dateParts[0]);

    // For annual data (just year), use January 1st in UTC
    if (dateParts.length === 1) {
      return new Date(Date.UTC(year, 0, 1));
    }

    // For monthly or daily data, use UTC to avoid timezone shifts
    // This ensures that "2024-12-01" always displays as December, not November
    const month = parseInt(dateParts[1]) - 1; // JavaScript months are 0-indexed
    const day = dateParts.length > 2 ? parseInt(dateParts[2]) : 1;
    return new Date(Date.UTC(year, month, day));
  } catch {
    return null;
  }
}

export default function AnomalyChart({
  chartData,
  anomaly,
  metadata,
  height = 400,
}: AnomalyChartProps) {
  const { theme } = useTheme();
  
  // Process chart data into recent and comparison periods
  const processedData = useMemo(() => {
    const recentDates: Date[] = [];
    const recentValues: number[] = [];
    const comparisonDates: Date[] = [];
    const comparisonValues: number[] = [];

    if (
      chartData.dates &&
      chartData.values &&
      chartData.periods &&
      chartData.dates.length === chartData.values.length &&
      chartData.dates.length === chartData.periods.length
    ) {
      for (let i = 0; i < chartData.dates.length; i++) {
        const dateStr = chartData.dates[i];
        const value = chartData.values[i];
        const period = chartData.periods[i];

        const dateObj = parseDate(dateStr);
        if (!dateObj || isNaN(dateObj.getTime())) {
          continue;
        }

        if (period === "recent") {
          recentDates.push(dateObj);
          recentValues.push(value);
        } else if (period === "comparison") {
          comparisonDates.push(dateObj);
          comparisonValues.push(value);
        }
      }
    }

    return {
      recentDates,
      recentValues,
      comparisonDates,
      comparisonValues,
    };
  }, [chartData]);

  // Prepare traces for Plotly
  const traces = useMemo(() => {
    const traces: import("plotly.js").Data[] = [];
    const { recentDates, recentValues, comparisonDates, comparisonValues } =
      processedData;

    // Add normal range shaded area if we have comparison data
    if (comparisonDates.length > 0) {
      const allDates = [...comparisonDates, ...recentDates].sort(
        (a, b) => a.getTime() - b.getTime()
      );
      const upperBound = allDates.map(
        () => anomaly.comparison_mean + 2 * anomaly.std_dev
      );
      const lowerBound = allDates.map(() =>
        Math.max(anomaly.comparison_mean - 2 * anomaly.std_dev, 0)
      );

      // Add lower bound trace (invisible)
      traces.push({
        x: allDates,
        y: lowerBound,
        type: "scatter",
        mode: "lines",
        line: { color: "rgba(0,0,0,0)" },
        showlegend: false,
        hoverinfo: "skip",
      });

      // Add normal range area
      traces.push({
        x: allDates,
        y: upperBound,
        type: "scatter",
        mode: "lines",
        line: { color: "rgba(74, 116, 99, 0.3)", width: 1 },
        fill: "tonexty",
        fillcolor: "rgba(74, 116, 99, 0.15)", // Spruce Green with transparency
        name: "Normal Range (±2σ)",
        showlegend: true,
        hoverinfo: "skip",
      });
    }

    // Add comparison period trace
    if (comparisonDates.length > 0) {
      traces.push({
        x: comparisonDates,
        y: comparisonValues,
        type: "scatter",
        mode: "lines+markers",
        name: "Historical Data",
        line: { color: "#ad35fa", width: 2 },
        marker: { color: "#ad35fa", size: 6 },
        showlegend: true,
        hovertemplate:
          anomaly.period_type === "week"
            ? "%{x|%B %d, %Y}<br>%{y:,.0f}<extra></extra>"
            : "%{x|%B %Y}<br>%{y:,.0f}<extra></extra>",
      });
    }

    // Add recent period trace
    if (recentDates.length > 0) {
      traces.push({
        x: recentDates,
        y: recentValues,
        type: "scatter",
        mode: "lines+markers",
        name: "Recent Data",
        line: { color: "#ad35fa", width: 2 },
        marker: { color: "#ad35fa", size: 6 },
        showlegend: true,
        hovertemplate:
          anomaly.period_type === "week"
            ? "%{x|%B %d, %Y}<br>%{y:,.0f}<extra></extra>"
            : "%{x|%B %Y}<br>%{y:,.0f}<extra></extra>",
      });
    }

    // Add connecting line between last historical and first recent point
    if (comparisonDates.length > 0 && recentDates.length > 0) {
      const lastHistoricalDate =
        comparisonDates[comparisonDates.length - 1];
      const lastHistoricalValue =
        comparisonValues[comparisonValues.length - 1];
      const firstRecentDate = recentDates[0];
      const firstRecentValue = recentValues[0];

      traces.push({
        x: [lastHistoricalDate, firstRecentDate],
        y: [lastHistoricalValue, firstRecentValue],
        type: "scatter",
        mode: "lines",
        line: { color: "#ad35fa", width: 2, dash: "dot" },
        showlegend: false,
        hoverinfo: "skip",
      });
    }

    return traces;
  }, [processedData, anomaly]);

  // Build chart title
  const chartTitle = useMemo(() => {
    const changeType = anomaly.percent_change > 0 ? "Spike" : "Drop";
    const metricName =
      metadata?.object_name || metadata?.field_name || "Metric";
    
    // Build location text (city + district/citywide); prefer chart_payload.subtitle when set
    let locationText = metadata?.subtitle ?? "";
    if (!locationText) {
      if (metadata?.city_name) {
        locationText = metadata.city_name;
        const district = metadata.district !== undefined ? metadata.district : undefined;
        if (district !== undefined && district !== 0) {
          locationText += `, District ${district}`;
        } else if (district === 0) {
          locationText += " (Citywide)";
        }
      } else {
        const district = metadata?.district;
        if (district !== undefined && district !== 0) {
          locationText = `District ${district}`;
        } else {
          locationText = "Citywide";
        }
      }
    }
    
    // Build group text if available
    const hasGroup = metadata?.group_field_name && metadata?.group_value;
    const groupText = hasGroup
      ? `${metadata.group_field_name}: <span style="font-weight: bold;">${metadata.group_value}</span>`
      : "";

    // Construct title - more compact format
    // First line: Change type and metric name
    let title = `${changeType} in ${metricName}`;
    
    // Second line: Group field and value if available (value is bolded)
    if (groupText) {
      const groupColor = theme === "dark" ? "#cbd5e1" : "#666";
      title += `<br><span style="font-size: 0.85em; color: ${groupColor};">${groupText}</span>`;
    }
    
    // Third line: Location (city and district)
    if (locationText) {
      const locationColor = theme === "dark" ? "#cbd5e1" : "#666";
      title += `<br><span style="font-size: 0.85em; color: ${locationColor};">${locationText}</span>`;
    }
    
    return title;
  }, [anomaly, metadata]);

  const yAxisLabel =
    metadata?.y_axis_label ||
    metadata?.field_name ||
    metadata?.object_name ||
    "Value";

  // Calculate maximum Y value from all data points for Y-axis range
  const maxYValue = useMemo(() => {
    const { recentValues, comparisonValues } = processedData;
    const allValues = [...recentValues, ...comparisonValues];
    const max = allValues.length > 0 ? Math.max(...allValues) : 0;
    // Add 10% padding at the top, but ensure minimum range
    return max > 0 ? max * 1.1 : 10;
  }, [processedData]);

  // Use lighter, more visible colors in dark mode
  const textColor = theme === "dark" ? "#f1f5f9" : "#222222";
  const axisLineColor = theme === "dark" ? "#475569" : "#e5e7eb";
  const gridColor = theme === "dark" ? "rgba(203, 213, 225, 0.3)" : "rgba(232, 233, 235, 0.5)";
  const legendBgColor = theme === "dark" ? "rgba(30, 41, 59, 0.8)" : "rgba(246, 241, 234, 0.7)";

  const layout: Partial<import("plotly.js").Layout> = {
    title: {
      text: chartTitle,
      font: {
        family: "Inter, Arial, sans-serif",
        size: 14,
        color: textColor,
      },
      y: 0.95,
      x: 0.5,
      xanchor: "center" as const,
      pad: { t: 5, b: 5 },
    },
    xaxis: {
      title: { text: "" },
      showgrid: false,
      tickformat: anomaly.period_type === "week" ? "%b %d, %Y" : "%b %Y",
      tickfont: {
        family: "IBM Plex Sans, Arial, sans-serif",
        size: 9,
        color: textColor,
      },
      tickmode: "auto" as const,
      ticklen: 3,
      tickcolor: textColor,
      showline: true,
      linecolor: axisLineColor,
      linewidth: 1,
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
      y: -0.05,
      xanchor: "center" as const,
      yanchor: "top" as const,
      font: {
        family: "IBM Plex Sans, Arial, sans-serif",
        size: 9,
        color: textColor,
      },
      bgcolor: legendBgColor,
    },
    margin: { t: 50, b: 50, l: 60, r: 30 },
    height,
    paper_bgcolor: "transparent",
    plot_bgcolor: "transparent",
    hovermode: "closest" as const,
    hoverlabel: {
      bgcolor: theme === "dark" ? "#1e293b" : "#FFFFFF",
      bordercolor: "var(--brand-primary, #ad35fa)",
      font: {
        family: "IBM Plex Sans, Arial, sans-serif",
        size: 9,
        color: textColor,
      },
    },
  };

  const config = {
    responsive: true,
    displayModeBar: false,
  };

  if (traces.length === 0) {
    return (
      <div className={styles.container}>
        <div className={styles.emptyState}>
          No data available to render anomaly chart.
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
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
      <div className={styles.stats}>
        <div className={styles.statItem}>
          <span className={styles.statLabel}>Recent Mean:</span>
          <span className={styles.statValue}>
            {anomaly.recent_mean.toLocaleString(undefined, {
              minimumFractionDigits: 0,
              maximumFractionDigits: 2,
            })}
          </span>
        </div>
        <div className={styles.statItem}>
          <span className={styles.statLabel}>Historical Mean:</span>
          <span className={styles.statValue}>
            {anomaly.comparison_mean.toLocaleString(undefined, {
              minimumFractionDigits: 0,
              maximumFractionDigits: 2,
            })}
          </span>
        </div>
        <div className={styles.statItem}>
          <span className={styles.statLabel}>Change:</span>
          <span
            className={`${styles.statValue} ${
              anomaly.percent_change > 0
                ? styles.positiveChange
                : styles.negativeChange
            }`}
          >
            {anomaly.percent_change > 0 ? "+" : ""}
            {anomaly.percent_change.toFixed(2)}%
          </span>
        </div>
      </div>
    </div>
  );
}





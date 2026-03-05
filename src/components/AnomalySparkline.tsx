"use client";

import React, { useMemo } from "react";
import dynamic from "next/dynamic";
import styles from "./AnomalySparkline.module.css";

// Dynamically import Plotly to avoid SSR issues
const Plot = dynamic(
  () => import("react-plotly.js"),
  { ssr: false }
) as React.ComponentType<import("react-plotly.js").PlotParams>;

export interface AnomalySparklineData {
  dates: string[];
  values: number[];
  periods?: ("recent" | "comparison")[];
}

export interface AnomalySparklineProps {
  chartData: AnomalySparklineData;
  periodType?: string;
  height?: number;
  width?: number;
  showAverage?: boolean;
  showAnnotations?: boolean;
}

/**
 * Parse date string to Date object, handling various formats.
 */
function parseDate(dateStr: string): Date | null {
  try {
    // Handle ISO week format: YYYY-WXX
    if (dateStr.includes("W") && dateStr.includes("-")) {
      const [yearPart, weekPart] = dateStr.split("-");
      const year = parseInt(yearPart);
      const weekNum = parseInt(weekPart.replace("W", ""));

      // Create a date for the first day of the year
      const jan1 = new Date(year, 0, 1);

      // Find the first Monday of the year (ISO week starts on Monday)
      const daysUntilMonday = (7 - jan1.getDay()) % 7;
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

    // For annual data (just year), use January 1st
    if (dateParts.length === 1) {
      return new Date(year, 0, 1);
    }

    // For monthly or daily data
    const month = parseInt(dateParts[1]) - 1;
    const day = dateParts.length > 2 ? parseInt(dateParts[2]) : 1;
    return new Date(year, month, day);
  } catch {
    return null;
  }
}

/**
 * Format value for display in annotations
 */
function formatValue(value: number): string {
  if (value === null || value === undefined || isNaN(value)) return "-";
  return parseFloat(value.toString()).toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

export default function AnomalySparkline({
  chartData,
  periodType,
  height = 60,
  width = 120,
  showAverage = true,
  showAnnotations = true,
}: AnomalySparklineProps) {
  // Process chart data into sorted pairs
  const processedData = useMemo(() => {
    const pairs: { date: Date; value: number }[] = [];

    if (
      chartData.dates &&
      chartData.values &&
      chartData.dates.length === chartData.values.length
    ) {
      for (let i = 0; i < chartData.dates.length; i++) {
        const dateStr = chartData.dates[i];
        const value = chartData.values[i];

        const dateObj = parseDate(dateStr);
        if (!dateObj || isNaN(dateObj.getTime()) || isNaN(value)) {
          continue;
        }

        // For weekly data, shift to end-of-week (Sunday) so the last
        // data point visually represents coverage through the full week.
        if (periodType === "week") {
          dateObj.setDate(dateObj.getDate() + 6);
        }

        pairs.push({ date: dateObj, value });
      }
    }

    // Sort by date
    pairs.sort((a, b) => a.date.getTime() - b.date.getTime());

    return pairs;
  }, [chartData, periodType]);

  // Prepare traces and annotations for Plotly
  const { traces, annotations } = useMemo(() => {
    const traces: Partial<import("plotly.js").Data>[] = [];
    const annotations: Partial<import("plotly.js").Layout["annotations"] extends (infer U)[] | undefined ? U : never>[] = [];

    if (processedData.length === 0) {
      return { traces, annotations };
    }

    // Extract dates and values
    const dates = processedData.map((p) => p.date);
    const values = processedData.map((p) => p.value);

    // Calculate average if needed
    let average: number | null = null;
    if (showAverage && values.length > 0) {
      const sum = values.reduce((acc, v) => acc + v, 0);
      average = sum / values.length;
    }

    // Add average line
    if (showAverage && average !== null && dates.length > 0) {
      traces.push({
        x: [dates[0], dates[dates.length - 1]],
        y: [average, average],
        type: "scatter",
        mode: "lines",
        line: { color: "rgba(0,0,0,0.3)", width: 1, dash: "dot" },
        name: "Average",
        showlegend: false,
        hoverinfo: "skip",
      });
    }

    // Add main data line
    traces.push({
      x: dates,
      y: values,
      type: "scatter",
      mode: "lines+markers",
      line: { color: "#ad35fa", width: 2 },
      marker: { color: "#ad35fa", size: 4 },
      showlegend: false,
      hoverinfo: "skip",
    });

    // Add annotations for first and last points
    if (showAnnotations && processedData.length > 0) {
      const firstPoint = processedData[0];
      const lastPoint = processedData[processedData.length - 1];

      // First point annotation - positioned to the left of the first datapoint
      annotations.push({
        x: firstPoint.date,
        y: firstPoint.value,
        xref: "x",
        yref: "y",
        text: formatValue(firstPoint.value),
        showarrow: false,
        xanchor: "right", // Right edge of text at the point, so text extends left
        yanchor: "bottom",
        xshift: -5, // Shift left to position label to the left of the point
        yshift: 5,
        font: {
          family: "IBM Plex Sans, Arial, sans-serif",
          size: 10,
          color: "#666",
        },
      });

      // Last point annotation - positioned to the right of the last datapoint
      annotations.push({
        x: lastPoint.date,
        y: lastPoint.value,
        xref: "x",
        yref: "y",
        text: formatValue(lastPoint.value),
        showarrow: false,
        xanchor: "left", // Left edge of text at the point, so text extends right
        yanchor: "bottom",
        xshift: 5, // Shift right to position label to the right of the point
        yshift: 5,
        font: {
          family: "IBM Plex Sans, Arial, sans-serif",
          size: 10,
          color: "#ad35fa",
          weight: "bold",
        },
      });
    }

    return { traces, annotations };
  }, [processedData, showAverage, showAnnotations]);

  // Layout configuration for sparkline (minimal, no axes, but with space for annotations)
  const layout = useMemo(
    () => ({
      margin: { t: 5, b: 20, l: 0, r: 0, pad: 0 }, // Add bottom margin for annotations
      height: height,
      width: width,
      xaxis: {
        visible: false,
        showgrid: false,
        showline: false,
        showticklabels: false,
      },
      yaxis: {
        visible: false,
        showgrid: false,
        showline: false,
        showticklabels: false,
        autorange: true,
      },
      annotations: annotations,
      showlegend: false,
      paper_bgcolor: "transparent",
      plot_bgcolor: "transparent",
      hovermode: false,
    }),
    [height, width, annotations]
  );

  const config = {
    responsive: false,
    displayModeBar: false,
    staticPlot: true,
  };

  if (processedData.length === 0) {
    return (
      <div
        className={styles.container}
        style={{ width: `${width}px`, height: `${height}px` }}
      >
        <div className={styles.empty}>No data</div>
      </div>
    );
  }

  return (
    <div className={styles.container} style={{ width: `${width}px` }}>
      <Plot
        data={traces}
        layout={layout}
        config={config}
        style={{ width: `${width}px`, height: `${height}px` }}
      />
    </div>
  );
}


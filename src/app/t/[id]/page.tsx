"use client";

import { useState, useEffect, useRef } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { useTheme } from "@/contexts/ThemeContext";
import dynamic from "next/dynamic";
import "./styles.css";

// Dynamically import Plotly to avoid SSR issues
const Plot = dynamic(
  () => import("react-plotly.js"),
  { ssr: false }
) as React.ComponentType<any>;

// Types for time series data
interface TimeSeriesDataPoint {
  time_period: string;
  numeric_value: number;
  group_value?: string;
}

interface TimeSeriesMetadata {
  chart_id: number;
  object_name?: string;
  field_name?: string;
  y_axis_label?: string;
  period_type?: string;
  group_field?: string;
  district?: number;
  chart_title?: string;
  caption?: string;
  item_noun?: string;
  city_name?: string;
}

interface TimeSeriesResponse {
  metadata: TimeSeriesMetadata;
  data: TimeSeriesDataPoint[];
  count: number;
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

      const jan1 = new Date(year, 0, 1);
      const daysUntilMonday = (7 - jan1.getDay()) % 7;
      const firstMonday = new Date(
        jan1.getTime() + daysUntilMonday * 24 * 60 * 60 * 1000
      );

      return new Date(
        firstMonday.getTime() + (weekNum - 1) * 7 * 24 * 60 * 60 * 1000
      );
    }

    const dateParts = dateStr.split("-");
    const year = parseInt(dateParts[0]);

    if (dateParts.length === 1) {
      return new Date(year, 0, 1);
    }

    const month = parseInt(dateParts[1]) - 1;
    const day = dateParts.length > 2 ? parseInt(dateParts[2]) : 1;
    return new Date(year, month, day);
  } catch {
    return null;
  }
}

/**
 * Format value for display
 */
function formatValue(value: number | null | undefined): string {
  if (value === null || value === undefined || isNaN(value)) return "-";
  return parseFloat(value.toString()).toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

/**
 * Calculate mean
 */
function calculateMean(values: number[]): number {
  if (values.length === 0) return 0;
  const sum = values.reduce((acc, val) => acc + val, 0);
  return sum / values.length;
}

/**
 * Calculate standard deviation
 */
function calculateStandardDeviation(values: number[], mean: number): number {
  if (values.length === 0) return 0;
  const squareDiffs = values.map((value) => {
    const diff = value - mean;
    return diff * diff;
  });
  const avgSquareDiff = calculateMean(squareDiffs);
  return Math.sqrt(avgSquareDiff);
}

export default function TimeSeriesChartPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const chartId = params.id as string;
  const isEmbedded = searchParams.get("embedded") === "true";
  const { theme } = useTheme();

  const [timeSeries, setTimeSeries] = useState<TimeSeriesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const chartContainerRef = useRef<HTMLDivElement>(null);

  // Fetch time series data
  useEffect(() => {
    if (!chartId) {
      setError("No chart ID provided");
      setLoading(false);
      return;
    }

    const fetchTimeSeries = async () => {
      try {
        setLoading(true);
        setError(null);

        const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8001";
        // Try public endpoint first, then fallback to authenticated endpoint
        let response = await fetch(`${apiBase}/api/time-series/public/${chartId}`);
        
        // If not found, try authenticated endpoint
        if (!response.ok) {
          response = await fetch(`${apiBase}/api/time-series/${chartId}`, {
            credentials: "include",
          });
        }

        if (!response.ok) {
          throw new Error(`Failed to fetch time series: ${response.status} ${response.statusText}`);
        }

        const data: TimeSeriesResponse = await response.json();
        setTimeSeries(data);
      } catch (err: any) {
        console.error("Error fetching time series:", err);
        setError(err.message || "Failed to load time series data");
      } finally {
        setLoading(false);
      }
    };

    fetchTimeSeries();
  }, [chartId]);

  // Update page title when time series data is loaded
  useEffect(() => {
    if (timeSeries?.metadata) {
      const metricName =
        timeSeries.metadata.object_name ||
        timeSeries.metadata.field_name ||
        "Time Series";
      const cityName = timeSeries.metadata.city_name;
      
      let pageTitle = metricName;
      if (cityName) {
        pageTitle = `${metricName} | ${cityName}`;
      }
      pageTitle += " | TransparentCity";
      
      document.title = pageTitle;
    } else {
      document.title = "Time Series Chart | TransparentCity";
    }
  }, [timeSeries]);

  // Process chart data
  const processedData = timeSeries
    ? (() => {
        const dates: Date[] = [];
        const values: number[] = [];
        const hasGroups = timeSeries.data.some((item) => item.group_value);
        const groupedData: Record<string, { dates: Date[]; values: number[] }> = {};

        if (hasGroups) {
          // Group data by group_value
          timeSeries.data.forEach((item) => {
            const dateObj = parseDate(item.time_period);
            if (!dateObj || isNaN(dateObj.getTime())) return;

            const groupValue = item.group_value || "Unknown";
            if (!groupedData[groupValue]) {
              groupedData[groupValue] = { dates: [], values: [] };
            }
            groupedData[groupValue].dates.push(dateObj);
            groupedData[groupValue].values.push(item.numeric_value);
          });

          // Sort each group by date
          Object.keys(groupedData).forEach((key) => {
            const group = groupedData[key];
            const sorted = group.dates
              .map((date, idx) => ({ date, value: group.values[idx] }))
              .sort((a, b) => a.date.getTime() - b.date.getTime());
            groupedData[key].dates = sorted.map((s) => s.date);
            groupedData[key].values = sorted.map((s) => s.value);
          });
        } else {
          // Single series
          timeSeries.data.forEach((item) => {
            const dateObj = parseDate(item.time_period);
            if (!dateObj || isNaN(dateObj.getTime())) return;
            dates.push(dateObj);
            values.push(item.numeric_value);
          });

          // Sort by date
          const sorted = dates
            .map((date, idx) => ({ date, value: values[idx] }))
            .sort((a, b) => a.date.getTime() - b.date.getTime());
          dates.length = 0;
          values.length = 0;
          sorted.forEach((s) => {
            dates.push(s.date);
            values.push(s.value);
          });
        }

        return { dates, values, groupedData, hasGroups };
      })()
    : null;

  // Prepare Plotly traces
  const traces = processedData
    ? (() => {
        const traces: any[] = [];
        const { dates, values, groupedData, hasGroups } = processedData;
        const metadata = timeSeries!.metadata;
        const periodType = metadata.period_type || "month";

        // Color palette for multiple series
        const colorPalette = [
          "#ad35fa", // Primary Purple
          "#FF6B5A", // Warm Coral
          "#4A7463", // Spruce Green
          "#71B2CA", // Sky Blue
          "#8B5CF6", // Secondary Purple
          "#FFC107", // Amber
          "#9C27B0", // Purple
          "#2196F3", // Light Blue
        ];

        if (hasGroups && Object.keys(groupedData).length > 0) {
          // Multiple series
          let colorIndex = 0;
          Object.entries(groupedData).forEach(([groupValue, groupData]) => {
            traces.push({
              x: groupData.dates,
              y: groupData.values,
              type: "scatter",
              mode: "lines+markers",
              name: groupValue,
              line: {
                color: colorPalette[colorIndex % colorPalette.length],
                width: 2,
              },
              marker: {
                color: colorPalette[colorIndex % colorPalette.length],
                size: 6,
              },
              showlegend: true,
              hovertemplate: (() => {
                const itemNoun = metadata.item_noun || "";
                const nounText = itemNoun ? ` ${itemNoun}` : "";
                const dateFormat =
                  periodType === "week"
                    ? "%B %d, %Y"
                    : periodType === "year"
                    ? "%Y"
                    : "%B %Y";
                return `${groupValue}<br>%{x|${dateFormat}}<br>%{y:,.0f}${nounText}<extra></extra>`;
              })(),
              hoverlabel: {
                bgcolor: "#F6F1EA",
                bordercolor: "#4A7463",
                font: {
                  family: "IBM Plex Sans, Arial, sans-serif",
                  size: 10,
                  color: "#222222",
                },
              },
            });
            colorIndex++;
          });

          // Add mean line for all groups combined
          const allValues = Object.values(groupedData).flatMap((g) => g.values);
          const mean = calculateMean(allValues);
          const allDates = Object.values(groupedData).flatMap((g) => g.dates);
          const minDate = new Date(Math.min(...allDates.map((d) => d.getTime())));
          const maxDate = new Date(Math.max(...allDates.map((d) => d.getTime())));

          traces.push({
            x: [minDate, maxDate],
            y: [mean, mean],
            type: "scatter",
            mode: "lines",
            name: `Average: ${formatValue(mean)}`,
            line: {
              color: "rgba(0, 0, 0, 0.3)",
              width: 1,
              dash: "dash",
            },
            showlegend: true,
          });
        } else {
          // Single series
          const mean = calculateMean(values);
          const stdDev = calculateStandardDeviation(values, mean);

          // Mean line
          traces.push({
            x: dates,
            y: dates.map(() => mean),
            type: "scatter",
            mode: "lines",
            name: `Average: ${formatValue(mean)}`,
            line: {
              color: "rgba(0, 123, 255, 0.3)",
              width: 1,
              dash: "solid",
            },
            showlegend: !isEmbedded,
          });

          // Time series data
          traces.push({
            x: dates,
            y: values,
            type: "scatter",
            mode: "lines+markers",
            name: metadata.item_noun || "Time Series",
            line: { color: "#ad35fa", width: 2 },
            marker: { color: "#ad35fa", size: 6 },
            showlegend: !isEmbedded,
            hovertemplate: (() => {
              const itemNoun = metadata.item_noun || "";
              const nounText = itemNoun ? ` ${itemNoun}` : "";
              const dateFormat =
                periodType === "week"
                  ? "%B %d, %Y"
                  : periodType === "year"
                  ? "%Y"
                  : "%B %Y";
              return `%{x|${dateFormat}}<br>%{y:,.0f}${nounText}<extra></extra>`;
            })(),
            hoverlabel: {
              bgcolor: "#F6F1EA",
              bordercolor: "#4A7463",
              font: {
                family: "IBM Plex Sans, Arial, sans-serif",
                size: 10,
                color: "#222222",
              },
            },
          });
        }

        return traces;
      })()
    : [];

  // Build chart title
  const chartTitle = timeSeries
    ? (() => {
        const metricName =
          timeSeries.metadata.object_name ||
          timeSeries.metadata.field_name ||
          "Time Series";
        const cityName = timeSeries.metadata.city_name;
        const groupField = timeSeries.metadata.group_field;
        const groupValue = timeSeries.data[0]?.group_value;
        
        // Check if there are multiple groups (multiple series)
        const hasMultipleGroups = processedData?.hasGroups && 
          processedData.groupedData && 
          Object.keys(processedData.groupedData).length > 1;

        let title = metricName;
        if (cityName) {
          title += ` (${cityName})`;
        }
        // Only add specific group value if there's a single group, not multiple
        if (groupField && groupValue && !hasMultipleGroups) {
          title += `<br>${groupField}: <b>${groupValue}</b>`;
        }
        // Add "by <group field>" subtitle when there are multiple groups
        if (hasMultipleGroups && groupField) {
          title += `<br><span style="font-size: 0.85em; font-weight: normal; color: #666;">by ${groupField}</span>`;
        }

        return title;
      })()
    : "";

  const yAxisLabel =
    timeSeries?.metadata.y_axis_label ||
    timeSeries?.metadata.field_name ||
    timeSeries?.metadata.object_name ||
    "Value";

  // Share functionality
  const handleShare = async () => {
    const url = window.location.href;
    const title = timeSeries
      ? `${timeSeries.metadata.object_name || "Time Series"} | TransparentCity`
      : "Time Series Chart | TransparentCity";
    const text = timeSeries
      ? `Check out this time series: ${timeSeries.metadata.object_name || "Metric"}`
      : "Check out this time series chart";

    if (navigator.share) {
      try {
        await navigator.share({ title, text, url });
        return;
      } catch (err) {
        // User cancelled or error - fall through to fallback
      }
    }

    // Fallback: copy to clipboard
    navigator.clipboard.writeText(url);
  };

  if (loading) {
    return (
      <div className={`time-series-page loading ${isEmbedded ? "embedded" : ""}`}>
        <div className="loading-spinner">Loading time series chart...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`time-series-page ${isEmbedded ? "embedded" : ""}`}>
        <div className="error-container">
          <h1>Time Series Not Available</h1>
          <p>{error}</p>
          {!isEmbedded && (
            <p>This time series may not exist or the link may be incorrect.</p>
          )}
        </div>
      </div>
    );
  }

  if (!timeSeries) {
    return (
      <div className={`time-series-page ${isEmbedded ? "embedded" : ""}`}>
        <div className="error-container">
          <h1>Time Series Not Found</h1>
          <p>No time series data available.</p>
        </div>
      </div>
    );
  }

  const periodType = timeSeries.metadata.period_type || "month";
  const isYearlyData = periodType === "year" || periodType === "yearly";
  const isWeeklyData = periodType === "week" || periodType === "weekly";

  // Embedded mode - minimal UI
  if (isEmbedded) {
    return (
      <div className="time-series-page embedded">
        <div className="embedded-header">
          <a href="/" className="embedded-brand">
            <div className="logo-corners-small">
              <svg
                viewBox="0 0 100 100"
                xmlns="http://www.w3.org/2000/svg"
                style={{ overflow: "visible" }}
              >
                <defs>
                  <mask
                    id="logo-mask-bl-embed"
                    x="-400"
                    y="-400"
                    width="1200"
                    height="1200"
                    maskUnits="userSpaceOnUse"
                    maskContentUnits="userSpaceOnUse"
                  >
                    <rect
                      x="-400"
                      y="-400"
                      width="1200"
                      height="1200"
                      fill="white"
                    />
                    <rect
                      x="8.333"
                      y="8.333"
                      width="83.333"
                      height="83.333"
                      rx="3"
                      ry="3"
                      fill="black"
                    />
                    <rect
                      x="16.666"
                      y="-33.333"
                      width="66.666"
                      height="166.666"
                      fill="black"
                      transform="rotate(-45 50 50)"
                    />
                    <rect
                      x="50"
                      y="-400"
                      width="1200"
                      height="1200"
                      fill="black"
                      transform="rotate(-45 50 50)"
                    />
                  </mask>
                  <mask
                    id="logo-mask-tr-embed"
                    x="-400"
                    y="-400"
                    width="1200"
                    height="1200"
                    maskUnits="userSpaceOnUse"
                    maskContentUnits="userSpaceOnUse"
                  >
                    <rect
                      x="-400"
                      y="-400"
                      width="1200"
                      height="1200"
                      fill="white"
                    />
                    <rect
                      x="8.333"
                      y="8.333"
                      width="83.333"
                      height="83.333"
                      rx="3"
                      ry="3"
                      fill="black"
                    />
                    <rect
                      x="16.666"
                      y="-33.333"
                      width="66.666"
                      height="166.666"
                      fill="black"
                      transform="rotate(-45 50 50)"
                    />
                    <rect
                      x="-1150"
                      y="-400"
                      width="1200"
                      height="1200"
                      fill="black"
                      transform="rotate(-45 50 50)"
                    />
                  </mask>
                </defs>
                <rect
                  className="brace"
                  x="0"
                  y="0"
                  width="100"
                  height="100"
                  rx="3"
                  ry="3"
                  mask="url(#logo-mask-bl-embed)"
                  fill="var(--text-primary)"
                  transform="translate(23.5%, -23.5%)"
                />
                <rect
                  className="brace"
                  x="0"
                  y="0"
                  width="100"
                  height="100"
                  rx="3"
                  ry="3"
                  mask="url(#logo-mask-tr-embed)"
                  fill="var(--text-primary)"
                  transform="translate(-23.5%, 23.5%)"
                />
              </svg>
            </div>
            <span className="brand-text-small">
              <span className="brand-transparent">transparent</span>
              <span className="brand-city">.city</span>
            </span>
          </a>
          <a
            href={`/t/${chartId}`}
            target="_blank"
            rel="noopener noreferrer"
            className="embedded-link"
          >
            Open full view ↗
          </a>
        </div>
        <div className="chart-container embedded-chart" ref={chartContainerRef}>
          {traces.length > 0 && (
            <Plot
              data={traces}
              layout={{
                title: {
                  text: chartTitle,
                  font: {
                    family: "Inter, Arial, sans-serif",
                    size: 14,
                    color: "var(--text-primary, #222222)",
                  },
                  y: 0.95,
                  x: 0.5,
                  xanchor: "center",
                  pad: { t: 5, b: 5 },
                },
                xaxis: {
                  visible: true,
                  title: "",
                  showgrid: false,
                  tickformat: isYearlyData
                    ? "%Y"
                    : isWeeklyData
                    ? "%b %d, %Y"
                    : "%b %Y",
                  tickfont: {
                    family: "IBM Plex Sans, Arial, sans-serif",
                    size: 9,
                    color: "var(--text-primary, #222222)",
                  },
                  ticklen: 3,
                  tickcolor: "var(--text-primary, #222222)",
                  showline: true,
                  linecolor: "#e5e7eb",
                  linewidth: 1,
                  tickpadding: 10,
                },
                yaxis: {
                  visible: true,
                  title: {
                    text: yAxisLabel,
                    font: {
                      family: "IBM Plex Sans, Arial, sans-serif",
                      size: 10,
                      color: "var(--text-primary, #222222)",
                    },
                  },
                  showgrid: true,
                  gridcolor: "rgba(232, 233, 235, 0.5)",
                  zeroline: false,
                  tickfont: {
                    family: "IBM Plex Sans, Arial, sans-serif",
                    size: 9,
                    color: "var(--text-primary, #222222)",
                  },
                },
                showlegend: true,
                legend: {
                  orientation: "h",
                  x: 0.5,
                  y: -0.05,
                  xanchor: "center",
                  yanchor: "top",
                  font: {
                    family: "IBM Plex Sans, Arial, sans-serif",
                    size: 9,
                    color: "var(--text-primary, #222222)",
                  },
                },
                margin: { t: 40, b: 25, l: 50, r: 45 },
                autosize: true,
                paper_bgcolor: "transparent",
                plot_bgcolor: "transparent",
                hovermode: "closest",
                hoverlabel: {
                  bgcolor: "#F6F1EA",
                  bordercolor: "#4A7463",
                  font: {
                    family: "IBM Plex Sans, Arial, sans-serif",
                    size: 9,
                    color: "#222222",
                  },
                },
              }}
              config={{
                responsive: true,
                displayModeBar: false,
              }}
              style={{ width: "100%", height: "100%" }}
              useResizeHandler={true}
            />
          )}
        </div>
      </div>
    );
  }

  // Full view mode
  return (
    <div className="time-series-page">
      <header className="time-series-header">
        <a href="/" className="brand">
          <div className="logo-corners">
            <svg
              viewBox="0 0 100 100"
              xmlns="http://www.w3.org/2000/svg"
              style={{ overflow: "visible" }}
            >
              <defs>
                <mask
                  id="logo-mask-bl"
                  x="-400"
                  y="-400"
                  width="1200"
                  height="1200"
                  maskUnits="userSpaceOnUse"
                  maskContentUnits="userSpaceOnUse"
                >
                  <rect
                    x="-400"
                    y="-400"
                    width="1200"
                    height="1200"
                    fill="white"
                  />
                  <rect
                    x="8.333"
                    y="8.333"
                    width="83.333"
                    height="83.333"
                    rx="3"
                    ry="3"
                    fill="black"
                  />
                  <rect
                    x="16.666"
                    y="-33.333"
                    width="66.666"
                    height="166.666"
                    fill="black"
                    transform="rotate(-45 50 50)"
                  />
                  <rect
                    x="50"
                    y="-400"
                    width="1200"
                    height="1200"
                    fill="black"
                    transform="rotate(-45 50 50)"
                  />
                </mask>
                <mask
                  id="logo-mask-tr"
                  x="-400"
                  y="-400"
                  width="1200"
                  height="1200"
                  maskUnits="userSpaceOnUse"
                  maskContentUnits="userSpaceOnUse"
                >
                  <rect
                    x="-400"
                    y="-400"
                    width="1200"
                    height="1200"
                    fill="white"
                  />
                  <rect
                    x="8.333"
                    y="8.333"
                    width="83.333"
                    height="83.333"
                    rx="3"
                    ry="3"
                    fill="black"
                  />
                  <rect
                    x="16.666"
                    y="-33.333"
                    width="66.666"
                    height="166.666"
                    fill="black"
                    transform="rotate(-45 50 50)"
                  />
                  <rect
                    x="-1150"
                    y="-400"
                    width="1200"
                    height="1200"
                    fill="black"
                    transform="rotate(-45 50 50)"
                  />
                </mask>
              </defs>
              <rect
                className="brace"
                x="0"
                y="0"
                width="100"
                height="100"
                rx="3"
                ry="3"
                mask="url(#logo-mask-bl)"
                fill="var(--text-primary)"
                transform="translate(23.5%, -23.5%)"
              />
              <rect
                className="brace"
                x="0"
                y="0"
                width="100"
                height="100"
                rx="3"
                ry="3"
                mask="url(#logo-mask-tr)"
                fill="var(--text-primary)"
                transform="translate(-23.5%, 23.5%)"
              />
            </svg>
          </div>
          <span className="brand-text">
            <span className="brand-transparent">transparent</span>
            <span className="brand-city">.city</span>
          </span>
        </a>
        <div className="header-right">
          <button
            onClick={handleShare}
            className="share-button-header"
            aria-label="Share this chart"
            title="Share this chart"
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"></path>
              <polyline points="16 6 12 2 8 6"></polyline>
              <line x1="12" y1="2" x2="12" y2="15"></line>
            </svg>
            Share
          </button>
        </div>
      </header>

      <article className="time-series-article">
        <div className="time-series-info">
          <div className="time-series-title-section">
            <h1 className="time-series-title">
              {timeSeries.metadata.object_name ||
                timeSeries.metadata.field_name ||
                "Time Series Chart"}
            </h1>
            {(timeSeries.metadata.city_name || 
              (processedData?.hasGroups && 
               processedData.groupedData && 
               Object.keys(processedData.groupedData).length > 1 &&
               timeSeries.metadata.group_field)) && (
              <div className="time-series-subtitle">
                {timeSeries.metadata.city_name && (
                  <>
                    <span className="time-series-city">
                      {timeSeries.metadata.city_name}
                    </span>
                    {timeSeries.metadata.district !== undefined &&
                      timeSeries.metadata.district !== 0 && (
                        <>
                          <span className="time-series-separator">•</span>
                          <span className="time-series-district">
                            District {timeSeries.metadata.district}
                          </span>
                        </>
                      )}
                    {timeSeries.metadata.period_type && (
                      <>
                        <span className="time-series-separator">•</span>
                        <span className="time-series-period">
                          {timeSeries.metadata.period_type} period
                        </span>
                      </>
                    )}
                  </>
                )}
                {/* Show "by group field" when there are multiple groups */}
                {processedData?.hasGroups && 
                 processedData.groupedData && 
                 Object.keys(processedData.groupedData).length > 1 &&
                 timeSeries.metadata.group_field && (
                  <>
                    {timeSeries.metadata.city_name && (
                      <span className="time-series-separator">•</span>
                    )}
                    <span className="time-series-group-field">
                      by {timeSeries.metadata.group_field}
                    </span>
                  </>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="chart-container" ref={chartContainerRef}>
          {traces.length > 0 && (
            <Plot
              data={traces}
              layout={{
                title: {
                  text: chartTitle,
                  font: {
                    family: "Inter, Arial, sans-serif",
                    size: 16,
                    color: "var(--text-primary, #222222)",
                  },
                  y: 0.95,
                  x: 0.5,
                  xanchor: "center",
                  pad: { t: 10, b: 10 },
                },
                xaxis: {
                  visible: true,
                  title: "",
                  showgrid: false,
                  tickformat: isYearlyData
                    ? "%Y"
                    : isWeeklyData
                    ? "%b %d, %Y"
                    : "%b %Y",
                  tickfont: {
                    family: "IBM Plex Sans, Arial, sans-serif",
                    size: 11,
                    color: "var(--text-primary, #222222)",
                  },
                  ticklen: 3,
                  tickcolor: "var(--text-primary, #222222)",
                  showline: true,
                  linecolor: "#e5e7eb",
                  linewidth: 1,
                  tickpadding: 10,
                },
                yaxis: {
                  visible: true,
                  title: {
                    text: yAxisLabel,
                    font: {
                      family: "IBM Plex Sans, Arial, sans-serif",
                      size: 12,
                      color: "var(--text-primary, #222222)",
                    },
                  },
                  showgrid: true,
                  gridcolor: "rgba(232, 233, 235, 0.5)",
                  zeroline: false,
                  tickfont: {
                    family: "IBM Plex Sans, Arial, sans-serif",
                    size: 11,
                    color: "var(--text-primary, #222222)",
                  },
                },
                showlegend: true,
                legend: {
                  orientation: "h",
                  x: 0.5,
                  y: -0.05,
                  xanchor: "center",
                  yanchor: "top",
                  font: {
                    family: "IBM Plex Sans, Arial, sans-serif",
                    size: 10,
                    color: "var(--text-primary, #222222)",
                  },
                },
                margin: { t: 50, b: 50, l: 60, r: 30 },
                height: 500,
                paper_bgcolor: "transparent",
                plot_bgcolor: "transparent",
                hovermode: "closest",
                hoverlabel: {
                  bgcolor: "#F6F1EA",
                  bordercolor: "#4A7463",
                  font: {
                    family: "IBM Plex Sans, Arial, sans-serif",
                    size: 10,
                    color: "#222222",
                  },
                },
              }}
              config={{
                responsive: true,
                displayModeBar: false,
              }}
              style={{ width: "100%", height: "500px" }}
            />
          )}
        </div>

        {/* Caption */}
        {timeSeries.metadata.caption && (
          <div className="time-series-caption">
            <p dangerouslySetInnerHTML={{ __html: timeSeries.metadata.caption }} />
          </div>
        )}

        {/* Stats Section */}
        {processedData && (
          <div className="time-series-stats">
            <h2 className="stats-title">Statistics</h2>
            <div className="stats-grid">
              <div className="stat-card">
                <div className="stat-label">Data Points</div>
                <div className="stat-value">{timeSeries.count}</div>
              </div>
              <div className="stat-card">
                <div className="stat-label">Mean</div>
                <div className="stat-value">
                  {formatValue(
                    calculateMean(
                      processedData.hasGroups
                        ? Object.values(processedData.groupedData).flatMap(
                            (g) => g.values
                          )
                        : processedData.values
                    )
                  )}
                </div>
              </div>
              <div className="stat-card">
                <div className="stat-label">Min</div>
                <div className="stat-value">
                  {formatValue(
                    Math.min(
                      ...(processedData.hasGroups
                        ? Object.values(processedData.groupedData).flatMap(
                            (g) => g.values
                          )
                        : processedData.values)
                    )
                  )}
                </div>
              </div>
              <div className="stat-card">
                <div className="stat-label">Max</div>
                <div className="stat-value">
                  {formatValue(
                    Math.max(
                      ...(processedData.hasGroups
                        ? Object.values(processedData.groupedData).flatMap(
                            (g) => g.values
                          )
                        : processedData.values)
                    )
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </article>
    </div>
  );
}


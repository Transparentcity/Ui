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

// Types for anomaly data
interface AnomalyChartData {
  dates: string[];
  values: number[];
  periods: ("recent" | "comparison")[];
}

interface AnomalyMetadata {
  object_name?: string;
  field_name?: string;
  y_axis_label?: string;
  period_type?: string;
  group_field_name?: string;
  group_value?: string;
  item_noun?: string;
  city_name?: string;
}

interface Anomaly {
  id: number;
  metric_id?: number;
  district: number;
  period_type: string;
  group_field?: string;
  group_value?: string;
  recent_mean: number;
  comparison_mean: number;
  std_dev: number;
  difference: number;
  percent_change: number;
  is_anomaly: boolean;
  chart_data: AnomalyChartData;
  metadata?: AnomalyMetadata;
  recent_date?: string;
  comparison_date?: string;
  endpoint?: string;
  recent_window?: { label?: string; size?: number };
  comparison_window?: { label?: string; size?: number };
}

interface AnomalyResponse {
  status: string;
  anomaly?: Anomaly;
  message?: string;
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
 * Format percentage for display
 */
function formatPercent(value: number | null | undefined): string {
  if (value === null || value === undefined || isNaN(value)) return "-";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}%`;
}

/**
 * Calculate Z-score (sigma) from difference and std_dev
 */
function calculateZScore(difference: number, stdDev: number): number | null {
  if (!stdDev || stdDev === 0) return null;
  return Math.abs(difference) / stdDev;
}

export default function AnomalyChartPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const anomalyId = params.id as string;
  const isEmbedded = searchParams.get("embedded") === "true";
  const { theme } = useTheme();

  const [anomaly, setAnomaly] = useState<Anomaly | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const chartContainerRef = useRef<HTMLDivElement>(null);

  // Fetch anomaly data
  useEffect(() => {
    if (!anomalyId) {
      setError("No anomaly ID provided");
      setLoading(false);
      return;
    }

    const fetchAnomaly = async () => {
      try {
        setLoading(true);
        setError(null);

        // Try transparentcity-platform API first (public endpoint), then fallback to transparentSF API
        const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8001";
        let response = await fetch(`${apiBase}/api/anomalies/public/result/${anomalyId}`);

        // If not found, try transparentSF API format
        if (!response.ok) {
          const transparentSFBase = process.env.NEXT_PUBLIC_TRANSPARENTSF_API_BASE_URL || "";
          if (transparentSFBase) {
            response = await fetch(`${transparentSFBase}/anomaly-analyzer/api/anomaly-details/${anomalyId}`);
          }
        }

        if (!response.ok) {
          throw new Error(`Failed to fetch anomaly: ${response.status} ${response.statusText}`);
        }

        const data: any = await response.json();

        // Handle different response formats
        let anomalyData: Anomaly;
        
        // Check for TransparentSF format (wrapped in AnomalyResponse)
        if (data.status === "error") {
          throw new Error(data.message || "Anomaly not found");
        }
        
        if (data.anomaly) {
          // TransparentSF format (wrapped response)
          const sfAnomaly = data.anomaly;
          // Ensure group_value is in metadata if it exists on the anomaly
          if (sfAnomaly.metadata && !sfAnomaly.metadata.group_value && sfAnomaly.group_value) {
            sfAnomaly.metadata.group_value = sfAnomaly.group_value;
          }
          if (sfAnomaly.metadata && !sfAnomaly.metadata.group_field_name && sfAnomaly.group_field) {
            sfAnomaly.metadata.group_field_name = sfAnomaly.group_field;
          }
          // Copy endpoint and window info if available
          if (sfAnomaly.metadata) {
            if (!sfAnomaly.endpoint && sfAnomaly.metadata.endpoint) {
              sfAnomaly.endpoint = sfAnomaly.metadata.endpoint;
            }
            if (!sfAnomaly.recent_window && sfAnomaly.metadata.recent_window) {
              sfAnomaly.recent_window = sfAnomaly.metadata.recent_window;
            }
            if (!sfAnomaly.comparison_window && sfAnomaly.metadata.comparison_window) {
              sfAnomaly.comparison_window = sfAnomaly.metadata.comparison_window;
            }
          }
          anomalyData = sfAnomaly;
        } else if (data.id) {
          // TransparentCity platform format (direct result from public API)
          const result = data;
          anomalyData = {
            id: result.id,
            metric_id: result.metric_id,
            district: result.district || 0,
            period_type: result.period_type || "month",
            group_field: result.group_field,
            group_value: result.group_value,
            recent_mean: result.recent_mean || 0,
            comparison_mean: result.comparison_mean || 0,
            std_dev: result.stddev || 0,
            difference: result.difference || 0,
            percent_change: result.pct_change || 0,
            is_anomaly: result.is_anomaly || false,
            chart_data: result.chart_payload
              ? {
                  dates: result.chart_payload.dates || [],
                  values: result.chart_payload.values || [],
                  periods: result.chart_payload.periods || [],
                }
              : { dates: [], values: [], periods: [] },
            metadata: {
              object_name: result.object_name,
              field_name: result.field_name,
              group_field_name: result.group_field,
              group_value: result.group_value,
              item_noun: result.item_noun,
              city_name: result.city_name,
            },
            endpoint: result.endpoint,
            recent_window: result.recent_window,
            comparison_window: result.comparison_window,
          };
        } else {
          throw new Error("Invalid response format: missing anomaly data");
        }

        // Ensure chart_data is properly formatted
        if (anomalyData.chart_data) {
          setAnomaly(anomalyData);
        } else if ((anomalyData as any).chart_payload) {
          const payload = (anomalyData as any).chart_payload;
          setAnomaly({
            ...anomalyData,
            chart_data: {
              dates: payload.dates || [],
              values: payload.values || [],
              periods: payload.periods || [],
            },
          });
        } else {
          setAnomaly(anomalyData);
        }
      } catch (err: any) {
        console.error("Error fetching anomaly:", err);
        setError(err.message || "Failed to load anomaly data");
      } finally {
        setLoading(false);
      }
    };

    fetchAnomaly();
  }, [anomalyId]);

  // Process chart data and extract recent date
  const processedData = anomaly
    ? (() => {
        const recentDates: Date[] = [];
        const recentValues: number[] = [];
        const comparisonDates: Date[] = [];
        const comparisonValues: number[] = [];
        let mostRecentDate: Date | null = null;

        if (anomaly.chart_data) {
          const { dates, values, periods } = anomaly.chart_data;
          for (let i = 0; i < dates.length; i++) {
            const dateObj = parseDate(dates[i]);
            if (!dateObj || isNaN(dateObj.getTime())) continue;

            if (periods[i] === "recent") {
              recentDates.push(dateObj);
              recentValues.push(values[i]);
              // Track the most recent date
              if (!mostRecentDate || dateObj > mostRecentDate) {
                mostRecentDate = dateObj;
              }
            } else if (periods[i] === "comparison") {
              comparisonDates.push(dateObj);
              comparisonValues.push(values[i]);
            }
          }
        }

        return { recentDates, recentValues, comparisonDates, comparisonValues, mostRecentDate };
      })()
    : null;
  
  // Format recent date for display
  const recentDateDisplay = processedData?.mostRecentDate
    ? (() => {
        const date = processedData.mostRecentDate!;
        const periodType = anomaly?.period_type || "month";
        
        if (periodType === "year") {
          return date.toLocaleDateString("en-US", { year: "numeric" });
        } else if (periodType === "month") {
          return date.toLocaleDateString("en-US", { month: "long", year: "numeric" });
        } else if (periodType === "week") {
          return date.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
        } else {
          return date.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
        }
      })()
    : null;

  // Prepare Plotly traces
  const traces = processedData
    ? (() => {
        const traces: any[] = [];
        const { recentDates, recentValues, comparisonDates, comparisonValues } =
          processedData;

        // Normal range shaded area
        if (comparisonDates.length > 0 && anomaly) {
          const allDates = [...comparisonDates, ...recentDates].sort(
            (a, b) => a.getTime() - b.getTime()
          );
          const upperBound = allDates.map(
            () => anomaly.comparison_mean + 2 * anomaly.std_dev
          );
          const lowerBound = allDates.map(() =>
            Math.max(anomaly.comparison_mean - 2 * anomaly.std_dev, 0)
          );

          traces.push({
            x: allDates,
            y: lowerBound,
            type: "scatter",
            mode: "lines",
            line: { color: "rgba(0,0,0,0)" },
            showlegend: false,
            hoverinfo: "skip",
          });

          traces.push({
            x: allDates,
            y: upperBound,
            type: "scatter",
            mode: "lines",
            line: { color: "rgba(74, 116, 99, 0.3)", width: 1 },
            fill: "tonexty",
            fillcolor: "rgba(74, 116, 99, 0.15)",
            name: "Normal Range (±2σ)",
            showlegend: true,
            hoverinfo: "skip",
          });
        }

        // Historical data
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
            hovertemplate: (() => {
              const itemNoun = anomaly?.metadata?.item_noun || "";
              const nounText = itemNoun ? ` ${itemNoun}` : "";
              const dateFormat = anomaly?.period_type === "week" ? "%B %d, %Y" : "%B %Y";
              return `%{x|${dateFormat}}<br>%{y:,.0f}${nounText}<extra></extra>`;
            })(),
          });
        }

        // Recent data
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
            hovertemplate: (() => {
              const itemNoun = anomaly?.metadata?.item_noun || "";
              const nounText = itemNoun ? ` ${itemNoun}` : "";
              const dateFormat = anomaly?.period_type === "week" ? "%B %d, %Y" : "%B %Y";
              return `%{x|${dateFormat}}<br>%{y:,.0f}${nounText}<extra></extra>`;
            })(),
          });
        }

        // Connecting line
        if (comparisonDates.length > 0 && recentDates.length > 0) {
          const lastHistoricalDate = comparisonDates[comparisonDates.length - 1];
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
      })()
    : [];

  // Build chart title - prioritize showing group info, city, and date
  const chartTitle = anomaly
    ? (() => {
        const changeType = anomaly.percent_change > 0 ? "Spike" : "Drop";
        const metricName =
          anomaly.metadata?.object_name ||
          anomaly.metadata?.field_name ||
          "Metric";
        const cityName = anomaly.metadata?.city_name;
        
        // Most important: show group field and value if available (check both metadata and direct properties)
        const groupField = anomaly.metadata?.group_field_name || anomaly.group_field;
        const groupValue = anomaly.metadata?.group_value || anomaly.group_value;
        
        // Build title on multiple lines for readability
        // Use Plotly's HTML support but escape properly
        let title = `${changeType} in ${metricName}`;
        
        if (cityName) {
          title += ` (${cityName})`;
        }
        
        if (groupField && groupValue) {
          title += `<br>${groupField}: <b>${groupValue}</b>`;
        }
        
        if (recentDateDisplay) {
          title += `<br><span style="font-size: 0.9em; color: #666;">${recentDateDisplay}</span>`;
        }
        
        return title;
      })()
    : "";

  const yAxisLabel =
    anomaly?.metadata?.y_axis_label ||
    anomaly?.metadata?.field_name ||
    anomaly?.metadata?.object_name ||
    "Value";

  // Calculate Z-score
  const zScore = anomaly
    ? calculateZScore(anomaly.difference, anomaly.std_dev)
    : null;

  // Share functionality
  const handleShare = async () => {
    const url = window.location.href;
    const title = anomaly
      ? `${anomaly.metadata?.object_name || "Anomaly"} | TransparentCity`
      : "Anomaly Chart | TransparentCity";
    const text = anomaly
      ? `Check out this anomaly: ${anomaly.metadata?.object_name || "Metric"}`
      : "Check out this anomaly chart";

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
      <div className={`anomaly-page loading ${isEmbedded ? "embedded" : ""}`}>
        <div className="loading-spinner">Loading anomaly chart...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`anomaly-page ${isEmbedded ? "embedded" : ""}`}>
        <div className="error-container">
          <h1>Anomaly Not Available</h1>
          <p>{error}</p>
          {!isEmbedded && (
            <p>This anomaly may not exist or the link may be incorrect.</p>
          )}
        </div>
      </div>
    );
  }

  if (!anomaly) {
    return (
      <div className={`anomaly-page ${isEmbedded ? "embedded" : ""}`}>
        <div className="error-container">
          <h1>Anomaly Not Found</h1>
          <p>No anomaly data available.</p>
        </div>
      </div>
    );
  }

  // Embedded mode - minimal UI
  if (isEmbedded) {
    return (
      <div className="anomaly-page embedded">
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
            href={`/a/${anomalyId}`}
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
                  tickformat:
                    anomaly.period_type === "week" ? "%b %d, %Y" : "%b %Y",
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
                  bgcolor: "var(--soft-sand, #F6F1EA)",
                  bordercolor: "var(--brand-primary, #ad35fa)",
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
    <div className="anomaly-page">
      <header className="anomaly-header">
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

      <article className="anomaly-article">
        <div className="anomaly-info">
          <div className="anomaly-title-section">
            {(() => {
              const metricName = anomaly.metadata?.object_name ||
                anomaly.metadata?.field_name ||
                "Anomaly Chart";
              const cityName = anomaly.metadata?.city_name;
              
              // Include group info in title if available (check both metadata and direct properties)
              const groupField = anomaly.metadata?.group_field_name || anomaly.group_field;
              const groupValue = anomaly.metadata?.group_value || anomaly.group_value;
              
              return (
                <>
                  <h1 className="anomaly-title">
                    {metricName}
                  </h1>
                  {cityName && (
                    <div className="anomaly-subtitle">
                      <span className="anomaly-city">{cityName}</span>
                      {groupField && groupValue && (
                        <>
                          <span className="anomaly-separator">•</span>
                          <span className="anomaly-group-info">
                            {groupField}: <strong>{groupValue}</strong>
                          </span>
                        </>
                      )}
                      {recentDateDisplay && (
                        <>
                          <span className="anomaly-separator">•</span>
                          <span className="anomaly-date">{recentDateDisplay}</span>
                        </>
                      )}
                    </div>
                  )}
                  {!cityName && (groupField && groupValue || recentDateDisplay) && (
                    <div className="anomaly-subtitle">
                      {groupField && groupValue && (
                        <span className="anomaly-group-info">
                          {groupField}: <strong>{groupValue}</strong>
                        </span>
                      )}
                      {groupField && groupValue && recentDateDisplay && (
                        <span className="anomaly-separator">•</span>
                      )}
                      {recentDateDisplay && (
                        <span className="anomaly-date">{recentDateDisplay}</span>
                      )}
                    </div>
                  )}
                </>
              );
            })()}
          </div>
          <div className="anomaly-meta">
            <span>
              {anomaly.district === 0
                ? "Citywide"
                : `District ${anomaly.district}`}
            </span>
            <span> • </span>
            <span>{anomaly.period_type} period</span>
            {anomaly.recent_date && (
              <>
                <span> • </span>
                <span>
                  {new Date(anomaly.recent_date).toLocaleDateString()}
                </span>
              </>
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
                  tickformat:
                    anomaly.period_type === "week" ? "%b %d, %Y" : "%b %Y",
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
                  bgcolor: "var(--soft-sand, #F6F1EA)",
                  bordercolor: "var(--brand-primary, #ad35fa)",
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

        {/* Human-readable caption explaining the anomaly */}
        {anomaly && (
          <div className="anomaly-caption">
            {(() => {
              const itemNoun = anomaly.metadata?.item_noun || "items";
              const recentValue = formatValue(anomaly.recent_mean);
              const comparisonValue = formatValue(anomaly.comparison_mean);
              const pctChange = Math.abs(anomaly.percent_change);
              const isIncrease = anomaly.percent_change > 0;
              const changeDirection = isIncrease ? "above" : "below";
              const periodType = anomaly.period_type || "month";
              const cityName = anomaly.metadata?.city_name;
              
              // Format period name
              const periodName = periodType === "month" ? "this month" : 
                                periodType === "week" ? "this week" :
                                periodType === "day" ? "today" : 
                                periodType === "year" ? "this year" : "this period";
              
              // Get window information
              const recentWindowSize = anomaly.recent_window?.size || 1;
              const comparisonWindowSize = anomaly.comparison_window?.size || 6;
              const recentWindowLabel = anomaly.recent_window?.label || `last ${recentWindowSize} ${periodType}${recentWindowSize > 1 ? "s" : ""}`;
              const comparisonWindowLabel = anomaly.comparison_window?.label || `previous ${comparisonWindowSize} ${periodType}${comparisonWindowSize > 1 ? "s" : ""}`;
              
              // Check both metadata and direct properties for group info
              const groupField = anomaly.metadata?.group_field_name || anomaly.group_field;
              const groupValue = anomaly.metadata?.group_value || anomaly.group_value;
              
              // Build DataSF links if endpoint is available
              let dataLink = null;
              let dataQueryLink = null;
              if (anomaly.endpoint) {
                // Extract Socrata dataset ID from endpoint (could be just ID or full URL)
                let datasetId = anomaly.endpoint;
                
                // Handle full URLs
                if (datasetId.includes("data.sfgov.org") || datasetId.includes("data.sf.gov")) {
                  // Extract ID from URL like https://data.sfgov.org/resource/xxxx.json
                  const match = datasetId.match(/resource\/([^\/\.]+)/);
                  if (match) {
                    datasetId = match[1];
                  } else {
                    // Try extracting from /d/ path
                    const dMatch = datasetId.match(/\/d\/([^\/\?]+)/);
                    if (dMatch) {
                      datasetId = dMatch[1];
                    }
                  }
                }
                
                // Only create links if we have a valid dataset ID (alphanumeric, dashes, underscores)
                if (datasetId && /^[a-zA-Z0-9_-]+$/.test(datasetId)) {
                  // Link to dataset page
                  dataLink = `https://data.sfgov.org/d/${datasetId}`;
                  
                  // Build query link with filters
                  const queryParams: string[] = [];
                  
                  // Add district filter if not citywide
                  if (anomaly.district !== undefined && anomaly.district !== 0) {
                    // Try common district field names
                    const districtFields = ['supervisor_district', 'district', 'supervisor_district_number', 'district_number'];
                    // Use the first field that might exist (we can't know for sure without schema)
                    queryParams.push(`supervisor_district=${anomaly.district}`);
                  }
                  
                  // Add group field filter if available
                  if (groupField && groupValue) {
                    // Escape the group value for URL
                    const escapedValue = encodeURIComponent(groupValue);
                    queryParams.push(`${groupField}=${escapedValue}`);
                  }
                  
                  // Add date range if we have recent_date
                  if (anomaly.recent_date) {
                    const recentDate = new Date(anomaly.recent_date);
                    // Try common date field names
                    const dateFields = ['date', 'incident_date', 'report_date', 'occurred_date', 'created_date'];
                    // For now, use a date range around the recent date
                    // Format: YYYY-MM-DD
                    const dateStr = recentDate.toISOString().split('T')[0];
                    queryParams.push(`$where=date >= '${dateStr}'`);
                  }
                  
                  // Build query URL using SoQL format
                  const whereClauses: string[] = [];
                  
                  // Add district filter if not citywide
                  if (anomaly.district !== undefined && anomaly.district !== 0) {
                    // Try common district field names - use the most common one first
                    whereClauses.push(`supervisor_district = ${anomaly.district}`);
                  }
                  
                  // Add group field filter if available (use the actual field name from metadata)
                  if (groupField && groupValue) {
                    const escapedValue = groupValue.replace(/'/g, "''"); // Escape single quotes for SoQL
                    whereClauses.push(`${groupField} = '${escapedValue}'`);
                  }
                  
                  // Add date filter if we have recent_date
                  // Note: Date field names vary by dataset, so we'll use a common one
                  // The actual field name would ideally come from metadata
                  if (anomaly.recent_date) {
                    const recentDate = new Date(anomaly.recent_date);
                    const dateStr = recentDate.toISOString().split('T')[0];
                    // Try common date field names - use 'date' as default
                    // This might need adjustment based on the actual dataset schema
                    whereClauses.push(`date >= '${dateStr}'`);
                  }
                  
                  if (whereClauses.length > 0) {
                    const whereClause = whereClauses.join(' AND ');
                    dataQueryLink = `https://data.sfgov.org/resource/${datasetId}.json?$where=${encodeURIComponent(whereClause)}`;
                  } else {
                    // No filters, just link to the resource
                    dataQueryLink = `https://data.sfgov.org/resource/${datasetId}.json`;
                  }
                }
              }
              
              // Get metric name
              const metricName = anomaly.metadata?.object_name ||
                anomaly.metadata?.field_name ||
                "this metric";
              
              // Build caption parts
              const captionParts: string[] = [];
              
              // Build location text (city, district, or group)
              let locationText = "";
              if (cityName) {
                locationText = cityName;
                if (anomaly.district !== 0) {
                  locationText += `, District ${anomaly.district}`;
                }
              } else if (anomaly.district !== 0) {
                locationText = `District ${anomaly.district}`;
              } else {
                locationText = "citywide";
              }
              
              // Build the main sentence with metric name first, then group info if available
              let mainSentence = "";
              if (groupField && groupValue) {
                // Grouped: "For {Metric Name} in {Group Field}: {Group Value}, in {Location}..."
                mainSentence = `For ${metricName} in ${groupField}: <strong>${groupValue}</strong>, in ${locationText}, ${periodName} (${recentDateDisplay || periodName}), there were ${recentValue} ${itemNoun}, which is ${pctChange.toFixed(1)}% ${changeDirection} the historical average of ${comparisonValue} ${itemNoun}.`;
              } else {
                // Citywide: "For {Metric Name} in {Location}..."
                mainSentence = `For ${metricName} in ${locationText}, ${periodName} (${recentDateDisplay || periodName}), there were ${recentValue} ${itemNoun}, which is ${pctChange.toFixed(1)}% ${changeDirection} the historical average of ${comparisonValue} ${itemNoun}.`;
              }
              
              captionParts.push(mainSentence);
              
              // Comparison details
              captionParts.push(
                `This compares the ${recentWindowLabel} to the average of the ${comparisonWindowLabel}.`
              );
              
              // Normal range explanation
              if (anomaly.std_dev && anomaly.std_dev > 0) {
                const zScore = Math.abs(anomaly.difference) / anomaly.std_dev;
                captionParts.push(
                  `The normal range (shaded area) represents ±2 standard deviations (σ) from the historical average. This data point is ${zScore.toFixed(2)}σ from the mean, ${zScore >= 2 ? "indicating a significant anomaly" : "within normal variation"}.`
                );
              }
              
              return (
                <>
                  <p dangerouslySetInnerHTML={{ __html: captionParts.join(" ") }} />
                  {(dataLink || dataQueryLink) && (
                    <p style={{ marginTop: "0.75rem", marginBottom: 0 }}>
                      {dataQueryLink && (
                        <a 
                          href={dataQueryLink} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          style={{ 
                            color: "var(--brand-primary, #ad35fa)",
                            textDecoration: "none",
                            fontWeight: 500,
                            whiteSpace: "nowrap"
                          }}
                        >
                          View filtered data on DataSF<span style={{ display: "inline" }}> ↗</span>
                        </a>
                      )}
                      {dataLink && (
                        <>
                          {dataQueryLink && <span style={{ margin: "0 0.5rem" }}>•</span>}
                          <a 
                            href={dataLink} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            style={{ 
                              color: "var(--brand-primary, #ad35fa)",
                              textDecoration: "none",
                              fontWeight: 500,
                              whiteSpace: "nowrap"
                            }}
                          >
                            View dataset<span style={{ display: "inline" }}> ↗</span>
                          </a>
                        </>
                      )}
                    </p>
                  )}
                </>
              );
            })()}
          </div>
        )}

        {/* Detailed stats section */}
        <div className="anomaly-stats">
          <h2 className="stats-title">Anomaly Details</h2>
          <div className="stats-grid">
            <div className="stat-card">
              <div className="stat-label">Recent Value</div>
              <div className="stat-value">
                {formatValue(anomaly.recent_mean)}
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Historical Average</div>
              <div className="stat-value">
                {formatValue(anomaly.comparison_mean)}
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Difference</div>
              <div
                className={`stat-value ${
                  anomaly.difference > 0 ? "positive" : "negative"
                }`}
              >
                {formatValue(anomaly.difference)}
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Percent Change</div>
              <div
                className={`stat-value ${
                  anomaly.percent_change > 0 ? "positive" : "negative"
                }`}
              >
                {formatPercent(anomaly.percent_change)}
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Standard Deviation</div>
              <div className="stat-value">{formatValue(anomaly.std_dev)}</div>
            </div>
            {zScore !== null && (
              <div className="stat-card">
                <div className="stat-label">Z-Score (σ)</div>
                <div className="stat-value">{zScore.toFixed(2)}σ</div>
              </div>
            )}
          </div>
        </div>
      </article>
    </div>
  );
}


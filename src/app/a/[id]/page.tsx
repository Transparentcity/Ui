"use client";

import { useState, useEffect, useRef } from "react";
import { useParams, useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";
import Link from "next/link";
import { getPublicMetric, getPublicCityDetail, type PublicMetricDetail, type PublicCityDetail } from "@/lib/publicApiClient";
import { parseLocalDate } from "@/lib/dateRange";
import Loader from "@/components/Loader";
import "./styles.css";

// Dynamically import AnomalyMap to avoid SSR issues with Mapbox
const AnomalyMap = dynamic(
  () => import("@/components/AnomalyMap"),
  { ssr: false }
);

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
  /** Start of the period for which this anomaly was calculated (ISO date). */
  calculation_start_date?: string | null;
  /** End of the period for which this anomaly was calculated (ISO date). */
  calculation_end_date?: string | null;
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
  return `${sign}${Math.round(value)}%`;
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

  const [anomaly, setAnomaly] = useState<Anomaly | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mapData, setMapData] = useState<{
    location_data_count: number;
    period_start?: string | null;
    period_end?: string | null;
  } | null>(null);
  const [metricDetail, setMetricDetail] = useState<PublicMetricDetail | null>(null);
  const [cityDetail, setCityDetail] = useState<PublicCityDetail | null>(null);
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
            calculation_start_date: result.calculation_start_date ?? null,
            calculation_end_date: result.calculation_end_date ?? null,
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

  // Fetch metric details when anomaly is loaded
  useEffect(() => {
    if (!anomaly?.metric_id) {
      setMetricDetail(null);
      return;
    }
    getPublicMetric(anomaly.metric_id)
      .then(setMetricDetail)
      .catch((err) => {
        console.warn("Failed to load metric details:", err);
        setMetricDetail(null);
      });
  }, [anomaly?.metric_id]);

  // Fetch city details when metric detail is loaded
  useEffect(() => {
    if (!metricDetail?.city_id) {
      setCityDetail(null);
      return;
    }
    getPublicCityDetail(metricDetail.city_id)
      .then(setCityDetail)
      .catch((err) => {
        console.warn("Failed to load city details:", err);
        setCityDetail(null);
      });
  }, [metricDetail?.city_id]);

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

        // Compute map date range from recent dates
        let mapStartDate: string | null = null;
        let mapEndDate: string | null = null;
        
        if (recentDates.length > 0) {
          const sortedDates = [...recentDates].sort((a, b) => a.getTime() - b.getTime());
          const minDate = sortedDates[0];
          let maxDate = sortedDates[sortedDates.length - 1];
          
          // Extend end date based on period type to capture full period
          const periodType = anomaly?.period_type || "month";
          if (periodType === "week") {
            // Add 6 days to get end of week
            maxDate = new Date(maxDate.getTime() + 6 * 24 * 60 * 60 * 1000);
          } else if (periodType === "month") {
            // Extend to end of month
            const lastDay = new Date(maxDate.getFullYear(), maxDate.getMonth() + 1, 0).getDate();
            maxDate = new Date(maxDate.getFullYear(), maxDate.getMonth(), lastDay);
          } else if (periodType === "year") {
            // Extend to end of year
            maxDate = new Date(maxDate.getFullYear(), 11, 31);
          }
          
          // Format as YYYY-MM-DD
          mapStartDate = minDate.toISOString().split('T')[0];
          mapEndDate = maxDate.toISOString().split('T')[0];
        }

        return { recentDates, recentValues, comparisonDates, comparisonValues, mostRecentDate, mapStartDate, mapEndDate };
      })()
    : null;
  
  // For weekly data, shift a date from Monday (start) to Sunday (end) for display
  const toWeekEnd = (d: Date): Date => {
    const s = new Date(d);
    s.setDate(s.getDate() + 6);
    return s;
  };

  // Single source of truth for the period the anomaly was calculated for (and for the map).
  // Prefer API-provided calculation dates when present; otherwise derive from chart data.
  const mapDateStart =
    anomaly?.calculation_start_date ?? processedData?.mapStartDate ?? null;
  const mapDateEnd =
    anomaly?.calculation_end_date ?? processedData?.mapEndDate ?? null;

  // Calculation date range label for display
  const calculationDateRangeLabel =
    mapDateStart && mapDateEnd
      ? (() => {
          const start = parseLocalDate(mapDateStart);
          const end = parseLocalDate(mapDateEnd);
          if (!start || !end) return null;
          const startStr = start.toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
          });
          const endStr = end.toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric",
          });
          return `${startStr} – ${endStr}`;
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
          const sunday = toWeekEnd(date);
          const monStr = date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
          const sunStr = sunday.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
          return `${monStr} – ${sunStr}`;
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

        const isWeekly = anomaly?.period_type === "week";

        // For weekly data, plot at end-of-week (Sunday) so the chart
        // clearly shows data coverage through the last day of the period.
        const chartDates = (dates: Date[]) =>
          isWeekly ? dates.map(toWeekEnd) : dates;

        // Build hover label showing week range (Mon – Sun) for weekly data
        const weekHoverLabels = (dates: Date[]) =>
          dates.map((d) => {
            const sun = toWeekEnd(d);
            const monStr = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
            const sunStr = sun.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
            return `${monStr} – ${sunStr}`;
          });

        const itemNoun = anomaly?.metadata?.item_noun || "";
        const nounText = itemNoun ? ` ${itemNoun}` : "";

        // Normal range shaded area
        if (comparisonDates.length > 0 && anomaly) {
          const allDates = chartDates(
            [...comparisonDates, ...recentDates].sort(
              (a, b) => a.getTime() - b.getTime()
            )
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
          const xDates = chartDates(comparisonDates);
          traces.push({
            x: xDates,
            y: comparisonValues,
            type: "scatter",
            mode: "lines+markers",
            name: "Historical Data",
            line: { color: "#ad35fa", width: 2 },
            marker: { color: "#ad35fa", size: 6 },
            showlegend: true,
            ...(isWeekly
              ? {
                  customdata: weekHoverLabels(comparisonDates).map((l) => [l]),
                  hovertemplate: `%{customdata[0]}<br>%{y:,.0f}${nounText}<extra></extra>`,
                }
              : {
                  hovertemplate: `%{x|%B %Y}<br>%{y:,.0f}${nounText}<extra></extra>`,
                }),
          });
        }

        // Recent data
        if (recentDates.length > 0) {
          const xDates = chartDates(recentDates);
          traces.push({
            x: xDates,
            y: recentValues,
            type: "scatter",
            mode: "lines+markers",
            name: "Recent Data",
            line: { color: "#ad35fa", width: 2 },
            marker: { color: "#ad35fa", size: 6 },
            showlegend: true,
            ...(isWeekly
              ? {
                  customdata: weekHoverLabels(recentDates).map((l) => [l]),
                  hovertemplate: `%{customdata[0]}<br>%{y:,.0f}${nounText}<extra></extra>`,
                }
              : {
                  hovertemplate: `%{x|%B %Y}<br>%{y:,.0f}${nounText}<extra></extra>`,
                }),
          });
        }

        // Connecting line
        if (comparisonDates.length > 0 && recentDates.length > 0) {
          const lastHistoricalDate = chartDates(comparisonDates)[comparisonDates.length - 1];
          const lastHistoricalValue =
            comparisonValues[comparisonValues.length - 1];
          const firstRecentDate = chartDates(recentDates)[0];
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

  // Compute explicit x-axis tick values so the first and last data points
  // are always labeled on the axis (Plotly's auto-ticks often skip them).
  const xAxisTicks = (() => {
    if (!processedData || !anomaly) return {};
    const { comparisonDates, recentDates } = processedData;
    const isWeekly = anomaly.period_type === "week";

    const allRaw = [...comparisonDates, ...recentDates].sort(
      (a, b) => a.getTime() - b.getTime()
    );
    if (allRaw.length === 0) return {};

    const displayDates = isWeekly ? allRaw.map(toWeekEnd) : allRaw;
    const first = displayDates[0];
    const last = displayDates[displayDates.length - 1];

    const maxTicks = 8;
    const step = Math.max(1, Math.floor(displayDates.length / (maxTicks - 1)));
    const tickvals: Date[] = [first];
    for (let i = step; i < displayDates.length - 1; i += step) {
      tickvals.push(displayDates[i]);
    }
    if (tickvals[tickvals.length - 1].getTime() !== last.getTime()) {
      tickvals.push(last);
    }

    const fmt = (d: Date) =>
      isWeekly
        ? d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
        : d.toLocaleDateString("en-US", { month: "short", year: "numeric" });

    return {
      tickmode: "array" as const,
      tickvals,
      ticktext: tickvals.map(fmt),
    };
  })();

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
      } catch {
        // User cancelled or error - fall through to fallback
      }
    }

    // Fallback: copy to clipboard
    navigator.clipboard.writeText(url);
  };

  if (loading) {
    return (
      <div className={`anomaly-page loading ${isEmbedded ? "embedded" : ""}`}>
        <div className="tc-loading-state tc-loading-state--stacked">
          <Loader size="md" color="dark" />
          <span>Loading anomaly chart…</span>
        </div>
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
          <Link href="/" className="embedded-brand">
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
          </Link>
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
                  ...xAxisTicks,
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

  // Full view mode - compute display values
  const metricName = anomaly.metadata?.object_name ||
    anomaly.metadata?.field_name ||
    "this metric";
  const itemNoun = (anomaly.metadata?.item_noun || "items").toLowerCase();
  const cityName = anomaly.metadata?.city_name;
  const groupField = anomaly.metadata?.group_field_name || anomaly.group_field;
  const groupValue = anomaly.metadata?.group_value || anomaly.group_value;
  const locationLabel = anomaly.district === 0 ? "citywide" : `District ${anomaly.district}`;
  const pctChange = Math.abs(anomaly.percent_change);
  const isIncrease = anomaly.percent_change > 0;
  const changeType = isIncrease ? "spike" : "drop";

  // Format date for map caption
  const formatMapDate = (dateStr: string | null | undefined) => {
    if (!dateStr) return "";
    const date = parseLocalDate(dateStr);
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  };

  return (
    <div className="anomaly-page">
      {/* Header */}
      <header className="anomaly-header">
        <Link href="/" className="brand">
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
                  <rect x="-400" y="-400" width="1200" height="1200" fill="white" />
                  <rect x="8.333" y="8.333" width="83.333" height="83.333" rx="3" ry="3" fill="black" />
                  <rect x="16.666" y="-33.333" width="66.666" height="166.666" fill="black" transform="rotate(-45 50 50)" />
                  <rect x="50" y="-400" width="1200" height="1200" fill="black" transform="rotate(-45 50 50)" />
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
                  <rect x="-400" y="-400" width="1200" height="1200" fill="white" />
                  <rect x="8.333" y="8.333" width="83.333" height="83.333" rx="3" ry="3" fill="black" />
                  <rect x="16.666" y="-33.333" width="66.666" height="166.666" fill="black" transform="rotate(-45 50 50)" />
                  <rect x="-1150" y="-400" width="1200" height="1200" fill="black" transform="rotate(-45 50 50)" />
                </mask>
              </defs>
              <rect className="brace" x="0" y="0" width="100" height="100" rx="3" ry="3" mask="url(#logo-mask-bl)" fill="var(--text-primary)" transform="translate(23.5%, -23.5%)" />
              <rect className="brace" x="0" y="0" width="100" height="100" rx="3" ry="3" mask="url(#logo-mask-tr)" fill="var(--text-primary)" transform="translate(-23.5%, 23.5%)" />
            </svg>
          </div>
          <span className="brand-text">
            <span className="brand-transparent">transparent</span>
            <span className="brand-city">.city</span>
          </span>
        </Link>
        <div className="header-right">
          <button
            onClick={handleShare}
            className="share-button-header"
            aria-label="Share this chart"
            title="Share this chart"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"></path>
              <polyline points="16 6 12 2 8 6"></polyline>
              <line x1="12" y1="2" x2="12" y2="15"></line>
            </svg>
            Share
          </button>
        </div>
      </header>

      <article className="anomaly-article">
        {/* Hero Section - Anomaly Announcement */}
        <div className="anomaly-hero">
          <div className="anomaly-badge">
            <span className="badge-icon">⚠️</span>
            <span className="badge-text">Data Anomaly Detected</span>
          </div>
          <h1 className="anomaly-headline">
            A {Math.round(pctChange)}% {changeType} in <span className="metric-highlight">{metricName}</span>
            {groupValue && (
              <> for <span className="group-highlight">{groupValue}</span></>
            )}
          </h1>
          <p className="anomaly-subheadline">
            {cityName ? `${cityName}, ` : ""}{locationLabel}
            {recentDateDisplay && ` • ${recentDateDisplay}`}
          </p>
          {calculationDateRangeLabel && (
            <p className="anomaly-calculation-range" aria-label="Date range for which this anomaly was calculated">
              Calculated for the period: {calculationDateRangeLabel}
            </p>
          )}
        </div>

        {/* Section: Time Series Chart */}
        <section className="anomaly-section">
          <h2 className="section-header">How does this compare to historical data?</h2>
          
          <div className="chart-container" ref={chartContainerRef}>
            {traces.length > 0 && (
              <Plot
                data={traces}
                layout={{
                  xaxis: {
                    visible: true,
                    title: "",
                    showgrid: false,
                    ...xAxisTicks,
                    tickfont: { family: "IBM Plex Sans, Arial, sans-serif", size: 11, color: "var(--text-primary, #222222)" },
                    ticklen: 3,
                    tickcolor: "var(--text-primary, #222222)",
                    showline: true,
                    linecolor: "#e5e7eb",
                    linewidth: 1,
                    tickpadding: 10,
                  },
                  yaxis: {
                    visible: true,
                    title: { text: yAxisLabel, font: { family: "IBM Plex Sans, Arial, sans-serif", size: 12, color: "var(--text-primary, #222222)" } },
                    showgrid: true,
                    gridcolor: "rgba(232, 233, 235, 0.5)",
                    zeroline: false,
                    tickfont: { family: "IBM Plex Sans, Arial, sans-serif", size: 11, color: "var(--text-primary, #222222)" },
                  },
                  showlegend: true,
                  legend: {
                    orientation: "h",
                    x: 0.5,
                    y: -0.08,
                    xanchor: "center",
                    yanchor: "top",
                    font: { family: "IBM Plex Sans, Arial, sans-serif", size: 10, color: "var(--text-primary, #222222)" },
                  },
                  margin: { t: 20, b: 60, l: 60, r: 30 },
                  height: 400,
                  paper_bgcolor: "transparent",
                  plot_bgcolor: "transparent",
                  hovermode: "closest",
                  hoverlabel: {
                    bgcolor: "var(--soft-sand, #F6F1EA)",
                    bordercolor: "var(--brand-primary, #ad35fa)",
                    font: { family: "IBM Plex Sans, Arial, sans-serif", size: 10, color: "#222222" },
                  },
                }}
                config={{ responsive: true, displayModeBar: false }}
                style={{ width: "100%", height: "400px" }}
              />
            )}
          </div>

          {/* Chart caption */}
          <div className="section-caption">
            {(() => {
              const recentValue = formatValue(anomaly.recent_mean);
              const comparisonValue = formatValue(anomaly.comparison_mean);
              const changeDirection = isIncrease ? "above" : "below";
              const comparisonWindowSize = anomaly.comparison_window?.size || 6;
              const comparisonWindowLabel = anomaly.comparison_window?.label || `previous ${comparisonWindowSize} ${anomaly.period_type}${comparisonWindowSize > 1 ? "s" : ""}`;
              
              return (
                <p>
                  The recent value of <strong>{recentValue} {itemNoun}</strong> is {Math.round(pctChange)}% {changeDirection} the 
                  historical average of <strong>{comparisonValue} {itemNoun}</strong> (based on the {comparisonWindowLabel}).
                  The shaded area represents the normal range (±2 standard deviations).
                  {zScore !== null && zScore >= 2 && (
                    <> This data point is <strong>{zScore.toFixed(1)}σ</strong> from the mean, indicating a statistically significant anomaly.</>
                  )}
                </p>
              );
            })()}
          </div>
        </section>

        {/* Section: Location Map - uses same date range as "Calculated for the period" */}
        {anomaly.metric_id && mapDateStart && mapDateEnd && (
          <section className="anomaly-section">
            <h2 className="section-header">Where did these {itemNoun} happen?</h2>
            
            <AnomalyMap
              metricId={anomaly.metric_id}
              startDate={mapDateStart}
              endDate={mapDateEnd}
              district={anomaly.district}
              groupField={anomaly.group_field}
              groupValue={anomaly.group_value}
              height={350}
              hideHeader={true}
              onLoad={(data) => setMapData({
                location_data_count: data.location_data_count,
                period_start: data.period_start,
                period_end: data.period_end,
              })}
            />

            {/* Map caption: same period as anomaly; note when filtered by group */}
            {mapData && mapData.location_data_count > 0 && (
              <div className="section-caption">
                <p>
                  This map shows <strong>{mapData.location_data_count.toLocaleString()} {itemNoun}</strong>
                  {calculationDateRangeLabel
                    ? ` for the same period as above (${calculationDateRangeLabel}).`
                    : mapData.period_start && mapData.period_end
                      ? ` between ${formatMapDate(mapData.period_start)} and ${formatMapDate(mapData.period_end)}.`
                      : "."}
                  {anomaly.group_value && (
                    <> Filtered to <strong>{anomaly.group_value}</strong> (same as the anomaly above).</>
                  )}
                  {anomaly.district !== 0 && !anomaly.group_value && ` In District ${anomaly.district}.`}
                  {" "}Each dot represents one {itemNoun.endsWith("s") ? itemNoun.slice(0, -1) : itemNoun}.
                </p>
              </div>
            )}
          </section>
        )}

        {/* Section: Anomaly Details */}
        <section className="anomaly-section">
          <h2 className="section-header">What are the numbers?</h2>
          
          <div className="stats-grid">
            <div className="stat-card">
              <div className="stat-label">Recent Value</div>
              <div className="stat-value">{formatValue(anomaly.recent_mean)}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Historical Average</div>
              <div className="stat-value">{formatValue(anomaly.comparison_mean)}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Difference</div>
              <div className={`stat-value ${anomaly.difference > 0 ? "positive" : "negative"}`}>
                {anomaly.difference > 0 ? "+" : ""}{formatValue(anomaly.difference)}
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Percent Change</div>
              <div className={`stat-value ${anomaly.percent_change > 0 ? "positive" : "negative"}`}>
                {formatPercent(anomaly.percent_change)}
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Standard Deviation</div>
              <div className="stat-value">{formatValue(anomaly.std_dev)}</div>
            </div>
            {zScore !== null && (
              <div className="stat-card">
                <div className="stat-label">Z-Score</div>
                <div className="stat-value">{zScore.toFixed(2)}σ</div>
              </div>
            )}
          </div>
        </section>

        {/* Section: About This Data */}
        {metricDetail && (
          <section className="anomaly-section about-data-section">
            <h2 className="section-header">About this data</h2>
            
            <div className="about-data-content">
              {metricDetail.definition && (
                <p className="data-definition">{metricDetail.definition}</p>
              )}
              
              <p className="data-source">
                This data comes from{" "}
                {(() => {
                  const portalUrl = cityDetail?.main_portal_url || null;
                  const datasetName = metricDetail.dataset_name || metricDetail.dataset_title || metricDetail.metric_name;
                  const datasetUrl = metricDetail.source_url || metricDetail.data_sf_url;
                  const endpointUrl = datasetUrl || (portalUrl && metricDetail.endpoint ? `${portalUrl.replace(/\/$/, "")}/resource/${metricDetail.endpoint}` : null);
                  const portalDomain = cityDetail?.main_domain || (portalUrl ? (() => {
                    try {
                      return new URL(portalUrl).hostname.replace(/^www\./, "");
                    } catch {
                      return portalUrl;
                    }
                  })() : null);
                  const resolvedCityName = cityDetail?.name || metricDetail.city_name || cityName;

                  return (
                    <>
                      {endpointUrl ? (
                        <a href={endpointUrl} target="_blank" rel="noopener noreferrer" className="data-link">
                          {datasetName}
                        </a>
                      ) : (
                        <strong>{datasetName}</strong>
                      )}
                      {resolvedCityName && (
                        <>
                          , a public dataset maintained by {resolvedCityName}
                          {portalUrl ? (
                            <>
                              {" on "}
                              <a href={portalUrl} target="_blank" rel="noopener noreferrer" className="data-link">
                                {portalDomain || "the city's open data portal"}
                              </a>
                            </>
                          ) : (
                            " on the city's open data portal"
                          )}
                        </>
                      )}
                      .
                    </>
                  );
                })()}
              </p>
              
              {anomaly.metric_id && (
                <Link href={`/c/${cityDetail?.slug || 'sf'}/metrics/${metricDetail.metric_key}`} className="view-metric-link">
                  View full metric details →
                </Link>
              )}
            </div>
          </section>
        )}

        {/* Logged Out Footer */}
        <footer className="anomaly-footer">
          <div className="footer-content">
            <p className="footer-text">
              This anomaly was detected by <strong>transparent.city</strong>, a civic data platform that delivers
              block-level data about what’s happening near you and in the places you care about—in your city and around the world.
            </p>
            <div className="footer-links">
              <Link href="/" className="footer-link">
                Explore more data →
              </Link>
            </div>
          </div>
        </footer>
      </article>
    </div>
  );
}


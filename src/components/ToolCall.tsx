"use client";

import { useEffect, useId, useMemo, useState } from "react";
import Link from "next/link";

import styles from "./ToolCall.module.css";
import { API_BASE } from "@/lib/apiBase";
import TimeSeriesChart, { type PeriodType } from "./TimeSeriesChart";
import Loader from "./Loader";

interface ToolCallProps {
  toolCall: {
    tool_id?: string;
    tool_name?: string;
    toolName?: string;
    arguments?: any;
    args?: any;
    input?: any;
    parameters?: any;
    response?: any;
    result?: any;
    output?: any;
    success?: boolean;
  };
}

// Try to parse response as JSON if it's a string
function parseResponse(response: any): any {
  if (typeof response === "string") {
    try {
      return JSON.parse(response);
    } catch {
      return response;
    }
  }
  return response;
}

// Check if this is a map result (only show_map, not generate_map)
function isMapResult(toolName: string, response: any): boolean {
  const parsed = parseResponse(response);
  // Only show embedded map for show_map, not generate_map
  const isShowMapTool = toolName === "show_map";
  return isShowMapTool && (parsed?.data?.short_hash || parsed?.short_hash);
}

// Check if this is an anomaly result (show_anomaly)
function isAnomalyResult(toolName: string, response: any): boolean {
  const parsed = parseResponse(response);
  const isAnomalyTool = toolName === "show_anomaly";
  return isAnomalyTool && (parsed?.data?.id || parsed?.id);
}

// Check if this is a time series result (show_time_series)
function isTimeSeriesResult(toolName: string, response: any): boolean {
  const parsed = parseResponse(response);
  const isTimeSeriesTool = toolName === "show_time_series";
  return isTimeSeriesTool && (parsed?.data?.chart_id || parsed?.chart_id);
}

// Get map data from response
function getMapData(response: any): any {
  const parsed = parseResponse(response);
  // Handle both formats: {data: {short_hash, ...}} and {short_hash, ...}
  return parsed?.data || parsed;
}

// Get anomaly data from response
function getAnomalyData(response: any): any {
  const parsed = parseResponse(response);
  // Handle both formats: {data: {id, ...}} and {id, ...}
  return parsed?.data || parsed;
}

// Get time series data from response
function getTimeSeriesData(response: any): any {
  const parsed = parseResponse(response);
  // Handle both formats: {data: {chart_id, ...}} and {chart_id, ...}
  return parsed?.data || parsed;
}

/** Match `/t/[id]` period query handling */
function parsePeriodQuery(value: string | null | undefined): PeriodType | null {
  if (!value) return null;
  const v = value.toLowerCase();
  if (v === "day" || v === "week" || v === "month" || v === "year" || v === "ytd") {
    return v;
  }
  return null;
}

function resolveChartIdForPeriod(
  period: PeriodType,
  permalinkChartId: string,
  siblings: Record<string, number> | undefined | null
): string {
  if (period === "ytd") {
    const dayId = siblings?.["day"];
    if (dayId != null) return String(dayId);
    return permalinkChartId;
  }
  const sid = siblings?.[period];
  if (sid != null) return String(sid);
  return permalinkChartId;
}

function periodDisplayLabel(p: PeriodType): string {
  if (p === "ytd") return "Year-to-Date";
  return p;
}

// Render an embedded map with iframe
function EmbeddedMapCard({ data }: { data: any }) {
  const [showEmbed, setShowEmbed] = useState(true);
  const mapData = getMapData(data);
  const shortHash = mapData.short_hash;
  const title = mapData.title || "Map";
  const pointCount = mapData.point_count || 0;
  const mapType = mapData.map_type || "point";
  const isPublic = mapData.is_public;
  const viewUrl = mapData.view_url || `/m/${shortHash}`;
  const embedUrl = `${viewUrl}?embedded=true`;
  
  return (
    <div className={styles.mapEmbed}>
      {/* Header bar */}
      <div className={styles.mapEmbedHeader}>
        <div className={styles.mapEmbedInfo}>
          <span className={styles.mapEmbedIcon}>🗺️</span>
          <div className={styles.mapEmbedTitle}>{title}</div>
        </div>
        <div className={styles.mapEmbedMeta}>
          <span>{pointCount.toLocaleString()} locations</span>
          <span className={styles.mapPreviewDot}>•</span>
          <span>{mapType}</span>
          {isPublic && (
            <>
              <span className={styles.mapPreviewDot}>•</span>
              <span className={styles.mapPreviewPublic}>Public</span>
            </>
          )}
        </div>
        <div className={styles.mapEmbedActions}>
          <button
            className={styles.mapEmbedToggle}
            onClick={() => setShowEmbed(!showEmbed)}
            title={showEmbed ? "Collapse map" : "Expand map"}
          >
            {showEmbed ? "▼" : "▶"}
          </button>
          <Link href={viewUrl} target="_blank" className={styles.mapEmbedLink}>
            Open ↗
          </Link>
        </div>
      </div>
      
      {/* Embedded map iframe */}
      {showEmbed && (
        <div className={styles.mapEmbedContainer}>
          <iframe
            src={embedUrl}
            className={styles.mapEmbedIframe}
            title={title}
            loading="lazy"
            allowFullScreen
          />
        </div>
      )}
    </div>
  );
}

// Render an embedded anomaly chart with iframe
function EmbeddedAnomalyCard({ data }: { data: any }) {
  const [showEmbed, setShowEmbed] = useState(true);
  const anomalyData = getAnomalyData(data);
  const anomalyId = anomalyData.id;
  const metricName = anomalyData.metric_name || "Anomaly";
  const periodType = anomalyData.period_type || "N/A";
  const isAnomaly = anomalyData.is_anomaly || false;
  const pctChange = anomalyData.pct_change || 0;
  const viewUrl = anomalyData.view_url || `/a/${anomalyId}`;
  const embedUrl = anomalyData.embed_url || `${viewUrl}?embedded=true`;
  
  // Build title with anomaly info
  const changeType = pctChange > 0 ? "Spike" : "Drop";
  const title = `${changeType}: ${metricName} (${periodType})`;
  
  return (
    <div className={styles.mapEmbed}>
      {/* Header bar */}
      <div className={styles.mapEmbedHeader}>
        <div className={styles.mapEmbedInfo}>
          <span className={styles.mapEmbedIcon}>📊</span>
          <div className={styles.mapEmbedTitle}>{title}</div>
        </div>
        <div className={styles.mapEmbedMeta}>
          <span>{periodType}</span>
          {anomalyData.group_value && (
            <>
              <span className={styles.mapPreviewDot}>•</span>
              <span>{anomalyData.group_value}</span>
            </>
          )}
          {isAnomaly && (
            <>
              <span className={styles.mapPreviewDot}>•</span>
              <span style={{ color: "var(--warning-text, #f59e0b)" }}>Anomaly</span>
            </>
          )}
          {pctChange !== 0 && (
            <>
              <span className={styles.mapPreviewDot}>•</span>
              <span style={{ 
                color: pctChange > 0 ? "var(--error-text, #ef4444)" : "var(--success-text, #10b981)" 
              }}>
                {pctChange > 0 ? "+" : ""}{Math.round(pctChange)}%
              </span>
            </>
          )}
        </div>
        <div className={styles.mapEmbedActions}>
          <button
            className={styles.mapEmbedToggle}
            onClick={() => setShowEmbed(!showEmbed)}
            title={showEmbed ? "Collapse chart" : "Expand chart"}
          >
            {showEmbed ? "▼" : "▶"}
          </button>
          <Link href={viewUrl} target="_blank" className={styles.mapEmbedLink}>
            Open ↗
          </Link>
        </div>
      </div>
      
      {/* Embedded anomaly chart iframe */}
      {showEmbed && (
        <div className={styles.mapEmbedContainer}>
          <iframe
            src={embedUrl}
            className={styles.mapEmbedIframe}
            title={title}
            loading="lazy"
            allowFullScreen
          />
        </div>
      )}
    </div>
  );
}

function EmbeddedTimeSeriesCard({ data }: { data: any }) {
  const [showEmbed, setShowEmbed] = useState(true);
  const [chartData, setChartData] = useState<{ data: any[]; metadata?: any } | null>(null);
  const [displayPeriod, setDisplayPeriod] = useState<PeriodType>("month");
  const [loading, setLoading] = useState(true);

  const timeSeriesData = getTimeSeriesData(data);
  const chartId = timeSeriesData.chart_id;
  const requestedPeriodRaw = timeSeriesData.requested_period as string | undefined;
  const metricName = timeSeriesData.metric_name || "Time Series";
  const dataPointCount =
    chartData?.data?.length ?? timeSeriesData.data_point_count ?? 0;
  const viewUrl = timeSeriesData.view_url || `/t/${chartId}`;

  const title = `${metricName} (${periodDisplayLabel(displayPeriod)})`;

  useEffect(() => {
    let mounted = true;
    setLoading(true);

    const load = async () => {
      const permalinkId = String(chartId);
      const periodFromTool = requestedPeriodRaw ?? null;

      const fetchOne = async (id: string) => {
        let response = await fetch(`${API_BASE}/api/time-series/public/${id}`);
        if (!response.ok) {
          response = await fetch(`${API_BASE}/api/time-series/${id}`, {
            credentials: "include",
          });
        }
        if (!response.ok) throw new Error("Failed to load time series");
        return response.json();
      };

      try {
        const first = await fetchOne(permalinkId);
        if (!mounted) return;
        const siblings = first.sibling_chart_ids || {};
        const metaPeriod = (
          first.metadata?.period_type || "month"
        ).toLowerCase() as PeriodType;
        const urlPeriod = parsePeriodQuery(periodFromTool);
        const effectivePeriod = (urlPeriod ?? metaPeriod) as PeriodType;
        const effectiveId = resolveChartIdForPeriod(
          effectivePeriod,
          permalinkId,
          siblings
        );
        let final = first;
        if (effectiveId !== permalinkId) {
          final = await fetchOne(effectiveId);
        }
        if (!mounted) return;
        setChartData(final);
        setDisplayPeriod(effectivePeriod);
      } catch {
        if (mounted) setChartData(null);
      } finally {
        if (mounted) setLoading(false);
      }
    };

    void load();
    return () => {
      mounted = false;
    };
  }, [chartId, requestedPeriodRaw]);

  const aggregated = useMemo(() => {
    if (!chartData?.data) return [];
    const map = new Map<string, { sum: number; count: number }>();
    chartData.data.forEach((point: any) => {
      const key = `${point.time_period}|${point.group_value || ""}`;
      const existing = map.get(key) || { sum: 0, count: 0 };
      map.set(key, { sum: existing.sum + (point.numeric_value || 0), count: existing.count + 1 });
    });
    return Array.from(map.entries()).map(([key, { sum }]) => {
      const [time_period, group_value] = key.split("|");
      return { time_period, numeric_value: sum, group_value: group_value || null };
    });
  }, [chartData]);

  return (
    <div className={styles.mapEmbed}>
      <div className={styles.mapEmbedHeader}>
        <div className={styles.mapEmbedInfo}>
          <span className={styles.mapEmbedIcon}>📈</span>
          <div className={styles.mapEmbedTitle}>{title}</div>
        </div>
        <div className={styles.mapEmbedMeta}>
          <span>{periodDisplayLabel(displayPeriod)}</span>
          {timeSeriesData.group_field && timeSeriesData.group_value && (
            <>
              <span className={styles.mapPreviewDot}>•</span>
              <span>{timeSeriesData.group_value}</span>
            </>
          )}
          {dataPointCount > 0 && (
            <>
              <span className={styles.mapPreviewDot}>•</span>
              <span>{dataPointCount} points</span>
            </>
          )}
        </div>
        <div className={styles.mapEmbedActions}>
          <button
            className={styles.mapEmbedToggle}
            onClick={() => setShowEmbed(!showEmbed)}
            title={showEmbed ? "Collapse chart" : "Expand chart"}
          >
            {showEmbed ? "▼" : "▶"}
          </button>
          <Link href={viewUrl} target="_blank" className={styles.mapEmbedLink}>
            Open ↗
          </Link>
        </div>
      </div>

      {showEmbed && (
        <div className={styles.timeSeriesChartContainer}>
          {loading ? (
            <div className={styles.timeSeriesLoading}>
              <Loader size="md" color="dark" />
              <span>Loading chart...</span>
            </div>
          ) : aggregated.length > 0 ? (
            <TimeSeriesChart
              data={aggregated}
              metadata={chartData?.metadata}
              height={320}
              defaultPeriod={displayPeriod}
              fullBleed={true}
              hidePeriodSelector={false}
              showExternalTitle={false}
            />
          ) : (
            <div className={styles.timeSeriesLoading}>
              No chart data available.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function ToolCall({ toolCall }: ToolCallProps) {
  const [showDetails, setShowDetails] = useState(false);
  const fallbackId = useId();

  const toolId = toolCall.tool_id || `tool-${fallbackId}`;
  const toolName = toolCall.tool_name || toolCall.toolName || "Tool Call";
  const success = toolCall.success !== false;

  const args =
    toolCall.arguments ||
    toolCall.args ||
    toolCall.input ||
    toolCall.parameters;
  const response =
    toolCall.response || toolCall.result || toolCall.output;

  const formatJSON = (data: any): string => {
    if (data === null || data === undefined) return "";
    if (typeof data === "string") return data;
    try {
      return JSON.stringify(data, null, 2);
    } catch {
      return String(data);
    }
  };

  // Check if this is a successful map generation
  const showMapPreview = success && isMapResult(toolName, response);
  // Check if this is a successful anomaly display
  const showAnomalyPreview = success && isAnomalyResult(toolName, response);
  // Check if this is a successful time series display
  const showTimeSeriesPreview = success && isTimeSeriesResult(toolName, response);

  return (
    <div
      id={toolId}
      className={`${styles.toolCall} ${success ? styles.completed : styles.error}` }
      data-tool-name={toolName}
    >
      <div
        className={styles.toolCallContent}
        onClick={() => setShowDetails(!showDetails)}
        style={{ cursor: "pointer" }}
      >
        <div className={styles.toolCallName}>
          {showMapPreview ? "🗺️" : showAnomalyPreview ? "📊" : showTimeSeriesPreview ? "📈" : "🔧"} {toolName}
        </div>
      </div>
      
      {/* Show embedded map for generate_map tool */}
      {showMapPreview && (
        <EmbeddedMapCard data={response} />
      )}
      
      {/* Show embedded anomaly chart for show_anomaly tool */}
      {showAnomalyPreview && (
        <EmbeddedAnomalyCard data={response} />
      )}
      
      {/* Show embedded time series chart for show_time_series tool */}
      {showTimeSeriesPreview && (
        <EmbeddedTimeSeriesCard data={response} />
      )}
      
      {showDetails && (
        <div className={styles.toolCallDetails}>
          <h4>Tool Call Details</h4>
          <div>
            <strong>Function:</strong> {toolName}
          </div>
          <div>
            <strong>Status:</strong> {success ? "Success" : "Failed"}
          </div>
          {args !== null && args !== undefined && args !== "" && (
            <div style={{ marginTop: "8px" }}>
              <strong>Arguments:</strong>
              <pre
                style={{
                  background: "var(--bg-secondary)",
                  padding: "8px",
                  borderRadius: "4px",
                  fontSize: "12px",
                  marginTop: "4px",
                  whiteSpace: "pre-wrap",
                  wordWrap: "break-word",
                  maxHeight: "400px",
                  overflow: "auto",
                }}
              >
                {formatJSON(args)}
              </pre>
            </div>
          )}
          {response && (
            <div style={{ marginTop: "8px" }}>
              <strong>Response:</strong>
              <pre
                style={{
                  background: "var(--bg-secondary)",
                  padding: "8px",
                  borderRadius: "4px",
                  fontSize: "12px",
                  marginTop: "4px",
                  whiteSpace: "pre-wrap",
                  wordWrap: "break-word",
                  maxHeight: "400px",
                  overflow: "auto",
                }}
              >
                {formatJSON(response)}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}


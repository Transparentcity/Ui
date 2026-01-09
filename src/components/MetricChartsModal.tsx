"use client";

import { useState, useMemo } from "react";
import {
  useMetricTimeSeries,
  useMetricTimeSeriesDetail,
} from "@/lib/hooks/useMetrics";
import TimeSeriesChart from "./TimeSeriesChart";
import styles from "./MetricsAdmin.module.css";
import filterStyles from "./AnomaliesTabPanel.module.css";

interface MetricChartsModalProps {
  metricId: number | null;
  isOpen: boolean;
  onClose: () => void;
}

function formatDateTime(value?: string | null): string {
  if (!value) return "Never";
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return value;
  return dt.toLocaleString();
}

// Period type options
const PERIOD_TYPES = [
  { value: "all", label: "All Periods" },
  { value: "day", label: "Daily" },
  { value: "week", label: "Weekly" },
  { value: "month", label: "Monthly" },
  { value: "year", label: "Yearly" },
  { value: "ytd", label: "Year-to-Date" },
] as const;

export default function MetricChartsModal({
  metricId,
  isOpen,
  onClose,
}: MetricChartsModalProps) {
  const [chartDetailId, setChartDetailId] = useState<number | null>(null);
  const [isDataTableExpanded, setIsDataTableExpanded] = useState(false);
  const [periodTypeFilter, setPeriodTypeFilter] = useState<string>("all");
  const [districtFilter, setDistrictFilter] = useState<number | null>(null);
  
  const chartsQuery = useMetricTimeSeries(metricId);
  const chartDetailQuery = useMetricTimeSeriesDetail(metricId, chartDetailId);
  
  const chartsData = chartsQuery.data ?? null;
  const chartDetail = chartDetailQuery.data ?? null;

  // Extract unique period types and districts from time series data
  const { uniquePeriodTypes, uniqueDistricts } = useMemo(() => {
    if (!chartsData) {
      return { uniquePeriodTypes: [], uniqueDistricts: [] };
    }

    const periodTypes = new Set<string>();
    const districts = new Set<number | null>();

    chartsData.time_series.forEach((ts) => {
      if (ts.period_type) {
        periodTypes.add(ts.period_type.toLowerCase());
      }
      if (ts.district !== undefined && ts.district !== null) {
        districts.add(ts.district);
      } else {
        districts.add(null); // For citywide/null districts
      }
    });

    return {
      uniquePeriodTypes: Array.from(periodTypes).sort(),
      uniqueDistricts: Array.from(districts)
        .filter((d) => d !== null)
        .sort((a, b) => (a ?? 0) - (b ?? 0)) as number[],
    };
  }, [chartsData]);

  // Filter time series based on selected filters
  const filteredTimeSeries = useMemo(() => {
    if (!chartsData) return [];

    return chartsData.time_series.filter((ts) => {
      // Period type filter
      if (periodTypeFilter !== "all") {
        const tsPeriodType = ts.period_type?.toLowerCase();
        if (tsPeriodType !== periodTypeFilter.toLowerCase()) {
          return false;
        }
      }

      // District filter
      if (districtFilter !== null) {
        if (districtFilter === 0) {
          // Citywide only - match 0, null, or undefined
          if (ts.district !== 0 && ts.district !== null && ts.district !== undefined) {
            return false;
          }
        } else {
          // Specific district - must match exactly
          if (ts.district !== districtFilter) {
            return false;
          }
        }
      }

      return true;
    });
  }, [chartsData, periodTypeFilter, districtFilter]);

  // Get period_type from the list item when opening a chart
  // Normalize to match TimeSeriesChart's PeriodType
  const getPeriodTypeForChart = (chartId: number): "day" | "week" | "month" | "year" | "ytd" => {
    if (!chartsData) return "month";
    const chartItem = chartsData.time_series.find((ts) => ts.chart_id === chartId);
    const periodType = chartItem?.period_type?.toLowerCase() || "month";
    
    // Normalize period type to valid values
    if (periodType === "day" || periodType === "daily") return "day";
    if (periodType === "week" || periodType === "weekly") return "week";
    if (periodType === "month" || periodType === "monthly") return "month";
    if (periodType === "year" || periodType === "yearly") return "year";
    if (periodType === "ytd" || periodType === "year-to-date") return "ytd";
    
    // Default fallback
    return "month";
  };

  const openChartDetail = (chartId: number) => {
    setChartDetailId(chartId);
  };

  const closeChartDetail = () => {
    setChartDetailId(null);
    setIsDataTableExpanded(false);
  };

  if (!isOpen || !metricId || !chartsData) return null;

  return (
    <div className={styles.modalOverlay} onMouseDown={onClose}>
      <div className={styles.modal} onMouseDown={(e) => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <div className={styles.modalTitle}>
            Time Series — {chartsData.metric_name} ({chartsData.count})
          </div>
          <button className={styles.iconBtn} onClick={onClose} title="Close">
            <i className="fas fa-times" />
          </button>
        </div>
        <div className={styles.modalBody}>
          {chartDetail ? (
            <>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                <button className={styles.secondaryBtn} onClick={closeChartDetail}>
                  <i className="fas fa-arrow-left" /> Back to list
                </button>
                <div className={styles.muted} style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                  <span>
                    <strong>Points:</strong> {chartDetail.count}
                  </span>
                  <span>
                    <strong>Chart ID:</strong> {chartDetail.metadata?.chart_id ?? "—"}
                  </span>
                </div>
              </div>

              <div style={{ marginTop: 14 }}>
                <TimeSeriesChart
                  data={chartDetail.data}
                  metadata={chartDetail.metadata}
                  height={400}
                  defaultPeriod={chartDetailId ? getPeriodTypeForChart(chartDetailId) : "month"}
                />
              </div>

              <div className={styles.collapsibleSection}>
                <button
                  className={styles.collapsibleHeader}
                  onClick={() => setIsDataTableExpanded(!isDataTableExpanded)}
                  aria-expanded={isDataTableExpanded}
                >
                  <i className={`fas fa-chevron-${isDataTableExpanded ? 'down' : 'right'}`} />
                  <span>Data Table ({chartDetail.data.length} rows)</span>
                </button>
                {isDataTableExpanded && (
                  <table className={styles.miniTable}>
                    <thead>
                      <tr>
                        <th className={styles.miniTh}>Time Period</th>
                        <th className={styles.miniTh}>Value</th>
                        <th className={styles.miniTh}>Group</th>
                      </tr>
                    </thead>
                    <tbody>
                      {chartDetail.data.map((d, idx) => (
                        <tr key={idx}>
                          <td className={styles.miniTd}>{d.time_period}</td>
                          <td className={styles.miniTd}>
                            {typeof d.numeric_value === "number"
                              ? d.numeric_value.toLocaleString()
                              : String(d.numeric_value)}
                          </td>
                          <td className={styles.miniTd}>{d.group_value ?? "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </>
          ) : chartsData.count === 0 ? (
            <div className={styles.muted} style={{ padding: 16 }}>
              No time series data found for this metric. Execute the metric to generate time series.
            </div>
          ) : (
            <>
              {/* Filter Row */}
              <div className={filterStyles.filterRow} style={{ marginBottom: 16 }}>
                {/* Period Type Filter */}
                <label className={filterStyles.filterLabel}>Period:</label>
                <select
                  className={filterStyles.filterSelect}
                  value={periodTypeFilter}
                  onChange={(e) => setPeriodTypeFilter(e.target.value)}
                >
                  {PERIOD_TYPES.map((pt) => (
                    <option key={pt.value} value={pt.value}>
                      {pt.label}
                    </option>
                  ))}
                  {/* Also show unique period types from data */}
                  {uniquePeriodTypes
                    .filter((pt) => !PERIOD_TYPES.some((p) => p.value === pt))
                    .map((pt) => (
                      <option key={pt} value={pt}>
                        {pt.charAt(0).toUpperCase() + pt.slice(1)}
                      </option>
                    ))}
                </select>

                {/* District Filter */}
                <label className={filterStyles.filterLabel}>Area:</label>
                <select
                  className={filterStyles.filterSelect}
                  value={districtFilter ?? "all"}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val === "all") {
                      setDistrictFilter(null);
                    } else if (val === "citywide") {
                      setDistrictFilter(0);
                    } else {
                      setDistrictFilter(parseInt(val, 10));
                    }
                  }}
                >
                  <option value="all">All Areas</option>
                  <option value="citywide">Citywide Only</option>
                  {uniqueDistricts.length > 0 && (
                    <optgroup label="Individual Districts">
                      {uniqueDistricts.map((d) => (
                        <option key={d} value={d}>
                          District {d}
                        </option>
                      ))}
                    </optgroup>
                  )}
                </select>
              </div>

              {/* Results count */}
              {filteredTimeSeries.length !== chartsData.time_series.length && (
                <div className={styles.muted} style={{ marginBottom: 12, fontSize: "13px" }}>
                  Showing {filteredTimeSeries.length} of {chartsData.time_series.length} time series
                </div>
              )}

              <table className={styles.miniTable}>
                <thead>
                  <tr>
                    <th className={styles.miniTh}>Chart</th>
                    <th className={styles.miniTh}>Period</th>
                    <th className={styles.miniTh}>District</th>
                    <th className={styles.miniTh}>Points</th>
                    <th className={styles.miniTh}>Created</th>
                    <th className={styles.miniTh}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredTimeSeries.length === 0 ? (
                    <tr>
                      <td colSpan={6} className={styles.miniTd} style={{ textAlign: "center", padding: 16 }}>
                        <div className={styles.muted}>
                          No time series match the selected filters.
                        </div>
                      </td>
                    </tr>
                  ) : (
                    filteredTimeSeries.map((ts) => (
                      <tr key={ts.chart_id}>
                        <td className={styles.miniTd}>{ts.chart_title || `Chart ${ts.chart_id}`}</td>
                        <td className={styles.miniTd}>{ts.period_type}</td>
                        <td className={styles.miniTd}>
                          {ts.district === 0 || ts.district === null || ts.district === undefined
                            ? "Citywide"
                            : `District ${ts.district}`}
                        </td>
                        <td className={styles.miniTd}>{ts.data_point_count ?? 0}</td>
                        <td className={styles.miniTd}>{formatDateTime(ts.created_at)}</td>
                        <td className={styles.miniTd}>
                          <button
                            className={styles.primaryBtn}
                            onClick={() => openChartDetail(ts.chart_id)}
                          >
                            <i className="fas fa-chart-line" /> View
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </>
          )}
        </div>
        <div className={styles.modalFooter}>
          <button className={styles.secondaryBtn} onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}


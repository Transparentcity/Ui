"use client";

import { useState, useMemo, useEffect } from "react";
import { createPortal } from "react-dom";
import { useCityAnomalies, type AnomalyResult } from "@/lib/hooks/useAnomalies";
import { useCityLeaders } from "@/lib/hooks/useCities";
import { useCityMetricsForMap } from "@/lib/hooks/useMetrics";
import AnomalySparkline from "./AnomalySparkline";
import styles from "./AnomaliesBottomSheet.module.css";

interface AnomaliesBottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  cityId: number;
  district?: number | null; // Synced with map's selected district
  selectedAnomaly?: AnomalyResult | null;
  onAnomalySelect?: (anomaly: AnomalyResult | null) => void;
  mapOnly?: boolean; // When true, only show anomalies for metrics with map_query enabled
}

// Helper to group anomalies by metric
interface AnomalyGroup {
  metricId: number;
  metricName: string;
  itemNoun: string;
  anomalies: AnomalyResult[];
}

function groupAnomaliesByMetric(anomalies: AnomalyResult[]): AnomalyGroup[] {
  const groupMap = new Map<number, AnomalyGroup>();

  anomalies.forEach((anomaly) => {
    const metricId = anomaly.metric_id;
    if (!groupMap.has(metricId)) {
      groupMap.set(metricId, {
        metricId,
        metricName: anomaly.metric_name || anomaly.object_name || `Metric ${metricId}`,
        itemNoun: anomaly.item_noun || "items",
        anomalies: [],
      });
    }
    groupMap.get(metricId)!.anomalies.push(anomaly);
  });

  return Array.from(groupMap.values());
}

// Period type options
const PERIOD_TYPES = [
  { value: "week", label: "Weekly" },
  { value: "day", label: "Daily" },
  { value: "month", label: "Monthly" },
] as const;

// Helper to format period date range title for anomaly lists
function formatPeriodTitle(periodType: string, dateStr: string | null | undefined): string {
  if (!dateStr) return "";
  
  try {
    if (periodType === "month") {
      // Handle month format: "2025-12" or "2025-12-01"
      let year: string, month: string;
      if (/^\d{4}-\d{2}$/.test(dateStr)) {
        [year, month] = dateStr.split("-");
      } else if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
        [year, month] = dateStr.split("-");
      } else {
        const date = new Date(dateStr);
        if (isNaN(date.getTime())) return "";
        year = date.getFullYear().toString();
        month = (date.getMonth() + 1).toString().padStart(2, "0");
      }
      const monthNames = ["January", "February", "March", "April", "May", "June", 
                          "July", "August", "September", "October", "November", "December"];
      const monthNum = parseInt(month);
      if (isNaN(monthNum) || monthNum < 1 || monthNum > 12) return "";
      return `${monthNames[monthNum - 1]} ${year}`;
    } else if (periodType === "week") {
      // Handle ISO week format: "2025-W02" or date string
      if (dateStr.includes("-W")) {
        const [year, weekPart] = dateStr.split("-W");
        const weekNum = parseInt(weekPart);
        if (isNaN(weekNum)) return "";
        
        // Calculate week range (Monday to Sunday)
        const jan4 = new Date(parseInt(year), 0, 4); // Jan 4 is always in week 1
        const jan4Day = jan4.getDay() || 7; // Convert Sunday (0) to 7
        const daysToMonday = (8 - jan4Day) % 7;
        const week1Monday = new Date(parseInt(year), 0, 4 + daysToMonday);
        const weekStart = new Date(week1Monday);
        weekStart.setDate(weekStart.getDate() + (weekNum - 1) * 7);
        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekEnd.getDate() + 6);
        
        const startMonth = weekStart.toLocaleDateString("en-US", { month: "short" });
        const startDay = weekStart.getDate();
        const endMonth = weekEnd.toLocaleDateString("en-US", { month: "short" });
        const endDay = weekEnd.getDate();
        const yearStr = weekStart.getFullYear();
        
        if (startMonth === endMonth) {
          return `Week of ${startMonth} ${startDay}-${endDay}, ${yearStr}`;
        } else {
          return `Week of ${startMonth} ${startDay} - ${endMonth} ${endDay}, ${yearStr}`;
        }
      } else {
        // Try to parse as date and calculate week
        const date = new Date(dateStr);
        if (isNaN(date.getTime())) return "";
        
        // Get Monday of the week
        const day = date.getDay();
        const diff = date.getDate() - day + (day === 0 ? -6 : 1); // Adjust when day is Sunday
        const monday = new Date(date.setDate(diff));
        const sunday = new Date(monday);
        sunday.setDate(sunday.getDate() + 6);
        
        const startMonth = monday.toLocaleDateString("en-US", { month: "short" });
        const startDay = monday.getDate();
        const endMonth = sunday.toLocaleDateString("en-US", { month: "short" });
        const endDay = sunday.getDate();
        const yearStr = monday.getFullYear();
        
        if (startMonth === endMonth) {
          return `Week of ${startMonth} ${startDay}-${endDay}, ${yearStr}`;
        } else {
          return `Week of ${startMonth} ${startDay} - ${endMonth} ${endDay}, ${yearStr}`;
        }
      }
    } else if (periodType === "day") {
      const date = new Date(dateStr);
      if (isNaN(date.getTime())) return "";
      return date.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
    } else if (periodType === "year") {
      if (/^\d{4}$/.test(dateStr)) {
        return dateStr;
      }
      const date = new Date(dateStr);
      if (isNaN(date.getTime())) return "";
      return date.getFullYear().toString();
    }
    return "";
  } catch {
    return "";
  }
}

// Helper to get period date from anomaly (checks period_date first, then chart_payload)
function getAnomalyPeriodDate(anomaly: AnomalyResult): string | null {
  // First try period_date field
  if ((anomaly as any).period_date) {
    return (anomaly as any).period_date;
  }
  
  // Then try chart_payload dates
  if (anomaly.chart_payload?.dates && Array.isArray(anomaly.chart_payload.dates)) {
    const dates = anomaly.chart_payload.dates;
    const periods = anomaly.chart_payload.periods;
    
    // Find the most recent "recent" period date
    if (Array.isArray(periods)) {
      for (let i = dates.length - 1; i >= 0; i--) {
        if (periods[i] === "recent" && dates[i]) {
          return dates[i];
        }
      }
    }
    
    // Fallback to last date
    if (dates.length > 0) {
      return dates[dates.length - 1];
    }
  }
  
  return null;
}

// Helper to format a date string for display
function formatDateForDisplay(dateStr: string): string {
  try {
    // Handle ISO week format: "2025-W02"
    if (dateStr.includes("-W")) {
      const [year, weekPart] = dateStr.split("-W");
      return `Week ${parseInt(weekPart)} of ${year}`;
    }
    // Handle month format: "2025-01"
    if (/^\d{4}-\d{2}$/.test(dateStr)) {
      const [year, month] = dateStr.split("-");
      const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
      return `${monthNames[parseInt(month) - 1]} ${year}`;
    }
    // Handle full date format: "2025-01-08"
    const date = new Date(dateStr);
    if (!isNaN(date.getTime())) {
      return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    }
    return dateStr;
  } catch {
    return dateStr;
  }
}

// Helper to extract date ranges from chart_payload
function getDateRangeInfo(chartPayload: Record<string, any> | null | undefined) {
  if (!chartPayload?.dates || !chartPayload?.periods) {
    return null;
  }

  const dates = chartPayload.dates as string[];
  const periods = chartPayload.periods as string[];
  
  const recentDates: string[] = [];
  const comparisonDates: string[] = [];
  
  dates.forEach((date, idx) => {
    const period = periods[idx];
    if (period === "recent") {
      recentDates.push(date);
    } else if (period === "comparison") {
      comparisonDates.push(date);
    }
  });

  const recentDate = recentDates.length > 0 
    ? formatDateForDisplay(recentDates[recentDates.length - 1])
    : null;

  let comparisonRange: string | null = null;
  if (comparisonDates.length > 0) {
    const firstComp = formatDateForDisplay(comparisonDates[0]);
    const lastComp = formatDateForDisplay(comparisonDates[comparisonDates.length - 1]);
    if (firstComp === lastComp) {
      comparisonRange = firstComp;
    } else {
      comparisonRange = `${firstComp} – ${lastComp}`;
    }
  }

  return { recentDate, comparisonRange };
}

// Helper to format anomaly display info
function getAnomalyDisplayInfo(anomaly: AnomalyResult, itemNoun?: string) {
  const recentMean = anomaly.recent_mean ?? 0;
  const comparisonMean = anomaly.comparison_mean ?? 0;
  const diff = recentMean - comparisonMean;
  const absDiff = Math.abs(diff);
  const isUp = diff > 0;
  const moreOrFewer = isUp ? "more" : "fewer";
  
  // Calculate percent difference
  const pctDiff = comparisonMean !== 0 
    ? Math.round((diff / comparisonMean) * 100) 
    : 0;

  const noun = itemNoun || anomaly.item_noun || "items";
  const displayNoun =
    Math.round(absDiff) === 1
      ? noun
      : noun.endsWith("s")
      ? noun
      : `${noun}s`;

  let locationDisplay = anomaly.group_value || "";
  if (!locationDisplay) {
    if (anomaly.district === 0) {
      locationDisplay = "Citywide";
    } else {
      locationDisplay = `District ${anomaly.district}`;
    }
  }

  const metricName = anomaly.metric_name || anomaly.object_name || "Metric";
  const dateInfo = getDateRangeInfo(anomaly.chart_payload);

  return {
    recentMean,
    comparisonMean,
    diff,
    absDiff,
    isUp,
    moreOrFewer,
    pctDiff,
    displayNoun,
    locationDisplay,
    metricName,
    recentDate: dateInfo?.recentDate,
    comparisonRange: dateInfo?.comparisonRange,
  };
}

export default function AnomaliesBottomSheet({
  isOpen,
  onClose,
  cityId,
  district,
  selectedAnomaly,
  onAnomalySelect,
  mapOnly = false,
}: AnomaliesBottomSheetProps) {
  const [expandedMetricIds, setExpandedMetricIds] = useState<Set<number>>(
    new Set()
  );
  const [isExpanded, setIsExpanded] = useState(true); // Expanded = show list, collapsed = show single anomaly
  const [periodType, setPeriodType] = useState<string>("week");
  // -1 = all districts, 0 = citywide only, >0 = specific district
  const [districtFilter, setDistrictFilter] = useState<number | null>(
    district ?? 0
  );

  // Fetch city leaders to get district options
  const { data: leaders = [] } = useCityLeaders(cityId);

  // Fetch metrics with map_query enabled (only when mapOnly is true)
  const { data: mapMetrics = [], isLoading: isLoadingMapMetrics } = useCityMetricsForMap(
    mapOnly && isOpen ? cityId : null
  );

  // Create a set of metric IDs that have map_query enabled for fast lookup
  const mapMetricIds = useMemo(() => {
    return new Set(mapMetrics.map((m) => m.id));
  }, [mapMetrics]);

  // Extract unique districts from leaders (excluding null/undefined/0)
  const districtOptions = useMemo(() => {
    const districts = new Set<number>();
    leaders.forEach((leader) => {
      if (leader.district && leader.district > 0) {
        districts.add(leader.district);
      }
    });
    return Array.from(districts).sort((a, b) => a - b);
  }, [leaders]);

  // Update district filter when district prop changes
  useEffect(() => {
    if (district !== undefined && district !== null) {
      setDistrictFilter(district);
    }
  }, [district]);

  // Fetch anomalies for this city/district with period type
  const { data: anomaliesData, isLoading, error } = useCityAnomalies(
    isOpen ? cityId : null,
    {
      district: districtFilter === -1 ? undefined : districtFilter ?? undefined,
      period_type: periodType,
      is_anomaly: true,
      limit: 100,
    }
  );

  const rawAnomalies = anomaliesData?.results ?? [];

  // Filter anomalies to only show those with map_query enabled when mapOnly is true
  const anomalies = useMemo(() => {
    if (!mapOnly) {
      return rawAnomalies;
    }
    // When mapOnly is true, only show anomalies for metrics with map_query
    // If metrics are still loading or there are no map metrics, show empty list
    if (isLoadingMapMetrics) {
      return [];
    }
    return rawAnomalies.filter((anomaly) => mapMetricIds.has(anomaly.metric_id));
  }, [rawAnomalies, mapOnly, mapMetricIds, isLoadingMapMetrics]);

  // Group anomalies by metric
  const groupedAnomalies = useMemo(
    () => groupAnomaliesByMetric(anomalies),
    [anomalies]
  );

  // Get period title from first anomaly (all anomalies should have same period)
  const periodTitle = useMemo(() => {
    if (anomalies.length === 0) return null;
    const firstAnomaly = anomalies[0];
    const periodDate = getAnomalyPeriodDate(firstAnomaly);
    const anomalyPeriodType = (firstAnomaly as any).period_type || periodType;
    return formatPeriodTitle(anomalyPeriodType, periodDate);
  }, [anomalies, periodType]);

  // When an anomaly is selected, collapse the sheet
  useEffect(() => {
    if (selectedAnomaly) {
      setIsExpanded(false);
    }
  }, [selectedAnomaly]);

  // When sheet opens without a selection, expand it
  useEffect(() => {
    if (isOpen && !selectedAnomaly) {
      setIsExpanded(true);
    }
  }, [isOpen, selectedAnomaly]);

  const toggleMetricExpanded = (metricId: number) => {
    setExpandedMetricIds((prev) => {
      const next = new Set(prev);
      if (next.has(metricId)) {
        next.delete(metricId);
      } else {
        next.add(metricId);
      }
      return next;
    });
  };

  const handleAnomalyClick = (anomaly: AnomalyResult) => {
    if (onAnomalySelect) {
      onAnomalySelect(anomaly);
    }
    setIsExpanded(false);
  };

  const handleExpandClick = () => {
    setIsExpanded(true);
    if (onAnomalySelect) {
      onAnomalySelect(null);
    }
  };

  const handleClose = () => {
    if (onAnomalySelect) {
      onAnomalySelect(null);
    }
    onClose();
  };

  // Don't render on server or if not open
  if (!isOpen || typeof document === "undefined") return null;

  // Get district label for header
  const districtLabel = districtFilter === 0 || districtFilter === null || districtFilter === undefined
    ? "Citywide"
    : districtFilter === -1
    ? "All Areas"
    : `District ${districtFilter}`;

  // If collapsed and has selected anomaly, show collapsed view
  if (!isExpanded && selectedAnomaly) {
    const info = getAnomalyDisplayInfo(selectedAnomaly);
    const selectedPeriodDate = getAnomalyPeriodDate(selectedAnomaly);
    const selectedPeriodType = (selectedAnomaly as any).period_type || periodType;
    const selectedPeriodTitle = formatPeriodTitle(selectedPeriodType, selectedPeriodDate);

    return createPortal(
      <div className={styles.bottomSheet} data-collapsed="true">
        <button
          className={styles.collapsedCard}
          onClick={handleExpandClick}
          data-is-positive={info.isUp}
        >
          {/* Sparkline */}
          {selectedAnomaly.chart_payload && (
            <div className={styles.collapsedSparkline}>
              <AnomalySparkline
                chartData={{
                  dates: selectedAnomaly.chart_payload.dates || [],
                  values: selectedAnomaly.chart_payload.values || [],
                  periods: selectedAnomaly.chart_payload.periods || [],
                }}
                height={50}
                width={100}
                showAverage={false}
                showAnnotations={false}
              />
            </div>
          )}

          {/* Info */}
          <div className={styles.collapsedInfo}>
            <div className={styles.collapsedMetric}>{info.metricName}</div>
            {selectedPeriodTitle && (
              <div className={styles.collapsedPeriodTitle}>{selectedPeriodTitle}</div>
            )}
            <div className={styles.collapsedText}>
              <i className={`fas fa-arrow-${info.isUp ? "up" : "down"}`} />
              <strong>{Math.round(info.absDiff).toLocaleString()}</strong>{" "}
              {info.moreOrFewer} for {info.locationDisplay}
            </div>
            {info.recentDate && (
              <div className={styles.collapsedDate}>
                {info.recentDate}{info.comparisonRange && ` vs ${info.comparisonRange}`}
              </div>
            )}
          </div>

          {/* Expand button */}
          <div className={styles.collapsedActions}>
            <i className="fas fa-chevron-up" title="Show all anomalies" />
          </div>
        </button>

        {/* Close button */}
        <button className={styles.closeBtn} onClick={handleClose} title="Close">
          <i className="fas fa-times" />
        </button>
      </div>,
      document.body
    );
  }

  // Expanded view - show list
  return createPortal(
    <div className={styles.bottomSheet} data-collapsed="false">
      {/* Handle for drag (visual only) */}
      <div className={styles.dragHandle}>
        <div className={styles.dragBar} />
      </div>

      {/* Header */}
      <div className={styles.header}>
        <div className={styles.headerTitleGroup}>
          <div className={styles.headerTitle}>
            <i className="fas fa-bell" style={{ marginRight: "8px" }} />
            Anomalies — {districtLabel}
          </div>
          {periodTitle && (
            <div className={styles.headerSubtitle}>{periodTitle}</div>
          )}
        </div>
        <button className={styles.closeBtn} onClick={handleClose} title="Close">
          <i className="fas fa-times" />
        </button>
      </div>

      {/* Filters */}
      <div className={styles.filterRow}>
        {/* Period Type Filter */}
        <label className={styles.filterLabel}>Period:</label>
        <select
          className={styles.filterSelect}
          value={periodType}
          onChange={(e) => setPeriodType(e.target.value)}
        >
          {PERIOD_TYPES.map((pt) => (
            <option key={pt.value} value={pt.value}>
              {pt.label}
            </option>
          ))}
        </select>

        {/* District Filter */}
        <label className={styles.filterLabel}>Area:</label>
        <select
          className={styles.filterSelect}
          value={districtFilter ?? -1}
          onChange={(e) => {
            const val = parseInt(e.target.value, 10);
            setDistrictFilter(val === -1 ? null : val);
          }}
        >
          <option value={0}>Citywide Only</option>
          <option value={-1}>All Areas</option>
          {districtOptions.length > 0 && (
            <optgroup label="Districts">
              {districtOptions.map((d) => (
                <option key={d} value={d}>
                  D{d}
                </option>
              ))}
            </optgroup>
          )}
        </select>
      </div>

      {/* Content */}
      <div className={styles.content}>
        {/* Loading State */}
        {(isLoading || (mapOnly && isLoadingMapMetrics)) && (
          <div className={styles.stateContainer}>
            <i className="fas fa-spinner fa-spin" />
            <span>Loading anomalies...</span>
          </div>
        )}

        {/* Error State */}
        {error && !isLoading && !isLoadingMapMetrics && (
          <div className={styles.stateContainer} data-error="true">
            <i className="fas fa-exclamation-triangle" />
            <span>
              Failed to load anomalies:{" "}
              {error instanceof Error ? error.message : "Unknown error"}
            </span>
          </div>
        )}

        {/* Empty State */}
        {!isLoading && !(mapOnly && isLoadingMapMetrics) && !error && anomalies.length === 0 && (
          <div className={styles.stateContainer}>
            <i className="fas fa-check-circle" />
            <span>
              {mapOnly 
                ? "No map-enabled anomalies detected for " + districtLabel
                : "No anomalies detected for " + districtLabel}
            </span>
          </div>
        )}

        {/* Anomaly List */}
        {!isLoading && !(mapOnly && isLoadingMapMetrics) && !error && anomalies.length > 0 && (
          <div className={styles.anomaliesList}>
            {groupedAnomalies.map((group) => {
              const topAnomaly = group.anomalies[0];
              const remainingAnomalies = group.anomalies.slice(1);
              const isGroupExpanded = expandedMetricIds.has(group.metricId);
              const topInfo = getAnomalyDisplayInfo(topAnomaly, group.itemNoun);

              return (
                <div key={group.metricId} className={styles.metricGroup}>
                  {/* Metric Header */}
                  <div className={styles.metricHeader}>
                    <span className={styles.metricName}>{group.metricName}</span>
                    {remainingAnomalies.length > 0 && (
                      <button
                        className={styles.expandBtn}
                        onClick={() => toggleMetricExpanded(group.metricId)}
                      >
                        {isGroupExpanded
                          ? "Hide"
                          : `+${remainingAnomalies.length} more`}
                        <i
                          className={`fas fa-chevron-${
                            isGroupExpanded ? "up" : "down"
                          }`}
                          style={{ marginLeft: "4px" }}
                        />
                      </button>
                    )}
                  </div>

                  {/* Top Anomaly Card */}
                  <button
                    className={styles.anomalyCard}
                    onClick={() => handleAnomalyClick(topAnomaly)}
                    data-is-positive={topInfo.isUp}
                  >
                    {/* Sparkline Chart */}
                    {topAnomaly.chart_payload && (
                      <div className={styles.sparklineContainer}>
                        <AnomalySparkline
                          chartData={{
                            dates: topAnomaly.chart_payload.dates || [],
                            values: topAnomaly.chart_payload.values || [],
                            periods: topAnomaly.chart_payload.periods || [],
                          }}
                          height={60}
                          width={120}
                          showAverage={true}
                          showAnnotations={false}
                        />
                      </div>
                    )}

                    {/* Anomaly Info */}
                    <div className={styles.anomalyInfo}>
                      <div className={styles.anomalyText}>
                        <i
                          className={`fas fa-arrow-${topInfo.isUp ? "up" : "down"}`}
                          style={{ marginRight: "4px" }}
                        />
                        <strong>
                          {Math.round(topInfo.absDiff).toLocaleString()}
                        </strong>{" "}
                        {topInfo.moreOrFewer} {topInfo.displayNoun} for{" "}
                        <strong>{topInfo.locationDisplay}</strong>
                      </div>
                      {topInfo.recentDate && (
                        <div className={styles.dateRange}>
                          {topInfo.recentDate}{topInfo.comparisonRange && ` vs ${topInfo.comparisonRange}`}
                        </div>
                      )}
                      <div className={styles.anomalyStats}>
                        Avg: {Math.round(topInfo.comparisonMean).toLocaleString()} |
                        Recent: {Math.round(topInfo.recentMean).toLocaleString()}
                      </div>
                    </div>
                  </button>

                  {/* Expanded Sub-Anomalies */}
                  {isGroupExpanded && remainingAnomalies.length > 0 && (
                    <div className={styles.subAnomalies}>
                      {remainingAnomalies.map((anomaly, idx) => {
                        const info = getAnomalyDisplayInfo(anomaly, group.itemNoun);
                        return (
                          <button
                            key={anomaly.id ?? idx}
                            className={styles.subAnomalyCard}
                            onClick={() => handleAnomalyClick(anomaly)}
                            data-is-positive={info.isUp}
                          >
                            <div className={styles.subAnomalyContent}>
                              <div className={styles.subAnomalyMain}>
                                <i
                                  className={`fas fa-arrow-${info.isUp ? "up" : "down"}`}
                                  style={{ marginRight: "6px" }}
                                />
                                <span>
                                  <strong>{info.locationDisplay}</strong>
                                  {info.recentDate && (
                                    <span className={styles.subAnomalyDate}> ({info.recentDate})</span>
                                  )}
                                </span>
                              </div>
                              <div className={styles.subAnomalyStats}>
                                Avg: {Math.round(info.comparisonMean).toLocaleString()} | 
                                Recent: {Math.round(info.recentMean).toLocaleString()} | 
                                {info.isUp ? "+" : ""}{Math.round(info.diff).toLocaleString()} ({info.isUp ? "+" : ""}{info.pctDiff}%)
                              </div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}

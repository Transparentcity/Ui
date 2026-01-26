"use client";

import { useState, useMemo, useEffect } from "react";
import { useCityAnomalies, useAvailablePeriods, type AnomalyResult, type AvailablePeriod } from "@/lib/hooks/useAnomalies";
import { useCityLeaders } from "@/lib/hooks/useCities";
import AnomalySparkline from "./AnomalySparkline";
import AnomalyChartModal from "./AnomalyChartModal";
import Loader from "./Loader";
import { MetricLink } from "./MetricLink";
import { slugify } from "@/lib/utils";
import styles from "./AnomaliesTabPanel.module.css";

interface AnomaliesTabPanelProps {
  cityId: number;
  cityName?: string;
  initialDistrict?: number | null;
  onMetricClick?: (metricId: number, district?: number | null) => void; // Callback when metric is clicked (for modal)
}

// Period type options
const PERIOD_TYPES = [
  { value: "week", label: "Weekly" },
  { value: "day", label: "Daily" },
  { value: "month", label: "Monthly" },
] as const;

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
      return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
    }
    return dateStr;
  } catch {
    return dateStr;
  }
}

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

// Helper to format period option label for dropdown
function formatPeriodOptionLabel(period: AvailablePeriod, periodType: string): string {
  const dateLabel = formatPeriodTitle(periodType, period.period_date);
  const anomalyCount = period.anomaly_count || 0;
  
  if (anomalyCount > 0) {
    return `${dateLabel} (${anomalyCount} alert${anomalyCount !== 1 ? 's' : ''})`;
  }
  return `${dateLabel} (no alerts)`;
}

// Helper to extract date ranges from chart_payload
function getDateRangeInfo(chartPayload: Record<string, any> | null | undefined) {
  if (!chartPayload?.dates || !chartPayload?.periods) {
    return null;
  }

  const dates = chartPayload.dates as string[];
  const periods = chartPayload.periods as string[];
  
  // Find recent and comparison dates
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

  // Get the recent date (should be the most recent)
  const recentDate = recentDates.length > 0 
    ? formatDateForDisplay(recentDates[recentDates.length - 1])
    : null;

  // Get comparison range
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

  return {
    recentDate,
    comparisonRange,
    recentCount: recentDates.length,
    comparisonCount: comparisonDates.length,
  };
}

// Helper to format anomaly display info
function getAnomalyDisplayInfo(anomaly: AnomalyResult, itemNoun: string) {
  const recentMean = anomaly.recent_mean ?? 0;
  const comparisonMean = anomaly.comparison_mean ?? 0;
  const diff = recentMean - comparisonMean;
  const absDiff = Math.abs(diff);
  const isUp = diff > 0;
  const moreOrFewer = isUp ? "more" : "fewer";

  // Determine if the change is "bad" based on greendirection
  // greendirection="up" means increase is good (green), decrease is bad (red)
  // greendirection="down" means decrease is good (green), increase is bad (red)
  // Default to "down" (lower is better) if not specified - common for crime, incidents, etc.
  const greendirection = anomaly.greendirection || "down";
  const isBad = greendirection === "up" ? !isUp : isUp;

  const displayNoun =
    Math.round(absDiff) === 1
      ? itemNoun
      : itemNoun.endsWith("s")
      ? itemNoun
      : `${itemNoun}s`;

  let locationDisplay = anomaly.group_value || "";
  if (!locationDisplay) {
    if (anomaly.district === 0) {
      locationDisplay = "Citywide";
    } else {
      locationDisplay = `District ${anomaly.district}`;
    }
  }

  const groupFieldLabel = anomaly.group_field || "Location";
  
  // Get date range info
  const dateInfo = getDateRangeInfo(anomaly.chart_payload);

  return {
    recentMean,
    comparisonMean,
    diff,
    absDiff,
    isUp,
    isBad,  // true = red (bad change), false = green (good change)
    moreOrFewer,
    displayNoun,
    locationDisplay,
    groupFieldLabel,
    recentDate: dateInfo?.recentDate,
    comparisonRange: dateInfo?.comparisonRange,
  };
}

export default function AnomaliesTabPanel({
  cityId,
  cityName,
  initialDistrict,
  onMetricClick,
}: AnomaliesTabPanelProps) {
  // -1 = all districts, 0 = citywide only, >0 = specific district
  const [districtFilter, setDistrictFilter] = useState<number | null>(
    initialDistrict ?? 0
  );
  const [periodType, setPeriodType] = useState<string>("week");
  const [selectedPeriodDate, setSelectedPeriodDate] = useState<string | null>(null);
  const [expandedMetricIds, setExpandedMetricIds] = useState<Set<number>>(
    new Set()
  );
  const [selectedAnomalyId, setSelectedAnomalyId] = useState<number | null>(null);

  // Fetch city leaders to get district options
  const { data: leaders = [] } = useCityLeaders(cityId);

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

  // Fetch available periods for the dropdown
  const { data: periodsData, isLoading: isLoadingPeriods } = useAvailablePeriods(
    periodType,
    cityId,
    districtFilter === -1 ? undefined : districtFilter
  );

  const availablePeriods = periodsData?.periods ?? [];

  // Auto-select most recent period when periods load or change
  useEffect(() => {
    if (availablePeriods.length > 0 && !selectedPeriodDate) {
      // Default to most recent period (first in the list, sorted by date DESC)
      setSelectedPeriodDate(availablePeriods[0].period_date);
    }
  }, [availablePeriods, selectedPeriodDate]);

  // Reset selected period when period type changes
  useEffect(() => {
    setSelectedPeriodDate(null);
  }, [periodType]);

  // Fetch anomalies - now with period_date filter
  const { data: anomaliesData, isLoading, error } = useCityAnomalies(cityId, {
    district: districtFilter === -1 ? undefined : districtFilter ?? undefined,
    period_type: periodType,
    is_anomaly: null, // Show all results for the selected period (anomalies and non-anomalies)
    limit: 100,
    period_date: selectedPeriodDate,
  });

  const anomalies = anomaliesData?.results ?? [];

  // Filter to only show actual anomalies (is_anomaly=true)
  const actualAnomalies = useMemo(() => {
    return anomalies.filter((a) => a.is_anomaly === true);
  }, [anomalies]);

  // Group actual anomalies by metric (only those with is_anomaly=true)
  const groupedAnomalies = useMemo(
    () => groupAnomaliesByMetric(actualAnomalies),
    [actualAnomalies]
  );

  // Get period title from selected period
  const periodTitle = useMemo(() => {
    if (selectedPeriodDate) {
      return formatPeriodTitle(periodType, selectedPeriodDate);
    }
    // Fallback to inferring from first anomaly
    if (anomalies.length === 0) return null;
    const firstAnomaly = anomalies[0];
    const periodDate = getAnomalyPeriodDate(firstAnomaly);
    return formatPeriodTitle(periodType, periodDate);
  }, [selectedPeriodDate, periodType, anomalies]);

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
    if (anomaly.id) {
      setSelectedAnomalyId(anomaly.id);
    }
  };

  return (
    <div className={styles.container}>
      {/* Header */}
      <div className={styles.header}>
        <div className={styles.titleGroup}>
          <h2 className={styles.title}>
            <i className="fas fa-bell" style={{ marginRight: "8px" }} />
            Anomaly Alerts
          </h2>
          {periodTitle && (
            <div className={styles.subtitle}>{periodTitle}</div>
          )}
        </div>
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

          {/* Specific Period Selector */}
          {availablePeriods.length > 0 && (
            <>
              <label className={styles.filterLabel}>
                {periodType === "week" ? "Week:" : periodType === "month" ? "Month:" : "Date:"}
              </label>
              <select
                className={styles.filterSelect}
                value={selectedPeriodDate || ""}
                onChange={(e) => setSelectedPeriodDate(e.target.value || null)}
                disabled={isLoadingPeriods}
              >
                {availablePeriods.map((period) => (
                  <option key={period.period_date} value={period.period_date}>
                    {formatPeriodOptionLabel(period, periodType)}
                  </option>
                ))}
              </select>
            </>
          )}

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
      </div>

      {/* Content */}
      <div className={styles.content}>
        {/* Loading State */}
        {isLoading && (
          <div className={styles.loadingContainer}>
            <Loader size="md" color="purple" />
            <span>Loading anomalies...</span>
          </div>
        )}

        {/* Error State */}
        {error && !isLoading && (
          <div className={styles.errorContainer}>
            <i className="fas fa-exclamation-triangle" />
            <span>
              Failed to load anomalies:{" "}
              {error instanceof Error ? error.message : "Unknown error"}
            </span>
          </div>
        )}

        {/* Empty State */}
        {!isLoading && !error && actualAnomalies.length === 0 && (
          <div className={styles.emptyContainer}>
            <i className="fas fa-check-circle" />
            <span>
              {selectedPeriodDate 
                ? `No significant anomalies for ${periodTitle || "this period"}`
                : "No significant anomalies detected"}
            </span>
            <p className={styles.emptySubtext}>
              {anomalies.length > 0 
                ? `${anomalies.length} metric${anomalies.length !== 1 ? 's' : ''} analyzed for this period - all within normal range.`
                : "Anomalies are detected when data significantly deviates from historical patterns."}
            </p>
          </div>
        )}

        {/* Anomaly List */}
        {!isLoading && !error && actualAnomalies.length > 0 && (
          <>
            {/* Period Title Header */}
            {periodTitle && (
              <div className={styles.periodTitleHeader}>
                <h3 className={styles.periodTitle}>{periodTitle}</h3>
              </div>
            )}
            <div className={styles.anomaliesList}>
            {groupedAnomalies.map((group) => {
              const topAnomaly = group.anomalies[0];
              const remainingAnomalies = group.anomalies.slice(1);
              const isExpanded = expandedMetricIds.has(group.metricId);
              const topInfo = getAnomalyDisplayInfo(topAnomaly, group.itemNoun);

              return (
                <div key={group.metricId} className={styles.metricGroup}>
                  {/* Metric Header */}
                  <div className={styles.metricHeader}>
                    {cityName ? (
                      <MetricLink
                        metricId={group.metricId}
                        citySlug={slugify(cityName)}
                        mode="modal"
                        district={districtFilter}
                        onModalOpen={onMetricClick}
                        className="metric-link-inline"
                      >
                        {group.metricName} <span className="link-indicator">→</span>
                      </MetricLink>
                    ) : (
                      <span className={styles.metricName}>{group.metricName}</span>
                    )}
                    {remainingAnomalies.length > 0 && (
                      <button
                        className={styles.expandBtn}
                        onClick={() => toggleMetricExpanded(group.metricId)}
                      >
                        {isExpanded
                          ? "Hide"
                          : `+${remainingAnomalies.length} more`}
                        <i
                          className={`fas fa-chevron-${
                            isExpanded ? "up" : "down"
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
                    data-is-bad={topInfo.isBad}
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
                          height={80}
                          width={150}
                          showAverage={true}
                          showAnnotations={true}
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
                        {topInfo.moreOrFewer} {topInfo.displayNoun} than average
                        for{" "}
                        <strong>{topInfo.locationDisplay}</strong>
                      </div>
                      {/* Date Range Info */}
                      {topInfo.recentDate && (
                        <div className={styles.dateRange}>
                          <span className={styles.dateLabel}>Recent:</span> {topInfo.recentDate}
                          {topInfo.comparisonRange && (
                            <>
                              <span className={styles.dateSeparator}>•</span>
                              <span className={styles.dateLabel}>Compared to:</span> {topInfo.comparisonRange}
                            </>
                          )}
                        </div>
                      )}
                      <div className={styles.anomalyStats}>
                        Historic Avg:{" "}
                        {Math.round(topInfo.comparisonMean).toLocaleString()} |
                        Recent:{" "}
                        {Math.round(topInfo.recentMean).toLocaleString()}
                      </div>
                    </div>
                  </button>

                  {/* Expanded Sub-Anomalies */}
                  {isExpanded && remainingAnomalies.length > 0 && (
                    <div className={styles.subAnomalies}>
                      {remainingAnomalies.map((anomaly, idx) => {
                        const info = getAnomalyDisplayInfo(
                          anomaly,
                          group.itemNoun
                        );
                        return (
                          <button
                            key={anomaly.id ?? idx}
                            className={styles.subAnomalyCard}
                            onClick={() => handleAnomalyClick(anomaly)}
                            data-is-bad={info.isBad}
                          >
                            <div className={styles.subAnomalyMain}>
                              <i
                                className={`fas fa-arrow-${
                                  info.isUp ? "up" : "down"
                                }`}
                                style={{ marginRight: "6px" }}
                              />
                              <span>
                                <strong>
                                  {Math.round(info.absDiff).toLocaleString()}
                                </strong>{" "}
                                {info.moreOrFewer} {info.displayNoun} for{" "}
                                <strong>{info.locationDisplay}</strong>
                              </span>
                            </div>
                            {info.recentDate && (
                              <span className={styles.subAnomalyDate}>
                                {info.recentDate}
                                {info.comparisonRange && ` vs ${info.comparisonRange}`}
                              </span>
                            )}
                            <span className={styles.subAnomalyStats}>
                              Avg: {Math.round(info.comparisonMean).toLocaleString()}{" "}
                              | Recent: {Math.round(info.recentMean).toLocaleString()}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
            </div>
          </>
        )}
      </div>

      {/* Anomaly Chart Modal */}
      <AnomalyChartModal
        anomalyId={selectedAnomalyId}
        isOpen={selectedAnomalyId !== null}
        onClose={() => setSelectedAnomalyId(null)}
        citySlug={cityName ? slugify(cityName) : undefined}
      />
    </div>
  );
}

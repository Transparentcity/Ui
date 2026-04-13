"use client";

import { useMemo } from "react";
import { type AnomalyResult } from "@/lib/hooks/useAnomalies";
import AnomalySparkline from "./AnomalySparkline";
import { parseLocalDate } from "@/lib/dateRange";
import styles from "./AnomalyMapOverlay.module.css";

interface AnomalyMapOverlayProps {
  anomaly: AnomalyResult;
  onClose: () => void;
  onBackToList?: () => void;
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
        const date = parseLocalDate(dateStr);
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
        const date = parseLocalDate(dateStr);
        if (isNaN(date.getTime())) return "";
        
        const day = date.getDay();
        const diff = date.getDate() - day + (day === 0 ? -6 : 1);
        const monday = new Date(date);
        monday.setDate(diff);
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
      const date = parseLocalDate(dateStr);
      if (isNaN(date.getTime())) return "";
      return date.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
    } else if (periodType === "year") {
      if (/^\d{4}$/.test(dateStr)) {
        return dateStr;
      }
      const date = parseLocalDate(dateStr);
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

// Helper to format anomaly display info
function getAnomalyDisplayInfo(anomaly: AnomalyResult) {
  const recentMean = anomaly.recent_mean ?? 0;
  const comparisonMean = anomaly.comparison_mean ?? 0;
  const diff = recentMean - comparisonMean;
  const absDiff = Math.abs(diff);
  const isUp = diff > 0;
  const moreOrFewer = isUp ? "more" : "fewer";

  // Get item noun
  const itemNoun = anomaly.item_noun || "items";
  const displayNoun =
    Math.round(absDiff) === 1
      ? itemNoun
      : itemNoun.endsWith("s")
      ? itemNoun
      : `${itemNoun}s`;

  // Get location display
  let locationDisplay = anomaly.group_value || "";
  if (!locationDisplay) {
    if (anomaly.district === 0) {
      locationDisplay = "Citywide";
    } else {
      locationDisplay = `District ${anomaly.district}`;
    }
  }

  // Get metric name
  const metricName = anomaly.metric_name || anomaly.object_name || "Metric";

  return {
    recentMean,
    comparisonMean,
    diff,
    absDiff,
    isUp,
    moreOrFewer,
    displayNoun,
    locationDisplay,
    metricName,
  };
}

export default function AnomalyMapOverlay({
  anomaly,
  onClose,
  onBackToList,
}: AnomalyMapOverlayProps) {
  const info = getAnomalyDisplayInfo(anomaly);

  // Get period title from anomaly
  const periodTitle = useMemo(() => {
    const periodDate = getAnomalyPeriodDate(anomaly);
    const anomalyPeriodType = (anomaly as any).period_type || "month";
    return formatPeriodTitle(anomalyPeriodType, periodDate);
  }, [anomaly]);

  return (
    <div className={styles.overlay} data-is-positive={info.isUp}>
      {/* Header with back/close buttons */}
      <div className={styles.header}>
        {onBackToList && (
          <button className={styles.backBtn} onClick={onBackToList}>
            <i className="fas fa-arrow-left" />
            <span>Back to list</span>
          </button>
        )}
        <div className={styles.headerTitle}>
          {periodTitle || info.metricName}
        </div>
        <button className={styles.closeBtn} onClick={onClose} title="Close" aria-label="Close">
          <i className="fas fa-times" />
        </button>
      </div>

      {/* Content */}
      <div className={styles.content}>
        {/* Sparkline Chart */}
        {anomaly.chart_payload && (
          <div className={styles.chartContainer}>
            <AnomalySparkline
              chartData={{
                dates: anomaly.chart_payload.dates || [],
                values: anomaly.chart_payload.values || [],
                periods: anomaly.chart_payload.periods || [],
              }}
              periodType={anomaly.period_type}
              height={100}
              width={180}
              showAverage={true}
              showAnnotations={true}
            />
          </div>
        )}

        {/* Text Info */}
        <div className={styles.infoContainer}>
          <div className={styles.mainText}>
            <i
              className={`fas fa-arrow-${info.isUp ? "up" : "down"}`}
              style={{ marginRight: "6px" }}
            />
            <strong>{Math.round(info.absDiff).toLocaleString()}</strong>{" "}
            {info.moreOrFewer} {info.displayNoun} than average for{" "}
            <strong>{info.locationDisplay}</strong>
          </div>
          <div className={styles.statsText}>
            Historic Avg: {Math.round(info.comparisonMean).toLocaleString()} |
            Recent: {Math.round(info.recentMean).toLocaleString()}
          </div>
        </div>
      </div>
    </div>
  );
}

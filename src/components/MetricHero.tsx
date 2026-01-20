"use client";

import { useMemo } from "react";
import type { PublicMetricDetail, PublicMetricComparison } from "@/lib/publicApiClient";
import "./MetricHero.css";

interface MetricHeroProps {
  metric: PublicMetricDetail;
  comparison: PublicMetricComparison | undefined;
  selectedPeriod: "ytd" | "mtd" | "mtd_prior_year";
  onPeriodChange: (period: "ytd" | "mtd" | "mtd_prior_year") => void;
}

const PERIOD_LABELS: Record<"ytd" | "mtd" | "mtd_prior_year", string> = {
  ytd: "Year-to-Date",
  mtd: "Month-to-Date",
  mtd_prior_year: "Month vs Last Year",
};

const PERIOD_DESCRIPTIONS: Record<"ytd" | "mtd" | "mtd_prior_year", string> = {
  ytd: "vs same period last year",
  mtd: "vs same period last month",
  mtd_prior_year: "vs same month last year",
};

export default function MetricHero({
  metric,
  comparison,
  selectedPeriod,
  onPeriodChange,
}: MetricHeroProps) {
  const trendInfo = useMemo(() => {
    if (!comparison || comparison.current_period_value === null || comparison.comparison_period_value === null) {
      return null;
    }

    const current = comparison.current_period_value;
    const previous = comparison.comparison_period_value;
    const diff = current - previous;
    const percentChange = previous !== 0 ? (diff / previous) * 100 : 0;

    // Determine if change is "good" based on greendirection
    const isIncrease = diff > 0;
    
    // Don't color if percent change is between -5% and 5%
    const isSmallChange = Math.abs(percentChange) <= 5;
    const isGood = isSmallChange
      ? null // neutral for small changes
      : metric.greendirection === "up"
        ? isIncrease
        : metric.greendirection === "down"
          ? !isIncrease
          : null; // neutral

    return {
      diff,
      percentChange,
      isIncrease,
      isGood,
      current,
      previous,
    };
  }, [comparison, metric.greendirection]);

  const formatValue = (value: number | null): string => {
    if (value === null) return "No data";
    return value.toLocaleString(undefined, {
      maximumFractionDigits: 0,
    });
  };

  const formatDateRange = (start: string | null, end: string | null): string => {
    if (!start || !end) return "";
    const startDate = new Date(start);
    const endDate = new Date(end);
    const startStr = startDate.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });
    const endStr = endDate.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
    return `${startStr} - ${endStr}`;
  };

  return (
    <div className="metric-hero">
      <div className="metric-hero-header">
        <div className="metric-hero-title-row">
          {trendInfo && (
            <div
              className={`metric-trend-badge ${
                trendInfo.isGood === true
                  ? "trend-good"
                  : trendInfo.isGood === false
                    ? "trend-bad"
                    : "trend-neutral"
              }`}
            >
              <span className="trend-arrow">
                {trendInfo.isIncrease ? "↑" : "↓"}
              </span>
              <span className="trend-percent">
                {Math.abs(trendInfo.percentChange).toFixed(1)}%
              </span>
            </div>
          )}
          <h1 className="metric-hero-title">{metric.metric_name}</h1>
        </div>
        <p className="metric-hero-subtitle">
          {PERIOD_DESCRIPTIONS[selectedPeriod]}
        </p>
      </div>

      {comparison && (
        <div className="metric-hero-values">
          <div className="metric-value-group">
            <div className="metric-value-label">
              {formatDateRange(
                comparison.current_period_start,
                comparison.current_period_end
              )}
            </div>
            <div className="metric-value-number">
              {formatValue(comparison.current_period_value)}
            </div>
            <div className="metric-value-unit">{metric.item_noun}</div>
          </div>
          <div className="metric-value-separator">vs</div>
          <div className="metric-value-group">
            <div className="metric-value-label">
              {formatDateRange(
                comparison.comparison_period_start,
                comparison.comparison_period_end
              )}
            </div>
            <div className="metric-value-number">
              {formatValue(comparison.comparison_period_value)}
            </div>
            <div className="metric-value-unit">{metric.item_noun}</div>
          </div>
        </div>
      )}

      <div className="metric-hero-period-selector">
        {(Object.keys(PERIOD_LABELS) as Array<keyof typeof PERIOD_LABELS>).map(
          (period) => (
            <button
              key={period}
              className={`period-button ${
                selectedPeriod === period ? "active" : ""
              }`}
              onClick={() => onPeriodChange(period)}
            >
              {PERIOD_LABELS[period]}
            </button>
          )
        )}
      </div>
    </div>
  );
}

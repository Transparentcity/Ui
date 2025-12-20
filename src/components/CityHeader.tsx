"use client";

import MetricDateRangeSelector from "@/components/MetricDateRangeSelector";
import type { MetricDateRange } from "@/lib/dateRange";

interface CityHeaderProps {
  emoji?: string;
  name: string;
  isCitySaved: boolean;
  saving: boolean;
  onToggleSave: () => void;
  metricDateRange?: MetricDateRange;
  onMetricDateRangeChange?: (next: MetricDateRange) => void;
  variant?: "overlay" | "standard";
  visible?: boolean;
}

export default function CityHeader({
  emoji,
  name,
  isCitySaved,
  saving,
  onToggleSave,
  metricDateRange,
  onMetricDateRangeChange,
  variant = "standard",
  visible = true,
}: CityHeaderProps) {
  const className = variant === "overlay" 
    ? `city-header-overlay ${visible ? "visible" : "hidden"}`
    : "city-header";

  return (
    <div className={className}>
      <div className="city-header-left">
        {emoji && <span className="city-emoji-icon">{emoji}</span>}
        <h1 className="city-name">{name}</h1>
        {metricDateRange && onMetricDateRangeChange ? (
          <MetricDateRangeSelector
            value={metricDateRange}
            onChange={onMetricDateRangeChange}
          />
        ) : null}
      </div>
      <div className="city-header-right">
        <button
          id="save-city-btn"
          className={`save-city-btn ${isCitySaved ? "saved" : ""}`}
          onClick={onToggleSave}
          disabled={saving}
          title={isCitySaved ? "Remove from My Cities" : "Save to My Cities"}
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill={isCitySaved ? "currentColor" : "none"}
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path>
          </svg>
        </button>
      </div>
    </div>
  );
}


"use client";

import MetricDateRangeSelector from "@/components/MetricDateRangeSelector";
import AnomaliesAlertIcon from "@/components/AnomaliesAlertIcon";
import type { MetricDateRange } from "@/lib/dateRange";
import type { AnomalyResult } from "@/lib/hooks/useAnomalies";

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
  showDateRange?: boolean; // Control whether to show date range in header
  cityId?: number; // City ID for anomaly alerts
  selectedDistrict?: number | null; // District filter for anomalies (synced with map)
  selectedAnomaly?: AnomalyResult | null; // Currently selected anomaly
  onAnomalySelect?: (anomaly: AnomalyResult | null) => void; // Callback when anomaly is selected/cleared
  mapOnly?: boolean; // When true, only show anomalies for metrics with map_query enabled
  /** Show "Customize metrics" button; when clicked calls this (opens user metric order dialog) */
  onCustomizeMetricsClick?: () => void;
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
  showDateRange = true, // Default to showing date range
  cityId,
  selectedDistrict,
  selectedAnomaly,
  onAnomalySelect,
  mapOnly = false,
  onCustomizeMetricsClick,
}: CityHeaderProps) {
  const className = variant === "overlay" 
    ? `city-header-overlay ${visible ? "visible" : "hidden"}`
    : "city-header";

  return (
    <div className={className}>
      <div className="city-header-left">
        {emoji && <span className="city-emoji-icon">{emoji}</span>}
        <h1 className="city-name">{name}</h1>
        {showDateRange && metricDateRange && onMetricDateRangeChange ? (
          <MetricDateRangeSelector
            value={metricDateRange}
            onChange={onMetricDateRangeChange}
          />
        ) : null}
      </div>
      <div className="city-header-right">
        {onCustomizeMetricsClick && (
          <button
            type="button"
            onClick={onCustomizeMetricsClick}
            title="Customize metric order"
            style={{
              marginRight: 8,
              padding: "8px 14px",
              fontSize: 14,
              fontWeight: 500,
              color: "var(--brand-primary, #ad35fa)",
              background: "transparent",
              border: "1px solid var(--brand-primary, #ad35fa)",
              borderRadius: 8,
              cursor: "pointer",
              whiteSpace: "nowrap",
            }}
          >
            Customize metrics
          </button>
        )}
        {/* Anomaly Alert Icon */}
        {cityId && (
          <AnomaliesAlertIcon
            cityId={cityId}
            district={selectedDistrict}
            selectedAnomaly={selectedAnomaly}
            onAnomalySelect={onAnomalySelect}
            mapOnly={mapOnly}
          />
        )}
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


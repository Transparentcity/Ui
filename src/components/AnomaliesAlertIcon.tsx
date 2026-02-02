"use client";

import { useState, useMemo } from "react";
import { useCityAnomalies, type AnomalyResult } from "@/lib/hooks/useAnomalies";
import { useCityMetricsForMap } from "@/lib/hooks/useMetrics";
import AnomaliesBottomSheet from "./AnomaliesBottomSheet";
import styles from "./AnomaliesAlertIcon.module.css";

interface AnomaliesAlertIconProps {
  cityId: number;
  district?: number | null;
  onAnomalySelect?: (anomaly: AnomalyResult | null) => void;
  selectedAnomaly?: AnomalyResult | null;
  mapOnly?: boolean; // When true, only show anomalies for metrics with map_query enabled
}

export default function AnomaliesAlertIcon({
  cityId,
  district,
  onAnomalySelect,
  selectedAnomaly,
  mapOnly = false,
}: AnomaliesAlertIconProps) {
  const [isSheetOpen, setIsSheetOpen] = useState(false);

  // Fetch anomalies for this city (no district filter - show ALL anomalies)
  // This ensures we show recent anomalies regardless of which district is selected
  const { data: anomaliesData, isLoading } = useCityAnomalies(cityId, {
    // district filter removed - show all anomalies for the city
    period_type: "week",
    is_anomaly: true,
    limit: 100,
  });

  // Fetch metrics with map_query enabled (only when mapOnly is true)
  const { data: mapMetrics = [] } = useCityMetricsForMap(mapOnly ? cityId : null);

  // Create a set of metric IDs that have map_query enabled for fast lookup
  const mapMetricIds = useMemo(() => {
    return new Set(mapMetrics.map((m) => m.id));
  }, [mapMetrics]);

  // Calculate anomaly count - filter if mapOnly is true
  const anomalyCount = useMemo(() => {
    if (!anomaliesData?.results) return 0;
    if (!mapOnly) return anomaliesData.count ?? 0;
    // Filter anomalies to only count those with map_query enabled metrics
    return anomaliesData.results.filter((a) => mapMetricIds.has(a.metric_id)).length;
  }, [anomaliesData, mapOnly, mapMetricIds]);

  const handleBellClick = () => {
    setIsSheetOpen(true);
  };

  const handleSheetClose = () => {
    setIsSheetOpen(false);
    if (onAnomalySelect) {
      onAnomalySelect(null);
    }
  };

  const handleAnomalySelect = (anomaly: AnomalyResult | null) => {
    if (onAnomalySelect) {
      onAnomalySelect(anomaly);
    }
  };

  return (
    <>
      <button
        className={styles.alertButton}
        onClick={handleBellClick}
        title={`${anomalyCount} anomalies detected`}
        disabled={isLoading}
      >
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path>
          <path d="M13.73 21a2 2 0 0 1-3.46 0"></path>
        </svg>
        {anomalyCount > 0 && (
          <span className={styles.badge}>
            {anomalyCount > 99 ? "99+" : anomalyCount}
          </span>
        )}
      </button>

      <AnomaliesBottomSheet
        isOpen={isSheetOpen}
        onClose={handleSheetClose}
        cityId={cityId}
        district={district}
        selectedAnomaly={selectedAnomaly}
        onAnomalySelect={handleAnomalySelect}
        mapOnly={mapOnly}
      />
    </>
  );
}

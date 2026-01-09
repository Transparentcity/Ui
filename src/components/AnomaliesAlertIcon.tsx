"use client";

import { useState } from "react";
import { useCityAnomalies, type AnomalyResult } from "@/lib/hooks/useAnomalies";
import AnomaliesBottomSheet from "./AnomaliesBottomSheet";
import styles from "./AnomaliesAlertIcon.module.css";

interface AnomaliesAlertIconProps {
  cityId: number;
  district?: number | null;
  onAnomalySelect?: (anomaly: AnomalyResult) => void;
  selectedAnomaly?: AnomalyResult | null;
}

export default function AnomaliesAlertIcon({
  cityId,
  district,
  onAnomalySelect,
  selectedAnomaly,
}: AnomaliesAlertIconProps) {
  const [isSheetOpen, setIsSheetOpen] = useState(false);

  // Fetch anomalies for this city and district (default to weekly)
  const { data: anomaliesData, isLoading } = useCityAnomalies(cityId, {
    district: district ?? undefined,
    period_type: "week",
    is_anomaly: true,
    limit: 100,
  });

  const anomalyCount = anomaliesData?.count ?? 0;

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
      />
    </>
  );
}

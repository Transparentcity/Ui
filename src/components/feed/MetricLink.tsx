"use client";

import { useCallback } from "react";
import styles from "./feed.module.css";

interface MetricLinkProps {
  /** Display text for the metric */
  label: string;
  /** Direction indicator: "up" | "down" | null */
  direction?: "up" | "down" | null;
  /** Metric ID or slug for the link target */
  metricId?: string | number;
  /** Optional city ID for scoping the metric link */
  cityId?: string | number;
}

/**
 * Inline metric link rendered inside card descriptions.
 * Shows a branded purple underlined link with an optional directional arrow
 * that navigates to the metric detail page.
 */
export default function MetricLink({
  label,
  direction,
  metricId,
  cityId,
}: MetricLinkProps) {
  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (metricId) {
        const base = cityId ? `/dashboard?city=${cityId}&metric=${metricId}` : `/dashboard?metric=${metricId}`;
        window.location.href = base;
      }
    },
    [metricId, cityId],
  );

  const arrow = direction === "up" ? "\u2197" : direction === "down" ? "\u2198" : null;

  return (
    <span
      className={styles.metricLink}
      onClick={handleClick}
      role={metricId ? "link" : undefined}
      tabIndex={metricId ? 0 : undefined}
    >
      {label}
      {arrow && <span className={styles.metricIndicator}>{arrow}</span>}
    </span>
  );
}

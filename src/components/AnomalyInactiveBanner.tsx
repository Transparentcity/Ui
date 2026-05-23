"use client";

import styles from "./AnomalyInactiveBanner.module.css";

export interface AnomalyInactiveBannerProps {
  /** Compact layout for embedded iframes and thumbnails */
  compact?: boolean;
  className?: string;
}

/**
 * Shown when an anomaly result's detection run was superseded by a newer run.
 * Chart data is still valid as a historical snapshot.
 */
export default function AnomalyInactiveBanner({
  compact = false,
  className = "",
}: AnomalyInactiveBannerProps) {
  return (
    <div
      className={`${styles.banner} ${compact ? styles.compact : ""} ${className}`.trim()}
      role="status"
      aria-live="polite"
    >
      <span className={styles.icon} aria-hidden>
        ⚠
      </span>
      <span className={styles.text}>
        <strong>Inactive snapshot</strong>
        {compact ? (
          <> — superseded by a newer detection run</>
        ) : (
          <>
            {" "}
            — this chart is from an older detection run that was replaced when
            metrics were refreshed. Values reflect the period when it was computed.
          </>
        )}
      </span>
    </div>
  );
}

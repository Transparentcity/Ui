"use client";

import { useWasteState } from "@/lib/admin/waste/useWasteState";
import styles from "./TopStrip.module.css";

export function TopStrip() {
  const ui = useWasteState();

  const detectorPart = ui.city.detectors != null
    ? `${ui.detectorsActive} of ${ui.city.detectors} detectors`
    : ui.city.status;

  const healthClass =
    ui.health === "warn" ? styles.healthWarn :
    ui.health === "down" ? styles.healthDown :
    styles.healthHealthy;

  return (
    <header className={styles.strip} aria-label="Waste module status">
      <div className={styles.left}>
        <div className={styles.section}>{ui.sectionLabel}</div>
        <div className={styles.cityLine}>
          {ui.city.flag} {ui.city.name} · {detectorPart}
        </div>
      </div>

      <div className={styles.spacer} />

      <div className={styles.timestamp}>{ui.lastRunAt}</div>

      <div className={`${styles.healthPill} ${healthClass}`} aria-live="polite">
        <span className={styles.healthDot} aria-hidden="true" />
        {ui.healthLabel}
      </div>
    </header>
  );
}

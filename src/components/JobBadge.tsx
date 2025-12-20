"use client";

import { Job } from "@/lib/useJobWebSocket";

import styles from "./JobBadge.module.css";

interface JobBadgeProps {
  activeJobCount: number;
  onClick: () => void;
}

export default function JobBadge({ activeJobCount, onClick }: JobBadgeProps) {
  if (activeJobCount === 0) {
    return null;
  }

  return (
    <button className={styles.jobBadge} onClick={onClick}>
      <span className={styles.jobIcon}>⚙️</span>
      <span className={styles.jobCount}>{activeJobCount}</span>
    </button>
  );
}



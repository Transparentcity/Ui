"use client";

import styles from "./feed.module.css";

interface CardHeaderProps {
  typeIcon: string;
  typeLabel?: string;
  actor: string;
  subline: string;
  neighborhoodLabel: string;
}

export default function CardHeader({ typeIcon, actor, subline, neighborhoodLabel }: CardHeaderProps) {
  return (
    <div className={styles.cardHeader}>
      <div className={styles.cardHeaderLeft}>
        <span className={styles.cardTypeIcon}>{typeIcon}</span>
        <span className={styles.cardActor}>{actor}</span>
        {subline && <span className={styles.cardTimestamp}>{subline}</span>}
      </div>
      <div className={styles.cardHeaderRight}>{neighborhoodLabel}</div>
    </div>
  );
}

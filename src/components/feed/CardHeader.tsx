"use client";

import { ICON_COMPONENTS } from "./categoryIcons";
import styles from "./feed.module.css";

interface CardHeaderProps {
  typeIcon: string;
  typeLabel?: string;
  actor: string;
  subline: string;
  neighborhoodLabel: string;
  /** CSS color for the category icon dot. */
  categoryColor?: string;
}

export default function CardHeader({
  typeIcon,
  actor,
  subline,
  neighborhoodLabel,
  categoryColor,
}: CardHeaderProps) {
  const IconComponent = ICON_COMPONENTS[typeIcon];

  return (
    <div className={styles.cardHeader}>
      <div className={styles.cardHeaderLeft}>
        {IconComponent ? (
          <span className={styles.cardTypeIcon} style={{ color: categoryColor }} aria-hidden="true">
            <IconComponent size={14} strokeWidth={2.5} />
          </span>
        ) : (
          <span className={styles.cardTypeIcon} aria-hidden="true">{typeIcon}</span>
        )}
        <span className={styles.cardActor}>{actor}</span>
        {subline && <span className={styles.cardTimestamp}>{subline}</span>}
      </div>
      <div className={styles.cardHeaderRight}>{neighborhoodLabel}</div>
    </div>
  );
}

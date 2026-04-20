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
  /** Story type (e.g. "fix_it_already") — used to render a type badge below the header row. */
  storyType?: string;
}

export default function CardHeader({
  typeIcon,
  actor,
  subline,
  neighborhoodLabel,
  categoryColor,
  storyType,
}: CardHeaderProps) {
  const IconComponent = ICON_COMPONENTS[typeIcon];
  const isFixItAlready = (storyType ?? "").toLowerCase() === "fix_it_already";

  return (
    <>
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
      {isFixItAlready && (
        <div className={styles.fixItAlreadyBadge}>
          <span aria-hidden="true">{"\u{1F926}"}</span>
          <span>Fix It, Already</span>
        </div>
      )}
    </>
  );
}

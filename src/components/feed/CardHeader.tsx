"use client";

import {
  Shield,
  Flame,
  Wrench,
  Building2,
  Trees,
  Bus,
  DollarSign,
  Store,
  Heart,
  GraduationCap,
  Scale,
  Droplets,
  Landmark,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import styles from "./feed.module.css";

/** Map from Lucide icon name string to the actual component. */
const ICON_COMPONENTS: Record<string, LucideIcon> = {
  Shield,
  Flame,
  Wrench,
  Building2,
  Trees,
  Bus,
  DollarSign,
  Store,
  Heart,
  GraduationCap,
  Scale,
  Droplets,
  Landmark,
};

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
          <span className={styles.cardTypeIcon} style={{ color: categoryColor }}>
            <IconComponent size={14} strokeWidth={2.5} />
          </span>
        ) : (
          <span className={styles.cardTypeIcon}>{typeIcon}</span>
        )}
        <span className={styles.cardActor}>{actor}</span>
        {subline && <span className={styles.cardTimestamp}>{subline}</span>}
      </div>
      <div className={styles.cardHeaderRight}>{neighborhoodLabel}</div>
    </div>
  );
}

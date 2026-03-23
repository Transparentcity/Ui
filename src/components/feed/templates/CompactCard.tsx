"use client";

import type { EnrichedFeedStory } from "@/lib/feed/mockFeedData";
import styles from "../feed.module.css";

interface CompactCardProps {
  story: EnrichedFeedStory;
  children: React.ReactNode;
}

/**
 * Compact card variant: condensed single-row layout for lower-priority
 * text-only stories. Shows icon + actor + timestamp + neighborhood in one
 * row, headline in the next, and only the overflow (···) action button.
 */
export default function CompactCard({ story, children }: CompactCardProps) {
  return (
    <>
      <div className={styles.compactRow}>
        <div className={styles.compactHeaderSection}>
          <span className={styles.cardTypeIcon}>{story.type_icon}</span>
          <span className={styles.cardActor}>{story.actor}</span>
          {story.subline && (
            <span className={styles.cardTimestamp}>{story.subline}</span>
          )}
        </div>
        <div className={styles.cardHeaderRight}>{story.neighborhood_label}</div>
      </div>
      <div className={styles.compactContentRow}>
        <h2 className={styles.cardHeadline}>{story.headline}</h2>
      </div>
      {children}
    </>
  );
}

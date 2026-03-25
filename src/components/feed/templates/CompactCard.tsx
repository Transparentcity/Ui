"use client";

import type { EnrichedFeedStory } from "@/lib/feed/mockFeedData";
import styles from "../feed.module.css";

interface CompactCardProps {
  story: EnrichedFeedStory;
  children: React.ReactNode;
}

/**
 * Compact card variant: condensed layout for lower-priority text-only
 * stories. Shows icon + actor + timestamp + neighborhood in one row,
 * headline in the next, and a bold factoid snippet when available.
 */
export default function CompactCard({ story, children }: CompactCardProps) {
  const meta = story.metadata ?? {};
  // Extract a punchy factoid from key_insight or first sentence of description
  const factoid =
    (meta.key_insight as string | undefined) ??
    extractFactoid(story.cleaned_description);

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
      {factoid && (
        <div className={styles.compactFactoid}>{factoid}</div>
      )}
      {children}
    </>
  );
}

/** Extract first sentence as a factoid, only if it contains a number. */
function extractFactoid(text: string | undefined): string | null {
  if (!text) return null;
  const firstSentence = text.split(/[.!?]\s/)[0];
  if (!firstSentence || firstSentence.length > 120) return null;
  // Only show if it contains a concrete number — otherwise it's just filler
  if (!/\d/.test(firstSentence)) return null;
  return firstSentence + (firstSentence.endsWith(".") ? "" : ".");
}

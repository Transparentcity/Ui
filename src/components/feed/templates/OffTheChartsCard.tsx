"use client";

import type { EnrichedFeedStory } from "@/lib/feed/mockFeedData";
import CardHeader from "../CardHeader";
import styles from "../feed.module.css";

interface OffTheChartsCardProps {
  story: EnrichedFeedStory;
  children: React.ReactNode;
}

export default function OffTheChartsCard({ story, children }: OffTheChartsCardProps) {
  const meta = story.metadata ?? {};
  const stat = meta.otc_stat as string | number | undefined;
  const label = meta.otc_label as string | undefined;
  const emoji = meta.otc_emoji as string | undefined;
  const context = meta.otc_context as string | undefined;
  const multiplier = meta.otc_multiplier as string | undefined;

  const hasStat = stat != null;

  return (
    <>
      <div className={styles.otcBadge}>
        {"\u{1F92F}"} Off the Charts
      </div>

      {hasStat ? (
        <>
          <div className={styles.otcContent}>
            <div className={styles.otcHero}>
              <div className={styles.otcStatNumber}>{stat}</div>
              {label && <div className={styles.otcStatLabel}>{label}</div>}
            </div>
            {emoji && <div className={styles.otcEmoji}>{emoji}</div>}
          </div>

          {context && (
            <div className={styles.otcContext}>
              {multiplier ? (
                <>
                  {context.split(multiplier)[0]}
                  <span className={styles.otcHighlight}>{multiplier}</span>
                  {context.split(multiplier).slice(1).join(multiplier)}
                </>
              ) : context}
            </div>
          )}
        </>
      ) : (
        <>
          <CardHeader
            typeIcon={story.type_icon}
            typeLabel={story.type_label}
            actor={story.actor}
            subline={story.subline}
            neighborhoodLabel={story.neighborhood_label}
          />
          <h2 className={styles.cardHeadline}>{story.headline}</h2>
          {story.cleaned_description && (
            <p className={styles.cardDescription}>{story.cleaned_description}</p>
          )}
        </>
      )}

      {children}
    </>
  );
}

"use client";

import type { EnrichedFeedStory } from "@/lib/feed/mockFeedData";
import CardHeader from "../CardHeader";
import styles from "../feed.module.css";

interface AlertCardProps {
  story: EnrichedFeedStory;
  children: React.ReactNode;
}

export default function AlertCard({ story, children }: AlertCardProps) {
  const meta = story.metadata ?? {};
  const value = meta.anomaly_value as string | number | undefined;
  const changePct = meta.anomaly_change_pct as number | undefined;
  const severity = meta.anomaly_severity as string | undefined;

  // Color based on severity
  const color = severity === "critical" ? "var(--error, #ef4444)" : "var(--warning, #f59e0b)";

  return (
    <>
      <CardHeader
        typeIcon={story.type_icon}
        typeLabel={story.type_label}
        actor={story.actor}
        subline={story.subline}
        neighborhoodLabel={story.neighborhood_label}
      />
      <h2 className={styles.cardHeadline}>{story.headline}</h2>

      {(value != null || changePct != null) && (
        <div className={styles.alertHero}>
          <div className={styles.alertHeroMain}>
            <div>
              {value != null && (
                <span className={styles.alertMetricValue} style={{ color }}>
                  {value}
                </span>
              )}
              {changePct != null && (
                <span className={styles.alertMetricChange} style={{ color }}>
                  ({changePct >= 0 ? "+" : ""}{Math.round(changePct)}%)
                </span>
              )}
            </div>
            <div className={styles.alertMetricLabel}>
              vs. prior period average
            </div>
          </div>
          {/* Sparkline placeholder — will be populated when backend provides trend data */}
          <div className={styles.alertSparkline} />
        </div>
      )}

      {story.cleaned_description && (
        <p className={styles.cardDescription}>{story.cleaned_description}</p>
      )}
      {story.cleaned_description && (
        <span className={styles.readMore}>Read more →</span>
      )}
      {children}
    </>
  );
}

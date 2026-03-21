"use client";

import { useMemo } from "react";
import type { EnrichedFeedStory } from "@/lib/feed/mockFeedData";
import CardHeader from "../CardHeader";
import styles from "../feed.module.css";

interface Metric {
  name: string;
  direction: "up" | "down" | "flat";
  arrow: string;
  percent: string;
}

/**
 * Extract real metrics from story metadata if available.
 * Returns null if no structured metrics exist.
 */
function extractRealMetrics(story: EnrichedFeedStory): Metric[] | null {
  const meta = story.metadata;
  if (!meta) return null;

  // Check for structured metrics array in metadata
  const metricsData = meta.metrics as
    | Array<{ name: string; direction: string; pct: string }>
    | undefined;
  if (!Array.isArray(metricsData) || metricsData.length === 0) return null;

  return metricsData.slice(0, 4).map((m) => {
    const dir: Metric["direction"] =
      m.direction === "up" ? "up" : m.direction === "down" ? "down" : "flat";
    return {
      name: m.name,
      direction: dir,
      arrow: dir === "up" ? "\u2191" : dir === "down" ? "\u2193" : "\u2500",
      percent: m.pct,
    };
  });
}

interface MultiMetricCardProps {
  story: EnrichedFeedStory;
  children: React.ReactNode; // action bar
}

export default function MultiMetricCard({ story, children }: MultiMetricCardProps) {
  const realMetrics = useMemo(() => extractRealMetrics(story), [story]);

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
      {story.cleaned_description && (
        <p className={styles.cardDescription}>{story.cleaned_description}</p>
      )}

      {/* Show metric grid only if real structured metrics exist in metadata */}
      {realMetrics && realMetrics.length > 0 && (
        <div className={styles.metricGrid}>
          {realMetrics.map((m, i) => (
            <div key={i} className={styles.metricCell}>
              <span className={styles.metricName}>{m.name}</span>
              <span
                className={`${styles.metricValue} ${
                  m.direction === "up"
                    ? styles.metricUp
                    : m.direction === "down"
                      ? styles.metricDown
                      : styles.metricFlat
                }`}
              >
                {m.arrow} {m.percent}
              </span>
            </div>
          ))}
        </div>
      )}

      {children}
    </>
  );
}

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
 * Format a percentage change into a readable string.
 * Small values: "+12%". Large values: "+24x". Absurdly large: "+999x".
 */
function formatPct(raw: number): string {
  const sign = raw >= 0 ? "+" : "";
  const abs = Math.abs(raw);
  // Normal range: show as percentage
  if (abs <= 999) return `${sign}${Math.round(raw)}%`;
  // Large: convert to multiplier (e.g. +2,400% → +24x)
  const multiplier = abs / 100;
  if (multiplier <= 999) return `${sign}${Math.round(raw >= 0 ? multiplier : -multiplier)}x`;
  // Absurdly large: cap display
  return `${sign}999x`;
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
    // Format the pct value: make large numbers human-readable
    const rawPct = typeof m.pct === "number" ? m.pct : parseFloat(String(m.pct)) || 0;
    const formatted = formatPct(rawPct);
    return {
      name: m.name,
      direction: dir,
      arrow: dir === "up" ? "\u2191" : dir === "down" ? "\u2193" : "\u2500",
      percent: formatted,
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
      {/* Build description from real metrics if available (server description may have raw huge numbers) */}
      {realMetrics && realMetrics.length > 0 ? (
        <p className={styles.cardDescription}>
          {realMetrics.map((m) => `${m.name} ${m.percent} ${m.direction}`).join(" · ")}
        </p>
      ) : story.cleaned_description ? (
        <p className={styles.cardDescription}>{story.cleaned_description}</p>
      ) : null}

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

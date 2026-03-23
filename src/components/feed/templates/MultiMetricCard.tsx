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
  favorable: boolean;
}

function formatPct(raw: number): string {
  const abs = Math.abs(raw);
  if (abs <= 999) return `${Math.round(abs)}%`;
  const multiplier = abs / 100;
  if (multiplier <= 999) return `${Math.round(multiplier)}x`;
  return "999x";
}

/**
 * Determine if a metric change is favorable (good news) based on direction
 * and metric name. Decreases in complaints/crime/response times = good.
 * Increases in complaints/crime/response times = bad.
 */
function isFavorable(direction: string, name: string): boolean {
  const nameLower = name.toLowerCase();
  // Metrics where "down" is bad (programs, services, employment)
  const downIsBad = /employment|jobs|housing|units|funding|program|service|budget|revenue/.test(nameLower);
  if (downIsBad) return direction === "up";
  // Default: for complaints, incidents, crime, response times — down is good
  return direction === "down";
}

function extractRealMetrics(story: EnrichedFeedStory): Metric[] | null {
  const meta = story.metadata;
  if (!meta) return null;

  const metricsData = meta.metrics as
    | Array<{ name: string; direction: string; pct: string | number }>
    | undefined;
  if (!Array.isArray(metricsData) || metricsData.length === 0) return null;

  return metricsData.slice(0, 4).map((m) => {
    const dir: Metric["direction"] =
      m.direction === "up" ? "up" : m.direction === "down" ? "down" : "flat";
    const rawPct = typeof m.pct === "number" ? m.pct : parseFloat(String(m.pct)) || 0;
    const formatted = formatPct(rawPct);
    const fav = isFavorable(dir, m.name);
    return {
      name: m.name,
      direction: dir,
      arrow: dir === "up" ? "\u2191" : dir === "down" ? "\u2193" : "\u2500",
      percent: formatted,
      favorable: fav,
    };
  });
}

interface MultiMetricCardProps {
  story: EnrichedFeedStory;
  children: React.ReactNode;
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

      {!(realMetrics && realMetrics.length > 0) && story.cleaned_description ? (
        <p className={styles.cardDescription}>{story.cleaned_description}</p>
      ) : null}

      {realMetrics && realMetrics.length > 0 && (
        <div className={styles.metricGridRedesigned}>
          {realMetrics.map((m, i) => (
            <div key={i} className={styles.metricTile}>
              <div className={styles.metricTileMain}>
                <div
                  className={`${styles.metricNumber} ${
                    m.favorable ? styles.metricFavorable : styles.metricUnfavorable
                  }`}
                >
                  <span className={styles.metricArrow}>{m.arrow}</span> {m.percent}
                </div>
                <div className={styles.metricTileLabel}>{m.name}</div>
              </div>
              <div className={styles.sparklineWrap} />
            </div>
          ))}
        </div>
      )}

      {children}
    </>
  );
}

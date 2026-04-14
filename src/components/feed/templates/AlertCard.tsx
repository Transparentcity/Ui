"use client";

import { useState } from "react";
import type { EnrichedFeedStory } from "@/lib/feed/mockFeedData";
import CardHeader from "../CardHeader";
import LazyVizEmbed from "../LazyVizEmbed";
import styles from "../feed.module.css";

interface AlertCardProps {
  story: EnrichedFeedStory;
  children: React.ReactNode;
}

/**
 * Extract a percentage from headline text as a last resort.
 * Matches patterns like "Up 57%", "Surged 437%", "Dropped 12%", "+200%", "428% Above Average"
 */
function extractPctFromHeadline(headline: string): number | null {
  if (!headline) return null;
  const parsePct = (s: string) => parseFloat(s.replace(/,/g, ""));
  // Match "Up/Rose/Surged/Jumped/Point X%" or "Down/Dropped/Fell/Declined X%"
  const upMatch = headline.match(/(?:up|rose|surged|jumped|point(?:ed)?|increase[ds]?|grew|spike[ds]?)\s+([\d,]+(?:\.\d+)?)%/i);
  if (upMatch) return parsePct(upMatch[1]);
  const downMatch = headline.match(/(?:down|dropped|fell|declined?|decrease[ds]?|plunged|plummeted?|sank|shrank)\s+([\d,]+(?:\.\d+)?)%/i);
  if (downMatch) return -parsePct(downMatch[1]);
  // Match "X% Above/Increase" or "X% Below/Decrease"
  const aboveMatch = headline.match(/([\d,]+(?:\.\d+)?)%\s+(?:above|increase|higher|more|over|up)/i);
  if (aboveMatch) return parsePct(aboveMatch[1]);
  const belowMatch = headline.match(/([\d,]+(?:\.\d+)?)%\s+(?:below|decrease|lower|less|under|down)/i);
  if (belowMatch) return -parsePct(belowMatch[1]);
  // Match standalone "+X%" or "-X%"
  const signedMatch = headline.match(/([+-])([\d,]+(?:\.\d+)?)%/);
  if (signedMatch) return signedMatch[1] === "-" ? -parsePct(signedMatch[2]) : parsePct(signedMatch[2]);
  // Match "Doubled" / "Tripled" keywords
  if (/\bdoubled\b/i.test(headline)) return 100;
  if (/\btripled\b/i.test(headline)) return 200;
  return null;
}

export default function AlertCard({ story, children }: AlertCardProps) {
  const [imgFailed, setImgFailed] = useState(false);
  const meta = story.metadata ?? {};

  // Support both legacy (anomaly_*) and current backend field names
  const value = (meta.anomaly_value ?? meta.current_period_value) as string | number | undefined;
  const metaPct = (meta.anomaly_change_pct ?? meta.pct_change ?? meta.trend_pct_change ?? meta.percent_change) as number | undefined;
  // Fall back to extracting percentage from headline text
  const changePct = metaPct ?? extractPctFromHeadline(story.headline ?? "");
  const severity = (meta.anomaly_severity as string | undefined);
  const priorValue = meta.comparison_period_value as string | number | undefined;

  // Streak metadata (set by backend when 3+ consecutive periods move same direction)
  const streakCount = meta.streak_count as number | undefined;
  const streakDirection = meta.streak_direction as "up" | "down" | undefined;

  // Derive severity from pct_change magnitude if not explicitly set
  const effectiveSeverity = severity
    ?? (changePct != null && Math.abs(changePct) >= 100 ? "critical" : "warning");

  // Color based on severity
  const color = effectiveSeverity === "critical" ? "var(--error, #ef4444)" : "var(--warning, #f59e0b)";

  const hasMetrics = value != null || changePct != null;

  return (
    <>
      <CardHeader
        typeIcon={story.type_icon}
        typeLabel={story.type_label}
        actor={story.actor}
        subline={story.subline}
        neighborhoodLabel={story.neighborhood_label}
        categoryColor={story.category_color}
      />
      <h2 className={styles.cardHeadline}>{story.headline}</h2>

      {/* Streak badge — shown when 3+ consecutive periods move same direction */}
      {streakCount != null && streakCount >= 3 && streakDirection && (
        <div className={styles.streakBadge}>
          {streakDirection === "down" ? "\u2193" : "\u2191"} {streakCount} in a row
        </div>
      )}

      {hasMetrics && (
        <div className={styles.alertHero}>
          <div className={styles.alertHeroMain}>
            <div>
              {value != null && (
                <span className={styles.alertMetricValue} style={{ color }}>
                  {typeof value === "number" ? value.toLocaleString() : value}
                </span>
              )}
              {changePct != null && (
                <span className={styles.alertMetricChange} style={{ color }}>
                  ({changePct >= 0 ? "+" : ""}{Math.round(changePct)}%)
                </span>
              )}
            </div>
            <div className={styles.alertMetricLabel}>
              {priorValue != null ? `vs. ${typeof priorValue === "number" ? priorValue.toLocaleString() : priorValue} prior period` : "vs. prior period average"}
            </div>
          </div>
          {/* Sparkline placeholder */}
          <div className={styles.alertSparkline} />
        </div>
      )}

      {/* Prefer static PNG (fast) over iframe embed (slow) */}
      {story.image_url_resolved && !imgFailed ? (
        <div className={styles.vizArea}>
          <img
            src={story.image_url_resolved}
            alt={story.headline}
            className={styles.vizImage}
            loading="lazy"
            onError={() => setImgFailed(true)}
          />
        </div>
      ) : story.embed_url_resolved ? (
        <div className={styles.vizArea}>
          <LazyVizEmbed
            src={story.embed_url_resolved}
            title={story.headline}
          />
        </div>
      ) : null}

      {story.cleaned_description && (
        <p className={styles.cardDescription}>{story.cleaned_description}</p>
      )}
      {children}
    </>
  );
}

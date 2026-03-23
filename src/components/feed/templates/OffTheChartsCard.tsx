"use client";

import type { EnrichedFeedStory } from "@/lib/feed/mockFeedData";
import CardHeader from "../CardHeader";
import styles from "../feed.module.css";

interface OffTheChartsCardProps {
  story: EnrichedFeedStory;
  children: React.ReactNode;
}

/**
 * Format a number as a short stat: e.g. 2000 -> "2,000", 0.5 -> "+50%"
 */
function formatStat(val: number | string): string {
  if (typeof val === "string") return val;
  if (Math.abs(val) >= 1000) return val.toLocaleString();
  return String(val);
}

/**
 * Try to extract a stat + label from pct_change or current_period_value
 * when the backend hasn't set explicit otc_* metadata.
 */
function deriveStatFromMeta(meta: Record<string, unknown>): {
  stat: string | null;
  label: string | null;
  multiplier: string | null;
} {
  const pct = (meta.pct_change ?? meta.trend_pct_change ?? meta.percent_change) as number | undefined;
  const currentVal = meta.current_period_value as number | undefined;
  const priorVal = meta.comparison_period_value as number | undefined;

  if (pct != null && Math.abs(pct) >= 10) {
    const absPct = Math.abs(pct);
    if (absPct >= 100) {
      const mult = Math.round(absPct / 100);
      return {
        stat: `${mult}x`,
        label: pct > 0 ? "increase" : "decrease",
        multiplier: `${mult}x`,
      };
    }
    return {
      stat: `${pct >= 0 ? "+" : ""}${Math.round(pct)}%`,
      label: "change",
      multiplier: null,
    };
  }

  if (currentVal != null) {
    return {
      stat: formatStat(currentVal),
      label: priorVal != null ? `up from ${formatStat(priorVal)}` : null,
      multiplier: null,
    };
  }

  return { stat: null, label: null, multiplier: null };
}

export default function OffTheChartsCard({ story, children }: OffTheChartsCardProps) {
  const meta = story.metadata ?? {};

  // Prefer explicit otc_* metadata; fall back to deriving from pct_change data
  const explicitStat = meta.otc_stat as string | number | undefined;
  const derived = explicitStat == null ? deriveStatFromMeta(meta) : null;

  const stat = explicitStat ?? derived?.stat;
  const label = (meta.otc_label as string | undefined) ?? derived?.label;
  const emoji = meta.otc_emoji as string | undefined;
  const context = (meta.otc_context as string | undefined) ?? story.cleaned_description;
  const multiplier = (meta.otc_multiplier as string | undefined) ?? derived?.multiplier;

  const hasStat = stat != null;

  return (
    <>
      <div className={styles.otcBadge}>
        {"\u{1F92F}"} Off the Charts
      </div>

      <h2 className={styles.cardHeadline}>{story.headline}</h2>

      {hasStat && (
        <div className={styles.otcContent}>
          <div className={styles.otcHero}>
            <div className={styles.otcStatNumber}>{stat}</div>
            {label && <div className={styles.otcStatLabel}>{label}</div>}
          </div>
          {emoji && <div className={styles.otcEmoji}>{emoji}</div>}
        </div>
      )}

      {context && (
        <div className={styles.otcContext}>
          {multiplier && context.includes(multiplier) ? (
            <>
              {context.split(multiplier)[0]}
              <span className={styles.otcHighlight}>{multiplier}</span>
              {context.split(multiplier).slice(1).join(multiplier)}
            </>
          ) : context}
        </div>
      )}

      {!hasStat && !context && story.cleaned_description && (
        <p className={styles.cardDescription}>{story.cleaned_description}</p>
      )}

      {children}
    </>
  );
}

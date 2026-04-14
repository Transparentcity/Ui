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

const MILESTONE_BADGES: Record<string, { emoji: string; label: string }> = {
  record_low: { emoji: "\u{1F4C9}", label: "Record Low" },
  record_high: { emoji: "\u{1F4C8}", label: "Record High" },
  round_number: { emoji: "\u{1F3AF}", label: "Milestone" },
};

export default function OffTheChartsCard({ story, children }: OffTheChartsCardProps) {
  const meta = story.metadata ?? {};
  const isMilestone = story.card_type === "milestone";
  const milestoneType = meta.milestone_type as string | undefined;

  // Prefer explicit otc_* metadata; fall back to deriving from pct_change data
  const explicitStat = meta.otc_stat as string | number | undefined;
  const derived = explicitStat == null ? deriveStatFromMeta(meta) : null;

  const stat = explicitStat ?? derived?.stat;
  const label = (meta.otc_label as string | undefined) ?? derived?.label;
  const emoji = meta.otc_emoji as string | undefined;
  const context = (meta.otc_context as string | undefined) ?? story.cleaned_description;
  const multiplier = (meta.otc_multiplier as string | undefined) ?? derived?.multiplier;

  // Suppress the stat block when the headline already contains the same number,
  // which causes a redundant "139 ... / 139 ..." visual stutter.
  const headlineContainsStat =
    stat != null && story.headline?.includes(String(stat));
  const hasStat = stat != null && !headlineContainsStat;
  const badge = isMilestone && milestoneType
    ? MILESTONE_BADGES[milestoneType] ?? { emoji: "\u{1F3AF}", label: "Milestone" }
    : { emoji: "\u{1F92F}", label: "Off the Charts" };

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
      <div className={`${styles.otcBadge} ${isMilestone ? styles.milestoneBadge : ""}`}>
        {badge.emoji} {badge.label}
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

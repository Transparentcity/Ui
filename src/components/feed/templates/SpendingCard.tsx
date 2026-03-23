"use client";

import type { EnrichedFeedStory } from "@/lib/feed/mockFeedData";
import CardHeader from "../CardHeader";
import styles from "../feed.module.css";

interface SpendingCardProps {
  story: EnrichedFeedStory;
  children: React.ReactNode;
}

function formatAmount(raw: number | string | undefined): string {
  if (raw == null) return "";
  const n = typeof raw === "string" ? parseFloat(raw) : raw;
  if (isNaN(n)) return String(raw);
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toLocaleString()}`;
}

export default function SpendingCard({ story, children }: SpendingCardProps) {
  const meta = story.metadata ?? {};
  const amount = meta.contract_amount as number | string | undefined;
  const priorAmount = meta.prior_amount as number | string | undefined;
  const vendor = meta.vendor_name as string | undefined;

  const amountNum = amount != null ? (typeof amount === "string" ? parseFloat(amount) : amount) : null;
  const priorNum = priorAmount != null ? (typeof priorAmount === "string" ? parseFloat(priorAmount) : priorAmount) : null;

  const hasBars = amountNum != null && priorNum != null && priorNum > 0;
  const maxVal = hasBars ? Math.max(amountNum!, priorNum!) : 1;
  const changePct = hasBars ? Math.round(((amountNum! - priorNum!) / priorNum!) * 100) : null;
  // Spending increases are generally unfavorable
  const isUnfavorable = changePct != null && changePct > 0;

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

      {amount != null && (
        <div className={styles.spendingHero}>
          <div className={styles.spendingAmount}>{formatAmount(amount)}</div>
          {story.cleaned_description && (
            <div className={styles.spendingContext}>{story.cleaned_description}</div>
          )}
        </div>
      )}

      {hasBars && (
        <div className={styles.comparisonBars}>
          <div className={styles.comparisonRow}>
            <span className={styles.comparisonLabel}>Current</span>
            <div className={styles.barTrack}>
              <div
                className={`${styles.barFill} ${styles.barFillCurrent}`}
                style={{ width: `${(amountNum! / maxVal) * 100}%` }}
              />
            </div>
            <span className={styles.barValue}>{formatAmount(amount)}</span>
          </div>
          <div className={styles.comparisonRow}>
            <span className={styles.comparisonLabel}>Prior</span>
            <div className={styles.barTrack}>
              <div
                className={`${styles.barFill} ${styles.barFillPrior}`}
                style={{ width: `${(priorNum! / maxVal) * 100}%` }}
              />
            </div>
            <span className={styles.barValue}>{formatAmount(priorAmount)}</span>
          </div>
        </div>
      )}

      {changePct != null && (
        <div>
          <span className={`${styles.deltaPill} ${isUnfavorable ? styles.deltaPillUnfavorable : styles.deltaPillFavorable}`}>
            {changePct >= 0 ? "↑" : "↓"} {changePct >= 0 ? "+" : ""}{changePct}% vs. prior
          </span>
        </div>
      )}

      {!amount && story.cleaned_description && (
        <p className={styles.cardDescription}>{story.cleaned_description}</p>
      )}

      {vendor && <div className={styles.vendorLine}>Vendor: {vendor}</div>}

      {children}
    </>
  );
}

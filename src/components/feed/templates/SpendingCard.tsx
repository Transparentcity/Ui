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
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  if (abs >= 1_000_000_000) return `${sign}$${(abs / 1_000_000_000).toFixed(1)}B`;
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(0)}K`;
  return `${sign}$${abs.toLocaleString()}`;
}

/**
 * Extract a percentage from headline text.
 * Matches "428% Above Average", "Up 57%", "+200%", etc.
 */
function extractPctFromText(text: string): number | null {
  if (!text) return null;
  const parsePct = (s: string) => parseFloat(s.replace(/,/g, ""));
  const upMatch = text.match(/(?:up|rose|surged|jumped|increase[ds]?|grew)\s+([\d,]+(?:\.\d+)?)%/i);
  if (upMatch) return parsePct(upMatch[1]);
  const downMatch = text.match(/(?:down|dropped|fell|declined?|decrease[ds]?|shrank)\s+([\d,]+(?:\.\d+)?)%/i);
  if (downMatch) return -parsePct(downMatch[1]);
  const aboveMatch = text.match(/([\d,]+(?:\.\d+)?)%\s+(?:above|higher|more|over)/i);
  if (aboveMatch) return parsePct(aboveMatch[1]);
  const belowMatch = text.match(/([\d,]+(?:\.\d+)?)%\s+(?:below|lower|less|under)/i);
  if (belowMatch) return -parsePct(belowMatch[1]);
  const signedMatch = text.match(/([+-])([\d,]+(?:\.\d+)?)%/);
  if (signedMatch) return signedMatch[1] === "-" ? -parsePct(signedMatch[2]) : parsePct(signedMatch[2]);
  return null;
}

/**
 * Extract dollar amounts from headline or description text.
 * Matches patterns like "$1.2M", "$500K", "$1,234,567", "$45 million".
 */
function extractDollarAmount(text: string): number | null {
  if (!text) return null;
  // Match $X.XM, $XM, $X.XK, $XK
  const shortMatch = text.match(/\$(\d+(?:\.\d+)?)\s*(M|million|B|billion|K|thousand)/i);
  if (shortMatch) {
    const num = parseFloat(shortMatch[1]);
    const unit = shortMatch[2].toUpperCase();
    if (unit === "B" || unit === "BILLION") return num * 1_000_000_000;
    if (unit === "M" || unit === "MILLION") return num * 1_000_000;
    if (unit === "K" || unit === "THOUSAND") return num * 1_000;
  }
  // Match $1,234,567 or $1234567
  const rawMatch = text.match(/\$([\d,]+(?:\.\d{1,2})?)/);
  if (rawMatch) {
    const num = parseFloat(rawMatch[1].replace(/,/g, ""));
    if (!isNaN(num) && num > 0) return num;
  }
  return null;
}

export default function SpendingCard({ story, children }: SpendingCardProps) {
  const meta = story.metadata ?? {};

  // Try explicit metadata first, then extract from headline/description
  const amount: number | string | undefined = (meta.contract_amount as number | string | undefined)
    ?? extractDollarAmount(story.headline ?? "")
    ?? extractDollarAmount(story.cleaned_description ?? "")
    ?? undefined;
  const priorAmount = (meta.prior_amount ?? meta.comparison_period_value) as number | string | undefined;
  const vendor = meta.vendor_name as string | undefined;
  const contractPurpose = (meta.contract_purpose ?? meta.contract_description) as string | undefined;

  const amountNum = amount != null ? (typeof amount === "string" ? parseFloat(amount) : amount) : null;
  const priorNum = priorAmount != null ? (typeof priorAmount === "string" ? parseFloat(priorAmount) : priorAmount) : null;

  const hasBars = amountNum != null && priorNum != null && priorNum > 0;
  const maxVal = hasBars ? Math.max(amountNum!, priorNum!) : 1;
  // Prefer computed change from bars; fall back to headline-extracted percentage
  const computedPct = hasBars ? Math.round(((amountNum! - priorNum!) / priorNum!) * 100) : null;
  const headlinePct = extractPctFromText(story.headline ?? "");
  const changePct = computedPct ?? headlinePct;
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
        categoryColor={story.category_color}
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

      {(vendor || contractPurpose) && (
        <div className={styles.vendorBlock}>
          {vendor && (
            <div className={styles.vendorLine}>
              <span className={styles.vendorLineLabel}>Paid to:</span> {vendor}
            </div>
          )}
          {contractPurpose && (
            <div className={styles.vendorPurpose}>{contractPurpose}</div>
          )}
        </div>
      )}

      {children}
    </>
  );
}

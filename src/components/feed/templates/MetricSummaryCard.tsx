"use client";

import Link from "next/link";
import type {
  PublicCityMetricItem,
  PublicMetricComparison,
} from "@/lib/publicApiClient";
import { formatMetricValue } from "@/lib/formatters";
import CardHeader from "../CardHeader";
import feedStyles from "../feed.module.css";
import styles from "./MetricSummaryCard.module.css";

const MAX_HEADLINE_LENGTH = 80;

export interface MetricCardData {
  metric: PublicCityMetricItem;
  comparison: PublicMetricComparison;
  slug: string;
  cityName: string;
  cityEmoji?: string;
  /** Controls direction semantics: when "down", a decrease is good */
  greendirection?: "up" | "down" | null;
  /** Pseudo-published timestamp for feed ordering */
  publishedAt: string;
}

/** Strip leading emoji/symbols from metric names for cleaner headlines */
function stripLeadingEmoji(text: string): string {
  return text
    .replace(/^[\u{1F000}-\u{1FFFF}\u{2600}-\u{27BF}\u{FE00}-\u{FE0F}\u{200D}\u{20E3}\u{E0020}-\u{E007F}]+\s*/gu, "")
    .trim();
}

/**
 * Generate a human-readable headline from metric comparison data.
 * Max 80 characters. Numbers are encouraged.
 */
function generateHeadline(
  metricName: string,
  pctChange: number,
  comparisonType: string
): string {
  const direction = pctChange > 0 ? "up" : "down";
  const absPct = Math.abs(Math.round(pctChange));

  let suffix: string;
  if (comparisonType === "ytd") {
    suffix = "year-to-date";
  } else if (comparisonType === "mtd") {
    suffix = "this month";
  } else if (comparisonType === "mtd_prior_year") {
    suffix = "vs. same month last year";
  } else {
    suffix = "recently";
  }

  const cleanName = stripLeadingEmoji(metricName);
  let headline = `${cleanName} ${direction} ${absPct}% ${suffix}`;

  if (headline.length > MAX_HEADLINE_LENGTH) {
    const suffixPart = ` ${direction} ${absPct}% ${suffix}`;
    const maxNameLen = MAX_HEADLINE_LENGTH - suffixPart.length - 1;
    if (maxNameLen > 10) {
      headline = `${cleanName.slice(0, maxNameLen)}… ${direction} ${absPct}% ${suffix}`;
    }
  }

  return headline;
}

/** Format relative time like "1 day ago", "3 hours ago" */
function formatRelativeTime(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay === 1) return "1 day ago";
  if (diffDay < 30) return `${diffDay} days ago`;
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

export default function MetricSummaryCard({ data }: { data: MetricCardData }) {
  const { metric, comparison, slug, cityName, cityEmoji, greendirection } = data;

  const curr = comparison.current_period_value;
  const prior = comparison.comparison_period_value;
  if (curr == null && prior == null) return null;

  const pctChange =
    curr != null && prior != null && prior !== 0
      ? ((curr - prior) / prior) * 100
      : null;

  // Determine if this trend is "good" based on greendirection
  const isGoodTrend =
    pctChange != null &&
    ((greendirection === "down" && pctChange < 0) ||
      (greendirection === "up" && pctChange > 0) ||
      (greendirection == null && pctChange < 0)); // default: decrease is good

  const headline =
    pctChange != null
      ? generateHeadline(metric.metric_name, pctChange, comparison.comparison_type)
      : `${stripLeadingEmoji(metric.metric_name)} year-to-date`;

  const href = `/c/${slug}/metrics/${metric.metric_key}`;
  const subline = formatRelativeTime(data.publishedAt);

  const changeColor = isGoodTrend
    ? "var(--success, #10b981)"
    : "var(--error, #ef4444)";

  const neighborhoodLabel = cityEmoji
    ? `${cityEmoji} ${cityName}`
    : cityName;

  return (
    <Link href={href} className={feedStyles.card} style={{ textDecoration: "none", color: "inherit" }}>
      {/* Reuse the same CardHeader as all other story cards */}
      <CardHeader
        typeIcon="📊"
        typeLabel="Data"
        actor={cityName}
        subline={subline}
        neighborhoodLabel={metric.category ?? ""}
      />

      <h2 className={feedStyles.cardHeadline}>{headline}</h2>

      {/* Metric hero */}
      <div className={styles.metricHero}>
        <div className={styles.metricValueGroup}>
          {curr != null && (
            <span className={styles.metricValue}>
              {formatMetricValue(curr)}
            </span>
          )}
          {pctChange != null && (
            <span className={styles.metricChange} style={{ color: changeColor }}>
              {pctChange > 0 ? "↑" : "↓"} {Math.abs(Math.round(pctChange))}%
            </span>
          )}
        </div>
        {prior != null && (
          <span className={styles.metricPrior}>
            vs. {formatMetricValue(prior)} last year
          </span>
        )}
      </div>

      {/* Footer link */}
      <div className={styles.metricFooter}>
        <span className={styles.metricLink}>
          View metric
          <svg
            width="14"
            height="14"
            viewBox="0 0 14 14"
            fill="none"
            aria-hidden="true"
            className={styles.metricArrow}
          >
            <path
              d="M5.25 3.5L8.75 7L5.25 10.5"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
      </div>
    </Link>
  );
}

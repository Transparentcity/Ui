"use client";

import type {
  PublicCityMetricItem,
  PublicMetricComparison,
} from "@/lib/publicApiClient";
import { formatMetricValue } from "@/lib/formatters";
import { getCategoryMeta } from "@/lib/feed/mockFeedData";
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
  /** Portal domain for source attribution (e.g. "data.sfgov.org") */
  portalDomain?: string;
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

/** Derive actor (department name) from metric category */
function deriveActorFromCategory(category: string | null | undefined): string {
  if (!category) return "City Hall";
  const cat = category.toLowerCase();
  if (cat.includes("safety") || cat.includes("crime") || cat.includes("police")) return "Police";
  if (cat.includes("fire")) return "Fire Dept";
  if (cat.includes("housing") || cat.includes("building")) return "Building Dept";
  if (cat.includes("transport") || cat.includes("transit")) return "Transit";
  if (cat.includes("spending") || cat.includes("budget") || cat.includes("finance")) return "Controller";
  if (cat.includes("quality of life") || cat.includes("public works") || cat.includes("infrastructure")) return "Public Works";
  if (cat.includes("health")) return "Public Health";
  if (cat.includes("education") || cat.includes("school")) return "Education";
  if (cat.includes("park") || cat.includes("recreation")) return "Parks & Rec";
  if (cat.includes("311") || cat.includes("service request")) return "311";
  if (cat.includes("business") || cat.includes("economic")) return "Business";
  if (cat.includes("justice") || cat.includes("attorney")) return "District Attorney";
  return category;
}

/**
 * Build the most informative source/context line we can from available data.
 *
 * Priority (highest to lowest):
 *  1. Portal domain  → "Source: data.sfgov.org"
 *  2. Date-range context from the comparison period → "Jan–Mar 2026 data"
 *  3. Subcategory (when it adds info beyond the category already in the header)
 *  4. null — show nothing rather than a generic "{category} data" that's
 *     redundant with the card header.
 */
export function buildSourceText(
  metric: PublicCityMetricItem,
  comparison: PublicMetricComparison,
  portalDomain?: string
): string | null {
  // Best: name the actual data source
  if (portalDomain) {
    return `Source: ${portalDomain}`;
  }

  // Next: show the data period so readers know how current it is
  const periodLabel = formatPeriodRange(
    comparison.current_period_start,
    comparison.current_period_end
  );
  if (periodLabel) {
    return periodLabel;
  }

  // Nothing useful to show — better to leave blank than show "safety data"
  return null;
}

/** Format a period range into a human-readable label like "Jan–Mar 2026" */
export function formatPeriodRange(
  start: string | null | undefined,
  end: string | null | undefined
): string | null {
  if (!start) return null;
  const s = parseDateUTC(start);
  if (!s) return null;

  const monthFmt = (d: Date) =>
    d.toLocaleDateString("en-US", { month: "short", timeZone: "UTC" });
  const year = s.getUTCFullYear();

  if (!end) {
    return `${monthFmt(s)} ${year} data`;
  }

  const e = parseDateUTC(end);
  if (!e) {
    return `${monthFmt(s)} ${year} data`;
  }

  const sMonth = s.getUTCMonth();
  const eMonth = e.getUTCMonth();
  const eYear = e.getUTCFullYear();

  // Same month
  if (sMonth === eMonth && year === eYear) {
    return `${monthFmt(s)} ${year} data`;
  }

  // Same year
  if (year === eYear) {
    return `${monthFmt(s)}–${monthFmt(e)} ${year} data`;
  }

  // Different years
  return `${monthFmt(s)} ${year}–${monthFmt(e)} ${eYear} data`;
}

/**
 * Parse a date string treating date-only strings (YYYY-MM-DD) as UTC.
 * Avoids the common pitfall where `new Date("2026-01-01")` is UTC midnight
 * but local-timezone methods show the previous day in western timezones.
 */
function parseDateUTC(dateStr: string): Date | null {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return null;
  return d;
}

export default function MetricSummaryCard({ data, children }: { data: MetricCardData; children?: React.ReactNode }) {
  const { metric, comparison, cityName, cityEmoji, greendirection, portalDomain } = data;

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

  const fallbackSuffix = comparison.comparison_type === "mtd"
    ? "this month"
    : comparison.comparison_type === "mtd_prior_year"
      ? "vs. same month last year"
      : "year-to-date";
  const headline =
    pctChange != null
      ? generateHeadline(metric.metric_name, pctChange, comparison.comparison_type)
      : `${stripLeadingEmoji(metric.metric_name)} ${fallbackSuffix}`;

  const subline = formatRelativeTime(data.publishedAt);

  const changeColor = isGoodTrend
    ? "var(--success, #10b981)"
    : "var(--error, #ef4444)";

  const actor = deriveActorFromCategory(metric.category);
  const catMeta = getCategoryMeta(actor);
  const neighborhoodLabel = cityEmoji
    ? `${cityEmoji} ${cityName}`
    : cityName;

  // Source attribution line — build the most informative description we can
  // from the data available, avoiding generic/redundant text like "safety data"
  const sourceText = buildSourceText(metric, comparison, portalDomain);

  return (
    <>
      <CardHeader
        typeIcon={catMeta.icon}
        typeLabel="Data"
        actor={catMeta.label}
        subline={subline}
        neighborhoodLabel={neighborhoodLabel}
        categoryColor={catMeta.color}
      />

      <h2 className={feedStyles.cardHeadline}>{headline}</h2>

      {/* Metric hero — tighten bottom margin when no source text follows */}
      <div
        className={styles.metricHero}
        style={sourceText ? undefined : { marginBottom: 0 }}
      >
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

      {/* Source attribution */}
      {sourceText && (
        <p className={feedStyles.cardDescription}>{sourceText}</p>
      )}

      {children}
    </>
  );
}

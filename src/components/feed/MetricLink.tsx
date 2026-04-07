"use client";

import Link from "next/link";
import styles from "./feed.module.css";

interface MetricLinkProps {
  /** Display text for the metric */
  label: string;
  /** Direction indicator: "up" | "down" | null */
  direction?: "up" | "down" | null;
  /** Metric key (URL slug) for the link target */
  metricKey?: string | null;
  /** City slug for building the metric detail URL */
  citySlug?: string | null;
  /** Optional district number for scoping the metric link */
  district?: number | null;
}

/**
 * Inline metric link rendered inside card descriptions and metric tiles.
 * Shows a branded purple underlined link with an optional directional arrow
 * that navigates to the metric detail page.
 *
 * When metricKey or citySlug is missing, renders as plain styled text (no link).
 */
export default function MetricLink({
  label,
  direction,
  metricKey,
  citySlug,
  district,
}: MetricLinkProps) {
  const arrow = direction === "up" ? "\u2197" : direction === "down" ? "\u2198" : null;

  const hasLink = metricKey && citySlug;

  const content = (
    <>
      {label}
      {arrow && <span className={styles.metricIndicator}>{arrow}</span>}
    </>
  );

  if (!hasLink) {
    return <span className={styles.metricLinkPlain}>{content}</span>;
  }

  const href =
    district && district > 0
      ? `/c/${citySlug}/metrics/${metricKey}?district=${district}`
      : `/c/${citySlug}/metrics/${metricKey}`;

  return (
    <Link
      href={href}
      className={styles.metricLink}
      onClick={(e) => e.stopPropagation()}
    >
      {content}
    </Link>
  );
}

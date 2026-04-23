"use client";

import Link from "next/link";
import {
  deriveAgency,
  normalizeCategory,
} from "@/lib/sourcing/agency-lookup";
import { derivePortal } from "@/lib/sourcing/portal-lookup";
import styles from "./SourceLine.module.css";

interface SourceLineProps {
  category: string;
  citySlug: string;
  metricSlug?: string;
  variant?: "card" | "byline";
}

export default function SourceLine({
  category,
  citySlug,
  metricSlug,
  variant = "card",
}: SourceLineProps) {
  const portal = citySlug ? derivePortal(citySlug) : null;
  const normalizedKey = normalizeCategory(category ?? "");
  const agency = normalizedKey ? deriveAgency(normalizedKey, citySlug) : null;

  if (!agency && !portal) {
    if (typeof window !== "undefined") {
      console.warn(
        `[SourceLine] missing mapping: ${category} / ${citySlug}`,
      );
    }
    return null;
  }

  const href =
    citySlug && metricSlug
      ? `/c/${citySlug}/metrics/${metricSlug}`
      : citySlug
        ? `/c/${citySlug}`
        : "#";

  const ariaLabel = agency
    ? `Source: ${agency} / ${portal}`
    : `Source: ${portal}`;

  const className = [styles.sourceLine, variant === "byline" ? "" : ""]
    .filter(Boolean)
    .join(" ");

  const handleClick = (e: React.MouseEvent) => {
    // Prevent parent card onClick/navigation so the source link resolves
    // to the source destination instead of the card's own canonical URL.
    e.stopPropagation();
  };

  return (
    <Link
      href={href}
      className={className}
      aria-label={ariaLabel}
      onClick={handleClick}
    >
      <span className={styles.glyph} aria-hidden="true">
        <svg
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
        >
          <path d="M3 4h10v9H3z" />
          <path d="M5 7h6M5 9h6M5 11h4" />
        </svg>
      </span>
      {agency && (
        <>
          <span className={styles.agency}>{agency}</span>
          <span className={styles.sep} aria-hidden="true">/</span>
        </>
      )}
      {portal && <span className={styles.portal}>{portal}</span>}
    </Link>
  );
}

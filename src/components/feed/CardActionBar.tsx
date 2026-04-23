"use client";

import { useCallback } from "react";
import { Share2 } from "lucide-react";
import SourceLine from "@/components/SourceLine";
import { slugify } from "@/lib/utils";
import type { EnrichedFeedStory } from "@/lib/feed/mockFeedData";
import styles from "./feed.module.css";

interface CardActionBarProps {
  onShare: () => void;
  onOverflow?: () => void;
  showOverflow?: boolean;
  story?: EnrichedFeedStory;
  /** Explicit source attribution (used when no enriched story is available, e.g. metric cards). */
  sourceCategory?: string;
  sourceCitySlug?: string;
  sourceMetricSlug?: string;
}

export default function CardActionBar({
  onShare,
  onOverflow,
  showOverflow = true,
  story,
  sourceCategory,
  sourceCitySlug,
  sourceMetricSlug,
}: CardActionBarProps) {
  const handleShare = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onShare();
    },
    [onShare],
  );

  const handleOverflow = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onOverflow?.();
    },
    [onOverflow],
  );

  const storyCitySlug = story?.city_name ? slugify(story.city_name) : "";
  const resolvedCitySlug = sourceCitySlug ?? storyCitySlug;
  const resolvedCategory = sourceCategory ?? story?.actor ?? "";
  const resolvedMetricSlug = sourceMetricSlug;

  return (
    <div className={styles.actionBar}>
      {resolvedCitySlug && resolvedCategory && (
        <SourceLine
          category={resolvedCategory}
          citySlug={resolvedCitySlug}
          metricSlug={resolvedMetricSlug}
        />
      )}

      <div className={styles.actionSpacer} />

      <button
        type="button"
        className={styles.actionBtn}
        onClick={handleShare}
        aria-label="Share"
      >
        <Share2 size={16} />
        <span className={styles.actionLabel}>Share</span>
      </button>

      {showOverflow && (
        <button
          type="button"
          className={styles.overflowBtn}
          onClick={handleOverflow}
          aria-label="More options"
        >
          &middot;&middot;&middot;
        </button>
      )}
    </div>
  );
}

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
}

export default function CardActionBar({
  onShare,
  onOverflow,
  showOverflow = true,
  story,
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

  const citySlug = story?.city_name ? slugify(story.city_name) : "";

  return (
    <div className={styles.actionBar}>
      {story && citySlug && (
        <SourceLine category={story.actor ?? ""} citySlug={citySlug} />
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

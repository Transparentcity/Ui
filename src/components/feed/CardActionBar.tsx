"use client";

import { useCallback } from "react";
import { Share2 } from "lucide-react";
import styles from "./feed.module.css";

interface CardActionBarProps {
  onShare: () => void;
  onOverflow?: () => void;
  showOverflow?: boolean;
}

export default function CardActionBar({
  onShare,
  onOverflow,
  showOverflow = true,
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

  return (
    <div className={styles.actionBar}>
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
        <>
          <div className={styles.actionSpacer} />

          <button
            type="button"
            className={styles.overflowBtn}
            onClick={handleOverflow}
            aria-label="More options"
          >
            &middot;&middot;&middot;
          </button>
        </>
      )}
    </div>
  );
}

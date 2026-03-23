"use client";

import { useCallback } from "react";
import styles from "./feed.module.css";

interface CompactCardActionBarProps {
  onOverflow: () => void;
}

/**
 * Minimal action bar for compact cards: only the overflow (···) button.
 * Full actions (applaud, escalate, share) are available via the overflow menu.
 */
export default function CompactCardActionBar({
  onOverflow,
}: CompactCardActionBarProps) {
  const handleOverflow = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onOverflow();
    },
    [onOverflow],
  );

  return (
    <div className={`${styles.actionBar} ${styles.actionBarCompact}`}>
      <div className={styles.actionSpacer} />
      <button
        type="button"
        className={styles.overflowBtn}
        onClick={handleOverflow}
        aria-label="More options"
      >
        &middot;&middot;&middot;
      </button>
    </div>
  );
}

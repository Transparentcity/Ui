"use client";

import { useState, useCallback } from "react";
import { Share2 } from "lucide-react";
import styles from "./feed.module.css";

interface CardActionBarProps {
  applaudCount: number;
  escalateCount: number;
  investigateCount?: number;
  isOfficial?: boolean;
  onApplaud: () => void;
  onEscalate: () => void;
  onInvestigate?: () => void;
  onShare: () => void;
  onOverflow: () => void;
}

export default function CardActionBar({
  applaudCount,
  escalateCount,
  investigateCount = 0,
  isOfficial,
  onApplaud,
  onEscalate,
  onInvestigate,
  onShare,
  onOverflow,
}: CardActionBarProps) {
  const [applauded, setApplauded] = useState(false);
  const [investigated, setInvestigated] = useState(false);

  const handleApplaud = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (applauded) return;
      setApplauded(true);
      onApplaud();
    },
    [onApplaud, applauded],
  );

  const handleEscalate = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onEscalate();
    },
    [onEscalate],
  );

  const handleInvestigate = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (investigated) return;
      setInvestigated(true);
      onInvestigate?.();
    },
    [onInvestigate, investigated],
  );

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
      onOverflow();
    },
    [onOverflow],
  );

  return (
    <div className={styles.actionBar}>
      <button
        type="button"
        className={`${styles.actionBtn} ${applauded ? styles.actionBtnActive : ""}`}
        onClick={handleApplaud}
        aria-label="Applaud"
      >
        <span>{"\u{1F44F}"}</span>
        <span className={styles.actionLabel}>Applaud</span>
        <span>{applaudCount + (applauded ? 1 : 0)}</span>
      </button>

      {isOfficial ? (
        <button
          type="button"
          className={`${styles.actionBtn} ${investigated ? styles.actionBtnActive : ""}`}
          onClick={handleInvestigate}
          aria-label="Investigate"
        >
          <span>{"\uD83D\uDD0D"}</span>
          <span className={styles.actionLabel}>Investigate</span>
          <span>{investigateCount + (investigated ? 1 : 0)}</span>
        </button>
      ) : (
        <button
          type="button"
          className={styles.actionBtn}
          onClick={handleEscalate}
          aria-label="Flag"
        >
          <span>{"\u{1F6A9}"}</span>
          <span className={styles.actionLabel}>Flag</span>
          <span>{escalateCount}</span>
        </button>
      )}

      <button
        type="button"
        className={styles.actionBtn}
        onClick={handleShare}
        aria-label="Share"
      >
        <Share2 size={16} />
        <span className={styles.actionLabel}>Share</span>
      </button>

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

"use client";

import { useState, useCallback, useEffect } from "react";
import { Share2 } from "lucide-react";
import styles from "./feed.module.css";

const TOOLTIPS_KEY = "feed-action-tooltips-seen";

const TOOLTIP_TEXT: Record<string, string> = {
  applaud:
    "Applaud sends recognition to the responsible department — let them know what\u2019s working.",
  escalate:
    "Flag this story to send it to your elected officials for review.",
  investigate:
    "Add this to your Research Queue to follow up on later.",
};

interface CardActionBarProps {
  applaudCount: number;
  escalateCount: number;
  investigateCount?: number;
  isOfficial?: boolean;
  /** Show inline tooltips explaining each action (first card only). */
  showTooltips?: boolean;
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
  showTooltips = false,
  onApplaud,
  onEscalate,
  onInvestigate,
  onShare,
  onOverflow,
}: CardActionBarProps) {
  const [applauded, setApplauded] = useState(false);
  const [investigated, setInvestigated] = useState(false);
  const [tooltipsVisible, setTooltipsVisible] = useState(false);

  useEffect(() => {
    if (!showTooltips) return;
    try {
      if (!localStorage.getItem(TOOLTIPS_KEY)) {
        setTooltipsVisible(true);
      }
    } catch {
      // localStorage unavailable
    }
  }, [showTooltips]);

  const dismissTooltips = useCallback(() => {
    setTooltipsVisible(false);
    try {
      localStorage.setItem(TOOLTIPS_KEY, "1");
    } catch {
      // ignore
    }
  }, []);

  const handleApplaud = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (applauded) return;
      setApplauded(true);
      dismissTooltips();
      onApplaud();
    },
    [onApplaud, applauded, dismissTooltips],
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
      <div className={styles.actionBtnWrap}>
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
        {tooltipsVisible && (
          <span className={styles.actionTooltip}>{TOOLTIP_TEXT.applaud}</span>
        )}
      </div>

      {isOfficial ? (
        <div className={styles.actionBtnWrap}>
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
          {tooltipsVisible && (
            <span className={styles.actionTooltip}>{TOOLTIP_TEXT.investigate}</span>
          )}
        </div>
      ) : (
        <div className={styles.actionBtnWrap}>
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
          {tooltipsVisible && (
            <span className={styles.actionTooltip}>{TOOLTIP_TEXT.escalate}</span>
          )}
        </div>
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

"use client";

import { useState, useEffect, useCallback } from "react";
import styles from "./feed.module.css";

interface TooltipStep {
  id: string;
  target: string; // CSS selector or description
  title: string;
  body: string;
  position?: "above" | "below";
}

const FEED_TOOLTIP_STEPS: TooltipStep[] = [
  {
    id: "applaud",
    target: "[aria-label='Applaud']",
    title: "Applaud great work",
    body: "Tap the clap button to recognize departments doing a good job. Officials can send a thank-you email directly.",
  },
  {
    id: "escalate",
    target: "[aria-label='Flag']",
    title: "Flag for attention",
    body: "See something concerning? Flag it to let your representatives know. You can add a comment explaining why.",
  },
  {
    id: "overflow",
    target: "[aria-label='More options']",
    title: "More actions",
    body: "Share stories, hide ones you're not interested in, or take other actions from this menu.",
  },
];

const TOOLTIP_STORAGE_KEY = "tc_feed_tooltips_seen";

function getSeenTooltips(): Set<string> {
  try {
    const stored = window.localStorage?.getItem(TOOLTIP_STORAGE_KEY);
    return stored ? new Set(JSON.parse(stored)) : new Set();
  } catch {
    return new Set();
  }
}

function markTooltipSeen(id: string) {
  try {
    const seen = getSeenTooltips();
    seen.add(id);
    window.localStorage?.setItem(TOOLTIP_STORAGE_KEY, JSON.stringify([...seen]));
  } catch {
    // Ignore storage errors
  }
}

interface FeedTooltipProps {
  /** Whether the user just completed onboarding (show tooltips) */
  isFirstSession: boolean;
}

/**
 * Inline tooltip system for first-session action education.
 * Shows a sequence of tooltips pointing to Applaud, Escalate, and Overflow
 * buttons on the first card the user sees after onboarding.
 */
export default function FeedTooltip({ isFirstSession }: FeedTooltipProps) {
  const [currentStep, setCurrentStep] = useState<number>(-1);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!isFirstSession || dismissed) return;

    const seen = getSeenTooltips();
    // Find the first unseen step
    const nextIdx = FEED_TOOLTIP_STEPS.findIndex((s) => !seen.has(s.id));
    if (nextIdx === -1) {
      setDismissed(true);
      return;
    }
    setCurrentStep(nextIdx);
  }, [isFirstSession, dismissed]);

  const handleNext = useCallback(() => {
    if (currentStep >= 0 && currentStep < FEED_TOOLTIP_STEPS.length) {
      markTooltipSeen(FEED_TOOLTIP_STEPS[currentStep].id);
    }
    const next = currentStep + 1;
    if (next >= FEED_TOOLTIP_STEPS.length) {
      setDismissed(true);
    } else {
      setCurrentStep(next);
    }
  }, [currentStep]);

  const handleDismissAll = useCallback(() => {
    FEED_TOOLTIP_STEPS.forEach((s) => markTooltipSeen(s.id));
    setDismissed(true);
  }, []);

  if (dismissed || currentStep < 0 || currentStep >= FEED_TOOLTIP_STEPS.length) {
    return null;
  }

  const step = FEED_TOOLTIP_STEPS[currentStep];
  const isLast = currentStep === FEED_TOOLTIP_STEPS.length - 1;

  return (
    <div className={styles.tooltipOverlay}>
      <div className={styles.tooltipCard}>
        <div className={styles.tooltipTitle}>{step.title}</div>
        <p className={styles.tooltipBody}>{step.body}</p>
        <div className={styles.tooltipActions}>
          <button className={styles.tooltipSkip} onClick={handleDismissAll}>
            Skip all
          </button>
          <button className={styles.tooltipNext} onClick={handleNext}>
            {isLast ? "Got it" : "Next"}
          </button>
        </div>
        <div className={styles.tooltipDots}>
          {FEED_TOOLTIP_STEPS.map((_, i) => (
            <span
              key={i}
              className={`${styles.tooltipDot} ${i === currentStep ? styles.tooltipDotActive : ""}`}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

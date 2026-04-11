"use client";

import { useState, useEffect, useRef } from "react";
import { usePlaceOnboarding } from "@/contexts/PlaceOnboardingContext";
import BrandedLoader from "@/components/BrandedLoader";
import styles from "./OnboardingBanner.module.css";

/**
 * Inline feed banner showing progressive onboarding status.
 * Appears between the filter chips and the first story card
 * while the backend generates neighborhood-specific content.
 */
export default function OnboardingBanner() {
  const { status, message, dismissed, dismiss } = usePlaceOnboarding();
  const [animatingOut, setAnimatingOut] = useState(false);
  const dismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current);
    };
  }, []);

  // When dismissed flips to true externally (auto-dismiss from context),
  // trigger the collapse animation
  useEffect(() => {
    if (dismissed && !animatingOut) {
      setAnimatingOut(true);
    }
  }, [dismissed, animatingOut]);

  // Nothing to show
  if (status === "idle") return null;
  // Already dismissed and animation is done (or was dismissed before mount)
  if (dismissed && !animatingOut) return null;

  const isComplete = status === "completed";
  const isFailed = status === "failed";

  const handleDismiss = () => {
    if (animatingOut) return; // already dismissing
    setAnimatingOut(true);
    // Let CSS animation play, then actually dismiss in context
    dismissTimerRef.current = setTimeout(() => {
      dismissTimerRef.current = null;
      dismiss();
    }, 300);
  };

  const bannerClass = [
    styles.banner,
    isComplete && styles.bannerComplete,
    isFailed && styles.bannerFailed,
    animatingOut && styles.bannerDismissing,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={bannerClass} role="status" aria-live="polite">
      <span className={styles.loaderWrap}>
        {isComplete ? (
          <svg
            className={styles.checkmark}
            viewBox="0 0 20 20"
            fill="currentColor"
            aria-hidden="true"
          >
            <path
              fillRule="evenodd"
              d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
              clipRule="evenodd"
            />
          </svg>
        ) : (
          <BrandedLoader size="sm" color="brand" ariaHidden />
        )}
      </span>

      <span className={styles.message}>{message}</span>

      <button
        type="button"
        className={styles.dismissBtn}
        onClick={handleDismiss}
        aria-label="Dismiss"
      >
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
          <path
            d="M1 1l12 12M13 1L1 13"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </svg>
      </button>
    </div>
  );
}

"use client";

/**
 * InboxBillboard — the top-of-inbox welcome card shown after onboarding.
 *
 * While the place-level data job runs, shows feed-building status plus context
 * that prior newsletters appear below. Auto-dismisses when the job completes.
 */

import { useEffect, useState } from "react";
import { usePlaceOnboarding } from "@/contexts/PlaceOnboardingContext";
import Loader from "./Loader";
import styles from "./Inbox.module.css";

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function SparkleIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 2L9.5 9.5 2 12l7.5 2.5L12 22l2.5-7.5L22 12l-7.5-2.5z" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Props & component
// ---------------------------------------------------------------------------

interface InboxBillboardProps {
  /** The user's saved place name, when they signed up at place level. */
  placeName?: string | null;
  /**
   * Pass true when the caller knows a job was just started (e.g. right after
   * onboarding). This avoids relying on the context having already updated —
   * due to React batching, status can still be "idle" on the first render even
   * though startJob was called moments earlier. The spinner stays on until the
   * context explicitly reports "completed" or "failed".
   */
  defaultRunning?: boolean;
  /** Called when the user clicks "View your place dashboard" after the job completes. */
  onViewPlace?: () => void;
}

export default function InboxBillboard({ defaultRunning, onViewPlace }: InboxBillboardProps) {
  const { status } = usePlaceOnboarding();
  const [visible, setVisible] = useState(true);

  // Auto-dismiss after the job completes — longer when there's a CTA link to click.
  useEffect(() => {
    if (status === "completed" || status === "failed") {
      const delay = onViewPlace ? 30_000 : 8_000;
      const timer = setTimeout(() => setVisible(false), delay);
      return () => clearTimeout(timer);
    }
  }, [status, onViewPlace]);

  if (!visible) return null;

  // Context scanning state, OR defaultRunning=true before we've seen a terminal status.
  const isRunning =
    status === "scanning" ||
    status === "found_rep" ||
    (defaultRunning === true && status !== "completed" && status !== "failed");

  return (
    <div className={styles.billboard} role="status" aria-live="polite">
      {isRunning ? (
        <Loader size="sm" color="purple" className={styles.billboardLoader} />
      ) : (
        <SparkleIcon className={styles.billboardIcon} />
      )}
      <div className={styles.billboardBody}>
        {isRunning ? (
          <>
            <p className={styles.billboardTitle}>
              Building your My Place dashboard
            </p>
            <p className={styles.billboardText}>
              Pulling public data for My Place. Prior newsletters below.
              New edition every Sunday.
            </p>
          </>
        ) : (
          <>
            <p className={styles.billboardTitle}>Your My Place dashboard is ready</p>
            <p className={styles.billboardText}>
              We&rsquo;ve finished building your My Place dashboard.
              {onViewPlace && (
                <>
                  {" "}
                  <button
                    type="button"
                    className={styles.billboardLink}
                    onClick={onViewPlace}
                  >
                    View your place dashboard →
                  </button>
                </>
              )}
            </p>
          </>
        )}
      </div>
    </div>
  );
}

"use client";

import { useState, useMemo } from "react";
import { useAuth0 } from "@auth0/auth0-react";
import Link from "next/link";
import MetricOrderEditor from "./MetricOrderEditor";
import { useCityMetricsForCustomize } from "@/lib/hooks/useCityAdmin";
import styles from "./UserMetricOrderDialog.module.css";

export interface UserMetricOrderDialogMetric {
  id: number;
  metric_name: string;
  category?: string;
  subcategory?: string | null;
  sub_category?: string | null;
  show_on_dash?: boolean;
}

interface UserMetricOrderDialogProps {
  cityId: number;
  cityName?: string;
  metrics: UserMetricOrderDialogMetric[];
  open: boolean;
  onClose: () => void;
  onOrderChange?: () => void;
}

export default function UserMetricOrderDialog({
  cityId,
  cityName,
  metrics,
  open,
  onClose,
  onOrderChange,
}: UserMetricOrderDialogProps) {
  const { isAuthenticated } = useAuth0();
  const [showSignupPrompt, setShowSignupPrompt] = useState(false);
  const { data: allMetricsForCustomize, isLoading: loadingAllMetrics } = useCityMetricsForCustomize(
    open && isAuthenticated ? cityId : null
  );

  const editorMetrics = useMemo(() => {
    if (isAuthenticated && allMetricsForCustomize?.length) {
      return allMetricsForCustomize.map((m) => ({
        id: m.id,
        metric_name: m.metric_name,
        category: m.category,
        subcategory: m.subcategory ?? null,
        sub_category: m.subcategory ?? null,
        show_on_dash: m.show_on_dash,
      }));
    }
    return metrics.map((m) => ({
      ...m,
      show_on_dash: m.show_on_dash !== false,
    }));
  }, [isAuthenticated, allMetricsForCustomize, metrics]);

  const handleSaveWhenSignedOut = () => {
    setShowSignupPrompt(true);
  };

  if (!open) return null;

  return (
    <>
      <div
        className={styles.backdrop}
        onClick={onClose}
        role="presentation"
        aria-hidden="true"
      />
      <div className={styles.dialog} role="dialog" aria-modal="true" aria-labelledby="user-metric-order-title">
        <div className={styles.header}>
          <h2 id="user-metric-order-title" className={styles.title}>
            Reorder categories and metrics
          </h2>
          <button
            type="button"
            className={styles.closeBtn}
            onClick={onClose}
            aria-label="Close"
          >
            ×
          </button>
        </div>
        <div className={styles.body}>
          <p className={styles.subtitle}>
            {cityName ? `Customize how metrics appear for ${cityName}.` : "Customize how metrics appear on your dashboard."}
            {!isAuthenticated && (
              <span className={styles.signInHint}> Sign in or sign up to save your preferences.</span>
            )}
          </p>
          {loadingAllMetrics && isAuthenticated ? (
            <p className={styles.subtitle}>Loading metrics…</p>
          ) : (
            <MetricOrderEditor
              cityId={cityId}
              metrics={editorMetrics}
              onOrderChange={onOrderChange}
              variant="user"
              isAuthenticated={isAuthenticated}
              onSaveWhenSignedOut={handleSaveWhenSignedOut}
              defaultExpanded
            />
          )}
        </div>
      </div>

      {showSignupPrompt && (
        <>
          <div
            className={styles.backdrop}
            onClick={() => setShowSignupPrompt(false)}
            role="presentation"
            aria-hidden="true"
          />
          <div className={styles.signupModal} role="dialog" aria-modal="true" aria-labelledby="signup-prompt-title">
            <h3 id="signup-prompt-title" className={styles.signupTitle}>
              Sign up to save your preferences
            </h3>
            <p className={styles.signupText}>
              Your metric order has been saved on this device. Sign up or sign in to save it to your account and use it on any device.
            </p>
            <div className={styles.signupActions}>
              <Link
                href="/"
                className={styles.signupPrimary}
                onClick={() => setShowSignupPrompt(false)}
              >
                Sign up / Sign in
              </Link>
              <button
                type="button"
                className={styles.signupSecondary}
                onClick={() => setShowSignupPrompt(false)}
              >
                Maybe later
              </button>
            </div>
          </div>
        </>
      )}
    </>
  );
}

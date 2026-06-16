"use client";

import styles from "./feed.module.css";

export function FeedLoadingSkeleton({ label = "Loading" }: { label?: string }) {
  return (
    <div className={styles.emptyState} role="status" aria-live="polite">
      <div className={styles.emptyTitle}>{label}…</div>
      <p className={styles.emptyBody}>Fetching live findings from the analyzer.</p>
    </div>
  );
}

export function FeedErrorState({
  error,
  onRetry,
}: {
  error: unknown;
  onRetry?: () => void;
}) {
  const message =
    error instanceof Error ? error.message : "Something went wrong loading findings.";
  return (
    <div className={styles.emptyState} role="alert">
      <div className={styles.emptyTitle}>Couldn&apos;t load this view.</div>
      <p className={styles.emptyBody}>{message}</p>
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          style={{
            marginTop: 12,
            padding: "6px 12px",
            border: "1px solid currentColor",
            borderRadius: 4,
            background: "transparent",
            cursor: "pointer",
          }}
        >
          Retry
        </button>
      ) : null}
    </div>
  );
}

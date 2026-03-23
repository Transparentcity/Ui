"use client";

import styles from "./feed.module.css";

function getRelativeTime(date: Date): string {
  const diffMs = Date.now() - date.getTime();
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

interface FeedEndStateProps {
  lastUpdated?: Date;
}

export default function FeedEndState({ lastUpdated }: FeedEndStateProps) {
  return (
    <div className={styles.endState}>
      <div className={styles.endStateDivider} />
      <p className={styles.endStateText}>You&apos;re all caught up</p>
      {lastUpdated && (
        <p className={styles.endStateTime}>Last updated {getRelativeTime(lastUpdated)}</p>
      )}
    </div>
  );
}

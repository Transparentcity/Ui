"use client";

import styles from "./feed.module.css";

export default function SkeletonCard() {
  return (
    <div className={styles.skeleton} aria-hidden>
      <div className={styles.skeletonHeader} />
      <div className={styles.skeletonHeadline1} />
      <div className={styles.skeletonHeadline2} />
      <div className={styles.skeletonSubline} />
      <div className={styles.skeletonActionBar}>
        <div className={styles.skeletonAction} />
        <div className={styles.skeletonAction} />
      </div>
    </div>
  );
}

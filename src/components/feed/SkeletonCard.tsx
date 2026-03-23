"use client";

import styles from "./feed.module.css";

type SkeletonVariant = "default" | "photo" | "metric" | "spending" | "otc" | "alert";

interface SkeletonCardProps {
  variant?: SkeletonVariant;
}

function DefaultSkeleton() {
  return (
    <>
      <div className={styles.skeletonHeader} />
      <div className={styles.skeletonHeadline1} />
      <div className={styles.skeletonHeadline2} />
      <div className={styles.skeletonSubline} />
    </>
  );
}

function PhotoSkeleton() {
  return (
    <>
      <div className={styles.skeletonPhoto} />
      <div className={styles.skeletonHeader} />
      <div className={styles.skeletonHeadline1} />
      <div className={styles.skeletonSubline} />
    </>
  );
}

function MetricSkeleton() {
  return (
    <>
      <div className={styles.skeletonHeader} />
      <div className={styles.skeletonHeadline1} />
      <div className={styles.skeletonMetricGrid}>
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className={styles.skeletonMetricTile}>
            <div className={styles.skeletonMetricNumber} />
            <div className={styles.skeletonMetricLabel} />
          </div>
        ))}
      </div>
    </>
  );
}

function SpendingSkeleton() {
  return (
    <>
      <div className={styles.skeletonHeader} />
      <div className={styles.skeletonHeadline1} />
      <div className={styles.skeletonSpendingAmount} />
      <div className={styles.skeletonBar} />
      <div className={styles.skeletonBar} />
      <div className={styles.skeletonSubline} />
    </>
  );
}

function OtcSkeleton() {
  return (
    <>
      <div className={styles.skeletonHeader} />
      <div className={styles.skeletonOtcStat} />
      <div className={styles.skeletonOtcLabel} />
      <div className={styles.skeletonSubline} />
    </>
  );
}

function AlertSkeleton() {
  return (
    <div className={styles.skeletonAlert}>
      <div className={styles.skeletonHeader} />
      <div className={styles.skeletonHeadline1} />
      <div className={styles.skeletonMetricHero} />
      <div className={styles.skeletonSparkline} />
      <div className={styles.skeletonSubline} />
    </div>
  );
}

const VARIANT_MAP: Record<SkeletonVariant, React.FC> = {
  default: DefaultSkeleton,
  photo: PhotoSkeleton,
  metric: MetricSkeleton,
  spending: SpendingSkeleton,
  otc: OtcSkeleton,
  alert: AlertSkeleton,
};

export default function SkeletonCard({ variant = "default" }: SkeletonCardProps) {
  const Inner = VARIANT_MAP[variant];
  return (
    <div className={styles.skeleton} aria-hidden>
      <Inner />
      <div className={styles.skeletonActionBar}>
        <div className={styles.skeletonAction} />
        <div className={styles.skeletonAction} />
      </div>
    </div>
  );
}

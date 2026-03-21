"use client";

import styles from "./ImpersonationBanner.module.css";

interface ImpersonationBannerProps {
  email: string;
  onStop: () => void;
}

export default function ImpersonationBanner({
  email,
  onStop,
}: ImpersonationBannerProps) {
  return (
    <div className={styles.banner} role="status" aria-live="polite">
      <div className={styles.content}>
        <span className={styles.label}>Proxying as</span>
        <strong className={styles.email}>{email}</strong>
      </div>
      <button type="button" className={styles.stopButton} onClick={onStop}>
        End proxy
      </button>
    </div>
  );
}

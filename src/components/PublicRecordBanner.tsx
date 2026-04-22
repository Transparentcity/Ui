import styles from "./PublicRecordBanner.module.css";

export default function PublicRecordBanner() {
  return (
    <div className={styles.banner} role="note" aria-label="Public Record">
      <div className={styles.seal} aria-hidden="true">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
        >
          <path d="M5 4h14v16H5z" />
          <path d="M8 8h8M8 12h8M8 16h5" />
        </svg>
      </div>
      <div className={styles.text}>
        <div className={styles.label}>Public Record</div>
        <p className={styles.body}>
          Every story below comes from <em>public city data.</em> Source
          agency listed on each item.
        </p>
      </div>
    </div>
  );
}

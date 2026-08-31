import styles from "./primitives.module.css";

type Props = {
  value: number; // 0..1
};

function bandFor(value: number) {
  if (value >= 0.85) return { fill: "#dc2626", label: "#dc2626" };
  if (value >= 0.7) return { fill: "#d97706", label: "#d97706" };
  return { fill: "var(--text-muted)", label: "var(--text-muted)" };
}

export function ConfidenceBar({ value }: Props) {
  const pct = Math.round(Math.max(0, Math.min(1, value)) * 100);
  const { fill, label } = bandFor(value);
  return (
    <div className={styles.confidenceWrap}>
      <div className={styles.confidenceBarTrack}>
        <div className={styles.confidenceBarFill} style={{ width: `${pct}%`, background: fill }} />
      </div>
      <span className={styles.confidenceLabel} style={{ color: label }}>{pct}%</span>
    </div>
  );
}

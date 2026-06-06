import { Badge } from "@/components/ui/badge";
import styles from "./primitives.module.css";

export type SeverityLevel = "high" | "med" | "low";

const dotClass: Record<SeverityLevel, string> = {
  high: styles.sevDotHigh,
  med: styles.sevDotMed,
  low: styles.sevDotLow,
};

const chipTint: Record<SeverityLevel, string> = {
  high: "bg-red-50 text-red-700 border-red-200",
  med: "bg-amber-50 text-amber-700 border-amber-200",
  low: "bg-gray-100 text-gray-600 border-gray-200",
};

const chipLabel: Record<SeverityLevel, string> = {
  high: "High",
  med: "Medium",
  low: "Low",
};

const fillClass: Record<SeverityLevel, string> = {
  high: styles.sevBarFillHigh,
  med: styles.sevBarFillMed,
  low: styles.sevBarFillLow,
};

export function SeverityDot({ level }: { level: SeverityLevel }) {
  return <span className={`${styles.sevDot} ${dotClass[level]}`} />;
}

export function SeverityChip({ level }: { level: SeverityLevel }) {
  return (
    <Badge variant="outline" className={`px-2 py-0.5 ${chipTint[level]}`}>
      {chipLabel[level]}
    </Badge>
  );
}

export function SeverityBar({ level, value }: { level: SeverityLevel; value: number }) {
  const pct = Math.max(0, Math.min(1, value)) * 100;
  return (
    <div className={styles.sevBarTrack}>
      <div className={`${styles.sevBarFill} ${fillClass[level]}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

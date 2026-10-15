import React from "react";
import type { MandatePeriodStatus } from "@/lib/publicApiClient";
import styles from "./Mandates.module.css";

const STATUS_CLASS: Record<string, string> = {
  met: styles.sparkMet,
  missed: styles.sparkMissed,
  tracked: styles.sparkTracked,
  no_data: styles.sparkNoData,
};

/**
 * Small inline SVG of the last 24 periods: a line through the values, one dot
 * per period colored by status, and a dashed line at the target.
 */
export default function MandateSparkline({
  periods,
  target,
  width = 160,
  height = 36,
  label,
}: {
  periods: MandatePeriodStatus[];
  target?: number | null;
  width?: number;
  height?: number;
  label?: string;
}) {
  const pts = periods.slice(-24);
  const values = pts
    .map((p) => p.value)
    .filter((v): v is number => v != null && Number.isFinite(v));
  if (values.length === 0) {
    return <span className={styles.sparkEmpty}>No data</span>;
  }
  const domain = target != null ? [...values, target] : values;
  let lo = Math.min(...domain);
  let hi = Math.max(...domain);
  if (hi === lo) {
    hi += 1;
    lo -= 1;
  }
  const pad = 4;
  const n = pts.length;
  const x = (i: number) => (n === 1 ? width / 2 : pad + (i * (width - pad * 2)) / (n - 1));
  const y = (v: number) => pad + (1 - (v - lo) / (hi - lo)) * (height - pad * 2);

  // Break the line at missing periods so gaps stay visible.
  const segments: string[] = [];
  let current = "";
  pts.forEach((p, i) => {
    if (p.value == null) {
      if (current) segments.push(current);
      current = "";
      return;
    }
    current += `${current ? "L" : "M"}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`;
  });
  if (current) segments.push(current);

  return (
    <svg
      className={styles.sparkline}
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={label ?? `Last ${n} periods`}
    >
      {target != null && (
        <line
          className={styles.sparkTarget}
          x1={0}
          x2={width}
          y1={y(target)}
          y2={y(target)}
        />
      )}
      {segments.map((d, i) => (
        <path key={i} d={d} className={styles.sparkLine} />
      ))}
      {pts.map((p, i) =>
        p.value == null ? null : (
          <circle
            key={p.period}
            cx={x(i)}
            cy={y(p.value)}
            r={2}
            className={STATUS_CLASS[p.status] ?? styles.sparkNoData}
            data-status={p.status}
          />
        )
      )}
    </svg>
  );
}

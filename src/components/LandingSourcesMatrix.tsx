"use client";

import type { ProductAnalyticsLandingMatrix } from "@/lib/apiClient";
import styles from "./LandingSourcesMatrix.module.css";

function fmt(n: number): string {
  return n.toLocaleString();
}

interface LandingSourcesMatrixProps {
  matrix: ProductAnalyticsLandingMatrix;
}

export default function LandingSourcesMatrix({ matrix }: LandingSourcesMatrixProps) {
  const granLabel =
    matrix.granularity === "day"
      ? "daily"
      : matrix.granularity === "week"
        ? "weekly"
        : "monthly";

  if (!matrix.rows.length) {
    return (
      <p className={styles.empty}>No landing events in this period.</p>
    );
  }

  return (
    <div className={styles.wrap}>
      <p className={styles.caption}>
        Landings by source ({granLabel} columns for selected date range).
      </p>
      <div className={styles.scroll}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th className={styles.thSource}>Source</th>
              <th className={styles.thTotal}>Total</th>
              {matrix.period_labels.map((label) => (
                <th key={label} className={styles.thPeriod}>
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {matrix.rows.map((row) => (
              <tr key={row.source}>
                <td className={styles.tdSource}>{row.source}</td>
                <td className={styles.tdTotal}>{fmt(row.total)}</td>
                {row.counts.map((c, i) => (
                  <td key={`${row.source}-${i}`} className={styles.tdCount}>
                    {c > 0 ? fmt(c) : "—"}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

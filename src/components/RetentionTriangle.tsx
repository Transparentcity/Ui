"use client";

import type { ProductAnalyticsRetentionMatrix } from "@/lib/apiClient";
import styles from "./RetentionTriangle.module.css";

function pct(rate: number | null | undefined): string {
  if (rate == null || !isFinite(rate)) return "—";
  return `${(rate * 100).toFixed(0)}%`;
}

function cellOpacity(rate: number | null | undefined): number {
  if (rate == null || !isFinite(rate)) return 0;
  return 0.12 + rate * 0.88;
}

function formatCohortWeek(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

interface RetentionTriangleProps {
  matrix: ProductAnalyticsRetentionMatrix;
}

export default function RetentionTriangle({ matrix }: RetentionTriangleProps) {
  const { period_labels, cohorts } = matrix;

  if (!cohorts.length) {
    return (
      <p className={styles.empty}>
        Not enough logged-in activity yet to build cohort retention. Visit while
        signed in with the API running to populate <code>product_events</code>.
      </p>
    );
  }

  return (
    <div className={styles.wrap}>
      <p className={styles.caption}>
        Weekly cohorts by first logged-in activity. Each cell is the share of that
        cohort active again in week N (week 0 = cohort week).
      </p>
      <div className={styles.scroll}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th className={styles.thCohort}>Cohort week</th>
              <th className={styles.thSize}>Users</th>
              {period_labels.map((label) => (
                <th key={label} className={styles.thPeriod}>
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {cohorts.map((row) => (
              <tr key={row.cohort_week}>
                <td className={styles.tdCohort}>{formatCohortWeek(row.cohort_week)}</td>
                <td className={styles.tdSize}>{row.cohort_size.toLocaleString()}</td>
                {row.rates.map((rate, i) => {
                  const count = row.counts?.[i] ?? null;
                  return (
                    <td
                      key={`${row.cohort_week}-${i}`}
                      className={styles.tdCell}
                      style={
                        rate != null
                          ? {
                              background: `color-mix(in srgb, var(--brand-primary) ${cellOpacity(rate) * 100}%, transparent)`,
                            }
                          : undefined
                      }
                      title={
                        rate != null && count != null
                          ? `${count} users (${pct(rate)} of cohort)`
                          : "Period not started"
                      }
                    >
                      {rate != null && count != null ? (
                        <>
                          <span className={styles.cellCount}>{count}</span>
                          <span className={styles.cellPct}>{pct(rate)}</span>
                        </>
                      ) : (
                        "—"
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

"use client";

import type { ProductAnalyticsRetentionLagTable } from "@/lib/apiClient";
import styles from "./RetentionLagTable.module.css";

function pct(rate: number | null | undefined): string {
  if (rate == null || !isFinite(rate)) return "—";
  return `${(rate * 100).toFixed(0)}%`;
}

function shortDate(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

interface RetentionLagTableProps {
  table: ProductAnalyticsRetentionLagTable;
}

export default function RetentionLagTable({ table }: RetentionLagTableProps) {
  if (!table.rows.length) {
    return (
      <p className={styles.empty}>Not enough activity in the last 7 days.</p>
    );
  }

  return (
    <div className={styles.wrap}>
      <p className={styles.caption}>
        Last 7 days through {table.date_to}. Lk/7 = users active that day who were
        also active k days earlier (count and % of that day&apos;s actives).
      </p>
      <div className={styles.scroll}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th className={styles.thDay}>Day</th>
              <th className={styles.thActive}>Active</th>
              {Array.from({ length: 7 }, (_, i) => (
                <th key={i} className={styles.thLag}>
                  L{i + 1}/7
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {table.rows.map((row) => (
              <tr key={row.date}>
                <td className={styles.tdDay}>{shortDate(row.date)}</td>
                <td className={styles.tdActive}>{row.active.toLocaleString()}</td>
                {row.cells.map((cell) => (
                  <td key={cell.lag} className={styles.tdLag}>
                    {row.active > 0 && cell.rate != null ? (
                      <>
                        <span className={styles.count}>{cell.count}</span>
                        <span className={styles.pct}>{pct(cell.rate)}</span>
                      </>
                    ) : (
                      "—"
                    )}
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

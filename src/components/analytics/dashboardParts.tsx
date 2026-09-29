/**
 * Formatters and the stat card shared by the admin Dashboards tabs
 * (ProductAnalyticsDashboard, CityOpsDashboard, PeopleActivityPanel).
 */

import styles from "../ProductAnalyticsDashboard.module.css";

export function fmt(n: number | null | undefined): string {
  return n == null ? "—" : n.toLocaleString();
}

export function money(n: number | null | undefined): string {
  return n == null ? "—" : `$${n.toFixed(2)}`;
}

export function shortDate(iso: string): string {
  return new Date(iso + "T00:00:00").toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

export function StatCard({
  label,
  value,
  sub,
  highlight,
}: {
  label: string;
  value: string;
  sub?: string;
  highlight?: boolean;
}) {
  return (
    <div className={highlight ? styles.statCardHighlight : styles.statCard}>
      <div className={styles.statLabel}>{label}</div>
      <div className={highlight ? styles.statValueHighlight : styles.statValue}>{value}</div>
      {sub && <div className={styles.statSub}>{sub}</div>}
    </div>
  );
}

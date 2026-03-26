"use client";

import { useAuth0 } from "@auth0/auth0-react";
import { Fragment, useCallback, useEffect, useState } from "react";
import type {
  CityFreshness,
  CityFreshnessMetricRow,
  CityScheduleHealth,
  CityScheduleRun,
} from "@/lib/apiClient";
import { getCityScheduleHealth } from "@/lib/apiClient";
import Loader from "./Loader";
import styles from "./ScheduleHealthDashboard.module.css";

const SCHEDULE_KEYS = [
  { key: "daily_metrics", label: "Daily" },
  { key: "weekly_metrics", label: "Weekly" },
  { key: "monthly_metrics", label: "Monthly" },
] as const;

type PeriodKey = (typeof SCHEDULE_KEYS)[number]["key"];

function freshCountForPeriod(f: CityFreshness, period: PeriodKey): number {
  switch (period) {
    case "daily_metrics":
      return f.fresh_daily;
    case "weekly_metrics":
      return f.fresh_weekly;
    case "monthly_metrics":
      return f.fresh_monthly;
    default:
      return 0;
  }
}

function executionPresentation(
  run: CityScheduleRun | null,
  slotOverdue: boolean
): { label: string; dotColor: string; running: boolean } {
  if (!run) {
    return {
      label: slotOverdue ? "Overdue — no run" : "Never run",
      dotColor: "#9ca3af",
      running: false,
    };
  }
  const st = run.status;
  if (st === "running" || st === "pending") {
    const prog =
      run.metrics_total != null && run.metrics_completed != null
        ? ` ${run.metrics_completed}/${run.metrics_total}`
        : "";
    return {
      label: `${st === "pending" ? "Pending" : "Running"}${prog}`,
      dotColor: "#3b82f6",
      running: true,
    };
  }
  if (st === "failed" || st === "cancelled") {
    const detail =
      run.metrics_completed != null && run.metrics_total != null
        ? `${run.metrics_completed}/${run.metrics_total} ran`
        : st;
    return { label: detail, dotColor: "#ef4444", running: false };
  }
  const failed = run.metrics_failed ?? 0;
  const total = run.metrics_total ?? 0;
  const done = run.metrics_completed ?? 0;
  if (total > 0 && failed > 0) {
    return {
      label: `${done}/${total} ran (${failed} failed)`,
      dotColor: "#f59e0b",
      running: false,
    };
  }
  if (total > 0 && done >= total && failed === 0) {
    let label = `${done}/${total} ran`;
    if (slotOverdue) label += " · slot overdue";
    return { label, dotColor: "#10b981", running: false };
  }
  return {
    label: `${done}/${total || "?"} ran`,
    dotColor: "#10b981",
    running: false,
  };
}

function FreshnessBar({
  total,
  fresh,
}: {
  total: number;
  fresh: number;
}) {
  if (total <= 0) {
    return (
      <div className={styles.freshText} title="No active metrics for this city">
        No metrics
      </div>
    );
  }
  const stale = Math.max(0, total - fresh);
  const pctFresh = Math.round((fresh / total) * 100);
  let fillClass = styles.freshBarFill;
  if (pctFresh < 50) fillClass = `${styles.freshBarFill} ${styles.freshBarFillBad}`;
  else if (pctFresh < 85) fillClass = `${styles.freshBarFill} ${styles.freshBarFillWarn}`;

  return (
    <>
      <div className={styles.freshBar} title={`${fresh} fresh / ${total} total`}>
        <div className={fillClass} style={{ width: `${pctFresh}%` }} />
      </div>
      <div className={styles.freshText}>
        {fresh} fresh · {stale} stale
      </div>
    </>
  );
}

function groupMetricsByBucket(rows: CityFreshnessMetricRow[]) {
  const order: CityFreshnessMetricRow["bucket"][] = [
    "current",
    "slightly_stale",
    "stale",
    "no_data",
  ];
  const labels: Record<CityFreshnessMetricRow["bucket"], string> = {
    current: "Current (≤ daily threshold)",
    slightly_stale: "Slightly stale (≤ weekly threshold)",
    stale: "Stale",
    no_data: "No data date",
  };
  const groups: Record<string, CityFreshnessMetricRow[]> = {};
  for (const b of order) groups[b] = [];
  for (const r of rows) {
    if (!groups[r.bucket]) groups[r.bucket] = [];
    groups[r.bucket].push(r);
  }
  return { order, labels, groups };
}

interface ScheduleHealthDashboardProps {
  token: string | null;
  getAccessTokenSilently: () => Promise<string>;
  onViewJob: (jobId: string) => void;
}

export default function ScheduleHealthDashboard({
  token,
  getAccessTokenSilently,
  onViewJob,
}: ScheduleHealthDashboardProps) {
  const { isAuthenticated } = useAuth0();
  const [cities, setCities] = useState<CityScheduleHealth[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastLoaded, setLastLoaded] = useState<Date | null>(null);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const t = token || (await getAccessTokenSilently());
      const res = await getCityScheduleHealth(t, { daysBack: 14 });
      setCities(res.cities || []);
      setLastLoaded(new Date());
    } catch (e) {
      console.error(e);
      setError(e instanceof Error ? e.message : "Failed to load city health");
    } finally {
      setLoading(false);
    }
  }, [token, getAccessTokenSilently]);

  useEffect(() => {
    if (!isAuthenticated) {
      setLoading(false);
      return;
    }
    void load();
  }, [isAuthenticated, load]);

  const toggleExpand = (cityId: number) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(cityId)) next.delete(cityId);
      else next.add(cityId);
      return next;
    });
  };

  if (!isAuthenticated) {
    return <p className={styles.empty}>Sign in to view city schedule health.</p>;
  }

  if (loading) {
    return (
      <div className={styles.empty}>
        <Loader size="sm" color="dark" />
        <span style={{ marginLeft: 8 }}>Loading city health…</span>
      </div>
    );
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.toolbar}>
        <div className={styles.titleRow}>
          <h3 className={styles.title}>City schedule health</h3>
          <p className={styles.subtitle}>
            Top chip: last batch run per period. Bottom: data freshness via{" "}
            <code>most_recent_data_date</code> (2d / 10d / 35d thresholds).
            {lastLoaded && (
              <>
                {" "}
                Updated {lastLoaded.toLocaleTimeString()}
              </>
            )}
          </p>
        </div>
        <button type="button" className={styles.refreshBtn} onClick={() => void load()}>
          Refresh
        </button>
      </div>

      {error && <div className={styles.error}>{error}</div>}

      <div className={styles.legend}>
        <span className={styles.legendItem}>
          <span className={styles.dot} style={{ background: "#10b981" }} />
          All ran
        </span>
        <span className={styles.legendItem}>
          <span className={styles.dot} style={{ background: "#f59e0b" }} />
          Partial / overdue slot
        </span>
        <span className={styles.legendItem}>
          <span className={styles.dot} style={{ background: "#ef4444" }} />
          Failed / cancelled
        </span>
        <span className={styles.legendItem}>
          <span className={styles.dot} style={{ background: "#3b82f6" }} />
          Running / pending
        </span>
        <span className={styles.legendItem}>
          <span className={styles.dot} style={{ background: "#9ca3af" }} />
          Never run
        </span>
      </div>

      {cities.length === 0 ? (
        <p className={styles.empty}>No cities found.</p>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>City</th>
                {SCHEDULE_KEYS.map((col) => (
                  <th key={col.key}>{col.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {cities.map((city) => {
                const isOpen = expanded.has(city.city_id);
                const { order, labels, groups } = groupMetricsByBucket(city.freshness_metrics);
                return (
                  <Fragment key={city.city_id}>
                    <tr>
                      <td className={styles.cityCell}>
                        {city.city_name}
                        <button
                          type="button"
                          className={styles.expandBtn}
                          aria-expanded={isOpen}
                          onClick={() => toggleExpand(city.city_id)}
                          title={isOpen ? "Collapse" : "Runs & freshness detail"}
                        >
                          <span
                            className={`${styles.expandChevron} ${isOpen ? styles.expandChevronOpen : ""}`}
                            aria-hidden
                          >
                            ▶
                          </span>
                        </button>
                      </td>
                      {SCHEDULE_KEYS.map((col) => {
                        const slot = city.schedules[col.key];
                        const run = slot?.last_run ?? null;
                        const slotOverdue = slot?.is_overdue ?? false;
                        const exec = executionPresentation(run, slotOverdue);
                        const freshN = freshCountForPeriod(city.freshness, col.key);
                        const totalM = city.freshness.total_metrics;
                        return (
                          <td key={col.key}>
                            <div className={styles.cellStack}>
                              <div
                                className={`${styles.chip} ${exec.running ? styles.chipRunning : ""}`}
                                style={{
                                  background: `${exec.dotColor}18`,
                                  border: `1px solid ${exec.dotColor}44`,
                                }}
                              >
                                <span
                                  className={styles.dot}
                                  style={{ background: exec.dotColor }}
                                />
                                <span>{exec.label}</span>
                              </div>
                              <FreshnessBar total={totalM} fresh={freshN} />
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                    {isOpen && (
                      <tr className={styles.detailRow}>
                        <td colSpan={1 + SCHEDULE_KEYS.length}>
                          <div className={styles.detailInner}>
                            <div className={styles.detailSection}>
                              <h4>Recent batch runs</h4>
                              {SCHEDULE_KEYS.map((col) => {
                                const slot = city.schedules[col.key];
                                const runs = slot?.recent_runs ?? [];
                                return (
                                  <div key={col.key} style={{ marginBottom: "0.75rem" }}>
                                    <strong>{col.label}</strong>
                                    {runs.length === 0 ? (
                                      <p style={{ fontSize: "0.72rem", margin: "0.25rem 0" }}>
                                        No runs in window.
                                      </p>
                                    ) : (
                                      <table className={styles.miniTable}>
                                        <thead>
                                          <tr>
                                            <th>When</th>
                                            <th>Status</th>
                                            <th>Last update</th>
                                            <th>Metrics</th>
                                            <th>Failed</th>
                                            <th />
                                          </tr>
                                        </thead>
                                        <tbody>
                                          {runs.map((r) => (
                                            <tr key={r.job_id}>
                                              <td>
                                                {r.created_at
                                                  ? new Date(r.created_at).toLocaleString()
                                                  : "—"}
                                              </td>
                                              <td>{r.status}</td>
                                              <td
                                                style={{ fontSize: "0.68rem", whiteSpace: "nowrap" }}
                                                title={
                                                  r.updated_at
                                                    ? "Job progress / log heartbeat"
                                                    : undefined
                                                }
                                              >
                                                {r.updated_at
                                                  ? new Date(r.updated_at).toLocaleString()
                                                  : "—"}
                                              </td>
                                              <td>
                                                {r.metrics_completed ?? "—"}/
                                                {r.metrics_total ?? "—"}
                                              </td>
                                              <td
                                                style={{
                                                  maxWidth: 160,
                                                  overflow: "hidden",
                                                  textOverflow: "ellipsis",
                                                }}
                                                title={
                                                  r.failed_metric_names?.join(", ") || ""
                                                }
                                              >
                                                {r.failed_metric_names?.length
                                                  ? r.failed_metric_names.slice(0, 3).join(", ") +
                                                    (r.failed_metric_names.length > 3 ? "…" : "")
                                                  : "—"}
                                              </td>
                                              <td>
                                                <button
                                                  type="button"
                                                  className={styles.linkBtn}
                                                  onClick={() => onViewJob(r.job_id)}
                                                >
                                                  Logs
                                                </button>
                                              </td>
                                            </tr>
                                          ))}
                                        </tbody>
                                      </table>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                            <div className={styles.detailSection}>
                              <h4>Data freshness by metric</h4>
                              {order.map((bucket) => {
                                const list = groups[bucket];
                                if (!list?.length) return null;
                                return (
                                  <div key={bucket} style={{ marginBottom: "0.5rem" }}>
                                    <strong style={{ fontSize: "0.72rem" }}>
                                      {labels[bucket]} ({list.length})
                                    </strong>
                                    <ul className={styles.bucketList}>
                                      {list.slice(0, 80).map((m) => (
                                        <li key={m.metric_id}>
                                          {m.metric_name}
                                          {m.most_recent_data_date
                                            ? ` — ${m.most_recent_data_date}`
                                            : ""}
                                          {m.days_old != null ? ` (${m.days_old}d)` : ""}
                                        </li>
                                      ))}
                                      {list.length > 80 && (
                                        <li>… and {list.length - 80} more</li>
                                      )}
                                    </ul>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

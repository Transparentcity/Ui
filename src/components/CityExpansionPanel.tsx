"use client";

/**
 * City expansion log — today's queue, recent agent scorecards, and learnings.
 * Shown on City Health and Dashboards → Needs attention.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  getCityExpansionHistory,
  getJob,
  startCityExpansionRun,
  updateCityExpansionLearning,
  type CityExpansionHistory,
  type CityExpansionLearning,
  type CityExpansionLearningStatus,
  type CityExpansionQueueItem,
  type CityExpansionRun,
} from "@/lib/apiClient";
import {
  GATE_CHECKS,
  PORTAL_SUPPORT_LABEL,
  QUEUE_REASON_LABEL,
  cityResultLabel,
  formatDemandSources,
  formatPopulation,
} from "@/lib/cityExpansion";
import type { LaunchStatus } from "@/lib/launchStatus";
import LaunchStatusBadge from "./LaunchStatusBadge";
import Loader from "./Loader";
import { notifyJobCreated } from "@/lib/useJobWebSocket";
import health from "./CityHealthAttentionDashboard.module.css";
import styles from "./CityExpansionPanel.module.css";

const LEARNING_FILTERS: { id: "proposed" | "all"; label: string }[] = [
  { id: "proposed", label: "Open" },
  { id: "all", label: "All" },
];

function formatWhen(iso?: string | null): string {
  if (!iso) return "in progress";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function resultClass(label: string): string {
  if (label === "Dark launched" || label === "Passed") return health.sevMedium;
  if (label === "Blocked") return health.sevHigh;
  if (label === "Learned") return health.sevLow;
  return health.sevLow;
}

const TERMINAL_JOB = new Set(["completed", "failed", "cancelled"]);

async function waitForExpansionJob(
  token: string,
  jobId: string,
  onProgress?: (message: string) => void
) {
  for (;;) {
    const job = await getJob(jobId, token);
    if (job.status_message) onProgress?.(job.status_message);
    if (TERMINAL_JOB.has(job.status)) return job;
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
}

export default function CityExpansionPanel({
  getAccessTokenSilently,
}: {
  getAccessTokenSilently: () => Promise<string>;
}) {
  const [data, setData] = useState<CityExpansionHistory | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [learningFilter, setLearningFilter] = useState<"proposed" | "all">(
    "proposed"
  );
  const [busyId, setBusyId] = useState<number | null>(null);
  const [runningKey, setRunningKey] = useState<string | null>(null);
  const [runNote, setRunNote] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const token = await getAccessTokenSilently();
      const history = await getCityExpansionHistory(token);
      setData(history);
      const first = history.runs[0]?.id;
      setExpanded((prev) => {
        if (prev.size > 0) return prev;
        return first != null ? new Set([first]) : new Set();
      });
    } catch (e) {
      console.error(e);
      setError(
        e instanceof Error ? e.message : "Failed to load city expansion history"
      );
    } finally {
      setLoading(false);
    }
  }, [getAccessTokenSilently]);

  useEffect(() => {
    void load();
  }, [load]);

  const learnings = useMemo(() => {
    const rows = data?.learnings ?? [];
    if (learningFilter === "all") return rows;
    return rows.filter((row) => row.status === "proposed");
  }, [data?.learnings, learningFilter]);

  const setLearningStatus = async (
    row: CityExpansionLearning,
    status: CityExpansionLearningStatus
  ) => {
    setBusyId(row.id);
    try {
      const token = await getAccessTokenSilently();
      await updateCityExpansionLearning(token, row.id, status);
      setData((prev) =>
        prev
          ? {
              ...prev,
              learnings: prev.learnings.map((item) =>
                item.id === row.id ? { ...item, status } : item
              ),
            }
          : prev
      );
    } catch (e) {
      console.error(e);
      setError(e instanceof Error ? e.message : "Failed to update learning");
    } finally {
      setBusyId(null);
    }
  };

  const toggleRun = (runId: number) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(runId)) next.delete(runId);
      else next.add(runId);
      return next;
    });
  };

  const triggerRun = async (item?: CityExpansionQueueItem) => {
    const key = item
      ? `city:${item.city_id ?? item.city_name}`
      : "today";
    setRunningKey(key);
    setError(null);
    setRunNote(null);
    try {
      const token = await getAccessTokenSilently();
      const started = await startCityExpansionRun(
        token,
        item
          ? {
              city_id: item.city_id,
              city_name: item.city_name,
              domain: item.domain,
              portal_type: item.portal_type,
              country: item.country,
              population: item.population,
            }
          : { max_new: 1, max_tighten: 3 }
      );
      if (!started.job_id) {
        throw new Error("Expansion job did not return a job_id");
      }
      notifyJobCreated(started.job_id);
      setRunNote(started.message ?? "Indexing catalogs…");
      const job = await waitForExpansionJob(token, started.job_id, (message) => {
        setRunNote(message);
      });
      if (job.status === "cancelled") {
        setRunNote("Run cancelled.");
      } else if (job.status === "failed") {
        setError(job.error_message || job.error || "Expansion run failed");
      } else {
        const result = (job.result ?? {}) as {
          run_id?: number;
          work_count?: number;
          promoted_dark_launch?: number[];
          results?: unknown[];
        };
        const promoted = result.promoted_dark_launch?.length ?? 0;
        const count = result.work_count ?? result.results?.length ?? 0;
        setRunNote(
          `Run #${result.run_id ?? "?"} finished · ${count} ${
            count === 1 ? "city" : "cities"
          } · ${promoted} dark launched. Catalog index and gates only — leaders and template metrics still need the agent.`
        );
      }
      setExpanded(new Set());
      await load();
    } catch (e) {
      console.error(e);
      setError(e instanceof Error ? e.message : "Failed to start expansion run");
    } finally {
      setRunningKey(null);
    }
  };

  if (loading && !data) {
    return (
      <section className={health.wrap} aria-label="City expansion">
        <div className={health.header}>
          <div className={health.titleBlock}>
            <h3 className={health.title}>City expansion</h3>
            <p className={health.subtitle}>Loading queue, runs, and learnings…</p>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Loader size="sm" color="dark" />
          <span>Loading expansion log…</span>
        </div>
      </section>
    );
  }

  const queue = data?.queue ?? [];
  const budget = data?.budget ?? { max_new: 1, max_tighten: 3 };
  const budgetCount = queue.filter((item) => item.in_today_budget).length;
  const runs = data?.runs ?? [];
  const openCount = (data?.learnings ?? []).filter(
    (row) => row.status === "proposed"
  ).length;
  const runBusy = runningKey != null;

  return (
    <section className={health.wrap} aria-label="City expansion">
      <div className={health.header}>
        <div className={health.titleBlock}>
          <h3 className={health.title}>City expansion</h3>
          <p className={health.subtitle}>
            Ranked backlog of cities to onboard or tighten. Passing gates
            dark-launches only — never a full public launch.
          </p>
        </div>
        <div className={health.controls}>
          <button
            type="button"
            className={`${health.actionBtn} ${health.actionBtnPrimary}`}
            disabled={runBusy}
            onClick={() => void triggerRun()}
            title="Enqueue catalog index and gates for today's 1 onboard + 3 tighten cities"
          >
            {runningKey === "today" ? "Running…" : "Run today's queue"}
          </button>
          <button type="button" className={health.actionBtn} onClick={() => void load()}>
            Refresh
          </button>
        </div>
      </div>

      {error && <p className={health.actionError}>{error}</p>}
      {runNote && <p className={styles.queueHint}>{runNote}</p>}

      <p className={styles.sectionLabel}>Queue</p>
      <p className={styles.queueHint}>
        {queue.length} ranked {queue.length === 1 ? "city" : "cities"}
        {budgetCount > 0
          ? ` · ${budgetCount} in today's budget (${budget.max_new} onboard + ${budget.max_tighten} tighten)`
          : ""}
        . Run starts a background job (visible in Jobs) that indexes catalogs
        and evaluates gates; the agent still does leaders, shapefiles, and
        template metrics.
      </p>
      {queue.length === 0 ? (
        <p className={health.empty}>No expansion work queued right now.</p>
      ) : (
        <div className={styles.queueStrip}>
          {queue.map((item, idx) => {
            const rowKey = `city:${item.city_id ?? item.city_name}`;
            const demand = formatDemandSources(item.demand_sources);
            return (
              <div
                key={`${item.city_id ?? item.city_name}-${idx}`}
                className={`${styles.queueRow} ${
                  item.in_today_budget ? styles.queueRowBudget : ""
                }`}
              >
                <span className={styles.queueRank}>{item.rank ?? idx + 1}</span>
                <div>
                  <span className={styles.queueName}>{item.city_name}</span>
                  <span className={styles.queueMeta}>
                    {item.mode}
                    {formatPopulation(item.population)
                      ? ` · ${formatPopulation(item.population)}`
                      : ""}
                    {item.portal_type ? ` · ${item.portal_type}` : ""}
                    {item.domain ? ` · ${item.domain}` : ""}
                  </span>
                </div>
                <div className={styles.queueReason}>
                  <span className={health.tag}>
                    {QUEUE_REASON_LABEL[item.reason] ?? item.reason}
                  </span>
                  {item.portal_support ? (
                    <span className={health.tag}>
                      {PORTAL_SUPPORT_LABEL[item.portal_support] ??
                        item.portal_support}
                    </span>
                  ) : null}
                  {item.user_demand ? (
                    <span
                      className={styles.queueMeta}
                      title={demand || undefined}
                    >
                      <span className={styles.demand}>{item.user_demand} users</span>
                      {demand ? ` · ${demand}` : ""}
                    </span>
                  ) : null}
                </div>
                <div className={styles.queueActions}>
                  {item.in_today_budget ? (
                    <span className={`${health.sevBadge} ${health.sevMedium}`}>
                      Today
                    </span>
                  ) : (
                    <span className={styles.queueMeta}>Up next</span>
                  )}
                  <button
                    type="button"
                    className={health.actionBtn}
                    disabled={runBusy}
                    onClick={() => void triggerRun(item)}
                  >
                    {runningKey === rowKey ? "Running…" : "Run"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <p className={styles.sectionLabel}>Recent runs</p>
      {runs.length === 0 ? (
        <p className={health.empty}>
          No expansion runs yet. After the nightly agent reports, scorecards
          appear here.
        </p>
      ) : (
        <div className={health.cityList}>
          {runs.map((run) => (
            <RunCard
              key={run.id}
              run={run}
              open={expanded.has(run.id)}
              onToggle={() => toggleRun(run.id)}
            />
          ))}
        </div>
      )}

      <div className={health.header} style={{ marginTop: "1rem", marginBottom: "0.55rem" }}>
        <p className={styles.sectionLabel} style={{ margin: 0 }}>
          Learnings
        </p>
        <div className={health.toggle} role="group" aria-label="Learning status">
          {LEARNING_FILTERS.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`${health.toggleBtn} ${
                learningFilter === item.id ? health.toggleBtnActive : ""
              }`}
              onClick={() => setLearningFilter(item.id)}
            >
              {item.label}
              {item.id === "proposed" ? (
                <span className={health.toggleCount}>{openCount}</span>
              ) : null}
            </button>
          ))}
        </div>
      </div>

      {learnings.length === 0 ? (
        <p className={health.empty}>
          {learningFilter === "proposed"
            ? "No open learnings. Adapter and template discoveries show up here."
            : "No learnings recorded yet."}
        </p>
      ) : (
        <div className={styles.learningList}>
          {learnings.map((row) => (
            <div key={row.id} className={styles.learningCard}>
              <div className={styles.learningHead}>
                <span className={styles.learningTitle}>{row.title}</span>
                <span className={health.tag}>{row.kind}</span>
                <span className={`${health.sevBadge} ${health.sevLow}`}>
                  {row.status}
                </span>
                {row.city_name ? (
                  <span className={styles.queueMeta}>{row.city_name}</span>
                ) : null}
              </div>
              {row.body ? <p className={styles.learningBody}>{row.body}</p> : null}
              {row.status === "proposed" ? (
                <div className={styles.learningActions}>
                  <button
                    type="button"
                    className={`${health.actionBtn} ${health.actionBtnPrimary}`}
                    disabled={busyId === row.id}
                    onClick={() => void setLearningStatus(row, "applied")}
                  >
                    {busyId === row.id ? "Saving…" : "Mark applied"}
                  </button>
                  <button
                    type="button"
                    className={health.actionBtn}
                    disabled={busyId === row.id}
                    onClick={() => void setLearningStatus(row, "rejected")}
                  >
                    Dismiss
                  </button>
                </div>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function RunCard({
  run,
  open,
  onToggle,
}: {
  run: CityExpansionRun;
  open: boolean;
  onToggle: () => void;
}) {
  const promoted = run.cities.filter((c) => c.promoted).length;
  const blocked = run.cities.filter(
    (c) => !c.promoted && (c.result === "blocked" || c.status === "failed" || !c.passed)
  ).length;

  return (
    <div className={health.cityCard}>
      <button
        type="button"
        className={health.cityHead}
        onClick={onToggle}
        aria-expanded={open}
      >
        <span
          className={`${health.chevron} ${open ? health.chevronOpen : ""}`}
          aria-hidden
        >
          ▶
        </span>
        <span className={health.cityName}>
          Run #{run.id}
          {run.created_by ? ` · ${run.created_by}` : ""}
        </span>
        <span className={`${health.sevBadge} ${health.sevLow}`}>{run.status}</span>
        <div className={styles.runMeta}>
          {promoted > 0 ? (
            <span className={health.countChip}>Dark launched {promoted}</span>
          ) : null}
          {blocked > 0 ? (
            <span className={`${health.countChip} ${health.countChipHot}`}>
              Blocked {blocked}
            </span>
          ) : null}
          <span className={health.countChip}>
            {formatWhen(run.finished_at || run.started_at)}
          </span>
        </div>
      </button>
      {open && (
        <div className={health.issueBody}>
          {run.notes ? <p className={styles.notes}>{run.notes}</p> : null}
          {run.cities.length === 0 ? (
            <p className={health.empty}>No city scorecards on this run.</p>
          ) : (
            run.cities.map((city) => {
              const label = cityResultLabel(city);
              const launch = city.launch_status as LaunchStatus | undefined;
              return (
                <div key={city.id} className={styles.cityBlock}>
                  <div className={styles.cityRow}>
                    <span className={health.cityName}>{city.city_name}</span>
                    {launch ? <LaunchStatusBadge status={launch} /> : null}
                    <span className={`${health.sevBadge} ${resultClass(label)}`}>
                      {label}
                    </span>
                    <span className={health.tag}>{city.mode}</span>
                  </div>
                  <div className={styles.gateGrid}>
                    {GATE_CHECKS.map((check) => {
                      const value = city.checks[check.key];
                      const known = typeof value === "boolean";
                      const pass = value === true;
                      return (
                        <span
                          key={check.key}
                          className={`${styles.gate} ${
                            !known ? "" : pass ? styles.gatePass : styles.gateFail
                          }`}
                        >
                          <span className={styles.mark} aria-hidden>
                            {!known ? "·" : pass ? "✓" : "✕"}
                          </span>
                          {check.label}
                        </span>
                      );
                    })}
                  </div>
                  {city.gate_issues.length > 0 ? (
                    <p className={styles.issues}>{city.gate_issues.join(" · ")}</p>
                  ) : null}
                  {city.notes ? (
                    <p className={styles.learningBody}>{city.notes}</p>
                  ) : null}
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}

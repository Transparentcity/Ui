"use client";

/**
 * WeeklyJobTimeline — compact seven-day Gantt-style view of scheduled jobs.
 *
 * - Rows = unique schedules; columns = days of the current week.
 * - Bars are positioned by scheduled start time and estimated (or actual) duration.
 * - Future bars render as dashed estimates; past/completed bars as solid with
 *   outcome colour; running bars extend to "now".
 * - Shares the Workflow and City filters from Job Logs.
 * - Accessible: each bar has a focusable element with full detail in title and
 *   aria-label; an accompanying chronological list is always rendered.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CityListItem,
  CustomScheduledJob,
  getWeeklyTimeline,
  listCities,
  WeeklyTimelineEntry,
} from "@/lib/apiClient";
import Loader from "./Loader";
import styles from "./WeeklyJobTimeline.module.css";

// ─── helpers ─────────────────────────────────────────────────────────────────

function formatDuration(seconds: number | null | undefined): string {
  if (!seconds || seconds <= 0) return "?";
  if (seconds < 60) return `${Math.round(seconds)}s`;
  if (seconds < 3600)
    return `${Math.floor(seconds / 60)}m ${Math.round(seconds % 60)}s`;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${h}h ${m}m`;
}

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function startOfDayUTC(date: Date): Date {
  const d = new Date(date);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

/** Return an array of 7 Date objects (midnight UTC) starting from Monday of
 *  the week that contains `anchor`. */
function weekDaysFrom(anchor: Date): Date[] {
  const d = startOfDayUTC(anchor);
  // JS getUTCDay: 0=Sun … 6=Sat; shift so Monday=0
  const dayOfWeek = (d.getUTCDay() + 6) % 7;
  const monday = new Date(d.getTime() - dayOfWeek * 86_400_000);
  return Array.from({ length: 7 }, (_, i) => new Date(monday.getTime() + i * 86_400_000));
}

/** Return outcome colour class for a bar. */
function outcomeClass(entry: WeeklyTimelineEntry, now: Date): string {
  const start = new Date(entry.scheduled_start);
  if (entry.actual) {
    const s = entry.actual.status;
    if (s === "completed") return styles.barCompleted;
    if (s === "failed") return styles.barFailed;
    if (s === "running") return styles.barRunning;
    return styles.barPending;
  }
  if (start > now) return styles.barEstimate;
  return styles.barMissed; // Scheduled in the past but no actual record
}

// ─── types ────────────────────────────────────────────────────────────────────

interface FilterState {
  workflowId: string;
  cityId: string;
}

interface Props {
  token: string | null;
  getAccessTokenSilently: () => Promise<string>;
  customSchedules: CustomScheduledJob[];
  /** Called when user clicks a bar to navigate to that job run */
  onViewJob?: (jobId: string) => void;
}

// ─── component ────────────────────────────────────────────────────────────────

export default function WeeklyJobTimeline({
  token,
  getAccessTokenSilently,
  customSchedules,
  onViewJob,
}: Props) {
  const [weekOffset, setWeekOffset] = useState(0);
  const [entries, setEntries] = useState<WeeklyTimelineEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<FilterState>({ workflowId: "", cityId: "" });
  const nowRef = useRef(new Date());
  const [cityDirectory, setCityDirectory] = useState<CityListItem[]>([]);

  // Fetch city list once so we can display names instead of IDs
  useEffect(() => {
    const fetch = async () => {
      const t = token || (await getAccessTokenSilently().catch(() => null));
      if (!t) return;
      listCities(t)
        .then(setCityDirectory)
        .catch(() => setCityDirectory([]));
    };
    fetch();
  }, [token, getAccessTokenSilently]);

  const cityLabel = (cityId: number): string => {
    const row = cityDirectory.find((c) => c.city_id === cityId);
    if (!row) return `City ${cityId}`;
    const region = row.state || row.country || "";
    return region ? `${row.city_name}, ${region}` : row.city_name;
  };

  // Refresh "now" every 30s so running bars stay accurate
  useEffect(() => {
    const id = setInterval(() => {
      nowRef.current = new Date();
    }, 30_000);
    return () => clearInterval(id);
  }, []);

  const load = useCallback(async () => {
    const t = token || (await getAccessTokenSilently().catch(() => null));
    if (!t) return;
    setLoading(true);
    setError(null);
    try {
      const res = await getWeeklyTimeline(t, {
        week_offset: weekOffset,
        workflow_id: filters.workflowId ? Number(filters.workflowId) : undefined,
        city_id: filters.cityId ? Number(filters.cityId) : undefined,
      });
      setEntries(res.entries ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load timeline");
    } finally {
      setLoading(false);
    }
  }, [token, getAccessTokenSilently, weekOffset, filters]);

  useEffect(() => {
    load();
  }, [load]);

  // Week days in local timezone
  const now = useMemo(() => new Date(), []);
  const weekAnchor = useMemo(() => {
    const d = new Date(now.getTime() + weekOffset * 7 * 86_400_000);
    return d;
  }, [now, weekOffset]);
  const days = useMemo(() => weekDaysFrom(weekAnchor), [weekAnchor]);

  // Collect unique city IDs across all visible entries for the city filter
  const availableCityIds = useMemo(() => {
    const ids = new Set<number>();
    for (const e of entries) {
      for (const c of e.effective_city_ids ?? []) ids.add(c);
    }
    return Array.from(ids).sort((a, b) => a - b);
  }, [entries]);

  // Group entries by day (UTC date string YYYY-MM-DD)
  const entriesByDay = useMemo(() => {
    const map = new Map<string, WeeklyTimelineEntry[]>();
    for (const e of entries) {
      const d = e.scheduled_start.slice(0, 10); // UTC date
      if (!map.has(d)) map.set(d, []);
      map.get(d)!.push(e);
    }
    return map;
  }, [entries]);

  const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

  const todayUTC = new Date().toISOString().slice(0, 10);

  return (
    <div className={styles.container}>
      {/* ── Controls ── */}
      <div className={styles.controls}>
        <div className={styles.weekNav}>
          <button
            className={styles.navButton}
            onClick={() => setWeekOffset((w) => w - 1)}
            aria-label="Previous week"
          >
            ‹
          </button>
          <button
            className={`${styles.navButton} ${styles.todayButton}`}
            onClick={() => setWeekOffset(0)}
            aria-label="Jump to current week"
          >
            Today
          </button>
          <button
            className={styles.navButton}
            onClick={() => setWeekOffset((w) => w + 1)}
            aria-label="Next week"
          >
            ›
          </button>
          <span className={styles.weekLabel}>
            {days[0].toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })}
            {" – "}
            {days[6].toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
              year: "numeric",
              timeZone: "UTC",
            })}
            <span className={styles.tzNote}> (UTC)</span>
          </span>
        </div>

        <div className={styles.filterBar}>
          {customSchedules.length > 0 && (
            <select
              className={styles.filterSelect}
              value={filters.workflowId}
              onChange={(e) =>
                setFilters((f) => ({ ...f, workflowId: e.target.value }))
              }
              aria-label="Filter by workflow"
            >
              <option value="">All workflows</option>
              {customSchedules.map((s) => (
                <option key={s.id} value={String(s.id)}>
                  {s.name}
                </option>
              ))}
            </select>
          )}
          {availableCityIds.length > 0 && (
            <select
              className={styles.filterSelect}
              value={filters.cityId}
              onChange={(e) =>
                setFilters((f) => ({ ...f, cityId: e.target.value }))
              }
              aria-label="Filter by city"
            >
              <option value="">All cities</option>
              {availableCityIds.map((id) => (
                <option key={id} value={String(id)}>
                  {cityLabel(id)}
                </option>
              ))}
            </select>
          )}
          <button
            className={styles.refreshButton}
            onClick={load}
            disabled={loading}
            aria-label="Refresh timeline"
          >
            {loading ? "Loading…" : "↻ Refresh"}
          </button>
        </div>
      </div>

      {error && <div className={styles.errorBanner}>{error}</div>}
      {loading && entries.length === 0 && (
        <div className={styles.loadingState}>
          <Loader size="sm" color="dark" />
          <span>Loading schedule…</span>
        </div>
      )}

      {/* ── Legend ── */}
      {entries.length > 0 && (
        <div className={styles.legend} aria-label="Chart legend">
          {[
            { cls: styles.barCompleted, label: "Completed" },
            { cls: styles.barFailed,    label: "Failed" },
            { cls: styles.barRunning,   label: "Running" },
            { cls: styles.barPending,   label: "Pending" },
            { cls: styles.barMissed,    label: "Missed (no run found)" },
            { cls: styles.barEstimate,  label: "Upcoming (estimated)" },
          ].map(({ cls, label }) => (
            <span key={label} className={styles.legendItem}>
              <span className={`${styles.legendSwatch} ${cls}`} aria-hidden="true" />
              <span className={styles.legendLabel}>{label}</span>
            </span>
          ))}
        </div>
      )}

      {/* ── Gantt grid ── */}
      {entries.length > 0 && (
        <div className={styles.ganttWrapper}>
          <div className={styles.ganttScroll}>
            <table className={styles.gantt} role="grid" aria-label="Weekly job schedule">
              <thead>
                <tr>
                  <th className={styles.scheduleCol} scope="col">
                    Schedule
                  </th>
                  {days.map((day, i) => {
                    const dayStr = day.toISOString().slice(0, 10);
                    const isToday = dayStr === todayUTC;
                    return (
                      <th
                        key={dayStr}
                        className={`${styles.dayCol} ${isToday ? styles.today : ""}`}
                        scope="col"
                      >
                        <div className={styles.dayLabel}>{DAY_LABELS[i]}</div>
                        <div className={styles.dayDate}>
                          {day.toLocaleDateString("en-US", {
                            month: "short",
                            day: "numeric",
                            timeZone: "UTC",
                          })}
                        </div>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {/* Group rows by schedule */}
                {Array.from(
                  new Map(entries.map((e) => [e.schedule_id, e])).values()
                ).map((representative) => (
                  <tr key={representative.schedule_id}>
                    <td className={styles.scheduleCell} title={representative.job_type}>
                      <span className={styles.scheduleName}>
                        {representative.schedule_name}
                      </span>
                      {representative.effective_city_ids?.length > 0 && (
                        <span
                          className={styles.cityCount}
                          title={representative.effective_city_ids.map(cityLabel).join(", ")}
                        >
                          {representative.effective_city_ids.length === 1
                            ? cityLabel(representative.effective_city_ids[0])
                            : `${representative.effective_city_ids.length} cities`}
                        </span>
                      )}
                    </td>
                    {days.map((day) => {
                      const dayStr = day.toISOString().slice(0, 10);
                      const dayEntries = (entriesByDay.get(dayStr) ?? []).filter(
                        (e) => e.schedule_id === representative.schedule_id
                      );
                      return (
                        <td key={dayStr} className={styles.dayCell}>
                          {dayEntries.map((entry, idx) => {
                            const barClass = outcomeClass(entry, nowRef.current);
                            const startDate = new Date(entry.scheduled_start);
                            const durationSecs =
                              entry.actual?.duration_seconds ??
                              entry.estimated_duration_seconds;
                            const label = buildBarLabel(entry, cityLabel);
                            const jobId =
                              entry.actual?.job_id;
                            return (
                              <a
                                key={idx}
                                href={
                                  jobId
                                    ? `/home?tab=logs&job_id=${jobId}`
                                    : undefined
                                }
                                onClick={
                                  jobId && onViewJob
                                    ? (e) => {
                                        e.preventDefault();
                                        onViewJob(jobId);
                                      }
                                    : undefined
                                }
                                className={`${styles.bar} ${barClass}`}
                                title={label}
                                aria-label={label}
                                role="button"
                                tabIndex={0}
                              >
                                <span className={styles.barTime}>
                                  {formatTime(entry.scheduled_start)}
                                </span>
                                <span className={styles.barDuration}>
                                  {formatDuration(durationSecs)}
                                </span>
                                {entry.sample_count > 0 && !entry.actual && (
                                  <span
                                    className={styles.sampleBadge}
                                    title={`Estimated from ${entry.sample_count} historical run(s)`}
                                  >
                                    ~{entry.sample_count}
                                  </span>
                                )}
                              </a>
                            );
                          })}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Accessible chronological list ── */}
      {entries.length > 0 && (
        <section
          className={styles.chronoList}
          aria-label="Chronological schedule list"
        >
          <h3 className={styles.chronoTitle}>Chronological view</h3>
          <ol className={styles.chronoItems}>
            {entries.map((entry, idx) => {
              const status = entry.actual
                ? entry.actual.status
                : new Date(entry.scheduled_start) > nowRef.current
                ? "scheduled"
                : "missed";
              return (
                <li key={idx} className={styles.chronoItem}>
                  <span className={`${styles.chronoBadge} ${styles[`badge_${status}`]}`}>
                    {status}
                  </span>
                  <span className={styles.chronoTime}>
                    {new Date(entry.scheduled_start).toLocaleString([], {
                      weekday: "short",
                      month: "short",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                  <span className={styles.chronoName}>{entry.schedule_name}</span>
                  {entry.actual?.duration_seconds != null && (
                    <span className={styles.chronoDuration}>
                      {formatDuration(entry.actual.duration_seconds)} actual
                    </span>
                  )}
                  {entry.estimated_duration_seconds != null && !entry.actual && (
                    <span className={styles.chronoDuration}>
                      ~{formatDuration(entry.estimated_duration_seconds)} est.
                    </span>
                  )}
                  {entry.actual?.job_id && (
                    <a
                      href={`/home?tab=logs&job_id=${entry.actual.job_id}`}
                      onClick={
                        onViewJob
                          ? (e) => {
                              e.preventDefault();
                              onViewJob(entry.actual!.job_id);
                            }
                          : undefined
                      }
                      className={styles.chronoLink}
                    >
                      View run →
                    </a>
                  )}
                </li>
              );
            })}
          </ol>
        </section>
      )}

      {!loading && entries.length === 0 && (
        <div className={styles.empty}>
          No scheduled jobs match this week / filters.
        </div>
      )}
    </div>
  );
}

function buildBarLabel(
  entry: WeeklyTimelineEntry,
  resolveCityName?: (id: number) => string
): string {
  const parts = [
    entry.schedule_name,
    `Scheduled: ${new Date(entry.scheduled_start).toLocaleString()}`,
  ];
  if (entry.actual) {
    parts.push(
      `Status: ${entry.actual.status}`,
      entry.actual.duration_seconds != null
        ? `Duration: ${formatDuration(entry.actual.duration_seconds)}`
        : ""
    );
  } else {
    parts.push(
      entry.estimated_duration_seconds != null
        ? `Estimated: ~${formatDuration(entry.estimated_duration_seconds)} (${entry.sample_count} samples)`
        : "Duration: unknown"
    );
  }
  const cityIds = entry.effective_city_ids ?? [];
  if (cityIds.length > 0) {
    const cityNames = resolveCityName
      ? cityIds.map(resolveCityName).join(", ")
      : cityIds.join(", ");
    parts.push(`Cities: ${cityNames}`);
  }
  return parts.filter(Boolean).join(" | ");
}

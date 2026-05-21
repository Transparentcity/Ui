"use client";

import { useAuth0 } from "@auth0/auth0-react";
import {
  Fragment,
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type {
  CityFreshness,
  CityFreshnessMetricRow,
  CityScheduleHealth,
  CityScheduleRun,
  CityScheduleStructureSummary,
} from "@/lib/apiClient";
import { batchExecuteMetrics, getCityScheduleHealth, patchMetricMetadata } from "@/lib/apiClient";
import MetricEditModal from "./MetricEditModal";
import {
  BadgeCheck,
  Layers,
  ListTree,
  Map as MapIcon,
  MapPinned,
  UserRound,
  Users,
} from "lucide-react";
import Loader from "./Loader";
import styles from "./ScheduleHealthDashboard.module.css";

const SCHEDULE_KEYS = [
  { key: "daily_metrics", label: "Daily" },
  { key: "weekly_metrics", label: "Weekly" },
  { key: "monthly_metrics", label: "Monthly" },
  { key: "annual_metrics", label: "Annual" },
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
    case "annual_metrics":
      return f.fresh_annual;
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

const BUCKET_ORDER: Record<CityFreshnessMetricRow["bucket"], number> = {
  stale: 0,
  slightly_stale: 1,
  current: 2,
  no_data: 3,
};

const BUCKET_COLOR: Record<CityFreshnessMetricRow["bucket"], string> = {
  current: "#10b981",
  slightly_stale: "#f59e0b",
  stale: "#ef4444",
  no_data: "#9ca3af",
};

function sortMetricsByCategoryThenName(rows: CityFreshnessMetricRow[]): CityFreshnessMetricRow[] {
  return [...rows].sort((a, b) => {
    const catA = (a.category ?? "").toLowerCase();
    const catB = (b.category ?? "").toLowerCase();
    const catCmp = catA.localeCompare(catB, undefined, { sensitivity: "base" });
    if (catCmp !== 0) return catCmp;
    return a.metric_name.localeCompare(b.metric_name, undefined, { sensitivity: "base" });
  });
}

function formatExecStatus(status: string | null): { label: string; isError: boolean } {
  if (!status) return { label: "Never run", isError: true };
  const s = status.toLowerCase();
  if (s === "success" || s === "completed") return { label: "OK", isError: false };
  if (s === "failed" || s === "error") return { label: "Failed", isError: true };
  return { label: status, isError: false };
}

function fmtShortDate(iso: string | null): string {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "2-digit" });
  } catch {
    return iso;
  }
}

function fmtShortDateTime(iso: string | null): string {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric" }) +
      " " + d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  } catch {
    return iso;
  }
}

/** Day + month only for at-a-glance last-run in schedule columns */
function fmtDayMonth(iso: string | null): string {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  } catch {
    return "—";
  }
}

type StructurePillStatus = "ok" | "warn" | "bad" | "neutral";

function ratioPillStatus(total: number, ok: number): StructurePillStatus {
  if (total <= 0) return "neutral";
  if (ok >= total) return "ok";
  if (ok > 0) return "warn";
  return "bad";
}

function StructurePill({
  status,
  icon,
  shortLabel,
  title,
}: {
  status: StructurePillStatus;
  icon: ReactNode;
  shortLabel: string;
  title: string;
}) {
  const stClass =
    status === "ok"
      ? styles.structurePillOk
      : status === "warn"
        ? styles.structurePillWarn
        : status === "bad"
          ? styles.structurePillBad
          : styles.structurePillNeutral;
  return (
    <span className={`${styles.structurePill} ${stClass}`} title={title}>
      <span className={styles.structurePillIcon} aria-hidden>
        {icon}
      </span>
      <span className={styles.structurePillText}>{shortLabel}</span>
    </span>
  );
}

function CityStructureStrip({ structure }: { structure?: CityScheduleStructureSummary }) {
  if (!structure) return null;
  const c = structure.counts;
  const mt = structure.metrics_total;
  const md = structure.metrics_with_district_field;
  const mw = structure.metrics_district_working;
  const mm = structure.metrics_with_map_fields;

  return (
    <div className={styles.structureStrip} role="group" aria-label="City data structure">
      <StructurePill
        status={structure.elected_officials ? "ok" : "bad"}
        icon={<Users size={11} strokeWidth={2.2} />}
        shortLabel="Leaders"
        title={
          structure.elected_officials
            ? `Elected officials: ${c.elected_officials} in city_leaders`
            : "No rows in city_leaders"
        }
      />
      <StructurePill
        status={structure.geographic_structures ? "ok" : "bad"}
        icon={<MapPinned size={11} strokeWidth={2.2} />}
        shortLabel="Geo"
        title={
          structure.geographic_structures
            ? `Geographic structures: ${c.geographic_structures}`
            : "No city_geographic_structures"
        }
      />
      <StructurePill
        status={structure.shape_layers ? "ok" : "bad"}
        icon={<Layers size={11} strokeWidth={2.2} />}
        shortLabel="Shapes"
        title={
          structure.shape_layers
            ? `Active shape layers (city_shapefiles): ${c.shape_layers}`
            : "No active city_shapefiles"
        }
      />
      <StructurePill
        status={structure.population_defined ? "ok" : "warn"}
        icon={<UserRound size={11} strokeWidth={2.2} />}
        shortLabel="Pop"
        title={
          structure.population_defined
            ? "City population is set on cities.population"
            : "cities.population is null"
        }
      />
      <StructurePill
        status={structure.city_district_fields ? "ok" : "bad"}
        icon={<ListTree size={11} strokeWidth={2.2} />}
        shortLabel="City Δ"
        title={
          structure.city_district_fields
            ? "City district_field / district_fields configured"
            : "No city-level district_field(s)"
        }
      />
      <StructurePill
        status={ratioPillStatus(mt, md)}
        icon={<ListTree size={11} strokeWidth={2.2} />}
        shortLabel={mt > 0 ? `MΔ ${md}/${mt}` : "MΔ —"}
        title={
          mt > 0
            ? `Metrics with district in map_config or location_fields: ${md} of ${mt}`
            : "No active metrics for this city"
        }
      />
      <StructurePill
        status={ratioPillStatus(mt, mw)}
        icon={<BadgeCheck size={11} strokeWidth={2.2} />}
        shortLabel={mt > 0 ? `OK ${mw}/${mt}` : "OK —"}
        title={
          mt > 0
            ? `Metrics with district wiring, data date, and last run success: ${mw} of ${mt}`
            : "No active metrics for this city"
        }
      />
      <StructurePill
        status={ratioPillStatus(mt, mm)}
        icon={<MapIcon size={11} strokeWidth={2.2} />}
        shortLabel={mt > 0 ? `Map ${mm}/${mt}` : "Map —"}
        title={
          mt > 0
            ? `Metrics with map_query or map_config map fields: ${mm} of ${mt}`
            : "No active metrics for this city"
        }
      />
    </div>
  );
}

function lastRunIsoForDisplay(run: CityScheduleRun | null): string | null {
  if (!run) return null;
  return run.completed_at ?? run.updated_at ?? run.created_at;
}

type ReviewedOverride = Record<string, unknown> & {
  reviewed: boolean;
  reviewed_by: string;
  reviewed_at: string;
};

function MetricHealthTable({
  rows,
  onEditMetric,
  getAccessTokenSilently,
  userId,
}: {
  rows: CityFreshnessMetricRow[];
  onEditMetric: (metricId: number) => void;
  getAccessTokenSilently: () => Promise<string>;
  userId: string | undefined;
}) {
  // Optimistic overrides: metricId → reviewed state (cleared on parent refresh)
  const [reviewOverrides, setReviewOverrides] = useState<Map<number, ReviewedOverride>>(
    new Map()
  );
  const [savingIds, setSavingIds] = useState<Set<number>>(new Set());

  const sorted = sortMetricsByCategoryThenName(rows);

  const handleReviewToggle = async (m: CityFreshnessMetricRow, newChecked: boolean) => {
    const id = m.metric_id;
    const prevOverride = reviewOverrides.get(id);
    const prevReviewed = prevOverride?.reviewed ?? (m.metadata?.reviewed === true);

    // Optimistic update
    const override: ReviewedOverride = {
      reviewed: newChecked,
      reviewed_by: userId ?? "unknown",
      reviewed_at: new Date().toISOString(),
    };
    setReviewOverrides((prev) => new Map(prev).set(id, override));
    setSavingIds((prev) => new Set(prev).add(id));

    try {
      const t = await getAccessTokenSilently();
      await patchMetricMetadata(id, override, t);
    } catch (err) {
      console.error("Failed to save reviewed state", err);
      // Revert to previous
      setReviewOverrides((prev) => {
        const next = new Map(prev);
        if (prevOverride !== undefined) {
          next.set(id, prevOverride);
        } else {
          next.delete(id);
        }
        return next;
      });
      // Restore previous reviewed value as override so UI is consistent
      if (prevReviewed !== newChecked) {
        setReviewOverrides((prev) =>
          new Map(prev).set(id, {
            reviewed: prevReviewed,
            reviewed_by: String(m.metadata?.reviewed_by ?? ""),
            reviewed_at: String(m.metadata?.reviewed_at ?? ""),
          })
        );
      }
    } finally {
      setSavingIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  };

  if (sorted.length === 0) {
    return <p style={{ fontSize: "0.72rem", margin: "0.25rem 0", color: "var(--text-secondary, #6b7280)" }}>No metrics.</p>;
  }
  return (
    <div className={styles.metricTableWrap}>
      <table className={styles.miniTable}>
        <thead>
          <tr>
            <th>Metric</th>
            <th>Category</th>
            <th>Template</th>
            <th>Last data</th>
            <th>Age</th>
            <th title="Date of last execution, colored by run status">Last run</th>
            <th title="Active time series charts (time_series_metadata rows) for this metric">
              Charts
            </th>
            <th title="District in map_config or location_fields (name heuristic)">Dist</th>
            <th title="map_query or lat/lon in map_config">Map</th>
            <th title="Metric has been reviewed by an admin">Reviewed</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {sorted.map((m) => {
            const execStatus = formatExecStatus(m.last_execution_status);
            const charts = m.charts ?? 0;
            const hasDist = m.has_district_field === true;
            const hasMap = m.has_map_fields === true;
            const isProblematic =
              m.bucket === "stale" ||
              m.bucket === "no_data" ||
              execStatus.isError ||
              charts === 0;
            const bucketColor = BUCKET_COLOR[m.bucket];
            const runDateColor = execStatus.isError ? "#ef4444" : "#10b981";

            const override = reviewOverrides.get(m.metric_id);
            const isReviewed = override !== undefined
              ? override.reviewed
              : m.metadata?.reviewed === true;
            const isSaving = savingIds.has(m.metric_id);

            const rowStyle = isReviewed
              ? { background: "rgba(16,185,129,0.04)" }
              : isProblematic
              ? { background: "rgba(239,68,68,0.06)" }
              : undefined;

            return (
              <tr key={m.metric_id} style={rowStyle}>
                <td style={{ maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={m.metric_name}>
                  {m.metric_name}
                </td>
                <td style={{ whiteSpace: "nowrap", color: "var(--text-secondary, #6b7280)" }}>
                  {m.category ?? <span style={{ color: "#9ca3af" }}>—</span>}
                </td>
                <td style={{ maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={m.template_name ?? undefined}>
                  {m.template_name ? (
                    <span style={{ color: "var(--text-secondary, #6b7280)" }}>{m.template_name}</span>
                  ) : (
                    <span style={{ color: "#9ca3af" }}>—</span>
                  )}
                </td>
                <td style={{ whiteSpace: "nowrap" }}>
                  {m.most_recent_data_date ? (
                    fmtShortDate(m.most_recent_data_date)
                  ) : (
                    <span style={{ color: "#ef4444", fontWeight: 600 }}>No data</span>
                  )}
                </td>
                <td style={{ whiteSpace: "nowrap" }}>
                  {m.days_old != null ? (
                    <span style={{ color: bucketColor, fontWeight: m.bucket !== "current" ? 600 : undefined }}>
                      {Math.round(m.days_old)}d
                    </span>
                  ) : (
                    <span style={{ color: "#6b7280" }}>—</span>
                  )}
                </td>
                <td
                  style={{ whiteSpace: "nowrap", fontSize: "0.68rem" }}
                  title={`${execStatus.label}${m.last_execution_at ? ` · ${new Date(m.last_execution_at).toLocaleString()}` : ""}`}
                >
                  <span style={{ color: runDateColor, fontWeight: execStatus.isError ? 600 : undefined }}>
                    {m.last_execution_at ? fmtShortDateTime(m.last_execution_at) : (
                      <span style={{ fontWeight: 600 }}>{execStatus.label}</span>
                    )}
                  </span>
                </td>
                <td style={{ whiteSpace: "nowrap" }}>
                  {charts === 0 ? (
                    <span style={{ color: "#ef4444", fontWeight: 600 }}>0</span>
                  ) : (
                    <span>{charts.toLocaleString()}</span>
                  )}
                </td>
                <td style={{ whiteSpace: "nowrap", textAlign: "center" }}>
                  {hasDist ? (
                    <span style={{ color: "#10b981", fontWeight: 600 }}>✓</span>
                  ) : (
                    <span style={{ color: "#6b7280" }}>—</span>
                  )}
                </td>
                <td style={{ whiteSpace: "nowrap", textAlign: "center" }}>
                  {hasMap ? (
                    <span style={{ color: "#10b981", fontWeight: 600 }}>✓</span>
                  ) : (
                    <span style={{ color: "#6b7280" }}>—</span>
                  )}
                </td>
                <td style={{ whiteSpace: "nowrap", textAlign: "center" }}>
                  <input
                    type="checkbox"
                    checked={isReviewed}
                    disabled={isSaving}
                    onChange={(e) => handleReviewToggle(m, e.target.checked)}
                    style={{ cursor: "pointer", accentColor: "#10b981" }}
                    title="Mark as reviewed"
                  />
                </td>
                <td style={{ whiteSpace: "nowrap" }}>
                  <button
                    type="button"
                    className={styles.linkBtn}
                    onClick={() => onEditMetric(m.metric_id)}
                    title="Edit metric"
                  >
                    Edit
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

interface ScheduleHealthDashboardProps {
  token: string | null;
  getAccessTokenSilently: () => Promise<string>;
  onViewJob: (jobId: string) => void;
}

interface RunSlotState {
  status: "loading" | "running" | "done" | "error";
  jobId?: string;
  error?: string;
}

export default function ScheduleHealthDashboard({
  token,
  getAccessTokenSilently,
  onViewJob,
}: ScheduleHealthDashboardProps) {
  const { isAuthenticated, user } = useAuth0();
  const [cities, setCities] = useState<CityScheduleHealth[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastLoaded, setLastLoaded] = useState<Date | null>(null);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  // Map of "cityId-periodKey" -> RunSlotState for tracking re-run status
  const [runSlots, setRunSlots] = useState<Map<string, RunSlotState>>(new Map());
  const [editingMetricId, setEditingMetricId] = useState<number | null>(null);
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  // Clean up any pending refresh timer on unmount
  useEffect(() => {
    return () => {
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    };
  }, []);

  const slotKey = (cityId: number, periodKey: string) => `${cityId}-${periodKey}`;

  const handleReRun = useCallback(
    async (cityId: number, periodKey: PeriodKey) => {
      const key = slotKey(cityId, periodKey);
      setRunSlots((prev) => new Map(prev).set(key, { status: "loading" }));
      try {
        const t = token || (await getAccessTokenSilently());
        const result = await batchExecuteMetrics(
          { city_id: cityId, schedule_key: periodKey, max_concurrent: 3 },
          t
        );
        setRunSlots((prev) =>
          new Map(prev).set(key, {
            status: "running",
            jobId: result.job_id ?? undefined,
          })
        );
        // Auto-refresh dashboard after 8 s so the new run chip appears
        if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
        refreshTimerRef.current = setTimeout(() => void load(), 8000);
      } catch (e) {
        setRunSlots((prev) =>
          new Map(prev).set(key, {
            status: "error",
            error: e instanceof Error ? e.message : "Failed to start run",
          })
        );
      }
    },
    [token, getAccessTokenSilently, load]
  );

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
            Under each city: structure (leaders, geo, shapes, population, districts, metric
            wiring). Top chip: last batch run per period. Bottom: freshness via{" "}
            <code>most_recent_data_date</code> (2d / 10d / 35d / 400d thresholds).
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
              {[...cities]
                .sort((a, b) => {
                  if (a.is_launched && !b.is_launched) return -1;
                  if (!a.is_launched && b.is_launched) return 1;
                  return a.city_name.localeCompare(b.city_name);
                })
                .map((city) => {
                const isOpen = expanded.has(city.city_id);
                return (
                  <Fragment key={city.city_id}>
                    <tr className={city.is_launched ? styles.launchedRow : undefined}>
                      <td className={styles.cityCell}>
                        <div className={styles.cityCellTop}>
                          <span
                            className={city.is_launched ? styles.launchedCityName : undefined}
                            title={city.is_launched ? "Launched" : undefined}
                          >
                            {city.city_name}
                          </span>
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
                        </div>
                        <CityStructureStrip structure={city.structure} />
                      </td>
                      {SCHEDULE_KEYS.map((col) => {
                        const slot = city.schedules[col.key];
                        const run = slot?.last_run ?? null;
                        const slotOverdue = slot?.is_overdue ?? false;
                        const exec = executionPresentation(run, slotOverdue);
                        const freshN = freshCountForPeriod(city.freshness, col.key);
                        const totalM = city.freshness.total_metrics;
                        const key = slotKey(city.city_id, col.key);
                        const runState = runSlots.get(key);
                        const isSlotBusy = runState?.status === "loading" || runState?.status === "running" || exec.running;
                        const lastRunIso = lastRunIsoForDisplay(run);
                        const lastRunTitle = lastRunIso
                          ? new Date(lastRunIso).toLocaleString()
                          : undefined;
                        const chipTitle = lastRunTitle
                          ? `${exec.label} · Last run: ${lastRunTitle}`
                          : `${exec.label} · No run in lookback`;
                        return (
                          <td key={col.key}>
                            <div className={styles.cellStack}>
                              <div
                                className={`${styles.chip} ${exec.running ? styles.chipRunning : ""}`}
                                style={{
                                  background: `${exec.dotColor}18`,
                                  border: `1px solid ${exec.dotColor}44`,
                                }}
                                title={chipTitle}
                              >
                                <div className={styles.chipTopRow}>
                                  <span
                                    className={styles.dot}
                                    style={{ background: exec.dotColor }}
                                  />
                                  <span className={styles.chipLabel}>{exec.label}</span>
                                </div>
                                <span className={styles.chipDate}>
                                  {fmtDayMonth(lastRunIso)}
                                </span>
                              </div>
                              <FreshnessBar total={totalM} fresh={freshN} />
                              <div className={styles.reRunRow}>
                                {runState?.status === "loading" ? (
                                  <span className={styles.reRunStatus}>
                                    <Loader size="sm" color="dark" /> Starting…
                                  </span>
                                ) : runState?.status === "running" && runState.jobId ? (
                                  <span className={styles.reRunStatus}>
                                    Running ·{" "}
                                    <button
                                      type="button"
                                      className={styles.linkBtn}
                                      onClick={() => onViewJob(runState.jobId!)}
                                    >
                                      Logs
                                    </button>
                                  </span>
                                ) : runState?.status === "error" ? (
                                  <span className={styles.reRunError} title={runState.error}>
                                    Failed ·{" "}
                                    <button
                                      type="button"
                                      className={styles.reRunBtn}
                                      onClick={() => void handleReRun(city.city_id, col.key)}
                                    >
                                      Retry
                                    </button>
                                  </span>
                                ) : (
                                  <button
                                    type="button"
                                    className={styles.reRunBtn}
                                    disabled={isSlotBusy}
                                    onClick={() => void handleReRun(city.city_id, col.key)}
                                    title={`Re-run ${col.label.toLowerCase()} metrics for ${city.city_name}`}
                                  >
                                    Re-run
                                  </button>
                                )}
                              </div>
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
                              <h4>
                                Metric health ({city.freshness_metrics.length} metrics)
                              </h4>
                              <MetricHealthTable
                                rows={city.freshness_metrics}
                                onEditMetric={setEditingMetricId}
                                getAccessTokenSilently={getAccessTokenSilently}
                                userId={user?.sub}
                              />
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

      {editingMetricId != null && (
        <MetricEditModal
          metricId={editingMetricId}
          isOpen
          onClose={() => setEditingMetricId(null)}
        />
      )}
    </div>
  );
}

"use client";

/**
 * CitySiteView — the Metrics tab on the city ops dashboard, and a compact
 * city list on the admin all-cities health view.
 *
 * For a scoped city (city lead or admin viewing one city):
 *   - Summary card: metric counts, structure, missing items
 *   - Jobs strip (daily/weekly/monthly/annual run health)
 *   - Category groups each with MetricRows
 *   - Hidden-metrics collapsed group
 *   - Districts row
 *
 * For admin without a city selected: compact one-row-per-city list.
 */

import { useCallback, useEffect, useState } from "react";
import { useAuth0 } from "@auth0/auth0-react";
import type { CityScheduleHealth, OpsCitySite, OpsCitySiteMetric } from "@/lib/apiClient";
import { getOpsCitySite, opsBatchExecute, updateCityMetric } from "@/lib/apiClient";
import type { ScheduleHealthScope } from "@/components/ScheduleHealthDashboard";
import { resolveLaunchStatus } from "@/lib/launchStatus";
import JobsStrip from "./JobsStrip";
import MetricDrawer from "./MetricDrawer";
import styles from "./CitySite.module.css";

// ── Toggle pill (inline — simple enough) ─────────────────────────────────

interface TogglePillProps {
  on: boolean;
  onToggle: (next: boolean) => void;
  disabled?: boolean;
}

function TogglePill({ on, onToggle, disabled }: TogglePillProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      disabled={disabled}
      onClick={(e) => { e.stopPropagation(); onToggle(!on); }}
      className={`${styles.toggle} ${on ? styles.toggleOn : styles.toggleOff}`}
      title={on ? "Public — click to hide" : "Hidden — click to publish"}
    >
      <span
        className={`${styles.toggleThumb} ${on ? styles.toggleThumbOn : styles.toggleThumbOff}`}
      />
    </button>
  );
}

// ── Single metric row ─────────────────────────────────────────────────────

interface MetricRowProps {
  metric: OpsCitySiteMetric;
  canManage: boolean;
  onOpen: (id: number) => void;
  onTogglePublic: (id: number, next: boolean) => void;
  toggling?: boolean;
}

function MetricRow({ metric, canManage, onOpen, onTogglePublic, toggling }: MetricRowProps) {
  const freshMsg = (): string => {
    if (!metric.most_recent_data_date) return "No data yet.";
    const d = metric.days_old;
    if (d == null) return `Data through ${metric.most_recent_data_date}.`;
    if (d <= 1) return "Data is current.";
    if (d <= 10) return `Data is ${Math.round(d)} days old.`;
    const src = metric.last_execution_status === "completed"
      ? " Metric ran fine — likely a source lag."
      : "";
    return `Data is ${Math.round(d)} days old.${src}`;
  };

  return (
    <div className={styles.metricRow} onClick={() => onOpen(metric.metric_id)}>
      {canManage && (
        <span className={styles.metricToggle}>
          <TogglePill
            on={metric.show_on_dash}
            onToggle={(next) => onTogglePublic(metric.metric_id, next)}
            disabled={toggling}
          />
          <span className={styles.toggleLabel}>
            {metric.show_on_dash ? "Public" : "Hidden"}
          </span>
        </span>
      )}
      <div className={styles.metricMain}>
        <div className={styles.metricName}>{metric.metric_name ?? `Metric ${metric.metric_id}`}</div>
        <div className={styles.metricMeta}>
          <span
            className={`${styles.metaTag} ${metric.has_district_field ? styles.metaTagOk : styles.metaTagWarn}`}
          >
            District {metric.has_district_field ? "✓" : "—"}
          </span>
          <span
            className={`${styles.metaTag} ${metric.has_map_fields ? styles.metaTagOk : ""}`}
          >
            Map {metric.has_map_fields ? "✓" : "—"}
          </span>
          {metric.charts > 0 && (
            <span className={styles.metaTag}>{metric.charts} chart{metric.charts !== 1 ? "s" : ""}</span>
          )}
          {metric.story_count > 0 && (
            <span className={styles.metaTag}>{metric.story_count} stor{metric.story_count !== 1 ? "ies" : "y"}</span>
          )}
        </div>
        <div className={styles.metricFreshness}>{freshMsg()}</div>
      </div>
      <span className={styles.metricChevron}>›</span>
    </div>
  );
}

// ── Single-city view ──────────────────────────────────────────────────────

interface CitySiteProps {
  cityId: number;
  scope: ScheduleHealthScope;
  onViewJob: (jobId: string) => void;
  onEditMetric?: (id: number) => void;
}

function CitySiteForCity({ cityId, scope, onViewJob, onEditMetric }: CitySiteProps) {
  const { getAccessTokenSilently } = useAuth0();
  const [site, setSite] = useState<OpsCitySite | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openMetric, setOpenMetric] = useState<number | null>(null);
  const [showHidden, setShowHidden] = useState(false);
  const [togglingId, setTogglingId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const token = await getAccessTokenSilently();
      const data = await getOpsCitySite(cityId, token);
      setSite(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load city site data");
    } finally {
      setLoading(false);
    }
  }, [cityId, getAccessTokenSilently]);

  useEffect(() => { void load(); }, [load]);

  const handleTogglePublic = useCallback(
    async (metricId: number, next: boolean) => {
      if (togglingId != null) return;
      setTogglingId(metricId);
      try {
        const token = await getAccessTokenSilently();
        await updateCityMetric(cityId, metricId, { show_on_dash: next }, token);
        setSite((s) =>
          s
            ? {
                ...s,
                categories: s.categories.map((cat) => ({
                  ...cat,
                  metrics: cat.metrics.map((m) =>
                    m.metric_id === metricId ? { ...m, show_on_dash: next } : m
                  ),
                  public_count: cat.metrics.filter(
                    (m) => m.metric_id === metricId ? next : m.show_on_dash
                  ).length,
                })),
                public_metrics: s.categories
                  .flatMap((c) => c.metrics)
                  .filter((m) => (m.metric_id === metricId ? next : m.show_on_dash)).length,
              }
            : s
        );
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not update whether this metric is public.");
      } finally {
        setTogglingId(null);
      }
    },
    [cityId, togglingId, getAccessTokenSilently]
  );

  const handleReRunFailed = useCallback(
    async (scheduleKey: string, failedIds: number[]) => {
      try {
        const token = await getAccessTokenSilently();
        await opsBatchExecute(cityId, { city_id: cityId, metric_ids: failedIds }, token);
      } catch (e) {
        console.error("Re-run failed", e);
      }
    },
    [cityId, getAccessTokenSilently]
  );

  if (loading) return <p className={styles.empty}>Loading…</p>;
  if (error) return <p style={{ color: "var(--error, #ef4444)", fontSize: "0.8rem" }}>{error}</p>;
  if (!site || site.not_found) return <p className={styles.empty}>City not found.</p>;

  const struct = site.structure;

  // Flatten all metrics to split public / hidden
  const allMetrics = site.categories.flatMap((c) => c.metrics);
  const hiddenMetrics = allMetrics.filter((m) => !m.show_on_dash);

  return (
    <div className={styles.wrap}>
      {/* Summary card */}
      <div className={styles.summaryCard}>
        <p className={styles.summaryLine}>
          <strong>{site.total_metrics}</strong> metrics,{" "}
          <strong>{site.public_metrics}</strong> public.
          {site.districts.length > 0 && (
            <> {site.districts.length} district{site.districts.length !== 1 ? "s" : ""}.</>
          )}
        </p>
        <p className={styles.summaryLine}>
          <strong>{struct.metrics_with_district_field}</strong> of {struct.metrics_total} break
          down by district. <strong>{struct.metrics_with_map_fields}</strong> have maps.
        </p>
        {site.missing_structure.length > 0 && (
          <p className={styles.missingLine}>
            Missing: {site.missing_structure.join(", ")}
            {scope.isAdmin && (
              <button type="button" className={styles.fixBtn}>
                Fix structure
              </button>
            )}
          </p>
        )}
      </div>

      {/* Jobs strip */}
      <JobsStrip
        schedules={site.schedules}
        canManage={scope.canManage}
        onViewJob={onViewJob}
        onReRunFailed={scope.canManage ? handleReRunFailed : undefined}
      />

      {/* Category groups — public metrics only */}
      {site.categories.map((cat) => {
        const publicMetrics = cat.metrics.filter((m) => m.show_on_dash);
        if (publicMetrics.length === 0) return null;
        return (
          <div key={cat.category} className={styles.categoryGroup}>
            <div className={styles.categoryHeader}>
              <span className={styles.categoryName}>{cat.category}</span>
              <a
                href={cat.permalink}
                target="_blank"
                rel="noopener noreferrer"
                className={styles.categoryLink}
                onClick={(e) => e.stopPropagation()}
              >
                ↗
              </a>
              <span className={styles.categoryCount}>
                {cat.public_count} of {cat.total} public
              </span>
            </div>
            <div className={styles.categoryMetrics}>
              {publicMetrics.map((m) => (
                <MetricRow
                  key={m.metric_id}
                  metric={m}
                  canManage={scope.canManage}
                  onOpen={setOpenMetric}
                  onTogglePublic={(id, next) => void handleTogglePublic(id, next)}
                  toggling={togglingId === m.metric_id}
                />
              ))}
            </div>
          </div>
        );
      })}

      {/* Hidden metrics */}
      {hiddenMetrics.length > 0 && (
        <div className={styles.hiddenGroup}>
          <button
            type="button"
            className={styles.hiddenToggle}
            onClick={() => setShowHidden((v) => !v)}
          >
            {showHidden ? "▼" : "▶"} {hiddenMetrics.length} hidden metric{hiddenMetrics.length !== 1 ? "s" : ""}
            {scope.canManage && " — toggle to publish"}
          </button>
          {showHidden && (
            <div className={styles.categoryMetrics} style={{ marginTop: 4 }}>
              {hiddenMetrics.map((m) => (
                <MetricRow
                  key={m.metric_id}
                  metric={m}
                  canManage={scope.canManage}
                  onOpen={setOpenMetric}
                  onTogglePublic={(id, next) => void handleTogglePublic(id, next)}
                  toggling={togglingId === m.metric_id}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Districts */}
      {site.districts.length > 0 && (
        <div className={styles.districtsWrap}>
          <span className={styles.districtsLabel}>Districts</span>
          {site.districts.map((d) => (
            <a
              key={d.district_number ?? d.id}
              href={d.permalink}
              target="_blank"
              rel="noopener noreferrer"
              className={styles.districtChip}
            >
              {d.name}
            </a>
          ))}
        </div>
      )}

      {/* Metric drawer */}
      {openMetric != null && (
        <MetricDrawer
          cityId={cityId}
          metricId={openMetric}
          canManage={scope.canManage}
          isAdmin={scope.isAdmin}
          onClose={() => setOpenMetric(null)}
          onViewJob={onViewJob}
          onEditMetric={onEditMetric}
          onTogglePublic={(id, next) => void handleTogglePublic(id, next)}
        />
      )}
    </div>
  );
}

// ── Admin compact multi-city list ─────────────────────────────────────────

type DotColor = "ok" | "partial" | "failed" | "other";
const DOT_BG: Record<DotColor, string> = {
  ok:      "#10b981",
  partial: "#f59e0b",
  failed:  "#ef4444",
  other:   "#d1d5db",
};

function cityDotColor(city: CityScheduleHealth): DotColor {
  for (const sk of ["daily_metrics", "weekly_metrics"]) {
    const slot = city.schedules?.[sk];
    if (!slot?.last_run) continue;
    const s = (slot.last_run.status ?? "").toLowerCase();
    if (s === "failed" || s === "cancelled") return "failed";
    if ((slot.last_run.metrics_failed ?? 0) > 0) return "partial";
  }
  return "ok";
}

interface AdminCompactListProps {
  cities: CityScheduleHealth[];
  onSelectCity: (id: number) => void;
}

function AdminCompactList({ cities, onSelectCity }: AdminCompactListProps) {
  if (cities.length === 0) return <p className={styles.empty}>No cities found.</p>;
  return (
    <div className={styles.compactList}>
      {cities.map((city) => {
        const launch = resolveLaunchStatus(city);
        const dot = cityDotColor(city);
        const totalM = city.freshness?.total_metrics ?? 0;
        const freshD = city.freshness?.fresh_daily ?? 0;
        return (
          <div
            key={city.city_id}
            className={styles.compactRow}
            onClick={() => onSelectCity(city.city_id)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => e.key === "Enter" && onSelectCity(city.city_id)}
          >
            <span className={styles.compactDots}>
              <span
                className={styles.compactDot}
                style={{ background: DOT_BG[dot] }}
                title="Daily/weekly run status"
              />
            </span>
            <span className={styles.compactCityName}>{city.city_name}</span>
            <span className={styles.compactSummary}>
              {totalM} metrics · {freshD} fresh today
            </span>
            <span style={{ fontSize: "0.65rem", color: "#bbb" }}>
              {launch === "launched" ? "Launched" : launch === "dark_launched" ? "Dark" : "Coming soon"}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ── Main export ───────────────────────────────────────────────────────────

interface CitySiteViewProps {
  /** Provided when the dashboard is scoped to a single city. */
  scope?: ScheduleHealthScope;
  /** Multi-city data (from the existing health load). */
  cities?: CityScheduleHealth[];
  onViewJob: (jobId: string) => void;
  onEditMetric?: (id: number) => void;
  /** Callback for admin compact list: select a city to drill into. */
  onSelectCity?: (cityId: number) => void;
}

export default function CitySiteView({
  scope,
  cities = [],
  onViewJob,
  onEditMetric,
  onSelectCity,
}: CitySiteViewProps) {
  if (scope) {
    return (
      <CitySiteForCity
        cityId={scope.cityId}
        scope={scope}
        onViewJob={onViewJob}
        onEditMetric={onEditMetric}
      />
    );
  }

  return (
    <AdminCompactList
      cities={cities}
      onSelectCity={onSelectCity ?? (() => {})}
    />
  );
}

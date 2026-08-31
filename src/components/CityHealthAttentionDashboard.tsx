"use client";

import { useMemo, useState } from "react";
import type {
  CityHealthAttentionCategory,
  CityHealthAttentionIssue,
  CityHealthAttentionSummary,
  CityHealthSuggestedAction,
  CityScheduleHealth,
} from "@/lib/apiClient";
import {
  batchExecuteMetrics,
  instantiateAllTemplates,
  restructureCity,
  retryMissingShapeLayers,
} from "@/lib/apiClient";
import { ensureCitiesAttention } from "@/lib/cityHealthAttention";
import Loader from "./Loader";
import styles from "./CityHealthAttentionDashboard.module.css";

const CATEGORIES: {
  key: CityHealthAttentionCategory;
  label: string;
  hint: string;
}[] = [
  { key: "jobs", label: "Jobs", hint: "Batch runs & metric execution" },
  { key: "data", label: "Data", hint: "Missing, stale, or chartless" },
  { key: "wiring", label: "Wiring", hint: "District fields & working status" },
  { key: "mapping", label: "Mapping", hint: "map_query / lat-lon fields" },
  { key: "structure", label: "City", hint: "Leaders, shapes, districts" },
];

const SEV_CLASS: Record<string, string> = {
  critical: styles.sevCritical,
  high: styles.sevHigh,
  medium: styles.sevMedium,
  low: styles.sevLow,
};

const SEV_DOT: Record<string, string> = {
  critical: "#FF6B5A",
  high: "var(--warning)",
  medium: "#71B2CA",
  low: "#9ca3af",
};

type ScopeFilter = "launched" | "all";

type ActionKey = string;

function actionKey(cityId: number, issue: CityHealthAttentionIssue, action: string): ActionKey {
  return `${cityId}:${issue.kind}:${issue.metric_id ?? ""}:${issue.schedule_key ?? ""}:${action}`;
}

function actionLabel(action: CityHealthSuggestedAction): string {
  switch (action) {
    case "re_run_schedule":
      return "Re-run batch";
    case "re_run_metric":
      return "Re-run metric";
    case "edit_metric":
      return "Edit";
    case "restructure_city":
      return "Restructure";
    case "retry_shapes":
      return "Retry shapes";
    case "structure_metrics":
      return "Structure metrics";
    case "review":
      return "Review";
    default:
      return "Act";
  }
}

function primaryActions(issue: CityHealthAttentionIssue): CityHealthSuggestedAction[] {
  const primary = issue.suggested_action;
  const extras: CityHealthSuggestedAction[] = [];
  if (primary === "re_run_metric" || primary === "re_run_schedule") {
    if (issue.metric_id != null) extras.push("edit_metric");
  }
  if (primary === "edit_metric" && issue.metric_id != null) {
    extras.push("re_run_metric");
  }
  if (primary === "restructure_city") {
    extras.push("structure_metrics");
  }
  return [primary, ...extras.filter((a) => a !== primary)];
}

interface Props {
  cities: CityScheduleHealth[];
  summary?: CityHealthAttentionSummary | null;
  getAccessTokenSilently: () => Promise<string>;
  onEditMetric: (metricId: number) => void;
  onViewJob?: (jobId: string) => void;
  onRefresh: () => void;
}

export default function CityHealthAttentionDashboard({
  cities,
  summary,
  getAccessTokenSilently,
  onEditMetric,
  onViewJob,
  onRefresh,
}: Props) {
  const [scope, setScope] = useState<ScopeFilter>("launched");
  const [categoryFilter, setCategoryFilter] = useState<CityHealthAttentionCategory | null>(
    null
  );
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState<Map<ActionKey, "loading" | "done" | "error">>(new Map());
  const [actionError, setActionError] = useState<string | null>(null);

  const enriched = useMemo(
    () => ensureCitiesAttention(cities, summary),
    [cities, summary]
  );

  const scopedCities = useMemo(() => {
    return enriched.cities
      .filter((c) => (scope === "launched" ? c.is_launched : true))
      .filter((c) => (c.attention?.total_issues ?? 0) > 0)
      .map((c) => {
        const attention = c.attention;
        if (!attention || !categoryFilter) return c;
        const filteredIssues = attention.issues.filter((i) => i.category === categoryFilter);
        if (filteredIssues.length === 0) return null;
        return {
          ...c,
          attention: {
            ...attention,
            issues: filteredIssues,
            total_issues: filteredIssues.length,
          },
        };
      })
      .filter((c): c is CityScheduleHealth => c != null)
      .sort((a, b) => {
        const rank = { critical: 0, high: 1, medium: 2, low: 3, ok: 4 } as const;
        const sa = rank[a.attention?.severity ?? "ok"];
        const sb = rank[b.attention?.severity ?? "ok"];
        if (sa !== sb) return sa - sb;
        return (b.attention?.total_issues ?? 0) - (a.attention?.total_issues ?? 0);
      });
  }, [enriched.cities, scope, categoryFilter]);

  const categoryTotals = useMemo(() => {
    const totals: Record<CityHealthAttentionCategory, number> = {
      jobs: 0,
      data: 0,
      wiring: 0,
      mapping: 0,
      structure: 0,
    };
    for (const c of enriched.cities) {
      if (scope === "launched" && !c.is_launched) continue;
      const counts = c.attention?.issue_counts;
      if (!counts) continue;
      for (const key of CATEGORIES) {
        totals[key.key] += counts[key.key] ?? 0;
      }
    }
    return totals;
  }, [enriched.cities, scope]);

  const needingCount = scopedCities.length;
  const totalIssues = Object.values(categoryTotals).reduce((a, b) => a + b, 0);

  const setBusyState = (key: ActionKey, state: "loading" | "done" | "error") => {
    setBusy((prev) => new Map(prev).set(key, state));
  };

  const runAction = async (
    city: CityScheduleHealth,
    issue: CityHealthAttentionIssue,
    action: CityHealthSuggestedAction
  ) => {
    const key = actionKey(city.city_id, issue, action);
    setActionError(null);

    if (action === "edit_metric") {
      if (issue.metric_id != null) onEditMetric(issue.metric_id);
      return;
    }

    setBusyState(key, "loading");
    try {
      const token = await getAccessTokenSilently();
      if (action === "re_run_schedule") {
        const result = await batchExecuteMetrics(
          {
            city_id: city.city_id,
            schedule_key: issue.schedule_key ?? "daily_metrics",
            max_concurrent: 3,
          },
          token
        );
        if (result.job_id && onViewJob) onViewJob(result.job_id);
      } else if (action === "re_run_metric") {
        const metricIds =
          issue.metric_id != null
            ? [issue.metric_id]
            : undefined;
        const result = await batchExecuteMetrics(
          {
            city_id: city.city_id,
            metric_ids: metricIds,
            max_concurrent: 3,
            schedule_key: issue.schedule_key ?? undefined,
          },
          token
        );
        if (result.job_id && onViewJob) onViewJob(result.job_id);
      } else if (action === "restructure_city") {
        const result = await restructureCity(city.city_id, undefined, token);
        if (result.job_id && onViewJob) onViewJob(String(result.job_id));
      } else if (action === "retry_shapes") {
        const result = await retryMissingShapeLayers(city.city_id, token);
        if (result.job_id && onViewJob) onViewJob(String(result.job_id));
      } else if (action === "structure_metrics") {
        await instantiateAllTemplates(city.city_id, token, { only_missing: true });
      }
      setBusyState(key, "done");
      window.setTimeout(() => onRefresh(), 2500);
    } catch (err) {
      console.error(err);
      setBusyState(key, "error");
      setActionError(err instanceof Error ? err.message : "Action failed");
    }
  };

  const toggleCity = (cityId: number) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(cityId)) next.delete(cityId);
      else next.add(cityId);
      return next;
    });
  };

  return (
    <section className={styles.wrap} aria-label="Needs attention">
      <div className={styles.header}>
        <div className={styles.titleBlock}>
          <h3 className={styles.title}>Needs attention</h3>
          <p className={styles.subtitle}>
            Incomplete or failing metrics, grouped by cause: job runs, data freshness,
            district wiring, map fields, and city structure. Act here, or start agent
            cleanup.
          </p>
        </div>
        <div className={styles.controls}>
          <div className={styles.toggle} role="group" aria-label="City scope">
            <button
              type="button"
              className={`${styles.toggleBtn} ${scope === "launched" ? styles.toggleBtnActive : ""}`}
              onClick={() => setScope("launched")}
            >
              Launched
            </button>
            <button
              type="button"
              className={`${styles.toggleBtn} ${scope === "all" ? styles.toggleBtnActive : ""}`}
              onClick={() => setScope("all")}
            >
              All cities
            </button>
          </div>
        </div>
      </div>

      <div className={styles.categoryStrip}>
        {CATEGORIES.map((cat) => {
          const count = categoryTotals[cat.key] ?? 0;
          const active = categoryFilter === cat.key;
          return (
            <button
              key={cat.key}
              type="button"
              className={`${styles.categoryCard} ${active ? styles.categoryCardActive : ""}`}
              onClick={() =>
                setCategoryFilter((prev) => (prev === cat.key ? null : cat.key))
              }
              aria-pressed={active}
              title={cat.hint}
            >
              <span className={styles.categoryLabel}>{cat.label}</span>
              <span className={styles.categoryCount}>{count}</span>
              <span className={styles.categoryHint}>{cat.hint}</span>
            </button>
          );
        })}
      </div>

      <div className={styles.summaryLine}>
        <span>
          <span
            className={styles.sevDot}
            style={{
              background:
                totalIssues === 0
                  ? "#4A7463"
                  : SEV_DOT[
                      scopedCities[0]?.attention?.severity ?? "medium"
                    ] ?? "#9ca3af",
            }}
          />
          {needingCount} {needingCount === 1 ? "city" : "cities"} · {totalIssues}{" "}
          {totalIssues === 1 ? "issue" : "issues"}
          {categoryFilter ? ` · filtered to ${categoryFilter}` : ""}
        </span>
        {scope === "launched" && (
          <span>
            {enriched.summary.launched_needing_attention} launched cities need attention
          </span>
        )}
      </div>

      {actionError && <p className={styles.actionError}>{actionError}</p>}

      {scopedCities.length === 0 ? (
        <p className={styles.empty}>
          {totalIssues === 0
            ? "All clear. No incomplete or failing metrics in this scope."
            : "No cities match this filter."}
        </p>
      ) : (
        <div className={styles.cityList}>
          {scopedCities.map((city) => {
            const attention = city.attention!;
            const isOpen = expanded.has(city.city_id);
            const sev = attention.severity;
            return (
              <div key={city.city_id} className={styles.cityCard}>
                <button
                  type="button"
                  className={styles.cityHead}
                  onClick={() => toggleCity(city.city_id)}
                  aria-expanded={isOpen}
                >
                  <span
                    className={`${styles.chevron} ${isOpen ? styles.chevronOpen : ""}`}
                    aria-hidden
                  >
                    ▶
                  </span>
                  <span
                    className={`${styles.cityName} ${
                      city.is_launched ? styles.cityNameLaunched : ""
                    }`}
                  >
                    {city.city_name}
                  </span>
                  <span className={`${styles.sevBadge} ${SEV_CLASS[sev] ?? styles.sevLow}`}>
                    {sev}
                  </span>
                  <div className={styles.countChips}>
                    {CATEGORIES.map((cat) => {
                      const n = attention.issue_counts[cat.key] ?? 0;
                      if (!n) return null;
                      const hot = cat.key === "jobs" || cat.key === "data";
                      return (
                        <span
                          key={cat.key}
                          className={`${styles.countChip} ${hot ? styles.countChipHot : ""}`}
                        >
                          {cat.label} {n}
                        </span>
                      );
                    })}
                  </div>
                </button>
                {isOpen && (
                  <div className={styles.issueBody}>
                    {attention.issues.map((issue, idx) => {
                      const actions = primaryActions(issue);
                      return (
                        <div
                          key={`${issue.kind}-${issue.metric_id ?? ""}-${issue.schedule_key ?? ""}-${idx}`}
                          className={styles.issueRow}
                        >
                          <div className={styles.issueMeta}>
                            <p className={styles.issueTitle}>{issue.title}</p>
                            {issue.detail && (
                              <p className={styles.issueDetail}>{issue.detail}</p>
                            )}
                            <div className={styles.issueTags}>
                              <span className={styles.tag}>{issue.category}</span>
                              <span className={styles.tag}>{issue.severity}</span>
                            </div>
                          </div>
                          <div className={styles.actions}>
                            {actions.map((action, actionIdx) => {
                              const key = actionKey(city.city_id, issue, action);
                              const state = busy.get(key);
                              const isPrimary = actionIdx === 0;
                              return (
                                <button
                                  key={action}
                                  type="button"
                                  className={`${styles.actionBtn} ${
                                    isPrimary ? styles.actionBtnPrimary : ""
                                  }`}
                                  disabled={state === "loading"}
                                  onClick={() => void runAction(city, issue, action)}
                                  title={actionLabel(action)}
                                >
                                  {state === "loading" ? (
                                    <span className={styles.busyNote}>
                                      <Loader size="sm" color={isPrimary ? "white" : "dark"} />
                                    </span>
                                  ) : state === "done" ? (
                                    "Started"
                                  ) : (
                                    actionLabel(action)
                                  )}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                    {attention.issues_truncated && (
                      <p className={styles.truncatedNote}>
                        Showing top issues. Expand the city schedule row below for the full
                        metric table.
                      </p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

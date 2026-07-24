/**
 * Client-side City Health attention triage.
 * Mirrors backend city_health_attention.py so the dashboard works even when
 * the API has not yet returned attention blocks.
 */

import type {
  CityHealthAttention,
  CityHealthAttentionCategory,
  CityHealthAttentionIssue,
  CityHealthAttentionSummary,
  CityHealthSuggestedAction,
  CityScheduleHealth,
} from "@/lib/apiClient";

const CATEGORIES: CityHealthAttentionCategory[] = [
  "jobs",
  "data",
  "wiring",
  "mapping",
  "structure",
];

const SEV_RANK: Record<string, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

function emptyCounts(): Record<CityHealthAttentionCategory, number> {
  return { jobs: 0, data: 0, wiring: 0, mapping: 0, structure: 0 };
}

function issue(
  partial: Omit<CityHealthAttentionIssue, "suggested_action"> & {
    suggested_action: CityHealthSuggestedAction;
  }
): CityHealthAttentionIssue {
  return partial;
}

function structureIssues(city: CityScheduleHealth): CityHealthAttentionIssue[] {
  const s = city.structure;
  if (!s) return [];
  const out: CityHealthAttentionIssue[] = [];
  if (!s.elected_officials) {
    out.push(
      issue({
        kind: "missing_leaders",
        category: "structure",
        severity: "medium",
        title: "No elected officials loaded",
        suggested_action: "restructure_city",
        detail: "city_leaders is empty",
      })
    );
  }
  if (!s.geographic_structures) {
    out.push(
      issue({
        kind: "missing_geo",
        category: "structure",
        severity: "high",
        title: "No template-linked geographic layers",
        suggested_action: "restructure_city",
        detail: "No city_shapefiles with template_layer_id",
      })
    );
  }
  if (!s.shape_layers) {
    out.push(
      issue({
        kind: "missing_shapes",
        category: "structure",
        severity: "high",
        title: "No active shape layers",
        suggested_action: "retry_shapes",
        detail: "city_shapefiles has no active rows",
      })
    );
  }
  if (!s.population_defined) {
    out.push(
      issue({
        kind: "missing_population",
        category: "structure",
        severity: "low",
        title: "City population not set",
        suggested_action: "restructure_city",
        detail: "cities.population is null",
      })
    );
  }
  if (!s.city_district_fields) {
    out.push(
      issue({
        kind: "missing_city_districts",
        category: "structure",
        severity: "high",
        title: "City district fields not configured",
        suggested_action: "restructure_city",
        detail: "district_field / district_fields missing on city",
      })
    );
  }
  return out;
}

function scheduleIssues(city: CityScheduleHealth): CityHealthAttentionIssue[] {
  const labels: Record<string, string> = {
    daily_metrics: "Daily",
    weekly_metrics: "Weekly",
    monthly_metrics: "Monthly",
    annual_metrics: "Annual",
  };
  const out: CityHealthAttentionIssue[] = [];
  for (const [sk, label] of Object.entries(labels)) {
    const slot = city.schedules?.[sk];
    if (!slot) continue;
    const last = slot.last_run;
    const overdue = !!slot.is_overdue;
    if (!last) {
      if (overdue) {
        out.push(
          issue({
            kind: "schedule_never_run",
            category: "jobs",
            severity: "high",
            title: `${label} batch never run`,
            suggested_action: "re_run_schedule",
            schedule_key: sk,
          })
        );
      }
      continue;
    }
    const status = (last.status || "").toLowerCase();
    const failedN = last.metrics_failed ?? 0;
    if (status === "failed" || status === "cancelled") {
      out.push(
        issue({
          kind: "schedule_failed",
          category: "jobs",
          severity: "critical",
          title: `${label} batch failed`,
          suggested_action: "re_run_schedule",
          schedule_key: sk,
          detail: status,
        })
      );
    } else if (failedN > 0) {
      out.push(
        issue({
          kind: "schedule_partial",
          category: "jobs",
          severity: "high",
          title: `${label} batch had ${failedN} failed metric(s)`,
          suggested_action: "re_run_schedule",
          schedule_key: sk,
          detail: (last.failed_metric_names || []).slice(0, 5).join(", ") || null,
        })
      );
    } else if (overdue && status !== "pending" && status !== "running") {
      out.push(
        issue({
          kind: "schedule_overdue",
          category: "jobs",
          severity: "medium",
          title: `${label} batch slot overdue`,
          suggested_action: "re_run_schedule",
          schedule_key: sk,
        })
      );
    }
  }
  return out;
}

function metricIssues(city: CityScheduleHealth): CityHealthAttentionIssue[] {
  const out: CityHealthAttentionIssue[] = [];
  for (const m of city.freshness_metrics || []) {
    if (m.metadata?.reviewed === true) continue;
    const name = m.metric_name;
    const status = m.last_execution_status;
    const st = (status || "").toLowerCase();

    if (st === "failed" || st === "error" || st === "timeout" || st === "cancelled") {
      out.push(
        issue({
          kind: "execution_failed",
          category: "jobs",
          severity: "critical",
          title: `${name}: last run failed`,
          suggested_action: "re_run_metric",
          metric_id: m.metric_id,
          metric_name: name,
          detail: status,
        })
      );
    } else if (!status && !m.last_execution_at) {
      out.push(
        issue({
          kind: "never_executed",
          category: "jobs",
          severity: "high",
          title: `${name}: never executed`,
          suggested_action: "re_run_metric",
          metric_id: m.metric_id,
          metric_name: name,
        })
      );
    }

    if (m.bucket === "no_data") {
      out.push(
        issue({
          kind: "no_data",
          category: "data",
          severity: "critical",
          title: `${name}: no data date`,
          suggested_action: "re_run_metric",
          metric_id: m.metric_id,
          metric_name: name,
          detail: "most_recent_data_date is null",
        })
      );
    } else if (m.bucket === "stale") {
      out.push(
        issue({
          kind: "stale_data",
          category: "data",
          severity: "medium",
          title: `${name}: stale data`,
          suggested_action: "re_run_metric",
          metric_id: m.metric_id,
          metric_name: name,
          detail: m.days_old != null ? `${Math.round(m.days_old)}d old` : "stale",
        })
      );
    }

    if (!m.has_map_fields) {
      out.push(
        issue({
          kind: "missing_map_fields",
          category: "mapping",
          severity: "medium",
          title: `${name}: missing map fields`,
          suggested_action: "edit_metric",
          metric_id: m.metric_id,
          metric_name: name,
          detail: "No map_query or lat/lon in map_config",
        })
      );
    }

    if (!m.has_district_field) {
      out.push(
        issue({
          kind: "missing_district_field",
          category: "wiring",
          severity: "medium",
          title: `${name}: no district field`,
          suggested_action: "edit_metric",
          metric_id: m.metric_id,
          metric_name: name,
        })
      );
    } else if (!m.district_working) {
      out.push(
        issue({
          kind: "district_not_working",
          category: "wiring",
          severity: "high",
          title: `${name}: district wired but not working`,
          suggested_action: "re_run_metric",
          metric_id: m.metric_id,
          metric_name: name,
          detail: "Has district field but missing data date or failed last run",
        })
      );
    }

    if ((m.charts ?? 0) === 0 && m.bucket !== "no_data") {
      out.push(
        issue({
          kind: "no_charts",
          category: "data",
          severity: "low",
          title: `${name}: no charts`,
          suggested_action: "re_run_metric",
          metric_id: m.metric_id,
          metric_name: name,
        })
      );
    }
  }
  return out;
}

function worstSeverity(issues: CityHealthAttentionIssue[]): CityHealthAttention["severity"] {
  if (issues.length === 0) return "ok";
  let best = 9;
  for (const i of issues) {
    best = Math.min(best, SEV_RANK[i.severity] ?? 9);
  }
  for (const [name, rank] of Object.entries(SEV_RANK)) {
    if (rank === best) return name as CityHealthAttention["severity"];
  }
  return "ok";
}

export function classifyCityAttention(city: CityScheduleHealth): CityHealthAttention {
  const issues = [...structureIssues(city), ...scheduleIssues(city), ...metricIssues(city)].sort(
    (a, b) =>
      (SEV_RANK[a.severity] ?? 9) - (SEV_RANK[b.severity] ?? 9) ||
      a.category.localeCompare(b.category) ||
      a.title.localeCompare(b.title)
  );
  const counts = emptyCounts();
  for (const i of issues) counts[i.category] += 1;
  return {
    severity: worstSeverity(issues),
    total_issues: issues.length,
    issue_counts: counts,
    issues: issues.slice(0, 40),
    issues_truncated: issues.length > 40,
  };
}

export function ensureCitiesAttention(
  cities: CityScheduleHealth[],
  summary?: CityHealthAttentionSummary | null
): { cities: CityScheduleHealth[]; summary: CityHealthAttentionSummary } {
  const withAttention = cities.map((c) =>
    c.attention ? c : { ...c, attention: classifyCityAttention(c) }
  );
  if (summary) return { cities: withAttention, summary };

  const by_category = emptyCounts();
  const by_severity: Record<string, number> = {
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
    ok: 0,
  };
  let needing = 0;
  let launchedNeeding = 0;
  for (const c of withAttention) {
    const a = c.attention!;
    by_severity[a.severity] = (by_severity[a.severity] ?? 0) + 1;
    if (a.total_issues > 0) {
      needing += 1;
      if (c.is_launched) launchedNeeding += 1;
    }
    for (const key of CATEGORIES) {
      by_category[key] += a.issue_counts[key] ?? 0;
    }
  }
  return {
    cities: withAttention,
    summary: {
      cities_total: withAttention.length,
      cities_needing_attention: needing,
      launched_needing_attention: launchedNeeding,
      total_issues: Object.values(by_category).reduce((a, b) => a + b, 0),
      by_category,
      by_severity,
    },
  };
}

import { describe, expect, it } from "vitest";
import type { CityScheduleHealth } from "@/lib/apiClient";
import { classifyCityAttention, ensureCitiesAttention } from "@/lib/cityHealthAttention";

function city(partial: Partial<CityScheduleHealth> = {}): CityScheduleHealth {
  return {
    city_id: 1,
    city_name: "Test City",
    is_launched: true,
    freshness: {
      total_metrics: 1,
      fresh_daily: 0,
      fresh_weekly: 0,
      fresh_monthly: 0,
      fresh_annual: 0,
      no_data: 1,
      newest_data_date: null,
      oldest_data_date: null,
    },
    freshness_metrics: [
      {
        metric_id: 9,
        metric_name: "Incidents",
        most_recent_data_date: null,
        days_old: null,
        bucket: "no_data",
        last_execution_at: null,
        last_execution_status: "failed",
        charts: 0,
        has_district_field: false,
        district_working: false,
        has_map_fields: false,
        has_precise_location: false,
        show_on_dash: true,
        metadata: {},
      },
    ],
    schedules: {
      daily_metrics: { last_run: null, recent_runs: [], is_overdue: true },
      weekly_metrics: { last_run: null, recent_runs: [], is_overdue: false },
      monthly_metrics: { last_run: null, recent_runs: [], is_overdue: false },
      annual_metrics: { last_run: null, recent_runs: [], is_overdue: false },
    },
    structure: {
      elected_officials: true,
      geographic_structures: true,
      shape_layers: true,
      population_defined: true,
      city_district_fields: true,
      counts: {
        elected_officials: 1,
        geographic_structures: 1,
        shape_layers: 1,
      },
      metrics_total: 1,
      metrics_with_district_field: 0,
      metrics_district_working: 0,
      metrics_with_map_fields: 0,
    },
    ...partial,
  };
}

describe("cityHealthAttention", () => {
  it("classifies failed jobs, missing data, wiring, and mapping", () => {
    const attention = classifyCityAttention(city());
    expect(attention.severity).toBe("critical");
    expect(attention.issue_counts.jobs).toBeGreaterThan(0);
    expect(attention.issue_counts.data).toBeGreaterThan(0);
    expect(attention.issue_counts.wiring).toBeGreaterThan(0);
    expect(attention.issue_counts.mapping).toBeGreaterThan(0);
    const kinds = new Set(attention.issues.map((i) => i.kind));
    expect(kinds.has("execution_failed")).toBe(true);
    expect(kinds.has("no_data")).toBe(true);
    expect(kinds.has("schedule_never_run")).toBe(true);
  });

  it("fills missing attention blocks via ensureCitiesAttention", () => {
    const { cities, summary } = ensureCitiesAttention([city()]);
    expect(cities[0].attention?.total_issues).toBeGreaterThan(0);
    expect(summary.cities_needing_attention).toBe(1);
    expect(summary.by_category.jobs).toBeGreaterThan(0);
  });
});

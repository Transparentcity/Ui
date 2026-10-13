import { describe, expect, it } from "vitest";
import type { CityScheduleHealth } from "@/lib/apiClient";
import {
  classifyCityAttention,
  countCriticalAlerts,
  ensureCitiesAttention,
} from "@/lib/cityHealthAttention";

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

  it("adds each civic fetch failure to attention and the red badge count", () => {
    const healthyMetrics = city({
      freshness_metrics: [],
      schedules: {
        daily_metrics: { last_run: null, recent_runs: [], is_overdue: false },
        weekly_metrics: { last_run: null, recent_runs: [], is_overdue: false },
        monthly_metrics: { last_run: null, recent_runs: [], is_overdue: false },
        annual_metrics: { last_run: null, recent_runs: [], is_overdue: false },
      },
      civic_failures: [
        {
          source_name: "City Council",
          endpoint_id: 10,
          adapter_key: "legistar",
          status: "active",
          consecutive_failures: 2,
          last_error: "503",
        },
        {
          source_name: "Mayor",
          endpoint_id: 11,
          adapter_key: "rss",
          status: "error",
          consecutive_failures: 10,
        },
        {
          source_name: "SF Standard",
          endpoint_id: 12,
          adapter_key: "civic_rss_feed",
          status: "active",
          consecutive_failures: 0,
          empty_fetch: true,
        },
      ],
    });
    const { cities, summary } = ensureCitiesAttention([healthyMetrics]);

    expect(cities[0].attention?.issue_counts.civic).toBe(3);
    expect(summary.by_category.civic).toBe(3);
    expect(countCriticalAlerts(cities)).toBe(3);
    expect(
      cities[0].attention?.issues.some((issue) => issue.kind === "civic_fetch_empty"),
    ).toBe(true);
    expect(
      cities[0].attention?.issues.map((issue) => [
        issue.endpoint_id,
        issue.suggested_action,
      ]),
    ).toEqual([
      [10, "retry_civic_source"],
      [11, "retry_civic_source"],
      [12, "retry_civic_source"],
    ]);
  });

  it("splits needing-attention counts by launch status", () => {
    const { summary } = ensureCitiesAttention([
      city({ city_id: 1, launch_status: "launched", is_launched: true }),
      city({
        city_id: 2,
        city_name: "Beta City",
        launch_status: "dark_launched",
        is_launched: false,
        is_dark_launched: true,
      }),
      city({
        city_id: 3,
        city_name: "Coming Soon",
        launch_status: "not_launched",
        is_launched: false,
      }),
    ]);
    expect(summary.launched_needing_attention).toBe(1);
    expect(summary.dark_needing_attention).toBe(1);
    expect(summary.not_launched_needing_attention).toBe(1);
    expect(summary.by_launch_status?.dark_launched).toBe(1);
  });
});

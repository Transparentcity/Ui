"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  getPublicMetricTimeSeriesSummary,
  getPublicTimeSeriesChart,
  type PublicTimeSeriesSummary,
  type PublicTimeSeriesChartPoint,
} from "@/lib/publicApiClient";
import Loader from "./Loader";
import "./CategoryBreakdown.css";

/** Same palette as TimeSeriesChart: brand primary first, then ColorBrewer Set3 */
const BAR_COLORS = [
  "#ad35fa", // Brand primary
  "#8dd3c7",
  "#ffffb3",
  "#bebada",
  "#fb8072",
  "#80b1d3",
  "#fdb462",
  "#b3de69",
  "#fccde5",
  "#d9d9d9",
  "#bc80bd",
  "#ccebc5",
];

interface CategoryField {
  field_name?: string;
  display_name?: string;
  name?: string;
  type?: string;
  [key: string]: unknown;
}

interface CategoryBreakdownProps {
  metricId: number;
  categoryFields: CategoryField[];
  /** Optional: pass when parent already has the summary to avoid duplicate request */
  timeSeriesSummary?: PublicTimeSeriesSummary | null;
}

/** Sum numeric_value by group_value across all time periods (total count per category). */
function aggregateByGroupSumAllPeriods(
  data: PublicTimeSeriesChartPoint[]
): { group_value: string; total: number }[] {
  if (!data.length) return [];
  const byGroup = new Map<string, number>();
  for (const pt of data) {
    const gv = pt.group_value != null && pt.group_value !== "" ? String(pt.group_value) : "(blank)";
    const val = Number(pt.numeric_value);
    if (!Number.isFinite(val)) continue;
    byGroup.set(gv, (byGroup.get(gv) ?? 0) + val);
  }
  return Array.from(byGroup.entries())
    .map(([group_value, total]) => ({ group_value, total }))
    .sort((a, b) => b.total - a.total);
}

function SingleGroupBreakdown({
  title,
  rows,
}: {
  title: string;
  rows: { group_value: string; total: number; pct: number }[];
}) {
  const [tableVisible, setTableVisible] = useState(false);
  const [tableExpanded, setTableExpanded] = useState(false);
  const total = rows.reduce((a, r) => a + r.total, 0);
  const top1 = rows[0];
  const top2 = rows[1];
  const maxVal = Math.max(...rows.map((r) => r.total), 1);
  const showMoreRows = rows.length > 5;
  const visibleRows = tableExpanded ? rows : rows.slice(0, 5);

  return (
    <div className="category-breakdown-block">
      <h3 className="category-breakdown-block-title">{title}</h3>
      {rows.length === 0 ? (
        <p className="category-breakdown-empty">No breakdown data for this category.</p>
      ) : (
        <>
          <div className="category-breakdown-bars" role="img" aria-label={`Bar chart: ${title}`}>
            {rows.slice(0, 12).map((r, i) => (
              <div key={r.group_value} className="category-breakdown-bar-row">
                <span className="category-breakdown-bar-label" title={r.group_value}>
                  {r.group_value}
                </span>
                <div className="category-breakdown-bar-track">
                  <div
                    className="category-breakdown-bar-fill"
                    style={{
                      width: `${(r.total / maxVal) * 100}%`,
                      backgroundColor: BAR_COLORS[i % BAR_COLORS.length],
                    }}
                  />
                </div>
                <span className="category-breakdown-bar-value">
                  {r.total.toLocaleString()} ({r.pct.toFixed(1)}%)
                </span>
              </div>
            ))}
          </div>
          {total > 0 && rows.length > 0 && (
            <p className="category-breakdown-caption">
              The top category is <strong>{top1.group_value}</strong> ({top1.pct.toFixed(1)}% of
              cases).
              {top2 && (
                <>
                  {" "}
                  The second is <strong>{top2.group_value}</strong> ({top2.pct.toFixed(1)}%).
                </>
              )}
            </p>
          )}
          <button
            type="button"
            className="category-breakdown-table-toggle"
            onClick={() => setTableVisible((v) => !v)}
          >
            {tableVisible ? "Hide table" : "Show table"}
          </button>
          {tableVisible && (
            <div className="category-breakdown-table-wrap">
              <table className="category-breakdown-table">
                <thead>
                  <tr>
                    <th>Category</th>
                    <th className="category-breakdown-th-num">Count</th>
                    <th className="category-breakdown-th-num">%</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleRows.map((r) => (
                    <tr key={r.group_value}>
                      <td>{r.group_value}</td>
                      <td className="category-breakdown-td-num">{r.total.toLocaleString()}</td>
                      <td className="category-breakdown-td-num">{r.pct.toFixed(1)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {showMoreRows && (
                <button
                  type="button"
                  className="category-breakdown-table-toggle"
                  onClick={() => setTableExpanded((e) => !e)}
                >
                  {tableExpanded ? "Show fewer" : `Show all (${rows.length})`}
                </button>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default function CategoryBreakdown({
  metricId,
  categoryFields,
  timeSeriesSummary: initialSummary,
}: CategoryBreakdownProps) {
  const summaryQuery = useQuery({
    queryKey: ["public-metric-time-series-summary", metricId],
    queryFn: () => getPublicMetricTimeSeriesSummary(metricId),
    enabled: metricId != null && !initialSummary,
    staleTime: 5 * 60 * 1000,
  });

  const summary = initialSummary ?? summaryQuery.data ?? null;

  const fieldNames = useMemo(() => {
    return categoryFields.map((f) => f.field_name || (f as { name?: string }).name || "").filter(Boolean);
  }, [categoryFields]);

  const chartIdsByField = useMemo(() => {
    if (!summary?.time_series) return new Map<string, number>();
    const map = new Map<string, number>();
    for (const ts of summary.time_series) {
      const gf = ts.group_field != null ? String(ts.group_field).trim() : "";
      if (!gf) continue;
      const district = ts.district ?? null;
      if (district !== 0 && district !== null) continue;
      if (!map.has(gf)) map.set(gf, ts.chart_id);
    }
    return map;
  }, [summary]);

  const chartsToFetch = useMemo(() => {
    return fieldNames
      .map((fieldName) => ({
        fieldName,
        displayName:
          categoryFields.find((f) => (f.field_name || (f as { name?: string }).name) === fieldName)
            ?.display_name ||
          (categoryFields.find((f) => (f.field_name || (f as { name?: string }).name) === fieldName) as { name?: string } | undefined)
            ?.name ||
          fieldName,
        chartId: chartIdsByField.get(fieldName),
      }))
      .filter((x): x is typeof x & { chartId: number } => x.chartId != null && x.chartId > 0);
  }, [fieldNames, chartIdsByField, categoryFields]);

  const chartQueries = useQuery({
    queryKey: ["category-breakdown-charts", chartsToFetch.map((c) => c.chartId).sort().join(",")],
    queryFn: async () => {
      const results = await Promise.all(
        chartsToFetch.map(async ({ chartId, fieldName, displayName }) => {
          const res = await getPublicTimeSeriesChart(chartId);
          const rows = aggregateByGroupSumAllPeriods(res.data);
          const total = rows.reduce((a, r) => a + r.total, 0);
          const withPct = rows.map((r) => ({
            ...r,
            pct: total > 0 ? (r.total / total) * 100 : 0,
          }));
          return { fieldName, displayName, rows: withPct };
        })
      );
      return results;
    },
    enabled: chartsToFetch.length > 0,
    staleTime: 5 * 60 * 1000,
  });

  const loading = summaryQuery.isLoading && !initialSummary;
  const chartsLoading = chartQueries.isLoading;
  const chartResults = chartQueries.data ?? [];

  if (loading) {
    return (
      <div className="category-breakdown">
        <div className="category-breakdown-content category-breakdown-loading">
          <Loader size="md" color="dark" />
          <span>Loading category breakdown…</span>
        </div>
      </div>
    );
  }

  if (!summary && !summaryQuery.isLoading) {
    return (
      <div className="category-breakdown">
        <div className="category-breakdown-content">
          <p className="category-breakdown-empty">No time series summary available for this metric.</p>
        </div>
      </div>
    );
  }

  if (chartsToFetch.length === 0) {
    return (
      <div className="category-breakdown">
        <div className="category-breakdown-content">
          <p className="placeholder-note">
            No grouped data by: {fieldNames.join(", ") || "—"}. Category breakdown will appear when
            group-field time series exist for this metric.
          </p>
        </div>
      </div>
    );
  }

  if (chartsLoading) {
    return (
      <div className="category-breakdown">
        <div className="category-breakdown-content category-breakdown-loading">
          <Loader size="md" color="dark" />
          <span>Loading breakdown data…</span>
        </div>
      </div>
    );
  }

  return (
    <div className="category-breakdown">
      <div className="category-breakdown-content">
        {chartResults.map(({ fieldName, displayName, rows }) => (
          <SingleGroupBreakdown
            key={fieldName}
            title={displayName || fieldName}
            rows={rows}
          />
        ))}
      </div>
    </div>
  );
}

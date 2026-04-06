"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  getPublicMetricCategoryBreakdown,
  type CategoryBreakdownFieldResult,
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
  /** @deprecated No longer used; kept for API compatibility. */
  timeSeriesSummary?: unknown;
  /** ISO date string for the start of the current comparison period (e.g. YTD start) */
  currentPeriodStart?: string | null;
  /** ISO date string for the end of the current comparison period (e.g. YTD end) */
  currentPeriodEnd?: string | null;
}

function SingleGroupBreakdown({
  title,
  field,
}: {
  title: string;
  field: CategoryBreakdownFieldResult;
}) {
  const [tableVisible, setTableVisible] = useState(false);
  const [tableExpanded, setTableExpanded] = useState(false);

  const rows = field.items.map((item) => ({
    group_value: item.group_value,
    total: item.count,
    pct: item.percent ?? 0,
  }));
  const total = field.total;
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
                      backgroundColor: BAR_COLORS[0],
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
  currentPeriodStart,
  currentPeriodEnd,
}: CategoryBreakdownProps) {
  const breakdownQuery = useQuery({
    queryKey: [
      "category-breakdown-direct",
      metricId,
      currentPeriodStart ?? "",
      currentPeriodEnd ?? "",
    ],
    queryFn: () =>
      getPublicMetricCategoryBreakdown(
        metricId,
        currentPeriodStart,
        currentPeriodEnd,
      ),
    enabled: metricId != null && categoryFields.length > 0,
    staleTime: 5 * 60 * 1000,
  });

  if (breakdownQuery.isLoading) {
    return (
      <div className="category-breakdown">
        <div className="category-breakdown-content category-breakdown-loading">
          <Loader size="md" color="dark" />
          <span>Loading category breakdown…</span>
        </div>
      </div>
    );
  }

  if (breakdownQuery.isError || !breakdownQuery.data) {
    return (
      <div className="category-breakdown">
        <div className="category-breakdown-content">
          <p className="category-breakdown-empty">
            Unable to load category breakdown data.
          </p>
        </div>
      </div>
    );
  }

  const { fields } = breakdownQuery.data;

  if (fields.length === 0) {
    return (
      <div className="category-breakdown">
        <div className="category-breakdown-content">
          <p className="placeholder-note">
            No category breakdown data available for this metric.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="category-breakdown">
      <div className="category-breakdown-content">
        {fields.map((field) => (
          <SingleGroupBreakdown
            key={field.field_name}
            title={field.display_name || field.field_name}
            field={field}
          />
        ))}
      </div>
    </div>
  );
}

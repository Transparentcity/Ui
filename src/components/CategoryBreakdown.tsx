"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  getPublicMetricCategoryBreakdown,
  type CategoryBreakdownFieldResult,
} from "@/lib/publicApiClient";
import Loader from "./Loader";
import "./CategoryBreakdown.css";

const DEFAULT_VISIBLE_ROWS = 8;

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
  const [expanded, setExpanded] = useState(false);

  const rows = field.items.map((item) => ({
    group_value: item.group_value,
    total: item.count,
    pct: item.percent ?? 0,
  }));
  const top1 = rows[0];
  const top2 = rows[1];
  const hasMoreRows = rows.length > DEFAULT_VISIBLE_ROWS;
  const visibleRows = expanded ? rows : rows.slice(0, DEFAULT_VISIBLE_ROWS);

  return (
    <div className="category-breakdown-block">
      <h3 className="category-breakdown-block-title">{title}</h3>
      {rows.length === 0 ? (
        <p className="category-breakdown-empty">No breakdown data for this category.</p>
      ) : (
        <>
          {top1 && (
            <p className="category-breakdown-caption">
              <strong>{top1.group_value}</strong> leads at {top1.pct.toFixed(1)}%
              {top2 ? (
                <>
                  , followed by <strong>{top2.group_value}</strong> at {top2.pct.toFixed(1)}%
                </>
              ) : null}
              .
            </p>
          )}
          <div className="category-breakdown-list" role="list" aria-label={title}>
            {visibleRows.map((row) => (
              <div key={row.group_value} className="category-breakdown-item" role="listitem">
                <div className="category-breakdown-item-header">
                  <span className="category-breakdown-item-label" title={row.group_value}>
                    {row.group_value}
                  </span>
                  <span className="category-breakdown-item-value">
                    <span className="category-breakdown-item-count">
                      {row.total.toLocaleString()}
                    </span>
                    <span className="category-breakdown-item-pct">
                      {row.pct.toFixed(1)}%
                    </span>
                  </span>
                </div>
                <div
                  className="category-breakdown-item-track"
                  aria-hidden="true"
                >
                  <div
                    className="category-breakdown-item-fill"
                    style={{ width: `${Math.max(row.pct, 0.5)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
          {hasMoreRows && (
            <button
              type="button"
              className="category-breakdown-expand"
              onClick={() => setExpanded((value) => !value)}
              aria-expanded={expanded}
            >
              {expanded ? "Show fewer" : `Show all ${rows.length}`}
            </button>
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

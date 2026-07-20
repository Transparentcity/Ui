"use client";

import { useState } from "react";
import { useQueries } from "@tanstack/react-query";
import {
  getPublicMetricCategoryBreakdown,
  type CategoryBreakdownFieldResult,
  type CategoryBreakdownItem,
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
  /** ISO date string for the start of the current comparison period */
  currentPeriodStart?: string | null;
  /** ISO date string for the end of the current comparison period */
  currentPeriodEnd?: string | null;
  /** ISO date string for the start of the prior comparison period */
  comparisonPeriodStart?: string | null;
  /** ISO date string for the end of the prior comparison period */
  comparisonPeriodEnd?: string | null;
  /** Short label for the prior period column (e.g. "2025") */
  priorPeriodLabel?: string;
  /** Short label for the current period column (e.g. "2026") */
  currentPeriodLabel?: string;
  /** District to scope the breakdown to; null/undefined/0 = citywide */
  district?: number | null;
}

type AlignedRow = {
  group_value: string;
  prior: CategoryBreakdownItem | null;
  current: CategoryBreakdownItem | null;
  sortKey: number;
};

function yearFromIso(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const match = /^(\d{4})/.exec(iso);
  if (!match) return null;
  const year = Number(match[1]);
  return Number.isFinite(year) ? year : null;
}

function formatDelta(current: number, prior: number): {
  text: string;
  direction: "up" | "down" | "flat" | "new" | "gone";
} {
  if (prior === 0 && current === 0) {
    return { text: "—", direction: "flat" };
  }
  if (prior === 0 && current > 0) {
    return { text: "new", direction: "new" };
  }
  if (current === 0 && prior > 0) {
    return { text: "gone", direction: "gone" };
  }
  const delta = current - prior;
  if (delta === 0) {
    return { text: "0", direction: "flat" };
  }
  const sign = delta > 0 ? "+" : "−";
  return {
    text: `${sign}${Math.abs(delta).toLocaleString()}`,
    direction: delta > 0 ? "up" : "down",
  };
}

function alignFieldRows(
  priorField: CategoryBreakdownFieldResult | undefined,
  currentField: CategoryBreakdownFieldResult | undefined,
): AlignedRow[] {
  const priorByValue = new Map(
    (priorField?.items ?? []).map((item) => [item.group_value, item]),
  );
  const currentByValue = new Map(
    (currentField?.items ?? []).map((item) => [item.group_value, item]),
  );
  const keys = new Set([...priorByValue.keys(), ...currentByValue.keys()]);

  return Array.from(keys)
    .map((group_value) => {
      const prior = priorByValue.get(group_value) ?? null;
      const current = currentByValue.get(group_value) ?? null;
      return {
        group_value,
        prior,
        current,
        sortKey: Math.max(current?.count ?? 0, prior?.count ?? 0),
      };
    })
    .sort((a, b) => b.sortKey - a.sortKey);
}

function SingleGroupBreakdown({
  title,
  priorField,
  currentField,
  priorLabel,
  currentLabel,
  hasComparison,
}: {
  title: string;
  priorField?: CategoryBreakdownFieldResult;
  currentField?: CategoryBreakdownFieldResult;
  priorLabel: string;
  currentLabel: string;
  hasComparison: boolean;
}) {
  const [expanded, setExpanded] = useState(false);

  const rows = hasComparison
    ? alignFieldRows(priorField, currentField)
    : (currentField?.items ?? []).map((item) => ({
        group_value: item.group_value,
        prior: null as CategoryBreakdownItem | null,
        current: item,
        sortKey: item.count,
      }));

  const hasMoreRows = rows.length > DEFAULT_VISIBLE_ROWS;
  const visibleRows = expanded ? rows : rows.slice(0, DEFAULT_VISIBLE_ROWS);
  const maxCount = Math.max(
    ...rows.map((row) => Math.max(row.prior?.count ?? 0, row.current?.count ?? 0)),
    1,
  );

  const topCurrent = rows[0]?.current;
  const largestSwing = hasComparison
    ? rows
        .map((row) => ({
          name: row.group_value,
          delta: (row.current?.count ?? 0) - (row.prior?.count ?? 0),
        }))
        .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))[0]
    : null;

  return (
    <div className="category-breakdown-block">
      <h3 className="category-breakdown-block-title">{title}</h3>
      {rows.length === 0 ? (
        <p className="category-breakdown-empty">No breakdown data for this category.</p>
      ) : (
        <>
          {hasComparison && largestSwing && largestSwing.delta !== 0 ? (
            <p className="category-breakdown-caption">
              Biggest change:{" "}
              <strong>{largestSwing.name}</strong>{" "}
              {largestSwing.delta > 0 ? "up" : "down"}{" "}
              {Math.abs(largestSwing.delta).toLocaleString()}
              {topCurrent ? (
                <>
                  . <strong>{topCurrent.group_value}</strong> is still the largest share
                  at {(topCurrent.percent ?? 0).toFixed(1)}%.
                </>
              ) : (
                "."
              )}
            </p>
          ) : topCurrent ? (
            <p className="category-breakdown-caption">
              <strong>{topCurrent.group_value}</strong> leads at{" "}
              {(topCurrent.percent ?? 0).toFixed(1)}%.
            </p>
          ) : null}

          {hasComparison ? (
            <div className="category-breakdown-compare-header" aria-hidden="true">
              <span className="category-breakdown-compare-spacer" />
              <span className="category-breakdown-compare-col">
                <span className="category-breakdown-swatch category-breakdown-swatch-prior" />
                {priorLabel}
              </span>
              <span className="category-breakdown-compare-col">
                <span className="category-breakdown-swatch category-breakdown-swatch-current" />
                {currentLabel}
              </span>
              <span className="category-breakdown-compare-change-label">Change</span>
            </div>
          ) : null}

          <div className="category-breakdown-list" role="list" aria-label={title}>
            {visibleRows.map((row) => {
              const priorCount = row.prior?.count ?? 0;
              const currentCount = row.current?.count ?? 0;
              const priorPct = row.prior?.percent ?? null;
              const currentPct = row.current?.percent ?? null;
              const delta = hasComparison
                ? formatDelta(currentCount, priorCount)
                : null;
              const priorWidth = Math.max((priorCount / maxCount) * 100, priorCount > 0 ? 2 : 0);
              const currentWidth = Math.max(
                (currentCount / maxCount) * 100,
                currentCount > 0 ? 2 : 0,
              );

              return (
                <div
                  key={row.group_value}
                  className="category-breakdown-item"
                  role="listitem"
                >
                  <div className="category-breakdown-item-label" title={row.group_value}>
                    {row.group_value}
                  </div>

                  {hasComparison ? (
                    <div className="category-breakdown-item-compare">
                      <div
                        className="category-breakdown-period"
                        data-period-label={priorLabel}
                      >
                        <div
                          className="category-breakdown-item-track"
                          aria-hidden="true"
                        >
                          <div
                            className="category-breakdown-item-fill category-breakdown-item-fill-prior"
                            style={{ width: `${priorWidth}%` }}
                          />
                        </div>
                        <span className="category-breakdown-item-value">
                          <span className="category-breakdown-item-count">
                            {priorCount.toLocaleString()}
                          </span>
                          {priorPct != null && (
                            <span className="category-breakdown-item-pct">
                              {priorPct.toFixed(1)}%
                            </span>
                          )}
                        </span>
                      </div>

                      <div
                        className="category-breakdown-period"
                        data-period-label={currentLabel}
                      >
                        <div
                          className="category-breakdown-item-track"
                          aria-hidden="true"
                        >
                          <div
                            className="category-breakdown-item-fill category-breakdown-item-fill-current"
                            style={{ width: `${currentWidth}%` }}
                          />
                        </div>
                        <span className="category-breakdown-item-value">
                          <span className="category-breakdown-item-count">
                            {currentCount.toLocaleString()}
                          </span>
                          {currentPct != null && (
                            <span className="category-breakdown-item-pct">
                              {currentPct.toFixed(1)}%
                            </span>
                          )}
                        </span>
                      </div>

                      {delta && (
                        <span
                          className={`category-breakdown-delta category-breakdown-delta-${delta.direction}`}
                          aria-label={`${row.group_value} change: ${delta.text}`}
                        >
                          {delta.text}
                        </span>
                      )}
                    </div>
                  ) : (
                    <div className="category-breakdown-period category-breakdown-period-solo">
                      <div className="category-breakdown-item-header">
                        <span className="category-breakdown-item-value">
                          <span className="category-breakdown-item-count">
                            {currentCount.toLocaleString()}
                          </span>
                          {currentPct != null && (
                            <span className="category-breakdown-item-pct">
                              {currentPct.toFixed(1)}%
                            </span>
                          )}
                        </span>
                      </div>
                      <div
                        className="category-breakdown-item-track"
                        aria-hidden="true"
                      >
                        <div
                          className="category-breakdown-item-fill category-breakdown-item-fill-current"
                          style={{
                            width: `${Math.max(currentPct ?? 0, currentCount > 0 ? 0.5 : 0)}%`,
                          }}
                        />
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
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
  comparisonPeriodStart,
  comparisonPeriodEnd,
  priorPeriodLabel,
  currentPeriodLabel,
  district,
}: CategoryBreakdownProps) {
  const scopedDistrict = district != null && district > 0 ? district : null;
  const hasComparison =
    Boolean(comparisonPeriodStart) && Boolean(comparisonPeriodEnd);

  const resolvedPriorLabel =
    priorPeriodLabel ||
    (yearFromIso(comparisonPeriodEnd || comparisonPeriodStart)?.toString() ??
      "Prior");
  const resolvedCurrentLabel =
    currentPeriodLabel ||
    (yearFromIso(currentPeriodEnd || currentPeriodStart)?.toString() ??
      "Current");

  const [currentQuery, priorQuery] = useQueries({
    queries: [
      {
        queryKey: [
          "category-breakdown-direct",
          metricId,
          currentPeriodStart ?? "",
          currentPeriodEnd ?? "",
          scopedDistrict ?? "",
        ],
        queryFn: () =>
          getPublicMetricCategoryBreakdown(
            metricId,
            currentPeriodStart,
            currentPeriodEnd,
            scopedDistrict,
          ),
        enabled: metricId != null && categoryFields.length > 0,
        staleTime: 5 * 60 * 1000,
      },
      {
        queryKey: [
          "category-breakdown-direct",
          metricId,
          comparisonPeriodStart ?? "",
          comparisonPeriodEnd ?? "",
          scopedDistrict ?? "",
        ],
        queryFn: () =>
          getPublicMetricCategoryBreakdown(
            metricId,
            comparisonPeriodStart,
            comparisonPeriodEnd,
            scopedDistrict,
          ),
        enabled:
          metricId != null &&
          categoryFields.length > 0 &&
          hasComparison,
        staleTime: 5 * 60 * 1000,
      },
    ],
  });

  const isLoading =
    currentQuery.isLoading || (hasComparison && priorQuery.isLoading);
  const isError = currentQuery.isError || !currentQuery.data;

  if (isLoading) {
    return (
      <div className="category-breakdown">
        <div className="category-breakdown-content category-breakdown-loading">
          <Loader size="md" color="dark" />
          <span>Loading category breakdown…</span>
        </div>
      </div>
    );
  }

  if (isError || !currentQuery.data) {
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

  const currentFields = currentQuery.data.fields;
  const priorSucceeded =
    hasComparison && Boolean(priorQuery.data) && !priorQuery.isError;
  const priorFields = priorSucceeded ? priorQuery.data!.fields : [];
  const showComparison = priorSucceeded;

  if (currentFields.length === 0 && priorFields.length === 0) {
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

  const fieldNames = Array.from(
    new Set([
      ...currentFields.map((field) => field.field_name),
      ...priorFields.map((field) => field.field_name),
    ]),
  );

  return (
    <div className="category-breakdown">
      <div className="category-breakdown-content">
        {fieldNames.map((fieldName) => {
          const currentField = currentFields.find((f) => f.field_name === fieldName);
          const priorField = priorFields.find((f) => f.field_name === fieldName);
          const title =
            currentField?.display_name ||
            priorField?.display_name ||
            fieldName;

          return (
            <SingleGroupBreakdown
              key={fieldName}
              title={title}
              priorField={priorField}
              currentField={currentField}
              priorLabel={resolvedPriorLabel}
              currentLabel={resolvedCurrentLabel}
              hasComparison={showComparison}
            />
          );
        })}
      </div>
    </div>
  );
}

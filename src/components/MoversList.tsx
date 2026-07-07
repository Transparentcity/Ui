"use client";

import { useEffect, useMemo, useState } from "react";

import type { ComparisonType } from "@/lib/apiClient";
import {
  rankMetricMovers,
  type MoverMetricInput,
  type MoverRow,
  type MoversSort,
} from "@/lib/metrics/rankMetricMovers";
import { formatMetricValue } from "@/lib/formatters";
import styles from "./MoversList.module.css";

const SORT_LABELS: Record<MoversSort, string> = {
  biggest_mover: "Biggest movers",
  most_recent: "Most recent",
  worsening: "Worsening only",
  improving: "Improving only",
};

const LIMIT_OPTIONS = [5, 10, 25] as const;

/** Period toggle options. Weekly needs a backend comparison type — deferred. */
const PERIOD_OPTIONS: Array<{ value: ComparisonType; label: string }> = [
  { value: "ytd", label: "YTD" },
  { value: "mtd", label: "MTD" },
];

const PREFS_KEY = "tc:movers-prefs";

/** Default number of movers shown before "Show more". Not persisted — every
 *  visit starts back at 5. */
const DEFAULT_LIMIT = 5;

interface MoversPrefs {
  sort: MoversSort;
}

function readPrefs(): MoversPrefs {
  const fallback: MoversPrefs = { sort: "biggest_mover" };
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.sessionStorage.getItem(PREFS_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<MoversPrefs>;
    return {
      sort:
        parsed.sort && parsed.sort in SORT_LABELS
          ? parsed.sort
          : fallback.sort,
    };
  } catch {
    return fallback;
  }
}

/** "July 6, 2026" from an ISO date, in UTC to avoid off-by-one shifts. */
function formatThroughDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** Keyword → item noun (singular/plural). Ordered: first match wins. */
const ITEM_NOUN_RULES: Array<[RegExp, { one: string; many: string }]> = [
  [/311|service request|\brequest/, { one: "request", many: "requests" }],
  [/complaint/, { one: "complaint", many: "complaints" }],
  [/\bcalls?\b/, { one: "call", many: "calls" }],
  [/permit/, { one: "permit", many: "permits" }],
  [/license/, { one: "license", many: "licenses" }],
  [/inspection/, { one: "inspection", many: "inspections" }],
  [/violation/, { one: "violation", many: "violations" }],
  [/arrest/, { one: "arrest", many: "arrests" }],
  [/citation|ticket/, { one: "citation", many: "citations" }],
  [/eviction/, { one: "eviction", many: "evictions" }],
  [/overdose/, { one: "overdose", many: "overdoses" }],
  [/collision|crash/, { one: "collision", many: "collisions" }],
  [/flight/, { one: "flight", many: "flights" }],
  [/allegation/, { one: "allegation", many: "allegations" }],
  [/application/, { one: "application", many: "applications" }],
  [/\bbusiness(es)?\b|storefront|restaurant/, { one: "business", many: "businesses" }],
  [
    /crime|theft|robbery|burglary|assault|homicide|shooting|offense|incident/,
    { one: "incident", many: "incidents" },
  ],
];

/**
 * Item noun for the sentence ("4 incidents ... vs 15 incidents last year").
 * Count metrics only — percentage/currency values read fine without a noun.
 * Returns null when no keyword matches (better no noun than a wrong one).
 */
function metricItemNoun(
  metric: MoverMetricInput,
  value: number,
): string | null {
  const unit = (metric.display_unit ?? "").toLowerCase();
  if (unit === "percentage" || unit === "currency") return null;
  const key = `${metric.metric_name} ${metric.category ?? ""}`.toLowerCase();
  for (const [pattern, noun] of ITEM_NOUN_RULES) {
    if (pattern.test(key)) {
      return Math.abs(value) === 1 ? noun.one : noun.many;
    }
  }
  return null;
}

function formatPct(pct: number): string {
  const rounded = Math.abs(pct) >= 100 ? Math.round(pct) : Math.round(pct);
  return `${rounded > 0 ? "+" : ""}${rounded}%`;
}

function formatDiff(diff: number, displayUnit?: string | null): string {
  const formatted = formatMetricValue(Math.abs(diff), displayUnit);
  return `${diff >= 0 ? "+" : "-"}${formatted}`;
}

export interface MoversListProps {
  metrics: MoverMetricInput[];
  comparisonsMap: Parameters<typeof rankMetricMovers>[0]["comparisonsMap"];
  comparisonType: ComparisonType;
  onComparisonTypeChange: (type: ComparisonType) => void;
  recencyAnchor?: string | null;
  loading?: boolean;
  /** Scope label for the section heading, e.g. "District 2" or "Bay St". */
  scopeLabel?: string | null;
  onMetricClick?: (metricId: number) => void;
}

/**
 * "What moved" module — one movers view shared by city, district, and place
 * dashboards. Stat chips, YTD/MTD toggle, and ranked rows showing prior
 * value, new value, absolute difference, and percent change.
 */
export default function MoversList({
  metrics,
  comparisonsMap,
  comparisonType,
  onComparisonTypeChange,
  recencyAnchor,
  loading = false,
  scopeLabel,
  onMetricClick,
}: MoversListProps) {
  const [prefs, setPrefs] = useState<MoversPrefs>(readPrefs);
  const [limit, setLimit] = useState<number>(DEFAULT_LIMIT);

  useEffect(() => {
    try {
      window.sessionStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
    } catch {
      // Session storage unavailable (private mode) — prefs just don't persist.
    }
  }, [prefs]);

  const { rows, totalMatching } = useMemo(
    () =>
      rankMetricMovers({
        metrics,
        comparisonsMap,
        comparisonType,
        sort: prefs.sort,
        recencyAnchor,
        limit,
      }),
    [metrics, comparisonsMap, comparisonType, prefs.sort, limit, recencyAnchor],
  );

  const heading = scopeLabel ? `${scopeLabel} movers` : "What moved";

  return (
    <section className={styles.container} aria-label={heading}>
      <div className={styles.controls}>
        <div
          className={styles.periodToggle}
          role="radiogroup"
          aria-label="Comparison period"
        >
          {PERIOD_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              role="radio"
              aria-checked={comparisonType === opt.value}
              className={`${styles.periodBtn}${comparisonType === opt.value ? ` ${styles.periodBtnActive}` : ""}`}
              onClick={() => onComparisonTypeChange(opt.value)}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <select
          className={styles.sortSelect}
          value={prefs.sort}
          onChange={(e) =>
            setPrefs((p) => ({ ...p, sort: e.target.value as MoversSort }))
          }
          aria-label="Sort movers"
        >
          {(Object.keys(SORT_LABELS) as MoversSort[]).map((s) => (
            <option key={s} value={s}>
              {SORT_LABELS[s]}
            </option>
          ))}
        </select>
      </div>

      <div className={styles.sectionLabel}>{heading.toUpperCase()}</div>

      {loading ? (
        <div className={styles.loading} role="status">
          <div className={styles.skeletonRow} />
          <div className={styles.skeletonRow} />
          <div className={styles.skeletonRow} />
        </div>
      ) : rows.length === 0 ? (
        <p className={styles.empty}>
          No significant movement in this period yet.
        </p>
      ) : (
        <ul className={styles.rows}>
          {rows.map((row) => (
            <MoverRowItem
              key={row.metric.id}
              row={row}
              comparisonType={comparisonType}
              onClick={onMetricClick}
            />
          ))}
        </ul>
      )}

      {!loading && totalMatching > limit && (
        <button
          type="button"
          className={styles.showMore}
          onClick={() =>
            setLimit((l) => LIMIT_OPTIONS.find((o) => o > l) ?? totalMatching)
          }
        >
          Show more ({totalMatching - limit} more)
        </button>
      )}
    </section>
  );
}

function MoverRowItem({
  row,
  comparisonType,
  onClick,
}: {
  row: MoverRow;
  comparisonType: ComparisonType;
  onClick?: (metricId: number) => void;
}) {
  const { metric } = row;
  const isGood = row.direction === "improving";
  const isBad = row.direction === "worsening";
  const changeClass = isGood
    ? styles.changeGood
    : isBad
      ? styles.changeBad
      : styles.changeNeutral;
  const arrow = row.diff > 0 ? "↑" : row.diff < 0 ? "↓" : "";
  // "4 incidents through July 6, 2026 vs 15 incidents last year"
  const throughDate = formatThroughDate(row.comparison.current_period_end);
  const priorPeriodLabel =
    comparisonType === "mtd" ? "last month" : "last year";
  const newNoun = metricItemNoun(metric, row.newValue);
  const priorNoun = metricItemNoun(metric, row.priorValue);

  return (
    <li className={styles.row}>
      <button
        type="button"
        className={styles.rowButton}
        onClick={() => onClick?.(metric.id)}
      >
        <span className={styles.rowMain}>
          <span className={styles.rowName}>
            {metric.metric_name}
            {row.isNew && <span className={styles.newBadge}>NEW</span>}
          </span>
          <span className={styles.rowValues}>
            <strong>
              {formatMetricValue(row.newValue, metric.display_unit)}
              {newNoun ? ` ${newNoun}` : ""}
            </strong>
            {throughDate ? ` through ${throughDate}` : ""}
            <span className={styles.rowFrom}>
              {" "}vs {formatMetricValue(row.priorValue, metric.display_unit)}
              {priorNoun ? ` ${priorNoun}` : ""} {priorPeriodLabel}
            </span>
          </span>
        </span>
        <span className={`${styles.rowChange} ${changeClass}`}>
          <span className={styles.rowChangePct}>
            {formatPct(row.pctChange)} {arrow}
          </span>
          <span className={styles.rowChangeDiff}>
            {formatDiff(row.diff, metric.display_unit)}
          </span>
        </span>
      </button>
    </li>
  );
}

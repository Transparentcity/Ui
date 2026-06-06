"use client";

import { Suspense, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";

import { useMetrics, useBatchComparisons } from "@/lib/hooks/useMetrics";
import { getWasteApiSlug, getWasteCity } from "@/lib/admin/waste/cities";
import { listPublicCitiesForSitemap } from "@/lib/publicApiClient";
import type { AdminMetricListItem } from "@/lib/apiClient";
import MetricChartsModal from "@/components/MetricChartsModal";
import styles from "./metric-values.module.css";

// Canonical waste subcategories sort first; everything else falls to the end.
const SUBCATEGORY_ORDER = [
  "procurement",
  "payroll",
  "capital",
  "service_delivery",
  "fraud_risk",
  "readout",
];

function subLabel(raw: string | null | undefined): string {
  const key = (raw ?? "").trim();
  if (!key) return "Uncategorized";
  return key.replace(/[_-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function subIndex(raw: string): number {
  const idx = SUBCATEGORY_ORDER.indexOf(raw.toLowerCase());
  return idx === -1 ? SUBCATEGORY_ORDER.length : idx;
}

function formatValue(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "—";
  const abs = Math.abs(v);
  if (abs >= 1000) {
    return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(v);
  }
  if (abs < 1 && abs > 0) {
    // Likely a ratio/share; show up to 3 significant digits.
    return v.toPrecision(3).replace(/\.?0+$/, "");
  }
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(v);
}

type Trend = { pct: number; dir: "up" | "down" | "flat" } | null;

function computeTrend(current: number | null | undefined, prior: number | null | undefined): Trend {
  if (current == null || prior == null || !Number.isFinite(current) || !Number.isFinite(prior)) return null;
  if (prior === 0) return null;
  const pct = ((current - prior) / Math.abs(prior)) * 100;
  if (!Number.isFinite(pct)) return null;
  const dir = Math.abs(pct) < 0.05 ? "flat" : pct > 0 ? "up" : "down";
  return { pct, dir };
}

type StatusKind = "completed" | "failed" | "running" | "never";
function statusKind(status?: string | null): StatusKind {
  const s = (status ?? "").toLowerCase();
  if (s === "completed") return "completed";
  if (s === "failed" || s === "timeout" || s === "cancelled") return "failed";
  if (s === "running" || s === "pending") return "running";
  return "never";
}

function MetricValuesView() {
  const params = useSearchParams();
  const [openMetric, setOpenMetric] = useState<AdminMetricListItem | null>(null);

  // City comes from the same ?city= param the rest of the admin waste UI uses.
  // getWasteApiSlug maps "sf" -> "san-francisco", which matches the public
  // sitemap slug, so we can resolve the metrics DB city id from there. (The
  // admin layout has no WasteCityProvider, so we read the sitemap directly.)
  const cityParam = params.get("city");
  const apiSlug = getWasteApiSlug(cityParam);
  const cityName = getWasteCity(cityParam).name;

  const citiesQ = useQuery({
    queryKey: ["public", "cities", "sitemap"],
    queryFn: listPublicCitiesForSitemap,
    staleTime: 5 * 60 * 1000,
  });

  const cityId = useMemo(() => {
    const match = (citiesQ.data ?? []).find((c) => c.slug === apiSlug);
    return match ? Number(match.id) : null;
  }, [citiesQ.data, apiSlug]);

  // city_id: -1 returns no metrics while the city id is unresolved, so we never
  // accidentally show every city's (and template) metrics.
  const metricsQ = useMetrics({ category: "waste", city_id: cityId ?? -1 });
  const metrics = useMemo(() => (cityId ? metricsQ.data ?? [] : []), [cityId, metricsQ.data]);

  const metricIds = useMemo(
    () => metrics.map((m) => m.id).filter((id): id is number => !!id),
    [metrics],
  );
  const batchRequest = useMemo(
    () => (metricIds.length ? { metric_ids: metricIds, district: null, comparison_types: ["ytd" as const] } : null),
    [metricIds],
  );
  const { data: comparisons, isLoading: comparisonsLoading } = useBatchComparisons(batchRequest);

  const groups = useMemo(() => {
    const bySub = new Map<string, AdminMetricListItem[]>();
    for (const m of metrics) {
      const key = (m.subcategory ?? "").trim().toLowerCase() || "uncategorized";
      if (!bySub.has(key)) bySub.set(key, []);
      bySub.get(key)!.push(m);
    }
    return Array.from(bySub.entries())
      .map(([key, items]) => ({
        key,
        label: subLabel(key),
        items: items.sort((a, b) => a.metric_name.localeCompare(b.metric_name)),
      }))
      .sort((a, b) => subIndex(a.key) - subIndex(b.key) || a.label.localeCompare(b.label));
  }, [metrics]);

  const citySlug = cityId ? apiSlug : null;

  function valueLabel(m: AdminMetricListItem, value: number | null): string {
    if (value != null) return formatValue(value);
    const kind = statusKind(m.last_execution_status);
    if (comparisonsLoading) return "…";
    if (kind === "failed") return "Run failed";
    if (kind === "never") return "Not run yet";
    if (kind === "running") return "Running…";
    return "No value";
  }

  const cityUnresolved = !citiesQ.isLoading && cityId == null;

  return (
    <div className={styles.page} data-testid="waste-metric-values-page">
      <div className={styles.header}>
        <p className={styles.subtitle}>
          Waste-category metrics for {cityName}, with year-to-date value and change vs the prior
          year-to-date. Shown regardless of the public dashboard (show-on-dash) setting. Click any
          metric for its full chart and history.
        </p>
      </div>

      {cityUnresolved ? (
        <div className={styles.empty}>
          <p className={styles.emptyTitle}>No metrics catalog for {cityName}</p>
          <p className={styles.emptyText}>
            This city isn&apos;t in the launched metrics list, so there are no waste metrics to show
            here yet.
          </p>
        </div>
      ) : metricsQ.isLoading || citiesQ.isLoading ? (
        <p className={styles.subtitle}>Loading metrics…</p>
      ) : metricsQ.error ? (
        <div className={styles.empty}>
          <p className={styles.emptyTitle}>Couldn&apos;t load metrics</p>
          <p className={styles.emptyText}>{(metricsQ.error as Error).message}</p>
        </div>
      ) : metrics.length === 0 ? (
        <div className={styles.empty}>
          <p className={styles.emptyTitle}>No waste metrics for {cityName} yet</p>
          <p className={styles.emptyText}>
            Metrics tagged category=waste for this city appear here once created and activated.
          </p>
        </div>
      ) : (
        groups.map((group) => (
          <section key={group.key} className={styles.categoryBlock} data-subcategory={group.key}>
            <div className={styles.categoryHeader}>
              <h3 className={styles.categoryLabel}>{group.label}</h3>
              <span className={styles.count}>{group.items.length}</span>
            </div>
            <div className={styles.grid}>
              {group.items.map((m) => {
                const comp = comparisons?.[m.id]?.ytd;
                const value = comp?.current_period_value ?? null;
                const trend = computeTrend(comp?.current_period_value, comp?.comparison_period_value);
                const kind = statusKind(m.last_execution_status);
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setOpenMetric(m)}
                    className={`${styles.card} ${!m.is_active ? styles.cardInactive : ""}`}
                  >
                    <div className={styles.cardName}>{m.metric_name}</div>
                    <div className={styles.valueRow}>
                      <span
                        className={value != null ? styles.value : styles.valueEmpty}
                        title={value != null ? String(value) : undefined}
                      >
                        {valueLabel(m, value)}
                      </span>
                      {trend && (
                        <span className={styles.trend} title="Change vs prior year-to-date">
                          {trend.dir === "up" ? "↑" : trend.dir === "down" ? "↓" : "→"}{" "}
                          {Math.abs(trend.pct).toFixed(1)}%
                        </span>
                      )}
                    </div>
                    <div className={styles.metaRow}>
                      <span
                        className={`${styles.chip} ${
                          kind === "completed"
                            ? styles.chipOk
                            : kind === "failed"
                            ? styles.chipFail
                            : styles.chipNever
                        }`}
                      >
                        {kind === "completed"
                          ? "Completed"
                          : kind === "failed"
                          ? "Failed"
                          : kind === "running"
                          ? "Running"
                          : "Never run"}
                      </span>
                      {m.metric_type && <span className={styles.chip}>{m.metric_type}</span>}
                      {!m.is_active && <span className={styles.chip}>Inactive</span>}
                    </div>
                  </button>
                );
              })}
            </div>
          </section>
        ))
      )}

      <MetricChartsModal
        metricId={openMetric?.id ?? null}
        isOpen={openMetric !== null}
        onClose={() => setOpenMetric(null)}
        metricKey={openMetric?.metric_key ?? null}
        citySlug={citySlug}
      />
    </div>
  );
}

export default function WasteMetricValuesPage() {
  return (
    <Suspense fallback={<div className={styles.page} />}>
      <MetricValuesView />
    </Suspense>
  );
}

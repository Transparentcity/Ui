"use client";

import { Suspense, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";

import { useMetrics, useBatchComparisons } from "@/lib/hooks/useMetrics";
import { getWasteApiSlug, getWasteCity } from "@/lib/admin/waste/cities";
import { listPublicCitiesForSitemap } from "@/lib/publicApiClient";
import type { AdminMetricListItem } from "@/lib/apiClient";
import MetricChartsModal from "@/components/MetricChartsModal";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

// The admin waste UI selects its city via the ?city= param using abbreviated
// ids from the WASTE_CITIES catalog (e.g. "sf"). The metrics catalog is keyed
// by the public sitemap slug + DB id, so we bridge abbrev -> public slug here.
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
  const cityUnresolved = !citiesQ.isLoading && cityId == null;

  function valueLabel(m: AdminMetricListItem, value: number | null): string {
    if (value != null) return formatValue(value);
    const kind = statusKind(m.last_execution_status);
    if (comparisonsLoading) return "…";
    if (kind === "failed") return "Run failed";
    if (kind === "never") return "Not run yet";
    if (kind === "running") return "Running…";
    return "No value";
  }

  const emptyBox = (title: string, body: string) => (
    <div className="rounded-lg border border-dashed border-gray-300 bg-white p-8 text-center">
      <p className="text-sm font-semibold text-gray-700">{title}</p>
      <p className="mt-1 text-xs text-gray-500">{body}</p>
    </div>
  );

  return (
    <div className="px-8 py-6" data-testid="waste-metric-values-page">
      <p className="mb-5 text-sm text-gray-500">
        Waste-category metrics for {cityName}, with year-to-date value and change vs the prior
        year-to-date. Shown regardless of the public dashboard (show-on-dash) setting. Click any
        metric for its full chart and history.
      </p>

      {cityUnresolved ? (
        emptyBox(
          `No metrics catalog for ${cityName}`,
          "This city isn't in the launched metrics list, so there are no waste metrics to show here yet.",
        )
      ) : metricsQ.isLoading || citiesQ.isLoading ? (
        <p className="text-sm text-gray-500">Loading metrics…</p>
      ) : metricsQ.error ? (
        emptyBox("Couldn't load metrics", (metricsQ.error as Error).message)
      ) : metrics.length === 0 ? (
        emptyBox(
          `No waste metrics for ${cityName} yet`,
          "Metrics tagged category=waste for this city appear here once created and activated.",
        )
      ) : (
        <div className="space-y-6">
          {groups.map((group) => (
            <section key={group.key} data-subcategory={group.key}>
              <div className="flex items-baseline gap-2 mb-2">
                <h2 className="text-sm font-semibold text-gray-900">{group.label}</h2>
                <span className="font-mono text-xs text-gray-400">{group.items.length}</span>
              </div>
              <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(240px,1fr))]">
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
                      className={cn(
                        "flex flex-col gap-2 rounded-lg border border-gray-200 bg-white p-3.5 text-left transition hover:border-purple-300 hover:shadow-sm",
                        !m.is_active && "opacity-60",
                      )}
                    >
                      <div className="text-sm font-semibold text-gray-900 leading-snug">
                        {m.metric_name}
                      </div>
                      <div className="flex items-baseline gap-2">
                        <span
                          className={cn(
                            value != null
                              ? "text-2xl font-semibold tracking-tight text-gray-900"
                              : "text-sm text-gray-400",
                          )}
                          title={value != null ? String(value) : undefined}
                        >
                          {valueLabel(m, value)}
                        </span>
                        {trend && (
                          <span className="font-mono text-xs text-gray-500" title="Change vs prior year-to-date">
                            {trend.dir === "up" ? "↑" : trend.dir === "down" ? "↓" : "→"}{" "}
                            {Math.abs(trend.pct).toFixed(1)}%
                          </span>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Badge
                          variant="outline"
                          className={cn(
                            "px-2 py-0.5",
                            kind === "completed"
                              ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                              : kind === "failed"
                              ? "bg-red-50 text-red-700 border-red-200"
                              : "bg-gray-100 text-gray-600 border-gray-200",
                          )}
                        >
                          {kind === "completed"
                            ? "Completed"
                            : kind === "failed"
                            ? "Failed"
                            : kind === "running"
                            ? "Running"
                            : "Never run"}
                        </Badge>
                        {m.metric_type && (
                          <Badge variant="outline" className="px-2 py-0.5 capitalize">
                            {m.metric_type}
                          </Badge>
                        )}
                        {!m.is_active && (
                          <Badge variant="secondary" className="px-2 py-0.5">
                            Inactive
                          </Badge>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
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
    <Suspense fallback={<div className="px-8 py-6" />}>
      <MetricValuesView />
    </Suspense>
  );
}

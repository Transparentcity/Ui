"use client"

import { useMemo } from "react"
import {
  useMetrics,
  useBatchComparisons,
  useWasteLatestValues,
} from "@/lib/hooks/useMetrics"
import type { AdminMetricListItem } from "@/lib/apiClient"

/**
 * Waste metrics (category="waste") grouped onto the waste module's category
 * tabs. Metric subcategories come from the metric rows themselves; the
 * mapping mirrors how the detector categories are organized. "readout"
 * metrics are findings-count KPIs and are intentionally excluded (the
 * category cards already show findings counts).
 */
const SUBCATEGORY_TO_MODULE_CATEGORY: Record<string, string> = {
  procurement: "contracts",
  payroll: "payroll",
  payroll_integrity: "payroll",
  capital: "infrastructure",
  service_delivery: "infrastructure",
  fraud_risk: "convergence",
}

/**
 * Numerator/denominator plumbing metrics exist only to feed derived shares;
 * a bare "Total Contract Dollars (Denominator)" chip tells a reader nothing,
 * so they never surface in the module.
 */
const HELPER_METRIC_RE = /\((numerator|denominator)\)/i

export interface WasteKeyMetric {
  id: number
  metricKey: string | null
  name: string
  subcategory: string
  /** Latest (YTD current-period) value, when the metric has one. */
  value: number | null
  trend: { pct: number; dir: "up" | "down" | "flat" } | null
  status: "completed" | "failed" | "running" | "never"
  /** Most recent data date on the stored series ("data through"), if known. */
  asOf: string | null
  /**
   * Where `value`/`trend` came from: the precomputed comparison ("comparison")
   * or the latest stored series point ("latest", a display fallback when the
   * comparison is missing). Null when there is no value.
   */
  basis: "comparison" | "latest" | null
}

function statusKind(status?: string | null): WasteKeyMetric["status"] {
  const s = (status ?? "").toLowerCase()
  if (s === "completed" || s === "success") return "completed"
  if (s === "failed" || s === "error") return "failed"
  if (s === "running" || s === "pending") return "running"
  return "never"
}

function computeTrend(
  current: number | null | undefined,
  prior: number | null | undefined,
): WasteKeyMetric["trend"] {
  if (
    current == null ||
    prior == null ||
    !Number.isFinite(current) ||
    !Number.isFinite(prior) ||
    prior === 0
  ) {
    return null
  }
  const pct = ((current - prior) / Math.abs(prior)) * 100
  if (!Number.isFinite(pct)) return null
  const dir = Math.abs(pct) < 0.05 ? "flat" : pct > 0 ? "up" : "down"
  return { pct, dir }
}

/** Compact display for metric values (mirrors the admin metric-values page). */
export function formatMetricValue(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "—"
  const abs = Math.abs(v)
  if (abs >= 1000) {
    return new Intl.NumberFormat("en-US", {
      notation: "compact",
      maximumFractionDigits: 1,
    }).format(v)
  }
  if (abs < 1 && abs > 0) {
    return v.toPrecision(3).replace(/\.?0+$/, "")
  }
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 }).format(v)
}

/**
 * Share/percentage metrics, until the backend carries a display unit, are
 * recognizable only by name. Ratios stored as fractions (0.15) display as
 * "15%"; values already on a 0–100 scale keep their magnitude.
 */
const SHARE_NAME_RE = /\bshare\b|% of|percent|\(%/i

export function isShareMetric(name: string): boolean {
  return SHARE_NAME_RE.test(name)
}

/**
 * Name-aware display: share metrics get an explicit % (so "Sole-Source
 * Contract Share" reads "15%" instead of a bare "0.15"); everything else
 * falls through to the compact number.
 */
export function formatWasteMetricValue(
  v: number | null | undefined,
  name: string,
): string {
  if (v == null || !Number.isFinite(v)) return "—"
  if (isShareMetric(name)) {
    const pct = Math.abs(v) <= 1.5 ? v * 100 : v
    const digits = Math.abs(pct) >= 10 ? 0 : 1
    return `${new Intl.NumberFormat("en-US", { maximumFractionDigits: digits }).format(pct)}%`
  }
  return formatMetricValue(v)
}

/**
 * All waste metrics for a city, grouped by module category, with YTD values
 * and trends. One shared query pair: the categories grid and every category
 * detail strip read the same cache entries.
 */
export function useWasteKeyMetrics(cityId: number | null) {
  const metricsQuery = useMetrics(
    { category: "waste", city_id: cityId ?? -1 },
    { enabled: cityId != null },
  )
  const metrics = useMemo<AdminMetricListItem[]>(
    () => (cityId != null ? metricsQuery.data ?? [] : []),
    [cityId, metricsQuery.data],
  )

  const metricIds = useMemo(
    () => metrics.map((m) => m.id).filter((id): id is number => !!id),
    [metrics],
  )
  const batchRequest = useMemo(
    () =>
      metricIds.length
        ? {
            metric_ids: metricIds,
            district: null,
            comparison_types: ["ytd" as const],
          }
        : null,
    [metricIds],
  )
  const comparisonsQuery = useBatchComparisons(batchRequest)
  const comparisons = comparisonsQuery.data

  // Metrics that have run and hold data but whose precomputed comparison is
  // missing (the known year-grain comparison gap): read their latest stored
  // value straight from the series so the chip shows a real number instead of
  // "no data yet". Only these ids are fetched, so the extra calls are bounded.
  const fallbackIds = useMemo(
    () =>
      metrics
        .filter((m) => {
          const sub = (m.subcategory ?? "").trim().toLowerCase()
          if (!SUBCATEGORY_TO_MODULE_CATEGORY[sub]) return false
          if (HELPER_METRIC_RE.test(m.metric_name)) return false
          if (statusKind(m.last_execution_status) !== "completed") return false
          if (!m.most_recent_data_date) return false
          const cv = comparisons?.[m.id]?.ytd?.current_period_value
          return cv == null || !Number.isFinite(cv)
        })
        .map((m) => m.id),
    [metrics, comparisons],
  )
  const { latestById, isLoading: latestLoading } =
    useWasteLatestValues(fallbackIds)

  const byCategory = useMemo(() => {
    const grouped: Record<string, WasteKeyMetric[]> = {}
    for (const m of metrics) {
      const sub = (m.subcategory ?? "").trim().toLowerCase()
      const moduleCategory = SUBCATEGORY_TO_MODULE_CATEGORY[sub]
      if (!moduleCategory) continue
      if (HELPER_METRIC_RE.test(m.metric_name)) continue
      const comp = comparisons?.[m.id]?.ytd
      const compValue = comp?.current_period_value
      const hasComp = compValue != null && Number.isFinite(compValue)

      let value = hasComp ? compValue! : null
      let trend = hasComp
        ? computeTrend(compValue, comp?.comparison_period_value)
        : null
      let asOf = m.most_recent_data_date ?? null
      let basis: WasteKeyMetric["basis"] = hasComp ? "comparison" : null

      // Fallback: no comparison but the series has data — show its latest point.
      if (!hasComp) {
        const latest = latestById[m.id]
        if (latest && latest.value != null && Number.isFinite(latest.value)) {
          value = latest.value
          trend = computeTrend(latest.value, latest.prior)
          asOf = latest.asOf ?? asOf
          basis = "latest"
        }
      }

      const entry: WasteKeyMetric = {
        id: m.id,
        metricKey: m.metric_key ?? null,
        name: m.metric_name,
        subcategory: sub,
        value,
        trend,
        status: statusKind(m.last_execution_status),
        asOf,
        basis,
      }
      if (!grouped[moduleCategory]) grouped[moduleCategory] = []
      grouped[moduleCategory].push(entry)
    }
    // Valued metrics first, then alphabetical, so the best chips lead.
    for (const list of Object.values(grouped)) {
      list.sort(
        (a, b) =>
          Number(b.value != null) - Number(a.value != null) ||
          a.name.localeCompare(b.name),
      )
    }
    return grouped
  }, [metrics, comparisons, latestById])

  return {
    byCategory,
    isLoading: metricsQuery.isLoading,
    valuesLoading: comparisonsQuery.isLoading || latestLoading,
  }
}

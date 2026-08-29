"use client"

import { useMemo } from "react"
import Link from "next/link"
import { useLatestPersistedWasteResult } from "@/lib/hooks/useWaste"
import {
  useWasteKeyMetrics,
  formatWasteMetricValue,
} from "@/lib/hooks/useWasteKeyMetrics"
import { TrendingUp, TrendingDown, ArrowRight } from "lucide-react"
import { WasteShell } from "./waste-shell"
import { ForensicsShell } from "./forensics-shell"
import { WasteRefreshPanel } from "./waste-refresh-panel"
import { useWasteCity } from "./WasteCityContext"
import {
  normalizeWasteCategory,
  formatDollar,
  findingAggregateAmount,
} from "./waste-utils"

const CATEGORY_META: Record<
  string,
  {
    label: string
    description: string
  }
> = {
  payroll: {
    label: "Payroll & Personnel",
    description: "Overtime anomalies, compensation patterns, ghost employees, and personnel integrity issues",
  },
  contracts: {
    label: "Contracts & Procurement",
    description: "Vendor concentration, split purchase orders, ghost vendors, contract drift, and address matching",
  },
  infrastructure: {
    label: "Infrastructure & Services",
    description: "311 service clusters, pavement failure hotspots, and geographic service pattern analysis",
  },
  influence: {
    label: "Influence & Pay-to-Play",
    description: "Campaign contribution patterns, lobbying disclosure gaps, and political influence networks",
  },
  integrity: {
    label: "Personnel Integrity",
    description: "Conflict of interest indicators, outside employment violations, and ethical compliance",
  },
  confirmed: {
    label: "Confirmed Cases",
    description: "Previously confirmed fraud, waste, and abuse cases for pattern learning and calibration",
  },
  convergence: {
    label: "Cross-Domain Convergence",
    description: "Entities flagged across multiple independent detector categories indicating systemic risk",
  },
  // Rendered only when findings actually land in it (an unrecognized backend
  // category), so misrouted findings are visible instead of polluting payroll.
  uncategorized: {
    label: "Uncategorized",
    description: "Findings whose backend category isn't recognized by this UI yet",
  },
}

const DATA_FONT = { fontFamily: "var(--font-data)" } as const
const HEADING_FONT = {
  fontFamily: "var(--font-heading)",
  fontWeight: 800,
  letterSpacing: "-0.02em",
} as const

export function ForensicsCategoriesPage() {
  const { selectedCityId: cityId, selectedCityName } = useWasteCity()
  const {
    data: analysisData,
    isLoading,
    isError,
    error,
  } = useLatestPersistedWasteResult(cityId)
  const allFindings = useMemo(
    () => analysisData?.findings ?? [],
    [analysisData],
  )
  // analysisData === null means no completed run exists for this city yet:
  // a first-run state, not "the city is clean". A query error means we
  // don't know either way and must not invite an unnecessary refresh run.
  const hasNoRuns = !isLoading && !isError && analysisData == null

  // One headline metric per category card: the underlying citywide number
  // (e.g. overtime share on the payroll card) next to the findings count.
  const { byCategory: keyMetricsByCategory } = useWasteKeyMetrics(cityId)

  const categoryCounts = useMemo(() => {
    const counts: Record<string, { total: number; critical: number; amount: number }> = {}
    allFindings.forEach((f) => {
      const cat = normalizeWasteCategory(f.category)
      if (!counts[cat]) counts[cat] = { total: 0, critical: 0, amount: 0 }
      counts[cat].total++
      if (f.severity === "critical" || f.severity === "high") counts[cat].critical++
      // Cap/override-aware: confirmed-case secondaries carry
      // amount_for_aggregate=0 and capped findings carry the cap value, so
      // summing raw `amount` would overstate category exposure.
      counts[cat].amount += findingAggregateAmount(f)
    })
    return counts
  }, [allFindings])

  const categoryKeys = Object.keys(CATEGORY_META).filter(
    (key) => key !== "uncategorized" || (categoryCounts[key]?.total ?? 0) > 0,
  )

  return (
    <WasteShell
      title="Findings"
      description="Browse and investigate detected anomalies"
    >
      <ForensicsShell>
        {isLoading ? (
          <div className="space-y-px">
            {[1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className="h-[72px] bg-gray-100 rounded animate-pulse"
              />
            ))}
          </div>
        ) : isError ? (
          <p
            className="max-w-lg mx-auto mt-8 text-sm text-red-600 text-center"
            role="alert"
          >
            Couldn&apos;t load findings for {selectedCityName}:{" "}
            {error instanceof Error ? error.message : "Unknown error"}. Reload
            to retry.
          </p>
        ) : hasNoRuns ? (
          <div className="max-w-lg mx-auto mt-8 bg-white rounded-xl border border-gray-200 p-6 text-center">
            <h3 className="text-base font-semibold text-gray-900 mb-1">
              No analysis has run for {selectedCityName} yet
            </h3>
            <p className="text-sm text-gray-500 mb-4">
              Findings appear here after the weekly waste refresh completes
              its first run for this city. You can start one now:
            </p>
            <div className="text-left border border-gray-200 rounded-lg">
              <WasteRefreshPanel />
            </div>
          </div>
        ) : (
          <div>
            {/* Band header: section label + right-aligned column headers. */}
            <div
              className="flex items-center px-3 py-[10px] border-t border-b"
              style={{ background: "#f8f9fa", borderColor: "#e5e7eb" }}
            >
              <span
                className="flex-1 text-[12px] font-bold uppercase"
                style={{ color: "#6b7280", letterSpacing: "0.06em" }}
              >
                Analysis Categories
              </span>
              <div className="hidden md:flex items-center shrink-0">
                <span
                  className="w-[110px] text-right text-[11px] uppercase"
                  style={{ color: "#9ca3af" }}
                >
                  Findings
                </span>
                <span
                  className="w-[110px] text-right text-[11px] uppercase"
                  style={{ color: "#9ca3af" }}
                >
                  High+
                </span>
                <span
                  className="w-[190px] text-right text-[11px] uppercase"
                  style={{ color: "#9ca3af" }}
                >
                  Exposure
                </span>
                <span className="w-[96px]" aria-hidden />
              </div>
            </div>

            {/* One row per category. */}
            {categoryKeys.map((key) => {
              const meta = CATEGORY_META[key]
              const counts = categoryCounts[key] ?? {
                total: 0,
                critical: 0,
                amount: 0,
              }
              const categoryMetrics = keyMetricsByCategory[key] ?? []
              const headline = categoryMetrics.find((m) => m.value != null)
              // Metrics exist but none has a value yet: say so instead of
              // going silently blank (reads as "no signal" otherwise).
              const metricsPending = !headline && categoryMetrics.length > 0
              return (
                <Link
                  key={key}
                  href={`/waste/categories/${key}`}
                  className="group flex flex-col md:flex-row md:items-start gap-2 px-3 py-4 no-underline border-b hover:bg-gray-50/60 transition-colors"
                  style={{ borderColor: "#f3f4f6" }}
                >
                  {/* Left: label + description + (optional) headline metric */}
                  <div className="flex-1 min-w-0">
                    <h3
                      className="text-[#111827]"
                      style={{ ...HEADING_FONT, fontSize: "15.5px" }}
                    >
                      {meta.label}
                    </h3>
                    <p className="text-[13px] mt-0.5" style={{ color: "#6b7280" }}>
                      {meta.description}
                    </p>
                    {headline && (
                      <p
                        className="mt-2 flex items-center gap-1.5 text-xs text-gray-500"
                        data-testid={`headline-metric-${key}`}
                      >
                        <span className="truncate max-w-[220px]">
                          {headline.name}
                        </span>
                        <span className="font-semibold text-gray-700 tabular-nums">
                          {formatWasteMetricValue(headline.value, headline.name)}
                        </span>
                        {headline.trend?.dir === "up" && (
                          <TrendingUp className="w-3 h-3 text-gray-400" />
                        )}
                        {headline.trend?.dir === "down" && (
                          <TrendingDown className="w-3 h-3 text-gray-400" />
                        )}
                      </p>
                    )}
                    {metricsPending && (
                      <p
                        className="mt-2 text-xs italic text-gray-400"
                        data-testid={`headline-pending-${key}`}
                      >
                        {categoryMetrics.some((m) => m.status === "failed")
                          ? "Key metrics unavailable (calculation failed)"
                          : "Key metrics awaiting first run"}
                      </p>
                    )}
                  </div>

                  {/* Right: aligned numeric columns + Analyze link. */}
                  <div className="flex items-center md:items-start shrink-0 gap-x-4 md:gap-x-0">
                    <span
                      className="md:w-[110px] text-right text-[15px] font-bold tabular-nums"
                      style={{ ...DATA_FONT, color: "#111827" }}
                    >
                      {counts.total}
                    </span>
                    <span
                      className="md:w-[110px] text-right text-[13px] font-bold tabular-nums"
                      style={{ ...DATA_FONT, color: "#dc2626" }}
                    >
                      {counts.critical > 0 ? `${counts.critical} high+` : ""}
                    </span>
                    <span
                      className="md:w-[190px] text-right text-[15px] font-bold tabular-nums"
                      style={{ ...DATA_FONT, color: "#111827" }}
                    >
                      {counts.amount > 0 ? formatDollar(counts.amount) : ""}
                    </span>
                    <span
                      className="md:w-[96px] flex items-center justify-end gap-1 text-[13px] font-semibold shrink-0"
                      style={{ color: "#ad35fa" }}
                    >
                      Analyze
                      <ArrowRight className="w-3 h-3 transition-transform group-hover:translate-x-0.5" />
                    </span>
                  </div>
                </Link>
              )
            })}
          </div>
        )}
      </ForensicsShell>
    </WasteShell>
  )
}

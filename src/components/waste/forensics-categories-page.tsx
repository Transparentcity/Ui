"use client"

import { useMemo } from "react"
import Link from "next/link"
import { useLatestPersistedWasteResult } from "@/lib/hooks/useWaste"
import { WasteShell } from "./waste-shell"
import { ForensicsShell } from "./forensics-shell"
import { WasteRefreshPanel } from "./waste-refresh-panel"
import { useWasteCity } from "./WasteCityContext"
import { normalizeWasteCategory, formatDollar } from "./waste-utils"
import {
  Users,
  ShoppingCart,
  Wrench,
  Handshake,
  UserCheck,
  FileCheck,
  TriangleAlert,
  ArrowRight,
} from "lucide-react"

const CATEGORY_META: Record<
  string,
  {
    label: string
    icon: React.ComponentType<{ className?: string }>
    description: string
    color: string
  }
> = {
  payroll: {
    label: "Payroll & Personnel",
    icon: Users,
    description: "Overtime anomalies, compensation patterns, ghost employees, and personnel integrity issues",
    color: "from-indigo-500 to-indigo-700",
  },
  contracts: {
    label: "Contracts & Procurement",
    icon: ShoppingCart,
    description: "Vendor concentration, split purchase orders, ghost vendors, contract drift, and address matching",
    color: "from-orange-500 to-orange-700",
  },
  infrastructure: {
    label: "Infrastructure & Services",
    icon: Wrench,
    description: "311 service clusters, pavement failure hotspots, and geographic service pattern analysis",
    color: "from-teal-500 to-teal-700",
  },
  influence: {
    label: "Influence & Pay-to-Play",
    icon: Handshake,
    description: "Campaign contribution patterns, lobbying disclosure gaps, and political influence networks",
    color: "from-pink-500 to-pink-700",
  },
  integrity: {
    label: "Personnel Integrity",
    icon: UserCheck,
    description: "Conflict of interest indicators, outside employment violations, and ethical compliance",
    color: "from-purple-500 to-purple-700",
  },
  confirmed: {
    label: "Confirmed Cases",
    icon: FileCheck,
    description: "Previously confirmed fraud, waste, and abuse cases for pattern learning and calibration",
    color: "from-red-500 to-red-700",
  },
  convergence: {
    label: "Cross-Domain Convergence",
    icon: TriangleAlert,
    description: "Entities flagged across multiple independent detector categories indicating systemic risk",
    color: "from-yellow-500 to-yellow-700",
  },
}

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

  const categoryCounts = useMemo(() => {
    const counts: Record<string, { total: number; critical: number; amount: number }> = {}
    allFindings.forEach((f) => {
      const cat = normalizeWasteCategory(f.category)
      if (!counts[cat]) counts[cat] = { total: 0, critical: 0, amount: 0 }
      counts[cat].total++
      if (f.severity === "critical" || f.severity === "high") counts[cat].critical++
      counts[cat].amount += f.amount ?? 0
    })
    return counts
  }, [allFindings])

  const categoryKeys = Object.keys(CATEGORY_META)

  return (
    <WasteShell
      title="Findings"
      description="Browse and investigate detected anomalies"
    >
      <ForensicsShell title="Analysis Categories">
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className="h-32 bg-gray-100 rounded-lg animate-pulse"
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
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {categoryKeys.map((key) => {
              const meta = CATEGORY_META[key]
              const counts = categoryCounts[key] ?? {
                total: 0,
                critical: 0,
                amount: 0,
              }
              const Icon = meta.icon
              return (
                <Link
                  key={key}
                  href={`/waste/categories/${key}`}
                  className="group flex flex-col rounded-xl bg-white border border-gray-200 p-5 no-underline hover:shadow-md transition-all relative overflow-hidden"
                >
                  <div
                    className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${meta.color}`}
                  />
                  <div className="flex items-center gap-3 mb-2">
                    <div
                      className={`p-1.5 rounded-lg bg-gradient-to-br ${meta.color} text-white`}
                    >
                      <Icon className="w-4 h-4" />
                    </div>
                    <h3 className="text-sm font-semibold text-gray-900">
                      {meta.label}
                    </h3>
                  </div>
                  <p className="text-xs text-gray-500 mb-3 leading-relaxed">
                    {meta.description}
                  </p>
                  <div className="flex items-center gap-4 mt-auto">
                    <span className="text-lg font-bold text-gray-900 tabular-nums">
                      {counts.total}
                    </span>
                    <span className="text-xs text-gray-500">findings</span>
                    {counts.critical > 0 && (
                      <span className="text-xs font-medium text-red-600 bg-red-50 px-1.5 py-0.5 rounded">
                        {counts.critical} high+
                      </span>
                    )}
                    {counts.amount > 0 && (
                      <span className="text-xs text-gray-500 ml-auto">
                        {formatDollar(counts.amount)}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1 text-xs font-medium text-purple-600 mt-3 group-hover:gap-2 transition-all">
                    Analyze <ArrowRight className="w-3 h-3" />
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

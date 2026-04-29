"use client"

import { cn } from "@/lib/utils"
import { Users, ShoppingCart, Wrench, FileCheck, TriangleAlert, Handshake, UserCheck, MoreHorizontal } from "lucide-react"
import type { WasteCategorySummary } from "@/lib/apiClient"
import { normalizeWasteCategory, formatDollar, getWasteCategoryLabel } from "./waste-utils"

interface CategoryConfig {
  key: string
  icon: React.ReactNode
  /** Categories folded into this tab for aggregation */
  includes?: string[]
}

/** Primary tabs: Contracts, Payroll. Other aggregates the rest. */
const PRIMARY_TABS: CategoryConfig[] = [
  { key: "contracts", icon: <ShoppingCart className="w-6 h-6" /> },
  { key: "payroll", icon: <Users className="w-6 h-6" /> },
]

const OTHER_CATEGORIES: CategoryConfig[] = [
  { key: "convergence", icon: <TriangleAlert className="w-5 h-5" /> },
  { key: "infrastructure", icon: <Wrench className="w-5 h-5" /> },
  { key: "influence", icon: <Handshake className="w-5 h-5" /> },
  { key: "integrity", icon: <UserCheck className="w-5 h-5" /> },
  { key: "confirmed", icon: <FileCheck className="w-5 h-5" /> },
]

/** All category keys for backward-compat export */
const CATEGORIES: CategoryConfig[] = [
  ...PRIMARY_TABS,
  ...OTHER_CATEGORIES,
]

interface WasteCategoryTabsProps {
  activeCategory: string
  onCategoryChange: (category: string) => void
  categorySummaries: WasteCategorySummary[]
  isLoading?: boolean
}

export function WasteCategoryTabs({
  activeCategory,
  onCategoryChange,
  categorySummaries,
  isLoading,
}: WasteCategoryTabsProps) {
  const getSummary = (key: string) =>
    categorySummaries.find((c) => normalizeWasteCategory(c.category) === key)

  const noData = !isLoading && categorySummaries.length === 0

  // Aggregate "Other" stats
  const otherKeys = OTHER_CATEGORIES.map((c) => c.key)
  const otherFindingCount = otherKeys.reduce(
    (sum, key) => sum + (getSummary(key)?.finding_count ?? 0),
    0
  )
  const otherCriticalCount = otherKeys.reduce(
    (sum, key) => sum + (getSummary(key)?.critical_count ?? 0),
    0
  )
  const otherAmount = otherKeys.reduce(
    (sum, key) => sum + (getSummary(key)?.total_amount ?? 0),
    0
  )
  const isOtherActive = otherKeys.includes(activeCategory)

  return (
    <div className="space-y-4 mb-6">
      {/* Primary tabs: Contracts & Payroll — large, prominent */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {PRIMARY_TABS.map((cat) => {
          const summary = getSummary(cat.key)
          const isActive = activeCategory === cat.key
          const findingCount = summary?.finding_count ?? 0
          const criticalCount = summary?.critical_count ?? 0
          const totalAmount = summary?.total_amount

          return (
            <button
              key={cat.key}
              onClick={() => onCategoryChange(cat.key)}
              className={cn(
                "flex flex-col items-start gap-3 p-6 rounded-lg border-2 text-left transition-all",
                "hover:shadow-md cursor-pointer bg-white",
                isActive
                  ? "border-purple-600 shadow-md"
                  : "border-gray-200 hover:border-gray-300"
              )}
            >
              <div className="flex items-center gap-2.5 text-gray-700">
                {cat.icon}
                <span className="text-base font-semibold">{getWasteCategoryLabel(cat.key)}</span>
              </div>
              {isLoading ? (
                <div className="h-10 w-16 bg-gray-100 rounded animate-pulse" />
              ) : (
                <>
                  <div className="flex items-baseline gap-3">
                    <span className="text-4xl font-bold text-gray-900">
                      {noData ? "—" : findingCount.toLocaleString()}
                    </span>
                    <span className="text-sm text-gray-500">findings</span>
                    {criticalCount > 0 && (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-700">
                        {criticalCount.toLocaleString()} critical
                      </span>
                    )}
                  </div>
                  {totalAmount != null && totalAmount > 0 && (
                    <span className="text-sm text-gray-500">
                      {formatDollar(totalAmount)} exposure
                    </span>
                  )}
                </>
              )}
            </button>
          )
        })}
      </div>

      {/* Other Signals — compact row */}
      <div className="flex flex-wrap gap-2">
        {/* Aggregate "Other" card */}
        <button
          onClick={() => {
            // If already viewing an "other" category, cycle through them
            // Otherwise show the first one with findings, or infrastructure as default
            if (!isOtherActive) {
              const firstWithFindings = OTHER_CATEGORIES.find(
                (c) => (getSummary(c.key)?.finding_count ?? 0) > 0
              )
              onCategoryChange(firstWithFindings?.key ?? "infrastructure")
            }
          }}
          className={cn(
            "flex items-center gap-2 px-4 py-2.5 rounded-lg border text-left transition-all text-sm",
            "hover:shadow-sm cursor-pointer bg-white",
            isOtherActive
              ? "border-purple-600 shadow-sm"
              : "border-gray-200 hover:border-gray-300"
          )}
        >
          <MoreHorizontal className="w-4 h-4 text-gray-500" />
          <span className="font-medium text-gray-700">Other Signals</span>
          <span className="text-gray-900 font-bold">{noData ? "—" : otherFindingCount.toLocaleString()}</span>
          {otherCriticalCount > 0 && (
            <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-red-100 text-red-700">
              {otherCriticalCount.toLocaleString()} crit
            </span>
          )}
          {otherAmount > 0 && (
            <span className="text-xs text-gray-500">{formatDollar(otherAmount)}</span>
          )}
        </button>

        {/* Individual other category pills — only shown when Other is active */}
        {isOtherActive &&
          OTHER_CATEGORIES.map((cat) => {
            const summary = getSummary(cat.key)
            const isActive = activeCategory === cat.key
            const count = summary?.finding_count ?? 0

            return (
              <button
                key={cat.key}
                onClick={() => onCategoryChange(cat.key)}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-2 rounded-lg border text-xs transition-all",
                  "hover:shadow-sm cursor-pointer bg-white",
                  isActive
                    ? "border-purple-600 text-purple-700 font-semibold"
                    : "border-gray-200 text-gray-600 hover:border-gray-300"
                )}
              >
                {cat.icon}
                <span>{getWasteCategoryLabel(cat.key)}</span>
                <span className="font-bold text-gray-900">{count.toLocaleString()}</span>
              </button>
            )
          })}
      </div>
    </div>
  )
}

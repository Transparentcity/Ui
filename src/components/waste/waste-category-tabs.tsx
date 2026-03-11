"use client"

import { cn } from "@/lib/utils"
import { Users, ShoppingCart, Wrench, FileCheck, TriangleAlert, Handshake, UserCheck } from "lucide-react"
import type { WasteCategorySummary } from "@/lib/apiClient"
import { normalizeWasteCategory, formatDollar, getWasteCategoryLabel } from "./waste-utils"

interface CategoryConfig {
  key: string
  icon: React.ReactNode
}

const CATEGORIES: CategoryConfig[] = [
  { key: "convergence", icon: <TriangleAlert className="w-5 h-5" /> },
  { key: "payroll", icon: <Users className="w-5 h-5" /> },
  { key: "contracts", icon: <ShoppingCart className="w-5 h-5" /> },
  { key: "infrastructure", icon: <Wrench className="w-5 h-5" /> },
  { key: "influence", icon: <Handshake className="w-5 h-5" /> },
  { key: "integrity", icon: <UserCheck className="w-5 h-5" /> },
  { key: "confirmed", icon: <FileCheck className="w-5 h-5" /> },
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

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7 gap-4 mb-6">
      {CATEGORIES.map((cat) => {
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
              "flex flex-col items-start gap-2 p-5 rounded-lg border-2 text-left transition-all",
              "hover:shadow-md cursor-pointer bg-white",
              isActive
                ? "border-purple-600 shadow-md"
                : "border-gray-200 hover:border-gray-300"
            )}
          >
            <div className="flex items-center gap-2 text-gray-600">
              {cat.icon}
              <span className="text-sm font-medium">{getWasteCategoryLabel(cat.key)}</span>
            </div>
            {isLoading ? (
              <div className="flex items-baseline gap-3">
                <div className="h-9 w-12 bg-gray-100 rounded animate-pulse" />
              </div>
            ) : (
              <>
                <div className="flex items-baseline gap-3">
                  <span className="text-3xl font-bold text-gray-900">
                    {noData ? "—" : findingCount}
                  </span>
                  {criticalCount > 0 && (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-700">
                      {criticalCount} crit
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
  )
}

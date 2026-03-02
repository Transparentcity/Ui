"use client"

import { cn } from "@/lib/utils"
import { Users, ShoppingCart, Wrench, FileCheck } from "lucide-react"
import type { WasteCategorySummary } from "@/lib/apiClient"
import { normalizeWasteCategory, formatDollar } from "./waste-utils"

interface CategoryConfig {
  key: string
  label: string
  icon: React.ReactNode
}

const CATEGORIES: CategoryConfig[] = [
  { key: "payroll", label: "Payroll & Personnel", icon: <Users className="w-5 h-5" /> },
  { key: "contracts", label: "Contracts & Procurement", icon: <ShoppingCart className="w-5 h-5" /> },
  { key: "infrastructure", label: "Infrastructure & Services", icon: <Wrench className="w-5 h-5" /> },
  { key: "confirmed", label: "Confirmed Cases", icon: <FileCheck className="w-5 h-5" /> },
]

interface WasteCategoryTabsProps {
  activeCategory: string
  onCategoryChange: (category: string) => void
  categorySummaries: WasteCategorySummary[]
}

export function WasteCategoryTabs({
  activeCategory,
  onCategoryChange,
  categorySummaries,
}: WasteCategoryTabsProps) {
  const getSummary = (key: string) =>
    categorySummaries.find((c) => normalizeWasteCategory(c.category) === key)

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4 mb-6">
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
              <span className="text-sm font-medium">{cat.label}</span>
            </div>
            <div className="flex items-baseline gap-3">
              <span className="text-3xl font-bold text-gray-900">
                {findingCount}
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
          </button>
        )
      })}
    </div>
  )
}

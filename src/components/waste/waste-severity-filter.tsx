"use client"

import { cn } from "@/lib/utils"
import type { WasteFinding } from "@/lib/apiClient"

type SeverityFilter = "all" | "critical" | "high" | "medium"

interface WasteSeverityFilterProps {
  findings: WasteFinding[]
  activeFilter: SeverityFilter
  onFilterChange: (filter: SeverityFilter) => void
}

export function WasteSeverityFilter({
  findings,
  activeFilter,
  onFilterChange,
}: WasteSeverityFilterProps) {
  const counts = {
    all: findings.length,
    critical: findings.filter((f) => f.severity === "critical").length,
    high: findings.filter((f) => f.severity === "high").length,
    medium: findings.filter((f) => f.severity === "medium").length,
  }

  const pills: { key: SeverityFilter; label: string; color: string }[] = [
    { key: "all", label: "All", color: "gray" },
    { key: "critical", label: "Critical", color: "red" },
    { key: "high", label: "High", color: "amber" },
    { key: "medium", label: "Medium", color: "indigo" },
  ]

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {pills.map((pill) => {
        const isActive = activeFilter === pill.key
        const count = counts[pill.key]

        return (
          <button
            key={pill.key}
            onClick={() => onFilterChange(isActive && pill.key !== "all" ? "all" : pill.key)}
            className={cn(
              "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors border",
              isActive
                ? pill.key === "critical"
                  ? "bg-red-600 text-white border-red-600"
                  : pill.key === "high"
                  ? "bg-amber-500 text-white border-amber-500"
                  : pill.key === "medium"
                  ? "bg-indigo-600 text-white border-indigo-600"
                  : "bg-gray-900 text-white border-gray-900"
                : "bg-white text-gray-600 border-gray-300 hover:bg-gray-50"
            )}
          >
            {pill.label}
            <span
              className={cn(
                "inline-flex items-center justify-center min-w-[18px] h-[18px] rounded-full text-[10px] font-bold",
                isActive ? "bg-white/25 text-inherit" : "bg-gray-100 text-gray-600"
              )}
            >
              {count}
            </span>
          </button>
        )
      })}
    </div>
  )
}

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
    critical: findings.filter((f) => f.severity?.toLowerCase() === "critical").length,
    high: findings.filter((f) => f.severity?.toLowerCase() === "high").length,
    medium: findings.filter((f) => f.severity?.toLowerCase() === "medium").length,
  }

  const pills: { key: SeverityFilter; label: string }[] = [
    { key: "all", label: "All" },
    { key: "critical", label: "Critical" },
    { key: "high", label: "High" },
    { key: "medium", label: "Medium" },
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
              // One pill system: active is always neutral-900, regardless of
              // severity; counts are plain text, not bubble chips.
              isActive
                ? "bg-[#111827] text-white border-[#111827]"
                : "bg-white text-[#374151] border-[#e5e7eb] hover:bg-gray-50"
            )}
          >
            {pill.label}
            <span
              className={cn(
                "text-[11px] tabular-nums",
                isActive ? "text-white/[0.65]" : "text-[#9ca3af]"
              )}
              style={{ fontFamily: "var(--font-data)" }}
            >
              {count}
            </span>
          </button>
        )
      })}
    </div>
  )
}

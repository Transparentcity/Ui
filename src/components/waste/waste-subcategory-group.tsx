"use client"

import { useState } from "react"
import { cn } from "@/lib/utils"
import { ChevronRight } from "lucide-react"
import type { WasteFinding } from "@/lib/apiClient"
import { WasteFindingCard } from "./waste-finding-card"

function formatDollar(amount: number | null | undefined): string {
  if (amount == null) return ""
  const abs = Math.abs(amount)
  if (abs >= 1_000_000) return `$${(abs / 1_000_000).toFixed(1)}M`
  if (abs >= 1_000) return `$${(abs / 1_000).toFixed(0)}K`
  return `$${abs.toLocaleString()}`
}

interface WasteSubcategoryGroupProps {
  subcategory: string
  findings: WasteFinding[]
  expandedFindingId: string | null
  onFindingToggle: (id: string) => void
  onAskSeymour?: (finding: WasteFinding) => void
}

export function WasteSubcategoryGroup({
  subcategory,
  findings,
  expandedFindingId,
  onFindingToggle,
  onAskSeymour,
}: WasteSubcategoryGroupProps) {
  const [isCollapsed, setIsCollapsed] = useState(true)

  const critCount = findings.filter((f) => f.severity === "critical").length
  const highCount = findings.filter((f) => f.severity === "high").length
  const totalAmount = findings.reduce(
    (sum, f) => sum + (f.amount ?? 0),
    0
  )

  return (
    <div className="mb-4">
      {/* Subcategory header */}
      <button
        onClick={() => setIsCollapsed(!isCollapsed)}
        className="flex items-center gap-3 w-full px-4 py-2.5 rounded-lg bg-gray-50 hover:bg-gray-100 transition-colors text-left"
      >
        <ChevronRight
          className={cn(
            "w-4 h-4 text-gray-400 shrink-0 transition-transform",
            !isCollapsed && "rotate-90"
          )}
        />
        <span className="font-semibold text-sm text-gray-900">{subcategory}</span>
        <span className="text-xs text-gray-500">
          {findings.length} finding{findings.length !== 1 ? "s" : ""}
        </span>
        <div className="flex items-center gap-1.5 ml-auto">
          {critCount > 0 && (
            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-red-100 text-red-700">
              {critCount} crit
            </span>
          )}
          {highCount > 0 && (
            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-700">
              {highCount} high
            </span>
          )}
          {totalAmount > 0 && (
            <span className="text-sm font-medium text-gray-600">
              {formatDollar(totalAmount)}
            </span>
          )}
        </div>
      </button>

      {/* Finding cards */}
      {!isCollapsed && (
        <div className="mt-2 space-y-2 pl-2">
          {findings.map((finding) => (
            <WasteFindingCard
              key={finding.id}
              finding={finding}
              isExpanded={expandedFindingId === finding.id}
              onToggle={() => onFindingToggle(finding.id)}
              onAskSeymour={onAskSeymour}
            />
          ))}
        </div>
      )}
    </div>
  )
}

"use client"

import { useState, useMemo } from "react"
import type { WasteFinding } from "@/lib/apiClient"
import { WasteSubcategoryGroup } from "./waste-subcategory-group"

interface WasteFindingsListProps {
  findings: WasteFinding[]
  onAskSeymour?: (finding: WasteFinding) => void
}

const severityOrder = { critical: 0, high: 1, medium: 2 }

export function WasteFindingsList({
  findings,
  onAskSeymour,
}: WasteFindingsListProps) {
  const [expandedFindingId, setExpandedFindingId] = useState<string | null>(null)

  const handleFindingToggle = (id: string) => {
    setExpandedFindingId((prev) => (prev === id ? null : id))
  }

  // Group findings by subcategory, sorted by worst severity in group
  const grouped = useMemo(() => {
    const groups: Record<string, WasteFinding[]> = {}
    for (const f of findings) {
      if (!groups[f.subcategory]) groups[f.subcategory] = []
      groups[f.subcategory].push(f)
    }

    // Sort groups by worst severity
    return Object.entries(groups).sort(([, a], [, b]) => {
      const worstA = Math.min(...a.map((f) => severityOrder[f.severity]))
      const worstB = Math.min(...b.map((f) => severityOrder[f.severity]))
      return worstA - worstB
    })
  }, [findings])

  if (findings.length === 0) {
    return (
      <div className="text-center py-12 text-gray-400">
        <p className="text-lg font-medium">No findings</p>
        <p className="text-sm mt-1">
          No anomalies detected in this category with the current filters.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {grouped.map(([subcategory, subFindings]) => (
        <WasteSubcategoryGroup
          key={subcategory}
          subcategory={subcategory}
          findings={subFindings}
          expandedFindingId={expandedFindingId}
          onFindingToggle={handleFindingToggle}
          onAskSeymour={onAskSeymour}
        />
      ))}
    </div>
  )
}

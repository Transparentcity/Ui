"use client"

import { useState } from "react"
import { cn } from "@/lib/utils"
import { ChevronRight, Map as MapIcon } from "lucide-react"
import type { WasteFinding, WasteDispositionType } from "@/lib/apiClient"
import { WasteFindingCard } from "./waste-finding-card"
import type { SubGroup } from "./waste-findings-list"
import { formatDollar } from "./waste-utils"

const ROADMAP_DETECTOR_NAMES = [
  "Address Clustering",
  "Fiscal Sponsor Opacity",
  "Entity Validation",
]

function hasRoadmapLabel(text: string): boolean {
  if (/\(On Roadmap\)/i.test(text)) return true
  const detectorPart = text.split(" - ").pop() ?? ""
  return ROADMAP_DETECTOR_NAMES.some((p) => detectorPart.includes(p))
}

function stripRoadmapLabel(text: string): string {
  return text.replace(/\s*\(On Roadmap\)/gi, "").trim()
}

function severityCounts(items: WasteFinding[]) {
  const critCount = items.filter((f) => f.severity?.toLowerCase() === "critical").length
  const highCount = items.filter((f) => f.severity?.toLowerCase() === "high").length
  const totalAmount = items.reduce((sum, f) => sum + (f.amount ?? 0), 0)
  return { critCount, highCount, totalAmount }
}

function SeverityBadges({ critCount, highCount, totalAmount }: { critCount: number; highCount: number; totalAmount: number }) {
  return (
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
  )
}

interface WasteSubcategoryGroupProps {
  subcategory: string
  findings: WasteFinding[]
  subGroups?: SubGroup[]
  expandedFindingId: string | null
  onFindingToggle: (id: string) => void
  onAskSeymour?: (finding: WasteFinding) => void
  onDispose?: (finding: WasteFinding, disposition: WasteDispositionType) => void
  onSkip?: (finding: WasteFinding) => void
  cityId?: number
}

export function WasteSubcategoryGroup({
  subcategory,
  findings,
  subGroups,
  expandedFindingId,
  onFindingToggle,
  onAskSeymour,
  onDispose,
  onSkip,
  cityId,
}: WasteSubcategoryGroupProps) {
  const [isCollapsed, setIsCollapsed] = useState(true)
  const [expandedSubGroup, setExpandedSubGroup] = useState<string | null>(null)

  const { critCount, highCount, totalAmount } = severityCounts(findings)

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
        <span className="font-semibold text-sm text-gray-900">{stripRoadmapLabel(subcategory)}</span>
        {findings.some((f) => f.is_new) && (
          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-violet-100 text-violet-700 uppercase tracking-wide">
            New
          </span>
        )}
        {hasRoadmapLabel(subcategory) && (
          <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-50 text-amber-700 border border-amber-200 uppercase tracking-wide">
            <MapIcon className="w-2.5 h-2.5" />
            Roadmap
          </span>
        )}
        <span className="text-xs text-gray-500">
          {findings.length} finding{findings.length !== 1 ? "s" : ""}
        </span>
        <SeverityBadges critCount={critCount} highCount={highCount} totalAmount={totalAmount} />
      </button>

      {/* Content when expanded */}
      {!isCollapsed && (
        <div className="mt-2 space-y-2 pl-2">
          {subGroups && subGroups.length > 0 ? (
            /* Nested sub-groups (e.g. districts under Permit Fast Tracking) */
            subGroups.map((sg) => {
              const isSubOpen = expandedSubGroup === sg.label
              const sgStats = severityCounts(sg.findings)
              return (
                <div key={sg.label}>
                  <button
                    onClick={() => setExpandedSubGroup(isSubOpen ? null : sg.label)}
                    className="flex items-center gap-3 w-full px-3 py-2 rounded-md bg-white hover:bg-gray-50 border border-gray-100 transition-colors text-left"
                  >
                    <ChevronRight
                      className={cn(
                        "w-3.5 h-3.5 text-gray-400 shrink-0 transition-transform",
                        isSubOpen && "rotate-90"
                      )}
                    />
                    <span className="font-medium text-sm text-gray-700">{sg.label}</span>
                    <span className="text-xs text-gray-400">
                      {sg.findings.length} finding{sg.findings.length !== 1 ? "s" : ""}
                    </span>
                    <SeverityBadges
                      critCount={sgStats.critCount}
                      highCount={sgStats.highCount}
                      totalAmount={sgStats.totalAmount}
                    />
                  </button>
                  {isSubOpen && (
                    <div className="mt-1.5 space-y-2 pl-3">
                      {sg.findings.map((finding) => (
                        <WasteFindingCard
                          key={finding.id}
                          finding={finding}
                          isExpanded={expandedFindingId === finding.id}
                          onToggle={() => onFindingToggle(finding.id)}
                          onAskSeymour={onAskSeymour}
                          onDispose={onDispose}
                          onSkip={onSkip}
                          cityId={cityId}
                        />
                      ))}
                    </div>
                  )}
                </div>
              )
            })
          ) : (
            /* Flat findings list (no sub-groups) */
            findings.map((finding) => (
              <WasteFindingCard
                key={finding.id}
                finding={finding}
                isExpanded={expandedFindingId === finding.id}
                onToggle={() => onFindingToggle(finding.id)}
                onAskSeymour={onAskSeymour}
                onDispose={onDispose}
                onSkip={onSkip}
                cityId={cityId}
              />
            ))
          )}
        </div>
      )}
    </div>
  )
}

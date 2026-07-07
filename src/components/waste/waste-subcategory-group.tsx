"use client"

import { useState } from "react"
import { cn } from "@/lib/utils"
import { ChevronRight, Map as MapIcon } from "lucide-react"
import type { WasteFinding, WasteDispositionType } from "@/lib/apiClient"
import { WasteFindingCard } from "./waste-finding-card"
import { ConfirmedBadge } from "./confirmed-badge"
import type { SubGroup } from "./waste-findings-list"
import {
  formatDollar,
  isConfirmedFinding,
  isConfirmedFraudEntity,
  aggregateAmount,
  findingCapApplied,
} from "./waste-utils"

const ROADMAP_DETECTOR_NAMES = [
  "Address Clustering",
  "Fiscal Sponsor Opacity",
  "Entity Validation",
]

// Flat, neutral chip for status labels (New / Roadmap) so they don't read as
// filled color badges competing with the severity text.
const NEUTRAL_CHIP =
  "inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wide border border-gray-200 bg-white text-gray-500"

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
  // Sum cap-aware amounts (shared helper, tolerant of both wire spellings)
  // so a single capped finding cannot drag the section total up to its
  // uncapped real exposure. Falls back to ``amount`` when the backend
  // hasn't populated an aggregate override (older payloads).
  const totalAmount = aggregateAmount(items)
  const hasCapped = items.some((f) => (findingCapApplied(f) ?? 0) > 0)
  return { critCount, highCount, totalAmount, hasCapped }
}

function SeverityBadges({ critCount, highCount, totalAmount, hasCapped }: { critCount: number; highCount: number; totalAmount: number; hasCapped?: boolean }) {
  return (
    <div className="flex items-center gap-3 ml-auto shrink-0">
      {critCount > 0 && (
        <span
          className="text-[12.5px] font-bold tabular-nums"
          style={{ fontFamily: "var(--font-data)", color: "#dc2626" }}
        >
          {critCount} crit
        </span>
      )}
      {highCount > 0 && (
        <span
          className="text-[12.5px] font-bold tabular-nums"
          style={{ fontFamily: "var(--font-data)", color: "#b45309" }}
        >
          {highCount} high
        </span>
      )}
      {totalAmount > 0 && (
        <span
          className="w-[150px] text-right text-[15px] font-bold tabular-nums inline-flex items-center justify-end gap-1"
          style={{ fontFamily: "var(--font-data)", color: "#111827" }}
        >
          {formatDollar(totalAmount)}
          {hasCapped && (
            <span
              className="text-[10px] font-medium text-gray-500 bg-white border border-gray-200 px-1 rounded"
              title="One or more findings exceed the per-finding cap; section total reflects the capped values."
            >
              capped
            </span>
          )}
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
  isCarriedOver?: (f: WasteFinding) => boolean
  carriedOverAsOf?: (f: WasteFinding) => string | null
  /** Full pool of findings for resolving consolidated supporting IDs. */
  allFindings?: WasteFinding[]
  /** Resolve a finding's detector to its auditor-validated precision. */
  precisionFor?: (f: WasteFinding) => { rate: number; total: number } | null
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
  isCarriedOver,
  carriedOverAsOf,
  allFindings,
  precisionFor,
}: WasteSubcategoryGroupProps) {
  const [isCollapsed, setIsCollapsed] = useState(true)
  const [expandedSubGroup, setExpandedSubGroup] = useState<string | null>(null)

  const { critCount, highCount, totalAmount, hasCapped } = severityCounts(findings)

  return (
    <div>
      {/* Subcategory header: full-bleed band row */}
      <button
        onClick={() => setIsCollapsed(!isCollapsed)}
        className="flex items-center gap-3 w-full px-3 py-2.5 border-t border-[#e5e7eb] bg-[#f8f9fa] hover:bg-gray-100 transition-colors text-left"
      >
        <ChevronRight
          className={cn(
            "w-4 h-4 text-gray-500 shrink-0 transition-transform",
            !isCollapsed && "rotate-90"
          )}
        />
        <span
          className="text-[15px] text-gray-900"
          style={{
            fontFamily: "var(--font-heading)",
            fontWeight: 800,
            letterSpacing: "-0.02em",
          }}
        >
          {stripRoadmapLabel(subcategory)}
        </span>
        {(isConfirmedFraudEntity(subcategory) || findings.some(isConfirmedFinding)) && (
          <ConfirmedBadge variant="stamp" />
        )}
        {findings.some((f) => f.is_new) && (
          <span className={NEUTRAL_CHIP}>New</span>
        )}
        {hasRoadmapLabel(subcategory) && (
          <span className={cn(NEUTRAL_CHIP, "gap-0.5")}>
            <MapIcon className="w-2.5 h-2.5" />
            Roadmap
          </span>
        )}
        <span className="text-[13px]" style={{ color: "#9ca3af" }}>
          {findings.length} finding{findings.length !== 1 ? "s" : ""}
        </span>
        <SeverityBadges critCount={critCount} highCount={highCount} totalAmount={totalAmount} hasCapped={hasCapped} />
      </button>

      {/* Content when expanded */}
      {!isCollapsed && (
        <div className="pl-2">
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
                        "w-3.5 h-3.5 text-gray-500 shrink-0 transition-transform",
                        isSubOpen && "rotate-90"
                      )}
                    />
                    <span className="font-medium text-sm text-gray-700">{sg.label}</span>
                    <span className="text-xs text-gray-500">
                      {sg.findings.length} finding{sg.findings.length !== 1 ? "s" : ""}
                    </span>
                    <SeverityBadges
                      critCount={sgStats.critCount}
                      highCount={sgStats.highCount}
                      totalAmount={sgStats.totalAmount}
                      hasCapped={sgStats.hasCapped}
                    />
                  </button>
                  {isSubOpen && (
                    <div className="mt-1.5 pl-3">
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
                          isCarriedOver={isCarriedOver?.(finding) ?? false}
                          carriedOverAsOf={carriedOverAsOf?.(finding) ?? null}
                          allFindings={allFindings}
                          precision={precisionFor?.(finding) ?? null}
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
                isCarriedOver={isCarriedOver?.(finding) ?? false}
                carriedOverAsOf={carriedOverAsOf?.(finding) ?? null}
                allFindings={allFindings}
                precision={precisionFor?.(finding) ?? null}
              />
            ))
          )}
        </div>
      )}
    </div>
  )
}

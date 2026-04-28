"use client"

import { useState, useMemo } from "react"
import type { WasteFinding, WasteDispositionType } from "@/lib/apiClient"
import { WasteFindingCard } from "./waste-finding-card"
import { WasteSubcategoryGroup } from "./waste-subcategory-group"
import { normalizeWasteCategory } from "./waste-utils"

export interface CarriedOverCategoryMeta {
  category: string
  analysis_timestamp: string | null
  reason: string
}

export interface SubGroup {
  label: string
  findings: WasteFinding[]
}

export interface GroupedSubcategory {
  label: string
  findings: WasteFinding[]
  subGroups?: SubGroup[]
}

export type FindingSortMode = "severity" | "amount" | "demo"

interface WasteFindingsListProps {
  findings: WasteFinding[]
  onAskSeymour?: (finding: WasteFinding) => void
  onDispose?: (finding: WasteFinding, disposition: WasteDispositionType) => void
  onSkip?: (finding: WasteFinding) => void
  sortMode?: FindingSortMode
  cityId?: number
  carriedOverCategories?: CarriedOverCategoryMeta[]
}

const severityOrder = { critical: 0, high: 1, medium: 2 }

function worstSeverity(items: WasteFinding[]): number {
  return Math.min(
    ...items.map(
      (f) =>
        severityOrder[
          (f.severity?.toLowerCase() ?? "medium") as keyof typeof severityOrder
        ] ?? 3
    )
  )
}

/** Extract a date from the metric string, e.g. "(on Sep 18, 1985)" */
function extractDate(metric: string | undefined): Date | null {
  if (!metric) return null
  const match = metric.match(/\(on\s+([A-Za-z]+\s+\d{1,2},\s+\d{4})\)/)
  if (match) {
    const d = new Date(match[1])
    if (!isNaN(d.getTime())) return d
  }
  return null
}

/** Sort findings most-recent-first: fiscal year → date from metric → priority_score */
function sortByMostRecent(items: WasteFinding[]): WasteFinding[] {
  return [...items].sort((a, b) => {
    // 1. Fiscal year (newest first)
    const fyA = a.fiscal_year ?? 0
    const fyB = b.fiscal_year ?? 0
    if (fyA !== fyB) return fyB - fyA

    // 2. Date extracted from metric text
    const dateA = extractDate(a.metric)
    const dateB = extractDate(b.metric)
    if (dateA && dateB) return dateB.getTime() - dateA.getTime()
    if (dateA) return -1
    if (dateB) return 1

    // 3. Priority score
    return (b.priority_score ?? 0) - (a.priority_score ?? 0)
  })
}

export function WasteFindingsList({
  findings,
  onAskSeymour,
  onDispose,
  onSkip,
  sortMode = "severity",
  cityId,
  carriedOverCategories,
}: WasteFindingsListProps) {
  const [expandedFindingId, setExpandedFindingId] = useState<string | null>(null)

  // Map normalized category → timestamp so each card can render its fallback source.
  const carriedOverMap = useMemo(() => {
    const m = new Map<string, string | null>()
    for (const c of carriedOverCategories ?? []) {
      m.set(normalizeWasteCategory(c.category), c.analysis_timestamp)
    }
    return m
  }, [carriedOverCategories])

  const isCarriedOver = (f: WasteFinding) =>
    carriedOverMap.has(normalizeWasteCategory(f.category))
  const carriedOverAsOf = (f: WasteFinding) =>
    carriedOverMap.get(normalizeWasteCategory(f.category)) ?? null

  const handleFindingToggle = (id: string) => {
    setExpandedFindingId((prev) => (prev === id ? null : id))
  }

  // Demo-quality sorted findings (flat list, no grouping)
  const demoSorted = useMemo(() => {
    if (sortMode !== "demo") return null
    return [...findings].sort((a, b) => {
      const scoreA =
        (a.amount ?? 0) *
        (a.signal_tier === "primary" ? 2 : 1) *
        (a.priority_score ?? 1)
      const scoreB =
        (b.amount ?? 0) *
        (b.signal_tier === "primary" ? 2 : 1) *
        (b.priority_score ?? 1)
      return scoreB - scoreA
    })
  }, [findings, sortMode])

  // Amount-sorted findings (flat list)
  const amountSorted = useMemo(() => {
    if (sortMode !== "amount") return null
    return [...findings].sort(
      (a, b) => (b.amount ?? 0) - (a.amount ?? 0)
    )
  }, [findings, sortMode])

  // Group findings by subcategory, then merge subcategories that share a
  // common "Parent - Child" prefix into a single parent group with nested
  // sub-groups (e.g. "Permit Fast Tracking - Bayview" collapses under
  // "Permit Fast Tracking").
  const grouped = useMemo(() => {
    // Step 1: raw group by subcategory
    const raw: Record<string, WasteFinding[]> = {}
    for (const f of findings) {
      if (!raw[f.subcategory]) raw[f.subcategory] = []
      raw[f.subcategory].push(f)
    }

    // Step 2: detect parent prefixes with multiple children
    const prefixChildren: Record<string, string[]> = {}
    for (const sub of Object.keys(raw)) {
      const dashIdx = sub.indexOf(" - ")
      if (dashIdx > 0) {
        const prefix = sub.slice(0, dashIdx)
        if (!prefixChildren[prefix]) prefixChildren[prefix] = []
        prefixChildren[prefix].push(sub)
      }
    }

    // Step 3: build final grouped list
    const merged: GroupedSubcategory[] = []
    const consumed = new Set<string>()

    for (const [prefix, children] of Object.entries(prefixChildren)) {
      if (children.length < 2) continue // only merge when 2+ districts
      const allFindings: WasteFinding[] = []
      const subGroups: SubGroup[] = []
      for (const child of children) {
        const childLabel = child.slice(prefix.length + 3) // strip "Parent - "
        subGroups.push({ label: childLabel, findings: sortByMostRecent(raw[child]) })
        allFindings.push(...raw[child])
        consumed.add(child)
      }
      // Sort sub-groups by worst severity
      subGroups.sort((a, b) => worstSeverity(a.findings) - worstSeverity(b.findings))
      merged.push({ label: prefix, findings: sortByMostRecent(allFindings), subGroups })
    }

    // Add remaining ungrouped subcategories
    for (const [sub, subFindings] of Object.entries(raw)) {
      if (!consumed.has(sub)) {
        merged.push({ label: sub, findings: sortByMostRecent(subFindings) })
      }
    }

    // Sort all top-level groups by worst severity
    merged.sort((a, b) => worstSeverity(a.findings) - worstSeverity(b.findings))
    return merged
  }, [findings])

  if (findings.length === 0) {
    return (
      <div className="text-center py-12 text-gray-500">
        <p className="text-lg font-medium">No findings</p>
        <p className="text-sm mt-1">
          No anomalies detected in this category with the current filters.
        </p>
      </div>
    )
  }

  // Flat list for demo or amount sort modes
  const flatList = demoSorted ?? amountSorted
  if (flatList) {
    return (
      <div className="space-y-2">
        {flatList.map((finding, i) => (
          <div key={finding.id} className="relative">
            {sortMode === "demo" && (
              <span className="absolute -left-8 top-3 text-xs font-bold text-gray-300 tabular-nums">
                #{i + 1}
              </span>
            )}
            <WasteFindingCard
              finding={finding}
              isExpanded={expandedFindingId === finding.id}
              onToggle={() => handleFindingToggle(finding.id)}
              onAskSeymour={onAskSeymour}
              onDispose={onDispose}
              onSkip={onSkip}
              cityId={cityId}
              isCarriedOver={isCarriedOver(finding)}
              carriedOverAsOf={carriedOverAsOf(finding)}
              allFindings={findings}
            />
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {grouped.map((group) => (
        <WasteSubcategoryGroup
          key={group.label}
          subcategory={group.label}
          findings={group.findings}
          subGroups={group.subGroups}
          expandedFindingId={expandedFindingId}
          onFindingToggle={handleFindingToggle}
          onAskSeymour={onAskSeymour}
          onDispose={onDispose}
          onSkip={onSkip}
          cityId={cityId}
          isCarriedOver={isCarriedOver}
          carriedOverAsOf={carriedOverAsOf}
          allFindings={findings}
        />
      ))}
    </div>
  )
}

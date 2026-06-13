"use client"

import { useMemo, useState } from "react"
import type { WasteFinding, WasteDispositionType } from "@/lib/apiClient"
import { WasteFindingCard } from "./waste-finding-card"
import { formatDollar } from "./waste-utils"
import { cn } from "@/lib/utils"
import { ArrowUpDown, ChevronDown, Sparkles } from "lucide-react"

/**
 * Ranked findings views. Two ways to read the same set of findings:
 *  - "finding": a flat list, one row per finding, ordered by the active metric.
 *  - "entity": findings grouped by entity, entities ordered by their aggregate
 *    of the active metric, each group's findings ordered within.
 *
 * The three metrics are deliberately separate because the backend's
 * `priority_score` collapses confidence into LOW/MED/HIGH buckets and folds in
 * dollars, so it can't answer "highest dollar exposure" or "most certain"
 * on its own. Impact reads the raw dollar fields; Confidence reads the
 * continuous `confidence_score`; Priority keeps the backend's blended score.
 */

export type RankBy = "impact" | "confidence" | "priority"
export type RankView = "finding" | "entity"

export const RANK_LABELS: Record<RankBy, string> = {
  impact: "Impact",
  confidence: "Confidence",
  priority: "Priority",
}

/** Dollar exposure for a finding: prefer the explicit estimate, else amount. */
export function impactOf(f: WasteFinding): number {
  return f.estimated_dollar_impact ?? f.amount ?? 0
}

export function metricValue(f: WasteFinding, rankBy: RankBy): number {
  if (rankBy === "impact") return impactOf(f)
  if (rankBy === "confidence") return f.confidence_score ?? 0
  return f.priority_score ?? 0
}

/** Flat ranking: order findings by the active metric, with a stable tiebreak. */
export function rankFindings(
  findings: WasteFinding[],
  rankBy: RankBy,
  dir: "asc" | "desc"
): WasteFinding[] {
  return [...findings].sort((a, b) => {
    const cmp = metricValue(a, rankBy) - metricValue(b, rankBy)
    if (cmp !== 0) return dir === "desc" ? -cmp : cmp
    // Stable tiebreak so equal-metric rows don't shuffle between renders.
    return (b.priority_score ?? 0) - (a.priority_score ?? 0)
  })
}

export interface EntityGroup {
  entity: string
  findings: WasteFinding[]
  totalImpact: number
  maxConfidence: number
  maxPriority: number
  newCount: number
}

export function buildEntityGroups(
  findings: WasteFinding[],
  rankBy: RankBy,
  dir: "asc" | "desc"
): EntityGroup[] {
  const byEntity = new Map<string, WasteFinding[]>()
  for (const f of findings) {
    const key = f.entity || "(unattributed)"
    const list = byEntity.get(key)
    if (list) list.push(f)
    else byEntity.set(key, [f])
  }

  const groups: EntityGroup[] = []
  for (const [entity, list] of byEntity) {
    const sorted = [...list].sort((a, b) => {
      const cmp = metricValue(a, rankBy) - metricValue(b, rankBy)
      return dir === "desc" ? -cmp : cmp
    })
    groups.push({
      entity,
      findings: sorted,
      totalImpact: list.reduce((sum, f) => sum + impactOf(f), 0),
      maxConfidence: Math.max(...list.map((f) => f.confidence_score ?? 0)),
      maxPriority: Math.max(...list.map((f) => f.priority_score ?? 0)),
      newCount: list.filter((f) => f.is_new).length,
    })
  }

  const groupMetric = (g: EntityGroup): number =>
    rankBy === "impact"
      ? g.totalImpact
      : rankBy === "confidence"
        ? g.maxConfidence
        : g.maxPriority

  groups.sort((a, b) => {
    const cmp = groupMetric(a) - groupMetric(b)
    return dir === "desc" ? -cmp : cmp
  })
  return groups
}

function ConfidencePct({ score }: { score: number | null | undefined }) {
  const pct = Math.round((score ?? 0) * 100)
  const tone =
    pct >= 75
      ? "text-emerald-700"
      : pct >= 50
        ? "text-slate-600"
        : "text-amber-700"
  return <span className={cn("tabular-nums font-medium", tone)}>{pct}%</span>
}

interface WasteRankedFindingsProps {
  findings: WasteFinding[]
  rankBy: RankBy
  dir: "asc" | "desc"
  view: RankView
  onAskSeymour?: (finding: WasteFinding) => void
  onDispose?: (finding: WasteFinding, disposition: WasteDispositionType) => void
  cityId?: number
}

export function WasteRankedFindings({
  findings,
  rankBy,
  dir,
  view,
  onAskSeymour,
  onDispose,
  cityId,
}: WasteRankedFindingsProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const toggle = (id: string) => setExpandedId((p) => (p === id ? null : id))

  const flat = useMemo(
    () => rankFindings(findings, rankBy, dir),
    [findings, rankBy, dir]
  )

  const groups = useMemo(
    () => (view === "entity" ? buildEntityGroups(findings, rankBy, dir) : []),
    [findings, rankBy, dir, view]
  )

  if (findings.length === 0) {
    return (
      <div className="text-center py-12 text-gray-500">
        <p className="text-lg font-medium">No findings</p>
        <p className="text-sm mt-1">
          No findings match the current filters.
        </p>
      </div>
    )
  }

  if (view === "finding") {
    return (
      <div className="space-y-2">
        {flat.map((finding, idx) => (
          <div key={finding.id} className="relative">
            <span className="absolute -left-7 top-3 text-[11px] text-gray-400 tabular-nums hidden md:block">
              {idx + 1}
            </span>
            <WasteFindingCard
              finding={finding}
              isExpanded={expandedId === finding.id}
              onToggle={() => toggle(finding.id)}
              onAskSeymour={onAskSeymour}
              onDispose={onDispose}
              cityId={cityId}
              allFindings={findings}
            />
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {groups.map((group, idx) => (
        <EntityGroupBlock
          key={group.entity}
          group={group}
          rank={idx + 1}
          rankBy={rankBy}
          expandedId={expandedId}
          onToggle={toggle}
          onAskSeymour={onAskSeymour}
          onDispose={onDispose}
          cityId={cityId}
          allFindings={findings}
        />
      ))}
    </div>
  )
}

function EntityGroupBlock({
  group,
  rank,
  rankBy,
  expandedId,
  onToggle,
  onAskSeymour,
  onDispose,
  cityId,
  allFindings,
}: {
  group: EntityGroup
  rank: number
  rankBy: RankBy
  expandedId: string | null
  onToggle: (id: string) => void
  onAskSeymour?: (finding: WasteFinding) => void
  onDispose?: (finding: WasteFinding, disposition: WasteDispositionType) => void
  cityId?: number
  allFindings: WasteFinding[]
}) {
  // Open the highest-ranked entity by default so the page isn't all-collapsed.
  const [open, setOpen] = useState(rank <= 3)

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-3 px-3 py-2.5 bg-gray-50 hover:bg-gray-100 transition-colors text-left"
      >
        <span className="text-[11px] text-gray-400 tabular-nums w-5 shrink-0">
          {rank}
        </span>
        <ChevronDown
          className={cn(
            "w-4 h-4 text-gray-400 shrink-0 transition-transform",
            open ? "" : "-rotate-90"
          )}
        />
        <span className="font-medium text-gray-900 truncate flex-1">
          {group.entity}
          {group.newCount > 0 && (
            <span className="ml-2 inline-flex items-center gap-0.5 text-[10px] text-purple-700 align-middle">
              <Sparkles className="w-3 h-3" />
              {group.newCount} new
            </span>
          )}
        </span>
        <div className="flex items-center gap-4 text-xs shrink-0">
          <span
            className={cn(
              "tabular-nums",
              rankBy === "impact" ? "font-semibold text-gray-900" : "text-gray-500"
            )}
          >
            {formatDollar(group.totalImpact)}
          </span>
          <span
            className={cn(rankBy === "confidence" && "font-semibold")}
            title="Highest confidence among this entity's findings"
          >
            <ConfidencePct score={group.maxConfidence} />
          </span>
          <span className="text-gray-500 tabular-nums w-16 text-right">
            {group.findings.length}{" "}
            {group.findings.length === 1 ? "finding" : "findings"}
          </span>
        </div>
      </button>
      {open && (
        <div className="p-2 space-y-2 bg-white">
          {group.findings.map((finding) => (
            <WasteFindingCard
              key={finding.id}
              finding={finding}
              isExpanded={expandedId === finding.id}
              onToggle={() => onToggle(finding.id)}
              onAskSeymour={onAskSeymour}
              onDispose={onDispose}
              cityId={cityId}
              allFindings={allFindings}
            />
          ))}
        </div>
      )}
    </div>
  )
}

/** Controls row: rank-by metric, direction, view toggle, new-only filter. */
export function WasteRankControls({
  rankBy,
  onRankByChange,
  dir,
  onDirChange,
  view,
  onViewChange,
  newOnly,
  onNewOnlyChange,
  newCount,
}: {
  rankBy: RankBy
  onRankByChange: (r: RankBy) => void
  dir: "asc" | "desc"
  onDirChange: (d: "asc" | "desc") => void
  view: RankView
  onViewChange: (v: RankView) => void
  newOnly: boolean
  onNewOnlyChange: (v: boolean) => void
  newCount: number
}) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <div className="inline-flex rounded-md border border-gray-200 overflow-hidden">
        {(["finding", "entity"] as RankView[]).map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => onViewChange(v)}
            className={cn(
              "text-xs px-2.5 py-1.5 transition-colors",
              view === v
                ? "bg-purple-600 text-white"
                : "bg-white text-gray-600 hover:bg-gray-50"
            )}
          >
            {v === "finding" ? "By finding" : "By entity"}
          </button>
        ))}
      </div>

      <div className="inline-flex items-center gap-1 text-xs text-gray-500">
        <span>Rank by</span>
        <div className="inline-flex rounded-md border border-gray-200 overflow-hidden">
          {(["impact", "confidence", "priority"] as RankBy[]).map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => onRankByChange(r)}
              className={cn(
                "px-2.5 py-1.5 transition-colors",
                rankBy === r
                  ? "bg-gray-900 text-white"
                  : "bg-white text-gray-600 hover:bg-gray-50"
              )}
            >
              {RANK_LABELS[r]}
            </button>
          ))}
        </div>
      </div>

      <button
        type="button"
        onClick={() => onDirChange(dir === "desc" ? "asc" : "desc")}
        className="inline-flex items-center gap-1 text-xs border border-gray-200 rounded-md px-2 py-1.5 bg-white text-gray-600 hover:bg-gray-50"
        title={dir === "desc" ? "Highest first" : "Lowest first"}
      >
        <ArrowUpDown className="w-3 h-3" />
        {dir === "desc" ? "High to low" : "Low to high"}
      </button>

      <label className="inline-flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer select-none">
        <input
          type="checkbox"
          checked={newOnly}
          onChange={(e) => onNewOnlyChange(e.target.checked)}
          className="rounded border-gray-300"
        />
        New this week
        {newCount > 0 && (
          <span className="text-[10px] text-purple-700">({newCount})</span>
        )}
      </label>
    </div>
  )
}

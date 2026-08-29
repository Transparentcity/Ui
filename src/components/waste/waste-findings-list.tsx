"use client"

import { useState, useMemo, useEffect, useCallback, useRef } from "react"
import type { WasteFinding, WasteDispositionType } from "@/lib/apiClient"
import { WasteFindingCard } from "./waste-finding-card"
import { WasteSubcategoryGroup } from "./waste-subcategory-group"
import { DISMISS_REASONS } from "./disposition-select"
import {
  normalizeWasteCategory,
  sortByEvidenceScore,
  findingLatestDisposition,
  type DetectorPrecision,
} from "./waste-utils"

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

export type FindingSortMode = "severity" | "amount" | "evidence"

interface WasteFindingsListProps {
  findings: WasteFinding[]
  onAskSeymour?: (finding: WasteFinding) => void
  onDispose?: (
    finding: WasteFinding,
    disposition: WasteDispositionType,
    note?: string,
  ) => void | Promise<void>
  onSkip?: (finding: WasteFinding) => void
  sortMode?: FindingSortMode
  cityId?: number
  carriedOverCategories?: CarriedOverCategoryMeta[]
  /** Resolve a finding's detector to its auditor-validated precision. */
  precisionFor?: (f: WasteFinding) => DetectorPrecision | null
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
  precisionFor,
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

  // Flat-sorted findings (amount and evidence modes)
  const flatSorted = useMemo(() => {
    if (sortMode === "amount") {
      return [...findings].sort((a, b) => (b.amount ?? 0) - (a.amount ?? 0))
    }
    if (sortMode === "evidence") {
      // Expected value: P(real) × corroboration × data quality × impact,
      // with already-dismissed findings sunk to the bottom.
      return sortByEvidenceScore(findings, precisionFor)
    }
    return null
  }, [findings, sortMode, precisionFor])

  // ── Keyboard triage (flat modes only) ─────────────────────────────────────
  // j/k moves the highlight, f flags, s skips, 1–5 dismisses with a reason.
  // Verdicts recorded here are mirrored onto the card via triageOverride so
  // the confirmation renders exactly as if the buttons were clicked.
  const [highlightedId, setHighlightedId] = useState<string | null>(null)
  const [keyboardTriage, setKeyboardTriage] = useState<
    Record<string, WasteDispositionType | "skipped">
  >({})
  const keyboardActive = flatSorted != null && onDispose != null
  const listRef = useRef<HTMLDivElement | null>(null)

  const recordKeyboardVerdict = useCallback(
    (
      finding: WasteFinding,
      disposition: WasteDispositionType,
      note?: string,
    ) => {
      setKeyboardTriage((prev) => ({ ...prev, [finding.id]: disposition }))
      Promise.resolve(onDispose?.(finding, disposition, note)).catch(() => {
        // Roll back the optimistic verdict so it isn't silently lost.
        setKeyboardTriage((prev) => {
          const next = { ...prev }
          delete next[finding.id]
          return next
        })
      })
    },
    [onDispose],
  )

  useEffect(() => {
    if (!keyboardActive || !flatSorted || flatSorted.length === 0) return

    const isTypingTarget = (t: EventTarget | null): boolean => {
      if (!(t instanceof HTMLElement)) return false
      if (t.isContentEditable) return true
      const tag = t.tagName
      return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT"
    }

    const handler = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return
      if (isTypingTarget(e.target)) return

      const ids = flatSorted.map((f) => f.id)
      const currentIndex = highlightedId ? ids.indexOf(highlightedId) : -1

      const moveTo = (index: number) => {
        const clamped = Math.max(0, Math.min(ids.length - 1, index))
        const id = ids[clamped]
        setHighlightedId(id)
        const row = listRef.current?.querySelector(
          `[data-finding-row="${CSS.escape(id)}"]`,
        )
        // scrollIntoView is missing in jsdom; navigation still works without it.
        if (row && typeof row.scrollIntoView === "function") {
          row.scrollIntoView({ block: "nearest" })
        }
      }

      if (e.key === "j" || e.key === "ArrowDown") {
        e.preventDefault()
        moveTo(currentIndex + 1)
        return
      }
      if (e.key === "k" || e.key === "ArrowUp") {
        e.preventDefault()
        moveTo(currentIndex <= 0 ? 0 : currentIndex - 1)
        return
      }
      if (e.key === "Escape") {
        setHighlightedId(null)
        return
      }

      if (currentIndex < 0) return
      const finding = flatSorted[currentIndex]
      // Already triaged (this session or a prior one): only navigation
      // applies. Re-disposing the same finding week after week corrupts the
      // detector's precision counters.
      if (
        keyboardTriage[finding.id] != null ||
        finding.db_id == null ||
        findingLatestDisposition(finding) != null
      )
        return

      if (e.key === "f") {
        e.preventDefault()
        recordKeyboardVerdict(finding, "under_investigation")
        moveTo(currentIndex + 1)
        return
      }
      if (e.key === "s" && onSkip) {
        e.preventDefault()
        setKeyboardTriage((prev) => ({ ...prev, [finding.id]: "skipped" }))
        onSkip(finding)
        moveTo(currentIndex + 1)
        return
      }
      const reason = DISMISS_REASONS.find((r) => r.key === e.key)
      if (reason) {
        e.preventDefault()
        recordKeyboardVerdict(finding, reason.value, reason.note)
        moveTo(currentIndex + 1)
      }
    }

    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [
    keyboardActive,
    flatSorted,
    highlightedId,
    keyboardTriage,
    onSkip,
    recordKeyboardVerdict,
  ])

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

  // Flat list for amount / evidence sort modes
  if (flatSorted) {
    return (
      <div>
        {keyboardActive && (
          <p
            className="mb-2 text-[11px] tabular-nums"
            style={{ fontFamily: "var(--font-data)", color: "#9ca3af" }}
            data-testid="keyboard-triage-legend"
          >
            Keyboard triage: <kbd>j</kbd>/<kbd>k</kbd> move · <kbd>f</kbd> flag
            {onSkip && (
              <>
                {" "}
                · <kbd>s</kbd> skip
              </>
            )}{" "}
            ·{" "}
            {DISMISS_REASONS.map((r, i) => (
              <span key={r.key}>
                {i > 0 && " · "}
                <kbd>{r.key}</kbd> {r.label.toLowerCase()}
              </span>
            ))}
          </p>
        )}
        <div className="border-b border-[#e5e7eb]" ref={listRef}>
          {flatSorted.map((finding) => (
            <div
              key={finding.id}
              className={
                highlightedId === finding.id
                  ? "relative ring-2 ring-purple-400 ring-inset rounded-sm"
                  : "relative"
              }
              data-finding-row={finding.id}
              onClick={() => keyboardActive && setHighlightedId(finding.id)}
            >
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
                precision={precisionFor?.(finding) ?? null}
                triageOverride={keyboardTriage[finding.id] ?? null}
              />
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="border-b border-[#e5e7eb]">
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
          precisionFor={precisionFor}
        />
      ))}
    </div>
  )
}

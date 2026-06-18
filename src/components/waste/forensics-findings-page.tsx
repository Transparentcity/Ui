"use client"

import { useState, useMemo } from "react"
import { useLatestPersistedWasteResult } from "@/lib/hooks/useWaste"
import type { WasteFinding } from "@/lib/apiClient"
import { useWasteCity } from "./WasteCityContext"
import { WasteShell } from "./waste-shell"
import { ForensicsShell } from "./forensics-shell"
import { WasteFindingsList } from "./waste-findings-list"
import {
  WasteRankedFindings,
  WasteRankControls,
  impactOf,
  type RankBy,
  type RankView,
} from "./waste-ranked-findings"
import { WasteTopFindings } from "./waste-top-findings"
import { WasteSeverityFilter } from "./waste-severity-filter"
import { WasteSeymourAskBar } from "./waste-seymour-ask-bar"
import {
  WasteSeymourPanel,
  type WasteSeymourRequest,
} from "./waste-seymour-panel"
import { normalizeWasteCategory, getWasteCategoryLabel, formatDollar } from "./waste-utils"
import { cn } from "@/lib/utils"
import { Search } from "lucide-react"

type SeverityFilter = "all" | "critical" | "high" | "medium"
type Layout = RankView | "category"

export function ForensicsFindingsPage() {
  const { selectedCityId: cityId } = useWasteCity()
  const { data: analysisData, isLoading } =
    useLatestPersistedWasteResult(cityId)
  const allFindings = useMemo(() => analysisData?.findings ?? [], [analysisData])

  const [severityFilter, setSeverityFilter] = useState<SeverityFilter>("all")
  const [categoryFilter, setCategoryFilter] = useState("")
  const [entitySearch, setEntitySearch] = useState("")
  const [seymourRequest, setSeymourRequest] = useState<WasteSeymourRequest | null>(null)

  // Ranked-view state.
  const [layout, setLayout] = useState<Layout>("finding")
  const [rankBy, setRankBy] = useState<RankBy>("impact")
  const [dir, setDir] = useState<"asc" | "desc">("desc")
  const [newOnly, setNewOnly] = useState(false)

  const handleAskSeymour = (finding: WasteFinding) => {
    setSeymourRequest({ finding })
  }

  const categories = useMemo(() => {
    const set = new Set<string>()
    allFindings.forEach((f) => set.add(normalizeWasteCategory(f.category)))
    return [...set].sort()
  }, [allFindings])

  const newCount = useMemo(
    () => allFindings.filter((f) => f.is_new).length,
    [allFindings]
  )

  const filtered = useMemo(() => {
    let results = allFindings
    if (severityFilter !== "all") {
      results = results.filter(
        (f) => f.severity?.toLowerCase() === severityFilter
      )
    }
    if (categoryFilter) {
      results = results.filter(
        (f) => normalizeWasteCategory(f.category) === categoryFilter
      )
    }
    if (entitySearch) {
      const q = entitySearch.toLowerCase()
      results = results.filter((f) =>
        f.entity?.toLowerCase().includes(q)
      )
    }
    if (newOnly) {
      results = results.filter((f) => f.is_new)
    }
    return results
  }, [allFindings, severityFilter, categoryFilter, entitySearch, newOnly])

  // Total dollar impact in the current filtered view, for the header readout.
  const totalImpact = useMemo(
    () => filtered.reduce((sum, f) => sum + impactOf(f), 0),
    [filtered]
  )

  const activeChips = [
    severityFilter !== "all" ? `Severity: ${severityFilter}` : null,
    categoryFilter ? `Category: ${getWasteCategoryLabel(categoryFilter)}` : null,
    entitySearch ? `Entity: ${entitySearch}` : null,
    newOnly ? "New this week" : null,
  ].filter(Boolean) as string[]

  return (
    <WasteShell
      title="Findings"
      description="Unusual patterns flagged in the city's own published data — open any finding to see the records and the exact query behind it"
    >
      <ForensicsShell title="All Findings">
        {!isLoading && activeChips.length === 0 && (
          <WasteTopFindings
            findings={allFindings}
            onSelectEntity={setEntitySearch}
          />
        )}
        <WasteSeymourAskBar
          className="mb-3"
          context={{
            label: `Findings list — ${activeChips.length ? activeChips.join(", ") : "all"} (${filtered.length} of ${allFindings.length}), ranked by ${rankBy}`,
            details: {
              severity: severityFilter,
              category: categoryFilter || null,
              entitySearch: entitySearch || null,
              rankBy,
              view: layout,
              newOnly,
              total: allFindings.length,
              filtered: filtered.length,
            },
          }}
        />

        <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
          <WasteRankControls
            rankBy={rankBy}
            onRankByChange={setRankBy}
            dir={dir}
            onDirChange={setDir}
            view={layout === "category" ? "finding" : layout}
            onViewChange={(v) => setLayout(v)}
            newOnly={newOnly}
            onNewOnlyChange={setNewOnly}
            newCount={newCount}
          />
          <button
            type="button"
            onClick={() => setLayout("category")}
            className={cn(
              "text-xs px-2.5 py-1.5 rounded-md border transition-colors",
              layout === "category"
                ? "bg-purple-600 text-white border-purple-600"
                : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"
            )}
          >
            By category
          </button>
        </div>

        <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
          <div className="flex items-center gap-2 flex-wrap">
            <WasteSeverityFilter
              findings={allFindings}
              activeFilter={severityFilter}
              onFilterChange={setSeverityFilter}
            />
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="text-xs border border-gray-200 rounded-md px-2 py-1.5 bg-white text-gray-700"
            >
              <option value="">All Categories</option>
              {categories.map((c) => (
                <option key={c} value={c}>
                  {getWasteCategoryLabel(c)}
                </option>
              ))}
            </select>
            <div className="relative">
              <input
                type="text"
                value={entitySearch}
                onChange={(e) => setEntitySearch(e.target.value)}
                placeholder="Search entity..."
                className="text-xs border border-gray-200 rounded-md px-2 py-1.5 bg-white text-gray-700 w-36 pl-7"
              />
              <Search className="w-3 h-3 text-gray-500 absolute left-2 top-1/2 -translate-y-1/2" />
            </div>
          </div>
          <span className="text-xs text-gray-500">
            {filtered.length.toLocaleString()} of {allFindings.length.toLocaleString()} findings
            {totalImpact > 0 && (
              <>
                {" · "}
                <span className="font-medium text-gray-700">
                  {formatDollar(totalImpact)}
                </span>{" "}
                exposure
              </>
            )}
          </span>
        </div>

        {activeChips.length > 0 && (
          <div className="flex items-center gap-1.5 flex-wrap mb-3">
            {activeChips.map((chip) => (
              <span
                key={chip}
                className="text-[11px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-600"
              >
                {chip}
              </span>
            ))}
          </div>
        )}

        {isLoading ? (
          <div className="space-y-3">
            {[...Array(5)].map((_, i) => (
              <div
                key={i}
                className="h-14 bg-gray-100 rounded-lg animate-pulse"
              />
            ))}
          </div>
        ) : layout === "category" ? (
          <WasteFindingsList findings={filtered} onAskSeymour={handleAskSeymour} cityId={cityId} />
        ) : (
          <WasteRankedFindings
            findings={filtered}
            rankBy={rankBy}
            dir={dir}
            view={layout}
            onAskSeymour={handleAskSeymour}
            cityId={cityId}
          />
        )}

        <WasteSeymourPanel
          request={seymourRequest}
          onClose={() => setSeymourRequest(null)}
        />
      </ForensicsShell>
    </WasteShell>
  )
}

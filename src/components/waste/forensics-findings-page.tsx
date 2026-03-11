"use client"

import { useState, useMemo } from "react"
import { useLatestPersistedWasteResult } from "@/lib/hooks/useWaste"
import { useWasteCity } from "./WasteCityContext"
import { WasteShell } from "./waste-shell"
import { ForensicsShell } from "./forensics-shell"
import { WasteFindingsList } from "./waste-findings-list"
import { WasteSeverityFilter } from "./waste-severity-filter"
import { normalizeWasteCategory, getWasteCategoryLabel } from "./waste-utils"
import { Search } from "lucide-react"

type SeverityFilter = "all" | "critical" | "high" | "medium"

export function ForensicsFindingsPage() {
  const { selectedCityId: cityId } = useWasteCity()
  const { data: analysisData, isLoading } =
    useLatestPersistedWasteResult(cityId)
  const allFindings = useMemo(() => analysisData?.findings ?? [], [analysisData])

  const [severityFilter, setSeverityFilter] = useState<SeverityFilter>("all")
  const [categoryFilter, setCategoryFilter] = useState("")
  const [entitySearch, setEntitySearch] = useState("")

  const categories = useMemo(() => {
    const set = new Set<string>()
    allFindings.forEach((f) => set.add(normalizeWasteCategory(f.category)))
    return [...set].sort()
  }, [allFindings])

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
    return results
  }, [allFindings, severityFilter, categoryFilter, entitySearch])

  const activeChips = [
    severityFilter !== "all" ? `Severity: ${severityFilter}` : null,
    categoryFilter ? `Category: ${getWasteCategoryLabel(categoryFilter)}` : null,
    entitySearch ? `Entity: ${entitySearch}` : null,
  ].filter(Boolean) as string[]

  return (
    <WasteShell
      title="Forensics"
      description="Historical analysis and investigation workspace"
    >
      <ForensicsShell title="All Findings">
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
              <Search className="w-3 h-3 text-gray-400 absolute left-2 top-1/2 -translate-y-1/2" />
            </div>
          </div>
          <span className="text-xs text-gray-400">
            Showing {filtered.length.toLocaleString()} of {allFindings.length.toLocaleString()}
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
        ) : (
          <WasteFindingsList findings={filtered} />
        )}
      </ForensicsShell>
    </WasteShell>
  )
}

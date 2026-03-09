"use client"

import { useState, useMemo } from "react"
import { useQuery } from "@tanstack/react-query"
import { listPublicCitiesForSitemap } from "@/lib/publicApiClient"
import { CRM_DEFAULT_CITY_ID } from "@/lib/apiBase"
import { useLatestPersistedWasteResult } from "@/lib/hooks/useWaste"
import type { WasteFinding } from "@/lib/apiClient"
import { WasteShell } from "./waste-shell"
import { ForensicsShell } from "./forensics-shell"
import { WasteFindingsList } from "./waste-findings-list"
import { WasteSeverityFilter } from "./waste-severity-filter"
import { normalizeWasteCategory, formatDollar } from "./waste-utils"
import { cn } from "@/lib/utils"
import { Filter, Search, X } from "lucide-react"

function useCityId() {
  const citiesQuery = useQuery({
    queryKey: ["public", "cities", "sitemap"],
    queryFn: listPublicCitiesForSitemap,
    staleTime: 5 * 60 * 1000,
  })
  return useMemo(() => {
    const eligible = (citiesQuery.data ?? []).filter(
      (c) => (c.datasets_count ?? 0) > 0
    )
    return eligible.length > 0 ? Number(eligible[0].id) : CRM_DEFAULT_CITY_ID
  }, [citiesQuery.data])
}

type SeverityFilter = "all" | "critical" | "high" | "medium"

export function ForensicsFindingsPage() {
  const cityId = useCityId()
  const { data: analysisData, isLoading } =
    useLatestPersistedWasteResult(cityId)
  const allFindings = analysisData?.findings ?? []

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
                  {c}
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
            {filtered.length.toLocaleString()} findings
          </span>
        </div>

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

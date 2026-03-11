"use client"

import { useState } from "react"
import { ChevronDown, ChevronUp, BarChart3, Loader2, Globe } from "lucide-react"
import { useWasteBenchmarkSummary, useWasteBenchmarkEntityRank } from "@/lib/hooks/useWasteBenchmark"
import type { BenchmarkSummaryCity } from "@/lib/apiClient"

function formatDollars(n: number | null | undefined): string {
  if (n == null) return "N/A"
  return "$" + n.toLocaleString("en-US", { maximumFractionDigits: 0 })
}

function RankBadge({ rank, total }: { rank: number; total: number }) {
  if (total < 2) return null
  const pct = ((total - rank) / (total - 1)) * 100
  let color = "bg-gray-100 text-gray-600"
  if (pct >= 75) color = "bg-red-100 text-red-700"
  else if (pct >= 50) color = "bg-amber-100 text-amber-700"
  else if (pct >= 25) color = "bg-blue-100 text-blue-700"
  else color = "bg-green-100 text-green-700"

  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${color}`}>
      #{rank} of {total}
    </span>
  )
}

function CityRow({ city, isSelected }: { city: BenchmarkSummaryCity; isSelected: boolean }) {
  return (
    <tr className={isSelected ? "bg-purple-50" : ""}>
      <td className="px-3 py-2 text-sm font-medium text-gray-900">
        {city.city_name}
        {isSelected && (
          <span className="ml-1.5 text-xs text-purple-600 font-normal">(selected)</span>
        )}
      </td>
      <td className="px-3 py-2 text-sm text-right text-gray-700 tabular-nums">
        {city.total_findings.toLocaleString()}
      </td>
      <td className="px-3 py-2 text-sm text-right text-gray-700 tabular-nums">
        {city.critical_count}
      </td>
      <td className="px-3 py-2 text-sm text-right text-gray-700 tabular-nums">
        {formatDollars(city.estimated_exposure)}
      </td>
    </tr>
  )
}

interface WasteBenchmarkPanelProps {
  cityId: number | null
}

export function WasteBenchmarkPanel({ cityId }: WasteBenchmarkPanelProps) {
  const [open, setOpen] = useState(false)
  const summaryQ = useWasteBenchmarkSummary(open ? cityId : null)
  const entityQ = useWasteBenchmarkEntityRank(open ? cityId : null)

  const data = summaryQ.data
  const isLoading = summaryQ.isLoading || entityQ.isLoading
  const hasSufficientCities = (data?.total_tracked_cities ?? 0) >= 2

  return (
    <div className="border border-gray-200 rounded-lg bg-white mt-4">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-gray-50 transition-colors rounded-lg"
      >
        <div className="flex items-center gap-2">
          <Globe className="w-4 h-4 text-purple-500" />
          <span className="text-sm font-medium text-gray-900">
            Cross-City Benchmarks
          </span>
          {data && hasSufficientCities && !open && (
            <span className="text-xs text-gray-500">
              Rank #{data.rank_by_exposure} of {data.total_tracked_cities} cities
            </span>
          )}
        </div>
        {open ? (
          <ChevronUp className="w-4 h-4 text-gray-400" />
        ) : (
          <ChevronDown className="w-4 h-4 text-gray-400" />
        )}
      </button>

      {open && (
        <div className="px-4 pb-4 border-t border-gray-100 pt-3 space-y-4">
          {isLoading && (
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <Loader2 className="w-4 h-4 animate-spin" />
              Loading benchmarks...
            </div>
          )}

          {!isLoading && !hasSufficientCities && (
            <p className="text-sm text-gray-500">
              Add more cities to see cross-city comparisons. Benchmarks become
              meaningful with 2+ cities.
            </p>
          )}

          {!isLoading && data && hasSufficientCities && (
            <>
              {/* Summary ranks */}
              <div className="flex flex-wrap gap-4">
                <div>
                  <p className="text-xs text-gray-500 mb-1">Flagged Exposure</p>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-gray-900">
                      {formatDollars(data.selected_city.estimated_exposure)}
                    </span>
                    <RankBadge rank={data.rank_by_exposure} total={data.total_tracked_cities} />
                  </div>
                </div>
                <div>
                  <p className="text-xs text-gray-500 mb-1">Total Findings</p>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-gray-900">
                      {data.selected_city.total_findings.toLocaleString()}
                    </span>
                    <RankBadge rank={data.rank_by_findings} total={data.total_tracked_cities} />
                  </div>
                </div>
              </div>

              {/* All-city comparison table */}
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="border-b border-gray-200">
                      <th className="px-3 py-2 text-xs font-medium text-gray-500">City</th>
                      <th className="px-3 py-2 text-xs font-medium text-gray-500 text-right">Findings</th>
                      <th className="px-3 py-2 text-xs font-medium text-gray-500 text-right">Critical</th>
                      <th className="px-3 py-2 text-xs font-medium text-gray-500 text-right">Exposure</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {data.all_cities.map((city) => (
                      <CityRow
                        key={city.city_id}
                        city={city}
                        isSelected={city.city_id === cityId}
                      />
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Top entities across all cities */}
              {entityQ.data && entityQ.data.top_entities.length > 0 && (
                <div>
                  <h4 className="text-xs font-medium text-gray-500 mb-2 flex items-center gap-1.5">
                    <BarChart3 className="w-3.5 h-3.5" />
                    Highest-Risk Entities Across All Cities
                  </h4>
                  <div className="space-y-1">
                    {entityQ.data.top_entities.slice(0, 5).map((e, i) => (
                      <div
                        key={`${e.city_id}-${e.entity_name}-${i}`}
                        className={`flex items-center justify-between text-sm py-1.5 px-2 rounded ${
                          e.city_id === cityId ? "bg-purple-50" : ""
                        }`}
                      >
                        <div>
                          <span className="text-gray-900 font-medium">{e.entity_name}</span>
                          <span className="ml-1.5 text-xs text-gray-400">
                            {e.city_name} &middot; {e.entity_type}
                          </span>
                        </div>
                        <span className="text-sm font-semibold tabular-nums text-gray-700">
                          {e.composite_score.toFixed(1)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}

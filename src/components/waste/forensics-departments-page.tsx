"use client"

import { useWasteEntityScores } from "@/lib/hooks/useWaste"
import { WasteShell } from "./waste-shell"
import { ForensicsShell } from "./forensics-shell"
import { useWasteCity } from "./WasteCityContext"
import { TCScoreBadge, TCTierBadge } from "./tc-score-badge"
import {
  TrendingUp,
  TrendingDown,
  Minus,
} from "lucide-react"

export function ForensicsDepartmentsPage() {
  const { selectedCityId: cityId } = useWasteCity()
  const { data, isLoading } = useWasteEntityScores({
    cityId,
    perPage: 200,
    sortBy: "composite_score",
    sortDir: "desc",
    entityType: "department",
  })

  const depts = data?.items ?? []

  return (
    <WasteShell
      title="Forensics"
      description="Historical analysis and investigation workspace"
    >
      <ForensicsShell title="Department Risk Profiles">
        {isLoading ? (
          <div className="space-y-2">
            {[1, 2, 3, 4, 5].map((i) => (
              <div
                key={i}
                className="h-14 bg-gray-100 rounded-lg animate-pulse"
              />
            ))}
          </div>
        ) : depts.length === 0 ? (
          <p className="text-sm text-gray-400 py-8 text-center">
            No department risk scores yet. Run a waste analysis first.
          </p>
        ) : (
          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50">
                  <th className="text-left py-3 px-4 text-xs font-medium text-gray-500">
                    Department
                  </th>
                  <th className="text-right py-3 px-3 text-xs font-medium text-gray-500">
                    Composite Score
                  </th>
                  <th className="text-right py-3 px-3 text-xs font-medium text-gray-500">
                    Signals
                  </th>
                  <th className="text-left py-3 px-3 text-xs font-medium text-gray-500">
                    Top Detector
                  </th>
                  <th className="text-center py-3 px-3 text-xs font-medium text-gray-500">
                    Trend
                  </th>
                  <th className="text-right py-3 px-3 text-xs font-medium text-gray-500">
                    Severity
                  </th>
                </tr>
              </thead>
              <tbody>
                {depts.map((dept, idx) => {
                  const delta = dept.score_delta ?? 0
                  return (
                    <tr
                      key={idx}
                      className="border-b border-gray-50 hover:bg-gray-50"
                    >
                      <td className="py-3 px-4 text-gray-800 font-medium">
                        {dept.entity_name}
                      </td>
                      <td className="py-3 px-3 text-right">
                        <TCScoreBadge score={dept.composite_score} size="sm" />
                      </td>
                      <td className="py-3 px-3 text-right text-gray-600 tabular-nums">
                        {dept.signal_count}
                      </td>
                      <td className="py-3 px-3 text-xs text-gray-500">
                        {dept.top_detector?.replace(/_/g, " ") ?? "--"}
                      </td>
                      <td className="py-3 px-3 text-center">
                        {delta > 0 ? (
                          <span className="inline-flex items-center gap-0.5 text-xs text-red-600">
                            <TrendingUp className="w-3.5 h-3.5" />
                            +{delta.toFixed(0)}
                          </span>
                        ) : delta < 0 ? (
                          <span className="inline-flex items-center gap-0.5 text-xs text-emerald-600">
                            <TrendingDown className="w-3.5 h-3.5" />
                            {delta.toFixed(0)}
                          </span>
                        ) : (
                          <span className="inline-flex items-center text-xs text-gray-400">
                            <Minus className="w-3.5 h-3.5" />
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-3 text-right">
                        <TCTierBadge score={dept.composite_score} />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </ForensicsShell>
    </WasteShell>
  )
}

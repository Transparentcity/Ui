"use client"

import { useState } from "react"
import { useWasteEntityScores } from "@/lib/hooks/useWaste"
import type { WasteEntityScore } from "@/lib/apiClient"
import { WasteShell } from "./waste-shell"
import { ForensicsShell } from "./forensics-shell"
import { ScoreBar } from "./score-bar"
import { SeverityBadge } from "./severity-badge"
import { TCScoreBadge } from "./tc-score-badge"
import { useWasteCity } from "./WasteCityContext"
import { cn } from "@/lib/utils"
import {
  ChevronLeft,
  ChevronRight,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

export function ForensicsEntitiesPage() {
  const { selectedCityId: cityId } = useWasteCity()
  const [page, setPage] = useState(1)
  const [severityFilter, setSeverityFilter] = useState("")
  const [entityTypeFilter, setEntityTypeFilter] = useState("")
  const perPage = 25

  const { data, isLoading } = useWasteEntityScores({
    cityId,
    page,
    perPage,
    severityTier: severityFilter || undefined,
    entityType: entityTypeFilter || undefined,
    sortBy: "composite_score",
    sortDir: "desc",
  })

  const items = data?.items ?? []
  const total = data?.total ?? 0
  const totalPages = Math.ceil(total / perPage)

  return (
    <WasteShell
      title="Forensics"
      description="Historical analysis and investigation workspace"
    >
      <ForensicsShell title="Entity Risk Scores">
        {/* Filters */}
        <div className="flex items-center gap-3 mb-4 flex-wrap">
          <Select
            value={severityFilter || "all"}
            onValueChange={(v) => {
              setSeverityFilter(v === "all" ? "" : v)
              setPage(1)
            }}
          >
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="All severities" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All severities</SelectItem>
              <SelectItem value="critical">Critical</SelectItem>
              <SelectItem value="high">High</SelectItem>
              <SelectItem value="medium">Medium</SelectItem>
              <SelectItem value="low">Low</SelectItem>
            </SelectContent>
          </Select>

          <Select
            value={entityTypeFilter || "all"}
            onValueChange={(v) => {
              setEntityTypeFilter(v === "all" ? "" : v)
              setPage(1)
            }}
          >
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="All types" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All types</SelectItem>
              <SelectItem value="person">Person</SelectItem>
              <SelectItem value="vendor">Vendor</SelectItem>
              <SelectItem value="department">Department</SelectItem>
              <SelectItem value="location">Location</SelectItem>
            </SelectContent>
          </Select>

          <span className="text-xs text-gray-400 ml-auto">
            {total.toLocaleString()} entities
          </span>
        </div>

        {/* Table */}
        {isLoading ? (
          <div className="space-y-2">
            {[...Array(5)].map((_, i) => (
              <div
                key={i}
                className="h-12 bg-gray-100 rounded-lg animate-pulse"
              />
            ))}
          </div>
        ) : items.length === 0 ? (
          <p className="text-sm text-gray-400 py-8 text-center">
            No scored entities match the current filters
          </p>
        ) : (
          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50">
                  <th className="text-left py-2.5 px-4 text-xs font-medium text-gray-500">
                    Entity
                  </th>
                  <th className="text-left py-2.5 px-3 text-xs font-medium text-gray-500">
                    Type
                  </th>
                  <th className="text-right py-2.5 px-3 text-xs font-medium text-gray-500">
                    Score
                  </th>
                  <th className="text-center py-2.5 px-3 text-xs font-medium text-gray-500 w-32">
                    Risk
                  </th>
                  <th className="text-center py-2.5 px-3 text-xs font-medium text-gray-500">
                    Severity
                  </th>
                  <th className="text-right py-2.5 px-3 text-xs font-medium text-gray-500">
                    Signals
                  </th>
                  <th className="text-left py-2.5 px-3 text-xs font-medium text-gray-500">
                    Top Detector
                  </th>
                </tr>
              </thead>
              <tbody>
                {items.map((entity: WasteEntityScore) => (
                  <tr
                    key={entity.id}
                    className="border-b border-gray-50 hover:bg-gray-50"
                  >
                    <td className="py-2.5 px-4 text-gray-800 font-medium truncate max-w-[200px]">
                      {entity.entity_name}
                    </td>
                    <td className="py-2.5 px-3 text-xs text-gray-500 capitalize">
                      {entity.entity_type}
                    </td>
                    <td className="py-2.5 px-3 text-right">
                      <TCScoreBadge score={entity.composite_score} size="sm" />
                    </td>
                    <td className="py-2.5 px-3">
                      <ScoreBar score={entity.composite_score} />
                    </td>
                    <td className="py-2.5 px-3 text-center">
                      <SeverityBadge severity={entity.severity_tier} />
                    </td>
                    <td className="py-2.5 px-3 text-right text-gray-600 tabular-nums">
                      {entity.signal_count}
                    </td>
                    <td className="py-2.5 px-3 text-xs text-gray-500 truncate max-w-[120px]">
                      {entity.top_detector?.replace(/_/g, " ") ?? "--"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between mt-4">
            <span className="text-xs text-gray-400">
              Page {page} of {totalPages}
            </span>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
        )}
      </ForensicsShell>
    </WasteShell>
  )
}

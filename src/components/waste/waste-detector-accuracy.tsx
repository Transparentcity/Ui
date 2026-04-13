"use client"

import { useMemo, useState, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { ArrowUpDown, ClipboardCheck } from "lucide-react"
import { cn } from "@/lib/utils"
import { useWasteDetectorAccuracy } from "@/lib/hooks/useWaste"

type AccuracySortField = "resolved" | "confirmed" | "false_positive" | "precision"

function percent(value: number): string {
  return `${(value * 100).toFixed(1)}%`
}

export function WasteDetectorAccuracy({ cityId }: { cityId: number | null }) {
  const [detectorFilter, setDetectorFilter] = useState("")
  const [sortField, setSortField] = useState<AccuracySortField | null>(null)
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc")
  const accuracyQuery = useWasteDetectorAccuracy(cityId)

  const toggleSort = useCallback(
    (field: AccuracySortField) => {
      if (sortField === field) {
        setSortDir((d) => (d === "asc" ? "desc" : "asc"))
      } else {
        setSortField(field)
        setSortDir("desc")
      }
    },
    [sortField]
  )

  const filtered = useMemo(() => {
    const rows = accuracyQuery.data ?? []
    let result = rows
    if (detectorFilter.trim()) {
      const filter = detectorFilter.trim().toLowerCase()
      result = result.filter((row) => row.detector_key.toLowerCase().includes(filter))
    }
    if (sortField) {
      result = [...result].sort((a, b) => {
        let cmp = 0
        const resolvedA = a.confirmed_count + a.false_positive_count
        const resolvedB = b.confirmed_count + b.false_positive_count
        if (sortField === "resolved") cmp = resolvedA - resolvedB
        else if (sortField === "confirmed") cmp = a.confirmed_count - b.confirmed_count
        else if (sortField === "false_positive") cmp = a.false_positive_count - b.false_positive_count
        else if (sortField === "precision") cmp = a.precision_rate - b.precision_rate
        return sortDir === "desc" ? -cmp : cmp
      })
    }
    return result
  }, [accuracyQuery.data, detectorFilter, sortField, sortDir])

  if (!cityId) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
        Select a city to load detector accuracy metrics.
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <p className="text-sm font-semibold text-gray-900">Detector Accuracy</p>
        <p className="text-xs text-gray-500 mt-1">
          Precision metrics from auditor dispositions. These values drive
          detector weight adjustments in composite scoring.
        </p>
        <div className="mt-3 flex flex-col md:flex-row gap-2">
          <input
            value={detectorFilter}
            onChange={(e) => setDetectorFilter(e.target.value)}
            placeholder="Filter by detector key"
            className="w-full rounded border border-gray-300 px-2 py-1 text-sm"
          />
          <Button
            variant="outline"
            disabled={accuracyQuery.isFetching}
            onClick={() => accuracyQuery.refetch()}
          >
            Refresh Accuracy
          </Button>
        </div>
      </div>

      {accuracyQuery.isLoading ? (
        <div className="space-y-2">
          {[...Array(6)].map((_, idx) => (
            <div key={idx} className="h-12 rounded bg-gray-100 animate-pulse" />
          ))}
        </div>
      ) : filtered.length > 0 ? (
        <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-600">
              <tr>
                <th className="text-left px-3 py-2 text-xs font-medium">Detector</th>
                <th className="text-right px-3 py-2 text-xs font-medium">
                  <button type="button" onClick={() => toggleSort("resolved")} className={cn("inline-flex items-center gap-1 hover:text-gray-900", sortField === "resolved" && "text-purple-700 font-semibold")}>
                    Resolved <ArrowUpDown className={cn("w-3 h-3", sortField === "resolved" ? "text-purple-600" : "text-gray-500")} />
                  </button>
                </th>
                <th className="text-right px-3 py-2 text-xs font-medium">
                  <button type="button" onClick={() => toggleSort("confirmed")} className={cn("inline-flex items-center gap-1 hover:text-gray-900", sortField === "confirmed" && "text-purple-700 font-semibold")}>
                    Confirmed <ArrowUpDown className={cn("w-3 h-3", sortField === "confirmed" ? "text-purple-600" : "text-gray-500")} />
                  </button>
                </th>
                <th className="text-right px-3 py-2 text-xs font-medium">
                  <button type="button" onClick={() => toggleSort("false_positive")} className={cn("inline-flex items-center gap-1 hover:text-gray-900", sortField === "false_positive" && "text-purple-700 font-semibold")}>
                    False + Data <ArrowUpDown className={cn("w-3 h-3", sortField === "false_positive" ? "text-purple-600" : "text-gray-500")} />
                  </button>
                </th>
                <th className="text-right px-3 py-2 text-xs font-medium">
                  <button type="button" onClick={() => toggleSort("precision")} className={cn("inline-flex items-center gap-1 hover:text-gray-900", sortField === "precision" && "text-purple-700 font-semibold")}>
                    Precision <ArrowUpDown className={cn("w-3 h-3", sortField === "precision" ? "text-purple-600" : "text-gray-500")} />
                  </button>
                </th>
                <th className="text-left px-3 py-2 text-xs font-medium">Updated</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((row) => {
                const resolved = row.confirmed_count + row.false_positive_count
                return (
                  <tr key={row.id} className="border-t border-gray-100">
                    <td className="px-3 py-2 text-xs text-gray-800">
                      {row.detector_key}
                    </td>
                    <td className="px-3 py-2 text-right text-xs text-gray-700">
                      {resolved}
                    </td>
                    <td className="px-3 py-2 text-right text-xs text-emerald-700">
                      {row.confirmed_count}
                    </td>
                    <td className="px-3 py-2 text-right text-xs text-rose-700">
                      {row.false_positive_count}
                    </td>
                    <td className="px-3 py-2 text-right text-xs font-semibold text-indigo-700">
                      {percent(row.precision_rate)}
                    </td>
                    <td className="px-3 py-2 text-xs text-gray-500">
                      {row.updated_at
                        ? new Date(row.updated_at).toLocaleString()
                        : "n/a"}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="rounded-lg border border-gray-200 bg-white p-6 text-center">
          <ClipboardCheck className="w-10 h-10 text-gray-300 mx-auto mb-3" />
          <p className="text-sm text-gray-500 mb-1">No detector accuracy data yet for this city.</p>
          <p className="text-xs text-gray-500">
            Start classifying findings in the Review Queue to generate precision metrics.
          </p>
        </div>
      )}
    </div>
  )
}

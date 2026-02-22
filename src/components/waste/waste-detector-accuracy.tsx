"use client"

import { useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { useWasteDetectorAccuracy } from "@/lib/hooks/useWaste"

function percent(value: number): string {
  return `${(value * 100).toFixed(1)}%`
}

export function WasteDetectorAccuracy({ cityId }: { cityId: number | null }) {
  const [detectorFilter, setDetectorFilter] = useState("")
  const accuracyQuery = useWasteDetectorAccuracy(cityId)

  const filtered = useMemo(() => {
    const rows = accuracyQuery.data ?? []
    if (!detectorFilter.trim()) return rows
    const filter = detectorFilter.trim().toLowerCase()
    return rows.filter((row) => row.detector_key.toLowerCase().includes(filter))
  }, [accuracyQuery.data, detectorFilter])

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
                <th className="text-right px-3 py-2 text-xs font-medium">Resolved</th>
                <th className="text-right px-3 py-2 text-xs font-medium">Confirmed</th>
                <th className="text-right px-3 py-2 text-xs font-medium">False + Data</th>
                <th className="text-right px-3 py-2 text-xs font-medium">Precision</th>
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
        <div className="rounded-lg border border-gray-200 bg-white p-6 text-sm text-gray-500">
          No detector accuracy data yet for this city. Once auditors start
          classifying findings, metrics will appear here.
        </div>
      )}
    </div>
  )
}

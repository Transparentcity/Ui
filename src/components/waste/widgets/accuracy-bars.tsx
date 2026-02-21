"use client"

import { useMemo } from "react"
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts"
import { useWasteDetectorAccuracy } from "@/lib/hooks/useWaste"
import { Gauge } from "lucide-react"

interface AccuracyBarsProps {
  cityId: number | null
}

function precisionColor(rate: number): string {
  if (rate >= 0.8) return "#10b981"
  if (rate >= 0.6) return "#3b82f6"
  if (rate >= 0.4) return "#eab308"
  return "#ef4444"
}

export function AccuracyBars({ cityId }: AccuracyBarsProps) {
  const { data, isLoading } = useWasteDetectorAccuracy(cityId)

  const chartData = useMemo(() => {
    if (!data) return []
    return data
      .filter((d) => d.total_findings > 0)
      .map((d) => ({
        name: d.detector_key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
        precision: Math.round(d.precision_rate * 100),
        raw: d.precision_rate,
        total: d.total_findings,
      }))
      .sort((a, b) => b.precision - a.precision)
  }, [data])

  if (isLoading) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-5">
        <div className="h-4 w-40 bg-gray-100 rounded animate-pulse mb-4" />
        <div className="h-44 bg-gray-50 rounded animate-pulse" />
      </div>
    )
  }

  if (chartData.length === 0) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-5">
        <h3 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
          <Gauge className="w-4 h-4 text-gray-400" />
          Detector Accuracy
        </h3>
        <p className="text-xs text-gray-400 py-8 text-center">No accuracy data yet</p>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-5">
      <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
        <Gauge className="w-4 h-4 text-gray-400" />
        Detector Accuracy
      </h3>
      <ResponsiveContainer width="100%" height={Math.max(200, chartData.length * 32)}>
        <BarChart data={chartData} layout="vertical" margin={{ left: 10, right: 30, top: 0, bottom: 0 }}>
          <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 11 }} tickFormatter={(v) => `${v}%`} />
          <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={140} />
          <Tooltip
            formatter={(value: number) => [`${value}%`, "Precision"]}
            contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e5e7eb" }}
          />
          <Bar dataKey="precision" radius={[0, 4, 4, 0]} barSize={16}>
            {chartData.map((entry) => (
              <Cell key={entry.name} fill={precisionColor(entry.raw)} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

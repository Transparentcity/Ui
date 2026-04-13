"use client"

import { useMemo } from "react"
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from "recharts"
import { useWasteEntityScores } from "@/lib/hooks/useWaste"

const SEVERITY_COLORS: Record<string, string> = {
  critical: "#ef4444",
  high: "#f97316",
  medium: "#eab308",
  low: "#3b82f6",
  info: "#9ca3af",
}

interface SeverityDonutProps {
  cityId: number | null
}

export function SeverityDonut({ cityId }: SeverityDonutProps) {
  const { data, isLoading } = useWasteEntityScores({
    cityId,
    perPage: 500,
  })

  const chartData = useMemo(() => {
    if (!data?.items) return []
    const counts: Record<string, number> = { critical: 0, high: 0, medium: 0, low: 0, info: 0 }
    data.items.forEach((item) => {
      const tier = item.severity_tier?.toLowerCase() ?? "info"
      counts[tier] = (counts[tier] ?? 0) + 1
    })
    return Object.entries(counts)
      .filter(([, v]) => v > 0)
      .map(([name, value]) => ({ name, value }))
  }, [data?.items])

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
        <h3 className="text-sm font-semibold text-gray-700 mb-2">Risk Score Distribution</h3>
        <p className="text-xs text-gray-500 py-8 text-center">No scored entities yet</p>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-5">
      <h3 className="text-sm font-semibold text-gray-700 mb-2">Risk Score Distribution</h3>
      <ResponsiveContainer width="100%" height={200}>
        <PieChart>
          <Pie
            data={chartData}
            cx="50%"
            cy="50%"
            innerRadius={50}
            outerRadius={80}
            paddingAngle={2}
            dataKey="value"
          >
            {chartData.map((entry) => (
              <Cell
                key={entry.name}
                fill={SEVERITY_COLORS[entry.name] ?? "#9ca3af"}
              />
            ))}
          </Pie>
          <Tooltip
            formatter={(value: number, name: string) => [value, name.charAt(0).toUpperCase() + name.slice(1)]}
            contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e5e7eb" }}
          />
          <Legend
            formatter={(value: string) => (
              <span className="text-xs capitalize text-gray-600">{value}</span>
            )}
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  )
}

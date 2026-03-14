"use client"

import {
  Bus, ShieldAlert, Phone, Flame, Home, Heart,
  FileText, Ticket, Paintbrush, BookOpen, Users,
  Construction, UtensilsCrossed, PawPrint,
  type LucideIcon,
} from "lucide-react"
import type { CostMetricResult } from "@/lib/apiClient"

const ICON_MAP: Record<string, LucideIcon> = {
  Bus, ShieldAlert, Phone, Flame, Home, Heart,
  FileText, Ticket, PaintBucket: Paintbrush, Paintbrush,
  BookOpen, Users,
  Construction, UtensilsCrossed, PawPrint,
}

function formatCost(cost: number): string {
  if (cost >= 100_000) return `$${Math.round(cost / 1000).toLocaleString()}K`
  if (cost >= 1_000) return `$${Math.round(cost).toLocaleString()}`
  if (cost >= 1) return `$${cost.toFixed(2)}`
  return `$${cost.toFixed(2)}`
}

function ratioColor(ratio: number): string {
  const r = Math.max(ratio, 1 / ratio)
  if (r < 1.1) return "bg-emerald-100 text-emerald-700"
  if (r <= 2.0) return "bg-amber-100 text-amber-700"
  return "bg-red-100 text-red-700"
}

function tierBadge(tier: string): { label: string; cls: string } {
  switch (tier) {
    case "UNIVERSAL":
      return { label: "FEDERAL DATA", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" }
    case "SOCRATA":
      return { label: "OPEN DATA", cls: "bg-blue-50 text-blue-700 border-blue-200" }
    default:
      return { label: "RESEARCHED", cls: "bg-amber-50 text-amber-700 border-amber-200" }
  }
}

interface CostMetricCardProps {
  metric: CostMetricResult
  cityAName: string
  cityBName: string
  useAdjusted: boolean
  onClick: () => void
}

export function CostMetricCard({ metric, cityAName, cityBName, useAdjusted, onClick }: CostMetricCardProps) {
  const Icon = ICON_MAP[metric.icon] ?? FileText
  const costA = metric.city_a.cost
  const costB = metric.city_b.cost
  const maxCost = Math.max(costA, costB)
  const barWidthA = maxCost > 0 ? (costA / maxCost) * 100 : 0
  const barWidthB = maxCost > 0 ? (costB / maxCost) * 100 : 0

  const displayRatio = useAdjusted ? metric.rpp_adjusted_ratio : metric.ratio
  const moreExpensive = displayRatio >= 1 ? cityAName : cityBName
  const displayRatioValue = displayRatio >= 1 ? displayRatio : 1 / displayRatio
  const tier = tierBadge(metric.tier)

  return (
    <div
      onClick={onClick}
      className="bg-white rounded-lg border border-gray-200 p-5 cursor-pointer hover:shadow-md transition-shadow"
    >
      <div className="flex items-center gap-2 mb-3">
        <Icon className="h-4 w-4 text-gray-500" />
        <span className="text-sm font-semibold text-gray-800">{metric.short_label}</span>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-3">
        <div>
          <p className="text-xs text-gray-500 mb-0.5">{cityAName}</p>
          <p className="text-2xl font-bold tabular-nums">{formatCost(costA)}</p>
        </div>
        <div>
          <p className="text-xs text-gray-500 mb-0.5">{cityBName}</p>
          <p className="text-2xl font-bold tabular-nums">{formatCost(costB)}</p>
        </div>
      </div>

      <div className="space-y-1.5 mb-3">
        <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
          <div className="h-full rounded-full bg-purple-500" style={{ width: `${barWidthA}%` }} />
        </div>
        <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
          <div className="h-full rounded-full bg-indigo-500" style={{ width: `${barWidthB}%` }} />
        </div>
      </div>

      <div className="flex items-center justify-between mb-2">
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${ratioColor(displayRatio)}`}>
          {moreExpensive} is {displayRatioValue.toFixed(1)}x more
          {useAdjusted ? " (COL adj.)" : ""}
        </span>
      </div>

      <div className="flex items-center justify-between">
        <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium border ${tier.cls}`}>
          {tier.label}
        </span>
        <span className="text-[10px] text-gray-400">
          {metric.city_a.source_name} · {metric.city_a.source_year}
        </span>
      </div>
    </div>
  )
}

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
  FileText, Ticket, BookOpen, Users,
  Construction, UtensilsCrossed, PawPrint,
  PaintBucket: Paintbrush,
}

const CATEGORY_ACCENT: Record<string, string> = {
  getting_around: "#10b981",
  public_safety: "#8b5cf6",
  housing_health: "#f59e0b",
  city_services: "#6366f1",
  your_government: "#ec4899",
}

function formatCost(cost: number): string {
  const showCents = Math.abs(cost) < 10
  return cost.toLocaleString(undefined, {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: showCents ? 2 : 0,
    maximumFractionDigits: showCents ? 2 : 0,
  })
}

function ratioColor(ratio: number): string {
  const r = Math.max(ratio, 1 / ratio)
  if (r < 1.1) return "bg-emerald-100 text-emerald-700"
  if (r <= 2.0) return "bg-amber-100 text-amber-700"
  return "bg-red-100 text-red-700"
}

function costBasisColor(label: string): string {
  if (label === "Fully loaded cost") return "bg-purple-100 text-purple-700"
  if (label === "Operating cost") return "bg-emerald-100 text-emerald-700"
  if (label === "Contract rate") return "bg-blue-100 text-blue-700"
  if (label.includes("estimate")) return "bg-amber-100 text-amber-700"
  return "bg-gray-100 text-gray-700"
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
  const accent = CATEGORY_ACCENT[metric.category] ?? "#6366f1"

  return (
    <div
      onClick={onClick}
      className="relative bg-white rounded-md border border-gray-200 pl-3.5 pr-2.5 py-2 cursor-pointer hover:shadow-sm transition-shadow overflow-hidden"
    >
      <div className="absolute left-0 top-0 bottom-0 w-1 rounded-l-md" style={{ backgroundColor: accent }} />

      <div className="flex items-center gap-1.5 mb-1">
        <Icon className="h-3 w-3 text-gray-400 shrink-0" />
        <span className="text-[11px] font-semibold text-gray-800 truncate">{metric.short_label}</span>
      </div>

      <div className="grid grid-cols-2 gap-2 mb-1.5">
        <div>
          <p className="text-[9px] text-gray-400 leading-none mb-0.5">{cityAName}</p>
          <p className="text-base font-bold tabular-nums leading-tight">{formatCost(costA)}</p>
          <span
            className={`mt-1 inline-block rounded-full px-1.5 py-px text-[8px] font-medium leading-tight ${costBasisColor(metric.city_a.cost_basis_label)}`}
            title={metric.city_a.cost_basis_label}
          >
            {metric.city_a.cost_basis_label}
          </span>
        </div>
        <div>
          <p className="text-[9px] text-gray-400 leading-none mb-0.5">{cityBName}</p>
          <p className="text-base font-bold tabular-nums leading-tight">{formatCost(costB)}</p>
          <span
            className={`mt-1 inline-block rounded-full px-1.5 py-px text-[8px] font-medium leading-tight ${costBasisColor(metric.city_b.cost_basis_label)}`}
            title={metric.city_b.cost_basis_label}
          >
            {metric.city_b.cost_basis_label}
          </span>
        </div>
      </div>

      <div className="flex gap-0.5 mb-1.5">
        <div className="h-1.5 rounded-full bg-purple-500" style={{ width: `${barWidthA}%` }} />
        <div className="h-1.5 rounded-full bg-indigo-400" style={{ width: `${barWidthB}%` }} />
      </div>

      <span className={`inline-block rounded-full px-1.5 py-px text-[9px] font-medium leading-tight ${ratioColor(displayRatio)}`}>
        {moreExpensive} {displayRatioValue.toFixed(1)}x{useAdjusted ? " adj." : ""}
      </span>
    </div>
  )
}

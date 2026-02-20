"use client"

import { Card, CardContent } from "@/components/ui/card"
import {
  AlertTriangle,
  DollarSign,
  Building2,
  Search,
} from "lucide-react"
import type { WasteSummaryResponse } from "@/lib/apiClient"

function formatDollar(amount: number | null | undefined): string {
  if (amount == null) return "$0"
  const abs = Math.abs(amount)
  if (abs >= 1_000_000) return `$${(abs / 1_000_000).toFixed(1)}M`
  if (abs >= 1_000) return `$${(abs / 1_000).toFixed(0)}K`
  return `$${abs.toLocaleString()}`
}

interface StatItemProps {
  label: string
  value: string | number
  subtext: string
  icon: React.ReactNode
  accentColor: string
}

function StatItem({ label, value, subtext, icon, accentColor }: StatItemProps) {
  return (
    <Card className="relative overflow-hidden">
      <div
        className="absolute left-0 top-0 bottom-0 w-1"
        style={{ backgroundColor: accentColor }}
      />
      <CardContent className="p-5 pl-4">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <p className="text-sm font-medium text-muted-foreground">{label}</p>
            <p className="text-2xl font-bold tracking-tight">{value}</p>
            <p className="text-xs text-muted-foreground">{subtext}</p>
          </div>
          <div className="p-2 rounded-lg bg-gray-100">
            {icon}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

interface WasteStatBarProps {
  summary: WasteSummaryResponse | undefined
  isLoading: boolean
}

export function WasteStatBar({ summary, isLoading }: WasteStatBarProps) {
  if (isLoading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {[...Array(4)].map((_, i) => (
          <Card key={i} className="animate-pulse">
            <CardContent className="p-5">
              <div className="h-16 bg-gray-100 rounded" />
            </CardContent>
          </Card>
        ))}
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
      <StatItem
        label="Total Findings"
        value={summary?.total_findings ?? 0}
        subtext="across all categories"
        icon={<Search className="w-5 h-5 text-gray-500" />}
        accentColor="#6366f1"
      />
      <StatItem
        label="Critical"
        value={summary?.critical_count ?? 0}
        subtext="require immediate review"
        icon={<AlertTriangle className="w-5 h-5 text-red-500" />}
        accentColor="#ef4444"
      />
      <StatItem
        label="Estimated Exposure"
        value={formatDollar(summary?.estimated_exposure)}
        subtext="in questionable patterns"
        icon={<DollarSign className="w-5 h-5 text-amber-500" />}
        accentColor="#f59e0b"
      />
      <StatItem
        label="Depts Affected"
        value={summary?.departments_affected ?? 0}
        subtext="with 1+ findings"
        icon={<Building2 className="w-5 h-5 text-purple-500" />}
        accentColor="#8b5cf6"
      />
    </div>
  )
}

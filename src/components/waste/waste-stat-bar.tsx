"use client"

import { Card, CardContent } from "@/components/ui/card"
import {
  AlertTriangle,
  DollarSign,
  Building2,
  Search,
} from "lucide-react"
import type { WasteSummaryResponse } from "@/lib/apiClient"
import { formatDollar as _formatDollar } from "./waste-utils"

/** Stat bar needs "$0" instead of "" for null values. */
function formatDollar(amount: number | null | undefined): string {
  return _formatDollar(amount) || "$0"
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
      <CardContent className="p-3 pl-3">
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
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
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

  const noData = !summary

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
      <StatItem
        label="Total Findings"
        value={noData ? "—" : (summary.total_findings ?? 0).toLocaleString()}
        subtext="across all categories"
        icon={<Search className="w-5 h-5 text-gray-500" />}
        accentColor="#6366f1"
      />
      <StatItem
        label="Critical"
        value={noData ? "—" : (summary.critical_count ?? 0).toLocaleString()}
        subtext="require immediate review"
        icon={<AlertTriangle className="w-5 h-5 text-red-500" />}
        accentColor="#ef4444"
      />
      <StatItem
        label="Estimated Exposure"
        value={noData ? "—" : formatDollar(summary.net_exposure ?? summary.estimated_exposure)}
        subtext={
          !noData && summary.gross_exposure != null && summary.net_exposure != null
            ? `de-duplicated from ${formatDollar(summary.gross_exposure)} gross`
            : "in questionable patterns"
        }
        icon={<DollarSign className="w-5 h-5 text-amber-500" />}
        accentColor="#f59e0b"
      />
      <StatItem
        label="Depts Affected"
        value={noData ? "—" : (summary.departments_affected ?? 0).toLocaleString()}
        subtext="with 1+ findings"
        icon={<Building2 className="w-5 h-5 text-purple-500" />}
        accentColor="#8b5cf6"
      />
    </div>
  )
}

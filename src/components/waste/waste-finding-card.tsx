"use client"

import { cn } from "@/lib/utils"
import { ChevronDown, ShieldCheck, ShieldAlert, ShieldQuestion, AlertCircle, Sparkles } from "lucide-react"
import { type WasteFinding } from "@/lib/apiClient"

function formatDollar(amount: number | null | undefined): string {
  if (amount == null) return ""
  const abs = Math.abs(amount)
  if (abs >= 1_000_000) return `$${(abs / 1_000_000).toFixed(1)}M`
  if (abs >= 1_000) return `$${(abs / 1_000).toFixed(0)}K`
  return `$${abs.toLocaleString()}`
}

const severityConfig = {
  critical: {
    bg: "bg-red-100",
    text: "text-red-700",
    border: "border-red-200",
    label: "CRIT",
    metricColor: "text-red-600",
  },
  high: {
    bg: "bg-amber-100",
    text: "text-amber-700",
    border: "border-amber-200",
    label: "HIGH",
    metricColor: "text-amber-600",
  },
  medium: {
    bg: "bg-indigo-100",
    text: "text-indigo-700",
    border: "border-indigo-200",
    label: "MED",
    metricColor: "text-indigo-600",
  },
}

const confidenceConfig = {
  high: {
    icon: ShieldCheck,
    bg: "bg-emerald-50",
    text: "text-emerald-700",
    border: "border-emerald-200",
    label: "High confidence",
  },
  medium: {
    icon: ShieldAlert,
    bg: "bg-slate-50",
    text: "text-slate-600",
    border: "border-slate-200",
    label: "Medium confidence",
  },
  low: {
    icon: ShieldQuestion,
    bg: "bg-gray-50",
    text: "text-gray-500",
    border: "border-gray-200",
    label: "Low confidence",
  },
}

interface WasteFindingCardProps {
  finding: WasteFinding
  isExpanded: boolean
  onToggle: () => void
  onAskSeymour?: (finding: WasteFinding) => void
}

export function WasteFindingCard({
  finding,
  isExpanded,
  onToggle,
  onAskSeymour,
}: WasteFindingCardProps) {
  const sev = severityConfig[finding.severity]
  const conf = confidenceConfig[finding.confidence ?? "medium"]
  const ConfIcon = conf.icon

  const handleAskSeymour = (e: React.MouseEvent) => {
    e.stopPropagation()
    onAskSeymour?.(finding)
  }

  return (
    <div
      className={cn(
        "border rounded-lg transition-all cursor-pointer",
        isExpanded ? "shadow-sm border-gray-300" : "border-gray-200 hover:border-gray-300",
        finding.isPartialData && "border-l-2 border-l-amber-400"
      )}
      onClick={onToggle}
    >
      {/* Collapsed row */}
      <div className="flex items-center gap-3 px-4 py-3">
        {/* Severity badge */}
        <span
          className={cn(
            "inline-flex items-center justify-center px-2 py-0.5 rounded text-[10px] font-bold uppercase shrink-0",
            sev.bg,
            sev.text
          )}
        >
          {sev.label}
        </span>

        {/* Metric headline */}
        <span className={cn("font-semibold text-sm whitespace-nowrap", sev.metricColor)}>
          {finding.metric}
        </span>

        {/* Metric detail */}
        <span className="text-sm text-gray-600 truncate">
          {finding.metricDetail}
        </span>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Confidence indicator (compact) */}
        <span className="hidden lg:inline-flex shrink-0" title={conf.label}>
          <ConfIcon className={cn("w-3.5 h-3.5", conf.text)} />
        </span>

        {/* Entity tag */}
        <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded whitespace-nowrap hidden sm:inline-flex">
          {finding.entity}
        </span>

        {/* Amount */}
        {finding.amount != null && finding.amount > 0 && (
          <span className="text-sm font-medium text-gray-700 whitespace-nowrap hidden md:inline">
            {formatDollar(finding.amount)}
          </span>
        )}

        {/* Chevron */}
        <ChevronDown
          className={cn(
            "w-4 h-4 text-gray-400 shrink-0 transition-transform",
            isExpanded && "rotate-180"
          )}
        />
      </div>

      {/* Expanded detail */}
      {isExpanded && (
        <div className="px-4 pb-4 pt-1 border-t border-gray-100">
          {/* Mobile entity + amount */}
          <div className="flex items-center gap-2 mb-2 sm:hidden">
            <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded">
              {finding.entity}
            </span>
            {finding.amount != null && finding.amount > 0 && (
              <span className="text-sm font-medium text-gray-700">
                {formatDollar(finding.amount)}
              </span>
            )}
          </div>

          <p className="text-sm text-gray-700 leading-relaxed mb-3">
            {finding.description}
          </p>

          {/* Confidence badge */}
          <div className={cn(
            "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs mb-3",
            conf.bg, conf.text, "border", conf.border
          )}>
            <ConfIcon className="w-3.5 h-3.5" />
            <span className="font-medium">{conf.label}</span>
            {finding.confidenceReason && (
              <span className="text-gray-500 ml-1">— {finding.confidenceReason}</span>
            )}
          </div>

          {/* Caveat / data quality warning */}
          {finding.caveat && (
            <div className="flex items-start gap-2 mb-3 p-2 bg-amber-50 border border-amber-100 rounded-md">
              <AlertCircle className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" />
              <p className="text-xs text-amber-700">{finding.caveat}</p>
            </div>
          )}

          {/* Partial data indicator */}
          {finding.isPartialData && !finding.caveat?.includes("partial") && (
            <div className="flex items-start gap-2 mb-3 p-2 bg-amber-50 border border-amber-100 rounded-md">
              <AlertCircle className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" />
              <p className="text-xs text-amber-700">
                Based on partial fiscal year data. Values may change when the full year is available.
              </p>
            </div>
          )}

          {/* Tool tag + Ask Seymour */}
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 text-xs text-gray-400">
              <span className="bg-gray-50 px-2 py-0.5 rounded">
                {finding.tool}
              </span>
              <span>{finding.id}</span>
              <span className="text-gray-300">
                Priority: {finding.priority_score ?? "—"}
              </span>
            </div>

            {/* Ask Seymour button */}
            <button
              onClick={handleAskSeymour}
              className={cn(
                "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium",
                "bg-violet-50 text-violet-700 border border-violet-200",
                "hover:bg-violet-100 hover:border-violet-300 transition-colors"
              )}
            >
              <Sparkles className="w-3.5 h-3.5" />
              Ask Seymour for analysis
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

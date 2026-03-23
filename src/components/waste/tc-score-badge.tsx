"use client"

import { cn } from "@/lib/utils"
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  TooltipProvider,
} from "@/components/ui/tooltip"

// ── Canonical TC Score thresholds ────────────────────────────────────────────

export function scoreTier(score: number): "critical" | "high" | "medium" | "low" {
  if (score >= 81) return "critical"
  if (score >= 61) return "high"
  if (score >= 31) return "medium"
  return "low"
}

const TIER_STYLES = {
  critical: {
    bg: "bg-red-600",
    bgLight: "bg-red-100",
    text: "text-white",
    textDark: "text-red-700",
    border: "border-red-200",
    label: "Critical",
  },
  high: {
    bg: "bg-orange-500",
    bgLight: "bg-orange-100",
    text: "text-white",
    textDark: "text-orange-700",
    border: "border-orange-200",
    label: "High",
  },
  medium: {
    bg: "bg-amber-500",
    bgLight: "bg-amber-100",
    text: "text-gray-900",
    textDark: "text-amber-700",
    border: "border-amber-200",
    label: "Medium",
  },
  low: {
    bg: "bg-green-500",
    bgLight: "bg-green-100",
    text: "text-white",
    textDark: "text-green-700",
    border: "border-green-200",
    label: "Low",
  },
} as const

export type TCScoreBadgeSize = "sm" | "md" | "lg" | "xl"

interface TCScoreBadgeProps {
  score: number
  size?: TCScoreBadgeSize
  showLabel?: boolean
  tooltipBasis?: string
  className?: string
}

/**
 * Canonical Transparent City Score badge.
 * Displays score with 1 decimal in a color-coded rounded badge.
 * Hover tooltip shows score tier and optional basis text.
 */
export function TCScoreBadge({
  score,
  size = "sm",
  showLabel = false,
  tooltipBasis,
  className,
}: TCScoreBadgeProps) {
  const clamped = Math.min(100, Math.max(0, score))
  const tier = scoreTier(clamped)
  const style = TIER_STYLES[tier]

  const sizeClasses: Record<TCScoreBadgeSize, string> = {
    sm: "px-2 py-0.5 text-xs",
    md: "px-2.5 py-1 text-sm",
    lg: "px-3 py-1.5 text-base",
    xl: "w-[72px] h-[72px] text-2xl flex-col",
  }

  const badge = (
    <span
      className={cn(
        "inline-flex items-center justify-center rounded-full font-bold tabular-nums",
        style.bg,
        style.text,
        sizeClasses[size],
        size === "xl" && "rounded-xl",
        className
      )}
    >
      <span className="leading-none">{clamped.toFixed(1)}</span>
      {showLabel && size !== "xl" && (
        <span className="ml-1 text-[0.75em] font-semibold uppercase opacity-90">
          {style.label}
        </span>
      )}
      {size === "xl" && (
        <span className="text-[9px] font-semibold uppercase tracking-wider mt-1 opacity-90">
          {style.label}
        </span>
      )}
    </span>
  )

  const tooltipText =
    tooltipBasis ||
    `TC Score ${clamped.toFixed(1)} — ${style.label} risk (${tier === "critical" ? "81-100" : tier === "high" ? "61-80" : tier === "medium" ? "31-60" : "0-30"})`

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>{badge}</TooltipTrigger>
        <TooltipContent side="top" className="max-w-[260px] text-center">
          <p>{tooltipText}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

/**
 * Inline tier badge (light background, dark text) — for severity labels.
 */
export function TCTierBadge({
  score,
  className,
}: {
  score: number
  className?: string
}) {
  const tier = scoreTier(score)
  const style = TIER_STYLES[tier]
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold capitalize",
        style.bgLight,
        style.textDark,
        style.border,
        className
      )}
    >
      {style.label}
    </span>
  )
}

/** Re-export for convenience */
export { TIER_STYLES }

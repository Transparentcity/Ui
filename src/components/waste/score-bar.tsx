"use client"

import { cn } from "@/lib/utils"
import { TIER_STYLES, scoreTier } from "./tc-score-badge"

function scoreColor(score: number): string {
  return TIER_STYLES[scoreTier(score)].bg
}

function scoreTextColor(score: number): string {
  return TIER_STYLES[scoreTier(score)].textDark
}

interface ScoreBarProps {
  score: number
  showLabel?: boolean
  className?: string
}

export function ScoreBar({ score, showLabel = true, className }: ScoreBarProps) {
  const clamped = Math.min(100, Math.max(0, score))
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <div className="flex-1 h-2 rounded-full bg-gray-100 overflow-hidden min-w-[60px]">
        <div
          className={cn("h-full rounded-full transition-all", scoreColor(clamped))}
          style={{ width: `${clamped}%` }}
        />
      </div>
      {showLabel && (
        <span className={cn("text-xs font-semibold tabular-nums w-8 text-right", scoreTextColor(clamped))}>
          {Math.round(clamped)}
        </span>
      )}
    </div>
  )
}

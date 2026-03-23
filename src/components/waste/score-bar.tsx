"use client"

import { cn } from "@/lib/utils"

function scoreColor(score: number): string {
  if (score >= 81) return "bg-red-500"
  if (score >= 61) return "bg-orange-500"
  if (score >= 31) return "bg-amber-500"
  return "bg-green-500"
}

function scoreTextColor(score: number): string {
  if (score >= 81) return "text-red-700"
  if (score >= 61) return "text-orange-700"
  if (score >= 31) return "text-amber-700"
  return "text-green-700"
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

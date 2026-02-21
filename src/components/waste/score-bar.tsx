"use client"

import { cn } from "@/lib/utils"

function scoreColor(score: number): string {
  if (score >= 80) return "bg-red-500"
  if (score >= 60) return "bg-orange-500"
  if (score >= 40) return "bg-yellow-500"
  if (score >= 20) return "bg-blue-500"
  return "bg-gray-400"
}

function scoreTextColor(score: number): string {
  if (score >= 80) return "text-red-700"
  if (score >= 60) return "text-orange-700"
  if (score >= 40) return "text-yellow-700"
  if (score >= 20) return "text-blue-700"
  return "text-gray-500"
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

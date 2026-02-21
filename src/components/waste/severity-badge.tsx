"use client"

import { cn } from "@/lib/utils"

const SEVERITY_STYLES: Record<string, string> = {
  critical: "bg-red-100 text-red-800 border-red-200",
  high: "bg-orange-100 text-orange-800 border-orange-200",
  medium: "bg-yellow-100 text-yellow-800 border-yellow-200",
  low: "bg-blue-100 text-blue-800 border-blue-200",
  info: "bg-gray-100 text-gray-600 border-gray-200",
}

interface SeverityBadgeProps {
  severity: string
  className?: string
}

export function SeverityBadge({ severity, className }: SeverityBadgeProps) {
  const key = severity.toLowerCase()
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold capitalize",
        SEVERITY_STYLES[key] ?? SEVERITY_STYLES.info,
        className
      )}
    >
      {severity}
    </span>
  )
}

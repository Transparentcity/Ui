"use client"

import type { WasteFinding } from "@/lib/apiClient"
import { selectTopFindings } from "./waste-ranked-findings"
import { deriveHeadline } from "./waste-finding-narrator"
import { formatDollar } from "./waste-utils"
import { cn } from "@/lib/utils"
import { AlertTriangle } from "lucide-react"

const SEV_DOT: Record<string, string> = {
  critical: "bg-red-500",
  high: "bg-amber-500",
  medium: "bg-yellow-400",
  low: "bg-gray-300",
  info: "bg-gray-300",
}

/**
 * Curated hero at the top of the findings page: the handful of most
 * suspicious-yet-credible findings, told as a plain-language list so an
 * ordinary reader sees "here's what looks fishy" before the full firehose.
 * Clicking a row jumps the list below to that entity.
 */
export function WasteTopFindings({
  findings,
  onSelectEntity,
  count = 5,
}: {
  findings: WasteFinding[]
  onSelectEntity?: (entity: string) => void
  count?: number
}) {
  const top = selectTopFindings(findings, count)
  if (top.length === 0) return null

  return (
    <section
      aria-label="Most suspicious findings"
      className="mb-4 rounded-lg border border-gray-200 bg-white overflow-hidden"
    >
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-gray-100 bg-gray-50">
        <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" aria-hidden="true" />
        <span className="text-sm font-semibold text-gray-800">
          Most suspicious this period
        </span>
        <span className="text-xs text-gray-500">
          — the {top.length} highest-confidence, highest-impact patterns
        </span>
      </div>
      <ol className="divide-y divide-gray-100">
        {top.map((f, i) => {
          const amount = f.estimated_dollar_impact ?? f.amount ?? null
          const row = (
            <>
              <span className="text-xs font-semibold text-gray-400 w-4 shrink-0 tabular-nums">
                {i + 1}
              </span>
              <span
                className={cn(
                  "w-2 h-2 rounded-full shrink-0",
                  SEV_DOT[f.severity] ?? "bg-gray-300"
                )}
                aria-hidden="true"
              />
              <span className="text-sm text-gray-800 flex-1 min-w-0 truncate">
                {deriveHeadline(f)}
              </span>
              {amount != null && amount > 0 && (
                <span className="text-sm font-medium text-gray-700 shrink-0 tabular-nums">
                  {formatDollar(amount)}
                </span>
              )}
            </>
          )
          const cls =
            "w-full flex items-center gap-3 px-4 py-2.5 text-left"
          return (
            <li key={f.id}>
              {onSelectEntity && f.entity ? (
                <button
                  type="button"
                  onClick={() => onSelectEntity(f.entity)}
                  className={cn(cls, "hover:bg-gray-50 transition-colors")}
                >
                  {row}
                </button>
              ) : (
                <div className={cls}>{row}</div>
              )}
            </li>
          )
        })}
      </ol>
    </section>
  )
}

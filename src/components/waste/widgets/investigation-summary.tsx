"use client"

import { useMemo } from "react"
import { useWasteInvestigations } from "@/lib/hooks/useWaste"
import { Search, AlertTriangle, Clock, CheckCircle2, Inbox } from "lucide-react"
import { cn } from "@/lib/utils"

interface InvestigationSummaryProps {
  cityId: number | null
}

export function InvestigationSummary({ cityId }: InvestigationSummaryProps) {
  const openQ = useWasteInvestigations({ cityId, status: "open" })
  const inProgressQ = useWasteInvestigations({ cityId, status: "in_progress" })
  const pendingQ = useWasteInvestigations({ cityId, status: "pending_response" })
  const closedQ = useWasteInvestigations({ cityId, status: "closed" })

  const isLoading = openQ.isLoading || inProgressQ.isLoading || pendingQ.isLoading || closedQ.isLoading

  const counts = useMemo(() => ({
    open: openQ.data?.total ?? 0,
    in_progress: inProgressQ.data?.total ?? 0,
    pending_response: pendingQ.data?.total ?? 0,
    closed: closedQ.data?.total ?? 0,
  }), [openQ.data, inProgressQ.data, pendingQ.data, closedQ.data])

  const overdueCount = useMemo(() => {
    const allItems = [
      ...(openQ.data?.items ?? []),
      ...(inProgressQ.data?.items ?? []),
      ...(pendingQ.data?.items ?? []),
    ]
    const now = new Date()
    return allItems.filter((inv) =>
      inv.actions?.some(
        (a) =>
          a.status !== "completed" &&
          a.status !== "cancelled" &&
          a.due_date &&
          new Date(a.due_date) < now
      )
    ).length
  }, [openQ.data, inProgressQ.data, pendingQ.data])

  if (isLoading) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-5">
        <div className="h-4 w-44 bg-gray-100 rounded animate-pulse mb-4" />
        <div className="grid grid-cols-2 gap-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-14 bg-gray-50 rounded animate-pulse" />
          ))}
        </div>
      </div>
    )
  }

  const stats = [
    { label: "Open", count: counts.open, icon: Inbox, color: "text-blue-600" },
    { label: "In Progress", count: counts.in_progress, icon: Search, color: "text-yellow-600" },
    { label: "Pending Response", count: counts.pending_response, icon: Clock, color: "text-orange-600" },
    { label: "Closed", count: counts.closed, icon: CheckCircle2, color: "text-gray-500" },
  ]

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-5">
      <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
        <Search className="w-4 h-4 text-gray-500" />
        Active Investigations
      </h3>
      <div className="grid grid-cols-2 gap-3">
        {stats.map((s) => {
          const Icon = s.icon
          return (
            <div key={s.label} className="flex items-center gap-2 p-2 rounded-lg bg-gray-50">
              <Icon className={cn("w-4 h-4 shrink-0", s.color)} />
              <div>
                <div className="text-lg font-bold tabular-nums text-gray-900">{s.count}</div>
                <div className="text-[11px] text-gray-500">{s.label}</div>
              </div>
            </div>
          )
        })}
      </div>
      {overdueCount > 0 && (
        <div className="mt-3 flex items-center gap-2 p-2 rounded-lg bg-red-50 border border-red-200">
          <AlertTriangle className="w-4 h-4 text-red-500 shrink-0" />
          <span className="text-xs text-red-700 font-medium">
            {overdueCount} overdue action{overdueCount !== 1 ? "s" : ""}
          </span>
        </div>
      )}
    </div>
  )
}

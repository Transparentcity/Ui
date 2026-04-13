"use client"

import { useMemo } from "react"
import { useWasteReviewQueue } from "@/lib/hooks/useWaste"
import { ClipboardCheck, Clock, UserCheck, CheckCircle2 } from "lucide-react"
import { cn } from "@/lib/utils"

interface QueueStatusProps {
  cityId: number | null
}

const STATUS_META: Record<string, { label: string; icon: React.ComponentType<{ className?: string }>; color: string }> = {
  pending: { label: "New", icon: Clock, color: "text-yellow-600 bg-yellow-50 border-yellow-200" },
  assigned: { label: "In Review", icon: UserCheck, color: "text-blue-600 bg-blue-50 border-blue-200" },
  disposed: { label: "Disposed", icon: CheckCircle2, color: "text-emerald-600 bg-emerald-50 border-emerald-200" },
}

export function QueueStatus({ cityId }: QueueStatusProps) {
  const pendingQ = useWasteReviewQueue({ cityId, status: "pending", perPage: 1 })
  const assignedQ = useWasteReviewQueue({ cityId, status: "assigned", perPage: 1 })
  const disposedQ = useWasteReviewQueue({ cityId, status: "disposed", perPage: 1 })

  const counts = useMemo(() => ({
    pending: pendingQ.data?.total ?? 0,
    assigned: assignedQ.data?.total ?? 0,
    disposed: disposedQ.data?.total ?? 0,
  }), [pendingQ.data, assignedQ.data, disposedQ.data])

  const isLoading = pendingQ.isLoading || assignedQ.isLoading || disposedQ.isLoading

  if (isLoading) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-5">
        <div className="h-4 w-32 bg-gray-100 rounded animate-pulse mb-4" />
        <div className="grid grid-cols-3 gap-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 bg-gray-50 rounded animate-pulse" />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-5">
      <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
        <ClipboardCheck className="w-4 h-4 text-gray-500" />
        Queue Status
      </h3>
      <div className="grid grid-cols-3 gap-3">
        {Object.entries(STATUS_META).map(([key, meta]) => {
          const Icon = meta.icon
          return (
            <div
              key={key}
              className={cn("rounded-lg border p-3 text-center", meta.color)}
            >
              <Icon className="w-5 h-5 mx-auto mb-1" />
              <div className="text-2xl font-bold tabular-nums">
                {counts[key as keyof typeof counts]}
              </div>
              <div className="text-[11px] font-medium mt-0.5">{meta.label}</div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

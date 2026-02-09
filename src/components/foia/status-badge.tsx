"use client"

import type { RequestStatus, TaskStatus } from "@/lib/foia/types"
import { cn } from "@/lib/utils"

const requestStatusConfig: Record<RequestStatus, { label: string; className: string }> = {
  draft: { label: "Draft", className: "bg-gray-100 text-gray-700" },
  submitted: { label: "Submitted", className: "bg-blue-100 text-blue-700" },
  submitted_unacknowledged: { label: "Unacknowledged", className: "bg-amber-100 text-amber-700" },
  acknowledged: { label: "Acknowledged", className: "bg-sky-100 text-sky-700" },
  clarification_requested: { label: "Clarification", className: "bg-orange-100 text-orange-700" },
  partially_fulfilled: { label: "Partial", className: "bg-violet-100 text-violet-700" },
  fee_requested: { label: "Fee Requested", className: "bg-rose-100 text-rose-700" },
  extension_claimed: { label: "Extension", className: "bg-yellow-100 text-yellow-700" },
  denied: { label: "Denied", className: "bg-red-100 text-red-700" },
  fulfilled: { label: "Fulfilled", className: "bg-emerald-100 text-emerald-700" },
  closed_incomplete: { label: "Closed", className: "bg-gray-200 text-gray-600" },
}

const taskStatusConfig: Record<TaskStatus, { label: string; className: string }> = {
  pending: { label: "Pending", className: "bg-amber-100 text-amber-700" },
  assigned: { label: "Assigned", className: "bg-blue-100 text-blue-700" },
  in_progress: { label: "In Progress", className: "bg-violet-100 text-violet-700" },
  completed: { label: "Completed", className: "bg-emerald-100 text-emerald-700" },
  cancelled: { label: "Cancelled", className: "bg-gray-200 text-gray-600" },
}

export function RequestStatusBadge({ status }: { status: RequestStatus }) {
  const config = requestStatusConfig[status] ?? { label: status, className: "bg-gray-100 text-gray-700" }
  return (
    <span className={cn("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap", config.className)}>
      {config.label}
    </span>
  )
}

export function TaskStatusBadge({ status }: { status: TaskStatus }) {
  const config = taskStatusConfig[status] ?? { label: status, className: "bg-gray-100 text-gray-700" }
  return (
    <span className={cn("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap", config.className)}>
      {config.label}
    </span>
  )
}

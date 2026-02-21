"use client"

import { cn } from "@/lib/utils"
import {
  FileText,
  Users,
  MapPin,
  Gavel,
  ExternalLink,
  StickyNote,
  FolderSearch,
} from "lucide-react"
import type { WasteInvestigationAction } from "@/lib/apiClient"

const ACTION_TYPE_META: Record<
  WasteInvestigationAction["action_type"],
  { icon: React.ComponentType<{ className?: string }>; label: string }
> = {
  document_request: { icon: FileText, label: "Document Request" },
  interview: { icon: Users, label: "Interview" },
  site_visit: { icon: MapPin, label: "Site Visit" },
  subpoena: { icon: Gavel, label: "Subpoena" },
  referral: { icon: ExternalLink, label: "Referral" },
  note: { icon: StickyNote, label: "Note" },
  evidence_collected: { icon: FolderSearch, label: "Evidence Collected" },
}

const STATUS_STYLES: Record<string, string> = {
  pending: "bg-gray-100 text-gray-700",
  in_progress: "bg-blue-100 text-blue-700",
  completed: "bg-emerald-100 text-emerald-700",
  cancelled: "bg-red-100 text-red-700",
}

interface ActionCardProps {
  action: WasteInvestigationAction
  className?: string
}

export function ActionCard({ action, className }: ActionCardProps) {
  const meta = ACTION_TYPE_META[action.action_type] ?? ACTION_TYPE_META.note
  const Icon = meta.icon
  const isOverdue =
    action.status !== "completed" &&
    action.status !== "cancelled" &&
    action.due_date &&
    new Date(action.due_date) < new Date()

  return (
    <div
      className={cn(
        "flex items-start gap-3 rounded-lg border border-gray-200 bg-white p-4",
        isOverdue && "border-red-200 bg-red-50/30",
        className
      )}
    >
      <div className="rounded-md bg-gray-100 p-2 shrink-0">
        <Icon className="w-4 h-4 text-gray-600" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium text-gray-900 truncate">
            {action.title}
          </span>
          <span className="text-[10px] text-gray-500 uppercase tracking-wide">
            {meta.label}
          </span>
          <span
            className={cn(
              "inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold capitalize",
              STATUS_STYLES[action.status] ?? STATUS_STYLES.pending
            )}
          >
            {action.status.replace("_", " ")}
          </span>
        </div>
        {action.description && (
          <p className="mt-1 text-xs text-gray-500 line-clamp-2">
            {action.description}
          </p>
        )}
        <div className="mt-2 flex items-center gap-3 text-[11px] text-gray-400">
          {action.assignee && <span>Assigned to {action.assignee}</span>}
          {action.due_date && (
            <span className={isOverdue ? "text-red-600 font-medium" : ""}>
              Due {new Date(action.due_date).toLocaleDateString()}
            </span>
          )}
          {action.completed_at && (
            <span className="text-emerald-600">
              Completed {new Date(action.completed_at).toLocaleDateString()}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

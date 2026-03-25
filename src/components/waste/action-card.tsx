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
  Bot,
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
  evidence_collected: { icon: FolderSearch, label: "Evidence" },
  ai_auditor_review: { icon: Bot, label: "AI Auditor Review" },
}

interface ActionCardProps {
  action: WasteInvestigationAction
  className?: string
}

export function ActionCard({ action, className }: ActionCardProps) {
  const meta = ACTION_TYPE_META[action.action_type] ?? ACTION_TYPE_META.note
  const Icon = meta.icon

  const timestamp = action.created_at
    ? new Date(action.created_at).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      })
    : null

  return (
    <div
      className={cn(
        "rounded-lg border border-gray-200 bg-white p-3",
        className
      )}
    >
      <div className="flex items-start gap-2.5">
        <div className="rounded-md bg-gray-100 p-1.5 shrink-0 mt-0.5">
          <Icon className="w-3.5 h-3.5 text-gray-500" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            {timestamp && (
              <span className="text-[11px] text-gray-400">{timestamp}</span>
            )}
            {action.action_type !== "note" && (
              <span className="text-[10px] text-gray-400 uppercase tracking-wide bg-gray-50 px-1.5 py-0.5 rounded">
                {meta.label}
              </span>
            )}
          </div>
          <p className="mt-1 text-sm text-gray-700 whitespace-pre-wrap">
            {action.description || action.title}
          </p>
        </div>
      </div>
    </div>
  )
}

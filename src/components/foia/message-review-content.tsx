"use client"

import { useEffect, useState, useCallback, useRef } from "react"
import Link from "next/link"
import {
  Loader2,
  CheckCircle2,
  Send,
  Search,
  MapPin,
  DollarSign,
  ShieldAlert,
  Clock,
  FileText,
  MessageSquare,
  ChevronDown,
  ChevronUp,
  X,
  Sparkles,
  Copy,
  Check,
  Plus,
} from "lucide-react"
import {
  listFoiaTasks,
  listFoiaMessages,
  getFoiaRequest,
  aiDraftFoiaRequest,
  listFoiaRequests,
} from "@/lib/foiaApiClient"
import { TaskStatusBadge, RequestStatusBadge } from "@/components/foia/status-badge"
import type { FoiaTask, FoiaRequest, FoiaMessage } from "@/lib/foia/types"
import { formatDistanceToNow, format } from "date-fns"

// ---------------------------------------------------------------------------
// Follow-up intent categories
// ---------------------------------------------------------------------------

type IntentCategory =
  | "all"
  | "narrow_request"
  | "pickup_data"
  | "pay_fee"
  | "appeal"
  | "send_response"
  | "follow_up_partial"
  | "general_followup"
  | "review_draft"

interface IntentMeta {
  label: string
  shortLabel: string
  description: string
  icon: React.ComponentType<{ className?: string }>
  color: string
  bgColor: string
  borderColor: string
  templateGuidance: string
}

const INTENT_META: Record<Exclude<IntentCategory, "all">, IntentMeta> = {
  narrow_request: {
    label: "Narrow Request",
    shortLabel: "Narrow",
    description: "City asked to narrow or clarify the scope of the request",
    icon: Search,
    color: "text-amber-700",
    bgColor: "bg-amber-50",
    borderColor: "border-amber-200",
    templateGuidance:
      "Revise the request with a narrower date range, fewer fields, or more specific department — while preserving the core data coverage needed.",
  },
  pickup_data: {
    label: "Visit in Person",
    shortLabel: "Visit",
    description: "City says data is available for in-person pickup",
    icon: MapPin,
    color: "text-blue-700",
    bgColor: "bg-blue-50",
    borderColor: "border-blue-200",
    templateGuidance:
      "Confirm the pickup location, hours, and any ID/reference number needed. Ask if the data can alternatively be emailed or uploaded to save a trip.",
  },
  pay_fee: {
    label: "Approve Costs",
    shortLabel: "Pay Fee",
    description: "City sent a fee estimate or invoice for copying/mailing",
    icon: DollarSign,
    color: "text-emerald-700",
    bgColor: "bg-emerald-50",
    borderColor: "border-emerald-200",
    templateGuidance:
      "Review the fee estimate. If reasonable, confirm willingness to pay. If excessive, ask for an itemized breakdown and cite fee-waiver provisions in the statute.",
  },
  appeal: {
    label: "Appeal Denial",
    shortLabel: "Appeal",
    description: "City denied the request or claimed an exemption",
    icon: ShieldAlert,
    color: "text-red-700",
    bgColor: "bg-red-50",
    borderColor: "border-red-200",
    templateGuidance:
      "Draft a formal appeal citing the relevant statute. Address each exemption claim. Request a Vaughn index if records were partially withheld.",
  },
  send_response: {
    label: "Draft Response",
    shortLabel: "Respond",
    description: "A reply email or letter needs to be composed and sent",
    icon: Send,
    color: "text-purple-700",
    bgColor: "bg-purple-50",
    borderColor: "border-purple-200",
    templateGuidance:
      "Compose a professional response addressing the agency's message. Reference the request number and maintain a cordial but firm tone.",
  },
  follow_up_partial: {
    label: "Partial Records",
    shortLabel: "Partial",
    description: "Received partial data — some departments still searching",
    icon: FileText,
    color: "text-indigo-700",
    bgColor: "bg-indigo-50",
    borderColor: "border-indigo-200",
    templateGuidance:
      "Acknowledge the partial delivery. Ask for a timeline on the remaining departments and cite the statute's rolling-disclosure provisions.",
  },
  general_followup: {
    label: "General Follow-up",
    shortLabel: "Follow Up",
    description: "Overdue response or routine status check needed",
    icon: Clock,
    color: "text-gray-700",
    bgColor: "bg-gray-50",
    borderColor: "border-gray-200",
    templateGuidance:
      "Draft a polite follow-up referencing the original request date, the statutory response period, and requesting an update on status.",
  },
  review_draft: {
    label: "Review AI Draft",
    shortLabel: "Review",
    description: "An AI-generated draft needs human review before sending",
    icon: Sparkles,
    color: "text-violet-700",
    bgColor: "bg-violet-50",
    borderColor: "border-violet-200",
    templateGuidance:
      "Review the AI-generated letter for accuracy, tone, and completeness. Edit as needed before approving.",
  },
}

const FILTER_TABS: { id: IntentCategory; label: string }[] = [
  { id: "all", label: "All" },
  { id: "narrow_request", label: "Narrow Request" },
  { id: "pickup_data", label: "Visit in Person" },
  { id: "pay_fee", label: "Approve Costs" },
  { id: "appeal", label: "Appeal" },
  { id: "send_response", label: "Draft Response" },
  { id: "follow_up_partial", label: "Partial Records" },
  { id: "general_followup", label: "General" },
  { id: "review_draft", label: "Review Draft" },
]

// Map task types to intent categories
function taskTypeToIntent(taskType: string): Exclude<IntentCategory, "all"> {
  const map: Record<string, Exclude<IntentCategory, "all">> = {
    narrow_request: "narrow_request",
    pickup_data: "pickup_data",
    pay_fee: "pay_fee",
    appeal_denial: "appeal",
    send_response: "send_response",
    follow_up_partial: "follow_up_partial",
    general_followup: "general_followup",
    review_rewrite: "review_draft",
    approve_follow_up: "review_draft",
    review_delivery: "general_followup",
    review_data_completeness: "general_followup",
  }
  return map[taskType] || "general_followup"
}

// ---------------------------------------------------------------------------
// Enriched task with request + message context
// ---------------------------------------------------------------------------

interface EnrichedFollowUp {
  task: FoiaTask
  intent: Exclude<IntentCategory, "all">
  request?: FoiaRequest
  triggerMessage?: FoiaMessage
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function FollowUpsContent() {
  const [followUps, setFollowUps] = useState<EnrichedFollowUp[]>([])
  const [loading, setLoading] = useState(true)
  const [activeFilter, setActiveFilter] = useState<IntentCategory>("all")
  const [expandedId, setExpandedId] = useState<number | null>(null)
  const [showNewForm, setShowNewForm] = useState(false)

  const loadFollowUps = useCallback(async () => {
    try {
      const allTasks = await listFoiaTasks()
      // Filter to actionable follow-up tasks (not completed/cancelled)
      const actionable = allTasks.filter(
        (t) =>
          t.status !== "completed" &&
          t.status !== "cancelled" &&
          // Include all follow-up oriented task types
          [
            "review_rewrite",
            "approve_follow_up",
            "narrow_request",
            "pickup_data",
            "send_response",
            "general_followup",
            "pay_fee",
            "appeal_denial",
            "follow_up_partial",
            "review_delivery",
          ].includes(t.type)
      )

      // Enrich with request data in parallel
      const uniqueRequestIds = [...new Set(actionable.filter((t) => t.request_id).map((t) => t.request_id!))]
      const requestMap = new Map<number, FoiaRequest>()
      const messageMap = new Map<number, FoiaMessage[]>()

      await Promise.all(
        uniqueRequestIds.map(async (rid) => {
          try {
            const [req, msgs] = await Promise.all([getFoiaRequest(rid), listFoiaMessages(rid)])
            requestMap.set(rid, req)
            messageMap.set(rid, msgs)
          } catch {
            // Request may have been deleted
          }
        })
      )

      const enriched: EnrichedFollowUp[] = actionable.map((task) => {
        const intent = taskTypeToIntent(task.type)
        const request = task.request_id ? requestMap.get(task.request_id) : undefined
        // Find the most recent inbound message with an action required
        const msgs = task.request_id ? messageMap.get(task.request_id) ?? [] : []
        const triggerMessage = msgs
          .filter(
            (m) =>
              m.direction === "inbound" && m.response_action_required && m.response_action_required !== "none"
          )
          .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0]

        return { task, intent, request, triggerMessage }
      })

      // Sort by due date (soonest first), then by created date
      enriched.sort((a, b) => {
        if (a.task.due_at && b.task.due_at) {
          return new Date(a.task.due_at).getTime() - new Date(b.task.due_at).getTime()
        }
        if (a.task.due_at) return -1
        if (b.task.due_at) return 1
        return new Date(b.task.created_at).getTime() - new Date(a.task.created_at).getTime()
      })

      setFollowUps(enriched)
    } catch (err) {
      console.error("Failed to load follow-ups:", err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadFollowUps()
  }, [loadFollowUps])

  const filtered =
    activeFilter === "all" ? followUps : followUps.filter((fu) => fu.intent === activeFilter)

  // Count per category for badges
  const counts: Record<IntentCategory, number> = { all: followUps.length } as Record<IntentCategory, number>
  for (const tab of FILTER_TABS) {
    if (tab.id === "all") continue
    counts[tab.id] = followUps.filter((fu) => fu.intent === tab.id).length
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-purple-600" />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Follow Ups</h1>
          <p className="mt-1 text-sm text-gray-500">
            Inbound messages requiring action — review intent, draft a response, and approve before sending.
          </p>
        </div>
        <button
          onClick={() => setShowNewForm(!showNewForm)}
          className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
            showNewForm
              ? "border border-gray-200 bg-white text-gray-700 hover:bg-gray-50"
              : "bg-purple-600 text-white hover:bg-purple-700"
          }`}
        >
          {showNewForm ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
          {showNewForm ? "Cancel" : "New Follow Up"}
        </button>
      </div>

      {/* New follow-up form */}
      {showNewForm && (
        <NewFollowUpForm
          onCreated={async () => {
            setShowNewForm(false)
            await loadFollowUps()
          }}
          onCancel={() => setShowNewForm(false)}
        />
      )}

      {/* Filter tabs */}
      <div className="flex flex-wrap gap-2">
        {FILTER_TABS.map((tab) => {
          const count = counts[tab.id] ?? 0
          if (tab.id !== "all" && count === 0) return null
          const active = activeFilter === tab.id
          return (
            <button
              key={tab.id}
              onClick={() => setActiveFilter(tab.id)}
              className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-all ${
                active
                  ? "bg-purple-600 text-white shadow-sm"
                  : "border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 hover:text-gray-900"
              }`}
            >
              {tab.label}
              {count > 0 && (
                <span
                  className={`flex h-4 min-w-[16px] items-center justify-center rounded-full px-1 text-[10px] font-bold ${
                    active ? "bg-white/20 text-white" : "bg-gray-100 text-gray-500"
                  }`}
                >
                  {count}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* Intent guidance banner (when a specific filter is active) */}
      {activeFilter !== "all" && INTENT_META[activeFilter] && (
        <div
          className={`flex items-start gap-3 rounded-xl border p-4 ${INTENT_META[activeFilter].bgColor} ${INTENT_META[activeFilter].borderColor}`}
        >
          {(() => {
            const Icon = INTENT_META[activeFilter].icon
            return <Icon className={`mt-0.5 h-5 w-5 shrink-0 ${INTENT_META[activeFilter].color}`} />
          })()}
          <div>
            <p className={`text-sm font-medium ${INTENT_META[activeFilter].color}`}>
              {INTENT_META[activeFilter].label}
            </p>
            <p className="mt-0.5 text-xs text-gray-600">{INTENT_META[activeFilter].templateGuidance}</p>
          </div>
        </div>
      )}

      {/* Follow-up cards */}
      <div className="flex flex-col gap-3">
        {filtered.map((fu) => (
          <FollowUpCard
            key={fu.task.id}
            followUp={fu}
            expanded={expandedId === fu.task.id}
            onToggle={() => setExpandedId(expandedId === fu.task.id ? null : fu.task.id)}
            onRefresh={loadFollowUps}
          />
        ))}
        {filtered.length === 0 && (
          <div className="rounded-xl border border-gray-200 bg-white px-6 py-16 text-center">
            <MessageSquare className="mx-auto h-10 w-10 text-gray-300" />
            <p className="mt-3 text-sm font-medium text-gray-500">No follow-ups in this category</p>
            <p className="mt-1 text-xs text-gray-400">
              {activeFilter === "all"
                ? "All caught up! Follow-ups appear here when inbound messages need a response."
                : "Try a different filter or check back later."}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

// Keep the old export name for backward compatibility with the page route
export { FollowUpsContent as MessageReviewContent }

// ---------------------------------------------------------------------------
// Follow-up card
// ---------------------------------------------------------------------------

function FollowUpCard({
  followUp,
  expanded,
  onToggle,
  onRefresh,
}: {
  followUp: EnrichedFollowUp
  expanded: boolean
  onToggle: () => void
  onRefresh: () => Promise<void>
}) {
  const { task, intent, request, triggerMessage } = followUp
  const meta = INTENT_META[intent]
  const Icon = meta.icon

  const [draftLoading, setDraftLoading] = useState(false)
  const [draftText, setDraftText] = useState("")
  const [draftError, setDraftError] = useState("")
  const [completing, setCompleting] = useState(false)
  const [copied, setCopied] = useState(false)

  async function handleDraftResponse() {
    if (!request) return
    setDraftLoading(true)
    setDraftError("")
    try {
      // Build additional context from the trigger message
      const context = buildDraftContext(intent, triggerMessage, task)
      const result = await aiDraftFoiaRequest(request.id, "draft_followup", context)
      setDraftText(result.draft)
    } catch (err) {
      setDraftError(err instanceof Error ? err.message : "Failed to generate draft")
    } finally {
      setDraftLoading(false)
    }
  }

  async function handleComplete() {
    setCompleting(true)
    try {
      const { completeFoiaTask } = await import("@/app/actions/foia")
      await completeFoiaTask(task.id)
      await onRefresh()
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to complete task")
    } finally {
      setCompleting(false)
    }
  }

  async function handleCopyDraft() {
    if (!draftText) return
    try {
      await navigator.clipboard.writeText(draftText)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      alert("Failed to copy to clipboard")
    }
  }

  return (
    <div className={`rounded-xl border bg-white transition-shadow ${expanded ? "shadow-md" : "hover:shadow-sm"}`}>
      {/* Collapsed header */}
      <button
        onClick={onToggle}
        className="flex w-full items-center gap-4 px-5 py-4 text-left"
      >
        {/* Intent icon */}
        <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${meta.bgColor}`}>
          <Icon className={`h-4 w-4 ${meta.color}`} />
        </div>

        {/* Main info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium text-gray-900 truncate">{task.title}</p>
            <span
              className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${meta.bgColor} ${meta.color}`}
            >
              {meta.shortLabel}
            </span>
          </div>
          <div className="mt-0.5 flex items-center gap-3 text-xs text-gray-500">
            {request && (
              <span className="truncate">
                {request.city?.name ?? `City #${request.city_id}`} &middot; {request.dataset_type_id}
              </span>
            )}
            {task.due_at && (
              <span
                className={
                  new Date(task.due_at) < new Date() ? "text-red-500 font-medium" : ""
                }
              >
                Due {formatDistanceToNow(new Date(task.due_at), { addSuffix: true })}
              </span>
            )}
            <span>Created {formatDistanceToNow(new Date(task.created_at), { addSuffix: true })}</span>
          </div>
        </div>

        {/* Status + expand */}
        <div className="flex items-center gap-3 shrink-0">
          <TaskStatusBadge status={task.status} />
          {expanded ? (
            <ChevronUp className="h-4 w-4 text-gray-400" />
          ) : (
            <ChevronDown className="h-4 w-4 text-gray-400" />
          )}
        </div>
      </button>

      {/* Expanded content */}
      {expanded && (
        <div className="border-t border-gray-100 px-5 pb-5">
          {/* Intent guidance */}
          <div className={`mt-4 rounded-lg border p-3 ${meta.bgColor} ${meta.borderColor}`}>
            <p className={`text-xs font-semibold ${meta.color}`}>
              {meta.label}: {meta.description}
            </p>
            <p className="mt-1 text-xs text-gray-600">{meta.templateGuidance}</p>
          </div>

          {/* Trigger message (the inbound message that caused this follow-up) */}
          {triggerMessage && (
            <div className="mt-4">
              <p className="text-xs font-semibold text-gray-900 mb-2">Inbound Message</p>
              <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
                <div className="flex flex-wrap items-center gap-2 mb-2">
                  {triggerMessage.classification && (
                    <span className="rounded-full border border-gray-200 bg-white px-2 py-0.5 text-[10px] font-medium text-gray-600">
                      {triggerMessage.classification.replace(/_/g, " ")}
                    </span>
                  )}
                  {triggerMessage.channel && (
                    <span className="text-[10px] text-gray-400">
                      via {triggerMessage.channel.replace("_", " ")}
                    </span>
                  )}
                  <span className="text-[10px] text-gray-400">
                    {triggerMessage.sent_at
                      ? format(new Date(triggerMessage.sent_at), "MMM d, yyyy")
                      : format(new Date(triggerMessage.created_at), "MMM d, yyyy")}
                  </span>
                </div>

                {/* Contact */}
                {(triggerMessage.sender_name || triggerMessage.sender_email) && (
                  <p className="text-xs text-gray-600 mb-1.5">
                    <span className="font-medium">{triggerMessage.sender_name}</span>
                    {triggerMessage.sender_title && (
                      <span className="text-gray-400"> &middot; {triggerMessage.sender_title}</span>
                    )}
                    {triggerMessage.sender_email && (
                      <span className="text-gray-400"> &middot; {triggerMessage.sender_email}</span>
                    )}
                  </p>
                )}

                {triggerMessage.subject && (
                  <p className="text-sm font-medium text-gray-900 mb-1">{triggerMessage.subject}</p>
                )}

                {/* Key quote */}
                {triggerMessage.email_snippet && (
                  <div className="rounded-md border-l-4 border-purple-300 bg-purple-50/50 px-3 py-2 my-2">
                    <p className="text-xs italic leading-relaxed text-gray-700">
                      &ldquo;{triggerMessage.email_snippet}&rdquo;
                    </p>
                  </div>
                )}

                {triggerMessage.body && (
                  <p className="text-xs leading-relaxed text-gray-600 line-clamp-4">
                    {triggerMessage.body}
                  </p>
                )}

                {triggerMessage.notes && (
                  <div className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-2 py-1.5">
                    <p className="text-[10px] font-medium text-amber-700">Notes:</p>
                    <p className="text-xs text-amber-900">{triggerMessage.notes}</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Task description if no trigger message */}
          {!triggerMessage && task.description && (
            <div className="mt-4">
              <p className="text-xs font-semibold text-gray-900 mb-2">Context</p>
              <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
                <p className="text-xs leading-relaxed text-gray-600 whitespace-pre-line">
                  {task.description}
                </p>
              </div>
            </div>
          )}

          {/* Request reference */}
          {request && (
            <div className="mt-4 flex items-center gap-4 text-xs text-gray-500">
              <Link
                href={`/foia/requests/${request.id}`}
                className="text-purple-600 hover:underline font-medium"
              >
                View Request #{request.id}
              </Link>
              <RequestStatusBadge status={request.status} />
              {request.agency_request_number && (
                <span>Ref: {request.agency_request_number}</span>
              )}
            </div>
          )}

          {/* Draft response section */}
          <div className="mt-5 border-t border-gray-100 pt-5">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-semibold text-gray-900">Draft Response</p>
              <div className="flex items-center gap-2">
                {request && (
                  <button
                    onClick={handleDraftResponse}
                    disabled={draftLoading}
                    className="flex items-center gap-1.5 rounded-lg bg-purple-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-purple-700 disabled:opacity-50"
                  >
                    {draftLoading ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Sparkles className="h-3.5 w-3.5" />
                    )}
                    {draftText ? "Regenerate" : "AI Draft"}
                  </button>
                )}
              </div>
            </div>

            {draftError && (
              <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2">
                <p className="text-xs text-red-700">{draftError}</p>
              </div>
            )}

            {draftText ? (
              <div className="flex flex-col gap-3">
                <textarea
                  value={draftText}
                  onChange={(e) => setDraftText(e.target.value)}
                  rows={10}
                  className="w-full rounded-lg border border-gray-200 px-4 py-3 text-sm leading-relaxed text-gray-700 focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
                />
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleCopyDraft}
                      className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
                    >
                      {copied ? (
                        <Check className="h-3.5 w-3.5 text-emerald-600" />
                      ) : (
                        <Copy className="h-3.5 w-3.5" />
                      )}
                      {copied ? "Copied!" : "Copy"}
                    </button>
                    <button
                      onClick={() => setDraftText("")}
                      className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-400 hover:bg-gray-50 hover:text-gray-600"
                    >
                      <X className="h-3.5 w-3.5" />
                      Discard
                    </button>
                  </div>
                  <button
                    onClick={handleComplete}
                    disabled={completing}
                    className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-medium text-white transition-colors hover:bg-emerald-700 disabled:opacity-50"
                  >
                    {completing ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <CheckCircle2 className="h-3.5 w-3.5" />
                    )}
                    Approve & Complete
                  </button>
                </div>
              </div>
            ) : (
              <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50/50 px-6 py-8 text-center">
                <Sparkles className="mx-auto h-6 w-6 text-gray-300" />
                <p className="mt-2 text-xs text-gray-400">
                  Click &quot;AI Draft&quot; to generate a response based on the inbound message and request context,
                  or type your own response below.
                </p>
                <textarea
                  placeholder="Or write your response manually..."
                  value={draftText}
                  onChange={(e) => setDraftText(e.target.value)}
                  rows={3}
                  className="mt-3 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
                />
              </div>
            )}
          </div>

          {/* Quick actions footer */}
          <div className="mt-4 flex items-center justify-between border-t border-gray-100 pt-4">
            <div className="flex items-center gap-2">
              {task.assigned_to && (
                <span className="text-xs text-gray-400">Assigned to {task.assigned_to}</span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {!draftText && (
                <button
                  onClick={handleComplete}
                  disabled={completing}
                  className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50"
                >
                  {completing ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <CheckCircle2 className="h-3.5 w-3.5" />
                  )}
                  Mark Complete
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// New Follow-Up Form
// ---------------------------------------------------------------------------

const CLASSIFICATION_OPTIONS = [
  { value: "follow_up", label: "Follow Up" },
  { value: "narrow_request", label: "Asked to Narrow Request" },
  { value: "pickup_instructions", label: "Pickup Instructions (visit city hall, etc.)" },
  { value: "fee_notice", label: "Fee Notice" },
  { value: "fee_estimate", label: "Fee Estimate (copying/mailing charges)" },
  { value: "no_records", label: "No Records / No Data" },
  { value: "partial_no_records", label: "Partial No Records (some depts still searching)" },
  { value: "denial", label: "Denial" },
  { value: "exemption", label: "Exemption Claimed" },
  { value: "extension", label: "Extension (needs more time)" },
  { value: "clarification", label: "Clarification" },
  { value: "acknowledgment", label: "Acknowledgment" },
  { value: "status_update", label: "Status Update" },
  { value: "data_delivery", label: "Data Delivery" },
  { value: "reroute", label: "Reroute to Another Dept" },
]

const ACTION_OPTIONS = [
  { value: "none", label: "No action needed" },
  { value: "narrow_request", label: "Revise request (narrow scope)" },
  { value: "generate_response", label: "Draft a response email" },
  { value: "pickup_data", label: "Go pick up data" },
  { value: "status_update", label: "Note status update" },
  { value: "no_records", label: "Handle 'no records' response" },
  { value: "partial_no_records", label: "Follow up with remaining depts" },
  { value: "pay_fee", label: "Pay copying/mailing fee" },
  { value: "appeal", label: "Appeal denial or exemption" },
]

const classificationToAction: Record<string, string> = {
  narrow_request: "narrow_request",
  pickup_instructions: "pickup_data",
  no_records: "no_records",
  partial_no_records: "partial_no_records",
  status_update: "status_update",
  data_delivery: "none",
  acknowledgment: "none",
  clarification: "narrow_request",
  fee_notice: "pay_fee",
  fee_estimate: "pay_fee",
  denial: "appeal",
  exemption: "appeal",
  extension: "status_update",
  reroute: "status_update",
  follow_up: "generate_response",
}

const actionToTaskType: Record<string, string> = {
  narrow_request: "narrow_request",
  pickup_data: "pickup_data",
  generate_response: "send_response",
  status_update: "general_followup",
  no_records: "general_followup",
  partial_no_records: "follow_up_partial",
  pay_fee: "pay_fee",
  appeal: "appeal_denial",
  none: "general_followup",
}

const actionToTaskTitle: Record<string, string> = {
  narrow_request: "Revise & narrow the original request",
  pickup_data: "Pick up data (see instructions)",
  generate_response: "Draft and send response email",
  status_update: "Review status update",
  no_records: "Review 'no records' response & determine next steps",
  partial_no_records: "Follow up with remaining departments still searching",
  pay_fee: "Pay copying/mailing fee to receive records",
  appeal: "Appeal denial or exemption claim",
  none: "Follow up on interaction",
}

function NewFollowUpForm({
  onCreated,
  onCancel,
}: {
  onCreated: () => Promise<void>
  onCancel: () => void
}) {
  const [requests, setRequests] = useState<FoiaRequest[]>([])
  const [loadingRequests, setLoadingRequests] = useState(true)
  const [saving, setSaving] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedRequestId, setSelectedRequestId] = useState<number | null>(null)
  const [showRequestDropdown, setShowRequestDropdown] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  const [form, setForm] = useState({
    classification: "follow_up" as string,
    channel: "email" as string,
    response_action_required: "generate_response" as string,
    subject: "",
    email_snippet: "",
    body: "",
    sender_name: "",
    sender_email: "",
    sender_phone: "",
    sender_title: "",
    notes: "",
  })

  // Load open requests
  useEffect(() => {
    async function loadRequests() {
      try {
        // Fetch requests that are active / in-progress
        const result = await listFoiaRequests({ page_size: 200 })
        const open = result.items.filter(
          (r) => !["fulfilled", "denied", "closed_incomplete"].includes(r.status)
        )
        setRequests(open)
      } catch (err) {
        console.error("Failed to load requests:", err)
      } finally {
        setLoadingRequests(false)
      }
    }
    loadRequests()
  }, [])

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowRequestDropdown(false)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

  const selectedRequest = requests.find((r) => r.id === selectedRequestId)

  const filteredRequests = searchQuery.trim()
    ? requests.filter((r) => {
        const q = searchQuery.toLowerCase()
        return (
          r.title?.toLowerCase().includes(q) ||
          r.dataset_type_id.toLowerCase().includes(q) ||
          r.city?.name?.toLowerCase().includes(q) ||
          String(r.id).includes(q) ||
          r.agency_request_number?.toLowerCase().includes(q)
        )
      })
    : requests

  function handleClassificationChange(cls: string) {
    const suggestedAction = classificationToAction[cls] || "none"
    setForm((f) => ({ ...f, classification: cls, response_action_required: suggestedAction }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!selectedRequestId) {
      alert("Please select a request")
      return
    }
    if (!form.email_snippet && !form.body && !form.notes) {
      alert("Please provide at least a key quote, full message body, or notes describing the follow-up")
      return
    }

    setSaving(true)
    try {
      // 1. Log the inbound message
      const { createFoiaMessage } = await import("@/app/actions/foia")
      await createFoiaMessage(selectedRequestId, {
        direction: "inbound",
        classification: form.classification || undefined,
        subject: form.subject || undefined,
        body: form.body || undefined,
        sender_name: form.sender_name || undefined,
        sender_email: form.sender_email || undefined,
        sender_phone: form.sender_phone || undefined,
        sender_title: form.sender_title || undefined,
        notes: form.notes || undefined,
        email_snippet: form.email_snippet || undefined,
        channel: form.channel || undefined,
        response_action_required:
          form.response_action_required !== "none" ? form.response_action_required : undefined,
      })

      // 2. Create the follow-up task
      if (form.response_action_required && form.response_action_required !== "none") {
        const action = form.response_action_required
        const taskType = actionToTaskType[action] || "general_followup"
        const taskTitle = actionToTaskTitle[action] || "Follow up on interaction"

        const description = [
          form.subject ? `Subject: ${form.subject}` : "",
          form.sender_name ? `Contact: ${form.sender_name}` : "",
          form.sender_email ? `Email: ${form.sender_email}` : "",
          form.email_snippet ? `Key quote: "${form.email_snippet}"` : "",
          form.notes ? `Notes: ${form.notes}` : "",
        ]
          .filter(Boolean)
          .join("\n")

        const { createFoiaTask } = await import("@/app/actions/foia")
        await createFoiaTask({
          request_id: selectedRequestId,
          type: taskType,
          title: taskTitle,
          description,
        })
      }

      await onCreated()
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to create follow-up")
    } finally {
      setSaving(false)
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-xl border border-purple-200 bg-white shadow-sm"
    >
      <div className="border-b border-purple-100 bg-purple-50/50 px-6 py-4 rounded-t-xl">
        <h2 className="text-sm font-semibold text-gray-900">Log a Follow-Up</h2>
        <p className="mt-0.5 text-xs text-gray-500">
          Record an inbound message you received, classify its intent, and create a follow-up task.
        </p>
      </div>

      <div className="px-6 py-5 flex flex-col gap-5">
        {/* Step 1: Select request */}
        <div>
          <label className="mb-1.5 block text-xs font-semibold text-gray-900">
            1. Which request is this about?
          </label>
          <div className="relative" ref={dropdownRef}>
            {selectedRequest ? (
              <div className="flex items-center justify-between rounded-lg border border-purple-200 bg-purple-50/50 px-3 py-2.5">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">
                    #{selectedRequest.id} &middot;{" "}
                    {selectedRequest.title?.trim() ||
                      `${selectedRequest.city?.name ?? `City #${selectedRequest.city_id}`} - ${selectedRequest.dataset_type_id}`}
                  </p>
                  <p className="text-xs text-gray-500">
                    {selectedRequest.city?.name} &middot; {selectedRequest.dataset_type_id} &middot;{" "}
                    <RequestStatusBadge status={selectedRequest.status} />
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedRequestId(null)
                    setSearchQuery("")
                  }}
                  className="ml-2 rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <div>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => {
                      setSearchQuery(e.target.value)
                      setShowRequestDropdown(true)
                    }}
                    onFocus={() => setShowRequestDropdown(true)}
                    placeholder={loadingRequests ? "Loading requests..." : "Search by city, dataset, request #, or title..."}
                    disabled={loadingRequests}
                    className="w-full rounded-lg border border-gray-200 pl-9 pr-3 py-2.5 text-sm focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500 disabled:bg-gray-50 disabled:text-gray-400"
                  />
                  {loadingRequests && (
                    <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-gray-400" />
                  )}
                </div>

                {showRequestDropdown && !loadingRequests && (
                  <div className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-lg border border-gray-200 bg-white py-1 shadow-lg">
                    {filteredRequests.length === 0 ? (
                      <p className="px-4 py-3 text-xs text-gray-400">
                        {searchQuery ? "No matching requests" : "No open requests"}
                      </p>
                    ) : (
                      filteredRequests.slice(0, 20).map((r) => (
                        <button
                          key={r.id}
                          type="button"
                          onClick={() => {
                            setSelectedRequestId(r.id)
                            setShowRequestDropdown(false)
                            setSearchQuery("")
                          }}
                          className="flex w-full flex-col px-4 py-2.5 text-left hover:bg-gray-50"
                        >
                          <span className="text-sm font-medium text-gray-900 truncate">
                            #{r.id} &middot;{" "}
                            {r.title?.trim() ||
                              `${r.city?.name ?? `City #${r.city_id}`} - ${r.dataset_type_id}`}
                          </span>
                          <span className="mt-0.5 text-xs text-gray-500">
                            {r.city?.name} &middot; {r.dataset_type_id} &middot; {r.status.replace(/_/g, " ")}
                            {r.agency_request_number ? ` · Ref: ${r.agency_request_number}` : ""}
                          </span>
                        </button>
                      ))
                    )}
                    {filteredRequests.length > 20 && (
                      <p className="px-4 py-2 text-xs text-gray-400">
                        + {filteredRequests.length - 20} more — refine your search
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Step 2: Classify the message */}
        <div>
          <label className="mb-1.5 block text-xs font-semibold text-gray-900">
            2. What did they say?
          </label>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-700">Type of Response</label>
              <select
                value={form.classification}
                onChange={(e) => handleClassificationChange(e.target.value)}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
              >
                {CLASSIFICATION_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-700">Channel</label>
              <select
                value={form.channel}
                onChange={(e) => setForm((f) => ({ ...f, channel: e.target.value }))}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
              >
                <option value="email">Email</option>
                <option value="phone">Phone</option>
                <option value="portal">Portal</option>
                <option value="in_person">In Person</option>
                <option value="mail">Physical Mail</option>
              </select>
            </div>
          </div>
        </div>

        {/* Contact info (collapsible) */}
        <div className="rounded-lg border border-gray-200 p-4">
          <p className="text-xs font-semibold text-gray-900">Contact Person</p>
          <p className="mt-0.5 text-xs text-gray-500">Who sent this or who did you speak with?</p>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-700">Name</label>
              <input
                type="text"
                value={form.sender_name}
                onChange={(e) => setForm((f) => ({ ...f, sender_name: e.target.value }))}
                placeholder="Jane Smith"
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-700">Title / Position</label>
              <input
                type="text"
                value={form.sender_title}
                onChange={(e) => setForm((f) => ({ ...f, sender_title: e.target.value }))}
                placeholder="Records Custodian"
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-700">Email</label>
              <input
                type="email"
                value={form.sender_email}
                onChange={(e) => setForm((f) => ({ ...f, sender_email: e.target.value }))}
                placeholder="jsmith@sfgov.org"
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-700">Phone</label>
              <input
                type="tel"
                value={form.sender_phone}
                onChange={(e) => setForm((f) => ({ ...f, sender_phone: e.target.value }))}
                placeholder="(415) 555-0123"
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
              />
            </div>
          </div>
        </div>

        {/* Message content */}
        <div>
          <label className="mb-1.5 block text-xs font-semibold text-gray-900">
            3. Capture the message
          </label>
          <div className="flex flex-col gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-700">Subject</label>
              <input
                type="text"
                value={form.subject}
                onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value }))}
                placeholder="RE: Public Records Request PRR-12345"
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-700">
                Key Quote / Snippet *
              </label>
              <textarea
                value={form.email_snippet}
                onChange={(e) => setForm((f) => ({ ...f, email_snippet: e.target.value }))}
                rows={3}
                placeholder='Paste the relevant part of their message, e.g. "Your request is too broad. Please narrow to a specific date range..."'
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm leading-relaxed focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-700">
                Full Message Body (optional)
              </label>
              <textarea
                value={form.body}
                onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))}
                rows={4}
                placeholder="Paste the full email text if you have it..."
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm leading-relaxed focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-700">Your Notes</label>
              <textarea
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                rows={2}
                placeholder="My observations, next steps I'm thinking about..."
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm leading-relaxed focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
              />
            </div>
          </div>
        </div>

        {/* Step 3: Action required */}
        <div>
          <label className="mb-1.5 block text-xs font-semibold text-gray-900">
            4. What action is needed?
          </label>
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
            <p className="mb-2 text-xs text-amber-700">
              Auto-suggested based on the response type above. This determines the follow-up task that will be created.
            </p>
            <select
              value={form.response_action_required}
              onChange={(e) => setForm((f) => ({ ...f, response_action_required: e.target.value }))}
              className="w-full rounded-lg border border-amber-200 bg-white px-3 py-2 text-sm focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
            >
              {ACTION_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            {form.response_action_required !== "none" && (
              <p className="mt-2 text-xs text-amber-800">
                <span className="font-medium">Task to be created: </span>
                {actionToTaskTitle[form.response_action_required] || "Follow up on interaction"}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between border-t border-gray-200 px-6 py-4 bg-gray-50/50 rounded-b-xl">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={saving || !selectedRequestId}
          className="flex items-center gap-2 rounded-lg bg-purple-600 px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-purple-700 disabled:opacity-50"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          Log & Create Follow-Up
        </button>
      </div>
    </form>
  )
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildDraftContext(
  intent: Exclude<IntentCategory, "all">,
  triggerMessage?: FoiaMessage,
  task?: FoiaTask
): string {
  const parts: string[] = []

  parts.push(`Follow-up intent: ${INTENT_META[intent].label}`)
  parts.push(`Guidance: ${INTENT_META[intent].templateGuidance}`)

  if (triggerMessage) {
    if (triggerMessage.classification) {
      parts.push(`Their message was classified as: ${triggerMessage.classification.replace(/_/g, " ")}`)
    }
    if (triggerMessage.email_snippet) {
      parts.push(`Key quote from their message: "${triggerMessage.email_snippet}"`)
    }
    if (triggerMessage.body) {
      parts.push(`Full message body: ${triggerMessage.body.slice(0, 1000)}`)
    }
    if (triggerMessage.sender_name) {
      parts.push(`Contact person: ${triggerMessage.sender_name}`)
    }
    if (triggerMessage.notes) {
      parts.push(`Our notes: ${triggerMessage.notes}`)
    }
  }

  if (task?.description) {
    parts.push(`Task context: ${task.description}`)
  }

  return parts.join("\n\n")
}

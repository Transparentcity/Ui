"use client"

import React, { useEffect, useState, useCallback } from "react"
import Link from "next/link"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import {
  ArrowLeft,
  Send,
  RefreshCw,
  MessageSquare,
  Paperclip,
  Clock,
  CheckCircle2,
  AlertTriangle,
  FileText,
  Loader2,
  Plus,
  X,
  ChevronDown,
  Upload,
  Pencil,
  Copy,
} from "lucide-react"
import { useAuth0 } from "@auth0/auth0-react"
import { toast } from "sonner"
import {
  getFoiaRequest,
  listFoiaMessages,
  listFoiaAttachments,
  listFoiaRequestEvents,
  listFoiaTasks,
  listFoiaSubmissionAttempts,
  markFoiaExternallyFiled,
  updateFoiaRequest,
  aiDraftFoiaRequest,
  submitFoiaRequest as submitFoiaRequestClient,
  changeFoiaRequestStatus,
  createFoiaMessage,
  completeFoiaTask,
  createFoiaTask,
  uploadFoiaFile,
} from "@/lib/foiaApiClient"
import { API_BASE } from "@/lib/apiBase"
import {
  FOLLOW_UP_ACTION_OPTIONS,
  FOLLOW_UP_CLASSIFICATION_TO_ACTION,
  FOLLOW_UP_QUICK_INSERTS,
  buildNoResponseTaskPayload,
  getFollowUpTaskSpec,
  isNarrowingSignal,
} from "@/lib/foia/followUpWorkflow"
import { RequestStatusBadge, TaskStatusBadge } from "@/components/foia/status-badge"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import { datasetLabel } from "@/lib/foia/datasetLabels"
import { formatDistanceToNow, format } from "date-fns"
import type {
  FoiaRequest,
  FoiaMessage,
  FoiaRequestEvent,
  FoiaTask,
  FoiaAttachment,
  FoiaSubmissionAttempt,
  RequestStatus,
  MessageClassification,
  CommunicationChannel,
  ResponseAction,
  TaskType,
} from "@/lib/foia/types"

const tabs = [
  { id: "overview", label: "Overview", icon: FileText },
  { id: "messages", label: "Messages", icon: MessageSquare },
  { id: "attachments", label: "Attachments", icon: Paperclip },
  { id: "events", label: "Timeline", icon: Clock },
] as const

type TabId = (typeof tabs)[number]["id"]

// Status transitions allowed from each status
const STATUS_ACTIONS: Partial<Record<RequestStatus, { label: string; to: RequestStatus; variant: string }[]>> = {
  submitted: [
    { label: "Mark Acknowledged", to: "acknowledged", variant: "primary" },
    { label: "Mark Denied", to: "denied", variant: "destructive" },
  ],
  submitted_unacknowledged: [
    { label: "Mark Acknowledged", to: "acknowledged", variant: "primary" },
    { label: "Mark Denied", to: "denied", variant: "destructive" },
  ],
  acknowledged: [
    { label: "Partially Fulfilled", to: "partially_fulfilled", variant: "primary" },
    { label: "Clarification Requested", to: "clarification_requested", variant: "secondary" },
    { label: "Fee Requested", to: "fee_requested", variant: "secondary" },
    { label: "Extension Claimed", to: "extension_claimed", variant: "secondary" },
    { label: "Fulfilled", to: "fulfilled", variant: "success" },
    { label: "Denied", to: "denied", variant: "destructive" },
  ],
  clarification_requested: [
    { label: "Re-Acknowledged", to: "acknowledged", variant: "primary" },
    { label: "Partially Fulfilled", to: "partially_fulfilled", variant: "primary" },
  ],
  partially_fulfilled: [
    { label: "Mark Fulfilled", to: "fulfilled", variant: "success" },
    { label: "Clarification Requested", to: "clarification_requested", variant: "secondary" },
  ],
  fee_requested: [
    { label: "Mark Acknowledged", to: "acknowledged", variant: "primary" },
  ],
  extension_claimed: [
    { label: "Mark Acknowledged", to: "acknowledged", variant: "primary" },
    { label: "Partially Fulfilled", to: "partially_fulfilled", variant: "primary" },
    { label: "Fulfilled", to: "fulfilled", variant: "success" },
  ],
}

export function RequestDetailContent({ requestId }: { requestId: string }) {
  const getTodayDateInput = () => {
    const d = new Date()
    const yyyy = d.getFullYear()
    const mm = String(d.getMonth() + 1).padStart(2, "0")
    const dd = String(d.getDate()).padStart(2, "0")
    return `${yyyy}-${mm}-${dd}`
  }

  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const autoOpenExternal = searchParams.get("external") === "1"
  const autoOpenEdit = searchParams.get("edit") === "1"
  const { getAccessTokenSilently, isAuthenticated } = useAuth0()
  const [activeTab, setActiveTab] = useState<TabId>("overview")
  const [request, setRequest] = useState<FoiaRequest | null>(null)
  const [messages, setMessages] = useState<FoiaMessage[]>([])
  const [attachments, setAttachments] = useState<FoiaAttachment[]>([])
  const [events, setEvents] = useState<FoiaRequestEvent[]>([])
  const [tasks, setTasks] = useState<FoiaTask[]>([])
  const [submissionAttempts, setSubmissionAttempts] = useState<FoiaSubmissionAttempt[]>([])
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState(false)
  const [showStatusMenu, setShowStatusMenu] = useState(false)
  const [showEditModal, setShowEditModal] = useState(false)
  const [showSubmitModal, setShowSubmitModal] = useState(false)
  const [submittedDate, setSubmittedDate] = useState(getTodayDateInput())
  const [statusTransition, setStatusTransition] = useState<{ toStatus: RequestStatus; label: string } | null>(null)
  const [transitionNotes, setTransitionNotes] = useState("")

  const loadData = useCallback(async () => {
    try {
      const id = parseInt(requestId, 10)
      const [req, msgs, atts, evts, tsks, attempts] = await Promise.all([
        getFoiaRequest(id),
        listFoiaMessages(id),
        listFoiaAttachments(id),
        listFoiaRequestEvents(id),
        listFoiaTasks({ status: undefined }),
        listFoiaSubmissionAttempts(id),
      ])
      setRequest(req)
      setMessages(msgs)
      setAttachments(atts)
      setEvents(evts)
      setTasks(tsks.filter((t) => t.request_id === id))
      setSubmissionAttempts(attempts)
    } catch (err) {
      console.error("Failed to load request detail:", err)
    } finally {
      setLoading(false)
    }
  }, [requestId])

  useEffect(() => {
    loadData()
  }, [loadData])

  useEffect(() => {
    if (autoOpenEdit && request) {
      setShowEditModal(true)
      const nextParams = new URLSearchParams(searchParams.toString())
      nextParams.delete("edit")
      const nextQuery = nextParams.toString()
      router.replace(nextQuery ? `${pathname}?${nextQuery}` : pathname)
    }
  }, [autoOpenEdit, pathname, request, router, searchParams])

  useEffect(() => {
    if (autoOpenExternal && request) {
      const nextParams = new URLSearchParams(searchParams.toString())
      nextParams.delete("external")
      const nextQuery = nextParams.toString()
      router.replace(nextQuery ? `${pathname}?${nextQuery}` : pathname)
    }
  }, [autoOpenExternal, pathname, request, router, searchParams])

  function closeEditModal() {
    setShowEditModal(false)
    if (!autoOpenEdit) return
    const nextParams = new URLSearchParams(searchParams.toString())
    nextParams.delete("edit")
    const nextQuery = nextParams.toString()
    router.replace(nextQuery ? `${pathname}?${nextQuery}` : pathname)
  }

  async function handleStatusChangeConfirm() {
    if (!statusTransition) return
    setActionLoading(true)
    try {
      await changeFoiaRequestStatus(parseInt(requestId, 10), statusTransition.toStatus, "admin", transitionNotes.trim() || undefined)
      toast.success(`Status changed to ${statusTransition.label}`)
      setStatusTransition(null)
      setTransitionNotes("")
      await loadData()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Status change failed")
    } finally {
      setActionLoading(false)
    }
  }

  // AI Draft + Submit buttons removed from this page (drafting/submission is done
  // via the "Generate portal steps" flow + external filing confirmation).

  async function handleRewrite() {
    setActionLoading(true)
    try {
      const { rewriteFoiaRequest } = await import("@/lib/foiaApiClient")
      const result = (await rewriteFoiaRequest(parseInt(requestId, 10), {})) as { id?: number }
      if (result?.id) {
        router.push(`/foia/requests/${result.id}`)
      } else {
        await loadData()
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Rewrite failed")
    } finally {
      setActionLoading(false)
    }
  }

  async function handleSaveEdits(data: {
    title?: string
    request_description?: string
  }) {
    if (!request) return
    setActionLoading(true)
    try {
      await updateFoiaRequest(request.id, data)
      closeEditModal()
      await loadData()
    } catch (err) {
      console.error("handleSaveEdits failed:", err)
      toast.error(err instanceof Error ? err.message : "Update failed")
    } finally {
      setActionLoading(false)
    }
  }

  async function handleMarkSubmitted() {
    const d = new Date()
    const yyyy = d.getFullYear()
    const mm = String(d.getMonth() + 1).padStart(2, "0")
    const dd = String(d.getDate()).padStart(2, "0")
    setSubmittedDate(`${yyyy}-${mm}-${dd}`)
    setShowSubmitModal(true)
  }

  async function handleConfirmMarkSubmitted() {
    if (!request) return
    setActionLoading(true)
    try {
      await submitFoiaRequestClient(request.id, { submitted_date: submittedDate })
      await loadData()
      setShowSubmitModal(false)
      router.push(`/foia/requests/${request.id}?external=1`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to mark submitted")
    } finally {
      setActionLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-purple-600" />
      </div>
    )
  }

  if (!request) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <p className="text-lg text-gray-500">Request not found</p>
        <Link href="/foia/requests" className="mt-4 text-sm text-purple-600 hover:underline">
          Back to requests
        </Link>
      </div>
    )
  }

  const statusActions = STATUS_ACTIONS[request.status as RequestStatus] ?? []

  return (
    <div className="flex flex-col gap-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-3">
        <Link
          href="/foia/requests"
          className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900"
        >
          <ArrowLeft className="h-4 w-4" />
          Requests
        </Link>
        <span className="text-gray-300">/</span>
        <span className="text-sm text-gray-900">#{request.id}</span>
      </div>

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold text-gray-900">
              {request.title?.trim()
                ? request.title
                : `${request.city?.name ?? "Unknown city"} - ${datasetLabel(request.dataset_type_id)}`}
            </h1>
            <RequestStatusBadge status={request.status} />
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-4 text-sm text-gray-500">
            <Link href={`/foia/cities/${request.city_id}`} className="text-blue-600 hover:underline">{request.city?.name ?? "Unknown city"}</Link>
            <span>{datasetLabel(request.dataset_type_id)}</span>
            {request.department?.name && <span>Dept: {request.department.name}</span>}
            {request.agency_request_number && <span>Ref: {request.agency_request_number}</span>}
            <span>Version {request.request_version}</span>
            {request.coverage_start && request.coverage_end && (
              <span>Coverage: {request.coverage_start} to {request.coverage_end}</span>
            )}
            <span>Format: {request.format_requested}</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {request.status === "draft" && (
            <button
              onClick={handleMarkSubmitted}
              disabled={actionLoading}
              className="flex items-center gap-2 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-700 disabled:opacity-50"
              title="Mark request as submitted"
            >
              {actionLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              Mark Submitted
            </button>
          )}
          <button
            onClick={() => setShowEditModal(true)}
            disabled={actionLoading}
            className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50"
            title={request.status === "draft" ? "Edit request" : "Edit submission email/URL + confirmation number"}
          >
            <Pencil className="h-4 w-4" />
            Edit
          </button>
          {/* Status transition dropdown */}
          {statusActions.length > 0 && (
            <div className="relative">
              <button
                onClick={() => setShowStatusMenu(!showStatusMenu)}
                disabled={actionLoading}
                aria-expanded={showStatusMenu}
                aria-haspopup="menu"
                className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50"
              >
                Update Status
                <ChevronDown className="h-4 w-4" />
              </button>
              {showStatusMenu && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setShowStatusMenu(false)} />
                  <div role="menu" className="absolute right-0 top-full z-20 mt-1 min-w-[200px] rounded-lg border border-gray-200 bg-white py-1 shadow-lg">
                    {statusActions.map((action) => (
                      <button
                        key={action.to}
                        role="menuitem"
                        onClick={() => {
                          setShowStatusMenu(false)
                          setStatusTransition({ toStatus: action.to, label: action.label })
                          setTransitionNotes("")
                        }}
                        className={`flex w-full items-center px-4 py-2 text-left text-sm hover:bg-gray-50 ${
                          action.variant === "destructive"
                            ? "text-red-600"
                            : action.variant === "success"
                            ? "text-emerald-600"
                            : "text-gray-700"
                        }`}
                      >
                        {action.label}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}
          {request.status === "clarification_requested" && (
            <button
              onClick={handleRewrite}
              disabled={actionLoading}
              className="flex items-center gap-2 rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-purple-700 disabled:opacity-50"
            >
              {actionLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              Rewrite
            </button>
          )}
        </div>
      </div>

      <EditRequestModal
        key={`${request.id}-${showEditModal ? "open" : "closed"}-${request.updated_at || ""}`}
        open={showEditModal}
        onClose={closeEditModal}
        request={request}
        onSave={handleSaveEdits}
        saving={actionLoading}
      />
      <SubmitRequestModal
        open={showSubmitModal}
        onClose={() => setShowSubmitModal(false)}
        submittedDate={submittedDate}
        setSubmittedDate={setSubmittedDate}
        onConfirm={handleConfirmMarkSubmitted}
        saving={actionLoading}
      />

      <Dialog open={statusTransition !== null} onOpenChange={(open) => { if (!open) { setStatusTransition(null); setTransitionNotes("") } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{statusTransition?.label ?? "Update Status"}</DialogTitle>
            <DialogDescription>Add optional notes for this status transition.</DialogDescription>
          </DialogHeader>
          <div className="py-2">
            <label className="mb-1 block text-xs font-medium text-gray-700">Notes (optional)</label>
            <textarea
              value={transitionNotes}
              onChange={(e) => setTransitionNotes(e.target.value)}
              rows={3}
              placeholder="Add any notes about this status change..."
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
              autoFocus
            />
          </div>
          <DialogFooter>
            <button
              type="button"
              onClick={() => { setStatusTransition(null); setTransitionNotes("") }}
              className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleStatusChangeConfirm}
              disabled={actionLoading}
              className="flex items-center gap-2 rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white hover:bg-purple-700 disabled:opacity-50"
            >
              {actionLoading && <Loader2 className="h-4 w-4 animate-spin" />}
              Confirm
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Workflow Progress */}
      <WorkflowProgress status={request.status as RequestStatus} />

      {/* Quick Info Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 lg:grid-cols-4">
        <InfoCard
          label="Submitted"
          value={request.submitted_at ? format(new Date(request.submitted_at), "MMM d, yyyy") : "Not submitted"}
          icon={Send}
        />
        <InfoCard
          label="Acknowledged"
          value={
            request.acknowledged_at
              ? format(new Date(request.acknowledged_at), "MMM d, yyyy")
              : "Pending"
          }
          icon={CheckCircle2}
        />
        <InfoCard
          label="Deadline"
          value={
            request.deadline_at
              ? formatDistanceToNow(new Date(request.deadline_at), { addSuffix: true })
              : "None set"
          }
          icon={Clock}
          warn={
            request.deadline_at
              ? new Date(request.deadline_at) < new Date() &&
                !["fulfilled", "denied", "closed_incomplete"].includes(request.status)
              : false
          }
        />
        <InfoCard
          label="Next Follow-up"
          value={
            request.next_followup_at
              ? formatDistanceToNow(new Date(request.next_followup_at), { addSuffix: true })
              : "None scheduled"
          }
          icon={AlertTriangle}
        />
      </div>

      {/* Overdue follow-up banner */}
      {request.next_followup_at &&
        new Date(request.next_followup_at) < new Date() &&
        !["fulfilled", "denied", "closed_incomplete"].includes(request.status) && (
          <div className="flex items-center justify-between rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
            <p className="text-sm text-amber-800">
              Follow-up was due {formatDistanceToNow(new Date(request.next_followup_at), { addSuffix: true })}. Consider sending a follow-up message.
            </p>
            <button
              type="button"
              onClick={() => setActiveTab("messages")}
              className="shrink-0 rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-700"
            >
              Create Follow-up
            </button>
          </div>
        )}

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <div className="flex gap-0" role="tablist" aria-label="Request sections">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              role="tab"
              aria-selected={activeTab === tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 border-b-2 px-5 py-3 text-sm font-medium transition-colors ${
                activeTab === tab.id
                  ? "border-purple-600 text-purple-600"
                  : "border-transparent text-gray-500 hover:text-gray-900"
              }`}
            >
              <tab.icon className="h-4 w-4" />
              {tab.label}
              {tab.id === "messages" && messages.length > 0 && (
                <span className="ml-1 flex h-5 w-5 items-center justify-center rounded-full bg-purple-100 text-xs text-purple-600">
                  {messages.length}
                </span>
              )}
              {tab.id === "attachments" && attachments.length > 0 && (
                <span className="ml-1 flex h-5 w-5 items-center justify-center rounded-full bg-purple-100 text-xs text-purple-600">
                  {attachments.length}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Tab Content */}
      {activeTab === "overview" && (
        <OverviewTab
          request={request}
          messages={messages}
          tasks={tasks}
          submissionAttempts={submissionAttempts}
          onTaskComplete={loadData}
          autoOpenExternalModal={autoOpenExternal}
        />
      )}
      {activeTab === "messages" && (
        <MessagesTab messages={messages} requestId={parseInt(requestId, 10)} onMessageSent={loadData} />
      )}
      {activeTab === "attachments" && (
        <AttachmentsTab
          attachments={attachments}
          requestId={parseInt(requestId, 10)}
          onUploaded={loadData}
        />
      )}
      {activeTab === "events" && <EventsTab events={events} />}
    </div>
  )
}

const WORKFLOW_STEPS = [
  { label: "Draft", key: "draft" },
  { label: "Submitted", key: "submitted" },
  { label: "Acknowledged", key: "acknowledged" },
  { label: "In Progress", key: "in_progress" },
  { label: "Fulfilled", key: "fulfilled" },
] as const

function getWorkflowStep(status: RequestStatus): { step: number; terminated: boolean } {
  switch (status) {
    case "draft":
      return { step: 0, terminated: false }
    case "submitted":
    case "submitted_unacknowledged":
      return { step: 1, terminated: false }
    case "acknowledged":
    case "clarification_requested":
      return { step: 2, terminated: false }
    case "partially_fulfilled":
    case "fee_requested":
    case "extension_claimed":
      return { step: 3, terminated: false }
    case "fulfilled":
      return { step: 4, terminated: false }
    case "denied":
    case "closed_incomplete":
      // Terminated - show at current logical position
      if (status === "denied") return { step: 2, terminated: true }
      return { step: 3, terminated: true }
    default:
      return { step: 0, terminated: false }
  }
}

function WorkflowProgress({ status }: { status: RequestStatus }) {
  const { step, terminated } = getWorkflowStep(status)
  return (
    <div className="flex items-center gap-0">
      {WORKFLOW_STEPS.map((ws, i) => {
        const isComplete = i <= step
        const isCurrent = i === step
        const isTerminated = isCurrent && terminated
        return (
          <React.Fragment key={ws.key}>
            {i > 0 && (
              <div
                className={`h-0.5 flex-1 ${
                  i <= step ? (isTerminated ? "bg-red-300" : "bg-purple-400") : "bg-gray-200"
                }`}
              />
            )}
            <div className="flex flex-col items-center gap-1">
              <div
                className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold ${
                  isTerminated
                    ? "bg-red-100 text-red-600 ring-2 ring-red-300"
                    : isCurrent
                    ? "bg-purple-600 text-white ring-2 ring-purple-300"
                    : isComplete
                    ? "bg-purple-100 text-purple-600"
                    : "bg-gray-100 text-gray-400"
                }`}
              >
                {isTerminated ? "✕" : i + 1}
              </div>
              <span
                className={`text-[10px] font-medium whitespace-nowrap ${
                  isTerminated
                    ? "text-red-600"
                    : isCurrent
                    ? "text-purple-600"
                    : isComplete
                    ? "text-purple-500"
                    : "text-gray-400"
                }`}
              >
                {ws.label}
              </span>
            </div>
          </React.Fragment>
        )
      })}
    </div>
  )
}

function InfoCard({
  label,
  value,
  icon: Icon,
  warn,
}: {
  label: string
  value: string
  icon: React.ComponentType<{ className?: string }>
  warn?: boolean
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-gray-200 bg-white p-3">
      <Icon className={`h-4 w-4 ${warn ? "text-red-500" : "text-gray-400"}`} />
      <div>
        <p className="text-xs text-gray-500">{label}</p>
        <p className={`text-sm font-medium ${warn ? "text-red-600" : "text-gray-900"}`}>{value}</p>
      </div>
    </div>
  )
}

function OverviewTab({
  request,
  messages,
  tasks,
  submissionAttempts,
  onTaskComplete,
  autoOpenExternalModal,
}: {
  request: FoiaRequest
  messages: FoiaMessage[]
  tasks: FoiaTask[]
  submissionAttempts: FoiaSubmissionAttempt[]
  onTaskComplete: () => Promise<void>
  autoOpenExternalModal: boolean
}) {
  const [completing, setCompleting] = useState<number | null>(null)
  const [regenerating, setRegenerating] = useState(false)
  const [copiedLabel, setCopiedLabel] = useState<string | null>(null)
  const [showExternalModal, setShowExternalModal] = useState(false)
  const [externalId, setExternalId] = useState("")
  const [externalRequestUrl, setExternalRequestUrl] = useState("")
  const [screenshotUri, setScreenshotUri] = useState("")
  const [markingExternal, setMarkingExternal] = useState(false)
  const [showPacketDetails, setShowPacketDetails] = useState(false)

  const latestAttempt = submissionAttempts[0]
  const latestSnap = (latestAttempt?.payload_snapshot ?? {}) as Record<string, unknown>
  const snapPortalUrl = typeof latestSnap["portal_url"] === "string" ? (latestSnap["portal_url"] as string) : ""
  const snapEmail =
    typeof latestSnap["requester_email_effective"] === "string"
      ? (latestSnap["requester_email_effective"] as string)
      : ""
  const snapLetterBodyRaw = typeof latestSnap["letter_body"] === "string" ? (latestSnap["letter_body"] as string) : ""
  const snapCaseNumber =
    typeof latestSnap["case_or_cad_number"] === "string" ? (latestSnap["case_or_cad_number"] as string) : ""
  const snapPortalFields =
    latestSnap["portal_fields"] && typeof latestSnap["portal_fields"] === "object" ? latestSnap["portal_fields"] : null
  const externalConfirmationId = latestAttempt?.external_confirmation_id ?? ""
  const showRequestedFields = (request.requested_fields || []).length > 0
  const hasSubmissionDetails =
    Boolean(snapEmail) ||
    Boolean(snapCaseNumber) ||
    Boolean(snapPortalFields) ||
    Boolean(snapLetterBodyRaw) ||
    Boolean(externalConfirmationId)

  // Best available letter body: submission packet > latest outbound message > request description
  const latestOutboundBody = [...messages]
    .filter((m) => m.direction === "outbound" && m.body?.trim())
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0]?.body ?? ""
  const letterBody = snapLetterBodyRaw || latestOutboundBody || request.request_description || ""
  const letterSource = snapLetterBodyRaw
    ? "From submission packet"
    : latestOutboundBody
    ? "From latest outbound message"
    : "From request description"
  const isDraftStatus = request.status === "draft"

  useEffect(() => {
    if (autoOpenExternalModal) {
      setExternalRequestUrl((request.submission_url || "").trim())
      setShowExternalModal(true)
    }
  }, [autoOpenExternalModal, request.submission_url])

  async function copyText(label: string, text: string) {
    if (!text.trim()) return
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      const ta = document.createElement("textarea")
      ta.value = text
      ta.style.position = "fixed"
      ta.style.opacity = "0"
      document.body.appendChild(ta)
      ta.select()
      document.execCommand("copy")
      document.body.removeChild(ta)
    }
    setCopiedLabel(label)
    setTimeout(() => setCopiedLabel(null), 1500)
  }

  async function handleRegenerateLetter() {
    setRegenerating(true)
    try {
      await aiDraftFoiaRequest(request.id, "draft_request")
      await onTaskComplete()
      toast.success("Letter regenerated. It appears below and in the Messages tab.")
    } catch (err) {
      const raw = err instanceof Error ? err.message : "Failed to regenerate letter"
      const isNetworkError = raw === "Failed to fetch" || err instanceof TypeError
      const message = isNetworkError
        ? "Can’t reach the API. Make sure the backend is running and Next.js is proxying (check NEXT_PUBLIC_API_BASE_URL in .env.local)."
        : raw
      toast.error(message)
    } finally {
      setRegenerating(false)
    }
  }

  async function handleComplete(taskId: number) {
    setCompleting(taskId)
    try {
      await completeFoiaTask(taskId)
      await onTaskComplete()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to complete task")
    } finally {
      setCompleting(null)
    }
  }

  async function handleMarkExternallyFiled() {
    if (!externalId.trim()) {
      toast.warning("Please enter the portal confirmation number")
      return
    }
    setMarkingExternal(true)
    try {
      await markFoiaExternallyFiled(request.id, {
        external_confirmation_id: externalId.trim(),
        external_request_url: externalRequestUrl.trim() || undefined,
        screenshot_uri: screenshotUri.trim() || undefined,
      })
      setShowExternalModal(false)
      setExternalId("")
      setExternalRequestUrl("")
      setScreenshotUri("")
      await onTaskComplete()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to mark externally filed")
    } finally {
      setMarkingExternal(false)
    }
  }

  const timeline = [
    {
      key: "initial-request",
      type: "initial" as const,
      direction: "outbound" as const,
      subject: request.title?.trim() || `Initial request - ${datasetLabel(request.dataset_type_id)}`,
      body: "",
      created_at: request.created_at,
      classification: "initial_request",
    },
    ...messages.map((m) => ({
      key: `msg-${m.id}`,
      type: "message" as const,
      direction: m.direction,
      subject: m.subject || "(no subject)",
      body: m.body || m.email_snippet || m.notes || "",
      created_at: m.sent_at || m.created_at,
      classification: m.classification,
    })),
  ].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())

  const openTasks = tasks
    .filter((t) => t.status !== "completed" && t.status !== "cancelled")
    .sort((a, b) => {
      const aTs = a.due_at ? new Date(a.due_at).getTime() : Number.MAX_SAFE_INTEGER
      const bTs = b.due_at ? new Date(b.due_at).getTime() : Number.MAX_SAFE_INTEGER
      return aTs - bTs
    })
  const nextTask = openTasks[0]

  return (
    <>
      <ExternalFiledModal
        open={showExternalModal}
        onClose={() => setShowExternalModal(false)}
        externalId={externalId}
        setExternalId={setExternalId}
        externalRequestUrl={externalRequestUrl}
        setExternalRequestUrl={setExternalRequestUrl}
        screenshotUri={screenshotUri}
        setScreenshotUri={setScreenshotUri}
        onSave={handleMarkExternallyFiled}
        saving={markingExternal}
      />
      <div className="grid gap-4 lg:grid-cols-2">
      {showRequestedFields && (
      <div className="rounded-xl border border-gray-200 bg-white p-4">
        <h3 className="text-sm font-semibold text-gray-900">Requested Fields</h3>
        <div className="mt-3 flex flex-wrap gap-2">
          {request.requested_fields.map((field) => (
            <span
              key={field}
              className="rounded-md border border-gray-200 bg-gray-50 px-2.5 py-1 text-xs text-gray-600"
            >
              {field}
            </span>
          ))}
        </div>
      </div>
      )}

      {/* Letter body — prominent for drafts; show Regenerate even when no letter yet */}
      {isDraftStatus && (
        <div className="rounded-xl border-2 border-purple-200 bg-white p-4 lg:col-span-2">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-semibold text-gray-900">Request Letter</h3>
              <p className="mt-0.5 text-xs text-gray-400">
                {letterBody.trim() ? letterSource : "No letter generated yet. Generate from request description."}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleRegenerateLetter}
                disabled={regenerating}
                className="flex items-center gap-1.5 rounded-lg border border-purple-200 bg-white px-3 py-2 text-xs font-medium text-purple-700 hover:bg-purple-50 disabled:opacity-50"
              >
                {regenerating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                {regenerating ? "Regenerating..." : "Regenerate"}
              </button>
              {letterBody.trim() ? (
                <button
                  onClick={() => copyText("letter", letterBody)}
                  className="flex items-center gap-1.5 rounded-lg bg-purple-600 px-3 py-2 text-xs font-medium text-white hover:bg-purple-700"
                >
                  {copiedLabel === "letter" ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                  {copiedLabel === "letter" ? "Copied!" : "Copy Letter"}
                </button>
              ) : null}
            </div>
          </div>
          {letterBody.trim() ? (
            <pre className="mt-3 max-h-80 overflow-auto whitespace-pre-wrap rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm leading-relaxed text-gray-700">
              {letterBody}
            </pre>
          ) : (
            <p className="mt-3 text-sm text-gray-500">
              Click Regenerate to create a draft letter from this request’s description and dataset.
            </p>
          )}
        </div>
      )}

      {/* Submission info — always visible for manual submission */}
      <div className="rounded-xl border border-gray-200 bg-white p-4 lg:col-span-2">
        <h3 className="text-sm font-semibold text-gray-900">Where to Submit</h3>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <div>
            <p className="text-xs font-medium text-gray-500">Portal / Website</p>
            {request.submission_url ? (
              <div className="mt-1 flex items-center gap-2">
                <a
                  href={request.submission_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="truncate text-sm text-purple-600 hover:underline"
                >
                  {(() => { try { return new URL(request.submission_url).hostname } catch { return request.submission_url } })()}
                </a>
                <button
                  type="button"
                  onClick={() => copyText("url", request.submission_url ?? "")}
                  className="shrink-0 rounded-md border border-gray-200 bg-white px-2 py-1 text-[11px] font-medium text-gray-700 hover:bg-gray-50"
                >
                  {copiedLabel === "url" ? "Copied!" : "Copy"}
                </button>
              </div>
            ) : (
              <p className="mt-1 text-sm text-gray-300">Not set — use Edit to add</p>
            )}
          </div>
          <div>
            <p className="text-xs font-medium text-gray-500">Submission Email</p>
            {request.submission_email_address ? (
              <div className="mt-1 flex items-center gap-2">
                <span className="truncate text-sm text-gray-900" title="Request submission email">
                  {request.submission_email_address}
                </span>
                <button
                  type="button"
                  onClick={() => copyText("email", request.submission_email_address ?? "")}
                  className="shrink-0 rounded-md border border-gray-200 bg-white px-2 py-1 text-[11px] font-medium text-gray-700 hover:bg-gray-50"
                >
                  {copiedLabel === "email" ? "Copied!" : "Copy"}
                </button>
              </div>
            ) : null}

            {request.department?.contact_email && request.department.contact_email !== request.submission_email_address && (
              <div className="mt-1 flex items-center gap-2">
                <span className="truncate text-sm text-gray-500" title="Department contact email">
                  {request.department.contact_email} <span className="text-xs text-gray-400">(Dept)</span>
                </span>
                <button
                  type="button"
                  onClick={() => copyText("deptEmail", request.department?.contact_email ?? "")}
                  className="shrink-0 rounded-md border border-gray-200 bg-white px-2 py-1 text-[11px] font-medium text-gray-700 hover:bg-gray-50"
                >
                  {copiedLabel === "deptEmail" ? "Copied!" : "Copy"}
                </button>
              </div>
            )}
            
            {!request.submission_email_address && !request.department?.contact_email && (
              <p className="mt-1 text-sm text-gray-300">Not set — use Edit to add</p>
            )}
          </div>
          <div>
            <p className="text-xs font-medium text-gray-500">Department</p>
            <p className="mt-1 text-sm text-gray-900">
              {request.department?.name || <span className="text-gray-300">Not set</span>}
            </p>
          </div>
        </div>
      </div>

      {latestAttempt && (
        <div className="rounded-xl border border-gray-200 bg-white p-4 lg:col-span-2">
          <h3 className="text-sm font-semibold text-gray-900">Submission Packet</h3>
          <p className="mt-1 text-xs text-gray-500">
            {submissionAttempts.length} submission attempt(s) recorded
            {latestAttempt.submitted_at ? ` · Last: ${format(new Date(latestAttempt.submitted_at), "MMM d, yyyy")}` : ""}
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              onClick={() => copyText("packet JSON", JSON.stringify(latestAttempt.payload_snapshot, null, 2))}
              className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50"
            >
              Copy packet JSON
            </button>
            {snapEmail && (
              <button
                onClick={() => copyText("requester email", snapEmail)}
                className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50"
              >
                Copy requester email
              </button>
            )}
            {snapPortalUrl && (
              <>
                <a
                  href={snapPortalUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50"
                >
                  Open portal
                </a>
                <button
                  onClick={() => copyText("portal URL", snapPortalUrl)}
                  className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50"
                >
                  Copy portal URL
                </button>
              </>
            )}
            <button
              onClick={() => {
                setExternalRequestUrl((request.submission_url || "").trim())
                setShowExternalModal(true)
              }}
              className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50"
            >
              Mark externally filed
            </button>
            {hasSubmissionDetails && (
              <button
                onClick={() => setShowPacketDetails((v) => !v)}
                className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50"
              >
                {showPacketDetails ? "Hide details" : "Show details"}
              </button>
            )}
          </div>

          {hasSubmissionDetails && showPacketDetails && (
            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              {(snapEmail || snapCaseNumber) && (
                <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
                  <h4 className="text-xs font-semibold text-gray-900">Key fields</h4>
                  <dl className="mt-3 flex flex-col gap-2">
                    {externalConfirmationId && (
                      <div className="flex items-start justify-between gap-4">
                        <dt className="text-xs text-gray-500">Portal confirmation</dt>
                        <dd className="text-right text-xs font-medium text-gray-900">{externalConfirmationId}</dd>
                      </div>
                    )}
                    {snapEmail && (
                      <div className="flex items-start justify-between gap-4">
                        <dt className="text-xs text-gray-500">Effective requester email</dt>
                        <dd className="text-right text-xs font-medium text-gray-900">{snapEmail}</dd>
                      </div>
                    )}
                    {snapCaseNumber && (
                      <div className="flex items-start justify-between gap-4">
                        <dt className="text-xs text-gray-500">Case / CAD</dt>
                        <dd className="text-right text-xs font-medium text-gray-900">{snapCaseNumber}</dd>
                      </div>
                    )}
                  </dl>
                </div>
              )}

              {snapPortalFields && (
                <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
                  <div className="flex items-center justify-between gap-2">
                    <h4 className="text-xs font-semibold text-gray-900">Portal fields</h4>
                    <button
                      onClick={() => copyText("portal fields JSON", JSON.stringify(snapPortalFields, null, 2))}
                      className="rounded-md border border-gray-200 bg-white px-2 py-1 text-[11px] font-medium text-gray-700 hover:bg-gray-50"
                    >
                      Copy
                    </button>
                  </div>
                  <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap rounded-md bg-white p-3 text-[11px] text-gray-700">
                    {JSON.stringify(snapPortalFields, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          )}
        </div>
      )}
      <div className="rounded-xl border border-gray-200 bg-white p-4">
        <h3 className="text-sm font-semibold text-gray-900">Details</h3>
        <dl className="mt-3 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <dt className="text-xs text-gray-500">Created</dt>
            <dd className="text-sm text-gray-900">
              {format(new Date(request.created_at), "MMM d, yyyy 'at' h:mm a")}
            </dd>
          </div>
          {request.assigned_to && (
            <div className="flex items-center justify-between">
              <dt className="text-xs text-gray-500">Assigned To</dt>
              <dd className="text-sm text-gray-900">{request.assigned_to}</dd>
            </div>
          )}
        </dl>
      </div>
      <div className="rounded-xl border border-gray-200 bg-white p-4 lg:col-span-2">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-gray-900">Request correspondence timeline</h3>
          <span className="text-xs text-gray-500">{timeline.length} entries</span>
        </div>
        <p className="mt-1 text-xs text-gray-500">
          Full record of your original request, city responses, your follow-ups, and acknowledgments.
        </p>
        <div className="mt-4 space-y-2">
          {timeline.map((item) => {
            const isInbound = item.direction === "inbound"
            const tone = isInbound
              ? "border-blue-200 bg-blue-50 text-blue-700"
              : "border-purple-200 bg-purple-50 text-purple-700"
            const showBody = !isDraftStatus && item.body
            return (
              <div key={item.key} className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase ${tone}`}>
                      {item.type === "initial" ? "Initial" : isInbound ? "City response" : "Your response"}
                    </span>
                    {item.classification && (
                      <span className="rounded-full border border-gray-200 bg-white px-2 py-0.5 text-[10px] text-gray-600">
                        {item.classification.replace(/_/g, " ")}
                      </span>
                    )}
                    <span className="text-sm font-medium text-gray-900">{item.subject}</span>
                  </div>
                  <span className="text-[11px] text-gray-500">
                    {format(new Date(item.created_at), "MMM d, yyyy 'at' h:mm a")}
                  </span>
                </div>
                {showBody && (
                  <p className="mt-2 whitespace-pre-line text-xs leading-relaxed text-gray-700">{item.body}</p>
                )}
              </div>
            )
          })}
        </div>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-4 lg:col-span-2">
        <h3 className="text-sm font-semibold text-gray-900">Next step</h3>
        {nextTask ? (
          <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 p-4">
            <p className="text-sm font-medium text-amber-900">{nextTask.title}</p>
            {nextTask.description && <p className="mt-1 text-xs text-amber-800">{nextTask.description}</p>}
            <p className="mt-2 text-xs text-amber-700">
              {nextTask.due_at ? `Due ${format(new Date(nextTask.due_at), "MMM d, yyyy")}` : "No due date set yet"}
            </p>
          </div>
        ) : (
          <p className="mt-2 text-sm text-gray-500">
            No pending follow-up tasks. If no response is received after your latest outbound message, create a
            10-day no-response follow-up.
          </p>
        )}
      </div>
      {tasks.length > 0 && (
        <div className="rounded-xl border border-gray-200 bg-white p-4 lg:col-span-2">
          <h3 className="text-sm font-semibold text-gray-900">Related Tasks</h3>
          <div className="mt-3 divide-y divide-gray-100">
            {tasks.map((task) => (
              <div key={task.id} className="flex items-center justify-between py-3">
                <div>
                  <p className="text-sm font-medium text-gray-900">{task.title}</p>
                  <p className="text-xs text-gray-500">
                    {task.assigned_to ? `Assigned to ${task.assigned_to}` : "Unassigned"}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <TaskStatusBadge status={task.status} />
                  {task.status !== "completed" && task.status !== "cancelled" && (
                    <button
                      onClick={() => handleComplete(task.id)}
                      disabled={completing === task.id}
                      className="flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
                    >
                      {completing === task.id ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <CheckCircle2 className="h-3 w-3" />
                      )}
                      Complete
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      </div>
    </>
  )
}

function ExternalFiledModal({
  open,
  onClose,
  externalId,
  setExternalId,
  externalRequestUrl,
  setExternalRequestUrl,
  screenshotUri,
  setScreenshotUri,
  onSave,
  saving,
}: {
  open: boolean
  onClose: () => void
  externalId: string
  setExternalId: (v: string) => void
  externalRequestUrl: string
  setExternalRequestUrl: (v: string) => void
  screenshotUri: string
  setScreenshotUri: (v: string) => void
  onSave: () => void
  saving: boolean
}) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="fixed inset-0 bg-black/40" onClick={onClose} />
      <div className="relative z-10 w-full max-w-md rounded-2xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
          <h2 className="text-lg font-semibold text-gray-900">Mark externally filed</h2>
          <button onClick={onClose} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="px-6 py-5">
          <div className="flex flex-col gap-4">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-700">Portal confirmation number *</label>
              <input
                type="text"
                value={externalId}
                onChange={(e) => setExternalId(e.target.value)}
                placeholder="e.g. PRR-12345"
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-700">Request URL (optional)</label>
              <input
                type="url"
                value={externalRequestUrl}
                onChange={(e) => setExternalRequestUrl(e.target.value)}
                placeholder="https://sanfrancisco.nextrequest.com/requests/26-915"
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-700">Screenshot URL (optional)</label>
              <input
                type="url"
                value={screenshotUri}
                onChange={(e) => setScreenshotUri(e.target.value)}
                placeholder="https://..."
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
              />
              <p className="mt-1 text-xs text-gray-400">
                Optional: paste a link to a stored screenshot/receipt. We’ll attach it to the request.
              </p>
            </div>
          </div>
        </div>
        <div className="flex items-center justify-end gap-3 border-t border-gray-200 px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onSave}
            disabled={saving}
            className="flex items-center gap-2 rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white hover:bg-purple-700 disabled:opacity-50"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            Save
          </button>
        </div>
      </div>
    </div>
  )
}

function SubmitRequestModal({
  open,
  onClose,
  submittedDate,
  setSubmittedDate,
  onConfirm,
  saving,
}: {
  open: boolean
  onClose: () => void
  submittedDate: string
  setSubmittedDate: (v: string) => void
  onConfirm: () => Promise<void>
  saving: boolean
}) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="fixed inset-0 bg-black/40" onClick={onClose} />
      <div className="relative z-10 w-full max-w-md rounded-2xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
          <h2 className="text-lg font-semibold text-gray-900">Mark submitted</h2>
          <button onClick={onClose} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="px-6 py-5">
          <label className="mb-1 block text-xs font-medium text-gray-700">Date submitted</label>
          <input
            type="date"
            value={submittedDate}
            onChange={(e) => setSubmittedDate(e.target.value)}
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
          />
          <p className="mt-2 text-xs text-gray-500">
            We use this date to set request timeline and deadline tracking.
          </p>
        </div>
        <div className="flex items-center justify-end gap-3 border-t border-gray-200 px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={saving}
            className="flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            Save & Continue
          </button>
        </div>
      </div>
    </div>
  )
}

function EditRequestModal({
  open,
  onClose,
  request,
  onSave,
  saving,
}: {
  open: boolean
  onClose: () => void
  request: FoiaRequest
  onSave: (data: {
    title?: string
    request_description?: string
    submission_url?: string
    submission_email_address?: string
    agency_request_number?: string
    submitted_date?: string
  }) => Promise<void>
  saving: boolean
}) {
  const [title, setTitle] = useState(() => (request.title || "").trim())
  const [desc, setDesc] = useState(() => (request.request_description || "").trim())

  if (!open) return null

  const isDraft = request.status === "draft"
  const canEditTrackingFields = true
  const canEditCoreFields = isDraft

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center">
      <div className="fixed inset-0 bg-black/50" onClick={onClose} />
      <div className="relative z-10 w-full max-w-2xl rounded-2xl bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
          <div>
            <h3 className="text-base font-semibold text-gray-900">Edit request</h3>
            <p className="mt-0.5 text-xs text-gray-500">Request #{request.id}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="max-h-[75vh] overflow-y-auto px-6 py-5">
          {!isDraft && (
            <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              Only <span className="font-semibold">draft</span> requests can edit title/description.
            </div>
          )}

          <div className="grid grid-cols-1 gap-4">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-700">Title</label>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                disabled={!canEditCoreFields || saving}
                placeholder="Optional title"
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500 disabled:bg-gray-50 disabled:text-gray-400"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-gray-700">Request description</label>
              <textarea
                value={desc}
                onChange={(e) => setDesc(e.target.value)}
                disabled={!canEditCoreFields || saving}
                rows={12}
                placeholder="What records are you requesting?"
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm leading-relaxed focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500 disabled:bg-gray-50 disabled:text-gray-400"
              />
            </div>

          </div>
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-gray-200 px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={async (e) => {
              e.stopPropagation()
              await onSave({
                title: canEditCoreFields ? title.trim() || undefined : undefined,
                request_description: canEditCoreFields ? desc.trim() || undefined : undefined,
              })
            }}
            disabled={saving}
            className="flex items-center gap-2 rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white hover:bg-purple-700 disabled:opacity-50"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            Save
          </button>
        </div>
      </div>
    </div>
  )
}

function MessagesTab({
  messages,
  requestId,
  onMessageSent,
}: {
  messages: FoiaMessage[]
  requestId: number
  onMessageSent: () => Promise<void>
}) {
  const [showCompose, setShowCompose] = useState(false)
  const [sending, setSending] = useState(false)
  const [creatingTask, setCreatingTask] = useState(false)
  const [taskCreatedFor, setTaskCreatedFor] = useState<number | null>(null)
  const [autoDraftNarrowReply, setAutoDraftNarrowReply] = useState(true)
  const [quickInsert, setQuickInsert] = useState("")
  const [msgForm, setMsgForm] = useState<{
    direction: "outbound" | "inbound"
    classification: MessageClassification
    subject: string
    body: string
    sender: string
    recipient: string
    sender_name: string
    sender_email: string
    sender_phone: string
    sender_title: string
    notes: string
    email_snippet: string
    channel: CommunicationChannel
    response_action_required: ResponseAction
  }>({
    direction: "inbound",
    classification: "follow_up",
    subject: "",
    body: "",
    sender: "",
    recipient: "",
    sender_name: "",
    sender_email: "",
    sender_phone: "",
    sender_title: "",
    notes: "",
    email_snippet: "",
    channel: "email",
    response_action_required: "none",
  })

  function resetForm() {
    setMsgForm({
      direction: "inbound",
      classification: "follow_up",
      subject: "",
      body: "",
      sender: "",
      recipient: "",
      sender_name: "",
      sender_email: "",
      sender_phone: "",
      sender_title: "",
      notes: "",
      email_snippet: "",
      channel: "email",
      response_action_required: "none",
    })
    setAutoDraftNarrowReply(true)
    setQuickInsert("")
  }

  async function createNoResponseTask(reason: string) {
    await createFoiaTask(buildNoResponseTaskPayload(requestId, reason))
  }

  function isNarrowingInbound(msg: FoiaMessage): boolean {
    return isNarrowingSignal({
      direction: msg.direction,
      classification: msg.classification,
      subject: msg.subject,
      emailSnippet: msg.email_snippet,
      body: msg.body,
    })
  }

  function openPasteOwnNarrowReply() {
    setShowCompose(true)
    setMsgForm((f) => ({
      ...f,
      direction: "outbound",
      classification: "follow_up",
      response_action_required: "none",
      subject: f.subject || "Re: Request narrowed scope",
      body: "",
      notes: f.notes || "Narrowing response sent by requester.",
    }))
  }

  async function handleGenerateNarrowedReply() {
    const latestInboundNeedingNarrow = [...messages].reverse().find(isNarrowingInbound)
    if (!latestInboundNeedingNarrow) return
    setSending(true)
    try {
      const extraContext = [
        "The agency asked us to narrow scope.",
        "Draft a concise narrowed response that confirms we are narrowing the request.",
        "Keep tone cooperative and specific.",
        latestInboundNeedingNarrow.subject ? `Agency subject: ${latestInboundNeedingNarrow.subject}` : "",
        latestInboundNeedingNarrow.email_snippet
          ? `Agency key quote: ${latestInboundNeedingNarrow.email_snippet}`
          : "",
        latestInboundNeedingNarrow.body
          ? `Agency full text: ${latestInboundNeedingNarrow.body.slice(0, 1500)}`
          : "",
      ]
        .filter(Boolean)
        .join("\n")

      await aiDraftFoiaRequest(requestId, "draft_followup", extraContext)
      await createNoResponseTask(
        "Auto-created after narrowed-scope reply draft. If no response in 10 days, send a status check."
      )
      await onMessageSent()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to generate narrowed reply")
    } finally {
      setSending(false)
    }
  }

  async function handleSend(e: React.FormEvent) {
    e.preventDefault()
    setSending(true)
    try {
      await createFoiaMessage(requestId, {
        direction: msgForm.direction,
        classification: msgForm.classification || undefined,
        subject: msgForm.subject || undefined,
        body: msgForm.body || undefined,
        sender: msgForm.sender || msgForm.sender_name || undefined,
        recipient: msgForm.recipient || undefined,
        sender_name: msgForm.sender_name || undefined,
        sender_email: msgForm.sender_email || undefined,
        sender_phone: msgForm.sender_phone || undefined,
        sender_title: msgForm.sender_title || undefined,
        notes: msgForm.notes || undefined,
        email_snippet: msgForm.email_snippet || undefined,
        channel: msgForm.channel || undefined,
        response_action_required: msgForm.response_action_required !== "none" ? msgForm.response_action_required : undefined,
      })

      const isInboundNarrowing =
        msgForm.direction === "inbound" &&
        ["narrow_request", "clarification"].includes(msgForm.classification) &&
        autoDraftNarrowReply

      if (isInboundNarrowing) {
        try {
          const extraContext = [
            "The agency asked us to narrow scope.",
            "Draft a concise narrowed response that confirms we are narrowing the request.",
            "Keep tone cooperative and specific.",
            msgForm.subject ? `Agency subject: ${msgForm.subject}` : "",
            msgForm.email_snippet ? `Agency key quote: ${msgForm.email_snippet}` : "",
            msgForm.body ? `Agency full text: ${msgForm.body.slice(0, 1500)}` : "",
          ]
            .filter(Boolean)
            .join("\n")

          await aiDraftFoiaRequest(requestId, "draft_followup", extraContext)
          await createNoResponseTask(
            "Auto-created after narrowed-scope reply draft. If no response in 10 days, send a status check."
          )
        } catch (err) {
          console.error("Auto-draft for narrowed request failed:", err)
          // Don't fail the interaction log if AI/task automation fails.
        }
      }

      if (msgForm.direction === "outbound") {
        try {
          await createNoResponseTask(
            "No response reminder after outbound follow-up. Send a status check if no reply in 10 days."
          )
        } catch (err) {
          console.error("Auto-create 10-day reminder failed:", err)
        }
      }

      setShowCompose(false)
      resetForm()
      await onMessageSent()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save interaction")
    } finally {
      setSending(false)
    }
  }

  async function handleCreateTask(msg: FoiaMessage) {
    const action = msg.response_action_required || "general_followup"
    const { type: taskType, title: taskTitle } = getFollowUpTaskSpec(action)
    const description = [
      msg.subject ? `Subject: ${msg.subject}` : "",
      msg.sender_name ? `Contact: ${msg.sender_name}` : "",
      msg.sender_email ? `Email: ${msg.sender_email}` : "",
      msg.notes ? `Notes: ${msg.notes}` : "",
      msg.email_snippet ? `Snippet: ${msg.email_snippet.slice(0, 200)}...` : "",
    ].filter(Boolean).join("\n")

    setCreatingTask(true)
    try {
      await createFoiaTask({
        request_id: requestId,
        type: taskType,
        title: taskTitle,
        description,
      })
      setTaskCreatedFor(msg.id)
      setTimeout(() => setTaskCreatedFor(null), 3000)
      await onMessageSent()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create task")
    } finally {
      setCreatingTask(false)
    }
  }

  const CLASSIFICATION_OPTIONS = [
    { value: "initial_request", label: "Initial Request" },
    { value: "follow_up", label: "Follow Up" },
    { value: "acknowledgment", label: "Acknowledgment" },
    { value: "clarification", label: "Clarification" },
    { value: "status_update", label: "Status Update" },
    { value: "narrow_request", label: "Asked to Narrow Request" },
    { value: "pickup_instructions", label: "Pickup Instructions (go to city hall, etc.)" },
    { value: "no_records", label: "No Records / No Data" },
    { value: "partial_no_records", label: "Partial No Records (some depts still searching)" },
    { value: "data_delivery", label: "Data Delivery" },
    { value: "fee_notice", label: "Fee Notice" },
    { value: "fee_estimate", label: "Fee Estimate (copying/mailing charges)" },
    { value: "denial", label: "Denial" },
    { value: "exemption", label: "Exemption Claimed (some/all records exempt)" },
    { value: "extension", label: "Extension (needs more time)" },
    { value: "reroute", label: "Reroute to Another Dept" },
  ]

  const ACTION_OPTIONS = FOLLOW_UP_ACTION_OPTIONS

  const classificationToAction: Record<string, string> = FOLLOW_UP_CLASSIFICATION_TO_ACTION

  const latestInboundNeedingNarrow = [...messages].reverse().find(isNarrowingInbound)
  const hasOutboundAfterNarrow =
    !!latestInboundNeedingNarrow &&
    messages.some(
      (m) =>
        m.direction === "outbound" &&
        new Date(m.created_at).getTime() > new Date(latestInboundNeedingNarrow.created_at).getTime()
    )
  const showNarrowPrompt = !!latestInboundNeedingNarrow && !hasOutboundAfterNarrow

  return (
    <div className="flex flex-col gap-4">
      {showNarrowPrompt && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
          <p className="text-sm font-semibold text-amber-900">Agency asked you to narrow this request</p>
          <p className="mt-1 text-xs text-amber-800">
            You should send a narrowed-scope reply now. You can generate one or paste your own.
          </p>
          {latestInboundNeedingNarrow?.email_snippet && (
            <p className="mt-2 rounded-md border border-amber-200 bg-white px-3 py-2 text-xs italic text-amber-900">
              &quot;{latestInboundNeedingNarrow.email_snippet}&quot;
            </p>
          )}
          <div className="mt-3 flex items-center gap-2">
            <button
              type="button"
              onClick={handleGenerateNarrowedReply}
              disabled={sending}
              className="flex items-center gap-1.5 rounded-lg bg-purple-600 px-3 py-2 text-xs font-medium text-white hover:bg-purple-700 disabled:opacity-50"
            >
              {sending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
              {sending ? "Generating..." : "Generate narrowed reply"}
            </button>
            <button
              type="button"
              onClick={openPasteOwnNarrowReply}
              className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50"
            >
              Paste my own reply
            </button>
          </div>
        </div>
      )}

      <div className="flex justify-end">
        <button
          onClick={() => { setShowCompose(!showCompose); if (showCompose) resetForm() }}
          className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          {showCompose ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
          {showCompose ? "Cancel" : "Log Interaction"}
        </button>
      </div>

      {showCompose && (
        <form onSubmit={handleSend} className="rounded-xl border border-purple-200 bg-purple-50/30 p-5">
          <h3 className="text-sm font-semibold text-gray-900">Log an Interaction</h3>
          <p className="mt-1 text-xs text-gray-500">Record a follow-up email, phone call, or response you received.</p>

          <div className="mt-4 flex flex-col gap-4">
            {/* Row 1: Direction + Channel + Classification */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-700">Direction</label>
                <select
                  value={msgForm.direction}
                  onChange={(e) =>
                    setMsgForm((f) => ({ ...f, direction: e.target.value as "outbound" | "inbound" }))
                  }
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
                >
                  <option value="inbound">Received (inbound)</option>
                  <option value="outbound">Sent (outbound)</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-700">Channel</label>
                <select
                  value={msgForm.channel}
                  onChange={(e) => setMsgForm((f) => ({ ...f, channel: e.target.value as CommunicationChannel }))}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
                >
                  <option value="email">Email</option>
                  <option value="phone">Phone</option>
                  <option value="portal">Portal</option>
                  <option value="in_person">In Person</option>
                  <option value="mail">Physical Mail</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-700">Type of Response</label>
                <select
                  value={msgForm.classification}
                  onChange={(e) => {
                    const cls = e.target.value as MessageClassification
                    const suggestedAction = (classificationToAction[cls] || "none") as ResponseAction
                    setMsgForm((f) => ({ ...f, classification: cls, response_action_required: suggestedAction }))
                  }}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
                >
                  {CLASSIFICATION_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Contact information */}
            <div className="rounded-lg border border-gray-200 bg-white p-4">
              <p className="text-xs font-semibold text-gray-900">Contact Person</p>
              <p className="mt-0.5 text-xs text-gray-500">Who sent this or who did you speak with?</p>
              <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-700">Name</label>
                  <input
                    type="text"
                    value={msgForm.sender_name}
                    onChange={(e) => setMsgForm((f) => ({ ...f, sender_name: e.target.value }))}
                    placeholder="Jane Smith"
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-700">Title / Position</label>
                  <input
                    type="text"
                    value={msgForm.sender_title}
                    onChange={(e) => setMsgForm((f) => ({ ...f, sender_title: e.target.value }))}
                    placeholder="Records Custodian"
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-700">Email</label>
                  <input
                    type="email"
                    value={msgForm.sender_email}
                    onChange={(e) => setMsgForm((f) => ({ ...f, sender_email: e.target.value }))}
                    placeholder="jsmith@sfgov.org"
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-700">Phone</label>
                  <input
                    type="tel"
                    value={msgForm.sender_phone}
                    onChange={(e) => setMsgForm((f) => ({ ...f, sender_phone: e.target.value }))}
                    placeholder="(415) 555-0123"
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
                  />
                </div>
              </div>
            </div>

            {/* Subject + email snippet */}
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-700">
                Reason agency asked to revise / add info (optional)
              </label>
              <select
                value={quickInsert}
                onChange={(e) => {
                  const next = e.target.value
                  setQuickInsert(next)
                  if (!next) return
                  const chosen = FOLLOW_UP_QUICK_INSERTS.find((x) => x.text === next)
                  if (!chosen) return
                  setMsgForm((f) => {
                    if (!f.email_snippet.trim()) {
                      return { ...f, email_snippet: chosen.text }
                    }
                    const mergedBody = f.body.trim()
                      ? `${f.body.trim()}\n\n${chosen.text}`
                      : chosen.text
                    return { ...f, body: mergedBody }
                  })
                }}
                className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
              >
                <option value="">Select a revision/info reason...</option>
                {FOLLOW_UP_QUICK_INSERTS.map((opt) => (
                  <option key={opt.label} value={opt.text}>
                    {opt.label}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-[11px] text-gray-500">
                Focused on narrowing requests and clarification reasons only.
              </p>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-700">Subject</label>
              <input
                type="text"
                value={msgForm.subject}
                onChange={(e) => setMsgForm((f) => ({ ...f, subject: e.target.value }))}
                placeholder="RE: Public Records Request PRR-12345"
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-700">
                Email Snippet / Key Quote
              </label>
              <textarea
                value={msgForm.email_snippet}
                onChange={(e) => setMsgForm((f) => ({ ...f, email_snippet: e.target.value }))}
                rows={3}
                placeholder='Paste the relevant part of their email here, e.g. "Your request is too broad. Please narrow to a specific date range..."'
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm leading-relaxed focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
              />
            </div>

            {/* Full body (optional) */}
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-700">Full Message Body (optional)</label>
              <textarea
                value={msgForm.body}
                onChange={(e) => setMsgForm((f) => ({ ...f, body: e.target.value }))}
                rows={4}
                placeholder="Paste the full email text if you have it..."
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm leading-relaxed focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
              />
            </div>

            {/* Your notes */}
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-700">Your Notes</label>
              <textarea
                value={msgForm.notes}
                onChange={(e) => setMsgForm((f) => ({ ...f, notes: e.target.value }))}
                rows={2}
                placeholder="My observations, next steps I'm thinking about..."
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm leading-relaxed focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
              />
            </div>

            {/* Action required */}
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
              <label className="mb-1 block text-xs font-semibold text-amber-900">What action is needed?</label>
              <p className="mb-2 text-xs text-amber-700">
                Auto-suggested based on response type. This will help generate a follow-up task.
              </p>
              <select
                value={msgForm.response_action_required}
                onChange={(e) => setMsgForm((f) => ({ ...f, response_action_required: e.target.value as ResponseAction }))}
                className="w-full rounded-lg border border-amber-200 bg-white px-3 py-2 text-sm focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
              >
                {ACTION_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
              {(msgForm.classification === "narrow_request" || msgForm.classification === "clarification") &&
                msgForm.direction === "inbound" && (
                  <label className="mt-3 flex items-start gap-2 text-xs text-amber-800">
                    <input
                      type="checkbox"
                      checked={autoDraftNarrowReply}
                      onChange={(e) => setAutoDraftNarrowReply(e.target.checked)}
                      className="mt-0.5"
                    />
                    <span>
                      Auto-generate my narrowing reply after save and create a 10-day no-response reminder task.
                    </span>
                  </label>
                )}
            </div>

            <div className="flex justify-end">
              <button
                type="submit"
                disabled={sending}
                className="flex items-center gap-2 rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white hover:bg-purple-700 disabled:opacity-50"
              >
                {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                Save Interaction
              </button>
            </div>
          </div>
        </form>
      )}

      {messages.length === 0 && !showCompose && (
        <div className="py-12 text-center text-sm text-gray-400">
          No interactions logged yet. Click Log Interaction to record a follow-up.
        </div>
      )}

      {messages.map((msg) => (
        <div
          key={msg.id}
          className={`rounded-xl border border-gray-200 p-5 ${
            msg.direction === "outbound" ? "bg-purple-50/50 ml-8" : "bg-white mr-8"
          }`}
        >
          <div className="flex items-center justify-between">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                  msg.direction === "outbound"
                    ? "bg-purple-100 text-purple-700"
                    : "bg-gray-100 text-gray-600"
                }`}
              >
                {msg.direction === "outbound" ? "Sent" : "Received"}
              </span>
              {msg.channel && msg.channel !== "email" && (
                <span className="rounded-full border border-gray-200 px-2 py-0.5 text-xs text-gray-500">
                  via {msg.channel.replace("_", " ")}
                </span>
              )}
              {msg.classification && (
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                  msg.classification === "narrow_request" ? "bg-amber-100 text-amber-700"
                  : msg.classification === "no_records" ? "bg-red-100 text-red-700"
                  : msg.classification === "pickup_instructions" ? "bg-blue-100 text-blue-700"
                  : msg.classification === "status_update" ? "bg-emerald-100 text-emerald-700"
                  : msg.classification === "denial" ? "bg-red-100 text-red-700"
                  : "border border-gray-200 bg-gray-50 text-gray-600"
                }`}>
                  {msg.classification.replace(/_/g, " ")}
                </span>
              )}
              {msg.response_action_required && msg.response_action_required !== "none" && (
                <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
                  Action: {msg.response_action_required.replace(/_/g, " ")}
                </span>
              )}
            </div>
            <span className="text-xs text-gray-400">
              {msg.sent_at ? format(new Date(msg.sent_at), "MMM d, yyyy 'at' h:mm a") : msg.created_at ? format(new Date(msg.created_at), "MMM d, yyyy 'at' h:mm a") : ""}
            </span>
          </div>

          {msg.subject && <h4 className="mt-2 text-sm font-medium text-gray-900">{msg.subject}</h4>}

          {/* Contact info card */}
          {(msg.sender_name || msg.sender_email || msg.sender_phone || msg.sender_title) && (
            <div className="mt-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-600">
                {msg.sender_name && <span className="font-medium">{msg.sender_name}</span>}
                {msg.sender_title && <span className="text-gray-500">{msg.sender_title}</span>}
                {msg.sender_email && <span>{msg.sender_email}</span>}
                {msg.sender_phone && <span>{msg.sender_phone}</span>}
              </div>
            </div>
          )}

          {/* Email snippet */}
          {msg.email_snippet && (
            <div className="mt-2 rounded-lg border-l-4 border-purple-300 bg-purple-50/50 px-3 py-2">
              <p className="text-xs font-medium text-purple-700">Key quote:</p>
              <p className="mt-1 whitespace-pre-line text-sm italic leading-relaxed text-gray-700">
                &ldquo;{msg.email_snippet}&rdquo;
              </p>
            </div>
          )}

          {msg.body && (
            <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-gray-600">{msg.body}</p>
          )}

          {/* Notes */}
          {msg.notes && (
            <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
              <p className="text-xs font-medium text-amber-700">Notes:</p>
              <p className="mt-0.5 text-sm text-amber-900">{msg.notes}</p>
            </div>
          )}

          {/* Legacy from/to display */}
          {!msg.sender_name && msg.sender && (
            <p className="mt-2 text-xs text-gray-400">
              From: {msg.sender} {msg.recipient ? `To: ${msg.recipient}` : ""}
            </p>
          )}

          {/* Action buttons for messages with required actions */}
          {msg.response_action_required && msg.response_action_required !== "none" && (
            <div className="mt-3 flex items-center gap-2 border-t border-gray-100 pt-3">
              <button
                onClick={() => handleCreateTask(msg)}
                disabled={creatingTask || taskCreatedFor === msg.id}
                className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                {taskCreatedFor === msg.id ? (
                  <>
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                    Task Created
                  </>
                ) : creatingTask ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Creating...
                  </>
                ) : (
                  <>
                    <Plus className="h-3.5 w-3.5" />
                    Create Follow-up Task
                  </>
                )}
              </button>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

function AttachmentsTab({
  attachments,
  requestId,
  onUploaded,
}: {
  attachments: FoiaAttachment[]
  requestId: number
  onUploaded: () => void
}) {
  const [uploading, setUploading] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const fileInputRef = React.useRef<HTMLInputElement>(null)

  function formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return
    setUploading(true)
    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i]
        const formData = new FormData()
        formData.append("file", file)
        await uploadFoiaFile(requestId, formData)
      }
      onUploaded()
    } catch (err) {
      console.error("Upload failed:", err)
      toast.error("Upload failed. Please try again.")
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ""
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragOver(false)
    handleFiles(e.dataTransfer.files)
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Upload area */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        className={`flex flex-col items-center justify-center rounded-xl border-2 border-dashed p-8 transition-colors ${
          dragOver
            ? "border-purple-400 bg-purple-50"
            : "border-gray-200 bg-gray-50 hover:border-gray-300"
        }`}
      >
        {uploading ? (
          <>
            <Loader2 className="h-8 w-8 animate-spin text-purple-500" />
            <p className="mt-2 text-sm text-gray-600">Uploading...</p>
          </>
        ) : (
          <>
            <Upload className="h-8 w-8 text-gray-400" />
            <p className="mt-2 text-sm font-medium text-gray-700">
              Drag & drop files here, or{" "}
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="text-purple-600 underline hover:text-purple-700"
              >
                browse
              </button>
            </p>
            <p className="mt-1 text-xs text-gray-500">
              PDF, CSV, Excel, images, or any document received from the agency
            </p>
          </>
        )}
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          accept=".pdf,.csv,.xlsx,.xls,.doc,.docx,.txt,.png,.jpg,.jpeg,.gif,.zip"
          onChange={(e) => handleFiles(e.target.files)}
        />
      </div>

      {/* Attachment list */}
      {attachments.length === 0 ? (
        <div className="py-6 text-center text-sm text-gray-400">
          No attachments for this request yet. Upload a file above.
        </div>
      ) : (
        attachments.map((att) => (
          <div
            key={att.id}
            className="flex items-center justify-between rounded-lg border border-gray-200 bg-white p-4"
          >
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-purple-50">
                <Paperclip className="h-4 w-4 text-purple-600" />
              </div>
              <div>
                <p className="text-sm font-medium text-gray-900">{att.filename}</p>
                <div className="flex items-center gap-2 text-xs text-gray-500">
                  {att.file_type && <span>{att.file_type.toUpperCase()}</span>}
                  {att.file_size_bytes > 0 && <span>{formatFileSize(att.file_size_bytes)}</span>}
                  <span>{format(new Date(att.uploaded_at), "MMM d, yyyy")}</span>
                </div>
              </div>
            </div>
            {att.uri && (
              <a
                href={att.uri.startsWith("/") ? `${API_BASE}${att.uri}` : att.uri}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-50"
              >
                Download
              </a>
            )}
          </div>
        ))
      )}
    </div>
  )
}

function EventsTab({ events }: { events: FoiaRequestEvent[] }) {
  if (events.length === 0) {
    return (
      <div className="py-12 text-center text-sm text-gray-400">
        No events recorded yet.
      </div>
    )
  }
  return (
    <div className="relative pl-6">
      <div className="absolute left-[11px] top-2 bottom-2 w-px bg-gray-200" />
      <div className="flex flex-col gap-0">
        {events.map((evt, i) => (
          <div key={evt.id} className="relative flex gap-4 py-3">
            <div
              className={`relative z-10 mt-1 h-2.5 w-2.5 rounded-full ${
                i === 0 ? "bg-purple-600" : "bg-gray-300"
              }`}
            />
            <div>
              <div className="flex items-center gap-2">
                {evt.from_status && (
                  <>
                    <RequestStatusBadge status={evt.from_status} />
                    <span className="text-xs text-gray-400">&rarr;</span>
                  </>
                )}
                <RequestStatusBadge status={evt.to_status} />
              </div>
              <p className="mt-1 text-xs text-gray-500">
                {evt.actor} - {format(new Date(evt.created_at), "MMM d, yyyy 'at' h:mm a")}
              </p>
              {evt.notes && <p className="mt-0.5 text-xs text-gray-400">{evt.notes}</p>}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

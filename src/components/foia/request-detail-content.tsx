"use client"

import React, { useEffect, useState, useCallback } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
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
} from "lucide-react"
import {
  getFoiaRequest,
  listFoiaMessages,
  listFoiaAttachments,
  listFoiaRequestEvents,
  listFoiaTasks,
  listFoiaSubmissionAttempts,
  markFoiaExternallyFiled,
} from "@/lib/foiaApiClient"
import {
  createFoiaMessage,
  completeFoiaTask,
  updateRequestStatus,
  uploadFoiaFile,
} from "@/app/actions/foia"
import { API_BASE } from "@/lib/apiBase"
import { RequestStatusBadge, TaskStatusBadge } from "@/components/foia/status-badge"
import { formatDistanceToNow, format } from "date-fns"
import type {
  FoiaRequest,
  FoiaMessage,
  FoiaRequestEvent,
  FoiaTask,
  FoiaAttachment,
  FoiaSubmissionAttempt,
  RequestStatus,
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
  const router = useRouter()
  const searchParams = useSearchParams()
  const autoOpenExternal = searchParams.get("external") === "1"
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

  async function handleStatusChange(toStatus: RequestStatus) {
    const notes = prompt(`Notes for transition to "${toStatus.replace(/_/g, " ")}":`) ?? undefined
    setShowStatusMenu(false)
    setActionLoading(true)
    try {
      await updateRequestStatus(parseInt(requestId, 10), toStatus, "admin", notes || undefined)
      await loadData()
    } catch (err) {
      alert(err instanceof Error ? err.message : "Status change failed")
    } finally {
      setActionLoading(false)
    }
  }

  // AI Draft + Submit buttons removed from this page (drafting/submission is done
  // via the "Generate portal steps" flow + external filing confirmation).

  async function handleRewrite() {
    setActionLoading(true)
    try {
      // Creates a new version as a draft - navigates to the new request
      const { rewriteFoiaRequest } = await import("@/app/actions/foia")
      const result = (await rewriteFoiaRequest(parseInt(requestId, 10), {})) as { id?: number }
      if (result?.id) {
        router.push(`/foia/requests/${result.id}`)
      } else {
        await loadData()
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : "Rewrite failed")
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
                : `${request.city?.name ?? `City #${request.city_id}`} - ${request.dataset_type_id}`}
            </h1>
            <RequestStatusBadge status={request.status} />
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-4 text-sm text-gray-500">
            <span>{request.city?.name ?? `City #${request.city_id}`}</span>
            <span>{request.dataset_type_id}</span>
            {request.department?.name && <span>Dept: {request.department.name}</span>}
            {request.agency_request_number && <span>Ref: {request.agency_request_number}</span>}
            <span>Version {request.request_version}</span>
            <span>Coverage: {request.coverage_start} to {request.coverage_end}</span>
            <span>Format: {request.format_requested}</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* Status transition dropdown */}
          {statusActions.length > 0 && (
            <div className="relative">
              <button
                onClick={() => setShowStatusMenu(!showStatusMenu)}
                disabled={actionLoading}
                className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50"
              >
                Update Status
                <ChevronDown className="h-4 w-4" />
              </button>
              {showStatusMenu && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setShowStatusMenu(false)} />
                  <div className="absolute right-0 top-full z-20 mt-1 min-w-[200px] rounded-lg border border-gray-200 bg-white py-1 shadow-lg">
                    {statusActions.map((action) => (
                      <button
                        key={action.to}
                        onClick={() => handleStatusChange(action.to)}
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

      {/* Quick Info Cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
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

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <div className="flex gap-0">
          {tabs.map((tab) => (
            <button
              key={tab.id}
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
    <div className="flex items-center gap-3 rounded-lg border border-gray-200 bg-white p-4">
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
  tasks,
  submissionAttempts,
  onTaskComplete,
  autoOpenExternalModal,
}: {
  request: FoiaRequest
  tasks: FoiaTask[]
  submissionAttempts: FoiaSubmissionAttempt[]
  onTaskComplete: () => Promise<void>
  autoOpenExternalModal: boolean
}) {
  const [completing, setCompleting] = useState<number | null>(null)
  const [showExternalModal, setShowExternalModal] = useState(false)
  const [externalId, setExternalId] = useState("")
  const [screenshotUri, setScreenshotUri] = useState("")
  const [markingExternal, setMarkingExternal] = useState(false)

  const latestAttempt = submissionAttempts[0]
  const latestSnap = (latestAttempt?.payload_snapshot ?? {}) as Record<string, unknown>
  const snapPortalUrl = typeof latestSnap["portal_url"] === "string" ? (latestSnap["portal_url"] as string) : ""
  const snapEmail =
    typeof latestSnap["requester_email_effective"] === "string"
      ? (latestSnap["requester_email_effective"] as string)
      : ""
  const snapLetterBody = typeof latestSnap["letter_body"] === "string" ? (latestSnap["letter_body"] as string) : ""
  const snapCaseNumber =
    typeof latestSnap["case_or_cad_number"] === "string" ? (latestSnap["case_or_cad_number"] as string) : ""
  const snapPortalFields =
    latestSnap["portal_fields"] && typeof latestSnap["portal_fields"] === "object" ? latestSnap["portal_fields"] : null
  const externalConfirmationId = latestAttempt?.external_confirmation_id ?? ""

  useEffect(() => {
    if (autoOpenExternalModal) {
      setShowExternalModal(true)
    }
  }, [autoOpenExternalModal])

  async function copyText(label: string, text: string) {
    if (!text.trim()) {
      alert(`Nothing to copy for: ${label}`)
      return
    }
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      alert(`Failed to copy: ${label}`)
    }
  }

  async function handleComplete(taskId: number) {
    setCompleting(taskId)
    try {
      await completeFoiaTask(taskId)
      await onTaskComplete()
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to complete task")
    } finally {
      setCompleting(null)
    }
  }

  async function handleMarkExternallyFiled() {
    if (!externalId.trim()) {
      alert("Please enter the portal confirmation number")
      return
    }
    setMarkingExternal(true)
    try {
      await markFoiaExternallyFiled(request.id, {
        external_confirmation_id: externalId.trim(),
        screenshot_uri: screenshotUri.trim() || undefined,
      })
      setShowExternalModal(false)
      setExternalId("")
      setScreenshotUri("")
      await onTaskComplete()
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to mark externally filed")
    } finally {
      setMarkingExternal(false)
    }
  }

  return (
    <>
      <ExternalFiledModal
        open={showExternalModal}
        onClose={() => setShowExternalModal(false)}
        externalId={externalId}
        setExternalId={setExternalId}
        screenshotUri={screenshotUri}
        setScreenshotUri={setScreenshotUri}
        onSave={handleMarkExternallyFiled}
        saving={markingExternal}
      />
      <div className="grid gap-6 lg:grid-cols-2">
      {request.request_description && (
        <div className="rounded-xl border border-gray-200 bg-white p-6 lg:col-span-2">
          <h3 className="text-sm font-semibold text-gray-900">Request Description</h3>
          <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-gray-600">
            {request.request_description}
          </p>
        </div>
      )}

      <div className="rounded-xl border border-gray-200 bg-white p-6">
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

      {latestAttempt && (
        <div className="rounded-xl border border-gray-200 bg-white p-6 lg:col-span-2">
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
            {snapLetterBody && (
              <button
                onClick={() => copyText("letter body", snapLetterBody)}
                className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50"
              >
                Copy letter body
              </button>
            )}
            {snapEmail && (
              <button
                onClick={() => copyText("requester email", snapEmail)}
                className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50"
              >
                Copy requester email
              </button>
            )}
            {snapPortalUrl && (
              <a
                href={snapPortalUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50"
              >
                Open portal
              </a>
            )}
            <button
              onClick={() => setShowExternalModal(true)}
              className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50"
            >
              Mark externally filed
            </button>
          </div>

          {(snapEmail || snapCaseNumber || snapPortalFields || snapLetterBody || externalConfirmationId) && (
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

              {snapLetterBody && (
                <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 lg:col-span-2">
                  <div className="flex items-center justify-between gap-2">
                    <h4 className="text-xs font-semibold text-gray-900">Letter body</h4>
                    <button
                      onClick={() => copyText("letter body", snapLetterBody)}
                      className="rounded-md border border-gray-200 bg-white px-2 py-1 text-[11px] font-medium text-gray-700 hover:bg-gray-50"
                    >
                      Copy
                    </button>
                  </div>
                  <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap rounded-md bg-white p-3 text-[11px] leading-relaxed text-gray-700">
                    {snapLetterBody}
                  </pre>
                </div>
              )}
            </div>
          )}
        </div>
      )}
      <div className="rounded-xl border border-gray-200 bg-white p-6">
        <h3 className="text-sm font-semibold text-gray-900">Details</h3>
        <dl className="mt-3 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <dt className="text-xs text-gray-500">Assigned To</dt>
            <dd className="text-sm text-gray-900">{request.assigned_to || "Unassigned"}</dd>
          </div>
          <div className="flex items-center justify-between">
            <dt className="text-xs text-gray-500">Format</dt>
            <dd className="text-sm text-gray-900">{request.format_requested}</dd>
          </div>
          <div className="flex items-center justify-between">
            <dt className="text-xs text-gray-500">Version</dt>
            <dd className="text-sm text-gray-900">{request.request_version}</dd>
          </div>
          <div className="flex items-center justify-between">
            <dt className="text-xs text-gray-500">Created</dt>
            <dd className="text-sm text-gray-900">
              {format(new Date(request.created_at), "MMM d, yyyy 'at' h:mm a")}
            </dd>
          </div>
          {request.submission_url && (
            <div className="flex items-center justify-between">
              <dt className="text-xs text-gray-500">Submitted via URL</dt>
              <dd className="text-sm text-purple-600">
                <a href={request.submission_url} target="_blank" rel="noopener noreferrer" className="hover:underline">
                  {new URL(request.submission_url).hostname}
                </a>
              </dd>
            </div>
          )}
          {request.submission_email_address && (
            <div className="flex items-center justify-between">
              <dt className="text-xs text-gray-500">Submitted to email</dt>
              <dd className="text-sm text-gray-900">{request.submission_email_address}</dd>
            </div>
          )}
        </dl>
      </div>
      {tasks.length > 0 && (
        <div className="rounded-xl border border-gray-200 bg-white p-6 lg:col-span-2">
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
                      className="rounded-lg bg-emerald-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
                    >
                      {completing === task.id ? "..." : "Complete"}
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
  screenshotUri,
  setScreenshotUri,
  onSave,
  saving,
}: {
  open: boolean
  onClose: () => void
  externalId: string
  setExternalId: (v: string) => void
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
  const [msgForm, setMsgForm] = useState({
    direction: "inbound" as "outbound" | "inbound",
    classification: "follow_up" as string,
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
    channel: "email" as string,
    response_action_required: "none" as string,
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
      setShowCompose(false)
      resetForm()
      await onMessageSent()
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to save interaction")
    } finally {
      setSending(false)
    }
  }

  async function handleCreateTask(msg: FoiaMessage) {
    const action = msg.response_action_required || "general_followup"
    const taskTypeMap: Record<string, string> = {
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
    const taskTitleMap: Record<string, string> = {
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

    const taskType = taskTypeMap[action] || "general_followup"
    const taskTitle = taskTitleMap[action] || "Follow up on interaction"
    const description = [
      msg.subject ? `Subject: ${msg.subject}` : "",
      msg.sender_name ? `Contact: ${msg.sender_name}` : "",
      msg.sender_email ? `Email: ${msg.sender_email}` : "",
      msg.notes ? `Notes: ${msg.notes}` : "",
      msg.email_snippet ? `Snippet: ${msg.email_snippet.slice(0, 200)}...` : "",
    ].filter(Boolean).join("\n")

    setCreatingTask(true)
    try {
      const { createFoiaTask } = await import("@/app/actions/foia")
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
      alert(err instanceof Error ? err.message : "Failed to create task")
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
  }

  return (
    <div className="flex flex-col gap-4">
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
            <div className="grid grid-cols-3 gap-3">
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
                  onChange={(e) => setMsgForm((f) => ({ ...f, channel: e.target.value }))}
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
                    const cls = e.target.value
                    const suggestedAction = classificationToAction[cls] || "none"
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
              <div className="mt-3 grid grid-cols-2 gap-3">
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
                onChange={(e) => setMsgForm((f) => ({ ...f, response_action_required: e.target.value }))}
                className="w-full rounded-lg border border-amber-200 bg-white px-3 py-2 text-sm focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
              >
                {ACTION_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
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
          No interactions logged yet. Click "Log Interaction" to record a follow-up.
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
      alert("Upload failed. Please try again.")
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

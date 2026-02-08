"use client"

import React, { useEffect, useState } from "react"
import Link from "next/link"
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
  Sparkles,
  Loader2,
} from "lucide-react"
import {
  getFoiaRequest,
  listFoiaMessages,
  listFoiaAttachments,
  listFoiaRequestEvents,
  listFoiaTasks,
} from "@/lib/foiaApiClient"
import { RequestStatusBadge, TaskStatusBadge } from "@/components/foia/status-badge"
import { formatDistanceToNow, format } from "date-fns"
import type { FoiaRequest, FoiaMessage, FoiaRequestEvent, FoiaTask, FoiaAttachment } from "@/lib/foia/types"

const tabs = [
  { id: "overview", label: "Overview", icon: FileText },
  { id: "messages", label: "Messages", icon: MessageSquare },
  { id: "attachments", label: "Attachments", icon: Paperclip },
  { id: "events", label: "Timeline", icon: Clock },
] as const

type TabId = (typeof tabs)[number]["id"]

export function RequestDetailContent({ requestId }: { requestId: string }) {
  const [activeTab, setActiveTab] = useState<TabId>("overview")
  const [request, setRequest] = useState<FoiaRequest | null>(null)
  const [messages, setMessages] = useState<FoiaMessage[]>([])
  const [attachments, setAttachments] = useState<FoiaAttachment[]>([])
  const [events, setEvents] = useState<FoiaRequestEvent[]>([])
  const [tasks, setTasks] = useState<FoiaTask[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      try {
        const id = parseInt(requestId, 10)
        const [req, msgs, atts, evts, tsks] = await Promise.all([
          getFoiaRequest(id),
          listFoiaMessages(id),
          listFoiaAttachments(id),
          listFoiaRequestEvents(id),
          listFoiaTasks({ status: undefined }),
        ])
        setRequest(req)
        setMessages(msgs)
        setAttachments(atts)
        setEvents(evts)
        setTasks(tsks.filter((t) => t.request_id === id))
      } catch (err) {
        console.error("Failed to load request detail:", err)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [requestId])

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
              {request.city?.name ?? `City #${request.city_id}`} - {request.dataset_type_id}
            </h1>
            <RequestStatusBadge status={request.status} />
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-4 text-sm text-gray-500">
            {request.agency_request_number && <span>Ref: {request.agency_request_number}</span>}
            <span>Version {request.request_version}</span>
            <span>Coverage: {request.coverage_start} to {request.coverage_end}</span>
            <span>Format: {request.format_requested}</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50">
            <Sparkles className="h-4 w-4 text-purple-600" />
            AI Draft
          </button>
          {request.status === "draft" && (
            <button className="flex items-center gap-2 rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-purple-700">
              <Send className="h-4 w-4" />
              Submit
            </button>
          )}
          {request.status === "clarification_requested" && (
            <button className="flex items-center gap-2 rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-purple-700">
              <RefreshCw className="h-4 w-4" />
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
      {activeTab === "overview" && <OverviewTab request={request} tasks={tasks} />}
      {activeTab === "messages" && <MessagesTab messages={messages} />}
      {activeTab === "attachments" && <AttachmentsTab attachments={attachments} />}
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

function OverviewTab({ request, tasks }: { request: FoiaRequest; tasks: FoiaTask[] }) {
  return (
    <div className="grid gap-6 lg:grid-cols-2">
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
                <TaskStatusBadge status={task.status} />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function MessagesTab({ messages }: { messages: FoiaMessage[] }) {
  if (messages.length === 0) {
    return (
      <div className="py-12 text-center text-sm text-gray-400">
        No messages for this request yet.
      </div>
    )
  }
  return (
    <div className="flex flex-col gap-4">
      {messages.map((msg) => (
        <div
          key={msg.id}
          className={`rounded-xl border border-gray-200 p-5 ${
            msg.direction === "outbound" ? "bg-purple-50/50 ml-8" : "bg-white mr-8"
          }`}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span
                className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                  msg.direction === "outbound"
                    ? "bg-purple-100 text-purple-700"
                    : "bg-gray-100 text-gray-600"
                }`}
              >
                {msg.direction === "outbound" ? "Sent" : "Received"}
              </span>
              {msg.classification && (
                <span className="rounded-full border border-gray-200 px-2 py-0.5 text-xs text-gray-500">
                  {msg.classification.replace("_", " ")}
                </span>
              )}
            </div>
            <span className="text-xs text-gray-400">
              {msg.sent_at ? format(new Date(msg.sent_at), "MMM d, yyyy 'at' h:mm a") : "Draft"}
            </span>
          </div>
          <h4 className="mt-2 text-sm font-medium text-gray-900">{msg.subject}</h4>
          <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-gray-600">{msg.body}</p>
          {msg.sender && (
            <p className="mt-3 text-xs text-gray-400">
              From: {msg.sender} {msg.recipient ? `To: ${msg.recipient}` : ""}
            </p>
          )}
        </div>
      ))}
    </div>
  )
}

function AttachmentsTab({ attachments }: { attachments: FoiaAttachment[] }) {
  if (attachments.length === 0) {
    return (
      <div className="py-12 text-center text-sm text-gray-400">
        No attachments for this request yet.
      </div>
    )
  }

  function formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  return (
    <div className="flex flex-col gap-3">
      {attachments.map((att) => (
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
              href={att.uri}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-50"
            >
              Download
            </a>
          )}
        </div>
      ))}
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

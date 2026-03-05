"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import {
  Plus, Search, Filter, Loader2, AlertTriangle, Pencil, Copy, ExternalLink, Mail,
  FileText, Clock, CheckCircle2, MessageSquare, Database, RefreshCw,
} from "lucide-react"
import { useAuth0 } from "@auth0/auth0-react"
import { getFoiaDashboard, listFoiaRequests } from "@/lib/foiaApiClient"
import { RequestStatusBadge } from "@/components/foia/status-badge"
import { NewRequestModal } from "@/components/foia/new-request-modal"
import { datasetLabel } from "@/lib/foia/datasetLabels"
import type { RequestStatus, FoiaRequest, FoiaDashboardSummary } from "@/lib/foia/types"
import { formatDistanceToNow, differenceInDays } from "date-fns"

const statusOptions: { value: RequestStatus | "all"; label: string }[] = [
  { value: "all", label: "All Statuses" },
  { value: "draft", label: "Draft" },
  { value: "submitted", label: "Submitted" },
  { value: "submitted_unacknowledged", label: "Unacknowledged" },
  { value: "acknowledged", label: "Acknowledged" },
  { value: "clarification_requested", label: "Clarification" },
  { value: "partially_fulfilled", label: "Partial" },
  { value: "fee_requested", label: "Fee Requested" },
  { value: "fulfilled", label: "Fulfilled" },
  { value: "denied", label: "Denied" },
  { value: "closed_incomplete", label: "Closed" },
]

function PipelineSummary({ summary }: { summary: FoiaDashboardSummary | null }) {
  if (!summary) return null
  const pills: { label: string; value: number; color: string; href?: string }[] = [
    { label: "Open", value: summary.open_requests, color: "text-purple-700 bg-purple-50", href: "/foia/requests" },
    { label: "Unacknowledged", value: summary.unacknowledged, color: "text-amber-700 bg-amber-50", href: "/foia/requests?status=submitted_unacknowledged" },
    { label: "Overdue", value: summary.overdue_requests, color: "text-red-700 bg-red-50", href: "/foia/requests?overdue=true" },
    { label: "Tasks Due", value: summary.tasks_due, color: "text-purple-700 bg-purple-50", href: "/foia/messages" },
    { label: "Messages", value: summary.messages_to_respond ?? 0, color: "text-blue-700 bg-blue-50", href: "/foia/messages" },
    { label: "Data to Review", value: summary.pending_data_review ?? 0, color: "text-emerald-700 bg-emerald-50", href: "/foia/data-review" },
  ]

  return (
    <div className="flex flex-wrap items-center gap-2">
      {pills.map((p) => {
        const inner = (
          <span
            key={p.label}
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ${p.color} ${p.value === 0 ? "opacity-50" : ""}`}
          >
            <span className="text-sm font-semibold">{p.value}</span>
            {p.label}
          </span>
        )
        return p.href && p.value > 0 ? (
          <Link key={p.label} href={p.href}>{inner}</Link>
        ) : (
          <span key={p.label}>{inner}</span>
        )
      })}
    </div>
  )
}

export function RequestsListContent() {
  const { getAccessTokenSilently, isAuthenticated } = useAuth0()
  const [requests, setRequests] = useState<FoiaRequest[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState<RequestStatus | "all">("all")
  const [showNewRequest, setShowNewRequest] = useState(false)
  const [apiError, setApiError] = useState<string | null>(null)
  const [summary, setSummary] = useState<FoiaDashboardSummary | null>(null)
  const [page, setPage] = useState(1)
  const [sortField, setSortField] = useState<"city" | "status" | "deadline" | "days_open">("deadline")
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc")

  const loadRequests = useCallback(async () => {
    setLoading(true)
    setApiError(null)
    let token: string | undefined
    if (isAuthenticated) {
      try {
        token = await getAccessTokenSilently()
      } catch {
        // continue without token
      }
    }
    try {
      const [res, dash] = await Promise.all([
        listFoiaRequests(
          {
            status: statusFilter === "all" ? undefined : statusFilter,
            q: search || undefined,
            page_size: 25,
            page,
          },
          token
        ),
        getFoiaDashboard(token).catch(() => null),
      ])
      setRequests(res.items)
      setTotal(res.total)
      setSummary(dash)
    } catch (err) {
      console.error("Failed to load requests:", err)
      setApiError(err instanceof Error ? err.message : "Failed to load requests")
      setRequests([])
      setTotal(0)
    } finally {
      setLoading(false)
    }
  }, [statusFilter, search, page, isAuthenticated, getAccessTokenSilently])

  useEffect(() => {
    loadRequests()
  }, [loadRequests])

  const openCount = requests.filter(
    (r) => !["fulfilled", "denied", "closed_incomplete"].includes(r.status)
  ).length

  const totalPages = Math.max(1, Math.ceil(total / 25))

  function toggleSort(field: typeof sortField) {
    if (sortField === field) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"))
    } else {
      setSortField(field)
      setSortDir("asc")
    }
  }

  const sortIndicator = (field: typeof sortField) =>
    sortField === field ? (sortDir === "asc" ? " ▲" : " ▼") : ""

  const sortedRequests = useMemo(() => {
    const sorted = [...requests]
    sorted.sort((a, b) => {
      let cmp = 0
      switch (sortField) {
        case "city":
          cmp = (a.city?.name ?? "").localeCompare(b.city?.name ?? "")
          break
        case "status":
          cmp = a.status.localeCompare(b.status)
          break
        case "deadline": {
          const aD = a.deadline_at ? new Date(a.deadline_at).getTime() : Number.MAX_SAFE_INTEGER
          const bD = b.deadline_at ? new Date(b.deadline_at).getTime() : Number.MAX_SAFE_INTEGER
          cmp = aD - bD
          break
        }
        case "days_open": {
          const aO = differenceInDays(new Date(), new Date(a.created_at))
          const bO = differenceInDays(new Date(), new Date(b.created_at))
          cmp = aO - bO
          break
        }
      }
      return sortDir === "asc" ? cmp : -cmp
    })
    return sorted
  }, [requests, sortField, sortDir])

  return (
    <div className="flex flex-col gap-6">
      {apiError && (
        <div
          className="flex items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800"
          role="alert"
        >
          <AlertTriangle className="h-5 w-5 shrink-0" />
          <div>
            <p className="font-medium">Could not load requests</p>
            <p className="mt-0.5 text-amber-700">{apiError}</p>
            <p className="mt-1 text-xs text-amber-600">
              Ensure the backend is running and <code className="rounded bg-amber-100 px-1">NEXT_PUBLIC_API_BASE_URL</code>{" "}
              matches (e.g. <code className="rounded bg-amber-100 px-1">http://localhost:8001</code>). Sign in if the API requires authentication.
            </p>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Requests</h1>
          <p className="mt-1 text-sm text-gray-500">
            {total} total requests, {openCount} open
          </p>
        </div>
        <button
          onClick={() => setShowNewRequest(true)}
          className="flex items-center gap-2 rounded-lg bg-purple-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-purple-700"
        >
          <Plus className="h-4 w-4" />
          New Request
        </button>
      </div>

      {/* Pipeline summary */}
      <PipelineSummary summary={summary} />

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[240px] max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search by city, dataset, or request number..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1) }}
            className="h-10 w-full rounded-lg border border-gray-200 bg-white pl-10 pr-4 text-sm text-gray-900 placeholder:text-gray-400 focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
          />
        </div>
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-gray-400" />
          <select
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value as RequestStatus | "all"); setPage(1) }}
            className="h-10 rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-700 focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
          >
            {statusOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-purple-600" />
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th
                  className="cursor-pointer select-none px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 hover:text-gray-900"
                  onClick={() => toggleSort("city")}
                >
                  City / Dataset{sortIndicator("city")}
                </th>
                <th
                  className="cursor-pointer select-none px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 hover:text-gray-900"
                  onClick={() => toggleSort("status")}
                >
                  Status{sortIndicator("status")}
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                  Submit to
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                  Coverage
                </th>
                <th
                  className="cursor-pointer select-none px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 hover:text-gray-900"
                  onClick={() => toggleSort("days_open")}
                >
                  Days Open{sortIndicator("days_open")}
                </th>
                <th
                  className="cursor-pointer select-none px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 hover:text-gray-900"
                  onClick={() => toggleSort("deadline")}
                >
                  Deadline{sortIndicator("deadline")}
                </th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {sortedRequests.map((req) => {
                const daysOpen = differenceInDays(new Date(), new Date(req.created_at))
                const isOverdue =
                  req.deadline_at &&
                  new Date(req.deadline_at) < new Date() &&
                  !["fulfilled", "denied", "closed_incomplete"].includes(req.status)
                return (
                  <tr key={req.id} className={`transition-colors ${isOverdue ? "bg-red-50 dark:bg-red-950/20 hover:bg-red-100" : "hover:bg-gray-50"}`}>
                    <td className="px-6 py-4">
                      <Link href={`/foia/requests/${req.id}`} className="block">
                        <p className="text-sm font-medium text-gray-900 hover:text-purple-600">
                          {req.city?.name ?? "Unknown city"}
                        </p>
                        <p className="text-xs text-gray-500">{datasetLabel(req.dataset_type_id)}</p>
                        {req.department?.name && (
                          <p className="mt-0.5 text-xs text-gray-400">
                            Dept: {req.department.name}
                          </p>
                        )}
                        {req.agency_request_number && (
                          <p className="mt-0.5 text-xs text-gray-400">
                            #{req.agency_request_number}
                          </p>
                        )}
                      </Link>
                    </td>
                    <td className="px-4 py-4">
                      <RequestStatusBadge status={req.status} />
                    </td>
                    <td className="px-4 py-4">
                      <SubmitToCell request={req} />
                    </td>
                    <td className="px-4 py-4 text-sm text-gray-500">
                      {req.coverage_start} to {req.coverage_end}
                    </td>
                    <td className="px-4 py-4 text-sm text-gray-500">{daysOpen}d</td>
                    <td className="px-4 py-4">
                      {req.deadline_at ? (
                        <span className={`text-sm ${isOverdue ? "font-medium text-red-600" : "text-gray-500"}`}>
                          {formatDistanceToNow(new Date(req.deadline_at), { addSuffix: true })}
                        </span>
                      ) : (
                        <span className="text-sm text-gray-300">-</span>
                      )}
                    </td>
                    <td className="px-4 py-4 text-right">
                      <Link
                        href={`/foia/requests/${req.id}?edit=1`}
                        onClick={(e) => e.stopPropagation()}
                        className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
                        title={req.status === "draft" ? "Edit request" : "Edit submission email/URL + confirmation number"}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                        Edit
                      </Link>
                    </td>
                  </tr>
                )
              })}
              {sortedRequests.length === 0 && !loading && (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center text-sm text-gray-400">
                    {apiError ? "Requests could not be loaded. Check the message above." : "No requests match your filters."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {!loading && total > 25 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-500">
            Page {page} of {totalPages} ({total} total)
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              Previous
            </button>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              Next
            </button>
          </div>
        </div>
      )}

      <NewRequestModal open={showNewRequest} onClose={() => setShowNewRequest(false)} />
    </div>
  )
}

function SubmitToCell({ request }: { request: FoiaRequest }) {
  const [copied, setCopied] = useState<string | null>(null)

  async function handleCopy(label: string, text: string) {
    if (!text) return
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
    setCopied(label)
    setTimeout(() => setCopied(null), 1500)
  }

  const email = request.submission_email_address
  const url = request.submission_url
  const deptEmail = request.department?.contact_email

  if (!email && !url && !deptEmail) {
    return <span className="text-xs text-gray-300">-</span>
  }

  let hostname = ""
  if (url) {
    try {
      hostname = new URL(url).hostname
    } catch {
      hostname = url
    }
  }

  return (
    <div className="flex flex-col gap-1.5" onClick={(e) => e.stopPropagation()}>
      {url && (
        <div className="flex items-center gap-1.5">
          <ExternalLink className="h-3 w-3 shrink-0 text-gray-400" />
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="truncate text-xs text-purple-600 hover:underline"
            title={url}
          >
            {hostname}
          </a>
          <button
            type="button"
            onClick={() => handleCopy("url", url)}
            className="shrink-0 rounded p-0.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
            title="Copy URL"
          >
            <Copy className="h-3 w-3" />
          </button>
          {copied === "url" && <span className="text-[10px] text-emerald-600">Copied</span>}
        </div>
      )}
      {email && (
        <div className="flex items-center gap-1.5">
          <Mail className="h-3 w-3 shrink-0 text-gray-400" />
          <span className="truncate text-xs text-gray-600" title={email}>
            {email}
          </span>
          <button
            type="button"
            onClick={() => handleCopy("email", email)}
            className="shrink-0 rounded p-0.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
            title="Copy email"
          >
            <Copy className="h-3 w-3" />
          </button>
          {copied === "email" && <span className="text-[10px] text-emerald-600">Copied</span>}
        </div>
      )}
      {deptEmail && deptEmail !== email && (
        <div className="flex items-center gap-1.5">
          <Mail className="h-3 w-3 shrink-0 text-gray-400" />
          <span className="truncate text-xs text-gray-500" title={`Dept: ${deptEmail}`}>
            {deptEmail}
          </span>
          <button
            type="button"
            onClick={() => handleCopy("deptEmail", deptEmail)}
            className="shrink-0 rounded p-0.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
            title="Copy department email"
          >
            <Copy className="h-3 w-3" />
          </button>
          {copied === "deptEmail" && <span className="text-[10px] text-emerald-600">Copied</span>}
        </div>
      )}
    </div>
  )
}

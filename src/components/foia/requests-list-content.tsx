"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Plus, Search, Filter, Loader2 } from "lucide-react"
import { listFoiaRequests } from "@/lib/foiaApiClient"
import { RequestStatusBadge } from "@/components/foia/status-badge"
import { NewRequestModal } from "@/components/foia/new-request-modal"
import type { RequestStatus, FoiaRequest } from "@/lib/foia/types"
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

export function RequestsListContent() {
  const [requests, setRequests] = useState<FoiaRequest[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState<RequestStatus | "all">("all")
  const [showNewRequest, setShowNewRequest] = useState(false)

  useEffect(() => {
    async function load() {
      setLoading(true)
      try {
        const res = await listFoiaRequests({
          status: statusFilter === "all" ? undefined : statusFilter,
          q: search || undefined,
          page_size: 100,
        })
        setRequests(res.items)
        setTotal(res.total)
      } catch (err) {
        console.error("Failed to load requests:", err)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [statusFilter, search])

  const openCount = requests.filter(
    (r) => !["fulfilled", "denied", "closed_incomplete"].includes(r.status)
  ).length

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Requests</h1>
          <p className="mt-1 text-sm text-gray-500">
            {total} total requests - {openCount} open
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

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[240px] max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search by city, dataset, or request number..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-10 w-full rounded-lg border border-gray-200 bg-white pl-10 pr-4 text-sm text-gray-900 placeholder:text-gray-400 focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
          />
        </div>
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-gray-400" />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as RequestStatus | "all")}
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
                <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                  City / Dataset
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                  Status
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                  Coverage
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                  Days Open
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                  Deadline
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                  Owner
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {requests.map((req) => {
                const daysOpen = differenceInDays(new Date(), new Date(req.created_at))
                const isOverdue =
                  req.deadline_at &&
                  new Date(req.deadline_at) < new Date() &&
                  !["fulfilled", "denied", "closed_incomplete"].includes(req.status)
                return (
                  <tr key={req.id} className="transition-colors hover:bg-gray-50">
                    <td className="px-6 py-4">
                      <Link href={`/foia/requests/${req.id}`} className="block">
                        <p className="text-sm font-medium text-gray-900 hover:text-purple-600">
                          {req.city?.name ?? `City #${req.city_id}`}
                        </p>
                        <p className="text-xs text-gray-500">{req.dataset_type_id}</p>
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
                    <td className="px-4 py-4 text-sm text-gray-500">
                      {req.assigned_to || <span className="text-gray-300">Unassigned</span>}
                    </td>
                  </tr>
                )
              })}
              {requests.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-sm text-gray-400">
                    No requests match your filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      <NewRequestModal open={showNewRequest} onClose={() => setShowNewRequest(false)} />
    </div>
  )
}

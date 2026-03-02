"use client"

import React, { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import {
  FileText,
  AlertTriangle,
  Clock,
  CheckCircle2,
  TrendingUp,
  ArrowRight,
  Loader2,
  Plus,
  MessageSquare,
  Database,
  RefreshCw,
} from "lucide-react"
import { useAuth0 } from "@auth0/auth0-react"
import { getFoiaDashboard, listFoiaRequests, listFoiaTasks } from "@/lib/foiaApiClient"
import { API_BASE } from "@/lib/apiBase"
import { RequestStatusBadge, TaskStatusBadge } from "@/components/foia/status-badge"
import { NewRequestModal } from "@/components/foia/new-request-modal"
import { formatDistanceToNow } from "date-fns"
import type { FoiaDashboardSummary, FoiaRequest, FoiaTask } from "@/lib/foia/types"

const DEFAULT_SUMMARY: FoiaDashboardSummary = {
  total_requests: 0,
  open_requests: 0,
  unacknowledged: 0,
  messages_to_respond: 0,
  pending_data_review: 0,
  incomplete_deliveries: 0,
  awaiting_review: 0,
  tasks_due: 0,
  overdue_requests: 0,
  completeness_by_city: [],
}

function KpiCard({
  label,
  value,
  icon: Icon,
  href,
  accent,
}: {
  label: string
  value: number | string
  icon: React.ComponentType<{ className?: string }>
  href?: string
  accent?: "primary" | "warning" | "destructive" | "success"
}) {
  const accentMap = {
    primary: "text-purple-600",
    warning: "text-amber-600",
    destructive: "text-red-600",
    success: "text-emerald-600",
  }
  const bgMap = {
    primary: "bg-purple-50",
    warning: "bg-amber-50",
    destructive: "bg-red-50",
    success: "bg-emerald-50",
  }
  const color = accent ? accentMap[accent] : "text-purple-600"
  const bg = accent ? bgMap[accent] : "bg-purple-50"

  const inner = (
    <div className="flex items-center gap-4 rounded-xl border border-gray-200 bg-white p-5 transition-shadow hover:shadow-sm">
      <div className={`flex h-11 w-11 items-center justify-center rounded-lg ${bg}`}>
        <Icon className={`h-5 w-5 ${color}`} />
      </div>
      <div>
        <p className="text-2xl font-semibold text-gray-900">{value}</p>
        <p className="text-sm text-gray-500">{label}</p>
      </div>
    </div>
  )

  return href ? <Link href={href}>{inner}</Link> : inner
}

export function DashboardContent() {
  const { getAccessTokenSilently, isAuthenticated } = useAuth0()
  const [summary, setSummary] = useState<FoiaDashboardSummary | null>(null)
  const [recentRequests, setRecentRequests] = useState<FoiaRequest[]>([])
  const [pendingTasks, setPendingTasks] = useState<FoiaTask[]>([])
  const [loading, setLoading] = useState(true)
  const [showNewRequest, setShowNewRequest] = useState(false)
  const [apiError, setApiError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setApiError(null)
    let token: string | undefined
    if (isAuthenticated) {
      try {
        token = await getAccessTokenSilently()
      } catch {
        // Not logged in or token failed; continue without token (backend may use DEV_MODE)
      }
    }
    try {
      const [dash, reqData, taskData] = await Promise.all([
        getFoiaDashboard(token),
        listFoiaRequests({ page_size: 5 }, token),
        listFoiaTasks({ status: "pending" }, token),
      ])
      setSummary(dash)
      setRecentRequests(reqData.items.slice(0, 5))
      setPendingTasks(taskData.slice(0, 5))
    } catch (err) {
      console.error("Failed to load FOIA dashboard:", err)
      const message = err instanceof Error ? err.message : "Failed to load dashboard"
      setApiError(message)
      setSummary(DEFAULT_SUMMARY)
      setRecentRequests([])
      setPendingTasks([])
    } finally {
      setLoading(false)
    }
  }, [isAuthenticated, getAccessTokenSilently])

  useEffect(() => {
    load()
  }, [load])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-purple-600" />
      </div>
    )
  }

  const displaySummary = summary ?? DEFAULT_SUMMARY

  return (
    <div className="flex flex-col gap-8">
      {apiError && (
        <div
          className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800"
          role="alert"
        >
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="font-medium">Could not load dashboard data</p>
            <p className="mt-0.5 text-amber-700">{apiError}</p>
            <p className="mt-1 text-xs text-amber-600">
              Requests are being sent to: <code className="rounded bg-amber-100 px-1 break-all">{API_BASE}</code>
              . Ensure the backend is running there (or set{" "}
              <code className="rounded bg-amber-100 px-1">NEXT_PUBLIC_API_BASE_URL</code> to match
              your backend, e.g. <code className="rounded bg-amber-100 px-1">http://localhost:8001</code>
              ) and you are signed in if the API requires authentication.
            </p>
            <button
              type="button"
              onClick={() => load()}
              className="mt-3 flex items-center gap-1.5 rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs font-medium text-amber-800 hover:bg-amber-100"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Retry
            </button>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">FOIA Dashboard</h1>
          <p className="mt-1 text-sm text-gray-500">
            Public records request overview and key metrics
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

      {/* Workflow: Request pipeline */}
      <div>
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500">
          Request pipeline
        </h2>
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <KpiCard
            label="Open Requests"
            value={displaySummary.open_requests}
            icon={FileText}
            href="/foia/requests"
            accent="primary"
          />
          <KpiCard
            label="Unacknowledged"
            value={displaySummary.unacknowledged}
            icon={AlertTriangle}
            href="/foia/requests?status=submitted_unacknowledged"
            accent="warning"
          />
          <KpiCard
            label="Overdue"
            value={displaySummary.overdue_requests}
            icon={Clock}
            href="/foia/requests?overdue=true"
            accent="destructive"
          />
          <KpiCard
            label="Tasks Due"
            value={displaySummary.tasks_due}
            icon={CheckCircle2}
            href="/foia/messages"
            accent="primary"
          />
        </div>
      </div>

      {/* Workflow: Action needed */}
      <div>
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500">
          Action needed
        </h2>
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <KpiCard
            label="Messages to Respond To"
            value={displaySummary.messages_to_respond ?? 0}
            icon={MessageSquare}
            href="/foia/messages"
            accent={displaySummary.messages_to_respond ? "warning" : undefined}
          />
          <KpiCard
            label="Data to Review"
            value={displaySummary.pending_data_review ?? 0}
            icon={Database}
            href="/foia/data-review"
            accent={displaySummary.pending_data_review ? "warning" : undefined}
          />
          <KpiCard
            label="Incomplete Deliveries"
            value={displaySummary.incomplete_deliveries ?? 0}
            icon={RefreshCw}
            href="/foia/data-review"
            accent={displaySummary.incomplete_deliveries ? "warning" : undefined}
          />
        </div>
      </div>

      {/* Completeness by City */}
      {(displaySummary.completeness_by_city?.length ?? 0) > 0 && (
        <div className="rounded-xl border border-gray-200 bg-white">
          <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-purple-600" />
              <h2 className="text-sm font-semibold text-gray-900">Data Completeness by City</h2>
            </div>
            <Link
              href="/foia/cities"
              className="flex items-center gap-1 text-xs font-medium text-purple-600 hover:underline"
            >
              View all <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          <div className="divide-y divide-gray-100">
            {displaySummary.completeness_by_city!.map((snap) => (
              <div key={snap.city_id} className="flex items-center gap-6 px-6 py-4">
                <div className="min-w-[140px]">
                  <Link
                    href={`/foia/cities/${snap.city_id}`}
                    className="font-medium text-gray-900 hover:text-purple-600"
                  >
                    {snap.city?.name
                      ? `${snap.city.name}${snap.city.state ? `, ${snap.city.state}` : ""}`
                      : `City #${snap.city_id}`}
                  </Link>
                  <p className="text-xs text-gray-500">
                    {snap.fulfilled_targets}/{snap.total_targets} targets fulfilled
                  </p>
                </div>
                <div className="flex flex-1 items-center gap-3">
                  <div className="flex-1">
                    <div className="h-2.5 overflow-hidden rounded-full bg-gray-100">
                      <div
                        className="h-full rounded-full bg-purple-600 transition-all"
                        style={{ width: `${snap.completeness_pct}%` }}
                      />
                    </div>
                  </div>
                  <span className="min-w-[40px] text-right text-sm font-semibold text-gray-900">
                    {snap.completeness_pct}%
                  </span>
                </div>
                <span className="text-xs text-gray-500">
                  Potential: {snap.potential_completeness_pct}%
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Two columns: Recent Requests + Pending Tasks */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Recent Requests */}
        <div className="rounded-xl border border-gray-200 bg-white">
          <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
            <h2 className="text-sm font-semibold text-gray-900">Recent Requests</h2>
            <Link
              href="/foia/requests"
              className="flex items-center gap-1 text-xs font-medium text-purple-600 hover:underline"
            >
              View all <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          <div className="divide-y divide-gray-100">
            {recentRequests.map((req) => (
              <Link
                key={req.id}
                href={`/foia/requests/${req.id}`}
                className="flex items-center gap-4 px-6 py-3.5 transition-colors hover:bg-gray-50"
              >
                <div className="flex-1 min-w-0">
                  <p className="truncate text-sm font-medium text-gray-900">
                    {req.city?.name ?? `City #${req.city_id}`} - {req.dataset_type_id}
                  </p>
                  <p className="text-xs text-gray-500">
                    {req.coverage_start} to {req.coverage_end}
                  </p>
                </div>
                <RequestStatusBadge status={req.status} />
              </Link>
            ))}
            {recentRequests.length === 0 && (
              <p className="px-6 py-8 text-center text-sm text-gray-400">No requests yet</p>
            )}
          </div>
        </div>

        {/* Pending Tasks */}
        <div className="rounded-xl border border-gray-200 bg-white">
          <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
            <h2 className="text-sm font-semibold text-gray-900">Pending Tasks</h2>
            <Link
              href="/foia/messages"
              className="flex items-center gap-1 text-xs font-medium text-purple-600 hover:underline"
            >
              View all <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          <div className="divide-y divide-gray-100">
            {pendingTasks.map((task) => (
              <div key={task.id} className="flex items-center gap-4 px-6 py-3.5">
                <div className="flex-1 min-w-0">
                  <p className="truncate text-sm font-medium text-gray-900">{task.title}</p>
                  <p className="text-xs text-gray-500">
                    {task.assigned_to ? `Assigned to ${task.assigned_to}` : "Unassigned"}
                    {task.due_at &&
                      ` - Due ${formatDistanceToNow(new Date(task.due_at), { addSuffix: true })}`}
                  </p>
                </div>
                <TaskStatusBadge status={task.status} />
              </div>
            ))}
            {pendingTasks.length === 0 && (
              <p className="px-6 py-8 text-center text-sm text-gray-400">No pending tasks</p>
            )}
          </div>
        </div>
      </div>

      <NewRequestModal open={showNewRequest} onClose={() => setShowNewRequest(false)} />
    </div>
  )
}

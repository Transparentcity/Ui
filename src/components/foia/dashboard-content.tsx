"use client"

import React, { useEffect, useState } from "react"
import Link from "next/link"
import {
  FileText,
  AlertTriangle,
  Clock,
  CheckCircle2,
  TrendingUp,
  ArrowRight,
  Loader2,
} from "lucide-react"
import { getFoiaDashboard, listFoiaRequests, listFoiaTasks } from "@/lib/foiaApiClient"
import { RequestStatusBadge, TaskStatusBadge } from "@/components/foia/status-badge"
import { formatDistanceToNow } from "date-fns"
import type { FoiaDashboardSummary, FoiaRequest, FoiaTask } from "@/lib/foia/types"

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
  const [summary, setSummary] = useState<FoiaDashboardSummary | null>(null)
  const [recentRequests, setRecentRequests] = useState<FoiaRequest[]>([])
  const [pendingTasks, setPendingTasks] = useState<FoiaTask[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      try {
        const [dash, reqData, taskData] = await Promise.all([
          getFoiaDashboard(),
          listFoiaRequests({ page_size: 5 }),
          listFoiaTasks({ status: "pending" }),
        ])
        setSummary(dash)
        setRecentRequests(reqData.items.slice(0, 5))
        setPendingTasks(taskData.slice(0, 5))
      } catch (err) {
        console.error("Failed to load FOIA dashboard:", err)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-purple-600" />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">FOIA Dashboard</h1>
        <p className="mt-1 text-sm text-gray-500">
          Public records request overview and key metrics
        </p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiCard
          label="Open Requests"
          value={summary?.open_requests ?? 0}
          icon={FileText}
          href="/foia/requests"
          accent="primary"
        />
        <KpiCard
          label="Unacknowledged"
          value={summary?.unacknowledged ?? 0}
          icon={AlertTriangle}
          href="/foia/requests?status=submitted_unacknowledged"
          accent="warning"
        />
        <KpiCard
          label="Overdue"
          value={summary?.overdue_requests ?? 0}
          icon={Clock}
          href="/foia/requests?overdue=true"
          accent="destructive"
        />
        <KpiCard
          label="Tasks Due"
          value={summary?.tasks_due ?? 0}
          icon={CheckCircle2}
          href="/foia/tasks"
          accent="primary"
        />
      </div>

      {/* Completeness by City */}
      {(summary?.completeness_by_city?.length ?? 0) > 0 && (
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
            {summary!.completeness_by_city.map((snap) => (
              <div key={snap.city_id} className="flex items-center gap-6 px-6 py-4">
                <div className="min-w-[140px]">
                  <Link
                    href={`/foia/cities/${snap.city_id}`}
                    className="font-medium text-gray-900 hover:text-purple-600"
                  >
                    City #{snap.city_id}
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
              href="/foia/tasks"
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
    </div>
  )
}

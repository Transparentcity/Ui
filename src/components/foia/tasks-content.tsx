"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { Loader2, Plus, X, CheckCircle2, AlertTriangle, Trash2 } from "lucide-react"
import { useAuth0 } from "@auth0/auth0-react"
import { deleteFoiaTask, listFoiaTasks } from "@/lib/foiaApiClient"
import { assignFoiaTask, completeFoiaTask, createFoiaTask } from "@/app/actions/foia"
import { TaskStatusBadge } from "@/components/foia/status-badge"
import type { FoiaTask, TaskStatus, TaskType } from "@/lib/foia/types"
import { formatDistanceToNow } from "date-fns"

const statusOptions: { value: TaskStatus | "all"; label: string }[] = [
  { value: "all", label: "All" },
  { value: "pending", label: "Pending" },
  { value: "assigned", label: "Assigned" },
  { value: "in_progress", label: "In Progress" },
  { value: "completed", label: "Completed" },
  { value: "cancelled", label: "Cancelled" },
]

const TASK_TYPES: { value: TaskType; label: string }[] = [
  { value: "review_rewrite", label: "Review Rewrite" },
  { value: "approve_follow_up", label: "Approve Follow-up" },
  { value: "portal_submission", label: "Portal Submission" },
  { value: "review_data_completeness", label: "Review Data Completeness" },
  { value: "mapping_needed", label: "Mapping Needed" },
  { value: "review_delivery", label: "Review Delivery" },
]

export function TasksContent() {
  const { getAccessTokenSilently, isAuthenticated } = useAuth0()
  const [tasks, setTasks] = useState<FoiaTask[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<TaskStatus | "all">("all")
  const [showNewTask, setShowNewTask] = useState(false)
  const [actionLoading, setActionLoading] = useState<number | null>(null)
  const [deletingId, setDeletingId] = useState<number | null>(null)
  const [apiError, setApiError] = useState<string | null>(null)

  const [newTask, setNewTask] = useState({
    type: "review_delivery" as TaskType,
    title: "",
    description: "",
    assigned_to: "",
  })
  const [creating, setCreating] = useState(false)

  const load = useCallback(async () => {
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
      const data = await listFoiaTasks(
        { status: filter === "all" ? undefined : filter },
        token
      )
      setTasks(data)
    } catch (err) {
      console.error("Failed to load tasks:", err)
      setApiError(err instanceof Error ? err.message : "Failed to load tasks")
      setTasks([])
    } finally {
      setLoading(false)
    }
  }, [filter, isAuthenticated, getAccessTokenSilently])

  useEffect(() => {
    load()
  }, [load])

  async function handleComplete(taskId: number) {
    setActionLoading(taskId)
    try {
      await completeFoiaTask(taskId)
      await load()
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to complete task")
    } finally {
      setActionLoading(null)
    }
  }

  async function handleAssign(taskId: number) {
    const assignee = prompt("Assign to (username):")
    if (!assignee) return
    setActionLoading(taskId)
    try {
      await assignFoiaTask(taskId, assignee)
      await load()
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to assign task")
    } finally {
      setActionLoading(null)
    }
  }

  async function handleCreateTask(e: React.FormEvent) {
    e.preventDefault()
    if (!newTask.title.trim()) return
    setCreating(true)
    try {
      await createFoiaTask({
        type: newTask.type,
        title: newTask.title,
        description: newTask.description || undefined,
        assigned_to: newTask.assigned_to || undefined,
      })
      setShowNewTask(false)
      setNewTask({ type: "review_delivery", title: "", description: "", assigned_to: "" })
      await load()
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to create task")
    } finally {
      setCreating(false)
    }
  }

  async function handleDelete(taskId: number) {
    const ok = confirm("Delete this follow-up/task? This cannot be undone.")
    if (!ok) return

    setDeletingId(taskId)
    let token: string | undefined
    if (isAuthenticated) {
      try {
        token = await getAccessTokenSilently()
      } catch {
        // continue without token
      }
    }
    try {
      await deleteFoiaTask(taskId, token)
      await load()
    } catch (err) {
      alert(err instanceof Error ? err.message : "Delete failed")
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {apiError && (
        <div
          className="flex items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800"
          role="alert"
        >
          <AlertTriangle className="h-5 w-5 shrink-0" />
          <div>
            <p className="font-medium">Could not load tasks</p>
            <p className="mt-0.5 text-amber-700">{apiError}</p>
            <p className="mt-1 text-xs text-amber-600">
              Ensure the backend is running and{" "}
              <code className="rounded bg-amber-100 px-1">NEXT_PUBLIC_API_BASE_URL</code> matches
              (e.g. <code className="rounded bg-amber-100 px-1">http://localhost:8001</code>). Sign
              in if the API requires authentication.
            </p>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Tasks</h1>
          <p className="mt-1 text-sm text-gray-500">Human-in-the-loop review queue</p>
        </div>
        <button
          onClick={() => setShowNewTask(!showNewTask)}
          className="flex items-center gap-2 rounded-lg bg-purple-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-purple-700"
        >
          {showNewTask ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
          {showNewTask ? "Cancel" : "New Task"}
        </button>
      </div>

      {/* New Task Form */}
      {showNewTask && (
        <form onSubmit={handleCreateTask} className="rounded-xl border border-purple-200 bg-purple-50/30 p-5">
          <div className="flex flex-col gap-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-700">Task Type</label>
                <select
                  value={newTask.type}
                  onChange={(e) => setNewTask((f) => ({ ...f, type: e.target.value as TaskType }))}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
                >
                  {TASK_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-700">Assign To</label>
                <input
                  type="text"
                  value={newTask.assigned_to}
                  onChange={(e) => setNewTask((f) => ({ ...f, assigned_to: e.target.value }))}
                  placeholder="admin"
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
                />
              </div>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-700">Title *</label>
              <input
                type="text"
                value={newTask.title}
                onChange={(e) => setNewTask((f) => ({ ...f, title: e.target.value }))}
                placeholder="e.g. Review SF police data delivery"
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-700">Description</label>
              <textarea
                value={newTask.description}
                onChange={(e) => setNewTask((f) => ({ ...f, description: e.target.value }))}
                rows={2}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
              />
            </div>
            <div className="flex justify-end">
              <button
                type="submit"
                disabled={creating || !newTask.title.trim()}
                className="flex items-center gap-2 rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white hover:bg-purple-700 disabled:opacity-50"
              >
                {creating && <Loader2 className="h-4 w-4 animate-spin" />}
                Create Task
              </button>
            </div>
          </div>
        </form>
      )}

      <div className="flex items-center gap-2">
        {statusOptions.map((opt) => (
          <button
            key={opt.value}
            onClick={() => setFilter(opt.value)}
            className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
              filter === opt.value
                ? "bg-purple-600 text-white"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-purple-600" />
        </div>
      ) : (
        <div className="rounded-xl border border-gray-200 bg-white divide-y divide-gray-100">
          {tasks.map((task) => (
            <div key={task.id} className="flex items-center gap-4 px-6 py-4">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900">{task.title}</p>
                <p className="mt-0.5 text-xs text-gray-500 line-clamp-1">{task.description}</p>
                <div className="mt-1 flex items-center gap-3 text-xs text-gray-400">
                  <span className="capitalize">{task.type.replace(/_/g, " ")}</span>
                  {task.assigned_to && <span>Assigned to {task.assigned_to}</span>}
                  {task.due_at && (
                    <span>Due {formatDistanceToNow(new Date(task.due_at), { addSuffix: true })}</span>
                  )}
                  {task.request_id && (
                    <Link href={`/foia/requests/${task.request_id}`} className="text-purple-600 hover:underline">
                      Request #{task.request_id}
                    </Link>
                  )}
                </div>
              </div>
              <TaskStatusBadge status={task.status} />
              <button
                type="button"
                onClick={() => handleDelete(task.id)}
                disabled={deletingId === task.id}
                className="rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
                title="Delete"
              >
                <span className="inline-flex items-center gap-1.5">
                  <Trash2 className="h-3.5 w-3.5" />
                  {deletingId === task.id ? "Deleting..." : "Delete"}
                </span>
              </button>
              {task.status !== "completed" && task.status !== "cancelled" && (
                <div className="flex items-center gap-1.5">
                  {!task.assigned_to && (
                    <button
                      onClick={() => handleAssign(task.id)}
                      disabled={actionLoading === task.id}
                      className="rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50"
                    >
                      Assign
                    </button>
                  )}
                  <button
                    onClick={() => handleComplete(task.id)}
                    disabled={actionLoading === task.id}
                    className="flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
                  >
                    {actionLoading === task.id ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <CheckCircle2 className="h-3 w-3" />
                    )}
                    Complete
                  </button>
                </div>
              )}
            </div>
          ))}
          {tasks.length === 0 && !loading && (
            <div className="px-6 py-12 text-center text-sm text-gray-400">
              {apiError ? "Tasks could not be loaded. Check the message above." : "No tasks match your filter."}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Loader2, Plus } from "lucide-react"
import { listFoiaTasks } from "@/lib/foiaApiClient"
import { TaskStatusBadge } from "@/components/foia/status-badge"
import type { FoiaTask, TaskStatus } from "@/lib/foia/types"
import { formatDistanceToNow } from "date-fns"

const statusOptions: { value: TaskStatus | "all"; label: string }[] = [
  { value: "all", label: "All" },
  { value: "pending", label: "Pending" },
  { value: "assigned", label: "Assigned" },
  { value: "in_progress", label: "In Progress" },
  { value: "completed", label: "Completed" },
  { value: "cancelled", label: "Cancelled" },
]

export function TasksContent() {
  const [tasks, setTasks] = useState<FoiaTask[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<TaskStatus | "all">("all")

  useEffect(() => {
    async function load() {
      setLoading(true)
      try {
        const data = await listFoiaTasks({
          status: filter === "all" ? undefined : filter,
        })
        setTasks(data)
      } catch (err) {
        console.error("Failed to load tasks:", err)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [filter])

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Tasks</h1>
          <p className="mt-1 text-sm text-gray-500">Human-in-the-loop review queue</p>
        </div>
        <button className="flex items-center gap-2 rounded-lg bg-purple-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-purple-700">
          <Plus className="h-4 w-4" />
          New Task
        </button>
      </div>

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
            </div>
          ))}
          {tasks.length === 0 && (
            <div className="px-6 py-12 text-center text-sm text-gray-400">
              No tasks match your filter.
            </div>
          )}
        </div>
      )}
    </div>
  )
}

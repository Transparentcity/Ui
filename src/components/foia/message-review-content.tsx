"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Loader2, CheckCircle2, RefreshCw, Edit3 } from "lucide-react"
import { listFoiaTasks } from "@/lib/foiaApiClient"
import { TaskStatusBadge } from "@/components/foia/status-badge"
import type { FoiaTask } from "@/lib/foia/types"
import { formatDistanceToNow } from "date-fns"

export function MessageReviewContent() {
  const [tasks, setTasks] = useState<FoiaTask[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      try {
        const all = await listFoiaTasks()
        // Show tasks related to message drafting / follow-ups
        const relevant = all.filter(
          (t) =>
            ["review_rewrite", "approve_follow_up"].includes(t.type) &&
            t.status !== "completed" &&
            t.status !== "cancelled"
        )
        setTasks(relevant)
      } catch (err) {
        console.error("Failed to load message review tasks:", err)
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
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">Message Review</h1>
        <p className="mt-1 text-sm text-gray-500">
          Drafted follow-ups and rewrites awaiting approval
        </p>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white">
        <div className="divide-y divide-gray-100">
          {tasks.map((task) => (
            <div key={task.id} className="flex items-center gap-4 px-6 py-4">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900">{task.title}</p>
                <p className="mt-0.5 text-xs text-gray-500 line-clamp-2">
                  {task.description}
                </p>
                <div className="mt-1.5 flex items-center gap-3 text-xs text-gray-400">
                  {task.assigned_to && <span>Assigned to {task.assigned_to}</span>}
                  {task.due_at && (
                    <span>Due {formatDistanceToNow(new Date(task.due_at), { addSuffix: true })}</span>
                  )}
                  {task.request_id && (
                    <Link href={`/foia/requests/${task.request_id}`} className="text-purple-600 hover:underline">
                      View Request
                    </Link>
                  )}
                </div>
              </div>
              <TaskStatusBadge status={task.status} />
              <div className="flex items-center gap-1.5">
                <button className="rounded-lg border border-gray-200 p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-50" title="Edit">
                  <Edit3 className="h-4 w-4" />
                </button>
                <button className="rounded-lg border border-gray-200 p-2 text-gray-400 hover:text-purple-600 hover:bg-purple-50" title="Approve">
                  <CheckCircle2 className="h-4 w-4" />
                </button>
                <button className="rounded-lg border border-gray-200 p-2 text-gray-400 hover:text-amber-600 hover:bg-amber-50" title="Regenerate">
                  <RefreshCw className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
          {tasks.length === 0 && (
            <div className="px-6 py-12 text-center text-sm text-gray-400">
              No messages awaiting review.
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

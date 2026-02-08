"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Loader2, CheckCircle2, AlertTriangle, FileText } from "lucide-react"
import { listDatasetInstances } from "@/lib/foiaApiClient"
import type { DatasetInstance } from "@/lib/foia/types"

const statusConfig: Record<string, { label: string; color: string }> = {
  pending_review: { label: "Pending Review", color: "bg-amber-100 text-amber-700" },
  accepted: { label: "Accepted", color: "bg-emerald-100 text-emerald-700" },
  rejected: { label: "Rejected", color: "bg-red-100 text-red-700" },
  needs_mapping: { label: "Needs Mapping", color: "bg-violet-100 text-violet-700" },
}

export function DataReviewContent() {
  const [instances, setInstances] = useState<DatasetInstance[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      try {
        const data = await listDatasetInstances()
        setInstances(data)
      } catch (err) {
        console.error("Failed to load dataset instances:", err)
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

  const pendingReview = instances.filter((i) => i.status === "pending_review")
  const others = instances.filter((i) => i.status !== "pending_review")

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">Data Review</h1>
        <p className="mt-1 text-sm text-gray-500">
          Attachments awaiting evaluation and normalization
        </p>
      </div>

      {/* Pending Review */}
      <div className="rounded-xl border border-gray-200 bg-white">
        <div className="border-b border-gray-200 px-6 py-4">
          <h2 className="text-sm font-semibold text-gray-900">
            Pending Review ({pendingReview.length})
          </h2>
        </div>
        <div className="divide-y divide-gray-100">
          {pendingReview.map((inst) => (
            <DataInstanceRow key={inst.id} instance={inst} />
          ))}
          {pendingReview.length === 0 && (
            <div className="px-6 py-8 text-center text-sm text-gray-400">
              No data deliveries pending review.
            </div>
          )}
        </div>
      </div>

      {/* Previous Reviews */}
      {others.length > 0 && (
        <div className="rounded-xl border border-gray-200 bg-white">
          <div className="border-b border-gray-200 px-6 py-4">
            <h2 className="text-sm font-semibold text-gray-900">
              Previous Reviews ({others.length})
            </h2>
          </div>
          <div className="divide-y divide-gray-100">
            {others.map((inst) => (
              <DataInstanceRow key={inst.id} instance={inst} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function DataInstanceRow({ instance }: { instance: DatasetInstance }) {
  const cfg = statusConfig[instance.status] ?? { label: instance.status, color: "bg-gray-100 text-gray-700" }
  return (
    <div className="flex items-center gap-4 px-6 py-4">
      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-purple-50">
        <FileText className="h-4 w-4 text-purple-600" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-900">
          City #{instance.city_id} - {instance.dataset_type_id}
        </p>
        <div className="mt-0.5 flex items-center gap-3 text-xs text-gray-500">
          {instance.row_count != null && <span>{instance.row_count.toLocaleString()} rows</span>}
          {instance.coverage_start && instance.coverage_end && (
            <span>{instance.coverage_start} to {instance.coverage_end}</span>
          )}
          {instance.completeness_score != null && (
            <span className={instance.completeness_score < 80 ? "text-amber-600" : "text-emerald-600"}>
              {instance.completeness_score}% complete
            </span>
          )}
        </div>
      </div>
      <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${cfg.color}`}>
        {cfg.label}
      </span>
      {instance.status === "pending_review" && (
        <div className="flex items-center gap-1.5">
          <button className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700">
            Accept
          </button>
          <button className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50">
            Deficiency
          </button>
        </div>
      )}
    </div>
  )
}

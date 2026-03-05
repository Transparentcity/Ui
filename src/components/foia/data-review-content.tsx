"use client"

import React, { useEffect, useState, useCallback, useRef } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import {
  Loader2,
  CheckCircle2,
  AlertTriangle,
  FileText,
  FileSearch,
  Upload,
  X,
  RefreshCw,
} from "lucide-react"
import { useAuth0 } from "@auth0/auth0-react"
import { toast } from "sonner"
import {
  listDatasetInstances,
  listFoiaRequests,
  createDatasetInstance,
  updateDatasetInstance,
} from "@/lib/foiaApiClient"
import { uploadFoiaFile, rewriteFoiaRequest } from "@/app/actions/foia"
import { API_BASE } from "@/lib/apiBase"
import { datasetLabel } from "@/lib/foia/datasetLabels"
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  TooltipProvider,
} from "@/components/ui/tooltip"
import type { DatasetInstance, DatasetInstanceStatus, FoiaRequest } from "@/lib/foia/types"

const statusConfig: Record<string, { label: string; color: string }> = {
  pending_review: { label: "Pending Review", color: "bg-amber-100 text-amber-700" },
  accepted: { label: "Complete", color: "bg-emerald-100 text-emerald-700" },
  rejected: { label: "Rejected", color: "bg-red-100 text-red-700" },
  needs_mapping: { label: "Needs Mapping", color: "bg-violet-100 text-violet-700" },
  incomplete: { label: "Incomplete", color: "bg-orange-100 text-orange-700" },
}

const ACCEPTED_FILE_TYPES = ".pdf,.csv,.xlsx,.xls,.doc,.docx,.txt,.png,.jpg,.jpeg,.gif,.zip"

export function DataReviewContent() {
  const router = useRouter()
  const { getAccessTokenSilently, isAuthenticated } = useAuth0()
  const [instances, setInstances] = useState<DatasetInstance[]>([])
  const [requests, setRequests] = useState<FoiaRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState<number | null>(null)
  const [showUpload, setShowUpload] = useState(false)
  const [apiError, setApiError] = useState<string | null>(null)

  const load = useCallback(async () => {
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
      const [instData, reqRes] = await Promise.all([
        listDatasetInstances({}, token),
        listFoiaRequests({ page_size: 100 }, token),
      ])
      setInstances(instData)
      setRequests(reqRes.items)
    } catch (err) {
      console.error("Failed to load data:", err)
      setApiError(err instanceof Error ? err.message : "Failed to load data")
      setInstances([])
      setRequests([])
    } finally {
      setLoading(false)
    }
  }, [isAuthenticated, getAccessTokenSilently])

  useEffect(() => {
    load()
  }, [load])

  async function handleUpdateStatus(
    instanceId: number,
    newStatus: string,
    reviewNotes?: string
  ) {
    setActionLoading(instanceId)
    let token: string | undefined
    if (isAuthenticated) {
      try {
        token = await getAccessTokenSilently()
      } catch {
        // continue without token
      }
    }
    try {
      await updateDatasetInstance(
        instanceId,
        {
          status: newStatus as DatasetInstanceStatus,
          ...(reviewNotes && { review_notes: reviewNotes }),
        },
        token
      )
      toast.success("Review status updated")
      await load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update status")
    } finally {
      setActionLoading(null)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-purple-600" />
      </div>
    )
  }

  const pendingReview = instances.filter((i) => i.status === "pending_review")
  const incomplete = instances.filter((i) => i.status === "incomplete")
  const others = instances.filter(
    (i) => i.status !== "pending_review" && i.status !== "incomplete"
  )

  return (
    <div className="flex flex-col gap-6">
      {apiError && (
        <div
          className="flex items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800"
          role="alert"
        >
          <AlertTriangle className="h-5 w-5 shrink-0" />
          <div>
            <p className="font-medium">Could not load data review</p>
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

      <div>
        <h1 className="text-2xl font-semibold text-gray-900">Data Review</h1>
        <p className="mt-1 text-sm text-gray-500">
          Upload agency responses, link them to requests, and mark complete or incomplete
        </p>
      </div>

      {/* Upload & Link */}
      <div className="rounded-xl border border-gray-200 bg-white p-6">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-900">Upload & Link to Request</h2>
          <button
            onClick={() => setShowUpload(!showUpload)}
            className="flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            <Upload className="h-4 w-4" />
            {showUpload ? "Hide" : "Upload Files"}
          </button>
        </div>
        {showUpload && (
          <UploadSection
            requests={requests}
            onUploaded={() => {
              load()
              setShowUpload(false)
            }}
          />
        )}
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
            <DataInstanceRow
              key={inst.id}
              instance={inst}
              actionLoading={actionLoading === inst.id}
              onMarkComplete={() => handleUpdateStatus(inst.id, "accepted")}
              onMarkIncomplete={(reason) =>
                handleUpdateStatus(inst.id, "incomplete", reason)
              }
              onNeedsMapping={() => handleUpdateStatus(inst.id, "needs_mapping")}
              onReject={() => handleUpdateStatus(inst.id, "rejected")}
            />
          ))}
          {pendingReview.length === 0 && (
            <div className="flex flex-col items-center justify-center px-6 py-8 text-center">
              <FileSearch className="h-10 w-10 text-gray-300" />
              <p className="mt-3 text-sm font-medium text-gray-500">No data to review</p>
              <p className="mt-1 text-xs text-gray-400">Data review items will appear when responses are received.</p>
            </div>
          )}
        </div>
      </div>

      {/* Incomplete - Create Revised Request */}
      {incomplete.length > 0 && (
        <div className="rounded-xl border border-orange-200 bg-orange-50/30">
          <div className="border-b border-orange-200 px-6 py-4">
            <h2 className="text-sm font-semibold text-orange-900">
              Incomplete – Revise Request ({incomplete.length})
            </h2>
            <p className="mt-1 text-xs text-orange-700">
              Create a revised request to send to the agency with your feedback.
            </p>
          </div>
          <div className="divide-y divide-orange-100">
            {incomplete.map((inst) => (
              <DataInstanceRow
                key={inst.id}
                instance={inst}
                actionLoading={actionLoading === inst.id}
                onCreateRevisedRequest={() => {
                  if (!inst.request_id) {
                    toast.warning("No linked request to revise")
                    return
                  }
                  setActionLoading(inst.id)
                  rewriteFoiaRequest(inst.request_id, {
                    incomplete_reason: inst.review_notes || "Data delivery incomplete",
                  })
                    .then((res) => {
                      const data = res as { id?: number } | undefined
                      if (data?.id) router.push(`/foia/requests/${data.id}`)
                      else load()
                    })
                    .catch((err) =>
                      toast.error(err instanceof Error ? err.message : "Failed to create revised request")
                    )
                    .finally(() => setActionLoading(null))
                }}
              />
            ))}
          </div>
        </div>
      )}

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

function UploadSection({
  requests,
  onUploaded,
}: {
  requests: FoiaRequest[]
  onUploaded: () => void
}) {
  const { getAccessTokenSilently, isAuthenticated } = useAuth0()
  const [selectedRequestId, setSelectedRequestId] = useState<number | "">("")
  const [uploading, setUploading] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0 || !selectedRequestId || typeof selectedRequestId !== "number")
      return
    const req = requests.find((r) => r.id === selectedRequestId)
    if (!req) {
      toast.warning("Selected request not found")
      return
    }
    let token: string | undefined
    if (isAuthenticated) {
      try {
        token = await getAccessTokenSilently()
      } catch {
        // continue without token
      }
    }
    setUploading(true)
    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i]
        const formData = new FormData()
        formData.append("file", file)
        const att = await uploadFoiaFile(selectedRequestId, formData)
        await createDatasetInstance(
          {
            city_id: req.city_id,
            dataset_type_id: req.dataset_type_id,
            request_id: selectedRequestId,
            attachment_id: (att as { id?: number }).id,
            status: "pending_review",
          },
          token
        )
      }
      onUploaded()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed")
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ""
    }
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    handleFiles(e.dataTransfer.files)
  }

  return (
    <div className="mt-4 space-y-4">
      <div>
        <label className="mb-1 block text-xs font-medium text-gray-700">
          Link to request
        </label>
        <select
          value={selectedRequestId}
          onChange={(e) =>
            setSelectedRequestId(e.target.value === "" ? "" : parseInt(e.target.value, 10))
          }
          className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
        >
          <option value="">Select a request...</option>
          {requests.map((r) => (
            <option key={r.id} value={r.id}>
              #{r.id} – {r.city?.name ?? `City ${r.city_id}`} – {datasetLabel(r.dataset_type_id)}
            </option>
          ))}
        </select>
      </div>
      <div
        onDragOver={(e) => {
          e.preventDefault()
          setDragOver(true)
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        className={`flex flex-col items-center justify-center rounded-xl border-2 border-dashed p-8 transition-colors ${
          dragOver ? "border-purple-400 bg-purple-50" : "border-gray-200 bg-gray-50 hover:border-gray-300"
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
                disabled={!selectedRequestId}
                className="text-purple-600 underline hover:text-purple-700 disabled:text-gray-400"
              >
                browse
              </button>
            </p>
            <p className="mt-1 text-xs text-gray-500">
              PDF, CSV, Excel, images – files will be linked to the selected request
            </p>
            {!selectedRequestId && (
              <p className="mt-2 text-xs text-amber-600">Select a request above first</p>
            )}
          </>
        )}
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          accept={ACCEPTED_FILE_TYPES}
          onChange={(e) => handleFiles(e.target.files)}
        />
      </div>
    </div>
  )
}

function IncompleteModal({
  open,
  onClose,
  onConfirm,
  loading,
}: {
  open: boolean
  onClose: () => void
  onConfirm: (reason: string) => void
  loading: boolean
}) {
  const [reason, setReason] = useState("")
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="fixed inset-0 bg-black/40" onClick={onClose} />
      <div className="relative z-10 w-full max-w-md rounded-2xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
          <h2 className="text-lg font-semibold text-gray-900">Mark Incomplete</h2>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="px-6 py-5">
          <p className="text-sm text-gray-600">
            Explain why the delivery is incomplete. This will be used when creating a revised
            request to the agency.
          </p>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={4}
            placeholder="e.g. Missing date range 2023-Q2, requested columns X and Y not included, format is PDF instead of CSV..."
            className="mt-3 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
          />
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
            onClick={() => {
              onConfirm(reason.trim() || "Incomplete")
              setReason("")
            }}
            disabled={loading}
            className="flex items-center gap-2 rounded-lg bg-orange-600 px-4 py-2 text-sm font-medium text-white hover:bg-orange-700 disabled:opacity-50"
          >
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            Mark Incomplete
          </button>
        </div>
      </div>
    </div>
  )
}

function DataInstanceRow({
  instance,
  actionLoading,
  onMarkComplete,
  onMarkIncomplete,
  onNeedsMapping,
  onReject,
  onCreateRevisedRequest,
}: {
  instance: DatasetInstance
  actionLoading?: boolean
  onMarkComplete?: () => void
  onMarkIncomplete?: (reason: string) => void
  onNeedsMapping?: () => void
  onReject?: () => void
  onCreateRevisedRequest?: () => void
}) {
  const [showIncompleteModal, setShowIncompleteModal] = useState(false)
  const cfg = statusConfig[instance.status] ?? {
    label: instance.status,
    color: "bg-gray-100 text-gray-700",
  }
  return (
    <>
      <IncompleteModal
        open={showIncompleteModal}
        onClose={() => setShowIncompleteModal(false)}
        onConfirm={(reason) => {
          onMarkIncomplete?.(reason)
          setShowIncompleteModal(false)
        }}
        loading={!!actionLoading}
      />
      <div className="flex items-center gap-4 px-6 py-4">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-purple-50">
          <FileText className="h-4 w-4 text-purple-600" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-900">
            {instance.city?.name ?? `City #${instance.city_id}`} – {datasetLabel(instance.dataset_type_id)}
          </p>
          <div className="mt-0.5 flex flex-wrap items-center gap-3 text-xs text-gray-500">
            {instance.row_count != null && (
              <span>{instance.row_count.toLocaleString()} rows</span>
            )}
            {instance.coverage_start && instance.coverage_end && (
              <span>
                {instance.coverage_start} to {instance.coverage_end}
              </span>
            )}
            {instance.completeness_score != null && (
              <span
                className={
                  instance.completeness_score < 80 ? "text-amber-600" : "text-emerald-600"
                }
              >
                {instance.completeness_score}% complete
              </span>
            )}
            {instance.request_id && (
              <Link
                href={`/foia/requests/${instance.request_id}`}
                className="text-purple-600 hover:underline"
              >
                Request #{instance.request_id}
              </Link>
            )}
            {instance.review_notes && instance.status === "incomplete" && (
              <span className="text-orange-600" title={instance.review_notes}>
                Why: {instance.review_notes.slice(0, 60)}
                {instance.review_notes.length > 60 ? "…" : ""}
              </span>
            )}
          </div>
        </div>
        <span
          className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${cfg.color}`}
        >
          {cfg.label}
        </span>
        {instance.status === "pending_review" && (
          <TooltipProvider>
            <div className="flex flex-wrap items-center gap-1.5">
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={onMarkComplete}
                    disabled={actionLoading}
                    className="flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
                  >
                    {actionLoading ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <CheckCircle2 className="h-3 w-3" />
                    )}
                    Complete
                  </button>
                </TooltipTrigger>
                <TooltipContent>Data is accurate and ready for use</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={() => setShowIncompleteModal(true)}
                    disabled={actionLoading}
                    className="rounded-lg border border-orange-200 bg-orange-50 px-3 py-1.5 text-xs font-medium text-orange-700 hover:bg-orange-100 disabled:opacity-50"
                  >
                    Incomplete
                  </button>
                </TooltipTrigger>
                <TooltipContent>Data has missing fields or records</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={onNeedsMapping}
                    disabled={actionLoading}
                    className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-violet-600 hover:bg-violet-50 disabled:opacity-50"
                  >
                    Needs Mapping
                  </button>
                </TooltipTrigger>
                <TooltipContent>Column names need to be mapped to standard schema</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={onReject}
                    disabled={actionLoading}
                    className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                  >
                    Reject
                  </button>
                </TooltipTrigger>
                <TooltipContent>Data is unusable or wrong dataset</TooltipContent>
              </Tooltip>
            </div>
          </TooltipProvider>
        )}
        {instance.status === "incomplete" && instance.request_id && onCreateRevisedRequest && (
          <button
            onClick={onCreateRevisedRequest}
            disabled={actionLoading}
            className="flex items-center gap-1.5 rounded-lg bg-orange-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-orange-700 disabled:opacity-50"
          >
            {actionLoading ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <RefreshCw className="h-3 w-3" />
            )}
            Create Revised Request
          </button>
        )}
      </div>
    </>
  )
}

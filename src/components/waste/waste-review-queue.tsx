"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { Loader2 } from "lucide-react"
import { toast } from "sonner"
import {
  useAssignWasteQueueItem,
  useBulkDisposeWasteFindings,
  useCreateWasteDisposition,
  useLatestWasteRun,
  useRunWasteAnalysis,
  useSyncWasteReviewQueue,
  useWasteDispositions,
  useWasteReviewQueue,
} from "@/lib/hooks/useWaste"
import type {
  WasteDispositionType,
  WasteReviewQueueItem,
} from "@/lib/apiClient"

const DISPOSITION_OPTIONS: Array<{
  value: WasteDispositionType
  label: string
}> = [
  { value: "confirmed_fraud", label: "Confirmed Fraud" },
  { value: "confirmed_waste", label: "Confirmed Waste" },
  { value: "policy_violation", label: "Policy Violation" },
  { value: "false_positive", label: "False Positive" },
  { value: "data_error", label: "Data Error" },
  { value: "under_investigation", label: "Under Investigation" },
  { value: "inconclusive", label: "Inconclusive" },
]

const AUTO_ANALYSIS_STALE_MS = 6 * 60 * 60 * 1000

function QueueRow({
  item,
  cityId,
  isSelected,
  onToggleSelected,
}: {
  item: WasteReviewQueueItem
  cityId: number
  isSelected: boolean
  onToggleSelected: (findingId: number) => void
}) {
  const [assignedTo, setAssignedTo] = useState(item.assigned_to ?? "")
  const [disposition, setDisposition] =
    useState<WasteDispositionType>("under_investigation")
  const [notes, setNotes] = useState("")
  const [showHistory, setShowHistory] = useState(false)

  const assignMutation = useAssignWasteQueueItem()
  const dispositionMutation = useCreateWasteDisposition()
  const historyQuery = useWasteDispositions(
    item.finding_id,
    cityId,
    showHistory
  )

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <div className="flex items-start gap-3">
        <input
          type="checkbox"
          checked={isSelected}
          onChange={() => onToggleSelected(item.finding_id)}
          aria-label={`Select ${item.finding_entity_name ?? `Finding #${item.finding_id}`}`}
          className="mt-1"
        />
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs rounded bg-gray-100 px-2 py-0.5 text-gray-700">
              Finding #{item.finding_id}
            </span>
            <span className="text-xs rounded bg-indigo-50 px-2 py-0.5 text-indigo-700">
              {item.finding_category ?? "Uncategorized"}
            </span>
            <span className="text-xs rounded bg-purple-50 px-2 py-0.5 text-purple-700">
              {item.finding_subcategory ?? "General"}
            </span>
            <span className="text-xs rounded bg-amber-50 px-2 py-0.5 text-amber-700">
              Priority: {item.priority}
            </span>
            <span className="text-xs rounded bg-slate-100 px-2 py-0.5 text-slate-700">
              Status: {item.status}
            </span>
          </div>
          <p className="mt-2 text-sm font-semibold text-gray-900">
            {item.finding_entity_name ?? "Unknown Entity"}
          </p>
          <p className="mt-1 text-sm text-gray-600 line-clamp-2">
            {item.finding_description ?? "No description available."}
          </p>
          <div className="mt-2 flex flex-wrap gap-4 text-xs text-gray-500">
            <span>Detector: {item.finding_detector_key ?? "n/a"}</span>
            <span>Severity: {item.finding_severity ?? "n/a"}</span>
            <span>
              Composite:{" "}
              {item.composite_score != null
                ? item.composite_score.toFixed(2)
                : "n/a"}
            </span>
          </div>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 lg:grid-cols-3 gap-3">
        <div className="rounded border border-gray-200 p-3">
          <p className="text-xs font-semibold text-gray-700 mb-2">
            Assign Auditor
          </p>
          <div className="flex gap-2">
            <input
              value={assignedTo}
              onChange={(e) => setAssignedTo(e.target.value)}
              placeholder="auth0|user_sub"
              className="w-full rounded border border-gray-300 px-2 py-1 text-xs"
            />
            <Button
              size="sm"
              variant="outline"
              disabled={!assignedTo || assignMutation.isPending}
              onClick={() =>
                assignMutation.mutate(
                  {
                    itemId: item.id,
                    cityId,
                    assignedTo,
                  },
                  {
                    onSuccess: () => toast.success("Auditor assigned"),
                    onError: () => toast.error("Failed to assign auditor"),
                  }
                )
              }
            >
              {assignMutation.isPending ? (
                <><Loader2 className="w-3 h-3 animate-spin mr-1" />Assigning…</>
              ) : (
                "Assign"
              )}
            </Button>
          </div>
        </div>

        <div className="rounded border border-gray-200 p-3 lg:col-span-2">
          <p className="text-xs font-semibold text-gray-700 mb-2">
            Disposition
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
            <select
              value={disposition}
              onChange={(e) =>
                setDisposition(e.target.value as WasteDispositionType)
              }
              className="rounded border border-gray-300 px-2 py-1 text-xs"
            >
              {DISPOSITION_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional notes"
              className="rounded border border-gray-300 px-2 py-1 text-xs md:col-span-2"
            />
          </div>
          <div className="mt-2 flex items-center gap-2">
            <Button
              size="sm"
              disabled={dispositionMutation.isPending}
              onClick={() =>
                dispositionMutation.mutate(
                  {
                    findingId: item.finding_id,
                    data: {
                      city_id: cityId,
                      disposition,
                      notes: notes || undefined,
                      evidence_links: [],
                    },
                  },
                  {
                    onSuccess: () => toast.success("Disposition applied"),
                    onError: () => toast.error("Failed to apply disposition"),
                  }
                )
              }
            >
              {dispositionMutation.isPending ? (
                <><Loader2 className="w-3 h-3 animate-spin mr-1" />Applying…</>
              ) : (
                "Apply"
              )}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setShowHistory((prev) => !prev)}
            >
              {showHistory ? "Hide History" : "Show History"}
            </Button>
          </div>
          {showHistory ? (
            <div className="mt-2 rounded border border-gray-100 bg-gray-50 p-2">
              {historyQuery.isLoading ? (
                <p className="text-xs text-gray-500">Loading disposition history…</p>
              ) : historyQuery.data && historyQuery.data.length > 0 ? (
                <div className="space-y-1">
                  {historyQuery.data.map((entry) => (
                    <div
                      key={entry.id}
                      className="flex items-center justify-between text-xs text-gray-700"
                    >
                      <span>{entry.disposition}</span>
                      <span>{entry.created_at ?? "n/a"}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-gray-500">No prior dispositions.</p>
              )}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}

export function WasteReviewQueue({ cityId }: { cityId: number | null }) {
  const [status, setStatus] = useState("")
  const [priority, setPriority] = useState("")
  const [assignedTo, setAssignedTo] = useState("")
  const [page, setPage] = useState(1)
  const [selectedFindingIds, setSelectedFindingIds] = useState<number[]>([])
  const [bulkDisposition, setBulkDisposition] =
    useState<WasteDispositionType>("under_investigation")
  const [bulkNotes, setBulkNotes] = useState("")
  const [runSyncPhase, setRunSyncPhase] = useState<
    "idle" | "running" | "refreshing" | "done" | "error"
  >("idle")
  const [runSyncMessage, setRunSyncMessage] = useState("")
  const [runSyncStartedAt, setRunSyncStartedAt] = useState<number | null>(null)
  const [runSyncElapsedSeconds, setRunSyncElapsedSeconds] = useState(0)
  const [lastQueueRefreshAt, setLastQueueRefreshAt] = useState<string | null>(null)
  const [lastAnalysisAt, setLastAnalysisAt] = useState<string | null>(null)
  const [autoRefreshCityId, setAutoRefreshCityId] = useState<number | null>(null)

  const queueQuery = useWasteReviewQueue({
    cityId,
    status: status || undefined,
    priority: priority || undefined,
    assignedTo: assignedTo || undefined,
    page,
    perPage: 25,
  })
  const bulkDisposeMutation = useBulkDisposeWasteFindings()
  const syncQueueMutation = useSyncWasteReviewQueue()
  const runAnalysisMutation = useRunWasteAnalysis()
  const latestRunQuery = useLatestWasteRun(cityId)

  useEffect(() => {
    const latestRun = latestRunQuery.data
    if (!latestRun) {
      setLastAnalysisAt(null)
      return
    }
    const runTimestamp =
      latestRun.analysis_timestamp ?? latestRun.completed_at ?? latestRun.created_at
    setLastAnalysisAt(runTimestamp ?? null)
  }, [latestRunQuery.data])

  const runFreshAnalysisAndRefreshQueue = useCallback(
    async (mode: "manual" | "auto") => {
      if (!cityId) return
      setRunSyncStartedAt(Date.now())
      setRunSyncElapsedSeconds(0)
      setRunSyncPhase("running")
      setRunSyncMessage(
        mode === "auto"
          ? "Queue loaded. Running a background freshness analysis because the last run is stale."
          : "Running fresh waste analysis and updating queue state. This can take up to ~2 minutes."
      )
      try {
        await runAnalysisMutation.mutateAsync({
          city_id: cityId,
          force_refresh: true,
          persist: true,
        })
        setRunSyncPhase("refreshing")
        setRunSyncMessage("Analysis complete. Refreshing queue results…")
        await Promise.all([queueQuery.refetch(), latestRunQuery.refetch()])
        setRunSyncPhase("done")
        setRunSyncMessage(
          "Queue updated. If no items appear, current filters may be excluding them."
        )
        setLastQueueRefreshAt(new Date().toISOString())
        toast.success("Queue updated")
      } catch (err) {
        setRunSyncPhase("error")
        const msg = err instanceof Error ? err.message : "Unknown error"
        setRunSyncMessage(`Run + Sync failed: ${msg}. Please retry.`)
        toast.error("Analysis + sync failed")
      }
    },
    [cityId, runAnalysisMutation, queueQuery, latestRunQuery]
  )

  const handleRunAndSyncQueue = async () => {
    await runFreshAnalysisAndRefreshQueue("manual")
  }

  useEffect(() => {
    if (!cityId) return
    if (autoRefreshCityId === cityId) return
    if (runAnalysisMutation.isPending || syncQueueMutation.isPending) return
    if (queueQuery.isLoading || latestRunQuery.isLoading) return
    if (queueQuery.isError || latestRunQuery.isError) return

    const latestRun = latestRunQuery.data
    const latestTimestamp =
      latestRun?.analysis_timestamp ?? latestRun?.completed_at ?? latestRun?.created_at
    const isStale =
      !latestTimestamp ||
      Date.now() - new Date(latestTimestamp).getTime() > AUTO_ANALYSIS_STALE_MS

    if (!isStale) return
    setAutoRefreshCityId(cityId)
    void runFreshAnalysisAndRefreshQueue("auto")
  }, [
    autoRefreshCityId,
    cityId,
    latestRunQuery.data,
    latestRunQuery.isError,
    latestRunQuery.isLoading,
    queueQuery.isError,
    queueQuery.isLoading,
    runAnalysisMutation.isPending,
    runFreshAnalysisAndRefreshQueue,
    syncQueueMutation.isPending,
  ])

  useEffect(() => {
    if (
      runSyncStartedAt == null ||
      !["running", "refreshing"].includes(runSyncPhase)
    ) {
      return
    }
    setRunSyncElapsedSeconds(
      Math.max(0, Math.floor((Date.now() - runSyncStartedAt) / 1000))
    )
    const interval = window.setInterval(() => {
      setRunSyncElapsedSeconds(
        Math.max(0, Math.floor((Date.now() - runSyncStartedAt) / 1000))
      )
    }, 1000)
    return () => window.clearInterval(interval)
  }, [runSyncPhase, runSyncStartedAt])

  const totalPages = useMemo(() => {
    const total = queueQuery.data?.total ?? 0
    return Math.max(1, Math.ceil(total / 25))
  }, [queueQuery.data?.total])

  const toggleSelectedFinding = (findingId: number) => {
    setSelectedFindingIds((prev) =>
      prev.includes(findingId)
        ? prev.filter((id) => id !== findingId)
        : [...prev, findingId]
    )
  }

  if (!cityId) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
        Select a city to load review queue items.
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <p className="text-sm font-semibold text-gray-900">Review Queue</p>
        <p className="text-xs text-gray-500 mt-1">
          Filter and disposition findings. Final dispositions feed detector
          precision and scoring weights.
        </p>
        <div className="mt-3 grid grid-cols-1 md:grid-cols-6 gap-2">
          <select
            className="rounded border border-gray-300 px-2 py-1 text-sm"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value)
              setPage(1)
            }}
          >
            <option value="">All statuses</option>
            <option value="pending">Pending</option>
            <option value="assigned">Assigned</option>
            <option value="disposed">Disposed</option>
          </select>
          <select
            className="rounded border border-gray-300 px-2 py-1 text-sm"
            value={priority}
            onChange={(e) => {
              setPriority(e.target.value)
              setPage(1)
            }}
          >
            <option value="">All priorities</option>
            <option value="critical">Critical</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
          <input
            value={assignedTo}
            onChange={(e) => {
              setAssignedTo(e.target.value)
              setPage(1)
            }}
            placeholder="Assigned auditor (optional)"
            className="rounded border border-gray-300 px-2 py-1 text-sm"
          />
          <Button
            variant="outline"
            onClick={() => queueQuery.refetch()}
            disabled={queueQuery.isFetching}
          >
            Refresh Queue
          </Button>
          <Button
            variant="outline"
            onClick={() =>
              syncQueueMutation.mutate(
                { city_id: cityId },
                {
                  onSuccess: (data) => toast.success(`Synced ${data.processed} findings`),
                  onError: () => toast.error("Queue sync failed"),
                }
              )
            }
            disabled={syncQueueMutation.isPending || runAnalysisMutation.isPending}
          >
            {syncQueueMutation.isPending ? "Syncing…" : "Sync Queue"}
          </Button>
          <Button
            onClick={handleRunAndSyncQueue}
            disabled={runAnalysisMutation.isPending || syncQueueMutation.isPending}
          >
            {runAnalysisMutation.isPending
              ? "Running Analysis…"
              : "Run Fresh Analysis"}
          </Button>
        </div>
        {syncQueueMutation.data ? (
          <p className="mt-2 text-xs text-gray-500">
            Synced {syncQueueMutation.data.processed} findings (
            {syncQueueMutation.data.inserted} inserted,{" "}
            {syncQueueMutation.data.updated} updated,{" "}
            {syncQueueMutation.data.reopened} reopened).
          </p>
        ) : null}
        {(runSyncPhase !== "idle" || runAnalysisMutation.isPending) &&
        runSyncMessage ? (
          <p
            className={`mt-2 text-xs ${
              runSyncPhase === "error"
                ? "text-red-600"
                : runSyncPhase === "done"
                  ? "text-emerald-700"
                  : "text-indigo-700"
            }`}
          >
            {runSyncMessage}
            {["running", "refreshing"].includes(runSyncPhase)
              ? ` (${runSyncElapsedSeconds}s elapsed)`
              : ""}
          </p>
        ) : null}
        {lastQueueRefreshAt ? (
          <p className="mt-1 text-xs text-gray-500">
            Last successful queue refresh:{" "}
            {new Date(lastQueueRefreshAt).toLocaleString()}
          </p>
        ) : null}
        {lastAnalysisAt ? (
          <p className="mt-1 text-xs text-gray-500">
            Last analysis run: {new Date(lastAnalysisAt).toLocaleString()}
          </p>
        ) : (
          <p className="mt-1 text-xs text-gray-500">
            Last analysis run: none recorded yet for this city.
          </p>
        )}
      </div>

      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <p className="text-xs font-semibold text-gray-700 mb-2">
          Bulk Disposition ({selectedFindingIds.length} selected)
        </p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
          <select
            value={bulkDisposition}
            onChange={(e) =>
              setBulkDisposition(e.target.value as WasteDispositionType)
            }
            className="rounded border border-gray-300 px-2 py-1 text-xs"
          >
            {DISPOSITION_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <input
            value={bulkNotes}
            onChange={(e) => setBulkNotes(e.target.value)}
            placeholder="Optional notes"
            className="rounded border border-gray-300 px-2 py-1 text-xs"
          />
          <Button
            size="sm"
            disabled={
              selectedFindingIds.length === 0 || bulkDisposeMutation.isPending
            }
            onClick={() =>
              bulkDisposeMutation.mutate(
                {
                  city_id: cityId,
                  finding_ids: selectedFindingIds,
                  disposition: bulkDisposition,
                  notes: bulkNotes || undefined,
                },
                {
                  onSuccess: () => toast.success(`Bulk disposition applied to ${selectedFindingIds.length} findings`),
                  onError: () => toast.error("Bulk disposition failed"),
                }
              )
            }
          >
            {bulkDisposeMutation.isPending ? (
              <><Loader2 className="w-3 h-3 animate-spin mr-1" />Applying…</>
            ) : (
              "Apply Bulk Disposition"
            )}
          </Button>
        </div>
      </div>

      {queueQuery.isLoading ? (
        <div className="space-y-2">
          {[...Array(4)].map((_, idx) => (
            <div key={idx} className="h-28 rounded-lg bg-gray-100 animate-pulse" />
          ))}
        </div>
      ) : queueQuery.data?.items?.length ? (
        <div className="space-y-3">
          {queueQuery.data.items.map((item) => (
            <QueueRow
              key={item.id}
              item={item}
              cityId={cityId}
              isSelected={selectedFindingIds.includes(item.finding_id)}
              onToggleSelected={toggleSelectedFinding}
            />
          ))}
        </div>
      ) : (
        <div className="rounded-lg border border-gray-200 bg-white p-6 text-sm text-gray-500">
          No queue items match the current filters.
        </div>
      )}

      <div className="flex items-center justify-between rounded-lg border border-gray-200 bg-white p-3">
        <p className="text-xs text-gray-500">
          Page {page} of {totalPages} · Total {queueQuery.data?.total ?? 0} items
        </p>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={page <= 1}
            onClick={() => setPage((prev) => Math.max(1, prev - 1))}
          >
            Previous
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={page >= totalPages}
            onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
          >
            Next
          </Button>
        </div>
      </div>
    </div>
  )
}

"use client"

import { useState, useMemo, useCallback } from "react"
import {
  useWasteReviewQueue,
  useAssignWasteQueueItem,
  useBulkDisposeWasteFindings,
  useCreateWasteDisposition,
} from "@/lib/hooks/useWaste"
import { useCities } from "@/lib/hooks/useCities"
import { WasteShell } from "./waste-shell"
import { SeverityBadge } from "./severity-badge"
import { ScoreBar } from "./score-bar"
import { DispositionSelect } from "./disposition-select"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  ChevronLeft,
  ChevronRight,
  UserPlus,
  X,
  CheckCircle2,
  Loader2,
  ClipboardList,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import type { WasteDispositionType, WasteReviewQueueItem } from "@/lib/apiClient"

export function ReviewQueuePage() {
  const [page, setPage] = useState(1)
  const [perPage] = useState(25)
  const [statusFilter, setStatusFilter] = useState<string>("")
  const [priorityFilter, setPriorityFilter] = useState<string>("")
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [bulkDisposition, setBulkDisposition] = useState<WasteDispositionType | undefined>()
  const [assignTarget, setAssignTarget] = useState("")
  const [confirmBulk, setConfirmBulk] = useState(false)
  const [quickDisposeTarget, setQuickDisposeTarget] = useState<{
    item: WasteReviewQueueItem
    disposition: WasteDispositionType
  } | null>(null)

  const citiesQuery = useCities({ includeInactive: false })
  const selectedCityId = useMemo(() => {
    const eligible = (citiesQuery.data ?? []).filter((c) => (c.datasets_count ?? 0) > 0)
    return eligible.length > 0 ? Number(eligible[0].city_id) : null
  }, [citiesQuery.data])

  const { data, isLoading, error } = useWasteReviewQueue({
    cityId: selectedCityId,
    status: statusFilter || undefined,
    priority: priorityFilter || undefined,
    page,
    perPage,
  })

  const disposeMutation = useCreateWasteDisposition()
  const assignMutation = useAssignWasteQueueItem()
  const bulkDisposeMutation = useBulkDisposeWasteFindings()

  const toggleSelect = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const toggleAll = useCallback(() => {
    if (!data?.items) return
    setSelected((prev) => {
      if (prev.size === data.items.length) return new Set()
      return new Set(data.items.map((i) => i.id))
    })
  }, [data?.items])

  const handleQuickDispose = useCallback(
    (item: WasteReviewQueueItem, disposition: WasteDispositionType) => {
      if (!selectedCityId) return
      setQuickDisposeTarget({ item, disposition })
    },
    [selectedCityId]
  )

  const confirmQuickDispose = useCallback(() => {
    if (!selectedCityId || !quickDisposeTarget) return
    disposeMutation.mutate(
      {
        findingId: quickDisposeTarget.item.finding_id,
        data: { city_id: selectedCityId, disposition: quickDisposeTarget.disposition },
      },
      {
        onSuccess: () => {
          toast.success("Finding disposed")
          setQuickDisposeTarget(null)
        },
        onError: () => toast.error("Failed to dispose finding"),
      }
    )
  }, [selectedCityId, quickDisposeTarget, disposeMutation])

  const handleBulkDispose = useCallback(() => {
    if (!selectedCityId || !bulkDisposition || selected.size === 0) return
    setConfirmBulk(true)
  }, [selectedCityId, bulkDisposition, selected.size])

  const confirmBulkDispose = useCallback(() => {
    if (!selectedCityId || !bulkDisposition || selected.size === 0) return
    const findingIds = data?.items
      .filter((i) => selected.has(i.id))
      .map((i) => i.finding_id) ?? []
    if (findingIds.length === 0) return
    bulkDisposeMutation.mutate(
      { city_id: selectedCityId, finding_ids: findingIds, disposition: bulkDisposition },
      {
        onSuccess: () => {
          setSelected(new Set())
          setBulkDisposition(undefined)
          setConfirmBulk(false)
          toast.success(`${findingIds.length} findings disposed`)
        },
        onError: () => toast.error("Bulk dispose failed"),
      }
    )
  }, [selectedCityId, bulkDisposition, selected, data?.items, bulkDisposeMutation])

  const handleBulkAssign = useCallback(() => {
    if (!selectedCityId || !assignTarget.trim() || selected.size === 0) return
    const items = data?.items.filter((i) => selected.has(i.id)) ?? []
    items.forEach((item) => {
      assignMutation.mutate({
        itemId: item.id,
        cityId: selectedCityId,
        assignedTo: assignTarget.trim(),
      })
    })
    toast.success(`${items.length} items assigned`)
    setSelected(new Set())
    setAssignTarget("")
  }, [selectedCityId, assignTarget, selected, data?.items, assignMutation])

  const totalPages = data ? Math.ceil(data.total / perPage) : 0
  const allSelected = data?.items && data.items.length > 0 && selected.size === data.items.length

  return (
    <WasteShell title="Review Queue" description="Auditor workbench for triaging findings">
      {/* Filters */}
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v === "all" ? "" : v); setPage(1) }}>
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="assigned">Assigned</SelectItem>
            <SelectItem value="disposed">Disposed</SelectItem>
          </SelectContent>
        </Select>

        <Select value={priorityFilter} onValueChange={(v) => { setPriorityFilter(v === "all" ? "" : v); setPage(1) }}>
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="All priorities" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All priorities</SelectItem>
            <SelectItem value="critical">Critical</SelectItem>
            <SelectItem value="high">High</SelectItem>
            <SelectItem value="medium">Medium</SelectItem>
            <SelectItem value="low">Low</SelectItem>
          </SelectContent>
        </Select>

        {data && (
          <span className="text-sm text-gray-500 ml-auto">{data.total} items</span>
        )}
      </div>

      {/* Bulk actions bar */}
      {selected.size > 0 && (
        <div className="flex items-center gap-3 p-3 mb-4 bg-purple-50 border border-purple-200 rounded-lg flex-wrap">
          <span className="text-sm font-medium text-purple-800">
            {selected.size} selected
          </span>
          <div className="flex items-center gap-2 flex-1 flex-wrap">
            <DispositionSelect
              value={bulkDisposition}
              onValueChange={setBulkDisposition}
              placeholder="Bulk dispose…"
              className="w-[180px] h-9"
            />
            <Button
              size="sm"
              disabled={!bulkDisposition || bulkDisposeMutation.isPending}
              onClick={handleBulkDispose}
            >
              {bulkDisposeMutation.isPending ? (
                <Loader2 className="w-4 h-4 mr-1 animate-spin" />
              ) : (
                <CheckCircle2 className="w-4 h-4 mr-1" />
              )}
              Dispose
            </Button>
            <div className="w-px h-6 bg-purple-200 mx-1" />
            <Input
              placeholder="Assign to…"
              value={assignTarget}
              onChange={(e) => setAssignTarget(e.target.value)}
              className="w-[160px] h-9"
            />
            <Button
              size="sm"
              variant="outline"
              disabled={!assignTarget.trim() || assignMutation.isPending}
              onClick={handleBulkAssign}
            >
              <UserPlus className="w-4 h-4 mr-1" />
              Assign
            </Button>
          </div>
          <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())} aria-label="Clear selection">
            <X className="w-4 h-4" />
          </Button>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="p-4 mb-4 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          {error instanceof Error ? error.message : "Failed to load queue"}
        </div>
      )}

      {/* Queue cards */}
      <div className="space-y-2">
        {/* Select-all row */}
        {data?.items && data.items.length > 0 && (
          <div className="flex items-center gap-3 px-4 py-2">
            <Checkbox
              checked={!!allSelected}
              onCheckedChange={toggleAll}
            />
            <span className="text-xs text-gray-500">Select all on this page</span>
          </div>
        )}

        {isLoading
          ? Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-20 bg-gray-100 rounded-lg animate-pulse" />
            ))
          : data?.items.length === 0
            ? (
                <div className="text-center py-16">
                  <ClipboardList className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                  <p className="text-sm text-gray-500 mb-1">No items in the review queue</p>
                  <p className="text-xs text-gray-400">Run an analysis or adjust filters to see findings here.</p>
                </div>
              )
            : data?.items.map((item) => (
                <div
                  key={item.id}
                  className={cn(
                    "flex items-start gap-3 p-4 rounded-lg border bg-white transition-colors",
                    selected.has(item.id)
                      ? "border-purple-300 bg-purple-50/30"
                      : "border-gray-200 hover:border-gray-300"
                  )}
                >
                  <Checkbox
                    checked={selected.has(item.id)}
                    onCheckedChange={() => toggleSelect(item.id)}
                    className="mt-1"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium text-gray-900 truncate">
                        {item.finding_entity_name ?? `Finding #${item.finding_id}`}
                      </span>
                      <SeverityBadge severity={item.priority} />
                      {item.assigned_to && (
                        <span className="text-[11px] text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
                          {item.assigned_to}
                        </span>
                      )}
                      <span
                        className={cn(
                          "text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full",
                          item.status === "pending"
                            ? "bg-yellow-100 text-yellow-700"
                            : item.status === "assigned"
                              ? "bg-blue-100 text-blue-700"
                              : "bg-emerald-100 text-emerald-700"
                        )}
                      >
                        {item.status}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-gray-500 line-clamp-2">
                      {item.finding_description ?? item.finding_subcategory ?? "—"}
                    </p>
                    {item.composite_score != null && (
                      <div className="mt-2 w-40">
                        <ScoreBar score={item.composite_score} />
                      </div>
                    )}
                  </div>

                  {/* Quick dispose */}
                  <div className="shrink-0 flex items-center gap-2">
                    <DispositionSelect
                      onValueChange={(d) => handleQuickDispose(item, d)}
                      placeholder="Dispose"
                      className="w-[150px] h-8 text-xs"
                    />
                  </div>
                </div>
              ))}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4">
          <span className="text-sm text-gray-500">
            Page {page} of {totalPages}
          </span>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}
      {/* Confirm dialogs */}
      <ConfirmDialog
        open={confirmBulk}
        onOpenChange={setConfirmBulk}
        title="Bulk Dispose Findings"
        description={`Dispose ${selected.size} finding${selected.size === 1 ? "" : "s"} as ${bulkDisposition?.replace(/_/g, " ") ?? ""}?`}
        confirmLabel="Dispose"
        onConfirm={confirmBulkDispose}
        loading={bulkDisposeMutation.isPending}
      />

      <ConfirmDialog
        open={!!quickDisposeTarget}
        onOpenChange={(open) => { if (!open) setQuickDisposeTarget(null) }}
        title="Dispose Finding"
        description={`Dispose this finding as ${quickDisposeTarget?.disposition.replace(/_/g, " ") ?? ""}?`}
        confirmLabel="Dispose"
        onConfirm={confirmQuickDispose}
        loading={disposeMutation.isPending}
      />
    </WasteShell>
  )
}

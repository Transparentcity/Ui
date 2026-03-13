"use client"

import { useState, useMemo, useCallback } from "react"
import {
  useWasteReviewQueue,
  useAssignWasteQueueItem,
  useBulkDisposeWasteFindings,
  useCreateWasteDisposition,
} from "@/lib/hooks/useWaste"
import { useWasteCity } from "./WasteCityContext"
import { WasteShell } from "./waste-shell"
import { InvestigationsShell } from "./investigations-shell"
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
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  UserPlus,
  X,
  Loader2,
  ClipboardList,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import type { WasteDispositionType, WasteReviewQueueItem } from "@/lib/apiClient"
import { TCScoreBadge } from "./tc-score-badge"
import { EnhancedLearningLoop } from "./model-health"

// ── Constants ───────────────────────────────────────────────────────────────

const DISPOSITION_BUTTONS: { value: WasteDispositionType; label: string; color: string }[] = [
  { value: "confirmed_fraud", label: "Fraud", color: "bg-red-50 text-red-700 border-red-200 hover:bg-red-100" },
  { value: "confirmed_waste", label: "Waste", color: "bg-orange-50 text-orange-700 border-orange-200 hover:bg-orange-100" },
  { value: "policy_violation", label: "Abuse", color: "bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100" },
  { value: "data_error", label: "Clerical", color: "bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100" },
  { value: "inconclusive", label: "Acceptable", color: "bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100" },
  { value: "false_positive", label: "False Pos.", color: "bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100" },
]

type SegmentTab = "all" | "department" | "category" | "severity" | "analyst"

const SEGMENT_TABS: { key: SegmentTab; label: string }[] = [
  { key: "all", label: "All" },
  { key: "department", label: "By Department" },
  { key: "category", label: "By Category" },
  { key: "severity", label: "By Severity" },
  { key: "analyst", label: "By Analyst" },
]

// ── Queue Item Card ─────────────────────────────────────────────────────────

function QueueItemCard({
  item,
  cityId,
  isSelected,
  onToggle,
}: {
  item: WasteReviewQueueItem
  cityId: number
  isSelected: boolean
  onToggle: () => void
}) {
  const [disposedAs, setDisposedAs] = useState<WasteDispositionType | null>(null)
  const [expanded, setExpanded] = useState(false)
  const disposeMutation = useCreateWasteDisposition()
  const assignMutation = useAssignWasteQueueItem()
  const [assignInput, setAssignInput] = useState("")
  const [showAssign, setShowAssign] = useState(false)

  const score = item.composite_score ?? 0

  const topSignals = useMemo(() => {
    const signals: string[] = []
    if (item.finding_description) {
      const sentences = item.finding_description
        .split(/[.;]/)
        .map((s) => s.trim())
        .filter((s) => s.length > 10)
      signals.push(...sentences.slice(0, 3))
    }
    if (signals.length === 0 && item.finding_subcategory) {
      signals.push(item.finding_subcategory)
    }
    return signals.slice(0, 3)
  }, [item.finding_description, item.finding_subcategory])

  const hasMoreDetail =
    (item.finding_description?.length ?? 0) > 120 ||
    topSignals.some((s) => s.length > 80)

  const handleDispose = useCallback(
    (disposition: WasteDispositionType) => {
      disposeMutation.mutate(
        {
          findingId: item.finding_id,
          data: { city_id: cityId, disposition },
        },
        {
          onSuccess: () => {
            setDisposedAs(disposition)
            toast.success("Disposition applied")
          },
          onError: () => toast.error("Failed to apply disposition"),
        }
      )
    },
    [item.finding_id, cityId, disposeMutation]
  )

  const handleAssign = useCallback(() => {
    if (!assignInput.trim()) return
    assignMutation.mutate(
      { itemId: item.id, cityId, assignedTo: assignInput.trim() },
      {
        onSuccess: () => {
          toast.success("Assigned")
          setShowAssign(false)
          setAssignInput("")
        },
        onError: () => toast.error("Failed to assign"),
      }
    )
  }, [item.id, cityId, assignInput, assignMutation])

  /* eslint-disable react-hooks/purity -- Date.now() is acceptable here for age display */
  const ageInDays = item.created_at
    ? Math.floor((Date.now() - new Date(item.created_at).getTime()) / (1000 * 60 * 60 * 24))
    : null
  /* eslint-enable react-hooks/purity */

  return (
    <div
      className={cn(
        "rounded-xl border bg-white p-5 transition-colors",
        isSelected
          ? "border-purple-300 bg-purple-50/20"
          : "border-gray-200 hover:border-gray-300"
      )}
    >
      <div className="flex gap-4">
        {/* Checkbox */}
        <div className="pt-1">
          <Checkbox
            checked={isSelected}
            onCheckedChange={onToggle}
          />
        </div>

        {/* Score badge */}
        <div className="shrink-0">
          <TCScoreBadge score={score} size="xl" showLabel />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          {/* Header row */}
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <button
                type="button"
                onClick={() => setExpanded(!expanded)}
                className="text-left group"
              >
                <p className="text-sm font-semibold text-gray-900 group-hover:text-purple-700 transition-colors">
                  {item.finding_entity_name ?? `Finding #${item.finding_id}`}
                </p>
              </button>
              <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                {item.finding_detector_key && (
                  <span className="text-[10px] font-mono text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">
                    {item.finding_detector_key}
                  </span>
                )}
                {item.finding_category && (
                  <span className="text-[10px] text-purple-600 bg-purple-50 px-1.5 py-0.5 rounded capitalize">
                    {item.finding_category}
                  </span>
                )}
                {item.assigned_to && (
                  <span className="text-[10px] text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">
                    {item.assigned_to}
                  </span>
                )}
                {ageInDays != null && (
                  <span className="text-[10px] text-gray-400">
                    {ageInDays === 0
                      ? "today"
                      : `${ageInDays}d in queue`}
                  </span>
                )}
                <span
                  className={cn(
                    "text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded-full",
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
            </div>

            {/* Expand / collapse toggle */}
            {hasMoreDetail && (
              <button
                type="button"
                onClick={() => setExpanded(!expanded)}
                className="shrink-0 p-1 rounded-md text-gray-400 hover:text-purple-600 hover:bg-purple-50 transition-colors"
                aria-label={expanded ? "Collapse details" : "Expand details"}
              >
                <ChevronDown
                  className={cn(
                    "w-4 h-4 transition-transform",
                    expanded && "rotate-180"
                  )}
                />
              </button>
            )}
          </div>

          {/* Top signals — always visible, full text when expanded */}
          {topSignals.length > 0 && (
            <div className="mt-2.5 space-y-1">
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
                Top Signals
              </p>
              {topSignals.map((signal, i) => (
                <div
                  key={i}
                  className="flex items-start gap-1.5 text-xs text-gray-700"
                >
                  <span className="text-red-400 mt-0.5 shrink-0 leading-none">&#x25cf;</span>
                  <span className={expanded ? "" : "line-clamp-2"}>{signal}</span>
                </div>
              ))}
            </div>
          )}

          {/* Expanded detail panel */}
          {expanded && item.finding_description && (
            <div className="mt-3 p-3 bg-gray-50 rounded-lg border border-gray-100">
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">
                Full Description
              </p>
              <p className="text-xs text-gray-700 leading-relaxed whitespace-pre-line">
                {item.finding_description}
              </p>
              {item.finding_subcategory && (
                <div className="mt-2 pt-2 border-t border-gray-200">
                  <span className="text-[10px] text-gray-500">Subcategory: </span>
                  <span className="text-[10px] font-medium text-gray-700 capitalize">
                    {item.finding_subcategory}
                  </span>
                </div>
              )}
              {item.finding_created_at && (
                <div className="mt-1">
                  <span className="text-[10px] text-gray-500">Finding date: </span>
                  <span className="text-[10px] font-medium text-gray-700">
                    {new Date(item.finding_created_at).toLocaleDateString()}
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Disposition buttons — immediately adjacent to score area */}
          {!disposedAs ? (
            <div className="mt-3">
              <div className="flex items-center gap-1.5 flex-wrap">
                {DISPOSITION_BUTTONS.map((btn) => (
                  <button
                    key={btn.value}
                    type="button"
                    disabled={disposeMutation.isPending}
                    onClick={() => handleDispose(btn.value)}
                    className={cn(
                      "px-2.5 py-1.5 rounded-md text-xs font-medium border transition-colors",
                      btn.color,
                      disposeMutation.isPending && "opacity-50 cursor-not-allowed"
                    )}
                  >
                    {btn.label}
                  </button>
                ))}
                <span className="w-px h-5 bg-gray-200 mx-0.5" />
                {/* Secondary actions */}
                <button
                  type="button"
                  onClick={() => setShowAssign(!showAssign)}
                  className="px-2 py-1.5 rounded-md text-xs text-gray-500 hover:bg-gray-100 transition-colors"
                >
                  <UserPlus className="w-3.5 h-3.5 inline mr-1" />
                  Assign
                </button>
              </div>

              {/* Assign inline */}
              {showAssign && (
                <div className="mt-2 flex items-center gap-2">
                  <Input
                    value={assignInput}
                    onChange={(e) => setAssignInput(e.target.value)}
                    placeholder="Auditor name or ID..."
                    className="h-8 text-xs w-48"
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={!assignInput.trim() || assignMutation.isPending}
                    onClick={handleAssign}
                    className="h-8 text-xs"
                  >
                    {assignMutation.isPending ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      "Assign"
                    )}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setShowAssign(false)}
                    className="h-8 text-xs"
                  >
                    Cancel
                  </Button>
                </div>
              )}
            </div>
          ) : (
            /* Enhanced learning loop — shows affected detectors after disposition */
            <EnhancedLearningLoop
              disposition={disposedAs}
              detectorKey={item.finding_detector_key}
              category={item.finding_category}
              cityId={cityId}
            />
          )}
        </div>
      </div>
    </div>
  )
}

// ── Main Page ───────────────────────────────────────────────────────────────

export function ReviewQueuePage() {
  const [page, setPage] = useState(1)
  const [perPage] = useState(25)
  const [statusFilter, setStatusFilter] = useState<string>("")
  const [priorityFilter, setPriorityFilter] = useState<string>("")
  const [segmentTab, setSegmentTab] = useState<SegmentTab>("all")
  const [segmentValue, setSegmentValue] = useState<string>("")
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [bulkDisposition, setBulkDisposition] = useState<WasteDispositionType | undefined>()
  const [confirmBulk, setConfirmBulk] = useState(false)

  const { selectedCityId } = useWasteCity()

  const { data, isLoading, error } = useWasteReviewQueue({
    cityId: selectedCityId,
    status: statusFilter || undefined,
    priority: priorityFilter || undefined,
    page,
    perPage,
  })

  const bulkDisposeMutation = useBulkDisposeWasteFindings()

  // Segmented view: group items client-side
  const groupedItems = useMemo(() => {
    if (!data?.items) return null
    if (segmentTab === "all") return null

    const groups = new Map<string, WasteReviewQueueItem[]>()
    data.items.forEach((item) => {
      let key: string
      switch (segmentTab) {
        case "department":
          key = item.finding_entity_name?.split(" - ")[0] ?? "Unknown"
          break
        case "category":
          key = item.finding_category ?? "Uncategorized"
          break
        case "severity":
          key = item.priority ?? "medium"
          break
        case "analyst":
          key = item.assigned_to ?? "Unassigned"
          break
        default:
          key = "All"
      }
      if (!groups.has(key)) groups.set(key, [])
      groups.get(key)!.push(item)
    })
    return groups
  }, [data, segmentTab])

  // Filter by segment value
  const displayItems = useMemo(() => {
    if (!data?.items) return []
    if (segmentTab === "all" || !segmentValue) return data.items
    if (!groupedItems) return data.items
    return groupedItems.get(segmentValue) ?? []
  }, [data, segmentTab, segmentValue, groupedItems])

  const toggleSelect = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const toggleAll = useCallback(() => {
    setSelected((prev) => {
      if (prev.size === displayItems.length) return new Set()
      return new Set(displayItems.map((i) => i.id))
    })
  }, [displayItems])

  const confirmBulkDispose = useCallback(() => {
    if (!selectedCityId || !bulkDisposition || selected.size === 0) return
    const findingIds =
      data?.items
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

  const totalPages = data ? Math.ceil(data.total / perPage) : 0
  const allSelected =
    displayItems.length > 0 && selected.size === displayItems.length

  return (
    <WasteShell title="Investigations" description="Score-first auditor workbench">
      <InvestigationsShell title="Review Queue">
      {/* Segmentation tabs */}
      <div className="flex items-center gap-0 mb-4 border-b border-gray-200 overflow-x-auto scrollbar-hide -mt-1">
        {SEGMENT_TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => {
              setSegmentTab(tab.key)
              setSegmentValue("")
            }}
            className={cn(
              "px-3 py-2 text-sm font-medium whitespace-nowrap border-b-2 transition-colors",
              segmentTab === tab.key
                ? "text-purple-600 border-purple-600"
                : "text-gray-500 border-transparent hover:text-gray-900 hover:border-gray-300"
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Segment group selector — when a segmented view is active */}
      {segmentTab !== "all" && groupedItems && groupedItems.size > 0 && (
        <div className="flex items-center gap-2 flex-wrap mb-4">
          <button
            type="button"
            onClick={() => setSegmentValue("")}
            className={cn(
              "px-2.5 py-1 rounded-full text-xs font-medium border transition-colors",
              !segmentValue
                ? "bg-purple-600 text-white border-purple-600"
                : "bg-white text-gray-600 border-gray-200 hover:border-purple-300"
            )}
          >
            All ({data?.items.length ?? 0})
          </button>
          {[...groupedItems.entries()]
            .sort((a, b) => b[1].length - a[1].length)
            .map(([key, items]) => (
              <button
                key={key}
                type="button"
                onClick={() => setSegmentValue(key)}
                className={cn(
                  "px-2.5 py-1 rounded-full text-xs font-medium border transition-colors capitalize",
                  segmentValue === key
                    ? "bg-purple-600 text-white border-purple-600"
                    : "bg-white text-gray-600 border-gray-200 hover:border-purple-300"
                )}
              >
                {key} ({items.length})
              </button>
            ))}
        </div>
      )}

      {/* Filters row */}
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <Select
          value={statusFilter || "all"}
          onValueChange={(v) => {
            setStatusFilter(v === "all" ? "" : v)
            setPage(1)
          }}
        >
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="assigned">Assigned</SelectItem>
            <SelectItem value="disposed">Disposed</SelectItem>
          </SelectContent>
        </Select>

        <Select
          value={priorityFilter || "all"}
          onValueChange={(v) => {
            setPriorityFilter(v === "all" ? "" : v)
            setPage(1)
          }}
        >
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="All score tiers" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All score tiers</SelectItem>
            <SelectItem value="critical">Critical (81–100)</SelectItem>
            <SelectItem value="high">High (61–80)</SelectItem>
            <SelectItem value="medium">Medium (31–60)</SelectItem>
            <SelectItem value="low">Low (0–30)</SelectItem>
          </SelectContent>
        </Select>

        {data && (
          <span className="text-sm text-gray-500 ml-auto tabular-nums">
            {displayItems.length} of {data.total} items
          </span>
        )}
      </div>

      {/* Bulk actions bar */}
      {selected.size > 0 && (
        <div className="flex items-center gap-3 p-3 mb-4 bg-purple-50 border border-purple-200 rounded-lg flex-wrap">
          <span className="text-sm font-medium text-purple-800">
            {selected.size} selected
          </span>
          <div className="flex items-center gap-2 flex-wrap">
            {DISPOSITION_BUTTONS.slice(0, 4).map((btn) => (
              <button
                key={btn.value}
                type="button"
                onClick={() => {
                  setBulkDisposition(btn.value)
                  setConfirmBulk(true)
                }}
                className={cn(
                  "px-2.5 py-1.5 rounded-md text-xs font-medium border transition-colors",
                  btn.color
                )}
              >
                {btn.label}
              </button>
            ))}
            <Select
              value={bulkDisposition}
              onValueChange={(v) => {
                setBulkDisposition(v as WasteDispositionType)
                setConfirmBulk(true)
              }}
            >
              <SelectTrigger className="w-[130px] h-8 text-xs">
                <SelectValue placeholder="More..." />
              </SelectTrigger>
              <SelectContent>
                {DISPOSITION_BUTTONS.map((btn) => (
                  <SelectItem key={btn.value} value={btn.value}>
                    {btn.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setSelected(new Set())}
            className="ml-auto"
            aria-label="Clear selection"
          >
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

      {/* Queue items */}
      <div className="space-y-3">
        {/* Select-all */}
        {displayItems.length > 0 && (
          <div className="flex items-center gap-3 px-4 py-1">
            <Checkbox
              checked={!!allSelected}
              onCheckedChange={toggleAll}
            />
            <span className="text-xs text-gray-500">
              Select all on this page
            </span>
          </div>
        )}

        {isLoading
          ? Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                className="h-28 bg-gray-100 rounded-xl animate-pulse"
              />
            ))
          : displayItems.length === 0
            ? (
                <div className="text-center py-16">
                  <ClipboardList className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                  <p className="text-sm text-gray-500 mb-1">
                    No items in the review queue
                  </p>
                  <p className="text-xs text-gray-400">
                    Run an analysis or adjust filters to see findings here.
                  </p>
                </div>
              )
            : displayItems.map((item) => (
                <QueueItemCard
                  key={item.id}
                  item={item}
                  cityId={selectedCityId}
                  isSelected={selected.has(item.id)}
                  onToggle={() => toggleSelect(item.id)}
                />
              ))}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4">
          <span className="text-sm text-gray-500">
            Page {page} of {totalPages}
          </span>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
            >
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
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
      </InvestigationsShell>
    </WasteShell>
  )
}

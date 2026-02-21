"use client"

import { useState, useMemo, useCallback } from "react"
import { useWasteEntityScores } from "@/lib/hooks/useWaste"
import { useCities } from "@/lib/hooks/useCities"
import { WasteShell } from "./waste-shell"
import { SeverityBadge } from "./severity-badge"
import { ScoreBar } from "./score-bar"
import {
  Table,
  TableHeader,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
} from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import {
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  X,
} from "lucide-react"
import { cn } from "@/lib/utils"
import type { WasteEntityScore } from "@/lib/apiClient"

type SortField = "composite_score" | "severity_tier" | "signal_count"

const SEVERITY_ORDER: Record<string, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
  info: 4,
}

export function EntityScoresPage() {
  const [page, setPage] = useState(1)
  const [perPage] = useState(25)
  const [severityFilter, setSeverityFilter] = useState<string>("")
  const [entityTypeFilter, setEntityTypeFilter] = useState<string>("")
  const [sortBy, setSortBy] = useState<SortField>("composite_score")
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc")
  const [selectedEntity, setSelectedEntity] = useState<WasteEntityScore | null>(null)

  const citiesQuery = useCities({ includeInactive: false })
  const selectedCityId = useMemo(() => {
    const eligible = (citiesQuery.data ?? []).filter((c) => (c.datasets_count ?? 0) > 0)
    return eligible.length > 0 ? Number(eligible[0].city_id) : null
  }, [citiesQuery.data])

  const { data, isLoading, error } = useWasteEntityScores({
    cityId: selectedCityId,
    page,
    perPage,
    severityTier: severityFilter || undefined,
    entityType: entityTypeFilter || undefined,
    sortBy,
    sortDir,
  })

  const toggleSort = useCallback(
    (field: SortField) => {
      if (sortBy === field) {
        setSortDir((d) => (d === "asc" ? "desc" : "asc"))
      } else {
        setSortBy(field)
        setSortDir("desc")
      }
      setPage(1)
    },
    [sortBy]
  )

  const totalPages = data ? Math.ceil(data.total / perPage) : 0

  const sortedItems = useMemo(() => {
    if (!data?.items) return []
    const items = [...data.items]
    items.sort((a, b) => {
      let cmp = 0
      if (sortBy === "composite_score") cmp = a.composite_score - b.composite_score
      else if (sortBy === "signal_count") cmp = a.signal_count - b.signal_count
      else if (sortBy === "severity_tier")
        cmp = (SEVERITY_ORDER[a.severity_tier] ?? 4) - (SEVERITY_ORDER[b.severity_tier] ?? 4)
      return sortDir === "desc" ? -cmp : cmp
    })
    return items
  }, [data?.items, sortBy, sortDir])

  const SortHeader = ({
    field,
    children,
  }: {
    field: SortField
    children: React.ReactNode
  }) => (
    <button
      type="button"
      onClick={() => toggleSort(field)}
      className="inline-flex items-center gap-1 hover:text-gray-900 transition-colors"
    >
      {children}
      <ArrowUpDown className={cn("w-3 h-3", sortBy === field ? "text-purple-600" : "text-gray-400")} />
    </button>
  )

  return (
    <WasteShell title="Entity Risk Scores" description="Composite risk scores across all monitored entities">
      {/* Filters */}
      <div className="flex items-center gap-3 mb-6 flex-wrap">
        <Select value={severityFilter} onValueChange={(v) => { setSeverityFilter(v === "all" ? "" : v); setPage(1) }}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="All severities" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All severities</SelectItem>
            <SelectItem value="critical">Critical</SelectItem>
            <SelectItem value="high">High</SelectItem>
            <SelectItem value="medium">Medium</SelectItem>
            <SelectItem value="low">Low</SelectItem>
            <SelectItem value="info">Info</SelectItem>
          </SelectContent>
        </Select>

        <Select value={entityTypeFilter} onValueChange={(v) => { setEntityTypeFilter(v === "all" ? "" : v); setPage(1) }}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="All entity types" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All types</SelectItem>
            <SelectItem value="vendor">Vendor</SelectItem>
            <SelectItem value="employee">Employee</SelectItem>
            <SelectItem value="department">Department</SelectItem>
            <SelectItem value="nonprofit">Nonprofit</SelectItem>
          </SelectContent>
        </Select>

        {data && (
          <span className="text-sm text-gray-500 ml-auto">
            {data.total} entities
          </span>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="p-4 mb-6 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          {error instanceof Error ? error.message : "Failed to load scores"}
        </div>
      )}

      {/* Table */}
      <div className="rounded-lg border border-gray-200 bg-white">
        <Table>
          <TableHeader>
            <TableRow className="bg-gray-50">
              <TableHead>Entity Name</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>
                <SortHeader field="composite_score">Score</SortHeader>
              </TableHead>
              <TableHead>
                <SortHeader field="severity_tier">Severity</SortHeader>
              </TableHead>
              <TableHead>
                <SortHeader field="signal_count">Signals</SortHeader>
              </TableHead>
              <TableHead>Top Detector</TableHead>
              <TableHead>Last Scored</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 8 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 7 }).map((_, j) => (
                    <TableCell key={j}>
                      <div className="h-4 bg-gray-100 rounded animate-pulse" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : sortedItems.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-12 text-gray-500">
                  No entity scores found
                </TableCell>
              </TableRow>
            ) : (
              sortedItems.map((entity) => (
                <TableRow
                  key={entity.id}
                  className="cursor-pointer"
                  onClick={() => setSelectedEntity(entity)}
                >
                  <TableCell className="font-medium">{entity.entity_name}</TableCell>
                  <TableCell className="capitalize text-gray-500">{entity.entity_type}</TableCell>
                  <TableCell className="w-[140px]">
                    <ScoreBar score={entity.composite_score} />
                  </TableCell>
                  <TableCell>
                    <SeverityBadge severity={entity.severity_tier} />
                  </TableCell>
                  <TableCell className="tabular-nums">{entity.signal_count}</TableCell>
                  <TableCell className="text-gray-500 text-xs">
                    {entity.top_detector?.replace(/_/g, " ") ?? "—"}
                  </TableCell>
                  <TableCell className="text-gray-400 text-xs">
                    {entity.scored_at
                      ? new Date(entity.scored_at).toLocaleDateString()
                      : "—"}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
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

      {/* Detail Drawer */}
      <Dialog open={!!selectedEntity} onOpenChange={(open) => { if (!open) setSelectedEntity(null) }}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          {selectedEntity && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  {selectedEntity.entity_name}
                  <SeverityBadge severity={selectedEntity.severity_tier} />
                </DialogTitle>
                <DialogDescription>
                  {selectedEntity.entity_type} &middot; Score: {Math.round(selectedEntity.composite_score)}
                </DialogDescription>
              </DialogHeader>

              {/* Score breakdown */}
              <div className="mt-4">
                <h4 className="text-sm font-semibold text-gray-700 mb-3">
                  Signal Breakdown
                </h4>
                {selectedEntity.signals.length === 0 ? (
                  <p className="text-xs text-gray-400">No signals recorded</p>
                ) : (
                  <div className="space-y-2">
                    {selectedEntity.signals
                      .sort((a, b) => b.weighted_score - a.weighted_score)
                      .map((sig, i) => (
                        <div key={i} className="flex items-center gap-2">
                          <span className="text-xs text-gray-600 w-32 truncate">
                            {sig.detector_key.replace(/_/g, " ")}
                          </span>
                          <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-purple-500 rounded-full"
                              style={{
                                width: `${Math.min(100, (sig.weighted_score / selectedEntity.composite_score) * 100)}%`,
                              }}
                            />
                          </div>
                          <span className="text-xs text-gray-500 tabular-nums w-10 text-right">
                            {sig.weighted_score.toFixed(1)}
                          </span>
                        </div>
                      ))}
                  </div>
                )}
              </div>

              {/* Linked findings */}
              {selectedEntity.findings.length > 0 && (
                <div className="mt-6">
                  <h4 className="text-sm font-semibold text-gray-700 mb-2">
                    Linked Findings ({selectedEntity.findings.length})
                  </h4>
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {selectedEntity.findings.map((f) => (
                      <div key={f.id} className="p-2 rounded border border-gray-100 text-xs">
                        <div className="flex items-center gap-2">
                          <SeverityBadge severity={f.severity} />
                          <span className="font-medium text-gray-800 truncate">
                            {f.subcategory}
                          </span>
                        </div>
                        <p className="mt-1 text-gray-500 line-clamp-2">
                          {f.description}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Disposition history */}
              {selectedEntity.dispositions.length > 0 && (
                <div className="mt-6">
                  <h4 className="text-sm font-semibold text-gray-700 mb-2">
                    Disposition History
                  </h4>
                  <div className="space-y-1">
                    {selectedEntity.dispositions.map((d) => (
                      <div key={d.id} className="flex items-center justify-between text-xs py-1">
                        <span className="capitalize text-gray-700">
                          {d.disposition.replace(/_/g, " ")}
                        </span>
                        <span className="text-gray-400">
                          {d.created_at ? new Date(d.created_at).toLocaleDateString() : ""}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <Button
                variant="outline"
                size="sm"
                className="mt-4"
                onClick={() => setSelectedEntity(null)}
              >
                <X className="w-4 h-4 mr-1" /> Close
              </Button>
            </>
          )}
        </DialogContent>
      </Dialog>
    </WasteShell>
  )
}

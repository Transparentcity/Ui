"use client"

import { useState, useMemo, useCallback } from "react"
import {
  useWasteDepartmentRisk,
  useWasteEntityScores,
  useWasteTrustMetrics,
} from "@/lib/hooks/useWaste"
import { useWasteCity } from "./WasteCityContext"
import { WasteShell } from "./waste-shell"
import { SeverityBadge } from "./severity-badge"
import { ScoreBar } from "./score-bar"
import { ScoreExplainer } from "./score-explainer"
import { TrustMetricsSnapshot } from "./trust-metrics-snapshot"
import { TrustDetectorTable } from "./trust-detector-table"
import { DepartmentTrustTable } from "./department-trust-table"
import { TrustMethodologyNote } from "./trust-methodology-note"
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
  Target,
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

const DETECTOR_LABEL_OVERRIDES: Record<string, string> = {
  vendor_d10_contract_drift: "Contract drift",
  vendor_d9_ghost: "Ghost vendor",
  vendor_d8_split_pos: "Split purchase orders",
  vendor_d11_short_bids: "Short bid window",
  vendor_d19_sole_source: "Sole-source concentration",
  payroll_d1_ot_ratio: "Overtime ratio",
  payroll_d2_pareto: "Pay concentration",
  payroll_d6_hours: "Hours feasibility",
  integrity_rd1_revolving_door: "Revolving door",
  influence_d18_pay_to_play: "Pay-to-play overlap",
}

function toTitleCase(text: string): string {
  return text
    .split(" ")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ")
}

function formatDetectorLabel(detectorKey?: string | null): string {
  const normalized = String(detectorKey || "").trim().toLowerCase()
  if (!normalized) return "—"
  if (DETECTOR_LABEL_OVERRIDES[normalized]) {
    return DETECTOR_LABEL_OVERRIDES[normalized]
  }
  const withoutDomain = normalized.replace(
    /^(vendor|payroll|infrastructure|integrity|influence|nonprofit)_/,
    ""
  )
  const withoutIndex = withoutDomain
    .replace(/^(rd\d+|np\d+|d\d+[a-z]?|i\d+)_/, "")
    .replace(/_/g, " ")

  return toTitleCase(withoutIndex || normalized.replace(/_/g, " "))
}

function SortHeader({
  field,
  activeField,
  onToggle,
  children,
}: {
  field: SortField
  activeField: SortField
  onToggle: (field: SortField) => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={() => onToggle(field)}
      className={cn(
        "inline-flex items-center gap-1 hover:text-gray-900 transition-colors",
        activeField === field && "text-purple-700 font-semibold"
      )}
    >
      {children}
      <ArrowUpDown className={cn("w-3 h-3", activeField === field ? "text-purple-600" : "text-gray-400")} />
    </button>
  )
}

export function EntityScoresPage() {
  const [page, setPage] = useState(1)
  const [perPage] = useState(25)
  const [severityFilter, setSeverityFilter] = useState<string>("")
  const [entityTypeFilter, setEntityTypeFilter] = useState<string>("")
  const [sortBy, setSortBy] = useState<SortField>("composite_score")
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc")
  const [selectedEntity, setSelectedEntity] = useState<WasteEntityScore | null>(null)

  const { selectedCityId } = useWasteCity()

  const { data, isLoading, error } = useWasteEntityScores({
    cityId: selectedCityId,
    page,
    perPage,
    severityTier: severityFilter || undefined,
    entityType: entityTypeFilter || undefined,
    sortBy,
    sortDir,
  })
  const {
    data: trustMetrics,
    isLoading: trustLoading,
    error: trustError,
  } = useWasteTrustMetrics({
    cityId: selectedCityId,
    detectorPrecisionLimit: 10,
    detectorPrecisionMinFindings: 5,
  })
  const {
    data: departmentRisk,
    isLoading: departmentRiskLoading,
    error: departmentRiskError,
  } = useWasteDepartmentRisk({
    cityId: selectedCityId,
    page: 1,
    perPage: 8,
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

  const items = data?.items
  const sortedItems = useMemo(() => {
    if (!items) return []
    const sorted = [...items]
    sorted.sort((a, b) => {
      let cmp = 0
      if (sortBy === "composite_score") cmp = a.composite_score - b.composite_score
      else if (sortBy === "signal_count") cmp = a.signal_count - b.signal_count
      else if (sortBy === "severity_tier")
        cmp = (SEVERITY_ORDER[a.severity_tier] ?? 4) - (SEVERITY_ORDER[b.severity_tier] ?? 4)
      return sortDir === "desc" ? -cmp : cmp
    })
    return sorted
  }, [items, sortBy, sortDir])

  return (
    <WasteShell title="Entity Risk Scores" description="Composite risk scores across all monitored entities">
      <div className="mb-6 space-y-4">
        <TrustMetricsSnapshot
          metrics={trustMetrics}
          isLoading={trustLoading}
          errorMessage={trustError instanceof Error ? trustError.message : null}
        />
        <DepartmentTrustTable
          data={departmentRisk}
          isLoading={departmentRiskLoading}
          errorMessage={
            departmentRiskError instanceof Error ? departmentRiskError.message : null
          }
        />
        <TrustDetectorTable
          metrics={trustMetrics}
          isLoading={trustLoading}
          errorMessage={trustError instanceof Error ? trustError.message : null}
          maxRows={10}
        />
        <TrustMethodologyNote />
      </div>

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
            <SelectItem value="vendor">Vendor / Nonprofit</SelectItem>
            <SelectItem value="employee">Employee</SelectItem>
            <SelectItem value="department">Department</SelectItem>
            <SelectItem value="location">Location</SelectItem>
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
                <SortHeader field="composite_score" activeField={sortBy} onToggle={toggleSort}>Score</SortHeader>
              </TableHead>
              <TableHead>
                <SortHeader field="severity_tier" activeField={sortBy} onToggle={toggleSort}>Severity</SortHeader>
              </TableHead>
              <TableHead>
                <SortHeader field="signal_count" activeField={sortBy} onToggle={toggleSort}>Signals</SortHeader>
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
                <TableCell colSpan={7} className="text-center py-12">
                  <Target className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                  <p className="text-sm text-gray-500 mb-1">No entity scores found</p>
                  <p className="text-xs text-gray-400">Run a waste analysis to generate entity risk scores.</p>
                </TableCell>
              </TableRow>
            ) : (
              sortedItems.map((entity) => (
                <TableRow
                  key={entity.id}
                  tabIndex={0}
                  role="button"
                  className="cursor-pointer focus-visible:ring-2 focus-visible:ring-purple-500 focus-visible:ring-inset outline-none"
                  onClick={() => setSelectedEntity(entity)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault()
                      setSelectedEntity(entity)
                    }
                  }}
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
                  <TableCell
                    className="text-gray-500 text-xs"
                    title={entity.top_detector ?? undefined}
                  >
                    {formatDetectorLabel(entity.top_detector)}
                  </TableCell>
                  <TableCell className="text-gray-400 text-xs">
                    {entity.last_scored_at
                      ? new Date(entity.last_scored_at).toLocaleDateString()
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
                  {selectedEntity.entity_type} &middot; TC Score {selectedEntity.composite_score.toFixed(1)}
                  {selectedEntity.composite_score >= 100 ? " (max risk priority)" : ""}
                </DialogDescription>
              </DialogHeader>

              <ScoreExplainer
                entityName={selectedEntity.entity_name}
                score={selectedEntity.composite_score}
                signals={selectedEntity.signals}
                signalCount={selectedEntity.signal_count}
                scoreDelta={selectedEntity.score_delta}
                className="mt-4"
              />

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

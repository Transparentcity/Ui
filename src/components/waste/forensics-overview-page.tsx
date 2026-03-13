"use client"

import { useState, useMemo } from "react"
import Link from "next/link"
import {
  useLatestPersistedWasteResult,
  useLatestWasteTrustReport,
  useWasteBenchmarkSummary,
  useWasteCityMethodology,
  useWasteTrustReportRunner,
  useWasteTrustMetrics,
} from "@/lib/hooks/useWaste"
import type { WasteFinding } from "@/lib/apiClient"
import { WasteShell } from "./waste-shell"
import { ForensicsShell } from "./forensics-shell"
import { Button } from "@/components/ui/button"
import {
  normalizeWasteCategory,
  formatDollar,
  getWasteCategoryLabel,
} from "./waste-utils"
import { TCScoreBadge } from "./tc-score-badge"
import { useWasteCity } from "./WasteCityContext"
import { cn } from "@/lib/utils"
import {
  ArrowRight,
  Search,
  Filter,
  X,
  ShieldCheck,
  SlidersHorizontal,
  TrendingDown,
  RefreshCw,
  Clock3,
  AlertTriangle,
  MapPinned,
  BarChart3,
} from "lucide-react"

// ── Helpers ─────────────────────────────────────────────────────────────────

function severityBadge(severity: string) {
  const colors: Record<string, string> = {
    critical: "bg-red-100 text-red-700",
    high: "bg-orange-100 text-orange-700",
    medium: "bg-amber-100 text-amber-700",
    low: "bg-green-100 text-green-700",
  }
  return colors[severity?.toLowerCase()] ?? "bg-gray-100 text-gray-600"
}

// ── Filters ─────────────────────────────────────────────────────────────────

interface Filters {
  severity: string
  category: string
  department: string
  entity: string
}

const EMPTY_FILTERS: Filters = {
  severity: "",
  category: "",
  department: "",
  entity: "",
}

function FilterBar({
  filters,
  onChange,
  departments,
  categories,
}: {
  filters: Filters
  onChange: (f: Filters) => void
  departments: string[]
  categories: string[]
}) {
  const hasFilters = Object.values(filters).some(Boolean)
  const chips = [
    filters.severity ? `Severity: ${filters.severity}` : null,
    filters.category ? `Category: ${getWasteCategoryLabel(filters.category)}` : null,
    filters.department ? `Department: ${filters.department}` : null,
    filters.entity ? `Entity: ${filters.entity}` : null,
  ].filter(Boolean) as string[]
  return (
    <div className="mb-5">
      <div className="flex items-center gap-2 flex-wrap mb-2">
      <Filter className="w-4 h-4 text-gray-400 shrink-0" />
      <select
        value={filters.severity}
        onChange={(e) => onChange({ ...filters, severity: e.target.value })}
        className="text-xs border border-gray-200 rounded-md px-2 py-1.5 bg-white text-gray-700"
      >
        <option value="">All Severities</option>
        <option value="critical">Critical</option>
        <option value="high">High</option>
        <option value="medium">Medium</option>
        <option value="low">Low</option>
      </select>
      <select
        value={filters.category}
        onChange={(e) => onChange({ ...filters, category: e.target.value })}
        className="text-xs border border-gray-200 rounded-md px-2 py-1.5 bg-white text-gray-700"
      >
        <option value="">All Categories</option>
        {categories.map((c) => (
          <option key={c} value={c}>
            {getWasteCategoryLabel(c)}
          </option>
        ))}
      </select>
      <select
        value={filters.department}
        onChange={(e) => onChange({ ...filters, department: e.target.value })}
        className="text-xs border border-gray-200 rounded-md px-2 py-1.5 bg-white text-gray-700"
      >
        <option value="">All Departments</option>
        {departments.map((d) => (
          <option key={d} value={d}>
            {d}
          </option>
        ))}
      </select>
      <div className="relative">
        <input
          type="text"
          value={filters.entity}
          onChange={(e) => onChange({ ...filters, entity: e.target.value })}
          placeholder="Search entity..."
          className="text-xs border border-gray-200 rounded-md px-2 py-1.5 bg-white text-gray-700 w-36 pl-7"
        />
        <Search className="w-3 h-3 text-gray-400 absolute left-2 top-1/2 -translate-y-1/2" />
      </div>
      {hasFilters && (
        <button
          type="button"
          onClick={() => onChange(EMPTY_FILTERS)}
          className="text-xs text-gray-500 hover:text-gray-700 flex items-center gap-1"
        >
          <X className="w-3 h-3" />
          Clear
        </button>
      )}
      </div>
      {chips.length > 0 && (
        <div className="flex items-center gap-1.5 flex-wrap">
          {chips.map((chip) => (
            <span
              key={chip}
              className="text-[11px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-600"
            >
              {chip}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Category Breakdown ──────────────────────────────────────────────────────

function CategoryBreakdown({ findings }: { findings: WasteFinding[] }) {
  const byCat = useMemo(() => {
    const counts: Record<string, number> = {}
    findings.forEach((f) => {
      const cat = normalizeWasteCategory(f.category)
      counts[cat] = (counts[cat] ?? 0) + 1
    })
    return Object.entries(counts).sort((a, b) => b[1] - a[1])
  }, [findings])

  const bySev = useMemo(() => {
    const counts: Record<string, number> = {
      critical: 0,
      high: 0,
      medium: 0,
      low: 0,
    }
    findings.forEach((f) => {
      const sev = f.severity?.toLowerCase() ?? "low"
      if (sev in counts) counts[sev]++
    })
    return Object.entries(counts).filter(([, v]) => v > 0)
  }, [findings])

  const maxCat = byCat.length > 0 ? byCat[0][1] : 1
  const maxSev = bySev.length > 0 ? Math.max(...bySev.map(([, v]) => v)) : 1

  const catColors: Record<string, string> = {
    payroll: "bg-indigo-500",
    contracts: "bg-orange-500",
    infrastructure: "bg-teal-500",
    influence: "bg-pink-500",
    integrity: "bg-purple-500",
    confirmed: "bg-red-500",
    convergence: "bg-yellow-500",
  }

  const sevColors: Record<string, string> = {
    critical: "bg-red-500",
    high: "bg-orange-500",
    medium: "bg-amber-500",
    low: "bg-green-500",
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
      <div className="bg-white rounded-lg border border-gray-200 p-5">
        <h3 className="text-sm font-semibold text-gray-700 mb-3">
          By Category
        </h3>
        <div className="space-y-2">
          {byCat.map(([cat, count]) => (
            <Link
              key={cat}
              href={`/waste/forensics/categories/${cat}`}
              className="flex items-center gap-2 no-underline hover:bg-gray-50 rounded px-1 py-0.5"
            >
              <span className="text-xs text-gray-600 w-24 truncate capitalize">
                {getWasteCategoryLabel(cat)}
              </span>
              <div className="flex-1 h-2.5 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className={cn(
                    "h-full rounded-full",
                    catColors[cat] ?? "bg-gray-400"
                  )}
                  style={{
                    width: `${Math.round((count / maxCat) * 100)}%`,
                  }}
                />
              </div>
              <span className="text-xs text-gray-500 tabular-nums w-8 text-right">
                {count}
              </span>
            </Link>
          ))}
        </div>
        <Link
          href="/waste/forensics/categories"
          className="mt-3 flex items-center gap-1 text-xs font-medium text-purple-600 no-underline hover:text-purple-700"
        >
          Drill into categories <ArrowRight className="w-3 h-3" />
        </Link>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 p-5">
        <h3 className="text-sm font-semibold text-gray-700 mb-3">
          By Severity
        </h3>
        <div className="space-y-2">
          {bySev.map(([sev, count]) => (
            <div key={sev} className="flex items-center gap-2">
              <span className="text-xs text-gray-600 w-16 capitalize">
                {sev}
              </span>
              <div className="flex-1 h-2.5 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className={cn(
                    "h-full rounded-full",
                    sevColors[sev] ?? "bg-gray-400"
                  )}
                  style={{
                    width: `${Math.round((count / maxSev) * 100)}%`,
                  }}
                />
              </div>
              <span className="text-xs text-gray-500 tabular-nums w-8 text-right">
                {count}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Convergence Map ─────────────────────────────────────────────────────────

function ConvergenceSection({ findings }: { findings: WasteFinding[] }) {
  const convergent = useMemo(() => {
    return findings.filter((f) => f.convergence_details)
  }, [findings])

  // Group by entity to show cross-domain convergence
  // NOTE: This hook must be called before the early return to satisfy Rules of Hooks
  const byEntity = useMemo(() => {
    if (convergent.length === 0) return []
    const map = new Map<
      string,
      { entity: string; domains: Set<string>; score: number }
    >()
    convergent.forEach((f) => {
      const existing = map.get(f.entity)
      if (existing) {
        if (f.convergence_details?.domain_risks) {
          Object.keys(f.convergence_details.domain_risks).forEach((d) =>
            existing.domains.add(d)
          )
        }
        existing.score = Math.max(
          existing.score,
          f.convergence_details?.composite_risk ?? 0
        )
      } else {
        const domains = new Set<string>()
        if (f.convergence_details?.domain_risks) {
          Object.keys(f.convergence_details.domain_risks).forEach((d) =>
            domains.add(d)
          )
        }
        map.set(f.entity, {
          entity: f.entity,
          domains,
          score: f.convergence_details?.composite_risk ?? 0,
        })
      }
    })
    return [...map.values()]
      .sort((a, b) => b.score - a.score)
      .slice(0, 6)
  }, [convergent])

  if (convergent.length === 0) return null

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-5">
      <h3 className="text-sm font-semibold text-gray-700 mb-1">
        Cross-Domain Convergence
      </h3>
      <p className="text-xs text-gray-400 mb-3">
        Entities flagged by 2+ independent detector categories, indicating
        systemic risk
      </p>
      <div className="space-y-2">
        {byEntity.map((e) => (
          <div
            key={e.entity}
            className="flex items-center justify-between py-2 px-2 rounded hover:bg-gray-50"
          >
            <div className="min-w-0">
              <p className="text-sm font-medium text-gray-800 truncate">
                {e.entity}
              </p>
              <div className="flex items-center gap-1 mt-0.5">
                {[...e.domains].map((d) => (
                  <span
                    key={d}
                    className="text-[10px] bg-purple-50 text-purple-600 px-1.5 py-0.5 rounded capitalize"
                  >
                    {d}
                  </span>
                ))}
              </div>
            </div>
            <TCScoreBadge score={e.score} size="sm" />
          </div>
        ))}
      </div>
    </div>
  )
}

function laneBadgeClass(lane: string) {
  if (lane === "suppressed") return "bg-red-50 text-red-700"
  if (lane === "heavily_demoted") return "bg-orange-50 text-orange-700"
  if (lane === "lower_trust_contextual") return "bg-amber-50 text-amber-700"
  if (lane === "benchmark_protected") return "bg-emerald-50 text-emerald-700"
  return "bg-gray-100 text-gray-600"
}

function TrustCalibrationSection({ cityId }: { cityId: number | null }) {
  const trustMetricsQ = useWasteTrustMetrics({ cityId, enabled: !!cityId })
  const trustReportQ = useLatestWasteTrustReport({ cityId, enabled: !!cityId })
  const trustReportRunner = useWasteTrustReportRunner({
    cityId,
    lookbackDays: 30,
    enabled: !!cityId,
  })

  const laneEntries = useMemo(() => {
    const lanes = trustReportQ.data?.report.policy_lane_summary.lanes ?? {}
    return Object.entries(lanes).sort(([left], [right]) => {
      if (left === "default") return 1
      if (right === "default") return -1
      return left.localeCompare(right)
    })
  }, [trustReportQ.data])

  const topDeltas = trustReportQ.data?.report.top_weight_deltas.slice(0, 5) ?? []
  const thresholdChanges =
    trustReportQ.data?.report.threshold_changes.slice(0, 5) ?? []
  const metrics = trustMetricsQ.data
  const report = trustReportQ.data?.report

  let reportGeneratedAt: string | null = null
  if (report?.generated_at) {
    const parsed = new Date(report.generated_at)
    if (!Number.isNaN(parsed.getTime())) {
      reportGeneratedAt = parsed.toLocaleString()
    }
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-5 mb-6">
      <div className="flex items-start justify-between gap-4 mb-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
            <h3 className="text-sm font-semibold text-gray-700">
              Trust & Calibration Review
            </h3>
          </div>
          <p className="text-xs text-gray-400">
            Current trust metrics plus the latest completed calibration report for
            this city.
          </p>
        </div>
        {reportGeneratedAt && (
          <span className="text-xs text-gray-400 whitespace-nowrap">
            Latest report: {reportGeneratedAt}
          </span>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3 mb-4">
        <Button
          type="button"
          size="sm"
          onClick={trustReportRunner.generateReport}
          disabled={!cityId || trustReportRunner.isGenerating}
        >
          <RefreshCw
            className={cn(
              "w-3.5 h-3.5",
              trustReportRunner.isGenerating && "animate-spin"
            )}
          />
          {trustReportRunner.isGenerating
            ? "Refreshing trust report..."
            : report
              ? "Refresh Trust Report"
              : "Generate Trust Report"}
        </Button>

        {trustReportRunner.activeJob?.status && (
          <div className="inline-flex items-center gap-2 text-xs text-gray-500">
            <Clock3 className="w-3.5 h-3.5" />
            <span className="capitalize">
              {trustReportRunner.activeJob.status}
            </span>
            {typeof trustReportRunner.activeJob.progress === "number" && (
              <span className="tabular-nums">
                {trustReportRunner.activeJob.progress}%
              </span>
            )}
            {trustReportRunner.activeJob.status_message && (
              <span className="text-gray-400">
                {trustReportRunner.activeJob.status_message}
              </span>
            )}
          </div>
        )}
      </div>

      {trustReportRunner.error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          <div className="flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
            <span>{trustReportRunner.error}</span>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
          <p className="text-xs text-gray-500">Mean Score</p>
          <p className="text-2xl font-bold text-gray-900 tabular-nums">
            {metrics ? metrics.score_distribution.mean.toFixed(1) : "--"}
          </p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
          <p className="text-xs text-gray-500">95+ Saturation</p>
          <p className="text-2xl font-bold text-gray-900 tabular-nums">
            {metrics ? `${Math.round(metrics.saturation.pct_gte_95 * 100)}%` : "--"}
          </p>
        </div>
        <div className="rounded-lg border border-emerald-100 bg-emerald-50 p-4">
          <p className="text-xs text-emerald-700">Policy-Controlled Detectors</p>
          <p className="text-2xl font-bold text-emerald-900 tabular-nums">
            {report?.policy_lane_summary.policy_controlled_detectors ?? "--"}
          </p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
          <p className="text-xs text-gray-500">Confirmed Case Findings</p>
          <p className="text-2xl font-bold text-gray-900 tabular-nums">
            {metrics?.confirmed_case_total_findings ?? "--"}
          </p>
        </div>
      </div>

      {trustMetricsQ.isLoading || trustReportQ.isLoading ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="h-40 rounded-lg bg-gray-100 animate-pulse" />
          <div className="h-40 rounded-lg bg-gray-100 animate-pulse" />
        </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
          <div className="rounded-lg border border-gray-200 p-4">
            <div className="flex items-center gap-2 mb-3">
              <ShieldCheck className="w-4 h-4 text-violet-600" />
              <h4 className="text-sm font-semibold text-gray-800">
                Policy Lane Mix
              </h4>
            </div>
            {laneEntries.length === 0 ? (
              <p className="text-xs text-gray-400">
                No completed trust report is available for this city yet.
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {laneEntries.map(([lane, count]) => (
                  <span
                    key={lane}
                    className={cn(
                      "inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium",
                      laneBadgeClass(lane)
                    )}
                  >
                    <span className="capitalize">{lane.replaceAll("_", " ")}</span>
                    <span className="tabular-nums">{count}</span>
                  </span>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-lg border border-gray-200 p-4">
            <div className="flex items-center gap-2 mb-3">
              <TrendingDown className="w-4 h-4 text-orange-600" />
              <h4 className="text-sm font-semibold text-gray-800">
                Top Weight Deltas
              </h4>
            </div>
            {topDeltas.length === 0 ? (
              <p className="text-xs text-gray-400">
                No weight-delta report rows are available yet.
              </p>
            ) : (
              <div className="space-y-2">
                {topDeltas.map((item) => (
                  <div
                    key={item.detector_key}
                    className="rounded-md bg-gray-50 px-3 py-2"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-xs font-medium text-gray-700 break-all">
                        {item.detector_key}
                      </span>
                      <span className="text-xs font-semibold text-orange-700 tabular-nums">
                        {item.delta_pct > 0 ? "+" : ""}
                        {item.delta_pct.toFixed(1)}%
                      </span>
                    </div>
                    <div className="mt-1 text-[11px] text-gray-500 tabular-nums">
                      {item.base_weight.toFixed(2)} to {item.adjusted_weight.toFixed(2)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-lg border border-gray-200 p-4">
            <div className="flex items-center gap-2 mb-3">
              <SlidersHorizontal className="w-4 h-4 text-blue-600" />
              <h4 className="text-sm font-semibold text-gray-800">
                Recent Threshold Changes
              </h4>
            </div>
            {thresholdChanges.length === 0 ? (
              <p className="text-xs text-gray-400">
                No recent threshold changes were recorded in the latest report.
              </p>
            ) : (
              <div className="space-y-2">
                {thresholdChanges.map((item) => (
                  <div
                    key={`${item.detector_key}:${item.threshold_field}`}
                    className="rounded-md bg-gray-50 px-3 py-2"
                  >
                    <div className="text-xs font-medium text-gray-700 break-all">
                      {item.detector_key}
                    </div>
                    <div className="mt-1 text-[11px] text-gray-500">
                      {item.threshold_field}
                    </div>
                    <div className="mt-1 text-[11px] text-blue-700 tabular-nums">
                      {item.old_value.toFixed(2)} to {item.new_value.toFixed(2)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function CityMethodologySection({ cityId }: { cityId: number | null }) {
  const methodologyQ = useWasteCityMethodology(cityId)
  const cityKey = methodologyQ.data?.city_key ?? "city"
  const reviewNotes = methodologyQ.data?.city_review_notes ?? []
  const noteEntries = Object.entries(methodologyQ.data?.methodology_notes ?? {}).slice(0, 4)

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-5 mb-6">
      <div className="flex items-start gap-2 mb-4">
        <MapPinned className="w-4 h-4 text-sky-600 mt-0.5" />
        <div>
          <h3 className="text-sm font-semibold text-gray-700">
            City Methodology Notes
          </h3>
          <p className="text-xs text-gray-400">
            Local review caveats and exception handling for {cityKey.replaceAll("_", " ")}.
          </p>
        </div>
      </div>

      {methodologyQ.isLoading ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="h-32 rounded-lg bg-gray-100 animate-pulse" />
          <div className="h-32 rounded-lg bg-gray-100 animate-pulse" />
        </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
          <div className="xl:col-span-2 rounded-lg border border-gray-200 p-4">
            <h4 className="text-sm font-semibold text-gray-800 mb-3">
              Review Notes
            </h4>
            {reviewNotes.length === 0 ? (
              <p className="text-xs text-gray-400">
                No city-specific review notes are available for this city yet.
              </p>
            ) : (
              <div className="space-y-3">
                {reviewNotes.map((note) => (
                  <div
                    key={note.id}
                    className="rounded-lg border border-gray-100 bg-gray-50 p-4"
                  >
                    <div className="flex flex-wrap items-center gap-2 mb-2">
                      <h5 className="text-sm font-medium text-gray-800">
                        {note.title}
                      </h5>
                      <span className="rounded-full bg-sky-50 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-sky-700">
                        {note.lane.replaceAll("_", " ")}
                      </span>
                    </div>
                    <p className="text-sm text-gray-600 leading-relaxed mb-2">
                      {note.summary}
                    </p>
                    <p className="text-xs text-gray-500 leading-relaxed mb-2">
                      {note.operator_guidance}
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {note.detector_families.map((family) => (
                        <span
                          key={family}
                          className="rounded-full bg-white px-2 py-0.5 text-[11px] text-gray-600 border border-gray-200"
                        >
                          {family}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-lg border border-gray-200 p-4">
            <h4 className="text-sm font-semibold text-gray-800 mb-3">
              Local Context Snapshot
            </h4>
            <div className="space-y-3">
              <div className="rounded-md bg-gray-50 px-3 py-2">
                <div className="text-[11px] uppercase tracking-wide text-gray-500">
                  Fiscal Year
                </div>
                <div className="mt-1 text-sm text-gray-800">
                  {methodologyQ.data?.fiscal_year_label ?? "--"}
                </div>
              </div>
              <div className="rounded-md bg-gray-50 px-3 py-2">
                <div className="text-[11px] uppercase tracking-wide text-gray-500">
                  Detector Coverage
                </div>
                <div className="mt-1 text-sm text-gray-800 tabular-nums">
                  {methodologyQ.data
                    ? `${methodologyQ.data.total_detectors_available} available / ${methodologyQ.data.total_detectors_skipped} skipped`
                    : "--"}
                </div>
              </div>
              {noteEntries.map(([key, value]) => (
                <div key={key} className="rounded-md bg-gray-50 px-3 py-2">
                  <div className="text-[11px] uppercase tracking-wide text-gray-500">
                    {key.replaceAll("_", " ")}
                  </div>
                  <div className="mt-1 text-xs text-gray-600 leading-relaxed">
                    {value}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function MetadataWorkstreamsSection({ cityId }: { cityId: number | null }) {
  const methodologyQ = useWasteCityMethodology(cityId)
  const workstreams = methodologyQ.data?.metadata_workstreams

  const grouped = useMemo(() => {
    const items = workstreams ?? []
    const buckets: Record<"shared" | "city_weighted", typeof items> = {
      shared: [],
      city_weighted: [],
    }
    for (const item of items) {
      if (item.scope === "shared") {
        buckets.shared.push(item)
      } else {
        buckets.city_weighted.push(item)
      }
    }
    return buckets
  }, [workstreams])

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-5 mb-6">
      <div className="flex items-start gap-2 mb-4">
        <SlidersHorizontal className="w-4 h-4 text-indigo-600 mt-0.5" />
        <div>
          <h3 className="text-sm font-semibold text-gray-700">
            Metadata Workstreams
          </h3>
          <p className="text-xs text-gray-400">
            Enrichment tracks for families that should be improved through data
            acquisition before threshold or trust changes.
          </p>
        </div>
      </div>

      {methodologyQ.isLoading ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="h-40 rounded-lg bg-gray-100 animate-pulse" />
          <div className="h-40 rounded-lg bg-gray-100 animate-pulse" />
        </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          {(["shared", "city_weighted"] as const).map((scope) => {
            const items = grouped[scope]
            return (
              <div key={scope} className="rounded-lg border border-gray-200 p-4">
                <div className="flex items-center gap-2 mb-3">
                  <span
                    className={cn(
                      "rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide",
                      scope === "shared"
                        ? "bg-indigo-50 text-indigo-700"
                        : "bg-sky-50 text-sky-700"
                    )}
                  >
                    {scope === "shared" ? "Shared Needs" : "City-Weighted Needs"}
                  </span>
                  <span className="text-xs text-gray-400 tabular-nums">
                    {items.length}
                  </span>
                </div>
                {items.length === 0 ? (
                  <p className="text-xs text-gray-400">
                    No metadata workstreams are defined for this scope yet.
                  </p>
                ) : (
                  <div className="space-y-3">
                    {items.map((item) => (
                      <div
                        key={item.id}
                        className="rounded-lg border border-gray-100 bg-gray-50 p-4"
                      >
                        <h4 className="text-sm font-medium text-gray-800 mb-2">
                          {item.title}
                        </h4>
                        <p className="text-sm text-gray-600 leading-relaxed mb-3">
                          {item.why_blocked}
                        </p>
                        <div className="mb-3">
                          <div className="text-[11px] uppercase tracking-wide text-gray-500 mb-1">
                            Detector Families
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            {item.detector_families.map((family) => (
                              <span
                                key={family}
                                className="rounded-full bg-white px-2 py-0.5 text-[11px] text-gray-600 border border-gray-200"
                              >
                                {family}
                              </span>
                            ))}
                          </div>
                        </div>
                        <div className="mb-3">
                          <div className="text-[11px] uppercase tracking-wide text-gray-500 mb-1">
                            Required Metadata
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            {item.required_metadata.map((field) => (
                              <span
                                key={field}
                                className="rounded-full bg-indigo-50 px-2 py-0.5 text-[11px] text-indigo-700"
                              >
                                {field}
                              </span>
                            ))}
                          </div>
                        </div>
                        <div>
                          <div className="text-[11px] uppercase tracking-wide text-gray-500 mb-1">
                            Recommended Sources
                          </div>
                          <ul className="space-y-1 text-xs text-gray-500">
                            {item.recommended_sources.map((source) => (
                              <li key={source}>{source}</li>
                            ))}
                          </ul>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function outcomeBadgeClass(outcome: string) {
  if (outcome === "should_remain_strong") return "bg-emerald-50 text-emerald-700"
  if (outcome === "should_be_demoted") return "bg-red-50 text-red-700"
  if (outcome === "should_be_metadata_first") return "bg-indigo-50 text-indigo-700"
  if (outcome === "should_be_explanation_first") return "bg-amber-50 text-amber-700"
  if (outcome === "watch_benchmark") return "bg-sky-50 text-sky-700"
  return "bg-gray-100 text-gray-600"
}

function evaluationStatusBadgeClass(status: string) {
  if (status === "on_track") return "bg-emerald-50 text-emerald-700"
  if (status === "needs_review") return "bg-red-50 text-red-700"
  if (status === "manual_review") return "bg-amber-50 text-amber-700"
  return "bg-gray-100 text-gray-600"
}

function EvaluationReviewSection({ cityId }: { cityId: number | null }) {
  const methodologyQ = useWasteCityMethodology(cityId)
  const benchmarkQ = useWasteBenchmarkSummary(cityId)
  const trustReportQ = useLatestWasteTrustReport({ cityId, enabled: !!cityId })
  const expectations = methodologyQ.data?.eval_expectations ?? []
  const evaluationSnapshot = trustReportQ.data?.report.evaluation_snapshot ?? []

  const grouped: Record<string, typeof expectations> = {
    should_remain_strong: [],
    should_be_demoted: [],
    should_be_explanation_first: [],
    should_be_metadata_first: [],
    watch_benchmark: [],
  }
  for (const item of expectations) {
    if (!grouped[item.expected_outcome]) {
      grouped[item.expected_outcome] = []
    }
    grouped[item.expected_outcome].push(item)
  }

  const orderedOutcomes = [
    "should_remain_strong",
    "should_be_demoted",
    "should_be_explanation_first",
    "should_be_metadata_first",
    "watch_benchmark",
  ]

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-5 mb-6">
      <div className="flex items-start gap-2 mb-4">
        <BarChart3 className="w-4 h-4 text-emerald-600 mt-0.5" />
        <div>
          <h3 className="text-sm font-semibold text-gray-700">
            Evaluation & Benchmark Review
          </h3>
          <p className="text-xs text-gray-400">
            Expected detector outcomes plus the current cross-city benchmark
            snapshot for this city.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 mb-5">
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
          <div className="text-xs text-gray-500">City Exposure Rank</div>
          <div className="mt-1 text-2xl font-bold text-gray-900 tabular-nums">
            {benchmarkQ.data
              ? `${benchmarkQ.data.rank_by_exposure}/${benchmarkQ.data.total_tracked_cities}`
              : "--"}
          </div>
        </div>
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
          <div className="text-xs text-gray-500">City Findings Rank</div>
          <div className="mt-1 text-2xl font-bold text-gray-900 tabular-nums">
            {benchmarkQ.data
              ? `${benchmarkQ.data.rank_by_findings}/${benchmarkQ.data.total_tracked_cities}`
              : "--"}
          </div>
        </div>
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
          <div className="text-xs text-gray-500">Acceptance Rows</div>
          <div className="mt-1 text-2xl font-bold text-gray-900 tabular-nums">
            {expectations.length || "--"}
          </div>
        </div>
      </div>

      {methodologyQ.isLoading ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="h-36 rounded-lg bg-gray-100 animate-pulse" />
          <div className="h-36 rounded-lg bg-gray-100 animate-pulse" />
        </div>
      ) : (
        <div className="space-y-4">
          <div className="rounded-lg border border-gray-200 p-4">
            <div className="flex items-center gap-2 mb-3">
              <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-gray-700">
                Live Evaluation Snapshot
              </span>
              <span className="text-xs text-gray-400 tabular-nums">
                {evaluationSnapshot.length}
              </span>
            </div>
            {evaluationSnapshot.length === 0 ? (
              <p className="text-xs text-gray-400">
                Generate or refresh a trust report to compare current calibration
                outputs against the eval expectations.
              </p>
            ) : (
              <div className="space-y-3">
                {evaluationSnapshot.map((item) => (
                  <div
                    key={item.id}
                    className="rounded-lg border border-gray-100 bg-gray-50 p-4"
                  >
                    <div className="flex flex-wrap items-center gap-2 mb-2">
                      <h4 className="text-sm font-medium text-gray-800">
                        {item.title}
                      </h4>
                      <span
                        className={cn(
                          "rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide",
                          evaluationStatusBadgeClass(item.status)
                        )}
                      >
                        {item.status.replaceAll("_", " ")}
                      </span>
                      <span
                        className={cn(
                          "rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide",
                          outcomeBadgeClass(item.expected_outcome)
                        )}
                      >
                        {item.expected_outcome.replaceAll("_", " ")}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-1.5 mb-3">
                      {item.detector_families.map((family) => (
                        <span
                          key={family}
                          className="rounded-full bg-white px-2 py-0.5 text-[11px] text-gray-600 border border-gray-200"
                        >
                          {family}
                        </span>
                      ))}
                    </div>
                    <ul className="space-y-1 text-xs text-gray-500">
                      {item.evidence.map((line) => (
                        <li key={line}>{line}</li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </div>

          {orderedOutcomes.map((outcome) => {
            const items = grouped[outcome] ?? []
            if (items.length === 0) return null
            return (
              <div key={outcome} className="rounded-lg border border-gray-200 p-4">
                <div className="flex items-center gap-2 mb-3">
                  <span
                    className={cn(
                      "rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide",
                      outcomeBadgeClass(outcome)
                    )}
                  >
                    {outcome.replaceAll("_", " ")}
                  </span>
                  <span className="text-xs text-gray-400 tabular-nums">
                    {items.length}
                  </span>
                </div>
                <div className="space-y-3">
                  {items.map((item) => (
                    <div
                      key={item.id}
                      className="rounded-lg border border-gray-100 bg-gray-50 p-4"
                    >
                      <h4 className="text-sm font-medium text-gray-800 mb-2">
                        {item.title}
                      </h4>
                      <p className="text-sm text-gray-600 leading-relaxed mb-3">
                        {item.rationale}
                      </p>
                      <div className="mb-3">
                        <div className="text-[11px] uppercase tracking-wide text-gray-500 mb-1">
                          Detector Families
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {item.detector_families.map((family) => (
                            <span
                              key={family}
                              className="rounded-full bg-white px-2 py-0.5 text-[11px] text-gray-600 border border-gray-200"
                            >
                              {family}
                            </span>
                          ))}
                        </div>
                      </div>
                      <div>
                        <div className="text-[11px] uppercase tracking-wide text-gray-500 mb-1">
                          Pass Criteria
                        </div>
                        <ul className="space-y-1 text-xs text-gray-500">
                          {item.pass_criteria.map((criterion) => (
                            <li key={criterion}>{criterion}</li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Main Component ──────────────────────────────────────────────────────────

export function ForensicsOverviewPage() {
  const { selectedCityId: cityId } = useWasteCity()
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS)

  const { data: analysisData, isLoading } =
    useLatestPersistedWasteResult(cityId)
  const allFindings = useMemo(() => analysisData?.findings ?? [], [analysisData])

  // Derive filter options from findings
  const departments = useMemo(() => {
    const set = new Set<string>()
    allFindings.forEach((f) => {
      if (f.department) set.add(f.department)
    })
    return [...set].sort()
  }, [allFindings])

  const categories = useMemo(() => {
    const set = new Set<string>()
    allFindings.forEach((f) => set.add(normalizeWasteCategory(f.category)))
    return [...set].sort()
  }, [allFindings])

  // Apply filters
  const filtered = useMemo(() => {
    let results = allFindings
    if (filters.severity) {
      results = results.filter(
        (f) => f.severity?.toLowerCase() === filters.severity
      )
    }
    if (filters.category) {
      results = results.filter(
        (f) => normalizeWasteCategory(f.category) === filters.category
      )
    }
    if (filters.department) {
      results = results.filter((f) => f.department === filters.department)
    }
    if (filters.entity) {
      const q = filters.entity.toLowerCase()
      results = results.filter((f) =>
        f.entity?.toLowerCase().includes(q)
      )
    }
    return results
  }, [allFindings, filters])

  // Summary stats
  const criticalCount = filtered.filter(
    (f) => f.severity === "critical" || f.severity === "high"
  ).length
  const uniqueEntities = new Set(filtered.map((f) => f.entity)).size
  const totalDollar = filtered.reduce(
    (s, f) => s + (f.amount ?? 0),
    0
  )

  // Top findings
  const topFindings = filtered.slice(0, 10)

  return (
    <WasteShell
      title="Backtrace"
      description="Historical analysis and investigation workspace"
    >
      <ForensicsShell>
        {/* Filters */}
        <FilterBar
          filters={filters}
          onChange={setFilters}
          departments={departments}
          categories={categories}
        />

        {/* Summary stats */}
        <p className="text-xs text-gray-500 mb-3">
          Showing {filtered.length.toLocaleString()} of {allFindings.length.toLocaleString()} findings
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <p className="text-xs text-gray-500">Total Findings</p>
            <p className="text-2xl font-bold text-gray-900 tabular-nums">
              {isLoading ? "--" : filtered.length.toLocaleString()}
            </p>
          </div>
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <p className="text-xs text-gray-500">High + Critical</p>
            <p className="text-2xl font-bold text-red-600 tabular-nums">
              {isLoading ? "--" : criticalCount}
            </p>
          </div>
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <p className="text-xs text-gray-500">Unique Entities</p>
            <p className="text-2xl font-bold text-gray-900 tabular-nums">
              {isLoading ? "--" : uniqueEntities}
            </p>
          </div>
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <p className="text-xs text-gray-500">Dollar Impact</p>
            <p className="text-2xl font-bold text-gray-900">
              {isLoading ? "--" : formatDollar(totalDollar || null)}
            </p>
          </div>
        </div>

        {/* Top findings table */}
        <div className="bg-white rounded-lg border border-gray-200 p-5 mb-6">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">
            Top Findings
          </h3>
          {isLoading ? (
            <div className="space-y-2">
              {[1, 2, 3, 4, 5].map((i) => (
                <div
                  key={i}
                  className="h-10 bg-gray-50 rounded animate-pulse"
                />
              ))}
            </div>
          ) : topFindings.length === 0 ? (
            <p className="text-xs text-gray-400 py-4 text-center">
              No findings match the current filters
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="text-left py-2 pr-3 text-xs font-medium text-gray-400">
                      Finding
                    </th>
                    <th className="text-left py-2 px-2 text-xs font-medium text-gray-400">
                      Entity
                    </th>
                    <th className="text-center py-2 px-2 text-xs font-medium text-gray-400">
                      Severity
                    </th>
                    <th className="text-left py-2 px-2 text-xs font-medium text-gray-400">
                      Category
                    </th>
                    <th className="text-right py-2 pl-2 text-xs font-medium text-gray-400">
                      Impact
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {topFindings.map((f, idx) => (
                    <tr
                      key={idx}
                      className="border-b border-gray-50 hover:bg-gray-50"
                    >
                      <td className="py-2 pr-3 text-gray-800 truncate max-w-[200px]">
                        {f.metric}
                      </td>
                      <td className="py-2 px-2 text-gray-600 truncate max-w-[150px]">
                        {f.entity}
                      </td>
                      <td className="py-2 px-2 text-center">
                        <span
                          className={cn(
                            "text-[10px] font-medium px-1.5 py-0.5 rounded",
                            severityBadge(f.severity)
                          )}
                        >
                          {f.severity}
                        </span>
                      </td>
                      <td className="py-2 px-2 text-xs text-gray-500 capitalize">
                        {getWasteCategoryLabel(f.category)}
                      </td>
                      <td className="py-2 pl-2 text-right text-gray-700 tabular-nums">
                        {f.amount ? formatDollar(f.amount) : "--"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <Link
            href="/waste/forensics/findings"
            className="mt-3 flex items-center gap-1 text-xs font-medium text-purple-600 no-underline hover:text-purple-700"
          >
            View all findings <ArrowRight className="w-3 h-3" />
          </Link>
        </div>

        {/* Category breakdown + Severity breakdown */}
        <div className="mb-6">
          <CategoryBreakdown findings={filtered} />
        </div>

        <TrustCalibrationSection cityId={cityId} />
        <EvaluationReviewSection cityId={cityId} />
        <MetadataWorkstreamsSection cityId={cityId} />
        <CityMethodologySection cityId={cityId} />

        {/* Convergence */}
        <ConvergenceSection findings={allFindings} />
      </ForensicsShell>
    </WasteShell>
  )
}

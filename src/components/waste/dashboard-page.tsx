"use client"

import { useMemo } from "react"
import Link from "next/link"
import {
  useWasteEntityScores,
  useWasteReviewQueue,
  useWasteInvestigations,
  useWasteDetectorAccuracy,
  useLatestPersistedWasteResult,
} from "@/lib/hooks/useWaste"
import type {
  WasteFinding,
  WasteReviewQueueItem,
  WasteInvestigation,
  WasteDetectorAccuracy as DetectorAccuracyType,
} from "@/lib/apiClient"
import { useWasteCity } from "./WasteCityContext"
import { WasteShell } from "./waste-shell"
import { InvestigationsShell } from "./investigations-shell"
import {
  formatDollar,
  getWasteCategoryLabel,
} from "./waste-utils"
import { TCScoreBadge } from "./tc-score-badge"
import { ModelHealth } from "./model-health"
import { SeverityDonut } from "./widgets/severity-donut"
import { AccuracyBars } from "./widgets/accuracy-bars"
import { InvestigationSummary } from "./widgets/investigation-summary"
import { QueueStatus } from "./widgets/queue-status"
import { cn } from "@/lib/utils"
import {
  ArrowRight,
  AlertTriangle,
  Clock,
  Inbox,
  Search,
  TrendingUp,
  TrendingDown,
  Minus,
  Building2,
  Gauge,
} from "lucide-react"

// ── Helpers ─────────────────────────────────────────────────────────────────

function formatAge(isoDate: string): string {
  const diffMs = Date.now() - new Date(isoDate).getTime()
  const mins = Math.floor(diffMs / 60_000)
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

function severityColor(severity: string) {
  switch (severity?.toLowerCase()) {
    case "critical":
      return "bg-red-100 text-red-700"
    case "high":
      return "bg-orange-100 text-orange-700"
    case "medium":
      return "bg-amber-100 text-amber-700"
    default:
      return "bg-gray-100 text-gray-600"
  }
}

// ── Section: Risk Feed ──────────────────────────────────────────────────────

function RiskFeed({ findings }: { findings: WasteFinding[] }) {
  // Show most critical/high findings as the "risk feed"
  const feedItems = useMemo(() => {
    return findings
      .filter(
        (f) =>
          f.severity === "critical" ||
          f.severity === "high" ||
          f.convergence_details
      )
      .slice(0, 8)
  }, [findings])

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-5">
      <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
        <AlertTriangle className="w-4 h-4 text-red-400" />
        Risk Feed
      </h3>
      {feedItems.length === 0 ? (
        <p className="text-xs text-gray-500 py-4 text-center">
          No high-risk items in latest analysis
        </p>
      ) : (
        <div className="space-y-0.5 max-h-[320px] overflow-y-auto">
          {feedItems.map((f, idx) => (
            <div
              key={idx}
              className="flex items-start gap-3 p-2.5 rounded-lg hover:bg-gray-50 transition-colors"
            >
              <div className="mt-0.5">
                <span
                  className={cn(
                    "inline-block w-2 h-2 rounded-full",
                    f.severity === "critical" ? "bg-red-500" : "bg-orange-400"
                  )}
                />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-gray-800 truncate">
                  <span className="font-medium">{f.entity}</span>
                  {f.department && (
                    <span className="text-gray-500"> &middot; {f.department}</span>
                  )}
                </p>
                <p className="text-xs text-gray-500 truncate">{f.metric}</p>
                <div className="flex items-center gap-2 mt-1">
                  <span
                    className={cn(
                      "text-[10px] font-medium px-1.5 py-0.5 rounded",
                      severityColor(f.severity)
                    )}
                  >
                    {f.severity}
                  </span>
                  <span className="text-[10px] text-gray-500">
                    {getWasteCategoryLabel(f.category)}
                  </span>
                  {f.amount != null && f.amount > 0 && (
                    <span className="text-[10px] text-gray-500 font-medium">
                      {formatDollar(f.amount)}
                    </span>
                  )}
                  {f.convergence_details && (
                    <span className="text-[10px] font-medium text-purple-600 bg-purple-50 px-1.5 py-0.5 rounded">
                      convergence
                    </span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
      <Link
        href="/waste/forensics"
        className="mt-3 flex items-center gap-1 text-xs font-medium text-purple-600 no-underline hover:text-purple-700"
      >
        View all findings <ArrowRight className="w-3 h-3" />
      </Link>
    </div>
  )
}

// ── Section: Queue Summary ──────────────────────────────────────────────────

function QueueSummary({ cityId }: { cityId: number }) {
  const pendingQ = useWasteReviewQueue({ cityId, status: "pending", perPage: 1 })
  const assignedQ = useWasteReviewQueue({
    cityId,
    status: "assigned",
    perPage: 1,
  })
  const disposedQ = useWasteReviewQueue({
    cityId,
    status: "disposed",
    perPage: 1,
  })

  // Queue items by category for the breakdown
  const allPendingQ = useWasteReviewQueue({
    cityId,
    status: "pending",
    perPage: 100,
  })
  const categoryBreakdown = useMemo(() => {
    if (!allPendingQ.data?.items) return []
    const counts: Record<string, number> = {}
    allPendingQ.data.items.forEach((item: WasteReviewQueueItem) => {
      const cat = item.finding_category ?? "unknown"
      counts[cat] = (counts[cat] ?? 0) + 1
    })
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
  }, [allPendingQ.data])

  const isLoading = pendingQ.isLoading
  const maxCatCount = categoryBreakdown.length > 0 ? categoryBreakdown[0][1] : 1

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-5">
      <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
        <Inbox className="w-4 h-4 text-gray-500" />
        Review Queue
      </h3>
      <div className="grid grid-cols-3 gap-3 mb-4">
        {[
          {
            label: "Pending",
            count: pendingQ.data?.total ?? 0,
            color: "text-yellow-600",
          },
          {
            label: "In Review",
            count: assignedQ.data?.total ?? 0,
            color: "text-blue-600",
          },
          {
            label: "Disposed",
            count: disposedQ.data?.total ?? 0,
            color: "text-emerald-600",
          },
        ].map((s) => (
          <div key={s.label} className="text-center p-2 rounded-lg bg-gray-50">
            {isLoading ? (
              <div className="h-8 w-10 mx-auto bg-gray-100 rounded animate-pulse" />
            ) : (
              <div className={cn("text-2xl font-bold tabular-nums", s.color)}>
                {s.count}
              </div>
            )}
            <div className="text-[11px] text-gray-500 mt-0.5">{s.label}</div>
          </div>
        ))}
      </div>

      {/* By category breakdown */}
      {categoryBreakdown.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[11px] text-gray-500 font-medium uppercase tracking-wider">
            Pending by Category
          </p>
          {categoryBreakdown.map(([cat, count]) => (
            <div key={cat} className="flex items-center gap-2">
              <span className="text-xs text-gray-600 w-24 truncate capitalize">
                {cat}
              </span>
              <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-purple-500 rounded-full"
                  style={{
                    width: `${Math.round((count / maxCatCount) * 100)}%`,
                  }}
                />
              </div>
              <span className="text-xs text-gray-500 tabular-nums w-6 text-right">
                {count}
              </span>
            </div>
          ))}
        </div>
      )}

      <Link
        href="/waste/queue"
        className="mt-3 flex items-center gap-1 text-xs font-medium text-purple-600 no-underline hover:text-purple-700"
      >
        Open queue <ArrowRight className="w-3 h-3" />
      </Link>
    </div>
  )
}

// ── Section: Department Risk ────────────────────────────────────────────────

function DepartmentRiskTable({ cityId }: { cityId: number }) {
  const { data, isLoading } = useWasteEntityScores({
    cityId,
    perPage: 100,
    sortBy: "composite_score",
    sortDir: "desc",
    entityType: "department",
  })

  const depts = useMemo(() => {
    if (!data?.items) return []
    return data.items.slice(0, 8)
  }, [data])

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-5">
      <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
        <Building2 className="w-4 h-4 text-gray-500" />
        Department Risk
      </h3>
      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-10 bg-gray-50 rounded animate-pulse" />
          ))}
        </div>
      ) : depts.length === 0 ? (
        <p className="text-xs text-gray-500 py-4 text-center">
          No department scores yet
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="text-left py-2 pr-3 text-xs font-medium text-gray-500">
                  Department
                </th>
                <th className="text-right py-2 px-2 text-xs font-medium text-gray-500">
                  Score
                </th>
                <th className="text-right py-2 px-2 text-xs font-medium text-gray-500">
                  Signals
                </th>
                <th className="text-center py-2 pl-2 text-xs font-medium text-gray-500">
                  Trend
                </th>
              </tr>
            </thead>
            <tbody>
              {depts.map((dept, idx) => {
                const delta = dept.score_delta ?? 0
                return (
                  <tr
                    key={idx}
                    className="border-b border-gray-50 hover:bg-gray-50"
                  >
                    <td className="py-2 pr-3 text-gray-800 truncate max-w-[200px]">
                      {dept.entity_name}
                    </td>
                    <td className="py-2 px-2 text-right">
                      <TCScoreBadge score={dept.composite_score} size="sm" />
                    </td>
                    <td className="py-2 px-2 text-right text-gray-600 tabular-nums">
                      {dept.signal_count}
                    </td>
                    <td className="py-2 pl-2 text-center">
                      {delta > 0 ? (
                        <span className="inline-flex items-center gap-0.5 text-xs text-red-600">
                          <TrendingUp className="w-3 h-3" />
                          +{delta.toFixed(0)}
                        </span>
                      ) : delta < 0 ? (
                        <span className="inline-flex items-center gap-0.5 text-xs text-emerald-600">
                          <TrendingDown className="w-3 h-3" />
                          {delta.toFixed(0)}
                        </span>
                      ) : (
                        <span className="inline-flex items-center text-xs text-gray-500">
                          <Minus className="w-3 h-3" />
                        </span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ── Section: Detector Performance ───────────────────────────────────────────

function DetectorPerformance({ cityId }: { cityId: number }) {
  const { data, isLoading } = useWasteDetectorAccuracy(cityId)

  const sorted = useMemo(() => {
    if (!data) return []
    return [...data]
      .filter((d) => d.total_findings > 0)
      .sort((a, b) => a.precision_rate - b.precision_rate)
  }, [data])

  const topOverrides = useMemo(() => {
    // Detectors with most false positives = most overridden
    if (!data) return []
    return [...data]
      .filter((d) => d.false_positive_count > 0)
      .sort((a, b) => b.false_positive_count - a.false_positive_count)
      .slice(0, 5)
  }, [data])

  const avgPrecision = useMemo(() => {
    if (!sorted.length) return null
    const sum = sorted.reduce((s, d) => s + d.precision_rate, 0)
    return Math.round((sum / sorted.length) * 100)
  }, [sorted])

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-5">
      <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
        <Gauge className="w-4 h-4 text-gray-500" />
        Detector Performance
      </h3>
      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-8 bg-gray-50 rounded animate-pulse" />
          ))}
        </div>
      ) : sorted.length === 0 ? (
        <p className="text-xs text-gray-500 py-4 text-center">
          No accuracy data yet
        </p>
      ) : (
        <>
          {/* Overall precision */}
          {avgPrecision != null && (
            <div className="mb-4 p-3 rounded-lg bg-gray-50 flex items-center justify-between">
              <span className="text-sm text-gray-600">Overall Precision</span>
              <span className="text-2xl font-bold text-gray-900">
                {avgPrecision}%
              </span>
            </div>
          )}

          {/* Top overrides */}
          {topOverrides.length > 0 && (
            <div className="mb-3">
              <p className="text-[11px] text-gray-500 font-medium uppercase tracking-wider mb-1.5">
                Most Overridden Detectors
              </p>
              <div className="space-y-1">
                {topOverrides.map((d: DetectorAccuracyType) => (
                  <div
                    key={d.detector_key}
                    className="flex items-center justify-between py-1 px-2 rounded hover:bg-gray-50"
                  >
                    <span className="text-xs text-gray-700 truncate">
                      {d.detector_key.replace(/_/g, " ")}
                    </span>
                    <span className="text-xs text-gray-500 tabular-nums">
                      {d.false_positive_count} FP
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Precision by detector */}
          <p className="text-[11px] text-gray-500 font-medium uppercase tracking-wider mb-1.5">
            Precision by Detector
          </p>
          <div className="space-y-1 max-h-[200px] overflow-y-auto">
            {sorted.map((d: DetectorAccuracyType) => {
              const pct = Math.round(d.precision_rate * 100)
              const barColor =
                pct >= 80
                  ? "bg-emerald-500"
                  : pct >= 60
                    ? "bg-blue-500"
                    : pct >= 40
                      ? "bg-amber-500"
                      : "bg-red-500"
              return (
                <div key={d.detector_key} className="flex items-center gap-2">
                  <span className="text-[11px] text-gray-600 w-28 truncate">
                    {d.detector_key.replace(/_/g, " ")}
                  </span>
                  <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className={cn("h-full rounded-full", barColor)}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="text-[11px] text-gray-500 tabular-nums w-8 text-right">
                    {pct}%
                  </span>
                </div>
              )
            })}
          </div>
        </>
      )}
      <Link
        href="/waste/settings/thresholds"
        className="mt-3 flex items-center gap-1 text-xs font-medium text-purple-600 no-underline hover:text-purple-700"
      >
        Tune thresholds <ArrowRight className="w-3 h-3" />
      </Link>
    </div>
  )
}

// ── Section: Recent Investigations ──────────────────────────────────────────

function RecentInvestigations({ cityId }: { cityId: number }) {
  const { data, isLoading } = useWasteInvestigations({
    cityId,
    perPage: 5,
  })

  const statusColor: Record<string, string> = {
    open: "bg-blue-100 text-blue-700",
    in_progress: "bg-yellow-100 text-yellow-700",
    pending_response: "bg-orange-100 text-orange-700",
    closed: "bg-gray-100 text-gray-600",
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-5">
      <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
        <Search className="w-4 h-4 text-gray-500" />
        Recent Investigations
      </h3>
      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-12 bg-gray-50 rounded animate-pulse" />
          ))}
        </div>
      ) : !data?.items?.length ? (
        <p className="text-xs text-gray-500 py-4 text-center">
          No investigations yet
        </p>
      ) : (
        <div className="space-y-1">
          {data.items.map((inv: WasteInvestigation) => (
            <Link
              key={inv.id}
              href={`/waste/investigations/${inv.id}`}
              className="flex items-center justify-between py-2 px-2 rounded hover:bg-gray-50 no-underline"
            >
              <div className="min-w-0 flex-1">
                <p className="text-sm text-gray-800 truncate font-medium">
                  {inv.title}
                </p>
                <div className="flex items-center gap-2 mt-0.5">
                  <span
                    className={cn(
                      "text-[10px] font-medium px-1.5 py-0.5 rounded",
                      statusColor[inv.status] ?? "bg-gray-100 text-gray-600"
                    )}
                  >
                    {inv.status.replace(/_/g, " ")}
                  </span>
                  {inv.opened_at && (
                    <span className="text-[10px] text-gray-500">
                      {formatAge(inv.opened_at)}
                    </span>
                  )}
                </div>
              </div>
              <ArrowRight className="w-3.5 h-3.5 text-gray-300 shrink-0" />
            </Link>
          ))}
        </div>
      )}
      <Link
        href="/waste/investigations"
        className="mt-3 flex items-center gap-1 text-xs font-medium text-purple-600 no-underline hover:text-purple-700"
      >
        View all investigations <ArrowRight className="w-3 h-3" />
      </Link>
    </div>
  )
}

// ── Main Component ──────────────────────────────────────────────────────────

export function DashboardPage() {
  const { selectedCityId: cityId } = useWasteCity()

  // Get findings from the latest persisted analysis for the risk feed
  const { data: analysisData } = useLatestPersistedWasteResult(cityId)
  const findings = analysisData?.findings ?? []

  // Key metrics for the stat row
  const highRiskQ = useWasteEntityScores({
    cityId,
    severityTier: "critical",
    perPage: 1,
  })
  const highQ = useWasteEntityScores({
    cityId,
    severityTier: "high",
    perPage: 1,
  })
  const queueQ = useWasteReviewQueue({
    cityId,
    status: "pending",
    perPage: 1,
  })
  const investigationsQ = useWasteInvestigations({
    cityId,
    status: "open",
    perPage: 1,
  })

  const highRiskCount =
    (highRiskQ.data?.total ?? 0) + (highQ.data?.total ?? 0)
  const lastRunDate = analysisData?.analysis_timestamp
    ? new Date(analysisData.analysis_timestamp).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : null

  return (
    <WasteShell
      title="Overview"
      description="Risk overview and audit triage"
      actions={
        lastRunDate ? (
          <span className="text-xs text-gray-500 flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5" />
            Last analysis: {lastRunDate}
          </span>
        ) : undefined
      }
    >
      <InvestigationsShell title="Dashboard">
      {/* Top stats row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <p className="text-xs text-gray-500">Total Findings</p>
          <p className="text-2xl font-bold text-gray-900 tabular-nums">
            {analysisData?.summary?.total_findings ?? "--"}
          </p>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <p className="text-xs text-gray-500">High-Risk Entities</p>
          <p className="text-2xl font-bold text-red-600 tabular-nums">
            {highRiskQ.isLoading ? "--" : highRiskCount}
          </p>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <p className="text-xs text-gray-500">Open Queue</p>
          <p className="text-2xl font-bold text-yellow-600 tabular-nums">
            {queueQ.isLoading ? "--" : (queueQ.data?.total ?? 0)}
          </p>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <p className="text-xs text-gray-500">Active Investigations</p>
          <p className="text-2xl font-bold text-blue-600 tabular-nums">
            {investigationsQ.isLoading
              ? "--"
              : (investigationsQ.data?.total ?? 0)}
          </p>
        </div>
      </div>

      {/* Main grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-6">
        <RiskFeed findings={findings} />
        <QueueSummary cityId={cityId} />
      </div>

      {/* Recent investigations + model health */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-6">
        <RecentInvestigations cityId={cityId} />
        <ModelHealth cityId={cityId} />
      </div>

      <div className="border-t border-gray-200 mt-4 mb-5 pt-4">
        <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-4">
          Analytics
        </h2>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-6">
        <DepartmentRiskTable cityId={cityId} />
        <DetectorPerformance cityId={cityId} />
      </div>

      <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
        Charts &amp; Breakdowns
      </h2>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-6">
        <SeverityDonut cityId={cityId} />
        <AccuracyBars cityId={cityId} />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <QueueStatus cityId={cityId} />
        <InvestigationSummary cityId={cityId} />
      </div>
      </InvestigationsShell>
    </WasteShell>
  )
}

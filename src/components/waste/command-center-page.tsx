"use client"

import { useMemo } from "react"
import Link from "next/link"
import {
  useWasteEntityScores,
  useWasteReviewQueue,
  useWasteInvestigations,
  useWasteDetectorAccuracy,
} from "@/lib/hooks/useWaste"
import { useWasteCity } from "./WasteCityContext"
import { WasteShell } from "./waste-shell"
import { cn } from "@/lib/utils"
import {
  Code2,
  Activity,
  Search,
  ArrowRight,
  ArrowUpRight,
  ArrowDownRight,
  AlertTriangle,
  Inbox,
  FolderOpen,
  Gauge,
} from "lucide-react"

// ── Helpers ─────────────────────────────────────────────────────────────────

function MetricCard({
  label,
  value,
  icon,
  color,
  isLoading,
  trend,
  trendHint,
}: {
  label: string
  value: number | string
  icon: React.ReactNode
  color: string
  isLoading?: boolean
  /** Optional trend indicator: positive = up (risk increasing), negative = down (risk decreasing) */
  trend?: { value: string; direction: "up" | "down" | "flat" } | null
  trendHint?: string
}) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-5 flex items-start gap-4">
      <div className={`p-2.5 rounded-lg ${color}`}>{icon}</div>
      <div className="flex-1 min-w-0">
        {isLoading ? (
          <div className="h-8 w-16 bg-gray-100 rounded animate-pulse mb-1" />
        ) : (
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-bold text-gray-900 tabular-nums">
              {value}
            </span>
            {trend && (
              <span
                className={cn(
                  "inline-flex items-center gap-0.5 text-xs font-semibold tabular-nums",
                  trend.direction === "up" && "text-red-500",
                  trend.direction === "down" && "text-emerald-500",
                  trend.direction === "flat" && "text-gray-400"
                )}
              >
                {trend.direction === "up" && <ArrowUpRight className="w-3.5 h-3.5" />}
                {trend.direction === "down" && <ArrowDownRight className="w-3.5 h-3.5" />}
                {trend.value}
              </span>
            )}
          </div>
        )}
        <div className="text-sm text-gray-500">{label}</div>
        {trend && trendHint && (
          <div className="text-[11px] text-gray-400 mt-1">{trendHint}</div>
        )}
      </div>
    </div>
  )
}

// ── Mode Cards ──────────────────────────────────────────────────────────────

const MODE_CARDS = [
  {
    title: "Guardrails API",
    subtitle: "Integrate risk into approval workflows",
    description:
      "Connect city systems to get a risk score and recommended action before payroll, procurement, contract, or grant approvals.",
    href: "/waste/api",
    icon: Code2,
    gradient: "from-blue-600 to-indigo-700",
    cta: "Explore",
  },
  {
    title: "Investigations",
    subtitle: "Monitor current risk and work active cases",
    description:
      "Live operations view for finance and audit teams to review flagged items, manage the queue, and track open investigations.",
    href: "/waste/dashboard",
    icon: Activity,
    gradient: "from-purple-600 to-violet-700",
    cta: "Open",
  },
  {
    title: "Backtrace",
    subtitle: "Investigate historical patterns and tune detectors",
    description:
      "Retrospective analysis across prior fiscal years to uncover patterns, validate detectors, and build documented cases.",
    href: "/waste/forensics",
    icon: Search,
    gradient: "from-emerald-600 to-teal-700",
    cta: "Enter",
  },
] as const

function ModeCard({
  card,
}: {
  card: (typeof MODE_CARDS)[number]
}) {
  const Icon = card.icon
  return (
    <Link
      href={card.href}
      className="group relative flex flex-col justify-between rounded-xl bg-white border border-gray-200 p-6 no-underline hover:shadow-lg transition-all overflow-hidden"
    >
      {/* Gradient accent bar */}
      <div
        className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${card.gradient}`}
      />
      <div>
        <div className="flex items-center gap-3 mb-3">
          <div
            className={`p-2 rounded-lg bg-gradient-to-br ${card.gradient} text-white`}
          >
            <Icon className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-gray-900">
              {card.title}
            </h3>
            <p className="text-xs text-gray-500">{card.subtitle}</p>
          </div>
        </div>
        <p className="text-sm text-gray-600 leading-relaxed mb-4">
          {card.description}
        </p>
      </div>
      <div className="flex items-center gap-1.5 text-sm font-medium text-purple-600 group-hover:gap-2.5 transition-all">
        {card.cta}
        <ArrowRight className="w-4 h-4" />
      </div>
    </Link>
  )
}

// ── Main Component ──────────────────────────────────────────────────────────

export function CommandCenterPage() {
  const { selectedCityId: cityId } = useWasteCity()

  // Key metrics queries
  const highRiskQ = useWasteEntityScores({
    cityId,
    severityTier: "critical",
    perPage: 1,
  })
  const highRiskHighQ = useWasteEntityScores({
    cityId,
    severityTier: "high",
    perPage: 1,
  })
  const queueQ = useWasteReviewQueue({
    cityId,
    status: "pending",
    perPage: 1,
  })
  const disposedQ = useWasteReviewQueue({
    cityId,
    status: "disposed",
    perPage: 1,
  })
  const investigationsQ = useWasteInvestigations({
    cityId,
    status: "open",
    perPage: 1,
  })
  const accuracyQ = useWasteDetectorAccuracy(cityId)

  // Fetch top entities to compute average score_delta for trend
  const topEntitiesQ = useWasteEntityScores({
    cityId,
    perPage: 20,
    sortBy: "composite_score",
    sortDir: "desc",
  })

  const highRiskCount =
    (highRiskQ.data?.total ?? 0) + (highRiskHighQ.data?.total ?? 0)

  const avgPrecision = useMemo(() => {
    if (!accuracyQ.data?.length) return null
    const withData = accuracyQ.data.filter((d) => d.total_findings > 0)
    if (withData.length === 0) return null
    const sum = withData.reduce((s, d) => s + d.precision_rate, 0)
    return Math.round((sum / withData.length) * 100)
  }, [accuracyQ.data])

  // Compute trend: average score_delta across top entities
  const riskTrend = useMemo(() => {
    const items = topEntitiesQ.data?.items
    if (!items?.length) return null
    const deltas = items.filter((e) => e.score_delta != null).map((e) => e.score_delta!)
    if (deltas.length === 0) return null
    const avg = deltas.reduce((s, d) => s + d, 0) / deltas.length
    if (Math.abs(avg) < 0.5) return { value: "0%", direction: "flat" as const }
    return {
      value: `${avg > 0 ? "+" : ""}${avg.toFixed(0)}%`,
      direction: avg > 0 ? ("up" as const) : ("down" as const),
    }
  }, [topEntitiesQ.data?.items])

  // Queue throughput: disposed / (pending + disposed) as review rate
  const queueTrend = useMemo(() => {
    const pending = queueQ.data?.total ?? 0
    const disposed = disposedQ.data?.total ?? 0
    const total = pending + disposed
    if (total === 0) return null
    const rate = Math.round((disposed / total) * 100)
    return {
      value: `${rate}%`,
      direction: rate >= 50 ? ("down" as const) : ("up" as const),
    }
  }, [queueQ.data?.total, disposedQ.data?.total])

  // Precision vs baseline (50%)
  const precisionTrend = useMemo(() => {
    if (avgPrecision == null) return null
    const delta = avgPrecision - 50
    if (Math.abs(delta) < 1) return { value: "0pp", direction: "flat" as const }
    return {
      value: `${delta > 0 ? "+" : ""}${delta}pp`,
      direction: delta > 0 ? ("down" as const) : ("up" as const), // higher precision = good = green
    }
  }, [avgPrecision])

  return (
    <WasteShell
      title="Workspace"
      description="Entry points and headline risk indicators"
    >
      {/* Three mode cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-8">
        {MODE_CARDS.map((card) => (
          <ModeCard key={card.title} card={card} />
        ))}
      </div>

      {/* Key metrics row */}
      <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
        Key Metrics
      </h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <MetricCard
          label="High-Risk Items"
          value={highRiskCount}
          icon={<AlertTriangle className="w-5 h-5 text-red-600" />}
          color="bg-red-50"
          isLoading={highRiskQ.isLoading}
          trend={riskTrend}
          trendHint="vs last run - higher is worse"
        />
        <MetricCard
          label="Open Queue Items"
          value={queueQ.data?.total ?? 0}
          icon={<Inbox className="w-5 h-5 text-yellow-600" />}
          color="bg-yellow-50"
          isLoading={queueQ.isLoading}
          trend={queueTrend}
          trendHint="review throughput snapshot"
        />
        <MetricCard
          label="Active Investigations"
          value={investigationsQ.data?.total ?? 0}
          icon={<FolderOpen className="w-5 h-5 text-blue-600" />}
          color="bg-blue-50"
          isLoading={investigationsQ.isLoading}
        />
        <MetricCard
          label="Detector Precision"
          value={avgPrecision != null ? `${avgPrecision}%` : "--"}
          icon={<Gauge className="w-5 h-5 text-emerald-600" />}
          color="bg-emerald-50"
          isLoading={accuracyQ.isLoading}
          trend={precisionTrend}
          trendHint="vs 50% baseline - higher is better"
        />
      </div>

      {/* Quick links */}
      <div className="flex items-center gap-3 flex-wrap">
        <Link
          href="/waste/scores"
          className="text-xs font-medium text-purple-600 no-underline hover:text-purple-700 flex items-center gap-1"
        >
          Entity Scores <ArrowRight className="w-3 h-3" />
        </Link>
        <Link
          href="/waste/executive"
          className="text-xs font-medium text-purple-600 no-underline hover:text-purple-700 flex items-center gap-1"
        >
          Executive Summary <ArrowRight className="w-3 h-3" />
        </Link>
        <Link
          href="/waste/investigations"
          className="text-xs font-medium text-purple-600 no-underline hover:text-purple-700 flex items-center gap-1"
        >
          Investigations <ArrowRight className="w-3 h-3" />
        </Link>
      </div>
    </WasteShell>
  )
}

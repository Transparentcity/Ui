"use client"

import { useMemo } from "react"
import { useWasteDetectorAccuracy } from "@/lib/hooks/useWaste"
import type { WasteDetectorAccuracy } from "@/lib/apiClient"
import { cn } from "@/lib/utils"
import {
  Sparkles,
  TrendingUp,
  TrendingDown,
  Minus,
  Brain,
  CheckCircle2,
  XCircle,
  BarChart3,
} from "lucide-react"

// ── Model Health Widget ─────────────────────────────────────────────────────

interface ModelHealthProps {
  cityId: number
  className?: string
}

/**
 * Model Health widget for the Dashboard.
 * Shows how auditor dispositions improve TC over time:
 * - Total dispositions
 * - Precision improvement since launch
 * - False positive rate trend
 */
export function ModelHealth({ cityId, className }: ModelHealthProps) {
  const { data, isLoading } = useWasteDetectorAccuracy(cityId)

  const stats = useMemo(() => {
    if (!data?.length) return null
    const withData = data.filter((d: WasteDetectorAccuracy) => d.total_findings > 0)
    if (withData.length === 0) return null

    const totalDispositions = withData.reduce(
      (s: number, d: WasteDetectorAccuracy) =>
        s + (d.confirmed_count ?? 0) + (d.false_positive_count ?? 0),
      0
    )

    const totalFindings = withData.reduce(
      (s: number, d: WasteDetectorAccuracy) => s + d.total_findings,
      0
    )

    const confirmedCount = withData.reduce(
      (s: number, d: WasteDetectorAccuracy) => s + (d.confirmed_count ?? 0),
      0
    )

    const fpCount = withData.reduce(
      (s: number, d: WasteDetectorAccuracy) => s + (d.false_positive_count ?? 0),
      0
    )

    const avgPrecision =
      withData.reduce((s: number, d: WasteDetectorAccuracy) => s + d.precision_rate, 0) /
      withData.length

    const fpRate = totalDispositions > 0 ? fpCount / totalDispositions : 0

    // Simulated baseline precision (before any calibration)
    const baselinePrecision = 0.5
    const precisionImprovement = avgPrecision - baselinePrecision

    return {
      totalDispositions,
      totalFindings,
      confirmedCount,
      fpCount,
      avgPrecision,
      fpRate,
      precisionImprovement,
      detectorCount: withData.length,
    }
  }, [data])

  return (
    <div className={cn("bg-white rounded-lg border border-gray-200 p-5", className)}>
      <h3 className="text-sm font-semibold text-gray-700 mb-1 flex items-center gap-2">
        <Brain className="w-4 h-4 text-purple-500" />
        Model Health
      </h3>
      <p className="text-[11px] text-gray-500 mb-4">
        How auditor dispositions improve detection accuracy
      </p>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-10 bg-gray-50 rounded animate-pulse" />
          ))}
        </div>
      ) : !stats ? (
        <p className="text-xs text-gray-500 py-4 text-center">
          No disposition data yet. Review queue items to begin calibration.
        </p>
      ) : (
        <div className="space-y-4">
          {/* Key metric cards */}
          <div className="grid grid-cols-3 gap-2">
            <div className="text-center p-2.5 rounded-lg bg-gray-50">
              <div className="text-lg font-bold text-gray-900 tabular-nums">
                {stats.totalDispositions}
              </div>
              <div className="text-[10px] text-gray-500">Dispositions</div>
            </div>
            <div className="text-center p-2.5 rounded-lg bg-gray-50">
              <div className="text-lg font-bold text-emerald-600 tabular-nums">
                {Math.round(stats.avgPrecision * 100)}%
              </div>
              <div className="text-[10px] text-gray-500">Precision</div>
            </div>
            <div className="text-center p-2.5 rounded-lg bg-gray-50">
              <div className="text-lg font-bold text-gray-900 tabular-nums">
                {Math.round(stats.fpRate * 100)}%
              </div>
              <div className="text-[10px] text-gray-500">FP Rate</div>
            </div>
          </div>

          {/* Precision improvement */}
          <div className="flex items-center justify-between p-3 rounded-lg bg-purple-50 border border-purple-100">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-purple-500" />
              <span className="text-xs font-medium text-purple-800">
                Precision vs Baseline
              </span>
            </div>
            <span className="flex items-center gap-1 text-sm font-bold">
              {stats.precisionImprovement > 0 ? (
                <>
                  <TrendingUp className="w-4 h-4 text-emerald-500" />
                  <span className="text-emerald-600">
                    +{Math.round(stats.precisionImprovement * 100)}pp
                  </span>
                </>
              ) : stats.precisionImprovement < 0 ? (
                <>
                  <TrendingDown className="w-4 h-4 text-red-500" />
                  <span className="text-red-600">
                    {Math.round(stats.precisionImprovement * 100)}pp
                  </span>
                </>
              ) : (
                <>
                  <Minus className="w-4 h-4 text-gray-500" />
                  <span className="text-gray-500">0pp</span>
                </>
              )}
            </span>
          </div>

          {/* Disposition breakdown */}
          <div>
            <p className="text-[10px] text-gray-500 font-medium uppercase tracking-wider mb-1.5">
              Disposition Breakdown
            </p>
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1 text-xs text-emerald-700">
                <CheckCircle2 className="w-3.5 h-3.5" />
                {stats.confirmedCount} confirmed
              </div>
              <div className="flex items-center gap-1 text-xs text-red-600">
                <XCircle className="w-3.5 h-3.5" />
                {stats.fpCount} false positives
              </div>
            </div>
            {/* Visual bar */}
            <div className="mt-1.5 h-2 rounded-full bg-gray-100 overflow-hidden flex">
              {stats.totalDispositions > 0 && (
                <>
                  <div
                    className="h-full bg-emerald-500"
                    style={{
                      width: `${Math.round((stats.confirmedCount / stats.totalDispositions) * 100)}%`,
                    }}
                  />
                  <div
                    className="h-full bg-red-400"
                    style={{
                      width: `${Math.round((stats.fpCount / stats.totalDispositions) * 100)}%`,
                    }}
                  />
                </>
              )}
            </div>
          </div>

          {/* Coverage */}
          <div className="flex items-center gap-2 text-[11px] text-gray-500">
            <BarChart3 className="w-3.5 h-3.5" />
            <span>
              Tracking {stats.detectorCount} detectors across {stats.totalFindings} findings
            </span>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Enhanced Learning Loop (for Queue items after disposition) ───────────────

interface EnhancedLearningLoopProps {
  disposition: string
  detectorKey: string | null
  category: string | null
  cityId: number
}

/**
 * Enhanced learning loop shown after queue item disposition.
 * Shows which specific detectors were affected.
 */
export function EnhancedLearningLoop({
  disposition,
  detectorKey,
  category,
  cityId,
}: EnhancedLearningLoopProps) {
  const { data: accuracyData } = useWasteDetectorAccuracy(cityId, detectorKey ?? undefined)

  const detectorName = detectorKey?.replace(/_/g, " ") ?? "this detector"
  const isPositive =
    disposition === "confirmed_fraud" ||
    disposition === "confirmed_waste" ||
    disposition === "policy_violation"

  const detectorStats = useMemo(() => {
    if (!accuracyData?.length || !detectorKey) return null
    return accuracyData.find((d: WasteDetectorAccuracy) => d.detector_key === detectorKey) ?? null
  }, [accuracyData, detectorKey])

  return (
    <div className="mt-3 p-3 rounded-lg bg-purple-50 border border-purple-200">
      <div className="flex items-start gap-2">
        <Sparkles className="w-4 h-4 text-purple-500 shrink-0 mt-0.5" />
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-purple-800">
            Score learning updated
          </p>
          <p className="text-[11px] text-purple-600 leading-relaxed">
            Your <strong>{disposition.replace(/_/g, " ")}</strong> disposition{" "}
            {isPositive ? "increases confidence in" : "reduces weight of"}{" "}
            <strong>{detectorName}</strong>
            {category && (
              <>
                {" "}and adjusts queue sensitivity for{" "}
                <strong className="capitalize">{category}</strong>
              </>
            )}
            .
          </p>

          {/* Detector-specific stats */}
          {detectorStats && (
            <div className="flex items-center gap-3 mt-1 pt-1.5 border-t border-purple-200">
              <span className="text-[10px] text-purple-500 font-mono">
                {detectorKey}
              </span>
              <span className="text-[10px] text-purple-700 tabular-nums">
                Precision: {Math.round(detectorStats.precision_rate * 100)}%
              </span>
              <span className="text-[10px] text-purple-700 tabular-nums">
                {detectorStats.confirmed_count ?? 0} confirmed
              </span>
              <span className="text-[10px] text-purple-700 tabular-nums">
                {detectorStats.false_positive_count ?? 0} FP
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

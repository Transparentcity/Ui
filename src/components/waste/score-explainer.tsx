"use client"

import { useMemo } from "react"
import { TCScoreBadge, scoreTier, TIER_STYLES } from "./tc-score-badge"
import { cn } from "@/lib/utils"
import { Info, Layers, Scale, ShieldCheck } from "lucide-react"

interface Signal {
  detector_key: string
  contribution: number
  weight?: number
  confidence?: string
  confidence_score?: number
}

interface ScoreExplainerProps {
  entityName: string
  score: number
  signals: Signal[]
  signalCount?: number
  scoreDelta?: number | null
  convergenceDomains?: string[]
  className?: string
}

/**
 * Score Explainer component.
 * Shows per-detector contributions, weights, confidence, and corroboration multiplier.
 * Used in entity detail views and Score pages.
 */
export function ScoreExplainer({
  entityName,
  score,
  signals,
  signalCount,
  scoreDelta,
  convergenceDomains,
  className,
}: ScoreExplainerProps) {
  const tier = scoreTier(score)
  const style = TIER_STYLES[tier]

  const sortedSignals = useMemo(
    () => [...signals].sort((a, b) => b.contribution - a.contribution),
    [signals]
  )

  const totalContribution = useMemo(
    () => sortedSignals.reduce((s, sig) => s + sig.contribution, 0),
    [sortedSignals]
  )

  const resolvedSignals = useMemo(
    () =>
      sortedSignals.map((sig) => {
        if (sig.confidence) return sig
        if (sig.confidence_score != null) {
          const level =
            sig.confidence_score >= 0.7
              ? "high"
              : sig.confidence_score >= 0.4
                ? "medium"
                : "low"
          return { ...sig, confidence: level }
        }
        return sig
      }),
    [sortedSignals]
  )

  const hasConvergence = convergenceDomains && convergenceDomains.length >= 2
  const corroborationMultiplier = hasConvergence
    ? (1 + 0.1 * (convergenceDomains.length - 1)).toFixed(2)
    : null

  return (
    <div className={cn("space-y-4", className)}>
      {/* Score header */}
      <div className="flex items-center gap-4">
        <TCScoreBadge score={score} size="lg" />
        <div>
          <p className="text-sm font-semibold text-gray-900">{entityName}</p>
          <p className="text-xs text-gray-500">
            {style.label} risk &middot; {signalCount ?? signals.length} signals
            {scoreDelta != null && scoreDelta !== 0 && (
              <span className={scoreDelta > 0 ? "text-red-600 ml-2" : "text-green-600 ml-2"}>
                {scoreDelta > 0 ? "+" : ""}{scoreDelta.toFixed(1)} since last scoring
              </span>
            )}
          </p>
        </div>
      </div>

      {/* Detector contributions */}
      <div>
        <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
          <Layers className="w-3.5 h-3.5" />
          Detector Contributions
        </h4>
        {sortedSignals.length === 0 ? (
          <p className="text-xs text-gray-400">No signal breakdown available</p>
        ) : (
          <div className="space-y-1.5">
            {sortedSignals.map((sig, i) => {
              const pct = totalContribution > 0
                ? Math.round((sig.contribution / totalContribution) * 100)
                : 0
              return (
                <div key={i} className="flex items-center gap-2">
                  <span className="text-xs text-gray-600 w-32 truncate" title={sig.detector_key}>
                    {sig.detector_key.replace(/_/g, " ")}
                  </span>
                  <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className={cn("h-full rounded-full", style.bg)}
                      style={{ width: `${Math.min(100, pct)}%` }}
                    />
                  </div>
                  <span className="text-xs text-gray-500 tabular-nums w-10 text-right">
                    {sig.contribution.toFixed(1)}
                  </span>
                  <span className="text-[10px] text-gray-400 tabular-nums w-8 text-right">
                    {pct}%
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Weight & confidence row */}
      {resolvedSignals.some((s) => s.weight != null || s.confidence) && (
        <div>
          <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
            <Scale className="w-3.5 h-3.5" />
            Weights & Confidence
          </h4>
          <div className="grid grid-cols-3 gap-2 text-xs">
            <span className="font-medium text-gray-500">Detector</span>
            <span className="font-medium text-gray-500 text-center">Weight</span>
            <span className="font-medium text-gray-500 text-center">Confidence</span>
            {resolvedSignals.map((sig, i) => (
              <div key={i} className="contents">
                <span className="text-gray-600 truncate">
                  {sig.detector_key.replace(/_/g, " ")}
                </span>
                <span className="text-center tabular-nums text-gray-700">
                  {sig.weight != null ? `${(sig.weight * 100).toFixed(0)}%` : "--"}
                </span>
                <span className="text-center">
                  {sig.confidence ? (
                    <span className={cn(
                      "px-1.5 py-0.5 rounded text-[10px] font-medium",
                      sig.confidence === "high"
                        ? "bg-emerald-50 text-emerald-700"
                        : sig.confidence === "medium"
                          ? "bg-gray-100 text-gray-600"
                          : "bg-gray-50 text-gray-500"
                    )}>
                      {sig.confidence}
                    </span>
                  ) : (
                    "--"
                  )}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Corroboration multiplier */}
      {hasConvergence && (
        <div className="p-3 rounded-lg bg-purple-50 border border-purple-200">
          <div className="flex items-start gap-2">
            <ShieldCheck className="w-4 h-4 text-purple-500 shrink-0 mt-0.5" />
            <div>
              <p className="text-xs font-medium text-purple-800">
                Cross-Domain Corroboration &times;{corroborationMultiplier}
              </p>
              <p className="text-[11px] text-purple-600 mt-0.5">
                Flagged across {convergenceDomains.length} independent categories:{" "}
                {convergenceDomains.map((d, i) => (
                  <span key={d}>
                    {i > 0 && ", "}
                    <strong className="capitalize">{d}</strong>
                  </span>
                ))}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Explanation */}
      <div className="flex items-start gap-2 text-[11px] text-gray-400">
        <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
        <p>
          The TC Score is a weighted composite of all detector signals for this entity.
          Weights are calibrated by auditor dispositions — confirming or dismissing findings
          adjusts detector influence over time.
        </p>
      </div>
    </div>
  )
}

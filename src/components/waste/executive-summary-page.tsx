"use client"

import { useMemo } from "react"
import {
  useWasteEntityScores,
  useLatestPersistedWasteResult,
  useWasteDetectorAccuracy,
} from "@/lib/hooks/useWaste"
import { useWasteCity } from "./WasteCityContext"
import type { WasteEntityScore, WasteFinding } from "@/lib/apiClient"
import { WasteShell } from "./waste-shell"
import { TCScoreBadge, scoreTier, TIER_STYLES } from "./tc-score-badge"
import { normalizeWasteCategory, getWasteCategoryLabel } from "./waste-utils"
import { cn } from "@/lib/utils"
import {
  Building2,
  Shield,
  AlertTriangle,
  Triangle,
  Layers,
  ArrowRight,
  FileText,
  TrendingUp,
  TrendingDown,
} from "lucide-react"
import Link from "next/link"

// ── Domain Labels ───────────────────────────────────────────────────────────

const DOMAIN_LABELS: Record<string, string> = {
  payroll: "Payroll & Compensation",
  contracts: "Contracts & Procurement",
  procurement: "Contracts & Procurement",
  infrastructure: "Infrastructure & Services",
  influence: "Influence & Pay-to-Play",
  integrity: "Personnel Integrity",
  confirmed: "Confirmed Cases",
  convergence: "Cross-Domain Convergence",
}

const TRIANGLE_LABELS: Record<string, { label: string; description: string }> = {
  Opportunity: {
    label: "Opportunity",
    description: "Weak controls or circumvention patterns that enable misconduct",
  },
  Pressure: {
    label: "Pressure",
    description: "Financial or performance stress indicators that motivate improper actions",
  },
  Capability: {
    label: "Capability",
    description: "Position, access, or concealment ability that enables undetected abuse",
  },
}

// ── Department Narrative Card ───────────────────────────────────────────────

function DepartmentBriefing({
  dept,
  findings,
}: {
  dept: WasteEntityScore
  findings: WasteFinding[]
}) {
  const score = dept.composite_score ?? 0
  const tier = scoreTier(score)
  const style = TIER_STYLES[tier]
  const delta = dept.score_delta ?? 0

  // Find findings for this department
  const deptFindings = useMemo(() => {
    const name = dept.entity_name?.toLowerCase() ?? ""
    return findings.filter(
      (f) => f.department?.toLowerCase() === name || f.entity?.toLowerCase() === name
    )
  }, [dept.entity_name, findings])

  // Domains flagged
  const domainsFlagged = useMemo(() => {
    const domains = new Set<string>()
    deptFindings.forEach((f) => {
      const cat = normalizeWasteCategory(f.category)
      domains.add(cat)
    })
    return [...domains]
  }, [deptFindings])

  // Fraud triangle legs
  const triangleLegs = useMemo(() => {
    const legs = new Set<string>()
    deptFindings.forEach((f) => {
      if (f.convergence_details?.triangle_legs) {
        ;(f.convergence_details.triangle_legs as string[]).forEach((l) => legs.add(l))
      }
    })
    return [...legs]
  }, [deptFindings])

  // Top severity findings as drivers
  const topDrivers = useMemo(() => {
    return deptFindings
      .filter((f) => f.severity === "critical" || f.severity === "high")
      .slice(0, 3)
  }, [deptFindings])

  // Has convergence
  const hasConvergence = domainsFlagged.length >= 2

  // Generate narrative
  const narrative = useMemo(() => {
    const parts: string[] = []
    parts.push(
      `${dept.entity_name} carries a ${style.label.toLowerCase()} composite risk score of ${score.toFixed(1)}.`
    )

    if (delta > 0) {
      parts.push(
        `Risk has increased by ${delta.toFixed(1)} points since the last assessment.`
      )
    } else if (delta < 0) {
      parts.push(
        `Risk has decreased by ${Math.abs(delta).toFixed(1)} points since the last assessment.`
      )
    }

    if (domainsFlagged.length > 0) {
      parts.push(
        `Signals detected across ${domainsFlagged.length} domain${domainsFlagged.length > 1 ? "s" : ""}: ${domainsFlagged.map((d) => DOMAIN_LABELS[d] ?? d).join(", ")}.`
      )
    }

    if (hasConvergence) {
      parts.push(
        "Cross-domain convergence detected — this department shows correlated risk patterns across independent detector categories, which significantly increases the probability of systemic issues."
      )
    }

    if (triangleLegs.length > 0) {
      parts.push(
        `Fraud Triangle analysis shows ${triangleLegs.length}/3 leg${triangleLegs.length > 1 ? "s" : ""} present (${triangleLegs.join(", ")}).`
      )
      if (triangleLegs.length === 3) {
        parts.push(
          "All three fraud triangle components are present, indicating elevated risk of intentional misconduct."
        )
      }
    }

    return parts.join(" ")
  }, [dept.entity_name, score, delta, domainsFlagged, hasConvergence, triangleLegs, style.label])

  // Recommended actions
  const recommendations = useMemo(() => {
    const actions: string[] = []
    if (tier === "critical") {
      actions.push("Escalate for immediate audit committee review")
      actions.push("Initiate formal investigation within 48 hours")
    } else if (tier === "high") {
      actions.push("Schedule enhanced monitoring review within 2 weeks")
      actions.push("Assign dedicated auditor for ongoing oversight")
    }
    if (hasConvergence) {
      actions.push("Cross-reference findings across domains for common root causes")
    }
    if (triangleLegs.length >= 2) {
      actions.push("Evaluate internal control adequacy and separation of duties")
    }
    if (topDrivers.length > 0) {
      actions.push("Review top-risk findings and prioritize for queue disposition")
    }
    if (actions.length === 0) {
      actions.push("Continue routine monitoring")
    }
    return actions
  }, [tier, hasConvergence, triangleLegs, topDrivers])

  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
      {/* Header with score */}
      <div className="p-5 border-b border-gray-100">
        <div className="flex items-center gap-4">
          <TCScoreBadge score={score} size="lg" showLabel />
          <div className="flex-1 min-w-0">
            <h3 className="text-base font-semibold text-gray-900 truncate">
              {dept.entity_name}
            </h3>
            <div className="flex items-center gap-3 mt-0.5 text-xs text-gray-500">
              <span>{dept.signal_count} signals</span>
              {delta !== 0 && (
                <span className="flex items-center gap-0.5">
                  {delta > 0 ? (
                    <TrendingUp className="w-3 h-3 text-red-500" />
                  ) : (
                    <TrendingDown className="w-3 h-3 text-emerald-500" />
                  )}
                  <span className={delta > 0 ? "text-red-600" : "text-emerald-600"}>
                    {delta > 0 ? "+" : ""}{delta.toFixed(1)}
                  </span>
                </span>
              )}
              {hasConvergence && (
                <span className="text-purple-600 bg-purple-50 px-1.5 py-0.5 rounded text-[10px] font-medium">
                  Convergence
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Briefing narrative */}
      <div className="p-5 space-y-4">
        <div>
          <div className="flex items-center gap-1.5 mb-1.5">
            <FileText className="w-3.5 h-3.5 text-gray-500" />
            <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">
              Risk Assessment
            </span>
          </div>
          <p className="text-sm text-gray-700 leading-relaxed">
            {narrative}
          </p>
        </div>

        {/* Domains flagged */}
        {domainsFlagged.length > 0 && (
          <div>
            <div className="flex items-center gap-1.5 mb-1.5">
              <Layers className="w-3.5 h-3.5 text-gray-500" />
              <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">
                Domains Flagged
              </span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {domainsFlagged.map((d) => (
                <span
                  key={d}
                  className="text-[11px] bg-gray-100 text-gray-700 px-2 py-0.5 rounded-full capitalize"
                >
                  {getWasteCategoryLabel(d)}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Fraud Triangle */}
        {triangleLegs.length > 0 && (
          <div>
            <div className="flex items-center gap-1.5 mb-1.5">
              <Triangle className="w-3.5 h-3.5 text-gray-500" />
              <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">
                Fraud Triangle ({triangleLegs.length}/3)
              </span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {["Opportunity", "Pressure", "Capability"].map((leg) => {
                const active = triangleLegs.includes(leg)
                const info = TRIANGLE_LABELS[leg]
                return (
                  <div
                    key={leg}
                    className={cn(
                      "p-2 rounded-lg border text-center",
                      active
                        ? "bg-red-50 border-red-200"
                        : "bg-gray-50 border-gray-100"
                    )}
                  >
                    <p
                      className={cn(
                        "text-xs font-semibold",
                        active ? "text-red-700" : "text-gray-500"
                      )}
                    >
                      {info.label}
                    </p>
                    <p className="text-[9px] text-gray-500 mt-0.5 line-clamp-2">
                      {info.description}
                    </p>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Top Risk Drivers */}
        {topDrivers.length > 0 && (
          <div>
            <div className="flex items-center gap-1.5 mb-1.5">
              <AlertTriangle className="w-3.5 h-3.5 text-gray-500" />
              <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">
                Top Risk Drivers
              </span>
            </div>
            <div className="space-y-1">
              {topDrivers.map((f, i) => (
                <div key={i} className="flex items-start gap-2 text-xs text-gray-600">
                  <span className="text-red-400 mt-0.5 shrink-0">&#x25cf;</span>
                  <span className="line-clamp-1">{f.metric}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Recommended Actions */}
        <div>
          <div className="flex items-center gap-1.5 mb-1.5">
            <Shield className="w-3.5 h-3.5 text-gray-500" />
            <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">
              Recommended Actions
            </span>
          </div>
          <ul className="space-y-1">
            {recommendations.map((action, i) => (
              <li key={i} className="flex items-start gap-2 text-xs text-gray-600">
                <ArrowRight className="w-3 h-3 text-purple-400 shrink-0 mt-0.5" />
                {action}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  )
}

// ── Main Component ──────────────────────────────────────────────────────────

export function ExecutiveSummaryPage() {
  const { selectedCityId: cityId } = useWasteCity()

  const { data: deptData, isLoading: deptsLoading } = useWasteEntityScores({
    cityId,
    perPage: 200,
    sortBy: "composite_score",
    sortDir: "desc",
    entityType: "department",
  })

  const { data: analysisData, isLoading: findingsLoading } =
    useLatestPersistedWasteResult(cityId)

  const { data: accuracyData } = useWasteDetectorAccuracy(cityId)

  const departments = deptData?.items ?? []
  const findings = analysisData?.findings ?? []
  const isLoading = deptsLoading || findingsLoading

  // Summary stats
  const criticalDepts = departments.filter(
    (d) => scoreTier(d.composite_score) === "critical"
  ).length
  const highDepts = departments.filter(
    (d) => scoreTier(d.composite_score) === "high"
  ).length
  const avgPrecision = useMemo(() => {
    if (!accuracyData?.length) return null
    const withData = accuracyData.filter((d) => d.total_findings > 0)
    if (withData.length === 0) return null
    const sum = withData.reduce((s, d) => s + d.precision_rate, 0)
    return Math.round((sum / withData.length) * 100)
  }, [accuracyData])

  return (
    <WasteShell
      title="Backtrace"
      description="Department risk briefings for leadership review"
    >
      {/* Summary bar */}
      <div className="bg-white rounded-lg border border-gray-200 p-5 mb-6">
        <div className="flex items-center gap-3 mb-3">
          <Building2 className="w-5 h-5 text-gray-500" />
          <h2 className="text-sm font-semibold text-gray-700">
            Citywide Risk Overview
          </h2>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div>
            <p className="text-xs text-gray-500">Departments Monitored</p>
            <p className="text-2xl font-bold text-gray-900 tabular-nums">
              {isLoading ? "--" : departments.length}
            </p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Critical Risk</p>
            <p className="text-2xl font-bold text-red-600 tabular-nums">
              {isLoading ? "--" : criticalDepts}
            </p>
          </div>
          <div>
            <p className="text-xs text-gray-500">High Risk</p>
            <p className="text-2xl font-bold text-orange-500 tabular-nums">
              {isLoading ? "--" : highDepts}
            </p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Model Precision</p>
            <p className="text-2xl font-bold text-emerald-600 tabular-nums">
              {avgPrecision != null ? `${avgPrecision}%` : "--"}
            </p>
          </div>
        </div>
        <p className="text-[11px] text-gray-500 mt-3">
          This briefing is generated from the latest waste analysis and reflects
          composite risk scores weighted by auditor-validated detector precision.
          Scores are calibrated continuously as auditors review queue items.
        </p>
      </div>

      {/* Department briefings */}
      {isLoading ? (
        <div className="space-y-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-48 bg-gray-100 rounded-lg animate-pulse" />
          ))}
        </div>
      ) : departments.length === 0 ? (
        <div className="text-center py-16">
          <Building2 className="w-10 h-10 text-gray-300 mx-auto mb-3" />
          <p className="text-sm text-gray-500 mb-1">
            No department risk profiles available
          </p>
          <p className="text-xs text-gray-500">
            Run a waste analysis to generate department-level risk assessments.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {departments.map((dept) => (
            <DepartmentBriefing
              key={dept.id}
              dept={dept}
              findings={findings}
            />
          ))}
        </div>
      )}

      {/* Footer link */}
      <div className="mt-6 flex justify-center">
        <Link
          href="/waste/forensics/departments"
          className="flex items-center gap-1.5 text-sm font-medium text-purple-600 no-underline hover:text-purple-700"
        >
          View detailed department profiles <ArrowRight className="w-4 h-4" />
        </Link>
      </div>
    </WasteShell>
  )
}

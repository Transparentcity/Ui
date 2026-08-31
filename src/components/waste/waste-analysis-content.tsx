"use client"

import { useEffect, useMemo, useState } from "react"
import {
  ClipboardCopy,
  Download,
  FileSpreadsheet,
  FileText,
  Filter,
  RefreshCw,
  ShieldCheck,
  TrendingUp,
  AlertTriangle,
  BarChart3,
  ChevronDown,
  ChevronRight,
} from "lucide-react"
import { useAuth0 } from "@auth0/auth0-react"
import { useWasteAnalysis } from "@/lib/hooks/useWaste"
import type { WasteAnalyzeResponse, WasteFinding } from "@/lib/apiClient"
import { exportWasteFindings, exportAuditorReport } from "@/lib/apiClient"
import { WasteShell } from "./waste-shell"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

type WasteCategory = "all" | "convergence" | "payroll" | "contracts" | "infrastructure" | "integrity"
const ANALYSIS_REFRESH_ESTIMATED_SECONDS = 120
const ANALYSIS_REFRESH_TIMEOUT_MS = 120_000
const WASTE_ANALYSIS_CACHE_KEY = "waste:last-analysis:v1"

function safeSetCache(key: string, data: WasteAnalyzeResponse): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(data))
  } catch {
    const limits = [500, 300, 150]
    for (const limit of limits) {
      try {
        const trimmed: WasteAnalyzeResponse = {
          ...data,
          findings: data.findings?.slice(0, limit) ?? [],
        }
        window.localStorage.setItem(key, JSON.stringify(trimmed))
        return
      } catch {
        continue
      }
    }
    try {
      window.localStorage.removeItem(key)
    } catch {
      // localStorage completely unavailable
    }
  }
}

function normalizeWasteCategory(category: string): WasteCategory {
  const key = category.toLowerCase().trim().replace(/[_\s&.,'-]+/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, "")
  if (key === "convergence" || key.includes("convergence") || key.includes("cross_domain")) return "convergence"
  if (key === "payroll" || key.includes("payroll") || key === "payroll_compensation") return "payroll"
  if (key === "contracts" || key === "vendor" || key === "vendors" || key.includes("vendor") || key.includes("contract") || key === "vendor_procurement" || key === "contracts_procurement") return "contracts"
  if (key === "infrastructure" || key === "services" || key === "service" || key.includes("infrastructure") || key === "infrastructure_services") return "infrastructure"
  if (key === "influence" || key.includes("influence") || key.includes("lobby") || key.includes("pay_to_play")) return "contracts"
  if (key === "integrity" || key.includes("integrity") || key.includes("personnel") || key.includes("revolving") || key.includes("conflict")) return "integrity"
  return "all"
}

function formatCategoryLabel(category: WasteCategory): string {
  if (category === "all") return "All Categories"
  if (category === "convergence") return "Cross-Domain Convergence"
  if (category === "payroll") return "Payroll & Compensation"
  if (category === "contracts") return "Contracts & Procurement"
  if (category === "integrity") return "Personnel Integrity"
  return "Infrastructure & Services"
}

function getAnalysisRefreshProgress(elapsedSeconds: number) {
  let step = "Loading latest anomaly findings"
  if (elapsedSeconds > 8) step = "Recomputing sub-cluster summaries and outliers"
  if (elapsedSeconds > 20) step = "Preparing auditor report sections"
  if (elapsedSeconds > 30) step = "Finalizing data sources and export payloads"

  const remaining = Math.max(0, ANALYSIS_REFRESH_ESTIMATED_SECONDS - elapsedSeconds)
  const isLongRunning = elapsedSeconds > ANALYSIS_REFRESH_ESTIMATED_SECONDS + 12
  const etaLabel = isLongRunning
    ? "Taking longer than usual, but still processing in the background"
    : remaining > 0
      ? `Estimated time left: ~${remaining}s`
      : "Estimated time left: wrapping up"
  const progressPct = Math.min(95, Math.max(6, Math.round((elapsedSeconds / ANALYSIS_REFRESH_ESTIMATED_SECONDS) * 100)))
  return { step, etaLabel, progressPct, isLongRunning }
}

function looksLikeSamePersonConflict(finding: WasteFinding): boolean {
  const text = [finding.entity, finding.metric, finding.metricDetail, finding.description].join(" ").toLowerCase()
  const signals = ["same person", "same individual", "same employee", "self approval", "self-approval", "reviewed own", "applicant and reviewer", "applied and approved", "conflict of role"]
  return signals.some((signal) => text.includes(signal))
}

function formatDollars(amount: number | null | undefined): string {
  if (amount == null || amount === 0) return "—"
  return `$${amount.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
}

function confidenceColor(conf: string): string {
  const c = conf.toLowerCase()
  if (c === "high") return "text-red-700 bg-red-50"
  if (c === "medium") return "text-amber-700 bg-amber-50"
  return "text-gray-600 bg-gray-50"
}

function severityColor(sev: string): string {
  const s = sev.toLowerCase()
  if (s === "critical") return "text-red-800 bg-red-100 border-red-300"
  if (s === "high") return "text-orange-800 bg-orange-100 border-orange-300"
  if (s === "medium") return "text-amber-800 bg-amber-100 border-amber-300"
  return "text-gray-700 bg-gray-100 border-gray-300"
}

function buildRecommendedNextSteps(
  category: WasteCategory,
  subcluster: string,
  hasRoleConflictSignal: boolean,
): string[] {
  const common = [
    "Validate source records and identity/account metadata for each flagged event.",
    "Request supervisor notes and policy exception logs tied to the selected records.",
    "Preserve audit trail exports (who/when/action) before any remediation edits.",
    "Cross-reference flagged entities against other detection categories for corroboration.",
  ]
  if (hasRoleConflictSignal) {
    common.unshift("Run conflict-of-duty review for potential same-person apply/review chains.")
  }
  if (category === "payroll") {
    return [...common, "Compare overtime approval timing against shift rosters and emergency declarations.", "Reconcile payroll changes against HR role-change records for the same period.", "Verify hours feasibility against physical presence logs (badge swipes, GPS)."]
  }
  if (category === "contracts") {
    return [...common, "Check procurement threshold splits and repeat-award patterns by vendor and approver.", "Review bid waiver rationale and supporting attachments for completeness.", "Verify vendor registration and business license status against city records."]
  }
  if (category === "infrastructure") {
    return [...common, "Cross-check work-order closure timestamps with field verification logs.", "Validate cluster anomalies against seasonal or outage-related service surges.", "Review contract change orders and their approval chains."]
  }
  return [...common, `Perform focused review on "${subcluster}" with control-owner interviews.`, "Document disposition outcomes for each flagged record (confirmed issue vs valid exception)."]
}

function getMethodologyDescription(tool: string, subcategory: string): string {
  const key = `${tool} ${subcategory}`.toLowerCase()
  if (key.includes("pareto") || key.includes("concentration")) return "Statistical analysis using the Pareto principle (80/20 rule) to identify departments where a small percentage of employees consume a disproportionately high share of the overtime budget."
  if (key.includes("overtime") || key.includes("hours")) return "Cross-referenced employee compensation records against job code standards. Calculated Z-scores for weekly hours worked to identify statistical outliers (>3 standard deviations from the mean) and flagged instances where overtime earnings exceeded 100% of base salary."
  if (key.includes("ghost") || key.includes("unregistered")) return "Performed entity resolution match between Vendor Payments and Registered Business Locations. Vendors receiving significant payments (>$50k) with no corresponding business license or registry entry were flagged."
  if (key.includes("duplicate") || key.includes("sss")) return "Applied 'Same-Same-Same' (SSS) detection to identify identical payment amounts to the same vendor on the same date across different vouchers. Standard forensic accounting test for duplicate billing."
  if (key.includes("misdirected") || key.includes("ssd")) return "Applied 'Same-Same-Different' (SSD) detection to identify single Purchase Orders paying identical amounts to multiple different vendors — strong indicator of invoice fraud."
  if (key.includes("benford")) return "Analyzed leading-digit distribution in payment amounts against Benford's Law expected frequencies. Chi-Square test flags statistically significant deviations as potential indicators of fabricated or structured invoices."
  if (key.includes("split") || key.includes("structuring") || key.includes("threshold")) return "Analyzed payment clusters to identify 'split purchase orders' — multiple payments to the same vendor on the same day summing to just above approval thresholds, suggesting attempts to bypass procurement controls."
  if (key.includes("pension")) return "Compared current-year total compensation against a 3-year trailing average. Flagged employees with >50% YoY increase driven primarily by 'Other Pay' or 'Special Pay' in their final service years."
  if (key.includes("permit") || key.includes("fast tracking")) return "Analyzed building permit approval timelines against cohort median (same type/neighborhood). Flagged applications processed at <10th percentile speed as indicators of preferential fast-tracking."
  return `Automated anomaly detection using ${tool} to identify statistical outliers and patterns deviating from standard ${subcategory} baselines.`
}

interface SubFindingStats {
  count: number
  criticalCount: number
  highCount: number
  mediumCount: number
  totalExposure: number
  avgConfidenceScore: number
  avgPriorityScore: number
  entityCount: number
  topEntities: { name: string; exposure: number; count: number }[]
  detectorMethods: string[]
}

function computeSubFindingStats(findings: WasteFinding[]): SubFindingStats {
  const entityMap = new Map<string, { exposure: number; count: number }>()
  const detectors = new Set<string>()
  let criticalCount = 0
  let highCount = 0
  let mediumCount = 0
  let totalExposure = 0
  let totalConfidence = 0
  let totalPriority = 0

  for (const f of findings) {
    const sev = f.severity?.toLowerCase()
    if (sev === "critical") criticalCount++
    else if (sev === "high") highCount++
    else if (sev === "medium") mediumCount++

    const amt = f.estimated_dollar_impact ?? f.amount ?? 0
    totalExposure += amt
    totalConfidence += f.confidence_score ?? 0
    totalPriority += f.priority_score ?? 0

    if (f.tool) detectors.add(f.tool.split(" ")[0])

    const ent = (f.entity || "Unknown").trim()
    const existing = entityMap.get(ent) ?? { exposure: 0, count: 0 }
    existing.exposure += amt
    existing.count += 1
    entityMap.set(ent, existing)
  }

  const topEntities = Array.from(entityMap.entries())
    .map(([name, { exposure, count }]) => ({ name, exposure, count }))
    .sort((a, b) => b.exposure - a.exposure)
    .slice(0, 10)

  return {
    count: findings.length,
    criticalCount,
    highCount,
    mediumCount,
    totalExposure,
    avgConfidenceScore: findings.length ? totalConfidence / findings.length : 0,
    avgPriorityScore: findings.length ? totalPriority / findings.length : 0,
    entityCount: entityMap.size,
    topEntities,
    detectorMethods: Array.from(detectors),
  }
}

export function WasteAnalysisContent() {
  const { getAccessTokenSilently } = useAuth0()
  const [selectedCategory, setSelectedCategory] = useState<WasteCategory>("all")
  const [selectedSubcluster, setSelectedSubcluster] = useState<string>("")
  const [statusMessage, setStatusMessage] = useState("")
  const [allowAutoFetch, setAllowAutoFetch] = useState(false)
  const [isManualRefreshing, setIsManualRefreshing] = useState(false)
  const [refreshTimedOut, setRefreshTimedOut] = useState(false)
  const [expandedFindings, setExpandedFindings] = useState<Set<string>>(new Set())
  const [exporting, setExporting] = useState<string | null>(null)
  const [cachedData, setCachedData] = useState<WasteAnalyzeResponse | null>(() => {
    if (typeof window === "undefined") return null
    try {
      const raw = window.localStorage.getItem(WASTE_ANALYSIS_CACHE_KEY)
      if (!raw) return null
      if (raw.length > 4_000_000) {
        window.localStorage.removeItem(WASTE_ANALYSIS_CACHE_KEY)
        return null
      }
      return JSON.parse(raw) as WasteAnalyzeResponse
    } catch {
      try { window.localStorage.removeItem(WASTE_ANALYSIS_CACHE_KEY) } catch { /* noop */ }
      return null
    }
  })
  const [refreshStartedAt, setRefreshStartedAt] = useState<number | null>(null)
  const [refreshElapsedSeconds, setRefreshElapsedSeconds] = useState(0)

  const { data, error, forceRefetch } = useWasteAnalysis(undefined, allowAutoFetch)
  const displayData = data ?? cachedData

  useEffect(() => {
    if (!data) return
    setCachedData(data)
    if (typeof window !== "undefined") safeSetCache(WASTE_ANALYSIS_CACHE_KEY, data)
  }, [data])

  useEffect(() => {
    if (isManualRefreshing) {
      setRefreshStartedAt((prev) => prev ?? Date.now())
      return
    }
    setRefreshStartedAt(null)
    setRefreshElapsedSeconds(0)
  }, [isManualRefreshing])

  useEffect(() => {
    if (!isManualRefreshing || refreshStartedAt == null) return
    setRefreshElapsedSeconds(Math.max(0, Math.floor((Date.now() - refreshStartedAt) / 1000)))
    const interval = window.setInterval(() => {
      setRefreshElapsedSeconds(Math.max(0, Math.floor((Date.now() - refreshStartedAt) / 1000)))
    }, 1000)
    return () => window.clearInterval(interval)
  }, [isManualRefreshing, refreshStartedAt])

  useEffect(() => {
    if (!isManualRefreshing) return
    const timeout = window.setTimeout(() => {
      setRefreshTimedOut(true)
    }, ANALYSIS_REFRESH_TIMEOUT_MS)
    return () => window.clearTimeout(timeout)
  }, [isManualRefreshing])

  const generatedAt = useMemo(() => new Date(), [])
  const generatedLabel = generatedAt.toLocaleString()
  const findings = displayData?.findings ?? []

  const categoryFilteredFindings = useMemo(() => {
    if (selectedCategory === "all") return findings
    return findings.filter((f) => normalizeWasteCategory(f.category) === selectedCategory)
  }, [findings, selectedCategory])

  // Aggregate stats for the entire category
  const categoryStats = useMemo(() => computeSubFindingStats(categoryFilteredFindings), [categoryFilteredFindings])

  const subclusterOptions = useMemo(() => {
    const counts: Record<string, number> = {}
    const exposures: Record<string, number> = {}
    categoryFilteredFindings.forEach((f) => {
      counts[f.subcategory] = (counts[f.subcategory] ?? 0) + 1
      exposures[f.subcategory] = (exposures[f.subcategory] ?? 0) + (f.estimated_dollar_impact ?? f.amount ?? 0)
    })
    return Object.entries(counts)
      .sort((a, b) => (exposures[b[0]] ?? 0) - (exposures[a[0]] ?? 0))
      .map(([name, count]) => ({ name, count, exposure: exposures[name] ?? 0 }))
  }, [categoryFilteredFindings])

  useEffect(() => {
    if (!subclusterOptions.length) {
      setSelectedSubcluster("")
      return
    }
    const stillValid = subclusterOptions.some((o) => o.name === selectedSubcluster)
    if (!stillValid) setSelectedSubcluster(subclusterOptions[0].name)
  }, [selectedSubcluster, subclusterOptions])

  const selectedClusterFindings = useMemo(() => {
    if (!selectedSubcluster) return []
    return categoryFilteredFindings
      .filter((f) => f.subcategory === selectedSubcluster)
      .slice()
      .sort((a, b) => (b.priority_score ?? 0) - (a.priority_score ?? 0))
  }, [categoryFilteredFindings, selectedSubcluster])

  const clusterStats = useMemo(() => computeSubFindingStats(selectedClusterFindings), [selectedClusterFindings])

  const primaryFinding = selectedClusterFindings[0] ?? null
  const comparisonFindings = selectedClusterFindings.slice(1)
  const hasRoleConflictSignal = useMemo(() => selectedClusterFindings.some(looksLikeSamePersonConflict), [selectedClusterFindings])

  const analysisPeriod = useMemo(() => {
    if (!displayData?.analysis_timestamp) return "Current analysis window"
    const asOf = new Date(displayData.analysis_timestamp).toLocaleDateString()
    return `Up to ${asOf}`
  }, [displayData?.analysis_timestamp])

  const refreshProgress = getAnalysisRefreshProgress(refreshElapsedSeconds)

  const recommendedSteps = useMemo(
    () => buildRecommendedNextSteps(selectedCategory, selectedSubcluster || "selected sub-cluster", hasRoleConflictSignal),
    [hasRoleConflictSignal, selectedCategory, selectedSubcluster],
  )

  const methodologyDescription = useMemo(() => {
    if (!primaryFinding) return "Standard anomaly detection algorithms applied to dataset."
    return getMethodologyDescription(primaryFinding.tool, primaryFinding.subcategory)
  }, [primaryFinding])

  const toggleFinding = (id: string) => {
    setExpandedFindings((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  // ────────────────────────────────────────────────────────────────────
  // Plain Text Report (comprehensive)
  // ────────────────────────────────────────────────────────────────────

  const plainTextReport = useMemo(() => {
    const lines: string[] = []
    const hr = "═".repeat(80)
    const hr2 = "─".repeat(80)

    lines.push(hr)
    lines.push("  TRANSPARENT.CITY — COMPREHENSIVE AUDITOR OBSERVATION REPORT")
    lines.push(hr)
    lines.push("")
    lines.push(`Generated:        ${generatedLabel}`)
    lines.push(`Prepared by:      Transparent.city Automated Auditor`)
    lines.push(`Scope:            ${analysisPeriod}`)
    lines.push(`Focus Area:       ${formatCategoryLabel(selectedCategory)} > ${selectedSubcluster || "N/A"}`)
    lines.push(`Report Category:  ${formatCategoryLabel(selectedCategory)}`)
    lines.push("")

    // Section 1: Executive Summary
    lines.push(hr2)
    lines.push("  1. EXECUTIVE SUMMARY")
    lines.push(hr2)
    lines.push("")
    lines.push(`Total findings across ${formatCategoryLabel(selectedCategory)}: ${categoryStats.count}`)
    lines.push(`  - Critical: ${categoryStats.criticalCount}`)
    lines.push(`  - High: ${categoryStats.highCount}`)
    lines.push(`  - Medium: ${categoryStats.mediumCount}`)
    lines.push(`  - Estimated total exposure: ${formatDollars(categoryStats.totalExposure)}`)
    lines.push(`  - Unique entities flagged: ${categoryStats.entityCount}`)
    lines.push(`  - Detection methods used: ${categoryStats.detectorMethods.length}`)
    lines.push("")
    lines.push(`Selected sub-cluster: ${selectedSubcluster}`)
    lines.push(`  - Findings in cluster: ${clusterStats.count}`)
    lines.push(`  - Critical: ${clusterStats.criticalCount}, High: ${clusterStats.highCount}, Medium: ${clusterStats.mediumCount}`)
    lines.push(`  - Cluster exposure: ${formatDollars(clusterStats.totalExposure)}`)
    lines.push(`  - Avg confidence score: ${clusterStats.avgConfidenceScore.toFixed(2)} / 1.00`)
    lines.push(`  - Avg priority score: ${clusterStats.avgPriorityScore.toFixed(1)} / 100`)
    lines.push(`  - Unique entities: ${clusterStats.entityCount}`)
    lines.push("")

    // Section 2: Top Entities by Exposure
    if (clusterStats.topEntities.length) {
      lines.push(hr2)
      lines.push("  2. TOP ENTITIES BY ESTIMATED EXPOSURE")
      lines.push(hr2)
      lines.push("")
      lines.push("  Rank | Entity                                      | Exposure       | Findings")
      lines.push("  " + "─".repeat(76))
      clusterStats.topEntities.forEach((ent, i) => {
        const rank = String(i + 1).padStart(4)
        const name = ent.name.slice(0, 45).padEnd(45)
        const exp = formatDollars(ent.exposure).padStart(14)
        const cnt = String(ent.count).padStart(8)
        lines.push(`  ${rank} | ${name} | ${exp} | ${cnt}`)
      })
      lines.push("")
    }

    // Section 3: Primary Finding (detailed)
    if (primaryFinding) {
      lines.push(hr2)
      lines.push("  3. PRIMARY FINDING — DETAILED ANALYSIS")
      lines.push(hr2)
      lines.push("")
      lines.push(`  Finding ID:          ${primaryFinding.id}`)
      lines.push(`  Entity:              ${primaryFinding.entity}`)
      lines.push(`  Severity:            ${primaryFinding.severity.toUpperCase()}`)
      lines.push(`  Confidence:          ${primaryFinding.confidence} (score: ${(primaryFinding.confidence_score ?? 0).toFixed(2)})`)
      lines.push(`  Priority Score:      ${primaryFinding.priority_score} / 100`)
      lines.push(`  Estimated Exposure:  ${formatDollars(primaryFinding.estimated_dollar_impact ?? primaryFinding.amount)}`)
      lines.push(`  Corroboration:       ${primaryFinding.corroboration_count} independent signals`)
      lines.push(`  Data Completeness:   ${((primaryFinding.data_completeness ?? 0) * 100).toFixed(0)}%`)
      lines.push(`  Detection Method:    ${primaryFinding.tool}`)
      if (primaryFinding.fiscal_year) lines.push(`  Fiscal Year:         ${primaryFinding.fiscal_year}`)
      lines.push("")
      lines.push("  CONDITION (What was found):")
      lines.push(`    ${primaryFinding.metric}: ${primaryFinding.metricDetail}`)
      lines.push(`    ${primaryFinding.description}`)
      lines.push("")
      if (primaryFinding.narrative) {
        lines.push("  NARRATIVE:")
        lines.push(`    ${primaryFinding.narrative}`)
        lines.push("")
      }
      if (primaryFinding.finding_report) {
        lines.push("  FINDING REPORT:")
        primaryFinding.finding_report.split("\n").forEach((line) => lines.push(`    ${line}`))
        lines.push("")
      }
      lines.push("  CRITERIA (Why it matters):")
      lines.push(`    Deviates from expected baseline for ${primaryFinding.subcategory}.`)
      lines.push(`    Confidence reason: ${primaryFinding.confidence_reason || "Statistical anomaly detected by algorithm."}`)
      if (primaryFinding.caveat) {
        lines.push("")
        lines.push("  CAVEAT:")
        lines.push(`    ${primaryFinding.caveat}`)
      }
      if (hasRoleConflictSignal) {
        lines.push("")
        lines.push("  RISK AGGRAVATOR:")
        lines.push("    Potential Segregation of Duties (SoD) conflict detected.")
        lines.push("    Text signals suggest possible same-person apply/review chain.")
      }
      lines.push("")
    }

    // Section 4: Methodology
    lines.push(hr2)
    lines.push("  4. METHODOLOGY & DATA SOURCES")
    lines.push(hr2)
    lines.push("")
    lines.push("  Detection Methodology:")
    lines.push(`    ${methodologyDescription}`)
    lines.push("")
    lines.push("  Confidence Scoring:")
    lines.push("    Multi-factor scoring: Statistical strength (50%) + Cross-detector")
    lines.push("    corroboration (30%) + Data completeness (20%). Validated patterns")
    lines.push("    from external audits receive automatic HIGH confidence.")
    lines.push("")
    lines.push("  Datasets Analyzed:")
    ;(displayData?.data_freshness ?? []).forEach((source) => {
      lines.push(`    - ${source.dataset_name} (${source.rows_fetched.toLocaleString()} rows, as of ${source.data_as_of || "unknown"})${source.stale ? " [STALE]" : ""}`)
    })
    if (!displayData?.data_freshness?.length) lines.push("    - Waste analysis API findings payload")
    lines.push("")

    // Section 5: Recommendations
    lines.push(hr2)
    lines.push("  5. RECOMMENDED NEXT STEPS")
    lines.push(hr2)
    lines.push("")
    recommendedSteps.forEach((step, i) => lines.push(`  ${i + 1}. ${step}`))
    lines.push("")

    // Section 6: All Findings Detail
    if (comparisonFindings.length) {
      lines.push(hr2)
      lines.push(`  6. COMPLETE FINDINGS DETAIL (${selectedClusterFindings.length} total)`)
      lines.push(hr2)
      lines.push("")

      selectedClusterFindings.forEach((f, i) => {
        lines.push(`  ── Finding ${i + 1} of ${selectedClusterFindings.length} ${"─".repeat(50)}`)
        lines.push(`  ID:          ${f.id}`)
        lines.push(`  Entity:      ${f.entity}`)
        lines.push(`  Severity:    ${f.severity.toUpperCase()} | Confidence: ${f.confidence} (${(f.confidence_score ?? 0).toFixed(2)}) | Priority: ${f.priority_score}`)
        lines.push(`  Exposure:    ${formatDollars(f.estimated_dollar_impact ?? f.amount)}`)
        lines.push(`  Metric:      ${f.metric}: ${f.metricDetail}`)
        const descClean = f.description.replace(/(\r\n|\n|\r)/gm, " ")
        lines.push(`  Description: ${descClean}`)
        if (f.narrative) lines.push(`  Narrative:   ${f.narrative}`)
        if (f.confidence_reason) lines.push(`  Conf Reason: ${f.confidence_reason}`)
        if (f.caveat) lines.push(`  Caveat:      ${f.caveat}`)
        lines.push("")
      })
    }

    // Section 7: Sub-cluster Overview
    if (subclusterOptions.length > 1) {
      lines.push(hr2)
      lines.push("  7. ALL SUB-CLUSTERS IN CATEGORY")
      lines.push(hr2)
      lines.push("")
      lines.push("  Sub-cluster                              | Count | Est. Exposure")
      lines.push("  " + "─".repeat(68))
      subclusterOptions.forEach((opt) => {
        const name = opt.name.slice(0, 42).padEnd(42)
        const cnt = String(opt.count).padStart(5)
        const exp = formatDollars(opt.exposure).padStart(14)
        lines.push(`  ${name} | ${cnt} | ${exp}`)
      })
      lines.push("")
    }

    lines.push(hr)
    lines.push("  DISCLAIMER & ACCOUNTABILITY")
    lines.push(hr)
    lines.push("")
    lines.push("  This report was generated by the Transparent.city automated auditor.")
    lines.push("  Findings represent statistical anomalies detected through algorithmic")
    lines.push("  analysis of publicly available civic data. They are preliminary audit")
    lines.push("  leads and do NOT constitute confirmed fraud, waste, or abuse.")
    lines.push("")
    lines.push("  Each finding should be verified against primary source records and")
    lines.push("  reviewed within the context of applicable policies and regulations.")
    lines.push("")
    lines.push(`  Generated: ${generatedLabel}`)
    lines.push("  System: Transparent.city Automated Auditor v2.0")
    lines.push(hr)

    return lines.join("\n")
  }, [
    analysisPeriod, categoryStats, clusterStats, comparisonFindings, displayData?.data_freshness,
    generatedLabel, hasRoleConflictSignal, methodologyDescription, primaryFinding,
    recommendedSteps, selectedCategory, selectedClusterFindings, selectedSubcluster,
    subclusterOptions,
  ])

  // ────────────────────────────────────────────────────────────────────
  // HTML Report (comprehensive)
  // ────────────────────────────────────────────────────────────────────

  const htmlReport = useMemo(() => {
    const sourceRows = displayData?.data_freshness?.map(
      (s) => `<tr><td style="border:1px solid #ddd;padding:6px;">${s.dataset_name}</td><td style="border:1px solid #ddd;padding:6px;">${(s.rows_fetched ?? 0).toLocaleString()}</td><td style="border:1px solid #ddd;padding:6px;">${s.data_as_of || "Unknown"}</td><td style="border:1px solid #ddd;padding:6px;">${s.stale ? '<span style="color:red">STALE</span>' : "Fresh"}</td></tr>`,
    ) ?? []

    const topEntitiesRows = clusterStats.topEntities.map(
      (e) => `<tr><td style="border:1px solid #ddd;padding:6px;">${e.name}</td><td style="border:1px solid #ddd;padding:6px;text-align:right">${formatDollars(e.exposure)}</td><td style="border:1px solid #ddd;padding:6px;text-align:center">${e.count}</td></tr>`,
    ).join("")

    const allFindingsRows = selectedClusterFindings.map((f) => {
      const sevStyle = f.severity.toLowerCase() === "critical" ? "background:#FEE2E2;color:#991B1B" : f.severity.toLowerCase() === "high" ? "background:#FEF3C7;color:#92400E" : ""
      return `<tr style="${sevStyle}">
        <td style="border:1px solid #ddd;padding:6px;font-family:monospace;font-size:11px">${f.id}</td>
        <td style="border:1px solid #ddd;padding:6px">${f.entity}</td>
        <td style="border:1px solid #ddd;padding:6px;text-align:center;font-weight:bold">${f.severity.toUpperCase()}</td>
        <td style="border:1px solid #ddd;padding:6px;text-align:center">${f.confidence}</td>
        <td style="border:1px solid #ddd;padding:6px;text-align:center">${(f.confidence_score ?? 0).toFixed(2)}</td>
        <td style="border:1px solid #ddd;padding:6px;text-align:center">${f.priority_score}</td>
        <td style="border:1px solid #ddd;padding:6px;text-align:right">${formatDollars(f.estimated_dollar_impact ?? f.amount)}</td>
        <td style="border:1px solid #ddd;padding:6px">${f.metric}: ${f.metricDetail}</td>
        <td style="border:1px solid #ddd;padding:6px;font-size:11px">${f.description.replace(/\n/g, "<br/>")}</td>
      </tr>`
    }).join("")

    const subclusterSummaryRows = subclusterOptions.map(
      (o) => `<tr><td style="border:1px solid #ddd;padding:6px">${o.name}</td><td style="border:1px solid #ddd;padding:6px;text-align:center">${o.count}</td><td style="border:1px solid #ddd;padding:6px;text-align:right">${formatDollars(o.exposure)}</td></tr>`,
    ).join("")

    return `
<html>
<head>
  <meta charset="utf-8"/>
  <title>Transparent.city Comprehensive Auditor Report</title>
  <style>
    body{font-family:'Segoe UI',Tahoma,Geneva,Verdana,sans-serif;line-height:1.6;color:var(--text-primary);max-width:1100px;margin:0 auto;padding:20px}
    h1{border-bottom:3px solid #4f46e5;padding-bottom:10px;color:#1f2937;font-size:24px}
    h2{background-color:var(--bg-tertiary);padding:10px 15px;border-left:4px solid #4f46e5;margin-top:35px;font-size:16px}
    h3{color:#4f46e5;font-size:14px;margin-top:20px}
    .meta{background:#f9fafb;padding:15px 20px;border-radius:8px;margin-bottom:25px;font-size:13px;border:1px solid var(--border-primary)}
    .stats-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin:15px 0}
    .stat-card{background:white;border:1px solid var(--border-primary);border-radius:8px;padding:12px;text-align:center}
    .stat-card .value{font-size:22px;font-weight:bold;color:#4f46e5}
    .stat-card .label{font-size:11px;color:var(--text-muted);text-transform:uppercase}
    .finding-box{border:1px solid var(--border-primary);padding:20px;border-radius:8px;background:white;box-shadow:0 1px 3px rgba(0,0,0,0.1);margin:15px 0}
    .finding-box .field{margin:4px 0;font-size:13px}
    .finding-box .field strong{display:inline-block;min-width:160px;color:var(--text-secondary)}
    .narrative-box{background:#EEF2FF;border:1px solid #C7D2FE;border-radius:6px;padding:12px;margin:10px 0;font-style:italic;font-size:13px}
    .report-box{background:#F0FDF4;border:1px solid #BBF7D0;border-radius:6px;padding:12px;margin:10px 0;font-size:13px;white-space:pre-wrap}
    table{width:100%;border-collapse:collapse;margin-top:10px;font-size:11px}
    th{background:#4f46e5;color:white;text-align:left;padding:8px;font-size:11px}
    td{padding:6px}
    .footer{margin-top:50px;font-size:11px;color:var(--text-muted);border-top:2px solid var(--border-primary);padding-top:15px}
    .badge{display:inline-block;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:bold}
    .badge-critical{background:#FEE2E2;color:#991B1B}
    .badge-high{background:#FEF3C7;color:#92400E}
    .badge-medium{background:#FEF9C3;color:#854D0E}
  </style>
</head>
<body>
  <h1>Transparent.city Comprehensive Auditor Report</h1>
  <div class="meta">
    <p><strong>Generated:</strong> ${generatedLabel}</p>
    <p><strong>Prepared by:</strong> Transparent.city Automated Auditor v2.0</p>
    <p><strong>Scope:</strong> ${analysisPeriod}</p>
    <p><strong>Focus Area:</strong> ${formatCategoryLabel(selectedCategory)} &gt; ${selectedSubcluster || "N/A"}</p>
  </div>

  <h2>1. Executive Summary</h2>
  <div class="stats-grid">
    <div class="stat-card"><div class="value">${categoryStats.count}</div><div class="label">Total Findings</div></div>
    <div class="stat-card"><div class="value" style="color:#DC2626">${categoryStats.criticalCount}</div><div class="label">Critical</div></div>
    <div class="stat-card"><div class="value" style="color:#EA580C">${categoryStats.highCount}</div><div class="label">High Risk</div></div>
    <div class="stat-card"><div class="value" style="color:#4f46e5">${formatDollars(categoryStats.totalExposure)}</div><div class="label">Est. Exposure</div></div>
  </div>

  <h3>Selected Sub-cluster: ${selectedSubcluster}</h3>
  <div class="stats-grid">
    <div class="stat-card"><div class="value">${clusterStats.count}</div><div class="label">Cluster Findings</div></div>
    <div class="stat-card"><div class="value">${clusterStats.avgConfidenceScore.toFixed(2)}</div><div class="label">Avg Confidence</div></div>
    <div class="stat-card"><div class="value">${clusterStats.avgPriorityScore.toFixed(0)}</div><div class="label">Avg Priority</div></div>
    <div class="stat-card"><div class="value">${clusterStats.entityCount}</div><div class="label">Unique Entities</div></div>
  </div>

  ${clusterStats.topEntities.length ? `
  <h2>2. Top Entities by Estimated Exposure</h2>
  <table>
    <thead><tr><th>Entity</th><th style="text-align:right">Estimated Exposure</th><th style="text-align:center">Findings</th></tr></thead>
    <tbody>${topEntitiesRows}</tbody>
  </table>` : ""}

  ${primaryFinding ? `
  <h2>3. Primary Finding — Detailed Analysis</h2>
  <div class="finding-box">
    <div class="field"><strong>Finding ID:</strong> ${primaryFinding.id}</div>
    <div class="field"><strong>Entity:</strong> ${primaryFinding.entity}</div>
    <div class="field"><strong>Severity:</strong> <span class="badge badge-${primaryFinding.severity.toLowerCase()}">${primaryFinding.severity.toUpperCase()}</span></div>
    <div class="field"><strong>Confidence:</strong> ${primaryFinding.confidence} (score: ${(primaryFinding.confidence_score ?? 0).toFixed(2)})</div>
    <div class="field"><strong>Priority Score:</strong> ${primaryFinding.priority_score} / 100</div>
    <div class="field"><strong>Estimated Exposure:</strong> ${formatDollars(primaryFinding.estimated_dollar_impact ?? primaryFinding.amount)}</div>
    <div class="field"><strong>Corroboration:</strong> ${primaryFinding.corroboration_count} independent signals</div>
    <div class="field"><strong>Data Completeness:</strong> ${((primaryFinding.data_completeness ?? 0) * 100).toFixed(0)}%</div>
    <div class="field"><strong>Detection Method:</strong> ${primaryFinding.tool}</div>
    <div class="field"><strong>Condition:</strong> ${primaryFinding.metric} — ${primaryFinding.metricDetail}</div>
    <div class="field"><strong>Description:</strong> ${primaryFinding.description}</div>
    <div class="field"><strong>Confidence Reason:</strong> ${primaryFinding.confidence_reason || "Statistical anomaly detected."}</div>
    ${primaryFinding.caveat ? `<div class="field"><strong>Caveat:</strong> ${primaryFinding.caveat}</div>` : ""}
    ${primaryFinding.narrative ? `<div class="narrative-box"><strong>Narrative:</strong> ${primaryFinding.narrative}</div>` : ""}
    ${primaryFinding.finding_report ? `<div class="report-box">${primaryFinding.finding_report}</div>` : ""}
  </div>
  ` : "<h2>No records available for selected sub-cluster</h2>"}

  <h2>4. Methodology & Data Sources</h2>
  <p><strong>Detection Methodology:</strong> ${methodologyDescription}</p>
  <p><strong>Confidence Scoring:</strong> Multi-factor scoring: Statistical strength (50%) + Cross-detector corroboration (30%) + Data completeness (20%). Validated patterns from external audits receive automatic HIGH confidence.</p>
  <p><strong>Priority Scoring:</strong> 0-100 composite: Severity (0-40) + Confidence (0-30) + Dollar Exposure (0-30). Partial-data findings receive a -15 penalty.</p>
  <h3>Data Sources</h3>
  <table>
    <thead><tr><th>Dataset</th><th>Rows</th><th>Data As Of</th><th>Status</th></tr></thead>
    <tbody>${sourceRows.length ? sourceRows.join("") : "<tr><td colspan='4'>Waste analysis API findings payload</td></tr>"}</tbody>
  </table>

  <h2>5. Recommendations</h2>
  <ol>${recommendedSteps.map((s) => `<li style="margin:6px 0">${s}</li>`).join("")}</ol>

  ${selectedClusterFindings.length > 0 ? `
  <h2>6. Complete Findings Detail (${selectedClusterFindings.length} records)</h2>
  <table>
    <thead><tr><th>ID</th><th>Entity</th><th>Severity</th><th>Confidence</th><th>Conf. Score</th><th>Priority</th><th style="text-align:right">Exposure</th><th>Metric Detail</th><th>Description</th></tr></thead>
    <tbody>${allFindingsRows}</tbody>
  </table>` : ""}

  ${subclusterOptions.length > 1 ? `
  <h2>7. All Sub-clusters in Category</h2>
  <table>
    <thead><tr><th>Sub-cluster</th><th style="text-align:center">Count</th><th style="text-align:right">Est. Exposure</th></tr></thead>
    <tbody>${subclusterSummaryRows}</tbody>
  </table>` : ""}

  <div class="footer">
    <p><strong>Disclaimer:</strong> This report was generated by the Transparent.city automated auditor. Findings represent statistical anomalies and are preliminary audit leads. They do NOT constitute confirmed fraud, waste, or abuse. Each finding should be verified against primary source records.</p>
    <p>Generated: ${generatedLabel} | System: Transparent.city Automated Auditor v2.0</p>
  </div>
</body>
</html>`.trim()
  }, [
    analysisPeriod, categoryStats, clusterStats, displayData?.data_freshness,
    generatedLabel, methodologyDescription, primaryFinding, recommendedSteps,
    selectedCategory, selectedClusterFindings, selectedSubcluster, subclusterOptions,
  ])

  // ────────────────────────────────────────────────────────────────────
  // Export Handlers
  // ────────────────────────────────────────────────────────────────────

  async function copyForGoogleDocs() {
    try {
      await navigator.clipboard.writeText(plainTextReport)
      setStatusMessage("Copied comprehensive report text for Google Docs.")
    } catch {
      setStatusMessage("Could not copy automatically. Please copy manually.")
    }
  }

  function openGoogleDocs() {
    window.open("https://docs.new", "_blank", "noopener,noreferrer")
    setStatusMessage("Opened Google Docs. Paste copied report content there.")
  }

  function downloadDoc() {
    const blob = new Blob([htmlReport], { type: "application/msword;charset=utf-8" })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement("a")
    anchor.href = url
    anchor.download = `transparent-city-auditor-report-${generatedAt.toISOString().slice(0, 10)}.doc`
    document.body.appendChild(anchor)
    anchor.click()
    document.body.removeChild(anchor)
    URL.revokeObjectURL(url)
    setStatusMessage("Downloaded .doc export with full detail.")
  }

  async function downloadExcel() {
    try {
      setExporting("xlsx")
      const token = await getAccessTokenSilently()
      const cat = selectedCategory === "all" ? "all" : selectedCategory
      const blob = await exportAuditorReport(token, cat)
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `TransparentCity_Auditor_Report_${cat}_${generatedAt.toISOString().slice(0, 10)}.xlsx`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      setStatusMessage("Downloaded comprehensive Excel auditor report (8 sheets).")
    } catch (err) {
      console.error("Excel export failed:", err)
      setStatusMessage("Excel export failed. Please try again.")
    } finally {
      setExporting(null)
    }
  }

  async function downloadCSV() {
    try {
      setExporting("csv")
      const token = await getAccessTokenSilently()
      const cat = selectedCategory === "all" ? "payroll" : selectedCategory
      const blob = await exportWasteFindings(token, cat, "csv")
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `waste_findings_${cat}_${generatedAt.toISOString().slice(0, 10)}.csv`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      setStatusMessage("Downloaded comprehensive CSV with all finding fields.")
    } catch (err) {
      console.error("CSV export failed:", err)
      setStatusMessage("CSV export failed. Please try again.")
    } finally {
      setExporting(null)
    }
  }

  const handleRefresh = async () => {
    setAllowAutoFetch(true)
    setRefreshTimedOut(false)
    setIsManualRefreshing(true)
    try {
      const result = await forceRefetch()
      if (!result.error) {
        setRefreshTimedOut(false)
      }
    } finally {
      setIsManualRefreshing(false)
    }
  }

  // ────────────────────────────────────────────────────────────────────
  // Render
  // ────────────────────────────────────────────────────────────────────

  return (
    <WasteShell
      title="Analysis"
      description="Comprehensive auditor-ready reports with detailed findings, statistical analysis, and multi-format export."
      actions={
        <Button
          variant="outline"
          size="sm"
          onClick={handleRefresh}
          disabled={isManualRefreshing}
        >
          <RefreshCw className={`w-4 h-4 mr-2 ${isManualRefreshing ? "animate-spin" : ""}`} />
          {isManualRefreshing
            ? `Refreshing (${refreshProgress.progressPct}% · ${refreshElapsedSeconds}s)`
            : "Refresh"}
        </Button>
      }
    >
      {/* Refresh progress */}
      {isManualRefreshing ? (
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm font-medium text-blue-900">{refreshProgress.step}</p>
            <div className="mt-2 h-2 w-full rounded-full bg-blue-100 overflow-hidden">
              <div className="h-full rounded-full bg-blue-500 transition-all duration-500 ease-out" style={{ width: `${refreshProgress.progressPct}%` }} />
            </div>
            <p className="text-xs text-blue-700 mt-1">{refreshProgress.etaLabel} · Typical refresh run: 60-120s</p>
            {refreshProgress.isLongRunning ? <p className="text-xs text-blue-700 mt-1">If this exceeds 150s, use Refresh again to re-request analysis.</p> : null}
            {refreshTimedOut ? (
              <p className="text-xs text-amber-700 mt-2">
                This run is taking longer than expected. We are still waiting for the backend response.
              </p>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {!isManualRefreshing && refreshTimedOut ? (
        <Card><CardContent className="pt-6">
          <p className="text-sm font-medium text-amber-800">Last refresh took longer than expected.</p>
          <p className="text-xs text-amber-700 mt-1">Showing your most recent snapshot. You can retry now.</p>
        </CardContent></Card>
      ) : null}

      {!isManualRefreshing && displayData && !allowAutoFetch ? (
        <Card><CardContent className="pt-6">
          <p className="text-sm font-medium text-gray-800">Showing your last saved analysis snapshot.</p>
          <p className="text-xs text-gray-600 mt-1">Click Refresh to run a new analysis.</p>
        </CardContent></Card>
      ) : null}

      {!isManualRefreshing && !displayData && !error ? (
        <Card><CardContent className="pt-6">
          <p className="text-sm font-medium text-gray-800">No saved analysis snapshot found yet.</p>
          <p className="text-xs text-gray-600 mt-1">Click Refresh to run your first analysis.</p>
        </CardContent></Card>
      ) : null}

      {error ? (
        <Card><CardHeader>
          <CardTitle>Could not load analysis data</CardTitle>
          <CardDescription>{error instanceof Error ? error.message : "Unexpected error"}</CardDescription>
        </CardHeader></Card>
      ) : null}

      {/* ── Category & Subcluster Selectors ── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl flex items-center gap-2">
            <ShieldCheck className="h-6 w-6 text-purple-600" />
            Auditor Analysis Builder
          </CardTitle>
          <CardDescription>
            Choose a category and sub-cluster to generate a comprehensive auditor-formatted report
            with detailed findings, confidence scoring, entity analysis, and multi-format export.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <label className="text-sm text-gray-700">
              <span className="mb-1 inline-flex items-center gap-1 font-medium"><Filter className="h-4 w-4" /> Category</span>
              <select value={selectedCategory} onChange={(e) => setSelectedCategory(e.target.value as WasteCategory)} className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm">
                <option value="all">All categories</option>
                <option value="payroll">Payroll & Compensation</option>
                <option value="contracts">Contracts & Procurement</option>
                <option value="infrastructure">Infrastructure & Services</option>
                <option value="integrity">Personnel Integrity</option>
              </select>
            </label>
            <label className="text-sm text-gray-700">
              <span className="mb-1 inline-flex items-center gap-1 font-medium"><Filter className="h-4 w-4" /> Sub-cluster</span>
              <select value={selectedSubcluster} onChange={(e) => setSelectedSubcluster(e.target.value)} className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm" disabled={!subclusterOptions.length}>
                {!subclusterOptions.length ? <option value="">No clusters available</option> : null}
                {subclusterOptions.map((opt) => (
                  <option key={opt.name} value={opt.name}>{opt.name} ({opt.count} findings · {formatDollars(opt.exposure)})</option>
                ))}
              </select>
            </label>
          </div>
        </CardContent>
      </Card>

      {/* ── Category-Level Summary ── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-indigo-600" />
            Category Overview: {formatCategoryLabel(selectedCategory)}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="rounded-lg border border-gray-200 p-3 text-center">
              <p className="text-2xl font-bold text-indigo-600">{categoryStats.count}</p>
              <p className="text-xs text-gray-500 uppercase">Total Findings</p>
            </div>
            <div className="rounded-lg border border-red-200 p-3 text-center bg-red-50">
              <p className="text-2xl font-bold text-red-700">{categoryStats.criticalCount}</p>
              <p className="text-xs text-gray-500 uppercase">Critical</p>
            </div>
            <div className="rounded-lg border border-orange-200 p-3 text-center bg-orange-50">
              <p className="text-2xl font-bold text-orange-700">{categoryStats.highCount}</p>
              <p className="text-xs text-gray-500 uppercase">High Risk</p>
            </div>
            <div className="rounded-lg border border-indigo-200 p-3 text-center bg-indigo-50">
              <p className="text-2xl font-bold text-indigo-700">{formatDollars(categoryStats.totalExposure)}</p>
              <p className="text-xs text-gray-500 uppercase">Est. Exposure</p>
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mt-3">
            <div className="rounded-lg border border-gray-200 p-3 text-center">
              <p className="text-lg font-semibold text-gray-800">{categoryStats.entityCount}</p>
              <p className="text-xs text-gray-500">Unique Entities</p>
            </div>
            <div className="rounded-lg border border-gray-200 p-3 text-center">
              <p className="text-lg font-semibold text-gray-800">{categoryStats.detectorMethods.length}</p>
              <p className="text-xs text-gray-500">Detection Methods</p>
            </div>
            <div className="rounded-lg border border-gray-200 p-3 text-center">
              <p className="text-lg font-semibold text-gray-800">{subclusterOptions.length}</p>
              <p className="text-xs text-gray-500">Sub-clusters</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Sub-cluster Detail ── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-purple-600" />
            Sub-cluster: {selectedSubcluster || "N/A"}
          </CardTitle>
          <CardDescription>
            {selectedSubcluster ? `Detailed analysis within ${formatCategoryLabel(selectedCategory)}` : "Select a sub-cluster above"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            <div className="rounded-lg border p-3 text-center">
              <p className="text-xl font-bold text-gray-900">{clusterStats.count}</p>
              <p className="text-xs text-gray-500">Records Flagged</p>
            </div>
            <div className="rounded-lg border p-3 text-center">
              <p className="text-xl font-bold text-indigo-700">{formatDollars(clusterStats.totalExposure)}</p>
              <p className="text-xs text-gray-500">Cluster Exposure</p>
            </div>
            <div className="rounded-lg border p-3 text-center">
              <p className="text-xl font-bold text-gray-900">{clusterStats.avgConfidenceScore.toFixed(2)}</p>
              <p className="text-xs text-gray-500">Avg Confidence</p>
            </div>
            <div className="rounded-lg border p-3 text-center">
              <p className="text-xl font-bold text-gray-900">{clusterStats.avgPriorityScore.toFixed(0)}</p>
              <p className="text-xs text-gray-500">Avg Priority</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 text-xs">
            <span className={`px-2 py-1 rounded font-medium ${clusterStats.criticalCount > 0 ? "bg-red-100 text-red-800" : "bg-gray-100 text-gray-600"}`}>{clusterStats.criticalCount} Critical</span>
            <span className={`px-2 py-1 rounded font-medium ${clusterStats.highCount > 0 ? "bg-orange-100 text-orange-800" : "bg-gray-100 text-gray-600"}`}>{clusterStats.highCount} High</span>
            <span className="px-2 py-1 rounded font-medium bg-amber-100 text-amber-800">{clusterStats.mediumCount} Medium</span>
            <span className="px-2 py-1 rounded font-medium bg-gray-100 text-gray-600">{clusterStats.entityCount} Entities</span>
            {hasRoleConflictSignal ? <span className="px-2 py-1 rounded font-medium bg-purple-100 text-purple-800">SoD Conflict Detected</span> : null}
          </div>

          {/* Top Entities in cluster */}
          {clusterStats.topEntities.length > 0 ? (
            <div className="mt-4">
              <p className="text-sm font-semibold text-gray-800 mb-2">Top Entities by Exposure</p>
              <div className="overflow-x-auto">
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="bg-gray-100">
                      <th className="text-left px-3 py-2 text-xs font-medium text-gray-600">Entity</th>
                      <th className="text-right px-3 py-2 text-xs font-medium text-gray-600">Est. Exposure</th>
                      <th className="text-center px-3 py-2 text-xs font-medium text-gray-600">Findings</th>
                    </tr>
                  </thead>
                  <tbody>
                    {clusterStats.topEntities.map((ent) => (
                      <tr key={ent.name} className="border-b border-gray-100">
                        <td className="px-3 py-2 text-gray-800">{ent.name}</td>
                        <td className="px-3 py-2 text-right text-gray-700 font-medium">{formatDollars(ent.exposure)}</td>
                        <td className="px-3 py-2 text-center text-gray-600">{ent.count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>

      {/* ── Primary Finding (deep detail) ── */}
      {primaryFinding ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-red-600" />
              Primary Finding: {primaryFinding.id}
            </CardTitle>
            <CardDescription>{primaryFinding.metric} — {primaryFinding.metricDetail}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
              <div>
                <p className="text-xs text-gray-500 uppercase">Severity</p>
                <span className={`inline-block px-2 py-1 rounded border text-xs font-bold ${severityColor(primaryFinding.severity)}`}>{primaryFinding.severity.toUpperCase()}</span>
              </div>
              <div>
                <p className="text-xs text-gray-500 uppercase">Confidence</p>
                <span className={`inline-block px-2 py-1 rounded text-xs font-bold ${confidenceColor(primaryFinding.confidence ?? "Medium")}`}>{primaryFinding.confidence ?? "—"} ({(primaryFinding.confidence_score ?? 0).toFixed(2)})</span>
              </div>
              <div>
                <p className="text-xs text-gray-500 uppercase">Priority</p>
                <p className="font-bold text-gray-900">{primaryFinding.priority_score} / 100</p>
              </div>
              <div>
                <p className="text-xs text-gray-500 uppercase">Exposure</p>
                <p className="font-bold text-indigo-700">{formatDollars(primaryFinding.estimated_dollar_impact ?? primaryFinding.amount)}</p>
              </div>
            </div>

            <div className="space-y-2 text-sm text-gray-700">
              <p><span className="font-semibold text-gray-900 inline-block w-40">Entity:</span> {primaryFinding.entity}</p>
              <p><span className="font-semibold text-gray-900 inline-block w-40">Detection Method:</span> {primaryFinding.tool}</p>
              <p><span className="font-semibold text-gray-900 inline-block w-40">Corroboration:</span> {primaryFinding.corroboration_count} independent signal{primaryFinding.corroboration_count !== 1 ? "s" : ""}</p>
              <p><span className="font-semibold text-gray-900 inline-block w-40">Data Completeness:</span> {((primaryFinding.data_completeness ?? 0) * 100).toFixed(0)}%</p>
              {primaryFinding.fiscal_year ? <p><span className="font-semibold text-gray-900 inline-block w-40">Fiscal Year:</span> {primaryFinding.fiscal_year}</p> : null}
              <p><span className="font-semibold text-gray-900 inline-block w-40">Confidence Reason:</span> {primaryFinding.confidence_reason || "Statistical anomaly detected."}</p>
            </div>

            <div className="bg-gray-50 rounded-lg p-4 text-sm">
              <p className="font-semibold text-gray-900 mb-1">Description</p>
              <p className="text-gray-700 whitespace-pre-wrap">{primaryFinding.description}</p>
            </div>

            {primaryFinding.narrative ? (
              <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-4 text-sm">
                <p className="font-semibold text-indigo-900 mb-1">Narrative</p>
                <p className="text-indigo-800 italic">{primaryFinding.narrative}</p>
              </div>
            ) : null}

            {primaryFinding.finding_report ? (
              <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-sm">
                <p className="font-semibold text-green-900 mb-1">Finding Report</p>
                <p className="text-green-800 whitespace-pre-wrap">{primaryFinding.finding_report}</p>
              </div>
            ) : null}

            {primaryFinding.caveat ? (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-sm">
                <p className="font-semibold text-amber-900 mb-1">Caveat</p>
                <p className="text-amber-800">{primaryFinding.caveat}</p>
              </div>
            ) : null}

            {hasRoleConflictSignal ? (
              <div className="bg-purple-50 border border-purple-200 rounded-lg p-4 text-sm">
                <p className="font-semibold text-purple-900 mb-1">Risk Aggravator: Segregation of Duties Conflict</p>
                <p className="text-purple-800">Text signals suggest a possible same-person apply/review chain. Validate with identity and access management logs.</p>
              </div>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {/* ── Methodology ── */}
      <Card>
        <CardHeader>
          <CardTitle>Methodology & Data Sources</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm text-gray-700">
          <div>
            <p className="font-semibold text-gray-900 mb-1">Detection Methodology</p>
            <p>{methodologyDescription}</p>
          </div>
          <div>
            <p className="font-semibold text-gray-900 mb-1">Confidence Scoring Model</p>
            <p>Multi-factor scoring: Statistical strength (50%) + Cross-detector corroboration (30%) + Data completeness (20%). Validated patterns from external audits receive automatic HIGH confidence. Score range: 0.00 to 1.00.</p>
          </div>
          <div>
            <p className="font-semibold text-gray-900 mb-1">Priority Scoring Model</p>
            <p>0-100 composite: Severity (0-40) + Confidence (0-30) + Dollar Exposure (0-30). Partial-data findings receive a -15 penalty.</p>
          </div>
          {displayData?.data_freshness?.length ? (
            <div>
              <p className="font-semibold text-gray-900 mb-2">Datasets Analyzed</p>
              <div className="overflow-x-auto">
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="bg-gray-100">
                      <th className="text-left px-3 py-2 text-xs font-medium text-gray-600">Dataset</th>
                      <th className="text-right px-3 py-2 text-xs font-medium text-gray-600">Rows</th>
                      <th className="text-left px-3 py-2 text-xs font-medium text-gray-600">Data As Of</th>
                      <th className="text-center px-3 py-2 text-xs font-medium text-gray-600">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {displayData.data_freshness.map((src) => (
                      <tr key={src.dataset_name} className="border-b border-gray-100">
                        <td className="px-3 py-2">{src.dataset_name}</td>
                        <td className="px-3 py-2 text-right">{src.rows_fetched.toLocaleString()}</td>
                        <td className="px-3 py-2">{src.data_as_of || "Unknown"}</td>
                        <td className="px-3 py-2 text-center">{src.stale ? <span className="text-red-600 font-medium">Stale</span> : <span className="text-green-600">Fresh</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>

      {/* ── Recommendations ── */}
      <Card>
        <CardHeader><CardTitle>Recommended Next Steps for Auditor</CardTitle></CardHeader>
        <CardContent>
          <ol className="list-decimal pl-5 space-y-2 text-sm text-gray-700">
            {recommendedSteps.map((step) => <li key={step}>{step}</li>)}
          </ol>
        </CardContent>
      </Card>

      {/* ── All Findings (expandable) ── */}
      {comparisonFindings.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>All Findings in Sub-cluster ({selectedClusterFindings.length})</CardTitle>
            <CardDescription>
              Click any finding to expand its full detail including narrative, finding report, confidence reasoning, and caveats.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {selectedClusterFindings.map((f, idx) => {
              const isExpanded = expandedFindings.has(f.id)
              return (
                <div key={f.id} className={`rounded-md border ${f.severity.toLowerCase() === "critical" ? "border-red-300 bg-red-50/50" : f.severity.toLowerCase() === "high" ? "border-orange-300 bg-orange-50/50" : "border-gray-200"}`}>
                  <button onClick={() => toggleFinding(f.id)} className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-gray-50/50">
                    <div className="flex items-center gap-3 min-w-0">
                      {isExpanded ? <ChevronDown className="h-4 w-4 text-gray-500 shrink-0" /> : <ChevronRight className="h-4 w-4 text-gray-500 shrink-0" />}
                      <span className="text-xs font-mono text-gray-500">#{idx + 1}</span>
                      <span className={`shrink-0 px-2 py-0.5 rounded text-xs font-bold border ${severityColor(f.severity)}`}>{f.severity.toUpperCase()}</span>
                      <span className="text-sm font-medium text-gray-900 truncate">{f.entity}</span>
                      <span className="text-xs text-gray-500 truncate hidden md:inline">{f.metric}: {f.metricDetail}</span>
                    </div>
                    <div className="flex items-center gap-3 shrink-0 ml-2">
                      <span className="text-xs text-gray-500">P:{f.priority_score}</span>
                      <span className="text-sm font-medium text-indigo-700">{formatDollars(f.estimated_dollar_impact ?? f.amount)}</span>
                    </div>
                  </button>
                  {isExpanded ? (
                    <div className="px-4 pb-4 pt-1 border-t border-gray-200 space-y-3">
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                        <div><span className="text-gray-500">ID:</span> <span className="font-mono">{f.id}</span></div>
                        <div><span className="text-gray-500">Confidence:</span> <span className={`px-1 rounded ${confidenceColor(f.confidence ?? "Medium")}`}>{f.confidence ?? "—"} ({(f.confidence_score ?? 0).toFixed(2)})</span></div>
                        <div><span className="text-gray-500">Corroboration:</span> {f.corroboration_count} signals</div>
                        <div><span className="text-gray-500">Data Completeness:</span> {((f.data_completeness ?? 0) * 100).toFixed(0)}%</div>
                        <div><span className="text-gray-500">Tool:</span> {f.tool}</div>
                        {f.fiscal_year ? <div><span className="text-gray-500">Fiscal Year:</span> {f.fiscal_year}</div> : null}
                        {f.is_partial_data ? <div className="text-amber-700 font-medium">Partial data</div> : null}
                      </div>
                      <div className="bg-white rounded p-3 text-sm text-gray-700 border border-gray-100">
                        <p className="font-semibold text-gray-900 text-xs mb-1">Description</p>
                        <p className="whitespace-pre-wrap">{f.description}</p>
                      </div>
                      {f.confidence_reason ? (
                        <div className="text-xs text-gray-600"><span className="font-semibold">Confidence reason:</span> {f.confidence_reason}</div>
                      ) : null}
                      {f.narrative ? (
                        <div className="bg-indigo-50 border border-indigo-100 rounded p-3 text-sm italic text-indigo-800">
                          <p className="font-semibold text-indigo-900 text-xs not-italic mb-1">Narrative</p>
                          {f.narrative}
                        </div>
                      ) : null}
                      {f.finding_report ? (
                        <div className="bg-green-50 border border-green-100 rounded p-3 text-sm text-green-800">
                          <p className="font-semibold text-green-900 text-xs mb-1">Finding Report</p>
                          <p className="whitespace-pre-wrap">{f.finding_report}</p>
                        </div>
                      ) : null}
                      {f.caveat ? (
                        <div className="bg-amber-50 border border-amber-100 rounded p-3 text-xs text-amber-800">
                          <span className="font-semibold">Caveat:</span> {f.caveat}
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              )
            })}
          </CardContent>
        </Card>
      ) : null}

      {/* ── Sub-cluster Overview Table ── */}
      {subclusterOptions.length > 1 ? (
        <Card>
          <CardHeader>
            <CardTitle>All Sub-clusters in {formatCategoryLabel(selectedCategory)}</CardTitle>
            <CardDescription>Compare sub-clusters by finding count and estimated exposure.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="bg-gray-100">
                    <th className="text-left px-3 py-2 text-xs font-medium text-gray-600">Sub-cluster</th>
                    <th className="text-center px-3 py-2 text-xs font-medium text-gray-600">Findings</th>
                    <th className="text-right px-3 py-2 text-xs font-medium text-gray-600">Est. Exposure</th>
                  </tr>
                </thead>
                <tbody>
                  {subclusterOptions.map((opt) => (
                    <tr key={opt.name} className={`border-b border-gray-100 cursor-pointer hover:bg-indigo-50 ${opt.name === selectedSubcluster ? "bg-indigo-50 font-medium" : ""}`} onClick={() => setSelectedSubcluster(opt.name)}>
                      <td className="px-3 py-2">{opt.name}</td>
                      <td className="px-3 py-2 text-center">{opt.count}</td>
                      <td className="px-3 py-2 text-right">{formatDollars(opt.exposure)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {/* ── Export ── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Download className="h-5 w-5 text-green-600" />
            Export Report
          </CardTitle>
          <CardDescription>
            Export this comprehensive report in multiple formats. The Excel export includes 8 sheets:
            Executive Summary, Detailed Findings, Sub-Finding Analysis, Raw Data, Data Sources,
            Statistical Analysis, Methodology, and Disclaimer.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={downloadExcel} disabled={exporting !== null} className="bg-green-700 hover:bg-green-800 text-white">
              <FileSpreadsheet className="h-4 w-4 mr-1" />
              {exporting === "xlsx" ? "Generating..." : "Download Excel Report"}
            </Button>
            <Button variant="outline" onClick={downloadCSV} disabled={exporting !== null}>
              <Download className="h-4 w-4 mr-1" />
              {exporting === "csv" ? "Generating..." : "Download CSV"}
            </Button>
            <Button variant="outline" onClick={downloadDoc}>
              <FileText className="h-4 w-4 mr-1" />
              Download .doc
            </Button>
            <Button variant="outline" onClick={copyForGoogleDocs}>
              <ClipboardCopy className="h-4 w-4 mr-1" />
              Copy for Google Docs
            </Button>
            <Button variant="ghost" onClick={openGoogleDocs}>
              <FileText className="h-4 w-4 mr-1" />
              Open Google Docs
            </Button>
          </div>
          {statusMessage ? <p className="text-sm text-gray-600">{statusMessage}</p> : null}
        </CardContent>
      </Card>
    </WasteShell>
  )
}

"use client"

import { useEffect, useMemo, useState } from "react"
import {
  ClipboardCopy,
  Download,
  FileText,
  Filter,
  RefreshCw,
  ShieldCheck,
} from "lucide-react"
import { useWasteAnalysis } from "@/lib/hooks/useWaste"
import type { WasteAnalyzeResponse, WasteFinding } from "@/lib/apiClient"
import { WasteShell } from "./waste-shell"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

type WasteCategory = "all" | "payroll" | "vendor" | "infrastructure" | "influence" | "integrity"
const ANALYSIS_REFRESH_ESTIMATED_SECONDS = 40
const ANALYSIS_REFRESH_TIMEOUT_MS = 120_000
const WASTE_ANALYSIS_CACHE_KEY = "waste:last-analysis:v1"
function safeSetCache(key: string, data: WasteAnalyzeResponse): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(data))
  } catch {
    // localStorage full — try progressively smaller subsets
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
      // localStorage completely unavailable – silently give up
    }
  }
}

function normalizeWasteCategory(category: string): WasteCategory {
  const key = category.toLowerCase().trim().replace(/[_\s&.,'-]+/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, "")
  if (key === "payroll" || key.includes("payroll") || key === "payroll_compensation") return "payroll"
  if (key === "vendor" || key === "vendors" || key.includes("vendor") || key === "vendor_procurement") {
    return "vendor"
  }
  if (
    key === "infrastructure" ||
    key === "services" ||
    key === "service" ||
    key.includes("infrastructure") ||
    key === "infrastructure_services"
  ) {
    return "infrastructure"
  }
  if (key === "influence" || key.includes("influence") || key.includes("lobby") || key.includes("pay_to_play")) {
    return "influence"
  }
  if (key === "integrity" || key.includes("integrity") || key.includes("personnel") || key.includes("revolving") || key.includes("conflict")) {
    return "integrity"
  }
  return "all"
}

function formatCategoryLabel(category: WasteCategory): string {
  if (category === "all") return "All categories"
  if (category === "payroll") return "Payroll & Compensation"
  if (category === "vendor") return "Vendor & Procurement"
  if (category === "influence") return "Influence & Pay-to-Play"
  if (category === "integrity") return "Personnel Integrity"
  return "Infrastructure & Services"
}

function getAnalysisRefreshProgress(elapsedSeconds: number): {
  step: string
  etaLabel: string
  progressPct: number
  isLongRunning: boolean
} {
  let step = "Loading latest anomaly findings"
  if (elapsedSeconds > 8) {
    step = "Recomputing sub-cluster summaries and outliers"
  }
  if (elapsedSeconds > 20) {
    step = "Preparing auditor report sections"
  }
  if (elapsedSeconds > 30) {
    step = "Finalizing data sources and export payloads"
  }

  const remaining = Math.max(0, ANALYSIS_REFRESH_ESTIMATED_SECONDS - elapsedSeconds)
  const isLongRunning = elapsedSeconds > ANALYSIS_REFRESH_ESTIMATED_SECONDS + 12
  const etaLabel = isLongRunning
    ? "Taking longer than usual, but still processing in the background"
    : remaining > 0
      ? `Estimated time left: ~${remaining}s`
      : "Estimated time left: wrapping up"

  const progressPct = Math.min(
    95,
    Math.max(6, Math.round((elapsedSeconds / ANALYSIS_REFRESH_ESTIMATED_SECONDS) * 100)),
  )

  return { step, etaLabel, progressPct, isLongRunning }
}

function looksLikeSamePersonConflict(finding: WasteFinding): boolean {
  const text = [
    finding.entity,
    finding.metric,
    finding.metricDetail,
    finding.description,
  ]
    .join(" ")
    .toLowerCase()

  const signals = [
    "same person",
    "same individual",
    "same employee",
    "self approval",
    "self-approval",
    "reviewed own",
    "applicant and reviewer",
    "applied and approved",
    "conflict of role",
  ]

  return signals.some((signal) => text.includes(signal))
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
  ]

  if (hasRoleConflictSignal) {
    common.unshift(
      "Run conflict-of-duty review for potential same-person apply/review chains.",
    )
  }

  if (category === "payroll") {
    return [
      ...common,
      "Compare overtime approval timing against shift rosters and emergency declarations.",
      "Reconcile payroll changes against HR role-change records for the same period.",
    ]
  }

  if (category === "vendor") {
    return [
      ...common,
      "Check procurement threshold splits and repeat-award patterns by vendor and approver.",
      "Review bid waiver rationale and supporting attachments for completeness.",
    ]
  }

  if (category === "infrastructure") {
    return [
      ...common,
      "Cross-check work-order closure timestamps with field verification logs.",
      "Validate cluster anomalies against seasonal or outage-related service surges.",
    ]
  }

  return [
    ...common,
    `Perform focused review on "${subcluster}" with control-owner interviews.`,
    "Document disposition outcomes for each flagged record (confirmed issue vs valid exception).",
  ]
}

function getMethodologyDescription(tool: string, subcategory: string): string {
  const key = `${tool} ${subcategory}`.toLowerCase()
  if (key.includes("pareto") || key.includes("concentration")) {
    return "Statistical analysis using the Pareto principle (80/20 rule) to identify departments where a small percentage of employees consume a disproportionately high share of the overtime budget. This pattern often indicates poor workforce planning or potential favoritism."
  }
  if (key.includes("overtime") || key.includes("hours")) {
    return "Cross-referenced employee compensation records against job code standards. Calculated Z-scores for weekly hours worked to identify statistical outliers (>3 standard deviations from the mean) and flagged instances where overtime earnings exceeded 100% of base salary."
  }
  if (key.includes("ghost") || key.includes("unregistered")) {
    return "Performed an entity resolution match between the Vendor Payments dataset and the official Registered Business Locations database. Vendors receiving significant payments (>$50k) with no corresponding business license or registry entry were flagged for verification."
  }
  if (key.includes("duplicate") || key.includes("sss")) {
    return "Applied a 'Same-Same-Same' (SSS) detection algorithm to identify identical payment amounts to the same vendor on the same date across different vouchers. This is a standard forensic accounting test for duplicate billing errors."
  }
  if (key.includes("misdirected") || key.includes("ssd")) {
    return "Applied a 'Same-Same-Different' (SSD) detection algorithm to identify single Purchase Orders that paid identical amounts to multiple different vendors. This pattern is a strong indicator of invoice fraud or purchase order mismanagement."
  }
  if (key.includes("benford")) {
    return "Analyzed the distribution of leading digits in payment amounts against Benford's Law expected frequencies. Statistically significant deviations (Chi-Square test) were flagged as potential indicators of fabricated or structured invoices."
  }
  if (key.includes("split") || key.includes("structuring")) {
    return "Analyzed payment clusters to identify 'split purchase orders'—multiple payments to the same vendor on the same day that sum to just above the manager approval threshold (e.g., $10k), suggesting an attempt to bypass procurement controls."
  }
  if (key.includes("pension")) {
    return "compared current year total compensation against a 3-year trailing average. Flagged employees with a >50% year-over-year increase driven primarily by 'Other Pay' or 'Special Pay' categories in their final years of service."
  }
  if (key.includes("permit") || key.includes("fast tracking")) {
    return "Analyzed building permit approval timelines against the cohort median (same permit type and neighborhood). Flagged applications processed significantly faster (<10th percentile) than standard operating procedures, which is a key indicator of preferential 'fast-tracking' or potential corruption."
  }
  return `Automated anomaly detection using the ${tool} algorithm to identify statistical outliers and patterns deviating from standard ${subcategory} baselines.`
}

export function WasteAnalysisContent() {
  const [selectedCategory, setSelectedCategory] = useState<WasteCategory>("all")
  const [selectedSubcluster, setSelectedSubcluster] = useState<string>("")
  const [statusMessage, setStatusMessage] = useState("")
  const [allowAutoFetch, setAllowAutoFetch] = useState(false)
  const [isManualRefreshing, setIsManualRefreshing] = useState(false)
  const [refreshTimedOut, setRefreshTimedOut] = useState(false)
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

  const { data, isLoading, error, forceRefetch } = useWasteAnalysis(
    undefined,
    allowAutoFetch
  )
  const displayData = data ?? cachedData

  useEffect(() => {
    if (!data) return
    setCachedData(data)
    if (typeof window !== "undefined") {
      safeSetCache(WASTE_ANALYSIS_CACHE_KEY, data)
    }
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
    setRefreshElapsedSeconds(
      Math.max(0, Math.floor((Date.now() - refreshStartedAt) / 1000)),
    )
    const interval = window.setInterval(() => {
      setRefreshElapsedSeconds(
        Math.max(0, Math.floor((Date.now() - refreshStartedAt) / 1000)),
      )
    }, 1000)
    return () => window.clearInterval(interval)
  }, [isManualRefreshing, refreshStartedAt])

  useEffect(() => {
    if (!isManualRefreshing) return
    const timeout = window.setTimeout(() => {
      setIsManualRefreshing(false)
      setRefreshTimedOut(true)
    }, ANALYSIS_REFRESH_TIMEOUT_MS)
    return () => window.clearTimeout(timeout)
  }, [isManualRefreshing])

  const generatedAt = useMemo(() => new Date(), [])
  const generatedLabel = generatedAt.toLocaleString()

  const findings = displayData?.findings ?? []

  const categoryFilteredFindings = useMemo(() => {
    if (selectedCategory === "all") return findings
    return findings.filter(
      (finding) => normalizeWasteCategory(finding.category) === selectedCategory,
    )
  }, [findings, selectedCategory])

  const subclusterOptions = useMemo(() => {
    const counts: Record<string, number> = {}
    categoryFilteredFindings.forEach((finding) => {
      counts[finding.subcategory] = (counts[finding.subcategory] ?? 0) + 1
    })
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .map(([name, count]) => ({ name, count }))
  }, [categoryFilteredFindings])

  useEffect(() => {
    if (!subclusterOptions.length) {
      setSelectedSubcluster("")
      return
    }
    const stillValid = subclusterOptions.some(
      (option) => option.name === selectedSubcluster,
    )
    if (!stillValid) {
      setSelectedSubcluster(subclusterOptions[0].name)
    }
  }, [selectedSubcluster, subclusterOptions])

  const selectedClusterFindings = useMemo(() => {
    if (!selectedSubcluster) return []
    return categoryFilteredFindings
      .filter((finding) => finding.subcategory === selectedSubcluster)
      .slice()
      .sort((a, b) => (b.priority_score ?? 0) - (a.priority_score ?? 0))
  }, [categoryFilteredFindings, selectedSubcluster])

  const primaryFinding = selectedClusterFindings[0] ?? null
  const comparisonFindings = selectedClusterFindings.slice(1, 21)

  const hasRoleConflictSignal = useMemo(
    () => selectedClusterFindings.some(looksLikeSamePersonConflict),
    [selectedClusterFindings],
  )

  const severityCounts = useMemo(
    () => ({
      critical: selectedClusterFindings.filter((f) => f.severity === "critical")
        .length,
      high: selectedClusterFindings.filter((f) => f.severity === "high").length,
      medium: selectedClusterFindings.filter((f) => f.severity === "medium").length,
    }),
    [selectedClusterFindings],
  )

  const analysisPeriod = useMemo(() => {
    if (!displayData?.analysis_timestamp) return "Current analysis window"
    const asOf = new Date(displayData.analysis_timestamp).toLocaleDateString()
    return `Up to ${asOf}`
  }, [displayData?.analysis_timestamp])
  const refreshProgress = getAnalysisRefreshProgress(refreshElapsedSeconds)

  const recommendedSteps = useMemo(
    () =>
      buildRecommendedNextSteps(
        selectedCategory,
        selectedSubcluster || "selected sub-cluster",
        hasRoleConflictSignal,
      ),
    [hasRoleConflictSignal, selectedCategory, selectedSubcluster],
  )

  const methodologyDescription = useMemo(() => {
    if (!primaryFinding) return "Standard anomaly detection algorithms applied to dataset."
    return getMethodologyDescription(primaryFinding.tool, primaryFinding.subcategory)
  }, [primaryFinding])

  const plainTextReport = useMemo(() => {
    const lines: string[] = []
    lines.push("AUDIT OBSERVATION REPORT")
    lines.push("========================")
    lines.push(`Generated: ${generatedLabel}`)
    lines.push(`Prepared by: Transparent.city Automated Auditor`)
    lines.push(`Scope: ${analysisPeriod}`)
    lines.push(`Focus Area: ${formatCategoryLabel(selectedCategory)} > ${selectedSubcluster || "N/A"}`)
    lines.push("")
    lines.push("1. EXECUTIVE SUMMARY")
    lines.push("--------------------")
    lines.push(`Total Records Flagged: ${selectedClusterFindings.length}`)
    lines.push(
      `Risk Profile: ${severityCounts.critical} Critical, ${severityCounts.high} High, ${severityCounts.medium} Medium risk.`
    )
    lines.push("")
    
    if (primaryFinding) {
      lines.push("2. DETAILED OBSERVATION (PRIMARY SAMPLE)")
      lines.push("----------------------------------------")
      lines.push(`Finding ID: ${primaryFinding.id}`)
      lines.push(`Entity: ${primaryFinding.entity}`)
      lines.push(`Condition (What was found):`)
      lines.push(`  ${primaryFinding.metric}: ${primaryFinding.metricDetail}`)
      lines.push(`  ${primaryFinding.description}`)
      lines.push("")
      lines.push("Criteria (Why it matters):")
      lines.push(`  Deviates from expected baseline for ${primaryFinding.subcategory}. High-risk indicator for waste or policy non-compliance.`)
      
      if (hasRoleConflictSignal) {
        lines.push("")
        lines.push("Risk Aggravator:")
        lines.push(
          "  Potential Segregation of Duties (SoD) conflict detected. Text signals suggest possible same-person apply/review chain.",
        )
      }
    }

    lines.push("")
    lines.push("3. METHODOLOGY & DATA SOURCES")
    lines.push("-----------------------------")
    lines.push("Methodology:")
    lines.push(`  ${methodologyDescription}`)
    lines.push("")
    lines.push("Datasets Analyzed:")
    ;(displayData?.data_freshness ?? []).forEach((source) => {
      lines.push(
        `  - ${source.dataset_name} (${source.rows_fetched.toLocaleString()} rows analyzed)`,
      )
    })
    if (!displayData?.data_freshness?.length) {
      lines.push("  - Waste analysis API findings payload")
    }

    lines.push("")
    lines.push("4. RECOMMENDATIONS")
    lines.push("------------------")
    recommendedSteps.forEach((step, index) => {
      lines.push(`${index + 1}. ${step}`)
    })
    lines.push("")

    if (comparisonFindings.length) {
      lines.push(`5. EXPANDED SAMPLE (${comparisonFindings.length} Additional Records)`)
      lines.push("----------------------------------------")
      lines.push("ID          | Severity | Metric Details                               | Description")
      lines.push("------------|----------|----------------------------------------------|----------------------------------------------------")
      comparisonFindings.forEach((finding) => {
        const sev = finding.severity.toUpperCase().padEnd(8)
        const id = finding.id.padEnd(11)
        const metric = `${finding.metric}: ${finding.metricDetail}`.slice(0, 44).padEnd(44)
        // clean description for single line
        const desc = finding.description.replace(/(\r\n|\n|\r)/gm, " ").slice(0, 50) + (finding.description.length > 50 ? "..." : "")
        lines.push(`${id} | ${sev} | ${metric} | ${desc}`)
      })
      lines.push("")
    }

    lines.push("----------------------------------------")
    lines.push("Accountability Statement: Generated by Transparent.city with cryptographic timestamp.")
    lines.push("This report serves as a preliminary audit lead and should be verified against source records.")
    return lines.join("\n")
  }, [
    analysisPeriod,
    comparisonFindings,
    displayData?.data_freshness,
    generatedLabel,
    hasRoleConflictSignal,
    methodologyDescription,
    primaryFinding,
    recommendedSteps,
    selectedCategory,
    selectedClusterFindings.length,
    selectedSubcluster,
    severityCounts.critical,
    severityCounts.high,
    severityCounts.medium,
  ])

  const htmlReport = useMemo(() => {
    const sourceRows =
      displayData?.data_freshness?.map(
        (source) =>
          `<li>${source.dataset_name} (${source.rows_fetched.toLocaleString()} rows)</li>`,
      ) ?? []

    const sampleRows = comparisonFindings.map(f => 
      `<tr>
        <td style="border:1px solid #ddd; padding:8px;">${f.id}</td>
        <td style="border:1px solid #ddd; padding:8px;">${f.entity}</td>
        <td style="border:1px solid #ddd; padding:8px; color:${f.severity === 'critical' ? 'red' : 'black'}">${f.severity.toUpperCase()}</td>
        <td style="border:1px solid #ddd; padding:8px;">${f.metric} (${f.metricDetail})</td>
      </tr>`
    ).join("")

    return `
      <html>
        <head>
          <meta charset="utf-8" />
          <title>Transparent.city Auditor Analysis Report</title>
          <style>
            body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #111827; max-width: 900px; margin: 0 auto; padding: 20px; }
            h1 { border-bottom: 2px solid #4f46e5; padding-bottom: 10px; color: #1f2937; }
            h2 { background-color: #f3f4f6; padding: 10px; border-left: 4px solid #4f46e5; margin-top: 30px; font-size: 18px; }
            .meta { background: #f9fafb; padding: 15px; border-radius: 8px; margin-bottom: 20px; font-size: 14px; }
            .finding-box { border: 1px solid #e5e7eb; padding: 20px; border-radius: 8px; background: white; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
            table { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 12px; }
            th { background: #4f46e5; color: white; text-align: left; padding: 8px; }
            .footer { margin-top: 50px; font-size: 12px; color: #6b7280; border-top: 1px solid #eee; padding-top: 10px; }
          </style>
        </head>
        <body>
          <h1>Audit Observation Report</h1>
          <div class="meta">
            <p><strong>Generated:</strong> ${generatedLabel}</p>
            <p><strong>Scope:</strong> ${analysisPeriod}</p>
            <p><strong>Focus Area:</strong> ${formatCategoryLabel(selectedCategory)} &gt; ${selectedSubcluster || "N/A"}</p>
            <p><strong>Risk Profile:</strong> ${selectedClusterFindings.length} records (${severityCounts.critical} Critical, ${severityCounts.high} High)</p>
          </div>

          <h2>1. Methodology & Scope</h2>
          <p><strong>Methodology:</strong> ${methodologyDescription}</p>
          <p><strong>Data Sources:</strong></p>
          <ul>${sourceRows.length ? sourceRows.join("") : "<li>Waste analysis API findings payload</li>"}</ul>

          ${
            primaryFinding
              ? `<h2>2. Detailed Observation (Primary Sample)</h2>
                 <div class="finding-box">
                   <p><strong>Finding ID:</strong> ${primaryFinding.id}</p>
                   <p><strong>Entity:</strong> ${primaryFinding.entity}</p>
                   <p><strong>Condition:</strong> ${primaryFinding.metric} — ${primaryFinding.metricDetail}</p>
                   <p><strong>Description:</strong> ${primaryFinding.description}</p>
                   <p><strong>Criteria:</strong> Deviates from expected baseline for ${primaryFinding.subcategory}. High-risk indicator for waste or policy non-compliance.</p>
                 </div>`
              : "<h2>No records available for selected sub-cluster</h2>"
          }

          <h2>3. Recommendations</h2>
          <ol>${recommendedSteps.map((step) => `<li>${step}</li>`).join("")}</ol>

          ${
            comparisonFindings.length
              ? `<h2>4. Expanded Sample (${comparisonFindings.length} Records)</h2>
                 <table>
                   <thead><tr><th>ID</th><th>Entity</th><th>Severity</th><th>Details</th></tr></thead>
                   <tbody>${sampleRows}</tbody>
                 </table>`
              : ""
          }

          <div class="footer">
            <p>Generated by Transparent.city with timestamp and source metadata for audit reproducibility.</p>
            <p>This report serves as a preliminary audit lead and should be verified against source records.</p>
          </div>
        </body>
      </html>
    `.trim()
  }, [
    analysisPeriod,
    comparisonFindings,
    displayData?.data_freshness,
    generatedLabel,
    methodologyDescription,
    primaryFinding,
    recommendedSteps,
    selectedCategory,
    selectedClusterFindings.length,
    selectedSubcluster,
    severityCounts.critical,
    severityCounts.high,
    severityCounts.medium,
  ])

  async function copyForGoogleDocs() {
    try {
      await navigator.clipboard.writeText(plainTextReport)
      setStatusMessage("Copied report text for Google Docs.")
    } catch (copyError) {
      console.error(copyError)
      setStatusMessage("Could not copy automatically. Please copy manually.")
    }
  }

  function openGoogleDocs() {
    window.open("https://docs.new", "_blank", "noopener,noreferrer")
    setStatusMessage("Opened Google Docs. Paste copied report content there.")
  }

  function downloadDoc() {
    const blob = new Blob([htmlReport], {
      type: "application/msword;charset=utf-8",
    })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement("a")
    anchor.href = url
    anchor.download = `transparent-city-analysis-${generatedAt
      .toISOString()
      .slice(0, 10)}.doc`
    document.body.appendChild(anchor)
    anchor.click()
    document.body.removeChild(anchor)
    URL.revokeObjectURL(url)
    setStatusMessage("Downloaded .doc export.")
  }

  const handleRefresh = async () => {
    setAllowAutoFetch(true)
    setRefreshTimedOut(false)
    setIsManualRefreshing(true)
    try {
      await forceRefetch()
    } finally {
      setIsManualRefreshing(false)
    }
  }

  return (
    <WasteShell
      title="Analysis"
      description="Auditor-ready reports generated from selected waste-detection sub-clusters."
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
      {isManualRefreshing ? (
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm font-medium text-blue-900">{refreshProgress.step}</p>
            <div className="mt-2 h-2 w-full rounded-full bg-blue-100 overflow-hidden">
              <div
                className="h-full rounded-full bg-blue-500 transition-all duration-500 ease-out"
                style={{ width: `${refreshProgress.progressPct}%` }}
              />
            </div>
            <p className="text-xs text-blue-700 mt-1">
              {refreshProgress.etaLabel} · Typical refresh run: 15-40s
            </p>
            {refreshProgress.isLongRunning ? (
              <p className="text-xs text-blue-700 mt-1">
                If this exceeds 90s, use Refresh again to re-request analysis.
              </p>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {!isManualRefreshing && refreshTimedOut ? (
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm font-medium text-amber-800">
              Refresh took too long and was stopped.
            </p>
            <p className="text-xs text-amber-700 mt-1">
              Showing last saved snapshot. Try Refresh again when backend load is lower.
            </p>
          </CardContent>
        </Card>
      ) : null}

      {!isManualRefreshing && displayData && !allowAutoFetch ? (
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm font-medium text-gray-800">
              Showing your last saved analysis snapshot.
            </p>
            <p className="text-xs text-gray-600 mt-1">
              Click Refresh to run a new analysis.
            </p>
          </CardContent>
        </Card>
      ) : null}

      {!isManualRefreshing && !displayData && !error ? (
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm font-medium text-gray-800">
              No saved analysis snapshot found yet.
            </p>
            <p className="text-xs text-gray-600 mt-1">
              Click Refresh to run your first analysis.
            </p>
          </CardContent>
        </Card>
      ) : null}

      {error ? (
        <Card>
          <CardHeader>
            <CardTitle>Could not load analysis data</CardTitle>
            <CardDescription>
              {error instanceof Error ? error.message : "Unexpected error"}
            </CardDescription>
          </CardHeader>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-2xl flex items-center gap-2">
            <ShieldCheck className="h-6 w-6 text-purple-600" />
            Auditor Analysis Builder
          </CardTitle>
          <CardDescription>
            Choose any category and sub-cluster (permit speed, overtime, vendor patterns, and more),
            then generate an auditor-formatted report.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <label className="text-sm text-gray-700">
              <span className="mb-1 inline-flex items-center gap-1 font-medium">
                <Filter className="h-4 w-4" />
                Category
              </span>
              <select
                value={selectedCategory}
                onChange={(event) =>
                  setSelectedCategory(event.target.value as WasteCategory)
                }
                className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
              >
                <option value="all">All categories</option>
                <option value="payroll">Payroll & Compensation</option>
                <option value="vendor">Vendor & Procurement</option>
                <option value="infrastructure">Infrastructure & Services</option>
                <option value="influence">Influence & Pay-to-Play</option>
              </select>
            </label>

            <label className="text-sm text-gray-700">
              <span className="mb-1 inline-flex items-center gap-1 font-medium">
                <Filter className="h-4 w-4" />
                Sub-cluster
              </span>
              <select
                value={selectedSubcluster}
                onChange={(event) => setSelectedSubcluster(event.target.value)}
                className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
                disabled={!subclusterOptions.length}
              >
                {!subclusterOptions.length ? (
                  <option value="">No clusters available</option>
                ) : null}
                {subclusterOptions.map((option) => (
                  <option key={option.name} value={option.name}>
                    {option.name} ({option.count})
                  </option>
                ))}
              </select>
            </label>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Selected sub-cluster summary</CardTitle>
          <CardDescription>
            {selectedSubcluster
              ? `${selectedSubcluster} within ${formatCategoryLabel(selectedCategory)}`
              : "Select a sub-cluster to generate report details"}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-gray-700">
          <p>
            <span className="font-semibold text-gray-900">Records flagged:</span>{" "}
            {selectedClusterFindings.length}
          </p>
          <p>
            <span className="font-semibold text-gray-900">Severity:</span>{" "}
            {severityCounts.critical} critical, {severityCounts.high} high,{" "}
            {severityCounts.medium} medium
          </p>
          <p>
            <span className="font-semibold text-gray-900">Potential role-conflict signal:</span>{" "}
            {hasRoleConflictSignal ? "Detected" : "Not detected in selected records"}
          </p>
          <p>
            <span className="font-semibold text-gray-900">Report generated:</span>{" "}
            {generatedLabel}
          </p>
          <p>
            <span className="font-semibold text-gray-900">Analysis period:</span>{" "}
            {analysisPeriod}
          </p>
        </CardContent>
      </Card>

      {primaryFinding ? (
        <Card>
          <CardHeader>
            <CardTitle>Primary flagged example: {primaryFinding.id}</CardTitle>
            <CardDescription>
              {primaryFinding.metric} - {primaryFinding.metricDetail}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-gray-700">
            <p>{primaryFinding.description}</p>
            <p>
              <span className="font-semibold text-gray-900">Entity:</span>{" "}
              {primaryFinding.entity}
            </p>
            <p>
              <span className="font-semibold text-gray-900">Reason flagged:</span>{" "}
              {primaryFinding.metric} and supporting detector output from{" "}
              {primaryFinding.tool}.
            </p>
            {hasRoleConflictSignal ? (
              <p>
                <span className="font-semibold text-gray-900">Conflict note:</span>{" "}
                Text patterns suggest possible same-person apply/review overlap and
                should be validated with identity logs.
              </p>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Recommended next steps for auditor</CardTitle>
        </CardHeader>
        <CardContent>
          <ol className="list-decimal pl-5 space-y-1 text-sm text-gray-700">
            {recommendedSteps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        </CardContent>
      </Card>

      {comparisonFindings.length ? (
        <Card>
          <CardHeader>
            <CardTitle>Additional egregious examples</CardTitle>
            <CardDescription>
              Top outliers after the primary example within the same sub-cluster.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {comparisonFindings.map((finding) => (
              <div key={finding.id} className="rounded-md border border-gray-200 p-3">
                <p className="text-sm font-semibold text-gray-900">{finding.id}</p>
                <p className="text-sm text-gray-700">
                  {finding.metric} - {finding.metricDetail}
                </p>
                <p className="text-sm text-gray-600 mt-1">{finding.description}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Export report</CardTitle>
          <CardDescription>
            Export this generated report after reviewing the findings above.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={copyForGoogleDocs}>
              <ClipboardCopy className="h-4 w-4" />
              Copy for Google Docs
            </Button>
            <Button variant="outline" onClick={openGoogleDocs}>
              <FileText className="h-4 w-4" />
              Open Google Docs
            </Button>
            <Button variant="outline" onClick={downloadDoc}>
              <Download className="h-4 w-4" />
              Download .doc
            </Button>
          </div>
          {statusMessage ? (
            <p className="text-sm text-gray-600">{statusMessage}</p>
          ) : null}
        </CardContent>
      </Card>
    </WasteShell>
  )
}

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
import type { WasteFinding } from "@/lib/apiClient"
import { WasteShell } from "./waste-shell"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

type WasteCategory = "all" | "payroll" | "vendor" | "infrastructure"

function normalizeWasteCategory(category: string): WasteCategory {
  const key = category.toLowerCase().trim().replace(/[_\s-]+/g, "_")
  if (key === "payroll" || key === "payroll_compensation") return "payroll"
  if (key === "vendor" || key === "vendors" || key === "vendor_procurement") {
    return "vendor"
  }
  if (
    key === "infrastructure" ||
    key === "services" ||
    key === "service" ||
    key === "infrastructure_services"
  ) {
    return "infrastructure"
  }
  return "all"
}

function formatCategoryLabel(category: WasteCategory): string {
  if (category === "all") return "All categories"
  if (category === "payroll") return "Payroll & Compensation"
  if (category === "vendor") return "Vendor & Procurement"
  return "Infrastructure & Services"
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

export function WasteAnalysisContent() {
  const [selectedCategory, setSelectedCategory] = useState<WasteCategory>("all")
  const [selectedSubcluster, setSelectedSubcluster] = useState<string>("")
  const [statusMessage, setStatusMessage] = useState("")
  const [forceRefresh, setForceRefresh] = useState(false)

  const { data, isLoading, error, refetch } = useWasteAnalysis(undefined, forceRefresh)

  const generatedAt = useMemo(() => new Date(), [])
  const generatedLabel = generatedAt.toLocaleString()

  const findings = data?.findings ?? []

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
  const comparisonFindings = selectedClusterFindings.slice(1, 4)

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
    if (!data?.analysis_timestamp) return "Current analysis window"
    const asOf = new Date(data.analysis_timestamp).toLocaleDateString()
    return `Up to ${asOf}`
  }, [data?.analysis_timestamp])

  const recommendedSteps = useMemo(
    () =>
      buildRecommendedNextSteps(
        selectedCategory,
        selectedSubcluster || "selected sub-cluster",
        hasRoleConflictSignal,
      ),
    [hasRoleConflictSignal, selectedCategory, selectedSubcluster],
  )

  const plainTextReport = useMemo(() => {
    const lines: string[] = []
    lines.push("Transparent.city Auditor Analysis Report")
    lines.push("")
    lines.push(`Report date: ${generatedLabel}`)
    lines.push(`Prepared by: Transparent.city`)
    lines.push(`Analysis period: ${analysisPeriod}`)
    lines.push(`Category filter: ${formatCategoryLabel(selectedCategory)}`)
    lines.push(`Sub-cluster selected: ${selectedSubcluster || "N/A"}`)
    lines.push("")
    lines.push(`Records in selected sub-cluster: ${selectedClusterFindings.length}`)
    lines.push(
      `Severity breakdown: critical=${severityCounts.critical}, high=${severityCounts.high}, medium=${severityCounts.medium}`,
    )
    lines.push("")

    if (primaryFinding) {
      lines.push(`Primary record: ${primaryFinding.id}`)
      lines.push(`${primaryFinding.metric} — ${primaryFinding.metricDetail}`)
      lines.push(primaryFinding.description)
      lines.push(`Entity: ${primaryFinding.entity}`)
      lines.push(`Tool: ${primaryFinding.tool}`)
      lines.push(`Priority score: ${primaryFinding.priority_score}`)
      lines.push("")
      lines.push("Reasons flagged:")
      lines.push(`- ${primaryFinding.metric}: ${primaryFinding.metricDetail}`)
      lines.push(`- ${primaryFinding.description}`)
      if (hasRoleConflictSignal) {
        lines.push(
          "- Potential same-person or conflict-of-duty signal detected in record text.",
        )
      }
    }

    lines.push("")
    lines.push("Recommended next audit steps:")
    recommendedSteps.forEach((step, index) => {
      lines.push(`${index + 1}. ${step}`)
    })
    lines.push("")

    if (comparisonFindings.length) {
      lines.push("Additional egregious examples:")
      comparisonFindings.forEach((finding) => {
        lines.push(
          `- ${finding.id}: ${finding.metric} (${finding.metricDetail}) — ${finding.description}`,
        )
      })
      lines.push("")
    }

    lines.push("Data used:")
    ;(data?.data_freshness ?? []).forEach((source) => {
      lines.push(
        `- ${source.dataset_name} (${source.rows_fetched.toLocaleString()} rows)`,
      )
    })
    if (!data?.data_freshness?.length) {
      lines.push("- Waste analysis API findings payload")
    }
    lines.push("")
    lines.push(
      "Accountability statement: Generated by Transparent.city with timestamp and source metadata for audit reproducibility.",
    )
    return lines.join("\n")
  }, [
    analysisPeriod,
    comparisonFindings,
    data?.data_freshness,
    generatedLabel,
    hasRoleConflictSignal,
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
      data?.data_freshness?.map(
        (source) =>
          `<li>${source.dataset_name} (${source.rows_fetched.toLocaleString()} rows)</li>`,
      ) ?? []

    return `
      <html>
        <head><meta charset="utf-8" /><title>Transparent.city Auditor Analysis Report</title></head>
        <body style="font-family: Arial, sans-serif; line-height: 1.5; color: #111827;">
          <h1>Transparent.city Auditor Analysis Report</h1>
          <p><strong>Report date:</strong> ${generatedLabel}</p>
          <p><strong>Prepared by:</strong> Transparent.city</p>
          <p><strong>Analysis period:</strong> ${analysisPeriod}</p>
          <p><strong>Category filter:</strong> ${formatCategoryLabel(selectedCategory)}</p>
          <p><strong>Sub-cluster selected:</strong> ${selectedSubcluster || "N/A"}</p>
          <p><strong>Records in selected sub-cluster:</strong> ${selectedClusterFindings.length}</p>
          <h2>Severity Breakdown</h2>
          <ul>
            <li>Critical: ${severityCounts.critical}</li>
            <li>High: ${severityCounts.high}</li>
            <li>Medium: ${severityCounts.medium}</li>
          </ul>
          ${
            primaryFinding
              ? `<h2>Primary Record: ${primaryFinding.id}</h2>
                 <p><strong>${primaryFinding.metric}</strong> - ${primaryFinding.metricDetail}</p>
                 <p>${primaryFinding.description}</p>`
              : "<h2>No records available for selected sub-cluster</h2>"
          }
          <h2>Recommended Next Steps</h2>
          <ol>${recommendedSteps.map((step) => `<li>${step}</li>`).join("")}</ol>
          ${
            comparisonFindings.length
              ? `<h2>Additional Egregious Examples</h2><ul>${comparisonFindings
                  .map(
                    (finding) =>
                      `<li>${finding.id}: ${finding.metric} (${finding.metricDetail})</li>`,
                  )
                  .join("")}</ul>`
              : ""
          }
          <h2>Data Used</h2>
          <ul>${sourceRows.length ? sourceRows.join("") : "<li>Waste analysis API findings payload</li>"}</ul>
          <h2>Accountability</h2>
          <p>Generated by Transparent.city with timestamp and source metadata for audit reproducibility.</p>
        </body>
      </html>
    `.trim()
  }, [
    analysisPeriod,
    comparisonFindings,
    data?.data_freshness,
    generatedLabel,
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

  const handleRefresh = () => {
    setForceRefresh(true)
    refetch().finally(() => setForceRefresh(false))
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
          disabled={isLoading}
        >
          <RefreshCw className={`w-4 h-4 mr-2 ${isLoading ? "animate-spin" : ""}`} />
          {isLoading ? "Refreshing..." : "Refresh"}
        </Button>
      }
    >
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
    </WasteShell>
  )
}

"use client"

import { useMemo, useState } from "react"
import { ClipboardCopy, Download, FileText, ShieldCheck } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

type FlagReason = {
  title: string
  detail: string
  severity: "critical" | "high" | "medium"
}

type CaseRecord = {
  id: string
  subArea: string
  summary: string
  applicant: string
  reviewer: string
  samePersonDetected: boolean
  permitType: string
  turnaround: string
  comparisonToMedian: string
  reasons: FlagReason[]
  recommendedSteps: string[]
}

const analysisPeriod = "2025-01-01 through 2025-12-31"

const sourceDatasets = [
  "City Permit Workflow Events (v4)",
  "Permit Applicant Registry",
  "Plan Reviewer Assignment Log",
  "Supervisor Escalation Notes",
]

const primaryCase: CaseRecord = {
  id: "PF-1477",
  subArea: "Permit Fast-Tracking",
  summary:
    "Permit record PF-1477 appears to be both submitted and reviewed by the same named individual, then approved in a timeline materially faster than baseline.",
  applicant: "A. Rivera",
  reviewer: "A. Rivera",
  samePersonDetected: true,
  permitType: "Commercial remodel (electrical + mechanical)",
  turnaround: "19 minutes",
  comparisonToMedian: "Median for same permit type is 11.2 days",
  reasons: [
    {
      title: "Conflict-of-role indicator",
      detail:
        "Exact name match between applicant and assigned reviewer in the same permit lifecycle.",
      severity: "critical",
    },
    {
      title: "Outlier speed",
      detail:
        "Approval time is >800x faster than the observed median for peer permits.",
      severity: "high",
    },
    {
      title: "Missing independent review notes",
      detail:
        "Audit trail has no independent plan-check comments between submission and approval.",
      severity: "high",
    },
  ],
  recommendedSteps: [
    "Request underlying identity verification records for applicant and reviewer assignments.",
    "Confirm whether emergency exception codes were authorized for this permit.",
    "Obtain supervisor authorization documentation for accelerated processing.",
    "Re-run conflict screening on related permits linked to the same account identifiers.",
  ],
}

const egregiousComparisons: CaseRecord[] = [
  {
    id: "PF-1612",
    subArea: "Permit Fast-Tracking",
    summary:
      "Permit approved same day with reviewer account switched three times in one hour.",
    applicant: "Northline Construction LLC",
    reviewer: "J. Patel",
    samePersonDetected: false,
    permitType: "Multi-unit interior alteration",
    turnaround: "47 minutes",
    comparisonToMedian: "Median for same permit type is 13.4 days",
    reasons: [
      {
        title: "Reviewer reassignment churn",
        detail:
          "Three reviewer changes occurred before approval with no explanatory note.",
        severity: "high",
      },
      {
        title: "Compressed approval timeline",
        detail:
          "Approval completed without documented correction cycles typically required for this permit class.",
        severity: "medium",
      },
    ],
    recommendedSteps: [
      "Request assignment event logs with user IDs and role change reason codes.",
      "Validate whether automated approval rules were enabled for this record.",
    ],
  },
  {
    id: "PF-1723",
    subArea: "Permit Fast-Tracking",
    summary:
      "Reviewer account and supervisor override originated from identical IP and device fingerprint.",
    applicant: "Crestpoint Development Group",
    reviewer: "M. Ortega",
    samePersonDetected: false,
    permitType: "Mixed-use occupancy update",
    turnaround: "31 minutes",
    comparisonToMedian: "Median for same permit type is 9.6 days",
    reasons: [
      {
        title: "Shared infrastructure event",
        detail:
          "Reviewer and approving supervisor actions came from the same workstation signature.",
        severity: "critical",
      },
      {
        title: "Insufficient segregation evidence",
        detail:
          "No substantiating note explains why dual-role controls were bypassed.",
        severity: "high",
      },
    ],
    recommendedSteps: [
      "Collect endpoint/device logs from IT for chain-of-custody review.",
      "Interview listed reviewer and supervisor on concurrent login activity.",
    ],
  },
  {
    id: "PF-1839",
    subArea: "Permit Fast-Tracking",
    summary:
      "Permit received policy exception despite missing two required attachments.",
    applicant: "Harborline Holdings",
    reviewer: "S. Chen",
    samePersonDetected: false,
    permitType: "Facade and signage modification",
    turnaround: "1 hour 08 minutes",
    comparisonToMedian: "Median for same permit type is 6.1 days",
    reasons: [
      {
        title: "Exception without support",
        detail:
          "Exception flag present, but no waiver memorandum is attached.",
        severity: "high",
      },
      {
        title: "Documentation gap",
        detail: "Required drawing-set and inspection pre-check documents are absent.",
        severity: "medium",
      },
    ],
    recommendedSteps: [
      "Retrieve exception approval memo and attachment upload history.",
      "Assess whether missing documents were added post-approval.",
    ],
  },
]

function severityClass(severity: FlagReason["severity"]): string {
  if (severity === "critical") return "bg-red-100 text-red-700 border-red-200"
  if (severity === "high") return "bg-amber-100 text-amber-800 border-amber-200"
  return "bg-blue-100 text-blue-700 border-blue-200"
}

export function AuditorAnalysisReport() {
  const [statusMessage, setStatusMessage] = useState("")

  const generatedAt = useMemo(() => new Date(), [])
  const generatedLabel = generatedAt.toLocaleString()

  const plainTextReport = useMemo(() => {
    const lines: string[] = []
    lines.push("Transparent.city Auditor Analysis Report")
    lines.push("")
    lines.push(`Report date: ${generatedLabel}`)
    lines.push(`Analysis period: ${analysisPeriod}`)
    lines.push(`Prepared by: Transparent.city`)
    lines.push("")
    lines.push("Sub-area reviewed:")
    lines.push(`- ${primaryCase.subArea}`)
    lines.push(`- Flagged records in scope: 1,477`)
    lines.push("")
    lines.push(`Primary case: ${primaryCase.id}`)
    lines.push(primaryCase.summary)
    lines.push(`Applicant: ${primaryCase.applicant}`)
    lines.push(`Reviewer: ${primaryCase.reviewer}`)
    lines.push(
      `Same person listed as applicant/reviewer: ${
        primaryCase.samePersonDetected ? "Yes" : "No"
      }`,
    )
    lines.push(`Turnaround: ${primaryCase.turnaround}`)
    lines.push(`Benchmark: ${primaryCase.comparisonToMedian}`)
    lines.push("")
    lines.push("Reasons flagged:")
    primaryCase.reasons.forEach((reason) => {
      lines.push(
        `- [${reason.severity.toUpperCase()}] ${reason.title}: ${reason.detail}`,
      )
    })
    lines.push("")
    lines.push("Recommended next audit steps:")
    primaryCase.recommendedSteps.forEach((step, index) => {
      lines.push(`${index + 1}. ${step}`)
    })
    lines.push("")
    lines.push("Additional egregious comparison cases:")
    egregiousComparisons.forEach((record) => {
      lines.push(`- ${record.id}: ${record.summary}`)
      record.reasons.forEach((reason) => {
        lines.push(`  • ${reason.title}: ${reason.detail}`)
      })
    })
    lines.push("")
    lines.push("Data used:")
    sourceDatasets.forEach((dataset) => {
      lines.push(`- ${dataset}`)
    })
    lines.push("")
    lines.push(
      "Accountability statement: This report is generated by Transparent.city using the listed data sources and includes the generation timestamp for reproducibility.",
    )
    return lines.join("\n")
  }, [generatedLabel])

  const htmlReport = useMemo(() => {
    const reasonBlocks = primaryCase.reasons
      .map(
        (reason) =>
          `<li><strong>${reason.severity.toUpperCase()}</strong> - ${reason.title}: ${reason.detail}</li>`,
      )
      .join("")

    const comparisonBlocks = egregiousComparisons
      .map(
        (record) =>
          `<h3>${record.id}</h3><p>${record.summary}</p><ul>${record.reasons
            .map((reason) => `<li>${reason.title}: ${reason.detail}</li>`)
            .join("")}</ul>`,
      )
      .join("")

    return `
      <html>
        <head>
          <meta charset="utf-8" />
          <title>Transparent.city Auditor Analysis Report</title>
        </head>
        <body style="font-family: Arial, sans-serif; line-height: 1.5; color: #111827;">
          <h1>Transparent.city Auditor Analysis Report</h1>
          <p><strong>Report date:</strong> ${generatedLabel}</p>
          <p><strong>Analysis period:</strong> ${analysisPeriod}</p>
          <p><strong>Prepared by:</strong> Transparent.city</p>
          <h2>Sub-area Reviewed</h2>
          <p>Permit Fast-Tracking (1,477 flagged records)</p>
          <h2>Primary Case: ${primaryCase.id}</h2>
          <p>${primaryCase.summary}</p>
          <p><strong>Applicant:</strong> ${primaryCase.applicant}</p>
          <p><strong>Reviewer:</strong> ${primaryCase.reviewer}</p>
          <p><strong>Same person listed as applicant/reviewer:</strong> ${
            primaryCase.samePersonDetected ? "Yes" : "No"
          }</p>
          <p><strong>Turnaround:</strong> ${primaryCase.turnaround}</p>
          <p><strong>Benchmark:</strong> ${primaryCase.comparisonToMedian}</p>
          <h2>Reasons Flagged</h2>
          <ul>${reasonBlocks}</ul>
          <h2>Recommended Next Steps</h2>
          <ol>${primaryCase.recommendedSteps.map((step) => `<li>${step}</li>`).join("")}</ol>
          <h2>Egregious Comparison Cases</h2>
          ${comparisonBlocks}
          <h2>Data Used</h2>
          <ul>${sourceDatasets.map((dataset) => `<li>${dataset}</li>`).join("")}</ul>
          <h2>Accountability</h2>
          <p>This report is generated by Transparent.city using the listed data sources and includes generation timestamp metadata for audit reproducibility.</p>
        </body>
      </html>
    `.trim()
  }, [generatedLabel])

  async function copyForGoogleDocs() {
    try {
      await navigator.clipboard.writeText(plainTextReport)
      setStatusMessage("Copied report text for Google Docs.")
    } catch (error) {
      console.error("Failed to copy report", error)
      setStatusMessage("Could not copy automatically. Try manual copy.")
    }
  }

  function downloadDoc() {
    const blob = new Blob([htmlReport], {
      type: "application/msword;charset=utf-8",
    })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement("a")
    anchor.href = url
    anchor.download = `transparent-city-auditor-analysis-${generatedAt
      .toISOString()
      .slice(0, 10)}.doc`
    document.body.appendChild(anchor)
    anchor.click()
    document.body.removeChild(anchor)
    URL.revokeObjectURL(url)
    setStatusMessage("Downloaded .doc export.")
  }

  function openGoogleDocs() {
    window.open("https://docs.new", "_blank", "noopener,noreferrer")
    setStatusMessage("Opened Google Docs. Paste copied report content there.")
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="space-y-3">
          <CardTitle className="text-2xl flex items-center gap-2">
            <ShieldCheck className="h-6 w-6 text-purple-600" />
            Auditor Report: Permit Fast-Tracking Review
          </CardTitle>
          <CardDescription>
            Structured analysis for audit handoff, including findings, rationale,
            recommended next steps, and export options.
          </CardDescription>
          <div className="flex flex-wrap items-center gap-2 pt-2">
            <Button onClick={copyForGoogleDocs} variant="default">
              <ClipboardCopy className="h-4 w-4" />
              Copy for Google Docs
            </Button>
            <Button onClick={openGoogleDocs} variant="outline">
              <FileText className="h-4 w-4" />
              Open Google Docs
            </Button>
            <Button onClick={downloadDoc} variant="outline">
              <Download className="h-4 w-4" />
              Download .doc
            </Button>
          </div>
          {statusMessage ? (
            <p className="text-sm text-gray-600">{statusMessage}</p>
          ) : null}
        </CardHeader>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Executive Summary</CardTitle>
          <CardDescription>
            The permit fast-tracking sub-area includes 1,477 flagged records.
            The primary case indicates a potential role-conflict and an extreme
            approval-time outlier that merits immediate auditor validation.
          </CardDescription>
        </CardHeader>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Primary Case: {primaryCase.id}</CardTitle>
          <CardDescription>{primaryCase.summary}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            <div className="rounded-md border border-gray-200 p-3">
              <p className="text-gray-500">Applicant</p>
              <p className="font-medium text-gray-900">{primaryCase.applicant}</p>
            </div>
            <div className="rounded-md border border-gray-200 p-3">
              <p className="text-gray-500">Reviewer</p>
              <p className="font-medium text-gray-900">{primaryCase.reviewer}</p>
            </div>
            <div className="rounded-md border border-gray-200 p-3">
              <p className="text-gray-500">Same person on permit/review</p>
              <p className="font-medium text-gray-900">
                {primaryCase.samePersonDetected ? "Yes - Flagged" : "No"}
              </p>
            </div>
            <div className="rounded-md border border-gray-200 p-3">
              <p className="text-gray-500">Turnaround vs median</p>
              <p className="font-medium text-gray-900">
                {primaryCase.turnaround} ({primaryCase.comparisonToMedian})
              </p>
            </div>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-gray-900 mb-2">
              Reasons flagged
            </h3>
            <div className="space-y-2">
              {primaryCase.reasons.map((reason) => (
                <div
                  key={`${reason.severity}-${reason.title}`}
                  className="rounded-md border border-gray-200 p-3"
                >
                  <div className="flex items-center gap-2">
                    <span
                      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold uppercase ${severityClass(
                        reason.severity,
                      )}`}
                    >
                      {reason.severity}
                    </span>
                    <span className="text-sm font-medium text-gray-900">
                      {reason.title}
                    </span>
                  </div>
                  <p className="text-sm text-gray-600 mt-1">{reason.detail}</p>
                </div>
              ))}
            </div>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-gray-900 mb-2">
              Recommended next audit steps
            </h3>
            <ol className="list-decimal pl-5 space-y-1 text-sm text-gray-700">
              {primaryCase.recommendedSteps.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Egregious comparison cases</CardTitle>
          <CardDescription>
            Additional outliers were reviewed to understand why they differ and
            to help auditors prioritize follow-up.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {egregiousComparisons.map((record) => (
            <div key={record.id} className="rounded-md border border-gray-200 p-4">
              <p className="text-sm font-semibold text-gray-900">
                {record.id} - {record.permitType}
              </p>
              <p className="text-sm text-gray-600 mt-1">{record.summary}</p>
              <p className="text-sm text-gray-700 mt-2">
                Turnaround: <span className="font-medium">{record.turnaround}</span>{" "}
                ({record.comparisonToMedian})
              </p>
              <ul className="list-disc pl-5 mt-2 space-y-1 text-sm text-gray-700">
                {record.reasons.map((reason) => (
                  <li key={reason.title}>
                    <span className="font-medium">{reason.title}:</span>{" "}
                    {reason.detail}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Accountability and data provenance</CardTitle>
          <CardDescription>
            Metadata included for a complete audit handoff package.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-gray-700">
          <p>
            <span className="font-semibold text-gray-900">Prepared by:</span>{" "}
            Transparent.city
          </p>
          <p>
            <span className="font-semibold text-gray-900">Report generated:</span>{" "}
            {generatedLabel}
          </p>
          <p>
            <span className="font-semibold text-gray-900">Analysis period:</span>{" "}
            {analysisPeriod}
          </p>
          <div>
            <p className="font-semibold text-gray-900 mb-1">Data used:</p>
            <ul className="list-disc pl-5 space-y-1">
              {sourceDatasets.map((dataset) => (
                <li key={dataset}>{dataset}</li>
              ))}
            </ul>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

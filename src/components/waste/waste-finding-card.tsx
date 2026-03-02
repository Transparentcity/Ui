"use client"

import { useState } from "react"
import { cn } from "@/lib/utils"
import { ChevronDown, ShieldCheck, ShieldAlert, ShieldQuestion, AlertCircle, Sparkles, Map as MapIcon } from "lucide-react"
import { type WasteFinding } from "@/lib/apiClient"
import { formatDollar, escapeSoqlLike as escapeSoqlLikeShared, escapeSoql } from "./waste-utils"

const severityConfig = {
  critical: {
    bg: "bg-red-100",
    text: "text-red-700",
    border: "border-red-200",
    label: "CRIT",
    metricColor: "text-red-600",
  },
  high: {
    bg: "bg-amber-100",
    text: "text-amber-700",
    border: "border-amber-200",
    label: "HIGH",
    metricColor: "text-amber-600",
  },
  medium: {
    bg: "bg-indigo-100",
    text: "text-indigo-700",
    border: "border-indigo-200",
    label: "MED",
    metricColor: "text-indigo-600",
  },
}

const confidenceConfig = {
  high: {
    icon: ShieldCheck,
    bg: "bg-emerald-50",
    text: "text-emerald-700",
    border: "border-emerald-200",
    label: "High confidence",
  },
  medium: {
    icon: ShieldAlert,
    bg: "bg-slate-50",
    text: "text-slate-600",
    border: "border-slate-200",
    label: "Medium confidence",
  },
  low: {
    icon: ShieldQuestion,
    bg: "bg-gray-50",
    text: "text-gray-500",
    border: "border-gray-200",
    label: "Low confidence",
  },
}

interface WasteFindingCardProps {
  finding: WasteFinding
  isExpanded: boolean
  onToggle: () => void
  onAskSeymour?: (finding: WasteFinding) => void
}

interface PayrollDetailRow {
  employee_identifier?: string
  job?: string
  hours?: string
  salaries?: string
  overtime?: string
  other_salaries?: string
  total_salary?: string
  year?: string
}

interface VendorDetailRow {
  vendor?: string
  department?: string
  vouchers_paid?: string
  voucher?: string
  purchase_order?: string
  check_date?: string
  fiscal_year?: string
}

interface InfrastructureDetailRow {
  service_request_id?: string
  service_name?: string
  service_subtype?: string
  status_description?: string
  requested_datetime?: string
  closed_date?: string
  neighborhoods_sffind_boundaries?: string
}

type AnyDetailRow = PayrollDetailRow & VendorDetailRow & InfrastructureDetailRow

const ROADMAP_DETECTOR_NAMES = [
  "Address Clustering",
  "Fiscal Sponsor Opacity",
  "Entity Validation",
]

function isOnRoadmap(finding: WasteFinding): boolean {
  const re = /\(On Roadmap\)/i
  if (re.test(finding.tool) || re.test(finding.subcategory)) return true
  if (/\bOn Roadmap:/i.test(finding.description)) return true

  const isConfirmed =
    finding.category?.toLowerCase() === "confirmed" ||
    finding.category?.toLowerCase().includes("confirmed") ||
    finding.id?.startsWith("CONF-")
  if (isConfirmed) {
    const detectorPart = finding.subcategory.split(" - ").pop() ?? ""
    return ROADMAP_DETECTOR_NAMES.some((p) => detectorPart.includes(p))
  }

  return false
}

function stripRoadmapLabel(text: string): string {
  return text.replace(/\s*\(On Roadmap\)/gi, "").trim()
}

const DETAILS_LIMIT = 20
const PAYROLL_FETCH_LIMIT = 60
const SOCRATA_PAYROLL = "https://data.sfgov.org/resource/88g8-5mnd.json"
const SOCRATA_VENDOR = "https://data.sfgov.org/resource/n9pm-xkyq.json"
const SOCRATA_311 = "https://data.sfgov.org/resource/vw6y-z8j6.json"

// Keywords used by D4 Infrastructure Cluster detector (must stay in sync with infrastructure.py)
const INFRA_KEYWORDS_311 = ["sewer", "water", "flood", "leak", "pressure", "ponding", "sinkhole", "puc"]

function extractCoordsFromDescription(description: string): [number, number] | null {
  const match =
    typeof description === "string"
      ? description.match(/near\s+\((-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\)/i) ??
        description.match(/\((-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\)/)
      : null
  if (!match) return null
  const a = parseFloat(match[1])
  const b = parseFloat(match[2])
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null
  // Assume (lat, lon) if both in valid ranges
  if (Math.abs(a) <= 90 && Math.abs(b) <= 180) return [a, b]
  if (Math.abs(b) <= 90 && Math.abs(a) <= 180) return [b, a]
  return null
}

function buildInfraKeywordFilter(): string {
  const parts: string[] = []
  for (const kw of INFRA_KEYWORDS_311) {
    const escaped = escapeSoqlLike(kw)
    parts.push(
      `lower(service_name) like '%${escaped}%'`,
      `lower(service_subtype) like '%${escaped}%'`,
      `lower(agency_responsible) like '%${escaped}%'`,
      `lower(service_details) like '%${escaped}%'`
    )
  }
  return `(${parts.join(" or ")})`
}

/** Use shared escapeSoqlLike from waste-utils (handles backslashes + quotes). */
function escapeSoqlLike(value: string): string {
  return escapeSoqlLikeShared(value)
}

function formatHours(hours: string | undefined): string {
  const parsed = Number(hours ?? "0")
  if (!Number.isFinite(parsed) || parsed <= 0) return "N/A"
  return `${parsed.toLocaleString(undefined, { maximumFractionDigits: 1 })} hrs`
}

function formatWeeklyHours(hours: string | undefined): string {
  const parsed = Number(hours ?? "0")
  if (!Number.isFinite(parsed) || parsed <= 0) return "N/A"
  return `${(parsed / 52).toFixed(1)} hrs/wk`
}

function formatCurrency(raw: string | undefined): string {
  const parsed = Number(raw ?? "0")
  if (!Number.isFinite(parsed)) return "N/A"
  return `$${parsed.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
}

function formatDate(dateStr: string | undefined): string {
  if (!dateStr) return "—"
  return new Date(dateStr).toLocaleDateString()
}

function groupPayrollRows(rows: AnyDetailRow[]): AnyDetailRow[] {
  const empTotals = new Map<string, number>()
  for (const row of rows) {
    const key = `${row.year ?? ""}|||${row.employee_identifier ?? ""}`
    const amt = Number(row.overtime ?? row.total_salary ?? "0") || 0
    empTotals.set(key, (empTotals.get(key) ?? 0) + amt)
  }

  return [...rows].sort((a, b) => {
    const yearA = Number(a.year ?? "0") || 0
    const yearB = Number(b.year ?? "0") || 0
    if (yearB !== yearA) return yearB - yearA

    const keyA = `${a.year ?? ""}|||${a.employee_identifier ?? ""}`
    const keyB = `${b.year ?? ""}|||${b.employee_identifier ?? ""}`
    const totalA = empTotals.get(keyA) ?? 0
    const totalB = empTotals.get(keyB) ?? 0
    if (totalB !== totalA) return totalB - totalA

    const amtA = Number(a.overtime ?? a.total_salary ?? "0") || 0
    const amtB = Number(b.overtime ?? b.total_salary ?? "0") || 0
    return amtB - amtA
  })
}

function getDepartmentFilter(finding: WasteFinding): string {
  return escapeSoqlLike((finding.entity || "").split("(")[0].trim())
}

function buildSocrataDetailsUrl(finding: WasteFinding): string | null {
  const cat = finding.category.toLowerCase()

  // PAYROLL
  if (cat.includes("payroll")) {
    const dept = getDepartmentFilter(finding)
    if (!dept) return null

    const select =
      "year,employee_identifier,job,hours,salaries,overtime,other_salaries,total_salary"
    const baseWhere = `upper(department) like upper('%${dept}%') and hours > 0`

    if (finding.subcategory === "Comp Time Manipulation") {
      const where = `${baseWhere} and salaries > 10000 and other_salaries > 0 and (other_salaries / salaries) > 0.30`
      return `${SOCRATA_PAYROLL}?$select=${encodeURIComponent(select)}&$where=${encodeURIComponent(where)}&$order=${encodeURIComponent("year desc, other_salaries desc")}&$limit=${PAYROLL_FETCH_LIMIT}`
    }

    if (
      finding.subcategory === "Hours Feasibility" ||
      finding.subcategory === "Impossibility Check"
    ) {
      return `${SOCRATA_PAYROLL}?$select=${encodeURIComponent(select)}&$where=${encodeURIComponent(baseWhere)}&$order=${encodeURIComponent("year desc, hours desc")}&$limit=${PAYROLL_FETCH_LIMIT}`
    }

    if (
      finding.subcategory === "Overtime Abuse" ||
      finding.subcategory === "Department OT Outlier" ||
      finding.subcategory === "Benford Anomaly" ||
      finding.subcategory.includes("Overtime") ||
      finding.tool.includes("Pareto")
    ) {
      return `${SOCRATA_PAYROLL}?$select=${encodeURIComponent(select)}&$where=${encodeURIComponent(baseWhere)}&$order=${encodeURIComponent("year desc, overtime desc")}&$limit=${PAYROLL_FETCH_LIMIT}`
    }

    if (finding.subcategory.includes("Pension Spiking")) {
      return `${SOCRATA_PAYROLL}?$select=${encodeURIComponent(select)}&$where=${encodeURIComponent(baseWhere)}&$order=${encodeURIComponent("year desc, total_salary desc")}&$limit=${PAYROLL_FETCH_LIMIT}`
    }
  }

  // CONTRACTS (vendor/procurement)
  if (cat.includes("contract") || cat.includes("vendor")) {
    const select = "vendor,department,vouchers_paid,voucher,purchase_order,fiscal_year"
    const vendorName = escapeSoql(finding.entity || "")
    
    const vendorOrder = "fiscal_year DESC,vouchers_paid DESC"

    // SSS Duplicates
    if (finding.subcategory === "Duplicate Payments" && finding.amount) {
      let whereClause = `vendor = '${vendorName}'`
      const amountMatch = finding.metricDetail?.match(/of \$([0-9,.]+) each/)
      if (amountMatch) {
          const amount = amountMatch[1].replace(/,/g, "")
          whereClause += ` AND vouchers_paid = ${amount}`
      }
      return `${SOCRATA_VENDOR}?$select=${encodeURIComponent(select)}&$where=${encodeURIComponent(whereClause)}&$order=${encodeURIComponent(vendorOrder)}&$limit=${DETAILS_LIMIT}`
    }

    // Ghost Vendor
    if (finding.subcategory === "Unregistered Vendor" || finding.subcategory === "Ghost Vendor") {
       return `${SOCRATA_VENDOR}?$select=${encodeURIComponent(select)}&$where=${encodeURIComponent(`vendor = '${vendorName}'`)}&$order=${encodeURIComponent(vendorOrder)}&$limit=${DETAILS_LIMIT}`
    }
    
    // Misdirected Payment (Entity is PO)
    if (finding.subcategory === "Misdirected Payment") {
        const poMatch = (finding.entity ?? "").match(/PO\s+(.+)/)
        if (poMatch) {
            const po = escapeSoqlLike(poMatch[1])
            let whereClause = `purchase_order = '${po}'`

            // Extract amount from "paid identical $90,000.00"
            const amountMatch = finding.metricDetail?.match(/paid identical \$([0-9,.]+)/)
            if (amountMatch) {
                const amount = amountMatch[1].replace(/,/g, "")
                whereClause += ` AND vouchers_paid = ${amount}`
            }

            return `${SOCRATA_VENDOR}?$select=${encodeURIComponent(select)}&$where=${encodeURIComponent(whereClause)}&$order=${encodeURIComponent(vendorOrder)}&$limit=${DETAILS_LIMIT}`
        }
    }

    // Benford/Statistical Anomaly (Entity is Department)
    if (finding.subcategory === "Statistical Anomaly") {
        const dept = escapeSoqlLike(finding.entity || "")
        return `${SOCRATA_VENDOR}?$select=${encodeURIComponent(select)}&$where=${encodeURIComponent(`department = '${dept}'`)}&$order=${encodeURIComponent(vendorOrder)}&$limit=${DETAILS_LIMIT}`
    }

    // Threshold Avoidance (Entity is "Dept (Limit $X)")
    if (finding.subcategory === "Threshold Avoidance") {
        const dept = escapeSoqlLike((finding.entity || "").split(" (Limit")[0].trim())
        if (!dept) return null
        const rangeMatch = finding.metricDetail?.match(/Range \$([0-9,.]+)-\$([0-9,.]+)/)
        if (rangeMatch) {
            const low = rangeMatch[1].replace(/,/g, "")
            const high = rangeMatch[2].replace(/,/g, "")
            const where = `department = '${dept}' AND vouchers_paid >= ${low} AND vouchers_paid <= ${high}`
            return `${SOCRATA_VENDOR}?$select=${encodeURIComponent(select)}&$where=${encodeURIComponent(where)}&$order=${encodeURIComponent(vendorOrder)}&$limit=${DETAILS_LIMIT}`
        }
        return `${SOCRATA_VENDOR}?$select=${encodeURIComponent(select)}&$where=${encodeURIComponent(`department = '${dept}'`)}&$order=${encodeURIComponent(vendorOrder)}&$limit=${DETAILS_LIMIT}`
    }

    // Default vendor fallback
    return `${SOCRATA_VENDOR}?$select=${encodeURIComponent(select)}&$where=${encodeURIComponent(`vendor = '${vendorName}'`)}&$order=${encodeURIComponent(vendorOrder)}&$limit=${DETAILS_LIMIT}`
  }

  // INFRASTRUCTURE
  if (cat.includes("infrastructure")) {
    const select = "service_request_id,service_name,service_subtype,status_description,requested_datetime,closed_date,neighborhoods_sffind_boundaries"
    
    // Spatial Cluster (D4): only water/sewer/infrastructure complaints that matched the detector
    if (finding.subcategory === "Infrastructure Cluster") {
      const keywordFilter = buildInfraKeywordFilter()
      const cutoff = new Date()
      cutoff.setDate(cutoff.getDate() - 90)
      const cutoffIso = cutoff.toISOString().split("T")[0]
      const dateFilter = `requested_datetime >= '${cutoffIso}T00:00:00.000'`

      const coords = extractCoordsFromDescription(finding.description ?? "")
      if (coords) {
        const [lat, lon] = coords
        const where = `within_circle(point, ${lat}, ${lon}, 500) and ${keywordFilter} and ${dateFilter}`
        return `${SOCRATA_311}?$select=${encodeURIComponent(select)}&$where=${encodeURIComponent(where)}&$order=requested_datetime DESC&$limit=${DETAILS_LIMIT}`
      }
      const neighborhood = escapeSoqlLike(finding.entity || "")
      const where = `neighborhoods_sffind_boundaries = '${neighborhood}' and ${keywordFilter} and ${dateFilter}`
      return `${SOCRATA_311}?$select=${encodeURIComponent(select)}&$where=${encodeURIComponent(where)}&$order=requested_datetime DESC&$limit=${DETAILS_LIMIT}`
    }
    
    // Response Time (Entity is Agency)
    if (finding.subcategory === "Response Time Deterioration") {
        const agency = escapeSoqlLike(finding.entity || "")
        return `${SOCRATA_311}?$select=${encodeURIComponent(select)}&$where=${encodeURIComponent(`agency_responsible = '${agency}'`)}&$order=requested_datetime DESC&$limit=${DETAILS_LIMIT}`
    }

    // Equity Gap (Entity is "District X")
    if (finding.subcategory === "District Equity Gap") {
        const distMatch = (finding.entity ?? "").match(/District\s+(\d+)/)
        if (distMatch) {
            const dist = distMatch[1]
             return `${SOCRATA_311}?$select=${encodeURIComponent(select)}&$where=${encodeURIComponent(`supervisor_district = '${dist}'`)}&$order=requested_datetime DESC&$limit=${DETAILS_LIMIT}`
        }
    }
  }

  return null
}

export function WasteFindingCard({
  finding,
  isExpanded,
  onToggle,
  onAskSeymour,
}: WasteFindingCardProps) {
  const sevKey = (finding.severity?.toLowerCase() ?? "medium") as keyof typeof severityConfig
  const sev = severityConfig[sevKey] ?? severityConfig.medium
  const confKey = ((finding.confidence ?? "medium").toLowerCase()) as keyof typeof confidenceConfig
  const conf = confidenceConfig[confKey] ?? confidenceConfig.medium
  const ConfIcon = conf.icon
  const [isDetailsOpen, setIsDetailsOpen] = useState(false)
  const [isDetailsLoading, setIsDetailsLoading] = useState(false)
  const [detailsError, setDetailsError] = useState<string | null>(null)
  const [detailsRows, setDetailsRows] = useState<AnyDetailRow[] | null>(null)

  const handleAskSeymour = (e: React.MouseEvent) => {
    e.stopPropagation()
    onAskSeymour?.(finding)
  }

  const detailsUrl = buildSocrataDetailsUrl(finding)
  const canShowDetails = Boolean(detailsUrl)

  const loadDetails = async () => {
    if (!detailsUrl || isDetailsLoading) return
    setIsDetailsLoading(true)
    setDetailsError(null)
    try {
      const response = await fetch(detailsUrl)
      if (!response.ok) {
        throw new Error(`Failed to load details (${response.status})`)
      }
      let rows = (await response.json()) as AnyDetailRow[]
      if (finding.category.toLowerCase().includes("payroll")) {
        rows = groupPayrollRows(rows).slice(0, DETAILS_LIMIT)
      } else {
        rows.sort((a, b) => {
          const fyA = Number(a.fiscal_year ?? a.year ?? "0") || 0
          const fyB = Number(b.fiscal_year ?? b.year ?? "0") || 0
          if (fyB !== fyA) return fyB - fyA
          const amtA = Number(a.vouchers_paid ?? a.overtime ?? a.total_salary ?? "0") || 0
          const amtB = Number(b.vouchers_paid ?? b.overtime ?? b.total_salary ?? "0") || 0
          return amtB - amtA
        })
      }
      setDetailsRows(rows)
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to load details."
      setDetailsError(message)
    } finally {
      setIsDetailsLoading(false)
    }
  }

  const handleToggleDetails = async (e: React.MouseEvent) => {
    e.stopPropagation()
    const next = !isDetailsOpen
    setIsDetailsOpen(next)
    if (next && detailsRows == null && !isDetailsLoading) {
      await loadDetails()
    }
  }

  const renderDetailsTable = () => {
    if (!detailsRows || detailsRows.length === 0) {
        return <p className="px-3 py-2 text-xs text-gray-500">No matching records found.</p>
    }

    const cat = finding.category.toLowerCase()

    if (cat.includes("contract") || cat.includes("vendor")) {
        return (
            <table className="min-w-full text-xs">
              <thead className="bg-gray-50 text-gray-600">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">Vendor</th>
                  <th className="px-3 py-2 text-left font-medium">Dept</th>
                  <th className="px-3 py-2 text-left font-medium">Amount</th>
                  <th className="px-3 py-2 text-left font-medium">Fiscal Year</th>
                  <th className="px-3 py-2 text-left font-medium">PO / Voucher</th>
                </tr>
              </thead>
              <tbody>
                {detailsRows.map((row, idx) => (
                  <tr key={idx} className="border-t border-gray-100">
                    <td className="px-3 py-2 text-gray-800 truncate max-w-[150px]" title={row.vendor}>
                      {row.vendor}
                    </td>
                    <td className="px-3 py-2 text-gray-600 truncate max-w-[100px]" title={row.department}>
                      {row.department}
                    </td>
                    <td className="px-3 py-2 text-gray-600">{formatCurrency(row.vouchers_paid)}</td>
                    <td className="px-3 py-2 text-gray-600">{row.fiscal_year || "—"}</td>
                    <td className="px-3 py-2 text-gray-600">
                        {row.purchase_order || row.voucher || "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
        )
    }

    if (cat.includes("infrastructure")) {
        return (
            <table className="min-w-full text-xs">
              <thead className="bg-gray-50 text-gray-600">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">Request ID</th>
                  <th className="px-3 py-2 text-left font-medium">Type</th>
                  <th className="px-3 py-2 text-left font-medium">Status</th>
                  <th className="px-3 py-2 text-left font-medium">Opened</th>
                  <th className="px-3 py-2 text-left font-medium">Neighborhood</th>
                </tr>
              </thead>
              <tbody>
                {detailsRows.map((row, idx) => (
                  <tr key={idx} className="border-t border-gray-100">
                     <td className="px-3 py-2 text-gray-800">{row.service_request_id}</td>
                     <td className="px-3 py-2 text-gray-600 truncate max-w-[150px]" title={row.service_subtype || row.service_name}>
                        {row.service_subtype || row.service_name}
                     </td>
                     <td className="px-3 py-2 text-gray-600">{row.status_description}</td>
                     <td className="px-3 py-2 text-gray-600">{formatDate(row.requested_datetime)}</td>
                     <td className="px-3 py-2 text-gray-600 truncate max-w-[100px]">{row.neighborhoods_sffind_boundaries || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
        )
    }

    // Default Payroll
    let amountHeader = "Overtime"
    let amountValue = (row: AnyDetailRow) => formatCurrency(row.overtime)

    if (finding.subcategory === "Comp Time Manipulation") {
        amountHeader = "Other Salaries"
        amountValue = (row) => formatCurrency(row.other_salaries)
    } else if (finding.subcategory.includes("Pension")) {
        amountHeader = "Total Salary"
        amountValue = (row) => formatCurrency(row.total_salary)
    } else if (finding.subcategory === "Hours Feasibility" || finding.subcategory === "Impossibility Check") {
        amountHeader = "Total Salary"
        amountValue = (row) => formatCurrency(row.total_salary)
    }

    return (
        <table className="min-w-full text-xs">
          <thead className="bg-gray-50 text-gray-600">
            <tr>
              <th className="px-3 py-2 text-left font-medium">Year</th>
              <th className="px-3 py-2 text-left font-medium">Employee</th>
              <th className="px-3 py-2 text-left font-medium">Job</th>
              <th className="px-3 py-2 text-left font-medium">Hours</th>
              <th className="px-3 py-2 text-left font-medium">Weekly Avg</th>
              <th className="px-3 py-2 text-left font-medium">Base Salary</th>
              <th className="px-3 py-2 text-left font-medium">{amountHeader}</th>
            </tr>
          </thead>
          <tbody>
            {detailsRows.map((row, idx) => {
              const prev = idx > 0 ? detailsRows[idx - 1] : null
              const isFirstInGroup =
                !prev ||
                prev.year !== row.year ||
                prev.employee_identifier !== row.employee_identifier
              return (
                <tr
                  key={`${row.employee_identifier ?? "employee"}-${row.job ?? ""}-${idx}`}
                  className={cn(
                    "border-t",
                    isFirstInGroup ? "border-gray-200" : "border-gray-50"
                  )}
                >
                  <td className="px-3 py-2 text-gray-600">
                    {isFirstInGroup ? (row.year || "—") : ""}
                  </td>
                  <td className={cn("px-3 py-2", isFirstInGroup ? "text-gray-800" : "text-gray-400")}>
                    {isFirstInGroup ? (row.employee_identifier || "Unknown") : ""}
                  </td>
                  <td className="px-3 py-2 text-gray-600">{row.job || "—"}</td>
                  <td className="px-3 py-2 text-gray-600">{formatHours(row.hours)}</td>
                  <td className="px-3 py-2 text-gray-600">{formatWeeklyHours(row.hours)}</td>
                  <td className="px-3 py-2 text-gray-600">
                    {formatCurrency(row.salaries)}
                  </td>
                  <td className="px-3 py-2 text-gray-600">
                    {amountValue(row)}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
    )
  }

  return (
    <div
      className={cn(
        "border rounded-lg transition-all cursor-pointer",
        isExpanded ? "shadow-sm border-gray-300" : "border-gray-200 hover:border-gray-300",
        finding.is_partial_data && "border-l-2 border-l-amber-400"
      )}
      onClick={onToggle}
    >
      {/* Collapsed row */}
      <div className="flex items-center gap-3 px-4 py-3">
        {/* Severity badge */}
        <span
          className={cn(
            "inline-flex items-center justify-center px-2 py-0.5 rounded text-[10px] font-bold uppercase shrink-0",
            sev.bg,
            sev.text
          )}
        >
          {sev.label}
        </span>

        {/* NEW badge for Phase 6 detectors */}
        {finding.is_new && (
          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold bg-violet-100 text-violet-700 uppercase tracking-wide shrink-0">
            New
          </span>
        )}

        {/* On Roadmap badge for detectors not yet live */}
        {isOnRoadmap(finding) && (
          <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-50 text-amber-700 border border-amber-200 uppercase tracking-wide shrink-0">
            <MapIcon className="w-2.5 h-2.5" />
            Roadmap
          </span>
        )}

        {/* Metric headline */}
        <span className={cn("font-semibold text-sm whitespace-nowrap", sev.metricColor)}>
          {finding.metric}
        </span>

        {/* Metric detail */}
        <span className="text-sm text-gray-600 truncate">
          {finding.metricDetail}
        </span>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Confidence indicator (compact) */}
        <span className="hidden lg:inline-flex shrink-0" title={conf.label}>
          <ConfIcon className={cn("w-3.5 h-3.5", conf.text)} />
        </span>

        {/* Entity tag */}
        <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded whitespace-nowrap hidden sm:inline-flex">
          {finding.entity}
        </span>

        {/* Amount */}
        {finding.amount != null && finding.amount > 0 && (
          <span className="text-sm font-medium text-gray-700 whitespace-nowrap hidden md:inline">
            {formatDollar(finding.amount)}
          </span>
        )}

        {/* Chevron */}
        <ChevronDown
          className={cn(
            "w-4 h-4 text-gray-400 shrink-0 transition-transform",
            isExpanded && "rotate-180"
          )}
        />
      </div>

      {/* Expanded detail */}
      {isExpanded && (
        <div className="px-4 pb-4 pt-1 border-t border-gray-100">
          {/* Mobile entity + amount */}
          <div className="flex items-center gap-2 mb-2 sm:hidden">
            <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded">
              {finding.entity}
            </span>
            {finding.amount != null && finding.amount > 0 && (
              <span className="text-sm font-medium text-gray-700">
                {formatDollar(finding.amount)}
              </span>
            )}
          </div>

          <p className="text-sm text-gray-700 leading-relaxed mb-3">
            {finding.description}
          </p>

          {canShowDetails && (
            <div className="mb-3">
              <button
                type="button"
                onClick={handleToggleDetails}
                className="text-xs font-medium text-violet-700 hover:text-violet-800 underline"
              >
                {isDetailsOpen ? "Hide details" : "Show details"}
              </button>
              {isDetailsOpen && (
                <div className="mt-2 rounded-md border border-gray-200 bg-white overflow-x-auto">
                  {isDetailsLoading ? (
                    <p className="px-3 py-2 text-xs text-gray-500">Loading details...</p>
                  ) : detailsError ? (
                    <p className="px-3 py-2 text-xs text-red-600">{detailsError}</p>
                  ) : (
                    renderDetailsTable()
                  )}
                </div>
              )}
            </div>
          )}

          {/* Confidence badge */}
          <div className={cn(
            "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs mb-3",
            conf.bg, conf.text, "border", conf.border
          )}>
            <ConfIcon className="w-3.5 h-3.5" />
            <span className="font-medium">{conf.label}</span>
            {finding.confidence_reason && (
              <span className="text-gray-500 ml-1">— {finding.confidence_reason}</span>
            )}
          </div>

          {/* Caveat / data quality warning */}
          {finding.caveat && (
            <div className="flex items-start gap-2 mb-3 p-2 bg-amber-50 border border-amber-100 rounded-md">
              <AlertCircle className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" />
              <p className="text-xs text-amber-700">{finding.caveat}</p>
            </div>
          )}

          {/* Partial data indicator */}
          {finding.is_partial_data && !finding.caveat?.includes("partial") && (
            <div className="flex items-start gap-2 mb-3 p-2 bg-amber-50 border border-amber-100 rounded-md">
              <AlertCircle className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" />
              <p className="text-xs text-amber-700">
                Based on partial fiscal year data. Values may change when the full year is available.
              </p>
            </div>
          )}

          {/* Tool tag + Ask Seymour */}
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 text-xs text-gray-400">
              <span className="bg-gray-50 px-2 py-0.5 rounded">
                {stripRoadmapLabel(finding.tool)}
              </span>
              {isOnRoadmap(finding) && (
                <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-50 text-amber-700 border border-amber-200 uppercase tracking-wide">
                  <MapIcon className="w-2.5 h-2.5" />
                  On Roadmap
                </span>
              )}
              <span>{finding.id}</span>
              <span className="text-gray-300">
                Priority: {finding.priority_score ?? "—"}
              </span>
            </div>

            {/* Ask Seymour button */}
            <button
              onClick={handleAskSeymour}
              className={cn(
                "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium",
                "bg-violet-50 text-violet-700 border border-violet-200",
                "hover:bg-violet-100 hover:border-violet-300 transition-colors"
              )}
            >
              <Sparkles className="w-3.5 h-3.5" />
              Ask Seymour for analysis
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

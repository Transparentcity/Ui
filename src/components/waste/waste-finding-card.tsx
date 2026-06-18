"use client"

import { useEffect, useState } from "react"
import { cn } from "@/lib/utils"
import { ChevronDown, ShieldCheck, ShieldAlert, ShieldQuestion, AlertCircle, Sparkles, Map as MapIcon, Triangle, Copy, Check, History, Layers } from "lucide-react"
import { type WasteFinding, type WasteDispositionType } from "@/lib/apiClient"
import {
  formatDollar,
  escapeSoqlLike as escapeSoqlLikeShared,
  escapeSoql,
  isConfirmedFinding,
  parseContractDriftContractId,
  procurementVendorNameFromEntity,
} from "./waste-utils"
import { formatDetector, stripDetectorCodes } from "./detector-info"
import { deriveHeadline, whySuspicious } from "./waste-finding-narrator"
import { TCScoreBadge } from "./tc-score-badge"
import { ConfirmedBadge } from "./confirmed-badge"
import { QuickDisposition } from "./disposition-select"

const DOMAIN_LABELS: Record<string, string> = {
  procurement: "Contracts & Procurement",
  payroll: "Payroll & Compensation",
  infrastructure: "Infrastructure & Services",
  influence: "Influence & Pay-to-Play",
  integrity: "Personnel Integrity",
}

const DOMAIN_COLORS: Record<string, string> = {
  procurement: "bg-blue-500",
  payroll: "bg-emerald-500",
  infrastructure: "bg-amber-500",
  influence: "bg-purple-500",
  integrity: "bg-rose-500",
}

const TRIANGLE_LEG_LABELS: Record<string, { label: string; color: string }> = {
  Opportunity: { label: "Opportunity", color: "text-blue-700 bg-blue-50 border-blue-200" },
  Pressure: { label: "Pressure", color: "text-amber-700 bg-amber-50 border-amber-200" },
  Capability: { label: "Capability", color: "text-rose-700 bg-rose-50 border-rose-200" },
}

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

interface CitySocrataConfig {
  domain: string
  payrollDataset: string
  vendorDataset: string
  serviceRequestDataset: string
  neighborhoodColumn: string
  geoPointColumn: string
  districtColumn: string
  // Supplier-contracts dataset + its column names (differ by city: SF labels
  // them prime_contractor/agreed_amt/purchasing_authority, Chicago
  // vendor_name/award_amount/procurement_type). Used to drill contract-level
  // findings (sole-source, threshold clustering, emergency runaway, grants)
  // through to the actual contracts behind them.
  contractsDataset: string
  contractVendorCol: string
  contractAmountCol: string
  contractAuthorityCol: string
  contractDateCol: string
  contractDeptCol: string
  // Campaign-finance contributions, for drilling D18 Pay-to-Play through to the
  // source donations. SF = SFEC Transactions (pitq-e56w), contributions are
  // record_type='RCPT'. Empty campaignDataset disables the drill-through (e.g.
  // Chicago, whose available dataset is lobbyist contributions, not vendor
  // pay-to-play, so a contributor→contract drill would be misleading).
  campaignDataset: string
  campaignContributorCol: string
  campaignAmountCol: string
  campaignDateCol: string
  campaignRecordTypeFilter: string
}

const SF_SOCRATA: CitySocrataConfig = {
  domain: "data.sfgov.org",
  payrollDataset: "88g8-5mnd",
  vendorDataset: "n9pm-xkyq",
  serviceRequestDataset: "vw6y-z8j6",
  neighborhoodColumn: "neighborhoods_sffind_boundaries",
  geoPointColumn: "point",
  districtColumn: "supervisor_district",
  contractsDataset: "cqi5-hm2d",
  contractVendorCol: "prime_contractor",
  contractAmountCol: "agreed_amt",
  contractAuthorityCol: "purchasing_authority",
  contractDateCol: "term_start_date",
  contractDeptCol: "department",
  campaignDataset: "pitq-e56w",
  campaignContributorCol: "transaction_last_name",
  campaignAmountCol: "transaction_amount_1",
  campaignDateCol: "transaction_date",
  campaignRecordTypeFilter: "record_type = 'RCPT'",
}

const CHICAGO_SOCRATA: CitySocrataConfig = {
  domain: "data.cityofchicago.org",
  payrollDataset: "xzkq-xp2w",
  vendorDataset: "s4vu-giwb",
  serviceRequestDataset: "v6vf-nfxy",
  neighborhoodColumn: "community_area",
  geoPointColumn: "location",
  districtColumn: "ward",
  contractsDataset: "rsxa-ify5",
  contractVendorCol: "vendor_name",
  contractAmountCol: "award_amount",
  contractAuthorityCol: "procurement_type",
  contractDateCol: "start_date",
  contractDeptCol: "department",
  campaignDataset: "",
  campaignContributorCol: "",
  campaignAmountCol: "",
  campaignDateCol: "",
  campaignRecordTypeFilter: "",
}

const SF_CITY_IDS = new Set([1, 2, 56837])
const CHICAGO_CITY_IDS = new Set([3, 56838])

export function getCitySocrataConfig(cityId: number): CitySocrataConfig {
  if (CHICAGO_CITY_IDS.has(cityId)) return CHICAGO_SOCRATA
  return SF_SOCRATA
}

interface WasteFindingCardProps {
  finding: WasteFinding
  isExpanded: boolean
  onToggle: () => void
  onAskSeymour?: (finding: WasteFinding) => void
  onDispose?: (finding: WasteFinding, disposition: WasteDispositionType) => void
  onSkip?: (finding: WasteFinding) => void
  cityId?: number
  isCarriedOver?: boolean
  carriedOverAsOf?: string | null
  /**
   * Optional pool of findings used to resolve `supporting_findings` IDs on
   * consolidated/multi-signal cards so we can show each detector by name
   * along with the metric value that tripped it.
   */
  allFindings?: WasteFinding[]
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
  community_area?: string
  ward?: string
  [key: string]: string | undefined
}

type AnyDetailRow = PayrollDetailRow & VendorDetailRow & InfrastructureDetailRow

const ROADMAP_DETECTOR_NAMES = [
  "Address Clustering",
  "Fiscal Sponsor Opacity",
  "Entity Validation",
]

export function isOnRoadmap(finding: WasteFinding): boolean {
  const re = /\(On Roadmap\)/i
  if (re.test(finding.tool) || re.test(finding.subcategory)) return true
  if (/\bOn Roadmap:/i.test(finding.description)) return true

  const isConfirmed =
    finding.category?.toLowerCase() === "confirmed" ||
    finding.category?.toLowerCase().includes("confirmed") ||
    finding.id?.startsWith("CONF-")
  if (isConfirmed) {
    const detectorPart = (finding.subcategory ?? "").split(" - ").pop() ?? ""
    return ROADMAP_DETECTOR_NAMES.some((p) => detectorPart.includes(p))
  }

  return false
}

function stripRoadmapLabel(text: string): string {
  return text.replace(/\s*\(On Roadmap\)/gi, "").trim()
}

const DETAILS_LIMIT = 20
const PAYROLL_FETCH_LIMIT = 60

function socrataUrl(cfg: CitySocrataConfig, dataset: string): string {
  return `https://${cfg.domain}/resource/${dataset}.json`
}

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

export function buildSocrataDetailsUrl(finding: WasteFinding, cityId?: number): string | null {
  const cat = (finding.category ?? "").toLowerCase()
  const sub = finding.subcategory ?? ""
  const cfg = getCitySocrataConfig(cityId ?? 1)
  const PAYROLL = socrataUrl(cfg, cfg.payrollDataset)
  const VENDOR = socrataUrl(cfg, cfg.vendorDataset)
  const SVC_REQ = socrataUrl(cfg, cfg.serviceRequestDataset)

  // PAYROLL
  if (cat.includes("payroll")) {
    const dept = getDepartmentFilter(finding)
    if (!dept) return null

    const select =
      "year,employee_identifier,job,hours,salaries,overtime,other_salaries,total_salary"
    const baseWhere = `upper(department) like upper('%${dept}%') and hours > 0`

    if (sub === "Comp Time Manipulation") {
      const where = `${baseWhere} and salaries > 10000 and other_salaries > 0 and (other_salaries / salaries) > 0.30`
      return `${PAYROLL}?$select=${encodeURIComponent(select)}&$where=${encodeURIComponent(where)}&$order=${encodeURIComponent("year desc, other_salaries desc")}&$limit=${PAYROLL_FETCH_LIMIT}`
    }

    if (sub === "Hours Feasibility" || sub === "Impossibility Check") {
      return `${PAYROLL}?$select=${encodeURIComponent(select)}&$where=${encodeURIComponent(baseWhere)}&$order=${encodeURIComponent("year desc, hours desc")}&$limit=${PAYROLL_FETCH_LIMIT}`
    }

    if (
      sub === "Overtime Abuse" ||
      sub === "Department OT Outlier" ||
      sub === "Benford Anomaly" ||
      sub.includes("Overtime") ||
      (finding.tool ?? "").includes("Pareto")
    ) {
      return `${PAYROLL}?$select=${encodeURIComponent(select)}&$where=${encodeURIComponent(baseWhere)}&$order=${encodeURIComponent("year desc, overtime desc")}&$limit=${PAYROLL_FETCH_LIMIT}`
    }

    if (sub.includes("Pension Spiking")) {
      return `${PAYROLL}?$select=${encodeURIComponent(select)}&$where=${encodeURIComponent(baseWhere)}&$order=${encodeURIComponent("year desc, total_salary desc")}&$limit=${PAYROLL_FETCH_LIMIT}`
    }
  }

  // CONTRACTS (vendor/procurement)
  if (cat.includes("contract") || cat.includes("vendor")) {
    const vendorOrder = "fiscal_year DESC,vouchers_paid DESC"

    // ── Contract-level findings drill through to the supplier-contracts
    // dataset (city-aware columns), so a viewer lands on the actual contracts
    // behind the finding rather than payment vouchers. These run before the
    // payments-based handlers so D23's "Threshold Avoidance" (contracts) is not
    // confused with D12's (payments).
    const CONTRACTS = socrataUrl(cfg, cfg.contractsDataset)
    const vCol = cfg.contractVendorCol
    const aCol = cfg.contractAmountCol
    const authCol = cfg.contractAuthorityCol
    const dCol = cfg.contractDeptCol
    const cSelect = [vCol, dCol, aCol, authCol, "contract_title"].join(",")
    const amtDesc = `${aCol}::number DESC`
    const tool = finding.tool ?? ""
    // Entity formats vary by detector: D19 "vendor (dept)", D22 "vendor — label",
    // NP6 "grantee". Take the vendor as everything before the first separator.
    const vendorFromEntity = (finding.entity || "").split(/ \(| — /)[0].trim()

    // D23 — contracts clustered just under a round approval ceiling.
    if (tool.includes("Threshold Clustering")) {
      const m = `${finding.metric} ${finding.metricDetail ?? ""}`.match(
        /\$(\d+(?:\.\d+)?)\s*([MK])/i
      )
      if (m) {
        const unit = m[2].toUpperCase() === "M" ? 1_000_000 : 1_000
        const ceiling = Math.round(parseFloat(m[1]) * unit)
        const low = Math.round(ceiling * 0.95)
        const where = `${aCol}::number >= ${low} AND ${aCol}::number < ${ceiling}`
        return `${CONTRACTS}?$select=${encodeURIComponent(cSelect)}&$where=${encodeURIComponent(where)}&$order=${encodeURIComponent(amtDesc)}&$limit=${DETAILS_LIMIT}`
      }
    }

    // D19 — sole-source / no-bid contracts for this vendor.
    if (sub === "Sole Source Abuse" && vendorFromEntity) {
      const v = escapeSoqlLike(vendorFromEntity)
      const where = `upper(${vCol}) like upper('%${v}%')`
      return `${CONTRACTS}?$select=${encodeURIComponent(cSelect)}&$where=${encodeURIComponent(where)}&$order=${encodeURIComponent(amtDesc)}&$limit=${DETAILS_LIMIT}`
    }

    // D22 — emergency contract(s) for this vendor (SF also carries the spend).
    if (sub === "Emergency Contract Runaway" && vendorFromEntity) {
      const v = escapeSoqlLike(vendorFromEntity)
      const extra = cfg.contractsDataset === "cqi5-hm2d" ? ",consumed_amt,pmt_amt" : ""
      const where = `upper(${vCol}) like upper('%${v}%')`
      return `${CONTRACTS}?$select=${encodeURIComponent(cSelect + extra)}&$where=${encodeURIComponent(where)}&$order=${encodeURIComponent(amtDesc)}&$limit=${DETAILS_LIMIT}`
    }

    // NP6 — grant lines for this grantee, newest first, across departments.
    if (sub === "Grant Concentration" && vendorFromEntity) {
      const v = escapeSoqlLike(vendorFromEntity)
      const where = `upper(${vCol}) like upper('%${v}%')`
      const gSelect = [vCol, dCol, aCol, "contract_title", cfg.contractDateCol].join(",")
      return `${CONTRACTS}?$select=${encodeURIComponent(gSelect)}&$where=${encodeURIComponent(where)}&$order=${encodeURIComponent(`${cfg.contractDateCol} DESC`)}&$limit=${DETAILS_LIMIT}`
    }

    if (sub === "Contract Drift") {
      const contractIdRaw = parseContractDriftContractId(finding.description ?? "")
      if (!contractIdRaw) return null
      const contractId = escapeSoql(contractIdRaw)
      const select =
        "vendor,department,vouchers_paid,voucher,purchase_order,fiscal_year,contract_number"
      const where = `contract_number = '${contractId}'`
      return `${VENDOR}?$select=${encodeURIComponent(select)}&$where=${encodeURIComponent(where)}&$order=${encodeURIComponent(vendorOrder)}&$limit=${DETAILS_LIMIT}`
    }

    const select = "vendor,department,vouchers_paid,voucher,purchase_order,fiscal_year"
    const vendorName = escapeSoql(procurementVendorNameFromEntity(finding.entity || ""))

    if (sub === "Duplicate Payments" && finding.amount) {
      let whereClause = `vendor = '${vendorName}'`
      const amountMatch = finding.metricDetail?.match(/of \$([0-9,.]+) each/)
      if (amountMatch) {
          const amount = amountMatch[1].replace(/,/g, "")
          whereClause += ` AND vouchers_paid = ${amount}`
      }
      return `${VENDOR}?$select=${encodeURIComponent(select)}&$where=${encodeURIComponent(whereClause)}&$order=${encodeURIComponent(vendorOrder)}&$limit=${DETAILS_LIMIT}`
    }

    if (sub === "Unregistered Vendor" || sub === "Ghost Vendor") {
       return `${VENDOR}?$select=${encodeURIComponent(select)}&$where=${encodeURIComponent(`vendor = '${vendorName}'`)}&$order=${encodeURIComponent(vendorOrder)}&$limit=${DETAILS_LIMIT}`
    }
    
    if (sub === "Misdirected Payment") {
        const poMatch = (finding.entity ?? "").match(/PO\s+(.+)/)
        if (poMatch) {
            const po = escapeSoqlLike(poMatch[1])
            let whereClause = `purchase_order = '${po}'`

            const amountMatch = finding.metricDetail?.match(/paid identical \$([0-9,.]+)/)
            if (amountMatch) {
                const amount = amountMatch[1].replace(/,/g, "")
                whereClause += ` AND vouchers_paid = ${amount}`
            }

            return `${VENDOR}?$select=${encodeURIComponent(select)}&$where=${encodeURIComponent(whereClause)}&$order=${encodeURIComponent(vendorOrder)}&$limit=${DETAILS_LIMIT}`
        }
    }

    if (sub === "Statistical Anomaly") {
        const dept = escapeSoqlLike(finding.entity || "")
        return `${VENDOR}?$select=${encodeURIComponent(select)}&$where=${encodeURIComponent(`department = '${dept}'`)}&$order=${encodeURIComponent(vendorOrder)}&$limit=${DETAILS_LIMIT}`
    }

    if (sub === "Threshold Avoidance") {
        const dept = escapeSoqlLike((finding.entity || "").split(" (Limit")[0].trim())
        if (!dept) return null
        const rangeMatch = finding.metricDetail?.match(/Range \$([0-9,.]+)-\$([0-9,.]+)/)
        if (rangeMatch) {
            const low = rangeMatch[1].replace(/,/g, "")
            const high = rangeMatch[2].replace(/,/g, "")
            const where = `department = '${dept}' AND vouchers_paid >= ${low} AND vouchers_paid <= ${high}`
            return `${VENDOR}?$select=${encodeURIComponent(select)}&$where=${encodeURIComponent(where)}&$order=${encodeURIComponent(vendorOrder)}&$limit=${DETAILS_LIMIT}`
        }
        return `${VENDOR}?$select=${encodeURIComponent(select)}&$where=${encodeURIComponent(`department = '${dept}'`)}&$order=${encodeURIComponent(vendorOrder)}&$limit=${DETAILS_LIMIT}`
    }

    // Default vendor fallback
    return `${VENDOR}?$select=${encodeURIComponent(select)}&$where=${encodeURIComponent(`vendor = '${vendorName}'`)}&$order=${encodeURIComponent(vendorOrder)}&$limit=${DETAILS_LIMIT}`
  }

  // INFRASTRUCTURE
  if (cat.includes("infrastructure")) {
    const nCol = cfg.neighborhoodColumn
    const select = `service_request_id,service_name,service_subtype,status_description,requested_datetime,closed_date,${nCol}`
    
    if (sub === "Infrastructure Cluster") {
      const keywordFilter = buildInfraKeywordFilter()
      const cutoff = new Date()
      cutoff.setDate(cutoff.getDate() - 90)
      const cutoffIso = cutoff.toISOString().split("T")[0]
      const dateFilter = `requested_datetime >= '${cutoffIso}T00:00:00.000'`

      const coords = extractCoordsFromDescription(finding.description ?? "")
      if (coords) {
        const [lat, lon] = coords
        const where = `within_circle(${cfg.geoPointColumn}, ${lat}, ${lon}, 500) and ${keywordFilter} and ${dateFilter}`
        return `${SVC_REQ}?$select=${encodeURIComponent(select)}&$where=${encodeURIComponent(where)}&$order=requested_datetime DESC&$limit=${DETAILS_LIMIT}`
      }
      const neighborhood = escapeSoqlLike(finding.entity || "")
      const where = `${nCol} = '${neighborhood}' and ${keywordFilter} and ${dateFilter}`
      return `${SVC_REQ}?$select=${encodeURIComponent(select)}&$where=${encodeURIComponent(where)}&$order=requested_datetime DESC&$limit=${DETAILS_LIMIT}`
    }
    
    if (sub === "Response Time Deterioration") {
        const agency = escapeSoqlLike(finding.entity || "")
        return `${SVC_REQ}?$select=${encodeURIComponent(select)}&$where=${encodeURIComponent(`agency_responsible = '${agency}'`)}&$order=requested_datetime DESC&$limit=${DETAILS_LIMIT}`
    }

    if (sub === "District Equity Gap") {
        const distMatch = (finding.entity ?? "").match(/District\s+(\d+)/)
        if (distMatch) {
            const dist = distMatch[1]
             return `${SVC_REQ}?$select=${encodeURIComponent(select)}&$where=${encodeURIComponent(`${cfg.districtColumn} = '${dist}'`)}&$order=requested_datetime DESC&$limit=${DETAILS_LIMIT}`
        }
    }
  }

  // INFLUENCE (D18 Pay-to-Play, D17 Lobbyist) — drill to the source campaign
  // contributions so an investigator can see the actual donations behind the
  // finding. Only where a usable contributions dataset exists (SF).
  if (cat.includes("influence")) {
    if (!cfg.campaignDataset) return null
    const CAMPAIGN = socrataUrl(cfg, cfg.campaignDataset)
    // Entity is the contributor/vendor; drop any "→ committee" / "(label)" tail.
    const contributor = escapeSoqlLike(
      (finding.entity || "").split(/ \(| — | → | -> /)[0].trim()
    )
    if (!contributor) return null
    const select = [
      cfg.campaignContributorCol,
      cfg.campaignAmountCol,
      cfg.campaignDateCol,
      "filer_name",
    ].join(",")
    const where = [
      cfg.campaignRecordTypeFilter,
      `upper(${cfg.campaignContributorCol}) like '%${contributor.toUpperCase()}%'`,
    ]
      .filter(Boolean)
      .join(" AND ")
    const order = `${cfg.campaignDateCol} DESC, ${cfg.campaignAmountCol} DESC`
    return `${CAMPAIGN}?$select=${encodeURIComponent(select)}&$where=${encodeURIComponent(where)}&$order=${encodeURIComponent(order)}&$limit=${DETAILS_LIMIT}`
  }

  return null
}

/**
 * Renders the per-detector breakdown for a consolidated/multi-signal finding.
 * Shows each triggering detector's full name and the metric value that
 * tripped it (i.e. what threshold was hit).
 */
function DetectorsTriggeredPanel({
  parent,
  supportingIds,
  allFindings,
}: {
  parent: WasteFinding
  supportingIds: string[]
  allFindings?: WasteFinding[]
}) {
  // Resolve children from the parent dataset when available.
  const idSet = new Set(supportingIds)
  const children = (allFindings ?? []).filter((f) => idSet.has(f.id))

  // De-dupe by detector tool, keeping the most informative child per detector.
  const byDetector = new Map<string, WasteFinding>()
  for (const c of children) {
    const key = (c.tool ?? "Unknown").trim()
    const prev = byDetector.get(key)
    if (!prev || (c.priority_score ?? 0) > (prev.priority_score ?? 0)) {
      byDetector.set(key, c)
    }
  }
  const detectorRows = Array.from(byDetector.values())

  // Fallback: parse codes out of the parent's metricDetail when we couldn't
  // resolve the children (e.g. card rendered outside the full list context).
  const fallbackCodes = (() => {
    if (detectorRows.length > 0) return null
    const m = (parent.metricDetail ?? "").match(/\(([^)]+)\)/)
    if (!m) return null
    return m[1].split(",").map((s) => s.trim()).filter(Boolean)
  })()

  return (
    <div className="mb-3 p-3 bg-indigo-50/60 border border-indigo-100 rounded-md">
      <div className="flex items-center gap-1.5 mb-2">
        <Layers className="w-3.5 h-3.5 text-indigo-600" />
        <span className="text-xs font-semibold text-indigo-900">
          Detectors triggered ({detectorRows.length || supportingIds.length})
        </span>
      </div>

      {detectorRows.length > 0 ? (
        <ul className="space-y-1.5">
          {detectorRows.map((c) => {
            const detail = [c.metric, c.metricDetail]
              .filter(Boolean)
              .join(" ")
              .trim()
            return (
              <li key={c.id} className="text-[11px] leading-snug">
                <span className="font-medium text-indigo-900">
                  {c.tool || "Detector"}
                </span>
                {detail && (
                  <span className="text-indigo-700"> — {detail}</span>
                )}
                {c.amount != null && c.amount > 0 && (
                  <span className="ml-1 text-indigo-700 tabular-nums">
                    ({formatDollar(c.amount)})
                  </span>
                )}
              </li>
            )
          })}
        </ul>
      ) : fallbackCodes && fallbackCodes.length > 0 ? (
        <ul className="space-y-1">
          {fallbackCodes.map((code) => {
            const expanded = formatDetector(code, parent.category)
            return (
              <li
                key={code}
                className="text-[11px] leading-snug text-indigo-900"
              >
                <span className="font-medium">{expanded}</span>
              </li>
            )
          })}
          <li className="text-[11px] text-indigo-500 mt-1">
            Open the parent finding from the list view to see each
            detector&rsquo;s metric value.
          </li>
        </ul>
      ) : (
        <p className="text-[11px] text-indigo-700 leading-relaxed font-mono">
          {supportingIds.slice(0, 8).join(", ")}
          {supportingIds.length > 8 && ` +${supportingIds.length - 8} more`}
        </p>
      )}
    </div>
  )
}

function ConvergenceDetail({ finding }: { finding: WasteFinding }) {
  const cd = finding.convergence_details
  if (!cd) return null

  const domainEntries = Object.entries(cd.domain_risks ?? {}).sort(
    ([, a], [, b]) => (b as number) - (a as number)
  )
  const allLegs = ["Opportunity", "Pressure", "Capability"]

  return (
    <div className="space-y-4">
      {/* Composite score header */}
      <div className="flex items-center gap-4">
        <TCScoreBadge score={cd.composite_risk ?? 0} size="lg" showLabel />
        <div className="text-xs text-gray-500">
          {cd.domains_flagged} domains flagged
          <span className="mx-1.5 text-gray-300">|</span>
          {cd.convergence_multiplier}x convergence multiplier
          <span className="mx-1.5 text-gray-300">|</span>
          {cd.finding_count} underlying findings
        </div>
      </div>

      {/* Domain risk bars */}
      <div className="space-y-2">
        <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Risk by Domain</span>
        {domainEntries.map(([domain, score]) => (
          <div key={domain} className="flex items-center gap-3">
            <span className="text-xs text-gray-600 w-44 shrink-0">
              {DOMAIN_LABELS[domain] ?? domain}
            </span>
            <div className="flex-1 h-2.5 bg-gray-100 rounded-full overflow-hidden">
              <div
                className={cn("h-full rounded-full transition-all", DOMAIN_COLORS[domain] ?? "bg-gray-400")}
                style={{ width: `${Math.min(score as number, 100)}%` }}
              />
            </div>
            <span className="text-xs font-medium text-gray-700 w-8 text-right">
              {Math.round(score as number)}
            </span>
          </div>
        ))}
      </div>

      {/* Fraud Triangle */}
      {(cd.triangle_legs_present?.length ?? 0) > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Triangle className="w-3.5 h-3.5 text-gray-500" />
            <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">
              Fraud Triangle ({cd.triangle_legs_present?.length ?? 0}/3)
            </span>
          </div>
          <div className="flex gap-2">
            {allLegs.map((leg) => {
              const active = (cd.triangle_legs ?? []).includes(leg)
              const cfg = TRIANGLE_LEG_LABELS[leg]
              return (
                <span
                  key={leg}
                  className={cn(
                    "inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium border",
                    active
                      ? cfg?.color
                      : "text-gray-500 bg-gray-50 border-gray-200"
                  )}
                >
                  {cfg?.label ?? leg}
                </span>
              )
            })}
          </div>
          {(cd.triangle_legs_present?.length ?? 0) === 3 && (
            <p className="text-xs text-red-600 font-medium">
              All three legs present — conditions favorable for fraud.
            </p>
          )}
        </div>
      )}
    </div>
  )
}

function CopyCaseStudyButton({ finding }: { finding: WasteFinding }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation()
    const parts: string[] = []
    parts.push(deriveHeadline(finding))
    if (finding.amount) parts.push(`Amount at risk: ${formatDollar(finding.amount)}`)
    parts.push("")
    parts.push(finding.description)
    if (finding.fiscal_year) parts.push(`\nFiscal Year: ${finding.fiscal_year}`)
    parts.push(`Severity: ${finding.severity} | Confidence: ${finding.confidence ?? "N/A"}`)
    parts.push(`Detector: ${finding.tool}`)

    navigator.clipboard.writeText(parts.join("\n")).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  return (
    <button
      onClick={handleCopy}
      className={cn(
        "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors",
        copied
          ? "bg-green-50 text-green-700 border border-green-200"
          : "bg-gray-50 text-gray-600 border border-gray-200 hover:bg-gray-100"
      )}
    >
      {copied ? (
        <><Check className="w-3.5 h-3.5" /> Copied</>
      ) : (
        <><Copy className="w-3.5 h-3.5" /> Copy Case Study</>
      )}
    </button>
  )
}

// ---------------------------------------------------------------------------
// Source-query transparency: turn the Socrata REST URL the drill-through
// fetches into the human-readable SoQL behind it, so anyone can see exactly
// which records produced a finding (not just follow an opaque link).
// ---------------------------------------------------------------------------

interface SocrataQueryParts {
  domain: string
  dataset: string
  select: string
  where: string
  order: string
  limit: string
}

export function humanizeSocrataQuery(url: string): SocrataQueryParts | null {
  try {
    const u = new URL(url)
    // URLSearchParams.get already percent-decodes, so the clauses come back
    // in their readable form (e.g. "agreed_amt >= 100000").
    const p = u.searchParams
    const dsMatch = u.pathname.match(/\/resource\/([^/.]+)\.json/)
    return {
      domain: u.hostname,
      dataset: dsMatch ? dsMatch[1] : "",
      select: p.get("$select") ?? "*",
      where: p.get("$where") ?? "",
      order: p.get("$order") ?? "",
      limit: p.get("$limit") ?? "",
    }
  } catch {
    return null
  }
}

export function formatSoql(q: SocrataQueryParts): string {
  const lines = [`SELECT ${q.select}`]
  lines.push(`FROM ${q.dataset}${q.domain ? ` (${q.domain})` : ""}`)
  if (q.where) lines.push(`WHERE ${q.where}`)
  if (q.order) lines.push(`ORDER BY ${q.order}`)
  if (q.limit) lines.push(`LIMIT ${q.limit}`)
  return lines.join("\n")
}

function SourceQueryPanel({ url }: { url: string }) {
  const [copied, setCopied] = useState(false)
  const q = humanizeSocrataQuery(url)
  if (!q) return null
  const soql = formatSoql(q)

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation()
    navigator.clipboard.writeText(soql).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  return (
    <div className="border-t border-gray-100 bg-gray-50 px-3 py-2">
      <div className="flex items-center justify-between mb-1 gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">
          Source query · Socrata SoQL
        </span>
        <div className="flex items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={handleCopy}
            className="inline-flex items-center gap-1 text-[11px] font-medium text-violet-700 hover:text-violet-800"
          >
            {copied ? (
              <><Check className="w-3 h-3" /> Copied</>
            ) : (
              <><Copy className="w-3 h-3" /> Copy</>
            )}
          </button>
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="inline-flex items-center gap-1 text-[11px] font-medium text-violet-700 hover:text-violet-800 underline"
          >
            View raw JSON ↗
          </a>
        </div>
      </div>
      <pre className="text-[11px] leading-relaxed text-gray-700 whitespace-pre-wrap break-words font-mono m-0">
        {soql}
      </pre>
    </div>
  )
}

export function WasteFindingCard({
  finding,
  isExpanded,
  onToggle,
  onAskSeymour,
  onDispose,
  onSkip,
  cityId,
  isCarriedOver = false,
  carriedOverAsOf = null,
  allFindings,
}: WasteFindingCardProps) {
  const sevKey = (finding.severity?.toLowerCase() ?? "medium") as keyof typeof severityConfig
  const sev = severityConfig[sevKey] ?? severityConfig.medium
  const confKey = ((finding.confidence ?? "medium").toLowerCase()) as keyof typeof confidenceConfig
  const conf = confidenceConfig[confKey] ?? confidenceConfig.medium
  const ConfIcon = conf.icon
  const isConvergence = finding.category?.toLowerCase().includes("convergence")
  const headline = deriveHeadline(finding)
  const triangleLegsRaw = finding.convergence_details?.triangle_legs_present
  const triangleLegsPresent = Array.isArray(triangleLegsRaw)
    ? triangleLegsRaw.length
    : typeof triangleLegsRaw === "number"
      ? triangleLegsRaw
      : 0
  const supportingCount = finding.supporting_findings?.length ?? 0
  const carriedOverTitle = carriedOverAsOf
    ? `Carried over from an earlier run (${new Date(carriedOverAsOf).toLocaleDateString()}) — latest detector run errored for this category.`
    : "Carried over from an earlier run — latest detector run errored for this category."
  const [isDetailsOpen, setIsDetailsOpen] = useState(false)
  const [isDetailsLoading, setIsDetailsLoading] = useState(false)
  const [detailsError, setDetailsError] = useState<string | null>(null)
  const [detailsRows, setDetailsRows] = useState<AnyDetailRow[] | null>(null)
  const [detailsProvenEmpty, setDetailsProvenEmpty] = useState(false)

  useEffect(() => {
    setDetailsProvenEmpty(false)
    setDetailsRows(null)
    setDetailsError(null)
    setIsDetailsOpen(false)
  }, [finding.id])

  const handleAskSeymour = (e: React.MouseEvent) => {
    e.stopPropagation()
    onAskSeymour?.(finding)
  }

  const detailsUrl = buildSocrataDetailsUrl(finding, cityId)
  const canShowDetails = Boolean(detailsUrl) && !detailsProvenEmpty

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
      if ((finding.category ?? "").toLowerCase().includes("payroll")) {
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
      if (rows.length === 0) {
        setDetailsProvenEmpty(true)
        setIsDetailsOpen(false)
      }
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

    const cat = (finding.category ?? "").toLowerCase()

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
                     <td className="px-3 py-2 text-gray-600 truncate max-w-[100px]">{row.neighborhoods_sffind_boundaries || row.community_area || row.ward || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
        )
    }

    if (cat.includes("influence")) {
        return (
            <table className="min-w-full text-xs">
              <thead className="bg-gray-50 text-gray-600">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">Contributor</th>
                  <th className="px-3 py-2 text-left font-medium">Amount</th>
                  <th className="px-3 py-2 text-left font-medium">Date</th>
                  <th className="px-3 py-2 text-left font-medium">Recipient committee</th>
                </tr>
              </thead>
              <tbody>
                {detailsRows.map((row, idx) => (
                  <tr key={idx} className="border-t border-gray-100">
                     <td className="px-3 py-2 text-gray-800 truncate max-w-[160px]" title={row.transaction_last_name}>
                        {row.transaction_last_name || "—"}
                     </td>
                     <td className="px-3 py-2 text-gray-600">{formatCurrency(row.transaction_amount_1)}</td>
                     <td className="px-3 py-2 text-gray-600">{formatDate(row.transaction_date)}</td>
                     <td className="px-3 py-2 text-gray-600 truncate max-w-[160px]" title={row.filer_name}>
                        {row.filer_name || "—"}
                     </td>
                  </tr>
                ))}
              </tbody>
            </table>
        )
    }

    // Default Payroll
    let amountHeader = "Overtime"
    let amountValue = (row: AnyDetailRow) => formatCurrency(row.overtime)

    const sub = finding.subcategory ?? ""
    if (sub === "Comp Time Manipulation") {
        amountHeader = "Other Salaries"
        amountValue = (row) => formatCurrency(row.other_salaries)
    } else if (sub.includes("Pension")) {
        amountHeader = "Total Salary"
        amountValue = (row) => formatCurrency(row.total_salary)
    } else if (sub === "Hours Feasibility" || sub === "Impossibility Check") {
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
                  <td className={cn("px-3 py-2", isFirstInGroup ? "text-gray-800" : "text-gray-500")}>
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
        "border rounded-lg transition-all cursor-pointer focus-visible:ring-2 focus-visible:ring-purple-500 focus-visible:ring-offset-1 outline-none",
        isExpanded ? "shadow-sm border-gray-300" : "border-gray-200 hover:border-gray-300",
        finding.is_partial_data && "border-l-2 border-l-amber-400"
      )}
      role="button"
      tabIndex={0}
      aria-expanded={isExpanded}
      onClick={onToggle}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault()
          onToggle()
        }
      }}
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

        {/* Confirmed badge — previously verified case, not a newly surfaced finding */}
        {isConfirmedFinding(finding) && <ConfirmedBadge variant="stamp" />}

        {/* NEW badge for Phase 6 detectors */}
        {finding.is_new && !isConfirmedFinding(finding) && (
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

        {/* Signal tier badge */}
        {finding.signal_tier === "primary" && (
          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold bg-red-50 text-red-700 border border-red-200 uppercase tracking-wide shrink-0">
            Primary
          </span>
        )}

        {/* Earlier-run fallback badge: surfaced when detectors timed out and merged data came from a prior run */}
        {isCarriedOver && (
          <span
            className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-bold bg-purple-50 text-purple-700 border border-purple-200 uppercase tracking-wide shrink-0"
            title={carriedOverTitle}
          >
            <History className="w-2.5 h-2.5" />
            Earlier run
          </span>
        )}

        {/* Fraud triangle coverage — visible on collapsed row so reviewers see convergence at a glance */}
        {triangleLegsPresent > 0 && (
          <span
            className={cn(
              "hidden md:inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wide shrink-0 border",
              triangleLegsPresent >= 3
                ? "bg-red-50 text-red-700 border-red-200"
                : "bg-slate-50 text-slate-700 border-slate-200"
            )}
            title={`Fraud triangle: ${triangleLegsPresent} of 3 legs present`}
          >
            <Triangle className="w-2.5 h-2.5" />
            {triangleLegsPresent}/3
          </span>
        )}

        {/* Supporting findings count — signals this is a consolidated/multi-signal finding */}
        {supportingCount > 0 && (
          <span
            className="hidden md:inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200 uppercase tracking-wide shrink-0"
            title={`Consolidated from ${supportingCount} related finding${supportingCount !== 1 ? "s" : ""}`}
          >
            <Layers className="w-2.5 h-2.5" />
            +{supportingCount}
          </span>
        )}

        {/* Plain-English headline, generated client-side (waste-finding-narrator)
            so the at-a-glance hook reads clearly for a non-expert. */}
        <span className="text-sm text-gray-800 font-medium truncate">
          {stripDetectorCodes(headline)}
        </span>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Confidence indicator (compact) — hidden for convergence */}
        {isConvergence ? null : (
          <span className="hidden lg:inline-flex shrink-0" title={conf.label}>
            <ConfIcon className={cn("w-3.5 h-3.5", conf.text)} aria-label={conf.label} />
          </span>
        )}

        {/* Entity tag */}
        <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded truncate max-w-[120px] sm:max-w-none sm:whitespace-nowrap inline-flex">
          {finding.entity}
        </span>

        {/* Fiscal year */}
        {finding.fiscal_year && (
          <span className="text-[10px] text-gray-500 whitespace-nowrap hidden sm:inline">
            FY{finding.fiscal_year}
          </span>
        )}

        {/* Amount */}
        {finding.amount != null && finding.amount > 0 && (
          <span className="text-sm font-medium text-gray-700 whitespace-nowrap hidden md:inline-flex items-center gap-1">
            {formatDollar(finding.amount)}
            {finding.capApplied != null && finding.capApplied > 0 && (
              <span
                className="text-[10px] font-medium text-amber-700 bg-amber-50 border border-amber-200 px-1 rounded"
                title={`Section totals use a $${(finding.capApplied / 1e6).toFixed(0)}M cap; this finding's real exposure is ${formatDollar(finding.amount)}.`}
              >
                capped
              </span>
            )}
          </span>
        )}

        {/* Chevron */}
        <ChevronDown
          className={cn(
            "w-4 h-4 text-gray-500 shrink-0 transition-transform",
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

          {isConvergence ? (
            <div className="mb-3">
              <ConvergenceDetail finding={finding} />
            </div>
          ) : (
            <div className="mb-3">
              <p className="text-sm font-semibold text-gray-900 leading-relaxed mb-1">
                {stripDetectorCodes(headline)}
              </p>
              {whySuspicious(finding) && (
                <p className="flex items-start gap-1.5 text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded px-2 py-1 mb-2">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" aria-hidden="true" />
                  <span><span className="font-medium">Why this is suspicious:</span> {whySuspicious(finding)}</span>
                </p>
              )}
              <p className="text-sm text-gray-700 leading-relaxed">
                {stripDetectorCodes(finding.description)}
              </p>
            </div>
          )}

          {canShowDetails && (
            <div className="mb-3">
              <button
                type="button"
                onClick={handleToggleDetails}
                aria-expanded={isDetailsOpen}
                className="text-xs font-medium text-violet-700 hover:text-violet-800 underline"
              >
                {isDetailsOpen ? "Hide details" : "Show details"}
              </button>
              {isDetailsOpen && (
                <div className="mt-2 rounded-md border border-gray-200 bg-white overflow-x-auto">
                  {isDetailsLoading ? (
                    <p className="px-3 py-2 text-xs text-gray-500">Loading details...</p>
                  ) : detailsError ? (
                    <div className="px-3 py-2 flex items-center gap-2">
                      <p className="text-xs text-red-600">{detailsError}</p>
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); loadDetails() }}
                        className="text-xs font-medium text-violet-700 hover:text-violet-800 underline shrink-0"
                      >
                        Retry
                      </button>
                    </div>
                  ) : (
                    renderDetailsTable()
                  )}
                  {/* The exact SoQL behind this drill-through — transparency
                      so a reader (or auditor) can see and re-run the query. */}
                  {detailsUrl && !isDetailsLoading && !detailsError && (
                    <SourceQueryPanel url={detailsUrl} />
                  )}
                </div>
              )}
            </div>
          )}

          {/* Confidence badge — hidden for convergence meta-findings */}
          {!isConvergence && (
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
          )}

          {/* Consolidated / supporting findings list */}
          {supportingCount > 0 && finding.supporting_findings && (
            <DetectorsTriggeredPanel
              parent={finding}
              supportingIds={finding.supporting_findings}
              allFindings={allFindings}
            />
          )}

          {/* Carried-over banner (expanded detail) */}
          {isCarriedOver && (
            <div className="flex items-start gap-2 mb-3 p-2 bg-purple-50 border border-purple-100 rounded-md">
              <History className="w-3.5 h-3.5 text-purple-500 shrink-0 mt-0.5" />
              <p className="text-xs text-purple-700">{carriedOverTitle}</p>
            </div>
          )}

          {/* Cap notice — explains why section totals differ from the
              real exposure shown on this card. Backend no longer buries
              the cap in finding.caveat; it's a structured field now. */}
          {finding.capApplied != null && finding.capApplied > 0 && finding.amount != null && finding.amount > finding.capApplied && (
            <div className="flex items-start gap-2 mb-3 p-2 bg-amber-50 border border-amber-100 rounded-md">
              <AlertCircle className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" />
              <p className="text-xs text-amber-700">
                This finding's real exposure is <strong>{formatDollar(finding.amount)}</strong>. Section totals use a ${(finding.capApplied / 1e6).toFixed(0)}M per-finding cap so one wide-net finding can't dominate the rollup.
              </p>
            </div>
          )}

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

          {/* Quick disposition: Flag / Dismiss / Skip */}
          {onDispose && (
            <QuickDisposition
              onDispose={(disposition) => onDispose(finding, disposition)}
              onSkip={onSkip ? () => onSkip(finding) : undefined}
              className="mb-3"
            />
          )}

          {/* Tool tag + Ask Seymour */}
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 text-xs text-gray-500">
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
              {finding.fiscal_year && (
                <span className="text-gray-500">
                  FY{finding.fiscal_year}
                </span>
              )}
              <span className="text-gray-300">
                Priority: {finding.priority_score ?? "—"}
              </span>
            </div>

            <div className="flex items-center gap-2">
              {/* Copy Case Study */}
              <CopyCaseStudyButton finding={finding} />

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
        </div>
      )}
    </div>
  )
}

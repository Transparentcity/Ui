"use client"

import { useState } from "react"
import { ChevronDown, Database, Cpu, Sparkles, Map, Circle, CheckCircle2 } from "lucide-react"
import { cn } from "@/lib/utils"

export interface RoadmapStep {
  label: string
  done?: boolean
}

export interface DetectorInfo {
  id: string
  name: string
  description: string
  isNew?: boolean
  isOnRoadmap?: boolean
  roadmapSteps?: RoadmapStep[]
}

export interface DetectorGroup {
  category: string
  label: string
  detectors: DetectorInfo[]
}

export interface DatasetInfo {
  id: string
  socrataId: string
  name: string
  description: string
  isNew?: boolean
}

export const DETECTOR_GROUPS: DetectorGroup[] = [
  {
    category: "payroll",
    label: "Payroll & Compensation",
    detectors: [
      {
        id: "D1",
        name: "OT-to-Base Ratio",
        description:
          "Flags employees whose overtime exceeds 50% or 100% of base salary — a strong indicator of time-sheet abuse or poor workforce planning.",
      },
      {
        id: "D2",
        name: "Pareto Concentration",
        description:
          "Uses the 80/20 rule to find departments where a small percentage of employees consume a disproportionate share of the overtime budget.",
      },
      {
        id: "D3",
        name: "YoY Compensation Spike",
        description:
          "Detects year-over-year compensation spikes that may signal pension spiking — artificially inflating final-year pay to boost retirement benefits.",
      },
      {
        id: "D4",
        name: "Department OT Outlier (Z-Score)",
        description:
          "Calculates Z-scores for overtime by department, flagging statistical outliers more than 3 standard deviations from the mean.",
      },
      {
        id: "D5",
        name: "Benford's Law (Overtime)",
        description:
          "Tests leading-digit distribution of overtime amounts against Benford's Law expected frequencies. Deviations suggest fabricated or manipulated figures.",
      },
      {
        id: "D6",
        name: "Hours Feasibility",
        description:
          "Identifies impossible hours (e.g. >3,000 annual hours) that could indicate ghost employees or time-sheet fraud.",
      },
      {
        id: "D7",
        name: "Comp Time Manipulation",
        description:
          "Flags employees with unusually large compensatory-time cashouts at separation, a common vector for payroll fraud.",
      },
    ],
  },
  {
    category: "vendor",
    label: "Vendor & Procurement",
    detectors: [
      {
        id: "D1",
        name: "SSS Duplicate Payments",
        description:
          "Same-Same-Same detection: identical payment amounts to the same vendor on the same date across different vouchers — a standard forensic test for duplicate billing.",
      },
      {
        id: "D2",
        name: "SSD Misdirected Payments",
        description:
          "Same-Same-Different detection: a single PO paying identical amounts to multiple different vendors, a strong indicator of invoice fraud.",
      },
      {
        id: "D3",
        name: "Benford (Chi-Square Suite)",
        description:
          "Analyzes leading-digit distribution of vendor payment amounts. Statistically significant deviations flag potential fabricated or structured invoices.",
      },
      {
        id: "D4",
        name: "Relative Size Factor Outliers",
        description:
          "Identifies payments that are unusually large relative to a vendor's historical transaction pattern.",
      },
      {
        id: "D5",
        name: "Round Number Payments",
        description:
          "Flags suspiciously round-number payments that deviate from typical invoicing patterns, which can indicate fabricated amounts.",
      },
      {
        id: "D6",
        name: "Vendor Concentration",
        description:
          "Measures vendor concentration within departments to identify over-reliance on a single supplier, increasing corruption risk.",
      },
      {
        id: "D7",
        name: "Cross-Department Price Disparity",
        description:
          "Compares prices paid by different departments for similar goods/services, flagging significant price variances.",
      },
      {
        id: "D7b",
        name: "Commodity Price Disparity",
        description:
          "Analyzes commodity-level and line-item price disparity across purchasing records to find overpayment patterns.",
      },
      {
        id: "D8",
        name: "Split Purchase Orders",
        description:
          "Detects multiple payments to the same vendor on the same day that sum to just above the manager approval threshold — suggesting threshold avoidance.",
      },
      {
        id: "D9",
        name: "Ghost Vendors",
        description:
          "Cross-references vendor payments against the Registered Business Locations database. Vendors receiving >$50K with no business license are flagged.",
      },
      {
        id: "D10",
        name: "Contract Drift",
        description:
          "Identifies payments that exceed the original contract cap, flagging potential unauthorized scope creep or budget overruns.",
      },
      {
        id: "D11",
        name: "Short Bid Window",
        description:
          "Flags bid opportunities posted with unusually short windows, potentially designed to favor a pre-selected vendor.",
      },
      {
        id: "D12",
        name: "Adaptive Threshold Avoidance",
        description:
          "Uses adaptive thresholds to detect payment structuring patterns that evolve to stay just below changing approval limits.",
      },
      {
        id: "D13",
        name: "Residential / Mail-Drop Vendors",
        description:
          "Flags vendors registered at residential or mail-drop addresses receiving significant payments — a shell-company indicator.",
      },
      {
        id: "D14",
        name: "Vague Contract Titles",
        description:
          "Scans contract titles for vague language (e.g. 'miscellaneous services') that can obscure the actual scope and enable fraud.",
      },
      {
        id: "D16",
        name: "Grant Churn & Fiscal Sponsor Risk",
        description:
          "Detects rapid grant turnover and payments routed through fiscal sponsors that reduce transparency and oversight.",
        isNew: true,
      },
      {
        id: "D19",
        name: "Sole Source Abuse",
        description:
          "Flags contracts awarded without competitive bidding that lack adequate justification.",
        isNew: true,
      },
      {
        id: "D15",
        name: "Address Clustering",
        description:
          "Cross-references vendor, board-member, and employee addresses to detect overlapping shell entities sharing physical locations, bank accounts, or leadership — a classic related-party fraud signal.",
        isNew: true,
        isOnRoadmap: true,
        roadmapSteps: [
          { label: "Ingest Registered Business Locations dataset (g8m3-pdis) with full address fields", done: true },
          { label: "Normalize and geocode vendor addresses to a canonical format" },
          { label: "Obtain nonprofit board-member / officer data (CA Secretary of State API or IRS 990 bulk data)" },
          { label: "Build entity-resolution graph linking vendors, officers, and addresses" },
          { label: "Implement clustering algorithm to detect shared-address / shared-officer groups" },
          { label: "Cross-reference clusters against vendor payment data to surface shell-entity patterns" },
        ],
      },
    ],
  },
  {
    category: "infrastructure",
    label: "Infrastructure & Services",
    detectors: [
      {
        id: "D1",
        name: "Response Time Deterioration",
        description:
          "Tracks agency response times over rolling windows, flagging agencies whose median resolution time is worsening significantly.",
      },
      {
        id: "D2",
        name: "District Equity Gap",
        description:
          "Compares 311 response times and resolution rates across supervisorial districts to identify inequitable service delivery.",
      },
      {
        id: "D3",
        name: "Resolution Rate Decline",
        description:
          "Monitors agency resolution rates for downward trends that may indicate capacity issues or neglect.",
      },
      {
        id: "D4",
        name: "Spatial Clustering",
        description:
          "Uses DBSCAN clustering on water/sewer 311 requests to identify geographic hotspots of recurring infrastructure failure.",
      },
      {
        id: "D5",
        name: "Budget Variance",
        description:
          "Compares actual spending against budgeted amounts, flagging departments with significant unexplained variances.",
      },
      {
        id: "D6",
        name: "Permit Fast-Tracking",
        description:
          "Flags building permits processed significantly faster than the cohort median — a key indicator of preferential treatment or corruption.",
      },
      {
        id: "D7",
        name: "Budget Timing Anomaly",
        description:
          "Detects unusual budget allocation timing patterns that may indicate end-of-year spending rushes or fund manipulation.",
      },
      {
        id: "D8",
        name: "Failure-Risk Hotspots",
        description:
          "Identifies pavement and sidewalk failure hotspots by analyzing repeat 311 complaint clusters in the same location.",
      },
    ],
  },
  {
    category: "influence",
    label: "Influence & Pay-to-Play",
    detectors: [
      {
        id: "D17",
        name: "Lobbyist Influence",
        description:
          "Analyzes lobbyist meeting timelines against subsequent contract awards to detect potential quid-pro-quo influence patterns.",
        isNew: true,
      },
      {
        id: "D18",
        name: "Pay-to-Play",
        description:
          "Cross-references campaign finance contributions against contract awards to detect potential pay-to-play arrangements.",
        isNew: true,
      },
    ],
  },
  {
    category: "nonprofit",
    label: "Non-Profit Oversight",
    detectors: [
      {
        id: "NP1",
        name: "Cross-Grant Double Dipping",
        description:
          "Detects the same vendor receiving identical payment amounts from different grant funding sources — potential double-billing.",
        isNew: true,
      },
      {
        id: "NP2",
        name: "Ineligible Expense Scan",
        description:
          "Scans expenditure descriptions for keywords associated with ineligible expenses (catering, gifts, parties, etc.).",
        isNew: true,
      },
      {
        id: "NP3",
        name: "Fiscal Sponsor Opacity",
        description:
          "Flags large payments routed through fiscal sponsors where the ultimate recipient organization is obscured.",
        isNew: true,
        isOnRoadmap: true,
        roadmapSteps: [
          { label: "Identify fiscal-sponsor relationships from grant contract metadata and IRS 990 Schedule R" },
          { label: "Obtain sub-grantee disbursement records (currently not in open data — requires city data-sharing agreement)" },
          { label: "Build pass-through payment graph linking sponsor → sub-recipient → ultimate performer" },
          { label: "Flag contracts where >50% of funds are re-granted with no public sub-recipient disclosure" },
          { label: "Cross-reference sub-recipients against business registry and board-member overlap" },
        ],
      },
      {
        id: "NP4",
        name: "AG Registry Validation",
        description:
          "Nightly cross-reference of nonprofit vendor payments against the CA Attorney General's Registry of Charitable Trusts (public API). Flags nonprofits whose registration has lapsed or been revoked while still receiving city funds.",
        isNew: true,
        isOnRoadmap: true,
        roadmapSteps: [
          { label: "Obtain access to the CA Attorney General's Registry of Charitable Trusts public dataset / API" },
          { label: "Build name-matching pipeline between vendor payment payees and AG registry entities (fuzzy + normalized)" },
          { label: "Implement nightly fetch of AG registry status (active, delinquent, revoked, suspended)" },
          { label: "Cross-reference vendor payments against AG status — flag any payee in non-active state receiving >$10K" },
          { label: "Add historical lookback to catch nonprofits that cycled in and out of compliance while receiving funds" },
        ],
      },
    ],
  },
  {
    category: "integrity",
    label: "Personnel Integrity",
    detectors: [
      {
        id: "RD1",
        name: "Revolving Door",
        description:
          "Identifies former city employees who subsequently appear as vendor payees — a revolving-door conflict of interest signal.",
        isNew: true,
      },
      {
        id: "RD2",
        name: "Dual Employment",
        description:
          "Flags individuals appearing simultaneously on both the employee compensation and vendor payment rolls.",
        isNew: true,
      },
      {
        id: "RD3",
        name: "Cross-Department Double Dip",
        description:
          "Detects employees receiving compensation from multiple departments in the same period, potentially double-dipping.",
        isNew: true,
      },
      {
        id: "RD4",
        name: "Time Feasibility",
        description:
          "Cross-references high-overtime employees against business ownership records to flag impossible time commitments.",
        isNew: true,
      },
    ],
  },
]

export const DATASETS: DatasetInfo[] = [
  {
    id: "employee_compensation",
    socrataId: "88g8-5mnd",
    name: "Employee Compensation",
    description:
      "Annual compensation data for all City & County of San Francisco employees including salaries, overtime, other pay, and benefits.",
  },
  {
    id: "vendor_payments",
    socrataId: "n9pm-xkyq",
    name: "Vendor Payments (Vouchers)",
    description:
      "Individual payment records to vendors including amount, department, purchase order, and voucher identifiers.",
  },
  {
    id: "supplier_contracts",
    socrataId: "cqi5-hm2d",
    name: "Supplier Contracts",
    description:
      "Master list of supplier contracts with award amounts, contract terms, and contracting departments.",
  },
  {
    id: "purchasing_commodity",
    socrataId: "ebsh-uavg",
    name: "Purchasing Commodity Data",
    description:
      "Line-item purchasing records with commodity codes, unit prices, and quantities for price-disparity analysis.",
  },
  {
    id: "registered_businesses",
    socrataId: "g8m3-pdis",
    name: "Registered Business Locations",
    description:
      "Official registry of businesses licensed to operate in San Francisco — used to verify vendor legitimacy.",
  },
  {
    id: "311_cases",
    socrataId: "vw6y-z8j6",
    name: "311 Cases",
    description:
      "All 311 service requests including type, status, response time, neighborhood, and supervisorial district.",
  },
  {
    id: "budget",
    socrataId: "xdgd-c79v",
    name: "City Budget",
    description:
      "Annual budget allocations and actuals by department and program for variance and timing analysis.",
  },
  {
    id: "building_permits",
    socrataId: "i98e-djp9",
    name: "Building Permits",
    description:
      "Permit applications with filing and approval dates, permit type, and neighborhood — used for fast-tracking detection.",
  },
  {
    id: "bid_opportunities",
    socrataId: "eshn-8t3a",
    name: "Bid Opportunities",
    description:
      "Published solicitations and bid postings with open/close dates used to detect suspiciously short bid windows.",
  },
  {
    id: "lobbyist_activity",
    socrataId: "5f5n-tdbf",
    name: "Lobbyist Activity",
    description:
      "Records of registered lobbyist contacts with city officials including meeting dates and subjects.",
    isNew: true,
  },
  {
    id: "campaign_filers",
    socrataId: "hfzb-bwts",
    name: "Campaign Finance — Filers",
    description:
      "Registered campaign finance filers (candidates and committees) used to link contributions to contract decisions.",
    isNew: true,
  },
  {
    id: "campaign_contributions",
    socrataId: "2kdi-gwc2",
    name: "Campaign Finance — Contributions",
    description:
      "Individual campaign contributions cross-referenced against vendor payment records for pay-to-play detection.",
    isNew: true,
  },
]

function CollapsibleItem({
  label,
  badge,
  description,
  isNew,
  isOnRoadmap,
  roadmapSteps,
}: {
  label: string
  badge: string
  description: string
  isNew?: boolean
  isOnRoadmap?: boolean
  roadmapSteps?: RoadmapStep[]
}) {
  const [open, setOpen] = useState(false)

  const doneCount = roadmapSteps?.filter((s) => s.done).length ?? 0
  const totalSteps = roadmapSteps?.length ?? 0

  return (
    <div className="border-b border-gray-100 last:border-b-0">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2 px-3 py-2.5 text-left hover:bg-gray-50 transition-colors"
      >
        <span className="text-[10px] font-mono text-gray-400 w-8 shrink-0 text-right">
          {badge}
        </span>
        <span className="text-sm text-gray-800 font-medium flex-1">
          {label}
        </span>
        {isOnRoadmap ? (
          <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-50 text-amber-700 border border-amber-200 uppercase tracking-wide shrink-0">
            <Map className="w-2.5 h-2.5" />
            On Roadmap
          </span>
        ) : isNew ? (
          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold bg-violet-100 text-violet-700 uppercase tracking-wide shrink-0">
            New
          </span>
        ) : null}
        <ChevronDown
          className={cn(
            "w-3.5 h-3.5 text-gray-400 shrink-0 transition-transform",
            open && "rotate-180"
          )}
        />
      </button>
      {open && (
        <div className="px-3 pb-3 pl-[52px]">
          <p className="text-xs text-gray-500 leading-relaxed">{description}</p>

          {isOnRoadmap && roadmapSteps && roadmapSteps.length > 0 && (
            <div className="mt-3 p-3 bg-amber-50/60 border border-amber-200 rounded-lg">
              <div className="flex items-center justify-between mb-2">
                <p className="text-[11px] font-semibold text-amber-800 uppercase tracking-wide">
                  Steps to bring live
                </p>
                <span className="text-[10px] text-amber-600 font-medium">
                  {doneCount}/{totalSteps} complete
                </span>
              </div>
              <div className="w-full h-1.5 rounded-full bg-amber-200/60 overflow-hidden mb-2.5">
                <div
                  className="h-full rounded-full bg-amber-500 transition-all"
                  style={{ width: `${totalSteps > 0 ? (doneCount / totalSteps) * 100 : 0}%` }}
                />
              </div>
              <ol className="space-y-1.5">
                {roadmapSteps.map((step, i) => (
                  <li key={i} className="flex items-start gap-2">
                    {step.done ? (
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0 mt-0.5" />
                    ) : (
                      <Circle className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                    )}
                    <span
                      className={cn(
                        "text-xs leading-relaxed",
                        step.done ? "text-gray-400 line-through" : "text-gray-700"
                      )}
                    >
                      {step.label}
                    </span>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function CollapsibleGroup({
  title,
  count,
  newCount,
  roadmapCount,
  children,
  defaultOpen,
}: {
  title: string
  count: number
  newCount: number
  roadmapCount: number
  children: React.ReactNode
  defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen ?? false)

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-3 px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors text-left"
      >
        <span className="text-sm font-semibold text-gray-900 flex-1">
          {title}
        </span>
        <span className="text-xs text-gray-500">{count} detectors</span>
        {roadmapCount > 0 && (
          <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded">
            <Map className="w-2.5 h-2.5" />
            {roadmapCount} roadmap
          </span>
        )}
        {newCount > 0 && (
          <span className="text-[10px] font-semibold text-violet-600 bg-violet-50 px-1.5 py-0.5 rounded">
            {newCount} new
          </span>
        )}
        <ChevronDown
          className={cn(
            "w-4 h-4 text-gray-400 shrink-0 transition-transform",
            open && "rotate-180"
          )}
        />
      </button>
      {open && <div>{children}</div>}
    </div>
  )
}

export function WasteDetectorsData() {
  const totalDetectors = DETECTOR_GROUPS.reduce(
    (sum, g) => sum + g.detectors.length,
    0
  )
  const totalNew = DETECTOR_GROUPS.reduce(
    (sum, g) => sum + g.detectors.filter((d) => d.isNew && !d.isOnRoadmap).length,
    0
  )
  const totalRoadmap = DETECTOR_GROUPS.reduce(
    (sum, g) => sum + g.detectors.filter((d) => d.isOnRoadmap).length,
    0
  )
  const totalNewDatasets = DATASETS.filter((d) => d.isNew).length

  return (
    <div className="space-y-8">
      {/* Detectors Section */}
      <section>
        <div className="flex items-center gap-3 mb-4">
          <Cpu className="w-5 h-5 text-purple-600" />
          <h2 className="text-lg font-semibold text-gray-900">Detectors</h2>
          <span className="text-xs text-gray-500">
            {totalDetectors} total
          </span>
          {totalRoadmap > 0 && (
            <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded">
              <Map className="w-3 h-3" />
              {totalRoadmap} on roadmap
            </span>
          )}
          {totalNew > 0 && (
            <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-violet-600 bg-violet-50 px-2 py-0.5 rounded">
              <Sparkles className="w-3 h-3" />
              {totalNew} new
            </span>
          )}
        </div>
        <p className="text-sm text-gray-500 mb-4">
          Automated anomaly-detection algorithms that scan public city data for
          statistical patterns warranting investigation.
        </p>

        <div className="space-y-3">
          {DETECTOR_GROUPS.map((group) => {
            const newCount = group.detectors.filter((d) => d.isNew && !d.isOnRoadmap).length
            const roadmapCount = group.detectors.filter((d) => d.isOnRoadmap).length
            return (
              <CollapsibleGroup
                key={group.category}
                title={group.label}
                count={group.detectors.length}
                newCount={newCount}
                roadmapCount={roadmapCount}
                defaultOpen={false}
              >
                {group.detectors.map((detector) => (
                  <CollapsibleItem
                    key={`${group.category}-${detector.id}`}
                    badge={detector.id}
                    label={detector.name}
                    description={detector.description}
                    isNew={detector.isNew}
                    isOnRoadmap={detector.isOnRoadmap}
                    roadmapSteps={detector.roadmapSteps}
                  />
                ))}
              </CollapsibleGroup>
            )
          })}
        </div>
      </section>

      {/* Datasets Section */}
      <section>
        <div className="flex items-center gap-3 mb-4">
          <Database className="w-5 h-5 text-purple-600" />
          <h2 className="text-lg font-semibold text-gray-900">Datasets</h2>
          <span className="text-xs text-gray-500">
            {DATASETS.length} sources
          </span>
          {totalNewDatasets > 0 && (
            <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-violet-600 bg-violet-50 px-2 py-0.5 rounded">
              <Sparkles className="w-3 h-3" />
              {totalNewDatasets} new
            </span>
          )}
        </div>
        <p className="text-sm text-gray-500 mb-4">
          All data is sourced from the SF Open Data Portal (DataSF). Each
          dataset is fetched, validated, and cross-referenced by the detectors
          above.
        </p>

        <div className="border border-gray-200 rounded-lg overflow-hidden">
          {DATASETS.map((dataset) => (
            <CollapsibleItem
              key={dataset.id}
              badge={dataset.socrataId}
              label={dataset.name}
              description={dataset.description}
              isNew={dataset.isNew}
            />
          ))}
        </div>
      </section>

      {/* Footer note */}
      <div className="pt-2">
        <p className="text-xs text-gray-400 text-center">
          Anomalies are statistical patterns that warrant investigation — they do
          not confirm fraud or waste.
        </p>
      </div>
    </div>
  )
}

// Typed mock data for the waste module. Ported from
// /tmp/waste-design/waste-module/project/data.jsx and extras.jsx.
// Real API wiring lands in Prompt 7.

import type { SeverityLevel } from "@/components/admin/waste/primitives";
import type { FindingStatus } from "@/components/admin/waste/primitives";

export type DetectorCategoryId =
  | "vendor"
  | "payroll"
  | "benefits"
  | "permits"
  | "cards"
  | "stat";

export type DetectorCategory = {
  id: DetectorCategoryId;
  label: string;
  count: number;
};

export type Detector = {
  id: string;
  name: string;
  category: DetectorCategoryId;
  plain: string;
  historical: { case: string; summary: string; lesson: string };
  sources: string[];
  severity: SeverityLevel;
  lastTuned: string;
  precision: number;
};

export type Finding = {
  id: string;
  detectorId: string;
  headline: string;
  subject: string;
  department: string;
  amount: string;
  confidence: number;
  flagged: string;
  detail: string;
  severity: SeverityLevel;
  status: FindingStatus;
  /** One-line plain-English reason the pattern is suspicious (may be ""). */
  why?: string;
};

export type SeymourCluster = {
  id: string;
  entity: string;
  detectors: string[];
  findings: number;
  exposure: string;
  reasoning: string;
  suggestion: string;
};

export type SeymourSuggestion = {
  id: string;
  title: string;
  basis: string;
  lift: string;
};

export type SeymourData = {
  todaysRead: string;
  generatedAt: string;
  clusters: SeymourCluster[];
  suggested: SeymourSuggestion[];
};

export type WasteStateMode = "rich" | "quiet" | "degraded";

export type ReportStatus = "draft" | "under-review" | "final";

export type Report = {
  slug: string;
  title: string;
  period: string;
  findings: number;
  exposure: string;
  materiality: string;
  priorPeriod: string;
  updated: string;
  status: ReportStatus;
  detectors: string[];
  standards: string;
  methodology: string;
  caveats: string;
  seymourDraft?: boolean;
};

export const DETECTOR_CATEGORIES: readonly DetectorCategory[] = [
  { id: "vendor",   label: "Vendor & procurement",  count: 11 },
  { id: "payroll",  label: "Payroll & pension",     count: 8  },
  { id: "benefits", label: "Benefits & claims",     count: 7  },
  { id: "permits",  label: "Permits & inspections", count: 6  },
  { id: "cards",    label: "P-cards & expenses",    count: 5  },
  { id: "stat",     label: "Statistical anomaly",   count: 5  },
];

export const DETECTORS: readonly Detector[] = [
  {
    id: "D-014", name: "Ghost vendor — no physical footprint", category: "vendor",
    plain: "Flags vendors paid by the city whose registered address resolves to a UPS Store, a residential parcel, or a coworking mailbox, and who have no website, no Secretary of State filing, and no other client of record.",
    historical: {
      case: "SF DPW · Mohammed Nuru / AzulWorks (2018-2020)",
      summary: "AzulWorks billed the city $1.4M for street-cleaning work. Its registered address was a private mailbox on Mission St; the company had no employees and shared a bank signatory with a DPW manager.",
      lesson: "Address-type + corporate-filing + bank-overlap together caught it. Any one alone produced too many false positives.",
    },
    sources: ["SF Vendor Master", "USPS CMRA registry", "CA SoS bizfile", "FFIEC bank records"],
    severity: "high", lastTuned: "Mar 2026", precision: 0.81,
  },
  {
    id: "D-021", name: "Pension spiking — terminal-year overtime surge", category: "payroll",
    plain: "Compares an employee's overtime, premium pay, and unused-leave cashouts in their final 12 months of service against their prior 5-year average. Flags increases above 2σ that disproportionately affect their pension calculation.",
    historical: {
      case: "CalPERS / City of Vernon (2010-2014)",
      summary: "A city administrator's final-year compensation jumped 213% via lump-sum vacation buyouts and unscheduled overtime, locking in a $500K+/yr lifetime pension. State audit recovered $3.6M.",
      lesson: "The signal isn't 'high pay', it's high pay concentrated in months 9-12 of the final year, with no operational reason.",
    },
    sources: ["Payroll ledger", "Time & attendance", "Pensionable-comp tables"],
    severity: "high", lastTuned: "Feb 2026", precision: 0.74,
  },
  {
    id: "D-007", name: "Benford's Law — first-digit distribution", category: "stat",
    plain: "Genuine financial transactions follow a predictable first-digit distribution (≈30% start with 1, ≈18% with 2, etc). Flags vendors, employees, or cost centers whose invoice/expense amounts deviate from Benford's distribution beyond χ² p<0.01.",
    historical: {
      case: "City of Dixon, IL · Rita Crundwell (1990-2012)",
      summary: "$53.7M embezzled over 22 years through fabricated invoices to a fake account. Invoice amounts she chose by hand showed a flat first-digit distribution, the single strongest forensic signal in the post-mortem.",
      lesson: "Humans inventing numbers reach for 7s and 8s. Real ledgers don't.",
    },
    sources: ["AP transaction log", "P-card statements"],
    severity: "med", lastTuned: "Apr 2026", precision: 0.62,
  },
  {
    id: "D-019", name: "Round-number bias in claim amounts", category: "benefits",
    plain: "Flags clusters of claims, reimbursements, or invoice line items at suspiciously round values ($500, $1,000, $5,000) or just under approval thresholds ($4,995 when policy requires VP sign-off at $5,000).",
    historical: {
      case: "LA County DPSS (2019)",
      summary: "Caseworkers approved 2,400+ emergency-aid disbursements at exactly $999, one dollar below the threshold requiring a second signature. $2.4M loss.",
      lesson: "Threshold-skimming is the most common procurement fraud pattern and the easiest to miss without explicit detection.",
    },
    sources: ["Claims ledger", "Approval-policy table"],
    severity: "med", lastTuned: "Jan 2026", precision: 0.68,
  },
  {
    id: "D-031", name: "Split-purchase pattern", category: "cards",
    plain: "Flags two or more purchases by the same buyer to the same vendor within 72 hours that individually fall under a single-purchase approval threshold but together exceed it.",
    historical: {
      case: "SFMTA P-card audit (2017)",
      summary: "Manager split a $14,000 furniture purchase into three transactions of $4,800, $4,900, and $4,300 across two days to evade the $5K single-purchase ceiling. Pattern surfaced 19 similar splits across the department.",
      lesson: "The vendor + buyer + 72-hour window combo is what distinguishes a split from an honest re-order.",
    },
    sources: ["P-card transaction feed", "Procurement policy"],
    severity: "high", lastTuned: "Feb 2026", precision: 0.79,
  },
  {
    id: "D-038", name: "Permit-inspection collusion", category: "permits",
    plain: "Flags permits where the same inspector signs off on the same applicant or contractor at a rate >3× the citywide baseline, especially when paired with rapid approval times.",
    historical: {
      case: "SF DBI · Bernie Curran (2017-2020)",
      summary: "Senior inspector approved permits for a single developer 41× while accepting $180K in undisclosed loans. Median approval time on those permits was 2 days vs. citywide median of 31.",
      lesson: "Speed + repetition + undisclosed financial relationship. The speed alone caught it; everything else corroborated.",
    },
    sources: ["Permit issuance log", "Inspector assignments", "Form 700 disclosures"],
    severity: "high", lastTuned: "Mar 2026", precision: 0.71,
  },
  {
    id: "D-002", name: "Duplicate invoice — fuzzy match", category: "vendor",
    plain: "Flags invoices that share amount + vendor + (date within 14 days) but differ in invoice number by a single character or transposed digits, typical of resubmission fraud.",
    historical: {
      case: "City of Detroit AP review (2015)",
      summary: "$2.1M in duplicate payments surfaced when invoice numbers like 'INV-2241' and 'INV-2421' were paid weeks apart for identical line items.",
      lesson: "Exact duplicates get caught by ERP. The real loss is in fuzzy duplicates that pass naive deduplication.",
    },
    sources: ["AP invoice register"],
    severity: "med", lastTuned: "Apr 2026", precision: 0.84,
  },
  {
    id: "D-026", name: "Workers' comp claim clustering", category: "benefits",
    plain: "Flags employees, supervisors, or medical providers with claim rates >2.5× the bureau median, especially when claims share a treating physician or attorney.",
    historical: {
      case: "Oakland PD comp fraud ring (2013)",
      summary: "Six officers filed claims through the same chiropractor within an 8-month window. Treating-provider clustering surfaced the ring; individually each claim was unremarkable.",
      lesson: "Look at the network, not the individual.",
    },
    sources: ["WC claims database", "Provider directory"],
    severity: "med", lastTuned: "Jan 2026", precision: 0.66,
  },
];

export const FINDINGS: readonly Finding[] = [
  {
    id: "F-2026-0419-014", detectorId: "D-014",
    headline: "ClearPath Solutions LLC — $284K paid since Jan, address is a UPS Store",
    subject: "Vendor #V-88412 · ClearPath Solutions LLC",
    department: "Public Works",
    amount: "$284,310",
    confidence: 0.92,
    flagged: "2 hours ago",
    detail: "Registered address (2261 Market St #348) is a CMRA mailbox. No SoS filing in CA, NV, or DE. No web presence. Three invoices paid in 11 weeks. Bank routing matches a personal account belonging to a DPW Senior Analyst (per Form 700 cross-ref).",
    severity: "high", status: "open",
  },
  {
    id: "F-2026-0419-021", detectorId: "D-021",
    headline: "Asst. Director, Parks — final-year OT up 340% over 5-yr baseline",
    subject: "Employee #E-44219 (PII redacted) · 27 yrs service",
    department: "Recreation & Parks",
    amount: "+$94,200 pensionable",
    confidence: 0.88,
    flagged: "Today, 9:14am",
    detail: "Filed 612 OT hours in months 9-12 of FY26 vs. 5-yr average of 47. No corresponding rise in unit-level overtime budget or approved projects. Retirement notice filed Apr 2.",
    severity: "high", status: "open",
  },
  {
    id: "F-2026-0419-031", detectorId: "D-031",
    headline: "P-card splits — 4 purchases to Lowes, $4,820 avg, same buyer, 36 hrs",
    subject: "P-card #PC-2204 · Facilities",
    department: "General Services Agency",
    amount: "$19,280 combined",
    confidence: 0.95,
    flagged: "Yesterday",
    detail: "Approval threshold for facilities single-purchase is $5,000. Buyer split into 4 transactions of $4,820/$4,900/$4,790/$4,770 across Apr 17-18. Same vendor, same delivery address, same line-item category.",
    severity: "high", status: "in-review",
  },
  {
    id: "F-2026-0419-007", detectorId: "D-007",
    headline: "Vendor #V-71203 — invoice first-digits fail Benford (χ² p=0.003)",
    subject: "Vendor #V-71203 · Northbay Consulting",
    department: "Multiple (citywide consulting MSA)",
    amount: "$612,400 over 18 mo",
    confidence: 0.71,
    flagged: "Yesterday",
    detail: "127 invoices over 18 months. First-digit distribution: 19% start with 1 (expected 30%), 22% start with 7 (expected 5.8%). χ² statistic 23.7, p=0.003. Pattern persists across all city departments using this vendor.",
    severity: "med", status: "open",
  },
  {
    id: "F-2026-0418-019", detectorId: "D-019",
    headline: "Emergency-aid approvals clustering at $4,995 (n=43, 30 days)",
    subject: "Caseworker pool · Human Services Agency",
    department: "Human Services Agency",
    amount: "$214,785",
    confidence: 0.83,
    flagged: "2 days ago",
    detail: "VP sign-off required at $5,000. 43 of 312 approvals in window landed in the $4,950-$4,999 band, 13.8% vs expected 1.6%. Three caseworkers account for 31 of the 43.",
    severity: "med", status: "open",
  },
  {
    id: "F-2026-0418-038", detectorId: "D-038",
    headline: "Inspector #I-118 — 27 sign-offs for one contractor, 4-day median",
    subject: "Inspector #I-118 · Building Inspection",
    department: "Department of Building Inspection",
    amount: "—",
    confidence: 0.79,
    flagged: "2 days ago",
    detail: "27 of inspector's 64 closed inspections in 90 days went to a single GC. Citywide rate of any inspector pairing with any GC at this frequency: 0.4%. Median approval time 4 days vs. dept median of 29.",
    severity: "high", status: "open",
  },
  {
    id: "F-2026-0417-002", detectorId: "D-002",
    headline: "Possible duplicate — Eastbay Equipment $11,420 invoiced twice",
    subject: "Vendor #V-44091 · Eastbay Equipment",
    department: "Fleet Services",
    amount: "$11,420",
    confidence: 0.74,
    flagged: "3 days ago",
    detail: "INV-7732 paid Mar 14. INV-7723 paid Apr 1. Identical line items, identical amount. 18-day gap. Invoice numbers differ by transposed digits, fuzzy-match score 0.94.",
    severity: "med", status: "in-review",
  },
];

export const FINDINGS_SPARSE: readonly Finding[] = [
  {
    id: "F-2026-0419-031A", detectorId: "D-031",
    headline: "P-card splits — 3 purchases to Office Depot, $4,920 avg, same buyer",
    subject: "P-card #PC-0091 · IT", department: "Information Technology",
    amount: "$14,760 combined", confidence: 0.91, flagged: "Yesterday",
    detail: "Three transactions of $4,920/$4,890/$4,950 in 28 hours. Buyer's first flagged finding on the platform.",
    severity: "high", status: "open",
  },
];

export const SEYMOUR: SeymourData = {
  todaysRead: "Three high-severity flags cluster in Recreation & Parks. D-021, D-026, and D-038 all touch employee #E-44219 or contractors associated with that department head. Likely one investigation, not three. Separately, D-007 (Benford) and D-002 (fuzzy duplicate) both fired on Vendor #V-71203; combined exposure ≈ $624K over 18 months.",
  generatedAt: "Today, 06:14 PT",
  clusters: [
    {
      id: "C-001",
      entity: "Employee #E-44219 · Asst. Director, Parks",
      detectors: ["D-021", "D-026", "D-038"],
      findings: 3,
      exposure: "$94,200 + permit anomaly",
      reasoning: "Same employee ID across pension-spike (D-021) and a workers'-comp cluster among reports (D-026). D-038 fired on a contractor whose 4-day inspection median traces to a permit she signed off as the accountable manager. Three signals, one center of gravity.",
      suggestion: "Open as a single investigation",
    },
    {
      id: "C-002",
      entity: "Vendor #V-71203 · Northbay Consulting",
      detectors: ["D-007", "D-002"],
      findings: 2,
      exposure: "$624,400 over 18 mo",
      reasoning: "Benford failure (χ² p=0.003) and a fuzzy-duplicate hit on the same vendor within a week. The duplicate amount lines up with one of the round-number outliers in the Benford pattern.",
      suggestion: "Pull all V-71203 invoices for sampling",
    },
  ],
  suggested: [
    {
      id: "S-001",
      title: "Open: Recreation & Parks departmental review",
      basis: "Cluster C-001 + 2 prior dismissed flags from Q4",
      lift: "Estimated 6-8 days analyst time",
    },
    {
      id: "S-002",
      title: "Open: Citywide consulting MSA audit",
      basis: "Cluster C-002 + 4 other vendors on the same MSA show similar Benford drift",
      lift: "Estimated 3-4 days analyst time",
    },
  ],
};

export const REPORTS: readonly Report[] = [
  {
    slug: "fy26-q3-vendor-procurement",
    title: "FY26 Q3 · Vendor & Procurement Risk Review",
    period: "Jan 1 – Mar 31, 2026",
    findings: 47,
    exposure: "$2.84M",
    materiality: "$25,000",
    priorPeriod: "FY26 Q2 · 39 findings · $2.11M",
    updated: "Apr 18, 2026",
    status: "draft",
    detectors: ["D-014", "D-002", "D-031", "D-007"],
    standards: "GAGAS 2024 (Yellow Book), Ch. 8 — Performance Audits",
    methodology:
      "We executed all 11 vendor and procurement detectors across the city's AP ledger for the period, joining vendor master data, USPS CMRA registry, CA Secretary of State filings, and FFIEC bank records. Findings exceeding the $25,000 materiality threshold were promoted to the workpaper. Each finding underwent a two-stage review: detector-level confidence ≥ 0.70 to enter the report, plus a manual auditor review before promotion to confirmed.",
    caveats:
      "Three vendors flagged by D-014 are awaiting Secretary of State response. Their findings remain Open pending corroborating evidence.",
    seymourDraft: true,
  },
  {
    slug: "fy26-q3-payroll-pension",
    title: "FY26 Q3 · Payroll & Pension Anomaly Review",
    period: "Jan 1 – Mar 31, 2026",
    findings: 12,
    exposure: "$184K (annualized pension impact)",
    materiality: "$10,000 annualized",
    priorPeriod: "FY26 Q2 · 8 findings · $112K",
    updated: "Apr 11, 2026",
    status: "under-review",
    detectors: ["D-021"],
    standards: "GAGAS 2024 (Yellow Book) + GFOA Pension Funding Best Practices",
    methodology:
      "Detector D-021 was run against the full payroll ledger for the period, joined to the time & attendance system and the pensionable-comp tables. Employees with terminal-year pay surges exceeding 2σ above their 5-year baseline were flagged.",
    caveats:
      "Two flagged employees have legitimate retroactive promotion adjustments; their findings have been reclassified.",
  },
  {
    slug: "fy25-annual-final",
    title: "FY25 Annual · Citywide Waste & Abuse Summary",
    period: "Jul 1, 2024 – Jun 30, 2025",
    findings: 213,
    exposure: "$8.44M",
    materiality: "$50,000",
    priorPeriod: "FY24 · 167 findings · $6.21M",
    updated: "Sep 28, 2025",
    status: "final",
    detectors: ["D-014", "D-021", "D-007", "D-019", "D-031", "D-038", "D-002", "D-026"],
    standards: "GAGAS 2024 (Yellow Book), Ch. 8",
    methodology:
      "All 42 active detectors were run quarterly across the fiscal year. Findings were aggregated, deduplicated against the prior-year register, and categorized by detector class. The materiality threshold of $50,000 was applied at the finding level for inclusion in the summary; lower-value findings are catalogued in the per-quarter workpapers.",
    caveats: "—",
  },
  {
    slug: "fy26-q2-permits",
    title: "FY26 Q2 · Permits & Inspections Review",
    period: "Oct 1 – Dec 31, 2025",
    findings: 18,
    exposure: "—",
    materiality: "Risk-based (no $ threshold)",
    priorPeriod: "FY26 Q1 · 14 findings",
    updated: "Jan 24, 2026",
    status: "final",
    detectors: ["D-038"],
    standards: "GAGAS 2024 (Yellow Book) + IIA Practice Guide on Auditing Conflicts of Interest",
    methodology:
      "Detector D-038 examined all permits issued in the period, computing inspector-applicant pairing rates against the citywide baseline. Pairings exceeding 3× the baseline with median approval times below 5 days were flagged for review.",
    caveats: "—",
  },
];

export function getReportBySlug(slug: string): Report | undefined {
  return REPORTS.find(r => r.slug === slug);
}

export function getFindingsForCity(cityId: string): readonly Finding[] {
  if (cityId === "atx") return FINDINGS_SPARSE;
  if (cityId === "chi") return FINDINGS.slice(0, 4);
  return FINDINGS;
}

export function getDetectorById(id: string): Detector | undefined {
  return DETECTORS.find(d => d.id === id);
}

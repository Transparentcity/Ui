/**
 * Detector code → human-readable name + one-line "what it checks" blurb.
 *
 * Codes (D1, D7, NP4, RD2, ...) are NOT globally unique — D1 means different
 * things in vendor / payroll / infrastructure detectors. Lookups should pass
 * a category hint when possible. When the category isn't known, we return
 * the first match so the UI still shows a readable name instead of a code.
 *
 * Source: keep this aligned with the backend tool names in
 * `_TOOL_TO_CANONICAL_KEY` (waste_persistence_service.py and finding_narrator.py).
 */

export interface DetectorInfo {
  code: string
  category: string // "vendor" | "payroll" | "infrastructure" | "integrity" | "influence" | "nonprofit"
  name: string
  /** One-line description of what the detector checks. */
  checks: string
}

const DETECTORS: DetectorInfo[] = [
  // Vendor / Contracts
  { code: "D1", category: "vendor", name: "SSS Duplicate", checks: "Same vendor, same amount, same period — likely duplicate payments." },
  { code: "D2", category: "vendor", name: "SSD Misdirected", checks: "Same vendor, similar amount, different department than expected." },
  { code: "D3", category: "vendor", name: "Benford (Chi-Square Suite)", checks: "Vendor payment first-digit distribution deviates from Benford's Law." },
  { code: "D4", category: "vendor", name: "RSF Outliers", checks: "Recency / Size / Frequency outliers in vendor payment patterns." },
  { code: "D5", category: "vendor", name: "Round Numbers", checks: "Excess round-dollar payments (likely fabricated rather than calculated)." },
  { code: "D6", category: "vendor", name: "Vendor Concentration", checks: "Single vendor captures an outsized share of a department's spend." },
  { code: "D7", category: "vendor", name: "Price Disparity", checks: "Same vendor charges one department far more than peer departments for similar work." },
  { code: "D7b", category: "vendor", name: "Commodity Price Disparity", checks: "Vendor's commodity price exceeds peer-vendor median for the same item." },
  { code: "D8", category: "vendor", name: "Split POs", checks: "Multiple POs to the same vendor on the same day or rolling 30 days, each just under approval threshold." },
  { code: "D9", category: "vendor", name: "Ghost Vendor", checks: "Vendor lacks SAM.gov / Secretary-of-State registration, address, or phone." },
  { code: "D10", category: "vendor", name: "Contract Drift", checks: "Final contract value drifts materially above the original award." },
  { code: "D11", category: "vendor", name: "Short Bid Window", checks: "RFP-to-award window unusually short (limits competitive bidding)." },
  { code: "D12", category: "vendor", name: "Adaptive Thresholds", checks: "Vendor payments cluster just under city's approval thresholds." },
  { code: "D13", category: "vendor", name: "Residential / Mail Drop Vendor", checks: "Vendor address resolves to a residence or mail-drop." },
  { code: "D14", category: "vendor", name: "Vague Contract Titles", checks: "Contract description is too vague to verify deliverables." },
  { code: "D15", category: "vendor", name: "Address Clustering", checks: "Multiple vendors share the same address." },
  { code: "D16", category: "vendor", name: "Grant Churn", checks: "Same recipient repeatedly cycles through different grant lines." },
  { code: "D19", category: "vendor", name: "Sole Source", checks: "Sole-source contract awarded without competitive justification." },
  { code: "D20", category: "vendor", name: "Debarment Bypass", checks: "Payments to a vendor on the federal SAM.gov debarment list." },
  { code: "D21", category: "vendor", name: "Vendor Location Verification", checks: "Vendor's claimed location can't be verified or doesn't match work site." },
  { code: "D22", category: "vendor", name: "Emergency Contract Runaway", checks: "Emergency-contract spend continues long after the emergency is over." },
  { code: "D23", category: "vendor", name: "Threshold Clustering", checks: "Contract awards cluster just under a competitive-bid or approval ceiling." },

  // Payroll
  { code: "D1", category: "payroll", name: "OT-to-Base Ratio", checks: "Employee's overtime as a fraction of base pay exceeds peer-job-class threshold." },
  { code: "D2", category: "payroll", name: "Pareto Concentration", checks: "Small group of employees captures an outsized share of department overtime." },
  { code: "D3", category: "payroll", name: "YoY Compensation Spike", checks: "Year-over-year total compensation spikes beyond plausible step-grade movement." },
  { code: "D4", category: "payroll", name: "Department OT Outlier (z-score)", checks: "Department's overtime z-score is high vs. peer departments." },
  { code: "D5", category: "payroll", name: "Benford's Law (Overtime)", checks: "Overtime hours fail multi-test Benford's Law digit distribution." },
  { code: "D6", category: "payroll", name: "Hours Feasibility", checks: "Reported hours exceed feasible week (hard cap, zero-base, head-comp, peer-adjusted)." },
  { code: "D7", category: "payroll", name: "Comp Time Manipulation", checks: "Patterns suggest comp-time accrued and cashed out faster than worked." },

  // Infrastructure
  { code: "D1", category: "infrastructure", name: "Response Time Deterioration", checks: "311 / service-request response times getting worse against the city's own SLA." },
  { code: "D2", category: "infrastructure", name: "District Equity Gap", checks: "Service quality differs significantly across council districts." },
  { code: "D3", category: "infrastructure", name: "Resolution Rate Decline", checks: "Share of requests resolved within target window is declining." },
  { code: "D4", category: "infrastructure", name: "Spatial Clustering", checks: "Service-request hot spots cluster in unexpected geographic patterns." },
  { code: "D5", category: "infrastructure", name: "Budget Variance", checks: "Department budget vs. actual variance exceeds tolerance." },
  { code: "D6", category: "infrastructure", name: "Permit Fast Tracking", checks: "Permit issuance times shorter than peer applications (potential favoritism)." },
  { code: "D7", category: "infrastructure", name: "Budget Timing Anomaly", checks: "Budget spending pattern shows year-end dump or front-loading." },
  { code: "D8", category: "infrastructure", name: "Failure-Risk Hotspots", checks: "Repeat-failure clusters indicate systemic infrastructure neglect." },
  { code: "D21", category: "infrastructure", name: "Work Order Overbudgeting", checks: "Work-order final cost consistently exceeds the original estimate." },

  // Personnel Integrity / Revolving Door
  { code: "RD1", category: "integrity", name: "Revolving Door", checks: "Former employee now works for a vendor doing business with the same department." },
  { code: "RD2", category: "integrity", name: "Dual Employment", checks: "Employee on payroll for two city roles in overlapping periods." },
  { code: "RD3", category: "integrity", name: "Cross-Dept Double Dip", checks: "Employee paid by two departments for the same work hours." },
  { code: "RD4", category: "integrity", name: "Time Feasibility", checks: "Hours claimed across roles exceed feasible week." },

  // Influence / Pay-to-play
  { code: "D17", category: "influence", name: "Lobbyist Influence", checks: "Lobbyist contact preceded a contract award to the lobbyist's client." },
  { code: "D18", category: "influence", name: "Pay-to-Play", checks: "Campaign contributions correlate with subsequent contract awards." },
  { code: "D20i", category: "influence", name: "Behested Quid Pro Quo", checks: "Behested-payment recipients also received city contracts." },

  // Nonprofit
  { code: "NP1", category: "nonprofit", name: "Cross-Grant Double Dipping", checks: "Same expense charged to multiple grants." },
  { code: "NP2", category: "nonprofit", name: "Ineligible Expense Scan", checks: "Grant expenses outside the program's allowable category." },
  { code: "NP3", category: "nonprofit", name: "Fiscal Sponsor Opacity", checks: "Fiscal-sponsor relationship hides ultimate recipient or beneficiary." },
  { code: "NP4", category: "nonprofit", name: "Charity Registration Compliance", checks: "Recipient nonprofit's state charity registration is missing or expired." },
  { code: "NP5", category: "nonprofit", name: "Nonprofit-Vendor Overlap", checks: "Nonprofit grant recipient is also a paid vendor to the same department." },
  { code: "NP6", category: "nonprofit", name: "Grant Ramp Concentration", checks: "A grantee's city funding ramps up sharply or concentrates in one department." },
]

// Build code → list of candidates for fast lookup.
const BY_CODE = new Map<string, DetectorInfo[]>()
for (const d of DETECTORS) {
  const list = BY_CODE.get(d.code) ?? []
  list.push(d)
  BY_CODE.set(d.code, list)
}

/**
 * Look up a detector by code. Pass a category hint when known to disambiguate
 * codes that exist in multiple families (D1, D6, D7 all overlap).
 *
 * Returns null when no match is found, so callers can fall back to showing
 * the bare code.
 */
export function lookupDetector(
  code: string,
  categoryHint?: string,
): DetectorInfo | null {
  const candidates = BY_CODE.get(code.trim())
  if (!candidates || candidates.length === 0) return null
  if (categoryHint) {
    const hint = categoryHint.toLowerCase()
    // Map UI category aliases to detector-info categories.
    const hintMap: Record<string, string> = {
      contracts: "vendor",
      procurement: "vendor",
    }
    const target = hintMap[hint] ?? hint
    const match = candidates.find((c) => c.category === target)
    if (match) return match
  }
  return candidates[0]
}

/**
 * Render a detector code as its full name. Examples:
 *   formatDetector("D7", "contracts")    → "D7 Price Disparity"
 *   formatDetector("NP4")                → "NP4 Charity Registration Compliance"
 *   formatDetector("ZZZ", "vendor")      → "ZZZ" (fallback, no entry)
 */
export function formatDetector(code: string, categoryHint?: string): string {
  const info = lookupDetector(code, categoryHint)
  if (!info) return code
  return `${info.code} ${info.name}`
}

/**
 * Take a parenthesized list of codes from the consolidated metricDetail and
 * expand them inline. Returns the original string when nothing matches so we
 * never lose information.
 *
 * Example input:  "flagged this entity (D1, D7, NP4)"
 * Example output: "flagged this entity (D1 SSS Duplicate, D7 Price Disparity, NP4 Charity Registration Compliance)"
 */
export function expandDetectorCodesInline(
  text: string,
  categoryHint?: string,
): string {
  return text.replace(/\(([^)]+)\)/g, (whole, inner: string) => {
    // Only act on lists that look like detector codes (letters + digits)
    const parts = inner.split(",").map((s) => s.trim())
    const codeShape = /^[A-Z]+\d+[a-z]?$/
    if (!parts.every((p) => codeShape.test(p))) return whole
    const expanded = parts.map((p) => formatDetector(p, categoryHint))
    return `(${expanded.join(", ")})`
  })
}

const _CODE_SHAPE = /^[A-Z]+\d+[a-z]?$/

/**
 * Remove internal detector-code parentheticals — "(D1, D7)", "(NP4)",
 * "(RD2, D3)" — from a public-facing string entirely. These codes are
 * engineering shorthand, not globally unique, and mean nothing to an ordinary
 * reader. Tidies the leftover whitespace and dangling punctuation. Use for
 * headlines/descriptions shown to the public; the auditor-facing "Detectors
 * triggered" panel still names detectors explicitly via formatDetector().
 */
export function stripDetectorCodes(text: string | null | undefined): string {
  if (!text) return ""
  return text
    .replace(/\s*\(([^)]+)\)/g, (whole, inner: string) => {
      const parts = inner.split(",").map((s) => s.trim())
      return parts.length > 0 && parts.every((p) => _CODE_SHAPE.test(p))
        ? ""
        : whole
    })
    .replace(/\s+([.,;:])/g, "$1")
    .replace(/\s{2,}/g, " ")
    .trim()
}

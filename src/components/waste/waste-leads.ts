import type { WasteFinding } from "@/lib/apiClient"

/**
 * Lead grading: which findings are worth an investigator's hour.
 *
 * The module used to rank by severity, and severity was derived mostly from
 * dollars, so nine in ten findings read "high" and the top of every list was
 * bookkeeping (a department "over budget" because it pays the city's health
 * insurer). Grading ranks on evidence instead:
 *
 *   direct   The pattern is visible in named records an auditor can pull:
 *            orders priced a few dollars under the bid limit, a contract
 *            paid past its ceiling when its siblings are not.
 *   pattern  Suggestive, with common innocent explanations. Becomes a lead
 *            when an independent detector corroborates it.
 *   context  Statistical or department-level background. Never a lead alone.
 *
 * The backend computes the same grading (Platform `lead_grading.py`) and
 * ships `lead_score` / `lead_tier` / `lead_reasons` / `known_case` on each
 * finding. This file is the mirror: it prefers those fields and computes
 * them client-side for payloads persisted before the backend had them, so
 * the page ranks sensibly on any run. Keep `TOOL_GRADES` and the weights in
 * step with the backend table.
 */

export type EvidenceGrade = "direct" | "pattern" | "context"
export type LeadTier = "lead" | "review" | "context"

export interface FindingLead {
  score: number
  tier: LeadTier
  grade: EvidenceGrade
  /** Plain-English lines saying why the finding ranks where it does. */
  reasons: string[]
  /** Name of the public case this matches, when it is not new. */
  knownCase: string | null
}

export const LEAD_TIER_LABEL: Record<LeadTier, string> = {
  lead: "Strong lead",
  review: "Worth a look",
  context: "Background",
}

export const LEAD_TIER_HELP: Record<LeadTier, string> = {
  lead: "Specific and checkable: the pattern is visible in named records, or independent detectors agree.",
  review: "A suggestive pattern with common innocent explanations. Read it; it needs corroboration.",
  context: "Statistical or department-level background. Not evidence on its own.",
}

const LEAD_THRESHOLD = 60
const REVIEW_THRESHOLD = 30
const GRADE_BASE: Record<EvidenceGrade, number> = {
  direct: 55,
  pattern: 30,
  context: 8,
}
const SPECIFICITY_POINTS = 10
const CORROBORATION_POINTS: Record<"direct" | "pattern", number> = {
  direct: 15,
  pattern: 8,
}
const CORROBORATION_CAP = 25
const MATERIALITY_CAP = 10
const PARTIAL_DATA_PENALTY = 10

// Evidence grade by Finding.tool prefix; the longest matching prefix wins.
const TOOL_GRADES: [string, EvidenceGrade][] = [
  // Procurement: direct
  ["D8 Split POs (Same Day)", "direct"],
  ["D8b Threshold-Hugging", "direct"],
  ["D10 Contract Drift", "direct"],
  ["D20 Debarment Bypass", "direct"],
  ["D23 Contract Threshold Clustering", "direct"],
  // Procurement: pattern
  ["D8b Threshold-Hugging Vendor (Former Limit)", "pattern"],
  ["D8b Threshold-Hugging Department (Former Limit)", "pattern"],
  ["D8 Split POs (Rolling 30-Day)", "pattern"],
  ["D24 Repeat Payment Pair", "pattern"],
  // Ceiling rebuilt from published revisions, which can be incomplete.
  ["D10 Contract Drift (Published Award)", "pattern"],
  ["D25 Contract Growth After Award", "pattern"],
  ["D26 Paid Without Contract After Expiry", "pattern"],
  ["D2 SSD Misdirected", "pattern"],
  ["D7b Commodity Price", "pattern"],
  ["D11 Short Bid Window", "pattern"],
  ["D13 Residential/Mail Drop Vendor", "pattern"],
  ["NP2 Ineligible Expense", "pattern"],
  ["NP4 Charity Registration", "pattern"],
  ["NP6 Grant Ramp", "pattern"],
  // Procurement: context
  // Three or more identical payments is the shape of instalments; the
  // two-payment form (D24) is the lead.
  ["D1 SSS Duplicate", "context"],
  // Most no-bid awards are proprietary systems and lawful piggybacks:
  // background until another detector flags the same vendor.
  ["D19 Sole Source", "context"],
  // Clustering under generic guessed limits; D8b does this properly where
  // a city's real limit is verified.
  ["D12 Adaptive Thresholds", "context"],
  ["D22 Emergency Contract Runaway", "context"],
  ["D3 Benford", "context"],
  ["D4 RSF", "context"],
  ["D5 Round Numbers", "context"],
  ["D6 Concentration", "context"],
  ["D7 Price Disparity", "context"],
  ["D9 Ghost Vendor", "context"],
  ["D14 Vague Contract", "context"],
  ["D15 Address Clustering", "context"],
  ["D16 Grant Churn", "context"],
  ["D16 Fiscal Sponsor", "context"],
  ["D21 Vendor Location", "context"],
  ["NP1 ", "context"],
  ["NP3 ", "context"],
  ["NP5 ", "context"],
  // Payroll
  ["D6 Hours Feasibility (Hard Cap)", "direct"],
  ["D6 Hours Feasibility (Zero-base", "direct"],
  ["D6 Hours Feasibility (Peer Adjusted)", "pattern"],
  ["D6 Hours Feasibility (Head-comp", "context"],
  ["D1 OT-to-Base Ratio", "pattern"],
  ["D2 Pareto Concentration", "pattern"],
  ["D3 YoY Compensation Spike", "pattern"],
  ["D4 Department OT Outlier", "context"],
  ["D5 Benford's Law", "context"],
  ["D7 Comp Time", "context"],
  // One person's overtime several times the next-highest in the same title,
  // repeated across years. A single year is background.
  ["W1 Title-Peer Overtime Outlier (Repeated)", "pattern"],
  ["W1 Title-Peer Overtime Outlier", "context"],
  // A few people hold nearly all of a title's overtime, the same people for
  // three of four years, while the rest of the title works straight time.
  ["W1 Title Overtime Cluster (Repeated)", "pattern"],
  // One person paid in the same title by two departments (needs a stable
  // employee id, or a caller that accepts a name as identity).
  ["W2 Same-Title Second Payroll Line (Repeated)", "direct"],
  ["W2 Same-Title Second Payroll Line", "context"],
  // Infrastructure: department- or area-level background
  ["D1 Response Time", "context"],
  ["D2 District Equity", "context"],
  ["D3 Resolution Rate", "context"],
  ["D4 Spatial Clustering", "context"],
  ["D5 Budget Variance", "context"],
  ["D6 Permit Fast Tracking", "context"],
  ["D7 Budget Timing", "context"],
  ["D8 Failure-Risk", "context"],
  ["D21 Work Order", "context"],
  // Integrity
  // Name-only payroll-to-vendor matches. They name individual employees
  // and the ones checked by hand were fund custodians or namesakes:
  // background until something independent corroborates them.
  ["RD2 Dual Employment", "context"],
  ["RD1 Revolving Door", "context"],
  ["RD3 Cross-Dept Double Dip", "context"],
  ["RD4 Time Feasibility", "context"],
  // Influence
  ["D20i Behested", "pattern"],
  ["D17 Lobbyist", "context"],
  ["D18 Pay-to-Play", "context"],
  // Meta
  ["Convergence Detector", "context"],
]

const SORTED_GRADES = [...TOOL_GRADES].sort((a, b) => b[0].length - a[0].length)

/** Evidence grade for a finding's `tool`. Unknown tools grade as pattern. */
export function evidenceGrade(tool: string | null | undefined): EvidenceGrade {
  const name = tool ?? ""
  for (const [prefix, grade] of SORTED_GRADES) {
    if (name.startsWith(prefix)) return grade
  }
  return "pattern"
}

// ── Structural counterparties ───────────────────────────────────────────────
// Governments, pension funds, insurers, utilities and banks are paid by
// statute, labor contract or tariff. Concentration, recurring-amount and
// dual-role patterns are the normal shape of those payments. The backend
// drops these findings; this mirror keeps older payloads clean.

const STRUCTURAL_PATTERNS: RegExp[] = [
  /retirement\s+(system|fund|board|plan)|pension|annuity\s+(and|&)\s+benefit|\b(o?pers|calpers|calstrs|sfers|strs|imrf)\b|deferred\s+comp/i,
  /\b(city|county|state|commonwealth|village|town|township)\s+of\b|\bcounty(\s+(treasurer|auditor|clerk|sheriff|recorder|commission(ers)?|court|board|health|public|engineer))?\s*$|\bboard\s+of\s+(education|county|elections|health)|\bschool\s+district|\bpublic\s+schools?\b|\bcity\s+schools?\b|\bunified\s+school|\b(port|housing|transit\w*|transportation|redevelopment|park|sanitary|water|sewer|metropolitan|public|publ)\s+(authority|auth|district)\b|\bcity\s+college\b|\bpark\s+board\b|\bpublic\s+library\b|\binternal\s+revenue|\bu\.?s\.?\s+(treasury|department|dept)|\bunited\s+states\b|\btreasurer\s+of\s+(the\s+)?state|\bstate\s+treasurer|\b(state|community)\s+(university|college)\b|\buniv(ersity|\.)?\s+of\b|\bsuperior\s+court|\bcourt\s+of\b|\bcouncil\s+of\s+governments/i,
  /\binsurance\s+(co|company|corp|trust|fund)\b|\b(life|health|dental|vision)\s+(insurance|plan|service\s+plan)|\bhealth\s+(plan|care\s+service\s+corp)|\b(anthem|kaiser|aetna|cigna|humana|metlife|prudential|unitedhealth(care)?|medical\s+mutual|caremark|optum|express\s+scripts|delta\s+dental|vsp)\b|blue\s*(cross|shield)|united\s+health|workers'?\s*comp/i,
  /\b(duke\s+energy|commonwealth\s+edison|comed|peoples\s+gas|pacific\s+gas|pg\s*&\s*e|nicor|con\s*ed(ison)?|seattle\s+city\s+light|austin\s+energy|evergy|spire)\b|\bgas\s*(&|and)\s*electric\b|\b(electric|power|light)\s+(co|company|corp)\b|\bwater\s+works\b|\b(at\s*&\s*t|verizon|comcast|charter\s+communications|spectrum|t-?mobile)\b/i,
  /\bbank\d*\b|\bbanc\b|\btrust\s+(co|company)\b|\btrustee\b|,?\s+n\.?a\.?\s*$|\b(bny\s+mellon|wells\s+fargo|jpmorgan|j\.?p\.?\s+morgan|fifth\s+third|huntington\s+national|pnc|keybank|state\s+street\s+(bank|corp|global)|blackrock|depository\s+trust|u\.?s\.?\s+bancorp)\b/i,
]

const PSEUDO_PAYEES = /^(single payment payees|miscellaneous|misc|various|multiple vendors)$/i

const STRUCTURAL_TOOL_PREFIXES = [
  "D1 SSS Duplicate",
  "D3 Benford",
  "D4 RSF",
  "D5 Round Numbers",
  "D6 Concentration",
  "D7 Price Disparity",
  "D9 Ghost Vendor",
  "D12 Adaptive Thresholds",
  "D16 Grant Churn",
  "D16 Fiscal Sponsor",
  "NP1 ",
  "NP3 ",
  "NP5 ",
  "NP6 ",
]

/** Pull the payee out of "Dept → Vendor", "Vendor (Dept)" or "Vendor — Title". */
export function extractPayee(entity: string | null | undefined): string {
  let text = (entity ?? "").trim()
  if (text.includes("→")) text = text.split("→").pop()!.trim()
  text = text.replace(/\s*\([^()]*\)\s*$/, "").trim()
  return text
}

/** True when the payee is a government, pension fund, insurer, utility or bank. */
export function isStructuralPayee(name: string | null | undefined): boolean {
  const text = (name ?? "").trim()
  if (!text) return false
  return PSEUDO_PAYEES.test(text) || STRUCTURAL_PATTERNS.some((p) => p.test(text))
}

/**
 * True when a finding describes the normal shape of payments to a structural
 * payee (e.g. "Risk Management pays 85% of its spend to its health insurer").
 */
export function isStructuralFinding(f: WasteFinding): boolean {
  if (isConfirmedCategory(f)) return false
  const tool = f.tool ?? ""
  if (!STRUCTURAL_TOOL_PREFIXES.some((p) => tool.startsWith(p))) return false
  return isStructuralPayee(extractPayee(f.entity))
}

// ── Grading ─────────────────────────────────────────────────────────────────

function isConfirmedCategory(f: WasteFinding): boolean {
  return (f.category ?? "").toLowerCase().includes("confirmed")
}

function isConvergenceCategory(f: WasteFinding): boolean {
  return (f.category ?? "").toLowerCase().includes("convergence")
}

const LEGAL_SUFFIX =
  /\s+(INC|INCORPORATED|LLC|L L C|LLP|LP|LTD|LIMITED|CORP|CORPORATION|CO|COMPANY|PC|NFP)$/

function normalizeName(name: string): string {
  let n = name.toUpperCase().replace(/&/g, " AND ")
  n = n.replace(/[^A-Z0-9 ]+/g, " ").replace(/\s+/g, " ").trim()
  let prev = ""
  while (prev !== n) {
    prev = n
    n = n.replace(LEGAL_SUFFIX, "").trim()
  }
  return n
}

function entityKey(f: WasteFinding): string {
  return normalizeName(extractPayee(f.entity).split(" — ")[0])
}

function toolFamily(tool: string | null | undefined): string {
  return (tool ?? "").split(/\s+/)[0] ?? ""
}

// Detectors that read the same behaviour off the same records are one
// signal. Same-day splits, rolling-window splits, the vendor profile and
// payment clustering under a limit all describe orders sized to a threshold.
const SIGNAL_GROUP: Record<string, string> = {
  D8: "threshold",
  D8b: "threshold",
  D12: "threshold",
  // Identical payments, seen as a pair or as a run.
  D1: "repeat-payment",
  D24: "repeat-payment",
}

/** Independent-signal key for a tool: its group, else its detector code. */
function signalKey(tool: string | null | undefined): string {
  const family = toolFamily(tool)
  return SIGNAL_GROUP[family] ?? family
}

function isDepartmentLevel(f: WasteFinding): boolean {
  if (!f.department || !f.entity) return false
  const squash = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "")
  const ent = squash(extractPayee(f.entity))
  return ent.length > 0 && ent === squash(f.department)
}

function materialityPoints(f: WasteFinding): number {
  const amount = f.estimated_dollar_impact ?? f.amount ?? 0
  if (!amount || amount <= 10_000) return 0
  return Math.min(MATERIALITY_CAP, (Math.log10(amount) - 4) * 2.5)
}

function tierFor(score: number): LeadTier {
  if (score >= LEAD_THRESHOLD) return "lead"
  if (score >= REVIEW_THRESHOLD) return "review"
  return "context"
}

const PUBLIC_SAFETY_DEPT =
  /\b(police|sheriff|fire|corrections?|emergency\s+management)\b/i
const OVERTIME_TOOLS = [
  "D1 OT-to-Base",
  "D2 Pareto",
  "D3 YoY Compensation",
  "D4 Department OT",
  "D6 Hours Feasibility",
  "D7 Comp Time",
  "W1 Title-Peer Overtime",
  "W1 Title Overtime Cluster",
  "Entity Consolidation",
]
// Sworn and shift-staffed ranks. A civilian maintenance superintendent at the
// Sheriff is not the audited kind of public-safety overtime.
const SWORN_TITLE =
  /\b(police|officer|sergeant|lieutenant|captain|inspector|deputy|fire\s*fighter|firefighter|paramedic|emt|dispatcher|fire\s+(suppression|prevention)|chief|detective|marshal)\b/i
export const PUBLIC_SAFETY_OT_LABEL =
  "Public-safety overtime (widely audited and reported)"

function isPublicSafetyOvertime(f: WasteFinding): boolean {
  if (!(f.category ?? "").toLowerCase().includes("payroll")) return false
  const tool = f.tool ?? ""
  if (!OVERTIME_TOOLS.some((t) => tool.startsWith(t))) return false
  if (!PUBLIC_SAFETY_DEPT.test(`${f.department ?? ""} ${f.entity ?? ""}`)) {
    return false
  }
  // Role-level findings: only sworn and shift ranks count.
  if (tool.startsWith("W1 ")) return SWORN_TITLE.test(f.entity ?? "")
  return true
}

export interface LeadContext {
  /** entity key → grade → detector families that flagged it. */
  grades: Map<string, { direct: Set<string>; pattern: Set<string> }>
  /** normalized entity → label, for confirmed (already public) cases. */
  known: Map<string, string>
}

/** One pass over a run's findings; pass the result to `findingLead`. */
export function buildLeadContext(findings: readonly WasteFinding[]): LeadContext {
  const grades: LeadContext["grades"] = new Map()
  const known: LeadContext["known"] = new Map()
  for (const f of findings) {
    const key = entityKey(f)
    if (isConfirmedCategory(f)) {
      if (key.length >= 4 && !known.has(key)) known.set(key, f.entity)
      continue
    }
    if (isConvergenceCategory(f) || key.length < 3) continue
    const grade = evidenceGrade(f.tool)
    if (grade === "context") continue
    let entry = grades.get(key)
    if (!entry) {
      entry = { direct: new Set(), pattern: new Set() }
      grades.set(key, entry)
    }
    entry[grade].add(signalKey(f.tool))
  }
  return { grades, known }
}

function matchKnownCase(key: string, known: LeadContext["known"]): string | null {
  if (key.length < 4) return null
  const exact = known.get(key)
  if (exact) return exact
  for (const [knownKey, label] of known) {
    if (
      knownKey.length >= 8 &&
      (` ${key} `.includes(` ${knownKey} `) || ` ${knownKey} `.includes(` ${key} `))
    ) {
      return label
    }
  }
  return null
}

const GRADE_REASON: Record<EvidenceGrade, string> = {
  direct: "Direct evidence: the pattern is visible in named records",
  pattern: "Suggestive pattern with common innocent explanations",
  context: "Background signal, not evidence on its own",
}

/**
 * Grade one finding. Uses the backend's grading when the payload carries it;
 * otherwise computes the same thing from the finding and its run context.
 */
export function findingLead(f: WasteFinding, ctx?: LeadContext | null): FindingLead {
  const grade = evidenceGrade(f.tool)

  if (f.lead_tier && typeof f.lead_score === "number") {
    return {
      score: f.lead_score,
      tier: f.lead_tier,
      grade,
      reasons: f.lead_reasons ?? [],
      knownCase: f.known_case ?? null,
    }
  }

  if (isConfirmedCategory(f)) {
    return {
      score: 0,
      tier: "context",
      grade,
      reasons: ["Already public: a confirmed historical case"],
      knownCase: f.entity,
    }
  }
  if (isStructuralFinding(f)) {
    return {
      score: 0,
      tier: "context",
      grade: "context",
      reasons: [
        "Payee is a government, pension fund, insurer, utility or bank; this pattern is normal for such payments",
      ],
      knownCase: null,
    }
  }

  const reasons: string[] = [GRADE_REASON[grade]]
  let score = GRADE_BASE[grade]

  const deptLevel = isDepartmentLevel(f)
  if (!deptLevel) {
    score += SPECIFICITY_POINTS
    reasons.push(
      /^W[12] /.test(f.tool ?? "")
        ? "Names a specific role and the pay records behind it"
        : "Names a specific payee, person or contract",
    )
  } else if (grade === "direct") {
    // A direct detector on a department still points at named records
    // (hundreds of purchase orders at $9,999), unlike a department statistic.
    score += SPECIFICITY_POINTS
    reasons.push("Names a department and the records behind it")
  } else {
    reasons.push("Department-level, no named payee")
  }

  const key = entityKey(f)
  if (!deptLevel && ctx) {
    const own = signalKey(f.tool)
    const entry = ctx.grades.get(key)
    let corroboration = 0
    const others: string[] = []
    if (entry) {
      for (const g of ["direct", "pattern"] as const) {
        // Direct evidence stands on its records; it is lifted only by
        // another direct detector, not by a weaker one agreeing with it.
        if (grade === "direct" && g !== "direct") continue
        for (const family of [...entry[g]].sort()) {
          if (family === own) continue
          corroboration += CORROBORATION_POINTS[g]
          others.push(family)
        }
      }
    }
    if (corroboration > 0) {
      score += Math.min(CORROBORATION_CAP, corroboration)
      reasons.push(
        `Corroborated by ${others.length} other detector${others.length === 1 ? "" : "s"} (${others.join(", ")})`,
      )
    }
  }

  score += materialityPoints(f)
  if (f.is_partial_data) {
    score -= PARTIAL_DATA_PENALTY
    reasons.push("Based on partial data")
  }
  score = Math.round(Math.max(0, Math.min(100, score)))

  let knownCase = ctx ? matchKnownCase(key, ctx.known) : null
  if (knownCase) {
    reasons.push(`Already public: matches '${knownCase}'`)
  } else if (isPublicSafetyOvertime(f)) {
    knownCase = PUBLIC_SAFETY_OT_LABEL
    reasons.push(`Already public: ${PUBLIC_SAFETY_OT_LABEL}`)
  }

  return { score, tier: tierFor(score), grade, reasons, knownCase }
}

// ── Ranking ─────────────────────────────────────────────────────────────────

export interface RankedLead {
  finding: WasteFinding
  lead: FindingLead
}

function isDismissedFinding(f: WasteFinding): boolean {
  const ld = (f as unknown as { latest_disposition?: { disposition?: unknown } })
    .latest_disposition
  const d = typeof ld?.disposition === "string" ? ld.disposition : null
  return d === "false_positive" || d === "data_error" || d === "inconclusive"
}

function compareLeads(a: RankedLead, b: RankedLead): number {
  if (b.lead.score !== a.lead.score) return b.lead.score - a.lead.score
  return (b.finding.amount ?? 0) - (a.finding.amount ?? 0)
}

/**
 * Every finding with its grade, best first. Dismissed findings sink to the
 * bottom whatever their score, so triage never has to see them twice.
 */
export function sortByLead(
  findings: readonly WasteFinding[],
  ctx?: LeadContext | null,
): RankedLead[] {
  const context = ctx ?? buildLeadContext(findings)
  return findings
    .map((finding) => ({ finding, lead: findingLead(finding, context) }))
    .sort((a, b) => {
      const da = isDismissedFinding(a.finding) ? 1 : 0
      const db = isDismissedFinding(b.finding) ? 1 : 0
      if (da !== db) return da - db
      return compareLeads(a, b)
    })
}

export interface TopLeads {
  /** New leads, best first (strong leads, then worth-a-look). */
  leads: RankedLead[]
  /** How many otherwise-qualifying findings were left out as already public. */
  knownCount: number
  /** Totals across the whole run, for the summary line. */
  strongCount: number
  reviewCount: number
}

/** Most rows one detector may take in one department (strong leads). */
const MAX_PER_STORY = 3
/** Most worth-a-look rows one detector may take on the shortlist. */
const MAX_REVIEW_PER_DETECTOR = 5

/**
 * The cross-category shortlist for the landing page: new, undismissed,
 * strong-or-worth-a-look findings.
 *
 * - One row per entity, so a vendor flagged by four detectors appears once,
 *   as its best-scoring finding (whose reasons name the other detectors).
 *   "N detectors flagged this entity" roll-up cards are skipped for the
 *   same reason: the underlying finding says more.
 * - At most three rows per detector per department for strong leads (a
 *   department that prices hundreds of orders under the bid limit is one
 *   story with a couple of named examples), and five per detector overall
 *   for worth-a-look rows.
 */
export function topLeads(
  findings: readonly WasteFinding[],
  limit = 10,
): TopLeads {
  const ctx = buildLeadContext(findings)
  const ranked = sortByLead(findings, ctx).filter(
    ({ finding, lead }) =>
      lead.tier !== "context" &&
      !isConfirmedCategory(finding) &&
      !isDismissedFinding(finding) &&
      !(finding.tool ?? "").startsWith("Entity Consolidation"),
  )
  const strongCount = ranked.filter((r) => r.lead.tier === "lead").length
  const reviewCount = ranked.length - strongCount

  const leads: RankedLead[] = []
  const seen = new Set<string>()
  const perStory = new Map<string, number>()
  // Rows held back by a cap. Their entity waits with them, so a weaker
  // finding about the same entity cannot take the slot instead.
  const deferred: RankedLead[] = []
  const deferredKeys = new Set<string>()
  let knownCount = 0
  for (const r of ranked) {
    if (r.lead.knownCase) {
      knownCount++
      continue
    }
    const key = entityKey(r.finding) || r.finding.id
    if (seen.has(key) || deferredKeys.has(key)) continue
    // Strong leads: three per detector per department. Worth-a-look rows:
    // five per detector, full stop, so one prolific detector cannot fill
    // the list with ten variations of an unconfirmed pattern.
    const family = toolFamily(r.finding.tool)
    const story =
      r.lead.tier === "lead"
        ? `${family}|${(r.finding.department ?? "").toLowerCase()}`
        : family
    const used = perStory.get(story) ?? 0
    const cap = r.lead.tier === "lead" ? MAX_PER_STORY : MAX_REVIEW_PER_DETECTOR
    if (used >= cap) {
      deferred.push(r)
      deferredKeys.add(key)
      continue
    }
    seen.add(key)
    perStory.set(story, used + 1)
    if (leads.length < limit) leads.push(r)
  }
  // The caps exist to make room for other stories. Where there are none
  // (a city whose only worthwhile detector is one detector), the held-back
  // rows fill the remaining slots rather than leaving them empty.
  for (const r of deferred) {
    if (leads.length >= limit) break
    leads.push(r)
  }
  leads.sort(compareLeads)
  return { leads, knownCount, strongCount, reviewCount }
}

/** Strong / worth-a-look counts per finding list (a category's row). */
export function countLeadTiers(
  findings: readonly WasteFinding[],
  ctx: LeadContext,
): { lead: number; review: number } {
  let lead = 0
  let review = 0
  for (const f of findings) {
    if (isConfirmedCategory(f)) continue
    const tier = findingLead(f, ctx).tier
    if (tier === "lead") lead++
    else if (tier === "review") review++
  }
  return { lead, review }
}

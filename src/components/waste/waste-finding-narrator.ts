import type { WasteFinding } from "@/lib/apiClient"
import { formatDollar } from "./waste-utils"

/**
 * Client-side plain-English headline generator for waste findings.
 *
 * Mirrors the backend finding_narrator.py but lives in the view layer so copy
 * can be tuned for an ordinary reader (not just an auditor) without re-running
 * detection or re-persisting findings. Every headline leads with the entity, a
 * concrete number where one exists, and a plain statement of WHY the pattern is
 * suspicious — avoiding bare statistical jargon ("statistically unusual") that
 * tells a non-expert nothing.
 *
 * deriveHeadline() is the single entry point used by the cards. It prefers a
 * tuned template, then any backend-supplied headline, then a metric fallback.
 */

const dollar = (n: number | null | undefined): string =>
  n == null ? "" : formatDollar(n)

// Finding.tool display names → canonical key (mirrors backend _TOOL_TO_CANONICAL).
// Collapses per-variant tool labels (e.g. the four D6 Hours variants) onto one key.
const TOOL_TO_CANONICAL: Record<string, string> = {
  // Vendor / procurement
  "D1 SSS Duplicate": "vendor_d1",
  "D2 SSD Misdirected": "vendor_d2",
  "D3 Benford (Chi-Square Suite)": "vendor_d3",
  "D4 RSF": "vendor_d4",
  "D5 Round Numbers": "vendor_d5",
  "D6 Concentration": "vendor_d6",
  "D7 Price Disparity": "vendor_d7",
  "D7b Commodity Price": "vendor_d7b",
  "D8 Split POs (Same Day)": "vendor_d8",
  "D8 Split POs (Rolling 30-Day)": "vendor_d8",
  "D9 Ghost Vendor": "vendor_d9",
  "D10 Contract Drift": "vendor_d10",
  "D11 Short Bid Window": "vendor_d11",
  "D12 Adaptive Thresholds": "vendor_d12",
  "D13 Residential/Mail Drop Vendor": "vendor_d13",
  "D14 Vague Contract Titles": "vendor_d14",
  "D15 Address Clustering": "vendor_d15",
  "D16 Grant Churn": "vendor_d16",
  "D16 Fiscal Sponsor": "vendor_d16",
  "D19 Sole Source": "vendor_d19",
  "D20 Debarment Bypass": "vendor_d20",
  "D22 Emergency Contract Runaway": "vendor_d22",
  "D23 Contract Threshold Clustering": "vendor_d23",
  // Payroll
  "D1 OT-to-Base Ratio": "payroll_d1",
  "D2 Pareto Concentration": "payroll_d2",
  "D3 YoY Compensation Spike": "payroll_d3",
  "D4 Department OT Outlier (z-score)": "payroll_d4",
  "D5 Benford's Law (Overtime, multi-test)": "payroll_d5",
  "D6 Hours Feasibility (Hard Cap)": "payroll_d6",
  "D6 Hours Feasibility (Zero-base overtime check)": "payroll_d6_ghost",
  "D6 Hours Feasibility (Head-comp comparison)": "payroll_d6_headcomp",
  "D6 Hours Feasibility (Peer Adjusted)": "payroll_d6",
  "D7 Comp Time Manipulation": "payroll_d7",
  // Infrastructure
  "D1 Response Time Deterioration": "infra_d1",
  "D2 District Equity Gap": "infra_d2",
  "D3 Resolution Rate Decline": "infra_d3",
  "D4 Spatial Clustering": "infra_d4",
  "D5 Budget Variance": "infra_d5",
  "D5 Budget Variance (YoY Growth)": "infra_d5_yoy",
  "D6 Permit Fast Tracking": "infra_d6",
  "D7 Budget Timing Anomaly": "infra_d7",
  "D8 Failure-Risk Hotspots": "infra_d8",
  "D21 Work Order Overbudgeting": "infra_d21",
  // Integrity
  "RD1 Revolving Door": "integrity_rd1",
  "RD2 Dual Employment": "integrity_rd2",
  "RD3 Cross-Dept Double Dip": "integrity_rd3",
  "RD4 Time Feasibility": "integrity_rd4",
  // Influence
  "D17 Lobbyist Influence": "influence_d17",
  "D18 Pay-to-Play": "influence_d18",
  "D20i Behested Quid Pro Quo": "influence_d20i",
  // Nonprofit
  "NP5 Nonprofit-Vendor Overlap": "nonprofit_np5",
  "NP6 Grant Ramp Concentration": "nonprofit_np6",
}

type Builder = (f: WasteFinding) => string

// Headlines that improve on the backend copy lead with a concrete "why".
// Where the backend is already concrete and clear, we keep an equivalent.
const HEADLINES: Record<string, Builder> = {
  // ── Payroll ──────────────────────────────────────────────────────────────
  payroll_d1: (f) =>
    `${f.entity} — staff paid more in overtime than base salary (${dollar(f.amount)} in OT)`,
  payroll_d2: (f) =>
    `${f.entity} — a handful of employees collect most of the overtime`,
  payroll_d3: (f) =>
    `${f.entity} — pay spiked sharply in a final year, inflating the pension it sets`,
  payroll_d4: (f) =>
    `${f.entity} — overtime far exceeds comparable departments`,
  payroll_d5: (f) =>
    `${f.entity} — overtime amounts don't follow natural number patterns, a fabrication signal`,
  payroll_d6: (f) =>
    `${f.entity} — employees logging more hours than physically possible`,
  payroll_d6_ghost: (f) =>
    `${f.entity} — overtime paid to staff with zero base salary (ghost-employee risk)`,
  payroll_d6_headcomp: (f) =>
    `${f.entity} — employees out-earning their own department head`,
  payroll_d7: (f) =>
    `${f.entity} — large "other pay" cash-outs that can mask comp-time abuse`,
  // ── Vendor / procurement ─────────────────────────────────────────────────
  vendor_d1: (f) =>
    `${f.entity} — duplicate payments totaling ${dollar(f.amount)}`,
  vendor_d2: (f) =>
    `${f.entity} — payment routed to a different account than usual (${dollar(f.amount)})`,
  vendor_d3: (f) =>
    `${f.entity} — payment amounts don't look naturally generated (possible manipulation)`,
  vendor_d4: (f) => `${f.entity} — payments far larger than comparable vendors`,
  vendor_d5: (f) =>
    `${f.entity} — suspiciously many round-dollar payments (a manual-override sign)`,
  vendor_d6: (f) =>
    `${f.entity} — captures a disproportionate share of one department's spending`,
  vendor_d7: (f) =>
    `${f.entity} — charges different departments very different prices`,
  vendor_d7b: (f) =>
    `${f.entity} — commodity pricing well above peer rates`,
  vendor_d8: (f) =>
    `${f.entity} — orders split to stay just under the approval limit (${dollar(f.amount)})`,
  vendor_d9: (f) =>
    `${f.entity} — paid ${dollar(f.amount)} with no active business registration`,
  vendor_d10: (f) =>
    `${f.entity} — contract ballooned far beyond its original value (${dollar(f.amount)})`,
  vendor_d11: (f) => `${f.entity} — bidding window left open an unusually short time`,
  vendor_d12: (f) =>
    `${f.entity} — payments cluster just below several approval thresholds`,
  vendor_d13: (f) =>
    `${f.entity} (${dollar(f.amount)}) — registered at a home address or mail drop`,
  vendor_d14: (f) => `${f.entity} — contract description is unusually vague`,
  vendor_d15: (f) => `${f.entity} — shares a single address with other city vendors`,
  vendor_d16: (f) =>
    `${f.entity} — grant money cycling through pass-through sponsors`,
  vendor_d19: (f) =>
    `${f.entity} — no-bid (sole source) contract awarded without competition (${dollar(f.amount)})`,
  vendor_d20: (f) =>
    `${f.entity} — paid ${dollar(f.amount)} despite being on a debarment list`,
  vendor_d22: (f) =>
    `${f.entity} — "emergency" contract that kept growing after the emergency (${dollar(f.amount)})`,
  vendor_d23: (f) =>
    `${f.entity} — contracts priced to land just under an approval ceiling`,
  // ── Infrastructure ───────────────────────────────────────────────────────
  infra_d1: (f) => `${f.entity} — 311 response times have gotten significantly worse`,
  infra_d2: (f) => `${f.entity} — large service gap between districts`,
  infra_d3: (f) => `${f.entity} — share of 311 requests actually resolved is falling`,
  infra_d4: (f) => `${f.entity} — repeated service failures clustered in one area`,
  infra_d5: (f) =>
    `${f.entity} — spending is far out of line with its budget (${dollar(f.amount)})`,
  infra_d5_yoy: (f) =>
    `${f.entity} — spending grew far faster than inflation year-over-year`,
  infra_d6: (f) => `${f.entity} — permits fast-tracked unusually quickly`,
  infra_d7: (f) => `${f.entity} — spending bunched suspiciously at year-end`,
  infra_d8: (f) => `${f.entity} — hotspot of pavement / sidewalk failures`,
  infra_d21: (f) =>
    `${f.entity} — budget sitting idle, spent far below plan (${dollar(f.amount)})`,
  // ── Integrity ────────────────────────────────────────────────────────────
  integrity_rd1: (f) =>
    `${f.entity} — left the city payroll then was paid as a vendor`,
  integrity_rd2: (f) =>
    `${f.entity} — on the city payroll while also billing as a vendor`,
  integrity_rd3: (f) =>
    `${f.entity} — drawing pay from multiple departments at once`,
  integrity_rd4: (f) =>
    `${f.entity} — overtime hours leave no time to run their own business`,
  // ── Influence ────────────────────────────────────────────────────────────
  influence_d17: (f) =>
    `${f.entity} — contract awards line up with lobbyist contacts`,
  influence_d18: (f) =>
    `${f.entity} — campaign contribution closely timed to a contract award (${dollar(f.amount)})`,
  influence_d20i: (f) =>
    `${f.entity} — behested payment that looks like quid pro quo`,
  // ── Nonprofit ────────────────────────────────────────────────────────────
  nonprofit_np5: (f) =>
    `${f.entity} — collects city grants while also billing as a commercial vendor`,
  nonprofit_np6: (f) =>
    `${f.entity} — grant funding ramped up fast across new line items`,
}

// One-line, pattern-level explanation of WHY each detector's pattern is a red
// flag — generic (not entity-specific), plain language, for an ordinary reader.
const WHY: Record<string, string> = {
  payroll_d1: "Overtime above base pay can mean padded hours or chronic understaffing.",
  payroll_d2: "When a few people collect most of the overtime, controls may be weak.",
  payroll_d3: "A pay spike in a final year inflates the pension it locks in.",
  payroll_d4: "Overtime far above comparable departments suggests weak oversight.",
  payroll_d5: "Real payrolls follow predictable digit patterns; these don't, a fabrication signal.",
  payroll_d6: "These hours are physically impossible to work — a timesheet or payroll red flag.",
  payroll_d6_ghost: "Overtime paid with no base salary can indicate a ghost employee.",
  payroll_d6_headcomp: "Staff out-earning their own department head can signal misclassification.",
  payroll_d7: "Large 'other pay' cash-outs can hide comp-time or leave abuse.",
  vendor_d1: "Duplicate payments mean the city may have paid the same bill twice.",
  vendor_d2: "Payments rerouted to a new account are a classic fraud vector.",
  vendor_d3: "Amounts that don't follow natural patterns can indicate manipulation.",
  vendor_d4: "Payments far larger than peer vendors warrant a closer look.",
  vendor_d5: "Many round-dollar amounts suggest manual overrides rather than real invoices.",
  vendor_d6: "One vendor dominating a department's spend reduces competition.",
  vendor_d7: "Charging departments different prices for the same thing can mean overbilling.",
  vendor_d7b: "Paying above-market rates for commodities wastes money.",
  vendor_d8: "Splitting orders to stay under the approval limit dodges oversight.",
  vendor_d9: "Paying a vendor with no business registration is a ghost-vendor risk.",
  vendor_d10: "Contracts that balloon past their original value escape competitive review.",
  vendor_d11: "A short bid window limits competition and can favor an insider.",
  vendor_d12: "Clustering payments under approval limits dodges sign-off.",
  vendor_d13: "Vendors at homes or mail drops can be shell companies.",
  vendor_d14: "Vague contract descriptions make spending hard to audit.",
  vendor_d15: "Vendors sharing one address may be related or shell entities.",
  vendor_d16: "Grant money cycling through sponsors obscures who actually gets paid.",
  vendor_d19: "No-bid contracts skip competitive pricing, so the city may overpay.",
  vendor_d20: "Paying a debarred vendor violates exclusion rules.",
  vendor_d22: "'Emergency' contracts that keep growing bypass normal procurement.",
  vendor_d23: "Pricing contracts just under an approval ceiling avoids higher scrutiny.",
  infra_d1: "Slower response times can signal mismanagement or under-resourcing.",
  infra_d2: "Large service gaps between districts raise equity concerns.",
  infra_d3: "A falling resolution rate means more requests go unaddressed.",
  infra_d4: "Repeated failures in one area point to a deeper unfixed problem.",
  infra_d5: "Spending far off budget can mean poor planning or hidden costs.",
  infra_d5_yoy: "Spending growth far above inflation warrants scrutiny.",
  infra_d6: "Permits approved unusually fast can indicate favoritism or skipped review.",
  infra_d7: "Year-end spending spikes often mean 'use it or lose it' waste.",
  infra_d8: "Failure hotspots flag deferred maintenance.",
  infra_d21: "Budgeted money sitting unspent may be padding or poor forecasting.",
  integrity_rd1: "Leaving the payroll then billing as a vendor can be a conflict of interest.",
  integrity_rd2: "Being on payroll while also a paid vendor is a conflict of interest.",
  integrity_rd3: "Drawing pay from multiple departments at once can mean double-dipping.",
  integrity_rd4: "Heavy overtime leaves little time to run a side business — one may be miscounted.",
  influence_d17: "Contract awards that track lobbyist contacts raise undue-influence concerns.",
  influence_d18: "Donations timed to contract awards raise pay-to-play concerns.",
  influence_d20i: "Payments made at an official's behest can mask quid pro quo.",
  nonprofit_np5: "Taking grants while also billing as a vendor invites self-dealing.",
  nonprofit_np6: "Grants ramped fast across new line items can outrun oversight.",
}

/**
 * One-line plain-English reason the finding's pattern is suspicious, or "" if
 * the detector has no registered explanation. Pattern-level, not entity-
 * specific — answers "why should I care?" for a non-expert.
 */
export function whySuspicious(f: WasteFinding): string {
  return WHY[canonicalNarratorKey(f.tool)] ?? ""
}

/** Resolve a finding's display tool to its canonical narrator key. */
export function canonicalNarratorKey(tool: string | null | undefined): string {
  if (!tool) return ""
  return TOOL_TO_CANONICAL[tool] ?? tool
}

/**
 * Plain-English headline for a finding. Prefers a tuned template; falls back to
 * any backend headline, then to "<entity> — <metric> <metricDetail>".
 */
export function deriveHeadline(f: WasteFinding): string {
  const builder = HEADLINES[canonicalNarratorKey(f.tool)]
  if (builder) {
    const out = builder(f).replace(/\s+\(\)/g, "").replace(/\s{2,}/g, " ").trim()
    if (out) return out
  }
  if (f.headline && f.headline.trim()) return f.headline.trim()
  const metric = [f.metric, f.metricDetail].filter(Boolean).join(" ").trim()
  if (f.entity && metric) return `${f.entity} — ${metric}`
  return metric || f.entity || f.subcategory || f.category
}

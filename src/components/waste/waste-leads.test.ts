import type { WasteFinding } from "@/lib/apiClient"
import { makeFinding } from "@/components/waste/test-utils"
import {
  PUBLIC_SAFETY_OT_LABEL,
  buildLeadContext,
  evidenceGrade,
  extractPayee,
  findingLead,
  isStructuralFinding,
  isStructuralPayee,
  sortByLead,
  topLeads,
} from "@/components/waste/waste-leads"

const f = (over: Partial<WasteFinding>): WasteFinding =>
  makeFinding({
    category: "Contracts & Procurement",
    amount: 1_000_000,
    ...over,
  } as Partial<WasteFinding>)

describe("evidenceGrade", () => {
  it("grades by the longest matching tool prefix", () => {
    expect(evidenceGrade("D8 Split POs (Same Day)")).toBe("direct")
    expect(evidenceGrade("D8 Split POs (Rolling 30-Day)")).toBe("pattern")
    expect(evidenceGrade("D8b Threshold-Hugging Vendor")).toBe("direct")
    expect(evidenceGrade("D8b Threshold-Hugging Vendor (Former Limit)")).toBe("pattern")
    expect(evidenceGrade("D6 Hours Feasibility (Hard Cap)")).toBe("direct")
    expect(evidenceGrade("D6 Hours Feasibility (Head-comp comparison)")).toBe("context")
    expect(evidenceGrade("D5 Budget Variance (YoY Growth)")).toBe("context")
    expect(evidenceGrade("Some New Detector")).toBe("pattern")
  })
})

describe("structural payees", () => {
  it("recognises governments, pensions, insurers, utilities and banks", () => {
    for (const name of [
      "BOARD OF EDUCATION",
      "HAMILTON COUNTY",
      "City of Cincinnati Retirement System",
      "COMMUNITY INSURANCE CO",
      "DUKE ENERGY",
      "U.S. BANK01 NATIONAL.ASSOCIATION",
      "CHICAGO TRANSITY AUTHORITY.",
      "Single Payment Payees",
    ]) {
      expect(isStructuralPayee(name), name).toBe(true)
    }
  })

  it("leaves ordinary vendors alone", () => {
    for (const name of [
      "CITY ELECTRIC SUPPLY",
      "STATE STREET DELI",
      "BANKS ENGINEERING",
      "HABITAT POTENTIAL",
      "UNITED WAY OF GREATER CINTI",
    ]) {
      expect(isStructuralPayee(name), name).toBe(false)
    }
  })

  it("pulls the payee out of the three entity shapes", () => {
    expect(extractPayee("Finance, Risk Management → COMMUNITY INSURANCE CO")).toBe(
      "COMMUNITY INSURANCE CO",
    )
    expect(extractPayee("HAMILTON COUNTY (Health)")).toBe("HAMILTON COUNTY")
    expect(extractPayee("ACME")).toBe("ACME")
  })

  it("treats concentration on an insurer as structural, a split order as not", () => {
    expect(
      isStructuralFinding(
        f({ tool: "D6 Concentration", entity: "Risk Mgmt → COMMUNITY INSURANCE CO" }),
      ),
    ).toBe(true)
    expect(
      isStructuralFinding(
        f({ tool: "D8 Split POs (Same Day)", entity: "COUNTY OF COOK (DPW)" }),
      ),
    ).toBe(false)
  })
})

describe("findingLead", () => {
  it("prefers the backend's grading when the payload carries it", () => {
    const lead = findingLead(
      f({
        tool: "D5 Budget Variance",
        lead_tier: "lead",
        lead_score: 77,
        lead_reasons: ["from the backend"],
        known_case: null,
      }),
    )
    expect(lead).toMatchObject({ tier: "lead", score: 77, reasons: ["from the backend"] })
  })

  it("never makes a lead out of dollars alone", () => {
    const lead = findingLead(
      f({
        tool: "D5 Budget Variance",
        entity: "Risk Management",
        department: "Risk Management",
        amount: 197_000_000,
        category: "Infrastructure & Services",
      }),
    )
    expect(lead.tier).toBe("context")
  })

  it("makes direct evidence on a named payee a strong lead", () => {
    const lead = findingLead(
      f({ tool: "D8b Threshold-Hugging Vendor", entity: "HABITAT POTENTIAL (REC)", amount: 187_000 }),
    )
    expect(lead.tier).toBe("lead")
    expect(lead.reasons.join(" ")).toContain("specific payee")
  })

  it("lifts a pattern to a lead when a direct detector flags the same vendor", () => {
    const sole = f({ id: "a", tool: "D25 Contract Growth After Award", entity: "ACME CORP (DPW)", amount: 5_000_000 })
    const drift = f({ id: "b", tool: "D10 Contract Drift", entity: "ACME CORP — Paving", amount: 900_000 })
    const ctx = buildLeadContext([sole, drift])
    expect(findingLead(sole).tier).toBe("review")
    const lead = findingLead(sole, ctx)
    expect(lead.tier).toBe("lead")
    expect(lead.reasons.join(" ")).toContain("Corroborated by 1 other detector")
  })

  it("lifts a direct finding only on another direct detector's say-so", () => {
    const profile = f({ id: "p", tool: "D8b Threshold-Hugging Vendor", entity: "WATTCO (Fire)", amount: 362_870 })
    const soft = f({ id: "s", tool: "D25 Contract Growth After Award", entity: "WATTCO (Fire)", amount: 400_000 })
    const hard = f({ id: "h", tool: "D10 Contract Drift", entity: "WATTCO — Hose", amount: 90_000 })
    expect(findingLead(profile, buildLeadContext([profile, soft])).reasons.join(" ")).not.toContain("Corroborated")
    expect(findingLead(profile, buildLeadContext([profile, hard])).reasons.join(" ")).toContain("Corroborated by 1 other detector")
  })

  it("gives no corroboration credit to department-level findings", () => {
    const a = f({ id: "a", tool: "D1 OT-to-Base Ratio", entity: "Fleet", department: "Fleet", category: "Payroll & Compensation" })
    const b = f({ id: "b", tool: "D2 Pareto Concentration", entity: "Fleet", department: "Fleet", category: "Payroll & Compensation" })
    const lead = findingLead(a, buildLeadContext([a, b]))
    expect(lead.tier).toBe("review")
    expect(lead.reasons.join(" ")).not.toContain("Corroborated")
  })

  it("marks a live finding that matches a confirmed case as already public", () => {
    const confirmed = f({ id: "c", category: "Confirmed Cases", tool: "B-D19 Sole Source", entity: "Favorite Healthcare Staffing" })
    const live = f({ id: "l", tool: "D25 Contract Growth After Award", entity: "Favorite Healthcare Staffing, Inc. (DFSS)" })
    expect(findingLead(live, buildLeadContext([confirmed, live])).knownCase).toBe(
      "Favorite Healthcare Staffing",
    )
  })

  it("labels public-safety overtime as already public, but not library overtime", () => {
    const police = f({ tool: "D1 OT-to-Base Ratio", entity: "Police", department: "Police", category: "Payroll & Compensation" })
    const library = f({ tool: "D1 OT-to-Base Ratio", entity: "Public Library", department: "Public Library", category: "Payroll & Compensation" })
    expect(findingLead(police).knownCase).toBe(PUBLIC_SAFETY_OT_LABEL)
    expect(findingLead(library).knownCase).toBeNull()
  })
})

describe("ranking", () => {
  const strong = f({ id: "strong", tool: "D8b Threshold-Hugging Vendor", entity: "HABITAT POTENTIAL (REC)", amount: 187_000 })
  const look = f({ id: "look", tool: "D25 Contract Growth After Award", entity: "ACME CORP (DPW)", amount: 50_000_000 })
  const background = f({ id: "bg", tool: "D3 Benford (Chi-Square Suite)", entity: "ZED LLC", amount: 900_000_000 })

  it("sorts strongest evidence first and sinks dismissed findings", () => {
    expect(sortByLead([background, look, strong]).map((r) => r.finding.id)).toEqual([
      "strong",
      "look",
      "bg",
    ])
    const dismissed = { ...strong, latest_disposition: { disposition: "false_positive" } } as WasteFinding
    expect(sortByLead([dismissed, look]).map((r) => r.finding.id)).toEqual(["look", "strong"])
  })

  it("shortlists new leads only, one row per entity", () => {
    const secondOnSameVendor = f({ id: "strong2", tool: "D8 Split POs (Same Day)", entity: "HABITAT POTENTIAL (REC)", amount: 20_000 })
    const police = f({ id: "pol", tool: "D6 Hours Feasibility (Hard Cap)", entity: "Police", department: "Police", category: "Payroll & Compensation", amount: 9_000_000 })
    const confirmed = f({ id: "conf", category: "Confirmed Cases", tool: "B-D19 Sole Source", entity: "Recology" })
    const top = topLeads([background, look, strong, secondOnSameVendor, police, confirmed])
    expect(top.leads.map((r) => r.finding.id)).toEqual(["strong", "look"])
    expect(top.knownCount).toBe(1)
    expect(top.strongCount).toBe(3)
  })

  it("gives a department with direct evidence its place, and caps one story at three rows", () => {
    const dept = f({
      id: "dept",
      tool: "D8b Threshold-Hugging Department",
      entity: "City Administrator",
      department: "City Administrator",
      amount: 9_174_459,
    })
    const vendors = ["T & S TRADING", "ADVANCE AUTO CARE", "A D BRAKES", "NEW RELIANCE", "GCS"].map(
      (name, i) =>
        f({
          id: `v${i}`,
          tool: "D8b Threshold-Hugging Vendor",
          entity: `${name} (City Administrator)`,
          department: "City Administrator",
          amount: 600_000 - i * 10_000,
        }),
    )
    const other = f({ id: "other", tool: "D10 Contract Drift", entity: "ZED — Paving", department: "DPW", amount: 300_000 })
    const top = topLeads([...vendors, dept, other], 4)
    // The department leads (direct evidence, largest), two vendors illustrate
    // it, and the remaining vendor rows give way to a different story.
    expect(top.leads.map((r) => r.finding.id)).toEqual(["dept", "v0", "v1", "other"])
    expect(findingLead(dept).reasons.join(" ")).toContain("Names a department and the records behind it")
  })

  it("skips 'N detectors flagged this entity' roll-ups in favour of the finding itself", () => {
    const rollup = f({ id: "MULTI-1", tool: "Entity Consolidation (3 signals)", entity: "ABC VALVE (AIR)", amount: 448_711, supporting_findings: ["a"] })
    const top = topLeads([rollup, strong])
    expect(top.leads.map((r) => r.finding.id)).toEqual(["strong"])
  })

  it("lets one detector take at most five worth-a-look rows", () => {
    const growth = ["A", "B", "C", "D", "E", "F", "G"].map((n, i) =>
      f({ id: `g${i}`, tool: "D25 Contract Growth After Award", entity: `${n} CORP — Contract`, department: `Dept ${n}`, amount: 90_000_000 - i }),
    )
    const pair = f({ id: "pair", tool: "D24 Repeat Payment Pair", entity: "MEGEN (Facilities)", department: "Facilities", amount: 380_687.4 })
    const top = topLeads([...growth, pair], 6)
    expect(top.leads.map((r) => r.finding.id)).toEqual(["g0", "g1", "g2", "g3", "g4", "pair"])
  })

  it("fills empty slots with held-back rows, never with a weaker finding on the same entity", () => {
    const pairs = ["A", "B", "C", "D", "E", "F", "G"].map((n, i) =>
      f({ id: `p${i}`, tool: "D24 Repeat Payment Pair", entity: `${n} CO (Facilities)`, department: "Facilities", amount: 400_000 - i * 10_000 }),
    )
    // A background-grade finding on entity F, lifted to "worth a look" only
    // because the pair corroborates it: it must not stand in for the pair.
    const weaker = f({ id: "weak-f", tool: "NP5 Nonprofit-Vendor Overlap", entity: "F CO", amount: 24_000_000 })
    const top = topLeads([...pairs, weaker])
    expect(top.leads.map((r) => r.finding.id)).toEqual(["p0", "p1", "p2", "p3", "p4", "p5", "p6"])
  })
})

import { describe, it, expect } from "vitest"
import type { WasteFinding } from "@/lib/apiClient"
import {
  impactOf,
  rankFindings,
  buildEntityGroups,
} from "./waste-ranked-findings"

function finding(over: Partial<WasteFinding>): WasteFinding {
  return {
    id: "x",
    category: "contracts",
    subcategory: "Test",
    severity: "medium",
    entity: "Acme",
    metric: "",
    metricDetail: "",
    amount: null,
    description: "",
    tool: "",
    confidence: "Medium",
    confidence_reason: null,
    confidence_score: 0.5,
    estimated_dollar_impact: null,
    corroboration_count: 0,
    data_completeness: 1,
    priority_score: 50,
    is_partial_data: false,
    truncated_total: null,
    caveat: null,
    narrative: null,
    headline: null,
    signal_tier: null,
    finding_report: null,
    ...over,
  }
}

describe("impactOf", () => {
  it("prefers estimated_dollar_impact over amount", () => {
    expect(impactOf(finding({ estimated_dollar_impact: 100, amount: 5 }))).toBe(100)
  })
  it("falls back to amount when no estimate", () => {
    expect(impactOf(finding({ estimated_dollar_impact: null, amount: 42 }))).toBe(42)
  })
  it("is zero when both missing", () => {
    expect(impactOf(finding({ estimated_dollar_impact: null, amount: null }))).toBe(0)
  })
})

describe("rankFindings", () => {
  const a = finding({ id: "a", amount: 100, confidence_score: 0.2, priority_score: 90 })
  const b = finding({ id: "b", amount: 300, confidence_score: 0.9, priority_score: 40 })
  const c = finding({ id: "c", amount: 200, confidence_score: 0.5, priority_score: 60 })

  it("ranks by impact descending", () => {
    expect(rankFindings([a, b, c], "impact", "desc").map((f) => f.id)).toEqual([
      "b",
      "c",
      "a",
    ])
  })
  it("ranks by confidence descending (continuous, not bucketed)", () => {
    expect(rankFindings([a, b, c], "confidence", "desc").map((f) => f.id)).toEqual([
      "b",
      "c",
      "a",
    ])
  })
  it("ranks by priority descending", () => {
    expect(rankFindings([a, b, c], "priority", "desc").map((f) => f.id)).toEqual([
      "a",
      "c",
      "b",
    ])
  })
  it("honors ascending direction", () => {
    expect(rankFindings([a, b, c], "impact", "asc").map((f) => f.id)).toEqual([
      "a",
      "c",
      "b",
    ])
  })
  it("breaks metric ties by priority_score", () => {
    const t1 = finding({ id: "t1", amount: 100, priority_score: 10 })
    const t2 = finding({ id: "t2", amount: 100, priority_score: 80 })
    expect(rankFindings([t1, t2], "impact", "desc").map((f) => f.id)).toEqual([
      "t2",
      "t1",
    ])
  })
})

describe("buildEntityGroups", () => {
  const acme1 = finding({ id: "1", entity: "Acme", amount: 100, confidence_score: 0.4, is_new: true })
  const acme2 = finding({ id: "2", entity: "Acme", amount: 200, confidence_score: 0.8 })
  const beta1 = finding({ id: "3", entity: "Beta", amount: 500, confidence_score: 0.3 })

  it("groups findings by entity", () => {
    const groups = buildEntityGroups([acme1, acme2, beta1], "impact", "desc")
    const acme = groups.find((g) => g.entity === "Acme")!
    expect(acme.findings.map((f) => f.id).sort()).toEqual(["1", "2"])
  })

  it("aggregates total impact and max confidence per entity", () => {
    const groups = buildEntityGroups([acme1, acme2, beta1], "impact", "desc")
    const acme = groups.find((g) => g.entity === "Acme")!
    expect(acme.totalImpact).toBe(300)
    expect(acme.maxConfidence).toBeCloseTo(0.8)
    expect(acme.newCount).toBe(1)
  })

  it("orders entities by summed impact when ranking by impact", () => {
    // Beta has one $500 finding; Acme sums to $300. Beta should lead.
    const groups = buildEntityGroups([acme1, acme2, beta1], "impact", "desc")
    expect(groups.map((g) => g.entity)).toEqual(["Beta", "Acme"])
  })

  it("orders entities by max confidence when ranking by confidence", () => {
    // Acme max confidence 0.8 beats Beta 0.3.
    const groups = buildEntityGroups([acme1, acme2, beta1], "confidence", "desc")
    expect(groups.map((g) => g.entity)).toEqual(["Acme", "Beta"])
  })

  it("buckets blank entity names under a placeholder", () => {
    const groups = buildEntityGroups([finding({ id: "z", entity: "" })], "impact", "desc")
    expect(groups[0].entity).toBe("(unattributed)")
  })
})

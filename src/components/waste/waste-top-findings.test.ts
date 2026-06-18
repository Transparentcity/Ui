import { describe, it, expect } from "vitest"
import { selectTopFindings } from "./waste-ranked-findings"
import { makeFinding } from "./test-utils"

describe("selectTopFindings", () => {
  it("ranks critical above high above medium", () => {
    const findings = [
      makeFinding({ id: "m", severity: "medium", confidence: "High", amount: 9_000_000 }),
      makeFinding({ id: "c", severity: "critical", confidence: "High", amount: 1000 }),
      makeFinding({ id: "h", severity: "high", confidence: "High", amount: 1000 }),
    ]
    const top = selectTopFindings(findings, 3)
    expect(top.map((f) => f.id)).toEqual(["c", "h", "m"])
  })

  it("breaks severity ties by confidence then impact", () => {
    const findings = [
      makeFinding({ id: "lowconf", severity: "high", confidence: "Medium", amount: 5_000_000 }),
      makeFinding({ id: "hiconf", severity: "high", confidence: "High", amount: 1000 }),
    ]
    expect(selectTopFindings(findings)[0].id).toBe("hiconf")
  })

  it("excludes low-confidence, partial-data, and convergence meta-findings", () => {
    const findings = [
      makeFinding({ id: "keep", severity: "critical", confidence: "High" }),
      makeFinding({ id: "low", severity: "critical", confidence: "Low" }),
      makeFinding({ id: "partial", severity: "critical", confidence: "High", is_partial_data: true }),
      makeFinding({ id: "conv", severity: "critical", confidence: "High", category: "convergence" }),
    ]
    const ids = selectTopFindings(findings).map((f) => f.id)
    expect(ids).toContain("keep")
    expect(ids).not.toContain("low")
    expect(ids).not.toContain("partial")
    expect(ids).not.toContain("conv")
  })

  it("caps the result at n", () => {
    const findings = Array.from({ length: 12 }, (_, i) =>
      makeFinding({ id: `f${i}`, severity: "high", confidence: "High", amount: i * 1000 })
    )
    expect(selectTopFindings(findings, 5)).toHaveLength(5)
  })

  it("returns empty when nothing qualifies", () => {
    expect(
      selectTopFindings([makeFinding({ severity: "critical", confidence: "Low" })])
    ).toEqual([])
  })
})

import { describe, it, expect } from "vitest"
import { stripDetectorCodes } from "./detector-info"

describe("stripDetectorCodes", () => {
  it("removes a single trailing detector-code parenthetical", () => {
    expect(stripDetectorCodes("Triggered by 3 detectors (D1, D7, NP4)")).toBe(
      "Triggered by 3 detectors"
    )
  })

  it("removes a single code and tidies punctuation", () => {
    expect(stripDetectorCodes("Overtime abuse (RD2).")).toBe("Overtime abuse.")
  })

  it("removes a mid-sentence code group without leaving double spaces", () => {
    expect(stripDetectorCodes("Pattern (D3, RD2) found in payroll")).toBe(
      "Pattern found in payroll"
    )
  })

  it("keeps non-code parentheticals untouched", () => {
    expect(stripDetectorCodes("Sheriff (SF) paid $456K")).toBe(
      "Sheriff (SF) paid $456K"
    )
    expect(stripDetectorCodes("spent only 8% of budget (of $5.7M)")).toBe(
      "spent only 8% of budget (of $5.7M)"
    )
  })

  it("handles empty / null input", () => {
    expect(stripDetectorCodes("")).toBe("")
    expect(stripDetectorCodes(null)).toBe("")
    expect(stripDetectorCodes(undefined)).toBe("")
  })

  it("leaves a clean plain-English headline unchanged", () => {
    const h = "Public Works — overtime amounts don't follow natural number patterns"
    expect(stripDetectorCodes(h)).toBe(h)
  })
})

import { describe, it, expect } from "vitest"
import { formatDetectorKey, stripDetectorCodes } from "./detector-info"

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

describe("formatDetectorKey", () => {
  it("resolves family-coded keys through the detector table", () => {
    expect(formatDetectorKey("infrastructure_d5_budget_variance")).toBe(
      "D5 Budget Variance",
    )
    expect(formatDetectorKey("infrastructure_d6_permit_fast_tracking")).toBe(
      "D6 Permit Fast Tracking",
    )
    expect(formatDetectorKey("vendor_d7b_commodity_price")).toBe(
      "D7b Commodity Price Disparity",
    )
    expect(formatDetectorKey("integrity_rd2_dual_employment")).toBe(
      "RD2 Dual Employment",
    )
    expect(formatDetectorKey("nonprofit_np5_vendor_overlap")).toBe(
      "NP5 Nonprofit-Vendor Overlap",
    )
  })

  it("does not borrow a same-code name from another family", () => {
    // payroll D21 does not exist; must not resolve to infrastructure D21.
    expect(formatDetectorKey("payroll_d21_something_new")).toBe(
      "D21 Something new",
    )
  })

  it("labels composite keys in plain English", () => {
    expect(
      formatDetectorKey(
        "entity_consolidation_4_signals__multi_signal_investigation_target",
      ),
    ).toBe("Multiple signals on one entity (4)")
    expect(
      formatDetectorKey("convergence_detector_3d_3t_full_fraud_triangle"),
    ).toBe("Cross-domain convergence (full fraud triangle)")
  })

  it("humanizes unknown keys and handles empty input", () => {
    expect(formatDetectorKey("some_new_detector")).toBe("Some new detector")
    expect(formatDetectorKey(null)).toBe("—")
    expect(formatDetectorKey("  ")).toBe("—")
  })
})

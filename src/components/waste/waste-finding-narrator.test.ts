import { describe, it, expect } from "vitest"
import {
  deriveHeadline,
  canonicalNarratorKey,
  whySuspicious,
  localKeyFromBackendKey,
  adminHeadline,
  adminWhy,
} from "./waste-finding-narrator"
import { makeFinding } from "./test-utils"

describe("admin/waste narrator (keyed on backend detector_key)", () => {
  it("resolves backend canonical keys to local narrator keys", () => {
    expect(localKeyFromBackendKey("payroll_d6_hours")).toBe("payroll_d6")
    expect(localKeyFromBackendKey("infrastructure_d5_budget_variance")).toBe("infra_d5")
    expect(localKeyFromBackendKey("vendor_d7b_commodity_price_disparity")).toBe("vendor_d7b")
    expect(localKeyFromBackendKey("integrity_rd3_cross_dept_double_dip")).toBe("integrity_rd3")
    expect(localKeyFromBackendKey("influence_d18_pay_to_play")).toBe("influence_d18")
    expect(localKeyFromBackendKey("nonprofit_np1_cross_grant_double_dip")).toBe("nonprofit_np1")
    // alias: backend has no suffix-free local key for vendor d21
    expect(localKeyFromBackendKey("vendor_d21_vendor_location_verification")).toBe("vendor_d21_location")
  })

  it("builds a tuned headline from a detector_key", () => {
    const h = adminHeadline("vendor_d19_sole_source", "Color Health", 84_000_000, "raw backend headline")
    expect(h.toLowerCase()).toContain("no-bid")
    expect(h).toContain("Color Health")
  })

  it("falls back to the backend headline for an unmapped detector_key", () => {
    expect(adminHeadline("totally_unknown_thing", "Dept", null, "Backend headline")).toBe(
      "Backend headline"
    )
  })

  it("gives a why-line keyed on detector_key", () => {
    expect(adminWhy("payroll_d6_hours").toLowerCase()).toContain("physically impossible")
    expect(adminWhy("unknown_x")).toBe("")
  })
})

describe("narrator coverage", () => {
  // Every detector tool the backend can emit should get a tuned headline AND a
  // why-line in the UI, not a generic fallback. This list mirrors the backend
  // _TOOL_TO_CANONICAL; add here when a new detector ships.
  const BACKEND_TOOLS = [
    "D1 SSS Duplicate", "D2 SSD Misdirected", "D3 Benford (Chi-Square Suite)",
    "D4 RSF", "D5 Round Numbers", "D6 Concentration", "D7 Price Disparity",
    "D7b Commodity Price", "D8 Split POs (Same Day)", "D9 Ghost Vendor",
    "D10 Contract Drift", "D11 Short Bid Window", "D12 Adaptive Thresholds",
    "D13 Residential/Mail Drop Vendor", "D14 Vague Contract Titles",
    "D15 Address Clustering", "D16 Grant Churn", "D19 Sole Source",
    "D20 Debarment Bypass", "D21 Vendor Location Verification",
    "D22 Emergency Contract Runaway",
    "D1 OT-to-Base Ratio", "D2 Pareto Concentration", "D3 YoY Compensation Spike",
    "D4 Department OT Outlier (z-score)", "D5 Benford's Law (Overtime, multi-test)",
    "D6 Hours Feasibility (Hard Cap)", "D7 Comp Time Manipulation",
    "D1 Response Time Deterioration", "D2 District Equity Gap",
    "D3 Resolution Rate Decline", "D4 Spatial Clustering", "D5 Budget Variance",
    "D7 Budget Timing Anomaly", "D6 Permit Fast Tracking",
    "D8 Failure-Risk Hotspots", "D21 Work Order Overbudgeting",
    "RD1 Revolving Door", "RD2 Dual Employment", "RD3 Cross-Dept Double Dip",
    "RD4 Time Feasibility", "D17 Lobbyist Influence", "D18 Pay-to-Play",
    "D20i Behested Quid Pro Quo", "NP1 Cross-Grant Double Dipping",
    "NP2 Ineligible Expense Scan", "NP3 Fiscal Sponsor Opacity",
    "NP4 Charity Registration Compliance", "NP5 Nonprofit-Vendor Overlap",
  ]

  it.each(BACKEND_TOOLS)("has a tuned headline + why for %s", (tool) => {
    const f = makeFinding({ tool, entity: "Test Entity", headline: "", metric: "", metricDetail: "" })
    const headline = deriveHeadline(f)
    // Tuned headline starts with the entity and isn't an empty fallback.
    expect(headline.startsWith("Test Entity")).toBe(true)
    expect(headline.length).toBeGreaterThan("Test Entity".length + 5)
    // And a non-empty why-line.
    expect(whySuspicious(f).length).toBeGreaterThan(10)
  })
})

describe("whySuspicious", () => {
  it("gives a plain-language reason for no-bid contracts", () => {
    expect(whySuspicious(makeFinding({ tool: "D19 Sole Source" }))).toBe(
      "No-bid contracts skip competitive pricing, so the city may overpay."
    )
  })

  it("explains pay-to-play timing", () => {
    expect(whySuspicious(makeFinding({ tool: "D18 Pay-to-Play" }))).toContain(
      "pay-to-play"
    )
  })

  it("collapses D6 hours variants to one reason", () => {
    expect(
      whySuspicious(makeFinding({ tool: "D6 Hours Feasibility (Peer Adjusted)" }))
    ).toContain("physically impossible")
  })

  it("returns empty string for an unmapped detector (so the UI can hide it)", () => {
    expect(whySuspicious(makeFinding({ tool: "Unmapped Detector Z" }))).toBe("")
  })
})

describe("canonicalNarratorKey", () => {
  it("collapses the D6 Hours variants onto one key", () => {
    expect(canonicalNarratorKey("D6 Hours Feasibility (Hard Cap)")).toBe("payroll_d6")
    expect(canonicalNarratorKey("D6 Hours Feasibility (Peer Adjusted)")).toBe(
      "payroll_d6"
    )
  })

  it("passes through unknown tools unchanged", () => {
    expect(canonicalNarratorKey("Totally New Detector")).toBe("Totally New Detector")
    expect(canonicalNarratorKey(null)).toBe("")
  })
})

describe("deriveHeadline", () => {
  it("leads with the entity and a concrete dollar figure where one exists", () => {
    const h = deriveHeadline(
      makeFinding({
        tool: "D19 Sole Source",
        entity: "Favorite Healthcare",
        amount: 393_000_000,
      })
    )
    expect(h).toContain("Favorite Healthcare")
    expect(h.toLowerCase()).toContain("no-bid")
    expect(h).toMatch(/\$\d/)
  })

  it("rewrites the vague Benford headline into a plain 'why'", () => {
    const h = deriveHeadline(
      makeFinding({
        tool: "D5 Benford's Law (Overtime, multi-test)",
        entity: "Public Works",
      })
    )
    // Must NOT be bare jargon; must say something a non-expert understands.
    expect(h.toLowerCase()).not.toContain("statistically")
    expect(h.toLowerCase()).toContain("natural")
    expect(h).toContain("Public Works")
  })

  it("gives D6 hours a physical, plain-English hook", () => {
    const h = deriveHeadline(
      makeFinding({
        tool: "D6 Hours Feasibility (Hard Cap)",
        entity: "Sheriff",
      })
    )
    expect(h.toLowerCase()).toContain("physically possible")
  })

  it("narrates the recently-fixed detectors (D18, RD3, NP5)", () => {
    expect(
      deriveHeadline(makeFinding({ tool: "D18 Pay-to-Play", entity: "Swinerton" }))
        .toLowerCase()
    ).toContain("contribution")
    expect(
      deriveHeadline(
        makeFinding({ tool: "RD3 Cross-Dept Double Dip", entity: "J. Doe" })
      ).toLowerCase()
    ).toContain("multiple departments")
    expect(
      deriveHeadline(
        makeFinding({ tool: "NP5 Nonprofit-Vendor Overlap", entity: "Acme Org" })
      ).toLowerCase()
    ).toContain("grant")
  })

  it("falls back to the backend headline for an unmapped detector", () => {
    const h = deriveHeadline(
      makeFinding({
        tool: "Unmapped Detector X",
        headline: "A perfectly good backend headline",
        entity: "Dept",
      })
    )
    expect(h).toBe("A perfectly good backend headline")
  })

  it("falls back to entity + metric when neither template nor headline exists", () => {
    const h = deriveHeadline(
      makeFinding({
        tool: "Unmapped Detector Y",
        headline: "",
        entity: "Parks",
        metric: "3 payments",
        metricDetail: "of $50,000 each",
      })
    )
    expect(h).toBe("Parks — 3 payments of $50,000 each")
  })

  it("never emits a dangling empty parenthesis when amount is null", () => {
    const h = deriveHeadline(
      makeFinding({ tool: "D19 Sole Source", entity: "Vendor Z", amount: null })
    )
    expect(h).not.toContain("()")
    expect(h.trim()).toBe(h)
  })
})

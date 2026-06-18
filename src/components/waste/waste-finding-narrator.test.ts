import { describe, it, expect } from "vitest"
import {
  deriveHeadline,
  canonicalNarratorKey,
  whySuspicious,
} from "./waste-finding-narrator"
import { makeFinding } from "./test-utils"

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

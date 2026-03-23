import { describe, expect, it } from "vitest"

import { scoreTier, scoreTierRangeLabel } from "./tc-score-badge"

describe("scoreTier", () => {
  it("matches the backend score thresholds", () => {
    expect(scoreTier(0)).toBe("info")
    expect(scoreTier(19.9)).toBe("info")
    expect(scoreTier(20)).toBe("low")
    expect(scoreTier(39.9)).toBe("low")
    expect(scoreTier(40)).toBe("medium")
    expect(scoreTier(59.9)).toBe("medium")
    expect(scoreTier(60)).toBe("high")
    expect(scoreTier(79.9)).toBe("high")
    expect(scoreTier(80)).toBe("critical")
    expect(scoreTier(100)).toBe("critical")
  })

  it("exposes the expected range labels", () => {
    expect(scoreTierRangeLabel("info")).toBe("0-19")
    expect(scoreTierRangeLabel("low")).toBe("20-39")
    expect(scoreTierRangeLabel("medium")).toBe("40-59")
    expect(scoreTierRangeLabel("high")).toBe("60-79")
    expect(scoreTierRangeLabel("critical")).toBe("80-100")
  })
})

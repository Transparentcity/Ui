import { describe, expect, it } from "vitest"

import { scoreTier } from "./tc-score-badge"

describe("scoreTier", () => {
  it("matches the backend score thresholds", () => {
    expect(scoreTier(0)).toBe("low")
    expect(scoreTier(30)).toBe("low")
    expect(scoreTier(31)).toBe("medium")
    expect(scoreTier(60)).toBe("medium")
    expect(scoreTier(61)).toBe("high")
    expect(scoreTier(80)).toBe("high")
    expect(scoreTier(81)).toBe("critical")
    expect(scoreTier(100)).toBe("critical")
  })
})

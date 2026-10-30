import { describe, it, expect } from "vitest"
import { cachedSystem } from "./anthropic-cache"

describe("cachedSystem", () => {
  it("marks the system message with an ephemeral Anthropic cache breakpoint", () => {
    expect(cachedSystem("stable prompt")).toEqual({
      role: "system",
      content: "stable prompt",
      providerOptions: { anthropic: { cacheControl: { type: "ephemeral" } } },
    })
  })
})

import { describe, it, expect } from "vitest"
import {
  PRESS_RELEASE_ARCHETYPES,
  ARCHETYPE_CATEGORIES,
  getArchetypeById,
  PressReleaseArchetype,
} from "./press-release-archetypes"

describe("press-release-archetypes", () => {
  // ==========================================================================
  // Registry integrity
  // ==========================================================================

  it("exports a non-empty array of archetypes", () => {
    expect(Array.isArray(PRESS_RELEASE_ARCHETYPES)).toBe(true)
    expect(PRESS_RELEASE_ARCHETYPES.length).toBeGreaterThan(0)
  })

  it("every archetype has required fields with correct types", () => {
    const validCategories = ["civic_data", "quality_of_life", "economy", "waste", "fun"]

    for (const arch of PRESS_RELEASE_ARCHETYPES) {
      expect(arch.id).toBeTruthy()
      expect(typeof arch.id).toBe("string")
      expect(arch.name).toBeTruthy()
      expect(typeof arch.name).toBe("string")
      expect(validCategories).toContain(arch.category)
      expect(arch.description).toBeTruthy()
      expect(typeof arch.description).toBe("string")
      expect(arch.dataset).toBeTruthy()
      expect(typeof arch.dataset).toBe("string")
      expect(typeof arch.exampleHeadline).toBe("string") // can be empty
    }
  })

  it("has no duplicate archetype IDs", () => {
    const ids = PRESS_RELEASE_ARCHETYPES.map((a) => a.id)
    const unique = new Set(ids)
    expect(unique.size).toBe(ids.length)
  })

  it("every archetype category is represented in ARCHETYPE_CATEGORIES", () => {
    const categoryKeys = ARCHETYPE_CATEGORIES.map((c) => c.key)
    const usedCategories = new Set(PRESS_RELEASE_ARCHETYPES.map((a) => a.category))
    for (const cat of usedCategories) {
      expect(categoryKeys).toContain(cat)
    }
  })

  it("waste archetypes are roughly 1/3 or less of total", () => {
    const wasteCount = PRESS_RELEASE_ARCHETYPES.filter((a) => a.category === "waste").length
    const total = PRESS_RELEASE_ARCHETYPES.length
    expect(wasteCount / total).toBeLessThanOrEqual(0.4) // allow a bit of slack
  })

  // ==========================================================================
  // getArchetypeById
  // ==========================================================================

  it("returns the correct archetype for a valid ID", () => {
    const result = getArchetypeById("T1-26")
    expect(result).toBeDefined()
    expect(result!.name).toBe("Small Business Survival Rates")
    expect(result!.category).toBe("economy")
  })

  it("returns undefined for an invalid ID", () => {
    expect(getArchetypeById("DOES-NOT-EXIST")).toBeUndefined()
  })

  it("returns undefined for an empty string", () => {
    expect(getArchetypeById("")).toBeUndefined()
  })

  // ==========================================================================
  // ARCHETYPE_CATEGORIES
  // ==========================================================================

  it("ARCHETYPE_CATEGORIES has 5 entries with key and label", () => {
    expect(ARCHETYPE_CATEGORIES).toHaveLength(5)
    for (const cat of ARCHETYPE_CATEGORIES) {
      expect(cat.key).toBeTruthy()
      expect(cat.label).toBeTruthy()
    }
  })
})

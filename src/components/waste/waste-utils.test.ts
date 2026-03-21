import { describe, it, expect, vi, beforeEach } from "vitest"
import type { WasteAnalyzeResponse } from "@/lib/apiClient"
import {
  formatDollar,
  normalizeWasteCategory,
  escapeSoql,
  escapeSoqlLike,
  escapeHtml,
  safeSetCache,
  loadCachedAnalysis,
  wasteCacheKey,
  wasteBackupKey,
  WASTE_ANALYSIS_CACHE_KEY,
} from "./waste-utils"

// ── formatDollar ────────────────────────────────────────────────────────────

describe("formatDollar", () => {
  it("returns empty string for null", () => {
    expect(formatDollar(null)).toBe("")
  })

  it("returns empty string for undefined", () => {
    expect(formatDollar(undefined)).toBe("")
  })

  it("formats zero as $0", () => {
    expect(formatDollar(0)).toBe("$0")
  })

  it("formats small amounts without suffix", () => {
    expect(formatDollar(500)).toBe("$500")
  })

  it("formats thousands with K suffix", () => {
    expect(formatDollar(1000)).toBe("$1K")
    expect(formatDollar(5000)).toBe("$5K")
    expect(formatDollar(50000)).toBe("$50K")
    expect(formatDollar(999999)).toBe("$1000K")
  })

  it("formats millions with M suffix and one decimal", () => {
    expect(formatDollar(1000000)).toBe("$1.0M")
    expect(formatDollar(2300000)).toBe("$2.3M")
    expect(formatDollar(15750000)).toBe("$15.8M")
  })

  it("uses absolute value for negative amounts", () => {
    expect(formatDollar(-2300000)).toBe("$2.3M")
    expect(formatDollar(-5000)).toBe("$5K")
    expect(formatDollar(-500)).toBe("$500")
  })
})

// ── normalizeWasteCategory ──────────────────────────────────────────────────

describe("normalizeWasteCategory", () => {
  // Payroll bucket
  it.each([
    "payroll",
    "Payroll",
    "PAYROLL",
    "Payroll & Compensation",
    "payroll_compensation",
  ])("maps '%s' to payroll", (input) => {
    expect(normalizeWasteCategory(input)).toBe("payroll")
  })

  // Integrity / personnel → integrity
  it.each([
    "integrity",
    "Personnel Integrity",
    "revolving_door",
    "conflict_of_interest",
  ])("maps '%s' to integrity", (input) => {
    expect(normalizeWasteCategory(input)).toBe("integrity")
  })

  // Contracts bucket
  it.each([
    "contracts",
    "vendor",
    "vendors",
    "Vendor Procurement",
    "contracts_procurement",
  ])("maps '%s' to contracts", (input) => {
    expect(normalizeWasteCategory(input)).toBe("contracts")
  })

  // Influence → influence
  it.each([
    "influence",
    "Lobbying Activity",
    "pay_to_play",
  ])("maps '%s' to influence", (input) => {
    expect(normalizeWasteCategory(input)).toBe("influence")
  })

  // Infrastructure bucket
  it.each([
    "infrastructure",
    "services",
    "service",
    "Infrastructure & Services",
    "infrastructure_services",
  ])("maps '%s' to infrastructure", (input) => {
    expect(normalizeWasteCategory(input)).toBe("infrastructure")
  })

  // Special buckets
  it("maps 'confirmed' to confirmed", () => {
    expect(normalizeWasteCategory("confirmed")).toBe("confirmed")
  })

  it("maps 'detectors' to detectors", () => {
    expect(normalizeWasteCategory("detectors")).toBe("detectors")
  })

  it("maps 'detectors_data' to detectors", () => {
    expect(normalizeWasteCategory("detectors_data")).toBe("detectors")
  })

  it("maps 'review' to review", () => {
    expect(normalizeWasteCategory("review")).toBe("review")
  })

  it("maps 'queue' to review", () => {
    expect(normalizeWasteCategory("queue")).toBe("review")
  })

  it("maps 'accuracy' to accuracy", () => {
    expect(normalizeWasteCategory("accuracy")).toBe("accuracy")
  })

  it("maps 'precision_metrics' to accuracy", () => {
    expect(normalizeWasteCategory("precision_metrics")).toBe("accuracy")
  })

  // Unknown → defaults to payroll
  it("defaults unknown category to payroll", () => {
    expect(normalizeWasteCategory("something_random")).toBe("payroll")
  })

  // Whitespace and special character handling
  it("trims whitespace", () => {
    expect(normalizeWasteCategory("  payroll  ")).toBe("payroll")
  })

  it("normalizes special characters", () => {
    expect(normalizeWasteCategory("vendor & procurement")).toBe("contracts")
  })
})

// ── escapeSoql ──────────────────────────────────────────────────────────────

describe("escapeSoql", () => {
  it("returns plain text unchanged", () => {
    expect(escapeSoql("Fire Department")).toBe("Fire Department")
  })

  it("escapes single quotes by doubling", () => {
    expect(escapeSoql("O'Brien")).toBe("O''Brien")
  })

  it("escapes backslashes", () => {
    expect(escapeSoql("path\\to")).toBe("path\\\\to")
  })

  it("escapes percent for SOQL wildcard safety", () => {
    expect(escapeSoql("100%")).toBe("100\\%")
  })

  it("escapes underscores for SOQL wildcard safety", () => {
    expect(escapeSoql("dept_name")).toBe("dept\\_name")
  })

  it("handles combined special characters", () => {
    expect(escapeSoql("O'Brien\\50%_dept")).toBe("O''Brien\\\\50\\%\\_dept")
  })
})

// ── escapeSoqlLike ──────────────────────────────────────────────────────────

describe("escapeSoqlLike", () => {
  it("returns plain text unchanged", () => {
    expect(escapeSoqlLike("Fire Department")).toBe("Fire Department")
  })

  it("escapes single quotes by doubling", () => {
    expect(escapeSoqlLike("O'Brien")).toBe("O''Brien")
  })

  it("escapes backslashes", () => {
    expect(escapeSoqlLike("path\\to")).toBe("path\\\\to")
  })

  it("preserves percent wildcard (unlike escapeSoql)", () => {
    expect(escapeSoqlLike("100%")).toBe("100%")
  })

  it("preserves underscore wildcard (unlike escapeSoql)", () => {
    expect(escapeSoqlLike("dept_name")).toBe("dept_name")
  })
})

// ── escapeHtml ──────────────────────────────────────────────────────────────

describe("escapeHtml", () => {
  it("returns plain text unchanged", () => {
    expect(escapeHtml("hello world")).toBe("hello world")
  })

  it("escapes ampersands", () => {
    expect(escapeHtml("a & b")).toBe("a &amp; b")
  })

  it("escapes angle brackets", () => {
    expect(escapeHtml("<script>")).toBe("&lt;script&gt;")
  })

  it("escapes double quotes", () => {
    expect(escapeHtml('a "b" c')).toBe("a &quot;b&quot; c")
  })

  it("escapes single quotes", () => {
    expect(escapeHtml("it's")).toBe("it&#039;s")
  })

  it("handles all characters in one string", () => {
    expect(escapeHtml(`<a href="x" class='y'>&`)).toBe(
      "&lt;a href=&quot;x&quot; class=&#039;y&#039;&gt;&amp;"
    )
  })
})

// ── wasteCacheKey / wasteBackupKey ──────────────────────────────────────────

describe("wasteCacheKey", () => {
  it("includes cityId when provided", () => {
    const key = wasteCacheKey(57260)
    expect(key).toContain(":57260:")
  })

  it("works without cityId", () => {
    const key = wasteCacheKey()
    expect(key).not.toContain(":undefined:")
    expect(key).toContain("v2")
  })

  it("works with null cityId", () => {
    const key = wasteCacheKey(null)
    expect(key).not.toContain(":null:")
    expect(key).toContain("v2")
  })

  it("different cities produce different keys", () => {
    const sfKey = wasteCacheKey(57260)
    const chiKey = wasteCacheKey(56838)
    expect(sfKey).not.toBe(chiKey)
  })
})

describe("wasteBackupKey", () => {
  it("includes cityId when provided", () => {
    const key = wasteBackupKey(57260)
    expect(key).toContain(":57260:")
  })

  it("different from cache key", () => {
    const cache = wasteCacheKey(57260)
    const backup = wasteBackupKey(57260)
    expect(cache).not.toBe(backup)
  })
})

// ── safeSetCache ────────────────────────────────────────────────────────────

describe("safeSetCache", () => {
  let setItemMock: ReturnType<typeof vi.fn>
  let getItemMock: ReturnType<typeof vi.fn>
  let removeItemMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    setItemMock = vi.fn()
    getItemMock = vi.fn().mockReturnValue(null)
    removeItemMock = vi.fn()
    Object.defineProperty(window, "localStorage", {
      value: { setItem: setItemMock, getItem: getItemMock, removeItem: removeItemMock },
      writable: true,
    })
  })

  it("stores data in localStorage on success", () => {
    const data = { findings: [{ id: "f1" }], summary: {} } as unknown as WasteAnalyzeResponse
    const key = wasteCacheKey(57260)
    safeSetCache(key, data, 57260)
    expect(setItemMock).toHaveBeenCalledWith(key, JSON.stringify(data))
  })

  it("does not overwrite good cached data with empty data", () => {
    const cachedData = { findings: [{ id: "f1" }], summary: {} } as unknown as WasteAnalyzeResponse
    const key = wasteCacheKey(57260)
    getItemMock.mockImplementation((k: string) =>
      k === key ? JSON.stringify(cachedData) : null
    )

    const emptyData = { findings: [], summary: {} } as unknown as WasteAnalyzeResponse
    safeSetCache(key, emptyData, 57260)

    expect(setItemMock).not.toHaveBeenCalled()
  })

  it("trims findings progressively when localStorage is full", () => {
    const findings = Array.from({ length: 600 }, (_, i) => ({ id: `f-${i}` }))
    const data = { findings, summary: {} } as unknown as WasteAnalyzeResponse

    let callCount = 0
    setItemMock.mockImplementation(() => {
      callCount++
      if (callCount === 1) throw new Error("QuotaExceeded")
    })

    const key = wasteCacheKey(57260)
    safeSetCache(key, data, 57260)

    const primaryCalls = setItemMock.mock.calls.filter(
      (c: [string, string]) => c[0] === key
    )
    expect(primaryCalls.length).toBeGreaterThanOrEqual(1)
    const stored = JSON.parse(primaryCalls[primaryCalls.length - 1][1])
    expect(stored.findings.length).toBe(500)
  })

  it("does not remove cache key when all trims fail", () => {
    const data = { findings: [{ id: "f1" }], summary: {} } as unknown as WasteAnalyzeResponse
    setItemMock.mockImplementation(() => { throw new Error("QuotaExceeded") })

    safeSetCache(wasteCacheKey(57260), data, 57260)

    expect(removeItemMock).not.toHaveBeenCalled()
  })

  it("city-scoped write does not affect other cities", () => {
    const data = { findings: [{ id: "f1" }], summary: {} } as unknown as WasteAnalyzeResponse
    const sfKey = wasteCacheKey(57260)
    safeSetCache(sfKey, data, 57260)

    const sfCalls = setItemMock.mock.calls.filter(
      (c: [string, string]) => c[0].includes("57260")
    )
    const chiCalls = setItemMock.mock.calls.filter(
      (c: [string, string]) => c[0].includes("56838")
    )
    expect(sfCalls.length).toBeGreaterThan(0)
    expect(chiCalls.length).toBe(0)
  })
})

// ── loadCachedAnalysis ─────────────────────────────────────────────────────

describe("loadCachedAnalysis", () => {
  let getItemMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    getItemMock = vi.fn().mockReturnValue(null)
    Object.defineProperty(window, "localStorage", {
      value: { getItem: getItemMock, setItem: vi.fn(), removeItem: vi.fn() },
      writable: true,
    })
  })

  it("returns null when no cache exists", () => {
    const result = loadCachedAnalysis(57260)
    expect(result).toBeNull()
  })

  it("returns city-scoped cached data", () => {
    const data = { findings: [{ id: "f1" }], summary: {} }
    const key = wasteCacheKey(57260)
    getItemMock.mockImplementation((k: string) =>
      k === key ? JSON.stringify(data) : null
    )

    const result = loadCachedAnalysis(57260)
    expect(result).not.toBeNull()
    expect(result!.findings).toHaveLength(1)
  })

  it("does not return data from a different city", () => {
    const data = { findings: [{ id: "f1" }], summary: {} }
    const sfKey = wasteCacheKey(57260)
    getItemMock.mockImplementation((k: string) =>
      k === sfKey ? JSON.stringify(data) : null
    )

    const result = loadCachedAnalysis(56838)
    expect(result).toBeNull()
  })

  it("falls back to backup key when primary empty", () => {
    const data = { findings: [{ id: "f1" }], summary: {} }
    const backupKey = wasteBackupKey(57260)
    getItemMock.mockImplementation((k: string) =>
      k === backupKey ? JSON.stringify(data) : null
    )

    const result = loadCachedAnalysis(57260)
    expect(result).not.toBeNull()
  })

  it("returns null for SSR (no window)", () => {
    const origWindow = globalThis.window
    // @ts-expect-error - simulating SSR
    delete globalThis.window
    try {
      const result = loadCachedAnalysis(57260)
      expect(result).toBeNull()
    } finally {
      globalThis.window = origWindow
    }
  })

  it("skips oversized entries", () => {
    const bigString = "x".repeat(5_000_000)
    const key = wasteCacheKey(57260)
    getItemMock.mockImplementation((k: string) =>
      k === key ? bigString : null
    )

    const result = loadCachedAnalysis(57260)
    expect(result).toBeNull()
  })

  it("skips entries with zero findings", () => {
    const data = { findings: [], summary: {} }
    const key = wasteCacheKey(57260)
    getItemMock.mockImplementation((k: string) =>
      k === key ? JSON.stringify(data) : null
    )

    const result = loadCachedAnalysis(57260)
    expect(result).toBeNull()
  })
})

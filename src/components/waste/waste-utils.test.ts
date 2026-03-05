import { describe, it, expect, vi, beforeEach } from "vitest"
import {
  formatDollar,
  normalizeWasteCategory,
  escapeSoql,
  escapeSoqlLike,
  escapeHtml,
  safeSetCache,
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

  // Integrity / personnel → payroll
  it.each([
    "integrity",
    "Personnel Integrity",
    "revolving_door",
    "conflict_of_interest",
  ])("maps '%s' to payroll", (input) => {
    expect(normalizeWasteCategory(input)).toBe("payroll")
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

  // Influence → contracts
  it.each([
    "influence",
    "Lobbying Activity",
    "pay_to_play",
  ])("maps '%s' to contracts", (input) => {
    expect(normalizeWasteCategory(input)).toBe("contracts")
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

// ── safeSetCache ────────────────────────────────────────────────────────────

describe("safeSetCache", () => {
  let setItemMock: ReturnType<typeof vi.fn>
  let removeItemMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    setItemMock = vi.fn()
    removeItemMock = vi.fn()
    Object.defineProperty(window, "localStorage", {
      value: { setItem: setItemMock, removeItem: removeItemMock },
      writable: true,
    })
  })

  it("stores data in localStorage on success", () => {
    const data = { findings: [{ id: "f1" }], summary: {} } as any
    safeSetCache(WASTE_ANALYSIS_CACHE_KEY, data)
    expect(setItemMock).toHaveBeenCalledWith(
      WASTE_ANALYSIS_CACHE_KEY,
      JSON.stringify(data)
    )
  })

  it("trims findings progressively when localStorage is full", () => {
    const findings = Array.from({ length: 600 }, (_, i) => ({ id: `f-${i}` }))
    const data = { findings, summary: {} } as any

    // First call throws (full data), second call succeeds (trimmed to 500)
    setItemMock
      .mockImplementationOnce(() => { throw new Error("QuotaExceeded") })
      .mockImplementation(() => {})

    safeSetCache(WASTE_ANALYSIS_CACHE_KEY, data)

    // Second call should have trimmed findings to 500
    expect(setItemMock).toHaveBeenCalledTimes(2)
    const stored = JSON.parse(setItemMock.mock.calls[1][1])
    expect(stored.findings.length).toBe(500)
  })

  it("falls through to removeItem when all trims fail", () => {
    const data = { findings: [{ id: "f1" }], summary: {} } as any
    setItemMock.mockImplementation(() => { throw new Error("QuotaExceeded") })

    safeSetCache(WASTE_ANALYSIS_CACHE_KEY, data)

    // 1 initial + 3 trim attempts + 1 removeItem
    expect(setItemMock).toHaveBeenCalledTimes(4) // initial + 500 + 300 + 150
    expect(removeItemMock).toHaveBeenCalledWith(WASTE_ANALYSIS_CACHE_KEY)
  })
})

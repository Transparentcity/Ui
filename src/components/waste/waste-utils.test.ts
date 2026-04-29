import { describe, it, expect, vi, beforeEach } from "vitest"
import type { WasteAnalyzeResponse, WasteFinding } from "@/lib/apiClient"
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
  categoriesWithErrors,
  categoriesWithStructuredErrors,
  mergePersistedRuns,
  translateWasteError,
  translateStructuredError,
  type PersistedRunBundle,
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

  it("formats small amounts with comma separators", () => {
    expect(formatDollar(500)).toBe("$500")
  })

  it("formats thousands as full numbers with commas", () => {
    expect(formatDollar(1000)).toBe("$1,000")
    expect(formatDollar(5000)).toBe("$5,000")
    expect(formatDollar(50000)).toBe("$50,000")
    expect(formatDollar(999999)).toBe("$999,999")
  })

  it("formats millions as full numbers with commas", () => {
    expect(formatDollar(1000000)).toBe("$1,000,000")
    expect(formatDollar(2300000)).toBe("$2,300,000")
    expect(formatDollar(15750000)).toBe("$15,750,000")
  })

  it("uses absolute value for negative amounts", () => {
    expect(formatDollar(-2300000)).toBe("$2,300,000")
    expect(formatDollar(-5000)).toBe("$5,000")
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

// ── categoriesWithErrors ────────────────────────────────────────────────────

describe("categoriesWithErrors", () => {
  it("returns empty set for null / undefined / empty", () => {
    expect(categoriesWithErrors(null).size).toBe(0)
    expect(categoriesWithErrors(undefined).size).toBe(0)
    expect(categoriesWithErrors([]).size).toBe(0)
  })

  it("extracts contracts from a timeout message", () => {
    const result = categoriesWithErrors(["contracts: timed out after 120s"])
    expect(result.has("contracts")).toBe(true)
  })

  it("maps the legacy 'vendor' alias to contracts", () => {
    const result = categoriesWithErrors(["vendor: boom"])
    expect(result.has("contracts")).toBe(true)
  })

  it("handles multiple families in one errors array", () => {
    const result = categoriesWithErrors([
      "contracts: timed out after 120s",
      "payroll: SQL error",
    ])
    expect(result.has("contracts")).toBe(true)
    expect(result.has("payroll")).toBe(true)
  })

  it("ignores the prefetch prefix (applies to all categories, not a detector)", () => {
    const result = categoriesWithErrors(["prefetch: network down"])
    expect(result.size).toBe(0)
  })

  it("ignores malformed messages without a leading 'family:' token", () => {
    const result = categoriesWithErrors([
      "some freeform error",
      "!!!!",
      "",
    ])
    expect(result.size).toBe(0)
  })

  it.each([
    ["payroll", "payroll"],
    ["contracts", "contracts"],
    ["vendor", "contracts"],
    ["vendors", "contracts"],
    ["infrastructure", "infrastructure"],
    ["services", "infrastructure"],
    ["influence", "influence"],
    ["lobbying", "influence"],
    ["integrity", "integrity"],
    ["personnel", "integrity"],
    ["confirmed", "confirmed"],
    ["convergence", "convergence"],
  ])(
    "maps backend family '%s:' to UI category '%s'",
    (family, expected) => {
      const result = categoriesWithErrors([`${family}: timed out after 120s`])
      expect(result.has(expected as never)).toBe(true)
      expect(result.size).toBe(1)
    },
  )

  it("does NOT fall through to 'payroll' for unknown families", () => {
    // Previously, normalizeWasteCategory's default case returned "payroll" for
    // anything unrecognized, which would have silently flagged payroll on any
    // mystery error prefix like "foo: boom".
    const result = categoriesWithErrors([
      "foo: boom",
      "unknown_family: timed out",
      "detectors: oops",
    ])
    expect(result.size).toBe(0)
  })

  it("recognizes uppercase family prefixes (backend could emit either case)", () => {
    const result = categoriesWithErrors(["PAYROLL: boom", "Contracts: oops"])
    expect(result.has("payroll")).toBe(true)
    expect(result.has("contracts")).toBe(true)
  })
})

// ── mergePersistedRuns ──────────────────────────────────────────────────────

function makeFinding(
  category: string,
  id: string,
  severity: WasteFinding["severity"] = "high",
  department: string | null = "DPW",
  amount: number | null = 1000,
): WasteFinding {
  return {
    id,
    category: category as WasteFinding["category"],
    subcategory: "",
    severity,
    entity: "Test",
    metric: "",
    metricDetail: "",
    amount,
    description: "",
    tool: "",
    confidence: "High",
    confidence_reason: null,
    confidence_score: 0.9,
    estimated_dollar_impact: amount,
    corroboration_count: 1,
    data_completeness: 1,
    priority_score: 1,
    is_partial_data: false,
    truncated_total: null,
    caveat: null,
    narrative: null,
    headline: null,
    signal_tier: "primary",
    finding_report: null,
    department,
  }
}

function makeRun(args: {
  ts: string
  errors?: string[]
  findings?: WasteFinding[]
  categorySummaries?: Array<{
    category: string
    finding_count: number
    critical_count?: number
    total_amount?: number
  }>
}): PersistedRunBundle {
  const findings = args.findings ?? []
  return {
    analysisTimestamp: args.ts,
    errors: args.errors ?? [],
    response: {
      findings,
      summary: {
        total_findings: findings.length,
        critical_count: findings.filter((f) => f.severity === "critical").length,
        estimated_exposure: findings.reduce((s, f) => s + (f.amount ?? 0), 0),
        gross_exposure: findings.reduce((s, f) => s + (f.amount ?? 0), 0),
        net_exposure: findings.reduce((s, f) => s + (f.amount ?? 0), 0),
        departments_affected: new Set(findings.map((f) => f.department).filter(Boolean)).size,
        categories: (args.categorySummaries ?? []).map((c) => ({
          category: c.category,
          finding_count: c.finding_count,
          critical_count: c.critical_count ?? 0,
          high_count: 0,
          medium_count: 0,
          total_amount: c.total_amount ?? 0,
          records_analyzed: 0,
        })),
      },
      cached: false,
      analysis_timestamp: args.ts,
      errors: args.errors ?? [],
      data_freshness: [],
    },
  }
}

describe("mergePersistedRuns", () => {
  it("returns null for an empty list", () => {
    expect(mergePersistedRuns([])).toBeNull()
  })

  it("returns the latest run unchanged when no errors", () => {
    const findings = [
      makeFinding("payroll", "p1"),
      makeFinding("contracts", "c1"),
    ]
    const [latest] = [makeRun({ ts: "2026-04-22", findings })]
    const merged = mergePersistedRuns([latest])
    expect(merged).not.toBeNull()
    expect(merged!.response.findings.map((f) => f.id).sort()).toEqual([
      "c1",
      "p1",
    ])
    expect(merged!.carriedOver).toEqual([])
    expect(merged!.response.carried_over_categories).toEqual([])
  })

  it("carries contracts forward when the latest run timed out on contracts", () => {
    const latest = makeRun({
      ts: "2026-04-22",
      errors: ["contracts: timed out after 120s"],
      findings: [makeFinding("payroll", "p1")],
    })
    const prior = makeRun({
      ts: "2026-04-20",
      findings: [
        makeFinding("payroll", "p0"),
        makeFinding("contracts", "c-old-1"),
        makeFinding("contracts", "c-old-2", "critical"),
      ],
    })
    const merged = mergePersistedRuns([latest, prior])
    expect(merged).not.toBeNull()
    const ids = merged!.response.findings.map((f) => f.id).sort()
    // payroll comes from latest, contracts from prior
    expect(ids).toEqual(["c-old-1", "c-old-2", "p1"])
    // carried-over surfaces only contracts
    const carried = merged!.carriedOver.map((c) => c.category)
    expect(carried).toEqual(["contracts"])
    expect(merged!.response.carried_over_categories).toEqual([
      {
        category: "contracts",
        analysis_timestamp: "2026-04-20",
        reason: "carried from earlier run",
      },
    ])
  })

  it("trusts a legitimate zero on the latest run (no error, no findings) instead of falling back", () => {
    const latest = makeRun({
      ts: "2026-04-22",
      findings: [makeFinding("payroll", "p1")],
      // contracts not errored, latest simply has no contracts findings
    })
    const prior = makeRun({
      ts: "2026-04-20",
      findings: [makeFinding("contracts", "c-old")],
    })
    const merged = mergePersistedRuns([latest, prior])
    expect(merged!.response.findings.map((f) => f.id)).toEqual(["p1"])
    expect(merged!.carriedOver).toEqual([])
  })

  it("returns no findings for a family that errored in every run", () => {
    const a = makeRun({
      ts: "2026-04-22",
      errors: ["contracts: timed out"],
      findings: [makeFinding("payroll", "p1")],
    })
    const b = makeRun({
      ts: "2026-04-20",
      errors: ["contracts: boom"],
      findings: [makeFinding("payroll", "p0")],
    })
    const merged = mergePersistedRuns([a, b])
    const contracts = merged!.response.findings.filter(
      (f) => normalizeWasteCategory(f.category) === "contracts",
    )
    expect(contracts).toEqual([])
    // Not labeled as carried-over — there was nothing to carry.
    expect(merged!.carriedOver).toEqual([])
  })

  it("deduplicates findings by id when multiple runs contribute the same finding", () => {
    const shared = makeFinding("payroll", "p-shared")
    const latest = makeRun({
      ts: "2026-04-22",
      errors: ["contracts: timed out"],
      findings: [shared],
    })
    const prior = makeRun({
      ts: "2026-04-20",
      findings: [shared, makeFinding("contracts", "c1")],
    })
    const merged = mergePersistedRuns([latest, prior])
    const ids = merged!.response.findings.map((f) => f.id).sort()
    expect(ids).toEqual(["c1", "p-shared"])
  })

  it("recomputes stat bar totals from merged data (so contracts carry-forward shows in the count)", () => {
    const latest = makeRun({
      ts: "2026-04-22",
      errors: ["contracts: timed out"],
      findings: [makeFinding("payroll", "p1", "critical", "HR", 500)],
    })
    const prior = makeRun({
      ts: "2026-04-20",
      findings: [
        makeFinding("contracts", "c1", "critical", "DPW", 2000),
        makeFinding("contracts", "c2", "high", "DPW", 1500),
      ],
      categorySummaries: [
        {
          category: "contracts",
          finding_count: 2,
          critical_count: 1,
          total_amount: 3500,
        },
      ],
    })
    const merged = mergePersistedRuns([latest, prior])
    expect(merged!.response.summary.total_findings).toBe(3)
    expect(merged!.response.summary.critical_count).toBe(2)
    // departments_affected derived from the *merged* finding set
    expect(merged!.response.summary.departments_affected).toBe(2)
    // exposure reflects the per-category summary total (3500 contracts only;
    // latest run payroll summary was absent from categorySummaries)
    expect(merged!.response.summary.estimated_exposure).toBe(3500)
  })

  // Every detector family carries forward correctly when it's the one that
  // timed out on the latest run.
  it.each([
    ["payroll", "payroll"],
    ["contracts", "contracts"],
    ["infrastructure", "infrastructure"],
    ["influence", "influence"],
    ["integrity", "integrity"],
    ["confirmed", "confirmed"],
    ["convergence", "convergence"],
  ])(
    "carries '%s' forward from a prior run when the latest timed out on it",
    (family, uiKey) => {
      const latest = makeRun({
        ts: "2026-04-22",
        errors: [`${family}: timed out after 120s`],
        findings: [makeFinding("payroll", "unrelated-p1")],
      })
      const prior = makeRun({
        ts: "2026-04-20",
        findings: [
          makeFinding(family, `${family}-old-1`),
          makeFinding(family, `${family}-old-2`, "critical"),
        ],
      })
      const merged = mergePersistedRuns([latest, prior])
      expect(merged).not.toBeNull()
      const carryIds = merged!.response.findings
        .filter((f) => normalizeWasteCategory(f.category) === uiKey)
        .map((f) => f.id)
        .sort()
      expect(carryIds).toEqual([`${family}-old-1`, `${family}-old-2`])
      const carried = merged!.carriedOver.map((c) => c.category)
      expect(carried).toEqual([uiKey])
    },
  )

  // When multiple detectors timeout together, all of them should carry forward.
  it("carries multiple detectors forward simultaneously", () => {
    const latest = makeRun({
      ts: "2026-04-22",
      errors: [
        "contracts: timed out after 120s",
        "influence: timed out after 120s",
        "integrity: timed out after 120s",
      ],
      findings: [makeFinding("payroll", "p-latest")],
    })
    const prior = makeRun({
      ts: "2026-04-20",
      findings: [
        makeFinding("contracts", "c-old"),
        makeFinding("influence", "inf-old"),
        makeFinding("integrity", "int-old"),
        makeFinding("payroll", "p-old"),
      ],
    })
    const merged = mergePersistedRuns([latest, prior])
    const ids = merged!.response.findings.map((f) => f.id).sort()
    // Payroll from latest; other three detectors from prior (p-old deduped out).
    expect(ids).toEqual(["c-old", "inf-old", "int-old", "p-latest"])
    const carried = merged!.carriedOver.map((c) => c.category).sort()
    expect(carried).toEqual(["contracts", "influence", "integrity"])
  })

  // Mixed-timeout scenarios: each detector's carry-over decision is independent.
  it("evaluates each detector's carry-over decision independently", () => {
    const latest = makeRun({
      ts: "2026-04-22",
      errors: ["contracts: timed out"], // only contracts errored
      findings: [
        makeFinding("payroll", "p-latest"),
        makeFinding("infrastructure", "inf-latest"),
        // intentionally no 'influence' findings but no error → legit zero
      ],
    })
    const prior = makeRun({
      ts: "2026-04-20",
      findings: [
        makeFinding("contracts", "c-old"),
        makeFinding("influence", "infl-old"), // should NOT be pulled, latest said "zero"
        makeFinding("payroll", "p-old"), // should NOT override latest
      ],
    })
    const merged = mergePersistedRuns([latest, prior])
    const ids = merged!.response.findings.map((f) => f.id).sort()
    expect(ids).toEqual(["c-old", "inf-latest", "p-latest"])
    expect(merged!.carriedOver.map((c) => c.category)).toEqual(["contracts"])
  })

  it("walks past multiple bad runs to the first usable one", () => {
    const a = makeRun({
      ts: "2026-04-22",
      errors: ["contracts: timed out"],
      findings: [makeFinding("payroll", "p1")],
    })
    const b = makeRun({
      ts: "2026-04-21",
      errors: ["contracts: boom"],
      findings: [makeFinding("payroll", "p0")],
    })
    const c = makeRun({
      ts: "2026-04-15",
      findings: [makeFinding("contracts", "c-old")],
    })
    const merged = mergePersistedRuns([a, b, c])
    const contractsIds = merged!.response.findings
      .filter((f) => normalizeWasteCategory(f.category) === "contracts")
      .map((f) => f.id)
    expect(contractsIds).toEqual(["c-old"])
    expect(merged!.carriedOver.map((c) => c.category)).toEqual(["contracts"])
  })
})

// ── translateWasteError ─────────────────────────────────────────────────────

describe("translateWasteError", () => {
  it("translates a contracts timeout into a retryable, human-readable message", () => {
    const t = translateWasteError("contracts: timed out after 300s")
    expect(t.category).toBe("contracts")
    expect(t.apiCategory).toBe("contracts")
    expect(t.headline).toMatch(/Contracts & Procurement/i)
    expect(t.detail).toMatch(/300s/)
    expect(t.tone).toBe("warn")
  })

  it("maps the legacy 'vendor' prefix to the contracts category", () => {
    const t = translateWasteError("vendor: kaboom")
    expect(t.category).toBe("contracts")
    expect(t.apiCategory).toBe("contracts")
  })

  it("handles the DataFrame truthiness bug with a non-retryable info note", () => {
    const t = translateWasteError(
      "internal error: The truth value of a DataFrame is ambiguous. Use a.empty, a.bool(), a.item(), a.any() or a.all()."
    )
    expect(t.category).toBeNull()
    expect(t.apiCategory).toBeNull()
    expect(t.headline).toMatch(/freshness/i)
    expect(t.tone).toBe("info")
  })

  it("labels prefetch failures as non-retryable at the category level", () => {
    const t = translateWasteError("prefetch: network down")
    expect(t.category).toBeNull()
    expect(t.apiCategory).toBeNull()
    expect(t.headline).toMatch(/fetch failed/i)
    expect(t.tone).toBe("warn")
  })

  it("treats confidence scoring failure as an info-level note", () => {
    const t = translateWasteError("confidence scoring: worker died")
    expect(t.category).toBeNull()
    expect(t.apiCategory).toBeNull()
    expect(t.tone).toBe("info")
  })

  it("treats convergence detector failure as an info-level note", () => {
    const t = translateWasteError("convergence detector: something")
    expect(t.category).toBeNull()
    expect(t.tone).toBe("info")
  })

  it("treats entity consolidation failure as an info-level note", () => {
    const t = translateWasteError("entity consolidation: boom")
    expect(t.category).toBeNull()
    expect(t.tone).toBe("info")
  })

  it("falls back to showing the raw string as detail for unknown messages", () => {
    const t = translateWasteError("something nobody has seen before")
    expect(t.category).toBeNull()
    expect(t.apiCategory).toBeNull()
    expect(t.detail).toBe("something nobody has seen before")
    expect(t.raw).toBe("something nobody has seen before")
  })

  it("preserves the raw string so operators can still see the backend message", () => {
    const raw = "payroll: sqlalchemy.exc.OperationalError: (psycopg2...)"
    const t = translateWasteError(raw)
    expect(t.raw).toBe(raw)
  })

  it("treats per-detector timeout as info, noting other detectors ran", () => {
    const t = translateWasteError(
      "contracts: D20 Debarment Bypass timed out after 90s"
    )
    expect(t.category).toBe("contracts")
    expect(t.apiCategory).toBe("contracts")
    expect(t.headline).toMatch(/one detector didn't finish/i)
    expect(t.detail).toMatch(/D20 Debarment Bypass/)
    expect(t.detail).toMatch(/90s/)
    expect(t.detail).toMatch(/other detectors.*ran normally/i)
    expect(t.tone).toBe("info")
  })

  it("treats per-detector exception as info with the detector name", () => {
    const t = translateWasteError(
      "contracts: D1 SSS Duplicates: synthetic failure"
    )
    expect(t.category).toBe("contracts")
    expect(t.apiCategory).toBe("contracts")
    expect(t.headline).toMatch(/one detector didn't finish/i)
    expect(t.detail).toMatch(/D1 SSS Duplicates/)
    expect(t.detail).toMatch(/synthetic failure/)
    expect(t.tone).toBe("info")
  })

  it("family-level timeout still uses the warn tone", () => {
    // Regression: make sure the per-detector path doesn't swallow family-level errors
    const t = translateWasteError("contracts: timed out after 300s")
    expect(t.headline).toMatch(/took too long/i)
    expect(t.tone).toBe("warn")
  })

  it("recognises letter-suffixed detector prefixes (D7b, D20i)", () => {
    // D7b Commodity Price Disparity (vendor) and D20i Behested QPQ (influence)
    // have a trailing lowercase letter. The old /^D\d+\s/ pattern missed them
    // and mis-classified them as family failures.
    const t1 = translateWasteError(
      "contracts: D7b Commodity Price Disparity timed out after 90s"
    )
    expect(t1.headline).toMatch(/one detector didn't finish/i)
    expect(t1.tone).toBe("info")

    const t2 = translateWasteError("influence: D20i Behested QPQ: boom")
    expect(t2.headline).toMatch(/one detector didn't finish/i)
    expect(t2.tone).toBe("info")
  })

  it("recognises two-letter detector prefixes (RD1..RD4)", () => {
    // The integrity family uses "RD" (Revolving Door) prefixes. Without the
    // fix these would fall through to the family-level warn banner.
    const t = translateWasteError(
      "integrity: RD1 Revolving Door timed out after 60s"
    )
    expect(t.category).toBe("integrity")
    expect(t.headline).toMatch(/one detector didn't finish/i)
    expect(t.detail).toMatch(/RD1 Revolving Door/)
    expect(t.tone).toBe("info")
  })
})

// ── translateStructuredError ───────────────────────────────────────────────

describe("translateStructuredError", () => {
  // The structured path is strictly better than the regex one: error_type,
  // family, and retryable come from the source instead of being inferred
  // from the message string. These tests pin the mapping so a backend
  // change can't silently change the UI copy.
  it("maps a family timeout to a category-scoped warn", () => {
    const t = translateStructuredError({
      family: "contracts",
      detector: null,
      error_type: "timeout",
      stage: "detectors",
      message: "timed out after 90s",
      retryable: true,
    })
    expect(t.headline).toMatch(/took too long/i)
    expect(t.category).toBe("contracts")
    expect(t.tone).toBe("warn")
  })

  it("maps a family error to a category-scoped warn", () => {
    const t = translateStructuredError({
      family: "payroll",
      detector: null,
      error_type: "family_error",
      stage: "detectors",
      message: "synthetic failure",
      retryable: false,
    })
    expect(t.headline).toMatch(/didn't finish/i)
    expect(t.category).toBe("payroll")
    expect(t.tone).toBe("warn")
  })

  it("maps no_data to an info-toned 'No data available' headline", () => {
    const t = translateStructuredError({
      family: "infrastructure",
      detector: null,
      error_type: "no_data",
      stage: "detectors",
      message: "no 311 cases for the period",
      retryable: false,
    })
    expect(t.headline).toMatch(/no data available/i)
    expect(t.category).toBe("infrastructure")
    expect(t.tone).toBe("info")
  })

  it("maps data_fetch_partial to a dataset-named warn", () => {
    const t = translateStructuredError({
      family: null,
      detector: "vendor_payments",
      error_type: "data_fetch_partial",
      stage: "prefetch",
      message: "vendor_payments fetch failed: 503",
      retryable: true,
    })
    expect(t.headline).toMatch(/couldn't fetch vendor_payments/i)
    expect(t.tone).toBe("warn")
    // No family scoping for prefetch errors
    expect(t.category).toBeNull()
  })

  it("maps prefetch full failure to 'Data fetch failed'", () => {
    const t = translateStructuredError({
      family: null,
      detector: null,
      error_type: "data_fetch",
      stage: "prefetch",
      message: "prefetch failed: ConnectionError",
      retryable: true,
    })
    expect(t.headline).toMatch(/data fetch failed/i)
    expect(t.tone).toBe("warn")
    expect(t.category).toBeNull()
  })

  it("maps a convergence post-processing failure to an info banner", () => {
    const t = translateStructuredError({
      family: null,
      detector: null,
      error_type: "post_processing",
      stage: "post",
      message: "convergence detector: boom",
      retryable: false,
    })
    expect(t.headline).toMatch(/cross-domain meta-detector didn't run/i)
    expect(t.tone).toBe("info")
  })

  it("maps invalid_category to a clear setup-error headline", () => {
    const t = translateStructuredError({
      family: null,
      detector: null,
      error_type: "invalid_category",
      stage: "orchestrator",
      message: "Unknown category: bogus",
      retryable: false,
    })
    expect(t.headline).toMatch(/unknown analysis category/i)
    expect(t.tone).toBe("warn")
  })
})

// ── categoriesWithStructuredErrors ─────────────────────────────────────────

describe("categoriesWithStructuredErrors", () => {
  it("returns failed family categories from a detector_errors list", () => {
    const failed = categoriesWithStructuredErrors([
      { family: "contracts", error_type: "timeout", stage: "detectors" },
      { family: null, error_type: "data_fetch", stage: "prefetch" },
      { family: "payroll", error_type: "family_error", stage: "detectors" },
    ])
    expect(failed.has("contracts")).toBe(true)
    expect(failed.has("payroll")).toBe(true)
    // prefetch errors aren't tied to a single family
    expect(failed.size).toBe(2)
  })

  it("returns an empty set for null/undefined input", () => {
    expect(categoriesWithStructuredErrors(null).size).toBe(0)
    expect(categoriesWithStructuredErrors(undefined).size).toBe(0)
  })

  it("does NOT mark a family as failed when only one detector inside it failed", () => {
    // The family ran fine and produced findings from its other detectors.
    // Carrying over an older run for that family would replace good new
    // findings with stale data.
    const failed = categoriesWithStructuredErrors([
      {
        family: "contracts",
        detector: "D7b Commodity Price Disparity",
        error_type: "family_error",
        stage: "detectors",
      },
    ])
    expect(failed.has("contracts")).toBe(false)
    expect(failed.size).toBe(0)
  })

  it("marks a family as failed when the family-level wrapper failed (no detector set)", () => {
    const failed = categoriesWithStructuredErrors([
      {
        family: "contracts",
        detector: null,
        error_type: "timeout",
        stage: "detectors",
      },
    ])
    expect(failed.has("contracts")).toBe(true)
  })
})

describe("categoriesWithErrors with per-detector strings", () => {
  // Same correctness check on the legacy-string path: per-detector
  // failures should NOT trigger the carry-over merge.
  it("ignores per-detector error strings (D7b, RD1, etc.)", () => {
    const failed = categoriesWithErrors([
      "contracts: D7b Commodity Price Disparity: boom",
      "integrity: RD1 Revolving Door timed out after 60s",
    ])
    expect(failed.size).toBe(0)
  })

  it("still flags whole-family timeouts", () => {
    const failed = categoriesWithErrors([
      "contracts: timed out after 120s",
    ])
    expect(failed.has("contracts")).toBe(true)
  })

  it("flags an unprefixed family-level error", () => {
    const failed = categoriesWithErrors([
      "payroll: KeyError 'employee_identifier'",
    ])
    expect(failed.has("payroll")).toBe(true)
  })
})

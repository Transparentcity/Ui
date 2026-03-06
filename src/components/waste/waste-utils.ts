import type { WasteAnalyzeResponse } from "@/lib/apiClient"

// ── Category normalization ──────────────────────────────────────────────────

export type WasteCategoryKey =
  | "overview"
  | "payroll"
  | "contracts"
  | "infrastructure"
  | "confirmed"
  | "detectors"
  | "review"
  | "accuracy"

/**
 * Canonical mapping from raw backend category strings to UI category keys.
 * Every component that needs to bucket findings should use this single function.
 */
export function normalizeWasteCategory(category: string): WasteCategoryKey {
  const key = category
    .toLowerCase()
    .trim()
    .replace(/[_\s&.,'-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "")

  if (key === "overview") return "overview"
  if (key === "payroll" || key.includes("payroll") || key === "payroll_compensation") return "payroll"

  // Map integrity/personnel to payroll
  if (
    key === "integrity" ||
    key.includes("integrity") ||
    key.includes("personnel") ||
    key.includes("revolving") ||
    key.includes("conflict")
  ) {
    return "payroll"
  }

  if (
    key === "contracts" ||
    key === "vendor" ||
    key === "vendors" ||
    key.includes("vendor") ||
    key.includes("contract") ||
    key === "vendor_procurement" ||
    key === "contracts_procurement"
  ) {
    return "contracts"
  }

  if (
    key === "infrastructure" ||
    key === "services" ||
    key === "service" ||
    key.includes("infrastructure") ||
    key === "infrastructure_services"
  ) {
    return "infrastructure"
  }

  // Influence / lobbying / pay-to-play map to contracts (not "vendor")
  if (
    key === "influence" ||
    key.includes("influence") ||
    key.includes("lobby") ||
    key.includes("pay_to_play")
  ) {
    return "contracts"
  }

  if (key === "confirmed" || key.includes("confirmed")) return "confirmed"
  if (key === "detectors" || key === "detectors_data") return "detectors"
  if (key === "review" || key.includes("queue")) return "review"
  if (key === "accuracy" || key.includes("precision")) return "accuracy"

  return "payroll"
}

// ── Dollar formatting ───────────────────────────────────────────────────────

export function formatDollar(amount: number | null | undefined): string {
  if (amount == null) return ""
  const abs = Math.abs(amount)
  if (abs >= 1_000_000) return `$${(abs / 1_000_000).toFixed(1)}M`
  if (abs >= 1_000) return `$${(abs / 1_000).toFixed(0)}K`
  return `$${abs.toLocaleString()}`
}

// ── localStorage cache helper ───────────────────────────────────────────────

export const WASTE_ANALYSIS_CACHE_KEY = "waste:last-analysis:v1"
export const WASTE_ANALYSIS_BACKUP_KEY = "waste:last-good-analysis:v1"

/** Count findings in a response (0 if missing). */
function findingCount(data: WasteAnalyzeResponse | null | undefined): number {
  return data?.findings?.length ?? 0
}

/** Read the current primary cache without parsing errors bubbling up. */
function readCachedFindings(): number {
  try {
    const raw = window.localStorage.getItem(WASTE_ANALYSIS_CACHE_KEY)
    if (!raw) return 0
    const parsed = JSON.parse(raw) as WasteAnalyzeResponse
    return findingCount(parsed)
  } catch {
    return 0
  }
}

/**
 * Write data to localStorage, but only if the new data is at least as good
 * as what is already cached (measured by finding count). This prevents a
 * failed or partial analysis run from wiping out yesterday's good results.
 *
 * Also maintains a separate backup key that is only written when the data
 * has a meaningful number of findings (> 0), providing a last-resort
 * recovery option.
 */
export function safeSetCache(key: string, data: WasteAnalyzeResponse): void {
  const newCount = findingCount(data)

  // Guard: never overwrite good cached data with empty/degraded data
  if (key === WASTE_ANALYSIS_CACHE_KEY) {
    const existingCount = readCachedFindings()
    if (newCount === 0 && existingCount > 0) {
      // New data is empty but cache has good data; skip the write
      return
    }
  }

  // Write the primary cache
  _writeToStorage(key, data)

  // If the data has findings, also update the backup key as a safety net
  if (newCount > 0) {
    _writeToStorage(WASTE_ANALYSIS_BACKUP_KEY, data)
  }
}

/** Low-level localStorage writer with progressive truncation on quota errors. */
function _writeToStorage(key: string, data: WasteAnalyzeResponse): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(data))
  } catch {
    // localStorage full - try progressively smaller subsets
    const limits = [500, 300, 150]
    for (const limit of limits) {
      try {
        const trimmed: WasteAnalyzeResponse = {
          ...data,
          findings: data.findings?.slice(0, limit) ?? [],
        }
        window.localStorage.setItem(key, JSON.stringify(trimmed))
        return
      } catch {
        continue
      }
    }
    // Don't remove the key on failure; better to keep stale data than nothing
  }
}

/**
 * Load cached analysis from localStorage with backup fallback.
 * Tries the primary cache first, then falls back to the backup key
 * if the primary is missing or has zero findings.
 */
export function loadCachedAnalysis(): WasteAnalyzeResponse | null {
  if (typeof window === "undefined") return null

  for (const key of [WASTE_ANALYSIS_CACHE_KEY, WASTE_ANALYSIS_BACKUP_KEY]) {
    try {
      const raw = window.localStorage.getItem(key)
      if (!raw) continue
      if (raw.length > 4_000_000) {
        // Corrupted or oversized entry; skip but don't delete (might be the only copy)
        continue
      }
      const parsed = JSON.parse(raw) as WasteAnalyzeResponse
      if (findingCount(parsed) > 0) return parsed
    } catch {
      continue
    }
  }
  return null
}

// ── HTML sanitization ───────────────────────────────────────────────────────

/** Escape a string for safe insertion into innerHTML / setHTML contexts. */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;")
}

// ── SOQL escaping ───────────────────────────────────────────────────────────

/**
 * Escape a value for safe interpolation into a SOQL query string.
 * Handles single quotes, backslashes, and percent/underscore wildcards.
 */
export function escapeSoql(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/'/g, "''")
    .replace(/%/g, "\\%")
    .replace(/_/g, "\\_")
}

/**
 * Escape for SOQL LIKE clauses (only quotes, no wildcard escaping).
 * Use when you intentionally include % or _ wildcards in the pattern.
 */
export function escapeSoqlLike(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "''")
}

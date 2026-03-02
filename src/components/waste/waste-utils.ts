import type { WasteAnalyzeResponse } from "@/lib/apiClient"

// ── Category normalization ──────────────────────────────────────────────────

export type WasteCategoryKey =
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

export function safeSetCache(key: string, data: WasteAnalyzeResponse): void {
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
    try {
      window.localStorage.removeItem(key)
    } catch {
      // localStorage completely unavailable - silently give up
    }
  }
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

import type { WasteAnalyzeResponse } from "@/lib/apiClient"

// ── Category normalization ──────────────────────────────────────────────────

export type WasteCategoryKey =
  | "overview"
  | "convergence"
  | "payroll"
  | "contracts"
  | "infrastructure"
  | "influence"
  | "integrity"
  | "confirmed"
  | "detectors"
  | "review"
  | "accuracy"

export const WASTE_CATEGORY_LABELS: Record<WasteCategoryKey, string> = {
  overview: "Workspace",
  convergence: "Cross-Domain Risk",
  payroll: "Payroll & Personnel",
  contracts: "Contracts & Procurement",
  infrastructure: "Infrastructure & Services",
  influence: "Influence & Pay-to-Play",
  integrity: "Personnel Integrity",
  confirmed: "Confirmed Cases",
  detectors: "Detectors & Data",
  review: "Review Workbench",
  accuracy: "Detector Accuracy",
}

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

  // Personnel integrity (revolving door, dual employment, etc.)
  if (
    key === "integrity" ||
    key.includes("integrity") ||
    key.includes("personnel") ||
    key.includes("revolving") ||
    key.includes("conflict")
  ) {
    return "integrity"
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

  // Influence / lobbying / pay-to-play
  if (
    key === "influence" ||
    key.includes("influence") ||
    key.includes("lobby") ||
    key.includes("pay_to_play")
  ) {
    return "influence"
  }

  if (key === "confirmed" || key.includes("confirmed")) return "confirmed"
  if (key === "convergence" || key.includes("convergence") || key.includes("cross_domain")) return "convergence"
  if (key === "detectors" || key === "detectors_data") return "detectors"
  if (key === "review" || key.includes("queue")) return "review"
  if (key === "accuracy" || key.includes("precision")) return "accuracy"

  return "payroll"
}

export function getWasteCategoryLabel(category: string): string {
  const key = normalizeWasteCategory(category)
  return WASTE_CATEGORY_LABELS[key]
}

export const WASTE_CATEGORY_DESCRIPTIONS: Record<WasteCategoryKey, string> = {
  overview: "Entry points and headline risk indicators",
  convergence: "Departments flagged across multiple independent risk domains",
  payroll: "Overtime, compensation anomalies, and personnel integrity",
  contracts: "Vendor concentration, procurement patterns, and influence",
  infrastructure: "311 service clusters and infrastructure patterns",
  influence: "Lobbying overlap, campaign finance patterns, and pay-to-play risk",
  integrity: "Revolving door hires, dual employment, and conflict-of-interest signals",
  confirmed: "Cases confirmed through audits, investigations, or public records",
  detectors: "All anomaly-detection algorithms and public datasets used by the platform",
  review: "Disposition workflow for auditor triage and assignment",
  accuracy: "Precision tracking from auditor feedback",
}

export function getWasteCategoryDescription(category: string): string {
  const key = normalizeWasteCategory(category)
  return WASTE_CATEGORY_DESCRIPTIONS[key]
}

// ── Dollar formatting ───────────────────────────────────────────────────────

export function formatDollar(amount: number | null | undefined): string {
  if (amount == null) return ""
  const rounded = Math.round(amount)
  return rounded.toLocaleString(undefined, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  })
}

// ── localStorage cache helper ───────────────────────────────────────────────

const _CACHE_PREFIX = "waste:last-analysis"
const _BACKUP_PREFIX = "waste:last-good-analysis"
const _CACHE_VERSION = "v2"

export function wasteCacheKey(cityId?: number | null): string {
  const suffix = cityId != null ? `:${cityId}` : ""
  return `${_CACHE_PREFIX}${suffix}:${_CACHE_VERSION}`
}

export function wasteBackupKey(cityId?: number | null): string {
  const suffix = cityId != null ? `:${cityId}` : ""
  return `${_BACKUP_PREFIX}${suffix}:${_CACHE_VERSION}`
}

/** @deprecated Use wasteCacheKey(cityId) instead */
export const WASTE_ANALYSIS_CACHE_KEY = `${_CACHE_PREFIX}:${_CACHE_VERSION}`
/** @deprecated Use wasteBackupKey(cityId) instead */
export const WASTE_ANALYSIS_BACKUP_KEY = `${_BACKUP_PREFIX}:${_CACHE_VERSION}`

/** Count findings in a response (0 if missing). */
function findingCount(data: WasteAnalyzeResponse | null | undefined): number {
  return data?.findings?.length ?? 0
}

/** Read the current primary cache without parsing errors bubbling up. */
function readCachedFindings(cityId?: number | null): number {
  try {
    const raw = window.localStorage.getItem(wasteCacheKey(cityId))
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
 *
 * @param key - Cache key (use wasteCacheKey(cityId) for city-scoped caching)
 * @param data - Analysis response to cache
 * @param cityId - City ID for scoped cache guard logic
 */
export function safeSetCache(
  key: string,
  data: WasteAnalyzeResponse,
  cityId?: number | null,
): void {
  const newCount = findingCount(data)

  const primaryKey = wasteCacheKey(cityId)
  if (key === primaryKey || key === WASTE_ANALYSIS_CACHE_KEY) {
    const existingCount = readCachedFindings(cityId)
    if (newCount === 0 && existingCount > 0) {
      return
    }
  }

  _writeToStorage(key, data)

  if (newCount > 0) {
    _writeToStorage(wasteBackupKey(cityId), data)
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
 * Tries the city-scoped cache first, then falls back to the backup key.
 * If no city-scoped entry exists, falls back to the legacy global keys.
 */
export function loadCachedAnalysis(
  cityId?: number | null,
): WasteAnalyzeResponse | null {
  if (typeof window === "undefined") return null

  const keysToTry = [
    wasteCacheKey(cityId),
    wasteBackupKey(cityId),
    ...(cityId != null
      ? [WASTE_ANALYSIS_CACHE_KEY, WASTE_ANALYSIS_BACKUP_KEY]
      : []),
  ]

  for (const key of keysToTry) {
    try {
      const raw = window.localStorage.getItem(key)
      if (!raw) continue
      if (raw.length > 4_000_000) {
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

import type {
  WasteAnalyzeResponse,
  WasteCategorySummary,
  WasteFinding,
  WasteSummaryResponse,
} from "@/lib/apiClient"

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
  overview: "Findings",
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
  overview: "Review flagged transactions across contracts and payroll",
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

// ── Confirmed fraud entities ────────────────────────────────────────────────

// Case-insensitive substring patterns that mark an entity as a previously
// confirmed fraud/waste case (verified via audit, investigation, or public
// record). Used to render a "Confirmed" badge so these entities are not
// mistaken for newly surfaced findings.
const CONFIRMED_FRAUD_ENTITY_PATTERNS: string[] = [
  "will do it construction",
  "robert lacy",
  "jones",
  "henriquez",
  "dream keeper",
  "davis self-dealing",
  "davis self dealing",
]

export function isConfirmedFraudEntity(name: string | null | undefined): boolean {
  if (!name) return false
  const hay = name.toLowerCase()
  return CONFIRMED_FRAUD_ENTITY_PATTERNS.some((p) => hay.includes(p))
}

// Finding-level check: backend marks confirmed-case items via category
// "confirmed" and/or IDs starting with "CONF-". Use this anywhere a finding
// object is available instead of string-matching names.
export function isConfirmedFinding(finding: WasteFinding): boolean {
  const cat = finding.category?.toLowerCase() ?? ""
  if (cat === "confirmed" || cat.includes("confirmed")) return true
  if (finding.id?.startsWith("CONF-")) return true
  return false
}

// ── Dollar formatting ───────────────────────────────────────────────────────

function withCommas(value: number, fractionDigits: number): string {
  return value.toLocaleString("en-US", {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  })
}

export function formatDollar(amount: number | null | undefined): string {
  if (amount == null) return ""
  const abs = Math.abs(amount)
  return `$${withCommas(Math.round(abs), 0)}`
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

// ── Multi-run merge ─────────────────────────────────────────────────────────

export interface PersistedRunBundle {
  analysisTimestamp: string | null
  errors: string[]
  response: WasteAnalyzeResponse
}

export interface CarriedOverCategoryInfo {
  category: WasteCategoryKey
  analysisTimestamp: string | null
  reason: string
}

export interface MergedPersistedResult {
  /** Merged response with `carried_over_categories` populated. */
  response: WasteAnalyzeResponse
  /** Same data, surfaced for convenience. */
  carriedOver: CarriedOverCategoryInfo[]
}

/**
 * Known detector family prefixes emitted by the backend in error messages.
 * Anything outside this set is ignored so we don't falsely flag a category
 * via `normalizeWasteCategory`'s "payroll" fallback for unknown inputs.
 */
const KNOWN_ERROR_FAMILIES: Record<string, WasteCategoryKey> = {
  payroll: "payroll",
  contracts: "contracts",
  vendor: "contracts",
  vendors: "contracts",
  infrastructure: "infrastructure",
  services: "infrastructure",
  influence: "influence",
  lobbying: "influence",
  integrity: "integrity",
  personnel: "integrity",
  confirmed: "confirmed",
  convergence: "convergence",
}

/**
 * Parse the error message list from a run, identifying which category families
 * had family-level failures (timeouts or whole-family exceptions). The backend
 * emits messages like `"contracts: timed out after 120s"` or
 * `"vendor: <exception>"`.
 *
 * Per-detector failures (e.g. `"contracts: D7b Commodity Price Disparity:
 * boom"`) are intentionally NOT counted here. The family ran fine and
 * produced findings from its other detectors, so we should keep the new
 * findings rather than carrying over an entire older run for that family.
 *
 * Only whitelisted family prefixes are recognized. The `prefetch:` prefix is
 * skipped because prefetch failures apply to every detector and are surfaced
 * elsewhere. Unknown families are ignored to avoid silently corrupting the
 * per-category error set.
 */
export function categoriesWithErrors(errors: string[] | null | undefined): Set<WasteCategoryKey> {
  const failed = new Set<WasteCategoryKey>()
  if (!errors) return failed
  // Same per-detector pattern as translateWasteError: a 1-2 letter prefix
  // followed by a digit (D1, D7b, D20i, RD1, NP1). When present after the
  // family colon, treat the error as per-detector and skip.
  const perDetectorAfterFamily = /^[a-zA-Z_]+:\s*[A-Z]{1,2}\d+[a-z]?\s/
  for (const msg of errors) {
    const match = /^([a-zA-Z_]+):/.exec(msg)
    if (!match) continue
    const raw = match[1].toLowerCase()
    if (raw === "prefetch") continue
    const mapped = KNOWN_ERROR_FAMILIES[raw]
    if (!mapped) continue
    if (perDetectorAfterFamily.test(msg)) continue
    failed.add(mapped)
  }
  return failed
}

export type TranslatedWasteError = {
  category: WasteCategoryKey | null
  apiCategory: string | null
  headline: string
  detail: string | null
  tone: "warn" | "info"
  raw: string
}

/**
 * Turn a raw backend error string into something an operator can read.
 *
 * Known patterns we translate:
 *   - "<family>: timed out after <N>s"   — detector family hung
 *   - "internal error: The truth value of a DataFrame is ambiguous..."
 *     (raised from _build_data_freshness when a fetcher returns a tuple of
 *     DataFrames rather than (df, is_partial). Findings are unaffected.)
 *   - "prefetch: ..."                    — data fetch failed before detectors ran
 *   - "confidence scoring: ..."          — post-processing step failed
 *   - "convergence detector: ..."        — cross-domain meta-detector failed
 *   - "entity consolidation: ..."        — post-processing step failed
 *
 * Unknown strings are surfaced verbatim as `detail` with a generic headline,
 * so nothing is ever hidden — operators still see the raw string if they
 * expand the row, but the at-a-glance copy is readable.
 *
 * `apiCategory` is the string to pass to startJob() for a retry; null means
 * the error is not scoped to a single category.
 */
export function translateWasteError(raw: string): TranslatedWasteError {
  const trimmed = raw.trim()

  if (/The truth value of a DataFrame is ambiguous/i.test(trimmed)) {
    return {
      category: null,
      apiCategory: null,
      headline: "Data source freshness info couldn't be computed",
      detail:
        "Findings for this run are still valid — only the dataset metadata panel is affected.",
      tone: "info",
      raw: trimmed,
    }
  }

  const prefixMatch = /^([a-zA-Z_]+):\s*(.*)$/.exec(trimmed)
  if (prefixMatch) {
    const rawFamily = prefixMatch[1].toLowerCase()
    const rest = prefixMatch[2].trim()

    if (rawFamily === "prefetch") {
      return {
        category: null,
        apiCategory: null,
        headline: "Data fetch failed before detectors ran",
        detail: rest || null,
        tone: "warn",
        raw: trimmed,
      }
    }

    if (rawFamily === "confidence" || /^confidence\s+scoring/.test(trimmed)) {
      return {
        category: null,
        apiCategory: null,
        headline: "Confidence scoring step failed",
        detail: "Findings are shown without cross-detector corroboration boosts.",
        tone: "info",
        raw: trimmed,
      }
    }

    if (/^convergence\s+detector/.test(trimmed)) {
      return {
        category: null,
        apiCategory: null,
        headline: "Cross-domain meta-detector didn't run",
        detail: "Per-category findings are unaffected.",
        tone: "info",
        raw: trimmed,
      }
    }

    if (/^entity\s+consolidation/.test(trimmed)) {
      return {
        category: null,
        apiCategory: null,
        headline: "Entity consolidation step failed",
        detail:
          "Same-entity findings across detectors may appear as separate rows instead of a single rolled-up finding.",
        tone: "info",
        raw: trimmed,
      }
    }

    const mapped = KNOWN_ERROR_FAMILIES[rawFamily]
    if (mapped) {
      const label = WASTE_CATEGORY_LABELS[mapped] ?? mapped
      const timeoutMatch = /timed out after (\d+)s/.exec(rest)

      // Distinguish per-detector failure from family-level failure.
      //   Family-level timeout: "contracts: timed out after 300s"
      //     rest = "timed out after 300s"  — starts with "timed out"
      //   Per-detector timeout: "contracts: D20 Debarment Bypass timed out after 90s"
      //     rest = "D20 Debarment Bypass timed out after 90s"  — detector name prefix
      //   Per-detector exception: "contracts: D1 SSS Duplicates: synthetic failure"
      //     rest = "D1 SSS Duplicates: synthetic failure"
      // Per-detector failures mean the family still produced findings from the
      // other detectors, so the tone is info and the copy says so.
      //
      // Covers the full set of prefix shapes the backend emits:
      //   "D1 ...", "D20 ..."           (vendor / payroll / infrastructure / influence)
      //   "D7b ...", "D20i ..."         (letter-suffixed variants)
      //   "RD1 ...", "RD4 ..."          (integrity / revolving door)
      //   "NP1 ..." (future non-profit) (reserved)
      // Cap the uppercase prefix at 2 letters so messages like "Server500"
      // from an exception don't get mis-classified as a per-detector error.
      const perDetectorPattern = /^[A-Z]{1,2}\d+[a-z]?\s/
      const isPerDetectorTimeout =
        !!timeoutMatch && perDetectorPattern.test(rest)
      const isPerDetectorError =
        !timeoutMatch && perDetectorPattern.test(rest)

      if (isPerDetectorTimeout || isPerDetectorError) {
        const detectorName = isPerDetectorTimeout
          ? rest.replace(/\s+timed out after.*$/, "").trim()
          : rest.split(":")[0].trim()
        const detail = isPerDetectorTimeout
          ? `${detectorName} ran past ${timeoutMatch![1]}s and was skipped. Other detectors in this category ran normally.`
          : rest
            ? `${rest} — other detectors in this category ran normally.`
            : null
        return {
          category: mapped,
          apiCategory: mapped,
          headline: `${label} — one detector didn't finish`,
          detail,
          tone: "info",
          raw: trimmed,
        }
      }

      const headline = timeoutMatch
        ? `${label} analysis took too long and didn't finish`
        : `${label} analysis didn't finish`
      const detail = timeoutMatch
        ? `The detectors ran past ${timeoutMatch[1]}s. Showing last good results for this category if available.`
        : rest || null
      return {
        category: mapped,
        apiCategory: mapped,
        headline,
        detail,
        tone: "warn",
        raw: trimmed,
      }
    }
  }

  return {
    category: null,
    apiCategory: null,
    headline: "Detector issue",
    detail: trimmed || null,
    tone: "info",
    raw: trimmed,
  }
}

/**
 * Convert a structured DetectorError from the backend into the same shape
 * used by translateWasteError, but without parsing strings via regex.
 *
 * Prefer this over translateWasteError when the backend response includes
 * `detector_errors` (newer responses do). It's strictly better: the
 * `error_type`, `family`, and `retryable` flags come from the source instead
 * of being heuristically inferred from the message string.
 */
export function translateStructuredError(de: {
  family: string | null
  detector: string | null
  error_type: string
  stage: string
  message: string
  retryable: boolean
}): TranslatedWasteError {
  const raw = de.family ? `${de.family}: ${de.message}` : de.message
  const familyKey = de.family ? KNOWN_ERROR_FAMILIES[de.family.toLowerCase()] : null
  const familyLabel =
    familyKey && WASTE_CATEGORY_LABELS[familyKey] ? WASTE_CATEGORY_LABELS[familyKey] : de.family

  // Stage-level errors that aren't tied to a single family
  if (de.stage === "post") {
    if (de.message.includes("confidence scoring")) {
      return {
        category: null,
        apiCategory: null,
        headline: "Confidence scoring step failed",
        detail: "Findings are shown without cross-detector corroboration boosts.",
        tone: "info",
        raw,
      }
    }
    if (de.message.includes("convergence")) {
      return {
        category: null,
        apiCategory: null,
        headline: "Cross-domain meta-detector didn't run",
        detail: "Per-category findings are unaffected.",
        tone: "info",
        raw,
      }
    }
    if (de.message.includes("entity consolidation")) {
      return {
        category: null,
        apiCategory: null,
        headline: "Entity consolidation step failed",
        detail:
          "Same-entity findings across detectors may appear as separate rows instead of a single rolled-up finding.",
        tone: "info",
        raw,
      }
    }
  }

  if (de.error_type === "data_fetch_partial") {
    const datasetName = de.detector ?? "a dataset"
    return {
      category: null,
      apiCategory: null,
      headline: `Couldn't fetch ${datasetName}`,
      detail: de.retryable
        ? "Looks transient — a retry will likely fix this. Findings depending on this dataset may be missing."
        : "Findings that depend on this dataset may be missing. Check source configuration.",
      tone: "warn",
      raw,
    }
  }

  if (de.error_type === "data_fetch") {
    return {
      category: null,
      apiCategory: null,
      headline: "Data fetch failed before detectors ran",
      detail: de.message,
      tone: "warn",
      raw,
    }
  }

  if (de.error_type === "timeout" && familyKey) {
    return {
      category: familyKey,
      apiCategory: familyKey,
      headline: `${familyLabel} analysis took too long and didn't finish`,
      detail: `The detectors ${de.message}. Showing last good results for this category if available.`,
      tone: "warn",
      raw,
    }
  }

  if (de.error_type === "family_error" && familyKey) {
    return {
      category: familyKey,
      apiCategory: familyKey,
      headline: `${familyLabel} analysis didn't finish`,
      detail: de.message,
      tone: "warn",
      raw,
    }
  }

  if (de.error_type === "no_data" && familyKey) {
    return {
      category: familyKey,
      apiCategory: familyKey,
      headline: `No data available for ${familyLabel}`,
      detail: de.message,
      tone: "info",
      raw,
    }
  }

  if (de.error_type === "invalid_category") {
    return {
      category: null,
      apiCategory: null,
      headline: "Unknown analysis category requested",
      detail: de.message,
      tone: "warn",
      raw,
    }
  }

  // Fallback: still better than guessing from the string
  return {
    category: familyKey,
    apiCategory: familyKey,
    headline: familyLabel
      ? `${familyLabel} analysis issue`
      : "Detector issue",
    detail: de.message || null,
    tone: de.retryable ? "warn" : "info",
    raw,
  }
}

/**
 * Compute the set of failed categories from a structured error list. The
 * structured equivalent of `categoriesWithErrors`. Returns an empty set when
 * `detector_errors` is null/undefined so the caller can fall back to
 * `categoriesWithErrors(errors)`.
 *
 * Per-detector failures (where `detector` is set) are intentionally NOT
 * counted: the family ran and produced findings from its other detectors,
 * carrying over an older run would replace good new findings with stale
 * data.
 */
export function categoriesWithStructuredErrors(
  detectorErrors:
    | Array<{
        family: string | null
        detector?: string | null
        error_type: string
        stage: string
      }>
    | null
    | undefined,
): Set<WasteCategoryKey> {
  const failed = new Set<WasteCategoryKey>()
  if (!detectorErrors) return failed
  for (const de of detectorErrors) {
    if (!de.family) continue
    // prefetch errors apply broadly, not to a single family
    if (de.stage === "prefetch") continue
    // Per-detector failure, family still produced findings, don't carry over.
    if (de.detector) continue
    const mapped = KNOWN_ERROR_FAMILIES[de.family.toLowerCase()]
    if (!mapped) continue
    failed.add(mapped)
  }
  return failed
}

function emptySummary(): WasteSummaryResponse {
  return {
    total_findings: 0,
    critical_count: 0,
    estimated_exposure: 0,
    gross_exposure: 0,
    net_exposure: 0,
    departments_affected: 0,
    categories: [],
  }
}

function summaryForCategory(
  summary: WasteSummaryResponse | undefined,
  category: WasteCategoryKey,
): WasteCategorySummary | null {
  if (!summary?.categories) return null
  return (
    summary.categories.find(
      (c) => normalizeWasteCategory(c.category) === category,
    ) ?? null
  )
}

/**
 * Canonical category keys that can appear in persisted waste findings. Drives
 * the merge loop below. Note: "convergence" is a derived view of the other
 * categories, but persisted findings can carry that label too.
 */
const MERGEABLE_CATEGORIES: WasteCategoryKey[] = [
  "payroll",
  "contracts",
  "infrastructure",
  "influence",
  "integrity",
  "confirmed",
  "convergence",
]

/**
 * Merge findings across the most recent completed runs. For each canonical
 * category we trust the newest run that did NOT record an error for that
 * family (even if it has 0 findings — a legitimate zero is still truth).
 * Only when the newest run errored for a family do we fall back to an older
 * run's findings, and that category is labeled as carried-over.
 *
 * Runs must be ordered newest-first.
 */
export function mergePersistedRuns(
  runs: PersistedRunBundle[],
): MergedPersistedResult | null {
  if (runs.length === 0) return null

  const latest = runs[0]
  const mergedFindings: WasteFinding[] = []
  const mergedCategorySummaries: WasteCategorySummary[] = []
  const carriedOver: CarriedOverCategoryInfo[] = []
  const seenIds = new Set<string>()

  // Precompute each run's failed-category set once.
  const errorsByRun = runs.map((r) => categoriesWithErrors(r.errors))

  for (const category of MERGEABLE_CATEGORIES) {
    // Walk newest → oldest, skipping runs that explicitly errored for this
    // category. The first non-errored run is authoritative.
    let pickedIndex = -1
    for (let i = 0; i < runs.length; i++) {
      if (errorsByRun[i].has(category)) continue
      pickedIndex = i
      break
    }
    if (pickedIndex < 0) continue

    const picked = runs[pickedIndex]
    const findingsForCat = picked.response.findings.filter(
      (f) => normalizeWasteCategory(f.category) === category,
    )

    for (const f of findingsForCat) {
      if (seenIds.has(f.id)) continue
      seenIds.add(f.id)
      mergedFindings.push(f)
    }

    const catSummary = summaryForCategory(picked.response.summary, category)
    if (catSummary) mergedCategorySummaries.push(catSummary)

    // Only flag as carried-over when we actually pulled data from an older
    // run that the latest run couldn't provide. No label for "picked i=0"
    // or for "every run was empty for this category".
    if (pickedIndex > 0 && findingsForCat.length > 0) {
      carriedOver.push({
        category,
        analysisTimestamp: picked.analysisTimestamp,
        reason: "carried from earlier run",
      })
    }
  }

  // Rebuild totals from the merged per-category summaries so the stat bar
  // stays internally consistent after carry-over. Fall back to counting the
  // merged findings if a picked run lacked a summary entry.
  const totalFromSummaries = mergedCategorySummaries.reduce(
    (acc, c) => {
      acc.findings += c.finding_count ?? 0
      acc.critical += c.critical_count ?? 0
      acc.amount += c.total_amount ?? 0
      return acc
    },
    { findings: 0, critical: 0, amount: 0 },
  )

  const findingsCount = mergedFindings.length
  const criticalCount = mergedFindings.filter(
    (f) => f.severity === "critical",
  ).length
  const departmentsAffected = new Set(
    mergedFindings.map((f) => f.department).filter((d) => !!d),
  ).size

  const summary: WasteSummaryResponse = {
    ...(latest.response.summary ?? emptySummary()),
    total_findings: findingsCount || totalFromSummaries.findings,
    critical_count: criticalCount || totalFromSummaries.critical,
    // We don't know the backend's de-duplicated gross/net math after merging,
    // so report the summed exposure consistently across gross/net/estimated.
    estimated_exposure: totalFromSummaries.amount,
    gross_exposure: totalFromSummaries.amount,
    net_exposure: totalFromSummaries.amount,
    departments_affected:
      departmentsAffected ||
      latest.response.summary?.departments_affected ||
      0,
    categories: mergedCategorySummaries,
  }

  return {
    response: {
      ...latest.response,
      findings: mergedFindings,
      summary,
      carried_over_categories: carriedOver.map((c) => ({
        category: c.category,
        analysis_timestamp: c.analysisTimestamp,
        reason: c.reason,
      })),
    },
    carriedOver,
  }
}

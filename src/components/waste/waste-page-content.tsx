"use client"

import { useEffect, useState, useMemo } from "react"
import { useWasteAnalysis, useActiveWasteJob, useLatestPersistedWasteResult } from "@/lib/hooks/useWaste"
import { useWasteCity } from "./WasteCityContext"
import { WasteShell } from "./waste-shell"
import { Button } from "@/components/ui/button"
import { RefreshCw, AlertTriangle, Clock, Database, Square, ShieldAlert } from "lucide-react"
import type {
  WasteAnalyzeResponse,
  WasteDataFreshness,
  WasteFinding,
} from "@/lib/apiClient"

import { WasteStatBar } from "./waste-stat-bar"
import { WasteCategoryTabs } from "./waste-category-tabs"
import { WasteSeverityFilter } from "./waste-severity-filter"
import { WasteFindingsList } from "./waste-findings-list"
import { WasteExport } from "./waste-export"
import { WasteClusterMap } from "./waste-cluster-map"
import {
  WasteSeymourPanel,
  type WasteSeymourRequest,
} from "./waste-seymour-panel"
import { WasteDetectorsData } from "./waste-detectors-data"
import { WasteReviewQueue } from "./waste-review-queue"
import { WasteDetectorAccuracy } from "./waste-detector-accuracy"
import {
  normalizeWasteCategory,
  getWasteCategoryLabel,
  getWasteCategoryDescription,
  formatDollar,
  safeSetCache,
  loadCachedAnalysis,
  wasteCacheKey,
  type WasteCategoryKey,
} from "./waste-utils"

type SeverityFilter = "all" | "critical" | "high" | "medium"

const WASTE_ANALYSIS_ESTIMATED_SECONDS = 900
const STALE_DATA_WARNING_DAYS = 7

function formatAge(isoDate: string): string {
  const date = new Date(isoDate)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))
  if (diffDays === 0) return "today"
  if (diffDays === 1) return "1 day ago"
  if (diffDays < 30) return `${diffDays} days ago`
  const diffMonths = Math.floor(diffDays / 30)
  return `${diffMonths} month${diffMonths > 1 ? "s" : ""} ago`
}

export function getWasteAnalysisProgress(elapsedSeconds: number): {
  step: string
  etaLabel: string
  progressPct: number
  isLongRunning: boolean
} {
  let step = "Connecting to city data sources..."
  if (elapsedSeconds > 5) {
    step = "Fetching datasets from open data portal..."
  }
  if (elapsedSeconds > 60) {
    step = "Still fetching — large datasets can take a few minutes..."
  }
  if (elapsedSeconds > 150) {
    step = "Running payroll & compensation detectors..."
  }
  if (elapsedSeconds > 210) {
    step = "Scanning vendor contracts for anomalies..."
  }
  if (elapsedSeconds > 270) {
    step = "Checking infrastructure & service patterns..."
  }
  if (elapsedSeconds > 310) {
    step = "Scoring and prioritizing findings..."
  }
  if (elapsedSeconds > 340) {
    step = "Persisting results to database..."
  }
  if (elapsedSeconds > WASTE_ANALYSIS_ESTIMATED_SECONDS) {
    const mins = Math.floor(elapsedSeconds / 60)
    step = `Still processing (${mins}m ${elapsedSeconds % 60}s) — wrapping up`
  }
  if (elapsedSeconds > 540) {
    const mins = Math.floor(elapsedSeconds / 60)
    step = `Running longer than expected (${mins}m) — checking server status`
  }

  const remaining = Math.max(0, WASTE_ANALYSIS_ESTIMATED_SECONDS - elapsedSeconds)
  const isLongRunning = elapsedSeconds > WASTE_ANALYSIS_ESTIMATED_SECONDS + 12
  const etaLabel = isLongRunning
    ? "Taking longer than usual, but still processing in the background"
    : remaining > 0
      ? `Estimated time left: ~${remaining}s`
      : "Estimated time left: wrapping up"

  const progressPct = Math.min(
    95,
    Math.max(6, Math.round((elapsedSeconds / WASTE_ANALYSIS_ESTIMATED_SECONDS) * 100))
  )

  return { step, etaLabel, progressPct, isLongRunning }
}

function DataSourceDetails({ freshness }: { freshness: WasteDataFreshness[] }) {
  return (
    <div className="space-y-1">
      {freshness.map((ds, i) => (
        <div key={i} className="flex items-center gap-2 text-xs">
          <Database className="w-3 h-3 text-gray-400" />
          <span className="font-medium text-gray-700">
            {ds.dataset_name}
          </span>
          <span className="text-gray-500">
            {ds.rows_fetched.toLocaleString()} rows
          </span>
          {ds.data_as_of && (
            <span className="text-gray-400">
              updated {formatAge(ds.data_as_of)}
            </span>
          )}
          {ds.stale && (
            <span className="text-amber-600 font-medium">
              {ds.stale_reason}
            </span>
          )}
          {ds.is_partial_year && (
            <span className="text-blue-600 font-medium">
              partial year
            </span>
          )}
        </div>
      ))}
    </div>
  )
}

export function WastePageContent() {
  const [activeCategory, setActiveCategory] = useState<WasteCategoryKey>("overview")
  const [severityFilter, setSeverityFilter] = useState<SeverityFilter>("all")
  const [seymourRequest, setSeymourRequest] = useState<WasteSeymourRequest | null>(null)
  const { selectedCityId } = useWasteCity()
  const [cachedData] = useState<WasteAnalyzeResponse | null>(() => loadCachedAnalysis(selectedCityId))
  const [restoredData, setRestoredData] = useState<WasteAnalyzeResponse | null>(null)
  const now = new Date()
  const localDateKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(
    now.getDate()
  ).padStart(2, "0")}`
  const tokenStorageKey = `waste:seymour_tokens:${localDateKey}`
  const [todaySeymourTokens, setTodaySeymourTokens] = useState(() => {
    if (typeof window === "undefined") return 0
    const saved = window.localStorage.getItem(tokenStorageKey)
    const parsed = saved ? parseInt(saved, 10) : 0
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0
  })

  // Load last persisted run from DB — instant data even when live analysis times out
  const { data: persistedData } = useLatestPersistedWasteResult(selectedCityId)

  // Only auto-fetch live analysis if we have NO fallback data (cache or persisted).
  // This avoids hammering a struggling backend when we already have good data to show.
  const hasFallbackData = !!(cachedData || persistedData)
  const { data, error } = useWasteAnalysis(undefined, !hasFallbackData, selectedCityId)

  const { activeJob, isRunning: isManualRefreshing, startJob, cancelJob: cancelActiveJob, startError, retryCount, lastDiagnostics } = useActiveWasteJob(selectedCityId)

  // Fallback chain: fresh API data → persisted DB run → restored data → localStorage cache.
  // persistedData must beat cachedData so that completed refresh jobs actually
  // update the display (cachedData is a stale localStorage snapshot from mount).
  // restoredData is set when the user clicks "Restore previous results" after a failure.
  const displayData = data ?? persistedData ?? restoredData ?? cachedData
  const showLoadingState = isManualRefreshing && !displayData

  // Auto-trigger refresh if persisted data is very stale
  const analysisTimestamp = displayData?.analysis_timestamp
  const isDataStale = useMemo(() => {
    if (!analysisTimestamp) return false
    const ageMs = new Date().getTime() - new Date(analysisTimestamp).getTime()
    return ageMs > STALE_DATA_WARNING_DAYS * 24 * 60 * 60 * 1000
  }, [analysisTimestamp])
  const hasNoData = !displayData && !isManualRefreshing && !error

  // Derive progress from the live job data
  const jobProgress = activeJob?.progress ?? 0
  const jobStatusMessage = activeJob?.status_message ?? ""

  // Track elapsed seconds; interval callbacks are fine for setState
  const [analysisElapsedSeconds, setAnalysisElapsedSeconds] = useState(0)
  useEffect(() => {
    if (!isManualRefreshing) return
    const interval = window.setInterval(() => {
      setAnalysisElapsedSeconds((t) => t + 1)
    }, 1000)
    return () => {
      window.clearInterval(interval)
      setAnalysisElapsedSeconds(0)
    }
  }, [isManualRefreshing])

  const analysisProgress = useMemo(() => {
    // Prefer real job progress from backend; fall back to time-based estimate
    const timeBased = getWasteAnalysisProgress(analysisElapsedSeconds)
    const pct = jobProgress > 0 ? jobProgress : timeBased.progressPct
    const step = jobStatusMessage || timeBased.step
    const isLongRunning = analysisElapsedSeconds > WASTE_ANALYSIS_ESTIMATED_SECONDS + 12
    return { step, progressPct: Math.min(pct, 99), isLongRunning, etaLabel: timeBased.etaLabel }
  }, [jobProgress, jobStatusMessage, analysisElapsedSeconds])

  // Persist fresh data to localStorage cache
  useEffect(() => {
    if (!data || typeof window === "undefined") return
    safeSetCache(wasteCacheKey(selectedCityId), data, selectedCityId)
  }, [data, selectedCityId])

  // Keep localStorage in sync when persisted data loads so the next page
  // visit shows fresh data instantly (not a stale cache from a prior session).
  // safeSetCache already guards against overwriting good data with empty data,
  // but we add an explicit check here for clarity.
  useEffect(() => {
    if (!persistedData || typeof window === "undefined") return
    if ((persistedData.findings?.length ?? 0) === 0) return
    safeSetCache(wasteCacheKey(selectedCityId), persistedData, selectedCityId)
  }, [persistedData, selectedCityId])

  const handleRefresh = () => {
    // Clear any manually-restored snapshot so it doesn't shadow fresh results
    setRestoredData(null)
    // Always run all categories so a single-category run doesn't replace
    // the full persisted dataset (which would make other tabs show 0 findings).
    startJob()
  }

  // Keep category state in sync with hash navigation from the sidebar.
  useEffect(() => {
    if (typeof window === "undefined") return

    const applyHashCategory = () => {
      const raw = window.location.hash.replace("#", "")
      if (!raw) return
      setActiveCategory(normalizeWasteCategory(raw))
      setSeverityFilter("all")
    }

    applyHashCategory()
    window.addEventListener("hashchange", applyHashCategory)
    return () => window.removeEventListener("hashchange", applyHashCategory)
  }, [])

  // Findings come pre-sorted by priority_score from the backend
  const categoryFindings = useMemo(() => {
    if (!displayData?.findings) return []
    return displayData.findings
      .filter((f) => normalizeWasteCategory(f.category) === activeCategory)
  }, [displayData, activeCategory])

  // Filter by severity
  const filteredFindings = useMemo(() => {
    if (severityFilter === "all") return categoryFindings
    return categoryFindings.filter((f) => f.severity?.toLowerCase() === severityFilter)
  }, [categoryFindings, severityFilter])

  // Get infrastructure findings for cluster map
  const infraFindings = useMemo(() => {
    if (!displayData?.findings) return []
    return displayData.findings.filter(
      (f) =>
        normalizeWasteCategory(f.category) === "infrastructure" &&
        (f.subcategory === "Infrastructure Cluster" ||
          f.subcategory === "Pavement/Sidewalk Failure Hotspot")
    )
  }, [displayData])

  // Reset severity filter when category changes
  const handleCategoryChange = (cat: string) => {
    const normalized = normalizeWasteCategory(cat)
    setActiveCategory(normalized)
    setSeverityFilter("all")
    if (typeof window !== "undefined") {
      window.history.replaceState(null, "", `#${normalized}`)
    }
  }

  const handleSeymourUsage = (tokensUsed: number) => {
    if (!tokensUsed || tokensUsed <= 0) return
    setTodaySeymourTokens((prev) => {
      const next = prev + tokensUsed
      if (typeof window !== "undefined") {
        window.localStorage.setItem(tokenStorageKey, String(next))
      }
      return next
    })
  }

  const handleAskSeymour = (finding: WasteFinding) => {
    setSeymourRequest({ finding })
  }

  const isDetectorsView = activeCategory === "detectors"
  const isReviewView = activeCategory === "review"
  const isAccuracyView = activeCategory === "accuracy"
  const isOverviewView = activeCategory === "overview"
  const isCategoryView = !isDetectorsView && !isReviewView && !isAccuracyView && !isOverviewView

  // Category-specific summary for the active category
  const activeCategorySummary = useMemo(() => {
    if (!displayData?.summary?.categories) return null
    return displayData.summary.categories.find(
      (c) => normalizeWasteCategory(c.category) === activeCategory
    ) ?? null
  }, [displayData, activeCategory])

  const hasDataQualityInfo = useMemo(() => {
    const freshness = displayData?.data_freshness
    const hasFreshnessInfo = (freshness?.length ?? 0) > 0 &&
      (freshness?.some((d) => d.stale || d.is_partial_year) ?? false)
    const hasErrors = (displayData?.errors?.length ?? 0) > 0
    return hasFreshnessInfo || hasErrors
  }, [displayData])

  const dataQualitySummaryLabel = useMemo(() => {
    const staleCount = displayData?.data_freshness?.filter((d) => d.stale).length ?? 0
    const errorCount = displayData?.errors?.length ?? 0
    const parts: string[] = []
    if (staleCount > 0) parts.push(`${staleCount} stale dataset${staleCount !== 1 ? "s" : ""}`)
    if (errorCount > 0) parts.push(`${errorCount} detector issue${errorCount !== 1 ? "s" : ""}`)
    if (parts.length === 0) {
      const partialCount = displayData?.data_freshness?.filter((d) => d.is_partial_year).length ?? 0
      if (partialCount > 0) parts.push(`${partialCount} partial-year dataset${partialCount !== 1 ? "s" : ""}`)
    }
    return parts.length > 0 ? parts.join(", ") : "Data sources"
  }, [displayData])

  const consolidatedStatus = useMemo(() => {
    if (isManualRefreshing) return null

    if (activeJob?.status === "failed" || startError || error) {
      return {
        tone: "amber",
        title: activeJob?.error_message || startError
          ? "Refresh failed - showing last available results"
          : "Live analysis unavailable - showing last available results",
        detail:
          (startError as string | undefined) ||
          (error instanceof Error ? error.message : undefined) ||
          activeJob?.error_message ||
          "Retry to run a fresh analysis.",
      } as const
    }

    if (displayData?.analysis_timestamp && !data) {
      return {
        tone: isDataStale ? "purple" : "gray",
        title: isDataStale
          ? `Results are from ${formatAge(displayData.analysis_timestamp)}`
          : `Showing saved results from ${new Date(displayData.analysis_timestamp).toLocaleDateString(undefined, {
              month: "short",
              day: "numeric",
            })}`,
        detail: isDataStale
          ? "Run a fresh analysis to check for new anomalies."
          : "Run Refresh to fetch the latest analysis.",
      } as const
    }

    return null
  }, [isManualRefreshing, hasNoData, activeJob?.status, activeJob?.error_message, startError, error, displayData, data, isDataStale])

  return (
    <WasteShell
      title={getWasteCategoryLabel(activeCategory)}
      description={getWasteCategoryDescription(activeCategory)}
      activeCategory={activeCategory}
      onCategoryChange={handleCategoryChange}
      actions={
        (isOverviewView || isCategoryView) ? (
          <div className="flex items-center gap-3">
            {isManualRefreshing && (
              <div className="flex items-center gap-2 text-sm text-blue-700">
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                <span className="tabular-nums">{analysisProgress.progressPct}%</span>
                <div className="w-24 h-1.5 rounded-full bg-blue-100 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-blue-500 transition-all duration-500 ease-out"
                    style={{ width: `${analysisProgress.progressPct}%` }}
                  />
                </div>
              </div>
            )}
            {!isManualRefreshing && displayData?.analysis_timestamp && (
              <span className="text-xs text-gray-400">
                Last run{" "}
                {new Date(displayData.analysis_timestamp).toLocaleDateString(undefined, {
                  month: "short",
                  day: "numeric",
                })}
              </span>
            )}
            {isManualRefreshing ? (
              <div className="flex items-center gap-1.5">
                <Button
                  variant="default"
                  size="sm"
                  disabled
                  className="bg-blue-600 text-white border-blue-600 cursor-wait"
                >
                  <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                  Analyzing…
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={cancelActiveJob}
                  className="border-red-300 text-red-700 hover:bg-red-50"
                >
                  <Square className="w-3.5 h-3.5 mr-1.5" />
                  Stop
                </Button>
              </div>
            ) : (
              <Button
                variant="outline"
                size="sm"
                onClick={handleRefresh}
              >
                <RefreshCw className="w-4 h-4 mr-2" />
                Refresh
              </Button>
            )}
          </div>
        ) : undefined
      }
    >
      {activeCategory === "detectors" ? (
        <WasteDetectorsData />
      ) : activeCategory === "review" ? (
        <WasteReviewQueue cityId={selectedCityId} />
      ) : activeCategory === "accuracy" ? (
        <WasteDetectorAccuracy cityId={selectedCityId} />
      ) : (
        <>
          {/* Empty state — no data at all, prompt user to run */}
          {hasNoData && !showLoadingState && (
            <div className="flex flex-col items-center justify-center py-16 text-center" data-testid="empty-state">
              <ShieldAlert className="w-12 h-12 text-gray-300 mb-4" />
              <h2 className="text-lg font-semibold text-gray-700 mb-2">No analysis data yet</h2>
              <p className="text-sm text-gray-500 mb-6 max-w-md">
                Run a waste analysis to scan public city data for anomalies in payroll, contracts, and infrastructure spending.
              </p>
              <Button onClick={handleRefresh} size="lg">
                <RefreshCw className="w-4 h-4 mr-2" />
                Run Waste Analysis
              </Button>
              <p className="text-xs text-gray-400 mt-3">Takes about 2 minutes</p>
            </div>
          )}

          {/* Unified status panel: current state + data age + action */}
          {(consolidatedStatus || hasDataQualityInfo) && (
            <div
              className={`mb-4 rounded-lg border ${
                consolidatedStatus?.tone === "amber"
                  ? "bg-amber-50 border-amber-200"
                  : consolidatedStatus?.tone === "purple"
                    ? "bg-purple-50 border-purple-200"
                    : "bg-gray-50 border-gray-200"
              }`}
            >
              {consolidatedStatus && (
                <div className="p-3 flex items-center gap-3">
                  <Clock
                    className={`w-4 h-4 shrink-0 ${
                      consolidatedStatus.tone === "amber"
                        ? "text-amber-500"
                        : consolidatedStatus.tone === "purple"
                          ? "text-purple-500"
                          : "text-gray-500"
                    }`}
                  />
                  <div className="flex-1 min-w-0">
                    <p
                      className={`text-sm font-medium ${
                        consolidatedStatus.tone === "amber"
                          ? "text-amber-800"
                          : consolidatedStatus.tone === "purple"
                            ? "text-purple-800"
                            : "text-gray-700"
                      }`}
                    >
                      {consolidatedStatus.title}
                    </p>
                    <p
                      className={`text-xs mt-0.5 ${
                        consolidatedStatus.tone === "amber"
                          ? "text-amber-700"
                          : consolidatedStatus.tone === "purple"
                            ? "text-purple-700"
                            : "text-gray-500"
                      }`}
                    >
                      {consolidatedStatus.detail}
                    </p>
                  </div>
                  <Button variant="outline" size="sm" onClick={handleRefresh}>
                    <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
                    Refresh
                  </Button>
                </div>
              )}

              {hasDataQualityInfo && (
                <details className={consolidatedStatus ? "border-t border-gray-200" : ""}>
                  <summary className="flex items-center gap-2 px-3 py-2 cursor-pointer list-none [&::-webkit-details-marker]:hidden text-xs text-gray-600 hover:text-gray-800">
                    <Database className="w-3.5 h-3.5 text-gray-400" />
                    <span className="font-medium">
                      {dataQualitySummaryLabel}
                    </span>
                    <span className="ml-auto text-gray-400">Details</span>
                  </summary>
                  <div className="px-3 pb-3 space-y-2">
                    {displayData?.data_freshness && displayData.data_freshness.length > 0 && (
                      <DataSourceDetails freshness={displayData.data_freshness} />
                    )}
                    {displayData?.errors && displayData.errors.length > 0 && (
                      <div className="space-y-1">
                        <p className="text-xs font-medium text-amber-700">
                          {displayData.errors.length} detector{displayData.errors.length !== 1 ? "s" : ""} had issues
                        </p>
                        {displayData.errors.map((err, i) => (
                          <p key={i} className="text-xs text-amber-600">{err}</p>
                        ))}
                      </div>
                    )}
                  </div>
                </details>
              )}
            </div>
          )}

          {isManualRefreshing && (
            <div className="mb-4 p-4 bg-blue-50 border border-blue-200 rounded-lg" data-testid="analysis-loading-card">
              <div className="flex items-center gap-3 mb-3">
                <RefreshCw className="w-5 h-5 text-blue-600 animate-spin shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-blue-800">{analysisProgress.step}</p>
                  <p className="text-xs text-blue-500 mt-0.5">{analysisProgress.etaLabel}</p>
                </div>
                <span className="text-lg font-semibold text-blue-700 tabular-nums">
                  {analysisProgress.progressPct}%
                </span>
              </div>
              <div className="w-full h-2 rounded-full bg-blue-100 overflow-hidden">
                <div
                  className="h-full rounded-full bg-blue-500 transition-all duration-500 ease-out"
                  style={{ width: `${analysisProgress.progressPct}%` }}
                />
              </div>
              {retryCount > 0 && (
                <div className="mt-3 flex items-center gap-2 text-xs text-blue-700 bg-blue-100 border border-blue-200 rounded p-2">
                  <RefreshCw className="w-3.5 h-3.5 shrink-0" />
                  <span>Auto-retrying after timeout (attempt {retryCount + 1} of 2)</span>
                </div>
              )}
              {analysisProgress.isLongRunning && retryCount === 0 && (
                <div className="mt-3 flex items-center gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded p-2">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                  <span>Taking longer than usual — will auto-retry if it times out</span>
                  {!isManualRefreshing && displayData && (
                    <span className="ml-auto text-amber-500">Showing previous results while running</span>
                  )}
                </div>
              )}
              {isManualRefreshing && displayData && (
                <p className="mt-2 text-xs text-blue-500">
                  Previous results are shown below while the new analysis runs.
                </p>
              )}
            </div>
          )}

          {/* Error banner — hidden while refresh is running or when the more specific
              timeout/failure banner is already shown (avoids two amber banners). */}
          {false && error && !isManualRefreshing && !(activeJob?.status === "failed") && (
            <details className={`mb-4 rounded-lg group ${displayData ? "bg-amber-50 border border-amber-200" : "bg-red-50 border border-red-200"}`}>
              <summary className="flex items-center gap-2 p-2.5 cursor-pointer list-none [&::-webkit-details-marker]:hidden">
                <AlertTriangle className={`w-3.5 h-3.5 shrink-0 ${displayData ? "text-amber-500" : "text-red-500"}`} />
                <span className={`text-xs font-medium ${displayData ? "text-amber-800" : "text-red-800"}`}>
                  {displayData ? "Live analysis unavailable — showing previous results" : "Analysis error"}
                </span>
                <div className="flex items-center gap-1.5 shrink-0 ml-auto">
                  {!displayData && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        const backup = loadCachedAnalysis(selectedCityId)
                        if (backup) setRestoredData(backup)
                      }}
                      className="text-xs border-red-300 text-red-800 hover:bg-red-100"
                    >
                      <Database className="w-3 h-3 mr-1" />
                      Restore previous
                    </Button>
                  )}
                  <Button variant="outline" size="sm" onClick={handleRefresh} className={`text-xs ${displayData ? "border-amber-300 text-amber-800 hover:bg-amber-100" : "border-red-300 text-red-800 hover:bg-red-100"}`}>
                    Retry
                  </Button>
                </div>
              </summary>
              <p className={`px-2.5 pb-2.5 text-xs break-all ${displayData ? "text-amber-600" : "text-red-600"}`}>
                {error! instanceof Error ? error!.message : "Failed to load waste analysis"}
              </p>
            </details>
          )}

          {/* Start job error banner — hidden when timeout banner already visible */}
          {false && startError && !isManualRefreshing && !(activeJob?.status === "failed") && (
            <details className={`mb-4 rounded-lg group ${displayData ? "bg-amber-50 border border-amber-200" : "bg-red-50 border border-red-200"}`}>
              <summary className="flex items-center gap-3 p-3 cursor-pointer list-none [&::-webkit-details-marker]:hidden">
                <AlertTriangle className={`w-4 h-4 shrink-0 ${displayData ? "text-amber-500" : "text-red-500"}`} />
                <span className={`text-sm font-medium flex-1 ${displayData ? "text-amber-800" : "text-red-800"}`}>
                  {displayData ? "Refresh failed — showing previous results" : "Could not start analysis"}
                </span>
                <div className="flex items-center gap-1.5 shrink-0 ml-2">
                  {!displayData && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        const backup = loadCachedAnalysis(selectedCityId)
                        if (backup) setRestoredData(backup)
                      }}
                      className={`${displayData ? "border-amber-300 text-amber-800 hover:bg-amber-100" : "border-red-300 text-red-800 hover:bg-red-100"}`}
                    >
                      <Database className="w-3 h-3 mr-1" />
                      Restore previous
                    </Button>
                  )}
                  <Button variant="outline" size="sm" onClick={handleRefresh} className={`${displayData ? "border-amber-300 text-amber-800 hover:bg-amber-100" : "border-red-300 text-red-800 hover:bg-red-100"}`}>
                    Retry
                  </Button>
                </div>
              </summary>
              <div className="px-3 pb-3 pt-0">
                <p className={`text-xs font-mono whitespace-pre-wrap break-all max-h-32 overflow-y-auto rounded p-2 ${displayData ? "text-amber-600 bg-amber-100/50" : "text-red-600 bg-red-100/50"}`}>{startError}</p>
              </div>
            </details>
          )}

          {/* Timeout / failure banner with collapsible diagnostics */}
          {false && !isManualRefreshing && activeJob?.status === "failed" && (
            <div className="mb-4 bg-amber-50 border border-amber-200 rounded-lg text-sm">
              <div className="flex items-center justify-between gap-3 p-3">
                <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
                <span className="text-amber-800 flex-1">
                  {activeJob?.error_message || "Analysis failed. Showing previous snapshot."}
                </span>
                <div className="flex items-center gap-1.5 shrink-0">
                  {!displayData && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        const backup = loadCachedAnalysis(selectedCityId)
                        if (backup) setRestoredData(backup)
                      }}
                      className="border-amber-300 text-amber-800 hover:bg-amber-100"
                    >
                      <Database className="w-3 h-3 mr-1" />
                      Restore previous
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleRefresh}
                    className="border-amber-300 text-amber-800 hover:bg-amber-100"
                  >
                    Retry
                  </Button>
                </div>
              </div>
              {lastDiagnostics && (
                <details className="border-t border-amber-200">
                  <summary className="px-3 py-1.5 text-xs text-amber-600 cursor-pointer list-none [&::-webkit-details-marker]:hidden hover:text-amber-800">
                    Diagnostics
                  </summary>
                  <div className="px-3 pb-2 text-xs text-amber-700 space-y-0.5 font-mono" data-testid="failure-diagnostics">
                    <p>Stuck at: {lastDiagnostics!.lastProgress}%{lastDiagnostics!.lastStatusMessage && ` — "${lastDiagnostics!.lastStatusMessage}"`}</p>
                    {lastDiagnostics!.startedAt && <p>Started: {new Date(lastDiagnostics!.startedAt!).toLocaleTimeString()}</p>}
                    <p>Last update: {new Date(lastDiagnostics!.lastUpdateAt!).toLocaleTimeString()}</p>
                    <p className="text-amber-500">Job: {lastDiagnostics!.jobId}</p>
                  </div>
                </details>
              )}
            </div>
          )}

          {/* Legacy banners removed — data freshness and detector errors are
              now shown inside the unified status panel above. */}

          {/* ─── OVERVIEW: summary only, no individual findings ─── */}
          {isOverviewView && (
            <>
              <WasteStatBar summary={displayData?.summary} isLoading={showLoadingState || (isManualRefreshing && !displayData)} />

              {/* Category summary cards — click to navigate */}
              <WasteCategoryTabs
                activeCategory={activeCategory}
                onCategoryChange={handleCategoryChange}
                categorySummaries={displayData?.summary?.categories ?? []}
                isLoading={isManualRefreshing && !displayData}
              />
            </>
          )}

          {/* ─── CATEGORY VIEW: summary header + findings ─── */}
          {isCategoryView && (
            <>
              {/* Category summary stats — derived from actual findings array
                  so counts always match the list below (prevents stale summary
                  showing "131 findings" when localStorage trimmed them away). */}
              {categoryFindings.length > 0 && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                  <div className="bg-white rounded-lg border border-gray-200 p-3">
                    <p className="text-xs text-gray-500">Findings</p>
                    <p className="text-2xl font-bold">{categoryFindings.length}</p>
                  </div>
                  <div className="bg-white rounded-lg border border-gray-200 p-3">
                    <p className="text-xs text-gray-500">Critical</p>
                    <p className="text-2xl font-bold text-red-600">{categoryFindings.filter(f => f.severity?.toLowerCase() === "critical").length}</p>
                  </div>
                  <div className="bg-white rounded-lg border border-gray-200 p-3">
                    <p className="text-xs text-gray-500">High</p>
                    <p className="text-2xl font-bold text-amber-600">{categoryFindings.filter(f => f.severity?.toLowerCase() === "high").length}</p>
                  </div>
                  <div className="bg-white rounded-lg border border-gray-200 p-3">
                    <p className="text-xs text-gray-500">Exposure</p>
                    <p className="text-2xl font-bold">{formatDollar(categoryFindings.reduce((sum, f) => sum + (f.amount ?? 0), 0) || null)}</p>
                  </div>
                </div>
              )}

              {/* Warn when summary reports findings but they're missing from the array
                  (happens when localStorage cache was trimmed or persisted data incomplete) */}
              {categoryFindings.length === 0 && activeCategorySummary && activeCategorySummary.finding_count > 0 && !showLoadingState && (
                <div className="mb-4 p-3 rounded-lg border bg-amber-50 border-amber-200 flex items-center gap-3">
                  <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-amber-800">
                      {activeCategorySummary.finding_count} findings expected but not loaded
                    </p>
                    <p className="text-xs text-amber-600 mt-0.5">
                      Cached data may be incomplete. Run a fresh analysis to load all findings.
                    </p>
                  </div>
                  <Button variant="outline" size="sm" onClick={handleRefresh} className="shrink-0 border-amber-300 text-amber-700 hover:bg-amber-100">
                    <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
                    Refresh
                  </Button>
                </div>
              )}

              {/* Filter row */}
              <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                <WasteSeverityFilter
                  findings={categoryFindings}
                  activeFilter={severityFilter}
                  onFilterChange={setSeverityFilter}
                />
                <WasteExport category={activeCategory} cityId={selectedCityId} />
              </div>

              {/* Cluster map for infrastructure */}
              {activeCategory === "infrastructure" && infraFindings.length > 0 && (
                <WasteClusterMap findings={infraFindings} cityId={selectedCityId} />
              )}

              {/* Findings List */}
              {showLoadingState ? (
                <div className="space-y-3">
                  {[...Array(5)].map((_, i) => (
                    <div key={i} className="h-14 bg-gray-100 rounded-lg animate-pulse" />
                  ))}
                </div>
              ) : (
                <WasteFindingsList
                  findings={filteredFindings}
                  onAskSeymour={handleAskSeymour}
                  cityId={selectedCityId}
                />
              )}
            </>
          )}

          {/* Footer */}
          <div className="mt-5 pt-3 border-t border-gray-200">
            <p className="text-xs text-gray-500 text-center mb-1">
              Seymour tokens used today in Waste: {todaySeymourTokens.toLocaleString()}
            </p>
            <p className="text-xs text-gray-400 text-center">
              Data: City Open Data Portal &middot; Anomalies &ne; confirmed fraud &middot; Sorted by confidence &amp; priority
            </p>
          </div>

          <WasteSeymourPanel
            request={seymourRequest}
            onClose={() => setSeymourRequest(null)}
            onSeymourUsage={handleSeymourUsage}
          />
        </>
      )}
    </WasteShell>
  )
}

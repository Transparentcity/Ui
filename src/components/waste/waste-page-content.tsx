"use client"

import { useEffect, useState, useMemo } from "react"
import { useQuery } from "@tanstack/react-query"
import { useWasteAnalysis, useActiveWasteJob } from "@/lib/hooks/useWaste"
import { listPublicCitiesForSitemap } from "@/lib/publicApiClient"
import { WasteShell } from "./waste-shell"
import { Button } from "@/components/ui/button"
import { RefreshCw, AlertTriangle, Clock, Database } from "lucide-react"
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
import { SeverityDonut } from "./widgets/severity-donut"
import { QueueStatus } from "./widgets/queue-status"
import { AccuracyBars } from "./widgets/accuracy-bars"
import { InvestigationSummary } from "./widgets/investigation-summary"
import {
  normalizeWasteCategory,
  safeSetCache,
  WASTE_ANALYSIS_CACHE_KEY,
  type WasteCategoryKey,
} from "./waste-utils"

type SeverityFilter = "all" | "critical" | "high" | "medium"

const WASTE_ANALYSIS_ESTIMATED_SECONDS = 120
// (timeout constant removed — job polling handles lifecycle)

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
  let step = "Fetching latest records from city datasets"
  if (elapsedSeconds > 8) {
    step = "Running payroll and compensation detectors"
  }
  if (elapsedSeconds > 15) {
    step = "Running vendor and contract detectors"
  }
  if (elapsedSeconds > 35) {
    step = "Running infrastructure and services detectors"
  }
  if (elapsedSeconds > 45) {
    step = "Running influence and integrity detectors — cross-matching employee and vendor records"
  }
  if (elapsedSeconds > 80) {
    step = "Scoring findings and preparing results"
  }
  if (elapsedSeconds > WASTE_ANALYSIS_ESTIMATED_SECONDS) {
    const mins = Math.floor(elapsedSeconds / 60)
    step = `Still processing (${mins}m ${elapsedSeconds % 60}s) — large datasets can take several minutes`
  }
  if (elapsedSeconds > 300) {
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

function DataFreshnessBanner({ freshness }: { freshness: WasteDataFreshness[] }) {
  const staleDatasets = freshness.filter((d) => d.stale)
  const anyStale = staleDatasets.length > 0
  const anyPartial = freshness.some((d) => d.is_partial_year)

  if (!anyStale && !anyPartial) return null

  return (
    <div
      className={`mb-6 p-4 rounded-lg border flex items-start gap-3 ${
        anyStale
          ? "bg-amber-50 border-amber-200"
          : "bg-blue-50 border-blue-200"
      }`}
    >
      <Clock
        className={`w-5 h-5 shrink-0 mt-0.5 ${
          anyStale ? "text-amber-500" : "text-blue-500"
        }`}
      />
      <div className="flex-1">
        <p
          className={`text-sm font-medium ${
            anyStale ? "text-amber-800" : "text-blue-800"
          }`}
        >
          {anyStale ? "Some data may be stale" : "Partial fiscal year data"}
        </p>
        <div className="mt-1 space-y-1">
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
      </div>
    </div>
  )
}

export function WastePageContent() {
  const [activeCategory, setActiveCategory] = useState<WasteCategoryKey>("payroll")
  const [severityFilter, setSeverityFilter] = useState<SeverityFilter>("all")
  const [seymourRequest, setSeymourRequest] = useState<WasteSeymourRequest | null>(null)
  const [cachedData] = useState<WasteAnalyzeResponse | null>(() => {
    if (typeof window === "undefined") return null
    try {
      const raw = window.localStorage.getItem(WASTE_ANALYSIS_CACHE_KEY)
      if (!raw) return null
      if (raw.length > 4_000_000) {
        window.localStorage.removeItem(WASTE_ANALYSIS_CACHE_KEY)
        return null
      }
      return JSON.parse(raw) as WasteAnalyzeResponse
    } catch {
      try { window.localStorage.removeItem(WASTE_ANALYSIS_CACHE_KEY) } catch { /* noop */ }
      return null
    }
  })
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

  // Use public API so the waste page works without auth (SSR-safe; no useAuth0)
  const citiesQuery = useQuery({
    queryKey: ["public", "cities", "sitemap"],
    queryFn: listPublicCitiesForSitemap,
    staleTime: 5 * 60 * 1000,
  })
  const wasteEligibleCities = useMemo(
    () => (citiesQuery.data ?? []).filter((city) => (city.datasets_count ?? 0) > 0),
    [citiesQuery.data]
  )
  const selectedCityId = useMemo(() => {
    if (wasteEligibleCities.length > 0) {
      return Number(wasteEligibleCities[0].id)
    }
    return null
  }, [wasteEligibleCities])

  const { data, error } = useWasteAnalysis(undefined, true)

  const { activeJob, isRunning: isManualRefreshing, startJob } = useActiveWasteJob(selectedCityId)

  const displayData = data ?? cachedData
  const showLoadingState = isManualRefreshing && !displayData

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
    const pct = jobProgress > 0 ? jobProgress : getWasteAnalysisProgress(analysisElapsedSeconds).progressPct
    const step = jobStatusMessage || getWasteAnalysisProgress(analysisElapsedSeconds).step
    const isLongRunning = analysisElapsedSeconds > WASTE_ANALYSIS_ESTIMATED_SECONDS + 12
    return { step, progressPct: Math.min(pct, 99), isLongRunning }
  }, [jobProgress, jobStatusMessage, analysisElapsedSeconds])

  // Persist fresh data to localStorage cache
  useEffect(() => {
    if (!data || typeof window === "undefined") return
    safeSetCache(WASTE_ANALYSIS_CACHE_KEY, data)
  }, [data])

  const handleRefresh = () => {
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
      .map((f) => {
        // Flag integrity/personnel findings as "New" when viewed under Payroll
        const key = f.category.toLowerCase().trim().replace(/[_\s&.,'-]+/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, "")
        const isIntegrity = key === "integrity" || key.includes("integrity") || key.includes("personnel") || key.includes("revolving") || key.includes("conflict")
        
        if (isIntegrity && activeCategory === "payroll") {
          return { ...f, is_new: true }
        }
        return f
      })
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
  const isAnalysisView = !isDetectorsView && !isReviewView && !isAccuracyView

  return (
    <WasteShell
      title={
        isDetectorsView
          ? "Detectors & Data"
          : isReviewView
            ? "Queue Overview"
            : isAccuracyView
              ? "Detector Accuracy"
              : "Waste Detection"
      }
      description={
        isDetectorsView
          ? "All anomaly-detection algorithms and public datasets used by the platform"
          : isReviewView
            ? "Disposition workflow for auditor triage and assignment."
            : isAccuracyView
              ? "Precision tracking from auditor feedback."
              : "Anomaly detection across payroll, contracts, and city services"
      }
      activeCategory={activeCategory}
      onCategoryChange={handleCategoryChange}
      actions={
        isAnalysisView ? (
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
            <Button
              variant={isManualRefreshing ? "default" : "outline"}
              size="sm"
              onClick={handleRefresh}
              disabled={isManualRefreshing}
              className={isManualRefreshing ? "bg-blue-600 text-white border-blue-600 cursor-wait" : ""}
            >
              <RefreshCw className={`w-4 h-4 mr-2 ${isManualRefreshing ? "animate-spin" : ""}`} />
              {isManualRefreshing
                ? `Analyzing…`
                : "Refresh"}
            </Button>
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
          {/* Welcome empty state — only when no data at all */}
          {!isManualRefreshing && !displayData && !error && (
            <div className="mb-6 p-6 bg-indigo-50 border border-indigo-200 rounded-lg text-center">
              <p className="text-base font-semibold text-indigo-900">
                Welcome to Waste Detection
              </p>
              <p className="text-sm text-indigo-700 mt-1">
                Run your first analysis to detect anomalies across payroll, contracts, and city services.
              </p>
              <Button
                variant="outline"
                size="default"
                onClick={handleRefresh}
                className="mt-4 border-indigo-300 text-indigo-800 hover:bg-indigo-100"
              >
                <RefreshCw className="w-4 h-4 mr-2" />
                Run Analysis
              </Button>
            </div>
          )}

          {/* Compact status line: cached analysis notice or refresh status */}
          {!isManualRefreshing && displayData && !data && displayData.analysis_timestamp && (
            <p className="text-xs text-gray-500 mb-3 flex items-center gap-2 flex-wrap" data-testid="compact-status-line">
              <Clock className="w-3.5 h-3.5 text-gray-400 shrink-0" />
              <span>
                Analysis from{" "}
                {new Date(displayData.analysis_timestamp).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                {" "}({formatAge(displayData.analysis_timestamp)})
                {displayData.summary?.total_findings
                  ? ` · ${displayData.summary.total_findings} findings`
                  : ""}
                {displayData.cached ? " · cached" : ""}
              </span>
              <button
                type="button"
                onClick={handleRefresh}
                className="text-purple-600 hover:text-purple-700 underline text-xs font-medium"
              >
                Refresh
              </button>
            </p>
          )}

          {isManualRefreshing && (
            <p className="text-xs text-blue-700 mb-3 flex items-center gap-2">
              <RefreshCw className="w-3.5 h-3.5 animate-spin shrink-0" />
              <span>{analysisProgress.step}</span>
              <span className="tabular-nums text-blue-500">
                {analysisElapsedSeconds}s
              </span>
              {analysisProgress.isLongRunning && (
                <span className="text-amber-600">— taking longer than usual</span>
              )}
            </p>
          )}

          {/* Zoom 1: Global Stats */}
          <WasteStatBar summary={displayData?.summary} isLoading={showLoadingState} />

          {/* Error banner — below stat bar */}
          {error && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-red-800">Analysis Error</p>
                <p className="text-sm text-red-600 mt-1">
                  {error instanceof Error ? error.message : "Failed to load waste analysis"}
                </p>
              </div>
            </div>
          )}

          {/* Timeout banner */}
          {!isManualRefreshing && activeJob?.status === "failed" && (
            <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg flex items-center justify-between gap-3 text-sm">
              <span className="text-amber-800">
                {activeJob.error_message || "Analysis failed. Showing previous snapshot."}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={handleRefresh}
                className="shrink-0 border-amber-300 text-amber-800 hover:bg-amber-100"
              >
                Retry
              </Button>
            </div>
          )}

          {/* Partial errors from analysis */}
          {displayData?.errors && displayData.errors.length > 0 && (
            <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg">
              <p className="text-sm font-medium text-amber-800 mb-1">
                Some detectors encountered issues:
              </p>
              {displayData.errors.map((err, i) => (
                <p key={i} className="text-xs text-amber-600">{err}</p>
              ))}
            </div>
          )}

          {/* Data freshness / staleness banner */}
          {displayData?.data_freshness && displayData.data_freshness.length > 0 && (
            <DataFreshnessBanner freshness={displayData.data_freshness} />
          )}

          {/* Dashboard Widgets (shown on all analysis categories, deferred during refresh) */}
          {isAnalysisView ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
              {isManualRefreshing ? (
                <>
                  {[1, 2, 3, 4].map((i) => (
                    <div key={i} className="bg-white rounded-lg border border-gray-200 p-5">
                      <div className="h-4 w-40 bg-gray-100 rounded animate-pulse mb-4" />
                      <div className="h-44 bg-gray-50 rounded animate-pulse" />
                    </div>
                  ))}
                </>
              ) : (
                <>
                  <SeverityDonut cityId={selectedCityId} />
                  <QueueStatus cityId={selectedCityId} />
                  <AccuracyBars cityId={selectedCityId} />
                  <InvestigationSummary cityId={selectedCityId} />
                </>
              )}
            </div>
          ) : null}

          {/* Zoom 2: Category Tabs */}
          <WasteCategoryTabs
            activeCategory={activeCategory}
            onCategoryChange={handleCategoryChange}
            categorySummaries={displayData?.summary?.categories ?? []}
          />

          {/* Filter row */}
          <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
            <WasteSeverityFilter
              findings={categoryFindings}
              activeFilter={severityFilter}
              onFilterChange={setSeverityFilter}
            />
            <WasteExport category={activeCategory} />
          </div>

          {/* Cluster map for infrastructure tab */}
          {activeCategory === "infrastructure" && infraFindings.length > 0 && (
            <WasteClusterMap findings={infraFindings} />
          )}

          {/* Zoom 3 & 4: Findings List */}
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
            />
          )}

          {/* Footer */}
          <div className="mt-8 pt-4 border-t border-gray-200">
            <p className="text-xs text-gray-500 text-center mb-1">
              Seymour tokens used today in Waste: {todaySeymourTokens.toLocaleString()}
            </p>
            <p className="text-xs text-gray-400 text-center">
              Data: DataSF Open Data Portal &middot; Anomalies &ne; confirmed fraud &middot; Sorted by confidence &amp; priority
            </p>
            {displayData?.analysis_timestamp && (
              <p className="text-xs text-gray-400 text-center mt-1">
                Last analyzed: {new Date(displayData.analysis_timestamp).toLocaleString()}
                {displayData.cached && " (cached)"}
              </p>
            )}
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

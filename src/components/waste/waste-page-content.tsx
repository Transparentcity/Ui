"use client"

import { useEffect, useState, useMemo } from "react"
import { useWasteAnalysis } from "@/lib/hooks/useWaste"
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

type SeverityFilter = "all" | "critical" | "high" | "medium"
type WasteCategoryKey = "payroll" | "vendor" | "infrastructure"

const WASTE_ANALYSIS_ESTIMATED_SECONDS = 45
const WASTE_REFRESH_TIMEOUT_MS = 120_000
const WASTE_ANALYSIS_CACHE_KEY = "waste:last-analysis:v1"

function normalizeWasteCategory(category: string): WasteCategoryKey {
  const key = category.toLowerCase().trim().replace(/[_\s-]+/g, "_")
  if (key === "payroll" || key === "payroll_compensation") return "payroll"
  if (key === "vendor" || key === "vendors" || key === "vendor_procurement") {
    return "vendor"
  }
  if (
    key === "infrastructure" ||
    key === "services" ||
    key === "service" ||
    key === "infrastructure_services"
  ) {
    return "infrastructure"
  }
  return "payroll"
}

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

function getWasteAnalysisProgress(elapsedSeconds: number): {
  step: string
  etaLabel: string
  progressPct: number
  isLongRunning: boolean
} {
  let step = "Fetching latest records from city datasets"
  if (elapsedSeconds > 8) {
    step = "Detecting anomalous patterns across payroll, vendor, and infrastructure"
  }
  if (elapsedSeconds > 20) {
    step = "Scoring findings for confidence and priority"
  }
  if (elapsedSeconds > 35) {
    step = "Finalizing results and preparing report output"
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
  const [allowAutoFetch, setAllowAutoFetch] = useState(false)
  const [isManualRefreshing, setIsManualRefreshing] = useState(false)
  const [refreshTimedOut, setRefreshTimedOut] = useState(false)
  const [seymourRequest, setSeymourRequest] = useState<WasteSeymourRequest | null>(null)
  const [cachedData, setCachedData] = useState<WasteAnalyzeResponse | null>(() => {
    if (typeof window === "undefined") return null
    try {
      const raw = window.localStorage.getItem(WASTE_ANALYSIS_CACHE_KEY)
      if (!raw) return null
      return JSON.parse(raw) as WasteAnalyzeResponse
    } catch {
      return null
    }
  })
  const [analysisStartedAt, setAnalysisStartedAt] = useState<number | null>(null)
  const [analysisElapsedSeconds, setAnalysisElapsedSeconds] = useState(0)
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

  const { data, isLoading, error, forceRefetch } = useWasteAnalysis(
    undefined,
    allowAutoFetch
  )
  const displayData = data ?? cachedData
  const showLoadingState = isManualRefreshing && !displayData

  useEffect(() => {
    if (!data) return
    setCachedData(data)
    if (typeof window !== "undefined") {
      window.localStorage.setItem(WASTE_ANALYSIS_CACHE_KEY, JSON.stringify(data))
    }
  }, [data])

  useEffect(() => {
    if (isManualRefreshing) {
      setAnalysisStartedAt((prev) => prev ?? Date.now())
      return
    }
    setAnalysisStartedAt(null)
    setAnalysisElapsedSeconds(0)
  }, [isManualRefreshing])

  useEffect(() => {
    if (!isManualRefreshing || analysisStartedAt == null) return
    setAnalysisElapsedSeconds(
      Math.max(0, Math.floor((Date.now() - analysisStartedAt) / 1000))
    )
    const interval = window.setInterval(() => {
      setAnalysisElapsedSeconds(
        Math.max(0, Math.floor((Date.now() - analysisStartedAt) / 1000))
      )
    }, 1000)
    return () => window.clearInterval(interval)
  }, [isManualRefreshing, analysisStartedAt])

  useEffect(() => {
    if (!isManualRefreshing) return
    const timeout = window.setTimeout(() => {
      setIsManualRefreshing(false)
      setRefreshTimedOut(true)
    }, WASTE_REFRESH_TIMEOUT_MS)
    return () => window.clearTimeout(timeout)
  }, [isManualRefreshing])

  useEffect(() => {
    if (isManualRefreshing && !isLoading) {
      setIsManualRefreshing(false)
    }
  }, [isManualRefreshing, isLoading])

  const analysisProgress = getWasteAnalysisProgress(analysisElapsedSeconds)

  const handleRefresh = () => {
    setAllowAutoFetch(true)
    setRefreshTimedOut(false)
    setIsManualRefreshing(true)
    forceRefetch()
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
    return displayData.findings.filter(
      (f) => normalizeWasteCategory(f.category) === activeCategory
    )
  }, [displayData, activeCategory])

  // Filter by severity
  const filteredFindings = useMemo(() => {
    if (severityFilter === "all") return categoryFindings
    return categoryFindings.filter((f) => f.severity === severityFilter)
  }, [categoryFindings, severityFilter])

  // Get infrastructure findings for cluster map
  const infraFindings = useMemo(() => {
    if (!displayData?.findings) return []
    return displayData.findings.filter(
      (f) =>
        f.category === "infrastructure" &&
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

  return (
    <WasteShell
      title="Waste Detection"
      description="Anomaly detection across payroll, vendor payments, and city services"
      activeCategory={activeCategory}
      onCategoryChange={handleCategoryChange}
      actions={
        <Button
          variant="outline"
          size="sm"
          onClick={handleRefresh}
          disabled={isManualRefreshing}
        >
          <RefreshCw className={`w-4 h-4 mr-2 ${isManualRefreshing ? "animate-spin" : ""}`} />
          {isManualRefreshing
            ? `Analyzing (${analysisProgress.progressPct}% · ${analysisElapsedSeconds}s)`
            : "Refresh"}
        </Button>
      }
    >
      {isManualRefreshing && (
        <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <p className="text-sm font-medium text-blue-900">{analysisProgress.step}</p>
          <div className="mt-2 h-2 w-full rounded-full bg-blue-100 overflow-hidden">
            <div
              className="h-full rounded-full bg-blue-500 transition-all duration-500 ease-out"
              style={{ width: `${analysisProgress.progressPct}%` }}
            />
          </div>
          <p className="text-xs text-blue-700 mt-1">
            {analysisProgress.etaLabel} · Typical analysis run: 20-45s
          </p>
          {analysisProgress.isLongRunning ? (
            <p className="text-xs text-blue-700 mt-1">
              If this exceeds 90s, use Refresh again to re-request analysis.
            </p>
          ) : null}
        </div>
      )}

      {!isManualRefreshing && refreshTimedOut ? (
        <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-lg flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-amber-800">
              Refresh took too long and was stopped.
            </p>
            <p className="text-xs text-amber-700 mt-1">
              Showing last saved snapshot. Try again when backend load is lower.
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            className="shrink-0 border-amber-300 text-amber-800 hover:bg-amber-100"
          >
            <RefreshCw className="w-4 h-4 mr-2" />
            Try Again
          </Button>
        </div>
      ) : null}

      {!isManualRefreshing && displayData && !data && (
        <div className="mb-6 p-5 bg-blue-50 border border-blue-200 rounded-lg flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-blue-900">
              Showing your previous analysis
              {displayData.analysis_timestamp && (
                <span className="font-normal text-blue-700">
                  {" "}from {new Date(displayData.analysis_timestamp).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })}
                  {" "}({formatAge(displayData.analysis_timestamp)})
                </span>
              )}
            </p>
            <p className="text-xs text-blue-600 mt-1">
              {displayData.summary?.total_findings
                ? `${displayData.summary.total_findings} findings across ${displayData.summary.categories?.length ?? 0} categories`
                : "Run a fresh analysis to check for the latest anomalies"}
              {displayData.cached ? " \u00b7 served from server cache" : ""}
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            className="shrink-0 border-blue-300 text-blue-800 hover:bg-blue-100"
          >
            <RefreshCw className="w-4 h-4 mr-2" />
            Run Fresh Analysis
          </Button>
        </div>
      )}

      {!isManualRefreshing && !displayData && !error && (
        <div className="mb-6 p-6 bg-indigo-50 border border-indigo-200 rounded-lg text-center">
          <p className="text-base font-semibold text-indigo-900">
            Welcome to Waste Detection
          </p>
          <p className="text-sm text-indigo-700 mt-1">
            Run your first analysis to detect anomalies across payroll, vendor payments, and city services.
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

      {/* Error banner */}
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

      {/* Partial errors from analysis */}
      {displayData?.errors && displayData.errors.length > 0 && (
        <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-lg">
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

      {/* Zoom 1: Global Stats */}
      <WasteStatBar summary={displayData?.summary} isLoading={showLoadingState} />

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
    </WasteShell>
  )
}

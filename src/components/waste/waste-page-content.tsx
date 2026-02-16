"use client"

import { useState, useMemo } from "react"
import { useWasteAnalysis } from "@/lib/hooks/useWaste"
import { WasteShell } from "./waste-shell"
import { Button } from "@/components/ui/button"
import { RefreshCw, AlertTriangle, Clock, Database } from "lucide-react"
import type { WasteFinding, WasteDataFreshness } from "@/lib/apiClient"

import { WasteStatBar } from "./waste-stat-bar"
import { WasteCategoryTabs } from "./waste-category-tabs"
import { WasteSeverityFilter } from "./waste-severity-filter"
import { WasteFindingsList } from "./waste-findings-list"
import { WasteExport } from "./waste-export"
import { WasteClusterMap } from "./waste-cluster-map"

type SeverityFilter = "all" | "critical" | "high" | "medium"

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
  const [activeCategory, setActiveCategory] = useState("payroll")
  const [severityFilter, setSeverityFilter] = useState<SeverityFilter>("all")
  const [forceRefresh, setForceRefresh] = useState(false)

  const { data, isLoading, error, refetch } = useWasteAnalysis(
    undefined,
    forceRefresh
  )

  const handleRefresh = () => {
    setForceRefresh(true)
    refetch().finally(() => setForceRefresh(false))
  }

  // Findings come pre-sorted by priority_score from the backend
  const categoryFindings = useMemo(() => {
    if (!data?.findings) return []
    return data.findings.filter((f) => f.category === activeCategory)
  }, [data?.findings, activeCategory])

  // Filter by severity
  const filteredFindings = useMemo(() => {
    if (severityFilter === "all") return categoryFindings
    return categoryFindings.filter((f) => f.severity === severityFilter)
  }, [categoryFindings, severityFilter])

  // Get infrastructure findings for cluster map
  const infraFindings = useMemo(() => {
    if (!data?.findings) return []
    return data.findings.filter(
      (f) => f.category === "infrastructure" && f.subcategory === "Infrastructure Cluster"
    )
  }, [data?.findings])

  // Reset severity filter when category changes
  const handleCategoryChange = (cat: string) => {
    setActiveCategory(cat)
    setSeverityFilter("all")
  }

  return (
    <WasteShell
      title="Waste Detection"
      description="Anomaly detection across payroll, vendor payments, and city services"
      actions={
        <Button
          variant="outline"
          size="sm"
          onClick={handleRefresh}
          disabled={isLoading}
        >
          <RefreshCw className={`w-4 h-4 mr-2 ${isLoading ? "animate-spin" : ""}`} />
          {isLoading ? "Analyzing..." : "Refresh"}
        </Button>
      }
    >
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
      {data?.errors && data.errors.length > 0 && (
        <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-lg">
          <p className="text-sm font-medium text-amber-800 mb-1">
            Some detectors encountered issues:
          </p>
          {data.errors.map((err, i) => (
            <p key={i} className="text-xs text-amber-600">{err}</p>
          ))}
        </div>
      )}

      {/* Data freshness / staleness banner */}
      {data?.data_freshness && data.data_freshness.length > 0 && (
        <DataFreshnessBanner freshness={data.data_freshness} />
      )}

      {/* Zoom 1: Global Stats */}
      <WasteStatBar summary={data?.summary} isLoading={isLoading} />

      {/* Zoom 2: Category Tabs */}
      <WasteCategoryTabs
        activeCategory={activeCategory}
        onCategoryChange={handleCategoryChange}
        categorySummaries={data?.summary?.categories ?? []}
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
      {isLoading ? (
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-14 bg-gray-100 rounded-lg animate-pulse" />
          ))}
        </div>
      ) : (
        <WasteFindingsList findings={filteredFindings} />
      )}

      {/* Footer */}
      <div className="mt-8 pt-4 border-t border-gray-200">
        <p className="text-xs text-gray-400 text-center">
          Data: DataSF Open Data Portal &middot; Anomalies &ne; confirmed fraud &middot; Sorted by confidence &amp; priority
        </p>
        {data?.analysis_timestamp && (
          <p className="text-xs text-gray-400 text-center mt-1">
            Last analyzed: {new Date(data.analysis_timestamp).toLocaleString()}
            {data.cached && " (cached)"}
          </p>
        )}
      </div>
    </WasteShell>
  )
}

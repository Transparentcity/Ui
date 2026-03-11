"use client"

import { useState, useMemo } from "react"
import { useLatestPersistedWasteResult } from "@/lib/hooks/useWaste"
import type { WasteFinding } from "@/lib/apiClient"
import { WasteShell } from "./waste-shell"
import { ForensicsShell } from "./forensics-shell"
import { WasteFindingsList } from "./waste-findings-list"
import { WasteSeverityFilter } from "./waste-severity-filter"
import { WasteExport } from "./waste-export"
import { WasteClusterMap } from "./waste-cluster-map"
import {
  WasteSeymourPanel,
  type WasteSeymourRequest,
} from "./waste-seymour-panel"
import { useWasteCity } from "./WasteCityContext"
import { normalizeWasteCategory, formatDollar } from "./waste-utils"

type SeverityFilter = "all" | "critical" | "high" | "medium"

const CATEGORY_LABELS: Record<string, string> = {
  payroll: "Payroll & Personnel",
  contracts: "Contracts & Procurement",
  infrastructure: "Infrastructure & Services",
  influence: "Influence & Pay-to-Play",
  integrity: "Personnel Integrity",
  confirmed: "Confirmed Cases",
  convergence: "Cross-Domain Convergence",
}

interface ForensicsCategoryDetailPageProps {
  category: string
}

export function ForensicsCategoryDetailPage({
  category,
}: ForensicsCategoryDetailPageProps) {
  const { selectedCityId: cityId } = useWasteCity()
  const normalizedCat = normalizeWasteCategory(category)
  const [severityFilter, setSeverityFilter] = useState<SeverityFilter>("all")
  const [seymourRequest, setSeymourRequest] = useState<WasteSeymourRequest | null>(null)

  const handleAskSeymour = (finding: WasteFinding) => {
    setSeymourRequest({ finding })
  }

  const { data: analysisData, isLoading } =
    useLatestPersistedWasteResult(cityId)

  const categoryFindings = useMemo(() => {
    if (!analysisData?.findings) return []
    return analysisData.findings.filter(
      (f) => normalizeWasteCategory(f.category) === normalizedCat
    )
  }, [analysisData, normalizedCat])

  const filteredFindings = useMemo(() => {
    if (severityFilter === "all") return categoryFindings
    return categoryFindings.filter(
      (f) => f.severity?.toLowerCase() === severityFilter
    )
  }, [categoryFindings, severityFilter])

  const infraFindings = useMemo(() => {
    if (normalizedCat !== "infrastructure") return []
    return categoryFindings.filter(
      (f) =>
        f.subcategory === "Infrastructure Cluster" ||
        f.subcategory === "Pavement/Sidewalk Failure Hotspot"
    )
  }, [categoryFindings, normalizedCat])

  const label = CATEGORY_LABELS[normalizedCat] ?? normalizedCat

  return (
    <WasteShell
      title="Forensics"
      description="Historical analysis and investigation workspace"
    >
      <ForensicsShell title={label}>
        {/* Summary stats */}
        {categoryFindings.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
            <div className="bg-white rounded-lg border border-gray-200 p-3">
              <p className="text-xs text-gray-500">Findings</p>
              <p className="text-2xl font-bold">
                {categoryFindings.length}
              </p>
            </div>
            <div className="bg-white rounded-lg border border-gray-200 p-3">
              <p className="text-xs text-gray-500">Critical</p>
              <p className="text-2xl font-bold text-red-600">
                {
                  categoryFindings.filter(
                    (f) => f.severity?.toLowerCase() === "critical"
                  ).length
                }
              </p>
            </div>
            <div className="bg-white rounded-lg border border-gray-200 p-3">
              <p className="text-xs text-gray-500">High</p>
              <p className="text-2xl font-bold text-amber-600">
                {
                  categoryFindings.filter(
                    (f) => f.severity?.toLowerCase() === "high"
                  ).length
                }
              </p>
            </div>
            <div className="bg-white rounded-lg border border-gray-200 p-3">
              <p className="text-xs text-gray-500">Exposure</p>
              <p className="text-2xl font-bold">
                {formatDollar(
                  categoryFindings.reduce(
                    (sum, f) => sum + (f.amount ?? 0),
                    0
                  ) || null
                )}
              </p>
            </div>
          </div>
        )}

        {/* Filter row */}
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <WasteSeverityFilter
            findings={categoryFindings}
            activeFilter={severityFilter}
            onFilterChange={setSeverityFilter}
          />
          <WasteExport category={normalizedCat} cityId={cityId} />
        </div>

        {/* Cluster map for infrastructure */}
        {normalizedCat === "infrastructure" && infraFindings.length > 0 && (
          <WasteClusterMap findings={infraFindings} cityId={cityId} />
        )}

        {/* Findings List */}
        {isLoading ? (
          <div className="space-y-3">
            {[...Array(5)].map((_, i) => (
              <div
                key={i}
                className="h-14 bg-gray-100 rounded-lg animate-pulse"
              />
            ))}
          </div>
        ) : (
          <WasteFindingsList findings={filteredFindings} onAskSeymour={handleAskSeymour} cityId={cityId} />
        )}

        <WasteSeymourPanel
          request={seymourRequest}
          onClose={() => setSeymourRequest(null)}
        />
      </ForensicsShell>
    </WasteShell>
  )
}

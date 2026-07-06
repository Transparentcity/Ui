"use client"

import { useCallback, useState, useMemo } from "react"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import {
  useCreateWasteDisposition,
  useLatestPersistedWasteResult,
  useWasteDetectorAccuracy,
} from "@/lib/hooks/useWaste"
import type { WasteDispositionType, WasteFinding } from "@/lib/apiClient"
import {
  canonicalNarratorKey,
  localKeyFromBackendKey,
} from "./waste-finding-narrator"
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

  // Triage: flag/dismiss verdicts feed detector precision (the learning
  // loop). Cards without a numeric db_id (older backend payloads) simply
  // don't render the triage buttons.
  const disposeMutation = useCreateWasteDisposition()
  const handleDispose = useCallback(
    (finding: WasteFinding, disposition: WasteDispositionType) => {
      if (finding.db_id == null || !cityId) return
      disposeMutation.mutate({
        findingId: finding.db_id,
        data: { city_id: cityId, disposition },
      })
    },
    [disposeMutation, cityId],
  )

  // Per-detector auditor-validated precision, keyed by the shared local
  // detector key so accuracy rows (backend detector_key) match findings
  // (display tool label).
  const { data: accuracyData } = useWasteDetectorAccuracy(cityId)
  const precisionFor = useCallback(
    (finding: WasteFinding) => {
      if (!accuracyData?.length) return null
      const findingKey = canonicalNarratorKey(finding.tool)
      if (!findingKey) return null
      const row = accuracyData.find(
        (a) => localKeyFromBackendKey(a.detector_key) === findingKey,
      )
      if (!row || row.total_findings <= 0) return null
      return { rate: row.precision_rate, total: row.total_findings }
    },
    [accuracyData],
  )

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
      title="Findings"
      description="Browse and investigate detected anomalies"
    >
      <ForensicsShell title={label}>
        <Link
          href="/waste"
          className="inline-flex items-center gap-1 text-xs text-gray-500 no-underline hover:text-purple-600 mb-3"
        >
          <ArrowLeft className="w-3 h-3" />
          All categories
        </Link>

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
          <>
            {disposeMutation.isError && (
              <p className="mb-2 text-xs text-red-600" role="alert">
                Couldn&apos;t save that verdict:{" "}
                {disposeMutation.error instanceof Error
                  ? disposeMutation.error.message
                  : "Unknown error"}
              </p>
            )}
            <WasteFindingsList
              findings={filteredFindings}
              onAskSeymour={handleAskSeymour}
              onDispose={handleDispose}
              cityId={cityId}
              precisionFor={precisionFor}
            />
          </>
        )}

        <WasteSeymourPanel
          request={seymourRequest}
          onClose={() => setSeymourRequest(null)}
        />
      </ForensicsShell>
    </WasteShell>
  )
}

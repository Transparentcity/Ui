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
import {
  WasteFindingsList,
  type FindingSortMode,
} from "./waste-findings-list"
import { WasteKeyMetricsStrip } from "./waste-key-metrics-strip"
import { WasteSeverityFilter } from "./waste-severity-filter"
import { WasteExport } from "./waste-export"
import { WasteClusterMap } from "./waste-cluster-map"
import {
  WasteSeymourPanel,
  type WasteSeymourRequest,
} from "./waste-seymour-panel"
import { useWasteCity } from "./WasteCityContext"
import {
  normalizeWasteCategory,
  formatDollar,
  aggregateAmount,
} from "./waste-utils"

type SeverityFilter = "all" | "critical" | "high" | "medium"

const CATEGORY_LABELS: Record<string, string> = {
  payroll: "Payroll & Personnel",
  contracts: "Contracts & Procurement",
  infrastructure: "Infrastructure & Services",
  influence: "Influence & Pay-to-Play",
  integrity: "Personnel Integrity",
  confirmed: "Confirmed Cases",
  convergence: "Cross-Domain Convergence",
  uncategorized: "Uncategorized",
}

function SummaryCell({
  label,
  value,
  color,
  divider,
  wide,
}: {
  label: string
  value: string
  color: string
  divider?: boolean
  wide?: boolean
}) {
  return (
    <div
      className={`p-4 ${wide ? "flex-[2]" : "flex-1"} ${
        divider ? "border-l" : ""
      }`}
      style={divider ? { borderColor: "var(--bg-tertiary)" } : undefined}
    >
      <p
        className="text-[11px] font-bold uppercase"
        style={{ color: "#9ca3af", letterSpacing: "0.04em" }}
      >
        {label}
      </p>
      <p
        className="text-[24px] font-bold tabular-nums mt-1"
        style={{ fontFamily: "var(--font-data)", color }}
      >
        {value}
      </p>
    </div>
  )
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
  // Evidence (expected value: precision × impact) is the default lens — it
  // puts the likeliest-real, biggest-dollar findings first instead of raw
  // severity labels.
  const [sortMode, setSortMode] = useState<FindingSortMode>("evidence")
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
    async (
      finding: WasteFinding,
      disposition: WasteDispositionType,
      note?: string,
    ) => {
      // Reject (rather than silently return) so the card can roll back its
      // optimistic "triaged" state and restore the buttons on failure.
      if (finding.db_id == null || !cityId) {
        throw new Error("Cannot record disposition: missing finding id or city")
      }
      await disposeMutation.mutateAsync({
        findingId: finding.db_id,
        data: {
          city_id: cityId,
          disposition,
          // Structured dismiss reason: preserves WHY (legitimate explanation
          // vs. threshold vs. entity mismatch) beyond the coarse enum.
          ...(note ? { notes: note } : {}),
        },
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

        {/* Key metrics: the underlying citywide numbers this category's
            findings live inside (e.g. overtime share above overtime findings) */}
        <WasteKeyMetricsStrip category={normalizedCat} />

        {/* Summary stats: one card divided into aligned cells. */}
        {categoryFindings.length > 0 && (
          <div className="mb-4 flex bg-white rounded-xl border border-gray-200 overflow-hidden">
            <SummaryCell
              label="Findings"
              value={String(categoryFindings.length)}
              color="var(--text-primary)"
            />
            <SummaryCell
              label="Critical"
              value={String(
                categoryFindings.filter(
                  (f) => f.severity?.toLowerCase() === "critical",
                ).length,
              )}
              color="#dc2626"
              divider
            />
            <SummaryCell
              label="High"
              value={String(
                categoryFindings.filter(
                  (f) => f.severity?.toLowerCase() === "high",
                ).length,
              )}
              color="#b45309"
              divider
            />
            <SummaryCell
              label="Exposure"
              value={formatDollar(aggregateAmount(categoryFindings) || null)}
              color="var(--text-primary)"
              divider
              wide
            />
          </div>
        )}

        {/* Filter row */}
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <WasteSeverityFilter
            findings={categoryFindings}
            activeFilter={severityFilter}
            onFilterChange={setSeverityFilter}
          />
          <div className="flex items-center gap-2">
            <div
              className="flex items-center rounded-md border border-gray-200 bg-white p-0.5"
              role="group"
              aria-label="Sort findings"
              data-testid="finding-sort-toggle"
            >
              {(
                [
                  ["evidence", "Evidence"],
                  ["severity", "Severity"],
                  ["amount", "Amount"],
                ] as [FindingSortMode, string][]
              ).map(([mode, modeLabel]) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setSortMode(mode)}
                  aria-pressed={sortMode === mode}
                  title={
                    mode === "evidence"
                      ? "Expected value: detector precision × dollar impact, corroboration-boosted; dismissed findings sink"
                      : mode === "severity"
                        ? "Grouped by subcategory, worst severity first"
                        : "Flat list, largest dollar amount first"
                  }
                  className={`px-2.5 py-1 rounded text-[11px] font-medium transition-colors ${
                    sortMode === mode
                      ? "bg-purple-50 text-purple-700"
                      : "text-gray-500 hover:text-gray-700"
                  }`}
                >
                  {modeLabel}
                </button>
              ))}
            </div>
            <WasteExport category={normalizedCat} cityId={cityId} />
          </div>
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
              onDispose={cityId ? handleDispose : undefined}
              cityId={cityId}
              precisionFor={precisionFor}
              sortMode={sortMode}
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

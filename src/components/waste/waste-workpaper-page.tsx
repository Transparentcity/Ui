"use client"

import { useMemo } from "react"
import Link from "next/link"
import { ArrowLeft, Download } from "lucide-react"
import { WasteShell } from "./waste-shell"
import { ForensicsShell } from "./forensics-shell"
import { useWasteCity } from "./WasteCityContext"
import { useWasteAdminReport } from "@/lib/hooks/useWasteAdmin"
import { adaptFinding, adaptReportDetail } from "@/lib/admin/waste/adapters"
import { reportToCsv, triggerDownload } from "@/lib/waste/report-csv"
import { WasteReportStatusChip } from "./waste-report-status-chip"
import { cn } from "@/lib/utils"

const SEVERITY_STYLES: Record<string, string> = {
  high: "bg-red-50 text-red-700 border-red-200",
  med: "bg-amber-50 text-amber-700 border-amber-200",
  low: "bg-gray-50 text-gray-600 border-gray-200",
}

/** Workpaper detail: methodology, standards basis, caveats, and findings
 *  ranked by exposure, with CSV/JSON export. */
export function WasteWorkpaperPage({ slug }: { slug: string }) {
  const {
    selectedCitySlug: citySlug,
    isLoading: citiesLoading,
    cityLoadError,
  } = useWasteCity()

  const { data, isLoading, error } = useWasteAdminReport(slug, citySlug)
  const notFound = (error as { status?: number } | null)?.status === 404
  // With citySlug null the report query is disabled (data undefined, error
  // null forever), so city-resolution problems need their own error path
  // instead of an infinite skeleton.
  const cityUnresolved = !citiesLoading && citySlug == null

  const report = useMemo(() => (data ? adaptReportDetail(data) : null), [data])
  const findings = useMemo(
    () =>
      data
        ? [...(data.findings ?? [])]
            .sort((a, b) => {
              const av = a.estimated_dollar_impact ?? a.amount ?? 0
              const bv = b.estimated_dollar_impact ?? b.amount ?? 0
              return bv - av
            })
            .map(adaptFinding)
        : [],
    [data],
  )

  return (
    <WasteShell
      title="Reports"
      description="Build custom exports and browse audit workpapers"
    >
      <ForensicsShell>
        <Link
          href="/waste/reports"
          className="inline-flex items-center gap-1 text-xs text-gray-500 no-underline hover:text-purple-600 mb-3"
        >
          <ArrowLeft className="w-3 h-3" />
          All workpapers
        </Link>

        {cityUnresolved ? (
          <p className="text-sm text-red-600" role="alert">
            {cityLoadError
              ? `Couldn't load the city list: ${cityLoadError.message}`
              : "The selected city isn't available in the waste module, so this workpaper can't be loaded."}
          </p>
        ) : error ? (
          <p className="text-sm text-red-600" role="alert">
            {notFound
              ? `No workpaper named "${slug}" for this city. It may have been removed, or the link is out of date.`
              : `Couldn't load workpaper: ${error instanceof Error ? error.message : "Unknown error"}`}
          </p>
        ) : isLoading || !data || !report ? (
          <div className="space-y-3">
            <div className="h-24 bg-gray-100 rounded-lg animate-pulse" />
            <div className="h-40 bg-gray-100 rounded-lg animate-pulse" />
          </div>
        ) : (
          <>
            {/* Header card */}
            <div className="bg-white rounded-lg border border-gray-200 p-5 mb-5">
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <WasteReportStatusChip status={report.status} />
                    <span className="text-[11px] font-mono text-gray-400">
                      {report.slug}
                    </span>
                  </div>
                  <h2 className="mt-1.5 text-lg font-semibold text-gray-900">
                    {report.title}
                  </h2>
                  <p className="text-xs text-gray-500">
                    Period: {report.period} · Updated {report.updated}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() =>
                      triggerDownload(
                        `${report.slug}.csv`,
                        "text/csv;charset=utf-8",
                        reportToCsv(data),
                      )
                    }
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-white text-gray-700 border border-gray-300 hover:border-gray-400"
                  >
                    <Download className="w-3.5 h-3.5" /> CSV
                  </button>
                  <button
                    onClick={() =>
                      triggerDownload(
                        `${report.slug}.json`,
                        "application/json",
                        JSON.stringify(data, null, 2),
                      )
                    }
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-white text-gray-700 border border-gray-300 hover:border-gray-400"
                  >
                    <Download className="w-3.5 h-3.5" /> JSON
                  </button>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-3">
                {[
                  { label: "Findings", value: report.findings },
                  { label: "Exposure", value: report.exposure },
                  { label: "Materiality", value: report.materiality },
                  { label: "Detectors", value: report.detectors.length },
                ].map((k) => (
                  <div
                    key={k.label}
                    className="rounded-lg border border-gray-200 bg-gray-50 p-3"
                  >
                    <p className="text-xs text-gray-500">{k.label}</p>
                    <p className="mt-0.5 text-xl font-semibold text-gray-900 tabular-nums">
                      {k.value}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            {/* Methodology */}
            <div className="bg-white rounded-lg border border-gray-200 p-5 mb-5">
              <h3 className="text-sm font-semibold text-gray-700 mb-2">
                Methodology
              </h3>
              {report.standards ? (
                <div className="mb-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">
                    Standards basis
                  </p>
                  <p className="mt-0.5 text-sm text-gray-600">
                    {report.standards}
                  </p>
                </div>
              ) : null}
              <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">
                Calculation method
              </p>
              <p className="mt-0.5 text-sm text-gray-600">
                {report.methodology || "—"}
              </p>
              {report.caveats ? (
                <div className="mt-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">
                    Caveats
                  </p>
                  <p className="mt-0.5 text-sm text-gray-600">{report.caveats}</p>
                </div>
              ) : null}
            </div>

            {/* Findings */}
            <div className="flex items-baseline justify-between mb-2">
              <h3 className="text-sm font-semibold text-gray-700">
                Findings · ranked by exposure
              </h3>
              <span className="text-[11px] text-gray-400 font-mono">
                {findings.length} of {report.findings} shown
              </span>
            </div>
            <div className="space-y-3">
              {findings.length === 0 ? (
                <p className="text-sm text-gray-500">
                  No findings under this workpaper yet.
                </p>
              ) : (
                findings.map((f) => (
                  <div
                    key={f.id}
                    className="bg-white rounded-lg border border-gray-200 p-4"
                  >
                    <div className="flex items-center gap-2 flex-wrap">
                      <span
                        className={cn(
                          "inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase border",
                          SEVERITY_STYLES[f.severity] ?? SEVERITY_STYLES.low,
                        )}
                      >
                        {f.severity}
                      </span>
                      <span className="text-[11px] font-mono text-gray-400">
                        {f.id}
                      </span>
                      <span className="inline-flex items-center rounded-md border border-purple-200 bg-purple-50 px-2 py-0.5 text-xs font-medium text-purple-700">
                        {f.detectorId}
                      </span>
                      <span className="flex-1" />
                      <span className="text-sm font-semibold text-gray-900 tabular-nums">
                        {f.amount}
                      </span>
                    </div>
                    <p className="mt-2 font-semibold text-sm text-gray-900">
                      {f.headline}
                    </p>
                    <p className="text-xs text-gray-500">
                      {f.subject} · {f.department}
                    </p>
                    {f.detail && (
                      <p className="mt-1 text-sm text-gray-600">{f.detail}</p>
                    )}
                  </div>
                ))
              )}
            </div>
          </>
        )}
      </ForensicsShell>
    </WasteShell>
  )
}

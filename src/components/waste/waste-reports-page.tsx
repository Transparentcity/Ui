"use client"

import Link from "next/link"
import { FileText, ArrowRight } from "lucide-react"
import { WasteShell } from "./waste-shell"
import { ForensicsShell } from "./forensics-shell"
import { WasteReportBuilder } from "./waste-report-builder"
import { useWasteCity } from "./WasteCityContext"
import { useWasteAdminReports } from "@/lib/hooks/useWasteAdmin"
import { adaptReportRow } from "@/lib/admin/waste/adapters"
import { WasteReportStatusChip } from "./waste-report-status-chip"

/**
 * Reports tab: the custom report builder plus per-detector-class
 * "workpapers" (period, findings, exposure, materiality, status) compiled
 * by the backend. Replaces the old Citywide Risk Overview + department
 * briefings, which duplicated the By-department tab.
 */
export function WasteReportsPage() {
  const {
    selectedCitySlug: citySlug,
    isLoading: citiesLoading,
    cityLoadError,
  } = useWasteCity()

  const { data, isLoading, error } = useWasteAdminReports(citySlug)
  const rows = (data ?? []).map(adaptReportRow)
  // While citySlug is unresolved the reports query is disabled, and disabled
  // queries report isLoading=false: without these flags the page would show
  // "No workpapers yet" during city-list load (or forever on failure).
  const waitingOnCity = citiesLoading
  const cityUnresolved = !citiesLoading && citySlug == null

  return (
    <WasteShell
      title="Reports"
      description="Build custom exports and browse audit workpapers"
    >
      <ForensicsShell>
        {/* Report builder: CSV/JSON/Excel downloads with filters */}
        <div className="mb-6">
          <WasteReportBuilder />
        </div>

        {/* Memorized reports: parameterized, re-runnable analyses (last run kept) */}
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-2">
            <FileText className="w-4 h-4 text-gray-500" />
            <h2 className="text-sm font-semibold text-gray-700">Memorized reports</h2>
          </div>
          <Link
            href="/waste/reports/pension-departures"
            className="block rounded-lg border border-gray-200 bg-white p-4 hover:border-purple-300 hover:bg-purple-50/40 transition-colors no-underline"
          >
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="font-medium text-gray-900">Pension-spiking departures</div>
                <p className="text-sm text-gray-600 mt-0.5">
                  Named employees who spiked pay and then left payroll, with projected future
                  pension cost. Pick a spike year or a cumulative range; the last run is kept per city.
                </p>
              </div>
              <span className="text-purple-600 text-sm font-medium shrink-0">Open →</span>
            </div>
          </Link>
        </div>

        {/* Workpapers */}
        <div className="bg-white rounded-lg border border-gray-200">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2">
            <FileText className="w-4 h-4 text-gray-500" />
            <h2 className="text-sm font-semibold text-gray-700">Workpapers</h2>
            <span className="text-xs text-gray-500">
              · per-detector-class reports, last 30 days
            </span>
          </div>

          {cityUnresolved ? (
            <p className="px-5 py-4 text-sm text-red-600" role="alert">
              {cityLoadError
                ? `Couldn't load the city list: ${cityLoadError.message}`
                : "The selected city isn't available in the waste module."}
            </p>
          ) : error ? (
            <p className="px-5 py-4 text-sm text-red-600" role="alert">
              Couldn&apos;t load workpapers:{" "}
              {error instanceof Error ? error.message : "Unknown error"}
            </p>
          ) : isLoading || waitingOnCity ? (
            <div className="p-5 space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-10 bg-gray-100 rounded animate-pulse" />
              ))}
            </div>
          ) : rows.length === 0 ? (
            <p className="px-5 py-4 text-sm text-gray-500">
              No workpapers yet for this city. They populate as findings
              accumulate from weekly refreshes.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-gray-500 border-b border-gray-100">
                    <th className="px-5 py-2 font-medium">Report</th>
                    <th className="px-3 py-2 font-medium">Period</th>
                    <th className="px-3 py-2 font-medium text-right">Findings</th>
                    <th className="px-3 py-2 font-medium text-right">Exposure</th>
                    <th className="px-3 py-2 font-medium">Updated</th>
                    <th className="px-3 py-2 font-medium">Status</th>
                    <th className="px-3 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr
                      key={r.slug}
                      className="border-b border-gray-50 hover:bg-gray-50/60"
                    >
                      <td className="px-5 py-2.5">
                        <Link
                          href={`/waste/reports/${encodeURIComponent(r.slug)}`}
                          className="font-medium text-gray-900 no-underline hover:text-purple-700"
                        >
                          {r.title}
                        </Link>
                        <p className="text-[11px] text-gray-500">
                          materiality {r.materiality}
                        </p>
                      </td>
                      <td className="px-3 py-2.5 text-gray-600 whitespace-nowrap">
                        {r.period}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-gray-700">
                        {r.findings}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-gray-700">
                        {r.exposure}
                      </td>
                      <td className="px-3 py-2.5 text-gray-600 whitespace-nowrap">
                        {r.updated}
                      </td>
                      <td className="px-3 py-2.5">
                        <WasteReportStatusChip status={r.status} />
                      </td>
                      <td className="px-3 py-2.5">
                        <Link
                          href={`/waste/reports/${encodeURIComponent(r.slug)}`}
                          className="inline-flex items-center gap-1 text-xs font-medium text-purple-600 no-underline hover:text-purple-700"
                        >
                          Open <ArrowRight className="w-3 h-3" />
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </ForensicsShell>
    </WasteShell>
  )
}

"use client"

import { useMemo } from "react"
import Link from "next/link"
import { useQuery } from "@tanstack/react-query"
import { listPublicCitiesForSitemap } from "@/lib/publicApiClient"
import { CRM_DEFAULT_CITY_ID } from "@/lib/apiBase"
import { useWasteInvestigations } from "@/lib/hooks/useWaste"
import type { WasteInvestigation } from "@/lib/apiClient"
import { WasteShell } from "./waste-shell"
import { ForensicsShell } from "./forensics-shell"
import { cn } from "@/lib/utils"
import { ArrowRight, CheckCircle2, FolderOpen, Clock } from "lucide-react"

function useCityId() {
  const citiesQuery = useQuery({
    queryKey: ["public", "cities", "sitemap"],
    queryFn: listPublicCitiesForSitemap,
    staleTime: 5 * 60 * 1000,
  })
  return useMemo(() => {
    const eligible = (citiesQuery.data ?? []).filter(
      (c) => (c.datasets_count ?? 0) > 0
    )
    return eligible.length > 0 ? Number(eligible[0].id) : CRM_DEFAULT_CITY_ID
  }, [citiesQuery.data])
}

const STATUS_COLORS: Record<string, string> = {
  open: "bg-blue-100 text-blue-700",
  in_progress: "bg-yellow-100 text-yellow-700",
  pending_response: "bg-orange-100 text-orange-700",
  closed: "bg-gray-100 text-gray-600",
}

const DISPOSITION_LABELS: Record<string, string> = {
  confirmed_fraud: "Confirmed Fraud",
  confirmed_waste: "Confirmed Waste",
  policy_violation: "Policy Violation",
  data_error: "Data Error",
  false_positive: "False Positive",
  under_investigation: "Under Investigation",
  inconclusive: "Inconclusive",
}

export function ForensicsCasesPage() {
  const cityId = useCityId()

  // Load closed investigations as "cases"
  const closedQ = useWasteInvestigations({ cityId, status: "closed", perPage: 50 })
  // Also load active investigations
  const activeQ = useWasteInvestigations({ cityId, perPage: 50 })

  const isLoading = closedQ.isLoading && activeQ.isLoading
  const closedCases = closedQ.data?.items ?? []
  const activeCases = (activeQ.data?.items ?? []).filter(
    (inv) => inv.status !== "closed"
  )

  return (
    <WasteShell
      title="Forensics"
      description="Historical analysis and investigation workspace"
    >
      <ForensicsShell title="Cases & Investigation Outcomes">
        {/* Active cases */}
        {activeCases.length > 0 && (
          <div className="mb-6">
            <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
              <FolderOpen className="w-4 h-4 text-blue-500" />
              Active Cases ({activeCases.length})
            </h3>
            <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50">
                    <th className="text-left py-2.5 px-4 text-xs font-medium text-gray-500">
                      Title
                    </th>
                    <th className="text-center py-2.5 px-3 text-xs font-medium text-gray-500">
                      Status
                    </th>
                    <th className="text-right py-2.5 px-3 text-xs font-medium text-gray-500">
                      Actions
                    </th>
                    <th className="text-right py-2.5 px-3 text-xs font-medium text-gray-500">
                      Opened
                    </th>
                    <th className="py-2.5 px-3 w-8" />
                  </tr>
                </thead>
                <tbody>
                  {activeCases.map((inv: WasteInvestigation) => (
                    <tr
                      key={inv.id}
                      className="border-b border-gray-50 hover:bg-gray-50"
                    >
                      <td className="py-2.5 px-4 text-gray-800 font-medium truncate max-w-[250px]">
                        {inv.title}
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        <span
                          className={cn(
                            "text-[10px] font-medium px-1.5 py-0.5 rounded capitalize",
                            STATUS_COLORS[inv.status] ?? "bg-gray-100 text-gray-600"
                          )}
                        >
                          {inv.status.replace(/_/g, " ")}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-right text-gray-600 tabular-nums">
                        {inv.actions?.length ?? 0}
                      </td>
                      <td className="py-2.5 px-3 text-right text-xs text-gray-400">
                        {inv.opened_at
                          ? new Date(inv.opened_at).toLocaleDateString(
                              undefined,
                              { month: "short", day: "numeric" }
                            )
                          : "--"}
                      </td>
                      <td className="py-2.5 px-3">
                        <Link
                          href={`/waste/investigations/${inv.id}`}
                          className="text-purple-600 no-underline hover:text-purple-700"
                        >
                          <ArrowRight className="w-3.5 h-3.5" />
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Closed cases */}
        <div>
          <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
            Closed Cases ({closedCases.length})
          </h3>
          {isLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="h-12 bg-gray-100 rounded-lg animate-pulse"
                />
              ))}
            </div>
          ) : closedCases.length === 0 ? (
            <p className="text-sm text-gray-400 py-8 text-center">
              No closed cases yet.
            </p>
          ) : (
            <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50">
                    <th className="text-left py-2.5 px-4 text-xs font-medium text-gray-500">
                      Title
                    </th>
                    <th className="text-center py-2.5 px-3 text-xs font-medium text-gray-500">
                      Disposition
                    </th>
                    <th className="text-right py-2.5 px-3 text-xs font-medium text-gray-500">
                      Actions
                    </th>
                    <th className="text-right py-2.5 px-3 text-xs font-medium text-gray-500">
                      Closed
                    </th>
                    <th className="py-2.5 px-3 w-8" />
                  </tr>
                </thead>
                <tbody>
                  {closedCases.map((inv: WasteInvestigation) => (
                    <tr
                      key={inv.id}
                      className="border-b border-gray-50 hover:bg-gray-50"
                    >
                      <td className="py-2.5 px-4 text-gray-800 font-medium truncate max-w-[250px]">
                        {inv.title}
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        <span className="text-xs text-gray-600">
                          {inv.final_disposition
                            ? DISPOSITION_LABELS[inv.final_disposition] ??
                              inv.final_disposition
                            : "--"}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-right text-gray-600 tabular-nums">
                        {inv.actions?.length ?? 0}
                      </td>
                      <td className="py-2.5 px-3 text-right text-xs text-gray-400">
                        {inv.closed_at
                          ? new Date(inv.closed_at).toLocaleDateString(
                              undefined,
                              { month: "short", day: "numeric" }
                            )
                          : "--"}
                      </td>
                      <td className="py-2.5 px-3">
                        <Link
                          href={`/waste/investigations/${inv.id}`}
                          className="text-purple-600 no-underline hover:text-purple-700"
                        >
                          <ArrowRight className="w-3.5 h-3.5" />
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

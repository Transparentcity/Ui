"use client"

import { useMemo, useState, useEffect } from "react"
import { FileJson2, Upload, Play, Loader2, ExternalLink, Download, AlertTriangle, RefreshCw, ChevronDown, ChevronUp, Search, CheckCircle2, XCircle, Info } from "lucide-react"
import type { CityReadinessReport, CityReadinessResult, ReadinessDatasetCandidate } from "@/types/cityReadiness"
import { assessConceptCoverage, getExpectedConcepts } from "@/lib/cityReadinessSchema"

// --- Helper Constants & Functions from ReadinessContent ---

type TemplateHelp = {
  label: string
  suggestedKeywords: string[]
  suggestedFoiaScope: string
}

const TEMPLATE_HELP: Record<string, TemplateHelp> = {
  template_311_calls: {
    label: "311 Calls",
    suggestedKeywords: ["311", "service requests", "case", "ticket"],
    suggestedFoiaScope:
      "311 service requests: request id, created/opened date, request type/category, status, closure date, location, district (last 3 years; CSV).",
  },
  template_911_calls: {
    label: "911 Calls",
    suggestedKeywords: ["911", "calls for service", "dispatch", "CAD"],
    suggestedFoiaScope:
      "911 / calls-for-service: call id, received datetime, call type/priority, disposition, response times (if available), district/beat/precinct (last 2 years; CSV).",
  },
  template_violent_crime_fbi_type_i: {
    label: "Violent Crime Incidents",
    suggestedKeywords: ["police", "crime", "incident", "offense", "complaint data", "NIBRS", "UCR"],
    suggestedFoiaScope:
      "Incident-level violent crime records: incident/case id, occurred date/time, offense/category, disposition, location, precinct/district (last 5 years; CSV).",
  },
  template_property_crime_fbi_type_ii: {
    label: "Property Crime Incidents",
    suggestedKeywords: ["police", "crime", "incident", "offense", "complaint data", "burglary", "theft", "auto theft"],
    suggestedFoiaScope:
      "Incident-level property crime records: incident/case id, occurred date/time, offense/category, location, precinct/district (last 5 years; CSV).",
  },
  template_drug_crime: {
    label: "Drug Crime Incidents",
    suggestedKeywords: ["police", "drug", "narcotics", "controlled substance", "arrest", "offense"],
    suggestedFoiaScope:
      "Incident-level drug/narcotics offenses: incident/case id, occurred date/time, offense/category, location, precinct/district (last 5 years; CSV).",
  },
  template_building_permits: {
    label: "Building Permits",
    suggestedKeywords: ["building permits", "permit", "inspection", "department of buildings"],
    suggestedFoiaScope:
      "Building/construction permits: permit id, issue date, permit/work type, valuation/cost (if available), address, status, district (last 5 years; CSV).",
  },
  template_business_registrations: {
    label: "Business Registrations",
    suggestedKeywords: ["business licenses", "business registration", "active businesses"],
    suggestedFoiaScope:
      "Business registrations/licenses: business id, name (if public), status, start date, NAICS/category, address/district (last 5 years; CSV).",
  },
}

function expandedFoiaScope(metricLabel: string, group: string) {
  const g = (group || "").toLowerCase()
  if (g.includes("crime")) {
    return `Records supporting “${metricLabel}”: incident/case id, occurred date/time, offense/category, disposition, location, precinct/district (last 5 years; CSV).`
  }
  if (g.includes("traffic")) {
    return `Records supporting “${metricLabel}”: citation/stop/collision id, occurred date/time, type/category, location, and injury/fatal flags (as applicable) (last 3–5 years; CSV).`
  }
  if (g.includes("safety")) {
    return `Records supporting “${metricLabel}”: event id, received/dispatch/arrival times (if applicable), event type/priority, location, outcome (last 2–5 years; CSV).`
  }
  if (g.includes("housing")) {
    return `Records supporting “${metricLabel}”: record id, created/issued date, type/category, status/outcome, location/district (last 3–5 years; CSV).`
  }
  if (g.includes("economy")) {
    return `Records supporting “${metricLabel}”: registration/license id, start/end dates (if available), status, category (NAICS if available), location/district (last 5 years; CSV).`
  }
  if (g.includes("public")) {
    return `Records supporting “${metricLabel}”: request id, created date, category/subcategory, status, closure date, location/district (last 3 years; CSV).`
  }
  return `Records supporting “${metricLabel}” (CSV; last 3–5 years if available).`
}

type ProbeResult =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; error: string }
  | {
      status: "ok"
      provider: string
      columns: string[]
      sample: Record<string, unknown> | null
      fetchedFrom?: string
    }

function safeJsonParse(raw: string): { value: CityReadinessReport | null; error: string | null } {
  try {
    const v = JSON.parse(raw) as CityReadinessReport
    if (!v || typeof v !== "object" || !Array.isArray((v as any).cities)) {
      return { value: null, error: "That JSON doesn't look like a readiness report (missing `cities`)." }
    }
    return { value: v, error: null }
  } catch (e) {
    return { value: null, error: e instanceof Error ? e.message : "Invalid JSON." }
  }
}

// Helper to format iso date
function fmtDate(iso?: string) {
  if (!iso) return ""
  try {
    return new Date(iso).toLocaleDateString(undefined, { 
        year: 'numeric', 
        month: 'short', 
        day: 'numeric' 
    })
  } catch {
    return ""
  }
}

type Mode = "core7" | "expanded"

function cityLabel(c: CityReadinessResult) {
  return `${c.city.name}, ${c.city.state}`
}

function MetricRow({ 
  cityId, 
  row, 
  probe, 
  runProbe, 
  isSelectedForReview, 
  toggleReview 
}: { 
  cityId: number
  row: {
      key: string
      label: string
      group: string
      dataset?: ReadinessDatasetCandidate | null
      top_matches?: ReadinessDatasetCandidate[]
      keywords?: string[]
      match_timestamp?: string // New
  }
  probe: Record<string, ProbeResult>
  runProbe: any
  isSelectedForReview: boolean
  toggleReview: any
}) {
  const k = `${cityId}:${row.key}`
  const pr = probe[k] ?? { status: "idle" }
  const expected = getExpectedConcepts(row.key, row.group)
  const cols = pr.status === "ok" ? pr.columns : []
  const coverage = cols.length ? assessConceptCoverage(cols, expected) : null
  const confidencePct = coverage ? Math.round(coverage.ratio * 100) : null
  
  const isMissing = !row.dataset || row.dataset.dataset_id === "none"

  // Helper info for missing
  const help = TEMPLATE_HELP[row.key]
  const suggestedKeywords =
      help?.suggestedKeywords?.length
        ? help.suggestedKeywords
        : row.keywords?.length
          ? Array.from(new Set(row.keywords)).slice(0, 14)
          : []
  const suggestedScope =
      help?.suggestedFoiaScope ?? expandedFoiaScope(row.label || row.key, row.group || "Unknown")

  return (
    <div className={`p-4 border-b border-gray-100 last:border-0 ${isSelectedForReview ? "bg-red-50/50" : ""}`}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3 min-w-0 flex-1">
          <input
            type="checkbox"
            checked={isSelectedForReview}
            onChange={() => toggleReview(cityId, row.key, row.dataset?.dataset_id)}
            className="mt-1 h-4 w-4 rounded border-gray-300 text-purple-600 focus:ring-purple-500 cursor-pointer shrink-0"
            title="Mark as incorrect match / Needs Refinement"
          />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
                <div className="text-sm font-semibold text-gray-900">{row.label}</div>
                {isMissing ? (
                     <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-800">
                        Missing
                     </span>
                ) : (
                    <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800">
                        Found
                    </span>
                )}
            </div>
            
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <div className="text-xs text-gray-500 font-mono">{row.key}</div>
            </div>

            {/* If found, show details */}
            {!isMissing && row.dataset && (
                <>
                    {row.dataset.title && (
                    <div className="mt-2 text-xs text-gray-600">
                        Match: <span className="font-semibold">{row.dataset.title}</span>
                    </div>
                    )}
                    
                    {/* NEW: Show match timestamp if available (or fallback to 'Last updated' from dataset metadata if needed, but the user asked for MATCH time) */}
                    {/* Since we don't have per-match timestamps in the current JSON report schema yet, we might need to rely on the report's generation time or update the backend. */}
                    {/* However, the user asked to "add a date and time for when the dataset match occurred". */}
                    
                    {/* Let's show the dataset's LAST UPDATED date as a proxy for "freshness" which is also very useful */}
                    {/* Or if we want match time, we'd need to thread 'report.generated_at' down to here as a fallback */}
                    
                    <div className="mt-1 flex items-center gap-2 text-[10px] text-gray-400">
                         <span>Matched: {row.match_timestamp}</span>
                    </div>

                    {row.dataset.url && (
                    <a
                        href={row.dataset.url}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-1 inline-flex items-center gap-1 text-xs text-purple-700 hover:text-purple-800 underline underline-offset-4"
                    >
                        View Data <ExternalLink className="h-3 w-3" />
                    </a>
                    )}
                </>
            )}

            {/* If missing, show helpers */}
            {isMissing && (
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <div className="rounded-lg border border-amber-200 bg-amber-50 p-2.5">
                        <div className="text-[10px] font-bold uppercase tracking-wide text-amber-800 mb-1">Suggested Keywords</div>
                        <div className="text-xs text-amber-900 flex flex-wrap gap-1">
                            {suggestedKeywords.length > 0 ? suggestedKeywords.map(k => (
                                <span key={k} className="bg-white/60 px-1.5 py-0.5 rounded border border-amber-200/50">{k}</span>
                            )) : "—"}
                        </div>
                    </div>
                    <div className="rounded-lg border border-amber-200 bg-amber-50 p-2.5">
                        <div className="text-[10px] font-bold uppercase tracking-wide text-amber-800 mb-1">Suggested FOIA Scope</div>
                        <div className="text-xs text-amber-900 leading-relaxed">
                            {suggestedScope}
                        </div>
                    </div>
                </div>
            )}
            
            {/* Show top candidates if missing (false positives?) */}
            {isMissing && (row.top_matches?.length ?? 0) > 0 && (
                <div className="mt-3">
                    <div className="text-xs font-semibold text-gray-500 mb-2">Did we miss one of these?</div>
                    <div className="space-y-2">
                        {row.top_matches?.slice(0, 3).map((cand, idx) => (
                            <div key={idx} className="flex items-center justify-between text-xs bg-gray-50 border border-gray-100 rounded p-2">
                                <span className="truncate flex-1 font-medium text-gray-700">{cand.title}</span>
                                <span className="text-gray-400 ml-2">Score: {cand.score}</span>
                                {cand.url && (
                                    <a href={cand.url} target="_blank" className="ml-2 text-purple-600 hover:underline">Link</a>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            )}
          </div>
        </div>

        <div className="shrink-0 flex items-center gap-2 self-start">
          {pr.status === "ok" && confidencePct != null && (
            <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${confidencePct > 80 ? 'bg-emerald-50 text-emerald-800' : 'bg-amber-50 text-amber-800'}`}>
              Schema: {confidencePct}%
            </span>
          )}
          {pr.status === "error" && (
            <span className="rounded-full bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-700">
              Probe Error
            </span>
          )}
          
          {/* Only show verify button if we have a dataset */}
          {!isMissing && row.dataset && (
              <button
                onClick={() => runProbe(cityId, row.key, row.label, row.group, row.dataset)}
                disabled={pr.status === "loading"}
                className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-60 shadow-sm"
              >
                {pr.status === "loading" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Play className="h-4 w-4" />
                )}
                Verify
              </button>
          )}
        </div>
      </div>

      {pr.status === "error" && (
        <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {pr.error}
        </div>
      )}

      {pr.status === "ok" && (
        <div className="mt-4 grid gap-4 lg:grid-cols-2 bg-gray-50/50 rounded-lg p-3 border border-gray-100">
          <div className="p-2">
            <div className="text-xs font-semibold text-gray-700 mb-2">Schema Concepts</div>
            <div className="space-y-1">
              {coverage?.conceptFindings.map((f) => (
                <div key={f.concept.key} className="flex items-center justify-between gap-2 text-xs">
                  <span className="text-gray-600">{f.concept.label}</span>
                  {f.ok ? (
                     <span className="text-emerald-700 font-medium flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3" /> Match
                     </span>
                  ) : (
                      <span className="text-amber-700 font-medium flex items-center gap-1">
                        <XCircle className="w-3 h-3" /> Missing
                      </span>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="p-2">
            <div className="text-xs font-semibold text-gray-700 mb-2">Sample Record</div>
            <div className="max-h-40 overflow-auto rounded border border-gray-200 bg-white p-2 text-[10px] font-mono text-gray-800">
              {pr.sample ? JSON.stringify(pr.sample, null, 2) : "No record returned."}
            </div>
             {pr.fetchedFrom && (
                <div className="mt-1 text-[10px] text-gray-400 truncate">
                  Source: {pr.fetchedFrom}
                </div>
              )}
          </div>
        </div>
      )}
    </div>
  )
}

export function SchemaMatchContent() {
  const [report, setReport] = useState<CityReadinessReport | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [mode, setMode] = useState<Mode>("core7")
  const [probe, setProbe] = useState<Record<string, ProbeResult>>({})
  const [availableReports, setAvailableReports] = useState<
    Array<{ name: string; generated_at: string | null }>
  >([])
  const [loadingReports, setLoadingReports] = useState(false)
  const [selectedReportName, setSelectedReportName] = useState<string>("")
  const [selectedForReview, setSelectedForReview] = useState<Record<string, boolean>>({})
  const [refining, setRefining] = useState(false)
  const [expandedCityIds, setExpandedCityIds] = useState<Set<number>>(new Set())
  const [q, setQ] = useState("")

  const sortedCities = useMemo(() => {
    if (!report) return []
    let list = [...report.cities].sort((a, b) => {
        // Sort by Score Descending
        const scoreA = a.ease_to_structure_score_v2_0_100 ?? 0
        const scoreB = b.ease_to_structure_score_v2_0_100 ?? 0
        return scoreB - scoreA
    })
    
    if (q) {
        const lowerQ = q.toLowerCase()
        list = list.filter(c => 
            (c.city.name && c.city.name.toLowerCase().includes(lowerQ)) || 
            (c.city.state && c.city.state.toLowerCase().includes(lowerQ))
        )
    }
    
    return list
  }, [report, q])

  // Helper to get metrics for a city
  function getCityMetrics(city: CityReadinessResult) {
      const reportDate = report?.generated_at ? new Date(report.generated_at).toLocaleString() : "Unknown"
      
      if (mode === "expanded") {
        const matches = city.expanded_dashboard_coverage?.dataset_matches ?? []
        return matches.map((m) => ({
            key: m.metric_key,
            label: m.metric_label,
            group: m.group,
            dataset: m.best_match,
            top_matches: m.top_matches,
            keywords: m.keywords,
            match_timestamp: reportDate
          }))
      }
      // Core 7
      const matches = city.core_open_data_coverage?.dataset_matches ?? []
      return matches.map((m) => ({
          key: m.template_key,
          label: m.template_name,
          group: "Core",
          dataset: m.best_match,
          top_matches: m.top_matches,
          keywords: [], 
          match_timestamp: reportDate
        }))
  }

  // ... (keeping load functions same as before)
    function safeJsonParse(raw: string): { value: CityReadinessReport | null; error: string | null } {
    try {
        const v = JSON.parse(raw) as CityReadinessReport
        if (!v || typeof v !== "object" || !Array.isArray((v as any).cities)) {
        return { value: null, error: "That JSON doesn't look like a readiness report (missing `cities`)." }
        }
        return { value: v, error: null }
    } catch (e) {
        return { value: null, error: e instanceof Error ? e.message : "Invalid JSON." }
    }
    }

  async function loadReportByName(name: string) {
    if (!name) return
    setLoadingReports(true)
    try {
      const res = await fetch(`/api/cityreadiness/reports?name=${encodeURIComponent(name)}`, {
        cache: "no-store",
      })
      const data = (await res.json()) as any
      if (!res.ok) {
        setError(data?.error || "Failed to load report.")
        return
      }
      const parsed = safeJsonParse(JSON.stringify(data))
      if (parsed.error) {
        setError(parsed.error)
        setReport(null)
        return
      }
      setError(null)
      setReport(parsed.value)
      setProbe({})
      setExpandedCityIds(new Set())
    } finally {
      setLoadingReports(false)
    }
  }

  async function refreshAvailableReports() {
    setLoadingReports(true)
    try {
      const res = await fetch("/api/cityreadiness/reports", { cache: "no-store" })
      const data = (await res.json()) as any
      const list = Array.isArray(data?.reports) ? data.reports : []
      setAvailableReports(
        list.map((r: any) => ({
          name: String(r?.name || ""),
          generated_at: typeof r?.generated_at === "string" ? r.generated_at : null,
        }))
      )
      if (!selectedReportName && list.length > 0) {
        setSelectedReportName(String(list[0].name))
      }
      return list
    } catch {
      return []
    } finally {
      setLoadingReports(false)
    }
  }

  useEffect(() => {
    let mounted = true
    ;(async () => {
      setLoadingReports(true)
      try {
        const res = await fetch("/api/cityreadiness/reports", { cache: "no-store" })
        const data = await res.json()
        if (!mounted) return
        const list = Array.isArray(data?.reports) ? data.reports : []
        setAvailableReports(list.map((r: any) => ({
            name: String(r?.name || ""),
            generated_at: typeof r?.generated_at === "string" ? r.generated_at : null,
        })))
        if (list.length > 0) {
          const latest = list[0]
          setSelectedReportName(latest.name)
          await loadReportByName(latest.name)
        }
      } catch (e) {
        console.error(e)
      } finally {
        if (mounted) setLoadingReports(false)
      }
    })()
    return () => { mounted = false }
  }, [])

  async function loadSelectedServerReport() {
    await loadReportByName(selectedReportName)
  }

  // ... Probe logic ...
  function probeKey(cityId: number, metricKey: string) {
    return `${cityId}:${metricKey}`
  }

  async function runProbe(cityId: number, metricKey: string, metricLabel: string, group: string, dataset: any) {
    const k = probeKey(cityId, metricKey)
    setProbe((p) => ({ ...p, [k]: { status: "loading" } }))
    try {
      const res = await fetch("/api/cityreadiness/probe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          metricKey,
          metricLabel,
          dataset: { dataset_id: dataset.dataset_id, url: dataset.url, title: dataset.title },
        }),
      })
      const data = (await res.json()) as any
      if (!res.ok || !data?.ok) {
        setProbe((p) => ({ ...p, [k]: { status: "error", error: data?.error || "Probe failed." } }))
        return
      }
      const colsRaw = (data?.meta?.columns ?? []) as any[]
      const columns: string[] = colsRaw.map((c) => String(c?.field || c?.name || "").trim()).filter(Boolean)
      const sample = (data?.sample?.record ?? null) as Record<string, unknown> | null
      setProbe((p) => ({
        ...p,
        [k]: {
          status: "ok",
          provider: String(data?.provider || "unknown"),
          columns,
          sample,
          fetchedFrom: data?.sample?.fetched_from,
        },
      }))
    } catch (e) {
      setProbe((p) => ({
        ...p,
        [k]: { status: "error", error: e instanceof Error ? e.message : "Probe error." },
      }))
    }
  }

  function toggleReview(cityId: number, metricKey: string, datasetId: string) {
    const k = `${cityId}:${metricKey}:${datasetId}`
    setSelectedForReview((prev) => ({ ...prev, [k]: !prev[k] }))
  }

  async function handleRefine() {
    setRefining(true)
    try {
      const exclusions = Object.entries(selectedForReview)
        .filter(([, v]) => v)
        .map(([k]) => {
          const [cityId, metricKey, datasetId] = k.split(":")
          const city = report?.cities.find((c) => String(c.city.id) === cityId)?.city
          return {
            city_id: cityId,
            metric_key: metricKey,
            dataset_id: datasetId,
            city_name: city?.name || "Unknown City",
          }
        })

      if (exclusions.length === 0) {
        alert("No items selected for review.")
        return
      }

      const res = await fetch("/api/cityreadiness/refine", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ exclusions }),
      })

      const data = (await res.json()) as any
      if (res.ok && data.ok && data.reportName) {
        const nextSelected = { ...selectedForReview }
        Object.keys(nextSelected).forEach((k) => { if (nextSelected[k]) delete nextSelected[k] })
        setSelectedForReview(nextSelected)
        await refreshAvailableReports()
        await new Promise((resolve) => setTimeout(resolve, 100))
        if (data.reportName) {
            setSelectedReportName(data.reportName)
            await loadReportByName(data.reportName)
        }
      } else {
        alert("Refinement failed: " + (data.error || "Unknown error"))
      }
    } catch (e) {
      console.error(e)
      alert("Refinement error")
    } finally {
      setRefining(false)
    }
  }

  function toggleExpandCity(id: number) {
      const next = new Set(expandedCityIds)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      setExpandedCityIds(next)
  }

  const selectedCount = Object.values(selectedForReview).filter(Boolean).length

  return (
    <div className="flex flex-col gap-8 max-w-5xl mx-auto pb-20">
      {/* Header & Controls */}
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
            <div>
                <h1 className="text-2xl font-bold text-gray-900">City Readiness Dashboard</h1>
                <p className="text-gray-500 text-sm mt-1">Review matches, check coverage, and refine data connections.</p>
            </div>
            
            <div className="flex items-center gap-3">
                 {/* Mode Toggle */}
                <div className="flex rounded-lg border border-gray-200 bg-white p-1">
                    <button
                        onClick={() => setMode("core7")}
                        className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${mode === "core7" ? "bg-purple-100 text-purple-700" : "text-gray-600 hover:bg-gray-50"}`}
                    >
                        Core 7
                    </button>
                    <button
                        onClick={() => setMode("expanded")}
                        className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${mode === "expanded" ? "bg-purple-100 text-purple-700" : "text-gray-600 hover:bg-gray-50"}`}
                    >
                        Expanded
                    </button>
                </div>
                
                {/* Refine Action */}
                <button
                    onClick={handleRefine}
                    disabled={refining || selectedCount === 0}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg font-semibold text-sm transition-all shadow-sm
                        ${selectedCount > 0 
                            ? "bg-purple-600 text-white hover:bg-purple-700 shadow-purple-200" 
                            : "bg-gray-100 text-gray-400 cursor-not-allowed"}`}
                >
                     {refining ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                     {selectedCount > 0 ? `Refine ${selectedCount} Matches` : "Select Matches to Refine"}
                </button>
            </div>
        </div>

        {/* Report Loader */}
        <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 bg-gray-50 p-2 rounded-lg border border-gray-200 w-fit">
                <select
                    value={selectedReportName}
                    onChange={(e) => setSelectedReportName(e.target.value)}
                    className="bg-transparent border-none text-sm text-gray-700 focus:ring-0 cursor-pointer min-w-[200px]"
                >
                    <option value="">Select report...</option>
                    {availableReports.map((r) => (
                        <option key={r.name} value={r.name}>{r.generated_at ? `${r.generated_at.split('T')[0]} - ${r.name}` : r.name}</option>
                    ))}
                </select>
                <button 
                    onClick={loadSelectedServerReport}
                    disabled={loadingReports}
                    className="p-1 text-gray-500 hover:text-purple-600 transition-colors"
                    title="Reload"
                >
                    {loadingReports ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                </button>
            </div>
            
            <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input
                    type="text"
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    placeholder="Search cities..."
                    className="w-full pl-9 pr-4 py-2 bg-white border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-100 focus:border-purple-300"
                />
            </div>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700 font-medium">
            {error}
        </div>
      )}

      {/* Main List */}
      <div className="space-y-4">
        {sortedCities.map((city, index) => {
            const metrics = getCityMetrics(city)
            const isExpanded = expandedCityIds.has(city.city.id)
            const score = Math.round(city.ease_to_structure_score_v2_0_100 || 0)
            const foundCount = metrics.filter(m => m.dataset && m.dataset.dataset_id !== "none").length
            const totalCount = metrics.length
            const coveragePct = totalCount > 0 ? Math.round((foundCount / totalCount) * 100) : 0
            
            return (
                <div key={city.city.id} className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden transition-all hover:shadow-md">
                    {/* Card Header - Click to expand */}
                    <div 
                        onClick={() => toggleExpandCity(city.city.id)}
                        className="flex items-center justify-between p-5 cursor-pointer hover:bg-gray-50/50 transition-colors"
                    >
                        <div className="flex items-center gap-4">
                            <div className="flex items-center justify-center w-8 h-8 rounded-full bg-gray-100 text-gray-500 font-bold text-sm">
                                #{index + 1}
                            </div>
                            <div>
                                <h3 className="text-lg font-bold text-gray-900">{cityLabel(city)}</h3>
                                <div className="flex items-center gap-3 mt-1 text-xs font-medium">
                                    <span className={`${score >= 80 ? 'text-emerald-600' : score >= 50 ? 'text-amber-600' : 'text-red-600'}`}>
                                        Readiness: {score}/100
                                    </span>
                                    <span className="text-gray-400">•</span>
                                    <span className="text-gray-500">{foundCount}/{totalCount} datasets found</span>
                                </div>
                            </div>
                        </div>

                        <div className="flex items-center gap-6">
                            {/* Coverage Bar */}
                            <div className="hidden md:flex flex-col w-32 gap-1">
                                <div className="flex justify-between text-[10px] text-gray-500 uppercase font-bold tracking-wider">
                                    <span>Coverage</span>
                                    <span>{coveragePct}%</span>
                                </div>
                                <div className="h-2 w-full bg-gray-100 rounded-full overflow-hidden">
                                    <div 
                                        className={`h-full rounded-full ${coveragePct >= 80 ? 'bg-emerald-500' : coveragePct >= 50 ? 'bg-amber-400' : 'bg-red-400'}`}
                                        style={{ width: `${coveragePct}%` }}
                                    />
                                </div>
                            </div>
                            
                            {isExpanded ? <ChevronUp className="h-5 w-5 text-gray-400" /> : <ChevronDown className="h-5 w-5 text-gray-400" />}
                        </div>
                    </div>

                    {/* Expandable Details */}
                    {isExpanded && (
                        <div className="border-t border-gray-100 bg-gray-50/30">
                            {metrics.length === 0 ? (
                                <div className="p-8 text-center text-gray-500 text-sm">
                                    No metrics configured for this mode.
                                </div>
                            ) : (
                                <div>
                                    {metrics.map(row => (
                                        <MetricRow
                                            key={row.key}
                                            cityId={city.city.id}
                                            row={row}
                                            probe={probe}
                                            runProbe={runProbe}
                                            isSelectedForReview={!!selectedForReview[`${city.city.id}:${row.key}:${row.dataset?.dataset_id}`]}
                                            toggleReview={toggleReview}
                                        />
                                    ))}
                                    
                                    <div className="p-4 bg-gray-50 border-t border-gray-200 flex justify-end">
                                        <button 
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                // TODO: Select all missing
                                            }}
                                            className="text-xs text-purple-600 font-medium hover:underline"
                                        >
                                            
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )
        })}
      </div>
      
      {!report && !loadingReports && (
         <div className="text-center py-20 text-gray-400">
             No report loaded. Select one from the dropdown above.
         </div>
      )}
    </div>
  )
}

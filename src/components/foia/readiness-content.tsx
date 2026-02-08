"use client"

import { useMemo, useState, useEffect } from "react"
import Link from "next/link"
import { Upload, Search, ExternalLink, FileJson2, Download, Loader2 } from "lucide-react"
import type { CityReadinessReport, CityReadinessResult } from "@/types/cityReadiness"

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

function fmtPct(r?: number) {
  if (r == null || Number.isNaN(r)) return "—"
  return `${Math.round(r * 100)}%`
}

function cityLabel(c: CityReadinessResult) {
  return `${c.city.name}, ${c.city.state}`
}

type CoverageMode = "core7" | "expanded"

function getCoverageSummary(c: CityReadinessResult, mode: CoverageMode) {
  if (mode === "expanded") {
    const exp = c.expanded_dashboard_coverage
    return {
      label: "Expanded dashboard",
      found: exp?.metrics_with_open_data ?? 0,
      total: exp?.metrics_total ?? 0,
      ratio: exp?.open_data_ratio ?? 0,
    }
  }
  const core = c.core_open_data_coverage
  return {
    label: "Core 7",
    found: core?.templates_with_open_data ?? 0,
    total: core?.templates_total ?? 0,
    ratio: core?.open_data_ratio ?? 0,
  }
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

export function ReadinessContent({
  backHref = "/foia",
  backLabel = "Back to FOIA Dashboard",
}: {
  backHref?: string
  backLabel?: string
} = {}) {
  const [report, setReport] = useState<CityReadinessReport | null>(null)
  const [rawJson, setRawJson] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [q, setQ] = useState("")
  const [selectedCityId, setSelectedCityId] = useState<number | null>(null)
  const [mode, setMode] = useState<CoverageMode>("core7")
  const [availableReports, setAvailableReports] = useState<
    Array<{ name: string; generated_at: string | null }>
  >([])
  const [loadingReports, setLoadingReports] = useState(false)
  const [selectedReportName, setSelectedReportName] = useState<string>("")

  const cities = useMemo(() => {
    if (!report) return []
    const list = [...report.cities]
    list.sort((a, b) => {
      const ca = getCoverageSummary(a, mode)
      const cb = getCoverageSummary(b, mode)
      if (cb.ratio !== ca.ratio) return cb.ratio - ca.ratio
      return (b.ease_to_structure_score_v2_0_100 ?? 0) - (a.ease_to_structure_score_v2_0_100 ?? 0)
    })
    const query = q.trim().toLowerCase()
    if (!query) return list
    return list.filter((c) => cityLabel(c).toLowerCase().includes(query))
  }, [report, q, mode])

  const selected = useMemo(() => {
    if (!report) return null
    const id = selectedCityId ?? cities[0]?.city.id
    if (!id) return null
    return report.cities.find((c) => c.city.id === id) ?? null
  }, [report, selectedCityId, cities])

  async function onUpload(file: File | null) {
    if (!file) return
    const text = await file.text()
    const parsed = safeJsonParse(text)
    if (parsed.error) {
      setError(parsed.error)
      setReport(null)
      return
    }
    setError(null)
    setReport(parsed.value)
    setSelectedCityId(parsed.value?.cities?.[0]?.city?.id ?? null)
  }

  function onUsePastedJson() {
    const parsed = safeJsonParse(rawJson)
    if (parsed.error) {
      setError(parsed.error)
      setReport(null)
      return
    }
    setError(null)
    setReport(parsed.value)
    setSelectedCityId(parsed.value?.cities?.[0]?.city?.id ?? null)
  }

  // Refactored helper to load a specific report by name
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
      setSelectedCityId(parsed.value?.cities?.[0]?.city?.id ?? null)
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
      // If we don't have a selection yet, default to the first one (latest)
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

  // Auto-load on mount
  useEffect(() => {
    let mounted = true
    ;(async () => {
      setLoadingReports(true)
      try {
        const res = await fetch("/api/cityreadiness/reports", { cache: "no-store" })
        const data = await res.json()
        if (!mounted) return

        const list = Array.isArray(data?.reports) ? data.reports : []
        setAvailableReports(
          list.map((r: any) => ({
            name: String(r?.name || ""),
            generated_at: typeof r?.generated_at === "string" ? r.generated_at : null,
          }))
        )

        // Auto-load latest if available
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
    return () => {
      mounted = false
    }
  }, [])

  async function loadSelectedServerReport() {
    await loadReportByName(selectedReportName)
  }


  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-6">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">City Readiness (Step 1)</h1>
          <p className="mt-1 text-sm text-gray-500">
            Upload the readiness report JSON, then click cities to see what’s missing for core completeness and what to
            search for (or FOIA).
          </p>
          {report?.generated_at && (
            <p className="mt-2 text-xs text-gray-400">
              Loaded report generated at: <span className="font-mono">{report.generated_at}</span>
            </p>
          )}
        </div>
        <Link
          href={backHref}
          className="text-sm text-purple-700 hover:text-purple-800 underline underline-offset-4"
        >
          {backLabel}
        </Link>
      </div>

      {/* Load controls */}
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-gray-200 bg-white p-5">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-gray-900">
              <Download className="h-4 w-4 text-gray-500" />
              Load from server (recent reports)
            </div>
            <button
              onClick={refreshAvailableReports}
              className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm font-semibold text-gray-700 hover:bg-gray-50"
            >
              Refresh
            </button>
          </div>
          <p className="mt-1 text-xs text-gray-500">
            Lists files in <span className="font-mono">{"/private/tmp"}</span> (or{" "}
            <span className="font-mono">CITYREADINESS_REPORT_DIR</span>) named{" "}
            <span className="font-mono">city_readiness_report_*.json</span>.
          </p>
          <div className="mt-3 flex items-center gap-2">
            <select
              value={selectedReportName}
              onChange={(e) => setSelectedReportName(e.target.value)}
              className="flex-1 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:border-purple-400 focus:outline-none focus:ring-1 focus:ring-purple-400"
            >
              <option value="">Select a report…</option>
              {availableReports.map((r) => (
                <option key={r.name} value={r.name}>
                  {r.generated_at ? `${r.generated_at} — ${r.name}` : r.name}
                </option>
              ))}
            </select>
            <button
              onClick={loadSelectedServerReport}
              disabled={!selectedReportName || loadingReports}
              className="inline-flex items-center gap-2 rounded-lg bg-purple-600 px-3 py-2 text-sm font-semibold text-white hover:bg-purple-700 disabled:opacity-60"
            >
              {loadingReports ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              Load
            </button>
          </div>
          {availableReports.length === 0 && (
            <div className="mt-3 text-xs text-gray-400">
              Click “Refresh” to load available reports.
            </div>
          )}
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-5">
          <div className="flex items-center gap-2 text-sm font-semibold text-gray-900">
            <Upload className="h-4 w-4 text-gray-500" />
            Load from JSON file
          </div>
          <p className="mt-1 text-xs text-gray-500">
            Generate via the platform script (e.g.{" "}
            <span className="font-mono">city_readiness_report.py --output-json ...</span>) then upload the output file.
          </p>
          <label className="mt-3 inline-flex cursor-pointer items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700 hover:bg-gray-100">
            <FileJson2 className="h-4 w-4" />
            Choose file
            <input
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={(e) => onUpload(e.target.files?.[0] ?? null)}
            />
          </label>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-5 lg:col-span-2">
          <div className="flex items-center gap-2 text-sm font-semibold text-gray-900">
            <FileJson2 className="h-4 w-4 text-gray-500" />
            Paste JSON
          </div>
          <textarea
            value={rawJson}
            onChange={(e) => setRawJson(e.target.value)}
            placeholder='Paste the full JSON (must include a top-level "cities" array)...'
            className="mt-3 h-28 w-full resize-y rounded-lg border border-gray-200 bg-white p-3 text-xs font-mono text-gray-900 placeholder:text-gray-400 focus:border-purple-400 focus:outline-none focus:ring-1 focus:ring-purple-400"
          />
          <button
            onClick={onUsePastedJson}
            className="mt-3 inline-flex items-center gap-2 rounded-lg bg-purple-600 px-3 py-2 text-sm font-semibold text-white hover:bg-purple-700"
          >
            Use pasted JSON
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700">{error}</div>
      )}

      {!report ? (
        <div className="rounded-xl border border-gray-200 bg-white px-6 py-12 text-center text-sm text-gray-500">
          Load a readiness report JSON to view rankings and missing items.
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[420px_1fr]">
          {/* Left list */}
          <div className="rounded-xl border border-gray-200 bg-white p-4">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setMode("core7")}
                className={[
                  "rounded-lg px-3 py-1.5 text-sm font-semibold border",
                  mode === "core7"
                    ? "bg-purple-600 text-white border-purple-600"
                    : "bg-white text-gray-700 border-gray-200 hover:bg-gray-50",
                ].join(" ")}
              >
                Core 7
              </button>
              <button
                onClick={() => setMode("expanded")}
                className={[
                  "rounded-lg px-3 py-1.5 text-sm font-semibold border",
                  mode === "expanded"
                    ? "bg-purple-600 text-white border-purple-600"
                    : "bg-white text-gray-700 border-gray-200 hover:bg-gray-50",
                ].join(" ")}
              >
                Expanded dashboard
              </button>
            </div>
            <div className="relative mt-3">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Filter cities..."
                className="w-full rounded-lg border border-gray-200 bg-white py-2 pl-10 pr-3 text-sm text-gray-900 placeholder:text-gray-400 focus:border-purple-400 focus:outline-none focus:ring-1 focus:ring-purple-400"
              />
            </div>
            <div className="mt-4 divide-y divide-gray-100">
              {cities.map((c, idx) => {
                const core = c.core_open_data_coverage
                const exp = c.expanded_dashboard_coverage
                const primary = getCoverageSummary(c, mode)
                const active = c.city.id === (selected?.city.id ?? null)
                return (
                  <button
                    key={c.city.id}
                    onClick={() => setSelectedCityId(c.city.id)}
                    className={[
                      "w-full text-left px-3 py-3 transition-colors",
                      active ? "bg-purple-50" : "hover:bg-gray-50",
                    ].join(" ")}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-semibold text-gray-400">#{idx + 1}</span>
                          <span className="text-sm font-semibold text-gray-900 truncate">{cityLabel(c)}</span>
                        </div>
                        <div className="mt-1 flex flex-wrap gap-2 text-xs text-gray-500">
                          <span className="rounded-md bg-gray-100 px-2 py-1">
                            Ease v2:{" "}
                            <span className="font-semibold text-gray-900">
                              {c.ease_to_structure_score_v2_0_100.toFixed(2)}
                            </span>
                          </span>
                          <span className="rounded-md bg-gray-100 px-2 py-1">
                            {primary.label}:{" "}
                            <span className="font-semibold text-gray-900">
                              {primary.total ? `${primary.found}/${primary.total}` : "—"}
                            </span>{" "}
                            ({primary.total ? fmtPct(primary.ratio) : "—"})
                          </span>
                          <span className="rounded-md bg-gray-50 px-2 py-1 text-gray-400">
                            Core:{" "}
                            <span className="font-semibold text-gray-700">
                              {core ? `${core.templates_with_open_data}/${core.templates_total}` : "—"}
                            </span>{" "}
                            | Expanded:{" "}
                            <span className="font-semibold text-gray-700">
                              {exp ? `${exp.metrics_with_open_data}/${exp.metrics_total}` : "—"}
                            </span>
                          </span>
                        </div>
                      </div>
                    </div>
                  </button>
                )
              })}
              {cities.length === 0 && (
                <div className="px-3 py-10 text-center text-sm text-gray-400">No matching cities.</div>
              )}
            </div>
          </div>

          {/* Right detail */}
          <div className="rounded-xl border border-gray-200 bg-white p-6">
            {!selected ? (
              <div className="text-sm text-gray-500">Select a city to see missing items.</div>
            ) : (
              <div className="flex flex-col gap-6">
                <div>
                  <h2 className="text-xl font-semibold text-gray-900">{cityLabel(selected)}</h2>
                  <div className="mt-2 flex flex-wrap gap-2 text-xs text-gray-500">
                    <span className="rounded-md bg-gray-100 px-2 py-1">
                      Ease v2:{" "}
                      <span className="font-semibold text-gray-900">
                        {selected.ease_to_structure_score_v2_0_100.toFixed(2)}
                      </span>
                    </span>
                    <span className="rounded-md bg-gray-100 px-2 py-1">
                      Ease (structure):{" "}
                      <span className="font-semibold text-gray-900">
                        {selected.ease_to_structure_score_0_100.toFixed(1)}
                      </span>
                    </span>
                    <span className="rounded-md bg-gray-100 px-2 py-1">
                      Core 7 open data:{" "}
                      <span className="font-semibold text-gray-900">
                        {selected.core_open_data_coverage
                          ? `${selected.core_open_data_coverage.templates_with_open_data}/${selected.core_open_data_coverage.templates_total}`
                          : "—"}
                      </span>{" "}
                      ({selected.core_open_data_coverage ? fmtPct(selected.core_open_data_coverage.open_data_ratio) : "—"})
                    </span>
                    <span className="rounded-md bg-gray-100 px-2 py-1">
                      Expanded open data:{" "}
                      <span className="font-semibold text-gray-900">
                        {selected.expanded_dashboard_coverage
                          ? `${selected.expanded_dashboard_coverage.metrics_with_open_data}/${selected.expanded_dashboard_coverage.metrics_total}`
                          : "—"}
                      </span>{" "}
                      ({selected.expanded_dashboard_coverage ? fmtPct(selected.expanded_dashboard_coverage.open_data_ratio) : "—"})
                    </span>
                  </div>

                  {selected.city.main_portal_url && (
                    <div className="mt-3">
                      <a
                        href={selected.city.main_portal_url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-2 text-sm text-purple-700 hover:text-purple-800 underline underline-offset-4"
                      >
                        Open data portal <ExternalLink className="h-4 w-4" />
                      </a>
                    </div>
                  )}
                </div>

                <div>
                  <h3 className="text-sm font-semibold text-gray-900">
                    {mode === "expanded" ? "Expanded dashboard gaps" : "Core 7 completeness gaps"}
                  </h3>
                  <p className="mt-1 text-xs text-gray-500">
                    Items below are considered missing when the report could not find strong open-data evidence for that
                    metric. Use “Suggested keywords” to search the portal, and use the FOIA scope if needed.
                  </p>
                </div>

                <div className="divide-y divide-gray-100 rounded-xl border border-gray-200">
                  {(mode === "expanded"
                    ? (selected.expanded_dashboard_coverage?.dataset_matches ?? []).map((m) => ({
                        key: m.metric_key,
                        label: m.metric_label,
                        group: m.group,
                        keywords: m.keywords,
                        open_data_available: m.open_data_available,
                        best_match: m.best_match,
                        top_matches: m.top_matches,
                      }))
                    : (selected.core_open_data_coverage?.dataset_matches ?? []).map((m) => ({
                        key: m.template_key,
                        label: m.template_name,
                        group: "Core",
                        keywords: [],
                        open_data_available: m.open_data_available,
                        best_match: m.best_match,
                        top_matches: m.top_matches,
                      }))
                  ).map((m) => {
                    const help = TEMPLATE_HELP[m.key]
                    const missing = !m.open_data_available
                    const bestUrl = m.best_match?.url ?? m.best_match?.landing_page_url ?? null
                    const suggestedKeywords =
                      help?.suggestedKeywords?.length
                        ? help.suggestedKeywords
                        : m.keywords?.length
                          ? Array.from(new Set(m.keywords)).slice(0, 14)
                          : []
                    const suggestedScope =
                      help?.suggestedFoiaScope ?? expandedFoiaScope(m.label || m.key, m.group || "Unknown")
                    return (
                      <div key={m.key} className="p-4">
                        <div className="flex items-start justify-between gap-4">
                          <div className="min-w-0">
                            <div className="text-sm font-semibold text-gray-900">
                              {m.label || help?.label || m.key}
                            </div>
                            <div className="mt-1 flex flex-wrap items-center gap-2">
                              <div className="text-xs text-gray-500 font-mono">{m.key}</div>
                              {mode === "expanded" && m.group && (
                                <div className="text-xs text-gray-400">{m.group}</div>
                              )}
                            </div>
                          </div>
                          <div
                            className={[
                              "shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold",
                              missing ? "bg-amber-50 text-amber-800" : "bg-emerald-50 text-emerald-800",
                            ].join(" ")}
                          >
                            {missing ? "Missing" : "Found"}
                          </div>
                        </div>

                        {!missing && m.best_match && (
                          <div className="mt-3 rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm">
                            <div className="font-semibold text-gray-900">Best match</div>
                            <div className="mt-1 text-gray-700">{m.best_match.title ?? "Untitled dataset"}</div>
                            {bestUrl && (
                              <a
                                href={bestUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="mt-2 inline-flex items-center gap-2 text-sm text-purple-700 hover:text-purple-800 underline underline-offset-4"
                              >
                                View dataset <ExternalLink className="h-4 w-4" />
                              </a>
                            )}
                          </div>
                        )}

                        {missing && (
                          <div className="mt-3 grid gap-3 lg:grid-cols-2">
                            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                              <div className="text-xs font-semibold text-amber-900">Suggested keywords</div>
                              <div className="mt-1 text-xs text-amber-900">
                                {suggestedKeywords.length ? (
                                  <div className="flex flex-wrap gap-1.5">
                                    {suggestedKeywords.map((kw) => (
                                      <span key={kw} className="rounded-md bg-white/60 px-2 py-1 border border-amber-200">
                                        {kw}
                                      </span>
                                    ))}
                                  </div>
                                ) : (
                                  <span className="text-amber-800">No suggestions available.</span>
                                )}
                              </div>
                            </div>
                            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                              <div className="text-xs font-semibold text-amber-900">Suggested FOIA scope</div>
                              <div className="mt-1 text-xs text-amber-900">{suggestedScope}</div>
                            </div>
                          </div>
                        )}

                        {/* Show top candidates when missing (helps you see “false friends”). */}
                        {missing && (m.top_matches?.length ?? 0) > 0 && (
                          <div className="mt-3">
                            <div className="text-xs font-semibold text-gray-700">Top candidates (may be wrong)</div>
                            <div className="mt-2 grid gap-2">
                              {m.top_matches.slice(0, 5).map((cand) => {
                                const u = cand.url ?? cand.landing_page_url
                                return (
                                  <div
                                    key={(cand.dataset_id ?? cand.external_id ?? cand.title ?? Math.random()).toString()}
                                    className="flex items-start justify-between gap-3 rounded-lg border border-gray-200 bg-white p-3"
                                  >
                                    <div className="min-w-0">
                                      <div className="text-sm font-semibold text-gray-900 truncate">
                                        {cand.title ?? "Untitled dataset"}
                                      </div>
                                      <div className="mt-1 text-xs text-gray-500">
                                        Score: <span className="font-semibold">{cand.score ?? "—"}</span>
                                      </div>
                                    </div>
                                    {u && (
                                      <a
                                        href={u}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="shrink-0 inline-flex items-center gap-1 rounded-md border border-gray-200 bg-gray-50 px-2 py-1 text-xs text-gray-700 hover:bg-gray-100"
                                      >
                                        Open <ExternalLink className="h-3 w-3" />
                                      </a>
                                    )}
                                  </div>
                                )
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                    )
                  })}

                  {mode === "core7" &&
                    (selected.core_open_data_coverage?.dataset_matches?.length ?? 0) === 0 && (
                      <div className="p-6 text-sm text-gray-500">No core dataset coverage details found in this report.</div>
                    )}

                  {mode === "expanded" &&
                    (selected.expanded_dashboard_coverage?.dataset_matches?.length ?? 0) === 0 && (
                      <div className="p-6 text-sm text-gray-500">
                        No expanded dashboard coverage details found in this report.
                      </div>
                    )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}


"use client"

import { useMemo, useState, useEffect } from "react"
import { FileJson2, Upload, Play, Loader2, ExternalLink, Download, AlertTriangle, RefreshCw } from "lucide-react"
import type { CityReadinessReport, CityReadinessResult } from "@/types/cityReadiness"
import { assessConceptCoverage, getExpectedConcepts } from "@/lib/cityReadinessSchema"

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

type Mode = "core7" | "expanded"

function cityLabel(c: CityReadinessResult) {
  return `${c.city.name}, ${c.city.state}`
}

export function SchemaMatchContent() {
  const [report, setReport] = useState<CityReadinessReport | null>(null)
  const [rawJson, setRawJson] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [mode, setMode] = useState<Mode>("core7")
  const [selectedCityId, setSelectedCityId] = useState<number | null>(null)
  const [probe, setProbe] = useState<Record<string, ProbeResult>>({})
  const [runningAll, setRunningAll] = useState(false)
  const [availableReports, setAvailableReports] = useState<
    Array<{ name: string; generated_at: string | null }>
  >([])
  const [loadingReports, setLoadingReports] = useState(false)
  const [selectedReportName, setSelectedReportName] = useState<string>("")
  const [selectedForReview, setSelectedForReview] = useState<Record<string, boolean>>({})
  const [refining, setRefining] = useState(false)

  const cities = useMemo(() => {
    if (!report) return []
    return [...report.cities].sort((a, b) => cityLabel(a).localeCompare(cityLabel(b)))
  }, [report])

  const selected = useMemo(() => {
    if (!report) return null
    const id = selectedCityId ?? report.cities[0]?.city.id ?? null
    if (!id) return null
    return report.cities.find((c) => c.city.id === id) ?? null
  }, [report, selectedCityId])

  const metricRows = useMemo(() => {
    if (!selected) return []
    if (mode === "expanded") {
      const matches = selected.expanded_dashboard_coverage?.dataset_matches ?? []
      return matches
        .filter((m) => m.open_data_available && m.best_match?.url)
        .map((m) => ({
          key: m.metric_key,
          label: m.metric_label,
          group: m.group,
          dataset: m.best_match!,
        }))
    }
    const matches = selected.core_open_data_coverage?.dataset_matches ?? []
    return matches
      .filter((m) => m.open_data_available && m.best_match?.url)
      .map((m) => ({
        key: m.template_key,
        label: m.template_name,
        group: "Core",
        dataset: m.best_match!,
      }))
  }, [selected, mode])

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
    setProbe({})
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
    setProbe({})
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
      setProbe({})
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
      const columns: string[] = colsRaw
        .map((c) => String(c?.field || c?.name || "").trim())
        .filter(Boolean)
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

  async function runAllForCity() {
    if (!selected) return
    setRunningAll(true)
    try {
      // Run sequentially to avoid hammering external APIs.
      for (const row of metricRows) {
        const k = probeKey(selected.city.id, row.key)
        const existing = probe[k]
        if (existing?.status === "ok") continue
        await runProbe(selected.city.id, row.key, row.label, row.group, row.dataset)
      }
    } finally {
      setRunningAll(false)
    }
  }

  function toggleReview(cityId: number, metricKey: string, datasetId: string) {
    const k = `${cityId}:${metricKey}:${datasetId}`
    setSelectedForReview((prev) => ({ ...prev, [k]: !prev[k] }))
  }

  async function handleRefine() {
    if (!selected) return
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
        // Clear selections for processed items
        const nextSelected = { ...selectedForReview }
        Object.keys(nextSelected).forEach((k) => {
          if (nextSelected[k]) delete nextSelected[k]
        })
        setSelectedForReview(nextSelected)
        
        // Refresh list and load new report
        await refreshAvailableReports()
        // Wait a tick for state to settle
        await new Promise((resolve) => setTimeout(resolve, 100))
        // Auto-select the new report (it should be first in list now)
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

  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-xl border border-gray-200 bg-white p-5">
        <div className="flex items-start justify-between gap-6 flex-wrap">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Load readiness report JSON</h2>
            <p className="mt-1 text-sm text-gray-500">
              This tab probes each matched dataset’s public API (when supported) to pull columns + a recent sample record.
            </p>
            {report?.generated_at && (
              <p className="mt-2 text-xs text-gray-400">
                Loaded report generated at: <span className="font-mono">{report.generated_at}</span>
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={refreshAvailableReports}
              className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
            >
              Refresh server list
            </button>
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700 hover:bg-gray-100">
              <Upload className="h-4 w-4" />
              Choose JSON
              <input
                type="file"
                accept="application/json,.json"
                className="hidden"
                onChange={(e) => onUpload(e.target.files?.[0] ?? null)}
              />
            </label>
          </div>
        </div>

        <div className="mt-4 flex items-center gap-2">
          <select
            value={selectedReportName}
            onChange={(e) => setSelectedReportName(e.target.value)}
            className="flex-1 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:border-purple-400 focus:outline-none focus:ring-1 focus:ring-purple-400"
          >
            <option value="">Select a server report…</option>
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

        <textarea
          value={rawJson}
          onChange={(e) => setRawJson(e.target.value)}
          placeholder='Or paste the JSON (must include a top-level "cities" array)...'
          className="mt-4 h-28 w-full resize-y rounded-lg border border-gray-200 bg-white p-3 text-xs font-mono text-gray-900 placeholder:text-gray-400 focus:border-purple-400 focus:outline-none focus:ring-1 focus:ring-purple-400"
        />
        <button
          onClick={onUsePastedJson}
          className="mt-3 inline-flex items-center gap-2 rounded-lg bg-purple-600 px-3 py-2 text-sm font-semibold text-white hover:bg-purple-700"
        >
          <FileJson2 className="h-4 w-4" />
          Use pasted JSON
        </button>

        {error && (
          <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700">{error}</div>
        )}
      </div>

      {!report ? (
        <div className="rounded-xl border border-gray-200 bg-white px-6 py-12 text-center text-sm text-gray-500">
          Load a readiness report JSON to begin probing dataset schemas.
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
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
                Expanded
              </button>
            </div>

            <div className="mt-4">
              <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide">City</div>
              <select
                value={selected?.city.id ?? ""}
                onChange={(e) => setSelectedCityId(Number(e.target.value))}
                className="mt-2 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:border-purple-400 focus:outline-none focus:ring-1 focus:ring-purple-400"
              >
                {cities.map((c) => (
                  <option key={c.city.id} value={c.city.id}>
                    {cityLabel(c)}
                  </option>
                ))}
              </select>
            </div>

            <button
              onClick={runAllForCity}
              disabled={runningAll || !selected}
              className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-purple-600 px-3 py-2 text-sm font-semibold text-white hover:bg-purple-700 disabled:opacity-60"
            >
              {runningAll ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
              Verify All Matches (Probe)
            </button>

            <button
              onClick={handleRefine}
              disabled={refining || !Object.values(selectedForReview).some(Boolean)}
              className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700 hover:bg-red-100 disabled:opacity-60"
            >
              {refining ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              Redo Selected Matches (Search Web & Regenerate)
            </button>

            <div className="mt-4 text-xs text-gray-500">
              Supported providers: <span className="font-semibold text-gray-700">Socrata</span> and{" "}
              <span className="font-semibold text-gray-700">ArcGIS item URLs</span>.
            </div>
          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-6">
            {!selected ? (
              <div className="text-sm text-gray-500">Select a city.</div>
            ) : metricRows.length === 0 ? (
              <div className="text-sm text-gray-500">
                No “found” datasets to probe for this city/mode (or best matches lack a supported public API link).
              </div>
            ) : (
              <div className="flex flex-col gap-5">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">{cityLabel(selected)}</h3>
                  <p className="mt-1 text-sm text-gray-500">
                    Probes pull: <span className="font-semibold text-gray-700">column names</span> +{" "}
                    <span className="font-semibold text-gray-700">one recent record</span>. We then compare to an expected
                    schema (concepts + synonyms) for each metric.
                  </p>
                </div>

                <div className="divide-y divide-gray-100 rounded-xl border border-gray-200">
                  {metricRows.map((row) => {
                    const k = probeKey(selected.city.id, row.key)
                    const pr = probe[k] ?? { status: "idle" }

                    const expected = getExpectedConcepts(row.key, row.group)
                    const cols = pr.status === "ok" ? pr.columns : []
                    const coverage = cols.length ? assessConceptCoverage(cols, expected) : null
                    const confidencePct = coverage ? Math.round(coverage.ratio * 100) : null
                    
                    const reviewKey = `${selected.city.id}:${row.key}:${row.dataset?.dataset_id}`
                    const isSelectedForReview = selectedForReview[reviewKey] || false

                    return (
                      <div key={row.key} className={`p-4 ${isSelectedForReview ? "bg-red-50" : ""}`}>
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex items-start gap-3 min-w-0">
                            <input
                              type="checkbox"
                              checked={isSelectedForReview}
                              onChange={() => toggleReview(selected.city.id, row.key, row.dataset?.dataset_id)}
                              className="mt-1 h-4 w-4 rounded border-gray-300 text-purple-600 focus:ring-purple-500 cursor-pointer"
                              title="Mark as incorrect match"
                            />
                            <div className="min-w-0">
                              <div className="text-sm font-semibold text-gray-900">{row.label}</div>
                              <div className="mt-1 flex flex-wrap items-center gap-2">
                                <div className="text-xs text-gray-500 font-mono">{row.key}</div>
                                <div className="text-xs text-gray-400">{row.group}</div>
                              </div>
                            {row.dataset?.title && (
                              <div className="mt-2 text-xs text-gray-600">
                                Dataset: <span className="font-semibold">{row.dataset.title}</span>
                              </div>
                            )}
                            {row.dataset?.url && (
                              <a
                                href={row.dataset.url}
                                target="_blank"
                                rel="noreferrer"
                                className="mt-1 inline-flex items-center gap-1 text-xs text-purple-700 hover:text-purple-800 underline underline-offset-4"
                              >
                                Open dataset <ExternalLink className="h-3 w-3" />
                              </a>
                            )}
                          </div>
                        </div>

                        <div className="shrink-0 flex items-center gap-2">
                            {pr.status === "ok" && confidencePct != null && (
                              <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-800">
                                Expected cols: {confidencePct}%
                              </span>
                            )}
                            {pr.status === "error" && (
                              <span className="rounded-full bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-700">
                                Probe failed
                              </span>
                            )}
                            <button
                              onClick={() => runProbe(selected.city.id, row.key, row.label, row.group, row.dataset)}
                              disabled={pr.status === "loading"}
                              className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-60"
                            >
                              {pr.status === "loading" ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <Play className="h-4 w-4" />
                              )}
                              Verify Match
                            </button>
                          </div>
                        </div>

                        {pr.status === "error" && (
                          <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                            {pr.error}
                          </div>
                        )}

                        {pr.status === "ok" && (
                          <div className="mt-4 grid gap-4 lg:grid-cols-2">
                            <div className="rounded-lg border border-gray-200 p-3">
                              <div className="text-xs font-semibold text-gray-700">Expected schema (concepts)</div>
                              <div className="mt-2 space-y-2">
                                {coverage?.conceptFindings.map((f) => (
                                  <div key={f.concept.key} className="flex items-start justify-between gap-3">
                                    <div className="text-xs text-gray-700">{f.concept.label}</div>
                                    <div
                                      className={[
                                        "text-xs font-semibold",
                                        f.ok ? "text-emerald-700" : "text-amber-700",
                                      ].join(" ")}
                                    >
                                      {f.ok ? `OK (${f.matchedColumns.join(", ")})` : "Missing"}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>

                            <div className="rounded-lg border border-gray-200 p-3">
                              <div className="text-xs font-semibold text-gray-700">Columns ({pr.columns.length})</div>
                              <div className="mt-2 max-h-56 overflow-auto text-xs font-mono text-gray-800">
                                {pr.columns.join("\n")}
                              </div>
                            </div>

                            <div className="rounded-lg border border-gray-200 p-3 lg:col-span-2">
                              <div className="text-xs font-semibold text-gray-700">Sample record</div>
                              <div className="mt-2 max-h-64 overflow-auto rounded-md bg-gray-50 p-3 text-xs font-mono text-gray-800">
                                {pr.sample ? JSON.stringify(pr.sample, null, 2) : "No record returned."}
                              </div>
                              {pr.fetchedFrom && (
                                <div className="mt-2 text-xs text-gray-500">
                                  Fetched from: <span className="font-mono">{pr.fetchedFrom}</span>
                                </div>
                              )}
                              <div className="mt-2 text-xs text-gray-400">
                                Note: “expected schema” is concept-based (synonyms), not an exact SF column list.
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}


"use client"

import { useMemo, useState } from "react"
import { useAuth0 } from "@auth0/auth0-react"
import { Download, FileSpreadsheet, Loader2, Settings2 } from "lucide-react"
import {
  exportWasteFindings,
  exportAuditorReport,
  type WasteFinding,
} from "@/lib/apiClient"
import { useLatestPersistedWasteResult } from "@/lib/hooks/useWaste"
import { useWasteCity } from "./WasteCityContext"
import { toast } from "sonner"

type Severity = "critical" | "high" | "medium" | "low"
type Format = "csv" | "json" | "xlsx"

const ALL_CATEGORIES = [
  "payroll",
  "contracts",
  "infrastructure",
  "integrity",
  "influence",
  "confirmed",
] as const
type Category = (typeof ALL_CATEGORIES)[number]

const ALL_SEVERITIES: Severity[] = ["critical", "high", "medium", "low"]

const CATEGORY_LABELS: Record<Category, string> = {
  payroll: "Payroll",
  contracts: "Contracts & Procurement",
  infrastructure: "Infrastructure",
  integrity: "Personnel Integrity",
  influence: "Influence",
  confirmed: "Confirmed Cases",
}

const FINDING_FIELDS: Array<keyof WasteFinding> = [
  "id",
  "category",
  "subcategory",
  "severity",
  "confidence",
  "confidence_score",
  "priority_score",
  "entity",
  "department",
  "metric",
  "metricDetail",
  "amount",
  "estimated_dollar_impact",
  "description",
  "narrative",
  "finding_report",
  "confidence_reason",
  "corroboration_count",
  "data_completeness",
  "caveat",
  "tool",
  "fiscal_year",
  "is_partial_data",
  "is_new",
]

function csvCell(v: unknown): string {
  if (v == null) return ""
  const s = typeof v === "string" ? v : JSON.stringify(v)
  if (/[",\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`
  }
  return s
}

function buildCsv(rows: WasteFinding[]): string {
  const header = FINDING_FIELDS.join(",")
  const body = rows
    .map((r) =>
      FINDING_FIELDS.map((f) =>
        csvCell((r as unknown as Record<string, unknown>)[f as string]),
      ).join(","),
    )
    .join("\n")
  return body ? `${header}\n${body}\n` : `${header}\n`
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

function uniqueDepartments(findings: WasteFinding[]): string[] {
  const set = new Set<string>()
  findings.forEach((f) => {
    if (f.department) set.add(f.department)
  })
  return Array.from(set).sort()
}

export function WasteReportBuilder() {
  const { selectedCityId: cityId, selectedCityName } = useWasteCity()
  const { data: analysis } = useLatestPersistedWasteResult(cityId)
  const { getAccessTokenSilently } = useAuth0()

  const allFindings = useMemo<WasteFinding[]>(
    () => analysis?.findings ?? [],
    [analysis],
  )
  const departments = useMemo(
    () => uniqueDepartments(allFindings),
    [allFindings],
  )

  const [categories, setCategories] = useState<Set<Category>>(
    new Set(ALL_CATEGORIES),
  )
  const [severities, setSeverities] = useState<Set<Severity>>(
    new Set<Severity>(["critical", "high"]),
  )
  const [departmentFilter, setDepartmentFilter] = useState<string>("")
  const [minDollars, setMinDollars] = useState<string>("")
  const [format, setFormat] = useState<Format>("csv")
  const [busy, setBusy] = useState(false)

  const filtered = useMemo(() => {
    const minDollarsNum = minDollars ? Number(minDollars) : null
    return allFindings.filter((f) => {
      if (!categories.has(f.category as Category)) return false
      if (severities.size > 0 && !severities.has(f.severity as Severity)) {
        return false
      }
      if (departmentFilter && f.department !== departmentFilter) return false
      if (
        minDollarsNum != null &&
        (f.estimated_dollar_impact ?? f.amount ?? 0) < minDollarsNum
      ) {
        return false
      }
      return true
    })
  }, [allFindings, categories, severities, departmentFilter, minDollars])

  function toggleCategory(c: Category) {
    setCategories((prev) => {
      const next = new Set(prev)
      next.has(c) ? next.delete(c) : next.add(c)
      return next
    })
  }
  function toggleSeverity(s: Severity) {
    setSeverities((prev) => {
      const next = new Set(prev)
      next.has(s) ? next.delete(s) : next.add(s)
      return next
    })
  }

  const stamp = new Date().toISOString().slice(0, 10)
  const slugCity = (selectedCityName ?? "city")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")

  async function generate() {
    setBusy(true)
    try {
      if (format === "csv") {
        const text = buildCsv(filtered)
        downloadBlob(
          new Blob([text], { type: "text/csv" }),
          `waste-report_${slugCity}_${stamp}.csv`,
        )
        toast.success(`Downloaded ${filtered.length} findings as CSV`)
      } else if (format === "json") {
        const text = JSON.stringify(filtered, null, 2)
        downloadBlob(
          new Blob([text], { type: "application/json" }),
          `waste-report_${slugCity}_${stamp}.json`,
        )
        toast.success(`Downloaded ${filtered.length} findings as JSON`)
      } else {
        const token = await getAccessTokenSilently()
        const onlyOneCategory =
          categories.size === 1 ? Array.from(categories)[0] : "all"
        const blob = await exportAuditorReport(
          token,
          onlyOneCategory,
          cityId ?? undefined,
        )
        downloadBlob(
          blob,
          `auditor-report_${slugCity}_${onlyOneCategory}_${stamp}.xlsx`,
        )
        if (categories.size !== 1 || severities.size !== ALL_SEVERITIES.length) {
          toast.info(
            "Excel export is unfiltered (includes all severities & departments). Use CSV/JSON to apply filters.",
          )
        } else {
          toast.success("Excel auditor report downloaded")
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Export failed"
      toast.error(msg)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-5">
      <div className="flex items-center gap-2 mb-4">
        <Settings2 className="w-4 h-4 text-gray-500" />
        <h2 className="text-sm font-semibold text-gray-700">
          Build a custom report
        </h2>
        <span className="ml-auto text-xs text-gray-500 tabular-nums">
          {filtered.length.toLocaleString()} of{" "}
          {allFindings.length.toLocaleString()} findings selected
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <div>
          <label className="block text-[11px] font-semibold uppercase tracking-wide text-gray-500 mb-1.5">
            Categories
          </label>
          <div className="flex flex-wrap gap-1.5">
            {ALL_CATEGORIES.map((c) => {
              const on = categories.has(c)
              return (
                <button
                  key={c}
                  type="button"
                  onClick={() => toggleCategory(c)}
                  className={
                    "text-xs px-2.5 py-1 rounded-full border transition-colors " +
                    (on
                      ? "bg-purple-50 text-purple-700 border-purple-200"
                      : "bg-white text-gray-600 border-gray-200 hover:border-gray-300")
                  }
                >
                  {CATEGORY_LABELS[c]}
                </button>
              )
            })}
          </div>
        </div>

        <div>
          <label className="block text-[11px] font-semibold uppercase tracking-wide text-gray-500 mb-1.5">
            Severities
          </label>
          <div className="flex flex-wrap gap-1.5">
            {ALL_SEVERITIES.map((s) => {
              const on = severities.has(s)
              return (
                <button
                  key={s}
                  type="button"
                  onClick={() => toggleSeverity(s)}
                  className={
                    "text-xs px-2.5 py-1 rounded-full border capitalize transition-colors " +
                    (on
                      ? "bg-purple-50 text-purple-700 border-purple-200"
                      : "bg-white text-gray-600 border-gray-200 hover:border-gray-300")
                  }
                >
                  {s}
                </button>
              )
            })}
          </div>
        </div>

        <div>
          <label className="block text-[11px] font-semibold uppercase tracking-wide text-gray-500 mb-1.5">
            Department
          </label>
          <select
            value={departmentFilter}
            onChange={(e) => setDepartmentFilter(e.target.value)}
            className="w-full text-sm border border-gray-200 rounded-md px-2 py-1.5 bg-white"
          >
            <option value="">All departments</option>
            {departments.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-[11px] font-semibold uppercase tracking-wide text-gray-500 mb-1.5">
            Minimum estimated $ impact
          </label>
          <input
            type="number"
            inputMode="numeric"
            value={minDollars}
            onChange={(e) => setMinDollars(e.target.value)}
            placeholder="e.g. 25000"
            className="w-full text-sm border border-gray-200 rounded-md px-2 py-1.5 bg-white"
          />
        </div>
      </div>

      <div className="mt-5 pt-4 border-t border-gray-100 flex items-center gap-3 flex-wrap">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">
          Format
        </span>
        <div className="flex items-center gap-1 bg-gray-50 border border-gray-200 rounded-md p-0.5">
          {(["csv", "json", "xlsx"] as Format[]).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFormat(f)}
              className={
                "text-xs px-2.5 py-1 rounded transition-colors uppercase " +
                (format === f
                  ? "bg-white text-gray-900 shadow-sm border border-gray-200"
                  : "text-gray-500 hover:text-gray-800")
              }
            >
              {f === "xlsx" ? "Excel" : f}
            </button>
          ))}
        </div>

        <div className="ml-auto flex items-center gap-2">
          {format === "xlsx" && (
            <span className="text-[11px] text-gray-500">
              Excel uses the auditor template; severity/$ filters are
              CSV/JSON-only for now.
            </span>
          )}
          <button
            onClick={generate}
            disabled={busy || filtered.length === 0}
            className="inline-flex items-center gap-1.5 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-300 text-white text-sm font-medium px-3 py-1.5 rounded-md"
          >
            {busy ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : format === "xlsx" ? (
              <FileSpreadsheet className="w-3.5 h-3.5" />
            ) : (
              <Download className="w-3.5 h-3.5" />
            )}
            Generate report
          </button>
        </div>
      </div>
    </div>
  )
}

// Re-export the simple per-category export buttons for places that just want
// a one-click download (e.g. forensics shell).
export { WasteExport } from "./waste-export"

// Avoid unused-import warnings: exportWasteFindings is reserved for future
// per-category CSV exports that bypass the in-memory filtering path.
void exportWasteFindings

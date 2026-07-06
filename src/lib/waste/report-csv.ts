// Shared CSV/download helpers for waste workpaper reports. Used by both the
// admin report page and the waste module's workpaper page so the export
// columns and the formula-injection guard stay in one place.

import type { WasteAdminReportDetail } from "@/lib/api/wasteAdmin"

export function triggerDownload(
  filename: string,
  mime: string,
  content: string,
) {
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

type ReportFinding = WasteAdminReportDetail["findings"][number]

export const REPORT_CSV_COLUMNS: ReadonlyArray<
  [string, (f: ReportFinding) => unknown]
> = [
  ["finding_id", (f) => f.finding_id],
  ["detector_key", (f) => f.detector_key],
  ["detector_name", (f) => f.detector_name],
  ["category", (f) => f.category],
  ["subcategory", (f) => f.subcategory],
  ["severity", (f) => f.severity],
  ["status", (f) => f.finding_status],
  ["entity_name", (f) => f.entity_name],
  ["department", (f) => f.department],
  ["estimated_dollar_impact", (f) => f.estimated_dollar_impact ?? f.amount],
  ["confidence", (f) => f.confidence],
  ["created_at", (f) => f.created_at],
  ["headline", (f) => f.headline],
  ["description", (f) => f.description],
]

export function csvCell(value: unknown): string {
  if (value == null) return ""
  let s = String(value)
  // Defuse spreadsheet formula injection for text cells (a value like
  // "=cmd()" or "@SUM" would execute on open). Numeric columns come through
  // as numbers, so guarding only string values keeps them intact. Check after
  // trimming leading whitespace so " =cmd()" can't slip past the prefix test.
  if (typeof value === "string" && /^[\s]*[=+\-@\t\r]/.test(s)) {
    s = `'${s}`
  }
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function reportToCsv(report: WasteAdminReportDetail): string {
  const header = REPORT_CSV_COLUMNS.map(([name]) => name).join(",")
  const rows = (report.findings ?? []).map((f) =>
    REPORT_CSV_COLUMNS.map(([, get]) => csvCell(get(f))).join(","),
  )
  return [header, ...rows].join("\r\n")
}

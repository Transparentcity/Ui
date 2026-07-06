import { describe, it, expect } from "vitest"
import { csvCell, reportToCsv, REPORT_CSV_COLUMNS } from "./report-csv"
import type { WasteAdminReportDetail } from "@/lib/api/wasteAdmin"

function makeReport(
  findings: Partial<WasteAdminReportDetail["findings"][number]>[],
): WasteAdminReportDetail {
  return {
    slug: "test-report",
    title: "Test",
    period: "Last 30 days",
    findings_count: findings.length,
    estimated_exposure: 0,
    materiality: null,
    updated_at: null,
    status: "draft",
    blurb: "",
    methodology_md: null,
    caveats_md: null,
    standards_basis: null,
    findings: findings.map((f, i) => ({
      id: i + 1,
      finding_id: `F-${i + 1}`,
      detector_key: "d1",
      detector_name: "Detector",
      category: "Contracts & Procurement",
      subcategory: null,
      severity: "high",
      confidence: "High",
      entity_name: "Vendor",
      department: "DPW",
      description: null,
      headline: null,
      amount: null,
      estimated_dollar_impact: null,
      report_key: null,
      finding_status: "active",
      is_new: false,
      created_at: null,
      ...f,
    })),
  }
}

describe("csvCell", () => {
  it("returns empty string for null and undefined", () => {
    expect(csvCell(null)).toBe("")
    expect(csvCell(undefined)).toBe("")
  })

  it("passes plain values through", () => {
    expect(csvCell("hello")).toBe("hello")
    expect(csvCell(42)).toBe("42")
  })

  it("quotes values containing commas, quotes, or newlines", () => {
    expect(csvCell("a,b")).toBe('"a,b"')
    expect(csvCell('say "hi"')).toBe('"say ""hi"""')
    expect(csvCell("line1\nline2")).toBe('"line1\nline2"')
  })

  it("defuses spreadsheet formula injection, including padded prefixes", () => {
    expect(csvCell("=cmd()")).toBe("'=cmd()")
    expect(csvCell("@SUM(A1)")).toBe("'@SUM(A1)")
    expect(csvCell("+1+1")).toBe("'+1+1")
    expect(csvCell(" =cmd()")).toBe("' =cmd()")
  })

  it("does not mangle negative numbers (numeric, not string)", () => {
    expect(csvCell(-500)).toBe("-500")
  })
})

describe("reportToCsv", () => {
  it("emits a header row matching the column spec", () => {
    const csv = reportToCsv(makeReport([]))
    expect(csv.split("\r\n")[0]).toBe(
      REPORT_CSV_COLUMNS.map(([name]) => name).join(","),
    )
  })

  it("emits one row per finding with escaped cells", () => {
    const csv = reportToCsv(
      makeReport([
        { entity_name: "Acme, Inc.", headline: "=HYPERLINK(evil)" },
      ]),
    )
    const rows = csv.split("\r\n")
    expect(rows).toHaveLength(2)
    expect(rows[1]).toContain('"Acme, Inc."')
    expect(rows[1]).toContain("'=HYPERLINK(evil)")
  })

  it("prefers estimated_dollar_impact over amount", () => {
    const csv = reportToCsv(
      makeReport([{ amount: 100, estimated_dollar_impact: 900 }]),
    )
    const impactIdx = REPORT_CSV_COLUMNS.findIndex(
      ([name]) => name === "estimated_dollar_impact",
    )
    expect(csv.split("\r\n")[1].split(",")[impactIdx]).toBe("900")
  })

  it("tolerates a report body with findings missing", () => {
    const report = makeReport([])
    // Simulate a backend response that omits the array entirely.
    ;(report as { findings?: unknown }).findings = undefined
    expect(reportToCsv(report).split("\r\n")).toHaveLength(1)
  })
})

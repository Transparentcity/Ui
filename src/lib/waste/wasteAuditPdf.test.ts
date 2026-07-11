import { describe, it, expect } from "vitest"
import { generateWasteAuditPdf, type WasteAuditPdfFinding } from "./wasteAuditPdf"

function f(o: Partial<WasteAuditPdfFinding> = {}): WasteAuditPdfFinding {
  return {
    category: "Payroll & Personnel",
    severity: "critical",
    entity: "Fire Department",
    department: "Fire Department",
    metric: "$2M overtime",
    metricDetail: "above peer median",
    amount: 2_000_000,
    estimated_dollar_impact: 6_000_000,
    confidence: "High",
    ...o,
  }
}

async function firstBytes(blob: Blob, n = 5): Promise<string> {
  const buf = new Uint8Array(await blob.arrayBuffer())
  return String.fromCharCode(...Array.from(buf.slice(0, n)))
}

const base = {
  cityName: "San Francisco",
  generatedAt: new Date("2026-07-11T12:00:00Z"),
}

describe("generateWasteAuditPdf", () => {
  it("produces a non-trivial PDF blob", async () => {
    const blob = generateWasteAuditPdf({
      ...base,
      findings: [f(), f({ severity: "high", category: "Contracts & Procurement" })],
      analysisRunAt: "2026-07-09T00:00:00Z",
      totalFindingsAvailable: 12,
    })
    expect(blob.type).toContain("pdf")
    expect(await firstBytes(blob)).toBe("%PDF-")
    expect(blob.size).toBeGreaterThan(1000)
  })

  it("handles an empty finding set without throwing", async () => {
    const blob = generateWasteAuditPdf({ ...base, findings: [] })
    expect(await firstBytes(blob)).toBe("%PDF-")
  })

  it("stays valid when findings exceed maxFindingRows (truncation path)", async () => {
    const many = Array.from({ length: 25 }, (_, i) =>
      f({ estimated_dollar_impact: i * 1000, severity: i % 2 ? "high" : "medium" }),
    )
    const blob = generateWasteAuditPdf({ ...base, findings: many, maxFindingRows: 5 })
    expect(await firstBytes(blob)).toBe("%PDF-")
    expect(blob.size).toBeGreaterThan(1000)
  })

  it("uses caller-supplied category label/normalize hooks", async () => {
    let labelCalls = 0
    const blob = generateWasteAuditPdf({
      ...base,
      findings: [f({ category: "weird_raw_key" })],
      categoryLabel: () => {
        labelCalls += 1
        return "Custom Label"
      },
      normalizeCategory: () => "custom",
    })
    expect(labelCalls).toBeGreaterThan(0)
    expect(await firstBytes(blob)).toBe("%PDF-")
  })
})

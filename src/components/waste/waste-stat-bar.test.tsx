import { render, screen } from "@testing-library/react"
import { describe, it, expect } from "vitest"
import { WasteStatBar } from "./waste-stat-bar"
import type { WasteSummaryResponse } from "@/lib/apiClient"

function makeSummary(overrides: Partial<WasteSummaryResponse> = {}): WasteSummaryResponse {
  return {
    total_findings: 42,
    critical_count: 7,
    estimated_exposure: 3500000,
    net_exposure: 2800000,
    gross_exposure: 4200000,
    departments_affected: 12,
    ...overrides,
  } as WasteSummaryResponse
}

describe("WasteStatBar", () => {
  // ── Loading ─────────────────────────────────────────────────────────────

  it("shows loading skeletons when isLoading is true", () => {
    const { container } = render(
      <WasteStatBar summary={undefined} isLoading={true} />
    )
    expect(container.querySelectorAll(".animate-pulse").length).toBe(4)
  })

  it("does not show loading skeletons when isLoading is false", () => {
    const { container } = render(
      <WasteStatBar summary={makeSummary()} isLoading={false} />
    )
    expect(container.querySelectorAll(".animate-pulse").length).toBe(0)
  })

  // ── Stat values ─────────────────────────────────────────────────────────

  it("renders total findings count", () => {
    render(<WasteStatBar summary={makeSummary({ total_findings: 42 })} isLoading={false} />)
    expect(screen.getByText("42")).toBeInTheDocument()
    expect(screen.getByText("Total Findings")).toBeInTheDocument()
  })

  it("renders critical count", () => {
    render(<WasteStatBar summary={makeSummary({ critical_count: 7 })} isLoading={false} />)
    expect(screen.getByText("7")).toBeInTheDocument()
    expect(screen.getByText("Critical")).toBeInTheDocument()
  })

  it("renders departments affected", () => {
    render(<WasteStatBar summary={makeSummary({ departments_affected: 12 })} isLoading={false} />)
    expect(screen.getByText("12")).toBeInTheDocument()
    expect(screen.getByText("Depts Affected")).toBeInTheDocument()
  })

  // ── Exposure dedup display ────────────────────────────────────────────

  it("shows net_exposure as primary when both net and gross are present", () => {
    render(
      <WasteStatBar
        summary={makeSummary({ net_exposure: 2800000, gross_exposure: 4200000 })}
        isLoading={false}
      />
    )
    expect(screen.getByText("$2.8M")).toBeInTheDocument()
  })

  it("shows 'de-duplicated from $X gross' subtext when both values present", () => {
    render(
      <WasteStatBar
        summary={makeSummary({ net_exposure: 2800000, gross_exposure: 4200000 })}
        isLoading={false}
      />
    )
    expect(screen.getByText("de-duplicated from $4.2M gross")).toBeInTheDocument()
  })

  it("shows 'in questionable patterns' when gross_exposure is null", () => {
    render(
      <WasteStatBar
        summary={makeSummary({ net_exposure: null as any, gross_exposure: null as any, estimated_exposure: 3500000 })}
        isLoading={false}
      />
    )
    expect(screen.getByText("in questionable patterns")).toBeInTheDocument()
  })

  it("falls back to estimated_exposure when net_exposure is null", () => {
    render(
      <WasteStatBar
        summary={makeSummary({ net_exposure: null as any, gross_exposure: null as any, estimated_exposure: 3500000 })}
        isLoading={false}
      />
    )
    expect(screen.getByText("$3.5M")).toBeInTheDocument()
  })

  it("shows $0 when exposure is null/undefined", () => {
    render(
      <WasteStatBar
        summary={makeSummary({ net_exposure: null as any, gross_exposure: null as any, estimated_exposure: null as any })}
        isLoading={false}
      />
    )
    expect(screen.getByText("$0")).toBeInTheDocument()
  })

  // ── Defaults for undefined summary ────────────────────────────────────

  it("shows 0 for all counts when summary is undefined", () => {
    render(<WasteStatBar summary={undefined} isLoading={false} />)
    // All counts default to 0
    const zeros = screen.getAllByText("0")
    expect(zeros.length).toBeGreaterThanOrEqual(3) // total, critical, depts
  })
})

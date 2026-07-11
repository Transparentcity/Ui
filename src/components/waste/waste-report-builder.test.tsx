import { render, screen } from "@testing-library/react"
import { vi, describe, it, expect, beforeEach } from "vitest"
import { WasteReportBuilder } from "./waste-report-builder"
import { makeFinding } from "./test-utils"

vi.mock("./WasteCityContext", () => ({
  useWasteCity: () => ({ selectedCityId: 1, selectedCityName: "San Francisco" }),
}))

const useLatestPersistedWasteResult = vi.fn()
vi.mock("@/lib/hooks/useWaste", () => ({
  useLatestPersistedWasteResult: () => useLatestPersistedWasteResult(),
}))

vi.mock("@auth0/auth0-react", () => ({
  useAuth0: () => ({ getAccessTokenSilently: vi.fn() }),
}))

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}))

describe("WasteReportBuilder", () => {
  beforeEach(() => vi.clearAllMocks())

  it("counts findings that carry a display-form category (not just normalized keys)", () => {
    // Findings arrive with display-form categories ("Payroll & Personnel");
    // the filter set holds normalized keys ("payroll"). The builder must
    // normalize before matching, or every finding is excluded → 0 selected.
    useLatestPersistedWasteResult.mockReturnValue({
      data: {
        findings: [
          makeFinding({ id: "1", category: "Payroll & Personnel", severity: "critical", department: "Fire Dept" }),
          makeFinding({ id: "2", category: "Contracts & Procurement", severity: "high", department: "DPW" }),
          makeFinding({ id: "3", category: "Payroll & Personnel", severity: "low", department: "Fire Dept" }),
        ],
      },
    })
    render(<WasteReportBuilder />)

    // Default filters (all categories, critical+high) select findings 1 & 2.
    expect(screen.getByText(/2 of 3 findings selected/)).toBeInTheDocument()
    expect(
      screen.getByRole("button", { name: /Generate report/i }),
    ).not.toBeDisabled()
  })

  it("offers a PDF export format alongside CSV/JSON/Excel", () => {
    useLatestPersistedWasteResult.mockReturnValue({
      data: {
        findings: [
          makeFinding({ id: "1", category: "Payroll & Personnel", severity: "critical" }),
        ],
      },
    })
    render(<WasteReportBuilder />)

    expect(screen.getByRole("button", { name: /^pdf$/i })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /^csv$/i })).toBeInTheDocument()
  })

  it("disables Generate and explains why when no findings match the filters", () => {
    // All findings are below the default severity floor (critical/high).
    useLatestPersistedWasteResult.mockReturnValue({
      data: {
        findings: [
          makeFinding({ id: "1", category: "Payroll & Personnel", severity: "low", department: "Fire Dept" }),
          makeFinding({ id: "2", category: "Payroll & Personnel", severity: "medium", department: "Fire Dept" }),
        ],
      },
    })
    render(<WasteReportBuilder />)

    expect(screen.getByText(/0 of 2 findings selected/)).toBeInTheDocument()
    expect(
      screen.getByRole("button", { name: /Generate report/i }),
    ).toBeDisabled()
    expect(
      screen.getByText(/No findings match these filters/),
    ).toBeInTheDocument()
  })
})

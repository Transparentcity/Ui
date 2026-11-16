import { render, screen } from "@testing-library/react"
import { vi, describe, it, expect, beforeEach } from "vitest"
import { ForensicsCategoriesPage } from "./forensics-categories-page"

/* eslint-disable @typescript-eslint/no-explicit-any */
vi.mock("./waste-shell", () => ({
  WasteShell: ({ children }: any) => <div>{children}</div>,
}))
vi.mock("./forensics-shell", () => ({
  ForensicsShell: ({ children, title }: any) => (
    <div>
      {title}
      {children}
    </div>
  ),
}))
vi.mock("./waste-refresh-panel", () => ({
  WasteRefreshPanel: () => <div data-testid="refresh-panel" />,
}))
vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: any) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}))
/* eslint-enable @typescript-eslint/no-explicit-any */

vi.mock("./WasteCityContext", () => ({
  useWasteCity: () => ({
    selectedCityId: 57260,
    selectedCityName: "San Francisco",
  }),
}))

const useLatestPersistedWasteResult = vi.fn()
vi.mock("@/lib/hooks/useWaste", () => ({
  useLatestPersistedWasteResult: (cityId: number | null) =>
    useLatestPersistedWasteResult(cityId),
}))

const useWasteKeyMetrics = vi.fn()
vi.mock("@/lib/hooks/useWasteKeyMetrics", () => ({
  useWasteKeyMetrics: (cityId: number | null) => useWasteKeyMetrics(cityId),
  formatWasteMetricValue: (v: number | null) => (v == null ? "—" : `${v}%`),
}))

describe("ForensicsCategoriesPage", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useWasteKeyMetrics.mockReturnValue({
      byCategory: {},
      isLoading: false,
      valuesLoading: false,
    })
  })

  it("shows the first-run empty state with the refresh panel when no runs exist", () => {
    // null data = no completed runs, distinct from "runs exist, zero findings"
    useLatestPersistedWasteResult.mockReturnValue({
      data: null,
      isLoading: false,
    })
    render(<ForensicsCategoriesPage />)
    expect(
      screen.getByText(/No analysis has run for San Francisco yet/),
    ).toBeInTheDocument()
    expect(screen.getByTestId("refresh-panel")).toBeInTheDocument()
    expect(screen.queryByText("Payroll and overtime")).not.toBeInTheDocument()
  })

  it("shows the category grid when a run exists, even with zero findings", () => {
    useLatestPersistedWasteResult.mockReturnValue({
      data: { findings: [] },
      isLoading: false,
    })
    render(<ForensicsCategoriesPage />)
    expect(screen.getByText("Payroll and overtime")).toBeInTheDocument()
    expect(
      screen.queryByText(/No analysis has run/),
    ).not.toBeInTheDocument()
  })

  it("counts findings into category cards with flattened detail links", () => {
    useLatestPersistedWasteResult.mockReturnValue({
      data: {
        findings: [
          { id: "c1", category: "Contracts & Procurement", severity: "high", amount: 100 },
          { id: "c2", category: "Contracts & Procurement", severity: "low", amount: 50 },
        ],
      },
      isLoading: false,
    })
    render(<ForensicsCategoriesPage />)
    const card = screen
      .getByText("Contracts and purchasing")
      .closest("a") as HTMLAnchorElement
    expect(card).toHaveAttribute("href", "/waste/categories/contracts")
    expect(screen.getByTestId("total-count-contracts").textContent).toContain("2")
  })

  it("leads with a ranked shortlist and counts lead tiers per area", () => {
    useLatestPersistedWasteResult.mockReturnValue({
      data: {
        findings: [
          // Direct evidence on a named vendor: a strong lead.
          {
            id: "lead1",
            category: "Contracts & Procurement",
            severity: "high",
            amount: 187_087,
            tool: "D8b Threshold-Hugging Vendor",
            entity: "HABITAT POTENTIAL (Recreation And Park)",
            department: "Recreation And Park",
            description: "19 orders priced just under the limit.",
            caveat: "Many small jobs can each be legitimate.",
          },
          // A contract grown by add-ons: worth a look.
          {
            id: "look1",
            category: "Contracts & Procurement",
            severity: "high",
            amount: 5_000_000,
            tool: "D25 Contract Growth After Award",
            entity: "ACME CORP (DPW)",
            department: "DPW",
            description: "Grown to six times its award.",
          },
          // $197M department-level budget statistic: background only.
          {
            id: "ctx1",
            category: "Infrastructure & Services",
            severity: "critical",
            amount: 197_000_000,
            tool: "D5 Budget Variance",
            entity: "Risk Management",
            department: "Risk Management",
            description: "Exceeded budget by 7387%.",
          },
          // Police overtime: real, and already public.
          {
            id: "known1",
            category: "Payroll & Compensation",
            severity: "high",
            amount: 9_000_000,
            tool: "D6 Hours Feasibility (Hard Cap)",
            entity: "Police",
            department: "Police",
            description: "Hours beyond what a week holds.",
          },
        ],
      },
      isLoading: false,
    })
    render(<ForensicsCategoriesPage />)

    const rows = screen.getAllByTestId("top-lead-row")
    // Strong lead first, the bigger-dollar no-bid award second; the $197M
    // budget statistic and the already-public overtime are not in the list.
    expect(rows).toHaveLength(2)
    expect(rows[0].textContent).toContain("HABITAT POTENTIAL")
    expect(rows[0].textContent).toContain("Strong lead")
    expect(rows[1].textContent).toContain("ACME CORP")
    expect(rows[1].textContent).toContain("Worth a look")
    expect(screen.getByTestId("top-leads-known").textContent).toContain(
      "1 more finding matches cases that are already public",
    )

    expect(screen.getByTestId("lead-count-contracts").textContent).toContain("1")
    expect(screen.getByTestId("review-count-contracts").textContent).toContain("1")
    expect(screen.getByTestId("lead-count-infrastructure").textContent).toContain("0")
  })

  it("expands a lead to show the record, the innocent explanation and a link", async () => {
    const { fireEvent } = await import("@testing-library/react")
    useLatestPersistedWasteResult.mockReturnValue({
      data: {
        findings: [
          {
            id: "THV-0001",
            category: "Contracts & Procurement",
            severity: "high",
            amount: 187_087,
            tool: "D8b Threshold-Hugging Vendor",
            entity: "HABITAT POTENTIAL (Recreation And Park)",
            department: "Recreation And Park",
            description: "19 orders priced just under the limit.",
            caveat: "Many small jobs can each be legitimate.",
          },
        ],
      },
      isLoading: false,
    })
    render(<ForensicsCategoriesPage />)
    fireEvent.click(screen.getByRole("button", { name: /HABITAT POTENTIAL/ }))
    const detail = screen.getByTestId("top-lead-detail")
    expect(detail.textContent).toContain("19 orders priced just under the limit.")
    expect(detail.textContent).toContain("What could explain it:")
    expect(detail.textContent).toContain("Names a specific payee")
    expect(detail.querySelector("a")).toHaveAttribute(
      "href",
      "/waste/categories/contracts?finding=THV-0001",
    )
  })

  it("shows skeletons while loading", () => {
    useLatestPersistedWasteResult.mockReturnValue({
      data: undefined,
      isLoading: true,
    })
    const { container } = render(<ForensicsCategoriesPage />)
    expect(container.querySelectorAll(".animate-pulse").length).toBeGreaterThan(0)
  })
})

describe("ForensicsCategoriesPage headline metrics", () => {
  it("shows the first valued key metric on its category card", () => {
    useLatestPersistedWasteResult.mockReturnValue({
      data: { findings: [] },
      isLoading: false,
    })
    useWasteKeyMetrics.mockReturnValue({
      byCategory: {
        payroll: [
          {
            id: 634,
            metricKey: "overtime-share",
            name: "Overtime Share of Regular Pay",
            subcategory: "payroll",
            value: 11.8,
            trend: { pct: 1.2, dir: "up" },
            status: "completed",
          },
        ],
      },
      isLoading: false,
      valuesLoading: false,
    })
    render(<ForensicsCategoriesPage />)
    const headline = screen.getByTestId("headline-metric-payroll")
    expect(headline.textContent).toContain("Overtime Share of Regular Pay")
    expect(headline.textContent).toContain("11.8%")
    // Categories without valued metrics render no headline line.
    expect(
      screen.queryByTestId("headline-metric-contracts"),
    ).not.toBeInTheDocument()
  })
})

describe("ForensicsCategoriesPage error handling", () => {
  beforeEach(() => {
    useWasteKeyMetrics.mockReturnValue({
      byCategory: {},
      isLoading: false,
      valuesLoading: false,
    })
  })

  it("shows an error (not the first-run empty state) when the query fails", () => {
    useLatestPersistedWasteResult.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: new Error("500 from runs endpoint"),
    })
    render(<ForensicsCategoriesPage />)
    expect(
      screen.getByText(/Couldn't load findings for San Francisco/),
    ).toBeInTheDocument()
    // Must NOT invite the operator to run an unnecessary refresh.
    expect(screen.queryByText(/No analysis has run/)).not.toBeInTheDocument()
    expect(screen.queryByTestId("refresh-panel")).not.toBeInTheDocument()
  })

  it("notes once when key metrics fail to load, without hiding findings", () => {
    useWasteKeyMetrics.mockReturnValue({
      byCategory: {},
      isLoading: false,
      isError: true,
      valuesLoading: false,
    })
    useLatestPersistedWasteResult.mockReturnValue({
      data: { findings: [] },
      isLoading: false,
    })
    render(<ForensicsCategoriesPage />)
    expect(screen.getAllByTestId("key-metrics-error")).toHaveLength(1)
    expect(screen.getByText("Payroll and overtime")).toBeInTheDocument()
  })
})

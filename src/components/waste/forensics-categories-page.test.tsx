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
    expect(screen.queryByText("Payroll & Personnel")).not.toBeInTheDocument()
  })

  it("shows the category grid when a run exists, even with zero findings", () => {
    useLatestPersistedWasteResult.mockReturnValue({
      data: { findings: [] },
      isLoading: false,
    })
    render(<ForensicsCategoriesPage />)
    expect(screen.getByText("Payroll & Personnel")).toBeInTheDocument()
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
      .getByText("Contracts & Procurement")
      .closest("a") as HTMLAnchorElement
    expect(card).toHaveAttribute("href", "/waste/categories/contracts")
    expect(card.textContent).toContain("2")
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
})

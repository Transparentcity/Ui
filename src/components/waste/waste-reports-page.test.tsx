import { render, screen } from "@testing-library/react"
import { vi, describe, it, expect, beforeEach } from "vitest"
import { WasteReportsPage } from "./waste-reports-page"

/* eslint-disable @typescript-eslint/no-explicit-any */
vi.mock("./waste-shell", () => ({
  WasteShell: ({ children }: any) => <div>{children}</div>,
}))
vi.mock("./forensics-shell", () => ({
  ForensicsShell: ({ children }: any) => <div>{children}</div>,
}))
vi.mock("./waste-report-builder", () => ({
  WasteReportBuilder: () => <div data-testid="report-builder" />,
}))
vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: any) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}))
/* eslint-enable @typescript-eslint/no-explicit-any */

const useWasteCity = vi.fn()
vi.mock("./WasteCityContext", () => ({
  useWasteCity: () => useWasteCity(),
}))

const useWasteAdminReports = vi.fn()
vi.mock("@/lib/hooks/useWasteAdmin", () => ({
  useWasteAdminReports: (slug: string | null) => useWasteAdminReports(slug),
}))

const CITY_OK = {
  selectedCitySlug: "san-francisco",
  isLoading: false,
  cityLoadError: null,
}

const REPORT_ROW = {
  slug: "fy26-q3-vendor-procurement",
  title: "Vendor & Procurement Integrity",
  period: "Last 30 days",
  findings_count: 12,
  estimated_exposure: 1_200_000,
  materiality: null,
  updated_at: "2026-07-01T00:00:00Z",
  status: "draft",
}

describe("WasteReportsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useWasteCity.mockReturnValue(CITY_OK)
    useWasteAdminReports.mockReturnValue({
      data: [REPORT_ROW],
      isLoading: false,
      error: null,
    })
  })

  it("renders the builder and a workpaper row linking to the detail page", () => {
    render(<WasteReportsPage />)
    expect(screen.getByTestId("report-builder")).toBeInTheDocument()
    const link = screen.getByText("Vendor & Procurement Integrity")
    expect(link.closest("a")).toHaveAttribute(
      "href",
      "/waste/reports/fy26-q3-vendor-procurement",
    )
  })

  it("shows a skeleton (not the empty state) while the city list loads", () => {
    useWasteCity.mockReturnValue({
      selectedCitySlug: null,
      isLoading: true,
      cityLoadError: null,
    })
    // Disabled query: isLoading is false in TanStack v5 — the page must not
    // interpret that as "no workpapers".
    useWasteAdminReports.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: null,
    })
    render(<WasteReportsPage />)
    expect(screen.queryByText(/No workpapers yet/)).not.toBeInTheDocument()
  })

  it("shows the city error instead of the empty state when the city list fails", () => {
    useWasteCity.mockReturnValue({
      selectedCitySlug: null,
      isLoading: false,
      cityLoadError: new Error("403 Forbidden"),
    })
    useWasteAdminReports.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: null,
    })
    render(<WasteReportsPage />)
    expect(
      screen.getByText(/Couldn't load the city list: 403 Forbidden/),
    ).toBeInTheDocument()
    expect(screen.queryByText(/No workpapers yet/)).not.toBeInTheDocument()
  })

  it("shows the genuine empty state once the city resolved and there are no rows", () => {
    useWasteAdminReports.mockReturnValue({
      data: [],
      isLoading: false,
      error: null,
    })
    render(<WasteReportsPage />)
    expect(screen.getByText(/No workpapers yet for this city/)).toBeInTheDocument()
  })

  it("shows the reports error when the reports query fails", () => {
    useWasteAdminReports.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: new Error("boom"),
    })
    render(<WasteReportsPage />)
    expect(screen.getByText(/Couldn't load workpapers/)).toBeInTheDocument()
  })
})

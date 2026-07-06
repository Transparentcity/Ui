import { render, screen } from "@testing-library/react"
import { vi, describe, it, expect, beforeEach } from "vitest"
import { WasteWorkpaperPage } from "./waste-workpaper-page"

/* eslint-disable @typescript-eslint/no-explicit-any */
vi.mock("./waste-shell", () => ({
  WasteShell: ({ children }: any) => <div>{children}</div>,
}))
vi.mock("./forensics-shell", () => ({
  ForensicsShell: ({ children }: any) => <div>{children}</div>,
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

const useWasteAdminReport = vi.fn()
vi.mock("@/lib/hooks/useWasteAdmin", () => ({
  useWasteAdminReport: (slug: string | null, city: string | null) =>
    useWasteAdminReport(slug, city),
}))

const CITY_OK = {
  selectedCitySlug: "chicago",
  isLoading: false,
  cityLoadError: null,
}

const DETAIL = {
  slug: "fy26-q3-vendor-procurement",
  title: "Vendor & Procurement Integrity",
  period: "Last 30 days",
  findings_count: 1,
  estimated_exposure: 900,
  materiality: null,
  updated_at: "2026-07-01T00:00:00Z",
  status: "final",
  blurb: "",
  methodology_md: "We compare vendor payment velocity to peers.",
  caveats_md: "Partial-year data.",
  standards_basis: "GAGAS",
  findings: [
    {
      id: 1,
      finding_id: "F-1",
      detector_key: "vendor_d1",
      detector_name: "Vendor concentration",
      category: "Contracts & Procurement",
      subcategory: null,
      severity: "high",
      confidence: "High",
      entity_name: "Acme",
      department: "DPW",
      description: "Acme received 80% of category spend.",
      headline: null,
      amount: 900,
      estimated_dollar_impact: 900,
      report_key: null,
      finding_status: "active",
      is_new: false,
      created_at: null,
    },
  ],
}

describe("WasteWorkpaperPage", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useWasteCity.mockReturnValue(CITY_OK)
    useWasteAdminReport.mockReturnValue({
      data: DETAIL,
      isLoading: false,
      error: null,
    })
  })

  it("renders the workpaper header, methodology, and findings", () => {
    render(<WasteWorkpaperPage slug="fy26-q3-vendor-procurement" />)
    expect(
      screen.getByText("Vendor & Procurement Integrity"),
    ).toBeInTheDocument()
    expect(screen.getByText("GAGAS")).toBeInTheDocument()
    expect(
      screen.getByText(/vendor payment velocity/),
    ).toBeInTheDocument()
    expect(screen.getByText(/80% of category spend/)).toBeInTheDocument()
  })

  it("shows an error (not an infinite skeleton) when the city can't be resolved", () => {
    useWasteCity.mockReturnValue({
      selectedCitySlug: null,
      isLoading: false,
      cityLoadError: null,
    })
    useWasteAdminReport.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: null,
    })
    render(<WasteWorkpaperPage slug="whatever" />)
    expect(
      screen.getByText(/selected city isn't available/),
    ).toBeInTheDocument()
  })

  it("shows a not-found message for a 404", () => {
    const err = Object.assign(new Error("not found"), { status: 404 })
    useWasteAdminReport.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: err,
    })
    render(<WasteWorkpaperPage slug="gone-report" />)
    expect(screen.getByText(/No workpaper named "gone-report"/)).toBeInTheDocument()
  })
})

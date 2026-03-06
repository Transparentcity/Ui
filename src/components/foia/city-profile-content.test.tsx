/**
 * Tests for the FOIA City Profile page:
 * - Loading state
 * - Profile display
 * - Department CRUD
 * - ConfirmDialog for department deletion
 * - toast() calls instead of alert()
 * - aria-label on Delete department button
 */
import { render, screen, fireEvent, waitFor } from "@testing-library/react"
import { vi, describe, it, expect, beforeEach } from "vitest"

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockGetCityFoiaProfile = vi.fn()
const mockGetCityDatasetTargets = vi.fn()
const mockListAdminCityDepartments = vi.fn()
const mockGetCityFoiaMetrics = vi.fn()
const mockDeleteCityDepartment = vi.fn()
const mockCreateCityDepartment = vi.fn()

vi.mock("@/lib/foiaApiClient", () => ({
  getCityFoiaProfile: (...args: unknown[]) => mockGetCityFoiaProfile(...args),
  updateCityFoiaProfile: vi.fn().mockResolvedValue({}),
  getCityDatasetTargets: (...args: unknown[]) => mockGetCityDatasetTargets(...args),
  getCityFoiaMetrics: (...args: unknown[]) => mockGetCityFoiaMetrics(...args),
  listAdminCityDepartments: (...args: unknown[]) => mockListAdminCityDepartments(...args),
  createCityDepartment: (...args: unknown[]) => mockCreateCityDepartment(...args),
  updateCityDepartment: vi.fn().mockResolvedValue({}),
  deleteCityDepartment: (...args: unknown[]) => mockDeleteCityDepartment(...args),
}))

vi.mock("next/link", () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}))

import { CityProfileContent } from "./city-profile-content"

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeProfile(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    city_id: 42,
    city: { name: "Oakland", state: "CA" },
    submission_method: "email",
    contact_name: "Jane Doe",
    contact_email: "foia@oakland.gov",
    contact_phone: "(510) 555-1234",
    portal_url: "https://oakland.nextrequest.com",
    statute_name: "CPRA",
    default_response_days: 10,
    observed_ack_latency_days: 3,
    common_deflections: ["too broad", "fee required"],
    notes: "Generally responsive",
    ...overrides,
  }
}

function makeDepartment(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    city_id: 42,
    name: "Police Department",
    portal_routing_key: "OPD",
    contact_email: "opd@oakland.gov",
    contact_phone: null,
    notes: null,
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("CityProfileContent", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetCityFoiaProfile.mockResolvedValue(makeProfile())
    mockGetCityDatasetTargets.mockResolvedValue([])
    mockListAdminCityDepartments.mockResolvedValue([])
    mockGetCityFoiaMetrics.mockResolvedValue({})
  })

  it("shows loading spinner while data is being fetched", () => {
    mockGetCityFoiaProfile.mockReturnValue(new Promise(() => {}))
    render(<CityProfileContent cityId="42" />)
    const spinner = document.querySelector(".animate-spin")
    expect(spinner).toBeInTheDocument()
  })

  it("renders city name in header after loading", async () => {
    render(<CityProfileContent cityId="42" />)
    await waitFor(() => {
      expect(screen.getByText("Oakland, CA FOIA Profile")).toBeInTheDocument()
    })
  })

  it("renders profile details", async () => {
    render(<CityProfileContent cityId="42" />)
    await waitFor(() => {
      expect(screen.getByText("Jane Doe")).toBeInTheDocument()
    })
    expect(screen.getByText("foia@oakland.gov")).toBeInTheDocument()
    expect(screen.getByText("CPRA")).toBeInTheDocument()
  })

  it("shows departments list", async () => {
    mockListAdminCityDepartments.mockResolvedValue([makeDepartment()])
    render(<CityProfileContent cityId="42" />)
    await waitFor(() => {
      expect(screen.getByText("Police Department")).toBeInTheDocument()
    })
    expect(screen.getByText("Departments (1)")).toBeInTheDocument()
  })

  it("shows empty departments message when none exist", async () => {
    render(<CityProfileContent cityId="42" />)
    await waitFor(() => {
      expect(screen.getByText(/No departments configured/)).toBeInTheDocument()
    })
  })

  // -------------------------------------------------------------------------
  // Delete department — ConfirmDialog
  // -------------------------------------------------------------------------

  it("opens confirm dialog when Delete department is clicked", async () => {
    mockListAdminCityDepartments.mockResolvedValue([makeDepartment({ id: 5 })])
    render(<CityProfileContent cityId="42" />)
    await waitFor(() => {
      expect(screen.getByText("Police Department")).toBeInTheDocument()
    })

    fireEvent.click(screen.getByLabelText("Delete department"))

    await waitFor(() => {
      expect(screen.getByText("Delete department")).toBeInTheDocument()
      expect(screen.getByText(/permanently removed/)).toBeInTheDocument()
    })
  })

  it("calls deleteCityDepartment when confirm dialog is confirmed", async () => {
    mockListAdminCityDepartments.mockResolvedValue([makeDepartment({ id: 5 })])
    mockDeleteCityDepartment.mockResolvedValue(undefined)
    render(<CityProfileContent cityId="42" />)
    await waitFor(() => {
      expect(screen.getByText("Police Department")).toBeInTheDocument()
    })

    fireEvent.click(screen.getByLabelText("Delete department"))
    await waitFor(() => {
      expect(screen.getByText("Delete department")).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole("button", { name: /^Delete$/i }))

    await waitFor(() => {
      expect(mockDeleteCityDepartment).toHaveBeenCalledWith(5)
    })
  })

  it("does not delete when confirm dialog is cancelled", async () => {
    mockListAdminCityDepartments.mockResolvedValue([makeDepartment({ id: 5 })])
    render(<CityProfileContent cityId="42" />)
    await waitFor(() => {
      expect(screen.getByText("Police Department")).toBeInTheDocument()
    })

    fireEvent.click(screen.getByLabelText("Delete department"))
    await waitFor(() => {
      expect(screen.getByText("Delete department")).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole("button", { name: /Cancel/i }))
    expect(mockDeleteCityDepartment).not.toHaveBeenCalled()
  })

  // -------------------------------------------------------------------------
  // Accessibility — aria-label on Delete button
  // -------------------------------------------------------------------------

  it("has aria-label on Delete department button", async () => {
    mockListAdminCityDepartments.mockResolvedValue([makeDepartment()])
    render(<CityProfileContent cityId="42" />)
    await waitFor(() => {
      expect(screen.getByText("Police Department")).toBeInTheDocument()
    })
    expect(screen.getByLabelText("Delete department")).toBeInTheDocument()
  })

  // -------------------------------------------------------------------------
  // Add department form
  // -------------------------------------------------------------------------

  it("shows add department form when Add Department is clicked", async () => {
    render(<CityProfileContent cityId="42" />)
    await waitFor(() => {
      expect(screen.getByText(/No departments configured/)).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole("button", { name: /Add Department/i }))
    // The inline form should appear with the department name input
    expect(screen.getByPlaceholderText("e.g. Police Department")).toBeInTheDocument()
    expect(screen.getByText("Name *")).toBeInTheDocument()
  })

  // -------------------------------------------------------------------------
  // Portal technology detection
  // -------------------------------------------------------------------------

  it("detects NextRequest portal technology", async () => {
    mockGetCityFoiaProfile.mockResolvedValue(
      makeProfile({ portal_url: "https://oakland.nextrequest.com" })
    )
    render(<CityProfileContent cityId="42" />)
    await waitFor(() => {
      expect(screen.getByText("NextRequest")).toBeInTheDocument()
    })
  })
})

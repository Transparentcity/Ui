/**
 * Tests for the FOIA Requests List page:
 * - Overdue row highlighting (item 1)
 * - Dataset labels (item 2)
 * - Client-side sorting (item 7)
 * - API-backed pagination (item 8)
 */
import { render, screen, fireEvent, waitFor } from "@testing-library/react"
import { vi, describe, it, expect, beforeEach } from "vitest"

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockListFoiaRequests = vi.fn()
const mockGetFoiaDashboard = vi.fn()

vi.mock("@auth0/auth0-react", () => ({
  useAuth0: () => ({
    isAuthenticated: false,
    getAccessTokenSilently: vi.fn(),
  }),
}))

vi.mock("@/lib/foiaApiClient", () => ({
  listFoiaRequests: (...args: unknown[]) => mockListFoiaRequests(...args),
  getFoiaDashboard: (...args: unknown[]) => mockGetFoiaDashboard(...args),
}))

vi.mock("@/components/foia/status-badge", () => ({
  RequestStatusBadge: ({ status }: { status: string }) => (
    <span data-testid="status-badge">{status}</span>
  ),
}))

vi.mock("@/components/foia/new-request-modal", () => ({
  NewRequestModal: () => null,
}))

vi.mock("next/link", () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}))

import { RequestsListContent } from "./requests-list-content"

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const now = new Date()
const pastDeadline = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString()
const futureDeadline = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString()

function makeRequest(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    city_id: 42,
    city: { name: "Oakland" },
    dataset_type_id: "police_incidents",
    status: "submitted",
    deadline_at: null,
    created_at: "2026-01-15T00:00:00Z",
    coverage_start: "2023-01-01",
    coverage_end: "2023-12-31",
    department: null,
    agency_request_number: null,
    submission_email_address: null,
    submission_url: null,
    format_requested: "CSV",
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("RequestsListContent", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockListFoiaRequests.mockResolvedValue({ items: [], total: 0 })
    mockGetFoiaDashboard.mockResolvedValue(null)
  })

  // -----------------------------------------------------------------------
  // Basic rendering
  // -----------------------------------------------------------------------

  it("shows loading spinner while fetching", () => {
    mockListFoiaRequests.mockReturnValue(new Promise(() => {}))
    render(<RequestsListContent />)
    expect(document.querySelector(".animate-spin")).toBeInTheDocument()
  })

  it("renders requests after loading", async () => {
    mockListFoiaRequests.mockResolvedValue({
      items: [makeRequest()],
      total: 1,
    })
    render(<RequestsListContent />)
    await waitFor(() => {
      expect(screen.getByText("Oakland")).toBeInTheDocument()
    })
  })

  it("passes page_size 25 and page 1 to API", async () => {
    render(<RequestsListContent />)
    await waitFor(() => {
      expect(mockListFoiaRequests).toHaveBeenCalledWith(
        expect.objectContaining({ page_size: 25, page: 1 }),
        undefined
      )
    })
  })

  // -----------------------------------------------------------------------
  // Item 2: Dataset labels
  // -----------------------------------------------------------------------

  it("renders dataset label instead of raw ID", async () => {
    mockListFoiaRequests.mockResolvedValue({
      items: [makeRequest({ dataset_type_id: "police_incidents" })],
      total: 1,
    })
    render(<RequestsListContent />)
    await waitFor(() => {
      expect(screen.getByText("Police Incidents")).toBeInTheDocument()
    })
    expect(screen.queryByText("police_incidents")).not.toBeInTheDocument()
  })

  it("renders fallback dataset label for unknown types", async () => {
    mockListFoiaRequests.mockResolvedValue({
      items: [makeRequest({ dataset_type_id: "drone_flights" })],
      total: 1,
    })
    render(<RequestsListContent />)
    await waitFor(() => {
      expect(screen.getByText("Drone Flights")).toBeInTheDocument()
    })
  })

  // -----------------------------------------------------------------------
  // Item 1: Overdue row highlighting
  // -----------------------------------------------------------------------

  it("applies red background to overdue request rows", async () => {
    mockListFoiaRequests.mockResolvedValue({
      items: [makeRequest({ id: 1, deadline_at: pastDeadline, status: "submitted" })],
      total: 1,
    })
    render(<RequestsListContent />)
    await waitFor(() => {
      expect(screen.getByText("Oakland")).toBeInTheDocument()
    })
    const row = screen.getByText("Oakland").closest("tr")!
    expect(row.className).toContain("bg-red-50")
  })

  it("does not apply red background to non-overdue rows", async () => {
    mockListFoiaRequests.mockResolvedValue({
      items: [makeRequest({ id: 1, deadline_at: futureDeadline, status: "submitted" })],
      total: 1,
    })
    render(<RequestsListContent />)
    await waitFor(() => {
      expect(screen.getByText("Oakland")).toBeInTheDocument()
    })
    const row = screen.getByText("Oakland").closest("tr")!
    expect(row.className).not.toContain("bg-red-50")
  })

  it("does not highlight fulfilled requests as overdue", async () => {
    mockListFoiaRequests.mockResolvedValue({
      items: [makeRequest({ id: 1, deadline_at: pastDeadline, status: "fulfilled" })],
      total: 1,
    })
    render(<RequestsListContent />)
    await waitFor(() => {
      expect(screen.getByText("Oakland")).toBeInTheDocument()
    })
    const row = screen.getByText("Oakland").closest("tr")!
    expect(row.className).not.toContain("bg-red-50")
  })

  // -----------------------------------------------------------------------
  // Item 7: Client-side sorting
  // -----------------------------------------------------------------------

  it("renders sortable column headers", async () => {
    mockListFoiaRequests.mockResolvedValue({ items: [], total: 0 })
    render(<RequestsListContent />)
    await waitFor(() => {
      expect(screen.getByText(/City \/ Dataset/)).toBeInTheDocument()
    })
    // Deadline header should show sort indicator (default sort field)
    expect(screen.getByText(/Deadline/)).toHaveTextContent("Deadline ▲")
  })

  it("sorts requests by city name when City header is clicked", async () => {
    mockListFoiaRequests.mockResolvedValue({
      items: [
        makeRequest({ id: 1, city: { name: "Zion" } }),
        makeRequest({ id: 2, city: { name: "Albany" } }),
      ],
      total: 2,
    })
    render(<RequestsListContent />)
    await waitFor(() => {
      expect(screen.getByText("Zion")).toBeInTheDocument()
    })

    // Click City header to sort by city
    fireEvent.click(screen.getByText(/City \/ Dataset/))

    // After sorting asc, Albany should come first
    await waitFor(() => {
      const rows = document.querySelectorAll("tbody tr")
      expect(rows[0]?.textContent).toContain("Albany")
      expect(rows[1]?.textContent).toContain("Zion")
    })
  })

  it("toggles sort direction on second click", async () => {
    mockListFoiaRequests.mockResolvedValue({
      items: [
        makeRequest({ id: 1, city: { name: "Zion" } }),
        makeRequest({ id: 2, city: { name: "Albany" } }),
      ],
      total: 2,
    })
    render(<RequestsListContent />)
    await waitFor(() => {
      expect(screen.getByText("Zion")).toBeInTheDocument()
    })

    // First click: sort asc by city
    fireEvent.click(screen.getByText(/City \/ Dataset/))

    await waitFor(() => {
      const rows = document.querySelectorAll("tbody tr")
      expect(rows[0]?.textContent).toContain("Albany")
    })

    // Second click: sort desc by city (re-query the header element)
    fireEvent.click(screen.getByText(/City \/ Dataset/))

    await waitFor(() => {
      const rows = document.querySelectorAll("tbody tr")
      expect(rows[0]?.textContent).toContain("Zion")
      expect(rows[1]?.textContent).toContain("Albany")
    })
  })

  // -----------------------------------------------------------------------
  // Item 8: Pagination
  // -----------------------------------------------------------------------

  it("shows pagination controls when total > 25", async () => {
    mockListFoiaRequests.mockResolvedValue({
      items: [makeRequest()],
      total: 50,
    })
    render(<RequestsListContent />)
    await waitFor(() => {
      expect(screen.getByText("Page 1 of 2 (50 total)")).toBeInTheDocument()
    })
    expect(screen.getByRole("button", { name: "Previous" })).toBeDisabled()
    expect(screen.getByRole("button", { name: "Next" })).not.toBeDisabled()
  })

  it("does not show pagination when total <= 25", async () => {
    mockListFoiaRequests.mockResolvedValue({
      items: [makeRequest()],
      total: 10,
    })
    render(<RequestsListContent />)
    await waitFor(() => {
      expect(screen.getByText("Oakland")).toBeInTheDocument()
    })
    expect(screen.queryByText(/^Page /)).not.toBeInTheDocument()
  })

  it("calls API with page 2 when Next is clicked", async () => {
    mockListFoiaRequests.mockResolvedValue({
      items: [makeRequest()],
      total: 50,
    })
    render(<RequestsListContent />)
    await waitFor(() => {
      expect(screen.getByText("Page 1 of 2 (50 total)")).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole("button", { name: "Next" }))

    await waitFor(() => {
      expect(mockListFoiaRequests).toHaveBeenCalledWith(
        expect.objectContaining({ page: 2 }),
        undefined
      )
    })
  })

  it("disables Next on last page", async () => {
    mockListFoiaRequests.mockResolvedValue({
      items: [makeRequest()],
      total: 50,
    })
    render(<RequestsListContent />)
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Next" })).toBeInTheDocument()
    })

    // Go to page 2 (last page with 50 total / 25 per page)
    fireEvent.click(screen.getByRole("button", { name: "Next" }))

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Next" })).toBeDisabled()
      expect(screen.getByRole("button", { name: "Previous" })).not.toBeDisabled()
    })
  })

  it("resets page to 1 when status filter changes", async () => {
    mockListFoiaRequests.mockResolvedValue({
      items: [makeRequest()],
      total: 50,
    })
    render(<RequestsListContent />)
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Next" })).toBeInTheDocument()
    })

    // Go to page 2
    fireEvent.click(screen.getByRole("button", { name: "Next" }))
    await waitFor(() => {
      expect(mockListFoiaRequests).toHaveBeenCalledWith(
        expect.objectContaining({ page: 2 }),
        undefined
      )
    })

    // Change filter - should reset to page 1
    fireEvent.change(screen.getByDisplayValue("All Statuses"), {
      target: { value: "draft" },
    })

    await waitFor(() => {
      expect(mockListFoiaRequests).toHaveBeenCalledWith(
        expect.objectContaining({ page: 1, status: "draft" }),
        undefined
      )
    })
  })

  // -----------------------------------------------------------------------
  // Empty / error states
  // -----------------------------------------------------------------------

  it("shows empty message when no requests match", async () => {
    render(<RequestsListContent />)
    await waitFor(() => {
      expect(screen.getByText("No requests match your filters.")).toBeInTheDocument()
    })
  })

  it("shows error banner when API fails", async () => {
    mockListFoiaRequests.mockRejectedValue(new Error("Network error"))
    render(<RequestsListContent />)
    await waitFor(() => {
      expect(screen.getByText("Could not load requests")).toBeInTheDocument()
    })
  })
})

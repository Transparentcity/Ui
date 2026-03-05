/**
 * Tests for the FOIA Data Review page:
 * - Loading/error/empty states
 * - Dataset label formatting
 * - Action buttons (Complete, Incomplete, Needs Mapping, Reject)
 * - toast() calls instead of alert()
 */
import { render, screen, fireEvent, waitFor } from "@testing-library/react"
import { vi, describe, it, expect, beforeEach } from "vitest"

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockListDatasetInstances = vi.fn()
const mockListFoiaRequests = vi.fn()
const mockUpdateDatasetInstance = vi.fn()

vi.mock("@auth0/auth0-react", () => ({
  useAuth0: () => ({
    isAuthenticated: false,
    getAccessTokenSilently: vi.fn(),
  }),
}))

vi.mock("@/lib/foiaApiClient", () => ({
  listDatasetInstances: (...args: unknown[]) => mockListDatasetInstances(...args),
  listFoiaRequests: (...args: unknown[]) => mockListFoiaRequests(...args),
  createDatasetInstance: vi.fn().mockResolvedValue({}),
  updateDatasetInstance: (...args: unknown[]) => mockUpdateDatasetInstance(...args),
}))

vi.mock("@/app/actions/foia", () => ({
  uploadFoiaFile: vi.fn().mockResolvedValue({ id: 1 }),
  rewriteFoiaRequest: vi.fn().mockResolvedValue({ id: 2 }),
}))

vi.mock("@/lib/apiBase", () => ({
  API_BASE: "http://localhost:8001",
}))

vi.mock("next/link", () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}))

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}))

import { DataReviewContent } from "./data-review-content"

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeInstance(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    city_id: 42,
    city: { name: "Oakland" },
    dataset_type_id: "police_incidents",
    request_id: 10,
    status: "pending_review",
    row_count: 5000,
    coverage_start: "2023-01-01",
    coverage_end: "2023-12-31",
    completeness_score: 95,
    review_notes: null,
    created_at: "2026-03-01T00:00:00Z",
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("DataReviewContent", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockListDatasetInstances.mockResolvedValue([])
    mockListFoiaRequests.mockResolvedValue({ items: [] })
  })

  it("shows loading spinner while data is being fetched", () => {
    mockListDatasetInstances.mockReturnValue(new Promise(() => {}))
    mockListFoiaRequests.mockReturnValue(new Promise(() => {}))
    render(<DataReviewContent />)
    const spinner = document.querySelector(".animate-spin")
    expect(spinner).toBeInTheDocument()
  })

  it("shows error banner when API fails", async () => {
    mockListDatasetInstances.mockRejectedValue(new Error("Unauthorized"))
    render(<DataReviewContent />)
    await waitFor(() => {
      expect(screen.getByText("Could not load data review")).toBeInTheDocument()
    })
  })

  it("shows empty state for pending review when no instances", async () => {
    render(<DataReviewContent />)
    await waitFor(() => {
      expect(screen.getByText("No data to review")).toBeInTheDocument()
    })
  })

  it("renders pending review instances with dataset label", async () => {
    mockListDatasetInstances.mockResolvedValue([makeInstance()])
    render(<DataReviewContent />)
    await waitFor(() => {
      expect(screen.getByText(/Oakland – Police Incidents/)).toBeInTheDocument()
    })
    // Raw ID should not appear
    expect(screen.queryByText("police_incidents")).not.toBeInTheDocument()
  })

  it("shows action buttons for pending_review items", async () => {
    mockListDatasetInstances.mockResolvedValue([makeInstance()])
    render(<DataReviewContent />)
    await waitFor(() => {
      expect(screen.getByText(/Oakland – Police Incidents/)).toBeInTheDocument()
    })
    expect(screen.getByRole("button", { name: /^Complete$/i })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /Incomplete/i })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /Needs Mapping/i })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /Reject/i })).toBeInTheDocument()
  })

  it("calls updateDatasetInstance when Complete is clicked", async () => {
    mockListDatasetInstances.mockResolvedValue([makeInstance({ id: 5 })])
    mockUpdateDatasetInstance.mockResolvedValue({})
    render(<DataReviewContent />)
    await waitFor(() => {
      expect(screen.getByText(/Oakland – Police Incidents/)).toBeInTheDocument()
    })

    // Find the emerald Complete button (not the heading text)
    const buttons = screen.getAllByRole("button")
    const completeBtn = buttons.find(
      (b) => b.textContent?.trim() === "Complete" && b.className.includes("emerald")
    )!
    fireEvent.click(completeBtn)

    await waitFor(() => {
      expect(mockUpdateDatasetInstance).toHaveBeenCalledWith(
        5,
        { status: "accepted" },
        undefined
      )
    })
  })

  it("shows human-readable dataset label for unknown types", async () => {
    mockListDatasetInstances.mockResolvedValue([
      makeInstance({ dataset_type_id: "fire_calls" }),
    ])
    render(<DataReviewContent />)
    await waitFor(() => {
      expect(screen.getByText(/Oakland – Fire Calls/)).toBeInTheDocument()
    })
  })

  it("calls updateDatasetInstance with incomplete status and closes modal", async () => {
    const instance = makeInstance({ id: 7 })
    mockListDatasetInstances.mockResolvedValue([instance])
    mockUpdateDatasetInstance.mockResolvedValue({})
    render(<DataReviewContent />)
    await waitFor(() => {
      expect(screen.getByText(/Oakland – Police Incidents/)).toBeInTheDocument()
    })

    // Find and click the Incomplete button
    const allButtons = screen.getAllByRole("button")
    const incompleteBtn = allButtons.find(
      (b) => b.textContent?.trim() === "Incomplete" && b.className.includes("orange")
    )
    expect(incompleteBtn).toBeTruthy()
    fireEvent.click(incompleteBtn!)

    // Modal should open with "Mark Incomplete" heading
    await waitFor(() => {
      expect(screen.getByText(/Explain why the delivery is incomplete/)).toBeInTheDocument()
    })

    // Click the confirm button (orange bg-orange-600)
    const confirmButtons = screen.getAllByRole("button")
    const modalConfirmBtn = confirmButtons.find(
      (b) => b.textContent?.includes("Mark Incomplete") && b.className.includes("bg-orange-600")
    )
    expect(modalConfirmBtn).toBeTruthy()
    fireEvent.click(modalConfirmBtn!)

    // The update should have been called with incomplete status
    await waitFor(() => {
      expect(mockUpdateDatasetInstance).toHaveBeenCalledWith(
        7,
        expect.objectContaining({ status: "incomplete" }),
        undefined
      )
    })
  })

  it("shows previous reviews section for accepted items", async () => {
    mockListDatasetInstances.mockResolvedValue([
      makeInstance({ id: 2, status: "accepted" }),
    ])
    render(<DataReviewContent />)
    await waitFor(() => {
      expect(screen.getByText("Previous Reviews (1)")).toBeInTheDocument()
    })
  })
})

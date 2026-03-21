/**
 * Tests for the FOIA Request Detail page new features:
 * - City profile link (item 3)
 * - Overdue follow-up banner (item 5)
 * - Workflow progress indicator (item 9)
 */
import { render, screen, waitFor, fireEvent } from "@testing-library/react"
import { vi, describe, it, expect, beforeEach } from "vitest"

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockGetFoiaRequest = vi.fn()
const mockListFoiaMessages = vi.fn()
const mockListFoiaAttachments = vi.fn()
const mockListFoiaRequestEvents = vi.fn()
const mockListFoiaTasks = vi.fn()
const mockListFoiaSubmissionAttempts = vi.fn()
const mockSubmitFoiaRequest = vi.fn()

vi.mock("@auth0/auth0-react", () => ({
  useAuth0: () => ({
    isAuthenticated: false,
    getAccessTokenSilently: vi.fn(),
  }),
}))

vi.mock("@/lib/foiaApiClient", () => ({
  getFoiaRequest: (...args: unknown[]) => mockGetFoiaRequest(...args),
  listFoiaMessages: (...args: unknown[]) => mockListFoiaMessages(...args),
  listFoiaAttachments: (...args: unknown[]) => mockListFoiaAttachments(...args),
  listFoiaRequestEvents: (...args: unknown[]) => mockListFoiaRequestEvents(...args),
  listFoiaTasks: (...args: unknown[]) => mockListFoiaTasks(...args),
  listFoiaSubmissionAttempts: (...args: unknown[]) => mockListFoiaSubmissionAttempts(...args),
  markFoiaExternallyFiled: vi.fn(),
  updateFoiaRequest: vi.fn(),
  aiDraftFoiaRequest: vi.fn(),
  submitFoiaRequest: (...args: unknown[]) => mockSubmitFoiaRequest(...args),
  changeFoiaRequestStatus: vi.fn(),
  createFoiaMessage: vi.fn(),
  completeFoiaTask: vi.fn(),
  createFoiaTask: vi.fn(),
  uploadFoiaFile: vi.fn(),
}))

vi.mock("@/lib/apiBase", () => ({
  API_BASE: "http://localhost:8001",
}))

vi.mock("@/lib/foia/followUpWorkflow", () => ({
  FOLLOW_UP_ACTION_OPTIONS: [],
  FOLLOW_UP_CLASSIFICATION_TO_ACTION: {},
  FOLLOW_UP_QUICK_INSERTS: [],
  buildNoResponseTaskPayload: vi.fn(),
  getFollowUpTaskSpec: vi.fn(),
  isNarrowingSignal: vi.fn(),
}))

vi.mock("@/components/foia/status-badge", () => ({
  RequestStatusBadge: ({ status }: { status: string }) => (
    <span data-testid="status-badge">{status}</span>
  ),
  TaskStatusBadge: ({ status }: { status: string }) => (
    <span data-testid="task-status-badge">{status}</span>
  ),
}))

vi.mock("@/components/ui/dialog", () => ({
  Dialog: ({ children, open }: { children: React.ReactNode; open: boolean }) =>
    open ? <div data-testid="dialog">{children}</div> : null,
  DialogContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogDescription: ({ children }: { children: React.ReactNode }) => <p>{children}</p>,
  DialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
  DialogFooter: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))

vi.mock("next/link", () => ({
  default: ({ children, href, className }: { children: React.ReactNode; href: string; className?: string }) => (
    <a href={href} className={className}>{children}</a>
  ),
}))

const mockRouter = { push: vi.fn(), replace: vi.fn() }
const mockSearchParams = new URLSearchParams()
vi.mock("next/navigation", () => ({
  useRouter: () => mockRouter,
  usePathname: () => "/foia/requests/1",
  useSearchParams: () => mockSearchParams,
}))

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}))

import { RequestDetailContent } from "./request-detail-content"

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const now = new Date()
const pastFollowup = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000).toISOString()
const futureFollowup = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000).toISOString()

function makeRequest(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    city_id: 42,
    city: { name: "Oakland" },
    dataset_type_id: "police_incidents",
    status: "submitted",
    title: "Oakland Police Incidents",
    request_description: "Requesting police incident data",
    deadline_at: null,
    next_followup_at: null,
    submitted_at: "2026-01-15T00:00:00Z",
    acknowledged_at: null,
    created_at: "2026-01-15T00:00:00Z",
    updated_at: "2026-01-15T00:00:00Z",
    request_version: 1,
    format_requested: "CSV",
    coverage_start: "2023-01-01",
    coverage_end: "2023-12-31",
    department: null,
    agency_request_number: null,
    submission_email_address: null,
    submission_url: null,
    requested_fields: [],
    ...overrides,
  }
}

function setupMocks(requestOverrides: Record<string, unknown> = {}) {
  mockGetFoiaRequest.mockResolvedValue(makeRequest(requestOverrides))
  mockListFoiaMessages.mockResolvedValue([])
  mockListFoiaAttachments.mockResolvedValue([])
  mockListFoiaRequestEvents.mockResolvedValue([])
  mockListFoiaTasks.mockResolvedValue([])
  mockListFoiaSubmissionAttempts.mockResolvedValue([])
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("RequestDetailContent", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // -----------------------------------------------------------------------
  // Item 3: City profile link
  // -----------------------------------------------------------------------

  it("renders city name as a link to city profile", async () => {
    setupMocks()
    render(<RequestDetailContent requestId="1" />)
    await waitFor(() => {
      expect(screen.getByRole("link", { name: "Oakland" })).toBeInTheDocument()
    })

    const cityLink = screen.getByRole("link", { name: "Oakland" })
    expect(cityLink).toHaveAttribute("href", "/foia/cities/42")
    expect(cityLink.className).toContain("text-blue-600")
  })

  // -----------------------------------------------------------------------
  // Item 9: Workflow progress indicator
  // -----------------------------------------------------------------------

  it("renders workflow progress steps", async () => {
    setupMocks({ status: "submitted" })
    render(<RequestDetailContent requestId="1" />)
    await waitFor(() => {
      expect(screen.getByText("Draft")).toBeInTheDocument()
    })
    // These labels may appear in both workflow steps and status details
    expect(screen.getAllByText(/Submitted/i).length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText("Acknowledged").length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText("In Progress").length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText("Fulfilled").length).toBeGreaterThanOrEqual(1)
  })

  it("highlights current step for submitted status", async () => {
    setupMocks({ status: "submitted" })
    render(<RequestDetailContent requestId="1" />)
    await waitFor(() => {
      expect(screen.getByText("Draft")).toBeInTheDocument()
    })

    // Find the workflow step label "Submitted" (not the status badge which has lowercase)
    const submittedLabels = screen.getAllByText("Submitted")
    const workflowLabel = submittedLabels.find(
      (el) => el.className && el.className.includes("text-purple-600")
    )
    expect(workflowLabel).toBeTruthy()
  })

  it("shows terminated indicator for denied status", async () => {
    setupMocks({ status: "denied" })
    render(<RequestDetailContent requestId="1" />)
    await waitFor(() => {
      expect(screen.getByText("Draft")).toBeInTheDocument()
    })

    // Should show "✕" for terminated state
    expect(screen.getByText("✕")).toBeInTheDocument()
  })

  it("highlights all steps up to fulfilled", async () => {
    setupMocks({ status: "fulfilled" })
    render(<RequestDetailContent requestId="1" />)
    await waitFor(() => {
      expect(screen.getByText("Draft")).toBeInTheDocument()
    })

    // Find the workflow step label "Fulfilled" with purple styling
    const fulfilledLabels = screen.getAllByText("Fulfilled")
    const workflowLabel = fulfilledLabels.find(
      (el) => el.className && el.className.includes("text-purple-600")
    )
    expect(workflowLabel).toBeTruthy()
  })

  // -----------------------------------------------------------------------
  // Item 5: Overdue follow-up banner
  // -----------------------------------------------------------------------

  it("shows overdue follow-up banner when follow-up is past due", async () => {
    setupMocks({
      status: "submitted",
      next_followup_at: pastFollowup,
    })
    render(<RequestDetailContent requestId="1" />)
    await waitFor(() => {
      expect(
        screen.getByText(/Follow-up was due.*Consider sending a follow-up message/)
      ).toBeInTheDocument()
    })
    expect(
      screen.getByRole("button", { name: "Create Follow-up" })
    ).toBeInTheDocument()
  })

  it("does not show overdue banner when follow-up is in the future", async () => {
    setupMocks({
      status: "submitted",
      next_followup_at: futureFollowup,
    })
    render(<RequestDetailContent requestId="1" />)
    await waitFor(() => {
      expect(screen.getAllByText("Oakland Police Incidents").length).toBeGreaterThanOrEqual(1)
    })
    expect(
      screen.queryByText(/Follow-up was due/)
    ).not.toBeInTheDocument()
  })

  it("does not show overdue banner for fulfilled requests", async () => {
    setupMocks({
      status: "fulfilled",
      next_followup_at: pastFollowup,
    })
    render(<RequestDetailContent requestId="1" />)
    await waitFor(() => {
      expect(screen.getAllByText("Oakland Police Incidents").length).toBeGreaterThanOrEqual(1)
    })
    expect(
      screen.queryByText(/Follow-up was due/)
    ).not.toBeInTheDocument()
  })

  it("does not show overdue banner when no follow-up is set", async () => {
    setupMocks({
      status: "submitted",
      next_followup_at: null,
    })
    render(<RequestDetailContent requestId="1" />)
    await waitFor(() => {
      expect(screen.getAllByText("Oakland Police Incidents").length).toBeGreaterThanOrEqual(1)
    })
    expect(
      screen.queryByText(/Follow-up was due/)
    ).not.toBeInTheDocument()
  })

  // -----------------------------------------------------------------------
  // Basic rendering
  // -----------------------------------------------------------------------

  it("shows loading spinner initially", () => {
    mockGetFoiaRequest.mockReturnValue(new Promise(() => {}))
    mockListFoiaMessages.mockReturnValue(new Promise(() => {}))
    mockListFoiaAttachments.mockReturnValue(new Promise(() => {}))
    mockListFoiaRequestEvents.mockReturnValue(new Promise(() => {}))
    mockListFoiaTasks.mockReturnValue(new Promise(() => {}))
    mockListFoiaSubmissionAttempts.mockReturnValue(new Promise(() => {}))
    render(<RequestDetailContent requestId="1" />)
    expect(document.querySelector(".animate-spin")).toBeInTheDocument()
  })

  it("shows 'Request not found' when request is null", async () => {
    mockGetFoiaRequest.mockRejectedValue(new Error("not found"))
    mockListFoiaMessages.mockRejectedValue(new Error("not found"))
    mockListFoiaAttachments.mockRejectedValue(new Error("not found"))
    mockListFoiaRequestEvents.mockRejectedValue(new Error("not found"))
    mockListFoiaTasks.mockRejectedValue(new Error("not found"))
    mockListFoiaSubmissionAttempts.mockRejectedValue(new Error("not found"))
    render(<RequestDetailContent requestId="1" />)
    await waitFor(() => {
      expect(screen.getByText("Request not found")).toBeInTheDocument()
    })
  })

  it("renders request title after loading", async () => {
    setupMocks()
    render(<RequestDetailContent requestId="1" />)
    await waitFor(() => {
      expect(screen.getAllByText("Oakland Police Incidents").length).toBeGreaterThanOrEqual(1)
    })
  })

  // -----------------------------------------------------------------------
  // Bug fix: submittedDate is passed to submitFoiaRequest
  // -----------------------------------------------------------------------

  it("passes submitted_date when marking request as submitted", async () => {
    setupMocks({ status: "draft" })
    mockSubmitFoiaRequest.mockResolvedValue({})
    render(<RequestDetailContent requestId="1" />)
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Mark Submitted/i })).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole("button", { name: /Mark Submitted/i }))

    // Submit modal should appear with "Save & Continue" button
    await waitFor(() => {
      expect(screen.getByText("Mark submitted")).toBeInTheDocument()
    })

    const saveContinueBtn = screen.getAllByRole("button").find(
      (b) => b.textContent?.includes("Save & Continue")
    )!
    fireEvent.click(saveContinueBtn)

    await waitFor(() => {
      expect(mockSubmitFoiaRequest).toHaveBeenCalledWith(
        1,
        expect.objectContaining({ submitted_date: expect.any(String) })
      )
    })
  })
})

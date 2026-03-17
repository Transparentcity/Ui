import { render, screen, fireEvent, waitFor } from "@testing-library/react"
import { vi, describe, it, expect, beforeEach } from "vitest"
import { InvestigationDetailPage } from "./investigation-detail-page"
import {
  makeMockQuery,
  makeMockQueryLoading,
  makeMockQueryError,
  makeMockMutation,
  makeMockMutationPending,
  makeInvestigation,
  installResizeObserver,
} from "./test-utils"

installResizeObserver()

// ── Mocks ────────────────────────────────────────────────────────────────────

const mockGetToken = vi.fn().mockResolvedValue("mock-token")

vi.mock("@auth0/auth0-react", () => ({
  useAuth0: () => ({
    getAccessTokenSilently: mockGetToken,
    isAuthenticated: true,
    isLoading: false,
  }),
}))

vi.mock("next/navigation", () => ({
  usePathname: () => "/waste/investigations/inv-1",
  useRouter: () => ({ push: vi.fn() }),
}))

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: any) => <a href={href} {...props}>{children}</a>,
}))

vi.mock("./waste-shell", () => ({
  WasteShell: ({ children, title, description, actions }: any) => (
    <div>
      <h1>{title}</h1>
      {description ? <p>{description}</p> : null}
      {actions}
      {children}
    </div>
  ),
}))

vi.mock("@/lib/hooks/useWaste", () => ({
  useWasteInvestigation: vi.fn(),
  useCreateInvestigationAction: vi.fn(),
  useCloseInvestigation: vi.fn(),
}))

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

vi.mock("@/lib/apiClient", async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>
  return {
    ...actual,
    exportInvestigationEvidence: vi.fn(),
  }
})

import {
  useWasteInvestigation as _useWasteInvestigation,
  useCreateInvestigationAction as _useCreateInvestigationAction,
  useCloseInvestigation as _useCloseInvestigation,
} from "@/lib/hooks/useWaste"
import { exportInvestigationEvidence } from "@/lib/apiClient"
import { toast } from "sonner"

const useWasteInvestigation = vi.mocked(_useWasteInvestigation)
const useCreateInvestigationAction = vi.mocked(_useCreateInvestigationAction)
const useCloseInvestigation = vi.mocked(_useCloseInvestigation)
const mockExportEvidence = vi.mocked(exportInvestigationEvidence)

function setupDefaultMocks() {
  const investigation = makeInvestigation({
    actions: [
      {
        id: "act-1",
        investigation_id: "inv-1",
        action_type: "note",
        title: "Initial Review",
        description: "Reviewed payroll records",
        status: "completed",
        assigned_to: null,
        target_department: null,
        due_date: null,
        completed_at: "2026-01-20T00:00:00Z",
        response_notes: null,
        attachments: [],
        created_at: "2026-01-15T00:00:00Z",
        created_by: "auditor@city.gov",
      },
    ],
  })
  useWasteInvestigation.mockReturnValue(
    makeMockQuery(investigation) as ReturnType<typeof _useWasteInvestigation>
  )
  useCreateInvestigationAction.mockReturnValue(
    makeMockMutation() as ReturnType<typeof _useCreateInvestigationAction>
  )
  useCloseInvestigation.mockReturnValue(
    makeMockMutation() as ReturnType<typeof _useCloseInvestigation>
  )
}

describe("InvestigationDetailPage", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setupDefaultMocks()
    globalThis.URL.createObjectURL = vi.fn(() => "blob:mock-url")
    globalThis.URL.revokeObjectURL = vi.fn()
  })

  // ── Loading ────────────────────────────────────────────────────────────────

  it("shows loading skeletons while data is loading", () => {
    useWasteInvestigation.mockReturnValue(
      makeMockQueryLoading() as ReturnType<typeof _useWasteInvestigation>
    )
    const { container } = render(<InvestigationDetailPage investigationId="inv-1" />)
    expect(container.querySelectorAll(".animate-pulse").length).toBeGreaterThan(0)
  })

  // ── Error state ────────────────────────────────────────────────────────────

  it("shows error message when investigation fails to load", () => {
    useWasteInvestigation.mockReturnValue(
      makeMockQueryError("Not authorized") as ReturnType<typeof _useWasteInvestigation>
    )
    render(<InvestigationDetailPage investigationId="inv-1" />)
    expect(screen.getByText("Not authorized")).toBeInTheDocument()
  })

  it("shows back to queue link on error", () => {
    useWasteInvestigation.mockReturnValue(
      makeMockQueryError() as ReturnType<typeof _useWasteInvestigation>
    )
    render(<InvestigationDetailPage investigationId="inv-1" />)
    expect(screen.getByText("Back to Queue")).toBeInTheDocument()
  })

  // ── Rendering ──────────────────────────────────────────────────────────────

  it("renders investigation title and status", () => {
    render(<InvestigationDetailPage investigationId="inv-1" />)
    expect(screen.getByText("Fire Dept Overtime Investigation")).toBeInTheDocument()
    expect(screen.getByText("open")).toBeInTheDocument()
  })

  it("renders action timeline with existing actions", () => {
    render(<InvestigationDetailPage investigationId="inv-1" />)
    expect(screen.getByText("Initial Review")).toBeInTheDocument()
    expect(screen.getByText("Action Timeline (1)")).toBeInTheDocument()
  })

  // ── Export Evidence button ─────────────────────────────────────────────────

  it("calls export function when Export Evidence is clicked", async () => {
    mockExportEvidence.mockResolvedValue(new Blob(["pdf-data"]))
    render(<InvestigationDetailPage investigationId="inv-1" />)
    fireEvent.click(screen.getByText("Export Evidence"))

    await waitFor(() => {
      expect(mockExportEvidence).toHaveBeenCalledWith("mock-token", "inv-1")
    })
  })

  it("disables Export Evidence button while exporting", async () => {
    mockExportEvidence.mockImplementation(() => new Promise(() => {})) // never resolves
    render(<InvestigationDetailPage investigationId="inv-1" />)
    fireEvent.click(screen.getByText("Export Evidence"))

    await waitFor(() => {
      expect(screen.getByText("Export Evidence").closest("button")).toBeDisabled()
    })
  })

  // ── Close Investigation button ─────────────────────────────────────────────

  it("hides Close Investigation button when status is closed", () => {
    useWasteInvestigation.mockReturnValue(
      makeMockQuery(makeInvestigation({ status: "closed" })) as ReturnType<typeof _useWasteInvestigation>
    )
    render(<InvestigationDetailPage investigationId="inv-1" />)
    expect(screen.queryByText("Close Investigation")).not.toBeInTheDocument()
  })

  // ── Add Action dialog ──────────────────────────────────────────────────────

  it("hides Add Action button when investigation is closed", () => {
    useWasteInvestigation.mockReturnValue(
      makeMockQuery(makeInvestigation({ status: "closed" })) as ReturnType<typeof _useWasteInvestigation>
    )
    render(<InvestigationDetailPage investigationId="inv-1" />)
    expect(screen.queryByText("Add Action")).not.toBeInTheDocument()
  })

  it("shows Add Action button for open investigations", () => {
    render(<InvestigationDetailPage investigationId="inv-1" />)
    expect(screen.getByText("Add Action")).toBeInTheDocument()
  })

  // ── Export error toast ──────────────────────────────────────────────────────

  it("shows error toast when export fails", async () => {
    mockExportEvidence.mockRejectedValue(new Error("network error"))
    render(<InvestigationDetailPage investigationId="inv-1" />)
    fireEvent.click(screen.getByText("Export Evidence"))

    await waitFor(() => {
      expect(vi.mocked(toast).error).toHaveBeenCalledWith("Failed to export evidence")
    })
  })

  // ── Add action success toast ────────────────────────────────────────────────

  it("shows success toast when add action succeeds", async () => {
    const mutate = vi.fn().mockImplementation((_args: unknown, opts: { onSuccess?: () => void }) => {
      opts.onSuccess?.()
    })
    useCreateInvestigationAction.mockReturnValue(
      makeMockMutation({ mutate }) as ReturnType<typeof _useCreateInvestigationAction>
    )

    render(<InvestigationDetailPage investigationId="inv-1" />)
    // Open add action dialog
    fireEvent.click(screen.getByText("Add Action"))
    // Fill in the required title field
    const titleInput = screen.getByPlaceholderText("Action title")
    fireEvent.change(titleInput, { target: { value: "Follow up call" } })
    // Submit via the dialog's Add Action button
    const addButtons = screen.getAllByText("Add Action")
    const dialogAddButton = addButtons[addButtons.length - 1]
    fireEvent.click(dialogAddButton)

    await waitFor(() => {
      expect(vi.mocked(toast).success).toHaveBeenCalledWith("Action added")
    })
  })

  // ── Close dialog shows investigation title ──────────────────────────────────

  it("shows investigation title in close dialog description", () => {
    render(<InvestigationDetailPage investigationId="inv-1" />)
    fireEvent.click(screen.getByText("Close Investigation"))
    // The dialog description contains the investigation title in curly quotes
    expect(screen.getByText(/Closing.*Fire Dept Overtime Investigation/)).toBeInTheDocument()
  })
})

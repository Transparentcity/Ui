/**
 * Tests for the FOIA Templates page buttons:
 * - New Template (opens modal)
 * - Edit Template (opens modal)
 * - Delete Template (with loading indicator)
 */
import { render, screen, fireEvent, waitFor } from "@testing-library/react"
import { vi, describe, it, expect, beforeEach } from "vitest"

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockListFoiaTemplates = vi.fn()
const mockDeleteFoiaTemplate = vi.fn()

vi.mock("@auth0/auth0-react", () => ({
  useAuth0: () => ({
    isAuthenticated: false,
    getAccessTokenSilently: vi.fn(),
  }),
}))

vi.mock("@/lib/foiaApiClient", () => ({
  listFoiaTemplates: (...args: unknown[]) => mockListFoiaTemplates(...args),
  deleteFoiaTemplate: (...args: unknown[]) => mockDeleteFoiaTemplate(...args),
}))

vi.mock("@/app/actions/foia", () => ({
  createFoiaTemplate: vi.fn().mockResolvedValue({}),
  updateFoiaTemplate: vi.fn().mockResolvedValue({}),
}))

import { TemplatesContent } from "./templates-content"

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeTemplate(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    name: "CPRA Standard Request",
    dataset_type_id: "police_incidents",
    jurisdiction_type: "state",
    subject_template: "Public Records Request - Police Incidents",
    body_template: "Dear Records Custodian, Pursuant to the CPRA...",
    notes: "California-specific template",
    created_at: "2026-01-15T00:00:00Z",
    updated_at: "2026-02-01T00:00:00Z",
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("TemplatesContent", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockListFoiaTemplates.mockResolvedValue([])
  })

  it("shows loading spinner while templates are being fetched", () => {
    mockListFoiaTemplates.mockReturnValue(new Promise(() => {}))
    render(<TemplatesContent />)
    const spinner = document.querySelector(".animate-spin")
    expect(spinner).toBeInTheDocument()
  })

  it("renders templates after loading", async () => {
    mockListFoiaTemplates.mockResolvedValue([makeTemplate()])
    render(<TemplatesContent />)
    await waitFor(() => {
      expect(screen.getByText("CPRA Standard Request")).toBeInTheDocument()
    })
    expect(screen.getByText(/Dataset: Police Incidents/)).toBeInTheDocument()
  })

  it("shows error banner when API fails", async () => {
    mockListFoiaTemplates.mockRejectedValue(new Error("Unauthorized"))
    render(<TemplatesContent />)
    await waitFor(() => {
      expect(screen.getByText("Could not load templates")).toBeInTheDocument()
      expect(screen.getByText("Unauthorized")).toBeInTheDocument()
    })
  })

  it("shows empty state when no templates exist", async () => {
    mockListFoiaTemplates.mockResolvedValue([])
    render(<TemplatesContent />)
    await waitFor(() => {
      expect(screen.getByText("No templates created yet.")).toBeInTheDocument()
    })
  })

  // -------------------------------------------------------------------------
  // Delete button
  // -------------------------------------------------------------------------

  it("shows confirm dialog and deletes when confirmed", async () => {
    mockListFoiaTemplates.mockResolvedValue([makeTemplate({ id: 5 })])
    mockDeleteFoiaTemplate.mockResolvedValue(undefined)

    render(<TemplatesContent />)
    await waitFor(() => {
      expect(screen.getByText("CPRA Standard Request")).toBeInTheDocument()
    })

    // Click delete to open confirm dialog
    fireEvent.click(screen.getByLabelText("Delete template"))

    // Dialog should appear
    await waitFor(() => {
      expect(screen.getByText("Delete template")).toBeInTheDocument()
      expect(screen.getByText(/permanently removed/)).toBeInTheDocument()
    })

    // Click the Delete button in the dialog
    fireEvent.click(screen.getByRole("button", { name: /^Delete$/i }))

    await waitFor(() => {
      expect(mockDeleteFoiaTemplate).toHaveBeenCalledWith(5, undefined)
    })
  })

  it("does not delete when confirm dialog is cancelled", async () => {
    mockListFoiaTemplates.mockResolvedValue([makeTemplate({ id: 5 })])

    render(<TemplatesContent />)
    await waitFor(() => {
      expect(screen.getByText("CPRA Standard Request")).toBeInTheDocument()
    })

    // Click delete to open confirm dialog
    fireEvent.click(screen.getByLabelText("Delete template"))

    await waitFor(() => {
      expect(screen.getByText("Delete template")).toBeInTheDocument()
    })

    // Click Cancel
    fireEvent.click(screen.getByRole("button", { name: /Cancel/i }))

    expect(mockDeleteFoiaTemplate).not.toHaveBeenCalled()
  })

  // -------------------------------------------------------------------------
  // New Template button
  // -------------------------------------------------------------------------

  it("opens template modal when New Template is clicked", async () => {
    mockListFoiaTemplates.mockResolvedValue([])
    render(<TemplatesContent />)
    await waitFor(() => {
      expect(screen.getByText("No templates created yet.")).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole("button", { name: /New Template/i }))

    await waitFor(() => {
      // Modal opens with form fields
      expect(screen.getByText("Template Name *")).toBeInTheDocument()
      expect(screen.getByText("Subject Template *")).toBeInTheDocument()
      expect(screen.getByRole("button", { name: /Create Template/i })).toBeInTheDocument()
    })
  })

  // -------------------------------------------------------------------------
  // Edit Template button
  // -------------------------------------------------------------------------

  it("opens edit modal with template data when Edit is clicked", async () => {
    mockListFoiaTemplates.mockResolvedValue([makeTemplate()])
    render(<TemplatesContent />)
    await waitFor(() => {
      expect(screen.getByText("CPRA Standard Request")).toBeInTheDocument()
    })

    fireEvent.click(screen.getByLabelText("Edit template"))

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Save Changes/i })).toBeInTheDocument()
    })
  })

  // -------------------------------------------------------------------------
  // Accessibility — aria-label on icon buttons
  // -------------------------------------------------------------------------

  it("has aria-label on Edit and Delete icon buttons", async () => {
    mockListFoiaTemplates.mockResolvedValue([makeTemplate()])
    render(<TemplatesContent />)
    await waitFor(() => {
      expect(screen.getByText("CPRA Standard Request")).toBeInTheDocument()
    })
    expect(screen.getByLabelText("Edit template")).toBeInTheDocument()
    expect(screen.getByLabelText("Delete template")).toBeInTheDocument()
  })

  // -------------------------------------------------------------------------
  // Dataset label formatting
  // -------------------------------------------------------------------------

  it("displays human-readable dataset label instead of raw ID", async () => {
    mockListFoiaTemplates.mockResolvedValue([
      makeTemplate({ dataset_type_id: "use_of_force" }),
    ])
    render(<TemplatesContent />)
    await waitFor(() => {
      expect(screen.getByText(/Dataset: Use of Force/)).toBeInTheDocument()
    })
    // Raw ID should not appear
    expect(screen.queryByText("use_of_force")).not.toBeInTheDocument()
  })

  it("falls back to title-cased label for unknown dataset types", async () => {
    mockListFoiaTemplates.mockResolvedValue([
      makeTemplate({ dataset_type_id: "fire_calls" }),
    ])
    render(<TemplatesContent />)
    await waitFor(() => {
      expect(screen.getByText(/Dataset: Fire Calls/)).toBeInTheDocument()
    })
  })
})

/**
 * Tests for the FOIA Tasks page buttons:
 * - Create Task (form submit)
 * - Complete Task
 * - Assign Task
 * - Filter buttons
 */
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react"
import { vi, describe, it, expect, beforeEach } from "vitest"

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockListFoiaTasks = vi.fn()
const mockAssignFoiaTask = vi.fn()
const mockCompleteFoiaTask = vi.fn()
const mockCreateFoiaTask = vi.fn()
const mockGetAccessTokenSilently = vi.fn()

vi.mock("@auth0/auth0-react", () => ({
  useAuth0: () => ({
    isAuthenticated: false,
    getAccessTokenSilently: mockGetAccessTokenSilently,
  }),
}))

vi.mock("@/lib/foiaApiClient", () => ({
  listFoiaTasks: (...args: unknown[]) => mockListFoiaTasks(...args),
}))

vi.mock("@/app/actions/foia", () => ({
  assignFoiaTask: (...args: unknown[]) => mockAssignFoiaTask(...args),
  completeFoiaTask: (...args: unknown[]) => mockCompleteFoiaTask(...args),
  createFoiaTask: (...args: unknown[]) => mockCreateFoiaTask(...args),
}))

// Mock next/link to render a simple <a>
vi.mock("next/link", () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}))

import { TasksContent } from "./tasks-content"

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeTask(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    type: "review_delivery",
    title: "Review Oakland data",
    description: "Check completeness of police incident data",
    status: "pending",
    assigned_to: null,
    request_id: 10,
    city_id: 42,
    due_at: null,
    completed_at: null,
    created_at: "2026-03-01T00:00:00Z",
    ...overrides,
  }
}

/**
 * Helper: find the action "Complete" button inside a task row,
 * avoiding the "Completed" filter tab.
 */
function findCompleteActionButton(): HTMLElement | null {
  // The action button has an emerald background and text "Complete"
  const buttons = screen.getAllByRole("button")
  return (
    buttons.find(
      (btn) =>
        btn.textContent?.trim() === "Complete" &&
        btn.className.includes("emerald")
    ) ?? null
  )
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("TasksContent", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockListFoiaTasks.mockResolvedValue([])
  })

  it("shows a loading spinner while tasks are being fetched", () => {
    mockListFoiaTasks.mockReturnValue(new Promise(() => {}))
    render(<TasksContent />)
    const spinner = document.querySelector(".animate-spin")
    expect(spinner).toBeInTheDocument()
  })

  it("renders tasks after loading", async () => {
    mockListFoiaTasks.mockResolvedValue([makeTask()])
    render(<TasksContent />)
    await waitFor(() => {
      expect(screen.getByText("Review Oakland data")).toBeInTheDocument()
    })
  })

  it("shows error banner when API fails", async () => {
    mockListFoiaTasks.mockRejectedValue(new Error("Connection refused"))
    render(<TasksContent />)
    await waitFor(() => {
      expect(screen.getByText("Could not load tasks")).toBeInTheDocument()
      expect(screen.getByText("Connection refused")).toBeInTheDocument()
    })
  })

  it("shows empty state when no tasks match filter", async () => {
    mockListFoiaTasks.mockResolvedValue([])
    render(<TasksContent />)
    await waitFor(() => {
      expect(screen.getByText("No tasks match your filter.")).toBeInTheDocument()
    })
  })

  // -------------------------------------------------------------------------
  // Complete Task button
  // -------------------------------------------------------------------------

  it("shows a spinner on the Complete button while completing", async () => {
    const task = makeTask({ id: 5 })
    mockListFoiaTasks.mockResolvedValue([task])
    mockCompleteFoiaTask.mockReturnValue(new Promise(() => {}))

    render(<TasksContent />)
    await waitFor(() => {
      expect(screen.getByText("Review Oakland data")).toBeInTheDocument()
    })

    const completeBtn = findCompleteActionButton()!
    expect(completeBtn).toBeTruthy()
    fireEvent.click(completeBtn)

    await waitFor(() => {
      expect(completeBtn).toBeDisabled()
      const spinner = completeBtn.querySelector(".animate-spin")
      expect(spinner).toBeInTheDocument()
    })
  })

  it("calls completeFoiaTask with the task id on click", async () => {
    const task = makeTask({ id: 7 })
    mockListFoiaTasks.mockResolvedValue([task])
    mockCompleteFoiaTask.mockResolvedValue({})

    render(<TasksContent />)
    await waitFor(() => {
      expect(screen.getByText("Review Oakland data")).toBeInTheDocument()
    })

    const completeBtn = findCompleteActionButton()!
    fireEvent.click(completeBtn)

    await waitFor(() => {
      expect(mockCompleteFoiaTask).toHaveBeenCalledWith(7)
    })
  })

  // -------------------------------------------------------------------------
  // Assign Task button
  // -------------------------------------------------------------------------

  it("shows Assign button for unassigned tasks", async () => {
    mockListFoiaTasks.mockResolvedValue([makeTask({ assigned_to: null })])
    render(<TasksContent />)
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /^Assign$/i })).toBeInTheDocument()
    })
  })

  it("does not show Assign button for assigned tasks", async () => {
    mockListFoiaTasks.mockResolvedValue([makeTask({ assigned_to: "admin" })])
    render(<TasksContent />)
    await waitFor(() => {
      expect(screen.getByText("Review Oakland data")).toBeInTheDocument()
    })
    expect(screen.queryByRole("button", { name: /^Assign$/i })).not.toBeInTheDocument()
  })

  it("opens assign dialog and calls API when submitted", async () => {
    const task = makeTask({ id: 3, assigned_to: null })
    mockListFoiaTasks.mockResolvedValue([task])
    mockAssignFoiaTask.mockResolvedValue({})

    render(<TasksContent />)
    await waitFor(() => {
      expect(screen.getByText("Review Oakland data")).toBeInTheDocument()
    })

    // Click Assign to open dialog
    fireEvent.click(screen.getByRole("button", { name: /^Assign$/i }))

    // Dialog should appear
    await waitFor(() => {
      expect(screen.getByText("Assign Task")).toBeInTheDocument()
    })

    // Type username
    const input = screen.getByPlaceholderText("e.g. admin")
    fireEvent.change(input, { target: { value: "admin" } })

    // Click the dialog Assign button (not the row one)
    const dialogBtns = screen.getAllByRole("button", { name: /^Assign$/i })
    const dialogAssignBtn = dialogBtns.find((b) => b.className.includes("purple"))!
    fireEvent.click(dialogAssignBtn)

    await waitFor(() => {
      expect(mockAssignFoiaTask).toHaveBeenCalledWith(3, "admin")
    })
  })

  // -------------------------------------------------------------------------
  // Create Task button
  // -------------------------------------------------------------------------

  it("toggles new task form when New Task button is clicked", async () => {
    mockListFoiaTasks.mockResolvedValue([])
    render(<TasksContent />)
    await waitFor(() => {
      expect(screen.getByText("No tasks match your filter.")).toBeInTheDocument()
    })

    // Click New Task
    fireEvent.click(screen.getByRole("button", { name: /New Task/i }))
    expect(screen.getByRole("button", { name: /Create Task/i })).toBeInTheDocument()

    // Click Cancel (exact match to avoid "Cancelled" filter tab)
    fireEvent.click(screen.getByRole("button", { name: /^Cancel$/ }))
    expect(screen.queryByRole("button", { name: /Create Task/i })).not.toBeInTheDocument()
  })

  it("shows spinner on Create Task button while creating", async () => {
    mockListFoiaTasks.mockResolvedValue([])
    mockCreateFoiaTask.mockReturnValue(new Promise(() => {}))

    render(<TasksContent />)
    await waitFor(() => {
      expect(screen.getByText("No tasks match your filter.")).toBeInTheDocument()
    })

    // Open form
    fireEvent.click(screen.getByRole("button", { name: /New Task/i }))

    // Fill in title
    const titleInput = screen.getByPlaceholderText(/Review SF police/i)
    fireEvent.change(titleInput, { target: { value: "New review task" } })

    // Submit
    const createBtn = screen.getByRole("button", { name: /Create Task/i })
    fireEvent.click(createBtn)

    await waitFor(() => {
      const spinner = createBtn.querySelector(".animate-spin")
      expect(spinner).toBeInTheDocument()
    })
  })

  // -------------------------------------------------------------------------
  // Filter buttons
  // -------------------------------------------------------------------------

  it("renders all filter options", async () => {
    mockListFoiaTasks.mockResolvedValue([])
    render(<TasksContent />)
    await waitFor(() => {
      expect(screen.getByText("All")).toBeInTheDocument()
    })
    expect(screen.getByText("Pending")).toBeInTheDocument()
    expect(screen.getByText("Assigned")).toBeInTheDocument()
    expect(screen.getByText("In Progress")).toBeInTheDocument()
    expect(screen.getByText("Completed")).toBeInTheDocument()
    expect(screen.getByText("Cancelled")).toBeInTheDocument()
  })

  it("reloads tasks when filter changes", async () => {
    mockListFoiaTasks.mockResolvedValue([])
    render(<TasksContent />)
    await waitFor(() => {
      // Initial load uses no status filter
      expect(mockListFoiaTasks).toHaveBeenCalledWith({ status: undefined }, undefined)
    })

    fireEvent.click(screen.getByText("Pending"))

    await waitFor(() => {
      // After clicking Pending filter, it should call with status: "pending"
      expect(mockListFoiaTasks).toHaveBeenCalledWith({ status: "pending" }, undefined)
    })
  })

  // -------------------------------------------------------------------------
  // Completed / cancelled tasks don't show action buttons
  // -------------------------------------------------------------------------

  it("does not show Complete action for completed tasks", async () => {
    mockListFoiaTasks.mockResolvedValue([
      makeTask({ id: 1, status: "completed" }),
    ])
    render(<TasksContent />)
    await waitFor(() => {
      expect(screen.getByText("Review Oakland data")).toBeInTheDocument()
    })
    // The emerald "Complete" action button should NOT exist
    expect(findCompleteActionButton()).toBeNull()
    expect(screen.queryByRole("button", { name: /^Assign$/i })).not.toBeInTheDocument()
  })

  it("does not show Complete action for cancelled tasks", async () => {
    mockListFoiaTasks.mockResolvedValue([
      makeTask({ id: 1, status: "cancelled" }),
    ])
    render(<TasksContent />)
    await waitFor(() => {
      expect(screen.getByText("Review Oakland data")).toBeInTheDocument()
    })
    expect(findCompleteActionButton()).toBeNull()
    expect(screen.queryByRole("button", { name: /^Assign$/i })).not.toBeInTheDocument()
  })

  // -------------------------------------------------------------------------
  // Accessibility — ARIA tablist / tab roles on filters
  // -------------------------------------------------------------------------

  it("filter buttons have tablist and tab roles", async () => {
    mockListFoiaTasks.mockResolvedValue([])
    render(<TasksContent />)
    await waitFor(() => {
      expect(screen.getByText("All")).toBeInTheDocument()
    })

    const tablist = screen.getByRole("tablist", { name: /filter tasks/i })
    expect(tablist).toBeInTheDocument()

    const tabs = within(tablist).getAllByRole("tab")
    expect(tabs.length).toBe(6) // All, Pending, Assigned, In Progress, Completed, Cancelled
  })

  it("marks the active filter tab with aria-selected", async () => {
    mockListFoiaTasks.mockResolvedValue([])
    render(<TasksContent />)
    await waitFor(() => {
      expect(screen.getByText("All")).toBeInTheDocument()
    })

    // "All" should be selected initially
    const allTab = screen.getByRole("tab", { name: "All" })
    expect(allTab).toHaveAttribute("aria-selected", "true")

    // Click Pending
    const pendingTab = screen.getByRole("tab", { name: "Pending" })
    expect(pendingTab).toHaveAttribute("aria-selected", "false")
    fireEvent.click(pendingTab)

    await waitFor(() => {
      expect(pendingTab).toHaveAttribute("aria-selected", "true")
      expect(allTab).toHaveAttribute("aria-selected", "false")
    })
  })

  // -------------------------------------------------------------------------
  // Assign dialog — cancel
  // -------------------------------------------------------------------------

  it("closes assign dialog when Cancel is clicked without calling API", async () => {
    mockListFoiaTasks.mockResolvedValue([makeTask({ id: 3, assigned_to: null })])
    render(<TasksContent />)
    await waitFor(() => {
      expect(screen.getByText("Review Oakland data")).toBeInTheDocument()
    })

    // Open assign dialog
    fireEvent.click(screen.getByRole("button", { name: /^Assign$/i }))
    await waitFor(() => {
      expect(screen.getByText("Assign Task")).toBeInTheDocument()
    })

    // Click Cancel in the dialog
    fireEvent.click(screen.getByRole("button", { name: /Cancel/i }))

    await waitFor(() => {
      expect(screen.queryByText("Assign Task")).not.toBeInTheDocument()
    })
    expect(mockAssignFoiaTask).not.toHaveBeenCalled()
  })

  it("disables dialog Assign button when input is empty", async () => {
    mockListFoiaTasks.mockResolvedValue([makeTask({ id: 3, assigned_to: null })])
    render(<TasksContent />)
    await waitFor(() => {
      expect(screen.getByText("Review Oakland data")).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole("button", { name: /^Assign$/i }))
    await waitFor(() => {
      expect(screen.getByText("Assign Task")).toBeInTheDocument()
    })

    // The dialog Assign button (purple) should be disabled when input is empty
    const dialogBtns = screen.getAllByRole("button", { name: /^Assign$/i })
    const dialogAssignBtn = dialogBtns.find((b) => b.className.includes("purple"))!
    expect(dialogAssignBtn).toBeDisabled()
  })

  // -------------------------------------------------------------------------
  // Mobile responsive grid
  // -------------------------------------------------------------------------

  it("new task form grid has mobile-first responsive classes", async () => {
    mockListFoiaTasks.mockResolvedValue([])
    render(<TasksContent />)
    await waitFor(() => {
      expect(screen.getByText("No tasks match your filter.")).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole("button", { name: /New Task/i }))

    // The grid containing Task Type and Assign To should have responsive classes
    const taskTypeLabel = screen.getByText("Task Type")
    const grid = taskTypeLabel.closest(".grid")
    expect(grid?.className).toContain("grid-cols-1")
    expect(grid?.className).toContain("sm:grid-cols-2")
  })
})

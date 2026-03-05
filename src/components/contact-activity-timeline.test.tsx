/**
 * Tests for the Contact Activity Timeline component.
 *
 * Covers:
 * - Loading state
 * - Event rendering
 * - Empty state
 */
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { vi, describe, it, expect, beforeEach } from "vitest"

// ---- Mocks ----------------------------------------------------------------

const mockGetContactActivity = vi.fn()

vi.mock("@/app/actions/contacts", () => ({
  getContactActivity: (...args: any[]) => mockGetContactActivity(...args),
}))

// ---- Import under test (after mocks) --------------------------------------

import { ContactActivityTimeline } from "./contact-activity-timeline"

// ---- Tests -----------------------------------------------------------------

describe("ContactActivityTimeline", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("shows loading state when dialog opens", async () => {
    const user = userEvent.setup()
    // Make the action hang
    mockGetContactActivity.mockReturnValue(new Promise(() => {}))

    render(
      <ContactActivityTimeline contactId="c-1" contactName="Alice Wong">
        <button>Open Activity</button>
      </ContactActivityTimeline>
    )

    await user.click(screen.getByText("Open Activity"))

    await waitFor(() => {
      expect(screen.getByTestId("activity-loading")).toBeInTheDocument()
    })
  })

  it("renders activity events after loading", async () => {
    const user = userEvent.setup()
    mockGetContactActivity.mockResolvedValue([
      {
        type: "contact_created",
        date: "2025-01-01T10:00:00Z",
        detail: 'Contact "Alice Wong" was created',
      },
      {
        type: "draft_generated",
        date: "2025-02-15T14:00:00Z",
        detail: 'Draft generated: "Quick note on police overtime"',
      },
      {
        type: "email_sent",
        date: "2025-02-16T09:00:00Z",
        detail: 'Email sent: "Quick note on police overtime"',
      },
    ])

    render(
      <ContactActivityTimeline contactId="c-1" contactName="Alice Wong">
        <button>Open Activity</button>
      </ContactActivityTimeline>
    )

    await user.click(screen.getByText("Open Activity"))

    await waitFor(() => {
      expect(screen.getByTestId("activity-list")).toBeInTheDocument()
    })

    expect(screen.getByText(/Contact "Alice Wong" was created/)).toBeInTheDocument()
    expect(screen.getByText(/Draft generated/)).toBeInTheDocument()
    expect(screen.getByText(/Email sent/)).toBeInTheDocument()

    // Badge labels
    expect(screen.getByText("Created")).toBeInTheDocument()
    expect(screen.getByText("Draft")).toBeInTheDocument()
    expect(screen.getByText("Sent")).toBeInTheDocument()
  })

  it("shows empty state when no activity exists", async () => {
    const user = userEvent.setup()
    mockGetContactActivity.mockResolvedValue([])

    render(
      <ContactActivityTimeline contactId="c-1" contactName="Alice Wong">
        <button>Open Activity</button>
      </ContactActivityTimeline>
    )

    await user.click(screen.getByText("Open Activity"))

    await waitFor(() => {
      expect(screen.getByTestId("activity-empty")).toBeInTheDocument()
    })
    expect(screen.getByText(/no activity recorded yet/i)).toBeInTheDocument()
  })

  it("shows dialog title with contact name", async () => {
    const user = userEvent.setup()
    mockGetContactActivity.mockResolvedValue([])

    render(
      <ContactActivityTimeline contactId="c-1" contactName="Bob Chen">
        <button>Open Activity</button>
      </ContactActivityTimeline>
    )

    await user.click(screen.getByText("Open Activity"))

    await waitFor(() => {
      expect(screen.getByText("Activity — Bob Chen")).toBeInTheDocument()
    })
  })

  it("calls getContactActivity with the correct contactId", async () => {
    const user = userEvent.setup()
    mockGetContactActivity.mockResolvedValue([])

    render(
      <ContactActivityTimeline contactId="c-42" contactName="Test">
        <button>Open Activity</button>
      </ContactActivityTimeline>
    )

    await user.click(screen.getByText("Open Activity"))

    await waitFor(() => {
      expect(mockGetContactActivity).toHaveBeenCalledWith("c-42")
    })
  })
})

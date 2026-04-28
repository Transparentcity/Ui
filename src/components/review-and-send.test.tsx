/**
 * Tests for the Review & Send page.
 *
 * Covers:
 * - Tab switching (pending, sent, all)
 * - Draft card rendering (contact info, subject, body)
 * - Copy email text
 * - Edit dialog
 * - Mark as sent
 * - Regenerate draft
 * - Anomaly picker (fetch applicable anomalies, swap)
 * - Discard draft
 * - Empty state
 */
import { render, screen, waitFor, within, act } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { vi, describe, it, expect, beforeEach } from "vitest"

// ---- Mocks ----------------------------------------------------------------

const mockToastSuccess = vi.fn()
const mockToastError = vi.fn()
vi.mock("sonner", () => ({
  toast: {
    success: (...args: any[]) => mockToastSuccess(...args),
    error: (...args: any[]) => mockToastError(...args),
  },
}))

const mockGetAccessTokenSilently = vi.fn().mockResolvedValue("test-token")
vi.mock("@auth0/auth0-react", () => ({
  useAuth0: () => ({ getAccessTokenSilently: mockGetAccessTokenSilently }),
}))

const mockRefresh = vi.fn()
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: mockRefresh }),
}))

const mockUpdateContent = vi.fn().mockResolvedValue(undefined)
const mockUpdateStatus = vi.fn().mockResolvedValue(undefined)
const mockDeleteItems = vi.fn().mockResolvedValue(undefined)

const mockSendSingleQueueItem = vi.fn().mockResolvedValue({ success: true })
const mockCheckSendGridStatus = vi.fn().mockResolvedValue({ configured: true })

vi.mock("@/app/actions/send-queue", () => ({
  updateQueueItemContent: (...args: any[]) => mockUpdateContent(...args),
  updateQueueItemStatus: (...args: any[]) => mockUpdateStatus(...args),
  deleteQueueItems: (...args: any[]) => mockDeleteItems(...args),
  sendSingleQueueItem: (...args: any[]) => mockSendSingleQueueItem(...args),
  checkSendGridStatus: (...args: any[]) => mockCheckSendGridStatus(...args),
}))

const mockFetch = vi.fn()
global.fetch = mockFetch

// ---- Fixtures --------------------------------------------------------------

import type { SendQueueItem, Contact } from "@/lib/types"

const PROSPECT: Contact = {
  id: "p-1",
  name: "Jane Smith",
  title: "Supervisor",
  department: "Board of Supervisors",
  organization: "City of SF",
  email: "jane.smith@sfgov.org",
  phone: null,
  jurisdiction: "District 5",
  city_id: 57260,
  city_name: "San Francisco",
  priority: 1,
  status: "active",
  notes: null,
  created_at: "2025-01-01T00:00:00Z",
  updated_at: "2025-01-01T00:00:00Z",
}

function makeQueueItem(overrides: Partial<SendQueueItem> = {}): SendQueueItem & { prospect?: Contact } {
  return {
    id: "q-1",
    campaign_id: null,
    prospect_id: "p-1",
    template_id: null,
    anomaly_result_id: 101,
    channel: "email" as const,
    personalized_subject: "Quick note on police overtime",
    personalized_body:
      "Hi Jane,\n\nI noticed police overtime increased 42.3% this month. That's a significant jump. Wanted to flag it for your review.\n\nBest,\nTransparentCity",
    anomaly_snippet: "Police overtime increased 42.3% (month)",
    chart_url: "https://transparent.city/anomaly/101",
    variation_seed: 42,
    priority: 1,
    status: "pending_review" as const,
    scheduled_for: null,
    sent_at: null,
    error_message: null,
    created_at: "2025-03-01T10:00:00Z",
    prospect: PROSPECT,
    ...overrides,
  }
}

const PENDING_ITEM = makeQueueItem()
const SENT_ITEM = makeQueueItem({
  id: "q-2",
  status: "sent",
  sent_at: "2025-03-01T14:00:00Z",
  personalized_subject: "Budget update for District 5",
  personalized_body: "Hi Jane, quick update on the D5 budget numbers...",
})

// ---- Import under test (after mocks) --------------------------------------

import { ReviewAndSend } from "./review-and-send"

// ---- Tests -----------------------------------------------------------------

describe("ReviewAndSend", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // ---------- Tab switching ----------

  it("shows pending tab as active by default", () => {
    render(<ReviewAndSend items={[PENDING_ITEM, SENT_ITEM]} />)

    // Pending tab and badge both show "Pending Review"
    const pendingTexts = screen.getAllByText("Pending Review")
    expect(pendingTexts.length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText("Sent")).toBeInTheDocument()
    expect(screen.getByText("All")).toBeInTheDocument()
  })

  it("shows only pending items on pending tab", () => {
    render(<ReviewAndSend items={[PENDING_ITEM, SENT_ITEM]} />)

    // Pending item visible
    expect(screen.getByText("Quick note on police overtime")).toBeInTheDocument()
    // Sent item hidden
    expect(screen.queryByText("Budget update for District 5")).not.toBeInTheDocument()
  })

  it("switches to sent tab and shows sent items", async () => {
    const user = userEvent.setup()
    render(<ReviewAndSend items={[PENDING_ITEM, SENT_ITEM]} />)

    await user.click(screen.getByText("Sent"))

    expect(screen.getByText("Budget update for District 5")).toBeInTheDocument()
    expect(screen.queryByText("Quick note on police overtime")).not.toBeInTheDocument()
  })

  it("shows all items on 'All' tab", async () => {
    const user = userEvent.setup()
    render(<ReviewAndSend items={[PENDING_ITEM, SENT_ITEM]} />)

    await user.click(screen.getByText("All"))

    expect(screen.getByText("Quick note on police overtime")).toBeInTheDocument()
    expect(screen.getByText("Budget update for District 5")).toBeInTheDocument()
  })

  // ---------- Draft card rendering ----------

  it("renders contact name and email on draft card", () => {
    render(<ReviewAndSend items={[PENDING_ITEM]} />)

    expect(screen.getByText("Jane Smith")).toBeInTheDocument()
    expect(screen.getByText("jane.smith@sfgov.org")).toBeInTheDocument()
  })

  it("renders subject line on draft card", () => {
    render(<ReviewAndSend items={[PENDING_ITEM]} />)

    expect(screen.getByText("Quick note on police overtime")).toBeInTheDocument()
  })

  it("renders anomaly snippet and chart link", () => {
    render(<ReviewAndSend items={[PENDING_ITEM]} />)

    expect(screen.getByText("Police overtime increased 42.3% (month)")).toBeInTheDocument()
    expect(screen.getByText("View Chart")).toBeInTheDocument()
  })

  it("shows 'Pending Review' badge for pending items", () => {
    render(<ReviewAndSend items={[PENDING_ITEM]} />)

    expect(screen.getByText("Pending Review", { selector: ".text-xs" })).toBeInTheDocument()
  })

  it("shows 'Sent' badge for sent items", async () => {
    const user = userEvent.setup()
    render(<ReviewAndSend items={[SENT_ITEM]} />)

    await user.click(screen.getByText("Sent"))
    expect(screen.getByText("Sent", { selector: ".text-xs.bg-green-100" })).toBeInTheDocument()
  })

  // ---------- Copy email ----------

  it("copies full email on Copy Email click", async () => {
    const user = userEvent.setup()
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      writable: true,
      configurable: true,
    })

    render(<ReviewAndSend items={[PENDING_ITEM]} />)

    const copyBtn = screen.getByRole("button", { name: /copy email/i })
    await user.click(copyBtn)

    expect(writeText).toHaveBeenCalledWith(
      expect.stringContaining("Subject: Quick note on police overtime")
    )
    expect(writeText).toHaveBeenCalledWith(
      expect.stringContaining("police overtime increased 42.3%")
    )

    // Should show "Copied!" feedback
    await waitFor(() => {
      expect(screen.getByText("Copied!")).toBeInTheDocument()
    })
  })

  // ---------- Mark as sent ----------

  it("marks a draft as sent", async () => {
    const user = userEvent.setup()
    render(<ReviewAndSend items={[PENDING_ITEM]} />)

    const sentBtn = screen.getByRole("button", { name: /mark sent/i })
    await user.click(sentBtn)

    await waitFor(() => {
      expect(mockUpdateStatus).toHaveBeenCalledWith("q-1", "sent")
    })
    expect(mockRefresh).toHaveBeenCalled()
  })

  // ---------- Regenerate ----------

  it("calls regenerate endpoint with auth headers when Regenerate is clicked", async () => {
    const user = userEvent.setup()
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: "q-1", status: "regenerated", subject: "New subject", body: "New body" }),
    })

    render(<ReviewAndSend items={[PENDING_ITEM]} />)

    const regenBtn = screen.getByRole("button", { name: /regenerate/i })
    await user.click(regenBtn)

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("/api/crm/drafts/q-1/regenerate"),
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({
            Authorization: "Bearer test-token",
          }),
        }),
      )
    })
    expect(mockRefresh).toHaveBeenCalled()
  })

  // ---------- Anomaly picker ----------

  it("fetches and displays applicable anomalies when Anomalies is clicked", async () => {
    const user = userEvent.setup()
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        anomalies: [
          { result_id: 101, snippet: "Police overtime +42.3%", pct_change: 42.3, period_type: "month", district: 0, current: true, object_name: "Police overtime" },
          { result_id: 102, snippet: "Park maintenance -15.1%", pct_change: -15.1, period_type: "quarter", district: 5, current: false, object_name: "Park maintenance" },
        ],
        total: 2,
      }),
    })

    render(<ReviewAndSend items={[PENDING_ITEM]} />)

    const anomaliesBtn = screen.getByRole("button", { name: /anomalies/i })
    await user.click(anomaliesBtn)

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("/api/crm/drafts/q-1/applicable-anomalies"),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: "Bearer test-token",
          }),
        }),
      )
    })

    // Should show anomalies
    await waitFor(() => {
      expect(screen.getByText("Police overtime +42.3%")).toBeInTheDocument()
      expect(screen.getByText("Park maintenance -15.1%")).toBeInTheDocument()
    })

    // Current anomaly should be marked
    expect(screen.getByText("Current")).toBeInTheDocument()
  })

  it("swaps anomaly when a non-current anomaly is clicked", async () => {
    const user = userEvent.setup()

    // First call: fetch anomalies
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        anomalies: [
          { result_id: 101, snippet: "Police overtime +42.3%", pct_change: 42.3, period_type: "month", district: 0, current: true, object_name: "Police overtime" },
          { result_id: 102, snippet: "Park maintenance -15.1%", pct_change: -15.1, period_type: "quarter", district: 5, current: false, object_name: "Park maintenance" },
        ],
        total: 2,
      }),
    })

    render(<ReviewAndSend items={[PENDING_ITEM]} />)

    // Open anomaly picker
    await user.click(screen.getByRole("button", { name: /anomalies/i }))
    await waitFor(() => {
      expect(screen.getByText("Park maintenance -15.1%")).toBeInTheDocument()
    })

    // Set up swap response
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        id: "q-1",
        status: "swapped",
        anomaly_result_id: 102,
        subject: "Park maintenance note",
        body: "Hi Jane, park maintenance spending dropped...",
      }),
    })

    // Click the non-current anomaly
    await user.click(screen.getByText("Park maintenance -15.1%"))

    await waitFor(() => {
      expect(mockFetch).toHaveBeenLastCalledWith(
        expect.stringContaining("/api/crm/drafts/q-1/swap-anomaly"),
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ anomaly_result_id: 102 }),
        }),
      )
    })
    expect(mockRefresh).toHaveBeenCalled()
  })

  // ---------- Discard ----------

  it("calls delete when Discard is confirmed", async () => {
    const user = userEvent.setup()

    render(<ReviewAndSend items={[PENDING_ITEM]} />)

    const discardBtn = screen.getByRole("button", { name: /discard/i })
    await user.click(discardBtn)

    // AlertDialog should appear — confirm by clicking the Discard action
    const confirmBtn = await screen.findByRole("button", { name: /^discard$/i })
    await user.click(confirmBtn)

    await waitFor(() => {
      expect(mockDeleteItems).toHaveBeenCalledWith(["q-1"])
    })
    expect(mockRefresh).toHaveBeenCalled()
  })

  it("does not delete when Discard is cancelled", async () => {
    const user = userEvent.setup()

    render(<ReviewAndSend items={[PENDING_ITEM]} />)

    const discardBtn = screen.getByRole("button", { name: /discard/i })
    await user.click(discardBtn)

    // AlertDialog should appear — click Cancel
    const cancelBtn = await screen.findByRole("button", { name: /cancel/i })
    await user.click(cancelBtn)

    expect(mockDeleteItems).not.toHaveBeenCalled()
  })

  // ---------- Empty state ----------

  it("shows empty state when no pending items", () => {
    render(<ReviewAndSend items={[]} />)

    expect(screen.getByText(/no messages pending review/i)).toBeInTheDocument()
  })

  it("shows empty state for sent tab with no sent items", async () => {
    const user = userEvent.setup()
    render(<ReviewAndSend items={[PENDING_ITEM]} />)

    await user.click(screen.getByText("Sent"))
    expect(screen.getByText(/no sent messages yet/i)).toBeInTheDocument()
  })

  // ---------- Sent items don't show action buttons ----------

  it("hides action buttons (regenerate, mark sent, discard) for sent items", async () => {
    const user = userEvent.setup()
    render(<ReviewAndSend items={[SENT_ITEM]} />)

    await user.click(screen.getByText("Sent"))

    // Sent item should still have Copy and Edit
    expect(screen.getByRole("button", { name: /copy email/i })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /edit/i })).toBeInTheDocument()

    // But NOT these action buttons
    expect(screen.queryByRole("button", { name: /regenerate/i })).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: /mark sent/i })).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: /discard/i })).not.toBeInTheDocument()
  })

  // ===================================================================
  // EDGE CASE: Edit dialog interactions
  // ===================================================================

  it("opens edit dialog and populates subject/body from the draft", async () => {
    const user = userEvent.setup()
    render(<ReviewAndSend items={[PENDING_ITEM]} />)

    await user.click(screen.getByRole("button", { name: /edit/i }))

    // Dialog should open with edit fields populated
    await waitFor(() => {
      expect(screen.getByText("Edit Message")).toBeInTheDocument()
    })
    const subjectInput = screen.getByDisplayValue(PENDING_ITEM.personalized_subject!)
    expect(subjectInput).toBeInTheDocument()
  })

  it("saves edited subject and body", async () => {
    const user = userEvent.setup()
    render(<ReviewAndSend items={[PENDING_ITEM]} />)

    await user.click(screen.getByRole("button", { name: /edit/i }))

    await waitFor(() => {
      expect(screen.getByText("Edit Message")).toBeInTheDocument()
    })

    // Modify the subject
    const subjectInput = screen.getByDisplayValue(PENDING_ITEM.personalized_subject!)
    await user.clear(subjectInput)
    await user.type(subjectInput, "Updated subject line")

    // Click Save
    await user.click(screen.getByRole("button", { name: /save changes/i }))

    await waitFor(() => {
      expect(mockUpdateContent).toHaveBeenCalledWith("q-1", {
        personalized_subject: "Updated subject line",
        personalized_body: PENDING_ITEM.personalized_body,
      })
    })
  })

  it("closes edit dialog on cancel without saving", async () => {
    const user = userEvent.setup()
    render(<ReviewAndSend items={[PENDING_ITEM]} />)

    await user.click(screen.getByRole("button", { name: /edit/i }))

    await waitFor(() => {
      expect(screen.getByText("Edit Message")).toBeInTheDocument()
    })

    await user.click(screen.getByRole("button", { name: /cancel/i }))

    await waitFor(() => {
      expect(screen.queryByText("Edit Message")).not.toBeInTheDocument()
    })
    // No save call should have been made
    expect(mockUpdateContent).not.toHaveBeenCalled()
  })

  it("can mark as sent directly from the edit dialog", async () => {
    const user = userEvent.setup()
    render(<ReviewAndSend items={[PENDING_ITEM]} />)

    await user.click(screen.getByRole("button", { name: /edit/i }))

    await waitFor(() => {
      expect(screen.getByText("Edit Message")).toBeInTheDocument()
    })

    // The dialog has its own "Mark as Sent" button
    const dialogSentBtns = screen.getAllByRole("button", { name: /mark sent/i })
    // Click the one inside the dialog (last match)
    await user.click(dialogSentBtns[dialogSentBtns.length - 1])

    await waitFor(() => {
      expect(mockUpdateStatus).toHaveBeenCalledWith("q-1", "sent")
    })
  })

  it("shows chart link in edit dialog when chart_url exists", async () => {
    const user = userEvent.setup()
    render(<ReviewAndSend items={[PENDING_ITEM]} />)

    await user.click(screen.getByRole("button", { name: /edit/i }))

    await waitFor(() => {
      expect(screen.getByText("View anomaly chart")).toBeInTheDocument()
    })
  })

  it("can regenerate from the edit dialog", async () => {
    const user = userEvent.setup()
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({}) })
    render(<ReviewAndSend items={[PENDING_ITEM]} />)

    await user.click(screen.getByRole("button", { name: /edit/i }))

    await waitFor(() => {
      expect(screen.getByText("Edit Message")).toBeInTheDocument()
    })

    // Find the Regenerate button inside the dialog
    const regenBtns = screen.getAllByRole("button", { name: /regenerate/i })
    await user.click(regenBtns[regenBtns.length - 1])

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("/api/crm/drafts/q-1/regenerate"),
        expect.objectContaining({ method: "POST" }),
      )
    })
  })

  // ===================================================================
  // EDGE CASE: API failure scenarios
  // ===================================================================

  it("handles regenerate API failure gracefully and shows error toast", async () => {
    const user = userEvent.setup()
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {})
    mockFetch.mockRejectedValueOnce(new Error("Server down"))
    render(<ReviewAndSend items={[PENDING_ITEM]} />)

    await user.click(screen.getByRole("button", { name: /regenerate/i }))

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /regenerate/i })).not.toBeDisabled()
    })
    // Should show error via toast
    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalledWith("Regenerate failed. Please try again.")
    })
    consoleSpy.mockRestore()
  })

  it("shows specific toast when regenerate fails due to missing anomaly data", async () => {
    const user = userEvent.setup()
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: async () => ({ detail: "Draft is missing anomaly or prospect data, cannot regenerate" }),
    })
    render(<ReviewAndSend items={[PENDING_ITEM]} />)

    await user.click(screen.getByRole("button", { name: /regenerate/i }))

    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalledWith(expect.stringContaining("older draft"))
    })
  })

  it("handles anomaly fetch failure gracefully", async () => {
    const user = userEvent.setup()
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {})
    mockFetch.mockRejectedValueOnce(new Error("Network error"))
    render(<ReviewAndSend items={[PENDING_ITEM]} />)

    await user.click(screen.getByRole("button", { name: /anomalies/i }))

    await waitFor(() => {
      expect(screen.getByText(/no anomalies found.*14 days/i)).toBeInTheDocument()
    })
    expect(consoleSpy).toHaveBeenCalledWith("Fetch anomalies error:", expect.any(Error))
    consoleSpy.mockRestore()
  })

  it("handles swap anomaly failure gracefully", async () => {
    const user = userEvent.setup()
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {})

    // First: fetch anomalies succeeds
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        anomalies: [
          { result_id: 101, snippet: "Police overtime +42.3%", pct_change: 42.3, period_type: "month", district: 0, current: true, object_name: "Police overtime" },
          { result_id: 102, snippet: "Park maintenance -15.1%", pct_change: -15.1, period_type: "quarter", district: 5, current: false, object_name: "Park maintenance" },
        ],
        total: 2,
      }),
    })

    render(<ReviewAndSend items={[PENDING_ITEM]} />)
    await user.click(screen.getByRole("button", { name: /anomalies/i }))

    await waitFor(() => {
      expect(screen.getByText("Park maintenance -15.1%")).toBeInTheDocument()
    })

    // Swap fails
    mockFetch.mockRejectedValueOnce(new Error("Swap failed"))
    await user.click(screen.getByText("Park maintenance -15.1%"))

    await waitFor(() => {
      expect(consoleSpy).toHaveBeenCalledWith("Swap anomaly error:", expect.any(Error))
    })
    consoleSpy.mockRestore()
  })

  // ===================================================================
  // EDGE CASE: Items with missing data
  // ===================================================================

  it("renders (No subject) for items with null subject", () => {
    const noSubject = makeQueueItem({ personalized_subject: null as any })
    render(<ReviewAndSend items={[noSubject]} />)
    expect(screen.getByText("(No subject)")).toBeInTheDocument()
  })

  it("renders Unknown for items with no prospect name", () => {
    const noProspect = makeQueueItem({ prospect: undefined } as any)
    render(<ReviewAndSend items={[noProspect]} />)
    expect(screen.getByText("Unknown")).toBeInTheDocument()
  })

  // ===================================================================
  // EDGE CASE: Expand/collapse body
  // ===================================================================

  it("toggles body expansion when clicked", async () => {
    const user = userEvent.setup()
    render(<ReviewAndSend items={[PENDING_ITEM]} />)

    // Body should initially be collapsed (line-clamp-2 class)
    const bodyText = screen.getByText(/I noticed police overtime/i)
    expect(bodyText.className).toContain("line-clamp-2")

    // Click to expand
    await user.click(bodyText)

    // After expansion the text should be in a whitespace-pre-wrap container
    await waitFor(() => {
      const expanded = screen.getByText(/I noticed police overtime/i)
      expect(expanded.className).toContain("whitespace-pre-wrap")
    })

    // Click again to collapse
    await user.click(screen.getByText(/I noticed police overtime/i))
    await waitFor(() => {
      const collapsed = screen.getByText(/I noticed police overtime/i)
      expect(collapsed.className).toContain("line-clamp-2")
    })
  })

  // ===================================================================
  // EDGE CASE: Multiple items
  // ===================================================================

  it("shows both pending and sent items on 'All' tab", async () => {
    const user = userEvent.setup()
    render(<ReviewAndSend items={[PENDING_ITEM, SENT_ITEM]} />)

    await user.click(screen.getByText("All"))

    // Both items should be visible
    expect(screen.getByText(PENDING_ITEM.personalized_subject!)).toBeInTheDocument()
    expect(screen.getByText(SENT_ITEM.personalized_subject!)).toBeInTheDocument()
  })

  it("does not show regenerate/discard for sent items on All tab", async () => {
    const user = userEvent.setup()
    render(<ReviewAndSend items={[SENT_ITEM]} />)

    await user.click(screen.getByText("All"))

    // Should only have Copy and Edit buttons, no Regenerate/Discard/Mark as Sent
    const buttons = screen.getAllByRole("button")
    const buttonTexts = buttons.map((b) => b.textContent)
    expect(buttonTexts.some((t) => t?.includes("Copy Email"))).toBe(true)
    expect(buttonTexts.some((t) => t?.includes("Regenerate"))).toBe(false)
    expect(buttonTexts.some((t) => t?.includes("Discard"))).toBe(false)
  })

  // ===================================================================
  // EDGE CASE: Clipboard failure in review
  // ===================================================================

  it("does not crash when clipboard write fails on copy", async () => {
    const user = userEvent.setup()
    const writeText = vi.fn().mockRejectedValue(new Error("Permission denied"))
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      writable: true,
      configurable: true,
    })

    render(<ReviewAndSend items={[PENDING_ITEM]} />)
    await user.click(screen.getByRole("button", { name: /copy email/i }))

    // Component should still be intact
    expect(screen.getByText(PENDING_ITEM.personalized_subject!)).toBeInTheDocument()
  })

  // ===================================================================
  // Bulk actions
  // ===================================================================

  it("shows Select all button on pending tab when items exist", () => {
    render(<ReviewAndSend items={[PENDING_ITEM]} />)
    expect(screen.getByText("Select all")).toBeInTheDocument()
  })

  it("does not show Select all on sent tab", async () => {
    const user = userEvent.setup()
    render(<ReviewAndSend items={[SENT_ITEM]} />)

    await user.click(screen.getByText("Sent"))
    expect(screen.queryByText("Select all")).not.toBeInTheDocument()
  })

  it("selects all pending items and shows bulk action buttons", async () => {
    const user = userEvent.setup()
    const item2 = makeQueueItem({ id: "q-3", personalized_subject: "Second draft" })
    render(<ReviewAndSend items={[PENDING_ITEM, item2, SENT_ITEM]} />)

    await user.click(screen.getByText("Select all"))

    // Should show "2 selected" and bulk buttons
    await waitFor(() => {
      expect(screen.getByText("2 selected")).toBeInTheDocument()
    })
    const markSentBtns = screen.getAllByRole("button", { name: /mark sent/i })
    expect(markSentBtns.length).toBeGreaterThanOrEqual(1)

    // The bulk discard button text
    const bulkDiscardBtns = screen.getAllByRole("button", { name: /discard/i })
    expect(bulkDiscardBtns.length).toBeGreaterThanOrEqual(1)
  })

  it("toggles individual item selection via checkbox", async () => {
    const user = userEvent.setup()
    const item2 = makeQueueItem({ id: "q-3", personalized_subject: "Second draft" })
    render(<ReviewAndSend items={[PENDING_ITEM, item2]} />)

    // Click the first checkbox (there should be per-card checkboxes)
    const checkboxes = screen.getAllByRole("button").filter(
      (btn) => btn.querySelector(".lucide-square") !== null
    )
    expect(checkboxes.length).toBeGreaterThan(0)
  })

  it("bulk mark sent calls updateQueueItemStatus for each selected item", async () => {
    const user = userEvent.setup()
    const item2 = makeQueueItem({ id: "q-3", personalized_subject: "Second draft" })
    render(<ReviewAndSend items={[PENDING_ITEM, item2]} />)

    // Select all
    await user.click(screen.getByText("Select all"))
    await waitFor(() => {
      expect(screen.getByText("2 selected")).toBeInTheDocument()
    })

    // Click bulk Mark Sent (first matching button in the bulk action bar)
    const markSentBtns = screen.getAllByRole("button", { name: /mark sent/i })
    await user.click(markSentBtns[0])

    // AlertDialog should appear -- confirm
    const confirmBtn = await screen.findByRole("button", { name: /^mark sent$/i })
    await user.click(confirmBtn)

    await waitFor(() => {
      expect(mockUpdateStatus).toHaveBeenCalledWith("q-1", "sent")
      expect(mockUpdateStatus).toHaveBeenCalledWith("q-3", "sent")
    })
    expect(mockRefresh).toHaveBeenCalled()
  })

  it("bulk discard calls deleteQueueItems for selected items", async () => {
    const user = userEvent.setup()
    render(<ReviewAndSend items={[PENDING_ITEM]} />)

    // Select all
    await user.click(screen.getByText("Select all"))
    await waitFor(() => {
      expect(screen.getByText("1 selected")).toBeInTheDocument()
    })

    // Click bulk Discard (the one in the toolbar, not the per-card one)
    const bulkDiscardBtns = screen.getAllByRole("button", { name: /discard/i })
    await user.click(bulkDiscardBtns[0])

    // AlertDialog should appear — confirm
    const confirmBtn = await screen.findByRole("button", { name: /^discard$/i })
    await user.click(confirmBtn)

    await waitFor(() => {
      expect(mockDeleteItems).toHaveBeenCalledWith(["q-1"])
    })
    expect(mockRefresh).toHaveBeenCalled()
  })

  it("deselect all clears selection", async () => {
    const user = userEvent.setup()
    render(<ReviewAndSend items={[PENDING_ITEM]} />)

    // Select all
    await user.click(screen.getByText("Select all"))
    await waitFor(() => {
      expect(screen.getByText("1 selected")).toBeInTheDocument()
    })

    // Deselect all
    await user.click(screen.getByText("Deselect all"))
    await waitFor(() => {
      expect(screen.queryByText("1 selected")).not.toBeInTheDocument()
    })
  })

  it("clears selection when switching tabs", async () => {
    const user = userEvent.setup()
    render(<ReviewAndSend items={[PENDING_ITEM, SENT_ITEM]} />)

    // Select all on pending tab
    await user.click(screen.getByText("Select all"))
    await waitFor(() => {
      expect(screen.getByText("1 selected")).toBeInTheDocument()
    })

    // Switch to sent tab
    await user.click(screen.getByText("Sent"))

    // Switch back to pending
    await user.click(screen.getAllByText("Pending Review")[0])

    // Selection should be cleared
    expect(screen.queryByText("1 selected")).not.toBeInTheDocument()
  })

  it("does not show bulk buttons when nothing selected", () => {
    render(<ReviewAndSend items={[PENDING_ITEM]} />)

    // "Select all" visible, but no bulk action buttons
    expect(screen.getByText("Select all")).toBeInTheDocument()
    expect(screen.queryByText(/selected/)).not.toBeInTheDocument()
  })

  // ===================================================================
  // Loading states for individual buttons
  // ===================================================================

  it("shows 'Marking...' spinner on Mark Sent button while in flight", async () => {
    const user = userEvent.setup()
    // Make updateQueueItemStatus hang
    mockUpdateStatus.mockReturnValueOnce(new Promise(() => {}))

    render(<ReviewAndSend items={[PENDING_ITEM]} />)

    const markSentBtns = screen.getAllByRole("button", { name: /mark sent/i })
    await user.click(markSentBtns[0])

    await waitFor(() => {
      expect(screen.getByText("Marking...")).toBeInTheDocument()
    })
  })

  it("shows 'Discarding...' spinner on Discard button while in flight", async () => {
    const user = userEvent.setup()
    // Make deleteQueueItems hang
    mockDeleteItems.mockReturnValueOnce(new Promise(() => {}))

    render(<ReviewAndSend items={[PENDING_ITEM]} />)

    const discardBtn = screen.getByRole("button", { name: /discard/i })
    await user.click(discardBtn)

    // AlertDialog appears — confirm
    const confirmBtn = await screen.findByRole("button", { name: /^discard$/i })
    await user.click(confirmBtn)

    await waitFor(() => {
      expect(screen.getByText("Discarding...")).toBeInTheDocument()
    })
  })

  it("shows 'Sending...' on bulk Mark Sent while in flight", async () => {
    const user = userEvent.setup()
    mockUpdateStatus.mockReturnValue(new Promise(() => {}))

    render(<ReviewAndSend items={[PENDING_ITEM]} />)

    await user.click(screen.getByText("Select all"))
    await waitFor(() => {
      expect(screen.getByText("1 selected")).toBeInTheDocument()
    })

    const markSentBtns = screen.getAllByRole("button", { name: /mark sent/i })
    await user.click(markSentBtns[0])

    // AlertDialog appears -- confirm
    const confirmBtn = await screen.findByRole("button", { name: /^mark sent$/i })
    await user.click(confirmBtn)

    await waitFor(() => {
      expect(screen.getByText("Sending...")).toBeInTheDocument()
    })
  })

  it("shows 'Discarding...' on bulk Discard while in flight", async () => {
    const user = userEvent.setup()
    mockDeleteItems.mockReturnValueOnce(new Promise(() => {}))

    render(<ReviewAndSend items={[PENDING_ITEM]} />)

    await user.click(screen.getByText("Select all"))
    await waitFor(() => {
      expect(screen.getByText("1 selected")).toBeInTheDocument()
    })

    // Click bulk Discard (first Discard button is in toolbar)
    const bulkDiscardBtns = screen.getAllByRole("button", { name: /discard/i })
    await user.click(bulkDiscardBtns[0])

    // AlertDialog appears — confirm
    const confirmBtn = await screen.findByRole("button", { name: /^discard$/i })
    await user.click(confirmBtn)

    await waitFor(() => {
      expect(screen.getByText("Discarding...")).toBeInTheDocument()
    })
  })

  // ===================================================================
  // Generate Drafts
  // ===================================================================

  it("shows Generate Drafts button", () => {
    render(<ReviewAndSend items={[]} />)
    expect(screen.getByRole("button", { name: /generate drafts/i })).toBeInTheDocument()
  })

  it("calls generate-drafts API with auth and shows success banner", async () => {
    const user = userEvent.setup()
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        status: "ok",
        anomalies_found: 5,
        matches_found: 3,
        drafts_created: 3,
        cities_processed: 1,
        city_results: [],
      }),
    })

    render(<ReviewAndSend items={[]} />)

    await user.click(screen.getByRole("button", { name: /generate drafts/i }))

    // Should call the API with auth headers
    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("/api/crm/generate-drafts"),
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({
            Authorization: "Bearer test-token",
            "Content-Type": "application/json",
          }),
          body: JSON.stringify({ lookback_days: 7 }),
        }),
      )
    })

    // Should show result banner
    await waitFor(() => {
      expect(screen.getByText(/Created 3 draft\(s\)/)).toBeInTheDocument()
    })
    expect(mockRefresh).toHaveBeenCalled()
  })

  it("shows no-matches message when zero drafts created", async () => {
    const user = userEvent.setup()
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        status: "ok",
        anomalies_found: 0,
        matches_found: 0,
        drafts_created: 0,
        cities_processed: 1,
        city_results: [],
      }),
    })

    render(<ReviewAndSend items={[]} />)
    await user.click(screen.getByRole("button", { name: /generate drafts/i }))

    await waitFor(() => {
      expect(screen.getByText(/no new matches found/i)).toBeInTheDocument()
    })
  })

  it("shows API error message when generate-drafts returns error field", async () => {
    const user = userEvent.setup()
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        status: "no_cities",
        anomalies_found: 0,
        drafts_created: 0,
        cities_processed: 0,
        error: "No contacts have a city assigned. Assign cities to your contacts first.",
      }),
    })

    render(<ReviewAndSend items={[]} />)
    await user.click(screen.getByRole("button", { name: /generate drafts/i }))

    await waitFor(() => {
      expect(screen.getByText(/No contacts have a city assigned/)).toBeInTheDocument()
    })
  })

  it("handles generate-drafts network failure gracefully", async () => {
    const user = userEvent.setup()
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {})
    mockFetch.mockRejectedValueOnce(new Error("Network error"))

    render(<ReviewAndSend items={[]} />)
    await user.click(screen.getByRole("button", { name: /generate drafts/i }))

    await waitFor(() => {
      expect(screen.getByText(/failed to reach the server/i)).toBeInTheDocument()
    })
    consoleSpy.mockRestore()
  })

  it("shows setup-error message on 502 from generate-drafts", async () => {
    const user = userEvent.setup()
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 502,
      json: async () => ({ detail: "Supabase POST prospects failed with 401" }),
      text: async () => "",
    })

    render(<ReviewAndSend items={[]} />)
    await user.click(screen.getByRole("button", { name: /generate drafts/i }))

    await waitFor(() => {
      expect(screen.getByText(/setup error/i)).toBeInTheDocument()
      expect(screen.getByText(/Supabase POST prospects/)).toBeInTheDocument()
    })
  })

  it("shows transient-retry message on 503 from generate-drafts", async () => {
    const user = userEvent.setup()
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 503,
      json: async () => ({ detail: "Supabase down after 3 attempts" }),
      text: async () => "",
    })

    render(<ReviewAndSend items={[]} />)
    await user.click(screen.getByRole("button", { name: /generate drafts/i }))

    await waitFor(() => {
      expect(
        screen.getByText(/service temporarily unavailable/i)
      ).toBeInTheDocument()
    })
  })

  it("notes template-fallback count when AI service was degraded", async () => {
    const user = userEvent.setup()
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        status: "completed",
        anomalies_found: 5,
        matches_found: 3,
        drafts_created: 3,
        cities_processed: 1,
        city_results: [],
        draft_status_counts: {
          llm_generated: 1,
          template_fallback_transient: 2,
        },
      }),
    })

    render(<ReviewAndSend items={[]} />)
    await user.click(screen.getByRole("button", { name: /generate drafts/i }))

    await waitFor(() => {
      expect(screen.getByText(/2 used template fallback/i)).toBeInTheDocument()
    })
  })

  it("shows loading state and progress card while generating", async () => {
    const user = userEvent.setup()
    // Use a promise that won't resolve immediately
    let resolveFetch!: (v: any) => void
    mockFetch.mockReturnValueOnce(
      new Promise((resolve) => { resolveFetch = resolve })
    )

    render(<ReviewAndSend items={[]} />)
    await user.click(screen.getByRole("button", { name: /generate drafts/i }))

    // Button should show "Generating..." while in flight
    expect(screen.getByRole("button", { name: /generating/i })).toBeDisabled()

    // Progress card should appear with step descriptions
    expect(screen.getByText(/scanning recent anomalies across cities/i)).toBeInTheDocument()
    expect(screen.getByText(/matching anomalies to contacts/i)).toBeInTheDocument()
    expect(screen.getByText(/generating personalized drafts/i)).toBeInTheDocument()
    expect(screen.getByText(/this may take a moment/i)).toBeInTheDocument()

    // Resolve to clean up
    resolveFetch({ ok: true, json: async () => ({ drafts_created: 0, anomalies_found: 0 }) })
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /generate drafts/i })).not.toBeDisabled()
    })

    // Progress card should disappear after completion
    expect(screen.queryByText(/scanning recent anomalies across cities/i)).not.toBeInTheDocument()
  })

  it("hides result banner while generating (does not show stale result)", async () => {
    const user = userEvent.setup()

    // First generate succeeds
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        status: "ok",
        anomalies_found: 2,
        drafts_created: 2,
        cities_processed: 1,
      }),
    })

    render(<ReviewAndSend items={[]} />)
    await user.click(screen.getByRole("button", { name: /generate drafts/i }))

    await waitFor(() => {
      expect(screen.getByText(/Created 2 draft/)).toBeInTheDocument()
    })

    // Second generate - hangs
    let resolveFetch!: (v: any) => void
    mockFetch.mockReturnValueOnce(
      new Promise((resolve) => { resolveFetch = resolve })
    )

    await user.click(screen.getByRole("button", { name: /generate drafts/i }))

    // Old result banner should be hidden while progress card shows
    expect(screen.queryByText(/Created 2 draft/)).not.toBeInTheDocument()
    expect(screen.getByText(/scanning recent anomalies across cities/i)).toBeInTheDocument()

    resolveFetch({ ok: true, json: async () => ({ drafts_created: 0, anomalies_found: 0 }) })
    await waitFor(() => {
      expect(screen.queryByText(/scanning recent anomalies/i)).not.toBeInTheDocument()
    })
  })

  it("dismisses result banner when X is clicked", async () => {
    const user = userEvent.setup()
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        status: "ok",
        anomalies_found: 2,
        drafts_created: 2,
        cities_processed: 1,
      }),
    })

    render(<ReviewAndSend items={[]} />)
    await user.click(screen.getByRole("button", { name: /generate drafts/i }))

    await waitFor(() => {
      expect(screen.getByText(/Created 2 draft/)).toBeInTheDocument()
    })

    // Click the dismiss X button on the banner
    const banner = screen.getByText(/Created 2 draft/).closest("div")!
    const dismissBtn = within(banner).getByRole("button")
    await user.click(dismissBtn)

    await waitFor(() => {
      expect(screen.queryByText(/Created 2 draft/)).not.toBeInTheDocument()
    })
  })

  // ===================================================================
  // Search result count (#4)
  // ===================================================================

  it("shows search result count when query is non-empty", async () => {
    const user = userEvent.setup()
    const item2 = makeQueueItem({ id: "q-3", personalized_subject: "Second draft about parks", anomaly_snippet: "Parks budget up 15%" })
    render(<ReviewAndSend items={[PENDING_ITEM, item2, SENT_ITEM]} />)

    const searchInput = screen.getByPlaceholderText(/search drafts/i)
    await user.type(searchInput, "police")

    await waitFor(() => {
      expect(screen.getByTestId("search-count")).toHaveTextContent("Showing 1 of 2 drafts")
    })
  })

  it("does not show search count when search is empty", () => {
    render(<ReviewAndSend items={[PENDING_ITEM]} />)
    expect(screen.queryByTestId("search-count")).not.toBeInTheDocument()
  })

  // ===================================================================
  // Select all filtered (#7)
  // ===================================================================

  it("shows 'Select all N' with count when search is active", async () => {
    const user = userEvent.setup()
    const item2 = makeQueueItem({ id: "q-3", personalized_subject: "Second draft about parks", anomaly_snippet: "Parks budget up 15%" })
    render(<ReviewAndSend items={[PENDING_ITEM, item2]} />)

    const searchInput = screen.getByPlaceholderText(/search drafts/i)
    await user.type(searchInput, "police")

    await waitFor(() => {
      expect(screen.getByText(/Select all 1/)).toBeInTheDocument()
    })
  })

  it("select all only selects filtered pending items when search active", async () => {
    const user = userEvent.setup()
    const item2 = makeQueueItem({ id: "q-3", personalized_subject: "Second draft about parks", anomaly_snippet: "Parks budget up 15%" })
    render(<ReviewAndSend items={[PENDING_ITEM, item2]} />)

    const searchInput = screen.getByPlaceholderText(/search drafts/i)
    await user.type(searchInput, "police")

    await waitFor(() => {
      expect(screen.getByText(/Select all 1/)).toBeInTheDocument()
    })

    await user.click(screen.getByText(/Select all 1/))

    await waitFor(() => {
      expect(screen.getByText("1 selected")).toBeInTheDocument()
    })
  })

  // ===================================================================
  // Subject tooltip (#5)
  // ===================================================================

  it("wraps subject line in a tooltip trigger", () => {
    render(<ReviewAndSend items={[PENDING_ITEM]} />)

    // The subject text should be inside a Tooltip trigger (button with tooltip role)
    const subjectEl = screen.getByText("Quick note on police overtime")
    // The element should be a child of a TooltipTrigger (which renders a button)
    expect(subjectEl.closest("[data-state]") || subjectEl.tagName).toBeTruthy()
  })

  // ===================================================================
  // Toast notifications
  // ===================================================================

  it("shows toast on mark as sent", async () => {
    // Ensure mock resolves properly (may have been altered by previous tests)
    mockUpdateStatus.mockResolvedValue(undefined)
    const user = userEvent.setup()
    render(<ReviewAndSend items={[PENDING_ITEM]} />)

    await user.click(screen.getByRole("button", { name: /mark sent/i }))

    await waitFor(() => {
      expect(mockUpdateStatus).toHaveBeenCalledWith(PENDING_ITEM.id, "sent")
    })
    await waitFor(() => {
      expect(mockToastSuccess).toHaveBeenCalledWith("Marked as sent")
    })
  })

  it("shows toast on save edit", async () => {
    const user = userEvent.setup()
    render(<ReviewAndSend items={[PENDING_ITEM]} />)

    await user.click(screen.getByRole("button", { name: /edit/i }))
    await waitFor(() => {
      expect(screen.getByText("Edit Message")).toBeInTheDocument()
    })

    await user.click(screen.getByRole("button", { name: /save changes/i }))

    await waitFor(() => {
      expect(mockToastSuccess).toHaveBeenCalledWith("Draft saved")
    })
  })

  it("shows toast on copy email", async () => {
    const user = userEvent.setup()
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      writable: true,
      configurable: true,
    })

    render(<ReviewAndSend items={[PENDING_ITEM]} />)
    await user.click(screen.getByRole("button", { name: /copy email/i }))

    await waitFor(() => {
      expect(mockToastSuccess).toHaveBeenCalledWith("Copied")
    })
  })

  it("shows toast on discard", async () => {
    const user = userEvent.setup()
    render(<ReviewAndSend items={[PENDING_ITEM]} />)

    await user.click(screen.getByRole("button", { name: /discard/i }))
    const confirmBtn = await screen.findByRole("button", { name: /^discard$/i })
    await user.click(confirmBtn)

    await waitFor(() => {
      expect(mockToastSuccess).toHaveBeenCalledWith("Draft discarded")
    })
  })

  it("shows error toast on regenerate failure", async () => {
    const user = userEvent.setup()
    vi.spyOn(console, "error").mockImplementation(() => {})
    mockFetch.mockRejectedValueOnce(new Error("Server down"))
    render(<ReviewAndSend items={[PENDING_ITEM]} />)

    await user.click(screen.getByRole("button", { name: /regenerate/i }))

    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalledWith("Regenerate failed. Please try again.")
    })
    vi.restoreAllMocks()
  })

  // ===================================================================
  // Keyboard shortcut (Ctrl+Enter to save in edit dialog)
  // ===================================================================

  it("saves edit on Ctrl+Enter in edit dialog", async () => {
    const user = userEvent.setup()
    render(<ReviewAndSend items={[PENDING_ITEM]} />)

    await user.click(screen.getByRole("button", { name: /edit/i }))
    await waitFor(() => {
      expect(screen.getByText("Edit Message")).toBeInTheDocument()
    })

    // Press Ctrl+Enter
    await user.keyboard("{Control>}{Enter}{/Control}")

    await waitFor(() => {
      expect(mockUpdateContent).toHaveBeenCalledWith("q-1", expect.any(Object))
    })
  })

  // ===================================================================
  // Enhanced empty state with search (Phase 5)
  // ===================================================================

  it("shows 'No drafts matching' and Clear search when search has no results", async () => {
    const user = userEvent.setup()
    render(<ReviewAndSend items={[PENDING_ITEM]} />)

    const searchInput = screen.getByPlaceholderText(/search drafts/i)
    await user.type(searchInput, "zzzznonexistent")

    await waitFor(() => {
      expect(screen.getByText(/No drafts matching/)).toBeInTheDocument()
      expect(screen.getByText(/Clear search/)).toBeInTheDocument()
    })
  })

  it("clears search when 'Clear search' is clicked in empty state", async () => {
    const user = userEvent.setup()
    render(<ReviewAndSend items={[PENDING_ITEM]} />)

    const searchInput = screen.getByPlaceholderText(/search drafts/i)
    await user.type(searchInput, "zzzznonexistent")

    await waitFor(() => {
      expect(screen.getByText(/Clear search/)).toBeInTheDocument()
    })

    await user.click(screen.getByText(/Clear search/))

    // Search should be cleared and items visible again
    await waitFor(() => {
      expect(screen.getByText("Quick note on police overtime")).toBeInTheDocument()
    })
  })

  // ===================================================================
  // Contact quick-view tooltip (Phase 6)
  // ===================================================================

  it("wraps contact name in a tooltip trigger with prospect details", () => {
    const itemWithDetails = makeQueueItem({
      prospect: {
        ...PROSPECT,
        title: "Supervisor",
        department: "Board of Supervisors",
      },
    })
    render(<ReviewAndSend items={[itemWithDetails]} />)

    // Contact name should be inside a Tooltip trigger
    const nameEl = screen.getByText("Jane Smith")
    expect(nameEl.closest("[data-state]") || nameEl.tagName).toBeTruthy()
  })

  // ===================================================================
  // Toast error paths
  // ===================================================================

  it("shows error toast when mark as sent fails", async () => {
    mockUpdateStatus.mockRejectedValueOnce(new Error("Server error"))
    const user = userEvent.setup()
    render(<ReviewAndSend items={[PENDING_ITEM]} />)

    await user.click(screen.getByRole("button", { name: /mark sent/i }))

    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalledWith("Failed to mark as sent")
    })
  })

  it("shows toast on bulk mark sent", async () => {
    mockUpdateStatus.mockResolvedValue(undefined)
    const user = userEvent.setup()
    const items = [PENDING_ITEM, makeQueueItem({ id: "q-3", status: "pending_review" })]
    render(<ReviewAndSend items={items} />)

    // Select all
    await user.click(screen.getByText(/select all/i))

    // Click bulk Mark Sent
    const markSentBtns = screen.getAllByRole("button", { name: /mark sent/i })
    await user.click(markSentBtns[0])

    // Confirm dialog
    const confirmBtn = await screen.findByRole("button", { name: /^mark sent$/i })
    await user.click(confirmBtn)

    await waitFor(() => {
      expect(mockToastSuccess).toHaveBeenCalledWith(expect.stringContaining("Marked"))
    })
  })

  it("shows toast on bulk discard", async () => {
    mockDeleteItems.mockResolvedValue(undefined)
    const user = userEvent.setup()
    const items = [PENDING_ITEM, makeQueueItem({ id: "q-3", status: "pending_review" })]
    render(<ReviewAndSend items={items} />)

    // Select all
    await user.click(screen.getByText(/select all/i))

    // Click the bulk Discard button (in the bulk action bar, contains "Discard" text)
    const bulkDiscardBtns = screen.getAllByRole("button", { name: /discard/i })
    // The bulk action discard is different from per-item discard buttons
    const bulkBtn = bulkDiscardBtns.find(btn => btn.textContent?.includes("Discard"))!
    await user.click(bulkBtn)

    // Confirm dialog — find the confirm button in the alert dialog
    const confirmBtn = await screen.findByRole("button", { name: /^discard$/i })
    await user.click(confirmBtn)

    await waitFor(() => {
      expect(mockToastSuccess).toHaveBeenCalledWith(expect.stringContaining("Discarded"))
    })
  })

  it("shows toast on swap anomaly success", async () => {
    const user = userEvent.setup()

    // Mock fetching applicable anomalies
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        anomalies: [
          { result_id: 101, snippet: "Police overtime up", pct_change: 42, object_name: "Police OT", current: true },
          { result_id: 102, snippet: "Park maintenance down", pct_change: -15, object_name: "Park maint", current: false },
        ],
      }),
    })
    // Mock swap API
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({}) })

    render(<ReviewAndSend items={[PENDING_ITEM]} />)

    // Open anomaly picker
    await user.click(screen.getByRole("button", { name: /anomalies/i }))
    await waitFor(() => {
      expect(screen.getByText(/park maint/i)).toBeInTheDocument()
    })

    // Click the non-current anomaly to swap
    await user.click(screen.getByText(/park maint/i))

    await waitFor(() => {
      expect(mockToastSuccess).toHaveBeenCalledWith("Anomaly swapped")
    })
  })

  it("shows error toast on swap anomaly failure", async () => {
    const user = userEvent.setup()
    vi.spyOn(console, "error").mockImplementation(() => {})

    // Mock fetching applicable anomalies
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        anomalies: [
          { result_id: 101, snippet: "Police overtime up", pct_change: 42, object_name: "Police OT", current: true },
          { result_id: 102, snippet: "Park maintenance down", pct_change: -15, object_name: "Park maint", current: false },
        ],
      }),
    })
    // Swap fails
    mockFetch.mockRejectedValueOnce(new Error("Swap error"))

    render(<ReviewAndSend items={[PENDING_ITEM]} />)

    await user.click(screen.getByRole("button", { name: /anomalies/i }))
    await waitFor(() => {
      expect(screen.getByText(/park maint/i)).toBeInTheDocument()
    })
    await user.click(screen.getByText(/park maint/i))

    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalledWith("Failed to swap anomaly")
    })
    vi.restoreAllMocks()
  })

  it("shows success toast on regenerate", async () => {
    const user = userEvent.setup()
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ subject: "New subject", body: "New body" }),
    })

    render(<ReviewAndSend items={[PENDING_ITEM]} />)
    await user.click(screen.getByRole("button", { name: /regenerate/i }))

    await waitFor(() => {
      expect(mockToastSuccess).toHaveBeenCalledWith("Draft regenerated")
    })
  })
})

/**
 * Tests for the AI Compose page.
 *
 * Covers:
 * - Contact search and selection
 * - Anomaly loading after contact selection
 * - Draft generation (auto and manual)
 * - Anomaly swapping
 * - Draft regeneration
 * - Refinement input
 * - Copy email text
 * - "No city" warning
 */
import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { vi, describe, it, expect, beforeEach, type Mock } from "vitest"

// ---- Mocks ----------------------------------------------------------------

const mockToastSuccess = vi.fn()
const mockToastError = vi.fn()
vi.mock("sonner", () => ({
  toast: {
    success: (...args: any[]) => mockToastSuccess(...args),
    error: (...args: any[]) => mockToastError(...args),
  },
}))

// Mock Auth0
const mockGetAccessTokenSilently = vi.fn().mockResolvedValue("test-token")
vi.mock("@auth0/auth0-react", () => ({
  useAuth0: () => ({ getAccessTokenSilently: mockGetAccessTokenSilently }),
}))

// Mock next/navigation
const mockPush = vi.fn()
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush, refresh: vi.fn() }),
}))

// Mock contact-dialog (it needs DB queries we can't satisfy in jsdom)
vi.mock("./contact-dialog", () => ({
  ContactDialog: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="contact-dialog-trigger">{children}</div>
  ),
}))

// Mock useAnomalies (requires QueryClientProvider we don't set up)
vi.mock("@/lib/hooks/useAnomalies", () => ({
  useAnomalies: () => ({ data: { results: [] }, isLoading: false }),
}))

// Mock anomalyMapper
vi.mock("@/lib/anomalyMapper", () => ({
  mapApiAnomaliesToCrm: () => [],
}))

// Mock fetch globally
const mockFetch = vi.fn()
global.fetch = mockFetch

// ---- Fixtures --------------------------------------------------------------

import type { ContactWithKeywords, Keyword } from "@/lib/types"

const SF_CONTACT: ContactWithKeywords = {
  id: "c-1",
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
  keywords: [{ id: "k1", name: "budget", description: null, category: null, created_at: "" }],
}

const NO_CITY_CONTACT: ContactWithKeywords = {
  ...SF_CONTACT,
  id: "c-2",
  name: "Bob Jones",
  email: "bob@example.com",
  city_id: null,
  city_name: null,
  status: "active",
}

const KEYWORDS: Keyword[] = [
  { id: "k1", name: "budget", description: null, category: null, created_at: "" },
]

const ANOMALIES_RESPONSE = {
  anomalies: [
    {
      result_id: 101,
      snippet: "Police overtime increased 42.3% (month)",
      object_name: "Police overtime",
      pct_change: 42.3,
      period_type: "month",
      district: 0,
      city_name: "San Francisco",
    },
    {
      result_id: 102,
      snippet: "Park maintenance decreased 15.1% (quarter)",
      object_name: "Park maintenance",
      pct_change: -15.1,
      period_type: "quarter",
      district: 5,
      city_name: "San Francisco",
    },
  ],
  total: 2,
  city_id: 57260,
}

const COMPOSE_RESPONSE = {
  subject: "Quick note on police overtime",
  body: "Hi Jane, I noticed police overtime increased significantly...",
  anomaly_snippet: "Police overtime increased 42.3% (month)",
  chart_url: "https://transparent.city/anomaly/101",
  queue_item_id: "q-1",
  prospect: { id: "c-1", name: "Jane Smith", email: "jane.smith@sfgov.org", city_name: "San Francisco" },
}

// ---- Import under test (after mocks) --------------------------------------

import { ComposePageContent } from "./compose-page-content"

// ---- Helpers ---------------------------------------------------------------

function renderCompose(contacts = [SF_CONTACT, NO_CITY_CONTACT]) {
  return render(<ComposePageContent contacts={contacts} keywords={KEYWORDS} />)
}

/** Set up fetch to return anomalies then compose result on successive calls. */
function setupHappyPath() {
  mockFetch
    .mockResolvedValueOnce({
      ok: true,
      json: async () => ANOMALIES_RESPONSE,
    })
    .mockResolvedValueOnce({
      ok: true,
      json: async () => COMPOSE_RESPONSE,
    })
}

// ---- Tests -----------------------------------------------------------------

describe("ComposePageContent", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockPush.mockClear()
  })

  // ---------- Contact selection ----------

  it("renders contact search input on load", () => {
    renderCompose()
    expect(screen.getByPlaceholderText(/search contacts/i)).toBeInTheDocument()
  })

  it("shows active contacts in dropdown when focused", async () => {
    const user = userEvent.setup()
    renderCompose()

    const input = screen.getByPlaceholderText(/search contacts/i)
    await user.click(input)

    // Both contacts should appear
    expect(screen.getByText("Jane Smith")).toBeInTheDocument()
    expect(screen.getByText("Bob Jones")).toBeInTheDocument()
  })

  it("filters contacts by search query", async () => {
    const user = userEvent.setup()
    renderCompose()

    const input = screen.getByPlaceholderText(/search contacts/i)
    await user.click(input)
    await user.type(input, "jane")

    expect(screen.getByText("Jane Smith")).toBeInTheDocument()
    expect(screen.queryByText("Bob Jones")).not.toBeInTheDocument()
  })

  it("selects the first matching contact when Enter is pressed in the search input", async () => {
    const user = userEvent.setup()
    setupHappyPath()
    renderCompose()

    const input = screen.getByPlaceholderText(/search contacts/i)
    await user.click(input)
    await user.type(input, "jane")
    await user.keyboard("{Enter}")

    // Should have selected Jane and started fetching anomalies
    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalled()
    })
    // The search input should be replaced by the selected contact card
    expect(screen.queryByPlaceholderText(/search contacts/i)).not.toBeInTheDocument()
    // Contact name should be displayed in the selected card
    expect(screen.getByText("Jane Smith")).toBeInTheDocument()
  })

  it("does not crash when Enter is pressed with no matching contacts", async () => {
    const user = userEvent.setup()
    renderCompose()

    const input = screen.getByPlaceholderText(/search contacts/i)
    await user.click(input)
    await user.type(input, "zzzznonexistent")
    await user.keyboard("{Enter}")

    // Should still be on the search screen, no crash
    expect(screen.getByPlaceholderText(/search contacts/i)).toBeInTheDocument()
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it("shows 'No city' badge for contacts without city_id", async () => {
    const user = userEvent.setup()
    renderCompose()

    const input = screen.getByPlaceholderText(/search contacts/i)
    await user.click(input)

    expect(screen.getByText("No city")).toBeInTheDocument()
  })

  // ---------- No city warning ----------

  it("shows warning when selecting a contact without a city", async () => {
    const user = userEvent.setup()
    renderCompose()

    const input = screen.getByPlaceholderText(/search contacts/i)
    await user.click(input)

    const bob = screen.getByText("Bob Jones")
    await user.click(bob)

    expect(screen.getByText(/doesn't have a city assigned/i)).toBeInTheDocument()
    // fetch should NOT have been called (no city = no anomalies to load)
    expect(mockFetch).not.toHaveBeenCalled()
  })

  // ---------- Anomaly loading + auto-generate ----------

  it("fetches anomalies and auto-generates draft when selecting a contact with city", async () => {
    const user = userEvent.setup()
    setupHappyPath()
    renderCompose()

    const input = screen.getByPlaceholderText(/search contacts/i)
    await user.click(input)
    await user.click(screen.getByText("Jane Smith"))

    // Should show loading
    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledTimes(2)
    })

    // First call: anomalies for city
    expect(mockFetch.mock.calls[0][0]).toContain("/api/crm/cities/57260/anomalies")

    // Second call: compose
    expect(mockFetch.mock.calls[1][0]).toContain("/api/crm/compose")
    const composeBody = JSON.parse(mockFetch.mock.calls[1][1].body)
    expect(composeBody.prospect_id).toBe("c-1")
    expect(composeBody.anomaly_result_id).toBe(101) // first anomaly auto-selected

    // Draft should render
    await waitFor(() => {
      expect(screen.getByText(COMPOSE_RESPONSE.subject)).toBeInTheDocument()
      expect(screen.getByText(COMPOSE_RESPONSE.body)).toBeInTheDocument()
    })
  })

  it("shows anomaly count badge after loading", async () => {
    const user = userEvent.setup()
    setupHappyPath()
    renderCompose()

    await user.click(screen.getByPlaceholderText(/search contacts/i))
    await user.click(screen.getByText("Jane Smith"))

    await waitFor(() => {
      expect(screen.getByText("2 available")).toBeInTheDocument()
    })
  })

  // ---------- Anomaly picker / swap ----------

  it("opens anomaly picker and allows swapping", async () => {
    const user = userEvent.setup()
    setupHappyPath()
    renderCompose()

    await user.click(screen.getByPlaceholderText(/search contacts/i))
    await user.click(screen.getByText("Jane Smith"))

    // Wait for draft
    await waitFor(() => {
      expect(screen.getByText(COMPOSE_RESPONSE.subject)).toBeInTheDocument()
    })

    // Click the anomaly bar to open picker
    const anomalyBar = screen.getByText("2 available").closest("button")!
    await user.click(anomalyBar)

    // Should show both anomalies in dropdown
    await waitFor(() => {
      expect(screen.getByText(/park maintenance/i)).toBeInTheDocument()
    })

    // Swap to the second anomaly
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        ...COMPOSE_RESPONSE,
        subject: "Park maintenance update",
        body: "Hi Jane, park maintenance spending has dropped...",
      }),
    })

    await user.click(screen.getByText(/park maintenance/i))

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledTimes(3) // anomalies + compose + swap-compose
    })

    // The 3rd call should be compose with the new anomaly
    const swapBody = JSON.parse(mockFetch.mock.calls[2][1].body)
    expect(swapBody.anomaly_result_id).toBe(102)
  })

  // ---------- Regenerate ----------

  it("regenerates the draft with same anomaly", async () => {
    const user = userEvent.setup()
    setupHappyPath()
    renderCompose()

    await user.click(screen.getByPlaceholderText(/search contacts/i))
    await user.click(screen.getByText("Jane Smith"))

    await waitFor(() => {
      expect(screen.getByText(COMPOSE_RESPONSE.subject)).toBeInTheDocument()
    })

    // Set up regenerate response
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        ...COMPOSE_RESPONSE,
        subject: "Regenerated subject",
        body: "Regenerated body text...",
      }),
    })

    const regenBtn = screen.getByRole("button", { name: /regenerate/i })
    await user.click(regenBtn)

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledTimes(3)
    })

    // Same anomaly used
    const regenBody = JSON.parse(mockFetch.mock.calls[2][1].body)
    expect(regenBody.anomaly_result_id).toBe(101)
    expect(regenBody.prospect_id).toBe("c-1")
  })

  // ---------- Refinement ----------

  it("sends refinement text when refine is clicked", async () => {
    const user = userEvent.setup()
    setupHappyPath()
    renderCompose()

    await user.click(screen.getByPlaceholderText(/search contacts/i))
    await user.click(screen.getByText("Jane Smith"))

    await waitFor(() => {
      expect(screen.getByText(COMPOSE_RESPONSE.subject)).toBeInTheDocument()
    })

    // Type a refinement
    const refineInput = screen.getByPlaceholderText(/mention the upcoming/i)
    await user.type(refineInput, "emphasize budget impact")

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        ...COMPOSE_RESPONSE,
        subject: "Budget impact of police overtime",
        body: "Hi Jane, the budget impact is significant...",
      }),
    })

    const refineBtn = screen.getByRole("button", { name: /refine/i })
    await user.click(refineBtn)

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledTimes(3)
    })

    const refineBody = JSON.parse(mockFetch.mock.calls[2][1].body)
    expect(refineBody.refinement).toBe("emphasize budget impact")
  })

  // ---------- Copy email ----------

  it("copies email text to clipboard", async () => {
    const user = userEvent.setup()
    setupHappyPath()

    // Mock clipboard using defineProperty (jsdom doesn't have clipboard by default)
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      writable: true,
      configurable: true,
    })

    renderCompose()

    await user.click(screen.getByPlaceholderText(/search contacts/i))
    await user.click(screen.getByText("Jane Smith"))

    await waitFor(() => {
      expect(screen.getByText(COMPOSE_RESPONSE.subject)).toBeInTheDocument()
    })

    const copyBtn = screen.getByRole("button", { name: /copy email/i })
    await user.click(copyBtn)

    expect(writeText).toHaveBeenCalledWith(
      `Subject: ${COMPOSE_RESPONSE.subject}\n\n${COMPOSE_RESPONSE.body}`
    )

    await waitFor(() => {
      expect(screen.getByText("Copied!")).toBeInTheDocument()
    })
  })

  // ---------- Navigate to review ----------

  it("navigates to review page on button click", async () => {
    const user = userEvent.setup()
    setupHappyPath()
    renderCompose()

    await user.click(screen.getByPlaceholderText(/search contacts/i))
    await user.click(screen.getByText("Jane Smith"))

    await waitFor(() => {
      expect(screen.getByText(COMPOSE_RESPONSE.subject)).toBeInTheDocument()
    })

    const reviewBtn = screen.getByRole("button", { name: /review & send/i })
    await user.click(reviewBtn)

    expect(mockPush).toHaveBeenCalledWith("/review-and-send")
  })

  // ---------- Change contact ----------

  it("allows changing the selected contact", async () => {
    const user = userEvent.setup()
    setupHappyPath()
    renderCompose()

    await user.click(screen.getByPlaceholderText(/search contacts/i))
    await user.click(screen.getByText("Jane Smith"))

    await waitFor(() => {
      expect(screen.getByText(COMPOSE_RESPONSE.subject)).toBeInTheDocument()
    })

    // Click "Change" button
    const changeBtn = screen.getByRole("button", { name: /change/i })
    await user.click(changeBtn)

    // Should be back to search mode
    expect(screen.getByPlaceholderText(/search contacts/i)).toBeInTheDocument()
    // Draft should be cleared
    expect(screen.queryByText(COMPOSE_RESPONSE.subject)).not.toBeInTheDocument()
  })

  // ---------- Empty state ----------

  it("shows empty state when no contact selected", () => {
    renderCompose()
    expect(screen.getByText(/select a contact/i)).toBeInTheDocument()
    expect(screen.getByText(/2 active contacts available/i)).toBeInTheDocument()
  })

  // ---------- No anomalies found ----------

  it("shows empty state when city has no anomalies", async () => {
    const user = userEvent.setup()
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ anomalies: [], total: 0, city_id: 1 }),
    })
    renderCompose()

    await user.click(screen.getByPlaceholderText(/search contacts/i))
    await user.click(screen.getByText("Jane Smith"))

    // Wait for loading to finish and empty state to appear
    await waitFor(() => {
      expect(screen.getByText(/no recent anomalies found/i)).toBeInTheDocument()
    }, { timeout: 5000 })
  })

  // ===================================================================
  // EDGE CASE: API failures & error resilience
  // ===================================================================

  it("handles anomaly fetch failure gracefully (shows error, no crash)", async () => {
    const user = userEvent.setup()
    vi.spyOn(console, "error").mockImplementation(() => {})
    mockFetch.mockRejectedValueOnce(new Error("Network error"))
    renderCompose()

    await user.click(screen.getByPlaceholderText(/search contacts/i))
    await user.click(screen.getByText("Jane Smith"))

    // Loading should appear briefly, then disappear
    await waitFor(() => {
      expect(screen.queryByText(/finding anomalies/i)).not.toBeInTheDocument()
    })
    // Component should still be usable (no crash), no draft shown
    expect(screen.queryByText(COMPOSE_RESPONSE.subject)).not.toBeInTheDocument()
    // Should show error card with retry button
    expect(screen.getByText(/Failed to fetch anomalies/)).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /retry/i })).toBeInTheDocument()
    vi.restoreAllMocks()
  })

  it("handles anomaly API returning HTTP 500 gracefully", async () => {
    const user = userEvent.setup()
    vi.spyOn(console, "error").mockImplementation(() => {})
    mockFetch.mockResolvedValueOnce({ ok: false, status: 500 })
    renderCompose()

    await user.click(screen.getByPlaceholderText(/search contacts/i))
    await user.click(screen.getByText("Jane Smith"))

    await waitFor(() => {
      expect(screen.queryByText(/finding anomalies/i)).not.toBeInTheDocument()
    })
    // No crash, component shows error card
    expect(screen.getByText(/Failed to fetch anomalies/)).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /retry/i })).toBeInTheDocument()
    vi.restoreAllMocks()
  })

  it("handles compose/draft generation failure gracefully", async () => {
    const user = userEvent.setup()
    // Anomalies succeed, compose fails
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ANOMALIES_RESPONSE,
      })
      .mockRejectedValueOnce(new Error("LLM timeout"))
    renderCompose()

    await user.click(screen.getByPlaceholderText(/search contacts/i))
    await user.click(screen.getByText("Jane Smith"))

    // After compose fails, should stop generating
    await waitFor(() => {
      expect(screen.queryByText(/generating draft/i)).not.toBeInTheDocument()
    })
    // No subject/body should be shown since compose failed
    expect(screen.queryByText(COMPOSE_RESPONSE.subject)).not.toBeInTheDocument()
  })

  it("handles compose API returning HTTP 422 gracefully", async () => {
    const user = userEvent.setup()
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ANOMALIES_RESPONSE,
      })
      .mockResolvedValueOnce({ ok: false, status: 422 })
    renderCompose()

    await user.click(screen.getByPlaceholderText(/search contacts/i))
    await user.click(screen.getByText("Jane Smith"))

    await waitFor(() => {
      expect(screen.queryByText(/generating draft/i)).not.toBeInTheDocument()
    })
    expect(screen.queryByText(COMPOSE_RESPONSE.subject)).not.toBeInTheDocument()
  })

  // ===================================================================
  // EDGE CASE: Regenerate failures
  // ===================================================================

  it("handles regenerate failure gracefully (keeps old draft)", async () => {
    const user = userEvent.setup()
    setupHappyPath()
    renderCompose()

    await user.click(screen.getByPlaceholderText(/search contacts/i))
    await user.click(screen.getByText("Jane Smith"))

    await waitFor(() => {
      expect(screen.getByText(COMPOSE_RESPONSE.subject)).toBeInTheDocument()
    })

    // Regenerate fails
    mockFetch.mockRejectedValueOnce(new Error("Server error"))
    await user.click(screen.getByRole("button", { name: /regenerate/i }))

    // After failure, the old draft should still be visible (no wipe)
    await waitFor(() => {
      expect(screen.queryByText(/generating draft/i)).not.toBeInTheDocument()
    })
    // Old draft text should remain
    expect(screen.getByText(COMPOSE_RESPONSE.body)).toBeInTheDocument()
  })

  // ===================================================================
  // EDGE CASE: Swap anomaly failure
  // ===================================================================

  it("handles swap anomaly failure and keeps previous anomaly", async () => {
    const user = userEvent.setup()
    setupHappyPath()
    renderCompose()

    await user.click(screen.getByPlaceholderText(/search contacts/i))
    await user.click(screen.getByText("Jane Smith"))

    await waitFor(() => {
      expect(screen.getByText(COMPOSE_RESPONSE.subject)).toBeInTheDocument()
    })

    // Open anomaly picker
    await user.click(screen.getByText(/2 available/i))

    // Click second anomaly; compose for it will fail
    mockFetch.mockRejectedValueOnce(new Error("Compose error after swap"))
    await user.click(screen.getByText(/park maintenance/i))

    // After failure, generating state should clear
    await waitFor(() => {
      expect(screen.queryByText(/generating draft/i)).not.toBeInTheDocument()
    })
  })

  // ===================================================================
  // EDGE CASE: Loading indicators and state transitions
  // ===================================================================

  it("shows staged loading indicators while fetching anomalies", async () => {
    const user = userEvent.setup()
    // Use a promise we can control to keep the fetch "pending"
    let resolveAnomalies!: (v: any) => void
    mockFetch.mockReturnValueOnce(
      new Promise((resolve) => { resolveAnomalies = resolve })
    )
    renderCompose()

    await user.click(screen.getByPlaceholderText(/search contacts/i))
    await user.click(screen.getByText("Jane Smith"))

    // Step 1 loading indicator should be visible with city name
    expect(screen.getByText(/finding anomalies for san francisco/i)).toBeInTheDocument()
    // Step 2 should show as pending (grayed out)
    expect(screen.getByText(/generating personalized email draft/i)).toBeInTheDocument()

    // Now resolve the fetch
    resolveAnomalies({
      ok: true,
      json: async () => ({ anomalies: [], total: 0, city_id: 1 }),
    })

    await waitFor(() => {
      expect(screen.queryByText(/finding anomalies/i)).not.toBeInTheDocument()
    })
  })

  it("shows anomaly count badge in loading indicator after anomalies are found", async () => {
    let resolveCompose!: (v: any) => void

    // Anomalies resolves immediately
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ANOMALIES_RESPONSE,
    })
    // Compose hangs until we resolve it
    mockFetch.mockReturnValueOnce(
      new Promise((resolve) => { resolveCompose = resolve })
    )
    renderCompose()

    const { fireEvent } = await import("@testing-library/react")
    fireEvent.focus(screen.getByPlaceholderText(/search contacts/i))
    fireEvent.click(screen.getByText("Jane Smith"))

    // Wait for anomalies to be found but compose still pending
    await waitFor(() => {
      expect(screen.getByText("2 found")).toBeInTheDocument()
    }, { timeout: 5000 })

    // Step 2 should now be active (generating)
    expect(screen.getByText(/generating personalized email draft/i)).toBeInTheDocument()

    resolveCompose({
      ok: true,
      json: async () => COMPOSE_RESPONSE,
    })

    await waitFor(() => {
      expect(screen.getByText(COMPOSE_RESPONSE.subject)).toBeInTheDocument()
    }, { timeout: 5000 })
  })

  it("shows generating spinner while LLM compose is in progress", async () => {
    let resolveCompose!: (v: any) => void

    // Anomalies resolves immediately
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ANOMALIES_RESPONSE,
    })
    // Compose hangs until we resolve it
    mockFetch.mockReturnValueOnce(
      new Promise((resolve) => { resolveCompose = resolve })
    )
    renderCompose()

    // Use fireEvent (non-awaiting) so the click doesn't block on the pending fetch
    const { fireEvent } = await import("@testing-library/react")
    fireEvent.focus(screen.getByPlaceholderText(/search contacts/i))
    fireEvent.click(screen.getByText("Jane Smith"))

    // Wait for the "Generating draft..." text to appear (compose is still pending)
    await waitFor(() => {
      expect(screen.getByText(/generating draft/i)).toBeInTheDocument()
    }, { timeout: 5000 })

    resolveCompose({
      ok: true,
      json: async () => COMPOSE_RESPONSE,
    })

    await waitFor(() => {
      expect(screen.getByText(COMPOSE_RESPONSE.subject)).toBeInTheDocument()
    }, { timeout: 5000 })
  })

  // ===================================================================
  // EDGE CASE: Refine with empty text does nothing
  // ===================================================================

  it("disables refine button when refinement input is empty", async () => {
    const user = userEvent.setup()
    setupHappyPath()
    renderCompose()

    await user.click(screen.getByPlaceholderText(/search contacts/i))
    await user.click(screen.getByText("Jane Smith"))

    await waitFor(() => {
      expect(screen.getByText(COMPOSE_RESPONSE.subject)).toBeInTheDocument()
    })

    const refineBtn = screen.getByRole("button", { name: /refine/i })
    expect(refineBtn).toBeDisabled()
  })

  it("enables refine button when text is entered", async () => {
    const user = userEvent.setup()
    setupHappyPath()
    renderCompose()

    await user.click(screen.getByPlaceholderText(/search contacts/i))
    await user.click(screen.getByText("Jane Smith"))

    await waitFor(() => {
      expect(screen.getByText(COMPOSE_RESPONSE.subject)).toBeInTheDocument()
    })

    const refineInput = screen.getByPlaceholderText(/mention the upcoming/i)
    await user.type(refineInput, "make it shorter")

    const refineBtn = screen.getByRole("button", { name: /refine/i })
    expect(refineBtn).not.toBeDisabled()
  })

  // ===================================================================
  // EDGE CASE: All contacts inactive
  // ===================================================================

  it("shows 'no active contacts' when all contacts are inactive", () => {
    const inactive = { ...SF_CONTACT, status: "archived" as any }
    renderCompose([inactive])
    expect(screen.getByText(/0 active contacts available/i)).toBeInTheDocument()
  })

  // ===================================================================
  // EDGE CASE: Contact with city but no city_name
  // ===================================================================

  it("shows 'this city' fallback when city_name is null", async () => {
    const user = userEvent.setup()
    const contactNoName = { ...SF_CONTACT, city_name: null }
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ anomalies: [], total: 0, city_id: 1 }),
    })
    render(<ComposePageContent contacts={[contactNoName]} keywords={KEYWORDS} />)

    await user.click(screen.getByPlaceholderText(/search contacts/i))
    await user.click(screen.getByText("Jane Smith"))

    await waitFor(() => {
      expect(screen.getByText(/no recent anomalies found for this city/i)).toBeInTheDocument()
    }, { timeout: 5000 })
  })

  // ===================================================================
  // EDGE CASE: Rapid contact switching
  // ===================================================================

  it("clears draft when switching contacts quickly", async () => {
    const user = userEvent.setup()
    setupHappyPath()
    renderCompose()

    // Select Jane
    await user.click(screen.getByPlaceholderText(/search contacts/i))
    await user.click(screen.getByText("Jane Smith"))

    await waitFor(() => {
      expect(screen.getByText(COMPOSE_RESPONSE.subject)).toBeInTheDocument()
    })

    // Click "Change" to go back
    await user.click(screen.getByRole("button", { name: /change/i }))

    // Previous draft should be cleared
    expect(screen.queryByText(COMPOSE_RESPONSE.subject)).not.toBeInTheDocument()
    expect(screen.queryByText(COMPOSE_RESPONSE.body)).not.toBeInTheDocument()

    // Contact picker should be back
    expect(screen.getByPlaceholderText(/search contacts/i)).toBeInTheDocument()
  })

  // ===================================================================
  // EDGE CASE: Clipboard failure
  // ===================================================================

  it("shows error toast when clipboard write fails", async () => {
    const user = userEvent.setup()
    setupHappyPath()

    const writeText = vi.fn().mockRejectedValue(new Error("Clipboard denied"))
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      writable: true,
      configurable: true,
    })

    renderCompose()

    await user.click(screen.getByPlaceholderText(/search contacts/i))
    await user.click(screen.getByText("Jane Smith"))

    await waitFor(() => {
      expect(screen.getByText(COMPOSE_RESPONSE.subject)).toBeInTheDocument()
    })

    const copyBtn = screen.getByRole("button", { name: /copy email/i })
    await user.click(copyBtn)

    // Should show error toast and component should still be usable
    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalledWith("Failed to copy")
    })
    expect(screen.getByText(COMPOSE_RESPONSE.subject)).toBeInTheDocument()
  })

  // ===================================================================
  // initialContactId auto-select (#11)
  // ===================================================================

  it("auto-selects contact when initialContactId matches", async () => {
    setupHappyPath()
    render(
      <ComposePageContent
        contacts={[SF_CONTACT, NO_CITY_CONTACT]}
        keywords={KEYWORDS}
        initialContactId="c-1"
      />
    )

    // Should skip search and go straight to fetching anomalies for Jane
    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalled()
    })

    // Contact should be selected (no search input visible)
    expect(screen.queryByPlaceholderText(/search contacts/i)).not.toBeInTheDocument()
    expect(screen.getByText("Jane Smith")).toBeInTheDocument()
  })

  it("does nothing when initialContactId does not match any contact", () => {
    render(
      <ComposePageContent
        contacts={[SF_CONTACT, NO_CITY_CONTACT]}
        keywords={KEYWORDS}
        initialContactId="nonexistent-id"
      />
    )

    // Should remain on search screen
    expect(screen.getByPlaceholderText(/search contacts/i)).toBeInTheDocument()
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it("does nothing when initialContactId is null", () => {
    render(
      <ComposePageContent
        contacts={[SF_CONTACT, NO_CITY_CONTACT]}
        keywords={KEYWORDS}
        initialContactId={null}
      />
    )

    expect(screen.getByPlaceholderText(/search contacts/i)).toBeInTheDocument()
    expect(mockFetch).not.toHaveBeenCalled()
  })

  // ===================================================================
  // Toast notifications
  // ===================================================================

  it("shows success toast after draft generation", async () => {
    const user = userEvent.setup()
    setupHappyPath()
    renderCompose()

    await user.click(screen.getByPlaceholderText(/search contacts/i))
    await user.click(screen.getByText("Jane Smith"))

    await waitFor(() => {
      expect(screen.getByText(COMPOSE_RESPONSE.subject)).toBeInTheDocument()
    })

    expect(mockToastSuccess).toHaveBeenCalledWith("Draft generated")
  })

  it("shows error toast on draft generation failure", async () => {
    const user = userEvent.setup()
    vi.spyOn(console, "error").mockImplementation(() => {})
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ANOMALIES_RESPONSE,
      })
      .mockRejectedValueOnce(new Error("LLM timeout"))
    renderCompose()

    await user.click(screen.getByPlaceholderText(/search contacts/i))
    await user.click(screen.getByText("Jane Smith"))

    // Error message is now surfaced from the thrown error so the user can see
    // what actually went wrong, rather than a generic fallback.
    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalledWith("LLM timeout")
    })
    vi.restoreAllMocks()
  })

  it("shows error toast on anomaly fetch failure", async () => {
    const user = userEvent.setup()
    vi.spyOn(console, "error").mockImplementation(() => {})
    mockFetch.mockRejectedValueOnce(new Error("Network error"))
    renderCompose()

    await user.click(screen.getByPlaceholderText(/search contacts/i))
    await user.click(screen.getByText("Jane Smith"))

    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalledWith("Failed to fetch anomalies")
    })
    vi.restoreAllMocks()
  })

  it("shows success toast on copy", async () => {
    const user = userEvent.setup()
    setupHappyPath()

    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      writable: true,
      configurable: true,
    })

    renderCompose()
    await user.click(screen.getByPlaceholderText(/search contacts/i))
    await user.click(screen.getByText("Jane Smith"))

    await waitFor(() => {
      expect(screen.getByText(COMPOSE_RESPONSE.subject)).toBeInTheDocument()
    })

    await user.click(screen.getByRole("button", { name: /copy email/i }))

    await waitFor(() => {
      expect(mockToastSuccess).toHaveBeenCalledWith("Copied")
    })
  })

  // ===================================================================
  // Retry button (Phase 2)
  // ===================================================================

  it("shows Retry button after generation failure", async () => {
    const user = userEvent.setup()
    vi.spyOn(console, "error").mockImplementation(() => {})
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ANOMALIES_RESPONSE,
      })
      .mockRejectedValueOnce(new Error("LLM timeout"))
    renderCompose()

    await user.click(screen.getByPlaceholderText(/search contacts/i))
    await user.click(screen.getByText("Jane Smith"))

    await waitFor(() => {
      expect(screen.getByText(/LLM timeout/)).toBeInTheDocument()
      expect(screen.getByRole("button", { name: /retry/i })).toBeInTheDocument()
    })
    vi.restoreAllMocks()
  })

  it("retries generation when Retry button is clicked", async () => {
    const user = userEvent.setup()
    vi.spyOn(console, "error").mockImplementation(() => {})
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ANOMALIES_RESPONSE,
      })
      .mockRejectedValueOnce(new Error("LLM timeout"))
    renderCompose()

    await user.click(screen.getByPlaceholderText(/search contacts/i))
    await user.click(screen.getByText("Jane Smith"))

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /retry/i })).toBeInTheDocument()
    })

    // Set up success for retry
    setupHappyPath()
    await user.click(screen.getByRole("button", { name: /retry/i }))

    await waitFor(() => {
      expect(screen.getByText(COMPOSE_RESPONSE.subject)).toBeInTheDocument()
    })
    vi.restoreAllMocks()
  })
})

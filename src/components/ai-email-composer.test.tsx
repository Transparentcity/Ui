/**
 * Tests for the AI Email Composer (bulk email generation).
 *
 * Covers:
 * - Step navigation (compose → select → generate → review)
 * - Contact selection with keyword/priority filters
 * - Email generation with progress phases
 * - Skipped contact warnings
 * - Review step (preview, copy, regenerate, queue)
 * - "Use Same Copy for All" shortcut
 * - Error handling
 */
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { vi, describe, it, expect, beforeEach } from "vitest"

// ---- Polyfills (jsdom lacks ResizeObserver, needed by Radix ScrollArea) ----

global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

// ---- Mocks ----------------------------------------------------------------

const mockQueueGeneratedEmails = vi.fn().mockResolvedValue(undefined)
vi.mock("@/app/actions/ai-emails", () => ({
  queueGeneratedEmails: (...args: any[]) => mockQueueGeneratedEmails(...args),
}))

const mockFetch = vi.fn()
global.fetch = mockFetch

// ---- Fixtures --------------------------------------------------------------

import type { Keyword, Anomaly } from "@/lib/types"

interface TestContact {
  id: string
  name: string
  title: string | null
  department: string | null
  organization: string | null
  email: string | null
  phone: string | null
  jurisdiction: string | null
  city_id: number | null
  city_name: string | null
  priority: number
  status: "active" | "inactive" | "unsubscribed"
  notes: string | null
  created_at: string
  updated_at: string
  prospect_keywords?: Array<{
    keyword_id: string
    keywords: { id: string; name: string } | null
  }>
}

const KEYWORDS: Keyword[] = [
  { id: "k1", name: "budget", description: null, category: null, created_at: "" },
  { id: "k2", name: "housing", description: null, category: null, created_at: "" },
]

const CONTACT_ALAN: TestContact = {
  id: "c-alan",
  name: "Alan Wong",
  title: "Commissioner",
  department: "Planning",
  organization: "City of SF",
  email: "alan.wong@sfgov.org",
  phone: null,
  jurisdiction: "District 5",
  city_id: 57260,
  city_name: "San Francisco",
  priority: 3,
  status: "active",
  notes: null,
  created_at: "2025-01-01T00:00:00Z",
  updated_at: "2025-01-01T00:00:00Z",
  prospect_keywords: [
    { keyword_id: "k1", keywords: { id: "k1", name: "budget" } },
  ],
}

const CONTACT_JANE: TestContact = {
  id: "c-jane",
  name: "Jane Smith",
  title: "Supervisor",
  department: "Board of Supervisors",
  organization: "City of SF",
  email: "jane.smith@sfgov.org",
  phone: null,
  jurisdiction: "District 1",
  city_id: 57260,
  city_name: "San Francisco",
  priority: 1,
  status: "active",
  notes: null,
  created_at: "2025-01-01T00:00:00Z",
  updated_at: "2025-01-01T00:00:00Z",
  prospect_keywords: [
    { keyword_id: "k2", keywords: { id: "k2", name: "housing" } },
  ],
}

const ANOMALIES: (Anomaly & { anomaly_keywords?: Array<{ keyword_id: string; keywords: { id: string; name: string } | null }> })[] = [
  {
    id: "a-1",
    title: "Permit delays up 47%",
    district_label: "D5",
    district: 5,
    is_citywide: false,
    severity: "high",
    pct_change: 47,
    group_field: "permit_type",
    group_value: "Building",
    created_at: "2025-03-01T00:00:00Z",
    anomaly_keywords: [
      { keyword_id: "k1", keywords: { id: "k1", name: "budget" } },
    ],
  },
  {
    id: "a-2",
    title: "311 response times up citywide",
    district_label: "Citywide",
    district: 0,
    is_citywide: true,
    severity: "medium",
    pct_change: 23,
    created_at: "2025-03-01T00:00:00Z",
    anomaly_keywords: [],
  },
]

const GENERATED_EMAILS_RESPONSE = {
  success: true,
  emails: [
    {
      subject: "Alan - 47% permit delay spike in D5",
      body: "Hi Alan, I noticed permit processing times in District 5 jumped 47%...",
      contactId: "c-alan",
      anomalyIds: ["a-1", "a-2"],
    },
    {
      subject: "Jane - 311 response times update",
      body: "Hi Jane, I wanted to flag some data we found on 311 response times...",
      contactId: "c-jane",
      anomalyIds: ["a-2"],
    },
  ],
  contactCount: 2,
  anomalyCount: 2,
  skippedContacts: [],
}

// ---- Import under test (after mocks) --------------------------------------

import { AIEmailComposer } from "./ai-email-composer"

// ---- Helpers ---------------------------------------------------------------

function renderComposer(
  contacts = [CONTACT_ALAN, CONTACT_JANE],
  anomalies = ANOMALIES,
  keywords = KEYWORDS,
) {
  return render(
    <AIEmailComposer
      contacts={contacts as any}
      anomalies={anomalies as any}
      keywords={keywords}
    />,
  )
}

/** Write a sample email and advance to the Select step. */
async function advanceToSelect(user: ReturnType<typeof userEvent.setup>) {
  const emailField = screen.getByPlaceholderText(/dear commissioner/i)
  await user.type(emailField, "Hi there, here is some data we found.")

  const subjectField = screen.getByPlaceholderText(/important data update/i)
  await user.type(subjectField, "Data update for your district")

  await user.click(screen.getByText(/continue to select contacts/i))
}

/** Write a sample email, select all contacts, and advance to Generate step. */
async function advanceToGenerate(user: ReturnType<typeof userEvent.setup>) {
  await advanceToSelect(user)
  await user.click(screen.getByText("Select All Filtered"))
  await user.click(screen.getByText(/continue to generate/i))
}

// ---- Tests -----------------------------------------------------------------

describe("AIEmailComposer", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // ==========================================================================
  // Step 1: Compose
  // ==========================================================================

  it("renders the compose step by default", () => {
    renderComposer()
    expect(screen.getByText("Write Your Sample Email")).toBeInTheDocument()
    expect(screen.getByPlaceholderText(/dear commissioner/i)).toBeInTheDocument()
  })

  it("disables Continue button when sample email is empty", () => {
    renderComposer()
    const btn = screen.getByText(/continue to select contacts/i)
    expect(btn.closest("button")).toBeDisabled()
  })

  it("enables Continue button when sample email has text", async () => {
    const user = userEvent.setup()
    renderComposer()

    await user.type(
      screen.getByPlaceholderText(/dear commissioner/i),
      "Hello",
    )

    const btn = screen.getByText(/continue to select contacts/i)
    expect(btn.closest("button")).not.toBeDisabled()
  })

  // ==========================================================================
  // Step 2: Select Contacts
  // ==========================================================================

  it("shows contacts on the select step", async () => {
    const user = userEvent.setup()
    renderComposer()
    await advanceToSelect(user)

    expect(screen.getByText("Select Recipients")).toBeInTheDocument()
    expect(screen.getByText("Alan Wong")).toBeInTheDocument()
    expect(screen.getByText("Jane Smith")).toBeInTheDocument()
  })

  it("shows keyword badges for contacts", async () => {
    const user = userEvent.setup()
    renderComposer()
    await advanceToSelect(user)

    expect(screen.getByText("budget")).toBeInTheDocument()
    expect(screen.getByText("housing")).toBeInTheDocument()
  })

  it("shows anomaly count badge for contacts with matching anomalies", async () => {
    const user = userEvent.setup()
    renderComposer()
    await advanceToSelect(user)

    // Alan has D5 district match (a-1) + citywide (a-2) = 2 unique anomalies
    // Jane has citywide (a-2) = 1 anomaly
    expect(screen.getByText("2 anomalies")).toBeInTheDocument()
    expect(screen.getByText("1 anomaly")).toBeInTheDocument()
  })

  it("selects and deselects contacts on click", async () => {
    const user = userEvent.setup()
    renderComposer()
    await advanceToSelect(user)

    // Click the contact card div (not just the name text, which is inside a span)
    const alanCard = screen.getByText("Alan Wong").closest("[class*='cursor-pointer']")!
    await user.click(alanCard)
    await waitFor(() => {
      expect(screen.getByText("1 selected")).toBeInTheDocument()
    })

    const janeCard = screen.getByText("Jane Smith").closest("[class*='cursor-pointer']")!
    await user.click(janeCard)
    await waitFor(() => {
      expect(screen.getByText("2 selected")).toBeInTheDocument()
    })

    // Deselect Alan
    await user.click(alanCard)
    await waitFor(() => {
      expect(screen.getByText("1 selected")).toBeInTheDocument()
    })
  })

  it("Select All Filtered selects all visible contacts", async () => {
    const user = userEvent.setup()
    renderComposer()
    await advanceToSelect(user)

    await user.click(screen.getByText("Select All Filtered"))
    expect(screen.getByText("2 selected")).toBeInTheDocument()
  })

  it("disables Continue to Generate when no contacts selected", async () => {
    const user = userEvent.setup()
    renderComposer()
    await advanceToSelect(user)

    const btn = screen.getByText(/continue to generate/i)
    expect(btn.closest("button")).toBeDisabled()
  })

  // ==========================================================================
  // Step 3: Generate — Progress Phases
  // ==========================================================================

  it("shows progress phases during email generation", async () => {
    const user = userEvent.setup()
    // Use a promise we can control to keep the fetch pending
    let resolveFetch!: (v: any) => void
    mockFetch.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveFetch = resolve
      }),
    )

    renderComposer()
    await advanceToGenerate(user)

    // Click generate (non-blocking — use fireEvent so we don't wait for the pending fetch)
    const { fireEvent } = await import("@testing-library/react")
    fireEvent.click(screen.getByText("Generate Emails with AI"))

    // Progress phases should be visible
    await waitFor(() => {
      expect(
        screen.getByText("Fetching contact details..."),
      ).toBeInTheDocument()
    })
    expect(
      screen.getByText("Matching anomalies to keywords..."),
    ).toBeInTheDocument()
    expect(
      screen.getByText(/Generating 2 unique email variations.../),
    ).toBeInTheDocument()
    expect(screen.getByText("Finalizing emails...")).toBeInTheDocument()

    // Resolve the fetch
    resolveFetch({
      ok: true,
      json: async () => GENERATED_EMAILS_RESPONSE,
    })

    // Should advance to review step
    await waitFor(
      () => {
        expect(
          screen.getByText("Review Generated Emails"),
        ).toBeInTheDocument()
      },
      { timeout: 5000 },
    )
  })

  it("shows Generating... text on the button while generating", async () => {
    const user = userEvent.setup()
    let resolveFetch!: (v: any) => void
    mockFetch.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveFetch = resolve
      }),
    )

    renderComposer()
    await advanceToGenerate(user)

    const { fireEvent } = await import("@testing-library/react")
    fireEvent.click(screen.getByText("Generate Emails with AI"))

    await waitFor(() => {
      expect(screen.getByText("Generating...")).toBeInTheDocument()
    })

    resolveFetch({
      ok: true,
      json: async () => GENERATED_EMAILS_RESPONSE,
    })

    await waitFor(
      () => {
        expect(
          screen.getByText("Review Generated Emails"),
        ).toBeInTheDocument()
      },
      { timeout: 5000 },
    )
  })

  it("disables Back to Select button while generating", async () => {
    const user = userEvent.setup()
    let resolveFetch!: (v: any) => void
    mockFetch.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveFetch = resolve
      }),
    )

    renderComposer()
    await advanceToGenerate(user)

    const { fireEvent } = await import("@testing-library/react")
    fireEvent.click(screen.getByText("Generate Emails with AI"))

    await waitFor(() => {
      expect(
        screen.getByText("Back to Select").closest("button"),
      ).toBeDisabled()
    })

    resolveFetch({
      ok: true,
      json: async () => GENERATED_EMAILS_RESPONSE,
    })

    await waitFor(
      () => {
        expect(
          screen.getByText("Review Generated Emails"),
        ).toBeInTheDocument()
      },
      { timeout: 5000 },
    )
  })

  // ==========================================================================
  // Step 3: Generate — API call
  // ==========================================================================

  it("sends correct payload to /api/generate-emails", async () => {
    const user = userEvent.setup()
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => GENERATED_EMAILS_RESPONSE,
    })

    renderComposer()
    await advanceToGenerate(user)

    const { fireEvent } = await import("@testing-library/react")
    fireEvent.click(screen.getByText("Generate Emails with AI"))

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        "/api/generate-emails",
        expect.objectContaining({
          method: "POST",
          headers: { "Content-Type": "application/json" },
        }),
      )
    })

    const body = JSON.parse(mockFetch.mock.calls[0][1].body)
    expect(body.sampleEmail).toContain("Hi there")
    expect(body.sampleSubject).toContain("Data update")
    expect(body.contactIds).toEqual(["c-alan", "c-jane"])
    expect(body.includeAnomalies).toBe(true)
  })

  it("shows generation error when API returns error", async () => {
    const user = userEvent.setup()
    mockFetch.mockResolvedValueOnce({
      ok: false,
      json: async () => ({ error: "Rate limit exceeded" }),
    })

    renderComposer()
    await advanceToGenerate(user)

    const { fireEvent } = await import("@testing-library/react")
    fireEvent.click(screen.getByText("Generate Emails with AI"))

    await waitFor(() => {
      expect(screen.getByText("Rate limit exceeded")).toBeInTheDocument()
    })
  })

  it("shows generation error when fetch throws", async () => {
    const user = userEvent.setup()
    mockFetch.mockRejectedValueOnce(new Error("Network error"))

    renderComposer()
    await advanceToGenerate(user)

    const { fireEvent } = await import("@testing-library/react")
    fireEvent.click(screen.getByText("Generate Emails with AI"))

    await waitFor(() => {
      expect(screen.getByText("Network error")).toBeInTheDocument()
    })
  })

  // ==========================================================================
  // Skipped contacts warning
  // ==========================================================================

  it("shows skipped contacts warning when API reports skipped contacts", async () => {
    const user = userEvent.setup()
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        ...GENERATED_EMAILS_RESPONSE,
        emails: [GENERATED_EMAILS_RESPONSE.emails[1]], // Only Jane's email
        skippedContacts: ["Alan Wong"],
      }),
    })

    renderComposer()
    await advanceToGenerate(user)

    const { fireEvent } = await import("@testing-library/react")
    fireEvent.click(screen.getByText("Generate Emails with AI"))

    await waitFor(
      () => {
        expect(
          screen.getByText("Review Generated Emails"),
        ).toBeInTheDocument()
      },
      { timeout: 5000 },
    )

    expect(screen.getByText(/1 contact skipped/)).toBeInTheDocument()
    expect(screen.getByText(/Alan Wong/)).toBeInTheDocument()
  })

  it("shows warning when API returns fewer emails than selected contacts", async () => {
    const user = userEvent.setup()
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        success: true,
        emails: [GENERATED_EMAILS_RESPONSE.emails[1]], // Only Jane
        skippedContacts: [],
      }),
    })

    renderComposer()
    await advanceToGenerate(user)

    const { fireEvent } = await import("@testing-library/react")
    fireEvent.click(screen.getByText("Generate Emails with AI"))

    await waitFor(
      () => {
        expect(
          screen.getByText("Review Generated Emails"),
        ).toBeInTheDocument()
      },
      { timeout: 5000 },
    )

    // Alan is missing from results — should show warning
    expect(screen.getByText(/1 contact skipped/)).toBeInTheDocument()
    expect(screen.getByText(/Alan Wong/)).toBeInTheDocument()
  })

  // ==========================================================================
  // Step 3: "Use Same Copy for All"
  // ==========================================================================

  it("creates identical emails for all contacts with Use Same Copy", async () => {
    const user = userEvent.setup()
    renderComposer()
    await advanceToGenerate(user)

    await user.click(screen.getByText("Use Same Copy for All"))

    // Should jump to review with 2 identical emails
    expect(screen.getByText("Review Generated Emails")).toBeInTheDocument()
    expect(
      screen.getByText(
        "2 unique emails generated. Review and edit before sending.",
      ),
    ).toBeInTheDocument()

    // No API call should have been made
    expect(mockFetch).not.toHaveBeenCalled()
  })

  // ==========================================================================
  // Step 4: Review
  // ==========================================================================

  it("shows generated emails in review step", async () => {
    const user = userEvent.setup()
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => GENERATED_EMAILS_RESPONSE,
    })

    renderComposer()
    await advanceToGenerate(user)

    const { fireEvent } = await import("@testing-library/react")
    fireEvent.click(screen.getByText("Generate Emails with AI"))

    await waitFor(
      () => {
        expect(
          screen.getByText("Review Generated Emails"),
        ).toBeInTheDocument()
      },
      { timeout: 5000 },
    )

    expect(screen.getByText("Alan Wong")).toBeInTheDocument()
    expect(screen.getByText("Jane Smith")).toBeInTheDocument()
    expect(
      screen.getByText(/Alan - 47% permit delay spike/),
    ).toBeInTheDocument()
    expect(screen.getByText(/Jane - 311 response times/)).toBeInTheDocument()
  })

  it("shows anomaly count for emails with anomalies", async () => {
    const user = userEvent.setup()
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => GENERATED_EMAILS_RESPONSE,
    })

    renderComposer()
    await advanceToGenerate(user)

    const { fireEvent } = await import("@testing-library/react")
    fireEvent.click(screen.getByText("Generate Emails with AI"))

    await waitFor(
      () => {
        expect(
          screen.getByText("Review Generated Emails"),
        ).toBeInTheDocument()
      },
      { timeout: 5000 },
    )

    expect(screen.getByText("Includes 2 anomalies")).toBeInTheDocument()
    expect(screen.getByText("Includes 1 anomaly")).toBeInTheDocument()
  })

  it("queues all emails when Queue button is clicked", async () => {
    const user = userEvent.setup()
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => GENERATED_EMAILS_RESPONSE,
    })
    vi.spyOn(window, "alert").mockImplementation(() => {})

    renderComposer()
    await advanceToGenerate(user)

    const { fireEvent } = await import("@testing-library/react")
    fireEvent.click(screen.getByText("Generate Emails with AI"))

    await waitFor(
      () => {
        expect(
          screen.getByText("Review Generated Emails"),
        ).toBeInTheDocument()
      },
      { timeout: 5000 },
    )

    await user.click(screen.getByText(/Queue 2 Emails/))

    await waitFor(() => {
      expect(mockQueueGeneratedEmails).toHaveBeenCalledWith(
        GENERATED_EMAILS_RESPONSE.emails,
      )
    })
  })

  it("opens preview dialog when eye icon is clicked", async () => {
    const user = userEvent.setup()
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => GENERATED_EMAILS_RESPONSE,
    })

    renderComposer()
    await advanceToGenerate(user)

    const { fireEvent } = await import("@testing-library/react")
    fireEvent.click(screen.getByText("Generate Emails with AI"))

    // Wait for full review render with email content
    await waitFor(
      () => {
        expect(
          screen.getByText(/Alan - 47% permit delay spike/),
        ).toBeInTheDocument()
      },
      { timeout: 5000 },
    )

    // Click the first preview button (variant="ghost" size="icon" with Eye SVG)
    const previewButtons = screen
      .getAllByRole("button")
      .filter((btn) => btn.querySelector("[class*='lucide-eye']"))
    expect(previewButtons.length).toBeGreaterThan(0)
    await user.click(previewButtons[0])

    await waitFor(() => {
      expect(screen.getByText("Email Preview")).toBeInTheDocument()
    })
  })

  it("regenerates a single email when refresh icon is clicked", async () => {
    const user = userEvent.setup()
    // First call: bulk generation
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => GENERATED_EMAILS_RESPONSE,
    })

    renderComposer()
    await advanceToGenerate(user)

    const { fireEvent } = await import("@testing-library/react")
    fireEvent.click(screen.getByText("Generate Emails with AI"))

    // Wait for full review render
    await waitFor(
      () => {
        expect(
          screen.getByText(/Alan - 47% permit delay spike/),
        ).toBeInTheDocument()
      },
      { timeout: 5000 },
    )

    // Second call: single regeneration
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        emails: [
          {
            subject: "Alan - Updated subject",
            body: "Updated body for Alan...",
            contactId: "c-alan",
            anomalyIds: ["a-1"],
          },
        ],
      }),
    })

    // Click the first refresh-cw button
    const refreshButtons = screen
      .getAllByRole("button")
      .filter((btn) => btn.querySelector("[class*='lucide-refresh-cw']"))
    await user.click(refreshButtons[0])

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledTimes(2)
    })
  })

  // ==========================================================================
  // Navigation
  // ==========================================================================

  it("navigates back from select to compose", async () => {
    const user = userEvent.setup()
    renderComposer()
    await advanceToSelect(user)

    await user.click(screen.getByText("Back to Edit"))
    expect(screen.getByText("Write Your Sample Email")).toBeInTheDocument()
  })

  it("navigates back from generate to select", async () => {
    const user = userEvent.setup()
    renderComposer()
    await advanceToGenerate(user)

    await user.click(screen.getByText("Back to Select"))
    expect(screen.getByText("Select Recipients")).toBeInTheDocument()
  })

  it("navigates back from review to generate", async () => {
    const user = userEvent.setup()
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => GENERATED_EMAILS_RESPONSE,
    })

    renderComposer()
    await advanceToGenerate(user)

    const { fireEvent } = await import("@testing-library/react")
    fireEvent.click(screen.getByText("Generate Emails with AI"))

    await waitFor(
      () => {
        expect(
          screen.getByText("Review Generated Emails"),
        ).toBeInTheDocument()
      },
      { timeout: 5000 },
    )

    await user.click(screen.getByText("Back"))
    expect(screen.getByText("Generate Unique Emails")).toBeInTheDocument()
  })

  // ==========================================================================
  // Edge: Empty contacts
  // ==========================================================================

  it("shows no contacts message when all contacts are filtered out", async () => {
    const user = userEvent.setup()
    renderComposer([]) // No contacts
    await user.type(
      screen.getByPlaceholderText(/dear commissioner/i),
      "test",
    )
    await user.click(screen.getByText(/continue to select contacts/i))

    expect(
      screen.getByText("No contacts match your filters"),
    ).toBeInTheDocument()
  })
})

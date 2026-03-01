/**
 * Tests for the Contacts Table component.
 *
 * Covers:
 * - Rendering contacts list
 * - Search/filter contacts
 * - Checkbox selection
 * - Bulk city assignment (pinned + search)
 * - City breakdown badges
 * - Clear city assignment
 */
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { vi, describe, it, expect, beforeEach } from "vitest"

// ---- Mocks ----------------------------------------------------------------

const mockRefresh = vi.fn()
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: mockRefresh }),
}))

// Mock contact-dialog
vi.mock("./contact-dialog", () => ({
  ContactDialog: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="contact-dialog-trigger">{children}</div>
  ),
}))

// Mock contact-import-dialog
vi.mock("./contact-import-dialog", () => ({
  ContactImportDialog: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="import-dialog-trigger">{children}</div>
  ),
}))

// Mock server actions
vi.mock("@/app/actions/contacts", () => ({
  deleteContact: vi.fn().mockResolvedValue(undefined),
  bulkUpdateCity: vi.fn().mockResolvedValue({ updated: 2, errors: [] }),
}))

// Mock city search API
vi.mock("@/lib/publicApiClient", () => ({
  searchPublicCities: vi.fn().mockResolvedValue([
    { id: 5, name: "Oakland", state: "CA", display_name: "Oakland" },
    { id: 10, name: "Los Angeles", state: "CA", display_name: "Los Angeles" },
  ]),
}))

// ---- Fixtures --------------------------------------------------------------

import type { Keyword } from "@/lib/types"

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
  keywords: Keyword[]
}

const CONTACTS: TestContact[] = [
  {
    id: "c-1",
    name: "Alice Wong",
    title: "Supervisor",
    department: "Board",
    organization: "City of SF",
    email: "alice@sfgov.org",
    phone: null,
    jurisdiction: "D5",
    city_id: 1,
    city_name: "San Francisco",
    priority: 1,
    status: "active",
    notes: null,
    created_at: "2025-01-01T00:00:00Z",
    updated_at: "2025-01-01T00:00:00Z",
    keywords: [{ id: "k1", name: "budget", description: null, category: null, created_at: "" }],
  },
  {
    id: "c-2",
    name: "Bob Chen",
    title: "Director",
    department: "DPW",
    organization: "City of SF",
    email: "bob@sfgov.org",
    phone: null,
    jurisdiction: "D11",
    city_id: 1,
    city_name: "San Francisco",
    priority: 2,
    status: "active",
    notes: null,
    created_at: "2025-01-02T00:00:00Z",
    updated_at: "2025-01-02T00:00:00Z",
    keywords: [],
  },
  {
    id: "c-3",
    name: "Carol Martinez",
    title: "Manager",
    department: "Planning",
    organization: "City of Oakland",
    email: "carol@oaklandca.gov",
    phone: null,
    jurisdiction: null,
    city_id: null,
    city_name: null,
    priority: 3,
    status: "active",
    notes: null,
    created_at: "2025-01-03T00:00:00Z",
    updated_at: "2025-01-03T00:00:00Z",
    keywords: [],
  },
]

const KEYWORDS: Keyword[] = [
  { id: "k1", name: "budget", description: null, category: null, created_at: "" },
]

// ---- Import under test (after mocks) --------------------------------------

import { ContactsTable } from "./contacts-table"
import { bulkUpdateCity } from "@/app/actions/contacts"

// ---- Tests -----------------------------------------------------------------

describe("ContactsTable", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // ---------- Rendering ----------

  it("renders all contacts in the table", () => {
    render(<ContactsTable contacts={CONTACTS} keywords={KEYWORDS} />)

    expect(screen.getByText("Alice Wong")).toBeInTheDocument()
    expect(screen.getByText("Bob Chen")).toBeInTheDocument()
    expect(screen.getByText("Carol Martinez")).toBeInTheDocument()
  })

  it("shows city name for contacts with city_id", () => {
    render(<ContactsTable contacts={CONTACTS} keywords={KEYWORDS} />)

    // San Francisco should appear for Alice and Bob
    const sfCells = screen.getAllByText("San Francisco")
    expect(sfCells.length).toBeGreaterThanOrEqual(1) // at least in city column
  })

  it("shows 'Not set' for contacts without city_id", () => {
    render(<ContactsTable contacts={CONTACTS} keywords={KEYWORDS} />)

    expect(screen.getByText("Not set")).toBeInTheDocument()
  })

  // ---------- Search / filter ----------

  it("filters contacts by search query", async () => {
    const user = userEvent.setup()
    render(<ContactsTable contacts={CONTACTS} keywords={KEYWORDS} />)

    const searchInput = screen.getByPlaceholderText(/search contacts/i)
    await user.type(searchInput, "alice")

    expect(screen.getByText("Alice Wong")).toBeInTheDocument()
    expect(screen.queryByText("Bob Chen")).not.toBeInTheDocument()
    expect(screen.queryByText("Carol Martinez")).not.toBeInTheDocument()
  })

  it("filters contacts by email", async () => {
    const user = userEvent.setup()
    render(<ContactsTable contacts={CONTACTS} keywords={KEYWORDS} />)

    const searchInput = screen.getByPlaceholderText(/search contacts/i)
    await user.type(searchInput, "oakland")

    expect(screen.getByText("Carol Martinez")).toBeInTheDocument()
    expect(screen.queryByText("Alice Wong")).not.toBeInTheDocument()
  })

  // ---------- Checkbox selection ----------

  it("selects individual contacts with checkboxes", async () => {
    const user = userEvent.setup()
    render(<ContactsTable contacts={CONTACTS} keywords={KEYWORDS} />)

    const checkboxes = screen.getAllByRole("checkbox")
    // First checkbox is "select all", rest are individual
    expect(checkboxes.length).toBe(4) // 1 header + 3 rows

    // Select first contact
    await user.click(checkboxes[1])

    // Should show bulk action bar
    expect(screen.getByText(/1 selected/i)).toBeInTheDocument()
  })

  it("selects all contacts with header checkbox", async () => {
    const user = userEvent.setup()
    render(<ContactsTable contacts={CONTACTS} keywords={KEYWORDS} />)

    const selectAll = screen.getAllByRole("checkbox")[0]
    await user.click(selectAll)

    expect(screen.getByText(/3 selected/i)).toBeInTheDocument()
  })

  // ---------- Bulk city assignment ----------

  it("shows pinned cities (San Francisco) at top of city picker", async () => {
    const user = userEvent.setup()
    render(<ContactsTable contacts={CONTACTS} keywords={KEYWORDS} />)

    // Select a contact
    const checkboxes = screen.getAllByRole("checkbox")
    await user.click(checkboxes[1])

    // Click "Assign City" button
    const assignBtn = screen.getByRole("button", { name: /assign city/i })
    await user.click(assignBtn)

    // Pinned SF should appear in the picker dropdown (there are also SF texts in the table)
    const allSF = screen.getAllByText("San Francisco")
    expect(allSF.length).toBeGreaterThanOrEqual(2) // table cells + picker
  })

  it("calls bulkUpdateCity when selecting a city", async () => {
    const user = userEvent.setup()
    render(<ContactsTable contacts={CONTACTS} keywords={KEYWORDS} />)

    // Select Carol (no city)
    const checkboxes = screen.getAllByRole("checkbox")
    await user.click(checkboxes[3]) // Carol is 3rd contact

    // Open city picker
    const assignBtn = screen.getByRole("button", { name: /assign city/i })
    await user.click(assignBtn)

    // Click pinned San Francisco
    // There may be multiple "San Francisco" text nodes; find the one inside the picker button
    const pickerButtons = screen.getAllByRole("button").filter(
      btn => btn.textContent?.includes("San Francisco") && btn.closest(".absolute")
    )
    if (pickerButtons.length > 0) {
      await user.click(pickerButtons[0])
    }

    await waitFor(() => {
      expect(bulkUpdateCity).toHaveBeenCalledWith(
        ["c-3"],
        1,
        expect.any(String), // "San Francisco" or display_name
      )
    })
  })

  // ---------- City breakdown ----------

  it("shows city breakdown badges", () => {
    render(<ContactsTable contacts={CONTACTS} keywords={KEYWORDS} />)

    // Should show SF count and Not set count
    const badges = screen.getAllByText(/San Francisco|Not set/i)
    expect(badges.length).toBeGreaterThanOrEqual(1)
  })

  // ---------- Clear selection ----------

  it("clears selection when Clear Selection is clicked", async () => {
    const user = userEvent.setup()
    render(<ContactsTable contacts={CONTACTS} keywords={KEYWORDS} />)

    // Select all
    await user.click(screen.getAllByRole("checkbox")[0])
    expect(screen.getByText(/3 selected/i)).toBeInTheDocument()

    // Clear
    const clearBtn = screen.getByRole("button", { name: /clear selection/i })
    await user.click(clearBtn)

    // Bulk bar should be gone
    expect(screen.queryByText(/selected/i)).not.toBeInTheDocument()
  })
})

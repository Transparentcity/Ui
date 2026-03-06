/**
 * Tests for the Contacts Table component.
 *
 * Covers:
 * - Rendering contacts list
 * - Search/filter contacts
 * - Checkbox selection
 * - Bulk city assignment (pinned + search)
 * - Bulk keyword assignment
 * - Bulk type assignment
 * - City breakdown badges
 * - Clear city assignment
 */
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { vi, describe, it, expect, beforeEach } from "vitest"

// ---- Polyfills for Radix in JSDOM ------------------------------------------

// Radix Select requires pointer capture APIs that JSDOM doesn't provide
if (typeof Element.prototype.hasPointerCapture !== "function") {
  Element.prototype.hasPointerCapture = () => false
}
if (typeof Element.prototype.setPointerCapture !== "function") {
  Element.prototype.setPointerCapture = () => {}
}
if (typeof Element.prototype.releasePointerCapture !== "function") {
  Element.prototype.releasePointerCapture = () => {}
}

// ---- Mocks ----------------------------------------------------------------

const mockToastSuccess = vi.fn()
const mockToastError = vi.fn()
vi.mock("sonner", () => ({
  toast: {
    success: (...args: any[]) => mockToastSuccess(...args),
    error: (...args: any[]) => mockToastError(...args),
  },
}))

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

// Mock contact-activity-timeline
vi.mock("./contact-activity-timeline", () => ({
  ContactActivityTimeline: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="activity-timeline-trigger">{children}</div>
  ),
}))

// Mock server actions
vi.mock("@/app/actions/contacts", () => ({
  deleteContact: vi.fn().mockResolvedValue(undefined),
  bulkUpdateCity: vi.fn().mockResolvedValue({ updated: 2, errors: [] }),
  bulkAddKeywords: vi.fn().mockResolvedValue({ updated: 2, errors: [] }),
  bulkUpdateType: vi.fn().mockResolvedValue({ updated: 2, errors: [] }),
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
  contact_type: string | null
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
    city_id: 57260,
    city_name: "San Francisco",
    contact_type: "elected_official",
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
    city_id: 57260,
    city_name: "San Francisco",
    contact_type: "city_staff",
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
    contact_type: null,
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
  { id: "k2", name: "police", description: null, category: null, created_at: "" },
  { id: "k3", name: "housing", description: null, category: null, created_at: "" },
]

// ---- Import under test (after mocks) --------------------------------------

import { ContactsTable } from "./contacts-table"
import { deleteContact, bulkUpdateCity, bulkAddKeywords, bulkUpdateType } from "@/app/actions/contacts"

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

    await waitFor(() => {
      expect(screen.getByText("Alice Wong")).toBeInTheDocument()
      expect(screen.queryByText("Bob Chen")).not.toBeInTheDocument()
      expect(screen.queryByText("Carol Martinez")).not.toBeInTheDocument()
    })
  })

  it("filters contacts by email", async () => {
    const user = userEvent.setup()
    render(<ContactsTable contacts={CONTACTS} keywords={KEYWORDS} />)

    const searchInput = screen.getByPlaceholderText(/search contacts/i)
    await user.type(searchInput, "oakland")

    await waitFor(() => {
      expect(screen.getByText("Carol Martinez")).toBeInTheDocument()
      expect(screen.queryByText("Alice Wong")).not.toBeInTheDocument()
    })
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

    // Click pinned San Francisco inside the picker dropdown
    const pickerButtons = screen.getAllByRole("button").filter(
      btn => btn.textContent?.includes("San Francisco") && btn.closest(".absolute")
    )
    expect(pickerButtons.length).toBeGreaterThan(0)
    await user.click(pickerButtons[0])

    await waitFor(() => {
      expect(bulkUpdateCity).toHaveBeenCalledWith(
        ["c-3"],
        57260,
        "San Francisco",
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

  // ---------- Contact type column ----------

  it("renders a Type column header", () => {
    render(<ContactsTable contacts={CONTACTS} keywords={KEYWORDS} />)
    expect(screen.getByText("Type")).toBeInTheDocument()
  })

  it("shows contact type badge when set", () => {
    render(<ContactsTable contacts={CONTACTS} keywords={KEYWORDS} />)
    expect(screen.getByText("Elected Official")).toBeInTheDocument()
    expect(screen.getByText("City Staff")).toBeInTheDocument()
  })

  it.each([
    ["elected_official", "Elected Official"],
    ["city_staff", "City Staff"],
    ["media", "Press"],
    ["academic", "Academic"],
    ["nonprofit", "Nonprofit"],
    ["lobbyist", "Lobbyist"],
    ["community_leader", "Community Leader"],
  ])("renders correct label for contact_type=%s", (type, label) => {
    const contact: TestContact = {
      ...CONTACTS[0],
      id: `ct-${type}`,
      contact_type: type,
    }
    render(<ContactsTable contacts={[contact]} keywords={KEYWORDS} />)
    expect(screen.getByText(label)).toBeInTheDocument()
  })

  it("filters contacts by contact type label in search", async () => {
    const user = userEvent.setup()
    render(<ContactsTable contacts={CONTACTS} keywords={KEYWORDS} />)

    const searchInput = screen.getByPlaceholderText(/search contacts/i)
    await user.type(searchInput, "Elected")

    await waitFor(() => {
      expect(screen.getByText("Alice Wong")).toBeInTheDocument()
      expect(screen.queryByText("Bob Chen")).not.toBeInTheDocument()
      expect(screen.queryByText("Carol Martinez")).not.toBeInTheDocument()
    })
  })

  // ---------- Bulk keyword assignment ----------

  it("shows Assign Keywords button when contacts are selected", async () => {
    const user = userEvent.setup()
    render(<ContactsTable contacts={CONTACTS} keywords={KEYWORDS} />)

    await user.click(screen.getAllByRole("checkbox")[1])

    expect(screen.getByRole("button", { name: /assign keywords/i })).toBeInTheDocument()
  })

  it("opens keyword picker with all keywords listed", async () => {
    const user = userEvent.setup()
    render(<ContactsTable contacts={CONTACTS} keywords={KEYWORDS} />)

    await user.click(screen.getAllByRole("checkbox")[0]) // select all
    await user.click(screen.getByRole("button", { name: /assign keywords/i }))

    expect(screen.getByPlaceholderText(/search keywords/i)).toBeInTheDocument()
    // "budget" appears in table AND picker, so use getAllByText
    expect(screen.getAllByText("budget").length).toBeGreaterThanOrEqual(2)
    expect(screen.getByText("police")).toBeInTheDocument()
    expect(screen.getByText("housing")).toBeInTheDocument()
  })

  it("filters keywords in the picker by search", async () => {
    const user = userEvent.setup()
    render(<ContactsTable contacts={CONTACTS} keywords={KEYWORDS} />)

    await user.click(screen.getAllByRole("checkbox")[1])
    await user.click(screen.getByRole("button", { name: /assign keywords/i }))

    const kwSearch = screen.getByPlaceholderText(/search keywords/i)
    await user.type(kwSearch, "pol")

    expect(screen.getByText("police")).toBeInTheDocument()
    // "housing" should not appear in the picker (filtered out)
    // "budget" still appears in Alice's keyword column, but not in the picker
    expect(screen.queryByText("housing")).not.toBeInTheDocument()

    // Verify the picker only shows police — get the picker container
    const pickerContainer = screen.getByRole("button", { name: /assign keywords/i }).parentElement!
    const dropdown = pickerContainer.querySelector(".absolute")!
    expect(dropdown.textContent).toContain("police")
    expect(dropdown.textContent).not.toContain("housing")
  })

  it("calls bulkAddKeywords when selecting keywords and clicking Apply", async () => {
    const user = userEvent.setup()
    render(<ContactsTable contacts={CONTACTS} keywords={KEYWORDS} />)

    // Select Alice and Bob
    const checkboxes = screen.getAllByRole("checkbox")
    await user.click(checkboxes[1])
    await user.click(checkboxes[2])

    // Open keyword picker
    await user.click(screen.getByRole("button", { name: /assign keywords/i }))

    // Get keyword checkboxes from inside the picker dropdown
    const pickerContainer = screen.getByRole("button", { name: /assign keywords/i }).parentElement!
    const dropdown = pickerContainer.querySelector(".absolute")!
    const kwCheckboxes = Array.from(dropdown.querySelectorAll('[role="checkbox"]'))
    // Order: budget, police, housing
    await user.click(kwCheckboxes[1]) // police
    await user.click(kwCheckboxes[2]) // housing

    // Apply button should appear
    const applyBtn = screen.getByRole("button", { name: /apply/i })
    await user.click(applyBtn)

    await waitFor(() => {
      expect(bulkAddKeywords).toHaveBeenCalledWith(
        expect.arrayContaining(["c-1", "c-2"]),
        expect.arrayContaining(["k2", "k3"]),
      )
    })
  })

  it("does not show Apply button when no keywords are checked", async () => {
    const user = userEvent.setup()
    render(<ContactsTable contacts={CONTACTS} keywords={KEYWORDS} />)

    await user.click(screen.getAllByRole("checkbox")[1])
    await user.click(screen.getByRole("button", { name: /assign keywords/i }))

    expect(screen.queryByRole("button", { name: /apply/i })).not.toBeInTheDocument()
  })

  // ---------- Bulk type assignment ----------

  it("shows Assign Type button when contacts are selected", async () => {
    const user = userEvent.setup()
    render(<ContactsTable contacts={CONTACTS} keywords={KEYWORDS} />)

    await user.click(screen.getAllByRole("checkbox")[1])

    expect(screen.getByRole("button", { name: /assign type/i })).toBeInTheDocument()
  })

  it("opens type picker with all contact types listed", async () => {
    const user = userEvent.setup()
    render(<ContactsTable contacts={CONTACTS} keywords={KEYWORDS} />)

    await user.click(screen.getAllByRole("checkbox")[1])
    await user.click(screen.getByRole("button", { name: /assign type/i }))

    // Type picker should show all 7 types as badges inside buttons
    const pickerContainer = screen.getByRole("button", { name: /assign type/i }).parentElement!
    const dropdown = pickerContainer.querySelector(".absolute")
    expect(dropdown).not.toBeNull()

    // Check for specific type labels inside the dropdown
    expect(dropdown!.textContent).toContain("Elected Official")
    expect(dropdown!.textContent).toContain("City Staff")
    expect(dropdown!.textContent).toContain("Press")
    expect(dropdown!.textContent).toContain("Academic")
    expect(dropdown!.textContent).toContain("Nonprofit")
    expect(dropdown!.textContent).toContain("Lobbyist")
    expect(dropdown!.textContent).toContain("Community Leader")
  })

  it("calls bulkUpdateType when clicking a type", async () => {
    const user = userEvent.setup()
    render(<ContactsTable contacts={CONTACTS} keywords={KEYWORDS} />)

    // Select Carol (no type)
    await user.click(screen.getAllByRole("checkbox")[3])

    // Open type picker
    await user.click(screen.getByRole("button", { name: /assign type/i }))

    // Click "Press" type in the dropdown
    const pickerContainer = screen.getByRole("button", { name: /assign type/i }).parentElement!
    const dropdown = pickerContainer.querySelector(".absolute")!
    const pressBtn = Array.from(dropdown.querySelectorAll("button")).find(
      btn => btn.textContent?.includes("Press")
    )!
    await user.click(pressBtn)

    await waitFor(() => {
      expect(bulkUpdateType).toHaveBeenCalledWith(["c-3"], "media")
    })
  })

  // ---------- Picker mutual exclusion ----------

  it("closes city picker when opening keyword picker", async () => {
    const user = userEvent.setup()
    render(<ContactsTable contacts={CONTACTS} keywords={KEYWORDS} />)

    await user.click(screen.getAllByRole("checkbox")[1])

    // Open city picker
    await user.click(screen.getByRole("button", { name: /assign city/i }))
    expect(screen.getByPlaceholderText(/search other cities/i)).toBeInTheDocument()

    // Open keyword picker — city picker should close
    await user.click(screen.getByRole("button", { name: /assign keywords/i }))
    expect(screen.queryByPlaceholderText(/search other cities/i)).not.toBeInTheDocument()
    expect(screen.getByPlaceholderText(/search keywords/i)).toBeInTheDocument()
  })

  it("closes keyword picker when opening type picker", async () => {
    const user = userEvent.setup()
    render(<ContactsTable contacts={CONTACTS} keywords={KEYWORDS} />)

    await user.click(screen.getAllByRole("checkbox")[1])

    // Open keyword picker
    await user.click(screen.getByRole("button", { name: /assign keywords/i }))
    expect(screen.getByPlaceholderText(/search keywords/i)).toBeInTheDocument()

    // Open type picker — keyword picker should close
    await user.click(screen.getByRole("button", { name: /assign type/i }))
    expect(screen.queryByPlaceholderText(/search keywords/i)).not.toBeInTheDocument()
  })

  // ---------- Delete contact ----------

  it("calls deleteContact and refreshes after confirming delete", async () => {
    const user = userEvent.setup()
    render(<ContactsTable contacts={CONTACTS} keywords={KEYWORDS} />)

    // Open the dropdown menu for the first contact (MoreHorizontal icon button)
    const moreButtons = screen.getAllByRole("button", { name: "" }).filter(
      (btn) => btn.classList.contains("h-8") && btn.classList.contains("w-8")
    )
    await user.click(moreButtons[0])

    // Wait for dropdown to open and click Delete
    const deleteOption = await screen.findByRole("menuitem", { name: /delete/i })
    await user.click(deleteOption)

    // AlertDialog should appear — confirm by clicking the Delete button
    const confirmBtn = await screen.findByRole("button", { name: /^delete$/i })
    await user.click(confirmBtn)

    await waitFor(() => {
      expect(deleteContact).toHaveBeenCalledWith("c-1")
    })
    await waitFor(() => {
      expect(mockRefresh).toHaveBeenCalled()
    })
  })

  it("does not delete when confirm is cancelled", async () => {
    const user = userEvent.setup()
    render(<ContactsTable contacts={CONTACTS} keywords={KEYWORDS} />)

    const moreButtons = screen.getAllByRole("button", { name: "" }).filter(
      (btn) => btn.classList.contains("h-8") && btn.classList.contains("w-8")
    )
    await user.click(moreButtons[0])

    const deleteOption = await screen.findByRole("menuitem", { name: /delete/i })
    await user.click(deleteOption)

    // AlertDialog should appear — click Cancel
    const cancelBtn = await screen.findByRole("button", { name: /cancel/i })
    await user.click(cancelBtn)

    expect(deleteContact).not.toHaveBeenCalled()
  })

  // ---------- Export CSV ----------

  it("triggers CSV download when Export CSV is clicked", async () => {
    const user = userEvent.setup()
    const createObjectURL = vi.fn().mockReturnValue("blob:test")
    const revokeObjectURL = vi.fn()
    global.URL.createObjectURL = createObjectURL
    global.URL.revokeObjectURL = revokeObjectURL

    render(<ContactsTable contacts={CONTACTS} keywords={KEYWORDS} />)

    const exportBtn = screen.getByRole("button", { name: /export csv/i })
    await user.click(exportBtn)

    // Verify a Blob was created and URL lifecycle was managed
    expect(createObjectURL).toHaveBeenCalledWith(expect.any(Blob))
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:test")
  })

  // ---------- Type filter dropdown ----------

  it("renders the type filter dropdown", () => {
    render(<ContactsTable contacts={CONTACTS} keywords={KEYWORDS} />)

    // The type filter is a Radix Select (combobox role) showing "All" by default
    const typeSelect = screen.getAllByRole("combobox")[0]
    expect(typeSelect).toHaveTextContent("All")
  })

  it("shows correct count when type filter is applied via initialTypeFilter", () => {
    render(<ContactsTable contacts={CONTACTS} keywords={KEYWORDS} initialTypeFilter="city_staff" />)

    // Only Bob should be visible (city_staff)
    expect(screen.getByText("Bob Chen")).toBeInTheDocument()
    expect(screen.queryByText("Alice Wong")).not.toBeInTheDocument()
    // Count should show 1 contact
    expect(screen.getByText("1 contact")).toBeInTheDocument()
  })

  // ---------- Column sorting ----------

  it("sorts contacts by name when Name header is clicked", async () => {
    const user = userEvent.setup()
    render(<ContactsTable contacts={CONTACTS} keywords={KEYWORDS} />)

    // The sort buttons are inside <th> elements. Find the one with "Name" text.
    const headerButtons = screen.getAllByRole("button")
    const nameHeader = headerButtons.find(
      (btn) => btn.textContent === "Name" || btn.textContent?.startsWith("Name")
    )!
    expect(nameHeader).toBeDefined()
    await user.click(nameHeader)

    // After ascending sort: Alice, Bob, Carol
    const rows = screen.getAllByRole("row")
    // rows[0] is header, rows[1-3] are data
    expect(rows[1]).toHaveTextContent(/Alice Wong/)
    expect(rows[2]).toHaveTextContent(/Bob Chen/)
    expect(rows[3]).toHaveTextContent(/Carol Martinez/)

    // Click again for descending
    await user.click(nameHeader)
    const rowsDesc = screen.getAllByRole("row")
    expect(rowsDesc[1]).toHaveTextContent(/Carol Martinez/)
    expect(rowsDesc[3]).toHaveTextContent(/Alice Wong/)
  })

  // ---------- Empty state ----------

  it("shows empty message when no contacts exist", () => {
    render(<ContactsTable contacts={[]} keywords={KEYWORDS} />)
    expect(screen.getByText(/No contacts yet/)).toBeInTheDocument()
  })

  it("shows 'No contacts found' when search matches nothing", async () => {
    const user = userEvent.setup()
    render(<ContactsTable contacts={CONTACTS} keywords={KEYWORDS} />)

    const searchInput = screen.getByPlaceholderText(/search contacts/i)
    await user.type(searchInput, "zzzznonexistent")

    await waitFor(() => {
      expect(screen.getByText(/No contacts found/)).toBeInTheDocument()
    })
  })

  // ---------- Initial type filter from URL ----------

  it("applies initialTypeFilter prop", () => {
    render(<ContactsTable contacts={CONTACTS} keywords={KEYWORDS} initialTypeFilter="elected_official" />)

    expect(screen.getByText("Alice Wong")).toBeInTheDocument()
    expect(screen.queryByText("Bob Chen")).not.toBeInTheDocument()
  })

  // ---------- Clickable city badges (#3) ----------

  it("filters contacts when a city badge is clicked", async () => {
    const user = userEvent.setup()
    render(<ContactsTable contacts={CONTACTS} keywords={KEYWORDS} />)

    // Find the San Francisco badge in the city breakdown
    const badges = screen.getAllByText(/San Francisco: 2/i)
    expect(badges.length).toBeGreaterThan(0)
    await user.click(badges[0])

    // Only Alice and Bob should be visible (San Francisco contacts)
    expect(screen.getByText("Alice Wong")).toBeInTheDocument()
    expect(screen.getByText("Bob Chen")).toBeInTheDocument()
    expect(screen.queryByText("Carol Martinez")).not.toBeInTheDocument()
  })

  it("clears city filter when same badge is clicked again", async () => {
    const user = userEvent.setup()
    render(<ContactsTable contacts={CONTACTS} keywords={KEYWORDS} />)

    const badges = screen.getAllByText(/San Francisco: 2/i)
    // Click to filter
    await user.click(badges[0])
    expect(screen.queryByText("Carol Martinez")).not.toBeInTheDocument()

    // Click again to clear
    await user.click(badges[0])
    expect(screen.getByText("Carol Martinez")).toBeInTheDocument()
  })

  it("highlights active city badge with ring", async () => {
    const user = userEvent.setup()
    render(<ContactsTable contacts={CONTACTS} keywords={KEYWORDS} />)

    const badges = screen.getAllByText(/San Francisco: 2/i)
    await user.click(badges[0])

    // The badge should have ring-2 ring-purple-500 class
    expect(badges[0].closest("[class*='ring-2']")).not.toBeNull()
  })

  // ---------- Pagination (#6) ----------

  it("does not show pagination when contacts fit on one page", () => {
    render(<ContactsTable contacts={CONTACTS} keywords={KEYWORDS} />)
    expect(screen.queryByTestId("pagination-controls")).not.toBeInTheDocument()
  })

  it("shows pagination when contacts exceed page size", () => {
    // Create 30 contacts to exceed pageSize of 25
    const manyContacts = Array.from({ length: 30 }, (_, i) => ({
      ...CONTACTS[0],
      id: `c-${i}`,
      name: `Contact ${String(i).padStart(2, "0")}`,
    }))
    render(<ContactsTable contacts={manyContacts} keywords={KEYWORDS} />)
    const pagination = screen.getByTestId("pagination-controls")
    expect(pagination).toBeInTheDocument()
    expect(pagination).toHaveTextContent(/Page 1 of 2/)
    expect(pagination).toHaveTextContent(/30 contacts/)
  })

  it("navigates to next page when Next button is clicked", async () => {
    const user = userEvent.setup()
    const manyContacts = Array.from({ length: 30 }, (_, i) => ({
      ...CONTACTS[0],
      id: `c-${i}`,
      name: `Contact ${String(i).padStart(2, "0")}`,
    }))
    render(<ContactsTable contacts={manyContacts} keywords={KEYWORDS} />)

    // Should be on page 1
    expect(screen.getByText(/Page 1 of 2/)).toBeInTheDocument()

    // Click next button (third pagination button)
    const paginationButtons = screen.getByTestId("pagination-controls").querySelectorAll("button")
    // Buttons: First, Prev, Next, Last
    await user.click(paginationButtons[2]) // Next

    expect(screen.getByText(/Page 2 of 2/)).toBeInTheDocument()
  })

  it("resets page to 1 when search query changes", async () => {
    const user = userEvent.setup()
    const manyContacts = Array.from({ length: 30 }, (_, i) => ({
      ...CONTACTS[0],
      id: `c-${i}`,
      name: `Contact ${String(i).padStart(2, "0")}`,
    }))
    render(<ContactsTable contacts={manyContacts} keywords={KEYWORDS} />)

    // Go to page 2
    const paginationButtons = screen.getByTestId("pagination-controls").querySelectorAll("button")
    await user.click(paginationButtons[2])
    expect(screen.getByText(/Page 2 of 2/)).toBeInTheDocument()

    // Type in search - should reset to page 1
    const searchInput = screen.getByPlaceholderText(/search contacts/i)
    await user.type(searchInput, "Contact 0")

    // Wait for debounce to apply, then check pagination reset
    await waitFor(() => {
      const pagination = screen.queryByTestId("pagination-controls")
      if (pagination) {
        expect(pagination).toHaveTextContent(/Page 1/)
      }
    })
  })

  // ---------- Draft indicator badges (#2) ----------

  it("shows draft count badges next to contact name", () => {
    const contactsWithDrafts = [
      { ...CONTACTS[0], draftCounts: { pending: 2, sent: 1 } },
      { ...CONTACTS[1], draftCounts: { pending: 0, sent: 3 } },
      CONTACTS[2],
    ]
    render(<ContactsTable contacts={contactsWithDrafts} keywords={KEYWORDS} />)

    expect(screen.getByText("2 drafts")).toBeInTheDocument()
    expect(screen.getByText("1 sent")).toBeInTheDocument()
    expect(screen.getByText("3 sent")).toBeInTheDocument()
  })

  it("does not show draft badges when counts are zero or undefined", () => {
    render(<ContactsTable contacts={CONTACTS} keywords={KEYWORDS} />)
    expect(screen.queryByText(/drafts?$/)).not.toBeInTheDocument()
    expect(screen.queryByText(/^\d+ sent$/)).not.toBeInTheDocument()
  })

  // ---------- Generate Draft menu item (#11) ----------

  it("shows Generate Draft menu item in dropdown", async () => {
    const user = userEvent.setup()
    render(<ContactsTable contacts={CONTACTS} keywords={KEYWORDS} />)

    const moreButtons = screen.getAllByRole("button", { name: "" }).filter(
      (btn) => btn.classList.contains("h-8") && btn.classList.contains("w-8")
    )
    await user.click(moreButtons[0])

    const generateOption = await screen.findByRole("menuitem", { name: /generate draft/i })
    expect(generateOption).toBeInTheDocument()
  })

  it("disables Generate Draft when contact has no city_id", async () => {
    const user = userEvent.setup()
    // Carol (c-3) has no city_id
    render(<ContactsTable contacts={[CONTACTS[2]]} keywords={KEYWORDS} />)

    const moreButtons = screen.getAllByRole("button", { name: "" }).filter(
      (btn) => btn.classList.contains("h-8") && btn.classList.contains("w-8")
    )
    await user.click(moreButtons[0])

    const generateOption = await screen.findByRole("menuitem", { name: /generate draft/i })
    expect(generateOption).toHaveAttribute("data-disabled")
  })

  // ---------- Activity menu item (#12) ----------

  it("shows Activity menu item in dropdown", async () => {
    const user = userEvent.setup()
    render(<ContactsTable contacts={CONTACTS} keywords={KEYWORDS} />)

    const moreButtons = screen.getAllByRole("button", { name: "" }).filter(
      (btn) => btn.classList.contains("h-8") && btn.classList.contains("w-8")
    )
    await user.click(moreButtons[0])

    const activityOption = await screen.findByRole("menuitem", { name: /activity/i })
    expect(activityOption).toBeInTheDocument()
  })

  // ---------- Toast notifications ----------

  it("shows toast on bulk city assignment", async () => {
    const user = userEvent.setup()
    render(<ContactsTable contacts={CONTACTS} keywords={KEYWORDS} />)

    await user.click(screen.getAllByRole("checkbox")[3]) // Carol
    const assignBtn = screen.getByRole("button", { name: /assign city/i })
    await user.click(assignBtn)

    const pickerButtons = screen.getAllByRole("button").filter(
      btn => btn.textContent?.includes("San Francisco") && btn.closest(".absolute")
    )
    await user.click(pickerButtons[0])

    await waitFor(() => {
      expect(mockToastSuccess).toHaveBeenCalledWith(expect.stringContaining("Assigned"))
    })
  })

  it("shows toast on delete contact", async () => {
    const user = userEvent.setup()
    render(<ContactsTable contacts={CONTACTS} keywords={KEYWORDS} />)

    const moreButtons = screen.getAllByRole("button", { name: "" }).filter(
      (btn) => btn.classList.contains("h-8") && btn.classList.contains("w-8")
    )
    await user.click(moreButtons[0])
    const deleteOption = await screen.findByRole("menuitem", { name: /delete/i })
    await user.click(deleteOption)
    const confirmBtn = await screen.findByRole("button", { name: /^delete$/i })
    await user.click(confirmBtn)

    await waitFor(() => {
      expect(mockToastSuccess).toHaveBeenCalledWith("Contact deleted")
    })
  })

  it("shows toast on CSV export", async () => {
    const user = userEvent.setup()
    global.URL.createObjectURL = vi.fn().mockReturnValue("blob:test")
    global.URL.revokeObjectURL = vi.fn()

    render(<ContactsTable contacts={CONTACTS} keywords={KEYWORDS} />)
    await user.click(screen.getByRole("button", { name: /export csv/i }))

    expect(mockToastSuccess).toHaveBeenCalledWith("CSV exported")
  })

  it("shows error toast when bulk operation fails", async () => {
    const user = userEvent.setup()
    ;(bulkUpdateCity as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error("Server error"))

    render(<ContactsTable contacts={CONTACTS} keywords={KEYWORDS} />)

    await user.click(screen.getAllByRole("checkbox")[3])
    const assignBtn = screen.getByRole("button", { name: /assign city/i })
    await user.click(assignBtn)

    const pickerButtons = screen.getAllByRole("button").filter(
      btn => btn.textContent?.includes("San Francisco") && btn.closest(".absolute")
    )
    await user.click(pickerButtons[0])

    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalledWith("Failed to assign city")
    })
  })

  it("shows toast on bulk clear city", async () => {
    const user = userEvent.setup()
    render(<ContactsTable contacts={CONTACTS} keywords={KEYWORDS} />)

    // Select Alice (has city_id set)
    await user.click(screen.getAllByRole("checkbox")[1])
    const assignBtn = screen.getByRole("button", { name: /assign city/i })
    await user.click(assignBtn)

    // Click "Clear city assignment" at the bottom of the picker
    const clearBtn = screen.getByText("Clear city assignment")
    await user.click(clearBtn)

    await waitFor(() => {
      expect(bulkUpdateCity).toHaveBeenCalledWith(["c-1"], null, null)
      expect(mockToastSuccess).toHaveBeenCalledWith(expect.stringContaining("Cleared city"))
    })
  })

  it("shows toast on bulk keyword assignment", async () => {
    const user = userEvent.setup()
    render(<ContactsTable contacts={CONTACTS} keywords={KEYWORDS} />)

    // Select Carol (no keywords, avoids duplicate "budget" text)
    await user.click(screen.getAllByRole("checkbox")[3])
    const kwBtn = screen.getByRole("button", { name: /assign keywords/i })
    await user.click(kwBtn)

    // Check "police" keyword (unique in DOM — "budget" may appear as a badge too)
    await waitFor(() => {
      expect(screen.getByRole("checkbox", { name: /police/i })).toBeInTheDocument()
    })
    await user.click(screen.getByRole("checkbox", { name: /police/i }))

    const applyBtn = screen.getByRole("button", { name: /apply/i })
    await user.click(applyBtn)

    await waitFor(() => {
      expect(bulkAddKeywords).toHaveBeenCalled()
      expect(mockToastSuccess).toHaveBeenCalledWith(expect.stringContaining("keyword"))
    })
  })

  it("shows toast on bulk type assignment", async () => {
    const user = userEvent.setup()
    render(<ContactsTable contacts={CONTACTS} keywords={KEYWORDS} />)

    // Select Carol (no contact_type, so "City Staff" won't appear as badge)
    await user.click(screen.getAllByRole("checkbox")[3])
    const typeBtn = screen.getByRole("button", { name: /assign type/i })
    await user.click(typeBtn)

    // Click a type option in the picker dropdown
    await waitFor(() => {
      const pickerItems = screen.getAllByText("City Staff")
      expect(pickerItems.length).toBeGreaterThan(0)
    })
    // Find the picker item inside the absolute-positioned dropdown
    const typeOptions = screen.getAllByText("City Staff").filter(
      el => el.closest(".absolute")
    )
    await user.click(typeOptions[0])

    await waitFor(() => {
      expect(bulkUpdateType).toHaveBeenCalled()
      expect(mockToastSuccess).toHaveBeenCalledWith(expect.stringContaining("Set type"))
    })
  })

  it("shows error toast when delete fails", async () => {
    const user = userEvent.setup()
    ;(deleteContact as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error("DB error"))

    render(<ContactsTable contacts={CONTACTS} keywords={KEYWORDS} />)

    const moreButtons = screen.getAllByRole("button", { name: "" }).filter(
      (btn) => btn.classList.contains("h-8") && btn.classList.contains("w-8")
    )
    await user.click(moreButtons[0])
    const deleteOption = await screen.findByRole("menuitem", { name: /delete/i })
    await user.click(deleteOption)
    const confirmBtn = await screen.findByRole("button", { name: /^delete$/i })
    await user.click(confirmBtn)

    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalledWith("Failed to delete contact")
    })
  })

  it("shows error toast when bulk clear city fails", async () => {
    const user = userEvent.setup()
    ;(bulkUpdateCity as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error("Server error"))

    render(<ContactsTable contacts={CONTACTS} keywords={KEYWORDS} />)

    await user.click(screen.getAllByRole("checkbox")[1])
    const assignBtn = screen.getByRole("button", { name: /assign city/i })
    await user.click(assignBtn)

    await user.click(screen.getByText("Clear city assignment"))

    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalledWith("Failed to clear city")
    })
  })

  it("shows error toast when bulk keyword assignment fails", async () => {
    const user = userEvent.setup()
    ;(bulkAddKeywords as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error("Server error"))

    render(<ContactsTable contacts={CONTACTS} keywords={KEYWORDS} />)

    await user.click(screen.getAllByRole("checkbox")[3]) // Carol — no keyword badges
    await user.click(screen.getByRole("button", { name: /assign keywords/i }))

    await waitFor(() => {
      expect(screen.getByRole("checkbox", { name: /police/i })).toBeInTheDocument()
    })
    await user.click(screen.getByRole("checkbox", { name: /police/i }))
    await user.click(screen.getByRole("button", { name: /apply/i }))

    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalledWith("Failed to assign keywords")
    })
  })

  it("shows error toast when bulk type assignment fails", async () => {
    const user = userEvent.setup()
    ;(bulkUpdateType as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error("Server error"))

    render(<ContactsTable contacts={CONTACTS} keywords={KEYWORDS} />)

    await user.click(screen.getAllByRole("checkbox")[3]) // Carol — no type badge
    await user.click(screen.getByRole("button", { name: /assign type/i }))

    await waitFor(() => {
      const typeOptions = screen.getAllByText("City Staff").filter(el => el.closest(".absolute"))
      expect(typeOptions.length).toBeGreaterThan(0)
    })
    const typeOptions = screen.getAllByText("City Staff").filter(el => el.closest(".absolute"))
    await user.click(typeOptions[0])

    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalledWith("Failed to assign type")
    })
  })

  // ---------- Debounced search ----------

  it("debounces search query for filtering", async () => {
    const user = userEvent.setup()
    vi.useFakeTimers({ shouldAdvanceTime: true })

    render(<ContactsTable contacts={CONTACTS} keywords={KEYWORDS} />)

    const searchInput = screen.getByPlaceholderText(/search contacts/i)
    await user.type(searchInput, "alice")

    // Before debounce fires, all contacts should still be visible
    // (searchQuery updates instantly for input, but filtering uses debouncedSearchQuery)
    // Advance timers past debounce delay
    vi.advanceTimersByTime(250)

    await waitFor(() => {
      expect(screen.getByText("Alice Wong")).toBeInTheDocument()
      expect(screen.queryByText("Bob Chen")).not.toBeInTheDocument()
    })

    vi.useRealTimers()
  })
})

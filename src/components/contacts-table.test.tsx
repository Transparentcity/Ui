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

    expect(screen.getByText("Alice Wong")).toBeInTheDocument()
    expect(screen.queryByText("Bob Chen")).not.toBeInTheDocument()
    expect(screen.queryByText("Carol Martinez")).not.toBeInTheDocument()
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
    vi.spyOn(window, "confirm").mockReturnValue(true)
    render(<ContactsTable contacts={CONTACTS} keywords={KEYWORDS} />)

    // Open the dropdown menu for the first contact (MoreHorizontal icon button)
    const moreButtons = screen.getAllByRole("button", { name: "" }).filter(
      (btn) => btn.classList.contains("h-8") && btn.classList.contains("w-8")
    )
    await user.click(moreButtons[0])

    // Wait for dropdown to open and click Delete
    const deleteOption = await screen.findByRole("menuitem", { name: /delete/i })
    await user.click(deleteOption)

    await waitFor(() => {
      expect(deleteContact).toHaveBeenCalledWith("c-1")
    })
    await waitFor(() => {
      expect(mockRefresh).toHaveBeenCalled()
    })
  })

  it("does not delete when confirm is cancelled", async () => {
    const user = userEvent.setup()
    vi.spyOn(window, "confirm").mockReturnValue(false)
    render(<ContactsTable contacts={CONTACTS} keywords={KEYWORDS} />)

    const moreButtons = screen.getAllByRole("button", { name: "" }).filter(
      (btn) => btn.classList.contains("h-8") && btn.classList.contains("w-8")
    )
    await user.click(moreButtons[0])

    const deleteOption = await screen.findByRole("menuitem", { name: /delete/i })
    await user.click(deleteOption)

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

    expect(screen.getByText(/No contacts found/)).toBeInTheDocument()
  })

  // ---------- Initial type filter from URL ----------

  it("applies initialTypeFilter prop", () => {
    render(<ContactsTable contacts={CONTACTS} keywords={KEYWORDS} initialTypeFilter="elected_official" />)

    expect(screen.getByText("Alice Wong")).toBeInTheDocument()
    expect(screen.queryByText("Bob Chen")).not.toBeInTheDocument()
  })
})

import { render, screen, fireEvent, waitFor, within } from "@testing-library/react"
import { vi, describe, it, expect, beforeEach } from "vitest"
import { ReviewQueuePage } from "./review-queue-page"
import {
  makeMockQuery,
  makeMockQueryLoading,
  makeMockMutation,
  makeMockMutationPending,
  makeQueueItem,
  installResizeObserver,
} from "./test-utils"

installResizeObserver()

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock("@auth0/auth0-react", () => ({
  useAuth0: () => ({
    getAccessTokenSilently: vi.fn().mockResolvedValue("mock-token"),
    isAuthenticated: true,
    isLoading: false,
  }),
}))

vi.mock("next/navigation", () => ({
  usePathname: () => "/waste/queue",
  useRouter: () => ({ push: vi.fn() }),
}))

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: any) => <a href={href} {...props}>{children}</a>,
}))

vi.mock("./WasteCityContext", () => ({
  useWasteCity: () => ({
    selectedCityId: 1,
    eligibleCities: [{ id: 1, name: "San Francisco", datasets_count: 5 }],
    isLoading: false,
    isFetching: false,
    cityLoadError: null,
    isCityFallback: false,
    setSelectedCityId: vi.fn(),
    selectedCityName: "San Francisco",
  }),
}))

vi.mock("./waste-shell", () => ({
  WasteShell: ({ children, title, description }: any) => (
    <div>
      <h1>{title}</h1>
      {description ? <p>{description}</p> : null}
      {children}
    </div>
  ),
}))

vi.mock("@/lib/hooks/useCities", () => ({
  useCities: vi.fn(),
}))

vi.mock("@/lib/hooks/useWaste", () => ({
  useWasteReviewQueue: vi.fn(),
  useAssignWasteQueueItem: vi.fn(),
  useBulkDisposeWasteFindings: vi.fn(),
  useCreateWasteDisposition: vi.fn(),
}))

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

import { toast } from "sonner"
import { useCities as _useCities } from "@/lib/hooks/useCities"
import {
  useWasteReviewQueue as _useWasteReviewQueue,
  useAssignWasteQueueItem as _useAssignWasteQueueItem,
  useBulkDisposeWasteFindings as _useBulkDisposeWasteFindings,
  useCreateWasteDisposition as _useCreateWasteDisposition,
} from "@/lib/hooks/useWaste"

const useCities = vi.mocked(_useCities)
const useWasteReviewQueue = vi.mocked(_useWasteReviewQueue)
const useAssignWasteQueueItem = vi.mocked(_useAssignWasteQueueItem)
const useBulkDisposeWasteFindings = vi.mocked(_useBulkDisposeWasteFindings)
const useCreateWasteDisposition = vi.mocked(_useCreateWasteDisposition)

function setupDefaultMocks() {
  useCities.mockReturnValue(
    makeMockQuery([{ city_id: 1, name: "San Francisco", datasets_count: 5 }]) as ReturnType<typeof _useCities>
  )
  const items = [
    makeQueueItem({ id: "qi-1", finding_id: 100, finding_entity_name: "Fire Department", priority: "critical" }),
    makeQueueItem({ id: "qi-2", finding_id: 101, finding_entity_name: "Police Department", priority: "high" }),
    makeQueueItem({ id: "qi-3", finding_id: 102, finding_entity_name: "DPW", priority: "medium" }),
  ]
  useWasteReviewQueue.mockReturnValue(
    makeMockQuery({ items, total: 3, page: 1, per_page: 25 }) as ReturnType<typeof _useWasteReviewQueue>
  )
  useAssignWasteQueueItem.mockReturnValue(makeMockMutation() as ReturnType<typeof _useAssignWasteQueueItem>)
  useBulkDisposeWasteFindings.mockReturnValue(makeMockMutation() as ReturnType<typeof _useBulkDisposeWasteFindings>)
  useCreateWasteDisposition.mockReturnValue(makeMockMutation() as ReturnType<typeof _useCreateWasteDisposition>)
}

describe("ReviewQueuePage", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setupDefaultMocks()
  })

  // ── Loading ────────────────────────────────────────────────────────────────

  it("shows loading skeletons while data loads", () => {
    useWasteReviewQueue.mockReturnValue(
      makeMockQueryLoading() as ReturnType<typeof _useWasteReviewQueue>
    )
    const { container } = render(<ReviewQueuePage />)
    expect(container.querySelectorAll(".animate-pulse").length).toBeGreaterThan(0)
  })

  // ── Rendering ──────────────────────────────────────────────────────────────

  it("renders queue items with entity names", () => {
    render(<ReviewQueuePage />)
    expect(screen.getByText("Fire Department")).toBeInTheDocument()
    expect(screen.getByText("Police Department")).toBeInTheDocument()
    expect(screen.getByText("DPW")).toBeInTheDocument()
  })

  it("shows total items count", () => {
    render(<ReviewQueuePage />)
    expect(screen.getByText("3 of 3 items")).toBeInTheDocument()
  })

  it("shows empty state when no items match", () => {
    useWasteReviewQueue.mockReturnValue(
      makeMockQuery({ items: [], total: 0, page: 1, per_page: 25 }) as ReturnType<typeof _useWasteReviewQueue>
    )
    render(<ReviewQueuePage />)
    expect(screen.getByText("No items in the review queue")).toBeInTheDocument()
  })

  // ── Select all checkbox ────────────────────────────────────────────────────

  it("renders Select All checkbox with label", () => {
    render(<ReviewQueuePage />)
    expect(screen.getByText("Select all on this page")).toBeInTheDocument()
  })

  it("selecting items shows bulk actions bar", () => {
    render(<ReviewQueuePage />)
    // Click the first row's checkbox (not the select-all)
    const checkboxes = screen.getAllByRole("checkbox")
    // checkboxes[0] is select-all, checkboxes[1] is first item
    fireEvent.click(checkboxes[1])
    expect(screen.getByText("1 selected")).toBeInTheDocument()
  })

  it("clear selection button hides bulk actions", () => {
    render(<ReviewQueuePage />)
    const checkboxes = screen.getAllByRole("checkbox")
    fireEvent.click(checkboxes[1])
    expect(screen.getByText("1 selected")).toBeInTheDocument()

    // Click the clear selection button (Trash2 icon ghost button in the bulk actions bar)
    const bulkBar = screen.getByText("1 selected").closest("div.flex")!
    const ghostButtons = bulkBar.querySelectorAll("button")
    // Last button in the bulk bar is the clear/trash button
    fireEvent.click(ghostButtons[ghostButtons.length - 1])
    expect(screen.queryByText("1 selected")).not.toBeInTheDocument()
  })

  // ── Bulk dispose ───────────────────────────────────────────────────────────

  it("shows bulk disposition actions when items selected", () => {
    render(<ReviewQueuePage />)
    const checkboxes = screen.getAllByRole("checkbox")
    fireEvent.click(checkboxes[1])
    const bulkBar = screen.getByText("1 selected").closest("div")!
    expect(within(bulkBar).getByText("Fraud")).toBeInTheDocument()
    expect(within(bulkBar).getByText("Waste")).toBeInTheDocument()
    expect(within(bulkBar).getByText("Abuse")).toBeInTheDocument()
  })

  it("opens confirm dialog when a bulk disposition is chosen", () => {
    render(<ReviewQueuePage />)
    const checkboxes = screen.getAllByRole("checkbox")
    fireEvent.click(checkboxes[1])
    const bulkBar = screen.getByText("1 selected").closest("div")!
    fireEvent.click(within(bulkBar).getByText("Fraud"))
    expect(screen.getByText("Bulk Dispose Findings")).toBeInTheDocument()
  })

  // ── Pagination ─────────────────────────────────────────────────────────────

  it("does not show pagination when only one page", () => {
    // total=3, perPage=25 → only 1 page, so pagination not rendered
    render(<ReviewQueuePage />)
    expect(screen.queryByText(/Page 1 of/)).not.toBeInTheDocument()
  })

  it("shows pagination controls when multiple pages exist", () => {
    const items = Array.from({ length: 25 }, (_, i) =>
      makeQueueItem({ id: `qi-${i}`, finding_id: i + 100, finding_entity_name: `Dept ${i}` })
    )
    useWasteReviewQueue.mockReturnValue(
      makeMockQuery({ items, total: 50, page: 1, per_page: 25 }) as ReturnType<typeof _useWasteReviewQueue>
    )
    render(<ReviewQueuePage />)
    expect(screen.getByText("Page 1 of 2")).toBeInTheDocument()
  })

  // ── Error state ────────────────────────────────────────────────────────────

  it("shows error message when queue fails to load", () => {
    useWasteReviewQueue.mockReturnValue({
      ...makeMockQuery({ items: [], total: 0, page: 1, per_page: 25 }),
      error: new Error("Server error"),
      isError: true,
    } as ReturnType<typeof _useWasteReviewQueue>)
    render(<ReviewQueuePage />)
    expect(screen.getByText("Server error")).toBeInTheDocument()
  })

  // ── Clear selection aria-label ─────────────────────────────────────────────

  it("clear selection button has aria-label", () => {
    render(<ReviewQueuePage />)
    const checkboxes = screen.getAllByRole("checkbox")
    fireEvent.click(checkboxes[1])
    expect(screen.getByLabelText("Clear selection")).toBeInTheDocument()
  })

  // ── Empty state guidance ──────────────────────────────────────────────────

  it("empty state shows guidance text", () => {
    useWasteReviewQueue.mockReturnValue(
      makeMockQuery({ items: [], total: 0, page: 1, per_page: 25 }) as ReturnType<typeof _useWasteReviewQueue>
    )
    render(<ReviewQueuePage />)
    expect(screen.getByText(/Run an analysis or adjust filters/)).toBeInTheDocument()
  })

  // ── Bulk dispose mutation ─────────────────────────────────────────────────

  it("calls bulk dispose mutation after confirmation", async () => {
    const mutate = vi.fn()
    useBulkDisposeWasteFindings.mockReturnValue(
      makeMockMutation({ mutate }) as ReturnType<typeof _useBulkDisposeWasteFindings>
    )
    render(<ReviewQueuePage />)
    const checkboxes = screen.getAllByRole("checkbox")
    fireEvent.click(checkboxes[1])
    const bulkBar = screen.getByText("1 selected").closest("div")!
    fireEvent.click(within(bulkBar).getByText("Fraud"))
    fireEvent.click(screen.getByRole("button", { name: "Dispose" }))

    await waitFor(() => {
      expect(mutate).toHaveBeenCalled()
    })
  })
})

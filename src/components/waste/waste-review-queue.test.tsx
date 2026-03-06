import { render, screen, fireEvent, within } from "@testing-library/react"
import { vi, describe, it, expect, beforeEach } from "vitest"
import { WasteReviewQueue } from "./waste-review-queue"
import { makeMockQuery, makeMockQueryLoading, makeMockMutation, makeMockMutationPending, makeQueueItem } from "./test-utils"

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock("@/lib/hooks/useWaste", () => ({
  useWasteReviewQueue: vi.fn(),
  useAssignWasteQueueItem: vi.fn(),
  useCreateWasteDisposition: vi.fn(),
  useWasteDispositions: vi.fn(),
  useBulkDisposeWasteFindings: vi.fn(),
  useSyncWasteReviewQueue: vi.fn(),
  useRunWasteAnalysis: vi.fn(),
  useLatestWasteRun: vi.fn(),
}))

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

import {
  useWasteReviewQueue as _useWasteReviewQueue,
  useAssignWasteQueueItem as _useAssignWasteQueueItem,
  useCreateWasteDisposition as _useCreateWasteDisposition,
  useWasteDispositions as _useWasteDispositions,
  useBulkDisposeWasteFindings as _useBulkDisposeWasteFindings,
  useSyncWasteReviewQueue as _useSyncWasteReviewQueue,
  useRunWasteAnalysis as _useRunWasteAnalysis,
  useLatestWasteRun as _useLatestWasteRun,
} from "@/lib/hooks/useWaste"

const useWasteReviewQueue = vi.mocked(_useWasteReviewQueue)
const useAssignWasteQueueItem = vi.mocked(_useAssignWasteQueueItem)
const useCreateWasteDisposition = vi.mocked(_useCreateWasteDisposition)
const useWasteDispositions = vi.mocked(_useWasteDispositions)
const useBulkDisposeWasteFindings = vi.mocked(_useBulkDisposeWasteFindings)
const useSyncWasteReviewQueue = vi.mocked(_useSyncWasteReviewQueue)
const useRunWasteAnalysis = vi.mocked(_useRunWasteAnalysis)
const useLatestWasteRun = vi.mocked(_useLatestWasteRun)

function setupDefaultMocks(queueOverrides = {}, mutationOverrides: Record<string, unknown> = {}) {
  const queueItems = [
    makeQueueItem({ id: "qi-1", finding_id: 100, finding_entity_name: "Fire Department" }),
    makeQueueItem({ id: "qi-2", finding_id: 101, finding_entity_name: "Police Department" }),
  ]
  useWasteReviewQueue.mockReturnValue(
    makeMockQuery({ items: queueItems, total: 2, page: 1, per_page: 25 }, queueOverrides) as ReturnType<typeof _useWasteReviewQueue>
  )
  useAssignWasteQueueItem.mockReturnValue(makeMockMutation() as ReturnType<typeof _useAssignWasteQueueItem>)
  useCreateWasteDisposition.mockReturnValue(makeMockMutation() as ReturnType<typeof _useCreateWasteDisposition>)
  useWasteDispositions.mockReturnValue(makeMockQuery([], {}) as ReturnType<typeof _useWasteDispositions>)
  useBulkDisposeWasteFindings.mockReturnValue(makeMockMutation(mutationOverrides) as ReturnType<typeof _useBulkDisposeWasteFindings>)
  useSyncWasteReviewQueue.mockReturnValue(makeMockMutation() as ReturnType<typeof _useSyncWasteReviewQueue>)
  useRunWasteAnalysis.mockReturnValue(makeMockMutation() as ReturnType<typeof _useRunWasteAnalysis>)
  useLatestWasteRun.mockReturnValue(makeMockQuery(null) as ReturnType<typeof _useLatestWasteRun>)
}

describe("WasteReviewQueue", () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    setupDefaultMocks()
  })

  // ── No city selected ───────────────────────────────────────────────────────

  it("shows city selection prompt when cityId is null", () => {
    render(<WasteReviewQueue cityId={null} />)
    expect(screen.getByText(/Select a city/)).toBeInTheDocument()
  })

  // ── Loading state ──────────────────────────────────────────────────────────

  it("shows skeleton placeholders while loading", () => {
    useWasteReviewQueue.mockReturnValue(
      makeMockQueryLoading() as ReturnType<typeof _useWasteReviewQueue>
    )
    const { container } = render(<WasteReviewQueue cityId={1} />)
    expect(container.querySelectorAll(".animate-pulse").length).toBeGreaterThan(0)
  })

  // ── Rendering items ────────────────────────────────────────────────────────

  it("renders queue items with entity names", () => {
    render(<WasteReviewQueue cityId={1} />)
    expect(screen.getByText("Fire Department")).toBeInTheDocument()
    expect(screen.getByText("Police Department")).toBeInTheDocument()
  })

  it("shows 'No queue items' when items array is empty", () => {
    useWasteReviewQueue.mockReturnValue(
      makeMockQuery({ items: [], total: 0, page: 1, per_page: 25 }) as ReturnType<typeof _useWasteReviewQueue>
    )
    render(<WasteReviewQueue cityId={1} />)
    expect(screen.getByText(/No queue items/)).toBeInTheDocument()
  })

  // ── Refresh button ─────────────────────────────────────────────────────────

  it("calls refetch when Refresh Queue is clicked", () => {
    const refetch = vi.fn()
    useWasteReviewQueue.mockReturnValue(
      makeMockQuery({ items: [], total: 0, page: 1, per_page: 25 }, { refetch }) as ReturnType<typeof _useWasteReviewQueue>
    )
    render(<WasteReviewQueue cityId={1} />)
    fireEvent.click(screen.getByText("Refresh Queue"))
    expect(refetch).toHaveBeenCalled()
  })

  it("disables Refresh Queue while fetching", () => {
    useWasteReviewQueue.mockReturnValue(
      makeMockQuery({ items: [], total: 0, page: 1, per_page: 25 }, { isFetching: true }) as ReturnType<typeof _useWasteReviewQueue>
    )
    render(<WasteReviewQueue cityId={1} />)
    expect(screen.getByText("Refresh Queue").closest("button")).toBeDisabled()
  })

  // ── Sync Queue button ──────────────────────────────────────────────────────

  it("calls sync mutation when Sync Queue is clicked", () => {
    const mutate = vi.fn()
    useSyncWasteReviewQueue.mockReturnValue(makeMockMutation({ mutate }) as ReturnType<typeof _useSyncWasteReviewQueue>)
    render(<WasteReviewQueue cityId={1} />)
    fireEvent.click(screen.getByText("Sync Queue"))
    expect(mutate).toHaveBeenCalledWith({ city_id: 1 }, expect.any(Object))
  })

  it("shows 'Syncing…' text when sync is pending", () => {
    useSyncWasteReviewQueue.mockReturnValue(
      makeMockMutationPending() as ReturnType<typeof _useSyncWasteReviewQueue>
    )
    render(<WasteReviewQueue cityId={1} />)
    expect(screen.getByText("Syncing…")).toBeInTheDocument()
  })

  // ── Run Fresh Analysis button ──────────────────────────────────────────────

  it("shows 'Running Analysis…' when analysis is pending", () => {
    useRunWasteAnalysis.mockReturnValue(
      makeMockMutationPending() as ReturnType<typeof _useRunWasteAnalysis>
    )
    render(<WasteReviewQueue cityId={1} />)
    expect(screen.getByText("Running Analysis…")).toBeInTheDocument()
  })

  it("disables Run Fresh Analysis when sync is pending", () => {
    useSyncWasteReviewQueue.mockReturnValue(
      makeMockMutationPending() as ReturnType<typeof _useSyncWasteReviewQueue>
    )
    render(<WasteReviewQueue cityId={1} />)
    expect(screen.getByText("Run Fresh Analysis").closest("button")).toBeDisabled()
  })

  // ── Assign button ──────────────────────────────────────────────────────────

  it("calls assign mutation when Assign is clicked with a value", () => {
    const mutate = vi.fn()
    useAssignWasteQueueItem.mockReturnValue(makeMockMutation({ mutate }) as ReturnType<typeof _useAssignWasteQueueItem>)
    render(<WasteReviewQueue cityId={1} />)

    // Find the first assign input and button pair
    const assignInputs = screen.getAllByPlaceholderText("auth0|user_sub")
    fireEvent.change(assignInputs[0], { target: { value: "user123" } })
    const assignButtons = screen.getAllByText("Assign")
    fireEvent.click(assignButtons[0])

    expect(mutate).toHaveBeenCalledWith(
      expect.objectContaining({ assignedTo: "user123", cityId: 1 }),
      expect.any(Object)
    )
  })

  it("disables Assign button when input is empty", () => {
    render(<WasteReviewQueue cityId={1} />)
    const assignButtons = screen.getAllByText("Assign")
    expect(assignButtons[0].closest("button")).toBeDisabled()
  })

  // ── Apply (dispose) button ─────────────────────────────────────────────────

  it("calls disposition mutation when Apply is clicked", () => {
    const mutate = vi.fn()
    useCreateWasteDisposition.mockReturnValue(makeMockMutation({ mutate }) as ReturnType<typeof _useCreateWasteDisposition>)
    render(<WasteReviewQueue cityId={1} />)
    const applyButtons = screen.getAllByText("Apply")
    fireEvent.click(applyButtons[0])
    expect(mutate).toHaveBeenCalledWith(
      expect.objectContaining({ findingId: 100 }),
      expect.any(Object)
    )
  })

  // ── History toggle ─────────────────────────────────────────────────────────

  it("toggles history visibility on Show History click", () => {
    render(<WasteReviewQueue cityId={1} />)
    const showButtons = screen.getAllByText("Show History")
    fireEvent.click(showButtons[0])
    expect(screen.getAllByText("Hide History").length).toBeGreaterThan(0)
  })

  // ── Bulk disposition ───────────────────────────────────────────────────────

  it("disables bulk dispose when no items are selected", () => {
    render(<WasteReviewQueue cityId={1} />)
    expect(screen.getByText("Apply Bulk Disposition").closest("button")).toBeDisabled()
  })

  it("enables bulk dispose when items are selected", () => {
    render(<WasteReviewQueue cityId={1} />)
    // Select first item via checkbox
    const checkboxes = screen.getAllByRole("checkbox")
    fireEvent.click(checkboxes[0])
    expect(screen.getByText("Apply Bulk Disposition").closest("button")).not.toBeDisabled()
  })

  // ── Pagination ─────────────────────────────────────────────────────────────

  it("disables Previous on first page", () => {
    render(<WasteReviewQueue cityId={1} />)
    expect(screen.getByText("Previous").closest("button")).toBeDisabled()
  })

  it("disables Next on last page", () => {
    // total=2, perPage=25 → only 1 page
    render(<WasteReviewQueue cityId={1} />)
    expect(screen.getByText("Next").closest("button")).toBeDisabled()
  })

  it("shows page info text", () => {
    render(<WasteReviewQueue cityId={1} />)
    expect(screen.getByText(/Page 1 of 1/)).toBeInTheDocument()
  })

  // ── Error message wording ─────────────────────────────────────────────────

  it("error message no longer says 'console'", async () => {
    // Simulate a failed run+sync by making the analysis mutation reject
    const mutateAsync = vi.fn().mockRejectedValue(new Error("API timeout"))
    useRunWasteAnalysis.mockReturnValue(
      makeMockMutation({ mutateAsync }) as ReturnType<typeof _useRunWasteAnalysis>
    )
    render(<WasteReviewQueue cityId={1} />)
    fireEvent.click(screen.getByText("Run Fresh Analysis"))

    // Wait for the error message to appear
    const errorMsg = await screen.findByText(/Run \+ Sync failed/)
    expect(errorMsg.textContent).not.toMatch(/console/)
  })

  // ── Assign shows spinner ──────────────────────────────────────────────────

  it("assign shows spinner when pending", () => {
    useAssignWasteQueueItem.mockReturnValue(
      makeMockMutationPending() as ReturnType<typeof _useAssignWasteQueueItem>
    )
    render(<WasteReviewQueue cityId={1} />)
    expect(screen.getAllByText("Assigning…").length).toBeGreaterThan(0)
  })

  // ── Dispose shows spinner ─────────────────────────────────────────────────

  it("dispose shows spinner when pending", () => {
    useCreateWasteDisposition.mockReturnValue(
      makeMockMutationPending() as ReturnType<typeof _useCreateWasteDisposition>
    )
    render(<WasteReviewQueue cityId={1} />)
    expect(screen.getAllByText("Applying…").length).toBeGreaterThan(0)
  })

  // ── Checkbox accessibility ────────────────────────────────────────────────

  it("checkbox has aria-label with entity name", () => {
    render(<WasteReviewQueue cityId={1} />)
    expect(screen.getByLabelText(/Select Fire Department/)).toBeInTheDocument()
  })
})

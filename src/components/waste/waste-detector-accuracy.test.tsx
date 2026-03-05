import { render, screen, fireEvent } from "@testing-library/react"
import { vi, describe, it, expect, beforeEach } from "vitest"
import { WasteDetectorAccuracy } from "./waste-detector-accuracy"
import { makeMockQuery, makeMockQueryLoading } from "./test-utils"
import type { WasteDetectorAccuracy as DetectorAccuracyType } from "@/lib/apiClient"

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock("@auth0/auth0-react", () => ({
  useAuth0: () => ({
    getAccessTokenSilently: vi.fn().mockResolvedValue("mock-token"),
  }),
}))

vi.mock("@/lib/hooks/useWaste", () => ({
  useWasteDetectorAccuracy: vi.fn(),
}))

import { useWasteDetectorAccuracy as _useWasteDetectorAccuracy } from "@/lib/hooks/useWaste"
const useWasteDetectorAccuracy = vi.mocked(_useWasteDetectorAccuracy)

function makeAccuracyRow(overrides: Partial<DetectorAccuracyType> = {}): DetectorAccuracyType {
  return {
    id: "da-1",
    detector_key: "overtime_abuse",
    city_id: 1,
    total_findings: 20,
    confirmed_count: 15,
    false_positive_count: 5,
    precision_rate: 0.75,
    updated_at: "2026-02-01T12:00:00Z",
    ...overrides,
  }
}

describe("WasteDetectorAccuracy", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // ── No city selected ──────────────────────────────────────────────────

  it("shows 'Select a city' prompt when cityId is null", () => {
    useWasteDetectorAccuracy.mockReturnValue(
      makeMockQuery([]) as ReturnType<typeof _useWasteDetectorAccuracy>
    )
    render(<WasteDetectorAccuracy cityId={null} />)
    expect(screen.getByText(/Select a city/)).toBeInTheDocument()
  })

  // ── Loading ───────────────────────────────────────────────────────────

  it("shows loading skeletons while data loads", () => {
    useWasteDetectorAccuracy.mockReturnValue(
      makeMockQueryLoading() as ReturnType<typeof _useWasteDetectorAccuracy>
    )
    const { container } = render(<WasteDetectorAccuracy cityId={1} />)
    expect(container.querySelectorAll(".animate-pulse").length).toBeGreaterThan(0)
  })

  // ── Empty state ───────────────────────────────────────────────────────

  it("shows empty message when no accuracy data", () => {
    useWasteDetectorAccuracy.mockReturnValue(
      makeMockQuery([]) as ReturnType<typeof _useWasteDetectorAccuracy>
    )
    render(<WasteDetectorAccuracy cityId={1} />)
    expect(screen.getByText(/No detector accuracy data/)).toBeInTheDocument()
  })

  // ── Rendering rows ────────────────────────────────────────────────────

  it("renders detector key in table", () => {
    useWasteDetectorAccuracy.mockReturnValue(
      makeMockQuery([makeAccuracyRow({ detector_key: "overtime_abuse" })]) as ReturnType<typeof _useWasteDetectorAccuracy>
    )
    render(<WasteDetectorAccuracy cityId={1} />)
    expect(screen.getByText("overtime_abuse")).toBeInTheDocument()
  })

  it("shows resolved count (confirmed + false_positive)", () => {
    useWasteDetectorAccuracy.mockReturnValue(
      makeMockQuery([
        makeAccuracyRow({ confirmed_count: 15, false_positive_count: 5 }),
      ]) as ReturnType<typeof _useWasteDetectorAccuracy>
    )
    render(<WasteDetectorAccuracy cityId={1} />)
    // resolved = 15 + 5 = 20
    expect(screen.getByText("20")).toBeInTheDocument()
  })

  it("shows confirmed count", () => {
    useWasteDetectorAccuracy.mockReturnValue(
      makeMockQuery([
        makeAccuracyRow({ confirmed_count: 15 }),
      ]) as ReturnType<typeof _useWasteDetectorAccuracy>
    )
    render(<WasteDetectorAccuracy cityId={1} />)
    expect(screen.getByText("15")).toBeInTheDocument()
  })

  it("shows false positive count", () => {
    useWasteDetectorAccuracy.mockReturnValue(
      makeMockQuery([
        makeAccuracyRow({ false_positive_count: 5 }),
      ]) as ReturnType<typeof _useWasteDetectorAccuracy>
    )
    render(<WasteDetectorAccuracy cityId={1} />)
    expect(screen.getByText("5")).toBeInTheDocument()
  })

  it("shows precision rate as percentage", () => {
    useWasteDetectorAccuracy.mockReturnValue(
      makeMockQuery([
        makeAccuracyRow({ precision_rate: 0.75 }),
      ]) as ReturnType<typeof _useWasteDetectorAccuracy>
    )
    render(<WasteDetectorAccuracy cityId={1} />)
    expect(screen.getByText("75.0%")).toBeInTheDocument()
  })

  it("shows 100% precision for perfect detector", () => {
    useWasteDetectorAccuracy.mockReturnValue(
      makeMockQuery([
        makeAccuracyRow({ precision_rate: 1.0 }),
      ]) as ReturnType<typeof _useWasteDetectorAccuracy>
    )
    render(<WasteDetectorAccuracy cityId={1} />)
    expect(screen.getByText("100.0%")).toBeInTheDocument()
  })

  it("renders multiple detectors", () => {
    useWasteDetectorAccuracy.mockReturnValue(
      makeMockQuery([
        makeAccuracyRow({ id: "da-1", detector_key: "overtime_abuse", precision_rate: 0.75 }),
        makeAccuracyRow({ id: "da-2", detector_key: "duplicate_payments", precision_rate: 0.90 }),
        makeAccuracyRow({ id: "da-3", detector_key: "ghost_vendor", precision_rate: 0.60 }),
      ]) as ReturnType<typeof _useWasteDetectorAccuracy>
    )
    render(<WasteDetectorAccuracy cityId={1} />)
    expect(screen.getByText("overtime_abuse")).toBeInTheDocument()
    expect(screen.getByText("duplicate_payments")).toBeInTheDocument()
    expect(screen.getByText("ghost_vendor")).toBeInTheDocument()
  })

  // ── Filter ────────────────────────────────────────────────────────────

  it("filters rows by detector key", () => {
    useWasteDetectorAccuracy.mockReturnValue(
      makeMockQuery([
        makeAccuracyRow({ id: "da-1", detector_key: "overtime_abuse" }),
        makeAccuracyRow({ id: "da-2", detector_key: "duplicate_payments" }),
      ]) as ReturnType<typeof _useWasteDetectorAccuracy>
    )
    render(<WasteDetectorAccuracy cityId={1} />)

    const filterInput = screen.getByPlaceholderText("Filter by detector key")
    fireEvent.change(filterInput, { target: { value: "overtime" } })

    expect(screen.getByText("overtime_abuse")).toBeInTheDocument()
    expect(screen.queryByText("duplicate_payments")).not.toBeInTheDocument()
  })

  it("shows empty state when filter matches nothing", () => {
    useWasteDetectorAccuracy.mockReturnValue(
      makeMockQuery([
        makeAccuracyRow({ detector_key: "overtime_abuse" }),
      ]) as ReturnType<typeof _useWasteDetectorAccuracy>
    )
    render(<WasteDetectorAccuracy cityId={1} />)

    const filterInput = screen.getByPlaceholderText("Filter by detector key")
    fireEvent.change(filterInput, { target: { value: "nonexistent" } })

    expect(screen.getByText(/No detector accuracy data/)).toBeInTheDocument()
  })

  // ── Refresh button ────────────────────────────────────────────────────

  it("calls refetch when Refresh Accuracy button is clicked", () => {
    const mockRefetch = vi.fn()
    useWasteDetectorAccuracy.mockReturnValue(
      makeMockQuery([makeAccuracyRow()], { refetch: mockRefetch }) as ReturnType<typeof _useWasteDetectorAccuracy>
    )
    render(<WasteDetectorAccuracy cityId={1} />)

    fireEvent.click(screen.getByText("Refresh Accuracy"))
    expect(mockRefetch).toHaveBeenCalledTimes(1)
  })

  it("disables Refresh Accuracy button while fetching", () => {
    useWasteDetectorAccuracy.mockReturnValue(
      makeMockQuery([makeAccuracyRow()], { isFetching: true }) as ReturnType<typeof _useWasteDetectorAccuracy>
    )
    render(<WasteDetectorAccuracy cityId={1} />)

    expect(screen.getByText("Refresh Accuracy").closest("button")).toBeDisabled()
  })

  // ── Updated at display ────────────────────────────────────────────────

  it("shows 'n/a' when updated_at is null", () => {
    useWasteDetectorAccuracy.mockReturnValue(
      makeMockQuery([
        makeAccuracyRow({ updated_at: null }),
      ]) as ReturnType<typeof _useWasteDetectorAccuracy>
    )
    render(<WasteDetectorAccuracy cityId={1} />)
    expect(screen.getByText("n/a")).toBeInTheDocument()
  })
})

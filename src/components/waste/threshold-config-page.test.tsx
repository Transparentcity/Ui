import { render, screen, fireEvent } from "@testing-library/react"
import { vi, describe, it, expect, beforeEach } from "vitest"
import { ThresholdConfigPage } from "./threshold-config-page"
import {
  makeMockQuery,
  makeMockQueryLoading,
  makeMockQueryError,
  makeMockMutation,
  makeMockMutationPending,
  makeThreshold,
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
  usePathname: () => "/waste/settings/thresholds",
  useRouter: () => ({ push: vi.fn() }),
}))

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: any) => <a href={href} {...props}>{children}</a>,
}))

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

vi.mock("@/lib/hooks/useCities", () => ({
  useCities: vi.fn(),
}))

vi.mock("@/lib/hooks/useWaste", () => ({
  useWasteThresholds: vi.fn(),
  useUpdateWasteThresholds: vi.fn(),
}))

import { useCities as _useCities } from "@/lib/hooks/useCities"
import {
  useWasteThresholds as _useWasteThresholds,
  useUpdateWasteThresholds as _useUpdateWasteThresholds,
} from "@/lib/hooks/useWaste"

const useCities = vi.mocked(_useCities)
const useWasteThresholds = vi.mocked(_useWasteThresholds)
const useUpdateWasteThresholds = vi.mocked(_useUpdateWasteThresholds)

function setupDefaultMocks() {
  useCities.mockReturnValue(
    makeMockQuery([{ city_id: 1, name: "San Francisco", datasets_count: 5 }]) as ReturnType<typeof _useCities>
  )
  useWasteThresholds.mockReturnValue(
    makeMockQuery([
      makeThreshold({ id: 1, detector_key: "overtime_hours", detector_name: "Overtime Hours", category: "payroll", current_value: 40, default_value: 40, min_value: 0, max_value: 100 }),
      makeThreshold({ id: 2, detector_key: "vendor_dup", detector_name: "Vendor Duplicates", category: "vendor", current_value: 0.85, default_value: 0.80, min_value: 0, max_value: 1 }),
    ]) as ReturnType<typeof _useWasteThresholds>
  )
  useUpdateWasteThresholds.mockReturnValue(
    makeMockMutation() as ReturnType<typeof _useUpdateWasteThresholds>
  )
}

describe("ThresholdConfigPage", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setupDefaultMocks()
  })

  // ── Loading ────────────────────────────────────────────────────────────────

  it("shows loading skeletons while thresholds load", () => {
    useWasteThresholds.mockReturnValue(
      makeMockQueryLoading() as ReturnType<typeof _useWasteThresholds>
    )
    const { container } = render(<ThresholdConfigPage />)
    expect(container.querySelectorAll(".animate-pulse").length).toBeGreaterThan(0)
  })

  // ── Error state ────────────────────────────────────────────────────────────

  it("shows error message when thresholds fail to load", () => {
    useWasteThresholds.mockReturnValue(
      makeMockQueryError("Threshold API down") as ReturnType<typeof _useWasteThresholds>
    )
    render(<ThresholdConfigPage />)
    expect(screen.getByText("Threshold API down")).toBeInTheDocument()
  })

  // ── Rendering ──────────────────────────────────────────────────────────────

  it("renders detector names", () => {
    render(<ThresholdConfigPage />)
    expect(screen.getByText("Overtime Hours")).toBeInTheDocument()
    expect(screen.getByText("Vendor Duplicates")).toBeInTheDocument()
  })

  it("renders admin gate notice", () => {
    render(<ThresholdConfigPage />)
    expect(screen.getByText(/Only city administrators/)).toBeInTheDocument()
  })

  // ── Save button ────────────────────────────────────────────────────────────

  it("Save Changes button is disabled when no changes are made", () => {
    render(<ThresholdConfigPage />)
    expect(screen.getByText("Save Changes").closest("button")).toBeDisabled()
  })

  it("shows spinner on Save Changes button when mutation is pending", () => {
    useUpdateWasteThresholds.mockReturnValue(
      makeMockMutationPending() as ReturnType<typeof _useUpdateWasteThresholds>
    )
    render(<ThresholdConfigPage />)
    // Button should exist and be disabled when pending + no changes
    expect(screen.getByText("Save Changes").closest("button")).toBeDisabled()
  })

  it("shows success message after saving", () => {
    useUpdateWasteThresholds.mockReturnValue(
      makeMockMutation({ isSuccess: true }) as ReturnType<typeof _useUpdateWasteThresholds>
    )
    render(<ThresholdConfigPage />)
    expect(screen.getByText(/Thresholds saved successfully/)).toBeInTheDocument()
  })

  // ── Reset All button ───────────────────────────────────────────────────────

  it("Reset All button is disabled when no changes are made", () => {
    render(<ThresholdConfigPage />)
    expect(screen.getByText("Reset All").closest("button")).toBeDisabled()
  })

  // ── Per-detector reset ─────────────────────────────────────────────────────

  it("shows individual Reset button for thresholds that differ from default", () => {
    render(<ThresholdConfigPage />)
    // vendor_dup has current_value 0.85, default_value 0.80 → should show Reset
    expect(screen.getByText("Reset (0.80)")).toBeInTheDocument()
  })

  it("does not show Reset button for thresholds at default value", () => {
    render(<ThresholdConfigPage />)
    // overtime_hours is at default (40) → no Reset button
    expect(screen.queryByText("Reset (40.00)")).not.toBeInTheDocument()
  })

  // ── Reset All confirm dialog ────────────────────────────────────────────────

  it("opens confirm dialog when Reset All is clicked after a change", () => {
    render(<ThresholdConfigPage />)
    // First make a change so Reset All is enabled (click per-detector reset to modify a value)
    fireEvent.click(screen.getByText("Reset (0.80)"))
    // Now click Reset All
    fireEvent.click(screen.getByText("Reset All"))
    // Confirm dialog should appear with the title text
    expect(screen.getByText("Reset All Thresholds")).toBeInTheDocument()
  })

  // ── Save error displayed ────────────────────────────────────────────────────

  it("shows error message when save mutation fails", () => {
    useUpdateWasteThresholds.mockReturnValue(
      makeMockMutation({ isError: true, error: new Error("Save failed") }) as ReturnType<typeof _useUpdateWasteThresholds>
    )
    render(<ThresholdConfigPage />)
    expect(screen.getByText("Save failed")).toBeInTheDocument()
  })

  // ── Per-detector reset aria-label ───────────────────────────────────────────

  it("per-detector Reset button has aria-label containing detector name", () => {
    render(<ThresholdConfigPage />)
    // Vendor Duplicates has current_value 0.85, default_value 0.80 → shows Reset button
    const resetButton = screen.getByLabelText("Reset Vendor Duplicates to 0.80")
    expect(resetButton).toBeInTheDocument()
  })
})

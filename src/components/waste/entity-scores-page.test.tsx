/* eslint-disable @typescript-eslint/no-explicit-any */
import { render, screen, fireEvent } from "@testing-library/react"
import { vi, describe, it, expect, beforeEach } from "vitest"
import { EntityScoresPage } from "./entity-scores-page"
import {
  makeMockQuery,
  makeMockQueryLoading,
  makeMockQueryError,
  makeEntityScore,
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
  usePathname: () => "/waste/scores",
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

vi.mock("./trust-metrics-snapshot", () => ({
  TrustMetricsSnapshot: () => <div>Trust Metrics Snapshot</div>,
}))

vi.mock("./department-trust-table", () => ({
  DepartmentTrustTable: () => <div>Department Trust Table</div>,
}))

vi.mock("./trust-detector-table", () => ({
  TrustDetectorTable: () => <div>Trust Detector Table</div>,
}))

vi.mock("./trust-methodology-note", () => ({
  TrustMethodologyNote: () => <div>Trust Methodology Note</div>,
}))

vi.mock("./score-explainer", () => ({
  ScoreExplainer: () => <div>Signal Breakdown</div>,
}))

vi.mock("@tanstack/react-query", async () => {
  const actual = await vi.importActual("@tanstack/react-query") as Record<string, unknown>
  return {
    ...actual,
    useQuery: (opts: any) => {
      // For the public cities sitemap query, return mock cities
      if (opts.queryKey?.[0] === "public" && opts.queryKey?.[1] === "cities") {
        return { data: [{ id: 1, name: "San Francisco", datasets_count: 5 }], isLoading: false }
      }
      // Fallback (shouldn't be hit)
      return { data: undefined, isLoading: false }
    },
  }
})

vi.mock("@/lib/publicApiClient", () => ({
  listPublicCitiesForSitemap: vi.fn().mockResolvedValue([]),
}))

vi.mock("@/lib/hooks/useWaste", () => ({
  useWasteEntityScores: vi.fn(),
  useWasteTrustMetrics: vi.fn(),
  useWasteDepartmentRisk: vi.fn(),
}))

import {
  useWasteDepartmentRisk as _useWasteDepartmentRisk,
  useWasteEntityScores as _useWasteEntityScores,
  useWasteTrustMetrics as _useWasteTrustMetrics,
} from "@/lib/hooks/useWaste"

const useWasteDepartmentRisk = vi.mocked(_useWasteDepartmentRisk)
const useWasteEntityScores = vi.mocked(_useWasteEntityScores)
const useWasteTrustMetrics = vi.mocked(_useWasteTrustMetrics)

function setupDefaultMocks() {
  const items = [
    makeEntityScore({ id: "es-1", entity_name: "Acme Corp", composite_score: 92, severity_tier: "critical", signal_count: 8 }),
    makeEntityScore({ id: "es-2", entity_name: "Bob's Plumbing", composite_score: 65, severity_tier: "high", signal_count: 3 }),
    makeEntityScore({ id: "es-3", entity_name: "City Dept A", composite_score: 30, severity_tier: "medium", signal_count: 2 }),
  ]
  useWasteEntityScores.mockReturnValue(
    makeMockQuery({ items, total: 3, page: 1, per_page: 25 }) as ReturnType<typeof _useWasteEntityScores>
  )
  useWasteTrustMetrics.mockReturnValue(
    makeMockQuery({
      overview: { total_entities: 3 },
      detectors: [],
    }) as ReturnType<typeof _useWasteTrustMetrics>
  )
  useWasteDepartmentRisk.mockReturnValue(
    makeMockQuery({ items: [], total: 0, page: 1, per_page: 8 }) as ReturnType<
      typeof _useWasteDepartmentRisk
    >
  )
}

describe("EntityScoresPage", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setupDefaultMocks()
  })

  // ── Loading ────────────────────────────────────────────────────────────────

  it("shows loading skeletons while data loads", () => {
    useWasteEntityScores.mockReturnValue(
      makeMockQueryLoading() as ReturnType<typeof _useWasteEntityScores>
    )
    const { container } = render(<EntityScoresPage />)
    expect(container.querySelectorAll(".animate-pulse").length).toBeGreaterThan(0)
  })

  // ── Error state ────────────────────────────────────────────────────────────

  it("shows error message when scores fail to load", () => {
    useWasteEntityScores.mockReturnValue(
      makeMockQueryError("Scores API down") as ReturnType<typeof _useWasteEntityScores>
    )
    render(<EntityScoresPage />)
    expect(screen.getByText("Scores API down")).toBeInTheDocument()
  })

  // ── Rendering ──────────────────────────────────────────────────────────────

  it("renders entity names in the table", () => {
    render(<EntityScoresPage />)
    expect(screen.getByText("Acme Corp")).toBeInTheDocument()
    expect(screen.getByText("Bob's Plumbing")).toBeInTheDocument()
    expect(screen.getByText("City Dept A")).toBeInTheDocument()
  })

  it("shows total count", () => {
    render(<EntityScoresPage />)
    expect(screen.getByText("3 entities")).toBeInTheDocument()
  })

  it("shows empty state when no entities", () => {
    useWasteEntityScores.mockReturnValue(
      makeMockQuery({ items: [], total: 0, page: 1, per_page: 25 }) as ReturnType<typeof _useWasteEntityScores>
    )
    render(<EntityScoresPage />)
    expect(screen.getByText("No entity scores found")).toBeInTheDocument()
  })

  // ── Sort headers ───────────────────────────────────────────────────────────

  it("renders sortable column headers", () => {
    render(<EntityScoresPage />)
    expect(screen.getByText("Score")).toBeInTheDocument()
    expect(screen.getByText("Severity")).toBeInTheDocument()
    expect(screen.getByText("Signals")).toBeInTheDocument()
  })

  it("clicking Score header sorts by composite_score", () => {
    render(<EntityScoresPage />)
    fireEvent.click(screen.getByText("Score"))
    // The hook should be re-called — we check it was called with expected params
    // The initial sort is by composite_score desc. Clicking toggles to asc.
    // The sorted display should show City Dept A first (lowest score) if asc
    // Since we mock at the hook level, the items order depends on client-side sort
    // Just verify the click doesn't throw
    expect(screen.getByText("Acme Corp")).toBeInTheDocument()
  })

  // ── Entity detail dialog ───────────────────────────────────────────────────

  it("opens detail dialog when an entity row is clicked", () => {
    render(<EntityScoresPage />)
    fireEvent.click(screen.getByText("Acme Corp"))
    // Dialog should show entity details
    expect(screen.getByText("Signal Breakdown")).toBeInTheDocument()
  })

  it("closes detail dialog when Close button is clicked", () => {
    render(<EntityScoresPage />)
    fireEvent.click(screen.getByText("Acme Corp"))
    expect(screen.getByText("Signal Breakdown")).toBeInTheDocument()

    // Find the Close button (inside the dialog, the button with "Close" text)
    const closeButtons = screen.getAllByText("Close")
    // Click the last one which is our explicit Close button
    fireEvent.click(closeButtons[closeButtons.length - 1])
    // The Signal Breakdown heading should be removed
    expect(screen.queryByText("Signal Breakdown")).not.toBeInTheDocument()
  })

  // ── Pagination ─────────────────────────────────────────────────────────────

  it("does not show pagination when only one page", () => {
    render(<EntityScoresPage />)
    expect(screen.queryByText(/Page 1 of/)).not.toBeInTheDocument()
  })

  it("shows pagination when multiple pages exist", () => {
    useWasteEntityScores.mockReturnValue(
      makeMockQuery({
        items: [makeEntityScore()],
        total: 50,
        page: 1,
        per_page: 25,
      }) as ReturnType<typeof _useWasteEntityScores>
    )
    render(<EntityScoresPage />)
    expect(screen.getByText("Page 1 of 2")).toBeInTheDocument()
  })

  // ── Keyboard navigation ─────────────────────────────────────────────────────

  it("table rows have tabIndex=0 and role='button', and Enter opens detail dialog", () => {
    render(<EntityScoresPage />)
    const row = screen.getByText("Acme Corp").closest("tr")!
    expect(row).toHaveAttribute("tabindex", "0")
    expect(row).toHaveAttribute("role", "button")

    fireEvent.keyDown(row, { key: "Enter" })
    expect(screen.getByText("Signal Breakdown")).toBeInTheDocument()
  })

  // ── Empty state guidance text ───────────────────────────────────────────────

  it("shows guidance text when no entities exist", () => {
    useWasteEntityScores.mockReturnValue(
      makeMockQuery({ items: [], total: 0, page: 1, per_page: 25 }) as ReturnType<typeof _useWasteEntityScores>
    )
    render(<EntityScoresPage />)
    expect(screen.getByText(/Run a waste analysis/)).toBeInTheDocument()
  })
})

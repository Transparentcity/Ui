import { render, screen } from "@testing-library/react"
import { vi, describe, it, expect, beforeEach } from "vitest"
import { WastePageContent } from "./waste-page-content"
import { installResizeObserver } from "./test-utils"

installResizeObserver()

// Install localStorage polyfill (jsdom doesn't always expose it for hoisted mocks)
const localStorageStore: Record<string, string> = {}
const localStorageMock = {
  getItem: (key: string) => localStorageStore[key] ?? null,
  setItem: (key: string, value: string) => { localStorageStore[key] = value },
  removeItem: (key: string) => { delete localStorageStore[key] },
  clear: () => { Object.keys(localStorageStore).forEach((k) => delete localStorageStore[k]) },
  get length() { return Object.keys(localStorageStore).length },
  key: (i: number) => Object.keys(localStorageStore)[i] ?? null,
}
Object.defineProperty(globalThis, "localStorage", { value: localStorageMock, writable: true })

// ── Mock child components ──────────────────────────────────────────────────

vi.mock("./waste-stat-bar", () => ({
  WasteStatBar: () => <div data-testid="waste-stat-bar">stat-bar</div>,
}))
vi.mock("./waste-category-tabs", () => ({
  WasteCategoryTabs: () => <div data-testid="waste-category-tabs">tabs</div>,
}))
vi.mock("./waste-severity-filter", () => ({
  WasteSeverityFilter: () => <div>filter</div>,
}))
vi.mock("./waste-findings-list", () => ({
  WasteFindingsList: () => <div data-testid="waste-findings-list">findings</div>,
}))
vi.mock("./waste-export", () => ({
  WasteExport: () => <div>export</div>,
}))
vi.mock("./waste-cluster-map", () => ({
  WasteClusterMap: () => <div>map</div>,
}))
vi.mock("./waste-seymour-panel", () => ({
  WasteSeymourPanel: () => null,
}))
vi.mock("./waste-detectors-data", () => ({
  WasteDetectorsData: () => <div>detectors</div>,
}))
vi.mock("./waste-review-queue", () => ({
  WasteReviewQueue: () => <div>review queue</div>,
}))
vi.mock("./waste-detector-accuracy", () => ({
  WasteDetectorAccuracy: () => <div>accuracy</div>,
}))
vi.mock("./widgets/severity-donut", () => ({
  SeverityDonut: () => <div data-testid="widget-donut">donut</div>,
}))
vi.mock("./widgets/queue-status", () => ({
  QueueStatus: () => <div data-testid="widget-queue">queue</div>,
}))
vi.mock("./widgets/accuracy-bars", () => ({
  AccuracyBars: () => <div data-testid="widget-accuracy">accuracy</div>,
}))
vi.mock("./widgets/investigation-summary", () => ({
  InvestigationSummary: () => <div data-testid="widget-inv">inv</div>,
}))

// ── Mock infrastructure ────────────────────────────────────────────────────

vi.mock("@auth0/auth0-react", () => ({
  useAuth0: () => ({
    isAuthenticated: true,
    isLoading: false,
    loginWithRedirect: vi.fn(),
  }),
}))

vi.mock("next/navigation", () => ({
  usePathname: () => "/waste",
  useRouter: () => ({ push: vi.fn() }),
}))

vi.mock("next/link", () => ({
  default: ({ children, href, onClick, ...props }: any) => (
    <a href={href} onClick={onClick} {...props}>{children}</a>
  ),
}))

vi.mock("@/components/Loader", () => ({
  default: () => <div>Loading...</div>,
}))

vi.mock("@/lib/hooks/useCities", () => ({
  useCities: () => ({
    data: [{ city_id: 1, name: "San Francisco", datasets_count: 5 }],
    isLoading: false,
  }),
}))

const mockForceRefetch = vi.fn().mockResolvedValue({ error: null })

vi.mock("@/lib/hooks/useWaste", () => ({
  useWasteAnalysis: vi.fn().mockReturnValue({
    data: null,
    error: null,
    forceRefetch: vi.fn().mockResolvedValue({ error: null }),
  }),
}))

import { useWasteAnalysis as _useWasteAnalysis } from "@/lib/hooks/useWaste"
const useWasteAnalysis = vi.mocked(_useWasteAnalysis)

const CACHE_KEY = "waste:last-analysis:v1"

const cachedAnalysis = {
  analysis_timestamp: "2026-03-02T10:00:00Z",
  cached: true,
  summary: {
    total_findings: 42,
    critical_count: 5,
    estimated_exposure: 1000000,
    departments_affected: 3,
    categories: [],
  },
  findings: [],
  errors: [],
  data_freshness: [],
}

describe("WastePageContent", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorageMock.clear()
    // Reset to default: no fresh data, no error
    useWasteAnalysis.mockReturnValue({
      data: null,
      error: null,
      forceRefetch: vi.fn().mockResolvedValue({ error: null }),
    })
  })

  it("renders stat bar", () => {
    render(<WastePageContent />)
    expect(screen.getByTestId("waste-stat-bar")).toBeInTheDocument()
  })

  it("shows compact status line when cached data is available but no fresh data", () => {
    localStorage.setItem(CACHE_KEY, JSON.stringify(cachedAnalysis))
    render(<WastePageContent />)
    const statusLine = screen.getByTestId("compact-status-line")
    expect(statusLine).toBeInTheDocument()
    expect(statusLine.textContent).toContain("Analysis from")
    expect(statusLine.textContent).toContain("42 findings")
  })

  it("compact status line contains a Refresh link", () => {
    localStorage.setItem(CACHE_KEY, JSON.stringify(cachedAnalysis))
    render(<WastePageContent />)
    const statusLine = screen.getByTestId("compact-status-line")
    const refreshLink = statusLine.querySelector("button")
    expect(refreshLink).toBeInTheDocument()
    expect(refreshLink?.textContent).toBe("Refresh")
  })

  it("stat bar appears before error banners in the DOM when both exist", () => {
    localStorage.setItem(CACHE_KEY, JSON.stringify(cachedAnalysis))
    useWasteAnalysis.mockReturnValue({
      data: null,
      error: new Error("Test error"),
      forceRefetch: vi.fn().mockResolvedValue({ error: null }),
    })
    const { container } = render(<WastePageContent />)
    const statBar = container.querySelector("[data-testid='waste-stat-bar']")
    const errorBanner = screen.getByText("Analysis Error").closest("div.mb-6")
    // Stat bar should come before error banner in DOM
    expect(statBar).toBeInTheDocument()
    expect(errorBanner).toBeInTheDocument()
    expect(statBar!.compareDocumentPosition(errorBanner!)).toBe(Node.DOCUMENT_POSITION_FOLLOWING)
  })

  it("shows welcome empty state when no data or cache exists", () => {
    render(<WastePageContent />)
    expect(screen.getByText("Welcome to Waste Detection")).toBeInTheDocument()
    expect(screen.getByText("Run Analysis")).toBeInTheDocument()
  })

  it("renders dashboard widgets when data is available", () => {
    localStorage.setItem(CACHE_KEY, JSON.stringify(cachedAnalysis))
    render(<WastePageContent />)
    expect(screen.getByTestId("widget-donut")).toBeInTheDocument()
    expect(screen.getByTestId("widget-queue")).toBeInTheDocument()
    expect(screen.getByTestId("widget-accuracy")).toBeInTheDocument()
    expect(screen.getByTestId("widget-inv")).toBeInTheDocument()
  })
})

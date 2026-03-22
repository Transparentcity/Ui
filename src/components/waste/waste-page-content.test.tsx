/* eslint-disable @typescript-eslint/no-explicit-any */
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { vi, describe, it, expect, beforeEach } from "vitest"
import { WastePageContent } from "./waste-page-content"
import { installResizeObserver } from "./test-utils"
import { wasteCacheKey } from "./waste-utils"

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

let mockSelectedCityId = 1

vi.mock("./WasteCityContext", () => ({
  useWasteCity: () => ({
    selectedCityId: mockSelectedCityId,
    eligibleCities: [{ id: 1, name: "San Francisco", slug: "san-francisco", datasets_count: 5 }],
    isLoading: false,
    isFetching: false,
    cityLoadError: null,
    isCityFallback: false,
    setSelectedCityId: vi.fn(),
    selectedCityName: "San Francisco",
  }),
}))

const mockStartJob = vi.fn()
const mockCancelJob = vi.fn()

function mockJobReturn(overrides: Record<string, any> = {}) {
  return {
    activeJob: null,
    isRunning: false,
    isStarting: false,
    startJob: mockStartJob,
    cancelJob: mockCancelJob,
    startError: undefined,
    retryCount: 0,
    lastDiagnostics: null,
    ...overrides,
  }
}

vi.mock("@/lib/hooks/useWaste", () => ({
  useWasteAnalysis: vi.fn().mockReturnValue({
    data: null,
    error: null,
    forceRefetch: vi.fn().mockResolvedValue({ error: null }),
  }),
  useActiveWasteJob: vi.fn().mockReturnValue({
    activeJob: null,
    isRunning: false,
    isStarting: false,
    startJob: vi.fn(),
  }),
  useLatestPersistedWasteResult: vi.fn().mockReturnValue({
    data: null,
    isLoading: false,
  }),
  useLatestWasteRun: vi.fn().mockReturnValue({
    data: null,
    isLoading: false,
  }),
}))

import { useWasteAnalysis as _useWasteAnalysis, useActiveWasteJob as _useActiveWasteJob } from "@/lib/hooks/useWaste"
const useWasteAnalysis = vi.mocked(_useWasteAnalysis)
const useActiveWasteJob = vi.mocked(_useActiveWasteJob)

const CACHE_KEY = wasteCacheKey(1)

const cachedAnalysis = {
  analysis_timestamp: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
  cached: true,
  summary: {
    total_findings: 42,
    critical_count: 5,
    estimated_exposure: 1000000,
    departments_affected: 3,
    categories: [],
  },
  findings: Array.from({ length: 42 }, (_, i) => ({
    id: `finding-${i}`,
    title: `Test Finding ${i}`,
    severity: i < 5 ? "critical" : "high",
    category: "payroll",
    department: "HR",
    estimated_amount: 10000,
  })),
  errors: [],
  data_freshness: [],
}

describe("WastePageContent", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorageMock.clear()
    mockSelectedCityId = 1
    useWasteAnalysis.mockReturnValue({
      data: null,
      error: null,
      forceRefetch: vi.fn().mockResolvedValue({ error: null }),
    })
    useActiveWasteJob.mockReturnValue(mockJobReturn())
  })

  it("renders stat bar", () => {
    render(<WastePageContent />)
    expect(screen.getByTestId("waste-stat-bar")).toBeInTheDocument()
  })

  it("shows consolidated status when cached data is available but no fresh data", () => {
    localStorage.setItem(CACHE_KEY, JSON.stringify(cachedAnalysis))
    render(<WastePageContent />)
    expect(screen.getByText(/Showing saved results from/)).toBeInTheDocument()
  })

  it("consolidated status contains a Refresh button", () => {
    localStorage.setItem(CACHE_KEY, JSON.stringify(cachedAnalysis))
    render(<WastePageContent />)
    expect(screen.getByText(/Showing saved results from/)).toBeInTheDocument()
    const refreshButtons = screen.getAllByRole("button", { name: /Refresh/ })
    expect(refreshButtons.length).toBeGreaterThanOrEqual(2)
  })

  it("shows both stat bar and error status when both exist", () => {
    localStorage.setItem(CACHE_KEY, JSON.stringify(cachedAnalysis))
    useWasteAnalysis.mockReturnValue({
      data: null,
      error: new Error("Test error"),
      forceRefetch: vi.fn().mockResolvedValue({ error: null }),
    })
    render(<WastePageContent />)
    expect(screen.getByTestId("waste-stat-bar")).toBeInTheDocument()
    expect(screen.getByText(/Live analysis unavailable/)).toBeInTheDocument()
  })

  it("shows empty state CTA when no data or cache exists", () => {
    render(<WastePageContent />)
    expect(screen.getByTestId("empty-state")).toBeInTheDocument()
    expect(screen.getByText("Run Waste Analysis")).toBeInTheDocument()
  })

  it("shows stale data nudge when persisted data is older than 7 days", () => {
    const staleAnalysis = {
      ...cachedAnalysis,
      analysis_timestamp: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(),
    }
    localStorage.setItem(CACHE_KEY, JSON.stringify(staleAnalysis))
    render(<WastePageContent />)
    expect(screen.getByText(/Results are from/)).toBeInTheDocument()
    expect(screen.getByText(/Run a fresh analysis/)).toBeInTheDocument()
  })

  it("resets fallback state when switching cities", () => {
    localStorage.setItem(CACHE_KEY, JSON.stringify(cachedAnalysis))

    const { rerender } = render(<WastePageContent />)

    expect(screen.getByText(/Showing saved results from/)).toBeInTheDocument()
    expect(useWasteAnalysis).toHaveBeenLastCalledWith(undefined, false, 1)

    mockSelectedCityId = 3
    rerender(<WastePageContent />)

    expect(screen.queryByText(/Showing saved results from/)).not.toBeInTheDocument()
    expect(screen.getByTestId("empty-state")).toBeInTheDocument()
    expect(useWasteAnalysis).toHaveBeenLastCalledWith(undefined, true, 3)
  })

  // ── Loading indicator / job progress tests ────────────────────────────────

  it("shows progress indicator when a waste job is running", () => {
    useActiveWasteJob.mockReturnValue(mockJobReturn({
      activeJob: {
        job_id: "job-123",
        job_type: "waste_analysis_run",
        status: "running",
        progress: 45,
        status_message: "Detecting anomalous patterns",
        created_at: new Date(Date.now() - 30_000).toISOString(),
        started_at: new Date(Date.now() - 25_000).toISOString(),
      },
      isRunning: true,
    }))
    render(<WastePageContent />)
    expect(screen.getAllByText(/Analyzing/).length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText(/45%/).length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText(/Detecting anomalous patterns/)).toBeInTheDocument()
  })

  it("shows progress indicator with pending job (0% progress)", () => {
    useActiveWasteJob.mockReturnValue(mockJobReturn({
      activeJob: {
        job_id: "job-456",
        job_type: "waste_analysis_run",
        status: "pending",
        progress: 0,
        status_message: "",
        created_at: new Date().toISOString(),
      },
      isRunning: true,
    }))
    render(<WastePageContent />)
    expect(screen.getAllByText(/Analyzing/).length).toBeGreaterThanOrEqual(1)
    expect(screen.queryByText("Welcome to Waste Detection")).not.toBeInTheDocument()
  })

  it("hides progress indicator when job completes and shows results", () => {
    useActiveWasteJob.mockReturnValue(mockJobReturn({
      activeJob: {
        job_id: "job-789",
        job_type: "waste_analysis_run",
        status: "completed",
        progress: 100,
        created_at: new Date(Date.now() - 120_000).toISOString(),
        completed_at: new Date().toISOString(),
      },
    }))
    useWasteAnalysis.mockReturnValue({
      data: cachedAnalysis as any,
      error: null,
      forceRefetch: vi.fn().mockResolvedValue({ error: null }),
    })
    render(<WastePageContent />)
    expect(screen.queryByText(/Analyzing…/)).not.toBeInTheDocument()
    expect(screen.getByText("Refresh")).toBeInTheDocument()
  })

  it("shows failure status when job fails", () => {
    useActiveWasteJob.mockReturnValue(mockJobReturn({
      activeJob: {
        job_id: "job-fail",
        job_type: "waste_analysis_run",
        status: "failed",
        progress: 30,
        error_message: "Dataset fetch timed out",
        created_at: new Date().toISOString(),
      },
    }))
    render(<WastePageContent />)
    expect(screen.getByText(/Refresh failed/)).toBeInTheDocument()
  })

  it("calls startJob when Refresh button is clicked", async () => {
    const user = userEvent.setup()
    localStorage.setItem(CACHE_KEY, JSON.stringify(cachedAnalysis))
    render(<WastePageContent />)
    const refreshButtons = screen.getAllByRole("button", { name: /Refresh/ })
    await user.click(refreshButtons[refreshButtons.length - 1])
    expect(mockStartJob).toHaveBeenCalled()
  })

  it("Refresh button is disabled while job is running", () => {
    useActiveWasteJob.mockReturnValue(mockJobReturn({
      activeJob: {
        job_id: "job-dis",
        job_type: "waste_analysis_run",
        status: "running",
        progress: 50,
        created_at: new Date().toISOString(),
      },
      isRunning: true,
    }))
    localStorage.setItem(CACHE_KEY, JSON.stringify(cachedAnalysis))
    render(<WastePageContent />)
    const analyzingBtns = screen.getAllByText(/Analyzing/)
    expect(analyzingBtns[0].closest("button")).toBeDisabled()
  })

  it("resumes showing progress for an already-running job on mount", () => {
    useActiveWasteJob.mockReturnValue(mockJobReturn({
      activeJob: {
        job_id: "job-resume",
        job_type: "waste_analysis_run",
        status: "running",
        progress: 65,
        status_message: "Scoring findings for confidence and priority",
        created_at: new Date(Date.now() - 60_000).toISOString(),
        started_at: new Date(Date.now() - 55_000).toISOString(),
      },
      isRunning: true,
    }))
    render(<WastePageContent />)
    expect(screen.getAllByText(/65%/).length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText(/Scoring findings/)).toBeInTheDocument()
    expect(screen.getAllByText(/Analyzing/).length).toBeGreaterThanOrEqual(1)
  })

  it("shows stale job error with details when analysis ran too long", () => {
    useActiveWasteJob.mockReturnValue(mockJobReturn({
      activeJob: {
        job_id: "job-stale-abc",
        job_type: "waste_analysis_run",
        status: "failed",
        progress: 10,
        error_message:
          "Analysis has been running for 11 minutes without completing. " +
          "The server may have restarted or a detector may be stuck. " +
          "Job ID: job-stale-abc",
        created_at: new Date(Date.now() - 11 * 60_000).toISOString(),
      },
    }))
    render(<WastePageContent />)
    expect(screen.getByText(/Refresh failed/)).toBeInTheDocument()
    expect(screen.queryByText(/Analyzing…/)).not.toBeInTheDocument()
  })

  it("shows backend status_message when available instead of time-based step", () => {
    useActiveWasteJob.mockReturnValue(mockJobReturn({
      activeJob: {
        job_id: "job-msg",
        job_type: "waste_analysis_run",
        status: "running",
        progress: 40,
        status_message: "Running waste analysis detectors...",
        created_at: new Date(Date.now() - 20_000).toISOString(),
        started_at: new Date(Date.now() - 18_000).toISOString(),
      },
      isRunning: true,
    }))
    render(<WastePageContent />)
    expect(screen.getByText(/Running waste analysis detectors/)).toBeInTheDocument()
    expect(screen.getAllByText(/40%/).length).toBeGreaterThanOrEqual(1)
  })

  it("shows loading card with ETA during analysis", () => {
    useActiveWasteJob.mockReturnValue(mockJobReturn({
      activeJob: {
        job_id: "job-elapsed",
        job_type: "waste_analysis_run",
        status: "running",
        progress: 25,
        status_message: "",
        created_at: new Date(Date.now() - 45_000).toISOString(),
        started_at: new Date(Date.now() - 42_000).toISOString(),
      },
      isRunning: true,
    }))
    render(<WastePageContent />)
    expect(screen.getByTestId("analysis-loading-card")).toBeInTheDocument()
    expect(screen.getByText(/Estimated time left/)).toBeInTheDocument()
  })
})

// ── getWasteAnalysisProgress unit tests ─────────────────────────────────────

import { getWasteAnalysisProgress } from "./waste-page-content"

describe("getWasteAnalysisProgress", () => {
  it("shows connecting step at start", () => {
    const p = getWasteAnalysisProgress(3)
    expect(p.step).toMatch(/Connecting to city data sources/)
    expect(p.progressPct).toBeGreaterThanOrEqual(6)
  })

  it("shows fetching step after 10s", () => {
    const p = getWasteAnalysisProgress(10)
    expect(p.step).toMatch(/Fetching datasets/)
  })

  it("still fetching at 65s", () => {
    const p = getWasteAnalysisProgress(65)
    expect(p.step).toMatch(/Still fetching/)
  })

  it("shows payroll step after 150s", () => {
    const p = getWasteAnalysisProgress(155)
    expect(p.step).toMatch(/payroll/)
  })

  it("shows vendor step after 210s", () => {
    const p = getWasteAnalysisProgress(215)
    expect(p.step).toMatch(/vendor/)
  })

  it("shows infrastructure step after 270s", () => {
    const p = getWasteAnalysisProgress(275)
    expect(p.step).toMatch(/infrastructure/)
  })

  it("shows scoring step after 310s", () => {
    const p = getWasteAnalysisProgress(315)
    expect(p.step).toMatch(/Scoring/)
  })

  it("shows persisting step after 340s", () => {
    const p = getWasteAnalysisProgress(345)
    expect(p.step).toMatch(/Persisting/)
  })

  it("shows concern message after 9 minutes", () => {
    const p = getWasteAnalysisProgress(545)
    expect(p.step).toMatch(/longer than expected/)
  })

  it("progress never exceeds 95%", () => {
    const p = getWasteAnalysisProgress(600)
    expect(p.progressPct).toBeLessThanOrEqual(95)
  })

  it("marks as long-running after estimated time + 12s", () => {
    const notYet = getWasteAnalysisProgress(900)
    expect(notYet.isLongRunning).toBe(false)
    const yes = getWasteAnalysisProgress(913)
    expect(yes.isLongRunning).toBe(true)
  })
})

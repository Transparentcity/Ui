import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
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

vi.mock("@tanstack/react-query", () => ({
  useQuery: () => ({
    data: [{ id: 1, name: "San Francisco", datasets_count: 5 }],
    isLoading: false,
  }),
}))

vi.mock("@/lib/publicApiClient", () => ({
  listPublicCitiesForSitemap: vi.fn().mockResolvedValue([]),
}))

const mockStartJob = vi.fn()

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
}))

import { useWasteAnalysis as _useWasteAnalysis, useActiveWasteJob as _useActiveWasteJob } from "@/lib/hooks/useWaste"
const useWasteAnalysis = vi.mocked(_useWasteAnalysis)
const useActiveWasteJob = vi.mocked(_useActiveWasteJob)

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
    useActiveWasteJob.mockReturnValue({
      activeJob: null,
      isRunning: false,
      isStarting: false,
      startJob: mockStartJob,
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

  // ── Loading indicator / job progress tests ────────────────────────────────

  it("shows progress indicator when a waste job is running", () => {
    useActiveWasteJob.mockReturnValue({
      activeJob: {
        job_id: "job-123",
        job_type: "waste_analysis_run",
        status: "running",
        description: "Waste analysis",
        progress: 45,
        status_message: "Detecting anomalous patterns",
        created_at: new Date(Date.now() - 30_000).toISOString(),
        started_at: new Date(Date.now() - 25_000).toISOString(),
      } as any,
      isRunning: true,
      isStarting: false,
      startJob: mockStartJob,
    })
    render(<WastePageContent />)
    // Header shows the Analyzing button
    expect(screen.getByText(/Analyzing/)).toBeInTheDocument()
    // Progress percentage visible
    expect(screen.getByText(/45%/)).toBeInTheDocument()
    // Status step text visible in the inline progress line
    expect(screen.getByText(/Detecting anomalous patterns/)).toBeInTheDocument()
  })

  it("shows progress indicator with pending job (0% progress)", () => {
    useActiveWasteJob.mockReturnValue({
      activeJob: {
        job_id: "job-456",
        job_type: "waste_analysis_run",
        status: "pending",
        description: "Waste analysis",
        progress: 0,
        status_message: "",
        created_at: new Date().toISOString(),
      } as any,
      isRunning: true,
      isStarting: false,
      startJob: mockStartJob,
    })
    render(<WastePageContent />)
    expect(screen.getByText(/Analyzing/)).toBeInTheDocument()
    // Welcome state should NOT be shown during analysis
    expect(screen.queryByText("Welcome to Waste Detection")).not.toBeInTheDocument()
  })

  it("hides progress indicator when job completes and shows results", () => {
    // Job is completed, data is available
    useActiveWasteJob.mockReturnValue({
      activeJob: {
        job_id: "job-789",
        job_type: "waste_analysis_run",
        status: "completed",
        description: "Waste analysis",
        progress: 100,
        created_at: new Date(Date.now() - 120_000).toISOString(),
        completed_at: new Date().toISOString(),
      } as any,
      isRunning: false,
      isStarting: false,
      startJob: mockStartJob,
    })
    useWasteAnalysis.mockReturnValue({
      data: cachedAnalysis as any,
      error: null,
      forceRefetch: vi.fn().mockResolvedValue({ error: null }),
    })
    render(<WastePageContent />)
    // Analyzing button should NOT be present
    expect(screen.queryByText(/Analyzing/)).not.toBeInTheDocument()
    // The Refresh button should be present (not disabled)
    expect(screen.getByText("Refresh")).toBeInTheDocument()
  })

  it("shows skeleton widgets while job is running", () => {
    useActiveWasteJob.mockReturnValue({
      activeJob: {
        job_id: "job-skel",
        job_type: "waste_analysis_run",
        status: "running",
        description: "Waste analysis",
        progress: 20,
        created_at: new Date().toISOString(),
      } as any,
      isRunning: true,
      isStarting: false,
      startJob: mockStartJob,
    })
    const { container } = render(<WastePageContent />)
    // Should show skeleton placeholders instead of real widgets
    const pulsingDivs = container.querySelectorAll(".animate-pulse")
    expect(pulsingDivs.length).toBeGreaterThan(0)
    // Real widgets should NOT be rendered
    expect(screen.queryByTestId("widget-donut")).not.toBeInTheDocument()
  })

  it("shows failure banner when job fails", () => {
    useActiveWasteJob.mockReturnValue({
      activeJob: {
        job_id: "job-fail",
        job_type: "waste_analysis_run",
        status: "failed",
        description: "Waste analysis",
        progress: 30,
        error_message: "Dataset fetch timed out",
        created_at: new Date().toISOString(),
      } as any,
      isRunning: false,
      isStarting: false,
      startJob: mockStartJob,
    })
    render(<WastePageContent />)
    expect(screen.getByText("Dataset fetch timed out")).toBeInTheDocument()
    expect(screen.getByText("Retry")).toBeInTheDocument()
  })

  it("calls startJob when Run Analysis button is clicked", async () => {
    const user = userEvent.setup()
    render(<WastePageContent />)
    const runButton = screen.getByText("Run Analysis")
    await user.click(runButton)
    expect(mockStartJob).toHaveBeenCalled()
  })

  it("Refresh button is disabled while job is running", () => {
    useActiveWasteJob.mockReturnValue({
      activeJob: {
        job_id: "job-dis",
        job_type: "waste_analysis_run",
        status: "running",
        description: "Waste analysis",
        progress: 50,
        created_at: new Date().toISOString(),
      } as any,
      isRunning: true,
      isStarting: false,
      startJob: mockStartJob,
    })
    localStorage.setItem(CACHE_KEY, JSON.stringify(cachedAnalysis))
    render(<WastePageContent />)
    const analyzingBtn = screen.getByText(/Analyzing/)
    expect(analyzingBtn.closest("button")).toBeDisabled()
  })

  it("resumes showing progress for an already-running job on mount", () => {
    // Simulates navigating away and back — hook detects running job on mount
    useActiveWasteJob.mockReturnValue({
      activeJob: {
        job_id: "job-resume",
        job_type: "waste_analysis_run",
        status: "running",
        description: "Waste analysis",
        progress: 65,
        status_message: "Scoring findings for confidence and priority",
        created_at: new Date(Date.now() - 60_000).toISOString(),
        started_at: new Date(Date.now() - 55_000).toISOString(),
      } as any,
      isRunning: true,
      isStarting: false,
      startJob: mockStartJob,
    })
    render(<WastePageContent />)
    expect(screen.getByText(/65%/)).toBeInTheDocument()
    expect(screen.getByText(/Scoring findings/)).toBeInTheDocument()
    expect(screen.getByText(/Analyzing/)).toBeInTheDocument()
  })

  it("shows stale job error with job ID when analysis ran too long", () => {
    useActiveWasteJob.mockReturnValue({
      activeJob: {
        job_id: "job-stale-abc",
        job_type: "waste_analysis_run",
        status: "failed",
        description: "Waste analysis",
        progress: 10,
        error_message:
          "Analysis has been running for 11 minutes without completing. " +
          "The server may have restarted or a detector may be stuck. " +
          "Job ID: job-stale-abc",
        created_at: new Date(Date.now() - 11 * 60_000).toISOString(),
      } as any,
      isRunning: false,
      isStarting: false,
      startJob: mockStartJob,
    })
    render(<WastePageContent />)
    // Error banner shows the detailed message including job ID
    expect(screen.getByText(/server may have restarted/)).toBeInTheDocument()
    expect(screen.getByText(/job-stale-abc/)).toBeInTheDocument()
    expect(screen.getByText("Retry")).toBeInTheDocument()
    // Progress indicator should NOT be shown
    expect(screen.queryByText(/Analyzing/)).not.toBeInTheDocument()
  })

  it("shows backend status_message when available instead of time-based step", () => {
    useActiveWasteJob.mockReturnValue({
      activeJob: {
        job_id: "job-msg",
        job_type: "waste_analysis_run",
        status: "running",
        description: "Waste analysis",
        progress: 40,
        status_message: "Running waste analysis detectors...",
        created_at: new Date(Date.now() - 20_000).toISOString(),
        started_at: new Date(Date.now() - 18_000).toISOString(),
      } as any,
      isRunning: true,
      isStarting: false,
      startJob: mockStartJob,
    })
    render(<WastePageContent />)
    // Should show the backend's status_message, not the time-based fallback
    expect(screen.getByText(/Running waste analysis detectors/)).toBeInTheDocument()
    expect(screen.getByText(/40%/)).toBeInTheDocument()
  })

  it("shows elapsed time counter during analysis", () => {
    useActiveWasteJob.mockReturnValue({
      activeJob: {
        job_id: "job-elapsed",
        job_type: "waste_analysis_run",
        status: "running",
        description: "Waste analysis",
        progress: 25,
        status_message: "",
        created_at: new Date(Date.now() - 45_000).toISOString(),
        started_at: new Date(Date.now() - 42_000).toISOString(),
      } as any,
      isRunning: true,
      isStarting: false,
      startJob: mockStartJob,
    })
    render(<WastePageContent />)
    // Elapsed seconds should be shown (approximately 42s)
    expect(screen.getByText(/\d+s/)).toBeInTheDocument()
  })
})

// ── getWasteAnalysisProgress unit tests ─────────────────────────────────────

import { getWasteAnalysisProgress } from "./waste-page-content"

describe("getWasteAnalysisProgress", () => {
  it("shows data fetch step at start", () => {
    const p = getWasteAnalysisProgress(3)
    expect(p.step).toMatch(/Fetching latest records/)
    expect(p.progressPct).toBeGreaterThanOrEqual(6)
  })

  it("shows payroll detectors step after 8s", () => {
    const p = getWasteAnalysisProgress(10)
    expect(p.step).toMatch(/payroll/)
  })

  it("shows vendor detectors step after 15s", () => {
    const p = getWasteAnalysisProgress(20)
    expect(p.step).toMatch(/vendor/)
  })

  it("shows infrastructure detectors step after 35s", () => {
    const p = getWasteAnalysisProgress(40)
    expect(p.step).toMatch(/infrastructure/)
  })

  it("shows integrity detectors step after 45s with cross-matching detail", () => {
    const p = getWasteAnalysisProgress(50)
    expect(p.step).toMatch(/integrity/)
    expect(p.step).toMatch(/cross-matching/)
  })

  it("shows scoring step after 80s", () => {
    const p = getWasteAnalysisProgress(90)
    expect(p.step).toMatch(/Scoring findings/)
  })

  it("shows elapsed time and reassurance for long-running analysis (>120s)", () => {
    const p = getWasteAnalysisProgress(150)
    expect(p.step).toMatch(/Still processing/)
    expect(p.step).toMatch(/2m/)
    expect(p.step).toMatch(/large datasets/)
  })

  it("shows concern message after 5 minutes", () => {
    const p = getWasteAnalysisProgress(320)
    expect(p.step).toMatch(/longer than expected/)
    expect(p.step).toMatch(/5m/)
  })

  it("progress never exceeds 95%", () => {
    const p = getWasteAnalysisProgress(600)
    expect(p.progressPct).toBeLessThanOrEqual(95)
  })

  it("marks as long-running after estimated time + 12s", () => {
    const notYet = getWasteAnalysisProgress(120)
    expect(notYet.isLongRunning).toBe(false)
    const yes = getWasteAnalysisProgress(140)
    expect(yes.isLongRunning).toBe(true)
  })
})

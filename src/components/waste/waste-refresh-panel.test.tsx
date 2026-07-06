import { render, screen, fireEvent, waitFor } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { vi, describe, it, expect, beforeEach } from "vitest"
import { WasteRefreshPanel } from "./waste-refresh-panel"

vi.mock("@auth0/auth0-react", () => ({
  useAuth0: () => ({
    isAuthenticated: true,
    getAccessTokenSilently: vi.fn().mockResolvedValue("token"),
  }),
}))

const getAllScheduledJobs = vi.fn()
const getJob = vi.fn()
const runCustomScheduledJob = vi.fn()
vi.mock("@/lib/apiClient", () => ({
  getAllScheduledJobs: (...args: unknown[]) => getAllScheduledJobs(...args),
  getJob: (...args: unknown[]) => getJob(...args),
  runCustomScheduledJob: (...args: unknown[]) =>
    runCustomScheduledJob(...args),
}))

const SCHEDULE = {
  id: 2,
  name: "Weekly Waste Refresh",
  job_type: "weekly_waste_refresh",
  job_config: {},
  schedule_type: "weekly",
  status: "active",
  last_run_at: "2026-07-04T20:04:25Z",
  last_run_job_id: "job_abc",
  next_run_at: "2026-07-11T20:00:00Z",
}

const COMPLETED_JOB = {
  job_id: "job_abc",
  job_type: "custom_scheduled_job",
  status: "completed",
  description: "Weekly Waste Refresh",
  progress: 100,
  created_at: "2026-07-04T20:04:25Z",
  result: {
    execution_result: {
      status: "partial",
      results: [
        { city_id: 56838, city_name: "Chicago", status: "failed", error: "boom" },
        { city_id: 57260, city_name: "San Francisco", status: "completed" },
      ],
    },
  },
}

function renderPanel() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={client}>
      <WasteRefreshPanel />
    </QueryClientProvider>,
  )
}

describe("WasteRefreshPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getAllScheduledJobs.mockResolvedValue({
      custom_schedules: [SCHEDULE],
      total_count: 1,
    })
    getJob.mockResolvedValue(COMPLETED_JOB)
  })

  it("shows per-city outcomes from the last run's job result", async () => {
    renderPanel()
    expect(await screen.findByText("Chicago")).toBeInTheDocument()
    expect(screen.getByText("San Francisco")).toBeInTheDocument()
    // The schedule-level status can say completed while cities failed:
    // the panel must show the per-city truth.
    expect(screen.getByText("failed")).toBeInTheDocument()
    expect(screen.getByText("ok")).toBeInTheDocument()
  })

  it("shows a not-found message when the schedule is missing", async () => {
    getAllScheduledJobs.mockResolvedValue({ custom_schedules: [], total_count: 0 })
    renderPanel()
    expect(
      await screen.findByText(/Weekly refresh schedule not found/),
    ).toBeInTheDocument()
  })

  it("surfaces a skipped run instead of appearing to do nothing", async () => {
    runCustomScheduledJob.mockResolvedValue({
      status: "skipped",
      message: "A run is already in progress.",
    })
    renderPanel()
    fireEvent.click(await screen.findByText("Run now"))
    expect(
      await screen.findByText(/A run is already in progress/),
    ).toBeInTheDocument()
    // No live job was started.
    expect(screen.getByText("Run now")).toBeInTheDocument()
  })

  it("disables the button immediately after a run starts (no double trigger)", async () => {
    runCustomScheduledJob.mockResolvedValue({ status: "started", job_id: "job_new" })
    getJob.mockImplementation(async (jobId: unknown) =>
      jobId === "job_new"
        ? { ...COMPLETED_JOB, job_id: "job_new", status: "running", progress: 10, status_message: "Running detectors" }
        : COMPLETED_JOB,
    )
    renderPanel()
    fireEvent.click(await screen.findByText("Run now"))
    await waitFor(() => {
      expect(screen.getByText(/Running…|Starting…/)).toBeInTheDocument()
    })
    const button = screen.getByRole("button")
    expect(button).toBeDisabled()
    expect(runCustomScheduledJob).toHaveBeenCalledTimes(1)
  })

  it("shows an error when starting the run fails", async () => {
    runCustomScheduledJob.mockRejectedValue(new Error("500 boom"))
    renderPanel()
    fireEvent.click(await screen.findByText("Run now"))
    expect(
      await screen.findByText(/Couldn't start refresh: 500 boom/),
    ).toBeInTheDocument()
  })
})

describe("WasteRefreshPanel terminal states", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getAllScheduledJobs.mockResolvedValue({
      custom_schedules: [SCHEDULE],
      total_count: 1,
    })
  })

  it("releases the running state when the live job is cancelled", async () => {
    runCustomScheduledJob.mockResolvedValue({ status: "started", job_id: "job_c" })
    getJob.mockImplementation(async (jobId: unknown) =>
      jobId === "job_c"
        ? { ...COMPLETED_JOB, job_id: "job_c", status: "cancelled" }
        : COMPLETED_JOB,
    )
    renderPanel()
    fireEvent.click(await screen.findByText("Run now"))
    // Once the cancelled status lands, liveJobId is released and the button
    // returns instead of being stuck on "Running…" forever.
    expect(await screen.findByText("Run now")).toBeInTheDocument()
    expect(screen.getByRole("button")).not.toBeDisabled()
  })
})

import { render, screen, fireEvent, waitFor } from "@testing-library/react"
import { vi, describe, it, expect, beforeEach, afterEach } from "vitest"
import { WasteSeymourPanel } from "./waste-seymour-panel"
import { makeFinding } from "./test-utils"
import type { WasteFinding } from "@/lib/apiClient"

// ── Mocks ────────────────────────────────────────────────────────────────────

const mockGetToken = vi.fn().mockResolvedValue("mock-token")
const mockPush = vi.fn()

vi.mock("@auth0/auth0-react", () => ({
  useAuth0: () => ({ getAccessTokenSilently: mockGetToken }),
}))

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}))

vi.mock("@/lib/apiClient", async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>
  return {
    ...actual,
    getAvailableModels: vi.fn(),
    createChatJob: vi.fn(),
    getJob: vi.fn(),
    getSessionStats: vi.fn(),
  }
})

vi.mock("@/lib/modelDefaults", () => ({
  PREFERRED_DEFAULT_MODEL_KEY: "test-model",
  pickDefaultModelKey: () => "test-model",
}))

import { getAvailableModels, createChatJob, getJob, getSessionStats } from "@/lib/apiClient"

const mockGetModels = vi.mocked(getAvailableModels)
const mockCreateJob = vi.mocked(createChatJob)
const mockGetJob = vi.mocked(getJob)
const mockGetStats = vi.mocked(getSessionStats)

function makeRequest(finding?: Partial<WasteFinding>) {
  return { finding: makeFinding(finding) }
}

describe("WasteSeymourPanel", () => {
  const onClose = vi.fn()
  const onSeymourUsage = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers({ shouldAdvanceTime: true })
    mockGetModels.mockResolvedValue([{ key: "test-model", label: "Test Model" }] as any)
    mockCreateJob.mockResolvedValue({ job_id: "job-123" } as any)
    mockGetJob.mockResolvedValue({ status: "completed", result: { response: "Analysis result text", session_id: "sess-1" } } as any)
    mockGetStats.mockResolvedValue({ total_tokens_used: 500, total_prompt_tokens: 200, total_completion_tokens: 300, estimated_cost_usd: 0.005 } as any)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  // ── Visibility ─────────────────────────────────────────────────────────────

  it("renders nothing when request is null", () => {
    const { container } = render(
      <WasteSeymourPanel request={null} onClose={onClose} />
    )
    expect(container.firstChild).toBeNull()
  })

  it("renders panel when request has a finding", () => {
    render(
      <WasteSeymourPanel request={makeRequest()} onClose={onClose} />
    )
    expect(screen.getByText(/Seymour:/)).toBeInTheDocument()
  })

  // ── Close button ───────────────────────────────────────────────────────────

  it("calls onClose when close button is clicked", () => {
    render(
      <WasteSeymourPanel request={makeRequest()} onClose={onClose} />
    )
    fireEvent.click(screen.getByLabelText("Close Seymour side chat"))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  // ── Resize buttons ─────────────────────────────────────────────────────────

  it("narrows the panel when narrower button is clicked", () => {
    const { container } = render(
      <WasteSeymourPanel request={makeRequest()} onClose={onClose} />
    )
    const aside = container.querySelector("aside")!
    const initialWidth = aside.style.width

    fireEvent.click(screen.getByLabelText("Make Seymour panel narrower"))
    const newWidth = aside.style.width
    expect(parseInt(newWidth)).toBeLessThan(parseInt(initialWidth))
  })

  it("widens the panel when wider button is clicked", () => {
    const { container } = render(
      <WasteSeymourPanel request={makeRequest()} onClose={onClose} />
    )
    const aside = container.querySelector("aside")!
    const initialWidth = aside.style.width

    fireEvent.click(screen.getByLabelText("Make Seymour panel wider"))
    const newWidth = aside.style.width
    expect(parseInt(newWidth)).toBeGreaterThan(parseInt(initialWidth))
  })

  // ── Open full chat button ──────────────────────────────────────────────────

  it("navigates to full chat when 'Open full Seymour chat' is clicked", async () => {
    render(
      <WasteSeymourPanel request={makeRequest()} onClose={onClose} />
    )

    // Wait for auto-analysis to complete
    await vi.advanceTimersByTimeAsync(5000)
    await waitFor(() => {
      expect(screen.getByText("Open full Seymour chat").closest("button")).not.toBeDisabled()
    })

    fireEvent.click(screen.getByText("Open full Seymour chat"))
    expect(mockPush).toHaveBeenCalledWith(expect.stringContaining("/dashboard?prefill="))
  })

  // ── Run analysis button ────────────────────────────────────────────────────

  it("shows 'Analyzing...' text while analysis is running", async () => {
    // Make the job stay pending for a while
    mockGetJob.mockResolvedValue({ status: "running" } as any)

    render(
      <WasteSeymourPanel request={makeRequest()} onClose={onClose} />
    )

    // Auto-analysis starts on mount; advance timer for first poll
    await vi.advanceTimersByTimeAsync(3000)

    await waitFor(() => {
      expect(screen.getByText("Analyzing...")).toBeInTheDocument()
    })
  })

  it("disables Run analysis button while analyzing", async () => {
    mockGetJob.mockResolvedValue({ status: "running" } as any)

    render(
      <WasteSeymourPanel request={makeRequest()} onClose={onClose} />
    )

    await vi.advanceTimersByTimeAsync(3000)

    await waitFor(() => {
      expect(screen.getByText("Analyzing...").closest("button")).toBeDisabled()
    })
  })

  it("shows analysis result after completion", async () => {
    render(
      <WasteSeymourPanel request={makeRequest()} onClose={onClose} onSeymourUsage={onSeymourUsage} />
    )

    await vi.advanceTimersByTimeAsync(5000)

    await waitFor(() => {
      expect(screen.getByText("Analysis result text")).toBeInTheDocument()
    })
  })

  it("shows elapsed time indicator while analyzing", async () => {
    mockGetJob.mockResolvedValue({ status: "running" } as any)

    render(
      <WasteSeymourPanel request={makeRequest()} onClose={onClose} />
    )

    await vi.advanceTimersByTimeAsync(5000)

    await waitFor(() => {
      expect(screen.getByText(/elapsed/)).toBeInTheDocument()
    })
  })
})

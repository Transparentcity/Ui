import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock("@auth0/auth0-react", () => ({
  useAuth0: () => ({ getAccessTokenSilently: vi.fn().mockResolvedValue("tok") }),
}))

const api = vi.hoisted(() => ({
  listFeeds: vi.fn(),
  listItems: vi.fn(),
  approveItem: vi.fn(),
  rejectItem: vi.fn(),
  queueCandidates: vi.fn(),
  issueToken: vi.fn(),
  revokeToken: vi.fn(),
}))
vi.mock("@/lib/reporterFeedLeads", async (orig) => ({
  ...(await orig<typeof import("@/lib/reporterFeedLeads")>()),
  ...api,
}))

import { ReporterFeedLeads } from "@/components/reporter-feed-leads"

const item = {
  id: 7,
  feed_id: 1,
  story_id: 9,
  story_hash: "abc12345",
  city_id: 57260,
  status: "pending",
  score: 0.62,
  score_parts: { topic: 0.4, angle: 1, geography: 0.6, signal: 1, freshness: 0.9, novelty: 1 },
  reason: "Test reason",
  topic_code: "SAFETY.POLICE",
  reporter_name: "Test Reporter",
  queued_at: "2026-11-21T10:00:00Z",
  approved_at: null,
  reject_code: null,
  item: {
    title: "Test headline",
    finding: "Test finding.",
    numbers: ["Test number sentence 1."],
    why_unusual: "",
    why_you: "Old why",
    story_url: "https://transparent.city/s/abc12345",
    metric_url: null,
    source: null,
    caveat: null,
  },
}

beforeEach(() => {
  vi.clearAllMocks()
  api.listFeeds.mockResolvedValue([])
  api.listItems.mockResolvedValue([item])
  api.approveItem.mockResolvedValue({})
  api.rejectItem.mockResolvedValue({})
})

describe("ReporterFeedLeads", () => {
  it("shows the rendered item, score parts and reason", async () => {
    render(<ReporterFeedLeads />)
    expect(await screen.findByText("Test headline")).toBeInTheDocument()
    expect(screen.getByText("Reason: Test reason")).toBeInTheDocument()
    expect(screen.getByText(/topic 0.40/)).toBeInTheDocument()
    expect(screen.getByText(/missing, add before approving/)).toBeInTheDocument()
  })

  it("approves with the edited Why you", async () => {
    render(<ReporterFeedLeads />)
    const box = await screen.findByLabelText(/Why you/)
    await userEvent.clear(box)
    await userEvent.type(box, "New why")
    await userEvent.click(screen.getByRole("button", { name: /Approve/ }))
    await waitFor(() => expect(api.approveItem).toHaveBeenCalled())
    expect(api.approveItem.mock.calls[0][1]).toBe(7)
    expect(api.approveItem.mock.calls[0][2]).toEqual({ why_you: "New why" })
  })

  it("rejects with a reason code", async () => {
    render(<ReporterFeedLeads />)
    await screen.findByText("Test headline")
    await userEvent.selectOptions(screen.getByLabelText("Reject reason"), "weak_numbers")
    await userEvent.click(screen.getByRole("button", { name: /Reject$/ }))
    await waitFor(() => expect(api.rejectItem).toHaveBeenCalled())
    expect(api.rejectItem.mock.calls[0].slice(1, 3)).toEqual([7, "weak_numbers"])
  })
})

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { CivicResearchLog, CivicSummaryTopic } from "@/lib/apiClient";

import CivicResearchPanel from "./CivicResearchPanel";

const api = vi.hoisted(() => ({
  getCivicResearchLog: vi.fn(),
  startCivicResearch: vi.fn(),
  updateAdminMetric: vi.fn(),
  notifyJobCreated: vi.fn(),
}));

const auth = vi.hoisted(() => ({ getAccessTokenSilently: async () => "tok" }));

vi.mock("@auth0/auth0-react", () => ({ useAuth0: () => auth }));
vi.mock("@/lib/apiClient", () => ({
  getCivicResearchLog: api.getCivicResearchLog,
  startCivicResearch: api.startCivicResearch,
  updateAdminMetric: api.updateAdminMetric,
}));
vi.mock("@/lib/useJobWebSocket", () => ({ notifyJobCreated: api.notifyJobCreated }));
vi.mock("@/components/MetricEditModal", () => ({ default: () => null }));

const TOPICS: CivicSummaryTopic[] = [
  {
    title: "Drug markets",
    question: "Have drug arrests in the Tenderloin risen this year?",
    voices: ["mayor", "supervisor"],
    numbers_cited: [],
    decision: { body: "Board of Supervisors", date: "2026-10-27", status: "scheduled" },
    metric_hints: [966],
  },
  {
    title: "Budget",
    question: null,
    voices: null,
    numbers_cited: null,
    decision: null,
    metric_hints: [],
  },
];

const LOG: CivicResearchLog = {
  city_id: 57260,
  days: 30,
  entries: [
    {
      job_id: "job-2",
      job_status: "completed",
      researched_at: "2026-10-15T18:00:00Z",
      mode: "scheduled",
      topic: "Drug markets",
      question: "Have drug arrests risen?",
      outcome: "story",
      reason: null,
      session_id: "s-1",
      story_ids: [8100],
      created_metric_ids: [555],
      stories: [
        { id: 8100, headline: "Arrests doubled", short_hash: "ab12", status: "active", eval_accuracy: "5" },
      ],
    },
    {
      job_id: "job-2",
      job_status: "completed",
      researched_at: "2026-10-15T18:00:00Z",
      mode: "scheduled",
      topic: "CA-11",
      question: "How much AI money is in the CA-11 race?",
      outcome: "no_city_data",
      reason: "needs campaign finance data by race",
      session_id: "s-2",
      story_ids: [],
      created_metric_ids: [],
      stories: [],
    },
  ],
  created_metrics: [
    {
      id: 555,
      metric_name: "Tenderloin drug arrests",
      show_on_dash: false,
      is_active: true,
      created_at: "2026-10-15T18:00:00Z",
      question: "Have drug arrests risen?",
    },
  ],
};

async function renderExpanded(isAdmin = true) {
  const user = userEvent.setup();
  render(<CivicResearchPanel cityId={57260} topics={TOPICS} isAdmin={isAdmin} />);
  await screen.findByText(/1 hidden metric to review/);
  await user.click(screen.getByRole("button", { name: /Civic research/ }));
  return user;
}

describe("CivicResearchPanel", () => {
  beforeEach(() => {
    api.getCivicResearchLog.mockResolvedValue(LOG);
    api.startCivicResearch.mockResolvedValue({ job_id: "job-12345678", status: "started", message: "" });
    api.updateAdminMetric.mockResolvedValue({ message: "ok" });
  });
  afterEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  it("summarizes topics, researched questions, and metrics to review", async () => {
    render(<CivicResearchPanel cityId={57260} topics={TOPICS} isAdmin />);
    expect(
      await screen.findByText("2 topics · 2 researched in 30 days · 1 hidden metric to review")
    ).toBeInTheDocument();
    expect(api.getCivicResearchLog).toHaveBeenCalledWith(57260, "tok");
  });

  it("shows each outcome with its story link and reason", async () => {
    await renderExpanded();
    expect(screen.getByText("Story published")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Arrests doubled" })).toHaveAttribute("href", "/s/ab12");
    expect(screen.getByText("No city data")).toBeInTheDocument();
    expect(screen.getByText("needs campaign finance data by race")).toBeInTheDocument();
    expect(screen.getByText("Built Tenderloin drug arrests")).toBeInTheDocument();
  });

  it("researches a summary topic, including one without a question", async () => {
    const user = await renderExpanded();
    const buttons = screen.getAllByRole("button", { name: "Research" });
    // The typed-question button comes first, then one per topic.
    await user.click(buttons[2]);
    expect(api.startCivicResearch).toHaveBeenCalledWith(57260, { topicTitle: "Budget" }, "tok");
    expect(api.notifyJobCreated).toHaveBeenCalledWith("job-12345678");
    expect(await screen.findByText(/Research started \(job job-1234\)/)).toBeInTheDocument();
  });

  it("researches a typed question once it reads as a sentence", async () => {
    const user = await renderExpanded();
    const input = screen.getByLabelText("Question to research");
    const submit = screen.getAllByRole("button", { name: "Research" })[0];
    await user.type(input, "Rents?");
    expect(submit).toBeDisabled();
    await user.clear(input);
    await user.type(input, "  Are rents falling in the Mission?  ");
    await user.click(submit);
    expect(api.startCivicResearch).toHaveBeenCalledWith(
      57260,
      { question: "Are rents falling in the Mission?" },
      "tok"
    );
    await waitFor(() => expect(input).toHaveValue(""));
  });

  it("lets an admin promote a hidden metric after confirming", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const user = await renderExpanded();
    await user.click(screen.getByRole("button", { name: "Show on dashboard" }));
    expect(api.updateAdminMetric).toHaveBeenCalledWith(555, { show_on_dash: true }, "tok");
    await waitFor(() => expect(api.getCivicResearchLog).toHaveBeenCalledTimes(2));
  });

  it("does not change the metric when the admin cancels", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);
    const user = await renderExpanded();
    await user.click(screen.getByRole("button", { name: "Deactivate" }));
    expect(api.updateAdminMetric).not.toHaveBeenCalled();
  });

  it("hides metric actions from city leads", async () => {
    await renderExpanded(false);
    expect(screen.getByText("Tenderloin drug arrests")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Show on dashboard" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Deactivate" })).not.toBeInTheDocument();
  });
});

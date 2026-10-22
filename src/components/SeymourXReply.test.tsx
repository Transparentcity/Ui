import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { CivicXReplyDraft } from "@/lib/apiClient";

import SeymourXReply, { replyCardImagePath, xCharCount, xReplyIntentUrl } from "./SeymourXReply";

const api = vi.hoisted(() => ({
  startCivicXReply: vi.fn(),
  getJob: vi.fn(),
  notifyJobCreated: vi.fn(),
}));

const auth = vi.hoisted(() => ({ getAccessTokenSilently: async () => "tok" }));

vi.mock("@auth0/auth0-react", () => ({ useAuth0: () => auth }));
vi.mock("@/lib/apiClient", () => ({
  startCivicXReply: api.startCivicXReply,
  getJob: api.getJob,
}));
vi.mock("@/lib/useJobWebSocket", () => ({ notifyJobCreated: api.notifyJobCreated }));
vi.mock("@/components/eval/SessionViewerModal", () => ({
  default: ({ sessionId }: { sessionId: string }) => <div>Session viewer {sessionId}</div>,
}));

const DRAFT: CivicXReplyDraft = {
  item_id: 2932,
  city_id: 57260,
  tweet_id: "2112583924723617903",
  author_handle: "DannySauter",
  reply_text: "Car break-ins in District 3 fell 12% this year.",
  note: "Checked metric 90 (car break-ins).",
  session_id: "s-1",
  execution_time_ms: 1200,
};

function renderInPostRow() {
  const rowClick = vi.fn();
  const rowKeys: string[] = [];
  render(
    <div
      role="button"
      aria-label="Open post"
      tabIndex={0}
      onClick={rowClick}
      onKeyDown={(e) => rowKeys.push(e.key)}
    >
      <SeymourXReply itemId={2932} />
    </div>
  );
  return { rowClick, rowKeys };
}

describe("xCharCount", () => {
  it("counts links as 23 and wide characters as 2", () => {
    expect(xCharCount("Hello")).toBe(5);
    expect(xCharCount("See https://transparent.city/c/san-francisco/metrics/90.")).toBe(28);
    expect(xCharCount("李爾德")).toBe(6);
  });
});

describe("xReplyIntentUrl", () => {
  it("opens X's reply window for the post with the text filled in", () => {
    expect(xReplyIntentUrl("42", "Up 12% & rising?")).toBe(
      "https://x.com/intent/post?in_reply_to=42&text=Up%2012%25%20%26%20rising%3F"
    );
  });
});

describe("replyCardImagePath", () => {
  it("finds the card of a chart or map link, as X does from the last link", () => {
    expect(replyCardImagePath("Down 71%: https://transparent.city/t/147322?period=ytd.")).toBe(
      "/t/147322/card-image"
    );
    expect(
      replyCardImagePath("https://transparent.city/t/1 then https://transparent.city/m/zc0iwY9h")
    ).toBe("/m/zc0iwY9h/card-image");
  });

  it("has no card for other links or none", () => {
    expect(replyCardImagePath("See https://transparent.city/c/san-francisco/metrics/90")).toBeNull();
    expect(replyCardImagePath("No link here.")).toBeNull();
  });
});

describe("SeymourXReply", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ shouldAdvanceTime: true });
    api.startCivicXReply.mockResolvedValue({ job_id: "job-7", status: "started", message: "" });
    api.getJob.mockResolvedValue({ status: "completed", result: DRAFT });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("drafts a reply the admin can edit and post from X's reply window", async () => {
    api.getJob.mockResolvedValueOnce({ status: "running" });
    renderInPostRow();

    fireEvent.click(screen.getByRole("button", { name: "Reply with Seymour" }));
    expect(screen.getByLabelText(/Coach Seymour/)).toHaveFocus();
    fireEvent.click(screen.getByRole("button", { name: "Write reply" }));
    expect(await screen.findByRole("button", { name: "Seymour is writing…" })).toBeDisabled();
    await act(() => vi.advanceTimersByTimeAsync(2000));

    const textarea = await screen.findByLabelText("Reply text");
    expect(textarea).toHaveValue(DRAFT.reply_text);
    expect(screen.getByText("Note: Checked metric 90 (car break-ins).")).toBeInTheDocument();
    expect(api.startCivicXReply).toHaveBeenCalledWith(2932, {}, "tok");
    expect(api.notifyJobCreated).toHaveBeenCalledWith("job-7");

    fireEvent.change(textarea, { target: { value: "Down 12%: https://transparent.city/c/sf." } });
    expect(screen.getByText("34/280")).toBeInTheDocument();
    const link = screen.getByRole("link", { name: "Post on X ↗" });
    expect(link).toHaveAttribute(
      "href",
      xReplyIntentUrl(DRAFT.tweet_id, "Down 12%: https://transparent.city/c/sf.")
    );
    expect(link).toHaveAttribute("target", "_blank");
  });

  it("keeps clicks, Enter, and Space from opening the post, but lets Escape through", async () => {
    const { rowClick, rowKeys } = renderInPostRow();

    const trigger = screen.getByRole("button", { name: "Reply with Seymour" });
    fireEvent.keyDown(trigger, { key: "Enter" });
    fireEvent.click(trigger);
    fireEvent.keyDown(screen.getByLabelText(/Coach Seymour/), { key: " " });
    fireEvent.click(screen.getByRole("button", { name: "Write reply" }));
    const textarea = await screen.findByLabelText("Reply text");
    fireEvent.keyDown(textarea, { key: " " });
    fireEvent.keyDown(textarea, { key: "Enter" });
    fireEvent.click(textarea);
    fireEvent.click(screen.getByRole("button", { name: "View session" }));
    expect(screen.getByText("Session viewer s-1")).toBeInTheDocument();
    fireEvent.keyDown(textarea, { key: "Escape" });

    expect(rowClick).not.toHaveBeenCalled();
    expect(rowKeys).toEqual(["Escape"]);
  });

  it("shows why Seymour failed and lets the admin try again", async () => {
    api.getJob.mockResolvedValueOnce({
      status: "failed",
      error_message: "Seymour did not write a reply (session s-1)",
    });
    renderInPostRow();

    fireEvent.click(screen.getByRole("button", { name: "Reply with Seymour" }));
    fireEvent.click(screen.getByRole("button", { name: "Write reply" }));
    expect(
      await screen.findByText("Seymour did not write a reply (session s-1)")
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Write reply" }));
    expect(await screen.findByLabelText("Reply text")).toHaveValue(DRAFT.reply_text);
    expect(screen.queryByText(/did not write a reply/)).not.toBeInTheDocument();
  });

  it("sends the admin's coaching with the first draft", async () => {
    renderInPostRow();

    fireEvent.click(screen.getByRole("button", { name: "Reply with Seymour" }));
    const coaching = screen.getByLabelText(/Coach Seymour/);
    fireEvent.change(coaching, { target: { value: "  Ask how many conversions are built.  " } });
    fireEvent.keyDown(coaching, { key: "Enter" });

    await screen.findByLabelText("Reply text");
    expect(api.startCivicXReply).toHaveBeenCalledWith(
      2932,
      { coaching: "Ask how many conversions are built." },
      "tok"
    );
  });

  it("rewrites the draft as coached, starting from the admin's edits", async () => {
    renderInPostRow();
    fireEvent.click(screen.getByRole("button", { name: "Reply with Seymour" }));
    fireEvent.click(screen.getByRole("button", { name: "Write reply" }));
    const textarea = await screen.findByLabelText("Reply text");
    fireEvent.change(textarea, { target: { value: "Break-ins fell 12%." } });

    expect(screen.getByRole("button", { name: "Try again" })).toBeEnabled();
    fireEvent.change(screen.getByLabelText(/Coach Seymour/), { target: { value: "Friendlier" } });
    api.getJob.mockResolvedValueOnce({
      status: "completed",
      result: { ...DRAFT, reply_text: "Good news: break-ins fell 12%." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Rewrite" }));

    await waitFor(() => expect(textarea).toHaveValue("Good news: break-ins fell 12%."));
    expect(api.startCivicXReply).toHaveBeenLastCalledWith(
      2932,
      { coaching: "Friendlier", previousDraft: "Break-ins fell 12%." },
      "tok"
    );
    expect(screen.getByLabelText(/Coach Seymour/)).toHaveValue("");
  });

  it("tries again with the last coaching once the box is empty", async () => {
    renderInPostRow();
    fireEvent.click(screen.getByRole("button", { name: "Reply with Seymour" }));
    fireEvent.change(screen.getByLabelText(/Coach Seymour/), { target: { value: "Ask about rents" } });
    fireEvent.click(screen.getByRole("button", { name: "Write reply" }));
    await screen.findByLabelText("Reply text");

    expect(screen.getByLabelText(/Coach Seymour/)).toHaveValue("");
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));

    await waitFor(() => expect(api.startCivicXReply).toHaveBeenCalledTimes(2));
    expect(api.startCivicXReply).toHaveBeenLastCalledWith(
      2932,
      { coaching: "Ask about rents" },
      "tok"
    );
  });

  it("ignores Seymour's reply after the admin cancels", async () => {
    api.getJob.mockResolvedValueOnce({ status: "running" });
    renderInPostRow();
    fireEvent.click(screen.getByRole("button", { name: "Reply with Seymour" }));
    fireEvent.click(screen.getByRole("button", { name: "Write reply" }));
    await screen.findByRole("button", { name: "Seymour is writing…" });

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await act(() => vi.advanceTimersByTimeAsync(2000));

    expect(screen.getByRole("button", { name: "Reply with Seymour" })).toBeInTheDocument();
    expect(screen.queryByLabelText("Reply text")).not.toBeInTheDocument();
  });

  it("discards the draft", async () => {
    renderInPostRow();

    fireEvent.click(screen.getByRole("button", { name: "Reply with Seymour" }));
    fireEvent.click(screen.getByRole("button", { name: "Write reply" }));
    await screen.findByLabelText("Reply text");
    fireEvent.click(screen.getByRole("button", { name: "Discard" }));

    await waitFor(() => expect(screen.queryByLabelText("Reply text")).not.toBeInTheDocument());
    expect(screen.getByRole("button", { name: "Reply with Seymour" })).toBeEnabled();
  });

  it("shows the picture X will put under a chart or map link", async () => {
    api.getJob.mockResolvedValue({
      status: "completed",
      result: { ...DRAFT, reply_text: "Down 71%: https://transparent.city/t/147322?period=ytd" },
    });
    renderInPostRow();
    fireEvent.click(screen.getByRole("button", { name: "Reply with Seymour" }));
    fireEvent.click(screen.getByRole("button", { name: "Write reply" }));
    const textarea = await screen.findByLabelText("Reply text");

    const picture = screen.getByAltText("Picture X shows under the reply");
    expect(picture).toHaveAttribute("src", "/t/147322/card-image");
    fireEvent.error(picture);
    expect(screen.getByText(/didn't load, so X may show the reply without one/)).toBeInTheDocument();

    fireEvent.change(textarea, { target: { value: "Mapped: https://transparent.city/m/zc0iwY9h" } });
    expect(screen.getByAltText("Picture X shows under the reply")).toHaveAttribute(
      "src",
      "/m/zc0iwY9h/card-image"
    );
    expect(screen.queryByText(/didn't load/)).not.toBeInTheDocument();

    fireEvent.change(textarea, { target: { value: "No link now." } });
    expect(screen.queryByAltText("Picture X shows under the reply")).not.toBeInTheDocument();
  });
});

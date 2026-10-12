import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import SessionHeader from "./SessionHeader";
import type { SessionStats } from "@/lib/apiClient";

const stats: SessionStats = {
  session_id: "s1",
  total_tokens_used: 12300,
  llm_call_count: 4,
  total_execution_time_ms: 102000,
  model_key: "claude-sonnet-5.5",
  last_message_at: null,
  created_at: "2026-10-12T00:00:00Z",
  estimated_cost_usd: 0.031,
};

describe("SessionHeader", () => {
  it("shows the conversation title, with a fallback before the session is saved", () => {
    const { rerender } = render(
      <SessionHeader sessionId={null} title={null} stats={null} model="claude-sonnet-5.5" />,
    );
    expect(screen.getByText("New conversation")).toBeInTheDocument();

    rerender(
      <SessionHeader
        sessionId="s1"
        title="Illegal dumping, District 10"
        stats={stats}
        model="claude-sonnet-5.5"
      />,
    );
    expect(screen.getByText("Illegal dumping, District 10")).toBeInTheDocument();
  });

  it("shows no title while a session is loading instead of the fallback", () => {
    render(
      <SessionHeader sessionId="s1" title={null} isLoading stats={null} model="claude-sonnet-5.5" />,
    );
    expect(screen.queryByText("New conversation")).not.toBeInTheDocument();
  });

  it("keeps model and usage stats behind the options menu", () => {
    render(<SessionHeader sessionId="s1" title="t" stats={stats} model="claude-sonnet-5.5" />);
    expect(screen.queryByText(/12\.3k tokens/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByLabelText("Conversation options"));
    expect(screen.getByRole("menu")).toBeInTheDocument();
    expect(screen.getByText("Claude Sonnet 5.5")).toBeInTheDocument();
    expect(screen.getByText("12.3k tokens · 4 calls · 1m 42s")).toBeInTheDocument();
    expect(screen.getByText("Estimated cost $0.031")).toBeInTheDocument();
  });

  it("copies the link from the header and the whole conversation from the menu", () => {
    const onCopyLink = vi.fn();
    const onCopyConversation = vi.fn();
    render(
      <SessionHeader
        sessionId="s1"
        title="t"
        stats={stats}
        model="claude-sonnet-5.5"
        onCopyLink={onCopyLink}
        onCopyConversation={onCopyConversation}
      />,
    );

    fireEvent.click(screen.getByLabelText("Copy link to this conversation"));
    expect(onCopyLink).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByLabelText("Conversation options"));
    fireEvent.click(screen.getByRole("menuitem", { name: "Copy whole conversation" }));
    expect(onCopyConversation).toHaveBeenCalledTimes(1);
  });

  it("closes the menu on Escape", () => {
    render(<SessionHeader sessionId="s1" title="t" stats={stats} model="claude-sonnet-5.5" />);
    fireEvent.click(screen.getByLabelText("Conversation options"));
    expect(screen.getByRole("menu")).toBeInTheDocument();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("disables link actions until the session exists", () => {
    render(<SessionHeader sessionId={null} title={null} stats={null} model="claude-sonnet-5.5" />);
    expect(screen.getByLabelText("Copy link to this conversation")).toBeDisabled();
  });
});

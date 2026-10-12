import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import ReplyActivity, { formatDuration, type ActivityStep } from "./ReplyActivity";

const finishedSteps: ActivityStep[] = [
  { kind: "thinking", content: "Need the District 10 metric id.", isStreaming: false },
  {
    kind: "tool",
    toolName: "get_metric_data",
    toolCall: { tool_id: "t1", tool_name: "get_metric_data", success: true, response: "{}" },
    running: false,
  },
];

describe("formatDuration", () => {
  it("formats seconds and minutes", () => {
    expect(formatDuration(42000)).toBe("42s");
    expect(formatDuration(102000)).toBe("1m 42s");
  });
});

describe("ReplyActivity", () => {
  it("shows live progress, expanded, while the reply streams", () => {
    render(
      <ReplyActivity
        isStreaming
        activity="Looking up metric data"
        elapsedMs={12000}
        steps={[
          { kind: "thinking", content: "Need the metric id.", isStreaming: false },
          { kind: "tool", toolName: "get_metric_data", toolCall: null, running: true },
        ]}
      />,
    );
    const status = screen.getByRole("status");
    expect(status).toHaveTextContent("Looking up metric data");
    expect(status).toHaveTextContent("12s");
    expect(screen.getByRole("button", { name: /Looking up metric data/ })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("Looking up metric data", { selector: "div" })).toBeInTheDocument();
  });

  it("collapses to a summary once done and expands on click", () => {
    render(<ReplyActivity isStreaming={false} elapsedMs={42000} steps={finishedSteps} />);
    const header = screen.getByRole("button", { name: /Worked for 42s · 2 steps/ });
    expect(header).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("Looked up metric data")).not.toBeInTheDocument();

    fireEvent.click(header);
    expect(screen.getByText("Looked up metric data")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /thought/i })).toBeInTheDocument();
  });

  it("leaves the duration out when it is unknown or under a second", () => {
    render(<ReplyActivity isStreaming={false} elapsedMs={300} steps={finishedSteps} />);
    expect(screen.getByRole("button", { name: "2 steps" })).toBeInTheDocument();
  });

  it("renders nothing for a finished reply with no steps", () => {
    const { container } = render(<ReplyActivity isStreaming={false} steps={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows a status line with no toggle while streaming before any step", () => {
    render(<ReplyActivity isStreaming activity="Thinking" elapsedMs={2000} steps={[]} />);
    expect(screen.getByRole("status")).toHaveTextContent("Thinking");
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});

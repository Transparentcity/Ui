import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import ThinkingTrace from "./ThinkingTrace";

describe("ThinkingTrace", () => {
  it("expands while streaming and shows the thinking text", () => {
    render(
      <ThinkingTrace content="Need the Kansas City metric id." isStreaming />
    );

    expect(screen.getByRole("button", { name: /thinking/i })).toHaveAttribute(
      "aria-expanded",
      "true"
    );
    expect(
      screen.getByText("Need the Kansas City metric id.")
    ).toBeInTheDocument();
  });

  it("collapses after the stream ends until the user opens it", () => {
    const { rerender } = render(
      <ThinkingTrace content="Looked up freshness." isStreaming />
    );
    rerender(<ThinkingTrace content="Looked up freshness." />);

    const toggle = screen.getByRole("button", { name: /thought/i });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("Looked up freshness.")).not.toBeInTheDocument();

    fireEvent.click(toggle);
    expect(screen.getByText("Looked up freshness.")).toBeInTheDocument();
  });
});

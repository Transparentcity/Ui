import { render, screen } from "@testing-library/react";

import { SeverityBadge } from "@/components/waste/severity-badge";

describe("SeverityBadge", () => {
  it("renders the severity label", () => {
    render(<SeverityBadge severity="critical" />);
    expect(screen.getByText("critical")).toBeInTheDocument();
  });

  it("applies critical styling (red)", () => {
    render(<SeverityBadge severity="critical" />);
    const badge = screen.getByText("critical");
    expect(badge.className).toContain("bg-red-100");
    expect(badge.className).toContain("text-red-800");
  });

  it("applies high styling (orange)", () => {
    render(<SeverityBadge severity="high" />);
    const badge = screen.getByText("high");
    expect(badge.className).toContain("bg-orange-100");
    expect(badge.className).toContain("text-orange-800");
  });

  it("applies medium styling (yellow)", () => {
    render(<SeverityBadge severity="medium" />);
    const badge = screen.getByText("medium");
    expect(badge.className).toContain("bg-yellow-100");
  });

  it("applies low styling (blue)", () => {
    render(<SeverityBadge severity="low" />);
    const badge = screen.getByText("low");
    expect(badge.className).toContain("bg-blue-100");
  });

  it("applies info styling (gray) for info severity", () => {
    render(<SeverityBadge severity="info" />);
    const badge = screen.getByText("info");
    expect(badge.className).toContain("bg-gray-100");
  });

  it("falls back to info styling for unknown severity values", () => {
    render(<SeverityBadge severity="unknown" />);
    const badge = screen.getByText("unknown");
    expect(badge.className).toContain("bg-gray-100");
  });

  it("is case-insensitive (uppercase maps correctly)", () => {
    render(<SeverityBadge severity="CRITICAL" />);
    const badge = screen.getByText("CRITICAL");
    expect(badge.className).toContain("bg-red-100");
  });

  it("merges custom className", () => {
    render(<SeverityBadge severity="high" className="my-custom" />);
    const badge = screen.getByText("high");
    expect(badge.className).toContain("my-custom");
  });

  it("renders as an inline-flex span element", () => {
    render(<SeverityBadge severity="low" />);
    const badge = screen.getByText("low");
    expect(badge.tagName).toBe("SPAN");
    expect(badge.className).toContain("inline-flex");
  });
});

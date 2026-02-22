import { render, screen } from "@testing-library/react";

import { ScoreBar } from "@/components/waste/score-bar";

describe("ScoreBar", () => {
  it("renders the numeric label by default", () => {
    render(<ScoreBar score={75} />);
    expect(screen.getByText("75")).toBeInTheDocument();
  });

  it("hides the label when showLabel is false", () => {
    render(<ScoreBar score={75} showLabel={false} />);
    expect(screen.queryByText("75")).not.toBeInTheDocument();
  });

  it("clamps score to 0 minimum", () => {
    render(<ScoreBar score={-10} />);
    expect(screen.getByText("0")).toBeInTheDocument();
  });

  it("clamps score to 100 maximum", () => {
    render(<ScoreBar score={150} />);
    expect(screen.getByText("100")).toBeInTheDocument();
  });

  it("rounds fractional scores in the label", () => {
    render(<ScoreBar score={42.7} />);
    expect(screen.getByText("43")).toBeInTheDocument();
  });

  it("applies red color for scores >= 80", () => {
    const { container } = render(<ScoreBar score={85} />);
    const bar = container.querySelector("[style]");
    expect(bar?.className).toContain("bg-red-500");
  });

  it("applies orange color for scores 60-79", () => {
    const { container } = render(<ScoreBar score={65} />);
    const bar = container.querySelector("[style]");
    expect(bar?.className).toContain("bg-orange-500");
  });

  it("applies yellow color for scores 40-59", () => {
    const { container } = render(<ScoreBar score={45} />);
    const bar = container.querySelector("[style]");
    expect(bar?.className).toContain("bg-yellow-500");
  });

  it("applies blue color for scores 20-39", () => {
    const { container } = render(<ScoreBar score={25} />);
    const bar = container.querySelector("[style]");
    expect(bar?.className).toContain("bg-blue-500");
  });

  it("applies gray color for scores < 20", () => {
    const { container } = render(<ScoreBar score={10} />);
    const bar = container.querySelector("[style]");
    expect(bar?.className).toContain("bg-gray-400");
  });

  it("sets correct width style on the bar element", () => {
    const { container } = render(<ScoreBar score={60} />);
    const bar = container.querySelector("[style]") as HTMLElement;
    expect(bar?.style.width).toBe("60%");
  });

  it("merges custom className on the container", () => {
    const { container } = render(<ScoreBar score={50} className="w-full" />);
    expect(container.firstChild).toHaveClass("w-full");
  });
});

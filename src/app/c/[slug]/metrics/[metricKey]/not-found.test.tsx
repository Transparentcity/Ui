import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import MetricNotFound from "./not-found";

// Stub Next.js Link
vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    className,
  }: {
    href: string;
    children: React.ReactNode;
    className?: string;
  }) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
}));

// Stub CitySignupButton
vi.mock("../../CitySignupButton", () => ({
  default: () => <div data-testid="signup-button" />,
}));

// Stub CSS imports
vi.mock("@/app/landing.css", () => ({}));
vi.mock("./styles.css", () => ({}));

describe("MetricNotFound", () => {
  beforeEach(() => {
    // Reset location for each test
    Object.defineProperty(window, "location", {
      value: { pathname: "/c/san-francisco/metrics/crime-rate" },
      writable: true,
    });
  });

  it("renders the not-found heading", () => {
    render(<MetricNotFound />);
    expect(screen.getByText("Metric not found")).toBeInTheDocument();
  });

  it("shows explanatory text about missing metric", () => {
    render(<MetricNotFound />);
    expect(
      screen.getByText(/doesn.t exist or isn.t available/),
    ).toBeInTheDocument();
  });

  it("parses city slug from URL and builds back link", async () => {
    render(<MetricNotFound />);
    // Wait for useEffect
    await vi.waitFor(() => {
      const backLinks = screen.getAllByText(/Back to San Francisco/);
      expect(backLinks.length).toBeGreaterThan(0);
      expect(backLinks[0].closest("a")).toHaveAttribute(
        "href",
        "/c/san-francisco",
      );
    });
  });

  it("falls back to sitemap link when city slug is not parseable", async () => {
    Object.defineProperty(window, "location", {
      value: { pathname: "/some/other/path" },
      writable: true,
    });
    render(<MetricNotFound />);
    // Initial render before useEffect; should show fallback
    const backLinks = screen.getAllByText(/Back to this city/);
    expect(backLinks[0].closest("a")).toHaveAttribute("href", "/sitemap");
  });

  it("converts slug to title case city name", async () => {
    Object.defineProperty(window, "location", {
      value: { pathname: "/c/new-york/metrics/crime-rate" },
      writable: true,
    });
    render(<MetricNotFound />);
    await vi.waitFor(() => {
      expect(screen.getAllByText(/Back to New York/).length).toBeGreaterThan(0);
    });
  });

  it("renders the transparent.city logo", () => {
    render(<MetricNotFound />);
    expect(screen.getByText("transparent")).toBeInTheDocument();
    expect(screen.getByText(".city")).toBeInTheDocument();
  });
});

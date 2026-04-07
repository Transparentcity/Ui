import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import MetricLink from "./MetricLink";

// Stub Next.js Link as a plain anchor
vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    className,
    onClick,
  }: {
    href: string;
    children: React.ReactNode;
    className?: string;
    onClick?: React.MouseEventHandler;
  }) => (
    <a href={href} className={className} onClick={onClick}>
      {children}
    </a>
  ),
}));

// Stub CSS module
vi.mock("./feed.module.css", () => ({
  default: {
    metricLink: "metricLink",
    metricLinkPlain: "metricLinkPlain",
    metricIndicator: "metricIndicator",
  },
}));

describe("MetricLink", () => {
  it("renders a link when metricKey and citySlug are provided", () => {
    render(
      <MetricLink
        label="Crime Rate"
        metricKey="crime-rate"
        citySlug="san-francisco"
      />,
    );
    const link = screen.getByRole("link", { name: /Crime Rate/ });
    expect(link).toHaveAttribute(
      "href",
      "/c/san-francisco/metrics/crime-rate",
    );
  });

  it("renders plain text when metricKey is missing", () => {
    render(<MetricLink label="Unknown Metric" citySlug="san-francisco" />);
    expect(screen.queryByRole("link")).toBeNull();
    expect(screen.getByText("Unknown Metric")).toBeInTheDocument();
  });

  it("renders plain text when citySlug is missing", () => {
    render(<MetricLink label="Crime Rate" metricKey="crime-rate" />);
    expect(screen.queryByRole("link")).toBeNull();
    expect(screen.getByText("Crime Rate")).toBeInTheDocument();
  });

  it("renders plain text when both metricKey and citySlug are null", () => {
    render(
      <MetricLink
        label="Something"
        metricKey={null}
        citySlug={null}
      />,
    );
    expect(screen.queryByRole("link")).toBeNull();
    expect(screen.getByText("Something")).toBeInTheDocument();
  });

  it("appends district query param when district > 0", () => {
    render(
      <MetricLink
        label="Response Time"
        metricKey="response-time"
        citySlug="san-francisco"
        district={6}
      />,
    );
    const link = screen.getByRole("link", { name: /Response Time/ });
    expect(link).toHaveAttribute(
      "href",
      "/c/san-francisco/metrics/response-time?district=6",
    );
  });

  it("omits district query param when district is 0", () => {
    render(
      <MetricLink
        label="Response Time"
        metricKey="response-time"
        citySlug="san-francisco"
        district={0}
      />,
    );
    const link = screen.getByRole("link", { name: /Response Time/ });
    expect(link).toHaveAttribute(
      "href",
      "/c/san-francisco/metrics/response-time",
    );
  });

  it("omits district query param when district is null", () => {
    render(
      <MetricLink
        label="Response Time"
        metricKey="response-time"
        citySlug="san-francisco"
        district={null}
      />,
    );
    const link = screen.getByRole("link");
    expect(link.getAttribute("href")).not.toContain("district");
  });

  it("shows up-arrow indicator when direction is 'up'", () => {
    render(
      <MetricLink
        label="Crime"
        direction="up"
        metricKey="crime"
        citySlug="sf"
      />,
    );
    // U+2197 = ↗
    expect(screen.getByText("\u2197")).toBeInTheDocument();
  });

  it("shows down-arrow indicator when direction is 'down'", () => {
    render(
      <MetricLink
        label="Crime"
        direction="down"
        metricKey="crime"
        citySlug="sf"
      />,
    );
    // U+2198 = ↘
    expect(screen.getByText("\u2198")).toBeInTheDocument();
  });

  it("shows no arrow when direction is null", () => {
    render(
      <MetricLink
        label="Crime"
        direction={null}
        metricKey="crime"
        citySlug="sf"
      />,
    );
    expect(screen.queryByText("\u2197")).toBeNull();
    expect(screen.queryByText("\u2198")).toBeNull();
  });

  it("stops click propagation so card click handlers don't fire", () => {
    const outerClick = vi.fn();
    render(
      // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions
      <div onClick={outerClick}>
        <MetricLink
          label="Crime"
          metricKey="crime"
          citySlug="sf"
        />
      </div>,
    );
    screen.getByRole("link").click();
    expect(outerClick).not.toHaveBeenCalled();
  });
});

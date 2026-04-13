import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockUseAuth0 = vi.fn();

vi.mock("@auth0/auth0-react", () => ({
  useAuth0: () => mockUseAuth0(),
}));

// EmailSignInLink also calls useAuth0; stub it to a simple form so we can
// test CityHeroNewsletter's own auth gating independently.
vi.mock("./EmailSignInLink", () => ({
  default: ({ label }: { label?: string }) => (
    <form data-testid="email-signin">
      <span>{label}</span>
      <button type="submit">Sign up</button>
    </form>
  ),
}));

import CityHeroNewsletter from "./CityHeroNewsletter";

describe("CityHeroNewsletter", () => {
  beforeEach(() => {
    mockUseAuth0.mockReturnValue({
      isAuthenticated: false,
      isLoading: false,
      loginWithRedirect: vi.fn(),
    });
  });

  // ── Auth gating ──────────────────────────────────────────────

  it("renders nothing when user is authenticated", () => {
    mockUseAuth0.mockReturnValue({ isAuthenticated: true, isLoading: false });
    const { container } = render(
      <CityHeroNewsletter cityName="San Francisco" />,
    );
    expect(container.innerHTML).toBe("");
  });

  it("renders nothing when user is authenticated (withContainer)", () => {
    mockUseAuth0.mockReturnValue({ isAuthenticated: true, isLoading: false });
    const { container } = render(
      <CityHeroNewsletter cityName="San Francisco" withContainer />,
    );
    expect(container.innerHTML).toBe("");
  });

  // ── Default mode (no container) ──────────────────────────────

  it("renders EmailSignInLink for logged-out users", () => {
    render(<CityHeroNewsletter cityName="Oakland" />);
    expect(screen.getByTestId("email-signin")).toBeInTheDocument();
    expect(screen.getByText("To get updates for Oakland")).toBeInTheDocument();
  });

  it("passes custom label to EmailSignInLink", () => {
    render(<CityHeroNewsletter cityName="Oakland" label="Weekly Oakland data" />);
    expect(screen.getByText("Weekly Oakland data")).toBeInTheDocument();
  });

  // ── withContainer mode ───────────────────────────────────────

  it("renders heading and subtitle when withContainer is true", () => {
    render(
      <CityHeroNewsletter
        cityName="San Francisco"
        cityDisplay="San Francisco, CA"
        withContainer
      />,
    );
    expect(screen.getByText("Sign up now, get your first newsletter this week")).toBeInTheDocument();
    expect(
      screen.getByText(/San Francisco, CA.+public data, explained/),
    ).toBeInTheDocument();
    expect(screen.getByTestId("email-signin")).toBeInTheDocument();
  });

  it("falls back to cityName when cityDisplay is not provided", () => {
    render(
      <CityHeroNewsletter cityName="Oakland" withContainer />,
    );
    expect(screen.getByText(/Oakland.+public data, explained/)).toBeInTheDocument();
  });

  it("includes the subscribe form inside the container", () => {
    render(
      <CityHeroNewsletter cityName="Oakland" withContainer />,
    );
    expect(screen.getByRole("button", { name: /sign up/i })).toBeInTheDocument();
  });

  it("uses custom containerHeading and containerSubtitle", () => {
    render(
      <CityHeroNewsletter
        cityName="Oakland"
        withContainer
        containerHeading="Get this in your inbox every week"
        containerSubtitle="Sign up to receive Oakland's weekly briefing."
      />,
    );
    expect(screen.getByText("Get this in your inbox every week")).toBeInTheDocument();
    expect(screen.getByText("Sign up to receive Oakland's weekly briefing.")).toBeInTheDocument();
    expect(screen.queryByText("Sign up now, get your first newsletter this week")).not.toBeInTheDocument();
  });
});

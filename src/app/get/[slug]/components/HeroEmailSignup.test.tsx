import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import HeroEmailSignup from "./HeroEmailSignup";

const mockLoginWithRedirect = vi.fn();

vi.mock("@auth0/auth0-react", () => ({
  useAuth0: () => ({
    loginWithRedirect: mockLoginWithRedirect,
  }),
}));

vi.mock("@/lib/analytics", () => ({
  trackSignupStart: vi.fn(),
  trackSignupClick: vi.fn(),
  getFunnelSessionId: vi.fn(() => "test-session-id"),
  recordFunnelEventBackend: vi.fn(),
}));

const defaultProps = {
  citySlug: "cincinnati",
  cityName: "Cincinnati",
  cityId: 1,
};

describe("HeroEmailSignup (magic-link hidden)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLoginWithRedirect.mockResolvedValue(undefined);
    vi.stubGlobal("localStorage", {
      getItem: vi.fn(),
      setItem: vi.fn(),
      removeItem: vi.fn(),
      clear: vi.fn(),
      length: 0,
      key: vi.fn(),
    });
  });

  it("renders the Sign up free button", () => {
    render(<HeroEmailSignup {...defaultProps} />);
    expect(screen.getByRole("button", { name: /sign up free/i })).toBeInTheDocument();
  });

  it("does not render an email text input", () => {
    render(<HeroEmailSignup {...defaultProps} />);
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(
      screen.queryByPlaceholderText(/enter your email/i),
    ).not.toBeInTheDocument();
  });

  it("opens Auth0 signup with correct city context when clicked", async () => {
    const user = userEvent.setup();
    render(<HeroEmailSignup {...defaultProps} />);

    await user.click(screen.getByRole("button", { name: /sign up free/i }));

    expect(mockLoginWithRedirect).toHaveBeenCalledWith(
      expect.objectContaining({
        authorizationParams: expect.objectContaining({
          screen_hint: "signup",
          action: "signup",
        }),
        appState: {
          returnTo:
            "/home?signup=resident&follow_city_slug=cincinnati&follow_city_name=Cincinnati&follow_city_id=1",
        },
      }),
    );
  });

  it("passes city_id in returnTo only when numeric cityId is provided", async () => {
    const user = userEvent.setup();
    render(<HeroEmailSignup citySlug="portland" cityName="Portland" />);

    await user.click(screen.getByRole("button", { name: /sign up free/i }));

    const call = mockLoginWithRedirect.mock.calls[0][0] as {
      appState: { returnTo: string };
    };
    expect(call.appState.returnTo).not.toContain("follow_city_id");
    expect(call.appState.returnTo).toContain("follow_city_slug=portland");
  });
});

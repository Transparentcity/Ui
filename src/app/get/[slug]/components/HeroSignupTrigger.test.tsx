import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import HeroSignupTrigger from "./HeroSignupTrigger";

const mockLoginWithRedirect = vi.fn();

vi.mock("@auth0/auth0-react", () => ({
  useAuth0: () => ({
    loginWithRedirect: mockLoginWithRedirect,
  }),
}));

vi.mock("@/app/c/[slug]/SignupEmailContext", () => ({
  useSignupEmail: () => ({ email: "", setEmail: vi.fn() }),
}));

vi.mock("@/lib/analytics", () => ({
  trackSignupStart: vi.fn(),
  trackSignupClick: vi.fn(),
  getFunnelSessionId: vi.fn(() => "test-session-id"),
  recordFunnelEventBackend: vi.fn(),
}));

const signupProps = {
  citySlug: "cincinnati",
  cityName: "Cincinnati",
  cityId: 1,
  returnTo: "/home?signup=resident",
  sourceSurface: "city_get_landing_hero_copy",
};

describe("HeroSignupTrigger", () => {
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

  it("opens Auth0 signup when hero copy is clicked", async () => {
    const user = userEvent.setup();
    render(
      <HeroSignupTrigger {...signupProps}>
        <h1>See Cincinnati clearly</h1>
      </HeroSignupTrigger>,
    );

    await user.click(screen.getByRole("heading", { name: /see cincinnati/i }));

    expect(mockLoginWithRedirect).toHaveBeenCalledWith(
      expect.objectContaining({
        authorizationParams: expect.objectContaining({
          screen_hint: "signup",
        }),
      }),
    );
  });
});

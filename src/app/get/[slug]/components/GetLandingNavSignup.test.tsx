import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import GetLandingNavSignup from "./GetLandingNavSignup";

const mockLoginWithRedirect = vi.fn();

vi.mock("@auth0/auth0-react", () => ({
  useAuth0: () => ({
    isLoading: false,
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

describe("GetLandingNavSignup", () => {
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

  it("redirects to Auth0 signup on Sign up click without focusing the hero email field", async () => {
    const focusSpy = vi.spyOn(HTMLInputElement.prototype, "focus");
    const user = userEvent.setup();

    render(
      <GetLandingNavSignup
        citySlug="cincinnati"
        cityName="Cincinnati"
        cityId={1}
        overrideReturnPath="/home?signup=resident&follow_city_slug=cincinnati"
      />,
    );

    await user.click(screen.getByRole("button", { name: /sign up/i }));

    expect(mockLoginWithRedirect).toHaveBeenCalledWith(
      expect.objectContaining({
        authorizationParams: expect.objectContaining({
          screen_hint: "signup",
          action: "signup",
        }),
        appState: {
          returnTo: "/home?signup=resident&follow_city_slug=cincinnati",
        },
      }),
    );
    expect(focusSpy).not.toHaveBeenCalled();
    focusSpy.mockRestore();
  });
});

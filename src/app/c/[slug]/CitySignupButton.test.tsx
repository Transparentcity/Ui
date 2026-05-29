import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import CitySignupButton from "./CitySignupButton";

const mockLoginWithRedirect = vi.fn();
const mockPush = vi.fn();

vi.mock("@auth0/auth0-react", () => ({
  useAuth0: () => ({
    isAuthenticated: false,
    isLoading: false,
    loginWithRedirect: mockLoginWithRedirect,
  }),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}));

let mockPrefillEmail = "";
vi.mock("./SignupEmailContext", () => ({
  useSignupEmail: () => ({
    email: mockPrefillEmail,
    setEmail: vi.fn(),
  }),
}));

vi.mock("@/lib/analytics", () => ({
  trackSignupStart: vi.fn(),
  trackSignupClick: vi.fn(),
  trackLogin: vi.fn(),
  getFunnelSessionId: vi.fn(() => "test-session-id"),
  recordFunnelEventBackend: vi.fn(),
}));

describe("CitySignupButton", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLoginWithRedirect.mockResolvedValue(undefined);
    mockPrefillEmail = "";
    const store: Record<string, string> = {};
    vi.stubGlobal("localStorage", {
      getItem: vi.fn((key: string) => store[key] ?? null),
      setItem: vi.fn((key: string, value: string) => { store[key] = value; }),
      removeItem: vi.fn((key: string) => { delete store[key]; }),
      clear: vi.fn(() => { Object.keys(store).forEach(k => delete store[k]); }),
      length: 0,
      key: vi.fn(),
    });
  });

  it("renders sign in and sign up buttons", () => {
    render(<CitySignupButton />);
    expect(screen.getByRole("button", { name: /sign in/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /sign up/i })).toBeInTheDocument();
  });

  describe("sign up flow", () => {
    it("redirects directly to Auth0 signup on click", async () => {
      const user = userEvent.setup();
      render(<CitySignupButton />);
      await user.click(screen.getByRole("button", { name: /sign up/i }));

      expect(mockLoginWithRedirect).toHaveBeenCalledWith(
        expect.objectContaining({
          authorizationParams: expect.objectContaining({
            screen_hint: "signup",
            prompt: "login",
            action: "signup",
          }),
          appState: { returnTo: "/home?signup=resident" },
        })
      );
    });

    it("stores signup intent in localStorage", async () => {
      const user = userEvent.setup();
      render(<CitySignupButton />);
      await user.click(screen.getByRole("button", { name: /sign up/i }));

      expect(window.localStorage.setItem).toHaveBeenCalledWith(
        "transparentcity.signup_intent",
        "resident"
      );
    });

    it("stores follow_city info in localStorage when city props provided", async () => {
      const user = userEvent.setup();
      render(<CitySignupButton citySlug="san-francisco" cityName="San Francisco" cityId={42} />);
      await user.click(screen.getByRole("button", { name: /sign up/i }));

      expect(window.localStorage.setItem).toHaveBeenCalledWith(
        "transparentcity.follow_city_slug",
        "san-francisco"
      );
      expect(window.localStorage.setItem).toHaveBeenCalledWith(
        "transparentcity.follow_city_name",
        "San Francisco"
      );
      expect(window.localStorage.setItem).toHaveBeenCalledWith(
        "transparentcity.follow_city_id",
        "42"
      );
      expect(mockLoginWithRedirect).toHaveBeenCalledWith(
        expect.objectContaining({
          appState: {
            returnTo: expect.stringContaining("follow_city_id=42"),
          },
        })
      );
    });

    it("prefills email from context in signup flow", async () => {
      mockPrefillEmail = "shared@example.com";
      const user = userEvent.setup();
      render(<CitySignupButton />);
      await user.click(screen.getByRole("button", { name: /sign up/i }));

      expect(mockLoginWithRedirect).toHaveBeenCalledWith(
        expect.objectContaining({
          authorizationParams: expect.objectContaining({
            screen_hint: "signup",
            prompt: "login",
            action: "signup",
            login_hint: "shared@example.com",
          }),
        })
      );
    });
  });

  describe("sign in flow", () => {
    it("calls loginWithRedirect with login screen hint", async () => {
      const user = userEvent.setup();
      render(<CitySignupButton />);
      await user.click(screen.getByRole("button", { name: /sign in/i }));

      expect(mockLoginWithRedirect).toHaveBeenCalledWith(
        expect.objectContaining({
          authorizationParams: expect.objectContaining({
            screen_hint: "login",
            prompt: "login",
          }),
          appState: { returnTo: "/home" },
        })
      );
    });

    it("prefills email from context in sign-in flow", async () => {
      mockPrefillEmail = "returning@example.com";
      const user = userEvent.setup();
      render(<CitySignupButton />);
      await user.click(screen.getByRole("button", { name: /sign in/i }));

      expect(mockLoginWithRedirect).toHaveBeenCalledWith(
        expect.objectContaining({
          authorizationParams: expect.objectContaining({
            login_hint: "returning@example.com",
          }),
        })
      );
    });

    it("does not prefill invalid email in sign-in flow", async () => {
      mockPrefillEmail = "not-valid";
      const user = userEvent.setup();
      render(<CitySignupButton />);
      await user.click(screen.getByRole("button", { name: /sign in/i }));

      const callArgs = mockLoginWithRedirect.mock.calls[0][0];
      expect(callArgs.authorizationParams.login_hint).toBeUndefined();
    });
  });
});

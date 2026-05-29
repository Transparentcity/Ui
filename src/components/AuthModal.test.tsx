/**
 * AuthModal onboarding tests.
 * Verifies the signup/login entry point renders fast and redirects to Auth0 signup.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import AuthModal from "./AuthModal";

const mockLoginWithRedirect = vi.fn().mockResolvedValue(undefined);
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

vi.mock("@/lib/analytics", () => ({
  trackLogin: vi.fn(),
  trackSignupStart: vi.fn(),
  trackSignupClick: vi.fn(),
  getFunnelSessionId: vi.fn(() => "test-session-id"),
  recordFunnelEventBackend: vi.fn(),
}));

vi.mock("@/lib/useFocusTrap", () => ({
  useFocusTrap: () => ({ current: null }),
}));

describe("AuthModal", () => {
  const onClose = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    const store: Record<string, string> = {};
    vi.stubGlobal("localStorage", {
      getItem: vi.fn((k: string) => store[k] ?? null),
      setItem: vi.fn((k: string, v: string) => { store[k] = v; }),
      removeItem: vi.fn(),
      clear: vi.fn(),
      length: 0,
      key: vi.fn(),
    });
  });

  it("renders immediately when open (no loading spinner)", () => {
    const start = performance.now();
    render(<AuthModal isOpen={true} onClose={onClose} />);
    const elapsed = performance.now() - start;

    expect(screen.getByText(/create your free account/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /sign in/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /sign up/i })).toBeInTheDocument();
    expect(elapsed).toBeLessThan(100);
  });

  it("does not render when closed", () => {
    render(<AuthModal isOpen={false} onClose={onClose} />);
    expect(screen.queryByText(/create your free account/i)).not.toBeInTheDocument();
  });

  it("stores signup intent in localStorage and redirects with signup screen hint", async () => {
    const user = userEvent.setup();
    render(<AuthModal isOpen={true} onClose={onClose} />);

    await user.click(screen.getByRole("button", { name: /^sign up$/i }));

    expect(localStorage.setItem).toHaveBeenCalledWith(
      "transparentcity.signup_intent",
      "resident"
    );
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

  it("closes on Escape key", async () => {
    const user = userEvent.setup();
    render(<AuthModal isOpen={true} onClose={onClose} />);

    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalled();
  });
});

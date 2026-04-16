/**
 * Regression tests: mobile top and bottom nav bars stay compact,
 * no buttons or text get clipped / cut off.
 */
import { render, screen, within } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock("@auth0/auth0-react", () => ({
  useAuth0: () => ({
    isAuthenticated: false,
    isLoading: false,
    loginWithRedirect: vi.fn(),
  }),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock("next/link", () => ({
  __esModule: true,
  default: ({ children, href, ...rest }: React.PropsWithChildren<{ href: string }>) => (
    <a href={href} {...rest}>{children}</a>
  ),
}));

vi.mock("@/lib/analytics", () => ({
  trackSignupStart: vi.fn(),
  trackSignupClick: vi.fn(),
  trackLogin: vi.fn(),
  getFunnelSessionId: vi.fn(() => "test-session"),
  recordFunnelEventBackend: vi.fn(),
}));

vi.mock("@/app/c/[slug]/SignupEmailContext", () => ({
  useSignupEmail: () => ({ email: "", setEmail: vi.fn() }),
}));

// ── Imports (after mocks) ────────────────────────────────────────────────────

import CitySignupButton from "@/app/c/[slug]/CitySignupButton";
import PublicNavBar from "./PublicNavBar";
import MobileBottomNav from "./MobileBottomNav";
import MobileCitySignupBar from "@/app/c/[slug]/MobileCitySignupBar";

// ── Helpers ──────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  const store: Record<string, string> = {};
  vi.stubGlobal("localStorage", {
    getItem: vi.fn((k: string) => store[k] ?? null),
    setItem: vi.fn((k: string, v: string) => { store[k] = v; }),
    removeItem: vi.fn((k: string) => { delete store[k]; }),
    clear: vi.fn(),
    length: 0,
    key: vi.fn(),
  });
  vi.stubGlobal("sessionStorage", {
    getItem: vi.fn(() => null),
    setItem: vi.fn(),
    removeItem: vi.fn(),
    clear: vi.fn(),
    length: 0,
    key: vi.fn(),
  });
});

// ── Top nav (PublicNavBar + CitySignupButton) ────────────────────────────────

describe("Top nav (PublicNavBar + CitySignupButton)", () => {
  it("renders both Sign in and Sign up buttons", () => {
    render(
      <PublicNavBar>
        <CitySignupButton citySlug="los-angeles" cityName="Los Angeles" />
      </PublicNavBar>,
    );

    const signIn = screen.getByRole("button", { name: /sign in/i });
    const signUp = screen.getByRole("button", { name: /sign up/i });

    expect(signIn).toBeInTheDocument();
    expect(signUp).toBeInTheDocument();
  });

  it("sign in button text is not empty or truncated", () => {
    render(
      <PublicNavBar>
        <CitySignupButton citySlug="los-angeles" cityName="Los Angeles" />
      </PublicNavBar>,
    );

    const signIn = screen.getByRole("button", { name: /sign in/i });
    expect(signIn.textContent?.trim()).toBe("Sign in");
  });

  it("sign up button text is not empty or truncated", () => {
    render(
      <PublicNavBar>
        <CitySignupButton citySlug="los-angeles" cityName="Los Angeles" />
      </PublicNavBar>,
    );

    const signUp = screen.getByRole("button", { name: /sign up/i });
    expect(signUp.textContent?.trim()).toBe("Sign up");
  });

  it("nav-signup-wrapper contains exactly two buttons", () => {
    const { container } = render(
      <PublicNavBar>
        <CitySignupButton citySlug="los-angeles" cityName="Los Angeles" />
      </PublicNavBar>,
    );

    const wrapper = container.querySelector(".nav-signup-wrapper");
    expect(wrapper).toBeInTheDocument();

    const buttons = wrapper!.querySelectorAll("button");
    expect(buttons).toHaveLength(2);
  });

  it("both buttons use compact btn class (not btn-large)", () => {
    const { container } = render(
      <PublicNavBar>
        <CitySignupButton citySlug="los-angeles" cityName="Los Angeles" />
      </PublicNavBar>,
    );

    const wrapper = container.querySelector(".nav-signup-wrapper");
    const buttons = wrapper!.querySelectorAll("button");

    buttons.forEach((btn) => {
      expect(btn.className).toContain("btn");
      expect(btn.className).not.toContain("btn-large");
    });
  });

  it("sign in button has btn-outline class", () => {
    const { container } = render(
      <PublicNavBar>
        <CitySignupButton citySlug="los-angeles" cityName="Los Angeles" />
      </PublicNavBar>,
    );

    const signIn = container.querySelector(".btn-outline");
    expect(signIn).toBeInTheDocument();
    expect(signIn?.textContent?.trim()).toBe("Sign in");
  });

  it("brand link is present alongside buttons", () => {
    render(
      <PublicNavBar>
        <CitySignupButton citySlug="los-angeles" cityName="Los Angeles" />
      </PublicNavBar>,
    );

    expect(
      screen.getByRole("link", { name: /transparent\.city home/i }),
    ).toBeInTheDocument();
  });
});

// ── Bottom nav (MobileBottomNav) ─────────────────────────────────────────────

describe("MobileBottomNav", () => {
  it("renders all three tab buttons", () => {
    render(<MobileBottomNav activeTab="feed" onTabChange={vi.fn()} />);

    expect(screen.getByRole("button", { name: /feed/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /my places/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /more/i })).toBeInTheDocument();
  });

  it("each tab has a visible text label", () => {
    render(<MobileBottomNav activeTab="feed" onTabChange={vi.fn()} />);

    expect(screen.getByText("Feed")).toBeInTheDocument();
    expect(screen.getByText("My Places")).toBeInTheDocument();
    expect(screen.getByText("More")).toBeInTheDocument();
  });

  it("tab labels are not empty strings", () => {
    const { container } = render(
      <MobileBottomNav activeTab="feed" onTabChange={vi.fn()} />,
    );

    const labels = container.querySelectorAll("span");
    labels.forEach((label) => {
      expect(label.textContent?.trim().length).toBeGreaterThan(0);
    });
  });

  it("active tab gets aria-current=page", () => {
    render(<MobileBottomNav activeTab="my-places" onTabChange={vi.fn()} />);

    const myPlaces = screen.getByRole("button", { name: /my places/i });
    expect(myPlaces).toHaveAttribute("aria-current", "page");
  });

  it("nav has aria-label for accessibility", () => {
    render(<MobileBottomNav activeTab="feed" onTabChange={vi.fn()} />);

    expect(
      screen.getByRole("navigation", { name: /main navigation/i }),
    ).toBeInTheDocument();
  });
});

// ── Mobile signup bar ────────────────────────────────────────────────────────

describe("MobileCitySignupBar", () => {
  it("renders all three regions: dismiss, text, and CTA button", () => {
    render(
      <MobileCitySignupBar
        cityName="Los Angeles"
        citySlug="los-angeles"
      />,
    );

    // Dismiss button
    expect(
      screen.getByRole("button", { name: /dismiss/i }),
    ).toBeInTheDocument();

    // Title and subtitle text
    expect(screen.getByText("Get the Free Weekly")).toBeInTheDocument();
    expect(
      screen.getByText(/weekly data stories for los angeles/i),
    ).toBeInTheDocument();

    // CTA button
    expect(
      screen.getByRole("button", { name: /sign up/i }),
    ).toBeInTheDocument();
  });

  it("CTA button text is complete (not clipped)", () => {
    render(
      <MobileCitySignupBar
        cityName="Los Angeles"
        citySlug="los-angeles"
      />,
    );

    const cta = screen.getByRole("button", { name: /sign up/i });
    expect(cta.textContent?.trim()).toBe("Sign up");
  });

  it("bar title is complete (not clipped)", () => {
    render(
      <MobileCitySignupBar
        cityName="Los Angeles"
        citySlug="los-angeles"
      />,
    );

    expect(screen.getByText("Get the Free Weekly").textContent).toBe(
      "Get the Free Weekly",
    );
  });
});

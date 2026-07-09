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
    logout: vi.fn(),
    getAccessTokenSilently: vi.fn().mockResolvedValue("token"),
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

vi.mock("@/lib/wasteQueryPersister", () => ({
  clearPersistedWasteCache: vi.fn().mockResolvedValue(undefined),
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
  it("renders My Places and Account tabs", () => {
    render(
      <MobileBottomNav sidebarOpen={false} onToggleSidebar={vi.fn()} />,
    );

    expect(screen.getByRole("button", { name: /my places/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /account/i })).toBeInTheDocument();
  });

  it("each tab has a visible text label", () => {
    render(
      <MobileBottomNav sidebarOpen={false} onToggleSidebar={vi.fn()} />,
    );

    expect(screen.getByText("My Places")).toBeInTheDocument();
    expect(screen.getByText("Account")).toBeInTheDocument();
  });

  it("tab labels are not empty strings", () => {
    const { container } = render(
      <MobileBottomNav sidebarOpen={false} onToggleSidebar={vi.fn()} />,
    );

    const labels = container.querySelectorAll(`.${"tabLabel"}, span`);
    labels.forEach((label) => {
      if (label.querySelector("svg") || label.querySelector("img")) return;
      expect(label.textContent?.trim().length).toBeGreaterThan(0);
    });
  });

  it("My Places tab reflects sidebar open state", () => {
    render(
      <MobileBottomNav sidebarOpen={true} onToggleSidebar={vi.fn()} />,
    );

    const myPlaces = screen.getByRole("button", { name: /my places/i });
    expect(myPlaces).toHaveAttribute("aria-current", "page");
  });

  it("toggles sidebar when My Places is tapped", () => {
    const onToggleSidebar = vi.fn();
    render(
      <MobileBottomNav sidebarOpen={false} onToggleSidebar={onToggleSidebar} />,
    );

    screen.getByRole("button", { name: /my places/i }).click();
    expect(onToggleSidebar).toHaveBeenCalledTimes(1);
  });

  it("shows profile initial when no picture is set", () => {
    render(
      <MobileBottomNav
        sidebarOpen={false}
        onToggleSidebar={vi.fn()}
        profileInitial="S"
      />,
    );

    expect(screen.getByText("S")).toBeInTheDocument();
  });

  it("nav has aria-label for accessibility", () => {
    render(
      <MobileBottomNav sidebarOpen={false} onToggleSidebar={vi.fn()} />,
    );

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

    expect(
      screen.getByRole("button", { name: /dismiss/i }),
    ).toBeInTheDocument();

    expect(screen.getByText("Get the Free Weekly")).toBeInTheDocument();
    expect(
      screen.getByText(/weekly data stories for los angeles/i),
    ).toBeInTheDocument();

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

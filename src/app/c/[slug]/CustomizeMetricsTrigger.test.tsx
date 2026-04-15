import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import CustomizeMetricsTrigger from "./CustomizeMetricsTrigger";

const mockLoginWithRedirect = vi.fn();

vi.mock("@auth0/auth0-react", () => ({
  useAuth0: () => ({
    isAuthenticated: false,
    isLoading: false,
    loginWithRedirect: mockLoginWithRedirect,
  }),
}));

describe("CustomizeMetricsTrigger (logged out)", () => {
  let store: Record<string, string>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockLoginWithRedirect.mockResolvedValue(undefined);
    store = {};
    vi.stubGlobal("localStorage", {
      getItem: vi.fn((key: string) => store[key] ?? null),
      setItem: vi.fn((key: string, value: string) => { store[key] = value; }),
      removeItem: vi.fn((key: string) => { delete store[key]; }),
      clear: vi.fn(),
      length: 0,
      key: vi.fn(),
    });
  });

  it("renders signup button when logged out", () => {
    render(<CustomizeMetricsTrigger cityId={42} cityName="Boston" metrics={[]} />);
    expect(screen.getByRole("button", { name: /sign up to customize/i })).toBeInTheDocument();
  });

  it("stores signup_intent in localStorage", async () => {
    const user = userEvent.setup();
    render(<CustomizeMetricsTrigger cityId={42} cityName="Boston" metrics={[]} />);
    await user.click(screen.getByRole("button"));

    expect(window.localStorage.setItem).toHaveBeenCalledWith(
      "transparentcity.signup_intent", "resident"
    );
  });

  it("stores follow_city_id and follow_city_name in localStorage", async () => {
    const user = userEvent.setup();
    render(<CustomizeMetricsTrigger cityId={42} cityName="Boston" metrics={[]} />);
    await user.click(screen.getByRole("button"));

    expect(window.localStorage.setItem).toHaveBeenCalledWith(
      "transparentcity.follow_city_id", "42"
    );
    expect(window.localStorage.setItem).toHaveBeenCalledWith(
      "transparentcity.follow_city_name", "Boston"
    );
  });

  it("stores follow_city_slug when provided", async () => {
    const user = userEvent.setup();
    render(<CustomizeMetricsTrigger cityId={42} cityName="Boston" citySlug="boston" metrics={[]} />);
    await user.click(screen.getByRole("button"));

    expect(window.localStorage.setItem).toHaveBeenCalledWith(
      "transparentcity.follow_city_slug", "boston"
    );
  });

  it("redirects to /home with signup and follow_city params", async () => {
    const user = userEvent.setup();
    render(<CustomizeMetricsTrigger cityId={42} cityName="Boston" citySlug="boston" metrics={[]} />);
    await user.click(screen.getByRole("button"));

    const returnTo = mockLoginWithRedirect.mock.calls[0][0].appState.returnTo;
    expect(returnTo).toMatch(/^\/home\?/);
    expect(returnTo).toContain("signup=resident");
    expect(returnTo).toContain("follow_city_id=42");
    expect(returnTo).toContain("follow_city_name=Boston");
    expect(returnTo).toContain("follow_city_slug=boston");
  });
});

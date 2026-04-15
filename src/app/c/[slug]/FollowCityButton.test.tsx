import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import FollowCityButton from "./FollowCityButton";

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

describe("FollowCityButton", () => {
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

  it("renders a follow button", () => {
    render(<FollowCityButton citySlug="boston" />);
    expect(screen.getByRole("button", { name: /follow this city/i })).toBeInTheDocument();
  });

  it("stores signup_intent in localStorage on click", async () => {
    const user = userEvent.setup();
    render(<FollowCityButton citySlug="boston" cityId={42} cityDisplayName="Boston" />);
    await user.click(screen.getByRole("button"));

    expect(window.localStorage.setItem).toHaveBeenCalledWith(
      "transparentcity.signup_intent",
      "resident"
    );
  });

  it("stores follow_city_* in localStorage on click", async () => {
    const user = userEvent.setup();
    render(<FollowCityButton citySlug="boston" cityId={42} cityDisplayName="Boston" />);
    await user.click(screen.getByRole("button"));

    expect(window.localStorage.setItem).toHaveBeenCalledWith(
      "transparentcity.follow_city_slug", "boston"
    );
    expect(window.localStorage.setItem).toHaveBeenCalledWith(
      "transparentcity.follow_city_name", "Boston"
    );
    expect(window.localStorage.setItem).toHaveBeenCalledWith(
      "transparentcity.follow_city_id", "42"
    );
  });

  it("calls loginWithRedirect with returnTo containing follow_city params", async () => {
    const user = userEvent.setup();
    render(<FollowCityButton citySlug="boston" cityId={42} cityDisplayName="Boston" />);
    await user.click(screen.getByRole("button"));

    expect(mockLoginWithRedirect).toHaveBeenCalledWith(
      expect.objectContaining({
        authorizationParams: expect.objectContaining({
          screen_hint: "signup",
        }),
        appState: {
          returnTo: expect.stringContaining("follow_city_id=42"),
        },
      })
    );
  });

  it("returnTo includes follow_city_slug", async () => {
    const user = userEvent.setup();
    render(<FollowCityButton citySlug="boston" cityId={42} cityDisplayName="Boston" />);
    await user.click(screen.getByRole("button"));

    const returnTo = mockLoginWithRedirect.mock.calls[0][0].appState.returnTo;
    expect(returnTo).toContain("follow_city_slug=boston");
    expect(returnTo).toContain("follow_city_name=Boston");
  });
});

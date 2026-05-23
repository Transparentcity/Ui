import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  persistPasswordlessSignupContext,
  startPasswordlessEmailSignup,
} from "./passwordlessSignup";

const mockLoginWithRedirect = vi.fn();

describe("passwordlessSignup", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    sessionStorage.clear();
  });

  it("rejects invalid email", async () => {
    await expect(
      startPasswordlessEmailSignup(mockLoginWithRedirect, {
        email: "not-an-email",
        sourceSurface: "test",
      })
    ).rejects.toThrow(/valid email/i);
    expect(mockLoginWithRedirect).not.toHaveBeenCalled();
  });

  it("calls loginWithRedirect with email connection and narrowed scope", async () => {
    await startPasswordlessEmailSignup(mockLoginWithRedirect, {
      email: "user@example.com",
      sourceSurface: "city_get_landing",
      citySlug: "cincinnati",
      cityName: "Cincinnati",
      cityId: 42,
      returnAfterCheckEmail: "/home?signup=resident",
    });

    expect(mockLoginWithRedirect).toHaveBeenCalledWith({
      authorizationParams: {
        connection: "email",
        login_hint: "user@example.com",
        scope: "openid profile email",
      },
      appState: { returnTo: "/check-email" },
    });
    expect(localStorage.getItem("transparentcity.signup_intent")).toBe("resident");
    expect(localStorage.getItem("transparentcity.follow_city_slug")).toBe("cincinnati");
    expect(sessionStorage.getItem("auth_return_after_check_email")).toBe(
      "/home?signup=resident"
    );
  });

  it("persistPasswordlessSignupContext stores city follow keys", () => {
    persistPasswordlessSignupContext({
      email: "a@b.co",
      sourceSurface: "nav",
      citySlug: "sf",
      cityName: "San Francisco",
    });
    expect(localStorage.getItem("transparentcity.follow_city_name")).toBe(
      "San Francisco"
    );
  });
});

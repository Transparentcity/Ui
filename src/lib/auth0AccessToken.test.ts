import { OAuthError } from "@auth0/auth0-react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  _resetAuth0AccessTokenRecoveryForTests,
  getApiAccessTokenSilently,
  getAuth0ReturnTo,
  isRecoverableAuth0TokenError,
} from "./auth0AccessToken";

beforeEach(() => {
  _resetAuth0AccessTokenRecoveryForTests();
});

describe("isRecoverableAuth0TokenError", () => {
  it("detects missing_refresh_token by error code", () => {
    expect(
      isRecoverableAuth0TokenError({ error: "missing_refresh_token" })
    ).toBe(true);
  });

  it("detects login_required in message", () => {
    expect(
      isRecoverableAuth0TokenError({ message: "login_required" })
    ).toBe(true);
  });

  it("detects Consent required human-readable message", () => {
    expect(isRecoverableAuth0TokenError({ message: "Consent required" })).toBe(
      true
    );
  });

  it("detects Auth0 OAuthError instances", () => {
    expect(
      isRecoverableAuth0TokenError(
        new OAuthError("consent_required", "Consent required")
      )
    ).toBe(true);
  });

  it("returns false for unrelated errors", () => {
    expect(isRecoverableAuth0TokenError(new Error("network"))).toBe(false);
  });
});

describe("getApiAccessTokenSilently", () => {
  it("returns token on success", async () => {
    const getAccessTokenSilently = vi.fn().mockResolvedValue("tok");
    const loginWithRedirect = vi.fn();

    await expect(
      getApiAccessTokenSilently(getAccessTokenSilently, loginWithRedirect)
    ).resolves.toBe("tok");
    expect(loginWithRedirect).not.toHaveBeenCalled();
  });

  it("redirects to renew session on missing_refresh_token", async () => {
    const getAccessTokenSilently = vi.fn().mockRejectedValue({
      error: "missing_refresh_token",
    });
    const loginWithRedirect = vi.fn().mockResolvedValue(undefined);

    await expect(
      Promise.race([
        getApiAccessTokenSilently(getAccessTokenSilently, loginWithRedirect),
        new Promise((resolve) => setTimeout(() => resolve("pending"), 50)),
      ])
    ).resolves.toBe("pending");

    expect(loginWithRedirect).toHaveBeenCalledWith(
      expect.objectContaining({
        appState: { returnTo: getAuth0ReturnTo() },
        authorizationParams: expect.objectContaining({
          scope: "openid profile email offline_access",
        }),
      })
    );
  });

  it("uses prompt consent when Auth0 returns Consent required", async () => {
    const getAccessTokenSilently = vi
      .fn()
      .mockRejectedValue({ message: "Consent required" });
    const loginWithRedirect = vi.fn().mockResolvedValue(undefined);

    void getApiAccessTokenSilently(getAccessTokenSilently, loginWithRedirect);
    await vi.waitFor(() => expect(loginWithRedirect).toHaveBeenCalled());

    expect(loginWithRedirect).toHaveBeenCalledWith(
      expect.objectContaining({
        authorizationParams: expect.objectContaining({ prompt: "consent" }),
      })
    );
  });
});

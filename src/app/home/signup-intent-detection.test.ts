/**
 * Signup intent detection tests.
 *
 * Verifies that the post-auth redirect on /home correctly detects signup
 * intent from URL params AND from localStorage (fallback when Auth0
 * loses the appState during redirect).
 *
 * The extracted helper mirrors the logic in home/page.tsx's signup/login
 * useEffect so we can unit-test it without mounting the full dashboard.
 */
import { describe, it, expect, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Extracted logic from home/page.tsx signup/login detection effect
// ---------------------------------------------------------------------------

type SignupIntent = "resident" | "public-servant" | null;

/**
 * Resolves signup intent from URL params with localStorage fallback.
 * Returns the intent and whether localStorage had a value (for cleanup).
 */
function resolveSignupIntent(
  urlSearch: string,
  storage: Record<string, string>,
): { signupIntent: SignupIntent; hadLocalStorage: boolean } {
  const urlParams = new URLSearchParams(urlSearch);
  const signupIntentParam = urlParams.get("signup") as SignupIntent;
  const signupIntentLS = (storage["transparentcity.signup_intent"] ?? null) as SignupIntent;
  const signupIntent = signupIntentParam || signupIntentLS;

  return {
    signupIntent,
    hadLocalStorage: signupIntentLS !== null,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Signup intent detection", () => {
  let storage: Record<string, string>;

  beforeEach(() => {
    storage = {};
  });

  it("detects intent from URL params (normal Auth0 redirect)", () => {
    const { signupIntent } = resolveSignupIntent(
      "?signup=resident",
      storage,
    );
    expect(signupIntent).toBe("resident");
  });

  it("detects public-servant intent from URL params", () => {
    const { signupIntent } = resolveSignupIntent(
      "?signup=public-servant",
      storage,
    );
    expect(signupIntent).toBe("public-servant");
  });

  it("falls back to localStorage when URL param is missing (Auth0 lost appState)", () => {
    storage["transparentcity.signup_intent"] = "resident";
    const { signupIntent, hadLocalStorage } = resolveSignupIntent("", storage);
    expect(signupIntent).toBe("resident");
    expect(hadLocalStorage).toBe(true);
  });

  it("falls back to localStorage for public-servant intent", () => {
    storage["transparentcity.signup_intent"] = "public-servant";
    const { signupIntent } = resolveSignupIntent("", storage);
    expect(signupIntent).toBe("public-servant");
  });

  it("URL param takes precedence over localStorage", () => {
    storage["transparentcity.signup_intent"] = "public-servant";
    const { signupIntent } = resolveSignupIntent(
      "?signup=resident",
      storage,
    );
    expect(signupIntent).toBe("resident");
  });

  it("returns null when neither URL param nor localStorage exists", () => {
    const { signupIntent, hadLocalStorage } = resolveSignupIntent("", storage);
    expect(signupIntent).toBeNull();
    expect(hadLocalStorage).toBe(false);
  });

  it("flags localStorage for cleanup when it had a value", () => {
    storage["transparentcity.signup_intent"] = "resident";
    const { hadLocalStorage } = resolveSignupIntent(
      "?signup=resident",
      storage,
    );
    // Even when URL param wins, localStorage should be cleaned up
    expect(hadLocalStorage).toBe(true);
  });

  it("does not flag cleanup when localStorage was empty", () => {
    const { hadLocalStorage } = resolveSignupIntent(
      "?signup=resident",
      storage,
    );
    expect(hadLocalStorage).toBe(false);
  });

  it("handles URL with other params but no signup param", () => {
    storage["transparentcity.signup_intent"] = "resident";
    const { signupIntent } = resolveSignupIntent(
      "?follow_city_id=42&follow_city_name=Sacramento",
      storage,
    );
    expect(signupIntent).toBe("resident");
  });
});

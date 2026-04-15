/**
 * Onboarding guard tests.
 *
 * 1. Signup intent detection: verifies that post-auth redirect on /home
 *    correctly detects signup intent from URL params AND from localStorage
 *    (fallback when Auth0 loses the appState during the redirect).
 *
 * 2. Onboarding check resilience: verifies that a transient API failure
 *    does not permanently skip onboarding for the session.
 *
 * Extracted helpers mirror the logic in home/page.tsx so we can unit-test
 * without mounting the full dashboard.
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

// ---------------------------------------------------------------------------
// Extracted logic from home/page.tsx onboarding check effect
// ---------------------------------------------------------------------------

/**
 * Simulates the hasCheckedOnboarding guard + API call pattern.
 * Returns whether the onboarding check ran and whether the flag allows retry.
 */
async function simulateOnboardingCheck(opts: {
  apiThrows: boolean;
  hasCompletedOnboarding: boolean;
  savedCitiesCount: number;
}): Promise<{ modalShown: boolean; flagAllowsRetry: boolean }> {
  const flag = { current: false };
  let modalShown = false;

  // Mirrors the try/catch structure in home/page.tsx onboarding check effect
  try {
    flag.current = true;

    // Simulate getUserPreferences
    if (opts.apiThrows) {
      throw new Error("Network error");
    }

    if (!opts.hasCompletedOnboarding) {
      // Simulate getSavedCities
      if (opts.savedCitiesCount === 0) {
        modalShown = true;
      }
    }
  } catch {
    // Reset flag so the check retries on next effect trigger
    flag.current = false;
  }

  return { modalShown, flagAllowsRetry: !flag.current };
}

describe("Onboarding check resilience", () => {
  it("shows modal for new user with no saved cities", async () => {
    const result = await simulateOnboardingCheck({
      apiThrows: false,
      hasCompletedOnboarding: false,
      savedCitiesCount: 0,
    });
    expect(result.modalShown).toBe(true);
    expect(result.flagAllowsRetry).toBe(false); // flag stays set after success
  });

  it("skips modal for user who completed onboarding", async () => {
    const result = await simulateOnboardingCheck({
      apiThrows: false,
      hasCompletedOnboarding: true,
      savedCitiesCount: 0,
    });
    expect(result.modalShown).toBe(false);
  });

  it("skips modal for user with saved cities", async () => {
    const result = await simulateOnboardingCheck({
      apiThrows: false,
      hasCompletedOnboarding: false,
      savedCitiesCount: 3,
    });
    expect(result.modalShown).toBe(false);
  });

  it("resets flag on API failure so onboarding check can retry", async () => {
    const result = await simulateOnboardingCheck({
      apiThrows: true,
      hasCompletedOnboarding: false,
      savedCitiesCount: 0,
    });
    expect(result.modalShown).toBe(false); // API failed, modal not shown yet
    expect(result.flagAllowsRetry).toBe(true); // flag reset, retry allowed
  });

  it("retry after API failure shows modal on success", async () => {
    // First attempt fails
    const attempt1 = await simulateOnboardingCheck({
      apiThrows: true,
      hasCompletedOnboarding: false,
      savedCitiesCount: 0,
    });
    expect(attempt1.modalShown).toBe(false);
    expect(attempt1.flagAllowsRetry).toBe(true);

    // Second attempt succeeds
    const attempt2 = await simulateOnboardingCheck({
      apiThrows: false,
      hasCompletedOnboarding: false,
      savedCitiesCount: 0,
    });
    expect(attempt2.modalShown).toBe(true);
  });
});

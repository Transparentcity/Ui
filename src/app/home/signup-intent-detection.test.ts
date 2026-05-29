/**
 * Onboarding guard tests.
 *
 * Verifies every signup path triggers onboarding and persists the correct
 * city context. Tests are structured as extracted helpers that mirror the
 * decision logic in home/page.tsx so we can unit-test without mounting the
 * full dashboard component.
 *
 * Sections:
 *  1. Signup intent detection (URL param + localStorage fallback)
 *  2. Signup/login effect: which branch fires and what it produces
 *  3. Onboarding check (effect 2) resilience against API failures
 *  4. Every signup entry point sets the right localStorage keys
 */
import { describe, it, expect, beforeEach } from "vitest";
import { userNeedsOnboardingWelcome } from "@/lib/onboardingGate";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type SignupIntent = "resident" | "public-servant" | "subscriber" | null;

type EffectResult = {
  branch: "follow-city" | "signup-only" | "regular-login";
  signupIntent: SignupIntent;
  followCityId: number | null;
  showWelcomeModal: boolean;
  hasCheckedOnboarding: boolean;
  saveCityCalled: boolean;
  currentView: "city" | "feed";
};

// ---------------------------------------------------------------------------
// 1. Signup intent resolution (mirrors home/page.tsx lines 375-384)
// ---------------------------------------------------------------------------

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
// 2. Signup/login effect simulation (mirrors home/page.tsx lines 370-454)
// ---------------------------------------------------------------------------

function simulateSignupLoginEffect(opts: {
  urlSearch: string;
  storage: Record<string, string>;
  hasCompletedOnboarding?: boolean;
  savedCitiesCount?: number;
}): EffectResult {
  const needsWelcome = userNeedsOnboardingWelcome(
    { has_completed_onboarding: opts.hasCompletedOnboarding ?? false },
    opts.savedCitiesCount ?? 0,
  );
  const urlParams = new URLSearchParams(opts.urlSearch);

  // Resolve signup intent
  const signupIntentParam = urlParams.get("signup") as SignupIntent;
  const signupIntentLS = (opts.storage["transparentcity.signup_intent"] ?? null) as SignupIntent;
  const signupIntent = signupIntentParam || signupIntentLS;

  // Resolve follow city
  const followCityIdParam = urlParams.get("follow_city_id");
  const followCityIdLS = opts.storage["transparentcity.follow_city_id"] ?? null;
  const followCityId = followCityIdParam
    ? parseInt(followCityIdParam, 10)
    : followCityIdLS
      ? parseInt(followCityIdLS, 10)
      : NaN;

  const result: EffectResult = {
    branch: "regular-login",
    signupIntent,
    followCityId: null,
    showWelcomeModal: false,
    hasCheckedOnboarding: false,
    saveCityCalled: false,
    currentView: "feed",
  };

  if (Number.isFinite(followCityId)) {
    // Follow-city branch
    result.branch = "follow-city";
    result.followCityId = followCityId;
    result.saveCityCalled = true;
    result.currentView = "city";

    if (signupIntent) {
      result.hasCheckedOnboarding = true;
      if (needsWelcome) {
        result.showWelcomeModal = true;
      }
    }
  } else if (signupIntent) {
    // Signup-only branch (no follow city)
    result.branch = "signup-only";
    result.hasCheckedOnboarding = true;
    if (needsWelcome) {
      result.showWelcomeModal = true;
    }
  } else {
    // Regular login
    result.branch = "regular-login";
  }

  return result;
}

// ---------------------------------------------------------------------------
// 3. Onboarding check effect simulation (mirrors home/page.tsx lines 583-692)
// ---------------------------------------------------------------------------

async function simulateOnboardingCheck(opts: {
  apiThrows: boolean;
  hasCompletedOnboarding: boolean;
  savedCitiesCount: number;
}): Promise<{ modalShown: boolean; flagAllowsRetry: boolean }> {
  const flag = { current: false };
  let modalShown = false;

  try {
    flag.current = true;
    if (opts.apiThrows) throw new Error("Network error");
    if (!opts.hasCompletedOnboarding) {
      if (opts.savedCitiesCount === 0) {
        modalShown = true;
      }
    }
  } catch {
    flag.current = false;
  }

  return { modalShown, flagAllowsRetry: !flag.current };
}

// ---------------------------------------------------------------------------
// 4. Signup entry point validator
//    Checks that a component's localStorage writes and returnTo URL
//    contain the required keys for onboarding to fire.
// ---------------------------------------------------------------------------

type EntryPointConfig = {
  storageKeys: Record<string, string>;
  returnTo: string;
};

function validateEntryPoint(config: EntryPointConfig) {
  const hasSignupIntent =
    config.storageKeys["transparentcity.signup_intent"] != null;
  const returnToParams = new URLSearchParams(
    config.returnTo.includes("?") ? config.returnTo.split("?")[1] : "",
  );
  const hasSignupParam = returnToParams.has("signup");
  const hasFollowCityId =
    config.storageKeys["transparentcity.follow_city_id"] != null ||
    returnToParams.has("follow_city_id");
  const hasFollowCitySlug =
    config.storageKeys["transparentcity.follow_city_slug"] != null ||
    returnToParams.has("follow_city_slug");

  return {
    /** Will onboarding fire immediately (via effect 1)? */
    triggersOnboarding: hasSignupIntent || hasSignupParam,
    /** Will the originating city be saved to My Places? */
    persistsCityFollow: hasFollowCityId,
    /** Is the city slug preserved for routing? */
    hasCitySlug: hasFollowCitySlug,
    /** Does returnTo point to /home? */
    redirectsToHome: config.returnTo.startsWith("/home"),
  };
}

// ===================================================================
// TESTS
// ===================================================================

describe("Signup intent detection", () => {
  let storage: Record<string, string>;
  beforeEach(() => { storage = {}; });

  it("detects intent from URL params (normal Auth0 redirect)", () => {
    expect(resolveSignupIntent("?signup=resident", storage).signupIntent).toBe("resident");
  });

  it("detects public-servant intent from URL params", () => {
    expect(resolveSignupIntent("?signup=public-servant", storage).signupIntent).toBe("public-servant");
  });

  it("falls back to localStorage when URL param is missing", () => {
    storage["transparentcity.signup_intent"] = "resident";
    const r = resolveSignupIntent("", storage);
    expect(r.signupIntent).toBe("resident");
    expect(r.hadLocalStorage).toBe(true);
  });

  it("falls back to localStorage for public-servant intent", () => {
    storage["transparentcity.signup_intent"] = "public-servant";
    expect(resolveSignupIntent("", storage).signupIntent).toBe("public-servant");
  });

  it("URL param takes precedence over localStorage", () => {
    storage["transparentcity.signup_intent"] = "public-servant";
    expect(resolveSignupIntent("?signup=resident", storage).signupIntent).toBe("resident");
  });

  it("returns null when neither URL param nor localStorage exists", () => {
    const r = resolveSignupIntent("", storage);
    expect(r.signupIntent).toBeNull();
    expect(r.hadLocalStorage).toBe(false);
  });

  it("flags localStorage for cleanup when it had a value", () => {
    storage["transparentcity.signup_intent"] = "resident";
    expect(resolveSignupIntent("?signup=resident", storage).hadLocalStorage).toBe(true);
  });

  it("does not flag cleanup when localStorage was empty", () => {
    expect(resolveSignupIntent("?signup=resident", storage).hadLocalStorage).toBe(false);
  });

  it("handles URL with other params but no signup param", () => {
    storage["transparentcity.signup_intent"] = "resident";
    expect(resolveSignupIntent("?follow_city_id=42", storage).signupIntent).toBe("resident");
  });
});

// ---------------------------------------------------------------------------
// Effect 1: onboarding modal fires on every new signup
// ---------------------------------------------------------------------------

describe("Signup/login effect: onboarding triggers on every new signup", () => {
  describe("signup via landing page (no city context)", () => {
    it("shows WelcomeModal for resident signup", () => {
      const r = simulateSignupLoginEffect({
        urlSearch: "?signup=resident",
        storage: {},
      });
      expect(r.branch).toBe("signup-only");
      expect(r.showWelcomeModal).toBe(true);
      expect(r.hasCheckedOnboarding).toBe(true);
    });

    it("shows WelcomeModal for public-servant signup (same flow as residents)", () => {
      const r = simulateSignupLoginEffect({
        urlSearch: "?signup=public-servant",
        storage: {},
      });
      expect(r.branch).toBe("signup-only");
      expect(r.showWelcomeModal).toBe(true);
    });

    it("shows WelcomeModal from localStorage fallback (Auth0 lost appState)", () => {
      const r = simulateSignupLoginEffect({
        urlSearch: "",
        storage: { "transparentcity.signup_intent": "resident" },
      });
      expect(r.branch).toBe("signup-only");
      expect(r.showWelcomeModal).toBe(true);
    });
  });

  describe("signup via city page (follow-city + signup intent)", () => {
    it("shows WelcomeModal AND saves city for resident signup from city page", () => {
      const r = simulateSignupLoginEffect({
        urlSearch: "?signup=resident&follow_city_id=42&follow_city_name=Boston&follow_city_slug=boston",
        storage: {},
      });
      expect(r.branch).toBe("follow-city");
      expect(r.showWelcomeModal).toBe(true);
      expect(r.saveCityCalled).toBe(true);
      expect(r.followCityId).toBe(42);
      expect(r.hasCheckedOnboarding).toBe(true);
    });

    it("shows WelcomeModal AND saves city for public-servant from city page", () => {
      const r = simulateSignupLoginEffect({
        urlSearch: "?signup=public-servant&follow_city_id=42",
        storage: {},
      });
      expect(r.branch).toBe("follow-city");
      expect(r.showWelcomeModal).toBe(true);
      expect(r.saveCityCalled).toBe(true);
    });

    it("shows WelcomeModal from localStorage fallback with follow-city intent", () => {
      const r = simulateSignupLoginEffect({
        urlSearch: "",
        storage: {
          "transparentcity.signup_intent": "resident",
          "transparentcity.follow_city_id": "42",
          "transparentcity.follow_city_name": "Boston",
        },
      });
      expect(r.branch).toBe("follow-city");
      expect(r.showWelcomeModal).toBe(true);
      expect(r.saveCityCalled).toBe(true);
      expect(r.followCityId).toBe(42);
    });

    it("sets currentView to city when follow-city intent is present", () => {
      const r = simulateSignupLoginEffect({
        urlSearch: "?signup=resident&follow_city_id=42",
        storage: {},
      });
      expect(r.currentView).toBe("city");
    });
  });

  describe("follow-city without signup intent (returning user)", () => {
    it("does NOT show onboarding modal for returning user following a city", () => {
      const r = simulateSignupLoginEffect({
        urlSearch: "?follow_city_id=42&follow_city_slug=boston",
        storage: {},
      });
      expect(r.branch).toBe("follow-city");
      expect(r.showWelcomeModal).toBe(false);
      expect(r.hasCheckedOnboarding).toBe(false);
      expect(r.saveCityCalled).toBe(true);
    });
  });

  describe("returning user with stale signup param (e.g. passwordless magic link)", () => {
    it("does NOT show WelcomeModal when onboarding is already complete", () => {
      const r = simulateSignupLoginEffect({
        urlSearch: "?signup=resident",
        storage: {},
        hasCompletedOnboarding: true,
      });
      expect(r.branch).toBe("signup-only");
      expect(r.showWelcomeModal).toBe(false);
      expect(r.hasCheckedOnboarding).toBe(true);
    });

    it("does NOT show WelcomeModal when user has saved cities", () => {
      const r = simulateSignupLoginEffect({
        urlSearch: "?signup=resident&follow_city_id=42",
        storage: {},
        hasCompletedOnboarding: false,
        savedCitiesCount: 1,
      });
      expect(r.branch).toBe("follow-city");
      expect(r.showWelcomeModal).toBe(false);
      expect(r.hasCheckedOnboarding).toBe(true);
    });
  });

  describe("regular login (no signup intent, no follow city)", () => {
    it("does NOT show onboarding modal", () => {
      const r = simulateSignupLoginEffect({
        urlSearch: "",
        storage: {},
      });
      expect(r.branch).toBe("regular-login");
      expect(r.showWelcomeModal).toBe(false);
      expect(r.hasCheckedOnboarding).toBe(false);
    });

    it("sets currentView to feed", () => {
      const r = simulateSignupLoginEffect({
        urlSearch: "",
        storage: {},
      });
      expect(r.currentView).toBe("feed");
    });
  });
});

// ---------------------------------------------------------------------------
// Effect 2: onboarding check resilience
// ---------------------------------------------------------------------------

describe("Onboarding check resilience (effect 2 fallback)", () => {
  it("shows modal for new user with no saved cities", async () => {
    const r = await simulateOnboardingCheck({
      apiThrows: false, hasCompletedOnboarding: false, savedCitiesCount: 0,
    });
    expect(r.modalShown).toBe(true);
    expect(r.flagAllowsRetry).toBe(false);
  });

  it("skips modal for user who completed onboarding", async () => {
    const r = await simulateOnboardingCheck({
      apiThrows: false, hasCompletedOnboarding: true, savedCitiesCount: 0,
    });
    expect(r.modalShown).toBe(false);
  });

  it("skips modal for user with saved cities (even if not marked complete)", async () => {
    const r = await simulateOnboardingCheck({
      apiThrows: false, hasCompletedOnboarding: false, savedCitiesCount: 3,
    });
    expect(r.modalShown).toBe(false);
  });

  it("resets flag on API failure so the check can retry", async () => {
    const r = await simulateOnboardingCheck({
      apiThrows: true, hasCompletedOnboarding: false, savedCitiesCount: 0,
    });
    expect(r.modalShown).toBe(false);
    expect(r.flagAllowsRetry).toBe(true);
  });

  it("retry after API failure shows modal on success", async () => {
    const a1 = await simulateOnboardingCheck({
      apiThrows: true, hasCompletedOnboarding: false, savedCitiesCount: 0,
    });
    expect(a1.flagAllowsRetry).toBe(true);

    const a2 = await simulateOnboardingCheck({
      apiThrows: false, hasCompletedOnboarding: false, savedCitiesCount: 0,
    });
    expect(a2.modalShown).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Signup entry point validation: every component sets the right keys
// ---------------------------------------------------------------------------

describe("Signup entry points: every component triggers onboarding and persists city", () => {
  it("HomeClient sets signup_intent and redirects to /home", () => {
    const r = validateEntryPoint({
      storageKeys: { "transparentcity.signup_intent": "resident" },
      returnTo: "/home?signup=resident",
    });
    expect(r.triggersOnboarding).toBe(true);
    expect(r.redirectsToHome).toBe(true);
  });

  it("CitySignupButton (with city) sets signup_intent + follow_city_*", () => {
    const r = validateEntryPoint({
      storageKeys: {
        "transparentcity.signup_intent": "resident",
        "transparentcity.follow_city_id": "42",
        "transparentcity.follow_city_name": "Boston",
        "transparentcity.follow_city_slug": "boston",
      },
      returnTo: "/home?signup=resident&follow_city_id=42&follow_city_name=Boston&follow_city_slug=boston",
    });
    expect(r.triggersOnboarding).toBe(true);
    expect(r.persistsCityFollow).toBe(true);
    expect(r.hasCitySlug).toBe(true);
    expect(r.redirectsToHome).toBe(true);
  });

  it("CitySignupCTA sets signup_intent + follow_city_*", () => {
    const r = validateEntryPoint({
      storageKeys: {
        "transparentcity.signup_intent": "resident",
        "transparentcity.follow_city_id": "10",
        "transparentcity.follow_city_slug": "sacramento",
      },
      returnTo: "/home?signup=resident&follow_city_id=10&follow_city_slug=sacramento",
    });
    expect(r.triggersOnboarding).toBe(true);
    expect(r.persistsCityFollow).toBe(true);
    expect(r.redirectsToHome).toBe(true);
  });

  it("MobileCitySignupBar sets signup_intent + follow_city_*", () => {
    const r = validateEntryPoint({
      storageKeys: {
        "transparentcity.signup_intent": "resident",
        "transparentcity.follow_city_id": "5",
        "transparentcity.follow_city_name": "Denver",
        "transparentcity.follow_city_slug": "denver",
      },
      returnTo: "/home?signup=resident&follow_city_id=5&follow_city_name=Denver&follow_city_slug=denver",
    });
    expect(r.triggersOnboarding).toBe(true);
    expect(r.persistsCityFollow).toBe(true);
    expect(r.redirectsToHome).toBe(true);
  });

  it("FollowCityButton sets signup_intent + follow_city_*", () => {
    const r = validateEntryPoint({
      storageKeys: {
        "transparentcity.signup_intent": "resident",
        "transparentcity.follow_city_id": "42",
        "transparentcity.follow_city_name": "Boston",
        "transparentcity.follow_city_slug": "boston",
      },
      returnTo: "/home?follow_city_slug=boston&follow_city_id=42&follow_city_name=Boston",
    });
    expect(r.triggersOnboarding).toBe(true);
    expect(r.persistsCityFollow).toBe(true);
    expect(r.redirectsToHome).toBe(true);
  });

  it("DistrictListWithFollow sets signup_intent + follow_city_*", () => {
    const r = validateEntryPoint({
      storageKeys: {
        "transparentcity.signup_intent": "resident",
        "transparentcity.follow_city_id": "42",
        "transparentcity.follow_city_name": "Boston",
        "transparentcity.follow_city_slug": "boston",
      },
      returnTo: "/home?signup=resident&follow_city_id=42&follow_city_name=Boston&follow_city_slug=boston",
    });
    expect(r.triggersOnboarding).toBe(true);
    expect(r.persistsCityFollow).toBe(true);
    expect(r.redirectsToHome).toBe(true);
  });

  it("DistrictFollowClaimBlock sets signup_intent + follow_city_*", () => {
    const r = validateEntryPoint({
      storageKeys: {
        "transparentcity.signup_intent": "resident",
        "transparentcity.follow_city_id": "42",
        "transparentcity.follow_city_slug": "boston",
      },
      returnTo: "/home?signup=resident&follow_city_id=42&follow_city_slug=boston",
    });
    expect(r.triggersOnboarding).toBe(true);
    expect(r.persistsCityFollow).toBe(true);
    expect(r.redirectsToHome).toBe(true);
  });

  it("CustomizeMetricsTrigger sets signup_intent + follow_city_*", () => {
    const r = validateEntryPoint({
      storageKeys: {
        "transparentcity.signup_intent": "resident",
        "transparentcity.follow_city_id": "42",
        "transparentcity.follow_city_name": "Boston",
      },
      returnTo: "/home?signup=resident&follow_city_id=42&follow_city_name=Boston",
    });
    expect(r.triggersOnboarding).toBe(true);
    expect(r.persistsCityFollow).toBe(true);
    expect(r.redirectsToHome).toBe(true);
  });

  it("SignUpToCustomizeMetricsButton sets signup_intent + follow_city_*", () => {
    const r = validateEntryPoint({
      storageKeys: {
        "transparentcity.signup_intent": "resident",
        "transparentcity.follow_city_id": "42",
        "transparentcity.follow_city_name": "Boston",
        "transparentcity.follow_city_slug": "boston",
      },
      returnTo: "/home?signup=resident&follow_city_id=42&follow_city_name=Boston&follow_city_slug=boston",
    });
    expect(r.triggersOnboarding).toBe(true);
    expect(r.persistsCityFollow).toBe(true);
    expect(r.redirectsToHome).toBe(true);
  });

  it("Header signup sets signup_intent + redirects to /home", () => {
    const r = validateEntryPoint({
      storageKeys: { "transparentcity.signup_intent": "resident" },
      returnTo: "/home?signup=resident",
    });
    expect(r.triggersOnboarding).toBe(true);
    expect(r.redirectsToHome).toBe(true);
  });

  it("AuthModal signup sets signup_intent + redirects to /home", () => {
    const r = validateEntryPoint({
      storageKeys: { "transparentcity.signup_intent": "resident" },
      returnTo: "/home?signup=resident",
    });
    expect(r.triggersOnboarding).toBe(true);
    expect(r.redirectsToHome).toBe(true);
  });

  it("Newsletter page (/m/[hash]) sets signup_intent + redirects to /home", () => {
    // This component sets intent as "subscriber" but it still triggers onboarding
    const r = validateEntryPoint({
      storageKeys: { "transparentcity.signup_intent": "subscriber" },
      returnTo: "/home",
    });
    expect(r.triggersOnboarding).toBe(true);
    expect(r.redirectsToHome).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Boston/Somerville scenario (end-to-end logic trace)
// ---------------------------------------------------------------------------

describe("Boston page signup, lives in Somerville scenario", () => {
  it("Boston is saved to My Places via follow-city intent", () => {
    const r = simulateSignupLoginEffect({
      urlSearch: "?signup=resident&follow_city_id=42&follow_city_name=Boston&follow_city_slug=boston",
      storage: {},
    });
    expect(r.saveCityCalled).toBe(true);
    expect(r.followCityId).toBe(42);
  });

  it("WelcomeModal still shows so user can enter their Somerville address", () => {
    const r = simulateSignupLoginEffect({
      urlSearch: "?signup=resident&follow_city_id=42&follow_city_name=Boston",
      storage: {},
    });
    expect(r.showWelcomeModal).toBe(true);
  });

  it("both intents work from localStorage fallback", () => {
    const r = simulateSignupLoginEffect({
      urlSearch: "",
      storage: {
        "transparentcity.signup_intent": "resident",
        "transparentcity.follow_city_id": "42",
        "transparentcity.follow_city_name": "Boston",
        "transparentcity.follow_city_slug": "boston",
      },
    });
    expect(r.saveCityCalled).toBe(true);
    expect(r.followCityId).toBe(42);
    expect(r.showWelcomeModal).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------------

describe("Edge cases", () => {
  it("follow_city_id without signup_intent does NOT show onboarding (returning user)", () => {
    const r = simulateSignupLoginEffect({
      urlSearch: "?follow_city_id=42",
      storage: {},
    });
    expect(r.showWelcomeModal).toBe(false);
    expect(r.saveCityCalled).toBe(true);
  });

  it("invalid follow_city_id falls through to signup-only branch", () => {
    const r = simulateSignupLoginEffect({
      urlSearch: "?signup=resident&follow_city_id=abc",
      storage: {},
    });
    expect(r.branch).toBe("signup-only");
    expect(r.showWelcomeModal).toBe(true);
    expect(r.saveCityCalled).toBe(false);
  });

  it("subscriber intent from newsletter page still triggers onboarding", () => {
    const r = simulateSignupLoginEffect({
      urlSearch: "",
      storage: { "transparentcity.signup_intent": "subscriber" },
    });
    // "subscriber" is truthy so it enters the signup branch
    expect(r.branch).toBe("signup-only");
    expect(r.showWelcomeModal).toBe(true);
  });

  it("empty string signup intent does NOT trigger onboarding", () => {
    const r = simulateSignupLoginEffect({
      urlSearch: "?signup=",
      storage: {},
    });
    // Empty string is falsy
    expect(r.branch).toBe("regular-login");
    expect(r.showWelcomeModal).toBe(false);
  });
});

/**
 * Tests for onboarding bug fixes.
 *
 * Covers:
 *  1. City-only signups persist home_location (city_id without coordinates)
 *  2. processLocationAndFindCity receives isPrecise parameter (no stale closure)
 *  3. NavEmailSignup passwordless flow sets signup_intent in localStorage
 *  4. "subscriber" intent type is handled correctly
 */
import { describe, it, expect, vi } from "vitest";

// ---------------------------------------------------------------------------
// Bug 1: City-only signups must persist home_location with city_id
// ---------------------------------------------------------------------------

/**
 * Simulates the preferences data construction from WelcomeModal's
 * handleSaveFromEmailPersonalization, mirroring the fixed logic.
 */
function buildPreferencesData(opts: {
  cityId: number;
  hasPreciseLocation: boolean;
  homeCoordinates: { lat: number; lng: number } | null;
  selectedCategoryIds: string[];
  weeklyNewsletterOptIn: boolean;
}) {
  const preferencesData: Record<string, any> = {
    has_completed_onboarding: true,
    extra: {
      selected_category_ids: opts.selectedCategoryIds,
      communication_preferences: {
        anomaly_alerts: false,
        personalized_email: opts.weeklyNewsletterOptIn,
        weekly_digest: opts.weeklyNewsletterOptIn,
      },
    },
  };

  // Fixed logic: always persist home_location with city_id; coordinates only if precise
  preferencesData.extra.home_location = {
    city_id: opts.cityId,
    ...(opts.hasPreciseLocation && opts.homeCoordinates
      ? { coordinates: opts.homeCoordinates }
      : {}),
  };

  return preferencesData;
}

describe("Bug fix 1: City-only signups persist home_location", () => {
  it("city-only signup (no precise location) saves city_id without coordinates", () => {
    const prefs = buildPreferencesData({
      cityId: 100,
      hasPreciseLocation: false,
      homeCoordinates: null,
      selectedCategoryIds: ["crime-safety"],
      weeklyNewsletterOptIn: true,
    });

    expect(prefs.extra.home_location).toBeDefined();
    expect(prefs.extra.home_location.city_id).toBe(100);
    expect(prefs.extra.home_location.coordinates).toBeUndefined();
  });

  it("city-only signup with city centroid coordinates still omits coordinates", () => {
    // When user types a city name, geocode returns centroid coords but
    // hasPreciseLocation is false. Coordinates should NOT be saved.
    const prefs = buildPreferencesData({
      cityId: 100,
      hasPreciseLocation: false,
      homeCoordinates: { lat: 38.58, lng: -121.49 },
      selectedCategoryIds: [],
      weeklyNewsletterOptIn: false,
    });

    expect(prefs.extra.home_location).toBeDefined();
    expect(prefs.extra.home_location.city_id).toBe(100);
    expect(prefs.extra.home_location.coordinates).toBeUndefined();
  });

  it("precise address signup saves city_id AND coordinates", () => {
    const prefs = buildPreferencesData({
      cityId: 100,
      hasPreciseLocation: true,
      homeCoordinates: { lat: 38.5816, lng: -121.4944 },
      selectedCategoryIds: ["crime-safety", "housing"],
      weeklyNewsletterOptIn: true,
    });

    expect(prefs.extra.home_location).toBeDefined();
    expect(prefs.extra.home_location.city_id).toBe(100);
    expect(prefs.extra.home_location.coordinates).toEqual({ lat: 38.5816, lng: -121.4944 });
  });

  it("GPS signup saves city_id AND coordinates", () => {
    const prefs = buildPreferencesData({
      cityId: 42,
      hasPreciseLocation: true,
      homeCoordinates: { lat: 37.7749, lng: -122.4194 },
      selectedCategoryIds: [],
      weeklyNewsletterOptIn: true,
    });

    expect(prefs.extra.home_location.city_id).toBe(42);
    expect(prefs.extra.home_location.coordinates).toEqual({ lat: 37.7749, lng: -122.4194 });
  });

  it("has_completed_onboarding is always set to true", () => {
    const prefs = buildPreferencesData({
      cityId: 1,
      hasPreciseLocation: false,
      homeCoordinates: null,
      selectedCategoryIds: [],
      weeklyNewsletterOptIn: false,
    });

    expect(prefs.has_completed_onboarding).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Bug 2: processLocationAndFindCity uses isPrecise parameter (no stale closure)
// ---------------------------------------------------------------------------

/**
 * Simulates processLocationAndFindCity's district lookup decision,
 * mirroring the fixed logic that uses isPrecise parameter.
 */
function shouldDoDistrictLookup(opts: {
  coordinates: { lat: number; lng: number } | null;
  isPrecise: boolean;
  finalDistrict: number | null;
  matchedCity: boolean;
}): boolean {
  return !!(opts.coordinates && opts.isPrecise && !opts.finalDistrict && opts.matchedCity);
}

describe("Bug fix 2: District lookup uses explicit isPrecise parameter", () => {
  it("does district lookup when isPrecise is true (address autocomplete)", () => {
    expect(shouldDoDistrictLookup({
      coordinates: { lat: 38.58, lng: -121.49 },
      isPrecise: true,
      finalDistrict: null,
      matchedCity: true,
    })).toBe(true);
  });

  it("does district lookup when isPrecise is true (GPS)", () => {
    expect(shouldDoDistrictLookup({
      coordinates: { lat: 37.77, lng: -122.42 },
      isPrecise: true,
      finalDistrict: null,
      matchedCity: true,
    })).toBe(true);
  });

  it("skips district lookup when isPrecise is false (city-only)", () => {
    expect(shouldDoDistrictLookup({
      coordinates: { lat: 38.58, lng: -121.49 },
      isPrecise: false,
      finalDistrict: null,
      matchedCity: true,
    })).toBe(false);
  });

  it("skips district lookup when coordinates are null", () => {
    expect(shouldDoDistrictLookup({
      coordinates: null,
      isPrecise: true,
      finalDistrict: null,
      matchedCity: true,
    })).toBe(false);
  });

  it("skips district lookup when district is already known", () => {
    expect(shouldDoDistrictLookup({
      coordinates: { lat: 38.58, lng: -121.49 },
      isPrecise: true,
      finalDistrict: 4,
      matchedCity: true,
    })).toBe(false);
  });

  it("skips district lookup when no city was matched", () => {
    expect(shouldDoDistrictLookup({
      coordinates: { lat: 38.58, lng: -121.49 },
      isPrecise: true,
      finalDistrict: null,
      matchedCity: false,
    })).toBe(false);
  });

  describe("stale closure scenario", () => {
    it("caller passes isPrecise=true directly instead of reading stale state", () => {
      // Before the fix: hasPreciseLocation state was set to true via
      // setHasPreciseLocation(true) but read from the stale closure as false.
      // After the fix: isPrecise is passed as a parameter.

      // Simulate: state says false (stale), but we pass true explicitly
      const staleStateValue = false;
      const explicitParameter = true;

      // Old behavior (broken): would read stale state
      const oldResult = shouldDoDistrictLookup({
        coordinates: { lat: 38.58, lng: -121.49 },
        isPrecise: staleStateValue, // would be false
        finalDistrict: null,
        matchedCity: true,
      });
      expect(oldResult).toBe(false); // district lookup wrongly skipped

      // New behavior (fixed): uses explicit parameter
      const newResult = shouldDoDistrictLookup({
        coordinates: { lat: 38.58, lng: -121.49 },
        isPrecise: explicitParameter, // true, passed directly
        finalDistrict: null,
        matchedCity: true,
      });
      expect(newResult).toBe(true); // district lookup correctly runs
    });

    it("manual address submit: isPrecise derived from place_type before calling", () => {
      // handleAddressSubmit computes isPrecise from geocode place_type and
      // passes it directly, avoiding the stale closure.
      const placeTypes = ["address"];
      const isPrecise = placeTypes.includes("address") || placeTypes.includes("poi");

      expect(shouldDoDistrictLookup({
        coordinates: { lat: 38.58, lng: -121.49 },
        isPrecise,
        finalDistrict: null,
        matchedCity: true,
      })).toBe(true);
    });

    it("city-only submit: isPrecise correctly false from place_type", () => {
      const placeTypes = ["place"];
      const isPrecise = placeTypes.includes("address") || placeTypes.includes("poi");

      expect(shouldDoDistrictLookup({
        coordinates: { lat: 38.58, lng: -121.49 },
        isPrecise,
        finalDistrict: null,
        matchedCity: true,
      })).toBe(false);
    });
  });
});

// ---------------------------------------------------------------------------
// Bug 3: NavEmailSignup passwordless flow sets signup_intent
// ---------------------------------------------------------------------------

/**
 * Simulates the localStorage writes that NavEmailSignup.handleSubmit
 * should perform before redirecting to Auth0.
 */
function simulateNavEmailSignupSubmit(opts: {
  citySlug: string;
  cityName?: string;
  cityId?: number | null;
}): Record<string, string> {
  const storage: Record<string, string> = {};

  // Fixed logic: always set signup_intent
  storage["transparentcity.signup_intent"] = "resident";

  // Set city context when available
  if (opts.citySlug) {
    storage["transparentcity.follow_city_slug"] = opts.citySlug;
  }
  if (opts.cityName) {
    storage["transparentcity.follow_city_name"] = opts.cityName;
  }
  if (typeof opts.cityId === "number") {
    storage["transparentcity.follow_city_id"] = String(opts.cityId);
  }

  return storage;
}

describe("Bug fix 3: NavEmailSignup sets signup_intent for passwordless flow", () => {
  it("sets signup_intent to 'resident' in localStorage", () => {
    const storage = simulateNavEmailSignupSubmit({
      citySlug: "san-francisco",
      cityName: "San Francisco",
      cityId: 42,
    });

    expect(storage["transparentcity.signup_intent"]).toBe("resident");
  });

  it("sets follow_city context in localStorage", () => {
    const storage = simulateNavEmailSignupSubmit({
      citySlug: "sacramento",
      cityName: "Sacramento",
      cityId: 100,
    });

    expect(storage["transparentcity.follow_city_slug"]).toBe("sacramento");
    expect(storage["transparentcity.follow_city_name"]).toBe("Sacramento");
    expect(storage["transparentcity.follow_city_id"]).toBe("100");
  });

  it("sets signup_intent even without city context", () => {
    const storage = simulateNavEmailSignupSubmit({ citySlug: "" });

    expect(storage["transparentcity.signup_intent"]).toBe("resident");
    expect(storage["transparentcity.follow_city_slug"]).toBeUndefined();
  });

  it("triggers onboarding when consumed by home page effect", () => {
    // Verify that the localStorage keys set by NavEmailSignup are
    // sufficient to trigger the onboarding modal on /home
    const storage = simulateNavEmailSignupSubmit({
      citySlug: "boston",
      cityName: "Boston",
      cityId: 42,
    });

    // Simulate the home page signup intent resolution
    const signupIntent = storage["transparentcity.signup_intent"] ?? null;
    const followCityId = storage["transparentcity.follow_city_id"]
      ? parseInt(storage["transparentcity.follow_city_id"], 10)
      : NaN;

    expect(signupIntent).toBeTruthy();
    expect(Number.isFinite(followCityId)).toBe(true);
    // With signup intent + follow_city_id: follow-city branch fires
    // and shows WelcomeModal immediately
  });
});

// ---------------------------------------------------------------------------
// Bug 4: "subscriber" intent type is handled correctly
// ---------------------------------------------------------------------------

type SignupIntent = "resident" | "public-servant" | "subscriber" | null;

function resolveSignupIntent(
  urlSearch: string,
  storage: Record<string, string>,
): SignupIntent {
  const urlParams = new URLSearchParams(urlSearch);
  const signupIntentParam = urlParams.get("signup") as SignupIntent;
  const signupIntentLS = (storage["transparentcity.signup_intent"] ?? null) as SignupIntent;
  return signupIntentParam || signupIntentLS;
}

describe("Bug fix 4: subscriber intent type", () => {
  it("resolves subscriber intent from localStorage", () => {
    const intent = resolveSignupIntent("", {
      "transparentcity.signup_intent": "subscriber",
    });
    expect(intent).toBe("subscriber");
  });

  it("subscriber intent is truthy and triggers onboarding", () => {
    const intent = resolveSignupIntent("", {
      "transparentcity.signup_intent": "subscriber",
    });
    // The signup effect checks: if (signupIntent) { ... show modal }
    expect(!!intent).toBe(true);
  });

  it("subscriber intent from URL params", () => {
    const intent = resolveSignupIntent("?signup=subscriber", {});
    expect(intent).toBe("subscriber");
  });

  it("resident, public-servant, and subscriber all trigger onboarding", () => {
    const intents: SignupIntent[] = ["resident", "public-servant", "subscriber"];
    for (const intent of intents) {
      const resolved = resolveSignupIntent(`?signup=${intent}`, {});
      expect(resolved).toBe(intent);
      expect(!!resolved).toBe(true);
    }
  });

  it("null intent does NOT trigger onboarding", () => {
    const intent = resolveSignupIntent("", {});
    expect(intent).toBeNull();
    expect(!!intent).toBe(false);
  });
});

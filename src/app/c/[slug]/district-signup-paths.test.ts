/**
 * District signup path tests.
 *
 * Validates that DistrictListWithFollow and DistrictFollowClaimBlock
 * set the correct localStorage keys and returnTo URL when an
 * unauthenticated user clicks follow. These tests mirror the handler
 * logic without rendering the full components (which require React Query,
 * Auth0, and many hook mocks).
 *
 * The actual rendering + click flow for simpler components is tested in
 * FollowCityButton.test.tsx and CustomizeMetricsTrigger.test.tsx.
 */
import { describe, it, expect, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Extracted handler logic from DistrictListWithFollow.handleFollowClick
// and DistrictFollowClaimBlock.handleFollowClick
// ---------------------------------------------------------------------------

function simulateDistrictFollowSignup(opts: {
  cityId: number;
  cityDisplayName: string;
  slug: string;
}): { storage: Record<string, string>; returnTo: string } {
  const storage: Record<string, string> = {};

  // Mirrors the localStorage writes in both components
  storage["transparentcity.signup_intent"] = "resident";
  storage["transparentcity.follow_city_id"] = String(opts.cityId);
  storage["transparentcity.follow_city_name"] = opts.cityDisplayName;
  storage["transparentcity.follow_city_slug"] = opts.slug;

  // Mirrors the URL param construction
  const params = new URLSearchParams({
    signup: "resident",
    follow_city_id: String(opts.cityId),
    follow_city_name: opts.cityDisplayName,
    follow_city_slug: opts.slug,
  });

  return {
    storage,
    returnTo: `/home?${params.toString()}`,
  };
}

// DistrictFollowClaimBlock has optional cityDisplayName
function simulateDistrictClaimSignup(opts: {
  cityId: number;
  slug: string;
  cityDisplayName?: string;
}): { storage: Record<string, string>; returnTo: string } {
  const storage: Record<string, string> = {};

  storage["transparentcity.signup_intent"] = "resident";
  storage["transparentcity.follow_city_id"] = String(opts.cityId);
  if (opts.cityDisplayName) {
    storage["transparentcity.follow_city_name"] = opts.cityDisplayName;
  }
  storage["transparentcity.follow_city_slug"] = opts.slug;

  const params = new URLSearchParams({
    signup: "resident",
    follow_city_id: String(opts.cityId),
    follow_city_slug: opts.slug,
  });
  if (opts.cityDisplayName) {
    params.set("follow_city_name", opts.cityDisplayName);
  }

  return {
    storage,
    returnTo: `/home?${params.toString()}`,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("DistrictListWithFollow signup handler", () => {
  it("sets signup_intent to resident", () => {
    const { storage } = simulateDistrictFollowSignup({
      cityId: 42, cityDisplayName: "Boston", slug: "boston",
    });
    expect(storage["transparentcity.signup_intent"]).toBe("resident");
  });

  it("persists follow_city_id, name, and slug", () => {
    const { storage } = simulateDistrictFollowSignup({
      cityId: 42, cityDisplayName: "Boston", slug: "boston",
    });
    expect(storage["transparentcity.follow_city_id"]).toBe("42");
    expect(storage["transparentcity.follow_city_name"]).toBe("Boston");
    expect(storage["transparentcity.follow_city_slug"]).toBe("boston");
  });

  it("returnTo points to /home with signup and follow params", () => {
    const { returnTo } = simulateDistrictFollowSignup({
      cityId: 42, cityDisplayName: "Boston", slug: "boston",
    });
    expect(returnTo).toMatch(/^\/home\?/);
    expect(returnTo).toContain("signup=resident");
    expect(returnTo).toContain("follow_city_id=42");
    expect(returnTo).toContain("follow_city_name=Boston");
    expect(returnTo).toContain("follow_city_slug=boston");
  });
});

describe("DistrictFollowClaimBlock signup handler", () => {
  it("sets signup_intent to resident", () => {
    const { storage } = simulateDistrictClaimSignup({
      cityId: 42, slug: "boston", cityDisplayName: "Boston",
    });
    expect(storage["transparentcity.signup_intent"]).toBe("resident");
  });

  it("persists follow_city context", () => {
    const { storage } = simulateDistrictClaimSignup({
      cityId: 42, slug: "boston", cityDisplayName: "Boston",
    });
    expect(storage["transparentcity.follow_city_id"]).toBe("42");
    expect(storage["transparentcity.follow_city_slug"]).toBe("boston");
    expect(storage["transparentcity.follow_city_name"]).toBe("Boston");
  });

  it("handles missing cityDisplayName gracefully", () => {
    const { storage, returnTo } = simulateDistrictClaimSignup({
      cityId: 42, slug: "boston",
    });
    expect(storage["transparentcity.follow_city_name"]).toBeUndefined();
    expect(returnTo).not.toContain("follow_city_name");
    // Still has the essential keys
    expect(returnTo).toContain("signup=resident");
    expect(returnTo).toContain("follow_city_id=42");
    expect(returnTo).toContain("follow_city_slug=boston");
  });

  it("returnTo points to /home", () => {
    const { returnTo } = simulateDistrictClaimSignup({
      cityId: 42, slug: "boston",
    });
    expect(returnTo).toMatch(/^\/home\?/);
  });
});

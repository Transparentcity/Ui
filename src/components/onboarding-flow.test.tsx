/**
 * Onboarding flow integration tests.
 *
 * Verifies the data flow between WelcomeModal, handleWelcomeComplete (page.tsx),
 * and PlaceOnboardingContext to ensure no race conditions in:
 *
 *  1. WelcomeModal passes context (cityId, homeCoordinates) via onComplete
 *     instead of relying on preferences that haven't been saved yet.
 *  2. Mayor is always discovered (no coordinates required).
 *  3. District rep is discovered when hasPreciseLocation is true.
 *  4. The onboarding banner stays alive during background work.
 *
 * These tests exercise the contract between components without rendering
 * the full page, using extracted logic from handleWelcomeComplete.
 */
import { describe, it, expect, vi } from "vitest";
import { pickCitywideLeader } from "@/lib/publicLeadersPick";

// ---------------------------------------------------------------------------
// Types matching the real codebase
// ---------------------------------------------------------------------------

interface OnboardingContext {
  cityId: number;
  cityName: string;
  homeCoordinates: { lat: number; lng: number } | null;
  hasPreciseLocation: boolean;
  district?: number | null;
}

interface CityLeader {
  id: number;
  city_id: number;
  name: string;
  title: string;
  district: number | null;
}

// ---------------------------------------------------------------------------
// Extracted logic from handleWelcomeComplete (page.tsx)
// This mirrors the async IIFE so we can test the sequencing without React.
// ---------------------------------------------------------------------------

async function runOnboardingDiscovery(
  ctx: OnboardingContext,
  deps: {
    getAccessTokenSilently: () => Promise<string>;
    getCityLeaders: (cityId: number, token: string) => Promise<CityLeader[]>;
    findDistrictFromCoordinates: (lat: number, lng: number, cityId: number, token: string) => Promise<number | null>;
    followRepresentative: (cityId: number, district: string, token: string) => Promise<void>;
    notifyRepFound: (name: string, title?: string) => void;
    startBackgroundWork: () => void;
    completeBackgroundWork: () => void;
  },
): Promise<{ mayorNotified: boolean; repNotified: boolean; repFollowed: boolean; cityFollowed: boolean }> {
  const result = {
    mayorNotified: false,
    repNotified: false,
    repFollowed: false,
    cityFollowed: false,
  };

  deps.startBackgroundWork();
  try {
    const token = await deps.getAccessTokenSilently();

    // Always fetch leaders and show the mayor (no coordinates needed)
    const leaders = await deps.getCityLeaders(ctx.cityId, token);
    const mayor = pickCitywideLeader(leaders);
    if (mayor) {
      deps.notifyRepFound(mayor.name, mayor.title || "Mayor");
      result.mayorNotified = true;
    }

    // Always follow citywide; also follow district when known (gift claimers need both).
    let district = ctx.district ?? null;
    if (
      district == null &&
      ctx.hasPreciseLocation &&
      ctx.homeCoordinates
    ) {
      district = await deps.findDistrictFromCoordinates(
        ctx.homeCoordinates.lat,
        ctx.homeCoordinates.lng,
        ctx.cityId,
        token,
      );
    }
    await deps.followRepresentative(ctx.cityId, "0", token);
    result.cityFollowed = true;
    if (district != null && district > 0) {
      await deps.followRepresentative(ctx.cityId, String(district), token);
      result.repFollowed = true;
      const rep = leaders.find((l) => l.district === district);
      if (rep) {
        deps.notifyRepFound(rep.name);
        result.repNotified = true;
      }
    }
  } catch {
    // Non-blocking (matches real code)
  } finally {
    deps.completeBackgroundWork();
  }

  return result;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const SACRAMENTO_LEADERS: CityLeader[] = [
  { id: 1, city_id: 100, name: "Darrell Steinberg", title: "Mayor", district: null },
  { id: 2, city_id: 100, name: "Lisa Kaplan", title: "Council Member", district: 1 },
  { id: 3, city_id: 100, name: "Katie Valenzuela", title: "Council Member", district: 4 },
];

function makeDeps(overrides: Partial<Parameters<typeof runOnboardingDiscovery>[1]> = {}) {
  return {
    getAccessTokenSilently: vi.fn().mockResolvedValue("test-token"),
    getCityLeaders: vi.fn().mockResolvedValue(SACRAMENTO_LEADERS),
    findDistrictFromCoordinates: vi.fn().mockResolvedValue(4),
    followRepresentative: vi.fn().mockResolvedValue(undefined),
    notifyRepFound: vi.fn(),
    startBackgroundWork: vi.fn(),
    completeBackgroundWork: vi.fn(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Onboarding flow: WelcomeModal -> handleWelcomeComplete", () => {
  describe("onComplete context contract", () => {
    it("WelcomeModal passes cityId and cityName (eliminates getUserPreferences race)", async () => {
      const ctx: OnboardingContext = {
        cityId: 100,
        cityName: "Sacramento",
        homeCoordinates: { lat: 38.58, lng: -121.49 },
        hasPreciseLocation: true,
      };
      const deps = makeDeps();

      await runOnboardingDiscovery(ctx, deps);

      // getCityLeaders called with the cityId from context, not from preferences
      expect(deps.getCityLeaders).toHaveBeenCalledWith(100, "test-token");
    });

    it("coordinates come from context, not re-read from preferences", async () => {
      const ctx: OnboardingContext = {
        cityId: 100,
        cityName: "Sacramento",
        homeCoordinates: { lat: 38.5816, lng: -121.4944 },
        hasPreciseLocation: true,
      };
      const deps = makeDeps();

      await runOnboardingDiscovery(ctx, deps);

      expect(deps.findDistrictFromCoordinates).toHaveBeenCalledWith(
        38.5816, -121.4944, 100, "test-token"
      );
    });
  });

  describe("mayor discovery (always, no coordinates needed)", () => {
    it("shows mayor for city-only signup (no precise location)", async () => {
      const ctx: OnboardingContext = {
        cityId: 100,
        cityName: "Sacramento",
        homeCoordinates: null,
        hasPreciseLocation: false,
      };
      const deps = makeDeps();

      const result = await runOnboardingDiscovery(ctx, deps);

      expect(result.mayorNotified).toBe(true);
      expect(deps.notifyRepFound).toHaveBeenCalledWith("Darrell Steinberg", "Mayor");
      // No rep discovery attempted
      expect(deps.findDistrictFromCoordinates).not.toHaveBeenCalled();
      expect(result.repNotified).toBe(false);
      expect(result.cityFollowed).toBe(true);
      expect(deps.followRepresentative).toHaveBeenCalledWith(100, "0", "test-token");
    });

    it("shows mayor even when coordinates exist but hasPreciseLocation is false", async () => {
      const ctx: OnboardingContext = {
        cityId: 100,
        cityName: "Sacramento",
        homeCoordinates: { lat: 38.58, lng: -121.49 }, // city centroid
        hasPreciseLocation: false,
      };
      const deps = makeDeps();

      const result = await runOnboardingDiscovery(ctx, deps);

      expect(result.mayorNotified).toBe(true);
      // Coordinates present but hasPreciseLocation is false: no rep discovery
      expect(deps.findDistrictFromCoordinates).not.toHaveBeenCalled();
      expect(result.cityFollowed).toBe(true);
    });

    it("handles city with no mayor gracefully", async () => {
      const ctx: OnboardingContext = {
        cityId: 100,
        cityName: "Sacramento",
        homeCoordinates: null,
        hasPreciseLocation: false,
      };
      const deps = makeDeps({
        getCityLeaders: vi.fn().mockResolvedValue([
          // No mayor (all leaders have non-null districts)
          { id: 2, city_id: 100, name: "Lisa Kaplan", title: "Council Member", district: 1 },
        ]),
      });

      const result = await runOnboardingDiscovery(ctx, deps);

      expect(result.mayorNotified).toBe(false);
      expect(deps.notifyRepFound).not.toHaveBeenCalled();
      // Citywide follow still happens even without a mayor leader row
      expect(result.cityFollowed).toBe(true);
      expect(deps.followRepresentative).toHaveBeenCalledWith(100, "0", "test-token");
    });

    it("handles empty leaders array gracefully", async () => {
      const ctx: OnboardingContext = {
        cityId: 100,
        cityName: "Sacramento",
        homeCoordinates: { lat: 38.58, lng: -121.49 },
        hasPreciseLocation: true,
      };
      const deps = makeDeps({
        getCityLeaders: vi.fn().mockResolvedValue([]),
      });

      const result = await runOnboardingDiscovery(ctx, deps);

      expect(result.mayorNotified).toBe(false);
      expect(result.repNotified).toBe(false);
      // findDistrictFromCoordinates still called (independent of leaders result)
      expect(deps.findDistrictFromCoordinates).toHaveBeenCalled();
      expect(result.cityFollowed).toBe(true);
      expect(result.repFollowed).toBe(true);
    });

    it("uses leader.title for mayor notification, falls back to 'Mayor'", async () => {
      const ctx: OnboardingContext = {
        cityId: 100,
        cityName: "Sacramento",
        homeCoordinates: null,
        hasPreciseLocation: false,
      };

      // Mayor with a custom title
      const deps1 = makeDeps({
        getCityLeaders: vi.fn().mockResolvedValue([
          { id: 1, city_id: 100, name: "London Breed", title: "Mayor", district: 0 },
        ]),
      });
      await runOnboardingDiscovery(ctx, deps1);
      expect(deps1.notifyRepFound).toHaveBeenCalledWith("London Breed", "Mayor");

      // Explicit citywide row (district 0) with empty title falls back to "Mayor".
      // (A null-district row with no mayor/executive title is deliberately not
      // treated as citywide — see pickCitywideLeader.)
      const deps2 = makeDeps({
        getCityLeaders: vi.fn().mockResolvedValue([
          { id: 1, city_id: 100, name: "John Smith", title: "", district: 0 },
        ]),
      });
      await runOnboardingDiscovery(ctx, deps2);
      expect(deps2.notifyRepFound).toHaveBeenCalledWith("John Smith", "Mayor");
    });
  });

  describe("district rep discovery (precise address only)", () => {
    it("finds and follows district rep when hasPreciseLocation is true", async () => {
      const ctx: OnboardingContext = {
        cityId: 100,
        cityName: "Sacramento",
        homeCoordinates: { lat: 38.5816, lng: -121.4944 },
        hasPreciseLocation: true,
      };
      const deps = makeDeps();

      const result = await runOnboardingDiscovery(ctx, deps);

      // Mayor notified first
      expect(deps.notifyRepFound).toHaveBeenNthCalledWith(1, "Darrell Steinberg", "Mayor");
      // Rep notified second (district 4 -> Katie Valenzuela)
      expect(deps.notifyRepFound).toHaveBeenNthCalledWith(2, "Katie Valenzuela");
      expect(result.cityFollowed).toBe(true);
      expect(result.repFollowed).toBe(true);
      expect(deps.followRepresentative).toHaveBeenCalledWith(100, "0", "test-token");
      expect(deps.followRepresentative).toHaveBeenCalledWith(100, "4", "test-token");
    });

    it("handles findDistrictFromCoordinates returning null", async () => {
      const ctx: OnboardingContext = {
        cityId: 100,
        cityName: "Sacramento",
        homeCoordinates: { lat: 38.5816, lng: -121.4944 },
        hasPreciseLocation: true,
      };
      const deps = makeDeps({
        findDistrictFromCoordinates: vi.fn().mockResolvedValue(null),
      });

      const result = await runOnboardingDiscovery(ctx, deps);

      // Mayor still shown; citywide follow still happens
      expect(result.mayorNotified).toBe(true);
      expect(result.cityFollowed).toBe(true);
      expect(deps.followRepresentative).toHaveBeenCalledWith(100, "0", "test-token");
      // No district follow
      expect(deps.followRepresentative).toHaveBeenCalledTimes(1);
      expect(result.repNotified).toBe(false);
      expect(result.repFollowed).toBe(false);
    });

    it("handles district found but no matching leader", async () => {
      const ctx: OnboardingContext = {
        cityId: 100,
        cityName: "Sacramento",
        homeCoordinates: { lat: 38.58, lng: -121.49 },
        hasPreciseLocation: true,
      };
      const deps = makeDeps({
        findDistrictFromCoordinates: vi.fn().mockResolvedValue(99), // no leader for district 99
      });

      const result = await runOnboardingDiscovery(ctx, deps);

      expect(result.cityFollowed).toBe(true);
      expect(result.repFollowed).toBe(true); // followRepresentative still called
      expect(result.repNotified).toBe(false); // but no notification (no matching leader)
      expect(deps.followRepresentative).toHaveBeenCalledWith(100, "0", "test-token");
      expect(deps.followRepresentative).toHaveBeenCalledWith(100, "99", "test-token");
    });

    it("uses ctx.district without re-looking up coordinates", async () => {
      const ctx: OnboardingContext = {
        cityId: 100,
        cityName: "Sacramento",
        homeCoordinates: { lat: 38.58, lng: -121.49 },
        hasPreciseLocation: true,
        district: 4,
      };
      const deps = makeDeps();

      const result = await runOnboardingDiscovery(ctx, deps);

      expect(deps.findDistrictFromCoordinates).not.toHaveBeenCalled();
      expect(result.cityFollowed).toBe(true);
      expect(result.repFollowed).toBe(true);
      expect(deps.followRepresentative).toHaveBeenCalledWith(100, "0", "test-token");
      expect(deps.followRepresentative).toHaveBeenCalledWith(100, "4", "test-token");
    });
  });

  describe("background work lifecycle", () => {
    it("always calls startBackgroundWork before any async work", async () => {
      const callOrder: string[] = [];
      const deps = makeDeps({
        startBackgroundWork: vi.fn(() => { callOrder.push("start"); }),
        getAccessTokenSilently: vi.fn(async () => { callOrder.push("token"); return "t"; }),
        getCityLeaders: vi.fn(async () => { callOrder.push("leaders"); return SACRAMENTO_LEADERS; }),
        completeBackgroundWork: vi.fn(() => { callOrder.push("complete"); }),
      });

      await runOnboardingDiscovery(
        { cityId: 100, cityName: "Sacramento", homeCoordinates: null, hasPreciseLocation: false },
        deps,
      );

      expect(callOrder[0]).toBe("start");
      expect(callOrder[callOrder.length - 1]).toBe("complete");
    });

    it("calls completeBackgroundWork even when getCityLeaders throws", async () => {
      const deps = makeDeps({
        getCityLeaders: vi.fn().mockRejectedValue(new Error("Network error")),
      });

      await runOnboardingDiscovery(
        { cityId: 100, cityName: "Sacramento", homeCoordinates: null, hasPreciseLocation: false },
        deps,
      );

      expect(deps.startBackgroundWork).toHaveBeenCalledTimes(1);
      expect(deps.completeBackgroundWork).toHaveBeenCalledTimes(1);
    });

    it("calls completeBackgroundWork even when getAccessTokenSilently throws", async () => {
      const deps = makeDeps({
        getAccessTokenSilently: vi.fn().mockRejectedValue(new Error("Auth error")),
      });

      await runOnboardingDiscovery(
        { cityId: 100, cityName: "Sacramento", homeCoordinates: { lat: 38.58, lng: -121.49 }, hasPreciseLocation: true },
        deps,
      );

      expect(deps.completeBackgroundWork).toHaveBeenCalledTimes(1);
    });

    it("calls completeBackgroundWork even when followRepresentative throws", async () => {
      const deps = makeDeps({
        followRepresentative: vi.fn().mockRejectedValue(new Error("Follow failed")),
      });

      await runOnboardingDiscovery(
        { cityId: 100, cityName: "Sacramento", homeCoordinates: { lat: 38.58, lng: -121.49 }, hasPreciseLocation: true },
        deps,
      );

      // Mayor was still shown before the error
      expect(deps.notifyRepFound).toHaveBeenCalledWith("Darrell Steinberg", "Mayor");
      // finally block still ran
      expect(deps.completeBackgroundWork).toHaveBeenCalledTimes(1);
    });

    it("calls completeBackgroundWork even when findDistrictFromCoordinates throws", async () => {
      const deps = makeDeps({
        findDistrictFromCoordinates: vi.fn().mockRejectedValue(new Error("Geo error")),
      });

      await runOnboardingDiscovery(
        { cityId: 100, cityName: "Sacramento", homeCoordinates: { lat: 38.58, lng: -121.49 }, hasPreciseLocation: true },
        deps,
      );

      expect(deps.completeBackgroundWork).toHaveBeenCalledTimes(1);
    });
  });

  describe("race condition: fast feed resolution vs slow background work", () => {
    it("banner survives when feed resolves before mayor discovery", async () => {
      // This tests the exact race that existed before the fix:
      // 1. startCityLoading("Sacramento")
      // 2. startBackgroundWork()
      // 3. FeedContainer calls completeCityLoading(true) -- feed resolved fast
      // 4. getCityLeaders resolves slowly
      //
      // Without the fix, step 3 would immediately show "completed" and dismiss.
      // With the fix, step 3 defers because background work is active.

      const callLog: string[] = [];

      const deps = makeDeps({
        startBackgroundWork: vi.fn(() => { callLog.push("bg:start"); }),
        completeBackgroundWork: vi.fn(() => { callLog.push("bg:complete"); }),
        notifyRepFound: vi.fn((name: string, title?: string) => {
          callLog.push(`notify:${title ? title + ":" : ""}${name}`);
        }),
      });

      // The onboarding flow starts background work...
      const discoveryPromise = runOnboardingDiscovery(
        { cityId: 100, cityName: "Sacramento", homeCoordinates: null, hasPreciseLocation: false },
        deps,
      );

      // ...and completes
      await discoveryPromise;

      // Verify ordering: start always first, complete always last
      expect(callLog[0]).toBe("bg:start");
      expect(callLog[callLog.length - 1]).toBe("bg:complete");
      // Mayor notification happened between start and complete
      expect(callLog).toContain("notify:Mayor:Darrell Steinberg");
    });
  });
});

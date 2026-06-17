import { describe, expect, it } from "vitest";
import { resolveHomePlaceLandingTarget } from "./resolveHomePlaceLanding";
import type { UserPlace } from "@/lib/apiClient";

const place = (id: number, cityId: number, lat: number, lng: number): UserPlace => ({
  id,
  user_id: "auth0|1",
  city_id: cityId,
  label: `Place ${id}`,
  lat,
  lng,
  radius_m: 500,
  created_at: null,
  updated_at: null,
});

describe("resolveHomePlaceLandingTarget", () => {
  it("returns explicit home place_id from preferences", () => {
    const target = resolveHomePlaceLandingTarget(
      { home_location: { city_id: 10, place_id: 42 } },
      [place(42, 10, 37.77, -122.42)],
    );
    expect(target).toEqual({ cityId: 10, placeId: 42 });
  });

  it("returns null when home is city-only without coordinates or place", () => {
    expect(
      resolveHomePlaceLandingTarget(
        { home_location: { city_id: 10, district: 3 } },
        [place(1, 10, 37.77, -122.42)],
      ),
    ).toBeNull();
  });

  it("uses the only saved place when home has coordinates", () => {
    const target = resolveHomePlaceLandingTarget(
      {
        home_location: {
          city_id: 10,
          coordinates: { lat: 37.77, lng: -122.42 },
        },
      },
      [place(7, 10, 37.771, -122.421)],
    );
    expect(target).toEqual({ cityId: 10, placeId: 7 });
  });

  it("picks the closest place when multiple exist for the home city", () => {
    const places = [
      place(1, 10, 37.80, -122.40),
      place(2, 10, 37.77, -122.42),
      place(3, 10, 37.75, -122.44),
    ];
    const target = resolveHomePlaceLandingTarget(
      {
        home_location: {
          city_id: 10,
          coordinates: { lat: 37.77, lng: -122.42 },
        },
      },
      places,
    );
    expect(target).toEqual({ cityId: 10, placeId: 2 });
  });

  it("returns null when coordinates are set but no saved places exist yet", () => {
    expect(
      resolveHomePlaceLandingTarget(
        {
          home_location: {
            city_id: 10,
            coordinates: { lat: 37.77, lng: -122.42 },
          },
        },
        [],
      ),
    ).toBeNull();
  });
});

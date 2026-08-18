import { describe, expect, it } from "vitest";
import type { AdminUserNewsletterOverview, CityListItem } from "@/lib/apiClient";
import { deriveUserGenerationDefaults } from "./NewsletterAdmin";

const cities = [
  { city_id: 1, city_name: "San Francisco", state: "CA" },
  { city_id: 2, city_name: "Oakland", state: "CA" },
] as unknown as CityListItem[];

function overview(
  overrides: Partial<AdminUserNewsletterOverview> = {}
): AdminUserNewsletterOverview {
  return {
    user_id: 42,
    email: "resident@example.com",
    name: "Resident",
    communication_preferences: {},
    newsletter_description: "",
    newsletter_frequency: "weekly",
    home_location: null,
    subscriptions: [],
    ...overrides,
  };
}

describe("deriveUserGenerationDefaults", () => {
  it("prefers the subscriber's home city and district", () => {
    const defaults = deriveUserGenerationDefaults(
      overview({
        home_location: { city_id: 1, district: 6 },
        newsletter_frequency: "monthly",
      }),
      cities
    );
    expect(defaults).toEqual({ cityId: 1, district: "6", frequency: "monthly" });
  });

  it("treats a string district from home_location as the dropdown value", () => {
    const defaults = deriveUserGenerationDefaults(
      overview({ home_location: { city_id: 2, district: " 3 " } }),
      cities
    );
    expect(defaults.cityId).toBe(2);
    expect(defaults.district).toBe("3");
  });

  it("falls back to city-wide when the home district is missing or zero", () => {
    expect(
      deriveUserGenerationDefaults(
        overview({ home_location: { city_id: 1, district: null } }),
        cities
      ).district
    ).toBe("0");
    expect(
      deriveUserGenerationDefaults(
        overview({ home_location: { city_id: 1, district: "0" } }),
        cities
      ).district
    ).toBe("0");
  });

  it("ignores districts outside the dropdown range", () => {
    const defaults = deriveUserGenerationDefaults(
      overview({ home_location: { city_id: 1, district: "Mission" } }),
      cities
    );
    expect(defaults.district).toBe("0");
  });

  it("uses a followed district when there is no home location", () => {
    const defaults = deriveUserGenerationDefaults(
      overview({
        subscriptions: [
          { city_id: 2, district: "0", frequency: "weekly" },
          { city_id: 1, district: "9", frequency: "weekly" },
        ],
      }),
      cities
    );
    expect(defaults).toEqual({ cityId: 1, district: "9", frequency: "weekly" });
  });

  it("uses a city-wide follow when no district follow exists", () => {
    const defaults = deriveUserGenerationDefaults(
      overview({ subscriptions: [{ city_id: 2, district: "0", frequency: "weekly" }] }),
      cities
    );
    expect(defaults).toEqual({ cityId: 2, district: "0", frequency: "weekly" });
  });

  it("leaves the city unselected when nothing matches the admin city list", () => {
    const defaults = deriveUserGenerationDefaults(
      overview({
        home_location: { city_id: 99, district: 4 },
        subscriptions: [{ city_id: 98, district: "2", frequency: "weekly" }],
      }),
      cities
    );
    expect(defaults).toEqual({ cityId: null, district: "0", frequency: "weekly" });
  });
});

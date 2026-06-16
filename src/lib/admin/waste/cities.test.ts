import { describe, it, expect } from "vitest";
import {
  WASTE_CITIES,
  getWasteCity,
  getWasteApiSlug,
} from "./cities";

describe("WASTE_CITIES", () => {
  it("only lists waste-configured cities (SF + Chicago, no NYC)", () => {
    const ids = WASTE_CITIES.map((c) => c.id).sort();
    expect(ids).toEqual(["chi", "sf"]);
    expect(WASTE_CITIES.find((c) => c.id === "nyc")).toBeUndefined();
  });

  it("every listed city is launched", () => {
    expect(WASTE_CITIES.every((c) => c.launched)).toBe(true);
  });
});

describe("getWasteCity", () => {
  it("defaults to San Francisco when no param", () => {
    expect(getWasteCity(null).id).toBe("sf");
    expect(getWasteCity(undefined).id).toBe("sf");
  });
  it("resolves by short id and by api slug", () => {
    expect(getWasteCity("chi").name).toBe("Chicago");
    expect(getWasteCity("chicago").name).toBe("Chicago");
  });
  it("falls back to SF for an unknown / dropped city (e.g. nyc)", () => {
    expect(getWasteCity("nyc").id).toBe("sf");
    expect(getWasteCity("atlantis").id).toBe("sf");
  });
});

describe("getWasteApiSlug", () => {
  it("maps short id to backend slug", () => {
    expect(getWasteApiSlug("sf")).toBe("san-francisco");
    expect(getWasteApiSlug("chi")).toBe("chicago");
  });
  it("defaults to SF slug when empty", () => {
    expect(getWasteApiSlug(null)).toBe("san-francisco");
  });
  it("resolves a removed/unknown city to the SF default (matches getWasteCity, no header/data mismatch)", () => {
    expect(getWasteApiSlug("nyc")).toBe("san-francisco");
    expect(getWasteApiSlug("some-future-city")).toBe("san-francisco");
  });
});

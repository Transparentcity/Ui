import { describe, expect, it } from "vitest";
import {
  cityDisplayExactlyMatchesQuery,
  getDirectMatchDisplayCity,
  isPreciseAddressSuggestion,
  type CitySearchListItem,
  type AddressSuggestion,
} from "./locationSearchUtils";

const sf: CitySearchListItem = {
  id: 1,
  name: "San Francisco",
  display_name: "San Francisco, California, United States",
  state: "CA",
};

const sf2: CitySearchListItem = {
  id: 2,
  name: "South San Francisco",
  display_name: "South San Francisco, California, United States",
  state: "CA",
};

describe("cityDisplayExactlyMatchesQuery", () => {
  it("matches display_name case-insensitively", () => {
    expect(cityDisplayExactlyMatchesQuery(sf, "San Francisco, California, United States")).toBe(true);
  });

  it("matches name alone", () => {
    expect(cityDisplayExactlyMatchesQuery(sf, "San Francisco")).toBe(true);
  });

  it("matches city and state short form", () => {
    expect(cityDisplayExactlyMatchesQuery(sf, "San Francisco, CA")).toBe(true);
  });

  it("rejects partial", () => {
    expect(cityDisplayExactlyMatchesQuery(sf, "San Fran")).toBe(false);
  });
});

describe("getDirectMatchDisplayCity", () => {
  it("returns the only exact hit when multiple results but one exact", () => {
    const r = getDirectMatchDisplayCity([sf, sf2], "San Francisco, CA");
    expect(r?.id).toBe(1);
  });

  it("returns null when ambiguous", () => {
    const springfield: CitySearchListItem = {
      id: 3,
      name: "Springfield",
      display_name: "Springfield, IL, USA",
      state: "IL",
    };
    const springfield2: CitySearchListItem = {
      id: 4,
      name: "Springfield",
      display_name: "Springfield, MA, USA",
      state: "MA",
    };
    expect(getDirectMatchDisplayCity([springfield, springfield2], "Springfield")).toBeNull();
  });

  it("returns single result when first segment matches query", () => {
    const r = getDirectMatchDisplayCity([sf], "San Francisco");
    expect(r?.id).toBe(1);
  });
});

describe("isPreciseAddressSuggestion", () => {
  it("treats missing place_types as precise", () => {
    const s: AddressSuggestion = {
      place_name: "123 Main St",
      lat: 0,
      lon: 0,
      cityName: "X",
      stateName: null,
      countryName: null,
    };
    expect(isPreciseAddressSuggestion(s)).toBe(true);
  });

  it("detects address type", () => {
    const s: AddressSuggestion = {
      place_name: "123 Main St",
      lat: 0,
      lon: 0,
      cityName: "X",
      stateName: null,
      countryName: null,
      place_types: ["address"],
    };
    expect(isPreciseAddressSuggestion(s)).toBe(true);
  });

  it("treats place-only as not precise", () => {
    const s: AddressSuggestion = {
      place_name: "San Francisco",
      lat: 0,
      lon: 0,
      cityName: "San Francisco",
      stateName: "CA",
      countryName: null,
      place_types: ["place"],
    };
    expect(isPreciseAddressSuggestion(s)).toBe(false);
  });

  it("treats postcode-only as not precise", () => {
    const s: AddressSuggestion = {
      place_name: "94107",
      lat: 0,
      lon: 0,
      cityName: null,
      stateName: null,
      countryName: null,
      place_types: ["postcode"],
    };
    expect(isPreciseAddressSuggestion(s)).toBe(false);
  });
});

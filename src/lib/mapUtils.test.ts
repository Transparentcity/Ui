import { describe, expect, it } from "vitest";

import {
  choroplethDistrictKeyAliases,
  MAP_BRAND_PURPLE,
  MAP_SERIES_OTHER_COLOR,
  normalizeChoroplethDistrictKey,
  seriesMatchFallbackColor,
} from "./mapUtils";

describe("normalizeChoroplethDistrictKey", () => {
  it("strips leading zeros from numeric ids", () => {
    expect(normalizeChoroplethDistrictKey("02")).toBe("2");
  });

  it("lowercases text ids", () => {
    expect(normalizeChoroplethDistrictKey(" CCD1 ")).toBe("ccd1");
  });

  it("returns empty string for nullish values", () => {
    expect(normalizeChoroplethDistrictKey(null)).toBe("");
    expect(normalizeChoroplethDistrictKey("  ")).toBe("");
  });
});

describe("seriesMatchFallbackColor", () => {
  it("uses a neutral Other swatch when none is configured", () => {
    expect(seriesMatchFallbackColor(undefined)).toBe(MAP_SERIES_OTHER_COLOR);
    expect(seriesMatchFallbackColor({})).toBe(MAP_SERIES_OTHER_COLOR);
  });

  it("prefers a distinct configured Other color", () => {
    expect(seriesMatchFallbackColor({ Other: "#64748b" })).toBe("#64748b");
  });

  it("replaces legacy purple Other with the neutral swatch", () => {
    expect(seriesMatchFallbackColor({ Other: MAP_BRAND_PURPLE })).toBe(
      MAP_SERIES_OTHER_COLOR
    );
  });
});

describe("choroplethDistrictKeyAliases", () => {
  it("returns just the normalized key for plain numbers", () => {
    expect(choroplethDistrictKeyAliases("3")).toEqual(["3"]);
    expect(choroplethDistrictKeyAliases(7)).toEqual(["7"]);
  });

  it("adds the trailing number for alpha-prefixed ids (Oakland CCD1 vs district_num 1)", () => {
    expect(choroplethDistrictKeyAliases("CCD1")).toEqual(["ccd1", "1"]);
    expect(choroplethDistrictKeyAliases("D-5")).toEqual(["d-5", "5"]);
    expect(choroplethDistrictKeyAliases("Ward 03")).toEqual(["ward 03", "3"]);
  });

  it("does not add aliases for pure text ids", () => {
    expect(choroplethDistrictKeyAliases("Mission")).toEqual(["mission"]);
  });

  it("returns empty array for nullish values", () => {
    expect(choroplethDistrictKeyAliases(null)).toEqual([]);
    expect(choroplethDistrictKeyAliases("")).toEqual([]);
  });
});

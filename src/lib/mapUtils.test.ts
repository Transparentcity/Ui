import { describe, expect, it } from "vitest";

import {
  choroplethDistrictKeyAliases,
  choroplethFeatureDisplayName,
  collectChoroplethFeatureJoinValues,
  formatChoroplethAreaLabel,
  MAP_BRAND_PURPLE,
  MAP_SERIES_OTHER_COLOR,
  normalizeChoroplethDistrictKey,
  seriesMatchFallbackColor,
  shapefileDistrictDisplayNames,
} from "./mapUtils";

describe("normalizeChoroplethDistrictKey", () => {
  it("collapses whole-number floats and float strings to integers", () => {
    expect(normalizeChoroplethDistrictKey(10.0)).toBe("10");
    expect(normalizeChoroplethDistrictKey("10.0")).toBe("10");
    expect(normalizeChoroplethDistrictKey("10")).toBe("10");
  });

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
    expect(choroplethDistrictKeyAliases(10.0)).toEqual(["10"]);
    expect(choroplethDistrictKeyAliases("10.0")).toEqual(["10"]);
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

describe("Cincinnati SNA choropleth join", () => {
  const avondale = {
    SNA_NAME: "Avondale",
    SNA_NUMBER: 1,
    OBJECTID: 99,
  };

  it("collects both the name identifier and SNA_NUMBER", () => {
    expect(
      collectChoroplethFeatureJoinValues(avondale, ["SNA_NAME"])
    ).toEqual(["Avondale", 1]);
  });

  it("prefers SNA_NAME as the display label", () => {
    expect(choroplethFeatureDisplayName(avondale, "SNA_NAME")).toBe("Avondale");
  });

  it("maps integer comparison ids to neighborhood names", () => {
    const labels = shapefileDistrictDisplayNames({
      identifier_field: "SNA_NAME",
      district_field_names: ["police_district", "SNA_NAME"],
      geometry: {
        type: "FeatureCollection",
        features: [
          {
            type: "Feature",
            properties: avondale,
            geometry: { type: "Polygon", coordinates: [] },
          },
        ],
      },
    });
    expect(formatChoroplethAreaLabel(1, labels)).toBe("Avondale");
    expect(formatChoroplethAreaLabel("Avondale", labels)).toBe("Avondale");
    expect(formatChoroplethAreaLabel(2, labels)).toBe("District 2");
  });
});

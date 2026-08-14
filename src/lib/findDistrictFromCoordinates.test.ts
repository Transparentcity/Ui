import { describe, it, expect } from "vitest";

import {
  parseDistrictIdentifier,
  resolveDistrictFromShapefiles,
} from "./findDistrictFromCoordinates";
import type { CityShapefile } from "@/lib/apiClient";

// Simple unit squares so point-in-polygon is unambiguous.
const NORTH_AVONDALE_SQUARE = [
  [-84.45, 39.16],
  [-84.43, 39.16],
  [-84.43, 39.18],
  [-84.45, 39.18],
  [-84.45, 39.16],
];

const AVONDALE_SQUARE = [
  [-84.45, 39.13],
  [-84.43, 39.13],
  [-84.43, 39.15],
  [-84.45, 39.15],
  [-84.45, 39.13],
];

function makeLayer(overrides: Record<string, unknown>): CityShapefile {
  return overrides as unknown as CityShapefile;
}

function snaLayer(): CityShapefile {
  return makeLayer({
    id: 108,
    city_id: 56677,
    shapefile_name: "Cincinnati Neighborhoods (SNA)",
    structure_type: "neighborhood",
    // Name-identified layer: identifier_field points at the NAME, canonical
    // numeric id lives in SNA_NUMBER (matches the backend contract).
    identifier_field: "SNA_NAME",
    geometry_data: {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          properties: { SNA_NAME: "North Avondale", SNA_NUMBER: 30 },
          geometry: { type: "Polygon", coordinates: [NORTH_AVONDALE_SQUARE] },
        },
        {
          type: "Feature",
          properties: { SNA_NAME: "Avondale", SNA_NUMBER: 1 },
          geometry: { type: "Polygon", coordinates: [AVONDALE_SQUARE] },
        },
      ],
    },
  });
}

describe("resolveDistrictFromShapefiles (name-identified layers)", () => {
  it("falls back to SNA_NUMBER when the identifier is a pure name", () => {
    // "North Avondale" has no digits; parseInt of "" is NaN, so the resolver
    // must use SNA_NUMBER instead of returning null (previous behavior).
    const result = resolveDistrictFromShapefiles(39.17, -84.44, [snaLayer()], null, 108);
    expect(result).toBe(30);
  });

  it("does not confuse Avondale (1) with North Avondale (30)", () => {
    const result = resolveDistrictFromShapefiles(39.14, -84.44, [snaLayer()], null, 108);
    expect(result).toBe(1);
  });

  it("returns null outside all polygons", () => {
    const result = resolveDistrictFromShapefiles(40.0, -85.0, [snaLayer()], null, 108);
    expect(result).toBeNull();
  });

  it("still parses numeric-identified districts directly", () => {
    const layer = makeLayer({
      id: 5,
      city_id: 57260,
      shapefile_name: "Supervisor Districts",
      structure_type: "district",
      identifier_field: "supervisor_district",
      geometry_data: {
        type: "FeatureCollection",
        features: [
          {
            type: "Feature",
            properties: { supervisor_district: "District 7" },
            geometry: { type: "Polygon", coordinates: [NORTH_AVONDALE_SQUARE] },
          },
        ],
      },
    });
    const result = resolveDistrictFromShapefiles(39.17, -84.44, [layer], null, 5);
    expect(result).toBe(7);
  });
});

function zipLayer(): CityShapefile {
  return makeLayer({
    id: 99,
    city_id: 1,
    shapefile_name: "ZIP Codes",
    structure_type: "zip",
    identifier_field: "zip",
    geometry_data: {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          properties: { zip: "94102" },
          geometry: { type: "Polygon", coordinates: [NORTH_AVONDALE_SQUARE] },
        },
      ],
    },
  });
}

function supervisorLayer(): CityShapefile {
  return makeLayer({
    id: 5,
    city_id: 1,
    shapefile_name: "Supervisor Districts",
    structure_type: "district",
    identifier_field: "supervisor_district",
    is_official_district_layer: true,
    geometry_data: {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          properties: { supervisor_district: "6" },
          geometry: { type: "Polygon", coordinates: [NORTH_AVONDALE_SQUARE] },
        },
      ],
    },
  });
}

describe("resolveDistrictFromShapefiles (ZIP vs district)", () => {
  it("does not treat a ZIP code layer as the district", () => {
    const result = resolveDistrictFromShapefiles(39.17, -84.44, [zipLayer()]);
    expect(result).toBeNull();
  });

  it("uses the official district even when a ZIP layer is listed first", () => {
    const result = resolveDistrictFromShapefiles(
      39.17,
      -84.44,
      [zipLayer(), supervisorLayer()],
    );
    expect(result).toBe(6);
  });

  it("rejects a 5-digit ZIP stored as the district identifier value", () => {
    const layer = makeLayer({
      id: 5,
      city_id: 1,
      shapefile_name: "Supervisor Districts",
      structure_type: "district",
      identifier_field: "supervisor_district",
      geometry_data: {
        type: "FeatureCollection",
        features: [
          {
            type: "Feature",
            properties: { supervisor_district: "94102" },
            geometry: { type: "Polygon", coordinates: [NORTH_AVONDALE_SQUARE] },
          },
        ],
      },
    });
    const result = resolveDistrictFromShapefiles(39.17, -84.44, [layer], null, 5);
    expect(result).toBeNull();
  });
});

describe("parseDistrictIdentifier", () => {
  it("parses compact district codes", () => {
    expect(parseDistrictIdentifier(6)).toBe(6);
    expect(parseDistrictIdentifier("District 7")).toBe(7);
    expect(parseDistrictIdentifier("03")).toBe(3);
  });

  it("rejects US ZIP codes", () => {
    expect(parseDistrictIdentifier("94102")).toBeNull();
    expect(parseDistrictIdentifier(94102)).toBeNull();
    expect(parseDistrictIdentifier("02101")).toBeNull();
    expect(parseDistrictIdentifier("94102-1234")).toBeNull();
  });
});

import { describe, it, expect } from "vitest";

import { resolveDistrictFromShapefiles } from "./findDistrictFromCoordinates";
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

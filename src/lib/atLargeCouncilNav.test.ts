import { describe, expect, it } from "vitest";
import type { CityShapefile } from "@/lib/apiClient";
import { AT_LARGE_DISTRICT } from "@/lib/publicLeadersPick";
import {
  extractNeighborhoodOptions,
  findNeighborhoodFromPoint,
  getAtLargeCouncilMembers,
  isAtLargeCouncilCity,
  resolveNeighborhoodName,
} from "@/lib/atLargeCouncilNav";

const cincyNeighborhoodLayer: CityShapefile = {
  id: 108,
  city_id: 56677,
  shapefile_name: "Cincinnati Neighborhoods (SNA)",
  structure_type: "neighborhood",
  identifier_field: "SNA_NAME",
  geometry_data: {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: { SNA_NAME: "Avondale", SNA_NUMBER: 1 },
        geometry: {
          type: "Polygon",
          coordinates: [
            [
              [-84.5, 39.15],
              [-84.49, 39.15],
              [-84.49, 39.14],
              [-84.5, 39.14],
              [-84.5, 39.15],
            ],
          ],
        },
      },
      {
        type: "Feature",
        properties: { SNA_NAME: "Hyde Park", SNA_NUMBER: 15 },
        geometry: {
          type: "Polygon",
          coordinates: [
            [
              [-84.42, 39.13],
              [-84.41, 39.13],
              [-84.41, 39.12],
              [-84.42, 39.12],
              [-84.42, 39.13],
            ],
          ],
        },
      },
    ],
  },
};

describe("isAtLargeCouncilCity", () => {
  it("returns true for Cincinnati-style at-large council", () => {
    expect(
      isAtLargeCouncilCity([
        { name: "Mayor", title: "Mayor", district: 0 },
        { name: "Anna Albi", title: "Councilmember", district: AT_LARGE_DISTRICT },
      ]),
    ).toBe(true);
  });

  it("returns false when numbered district reps exist", () => {
    expect(
      isAtLargeCouncilCity([
        { name: "Mayor", district: 0 },
        { name: "Supervisor", district: 5 },
      ]),
    ).toBe(false);
  });
});

describe("extractNeighborhoodOptions", () => {
  it("maps SNA names and numbers from neighborhood shapefiles", () => {
    const options = extractNeighborhoodOptions([cincyNeighborhoodLayer]);
    expect(options).toEqual([
      { id: 1, name: "Avondale" },
      { id: 15, name: "Hyde Park" },
    ]);
  });
});

describe("resolveNeighborhoodName", () => {
  it("returns the display name for a neighborhood id", () => {
    expect(resolveNeighborhoodName(15, [cincyNeighborhoodLayer])).toBe("Hyde Park");
  });
});

describe("findNeighborhoodFromPoint", () => {
  it("resolves a point inside a neighborhood polygon", () => {
    const hit = findNeighborhoodFromPoint(39.145, -84.495, [cincyNeighborhoodLayer]);
    expect(hit).toEqual({ id: 1, name: "Avondale" });
  });
});

describe("getAtLargeCouncilMembers", () => {
  it("returns only at-large council rows", () => {
    const members = getAtLargeCouncilMembers([
      { name: "Mayor", district: 0 },
      { name: "Zed", district: AT_LARGE_DISTRICT },
      { name: "Amy", district: AT_LARGE_DISTRICT },
    ]);
    expect(members.map((m) => m.name)).toEqual(["Amy", "Zed"]);
  });
});

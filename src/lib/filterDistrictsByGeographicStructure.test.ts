import { describe, expect, it } from "vitest";
import { filterDistrictsByGeographicStructure } from "./filterDistrictsByGeographicStructure";

describe("filterDistrictsByGeographicStructure", () => {
  it("returns all districts when no geographic structure ranges exist", () => {
    expect(filterDistrictsByGeographicStructure([1, 15, 50], [])).toEqual([
      1, 15, 50,
    ]);
  });

  it("filters to configured council district range (Oakland 1–7)", () => {
    const districts = Array.from({ length: 35 }, (_, i) => i + 1).concat(77, 99);
    expect(
      filterDistrictsByGeographicStructure(districts, [
        {
          structure_type: "district",
          min_value: 1,
          max_value: 7,
        },
      ]),
    ).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it("keeps districts matching any configured range", () => {
    expect(
      filterDistrictsByGeographicStructure([1, 8, 12, 20], [
        { min_value: 1, max_value: 7 },
        { min_value: 10, max_value: 15 },
      ]),
    ).toEqual([1, 12]);
  });
});

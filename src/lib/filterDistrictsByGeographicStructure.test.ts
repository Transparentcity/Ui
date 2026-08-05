import { describe, expect, it } from "vitest";
import {
  filterDistrictsByGeographicStructure,
  filterNavigableDistricts,
} from "./filterDistrictsByGeographicStructure";

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

describe("filterNavigableDistricts", () => {
  it("ignores an unrelated structure range when a subdivision catalog exists", () => {
    // Cincinnati: 49 neighborhoods with data, but the only structure row is
    // Police District 1–5.
    const districts = Array.from({ length: 50 }, (_, i) => i + 1).filter(
      (d) => d !== 40,
    );
    const catalog = Array.from({ length: 50 }, (_, i) => i + 1);

    const result = filterNavigableDistricts(districts, catalog, [
      { min_value: 1, max_value: 5 },
    ]);

    expect(result).toHaveLength(49);
    expect(result).toContain(50);
    expect(result).not.toContain(40);
  });

  it("drops districts missing from the subdivision catalog", () => {
    expect(
      filterNavigableDistricts([1, 2, 99], [1, 2, 3], null),
    ).toEqual([1, 2]);
  });

  it("falls back to structure ranges when the catalog is empty", () => {
    expect(
      filterNavigableDistricts([1, 8, 12], [], [{ min_value: 1, max_value: 7 }]),
    ).toEqual([1]);
  });

  it("returns all districts when neither catalog nor ranges are configured", () => {
    expect(filterNavigableDistricts([3, 1, 2], null, [])).toEqual([1, 2, 3]);
  });
});

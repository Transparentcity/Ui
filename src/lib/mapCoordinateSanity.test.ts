import { describe, expect, it } from "vitest";
import { isJunkWgs84LngLat, sanitizeMapDisplayLngLat } from "./mapCoordinateSanity";

describe("isJunkWgs84LngLat", () => {
  it("treats common sentinels as junk", () => {
    expect(isJunkWgs84LngLat(-1, -1)).toBe(true);
    expect(isJunkWgs84LngLat(0, 0)).toBe(true);
    expect(isJunkWgs84LngLat(0, -1)).toBe(true);
    expect(isJunkWgs84LngLat(-1, 0)).toBe(true);
  });

  it("allows typical city coordinates", () => {
    expect(isJunkWgs84LngLat(-122.4194, 37.7749)).toBe(false);
  });
});

describe("sanitizeMapDisplayLngLat", () => {
  it("parses numeric strings and rejects junk", () => {
    expect(sanitizeMapDisplayLngLat("-1", "-1")).toBe(null);
    expect(sanitizeMapDisplayLngLat("-122.4", "37.78")).toEqual([-122.4, 37.78]);
  });
});

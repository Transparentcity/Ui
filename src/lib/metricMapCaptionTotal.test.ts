import { describe, expect, it } from "vitest";
import type { SavedMap } from "@/lib/apiClient";
import {
  getMapCaptionTotalCount,
  getMetricAggregationValueField,
} from "./metricMapCaptionTotal";

function baseMap(over: Partial<SavedMap> = {}): SavedMap {
  return {
    id: 0,
    short_hash: "",
    title: "t",
    description: null,
    map_type: "point",
    location_data: [],
    map_config: {},
    bounds: null,
    center: null,
    city_id: 1,
    metric_id: 1,
    query_source: null,
    is_public: false,
    view_count: 0,
    user_id: null,
    created_at: "",
    updated_at: "",
    ...over,
  };
}

describe("getMapCaptionTotalCount", () => {
  it("sums housingunits on point maps instead of counting permits", () => {
    const map = baseMap({
      location_data: [
        { lat: 47.6, lon: -122.3, housingunits: 10 },
        { lat: 47.61, lon: -122.31, housingunits: 5 },
        { lat: 47.62, lon: -122.32, housingunits: 3 },
      ],
    });
    expect(getMapCaptionTotalCount(map)).toBe(18);
  });

  it("uses explicit value_field from map_config", () => {
    const map = baseMap({
      map_config: { value_field: "housingunits" },
      location_data: [
        { lat: 1, lon: 2, housingunits: 4 },
        { lat: 1, lon: 2, housingunits: 6 },
      ],
    });
    expect(getMapCaptionTotalCount(map)).toBe(10);
  });

  it("uses valueField option over map_config", () => {
    const map = baseMap({
      map_config: { value_field: "count" },
      location_data: [{ lat: 1, lon: 2, housingunits: 100 }],
    });
    expect(getMapCaptionTotalCount(map, { valueField: "housingunits" })).toBe(100);
  });

  it("returns point count when value_field is count", () => {
    const map = baseMap({
      map_config: { value_field: "count" },
      location_data: [
        { lat: 1, lon: 2 },
        { lat: 1, lon: 2, housingunits: 99 },
      ],
    });
    expect(getMapCaptionTotalCount(map)).toBe(2);
  });

  it("sums choropleth aggregation rows when present", () => {
    const map = baseMap({
      location_data: [],
      map_config: {
        aggregations: {
          "1": {
            rows: [{ value: 100 }, { value: 115 }],
          },
        },
      },
    });
    expect(getMapCaptionTotalCount(map)).toBe(215);
  });
});

describe("getMetricAggregationValueField", () => {
  it("reads SUM field from ytd_config", () => {
    expect(
      getMetricAggregationValueField({
        metadata: {
          query_config: {
            ytd_config: {
              aggregation: { type: "SUM", field: "housingunits" },
            },
          },
        },
      })
    ).toBe("housingunits");
  });

  it("returns count for COUNT aggregation", () => {
    expect(
      getMetricAggregationValueField({
        metadata: {
          query_config: {
            aggregation: { type: "COUNT", field: "id" },
          },
        },
      })
    ).toBe("count");
  });
});

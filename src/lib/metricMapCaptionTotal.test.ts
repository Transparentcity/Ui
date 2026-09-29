import { describe, expect, it } from "vitest";
import type { SavedMap } from "@/lib/apiClient";
import {
  getMapCaptionTotalCount,
  getMetricAggregationValueField,
  metricSupportsGeneratedMap,
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

  it("does not sum non-additive district averages", () => {
    const map = baseMap({
      location_data: [],
      map_config: {
        additive: false,
        aggregation_type: "AVG",
        aggregations: {
          "1": {
            rows: [{ value: 12.5 }, { value: 20.5 }],
          },
        },
      },
    });
    expect(getMapCaptionTotalCount(map)).toBeNull();
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

describe("metricSupportsGeneratedMap", () => {
  const base = { map_query: null, map_config: null, location_fields: null, metadata: null };

  it("true when map_query is set", () => {
    expect(metricSupportsGeneratedMap({ ...base, map_query: "SELECT *" })).toBe(true);
  });

  it("false when nothing is configured", () => {
    expect(metricSupportsGeneratedMap(base)).toBe(false);
  });

  it("true for derived ratio (divide) with numerator+denominator", () => {
    expect(
      metricSupportsGeneratedMap({
        ...base,
        metadata: {
          query_config: {
            derived_config: {
              operation: "divide",
              numerator_metric_id: 11,
              denominator_metric_id: 12,
            },
          },
        },
      })
    ).toBe(true);
  });

  it("false for derived divide without numerator/denominator", () => {
    expect(
      metricSupportsGeneratedMap({
        ...base,
        metadata: {
          query_config: {
            derived_config: { operation: "divide" },
          },
        },
      })
    ).toBe(false);
  });

  it("true for AVG ytd_config with district_field", () => {
    expect(
      metricSupportsGeneratedMap({
        ...base,
        metadata: {
          query_config: {
            ytd_config: {
              aggregation: { type: "AVG", field: "date_diff_d(closed_at, opened_at)" },
              district_field: "councildistrict",
            },
          },
        },
      })
    ).toBe(true);
  });

  it("true for AVG ytd_config with district_field in location_config", () => {
    expect(
      metricSupportsGeneratedMap({
        ...base,
        metadata: {
          query_config: {
            ytd_config: {
              aggregation: { type: "AVG", field: "days_to_close" },
              location_config: { district_field: "supervisor_district" },
            },
          },
        },
      })
    ).toBe(true);
  });

  it("false for AVG ytd_config without district_field", () => {
    expect(
      metricSupportsGeneratedMap({
        ...base,
        metadata: {
          query_config: {
            ytd_config: {
              aggregation: { type: "AVG", field: "days_to_close" },
            },
          },
        },
      })
    ).toBe(false);
  });

  it("false for AVG ytd_config without aggregation field", () => {
    expect(
      metricSupportsGeneratedMap({
        ...base,
        metadata: {
          query_config: {
            ytd_config: {
              aggregation: { type: "AVG" },
              district_field: "councildistrict",
            },
          },
        },
      })
    ).toBe(false);
  });

  it("true for SUM ytd_config with district_field", () => {
    expect(
      metricSupportsGeneratedMap({
        ...base,
        metadata: {
          query_config: {
            ytd_config: {
              aggregation: { type: "SUM", field: "housingunits" },
              district_field: "supervisor_district",
            },
          },
        },
      })
    ).toBe(true);
  });

  it("false for COUNT ytd_config (handled by map_query path)", () => {
    expect(
      metricSupportsGeneratedMap({
        ...base,
        metadata: {
          query_config: {
            ytd_config: {
              aggregation: { type: "COUNT" },
              district_field: "supervisor_district",
            },
          },
        },
      })
    ).toBe(false);
  });
});

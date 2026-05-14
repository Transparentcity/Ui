import { describe, expect, it } from "vitest";
import type { SavedMap } from "@/lib/apiClient";
import {
  computeMetricMapEmbedViewSpecs,
  formatMetricMapViewSpecKey,
} from "./metricMapEmbedViews";

function baseSavedMap(over: Partial<SavedMap> = {}): SavedMap {
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

describe("computeMetricMapEmbedViewSpecs", () => {
  it("uses district choropleth as primary when many rows and adds points as secondary when coords exist", () => {
    const rows = Array.from({ length: 1200 }, (_, i) => ({
      lat: 37.7 + i * 0.0001,
      lon: -122.4 + i * 0.0001,
      supervisor_district: String((i % 11) + 1),
    }));
    const map = baseSavedMap({
      location_data: rows,
      map_config: {
        available_views: [
          {
            type: "choropleth",
            shape_layer_instance_id: 10,
            identifier_field: "supervisor_district",
            display_name: "Supervisor districts",
            row_count: 11,
            is_city_district: true,
          },
          {
            type: "choropleth",
            shape_layer_instance_id: 20,
            identifier_field: "tract_id",
            display_name: "Census tracts",
            row_count: 50,
            is_city_district: false,
          },
        ],
        aggregations: {
          "10": {
            identifier_field: "supervisor_district",
            display_name: "Supervisor districts",
            rows: Array.from({ length: 11 }, (_, d) => ({
              district: String(d + 1),
              supervisor_district: String(d + 1),
              value: d + 1,
            })),
          },
          "20": {
            identifier_field: "tract_id",
            display_name: "Census tracts",
            rows: [{ district: "1", tract_id: "1", value: 1 }],
          },
        },
        default_view: { type: "points" },
      },
    });
    const { primary, secondary } = computeMetricMapEmbedViewSpecs(map);
    expect(primary.kind).toBe("choropleth");
    if (primary.kind === "choropleth") {
      expect(primary.shapeLayerId).toBe("10");
    }
    const keys = secondary.map((s) => formatMetricMapViewSpecKey(s));
    expect(keys).toContain("points");
    expect(keys).toContain("choro:20");
    expect(keys).not.toContain("choro:10");
  });

  it("uses points as primary when few locations and lists choropleths as secondaries", () => {
    const map = baseSavedMap({
      location_data: [
        { lat: 37.78, lon: -122.42, supervisor_district: "3" },
        { lat: 37.79, lon: -122.41, supervisor_district: "3" },
      ],
      map_config: {
        available_views: [
          {
            type: "choropleth",
            shape_layer_instance_id: 10,
            identifier_field: "supervisor_district",
            display_name: "Supervisor districts",
            row_count: 1,
            is_city_district: true,
          },
        ],
        aggregations: {
          "10": {
            identifier_field: "supervisor_district",
            display_name: "Supervisor districts",
            rows: [{ district: "3", supervisor_district: "3", value: 2 }],
          },
        },
      },
    });
    const { primary, secondary } = computeMetricMapEmbedViewSpecs(map);
    expect(primary.kind).toBe("points");
    expect(secondary.length).toBe(1);
    expect(secondary[0]?.kind).toBe("choropleth");
    if (secondary[0]?.kind === "choropleth") {
      expect(secondary[0].shapeLayerId).toBe("10");
    }
  });

  it("keeps points as primary when chart_type_preference is point even with many rows", () => {
    const rows = Array.from({ length: 1200 }, (_, i) => ({
      lat: 37.7 + i * 0.0001,
      lon: -122.4 + i * 0.0001,
      supervisor_district: String((i % 11) + 1),
    }));
    const map = baseSavedMap({
      location_data: rows,
      map_config: {
        chart_type_preference: "point",
        available_views: [
          {
            type: "choropleth",
            shape_layer_instance_id: 10,
            identifier_field: "supervisor_district",
            display_name: "Supervisor districts",
            row_count: 11,
            is_city_district: true,
          },
        ],
        aggregations: {
          "10": {
            identifier_field: "supervisor_district",
            display_name: "Supervisor districts",
            rows: Array.from({ length: 11 }, (_, d) => ({
              district: String(d + 1),
              supervisor_district: String(d + 1),
              value: d + 1,
            })),
          },
        },
        default_view: { type: "points" },
      },
    });
    const { primary } = computeMetricMapEmbedViewSpecs(map);
    expect(primary.kind).toBe("points");
  });
});

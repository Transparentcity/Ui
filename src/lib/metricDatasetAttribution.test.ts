import { describe, expect, it } from "vitest";
import {
  buildMetricSourceInformation,
  extractSocrataDatasetId,
  resolveMetricDatasetAttribution,
} from "@/lib/metricDatasetAttribution";

describe("extractSocrataDatasetId", () => {
  it("returns bare 4-4 ids", () => {
    expect(extractSocrataDatasetId("i98e-djp9")).toBe("i98e-djp9");
  });

  it("extracts ids from resource URLs", () => {
    expect(
      extractSocrataDatasetId(
        "https://data.cityofnewyork.us/resource/43nn-pn8j.json"
      )
    ).toBe("43nn-pn8j");
  });

  it("ignores template endpoints", () => {
    expect(
      extractSocrataDatasetId("template_template_311_service_requests_v2")
    ).toBeNull();
  });
});

describe("resolveMetricDatasetAttribution", () => {
  it("never falls back to metric name", () => {
    const resolved = resolveMetricDatasetAttribution({
      dataset_name: null,
      dataset_title: null,
      endpoint: null,
      source_url: null,
      data_sf_url: null,
    });
    expect(resolved.datasetName).toBeNull();
  });

  it("prefers dataset_name over dataset_title", () => {
    const resolved = resolveMetricDatasetAttribution({
      dataset_name: "Building Permits",
      dataset_title: "Old title",
      endpoint: "i98e-djp9",
    });
    expect(resolved.datasetName).toBe("Building Permits");
    expect(resolved.datasetId).toBe("i98e-djp9");
  });

  it("builds a portal URL from domain + extracted id", () => {
    const resolved = resolveMetricDatasetAttribution(
      {
        endpoint: "https://data.seattle.gov/resource/wnbq-64tb.json",
      },
      { portalDomain: "data.seattle.gov" }
    );
    expect(resolved.datasetId).toBe("wnbq-64tb");
    expect(resolved.datasetName).toBe("wnbq-64tb");
    expect(resolved.datasetUrl).toBe("https://data.seattle.gov/d/wnbq-64tb");
  });
});

describe("buildMetricSourceInformation", () => {
  it("includes map_query, fetch URL, and portal fields", () => {
    const source = buildMetricSourceInformation(
      {
        dataset_name: "Building Permits",
        endpoint: "i98e-djp9",
        map_query: "SELECT * WHERE date >= '2026-01-01'",
      },
      {
        portalUrl: "https://data.sfgov.org",
        portalDomain: "data.sfgov.org",
        cityName: "San Francisco",
      }
    );
    expect(source).toMatchObject({
      dataset_name: "Building Permits",
      dataset_id: "i98e-djp9",
      dataset_url: "https://data.sfgov.org/resource/i98e-djp9",
      query_url: "https://data.sfgov.org/resource/i98e-djp9.json",
      query_text: "SELECT * WHERE date >= '2026-01-01'",
      city_name: "San Francisco",
      city_portal_domain: "data.sfgov.org",
    });
  });
});

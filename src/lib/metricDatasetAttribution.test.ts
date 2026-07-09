import { describe, expect, it } from "vitest";
import {
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

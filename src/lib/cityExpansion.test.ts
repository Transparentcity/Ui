import { describe, expect, it } from "vitest";
import {
  cityResultLabel,
  formatDemandSources,
  formatPopulation,
  GATE_CHECKS,
  QUEUE_REASON_LABEL,
} from "./cityExpansion";

describe("cityResultLabel", () => {
  it("prefers dark-launch over a generic pass", () => {
    expect(cityResultLabel({ promoted: true, passed: true, result: "promoted" })).toBe(
      "Dark launched"
    );
  });

  it("labels blocked cities from result or failed status", () => {
    expect(cityResultLabel({ result: "blocked", passed: false })).toBe("Blocked");
    expect(cityResultLabel({ status: "failed", passed: false })).toBe("Blocked");
  });
});

describe("QUEUE_REASON_LABEL", () => {
  it("covers the ranked queue reasons", () => {
    expect(QUEUE_REASON_LABEL.user_demand_unstructured).toBe("User demand");
    expect(QUEUE_REASON_LABEL.catalog_new_city).toBe("Catalog prospect");
  });
});

describe("formatPopulation", () => {
  it("abbreviates millions and thousands", () => {
    expect(formatPopulation(20_000_000)).toBe("20M");
    expect(formatPopulation(105_000)).toBe("105k");
  });
});

describe("formatDemandSources", () => {
  it("joins positive sources", () => {
    expect(formatDemandSources({ subscribers: 2, saved: 2, homes: 0 })).toBe(
      "2 subscribers · 2 saved"
    );
  });
});

describe("GATE_CHECKS", () => {
  it("includes the tightened dark-launch metric and map checks", () => {
    const keys = GATE_CHECKS.map((check) => check.key);
    expect(keys).toContain("applicable_templates_instantiated");
    expect(keys).toContain("metrics_map_fields");
    expect(keys).toContain("metrics_district_breakdowns");
  });
});

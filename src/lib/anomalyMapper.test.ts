/**
 * Tests for anomalyMapper — verifies CRM metadata uses anomaly_id.
 */
import { describe, it, expect } from "vitest"
import { mapApiAnomalyToCrm, mapApiAnomaliesToCrm, districtToLabel, type AnomalyInput } from "./anomalyMapper"

const SAMPLE_INPUT: AnomalyInput = {
  id: 101,
  metric_id: 42,
  period_type: "month",
  is_anomaly: true,
  pct_change: 35.2,
  district: 5,
  object_name: "Police overtime",
  group_field: "category",
  group_value: "patrol",
  recent_mean: 150,
  comparison_mean: 110,
  city_name: "San Francisco",
  created_at: "2025-06-01T00:00:00Z",
}

describe("mapApiAnomalyToCrm", () => {
  it("sets crm_metadata.anomaly_id from api.id", () => {
    const result = mapApiAnomalyToCrm(SAMPLE_INPUT, "fp-1")
    expect(result.crm_metadata).toBeDefined()
    expect(result.crm_metadata!.anomaly_id).toBe(101)
  })

  it("sets crm_metadata defaults correctly", () => {
    const result = mapApiAnomalyToCrm(SAMPLE_INPUT, "fp-1")
    expect(result.crm_metadata!.crm_status).toBe("new")
    expect(result.crm_metadata!.notes).toBeNull()
  })

  it("defaults anomaly_id to 0 when api.id is null", () => {
    const input = { ...SAMPLE_INPUT, id: null }
    const result = mapApiAnomalyToCrm(input, "fp-2")
    expect(result.crm_metadata!.anomaly_id).toBe(0)
  })

  it("preserves anomaly_id on the Anomaly object (separate from crm_metadata)", () => {
    const result = mapApiAnomalyToCrm(SAMPLE_INPUT, "fp-1")
    // Anomaly.anomaly_id is the JS-side ID, distinct from the DB column
    expect(result.anomaly_id).toBe(101)
  })

  it("builds correct title from object_name and group_value", () => {
    const result = mapApiAnomalyToCrm(SAMPLE_INPUT, "fp-1")
    expect(result.title).toContain("Police overtime")
    expect(result.title).toContain("patrol")
  })

  it("calculates severity from pct_change", () => {
    const low = mapApiAnomalyToCrm({ ...SAMPLE_INPUT, pct_change: 10 }, "fp")
    const medium = mapApiAnomalyToCrm({ ...SAMPLE_INPUT, pct_change: 30 }, "fp")
    const high = mapApiAnomalyToCrm({ ...SAMPLE_INPUT, pct_change: 55 }, "fp")
    const critical = mapApiAnomalyToCrm({ ...SAMPLE_INPUT, pct_change: 85 }, "fp")

    expect(low.severity).toBe("low")
    expect(medium.severity).toBe("medium")
    expect(high.severity).toBe("high")
    expect(critical.severity).toBe("critical")
  })
})

describe("mapApiAnomaliesToCrm", () => {
  it("deduplicates by fingerprint", () => {
    const results = mapApiAnomaliesToCrm([SAMPLE_INPUT, SAMPLE_INPUT])
    expect(results).toHaveLength(1)
  })

  it("maps multiple distinct anomalies", () => {
    const input2 = { ...SAMPLE_INPUT, metric_id: 99, district: 0 }
    const results = mapApiAnomaliesToCrm([SAMPLE_INPUT, input2])
    expect(results).toHaveLength(2)
  })

  it("all mapped items have crm_metadata with anomaly_id", () => {
    const input2 = { ...SAMPLE_INPUT, id: 202, metric_id: 99 }
    const results = mapApiAnomaliesToCrm([SAMPLE_INPUT, input2])
    for (const r of results) {
      expect(r.crm_metadata).toBeDefined()
      expect(r.crm_metadata).toHaveProperty("anomaly_id")
    }
  })
})

describe("districtToLabel", () => {
  it("returns citywide for district 0", () => {
    const { district_label, is_citywide } = districtToLabel(0)
    expect(is_citywide).toBe(true)
    expect(district_label).toBe("Citywide")
  })

  it("returns district label for non-zero district", () => {
    const { district_label, is_citywide } = districtToLabel(5)
    expect(is_citywide).toBe(false)
    expect(district_label).toBe("District 5")
  })
})

import { describe, expect, it } from "vitest";
import type { MandateCompliance, MandateStandard } from "@/lib/publicApiClient";
import { formatMandateTarget, mandatePillKind, mandateStreakText } from "@/lib/mandates";

const now = new Date("2026-03-15T00:00:00Z");

function compliance(overrides: Partial<MandateCompliance>): MandateCompliance {
  return {
    latest_period: "2026-01-01",
    latest_value: 6087,
    latest_status: "met",
    streak_status: "met",
    streak_length: 1,
    met_count_recent: 1,
    evaluated_count_recent: 1,
    last_met_period: null,
    last_missed_period: null,
    periods: [],
    ...overrides,
  };
}

describe("pace and equality standards", () => {
  it("shows an off-pace period as missed", () => {
    const c = compliance({ latest_status: "off_pace", streak_status: "off_pace", streak_length: 3 });
    expect(mandatePillKind(c, "year", now)).toBe("missed");
  });

  it("describes an off-pace streak", () => {
    const c = compliance({ streak_status: "off_pace", streak_length: 3 });
    expect(mandateStreakText(c, "year")).toBe("Behind pace for 3 years running");
  });

  it("formats an equality target with =", () => {
    const standard = { operator: "==", target: 0, unit: "quarters" } as MandateStandard;
    expect(formatMandateTarget(standard)).toBe("= 0 quarters");
  });
});

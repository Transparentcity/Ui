import { describe, expect, it } from "vitest";
import type { MandateCompliance, MandateStandard } from "@/lib/publicApiClient";
import {
  formatMandateTarget,
  isLegalMandateCategory,
  mandateChartDisablesYtd,
  mandatePillKind,
  mandateStreakText,
} from "@/lib/mandates";


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
  it("shows an off-pace period as behind pace", () => {
    const c = compliance({ latest_status: "off_pace", streak_status: "off_pace", streak_length: 3 });
    expect(mandatePillKind(c)).toBe("behind_pace");
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

describe("mandateChartDisablesYtd", () => {
  const pct = { operator: ">=", target: 90, unit: "%", grain: "month" } as MandateStandard;
  const count = { operator: "<=", target: 1562, unit: "people", grain: "month" } as MandateStandard;

  it("drops YTD for percentage standards", () => {
    expect(mandateChartDisablesYtd(pct, "flow")).toBe(true);
  });

  it("drops YTD for level (stock) series", () => {
    expect(mandateChartDisablesYtd(count, "stock")).toBe(true);
  });

  it("keeps YTD for count flows and for metrics without a standard", () => {
    expect(mandateChartDisablesYtd(count, "flow")).toBe(false);
    expect(mandateChartDisablesYtd(null, "stock")).toBe(false);
  });
});

describe("isLegalMandateCategory", () => {
  it("matches the legal mandates category loosely", () => {
    expect(isLegalMandateCategory("Legal mandates")).toBe(true);
    expect(isLegalMandateCategory(" legal Mandates ")).toBe(true);
    expect(isLegalMandateCategory("legal_mandates")).toBe(true);
  });

  it("ignores other categories", () => {
    expect(isLegalMandateCategory("Public safety")).toBe(false);
    expect(isLegalMandateCategory(null)).toBe(false);
  });
});

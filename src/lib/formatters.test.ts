import { describe, expect, it } from "vitest";

import { formatMetricValue } from "./formatters";

describe("formatMetricValue", () => {
  it("formats thousands with one decimal place only when needed", () => {
    expect(formatMetricValue(1_000)).toBe("1k");
    expect(formatMetricValue(1_250)).toBe("1.3k");
    expect(formatMetricValue(12_000)).toBe("12k");
    expect(formatMetricValue(-1_250)).toBe("-1.3k");
  });

  it("keeps existing compact formatting for non-thousand values", () => {
    expect(formatMetricValue(999)).toBe("999");
    expect(formatMetricValue(1_000_000)).toBe("1M");
  });

  it("formats currency thousands with one decimal place", () => {
    expect(formatMetricValue(1_250, "currency")).toBe("$1.3k");
    expect(formatMetricValue(-1_250, "currency")).toBe("-$1.3k");
  });
});

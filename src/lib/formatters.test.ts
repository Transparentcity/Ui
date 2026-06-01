import { describe, expect, it } from "vitest";
import { formatMetricValue } from "./formatters";

describe("formatMetricValue thousands", () => {
  it("shows one decimal when fractional thousands", () => {
    expect(formatMetricValue(13100)).toBe("13.1k");
    expect(formatMetricValue(13050)).toBe("13.1k");
  });

  it("omits decimal when thousands are whole", () => {
    expect(formatMetricValue(13000)).toBe("13k");
    expect(formatMetricValue(1000)).toBe("1k");
  });

  it("does not use k suffix for zero", () => {
    expect(formatMetricValue(0)).toBe("0");
  });

  it("keeps integer rounding for millions and billions", () => {
    expect(formatMetricValue(1_500_000)).toBe("2M");
    expect(formatMetricValue(1_200_000_000)).toBe("1B");
  });
});

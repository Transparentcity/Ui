import { describe, expect, it } from "vitest";
import { formatMandateValue, splitMandateValue } from "@/lib/mandates";

describe("splitMandateValue", () => {
  it("keeps % attached to the number", () => {
    expect(splitMandateValue(88.4, "%")).toEqual({ number: "88.4%", unit: null });
  });

  it("splits a count from its unit", () => {
    expect(splitMandateValue(1047, "people")).toEqual({ number: "1,047", unit: "people" });
  });

  it("uses the singular for a count of one", () => {
    expect(splitMandateValue(1, "permits in violation")).toEqual({
      number: "1",
      unit: "permit in violation",
    });
    expect(splitMandateValue(1, "people")).toEqual({ number: "1", unit: "people" });
  });

  it("shows No data for a missing value", () => {
    expect(splitMandateValue(null, "units")).toEqual({ number: "No data", unit: null });
  });
});

describe("zero label", () => {
  const label = "Below reporting limit";

  it("shows the label alone for exactly 0 when the standard sets one", () => {
    expect(splitMandateValue(0, "ppb", label)).toEqual({ number: label, unit: null });
    expect(formatMandateValue(0, "ppb", label)).toBe(label);
  });

  it("shows 0 and the unit when there is no label", () => {
    expect(splitMandateValue(0, "ppb")).toEqual({ number: "0", unit: "ppb" });
    expect(splitMandateValue(0, "ppb", null)).toEqual({ number: "0", unit: "ppb" });
    expect(formatMandateValue(0, "ppb")).toBe("0 ppb");
  });

  it("ignores the label for a non-zero value", () => {
    expect(splitMandateValue(7.6, "ppb", label)).toEqual({ number: "7.6", unit: "ppb" });
    expect(formatMandateValue(7.6, "ppb", label)).toBe("7.6 ppb");
  });

  it("still shows No data for a missing value", () => {
    expect(formatMandateValue(null, "ppb", label)).toBe("No data");
  });
});

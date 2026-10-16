import { describe, expect, it } from "vitest";
import { splitMandateValue } from "@/lib/mandates";

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

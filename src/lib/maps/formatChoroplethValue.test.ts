import { describe, expect, it } from "vitest";
import {
  formatChoroplethValue,
  isPercentageNoun,
  isPercentageValued,
} from "./formatChoroplethValue";

describe("isPercentageNoun", () => {
  it.each(["% Closed", "Percent", "percentage on time", "Ratio"])(
    "treats %s as a percentage",
    (noun) => expect(isPercentageNoun(noun)).toBe(true)
  );

  it.each(["Registrations", "Operations", "Duration", "Days", "", null, undefined])(
    "treats %s as a count noun",
    (noun) => expect(isPercentageNoun(noun)).toBe(false)
  );
});

describe("formatChoroplethValue", () => {
  it("formats RATIO aggregations as percentages", () => {
    expect(formatChoroplethValue(32.94, { aggregation_type: "RATIO" })).toBe("32.9%");
  });

  it("keeps the noun for counts", () => {
    expect(isPercentageValued({ item_noun: "Registrations" })).toBe(false);
    expect(formatChoroplethValue(12, { item_noun: "Registrations" })).toBe("12 Registrations");
  });

  it("returns the fallback for missing values", () => {
    expect(formatChoroplethValue(null, null, { fallback: "—" })).toBe("—");
  });
});

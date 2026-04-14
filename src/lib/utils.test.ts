import { cn, getVariationCount, hasVariations, slugify } from "@/lib/utils";

describe("utils", () => {
  it("slugify normalizes punctuation and spacing", () => {
    expect(slugify("  Hello, Transparent City!!  ")).toBe("hello-transparent-city");
  });

  it("slugify returns an empty slug for nullish values", () => {
    expect(slugify(undefined)).toBe("");
    expect(slugify(null)).toBe("");
  });

  it("cn merges classes and keeps the latest conflicting utility", () => {
    expect(cn("p-2 text-sm", "p-4")).toContain("p-4");
    expect(cn("p-2 text-sm", "p-4")).not.toContain("p-2");
  });

  it("hasVariations returns true when variation_enabled is true", () => {
    expect(hasVariations({ variation_enabled: true })).toBe(true);
  });

  it("getVariationCount sums body and subject variations", () => {
    const template = {
      variations: ["A", "B"],
      subject_variations: ["S1"],
    };

    expect(getVariationCount(template)).toBe(3);
  });
});

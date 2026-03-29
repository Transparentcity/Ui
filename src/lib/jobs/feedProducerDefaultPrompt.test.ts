import { describe, expect, it } from "vitest";
import {
  buildStandardFeedProducerDefaultPrompt,
  cityIdsFromJobConfig,
  parseCityIdsFromCsv,
  storyTypesFromJobConfig,
} from "./feedProducerDefaultPrompt";

describe("buildStandardFeedProducerDefaultPrompt", () => {
  it("returns null without city IDs", () => {
    expect(buildStandardFeedProducerDefaultPrompt([], ["alert"])).toBeNull();
  });

  it("uses default story types when empty", () => {
    const s = buildStandardFeedProducerDefaultPrompt([57260], [])!;
    expect(s).toContain("57260");
    expect(s).toContain("alert, trend, multi_metric");
    expect(s).toContain("Generate feed stories for cities:");
  });

  it("uses provided story types", () => {
    const s = buildStandardFeedProducerDefaultPrompt([1, 2], ["alert", "trend"])!;
    expect(s).toContain("1, 2");
    expect(s).toContain("alert, trend");
  });
});

describe("parseCityIdsFromCsv", () => {
  it("parses comma list", () => {
    expect(parseCityIdsFromCsv(" 57260, 1 ")).toEqual([57260, 1]);
  });
});

describe("cityIdsFromJobConfig", () => {
  it("reads city_ids array and city_id", () => {
    expect(cityIdsFromJobConfig({ city_ids: [1, 2] })).toEqual([1, 2]);
    expect(cityIdsFromJobConfig({ city_id: 9 })).toEqual([9]);
  });
});

describe("storyTypesFromJobConfig", () => {
  it("reads string array", () => {
    expect(storyTypesFromJobConfig({ story_types: ["alert", "trend"] })).toEqual([
      "alert",
      "trend",
    ]);
  });
});

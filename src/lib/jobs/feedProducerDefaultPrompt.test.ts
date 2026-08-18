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

  // ScheduledJobsPanel prefills this for feed jobs with no stored prompt, and
  // saving persists it. If it falls behind services/feed_depth_prompt.py, an
  // admin opening a job silently downgrades its instructions back to the version
  // that shipped stories restating a citywide total with no explanation.
  it("requires the scoped explanation pass", () => {
    const s = buildStandardFeedProducerDefaultPrompt([57260], ["alert"])!;
    expect(s).toContain("EXPLANATION PASS (mandatory");
    expect(s).toContain("get_metric_change_breakdown");
    expect(s).toContain("get_metric_change_shape");
  });

  it("routes tool caveats away from published copy", () => {
    const s = buildStandardFeedProducerDefaultPrompt([57260], ["alert"])!;
    expect(s).toContain("instructions to you, not sentences for the story");
    expect(s).toContain("worse than silence");
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

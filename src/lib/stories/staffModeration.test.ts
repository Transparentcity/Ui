import { describe, expect, it } from "vitest";

import {
  isCanonicalStoryPath,
  nextPublicVisibility,
  storyIsPubliclyListed,
  visibilitySuccessMessage,
} from "./staffModeration";

describe("storyIsPubliclyListed", () => {
  it("treats active, published, and a missing status as public", () => {
    expect(storyIsPubliclyListed("active")).toBe(true);
    expect(storyIsPubliclyListed("published")).toBe(true);
    expect(storyIsPubliclyListed(null)).toBe(true);
    expect(storyIsPubliclyListed(undefined)).toBe(true);
    expect(storyIsPubliclyListed("")).toBe(true);
  });

  it("treats hidden, draft, and archived as off the public site", () => {
    expect(storyIsPubliclyListed("hidden")).toBe(false);
    expect(storyIsPubliclyListed("draft")).toBe(false);
    expect(storyIsPubliclyListed("archived")).toBe(false);
  });
});

describe("nextPublicVisibility", () => {
  it("hides a public story and restores a hidden one to active", () => {
    expect(nextPublicVisibility("active")).toBe("hidden");
    expect(nextPublicVisibility("published")).toBe("hidden");
    expect(nextPublicVisibility("hidden")).toBe("active");
    expect(nextPublicVisibility("draft")).toBe("active");
  });
});

describe("visibilitySuccessMessage", () => {
  it("names the resulting public state", () => {
    expect(visibilitySuccessMessage("hidden")).toMatch(/Hidden/);
    expect(visibilitySuccessMessage("active")).toMatch(/public/);
  });
});

describe("isCanonicalStoryPath", () => {
  it("accepts only city story paths", () => {
    expect(isCanonicalStoryPath("/c/oakland/stories/abc123")).toBe(true);
    expect(isCanonicalStoryPath("/s/abc123")).toBe(false);
    expect(isCanonicalStoryPath("/c/oakland")).toBe(false);
  });
});

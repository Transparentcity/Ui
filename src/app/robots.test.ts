/**
 * robots.txt must keep the blanket /api disallow but let social crawlers
 * fetch story-card images under /api/feed/public/story-image/. X's
 * Twitterbot checks robots.txt before fetching twitter:image and drops the
 * thumbnail when the path is disallowed.
 */
import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/siteUrl", () => ({
  getSiteOrigin: () => "https://transparent.city",
}));

import robots from "./robots";

const STORY_IMAGE = "/api/feed/public/story-image/";

describe("robots", () => {
  const rules = robots().rules as Array<{
    userAgent: string;
    allow?: string | string[];
    disallow?: string | string[];
  }>;
  const asList = (v: string | string[] | undefined) =>
    v === undefined ? [] : Array.isArray(v) ? v : [v];

  it("allows story-card images for the default crawler group", () => {
    const star = rules.find((r) => r.userAgent === "*")!;
    expect(asList(star.allow)).toContain(STORY_IMAGE);
    expect(asList(star.disallow)).toContain("/api");
  });

  it("allows story-card images for every group that disallows /api", () => {
    for (const rule of rules) {
      if (asList(rule.disallow).includes("/api")) {
        expect(asList(rule.allow), rule.userAgent).toContain(STORY_IMAGE);
      }
    }
  });

  it("still blocks AI training bots from the whole site", () => {
    const gpt = rules.find((r) => r.userAgent === "GPTBot")!;
    expect(asList(gpt.disallow)).toEqual(["/"]);
    expect(asList(gpt.allow)).toEqual([]);
  });
});

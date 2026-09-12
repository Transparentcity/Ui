/**
 * Short-link (/s/{hash}) redirect-target resolution.
 *
 * Pins the two things the redirect must never lose: the canonical
 * /c/{slug}/stories/{hash} path, and the query string that newsletter click
 * tracking and the landing banner read on the destination page.
 */
import { describe, it, expect } from "vitest";

import {
  canonicalStoryPath,
  normalizeSearch,
  resolveCitySlug,
  shortLinkRedirectPath,
} from "./shortLink";

const STORY = { id: 5642, city_id: 56919 };
const CITIES = [
  { id: 1, name: "Oakland" },
  { id: 56919, name: "Detroit" },
  { id: 42, name: "New York City" },
];

describe("canonicalStoryPath", () => {
  it("builds the canonical story URL", () => {
    expect(canonicalStoryPath("detroit", "b6QaJOQa")).toBe("/c/detroit/stories/b6QaJOQa");
  });

  it("escapes path segments so a hash cannot break out of the route", () => {
    expect(canonicalStoryPath("detroit", "a/b")).toBe("/c/detroit/stories/a%2Fb");
  });
});

describe("resolveCitySlug", () => {
  it("slugifies the sitemap city matching the story's city_id", () => {
    expect(resolveCitySlug(STORY, CITIES)).toBe("detroit");
    expect(resolveCitySlug({ id: 1, city_id: 42 }, CITIES)).toBe("new-york-city");
  });

  it("returns null when the city is missing, unnamed, or unknown", () => {
    expect(resolveCitySlug(STORY, [])).toBeNull();
    expect(resolveCitySlug(STORY, null)).toBeNull();
    expect(resolveCitySlug({ id: 1, city_id: null }, CITIES)).toBeNull();
    expect(resolveCitySlug({ id: 1, city_id: 7 }, [{ id: 7, name: null }])).toBeNull();
  });
});

describe("normalizeSearch", () => {
  it("keeps a query string and its leading question mark", () => {
    expect(normalizeSearch("?utm_source=newsletter")).toBe("?utm_source=newsletter");
    expect(normalizeSearch("utm_source=newsletter")).toBe("?utm_source=newsletter");
  });

  it("collapses empty input to nothing", () => {
    expect(normalizeSearch("")).toBe("");
    expect(normalizeSearch("?")).toBe("");
    expect(normalizeSearch(null)).toBe("");
    expect(normalizeSearch(undefined)).toBe("");
  });
});

describe("shortLinkRedirectPath", () => {
  it("points at the canonical story page", () => {
    expect(shortLinkRedirectPath("b6QaJOQa", STORY, CITIES)).toBe(
      "/c/detroit/stories/b6QaJOQa",
    );
  });

  it("forwards utm and nl params to the canonical page", () => {
    expect(
      shortLinkRedirectPath(
        "b6QaJOQa",
        STORY,
        CITIES,
        "?utm_source=newsletter&utm_campaign=weekly&nl=tok123",
      ),
    ).toBe(
      "/c/detroit/stories/b6QaJOQa?utm_source=newsletter&utm_campaign=weekly&nl=tok123",
    );
  });

  it("forwards the query verbatim, keeping order, repeats and bare flags", () => {
    // The landing banner activates on params.has("nl"), so a valueless
    // flag has to survive the hop; rebuilding the query would drop it.
    expect(shortLinkRedirectPath("b6QaJOQa", STORY, CITIES, "?nl")).toBe(
      "/c/detroit/stories/b6QaJOQa?nl",
    );
    expect(
      shortLinkRedirectPath("b6QaJOQa", STORY, CITIES, "?utm_content=a&utm_content=b&z=1"),
    ).toBe("/c/detroit/stories/b6QaJOQa?utm_content=a&utm_content=b&z=1");
  });

  it("falls back to the legacy feed page when no city slug resolves", () => {
    expect(shortLinkRedirectPath("b6QaJOQa", STORY, [], "?nl=tok")).toBe("/feed/5642?nl=tok");
    expect(shortLinkRedirectPath("b6QaJOQa", STORY, null)).toBe("/feed/5642");
  });
});

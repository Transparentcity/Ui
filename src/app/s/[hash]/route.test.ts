/**
 * Tests for /s/[hash].
 *
 * As a page this route streamed a shell before redirect() ran, so it
 * answered 200 with a client-side redirect payload. Link-preview crawlers
 * (X, Slack, iMessage, Facebook) never run that payload and unfurled the
 * root layout's default Open Graph card for every short link. These tests
 * pin the contract that a short link answers with a real HTTP 307 to the
 * canonical story page, query string intact.
 */
import { vi, describe, it, expect, beforeEach } from "vitest";

const getPublicFeedStoryByHash = vi.fn();
const listPublicCitiesForSitemap = vi.fn();

vi.mock("@/lib/publicApiClient", () => ({
  getPublicFeedStoryByHash: (hash: string) => getPublicFeedStoryByHash(hash),
  listPublicCitiesForSitemap: () => listPublicCitiesForSitemap(),
}));

import { GET } from "./route";

const HASH = "b6QaJOQa";
const STORY = { id: 5642, city_id: 56919, headline: "Aviation Sub's Water Main" };
const CITIES = [{ id: 56919, name: "Detroit" }];

function req(path: string) {
  return new Request(`https://transparent.city${path}`);
}

function ctx(hash: string) {
  return { params: Promise.resolve({ hash }) };
}

beforeEach(() => {
  getPublicFeedStoryByHash.mockReset().mockResolvedValue({ story: STORY });
  listPublicCitiesForSitemap.mockReset().mockResolvedValue(CITIES);
});

describe("GET /s/[hash]", () => {
  it("answers with a real HTTP 307 to the canonical story page", async () => {
    const res = await GET(req(`/s/${HASH}`), ctx(HASH));

    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe(`/c/detroit/stories/${HASH}`);
    expect(res.body).toBeNull();
  });

  it("forwards utm and nl params so newsletter tracking still fires", async () => {
    const query = "?utm_source=newsletter&utm_campaign=weekly&nl=tok123";
    const res = await GET(req(`/s/${HASH}${query}`), ctx(HASH));

    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe(`/c/detroit/stories/${HASH}${query}`);
  });

  it("falls back to the legacy feed page when the city slug is unknown", async () => {
    listPublicCitiesForSitemap.mockResolvedValue([]);

    const res = await GET(req(`/s/${HASH}?nl=tok`), ctx(HASH));

    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("/feed/5642?nl=tok");
  });

  it("still redirects when the sitemap lookup fails", async () => {
    listPublicCitiesForSitemap.mockRejectedValue(new Error("sitemap down"));

    const res = await GET(req(`/s/${HASH}`), ctx(HASH));

    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("/feed/5642");
  });

  it("skips the sitemap lookup for a story with no city", async () => {
    getPublicFeedStoryByHash.mockResolvedValue({ story: { id: 5642, city_id: null } });

    const res = await GET(req(`/s/${HASH}`), ctx(HASH));

    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("/feed/5642");
    expect(listPublicCitiesForSitemap).not.toHaveBeenCalled();
  });

  it("404s an unknown hash without letting the miss be cached", async () => {
    getPublicFeedStoryByHash.mockRejectedValue(new Error("404"));

    const res = await GET(req("/s/NOPE9999"), ctx("NOPE9999"));

    expect(res.status).toBe(404);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(res.headers.get("content-type")).toContain("text/html");
  });

  it("404s when the backend answers without a story", async () => {
    getPublicFeedStoryByHash.mockResolvedValue({ story: null });

    const res = await GET(req("/s/NOPE9999"), ctx("NOPE9999"));

    expect(res.status).toBe(404);
  });

  it("does not let the redirect itself be cached as immutable", async () => {
    const res = await GET(req(`/s/${HASH}`), ctx(HASH));

    expect(res.headers.get("cache-control")).toBe("public, max-age=0, must-revalidate");
  });
});

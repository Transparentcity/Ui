/**
 * Tests for /c/[slug]/stories/[hash]/card-image.
 *
 * This route is what og:image / twitter:image point at for every story, so it
 * has to serve the backend's chart when there is one and still hand back a
 * headline card whenever that fetch is anything less than a clean image.
 */
import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";

vi.mock("@/lib/apiBase", () => ({
  getUpstreamApiBaseUrl: () => "https://api.example.test",
}));

const getPublicFeedStoryByHash = vi.fn();
vi.mock("@/lib/publicApiClient", () => ({
  getPublicFeedStoryByHash: (hash: string) => getPublicFeedStoryByHash(hash),
}));

// Rendering a real card needs satori + WASM; a marker response is enough to
// assert which branch the route took.
const imageResponse = vi.fn();
vi.mock("next/og", () => ({
  ImageResponse: vi.fn(function ImageResponseMock(
    element: unknown,
    options: { headers?: Record<string, string> },
  ) {
    imageResponse(element, options);
    return new Response("generated-card", {
      status: 200,
      headers: { "content-type": "image/png", ...(options?.headers ?? {}) },
    });
  }),
}));

import { GET } from "./route";

const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function story(overrides: Record<string, unknown> = {}) {
  return {
    story: {
      id: 1,
      headline: "Zero Water Main Breaks at Heyden St in 2025. Now 3.",
      summary: "Three breaks on one block.",
      description: "Three breaks on one block.",
      city_name: "Detroit",
      published_at: "2026-09-05T18:00:00Z",
      image_url: "/api/feed/public/story-image/b6QaJOQa",
      ...overrides,
    },
  };
}

function ctx(slug = "detroit", hash = "b6QaJOQa") {
  return { params: Promise.resolve({ slug, hash }) };
}

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  imageResponse.mockReset();
  getPublicFeedStoryByHash.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("GET /c/[slug]/stories/[hash]/card-image", () => {
  it("serves the backend story image from the story's own path", async () => {
    getPublicFeedStoryByHash.mockResolvedValue(story());
    fetchMock.mockResolvedValue(
      new Response(PNG_BYTES, { status: 200, headers: { "content-type": "image/png" } }),
    );

    const res = await GET(new Request("https://transparent.city/x"), ctx());

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.example.test/api/feed/public/story-image/b6QaJOQa",
      expect.objectContaining({ headers: { Accept: "image/*" } }),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/png");
    expect(res.headers.get("cache-control")).toContain("max-age=3600");
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(PNG_BYTES);
    expect(imageResponse).not.toHaveBeenCalled();
  });

  it("follows image_url onto other backend paths, query included", async () => {
    getPublicFeedStoryByHash.mockResolvedValue(
      story({ image_url: "/api/time-series/public/3890858/image?period=month" }),
    );
    fetchMock.mockResolvedValue(
      new Response(PNG_BYTES, { status: 200, headers: { "content-type": "image/png" } }),
    );

    await GET(new Request("https://transparent.city/x"), ctx());

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.example.test/api/time-series/public/3890858/image?period=month",
      expect.anything(),
    );
  });

  it("draws the headline card when the story has no backend image", async () => {
    getPublicFeedStoryByHash.mockResolvedValue(story({ image_url: null }));

    const res = await GET(new Request("https://transparent.city/x"), ctx());

    expect(fetchMock).not.toHaveBeenCalled();
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("generated-card");
    expect(imageResponse).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["an upstream error", () => Promise.resolve(new Response("nope", { status: 502 }))],
    [
      "a non-image body",
      () =>
        Promise.resolve(
          new Response("<html>login</html>", {
            status: 200,
            headers: { "content-type": "text/html" },
          }),
        ),
    ],
    ["a network failure", () => Promise.reject(new Error("ECONNRESET"))],
  ])("falls back to the headline card on %s", async (_label, upstream) => {
    getPublicFeedStoryByHash.mockResolvedValue(story());
    fetchMock.mockImplementation(upstream);

    const res = await GET(new Request("https://transparent.city/x"), ctx());

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/png");
    expect(await res.text()).toBe("generated-card");
  });

  it("404s an unknown story and 400s a malformed hash", async () => {
    getPublicFeedStoryByHash.mockRejectedValue(new Error("404"));
    const missing = await GET(new Request("https://transparent.city/x"), ctx());
    expect(missing.status).toBe(404);

    const bad = await GET(new Request("https://transparent.city/x"), ctx("detroit", "no/slashes"));
    expect(bad.status).toBe(400);
    expect(getPublicFeedStoryByHash).toHaveBeenCalledTimes(1);
  });
});

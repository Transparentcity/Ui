/**
 * Tests for /m/[hash]/card-image, the og:image / twitter:image of a map page
 * without an admin-picked image.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/apiBase", () => ({
  getUpstreamApiBaseUrl: () => "https://api.example.test",
}));

import { GET } from "./route";

const MAP_PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x01]);
const DEFAULT_PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x02]);
const MAP_IMAGE_URL = "https://api.example.test/api/maps/public/zc0iwY9h/image?width=1200&height=630";
const DEFAULT_IMAGE_URL = "https://transparent.city/images/og-map-default.png";

function png(bytes: Uint8Array): Response {
  return new Response(bytes, { status: 200, headers: { "content-type": "image/png" } });
}

function ctx(hash = "zc0iwY9h") {
  return { params: Promise.resolve({ hash }) };
}

function request(): Request {
  return new Request("https://transparent.city/m/zc0iwY9h/card-image");
}

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("GET /m/[hash]/card-image", () => {
  it("serves the backend's 1200x630 map image from the map's own path", async () => {
    fetchMock.mockResolvedValue(png(MAP_PNG));

    const res = await GET(request(), ctx());

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(MAP_IMAGE_URL, expect.anything());
    expect(res.status).toBe(200);
    expect(res.headers.get("content-length")).toBe(String(MAP_PNG.byteLength));
    expect(res.headers.get("cache-control")).toContain("s-maxage=86400");
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(MAP_PNG);
  });

  it.each([403, 404])("404s a map the backend answers %s for", async (status) => {
    fetchMock.mockResolvedValue(new Response("gone", { status }));

    const res = await GET(request(), ctx());

    expect(res.status).toBe(404);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("serves the generic map card briefly when the render fails", async () => {
    fetchMock.mockImplementation((url: string) =>
      Promise.resolve(url === DEFAULT_IMAGE_URL ? png(DEFAULT_PNG) : new Response("busy", { status: 504 })),
    );

    const res = await GET(request(), ctx());

    expect(fetchMock).toHaveBeenLastCalledWith(DEFAULT_IMAGE_URL, expect.anything());
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("public, max-age=300, s-maxage=300");
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(DEFAULT_PNG);
  });

  it("502s when neither image loads", async () => {
    fetchMock.mockRejectedValue(new Error("ECONNRESET"));

    const res = await GET(request(), ctx());

    expect(res.status).toBe(502);
    expect(res.headers.get("cache-control")).toBe("public, max-age=300, s-maxage=300");
  });

  it("400s a malformed hash without calling the backend", async () => {
    const res = await GET(request(), ctx("no/slashes"));

    expect(res.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

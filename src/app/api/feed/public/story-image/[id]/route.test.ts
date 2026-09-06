/**
 * Tests for /api/feed/public/story-image/[id].
 *
 * The backend only accepts GET on this path (HEAD -> 405), which makes X's
 * crawler drop link-preview thumbnails. These tests pin the contract that
 * HEAD returns 200 with the same image headers as GET and no body.
 */
import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/apiBase", () => ({
  getUpstreamApiBaseUrl: () => "https://api.example.test",
}));

import { GET, HEAD, buildImageHeaders } from "./route";

const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function upstreamImage(extra: Record<string, string> = {}, body: BodyInit | null = PNG_BYTES) {
  return new Response(body, {
    status: 200,
    headers: {
      "content-type": "image/png",
      "cache-control": "public, max-age=86400",
      ...extra,
    },
  });
}

function ctx(id: string) {
  return { params: Promise.resolve({ id }) };
}

function req(method: "GET" | "HEAD", id: string) {
  return new NextRequest(`https://transparent.city/api/feed/public/story-image/${id}`, { method });
}

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("HEAD /api/feed/public/story-image/[id]", () => {
  it("returns 200 with image headers and no body", async () => {
    fetchMock.mockResolvedValue(upstreamImage({ "content-length": "193987" }));

    const res = await HEAD(req("HEAD", "O5LjXq8T"), ctx("O5LjXq8T"));

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/png");
    expect(res.headers.get("cache-control")).toBe("public, max-age=86400");
    expect(res.headers.get("content-length")).toBe("193987");
    expect(res.body).toBeNull();
  });

  it("issues a GET upstream (backend rejects HEAD) against the upstream API origin", async () => {
    fetchMock.mockResolvedValue(upstreamImage());

    await HEAD(req("HEAD", "O5LjXq8T"), ctx("O5LjXq8T"));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.example.test/api/feed/public/story-image/O5LjXq8T");
    expect(init.method).toBe("GET");
  });

  it("propagates upstream 404 without a body", async () => {
    fetchMock.mockResolvedValue(
      new Response('{"detail":"Story image not found"}', {
        status: 404,
        headers: { "content-type": "application/json" },
      }),
    );

    const res = await HEAD(req("HEAD", "missing1"), ctx("missing1"));

    expect(res.status).toBe(404);
    expect(res.body).toBeNull();
  });

  it("maps upstream 5xx to 502", async () => {
    fetchMock.mockResolvedValue(new Response("boom", { status: 500 }));
    const res = await HEAD(req("HEAD", "O5LjXq8T"), ctx("O5LjXq8T"));
    expect(res.status).toBe(502);
  });

  it("returns 502 when upstream is unreachable", async () => {
    fetchMock.mockRejectedValue(new Error("ECONNREFUSED"));
    const res = await HEAD(req("HEAD", "O5LjXq8T"), ctx("O5LjXq8T"));
    expect(res.status).toBe(502);
  });

  it("rejects malformed hashes before calling upstream", async () => {
    const res = await HEAD(req("HEAD", "bad"), ctx("../etc"));
    expect(res.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("GET /api/feed/public/story-image/[id]", () => {
  it("streams the upstream image with matching headers", async () => {
    fetchMock.mockResolvedValue(upstreamImage({ "content-length": String(PNG_BYTES.length) }));

    const res = await GET(req("GET", "O5LjXq8T"), ctx("O5LjXq8T"));

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/png");
    expect(res.headers.get("cache-control")).toBe("public, max-age=86400");
    expect(res.headers.get("content-length")).toBe(String(PNG_BYTES.length));
    const bytes = new Uint8Array(await res.arrayBuffer());
    expect(Array.from(bytes)).toEqual(Array.from(PNG_BYTES));
  });

  it("preserves a non-PNG content type from the proxy fallback", async () => {
    fetchMock.mockResolvedValue(upstreamImage({ "content-type": "image/jpeg" }));
    const res = await GET(req("GET", "O5LjXq8T"), ctx("O5LjXq8T"));
    expect(res.headers.get("content-type")).toBe("image/jpeg");
  });

  it("propagates upstream 404", async () => {
    fetchMock.mockResolvedValue(new Response("nope", { status: 404 }));
    const res = await GET(req("GET", "missing1"), ctx("missing1"));
    expect(res.status).toBe(404);
  });

  it("rejects malformed hashes before calling upstream", async () => {
    const res = await GET(req("GET", "bad"), ctx("a b"));
    expect(res.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("buildImageHeaders", () => {
  it("drops content-length when upstream body was content-encoded", () => {
    const h = buildImageHeaders(
      new Headers({
        "content-type": "image/png",
        "content-length": "123",
        "content-encoding": "gzip",
      }),
    );
    expect(h.get("content-length")).toBeNull();
    expect(h.get("content-encoding")).toBeNull();
    expect(h.get("content-type")).toBe("image/png");
  });

  it("defaults content-type to image/png when upstream omits it", () => {
    expect(buildImageHeaders(new Headers()).get("content-type")).toBe("image/png");
  });
});

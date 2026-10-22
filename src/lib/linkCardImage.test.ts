import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  cardImagePathForLink,
  cardImageResponse,
  chartCardImagePath,
  fetchCardImage,
  mapCardImagePath,
} from "./linkCardImage";

const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);

describe("card image paths", () => {
  it("serves chart and map cards from the page's own path", () => {
    expect(chartCardImagePath(147322)).toBe("/t/147322/card-image");
    expect(mapCardImagePath("zc0iwY9h")).toBe("/m/zc0iwY9h/card-image");
  });

  it.each([
    ["https://transparent.city/t/147322?period=ytd", "/t/147322/card-image"],
    ["https://transparent.city/t/147322/", "/t/147322/card-image"],
    ["http://localhost:3001/m/1BX7d2-u", "/m/1BX7d2-u/card-image"],
  ])("finds the card for %s", (link, path) => {
    expect(cardImagePathForLink(link)).toBe(path);
  });

  it.each([
    "https://transparent.city/c/san-francisco/metrics/sf_new_residential_housing_units_completed",
    "https://transparent.city/t/abc",
    "https://transparent.city/t/147322/card-image",
    "https://transparent.city/m/has/slash",
    "not a url",
  ])("has no card for %s", (link) => {
    expect(cardImagePathForLink(link)).toBeNull();
  });
});

describe("fetchCardImage", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("buffers an image response", async () => {
    fetchMock.mockResolvedValue(
      new Response(PNG_BYTES, { status: 200, headers: { "content-type": "image/png" } }),
    );

    const image = await fetchCardImage("https://api.example.test/a.png");

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.example.test/a.png",
      expect.objectContaining({ headers: { Accept: "image/*" }, cache: "no-store" }),
    );
    expect(image).not.toBeNull();
    expect(image).not.toBe("missing");
    if (image && image !== "missing") {
      expect(new Uint8Array(image.body)).toEqual(PNG_BYTES);
      expect(image.contentType).toBe("image/png");
    }
  });

  it.each([403, 404])("reports a %s as missing", async (status) => {
    fetchMock.mockResolvedValue(new Response("gone", { status }));
    expect(await fetchCardImage("https://api.example.test/a.png")).toBe("missing");
  });

  it.each([
    ["an upstream error", () => Promise.resolve(new Response("nope", { status: 502 }))],
    [
      "a non-image body",
      () =>
        Promise.resolve(
          new Response("<html></html>", { status: 200, headers: { "content-type": "text/html" } }),
        ),
    ],
    [
      "an empty image",
      () =>
        Promise.resolve(new Response(new Uint8Array(), { status: 200, headers: { "content-type": "image/png" } })),
    ],
    ["a network failure", () => Promise.reject(new Error("ECONNRESET"))],
  ])("returns null on %s", async (_label, upstream) => {
    fetchMock.mockImplementation(upstream);
    expect(await fetchCardImage("https://api.example.test/a.png")).toBeNull();
  });
});

describe("cardImageResponse", () => {
  it("sends the image with its length and cache policy", async () => {
    const res = cardImageResponse(
      { body: PNG_BYTES.buffer.slice(0) as ArrayBuffer, contentType: "image/png" },
      "public, max-age=60",
    );

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/png");
    expect(res.headers.get("content-length")).toBe(String(PNG_BYTES.byteLength));
    expect(res.headers.get("cache-control")).toBe("public, max-age=60");
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(PNG_BYTES);
  });
});

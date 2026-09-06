/**
 * Tests for the /api/cities/[city_id]/structure proxy route.
 *
 * Anonymous callers (public map embeds) are served from the anonymous
 * /api/public/... endpoint, which is the only one that does not 401 without a
 * token. Signed-in callers need the full payload (leaders, shapefiles, ...)
 * that only the authenticated endpoints return, so an Authorization header
 * routes to those first, with the public endpoint as a last resort.
 *
 * The authenticated attempts forward both Authorization and
 * X-Impersonate-User-Id so a proxy session reaches the backend as the proxied
 * user. The public attempt must stay anonymous: it takes no auth, so sending
 * identity headers there would be pointless at best.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/apiBase", () => ({
  getUpstreamApiBaseUrl: () => "https://api.example.test",
}));

import { GET } from "./route";

const BASE = "https://api.example.test";

function structureRequest(
  headers: Record<string, string> = {},
  search = ""
): Request {
  return new Request(
    `https://transparent.city/api/cities/57260/structure${search}`,
    { method: "GET", headers }
  );
}

const params = Promise.resolve({ city_id: "57260" });

const notFound = () => new Response("nope", { status: 404 });
const unauthorized = () => new Response("no token", { status: 401 });
const ok = (body: unknown = { districts: [] }) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

/** URL of the nth fetch the handler made (0-indexed). */
function urlFor(call: number): string {
  return String(fetchMock.mock.calls[call][0]);
}

/** Headers for the nth fetch the handler made (0-indexed). */
function headersFor(call: number): Headers {
  const init = fetchMock.mock.calls[call][1] as RequestInit;
  return new Headers(init.headers as HeadersInit);
}

describe("city structure proxy endpoint selection", () => {
  it("serves anonymous callers from the public endpoint only", async () => {
    fetchMock.mockResolvedValue(ok({ district_fields: ["ward"] }));

    const res = await GET(structureRequest(), { params });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ district_fields: ["ward"] });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(urlFor(0)).toBe(`${BASE}/api/public/cities/57260/structure`);
  });

  it("does not retry anonymous callers against the authenticated endpoints", async () => {
    fetchMock.mockResolvedValue(unauthorized());

    const res = await GET(structureRequest(), { params });

    expect(res.status).toBe(401);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("prefers the authenticated endpoint when a token is present", async () => {
    const full = { leaders: [{ id: 1 }], shapefiles: [] };
    fetchMock.mockResolvedValue(ok(full));

    const res = await GET(
      structureRequest({ authorization: "Bearer test-token" }),
      { params }
    );

    expect(await res.json()).toEqual(full);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(urlFor(0)).toBe(`${BASE}/api/cities/57260/structure`);
  });

  it("falls back authed -> template-metrics -> public in order", async () => {
    fetchMock
      .mockResolvedValueOnce(unauthorized())
      .mockResolvedValueOnce(notFound())
      .mockResolvedValue(ok({ district_fields: [] }));

    const res = await GET(
      structureRequest({ authorization: "Bearer stale" }),
      { params }
    );

    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(urlFor(0)).toBe(`${BASE}/api/cities/57260/structure`);
    expect(urlFor(1)).toBe(
      `${BASE}/api/template-metrics/cities/57260/structure`
    );
    expect(urlFor(2)).toBe(`${BASE}/api/public/cities/57260/structure`);
  });

  it("reports the last upstream status when every attempt fails", async () => {
    fetchMock.mockResolvedValue(unauthorized());

    const res = await GET(
      structureRequest({ authorization: "Bearer stale" }),
      { params }
    );

    expect(res.status).toBe(401);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("forwards the caller's query string to the backend", async () => {
    fetchMock.mockResolvedValue(ok());

    await GET(
      structureRequest(
        { authorization: "Bearer test-token" },
        "?include_shapefiles=false"
      ),
      { params }
    );

    expect(urlFor(0)).toBe(
      `${BASE}/api/cities/57260/structure?include_shapefiles=false`
    );
  });

  it("rejects a non-numeric city id without calling the backend", async () => {
    const res = await GET(structureRequest(), {
      params: Promise.resolve({ city_id: "sf" }),
    });

    expect(res.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("city structure proxy identity forwarding", () => {
  it("forwards Authorization and the impersonation header on authed attempts", async () => {
    fetchMock.mockResolvedValueOnce(notFound()).mockResolvedValue(ok());

    await GET(
      structureRequest({
        authorization: "Bearer test-token",
        "x-impersonate-user-id": "4242",
      }),
      { params }
    );

    for (const call of [0, 1]) {
      const authed = headersFor(call);
      expect(authed.get("Authorization")).toBe("Bearer test-token");
      expect(authed.get("X-Impersonate-User-Id")).toBe("4242");
    }
  });

  it("keeps the public attempt free of identity headers", async () => {
    fetchMock
      .mockResolvedValueOnce(notFound())
      .mockResolvedValueOnce(notFound())
      .mockResolvedValue(ok());

    await GET(
      structureRequest({
        authorization: "Bearer test-token",
        "x-impersonate-user-id": "4242",
      }),
      { params }
    );

    const publicAttempt = headersFor(2);
    expect(urlFor(2)).toBe(`${BASE}/api/public/cities/57260/structure`);
    expect(publicAttempt.has("Authorization")).toBe(false);
    expect(publicAttempt.has("X-Impersonate-User-Id")).toBe(false);
  });

  it("omits the impersonation header when the caller is not proxying", async () => {
    fetchMock.mockResolvedValue(ok());

    await GET(structureRequest({ authorization: "Bearer test-token" }), {
      params,
    });

    const authed = headersFor(0);
    expect(authed.get("Authorization")).toBe("Bearer test-token");
    expect(authed.has("X-Impersonate-User-Id")).toBe(false);
  });
});

/**
 * Tests for the /api/cities/[city_id]/structure proxy route.
 *
 * The handler tries the anonymous public endpoint first and only falls back to
 * the authenticated ones when that fails. The fallback rebuilt its headers by
 * hand and forwarded only Authorization, dropping X-Impersonate-User-Id, so a
 * proxy session reached the backend as the admin.
 *
 * The public call must stay anonymous: it takes no auth, so sending identity
 * headers there would be pointless at best.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/apiBase", () => ({
  getUpstreamApiBaseUrl: () => "https://api.example.test",
}));

import { GET } from "./route";

function structureRequest(headers: Record<string, string> = {}): Request {
  return new Request("https://transparent.city/api/cities/57260/structure", {
    method: "GET",
    headers,
  });
}

const params = Promise.resolve({ city_id: "57260" });

const notFound = () => new Response("nope", { status: 404 });
const ok = () =>
  new Response(JSON.stringify({ districts: [] }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

/** Headers for the nth fetch the handler made (0-indexed). */
function headersFor(call: number): Headers {
  const init = fetchMock.mock.calls[call][1] as RequestInit;
  return new Headers(init.headers as HeadersInit);
}

describe("city structure proxy identity forwarding", () => {
  it("forwards the impersonation header on the authenticated fallback", async () => {
    // Public endpoint fails, so the handler falls back to the authed ones.
    fetchMock.mockResolvedValueOnce(notFound()).mockResolvedValue(ok());

    await GET(
      structureRequest({
        authorization: "Bearer test-token",
        "x-impersonate-user-id": "4242",
      }),
      { params }
    );

    const authed = headersFor(1);
    expect(authed.get("Authorization")).toBe("Bearer test-token");
    expect(authed.get("X-Impersonate-User-Id")).toBe("4242");
  });

  it("keeps the anonymous public attempt free of identity headers", async () => {
    fetchMock.mockResolvedValueOnce(notFound()).mockResolvedValue(ok());

    await GET(
      structureRequest({
        authorization: "Bearer test-token",
        "x-impersonate-user-id": "4242",
      }),
      { params }
    );

    const publicAttempt = headersFor(0);
    expect(publicAttempt.has("Authorization")).toBe(false);
    expect(publicAttempt.has("X-Impersonate-User-Id")).toBe(false);
  });

  it("omits the impersonation header when the caller is not proxying", async () => {
    fetchMock.mockResolvedValueOnce(notFound()).mockResolvedValue(ok());

    await GET(structureRequest({ authorization: "Bearer test-token" }), {
      params,
    });

    const authed = headersFor(1);
    expect(authed.get("Authorization")).toBe("Bearer test-token");
    expect(authed.has("X-Impersonate-User-Id")).toBe(false);
  });
});

/**
 * Anonymous callers (public map pages, embeds) must be served from the
 * backend's public structure endpoint. Before the rewrite ordering fix in
 * next.config.ts this handler was shadowed by the catch-all /api proxy, so
 * anonymous requests reached the backend directly and got 401.
 */
describe("city structure anonymous access", () => {
  const paramsFor = (city_id: string) => ({ params: Promise.resolve({ city_id }) });

  it("serves anonymous callers from the public endpoint", async () => {
    fetchMock.mockResolvedValue(ok());

    const res = await GET(structureRequest(), { params });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ districts: [] });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe(
      "https://api.example.test/api/public/cities/57260/structure"
    );
  });

  it("does not try authenticated endpoints without Authorization", async () => {
    fetchMock.mockResolvedValue(notFound());
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    const res = await GET(structureRequest(), { params });

    expect(res.status).toBe(404);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("tries the authenticated endpoints in order after the public one", async () => {
    fetchMock
      .mockResolvedValueOnce(notFound())
      .mockResolvedValueOnce(notFound())
      .mockResolvedValue(ok());

    const res = await GET(structureRequest({ authorization: "Bearer test-token" }), {
      params,
    });

    expect(res.status).toBe(200);
    expect(fetchMock.mock.calls.map((c) => c[0])).toEqual([
      "https://api.example.test/api/public/cities/57260/structure",
      "https://api.example.test/api/cities/57260/structure",
      "https://api.example.test/api/template-metrics/cities/57260/structure",
    ]);
  });

  it("rejects a non-numeric city id before calling upstream", async () => {
    const res = await GET(structureRequest(), paramsFor("abc"));

    expect(res.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns 500 with details when upstream is unreachable", async () => {
    fetchMock.mockRejectedValue(new Error("ECONNREFUSED"));
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    const res = await GET(structureRequest(), { params });

    expect(res.status).toBe(500);
    expect((await res.json()).details).toBe("ECONNREFUSED");
  });
});

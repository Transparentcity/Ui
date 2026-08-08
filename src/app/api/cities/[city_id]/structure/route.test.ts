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

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  deleteMap,
  deleteResearch,
  exportAdminMetrics,
  exportWasteFindings,
  sendChatMessageStream,
  uploadAvatar,
} from "./apiClient";
import { clearImpersonation, setImpersonation } from "./impersonation";

/**
 * Regression guard for the proxy-session identity bugs.
 *
 * `createNewSession` goes through `request()`, which sends
 * `X-Impersonate-User-Id`, so the session is created owned by the proxied
 * user. The streaming send hand-rolls its own fetch; when it omitted that
 * header the backend resolved the caller as the admin, could not find the
 * proxied user's session, and the UI showed "Session not found".
 *
 * The same omission affected the other hand-rolled fetches in `apiClient` that
 * act on user-owned rows. Those are covered further down, along with negative
 * assertions on the admin-only surfaces that deliberately stay as the admin.
 */

function emptyStreamResponse(): Response {
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.close();
    },
  });
  return new Response(body, {
    status: 200,
    headers: { "Content-Type": "text/event-stream" },
  });
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  clearImpersonation();
  fetchMock = vi.fn().mockResolvedValue(emptyStreamResponse());
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  clearImpersonation();
  vi.unstubAllGlobals();
});

function headersFromLastCall(): Record<string, string> {
  const [, init] = fetchMock.mock.calls[0];
  return (init as RequestInit).headers as Record<string, string>;
}

describe("sendChatMessageStream identity headers", () => {
  it("forwards the impersonation header during a proxy session", async () => {
    setImpersonation(4242, "crutchre@hotmail.com");

    await sendChatMessageStream(
      { message: "hi", session_id: "session-abc", model_key: "claude-sonnet-4.6" },
      "test-token",
      () => {}
    );

    const headers = headersFromLastCall();
    expect(headers["X-Impersonate-User-Id"]).toBe("4242");
    expect(headers["Authorization"]).toBe("Bearer test-token");
  });

  it("omits the impersonation header when not proxying", async () => {
    await sendChatMessageStream(
      { message: "hi", session_id: "session-abc", model_key: "claude-sonnet-4.6" },
      "test-token",
      () => {}
    );

    const headers = headersFromLastCall();
    expect(headers["X-Impersonate-User-Id"]).toBeUndefined();
    expect(headers["Authorization"]).toBe("Bearer test-token");
  });
});

const TOKEN = "test-token";
const IMPERSONATION_HEADER = "X-Impersonate-User-Id";

/**
 * Replace the default stream stub with one returning `response`, and expose the
 * headers the call received.
 *
 * The hand-rolled call sites pass a plain object rather than a `Headers`
 * instance, so normalize through `Headers` to get case-insensitive lookup.
 */
function stubFetch(response: () => Response) {
  const spy = vi.fn(async () => response());
  vi.stubGlobal("fetch", spy);
  return {
    headers(): Headers {
      expect(spy).toHaveBeenCalledOnce();
      const init = spy.mock.calls[0][1] as RequestInit | undefined;
      return new Headers(init?.headers as HeadersInit);
    },
  };
}

const jsonOk = () =>
  new Response(JSON.stringify({ success: true, picture_url: "/a.png" }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });

const noContent = () => new Response(null, { status: 204 });

const blobOk = () => new Response(new Blob(["x"]), { status: 200 });

describe("user-scoped hand-rolled fetches", () => {
  it("deleteMap sends the impersonation header during a proxy session", async () => {
    setImpersonation(4242, "proxied@example.com");
    const fetchStub = stubFetch(noContent);

    await deleteMap(7, TOKEN);

    const headers = fetchStub.headers();
    expect(headers.get("Authorization")).toBe(`Bearer ${TOKEN}`);
    expect(headers.get(IMPERSONATION_HEADER)).toBe("4242");
  });

  it("deleteMap omits the impersonation header when not impersonating", async () => {
    const fetchStub = stubFetch(noContent);

    await deleteMap(7, TOKEN);

    const headers = fetchStub.headers();
    expect(headers.get("Authorization")).toBe(`Bearer ${TOKEN}`);
    expect(headers.has(IMPERSONATION_HEADER)).toBe(false);
  });

  it("deleteResearch sends the impersonation header during a proxy session", async () => {
    setImpersonation(99, "proxied@example.com");
    const fetchStub = stubFetch(noContent);

    await deleteResearch(31, TOKEN);

    const headers = fetchStub.headers();
    expect(headers.get("Authorization")).toBe(`Bearer ${TOKEN}`);
    expect(headers.get(IMPERSONATION_HEADER)).toBe("99");
  });

  it("deleteResearch omits the impersonation header when not impersonating", async () => {
    const fetchStub = stubFetch(noContent);

    await deleteResearch(31, TOKEN);

    expect(fetchStub.headers().has(IMPERSONATION_HEADER)).toBe(false);
  });

  it("uploadAvatar sends the impersonation header during a proxy session", async () => {
    setImpersonation(1234, "proxied@example.com");
    const fetchStub = stubFetch(jsonOk);

    await uploadAvatar(TOKEN, new File(["img"], "a.png", { type: "image/png" }));

    const headers = fetchStub.headers();
    expect(headers.get("Authorization")).toBe(`Bearer ${TOKEN}`);
    expect(headers.get(IMPERSONATION_HEADER)).toBe("1234");
  });

  it("uploadAvatar omits the impersonation header when not impersonating", async () => {
    const fetchStub = stubFetch(jsonOk);

    await uploadAvatar(TOKEN, new File(["img"], "a.png", { type: "image/png" }));

    expect(fetchStub.headers().has(IMPERSONATION_HEADER)).toBe(false);
  });

  it("uploadAvatar does not set Content-Type, leaving the FormData boundary to fetch", async () => {
    setImpersonation(1234, "proxied@example.com");
    const fetchStub = stubFetch(jsonOk);

    await uploadAvatar(TOKEN, new File(["img"], "a.png", { type: "image/png" }));

    expect(fetchStub.headers().has("Content-Type")).toBe(false);
  });
});

describe("admin-only surfaces stay as the admin", () => {
  it("exportAdminMetrics never sends the impersonation header", async () => {
    setImpersonation(4242, "proxied@example.com");
    const fetchStub = stubFetch(blobOk);

    await exportAdminMetrics(TOKEN);

    const headers = fetchStub.headers();
    expect(headers.get("Authorization")).toBe(`Bearer ${TOKEN}`);
    expect(headers.has(IMPERSONATION_HEADER)).toBe(false);
  });

  it("exportWasteFindings never sends the impersonation header", async () => {
    setImpersonation(4242, "proxied@example.com");
    const fetchStub = stubFetch(blobOk);

    await exportWasteFindings(TOKEN, "contracts", "csv");

    const headers = fetchStub.headers();
    expect(headers.get("Authorization")).toBe(`Bearer ${TOKEN}`);
    expect(headers.has(IMPERSONATION_HEADER)).toBe(false);
  });
});

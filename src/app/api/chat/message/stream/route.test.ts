/**
 * Tests for the /api/chat/message/stream SSE proxy route.
 *
 * This handler takes filesystem priority over the next.config `/api/:path*`
 * rewrite, so it is the only thing standing between the browser and the
 * backend for chat streaming. It hand-picks which headers to forward.
 *
 * `/api/chat/new` has no such handler and goes through the rewrite, which
 * forwards every header. So when this route dropped X-Impersonate-User-Id,
 * the session was created owned by the proxied user but the stream resolved
 * as the admin, and the backend answered "Session not found".
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import { POST } from "./route";

function streamRequest(headers: Record<string, string>): Request {
  return new Request("https://transparent.city/api/chat/message/stream", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify({ message: "hi", session_id: "session-abc" }),
  });
}

function sseResponse(): Response {
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
  fetchMock = vi.fn().mockResolvedValue(sseResponse());
  vi.stubGlobal("fetch", fetchMock);
});

function forwardedHeaders(): Headers {
  expect(fetchMock).toHaveBeenCalledOnce();
  const init = fetchMock.mock.calls[0][1] as RequestInit;
  return new Headers(init.headers as HeadersInit);
}

describe("chat stream proxy identity forwarding", () => {
  it("forwards X-Impersonate-User-Id to the backend during a proxy session", async () => {
    await POST(
      streamRequest({
        authorization: "Bearer test-token",
        "x-impersonate-user-id": "4242",
      }) as never
    );

    const headers = forwardedHeaders();
    expect(headers.get("X-Impersonate-User-Id")).toBe("4242");
    expect(headers.get("Authorization")).toBe("Bearer test-token");
  });

  it("omits the impersonation header when the caller is not proxying", async () => {
    await POST(streamRequest({ authorization: "Bearer test-token" }) as never);

    const headers = forwardedHeaders();
    expect(headers.has("X-Impersonate-User-Id")).toBe(false);
    expect(headers.get("Authorization")).toBe("Bearer test-token");
  });
});

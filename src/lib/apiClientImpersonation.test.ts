import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { sendChatMessageStream } from "./apiClient";
import { clearImpersonation, setImpersonation } from "./impersonation";

/**
 * Regression guard for the proxy-session chat bug.
 *
 * `createNewSession` goes through `request()`, which sends
 * `X-Impersonate-User-Id`, so the session is created owned by the proxied
 * user. The streaming send hand-rolls its own fetch; when it omitted that
 * header the backend resolved the caller as the admin, could not find the
 * proxied user's session, and the UI showed "Session not found".
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

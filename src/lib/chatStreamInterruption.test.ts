import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ChatStreamInterruptedError, sendChatMessageStream } from "./apiClient";

/**
 * A Seymour reply that outlives the proxy or function timeout used to end
 * silently (a clean close looked like a finished reply), and a mid-stream
 * network error re-sent the same message, starting the task over. These
 * tests pin the replacement behavior: a dropped stream surfaces as
 * ChatStreamInterruptedError and the message is sent exactly once.
 */

const encoder = new TextEncoder();

function streamResponse(chunks: string[], opts: { failAfter?: boolean } = {}): Response {
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      if (opts.failAfter) {
        controller.error(new TypeError("network error"));
      } else {
        controller.close();
      }
    },
  });
  return new Response(body, { status: 200, headers: { "Content-Type": "text/event-stream" } });
}

const REQUEST = { message: "Audit the payroll data", session_id: "s-1", model_key: "m" };

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("sendChatMessageStream interruption handling", () => {
  it("resolves when the backend sends its end event", async () => {
    fetchMock.mockResolvedValue(
      streamResponse(['data: {"type":"token","content":"Hi"}\n\n', 'data: {"type":"end"}\n\n'])
    );
    const events: string[] = [];
    await sendChatMessageStream(REQUEST, "t", (e) => events.push(e.type));
    expect(events).toEqual(["token", "end"]);
  });

  it("treats a backend error event as a finished stream", async () => {
    fetchMock.mockResolvedValue(
      streamResponse(['data: {"type":"error","content":"bad"}\n\n'])
    );
    await expect(sendChatMessageStream(REQUEST, "t", () => {})).resolves.toBeUndefined();
  });

  it("throws ChatStreamInterruptedError when the stream closes without end", async () => {
    fetchMock.mockResolvedValue(
      streamResponse([
        'data: {"type":"tool_call_start","tool_id":"a","tool_name":"query"}\n\n',
        ": keepalive\n\n",
      ])
    );
    const err = await sendChatMessageStream(REQUEST, "t", () => {}).catch((e) => e);
    expect(err).toBeInstanceOf(ChatStreamInterruptedError);
    expect((err as ChatStreamInterruptedError).eventCount).toBe(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does not re-send the message when the connection drops mid-stream", async () => {
    fetchMock.mockImplementation(() =>
      Promise.resolve(
        streamResponse(['data: {"type":"token","content":"Working"}\n\n'], { failAfter: true })
      )
    );
    const err = await sendChatMessageStream(REQUEST, "t", () => {}).catch((e) => e);
    expect(err).toBeInstanceOf(ChatStreamInterruptedError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("still retries when the request never reached the backend", async () => {
    vi.useFakeTimers();
    fetchMock
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValueOnce(streamResponse(['data: {"type":"end"}\n\n']));
    const done = sendChatMessageStream(REQUEST, "t", () => {});
    await vi.runAllTimersAsync();
    await expect(done).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("returns quietly when the user stops the reply", async () => {
    const controller = new AbortController();
    fetchMock.mockImplementation((_url: string, init: RequestInit) => {
      const body = new ReadableStream<Uint8Array>({
        start(c) {
          c.enqueue(encoder.encode('data: {"type":"token","content":"x"}\n\n'));
          init.signal?.addEventListener("abort", () => {
            // Browsers reject with a DOMException named AbortError; jsdom's
            // DOMException is not an Error subclass, so mirror the shape.
            const abortError = new Error("The operation was aborted.");
            abortError.name = "AbortError";
            c.error(abortError);
          });
        },
      });
      return Promise.resolve(new Response(body, { status: 200 }));
    });
    const done = sendChatMessageStream(REQUEST, "t", () => controller.abort(), controller.signal);
    await expect(done).resolves.toBeUndefined();
  });
});

describe("chatStreamBaseUrlFor", () => {
  it("streams straight from the API server on the live site hosts", async () => {
    const { chatStreamBaseUrlFor, getApiBaseUrlForAssets } = await import("./apiBase");
    // The configured API origin (https://api.transparent.city in production).
    const apiOrigin = getApiBaseUrlForAssets();
    expect(apiOrigin).toMatch(/^https?:\/\//);
    expect(chatStreamBaseUrlFor("transparent.city")).toBe(apiOrigin);
    expect(chatStreamBaseUrlFor("app.transparent.city")).toBe(apiOrigin);
  });

  it("keeps the same-origin proxy route everywhere else", async () => {
    const { chatStreamBaseUrlFor } = await import("./apiBase");
    // www redirects to the apex and is not in the API's CORS allow-list.
    expect(chatStreamBaseUrlFor("www.transparent.city")).toBeNull();
    expect(chatStreamBaseUrlFor("ui-git-branch.vercel.app")).toBeNull();
    expect(chatStreamBaseUrlFor("localhost")).toBeNull();
    expect(chatStreamBaseUrlFor(undefined)).toBeNull();
  });
});

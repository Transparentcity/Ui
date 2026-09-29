import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { sendChatMessageStream, type StreamEvent } from "./apiClient";

/**
 * Retry policy for the Seymour SSE stream.
 *
 * A stream that dies after the backend has already started answering must not
 * be replayed: the agent run behind it is lost, and re-sending the message
 * starts a second full run that is billed again. Only a failure to get any
 * event at all (connection refused, DNS, a drop before the first byte) is
 * retried.
 */

const encoder = new TextEncoder();

function sse(event: object): Uint8Array {
  return encoder.encode(`data: ${JSON.stringify(event)}\n\n`);
}

/**
 * A 200 stream that emits `events`, then errors like a severed connection.
 *
 * Chunks are handed out from `pull` one at a time: erroring a stream discards
 * whatever is still queued, so enqueueing everything up front in `start` and
 * then erroring would deliver nothing at all.
 */
function severedStreamResponse(events: object[]): Response {
  let next = 0;
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (next < events.length) {
        controller.enqueue(sse(events[next++]));
      } else {
        controller.error(new TypeError("network error"));
      }
    },
  });
  return new Response(body, {
    status: 200,
    headers: { "Content-Type": "text/event-stream" },
  });
}

function completeStreamResponse(events: object[]): Response {
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const event of events) controller.enqueue(sse(event));
      controller.close();
    },
  });
  return new Response(body, {
    status: 200,
    headers: { "Content-Type": "text/event-stream" },
  });
}

const request = { message: "hello", model_key: "gpt-5.6-terra" };

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("sendChatMessageStream retry policy", () => {
  it("does not replay the message when the stream drops mid-response", async () => {
    const fetchMock = vi.fn(async () =>
      severedStreamResponse([
        { type: "session_id", content: "abc" },
        { type: "token", content: "Pulling 311" },
      ])
    );
    vi.stubGlobal("fetch", fetchMock);
    const events: StreamEvent[] = [];

    const run = sendChatMessageStream(request, "tok", (e) => events.push(e));
    const settled = run.catch((e: unknown) => e);
    await vi.runAllTimersAsync();
    expect(await settled).toBeInstanceOf(TypeError);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(events.slice(0, 2).map((e) => e.type)).toEqual([
      "session_id",
      "token",
    ]);
    const errorEvent = events.find((e) => e.type === "error");
    expect(errorEvent?.content).toMatch(/dropped while Seymour was still working/);
    expect(errorEvent?.content).toMatch(/network error/);
    expect(errorEvent?.content).toMatch(/send the message again/);
  });

  it("retries when the connection fails before any event arrives", async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValueOnce(
        completeStreamResponse([
          { type: "session_id", content: "abc" },
          { type: "end" },
        ])
      );
    vi.stubGlobal("fetch", fetchMock);
    const events: StreamEvent[] = [];

    const run = sendChatMessageStream(request, "tok", (e) => events.push(e));
    await vi.runAllTimersAsync();
    await expect(run).resolves.toBeUndefined();

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(events.map((e) => e.type)).toEqual(["session_id", "end"]);
  });

  it("forwards a bare error when every attempt failed before the first event", async () => {
    const fetchMock = vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    });
    vi.stubGlobal("fetch", fetchMock);
    const events: StreamEvent[] = [];

    const run = sendChatMessageStream(request, "tok", (e) => events.push(e));
    const settled = run.catch((e: unknown) => e);
    await vi.runAllTimersAsync();
    expect(await settled).toBeInstanceOf(TypeError);

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(events).toEqual([{ type: "error", content: "Failed to fetch" }]);
  });
});

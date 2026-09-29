import { afterEach, describe, expect, it, vi } from "vitest";

import { SSE_KEEPALIVE_COMMENT, withSseKeepalive } from "./sseKeepalive";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function controllable() {
  let ctrl!: ReadableStreamDefaultController<Uint8Array>;
  const stream = new ReadableStream<Uint8Array>({
    start(c) {
      ctrl = c;
    },
  });
  return { stream, push: (s: string) => ctrl.enqueue(encoder.encode(s)), close: () => ctrl.close() };
}

async function readAll(stream: ReadableStream<Uint8Array>): Promise<string> {
  const reader = stream.getReader();
  let out = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) return out;
    out += decoder.decode(value);
  }
}

afterEach(() => {
  vi.useRealTimers();
});

describe("withSseKeepalive", () => {
  it("passes upstream bytes through unchanged", async () => {
    const up = controllable();
    const wrapped = withSseKeepalive(up.stream, 10_000);
    up.push('data: {"type":"token"}\n\n');
    up.close();
    expect(await readAll(wrapped)).toBe('data: {"type":"token"}\n\n');
  });

  it("writes a keepalive comment while the upstream is silent", async () => {
    vi.useFakeTimers();
    const up = controllable();
    const wrapped = withSseKeepalive(up.stream, 1000);
    const result = readAll(wrapped);
    up.push('data: {"type":"tool_call_start"}\n\n');
    await vi.advanceTimersByTimeAsync(2600);
    up.push('data: {"type":"end"}\n\n');
    up.close();
    await vi.runAllTimersAsync();
    const text = await result;
    expect(text.startsWith('data: {"type":"tool_call_start"}\n\n')).toBe(true);
    expect(text).toContain(SSE_KEEPALIVE_COMMENT);
    expect(text.endsWith('data: {"type":"end"}\n\n')).toBe(true);
  });

  it("never writes a keepalive inside a split event", async () => {
    vi.useFakeTimers();
    const up = controllable();
    const wrapped = withSseKeepalive(up.stream, 1000);
    const result = readAll(wrapped);
    up.push('data: {"type":"tok');
    await vi.advanceTimersByTimeAsync(5000);
    up.push('en"}\n\n');
    up.close();
    await vi.runAllTimersAsync();
    expect(await result).toBe('data: {"type":"token"}\n\n');
  });
});

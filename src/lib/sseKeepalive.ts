/**
 * Wrap an upstream SSE byte stream so that an SSE comment line
 * (`: keepalive`) is written whenever the upstream has been silent for
 * `intervalMs`.
 *
 * Seymour can spend minutes inside a single tool call or model turn without
 * emitting anything. Idle connections are closed by proxies between the
 * browser and the backend, which ends the chat reply part way through. SSE
 * clients ignore comment lines, so the keepalive has no effect on parsing.
 *
 * A keepalive is only written on an event boundary (after a blank line), so
 * it can never land inside an event the upstream split across chunks.
 */
export const SSE_KEEPALIVE_COMMENT = ": keepalive\n\n";

export function withSseKeepalive(
  upstream: ReadableStream<Uint8Array>,
  intervalMs = 10_000
): ReadableStream<Uint8Array> {
  const keepalive = new TextEncoder().encode(SSE_KEEPALIVE_COMMENT);
  const reader = upstream.getReader();
  let timer: ReturnType<typeof setInterval> | undefined;
  let lastWriteAt = Date.now();
  // Last bytes forwarded, to detect a blank line split across chunks.
  let tail: number[] = [];
  let stopped = false;

  const atEventBoundary = () => {
    if (tail.length === 0) return true;
    const t = String.fromCharCode(...tail);
    return t.endsWith("\n\n") || t.endsWith("\r\n\r\n");
  };

  const stop = () => {
    stopped = true;
    if (timer) clearInterval(timer);
  };

  return new ReadableStream<Uint8Array>({
    start(controller) {
      timer = setInterval(() => {
        if (stopped || !atEventBoundary()) return;
        if (Date.now() - lastWriteAt < intervalMs) return;
        try {
          controller.enqueue(keepalive);
          lastWriteAt = Date.now();
        } catch {
          stop();
        }
      }, Math.max(250, Math.floor(intervalMs / 2)));

      void (async () => {
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            if (!value || value.length === 0) continue;
            controller.enqueue(value);
            lastWriteAt = Date.now();
            tail = [...tail, ...value.slice(-4)].slice(-4);
          }
          if (!stopped) {
            stop();
            controller.close();
          }
        } catch (err) {
          if (!stopped) {
            stop();
            try {
              controller.error(err);
            } catch {
              // Stream already closed or cancelled.
            }
          }
        }
      })();
    },
    cancel(reason) {
      stop();
      return reader.cancel(reason);
    },
  });
}

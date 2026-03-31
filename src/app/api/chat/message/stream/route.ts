/**
 * SSE streaming proxy for Seymour chat.
 *
 * Next.js rewrites (next.config.ts `/api/:path*`) buffer responses before
 * forwarding them to the browser, which breaks SSE token-by-token display.
 * This App Router route takes precedence over the rewrite and pipes the
 * backend's ReadableStream directly to the client so every token appears
 * as it arrives.
 */
import { NextRequest } from "next/server";

// Always talk to the backend directly — never through the Next.js proxy.
const BACKEND_BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8001";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest): Promise<Response> {
  const backendUrl = `${BACKEND_BASE}/api/chat/message/stream`;

  // Read the JSON body once so we can safely re-send it (avoids the
  // ReadableStream-already-consumed error when the request body is a stream).
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Forward only the headers the backend needs.
  const forwardedHeaders: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "text/event-stream",
  };
  const authorization = req.headers.get("authorization");
  if (authorization) {
    forwardedHeaders["Authorization"] = authorization;
  }

  let backendResponse: globalThis.Response;
  try {
    backendResponse = await fetch(backendUrl, {
      method: "POST",
      headers: forwardedHeaders,
      body: JSON.stringify(body),
    });
  } catch (err) {
    console.error("[chat/stream] Backend fetch failed:", err);
    return new Response(
      JSON.stringify({ error: "Could not connect to backend" }),
      { status: 502, headers: { "Content-Type": "application/json" } }
    );
  }

  if (!backendResponse.ok || !backendResponse.body) {
    const text = await backendResponse.text().catch(() => "");
    return new Response(text, {
      status: backendResponse.status,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Pipe the backend's ReadableStream directly to the client.
  // Using `new Response(stream)` (not NextResponse) avoids any buffering
  // that NextResponse might introduce.
  return new Response(backendResponse.body, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      // Tell nginx / CDN not to buffer this response.
      "X-Accel-Buffering": "no",
    },
  });
}

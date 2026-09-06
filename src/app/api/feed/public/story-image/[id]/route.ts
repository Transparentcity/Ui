import { NextRequest } from "next/server";
import { getUpstreamApiBaseUrl } from "@/lib/apiBase";

/**
 * Proxy for feed story social-card images (og:image / twitter:image).
 *
 * The FastAPI backend's `/story-image/{hash}` route only accepts GET and
 * answers HEAD with 405. X's link-preview crawler probes image URLs with HEAD
 * first and drops the thumbnail when that fails. This handler gives HEAD an
 * explicit 200 that mirrors GET's headers (Content-Type, Cache-Control,
 * Content-Length when known) without sending a body.
 *
 * Note: the catch-all `/api/:path*` rewrite in next.config.ts runs before
 * dynamic filesystem routes, so next.config.ts also carries a self-rewrite for
 * this path; without it this file would be shadowed and never run.
 */

const HASH_RE = /^[A-Za-z0-9_-]{1,64}$/;

// Headers copied from the upstream image response. Hop-by-hop headers and
// Content-Encoding are dropped: fetch() already decodes the body, so a
// forwarded Content-Encoding would corrupt the response.
const FORWARDED_HEADERS = [
  "content-type",
  "cache-control",
  "etag",
  "last-modified",
] as const;

function upstreamUrl(id: string): string {
  return `${getUpstreamApiBaseUrl()}/api/feed/public/story-image/${encodeURIComponent(id)}`;
}

export function buildImageHeaders(upstream: Headers): Headers {
  const headers = new Headers();
  for (const name of FORWARDED_HEADERS) {
    const value = upstream.get(name);
    if (value) headers.set(name, value);
  }
  // Only trust Content-Length when the upstream body was not re-encoded.
  const length = upstream.get("content-length");
  if (length && !upstream.get("content-encoding")) {
    headers.set("content-length", length);
  }
  if (!headers.has("content-type")) headers.set("content-type", "image/png");
  return headers;
}

async function fetchUpstream(id: string, signal?: AbortSignal): Promise<Response> {
  return fetch(upstreamUrl(id), {
    method: "GET",
    headers: { Accept: "image/*" },
    cache: "no-store",
    signal,
  });
}

function errorStatus(res: Response): number {
  return res.status >= 500 ? 502 : res.status;
}

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, context: RouteContext): Promise<Response> {
  const { id } = await context.params;
  if (!HASH_RE.test(id)) return new Response("Invalid story hash", { status: 400 });

  try {
    const res = await fetchUpstream(id);
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return new Response(text || `Story image upstream ${res.status}`, {
        status: errorStatus(res),
        headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-cache" },
      });
    }
    return new Response(res.body, { status: 200, headers: buildImageHeaders(res.headers) });
  } catch (e) {
    return new Response(e instanceof Error ? e.message : "Failed to fetch story image", {
      status: 502,
    });
  }
}

/**
 * HEAD mirrors GET's status and headers with no body. The upstream request is
 * aborted as soon as its headers arrive, so the image body is never buffered
 * or streamed through this function. (Aborting rather than cancelling the
 * body stream: cancel() on the decoded stream can hang under Next's fetch.)
 */
export async function HEAD(_request: NextRequest, context: RouteContext): Promise<Response> {
  const { id } = await context.params;
  if (!HASH_RE.test(id)) return new Response(null, { status: 400 });

  const controller = new AbortController();
  try {
    const res = await fetchUpstream(id, controller.signal);
    const status = res.ok ? 200 : errorStatus(res);
    const headers = res.ok ? buildImageHeaders(res.headers) : undefined;
    controller.abort();
    return new Response(null, { status, headers });
  } catch {
    return new Response(null, { status: 502 });
  }
}

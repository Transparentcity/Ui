import { NextResponse } from "next/server";
import { getUpstreamApiBaseUrl } from "@/lib/apiBase";

/**
 * Falls back to the shared upstream resolver rather than a hardcoded
 * production host, so a local click resolves against the local API where the
 * claim token actually lives.
 */
const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL?.trim() ||
  process.env.API_BASE_URL?.trim() ||
  getUpstreamApiBaseUrl();

const RECORD_CLICK_TIMEOUT_MS = 8000;

/**
 * Newsletter click-tracking proxy.
 *
 * Emails link to {site}/e/c?t=… (same origin as the UI) so SendGrid and
 * email clients never send recipients to the raw API host. Forwards the
 * visitor's User-Agent and IP to the platform /e/c recorder, then 302s
 * to the destination. Only redirects when the API actually returned a
 * 3xx Location — never falls through to `/`.
 */
export async function GET(request: Request) {
  const incoming = new URL(request.url);
  const token = incoming.searchParams.get("t")?.trim();
  if (!token) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  const apiRoot = API_BASE.replace(/\/$/, "");
  const ua = request.headers.get("user-agent") || "";
  const forwarded =
    request.headers.get("x-forwarded-for") ||
    request.headers.get("x-real-ip") ||
    "";

  try {
    const apiRes = await fetch(
      `${apiRoot}/e/c?t=${encodeURIComponent(token)}`,
      {
        method: "GET",
        redirect: "manual",
        headers: {
          "User-Agent": ua,
          ...(forwarded ? { "X-Forwarded-For": forwarded } : {}),
        },
        cache: "no-store",
        // The destination only exists inside the signed token, so we cannot
        // redirect without this response — but we fail fast rather than
        // leaving the recipient on a hanging blank page.
        signal: AbortSignal.timeout(RECORD_CLICK_TIMEOUT_MS),
      }
    );
    const location = apiRes.headers.get("location");
    if (location && apiRes.status >= 300 && apiRes.status < 400) {
      return NextResponse.redirect(new URL(location, request.url), 302);
    }
  } catch {
    /* fall through to 502 */
  }

  return new NextResponse("Click tracking redirect failed", {
    status: 502,
    headers: { "Cache-Control": "no-store" },
  });
}

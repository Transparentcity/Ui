import { NextResponse } from "next/server";
import { getUpstreamApiBaseUrl } from "@/lib/apiBase";

/**
 * Falls back to the shared upstream resolver rather than a hardcoded
 * production host, so a local click records against the local API where the
 * claim token actually lives.
 */
const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL?.trim() ||
  process.env.API_BASE_URL?.trim() ||
  getUpstreamApiBaseUrl();

const RECORD_CLICK_TIMEOUT_MS = 2000;

/**
 * Gift welcome-email click proxy.
 *
 * Emails link to {site}/gift/click/{token} (same origin as the UI) so SendGrid
 * click tracking never sends users to localhost:8080 or the raw API host.
 * Records the click on the platform API, then redirects to activation.
 *
 * Passes through a `next` query param so newsletter links from unclaimed
 * accounts land on the original destination after OTP (added by /e/c redirect).
 */
export async function GET(
  request: Request,
  context: { params: Promise<{ token: string }> }
) {
  const { token } = await context.params;
  if (!token?.trim()) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  const apiRoot = API_BASE.replace(/\/$/, "");
  try {
    await fetch(`${apiRoot}/api/gift/record-click`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ token }),
      cache: "no-store",
      // Analytics must never hold up the redirect: a cold or slow API would
      // otherwise leave the recipient on a blank page for its full duration.
      signal: AbortSignal.timeout(RECORD_CLICK_TIMEOUT_MS),
    });
  } catch {
    /* Non-blocking — activation still proceeds */
  }

  // Preserve the `next` destination so the activate page can send the user
  // there after OTP rather than always going to /home.
  const incomingUrl = new URL(request.url);
  const next = incomingUrl.searchParams.get("next") || "";

  const activate = new URL(`/gift/activate?t=${encodeURIComponent(token)}`, request.url);
  if (next) {
    activate.searchParams.set("next", next);
  }
  return NextResponse.redirect(activate);
}

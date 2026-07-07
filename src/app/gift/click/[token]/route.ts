import { NextResponse } from "next/server";

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL?.trim() ||
  process.env.API_BASE_URL?.trim() ||
  "https://api.transparent.city";

/**
 * Gift welcome-email click proxy.
 *
 * Emails link to {site}/gift/click/{token} (same origin as the UI) so SendGrid
 * click tracking never sends users to localhost:8080 or the raw API host.
 * Records the click on the platform API, then redirects to activation.
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
    });
  } catch {
    /* Non-blocking — activation still proceeds */
  }

  const activate = new URL(`/gift/activate?t=${encodeURIComponent(token)}`, request.url);
  return NextResponse.redirect(activate);
}

import { NextResponse } from "next/server";
import { getAuth0ApiAudience } from "@/lib/auth0ApiAudience";

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL?.trim() ||
  process.env.API_BASE_URL?.trim() ||
  "https://api.transparent.city";

/**
 * Trusted gift welcome-link login.
 *
 * 1. Marks the click as a trusted email verification (platform).
 * 2. Mints Auth0 tokens without OTP when AUTH0_GIFT_ROPG_CONNECTION is set
 *    on the platform; otherwise returns 503 so the client falls back to OTP.
 */
export async function POST(request: Request) {
  let body: {
    token?: string;
    client_id?: string;
    audience?: string;
    redirect_uri?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "invalid_request", error_description: "Request body must be JSON." },
      { status: 400 }
    );
  }

  const { token, client_id, audience, redirect_uri } = body;
  if (!token || !redirect_uri) {
    return NextResponse.json(
      {
        error: "invalid_request",
        error_description: "token and redirect_uri are required.",
      },
      { status: 400 }
    );
  }

  const trustedActivate = await fetch(`${API_BASE.replace(/\/$/, "")}/api/gift/trusted-activate`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ token }),
  });

  if (!trustedActivate.ok) {
    const errBody = (await trustedActivate.json().catch(() => ({}))) as Record<string, unknown>;
    return NextResponse.json(
      {
        error: "trusted_activate_failed",
        error_description:
          (errBody.detail as string) ||
          "Welcome link trust window expired or gift is invalid.",
      },
      { status: trustedActivate.status }
    );
  }

  const mintRes = await fetch(`${API_BASE.replace(/\/$/, "")}/api/gift/mint-session`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      token,
      redirect_uri: redirect_uri.replace(/\/$/, ""),
      audience: audience || getAuth0ApiAudience(),
    }),
  });

  const mintBody = (await mintRes.json().catch(() => ({}))) as Record<string, unknown>;
  if (!mintRes.ok) {
    return NextResponse.json(
      {
        error: "mint_session_failed",
        error_description:
          (mintBody.detail as string) ||
          "Instant gift sign-in is not available. Use OTP instead.",
      },
      { status: mintRes.status }
    );
  }

  return NextResponse.json({
    ...mintBody,
    client_id: client_id || process.env.NEXT_PUBLIC_AUTH0_CLIENT_ID,
  });
}

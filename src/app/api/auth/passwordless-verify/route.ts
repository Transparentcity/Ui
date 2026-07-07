import { NextResponse } from "next/server";
import {
  getPasswordlessServerCredentials,
  OTP_GRANT_TYPE,
  resolveRedirectUri,
} from "@/lib/auth0PasswordlessServer";

/**
 * Server-side proxy for the Auth0 passwordless OTP token exchange.
 *
 * The browser collects the 6-digit code the user received by email and posts it
 * here; we forward it to Auth0's /oauth/token using the passwordless-OTP grant.
 * Unlike the magic-link flow, this has no browser-session binding, so it is
 * immune to the "same device and browser" error from /passwordless/verify.
 *
 * Uses a Regular Web Application (client_id + client_secret) — Auth0 does not
 * allow the passwordless-OTP grant on SPA application types.
 */
export async function POST(request: Request) {
  const auth0Domain = process.env.NEXT_PUBLIC_AUTH0_DOMAIN;
  if (!auth0Domain) {
    return NextResponse.json(
      { error: "server_misconfigured", error_description: "Auth0 domain is not set." },
      { status: 500 }
    );
  }

  const credentials = getPasswordlessServerCredentials();
  if ("error" in credentials) {
    return NextResponse.json(
      { error: "server_misconfigured", error_description: credentials.error },
      { status: 500 }
    );
  }

  let body: {
    otp?: string;
    email?: string;
    audience?: string;
    scope?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "invalid_request", error_description: "Request body must be JSON." },
      { status: 400 }
    );
  }

  const { otp, email, audience, scope } = body;
  if (!otp || !email) {
    return NextResponse.json(
      {
        error: "invalid_request",
        error_description: "otp and email are required.",
      },
      { status: 400 }
    );
  }

  const url = `https://${auth0Domain}/oauth/token`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);

  let auth0Response: Response;
  try {
    auth0Response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        grant_type: OTP_GRANT_TYPE,
        client_id: credentials.clientId,
        client_secret: credentials.clientSecret,
        otp,
        realm: "email",
        username: email,
        redirect_uri: resolveRedirectUri(request),
        ...(audience ? { audience } : {}),
        ...(scope ? { scope } : {}),
      }),
      signal: controller.signal,
    });
  } catch (err) {
    const isTimeout = err instanceof Error && err.name === "AbortError";
    return NextResponse.json(
      {
        error: isTimeout ? "timeout" : "network_error",
        error_description: isTimeout
          ? "Auth0 did not respond in time. Please try again."
          : err instanceof Error
          ? err.message
          : "Could not reach Auth0.",
      },
      { status: 502 }
    );
  } finally {
    clearTimeout(timeout);
  }

  const rawBody = await auth0Response.text();
  let parsed: unknown = null;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    /* non-JSON body forwarded as-is */
  }

  return NextResponse.json(parsed ?? rawBody, { status: auth0Response.status });
}
